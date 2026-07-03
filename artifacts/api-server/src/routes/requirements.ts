import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { verifyToken, actorFromReq } from "./auth";
import { logActivity, diffChanges } from "./_audit";
import { notifyUser } from "./_notify";
import {
  db,
  requirementsTable,
  usersTable,
  projectsTable,
  insertRequirementSchema,
  testCasesTable,
  executionTestCasesTable,
} from "@workspace/db";
import {
  GetRequirementParams,
  UpdateRequirementParams,
  DeleteRequirementParams,
  ListRequirementsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function formatRequirement(req: typeof requirementsTable.$inferSelect) {
  let assigneeName = null;
  let projectName = null;

  if (req.assigneeId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.assigneeId));
    assigneeName = user?.name ?? null;
  }
  if (req.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, req.projectId));
    projectName = project?.name ?? null;
  }

  return {
    id: req.id,
    title: req.title,
    description: req.description,
    module: req.module,
    tracker: req.tracker,
    parentId: req.parentId,
    projectId: req.projectId,
    projectName,
    priority: req.priority,
    release: req.release,
    assigneeId: req.assigneeId,
    assigneeName,
    redmineTicketId: req.redmineTicketId,
    status: req.status,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
  };
}

router.get("/requirements", async (req, res): Promise<void> => {
  const parsed = ListRequirementsQueryParams.safeParse(req.query);
  let reqs = await db.select().from(requirementsTable).orderBy(requirementsTable.createdAt);

  if (parsed.success) {
    const { projectId, assigneeId, status, priority, module, release, search } = parsed.data;
    if (projectId) reqs = reqs.filter(r => r.projectId === projectId);
    if (assigneeId) reqs = reqs.filter(r => r.assigneeId === assigneeId);
    if (status) reqs = reqs.filter(r => r.status === status);
    if (priority) reqs = reqs.filter(r => r.priority === priority);
    if (module) reqs = reqs.filter(r => r.module === module);
    if (release) reqs = reqs.filter(r => r.release === release);
    if (search) reqs = reqs.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));
  }

  const formatted = await Promise.all(reqs.map(formatRequirement));

  const reqIds = reqs.map((r) => r.id);
  const tcCountMap: Record<number, number> = {};
  const execMap: Record<number, { pass: number; fail: number; pending: number }> = {};

  if (reqIds.length > 0) {
    // Count distinct test cases per requirement — a test case linked from both the
    // library and an execution file (via libraryTcId) counts once, not twice.
    const libTcRows = await db
      .select({ id: testCasesTable.id, requirementId: testCasesTable.requirementId })
      .from(testCasesTable)
      .where(inArray(testCasesTable.requirementId, reqIds));
    const execLinkRows = await db
      .select({
        id: executionTestCasesTable.id,
        requirementId: executionTestCasesTable.requirementId,
        libraryTcId: executionTestCasesTable.libraryTcId,
      })
      .from(executionTestCasesTable)
      .where(inArray(executionTestCasesTable.requirementId, reqIds));

    const distinctTcSets: Record<number, Set<string>> = {};
    for (const row of libTcRows) {
      if (row.requirementId == null) continue;
      (distinctTcSets[row.requirementId] ??= new Set()).add(`lib:${row.id}`);
    }
    for (const row of execLinkRows) {
      if (row.requirementId == null) continue;
      const identity = row.libraryTcId != null ? `lib:${row.libraryTcId}` : `exec:${row.id}`;
      (distinctTcSets[row.requirementId] ??= new Set()).add(identity);
    }
    for (const id of reqIds) {
      tcCountMap[id] = distinctTcSets[id]?.size ?? 0;
    }

    const execRows = await db
      .select({
        requirementId: testCasesTable.requirementId,
        result: executionTestCasesTable.result,
        cnt: sql<number>`count(*)::int`,
      })
      .from(executionTestCasesTable)
      .innerJoin(testCasesTable, eq(testCasesTable.id, executionTestCasesTable.libraryTcId))
      .where(inArray(testCasesTable.requirementId, reqIds))
      .groupBy(testCasesTable.requirementId, executionTestCasesTable.result);
    for (const row of execRows) {
      if (row.requirementId == null) continue;
      if (!execMap[row.requirementId]) execMap[row.requirementId] = { pass: 0, fail: 0, pending: 0 };
      const r = (row.result ?? "").toLowerCase();
      if (r.startsWith("pass")) execMap[row.requirementId].pass += row.cnt;
      else if (r.startsWith("fail")) execMap[row.requirementId].fail += row.cnt;
      else execMap[row.requirementId].pending += row.cnt;
    }
  }

  res.json(formatted.map((r) => ({
    ...r,
    tcCount: tcCountMap[r.id] ?? 0,
    execPass: execMap[r.id]?.pass ?? 0,
    execFail: execMap[r.id]?.fail ?? 0,
    execPending: execMap[r.id]?.pending ?? 0,
  })));
});

router.post("/requirements", async (req, res): Promise<void> => {
  const parsed = insertRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [requirement] = await db.insert(requirementsTable).values(parsed.data).returning();

  await logActivity({
    type: "requirement_created",
    description: `Requirement "${requirement.title}" was created`,
    userId: actorFromReq(req),
    entityId: requirement.id,
    entityType: "requirement",
  });

  // Notify assignee
  if (requirement.assigneeId) {
    let actorId: number | null = null;
    try { actorId = verifyToken(req.headers.authorization?.slice(7) ?? "").id; } catch {}
    await notifyUser(requirement.assigneeId, "Requirement assigned", `"${requirement.title}" has been assigned to you.`, "requirement", "requirement", requirement.id, actorId);
  }

  res.status(201).json(await formatRequirement(requirement));
});

// Lookup requirement by Redmine ticket ID
router.get("/requirements/by-redmine/:ticketId", async (req, res): Promise<void> => {
  const ticketId = req.params.ticketId;
  const [requirement] = await db
    .select()
    .from(requirementsTable)
    .where(eq(requirementsTable.redmineTicketId, ticketId));

  if (!requirement) {
    res.status(404).json({ found: false });
    return;
  }
  res.json({ found: true, requirement: await formatRequirement(requirement) });
});

// Get test cases linked to a requirement
router.get("/requirements/:id/test-cases", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const tcs = await db
    .select()
    .from(testCasesTable)
    .where(eq(testCasesTable.requirementId, id));

  res.json(tcs.map(tc => ({
    id: tc.id,
    caseId: tc.caseId,
    title: tc.title,
    module: tc.module,
    scenario: tc.scenario,
    preCondition: tc.preconditions,
    testSteps: tc.testSteps,
    testData: tc.testData,
    expectedResult: tc.expectedResult,
    tracker: tc.tracker,
  })));
});

router.get("/requirements/:id", async (req, res): Promise<void> => {
  const params = GetRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, params.data.id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  res.json(await formatRequirement(requirement));
});

router.patch("/requirements/:id", async (req, res): Promise<void> => {
  const params = UpdateRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = insertRequirementSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [before] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, params.data.id));
  const [requirement] = await db.update(requirementsTable).set(parsed.data).where(eq(requirementsTable.id, params.data.id)).returning();
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  const diff = before ? diffChanges(before, parsed.data) : null;
  if (diff) {
    await logActivity({
      type: "requirement_updated",
      description: `Requirement "${requirement.title}" was updated`,
      userId: actorFromReq(req),
      entityId: requirement.id,
      entityType: "requirement",
      ...diff,
    });
  }

  // Notify new assignee if changed
  if (parsed.data.assigneeId !== undefined && requirement.assigneeId && requirement.assigneeId !== before?.assigneeId) {
    let actorId: number | null = null;
    try { actorId = verifyToken(req.headers.authorization?.slice(7) ?? "").id; } catch {}
    await notifyUser(requirement.assigneeId, "Requirement assigned", `"${requirement.title}" has been assigned to you.`, "requirement", "requirement", requirement.id, actorId);
  }

  // --- CASCADE UPDATES TO CHILDREN ---
  // If Project or Module was modified, cascade those specific changes to all descendants
  const cascadeData: any = {};
  if (parsed.data.projectId !== undefined) cascadeData.projectId = parsed.data.projectId;
  if (parsed.data.module !== undefined) cascadeData.module = parsed.data.module;

  if (Object.keys(cascadeData).length > 0) {
    async function cascadeUpdate(parentId: number) {
      const children = await db.select().from(requirementsTable).where(eq(requirementsTable.parentId, parentId));

      console.log(`Found ${children.length} children for Parent ID ${parentId}`); // <-- ADD THIS

      for (const child of children) {
        console.log(`Cascading update to Child ID ${child.id}:`, cascadeData); // <-- ADD THIS
        await db.update(requirementsTable).set(cascadeData).where(eq(requirementsTable.id, child.id));
        await cascadeUpdate(child.id); // Recursively update sub-children
      }
    }
    await cascadeUpdate(requirement.id);
  }

  res.json(await formatRequirement(requirement));
});

router.delete("/requirements/:id", async (req, res): Promise<void> => {
  const params = DeleteRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [requirement] = await db.delete(requirementsTable).where(eq(requirementsTable.id, params.data.id)).returning();
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  await logActivity({
    type: "requirement_deleted",
    description: `Requirement "${requirement.title}" was deleted`,
    userId: actorFromReq(req),
    entityId: requirement.id,
    entityType: "requirement",
    oldValue: {
      title: requirement.title,
      module: requirement.module,
      projectId: requirement.projectId,
      status: requirement.status,
      redmineTicketId: requirement.redmineTicketId,
    },
  });

  res.sendStatus(204);
});

// ─── Redmine Import (same logic as Requirements page processRedmineSync) ─────
const EXCLUDED_STATUSES = ["Cancelled", "Verified", "Roadblock", "Closed"];
const PRIORITY_MAP: Record<string, string> = { low: "low", normal: "normal", high: "high", urgent: "urgent" };

function getRedmineBase() {
  return process.env.REDMINE_URL ?? "https://redmine.bestinet.my";
}

async function redmineFetchLocal(path: string, apiKey: string) {
  return fetch(`${getRedmineBase()}${path}`, {
    headers: { "X-Redmine-API-Key": apiKey, "Content-Type": "application/json" },
  });
}

export async function resolveApiKeyFromToken(authHeader: string | undefined): Promise<string> {
  if (!authHeader?.startsWith("Bearer ")) return process.env.REDMINE_API_KEY ?? "";
  try {
    const payload = verifyToken(authHeader.slice(7));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
    if (user?.redmineApiKey?.trim()) return user.redmineApiKey.trim();
  } catch {}
  return process.env.REDMINE_API_KEY ?? "";
}

export async function syncRedmineTicket(
  ticketId: string,
  targetModule: string,
  targetProjectId: number | undefined,
  parentId: number | undefined,
  trackerFilter: string | undefined,
  apiKey: string,
  isRoot = true,
): Promise<number | undefined> {
  const resp = await redmineFetchLocal(`/issues/${encodeURIComponent(ticketId)}.json?include=children,journals`, apiKey);
  if (!resp.ok) throw new Error(`Could not fetch Redmine issue #${ticketId}`);
  const data = await resp.json();
  const issue = data.issue;
  if (!issue) throw new Error(`No issue data for #${ticketId}`);

  if (EXCLUDED_STATUSES.includes(issue.status?.name)) {
    if (isRoot) throw new Error(`NO_RESULT:Ticket #${ticketId} has status "${issue.status?.name}"`);
    return;
  }
  if (trackerFilter && issue.tracker?.name && issue.tracker.name !== trackerFilter) {
    if (isRoot) throw new Error(`NO_RESULT:Ticket #${ticketId} has tracker "${issue.tracker?.name}", expected "${trackerFilter}"`);
    return;
  }

  const fetchedId = String(issue.id);
  const [existing] = await db.select().from(requirementsTable).where(eq(requirementsTable.redmineTicketId, fetchedId));

  const mappedData: any = {
    title: issue.subject,
    description: issue.description ?? "",
    priority: PRIORITY_MAP[issue.priority?.name?.toLowerCase()] ?? "normal",
    redmineTicketId: fetchedId,
    tracker: issue.tracker?.name ?? "Task",
    module: targetModule,
    projectId: targetProjectId ?? null,
    parentId: parentId ?? null,
  };

  let savedId: number | undefined;
  if (existing) {
    mappedData.status = existing.status;
    mappedData.release = existing.release ?? undefined;
    mappedData.assigneeId = existing.assigneeId ?? undefined;
    await db.update(requirementsTable).set(mappedData).where(eq(requirementsTable.id, existing.id));
    savedId = existing.id;
  } else {
    mappedData.status = "draft";
    const [created] = await db.insert(requirementsTable).values(mappedData).returning();
    savedId = created.id;
  }

  if (issue.children && Array.isArray(issue.children)) {
    for (const child of issue.children) {
      await syncRedmineTicket(String(child.id), targetModule, targetProjectId, savedId, trackerFilter, apiKey, false);
    }
  }

  return savedId;
}

// POST /requirements/import-redmine
// Body: { ticketId, module, projectId, trackerFilter? }
router.post("/requirements/import-redmine", async (req, res): Promise<void> => {
  const { ticketId, module, projectId, trackerFilter } = req.body;
  if (!ticketId || !module) {
    res.status(400).json({ error: "ticketId and module are required" });
    return;
  }

  try {
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const savedId = await syncRedmineTicket(
      String(ticketId),
      module,
      projectId ? Number(projectId) : undefined,
      undefined,
      trackerFilter || undefined,
      apiKey,
    );
    const [req2] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, savedId!));
    res.json({ success: true, requirement: await formatRequirement(req2) });
  } catch (err: any) {
    const msg: string = err?.message ?? "";
    if (msg.startsWith("NO_RESULT:")) {
      res.status(422).json({ error: msg.replace("NO_RESULT:", "").trim() });
    } else {
      res.status(500).json({ error: msg || "Failed to import from Redmine" });
    }
  }
});

// Resolve a requirement by Redmine ticket ID — used when importing execution
// test cases from Excel. Returns the existing requirement if one is already
// linked to that ticket, otherwise fetches the single issue from Redmine and
// creates a new requirement record (no children, no module/tracker targeting).
router.post("/requirements/resolve-redmine", async (req, res): Promise<void> => {
  const ticketId = String(req.body?.ticketId ?? "").trim();
  if (!ticketId) {
    res.status(400).json({ error: "ticketId is required" });
    return;
  }

  const [existing] = await db.select().from(requirementsTable).where(eq(requirementsTable.redmineTicketId, ticketId));
  if (existing) {
    res.json({ created: false, requirement: await formatRequirement(existing) });
    return;
  }

  try {
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const resp = await redmineFetchLocal(`/issues/${encodeURIComponent(ticketId)}.json`, apiKey);
    if (!resp.ok) {
      res.status(404).json({ error: `Redmine issue #${ticketId} not found` });
      return;
    }
    const data = await resp.json();
    const issue = data.issue;
    if (!issue) {
      res.status(404).json({ error: `Redmine issue #${ticketId} not found` });
      return;
    }

    const [created] = await db
      .insert(requirementsTable)
      .values({
        title: issue.subject,
        description: issue.description ?? "",
        priority: PRIORITY_MAP[issue.priority?.name?.toLowerCase()] ?? "normal",
        redmineTicketId: ticketId,
        tracker: issue.tracker?.name ?? "Task",
        status: "draft",
      })
      .returning();

    res.status(201).json({ created: true, requirement: await formatRequirement(created) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || `Failed to fetch Redmine issue #${ticketId}` });
  }
});

export default router;