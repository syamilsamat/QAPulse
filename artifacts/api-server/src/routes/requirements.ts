import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { verifyToken, actorFromReq } from "./auth";
import { logActivity, diffChanges } from "./_audit";
import { notifyUser, notifyRolesInProject } from "./_notify";
import { getAuthContext, scopeToUserProjects, canAccessProject, canAccessModule, getRoleTierRank, getRoleDepartment, getModuleScope } from "../middleware/access";
import { computeRequirementTimelines, buildPhaseTimeline } from "./dashboard";
import {
  db,
  requirementsTable,
  requirementAttachmentsTable,
  usersTable,
  projectsTable,
  milestonesTable,
  activityTable,
  insertRequirementSchema,
  testCasesTable,
  executionTestCasesTable,
  executionFilesTable,
  executionSummariesTable,
  executionTcHistoryTable,
  defectsTable,
  defectLinksTable,
  tasksTable,
  requirementEventsTable,
} from "@workspace/db";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  GetRequirementParams,
  UpdateRequirementParams,
  DeleteRequirementParams,
  ListRequirementsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function formatRequirement(req: typeof requirementsTable.$inferSelect) {
  let assigneeName: string | null = null;
  let projectName: string | null = null;
  let milestoneName: string | null = null;
  let devAssigneeName: string | null = null;
  let blockedByName: string | null = null;

  if (req.assigneeId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.assigneeId));
    assigneeName = user?.name ?? null;
  }
  if ((req as any).devAssigneeId) {
    const [devUser] = await db.select().from(usersTable).where(eq(usersTable.id, (req as any).devAssigneeId));
    devAssigneeName = devUser?.name ?? null;
  }
  if ((req as any).blockedBy) {
    const [blockedByUser] = await db.select().from(usersTable).where(eq(usersTable.id, (req as any).blockedBy));
    blockedByName = blockedByUser?.name ?? null;
  }
  if (req.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, req.projectId));
    projectName = project?.name ?? null;
  }
  if (req.milestoneId) {
    const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, req.milestoneId));
    milestoneName = milestone?.name ?? null;
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
    // CR014p2
    milestoneId: req.milestoneId ?? null,
    // CR023p3.1 — list view's Milestone column
    milestoneName,
    // CR022p1
    acceptanceCriteria: req.acceptanceCriteria ? JSON.parse(req.acceptanceCriteria) : [],
    // CR014p4
    reviewStatus: (req as any).reviewStatus ?? "draft",
    createdBy: (req as any).createdBy ?? null,
    approvedBy: (req as any).approvedBy ?? null,
    approvedAt: (req as any).approvedAt ? new Date((req as any).approvedAt).toISOString() : null,
    rejectedBy: (req as any).rejectedBy ?? null,
    rejectedAt: (req as any).rejectedAt ? new Date((req as any).rejectedAt).toISOString() : null,
    // CR030 — dev handoff
    devStatus: (req as any).devStatus ?? null,
    devAssigneeId: (req as any).devAssigneeId ?? null,
    devAssigneeName,
    devAssignedAt: (req as any).devAssignedAt ? new Date((req as any).devAssignedAt).toISOString() : null,
    devAssignedBy: (req as any).devAssignedBy ?? null,
    readyForQaAt: (req as any).readyForQaAt ? new Date((req as any).readyForQaAt).toISOString() : null,
    // CR063 — blocked flag
    isBlocked: (req as any).isBlocked ?? false,
    blockedReason: (req as any).blockedReason ?? null,
    blockedAt: (req as any).blockedAt ? new Date((req as any).blockedAt).toISOString() : null,
    blockedBy: (req as any).blockedBy ?? null,
    blockedByName,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
  };
}

router.get("/requirements", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  const parsed = ListRequirementsQueryParams.safeParse(req.query);
  let reqs = await db.select().from(requirementsTable).orderBy(requirementsTable.createdAt);

  if (parsed.success) {
    const { projectId, assigneeId, status, priority, module, release, search } = parsed.data;
    if (projectId) {
      const ok = accessible === null || accessible.includes(projectId);
      if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
      reqs = reqs.filter(r => r.projectId === projectId);
    } else if (accessible !== null) {
      reqs = reqs.filter(r => r.projectId !== null && accessible.includes(r.projectId));
    }
    if (assigneeId) reqs = reqs.filter(r => r.assigneeId === assigneeId);
    if (status) reqs = reqs.filter(r => r.status === status);
    if (priority) reqs = reqs.filter(r => r.priority === priority);
    if (module) reqs = reqs.filter(r => r.module === module);
    if (release) reqs = reqs.filter(r => r.release === release);
    if (search) reqs = reqs.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));
  } else if (accessible !== null) {
    reqs = reqs.filter(r => r.projectId !== null && accessible.includes(r.projectId));
  }

  // CR035 — module-scope, checked once per distinct project rather than per row.
  const reqProjectIds = [...new Set(reqs.map(r => r.projectId).filter((id): id is number => id != null))];
  const moduleScopes = new Map(await Promise.all(reqProjectIds.map(async (pid) => [pid, await getModuleScope(ctx.userId, ctx.role, pid)] as const)));
  reqs = reqs.filter(r => {
    const scope = r.projectId != null ? moduleScopes.get(r.projectId) : undefined;
    if (!scope || !scope.restricted) return true;
    return r.module != null && scope.moduleNames.includes(r.module);
  });

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
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = insertRequirementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.projectId) {
    const ok = await canAccessProject(ctx.userId, ctx.role, parsed.data.projectId);
    if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
  }

  const [requirement] = await db.insert(requirementsTable).values({
    ...parsed.data,
    createdBy: ctx.userId,
  } as any).returning();

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

router.get("/requirements/:id", async (req, res, next): Promise<void> => {
  const params = GetRequirementParams.safeParse(req.params);
  if (!params.success) {
    // A non-numeric segment means this wasn't really a "get by id" request —
    // fall through to later routes (review-queue, dev-queue, …) instead of
    // 400ing, since this route is registered before those single-segment
    // static paths and would otherwise shadow them (Express matches
    // registration order, not path specificity).
    next();
    return;
  }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, params.data.id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  // CR023p2.5 — test coverage count for the detail page's metadata sidebar
  const libTcRows = await db.select({ id: testCasesTable.id })
    .from(testCasesTable).where(eq(testCasesTable.requirementId, requirement.id));
  const execLinkRows = await db.select({ id: executionTestCasesTable.id, libraryTcId: executionTestCasesTable.libraryTcId })
    .from(executionTestCasesTable).where(eq(executionTestCasesTable.requirementId, requirement.id));
  const distinctTcs = new Set<string>();
  for (const row of libTcRows) distinctTcs.add(`lib:${row.id}`);
  for (const row of execLinkRows) distinctTcs.add(row.libraryTcId != null ? `lib:${row.libraryTcId}` : `exec:${row.id}`);

  const execRows = await db
    .select({ result: executionTestCasesTable.result, cnt: sql<number>`count(*)::int` })
    .from(executionTestCasesTable)
    .innerJoin(testCasesTable, eq(testCasesTable.id, executionTestCasesTable.libraryTcId))
    .where(eq(testCasesTable.requirementId, requirement.id))
    .groupBy(executionTestCasesTable.result);
  let execPass = 0, execFail = 0, execPending = 0;
  for (const row of execRows) {
    const r = (row.result ?? "").toLowerCase();
    if (r.startsWith("pass")) execPass += row.cnt;
    else if (r.startsWith("fail")) execFail += row.cnt;
    else execPending += row.cnt;
  }

  // CR074 — phase timeline for the detail page: planned dates come from the
  // milestone (same for every requirement in it, blank if the PM hasn't set
  // them), actual dates are this requirement's own (same computation the
  // Tasks page's task-board endpoint uses, batched per milestone).
  let phaseTimeline: ReturnType<typeof buildPhaseTimeline> | null = null;
  if (requirement.milestoneId) {
    const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, requirement.milestoneId));
    if (milestone) {
      const timelines = await computeRequirementTimelines(milestone.id, milestone.completedAt);
      const entry = timelines.find((t) => t.id === requirement.id);
      if (entry) phaseTimeline = buildPhaseTimeline(entry.timeline, milestone);
    }
  }

  res.json({
    ...(await formatRequirement(requirement)),
    tcCount: distinctTcs.size,
    execPass,
    execFail,
    execPending,
    phaseTimeline,
  });
});

// GET /requirements/:id/history — chronological activity journal (CR023p2.3)
router.get("/requirements/:id/history", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const rows = await db
    .select({
      id: activityTable.id,
      type: activityTable.type,
      description: activityTable.description,
      userId: activityTable.userId,
      actorName: usersTable.name,
      oldValue: activityTable.oldValue,
      newValue: activityTable.newValue,
      createdAt: activityTable.createdAt,
    })
    .from(activityTable)
    .leftJoin(usersTable, eq(usersTable.id, activityTable.userId))
    .where(and(eq(activityTable.entityType, "requirement"), eq(activityTable.entityId, id)))
    .orderBy(desc(activityTable.createdAt));

  res.json(rows.map((r) => ({
    id: r.id,
    type: r.type,
    description: r.description,
    userId: r.userId,
    actorName: r.actorName ?? null,
    oldValue: r.oldValue ? JSON.parse(r.oldValue) : null,
    newValue: r.newValue ? JSON.parse(r.newValue) : null,
    createdAt: r.createdAt.toISOString(),
  })));
});

// CR065 — a requirement's milestone is the source of truth for where its
// work lives: when it changes, the requirement's own test cases (and any
// defects raised against them) follow it, rather than being left behind
// pointing at a milestone the requirement no longer belongs to.
//
// Test cases move by fileType (qa/uat) into the matching execution file
// already under the new milestone, or a freshly-created one if none exists
// yet (synthetic, collision-free ticket id — redmineTicketId is globally
// unique, so this can't be derived from the milestone's own free-text name).
// Execution history follows the TC to its new file. Defects don't move
// files — they just get re-tagged to the new milestone directly (defects
// have their own milestoneId column, no execution-file concept). If moving
// TCs out of an old file empties it completely, the file is deleted
// (mirrors DELETE /execution-files/:id's own cleanup — file row + the
// execution_summaries rows that aren't FK-cascaded).
async function cascadeRequirementMilestoneMove(
  requirementId: number,
  newMilestoneId: number | null,
  fallbackProjectId: number | null,
): Promise<void> {
  if (newMilestoneId == null) return; // cleared to no milestone — leave TCs/defects where they are

  const tcRows = await db.select().from(executionTestCasesTable).where(eq(executionTestCasesTable.requirementId, requirementId));
  if (tcRows.length === 0) return;

  const [newMilestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, newMilestoneId));
  if (!newMilestone) return;

  const sourceFileIds = [...new Set(tcRows.map((t) => t.executionFileId))];
  const sourceFiles = await db.select().from(executionFilesTable).where(inArray(executionFilesTable.id, sourceFileIds));
  const sourceFileById = new Map(sourceFiles.map((f) => [f.id, f]));

  const byFileType = new Map<string, typeof tcRows>();
  for (const tc of tcRows) {
    const fileType = sourceFileById.get(tc.executionFileId)?.fileType ?? "qa";
    if (!byFileType.has(fileType)) byFileType.set(fileType, []);
    byFileType.get(fileType)!.push(tc);
  }

  const touchedOldFileIds = new Set<number>();

  for (const [fileType, rows] of byFileType) {
    let [targetFile] = await db.select().from(executionFilesTable)
      .where(and(eq(executionFilesTable.milestoneId, newMilestoneId), eq(executionFilesTable.fileType, fileType)));

    if (!targetFile) {
      const sourceFile = sourceFileById.get(rows[0].executionFileId);
      const [created] = await db.insert(executionFilesTable).values({
        redmineTicketId: `MS${newMilestoneId}-${fileType.toUpperCase()}`,
        title: fileType === "uat" ? `UAT — ${newMilestone.name}` : newMilestone.name,
        projectId: fallbackProjectId ?? sourceFile?.projectId ?? null,
        milestoneId: newMilestoneId,
        fileType,
        tracker: sourceFile?.tracker ?? null,
      } as any).returning();
      targetFile = created;
    }

    for (const tc of rows) {
      const oldFileId = tc.executionFileId;
      touchedOldFileIds.add(oldFileId);

      await db.update(executionTestCasesTable).set({ executionFileId: targetFile.id }).where(eq(executionTestCasesTable.id, tc.id));

      if (tc.testCaseId) {
        await db.update(executionTcHistoryTable)
          .set({ executionFileId: targetFile.id })
          .where(and(eq(executionTcHistoryTable.executionFileId, oldFileId), eq(executionTcHistoryTable.testCaseId, tc.testCaseId)));
      }

      const links = await db.select().from(defectLinksTable).where(eq(defectLinksTable.executionTcId, tc.id));
      const defectIds = [...new Set(links.map((l) => l.defectId))];
      if (defectIds.length > 0) {
        await db.update(defectsTable).set({ milestoneId: newMilestoneId }).where(inArray(defectsTable.id, defectIds));
      }
    }
  }

  for (const oldFileId of touchedOldFileIds) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(executionTestCasesTable).where(eq(executionTestCasesTable.executionFileId, oldFileId));
    if (count === 0) {
      const [oldFile] = await db.select({ redmineTicketId: executionFilesTable.redmineTicketId }).from(executionFilesTable).where(eq(executionFilesTable.id, oldFileId));
      await db.delete(executionFilesTable).where(eq(executionFilesTable.id, oldFileId));
      if (oldFile?.redmineTicketId) {
        await db.delete(executionSummariesTable).where(eq(executionSummariesTable.redmineTicketId, oldFile.redmineTicketId));
      }
    }
  }
}

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

  // CR063/CR065 — isBlocked/blockedReason/blockedAt/blockedBy are only
  // settable through PATCH /requirements/:id/block (FA/PM-only, mandatory
  // reason on block). insertRequirementSchema is derived from the full table
  // so these ride along in any generic partial() PATCH unless stripped here
  // — this endpoint's own permission gate below is author/assignee/FA-on-
  // Redmine, deliberately looser than the block endpoint's, so silently
  // dropping them (rather than erroring the whole request) keeps a client
  // that also happens to send other legitimate field changes working.
  delete (parsed.data as any).isBlocked;
  delete (parsed.data as any).blockedReason;
  delete (parsed.data as any).blockedAt;
  delete (parsed.data as any).blockedBy;

  const [before] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, params.data.id));

  // Edit permission: the author/assignee always can. A Redmine-imported
  // requirement's "author" is often a Redmine-resolved fallback rather than
  // a real accountable QAPulse user, so any FA-tier reviewer may edit it too
  // — otherwise a whole team could be locked out of a requirement nobody
  // among them technically "owns." Native (non-Redmine) requirements stay
  // author/assignee-only.
  if (before) {
    const ctx = getAuthContext(req);
    const privileged = !!ctx && ["admin", "cto"].includes(ctx.role);
    const isOwner = !!ctx && (ctx.userId === (before as any).createdBy || ctx.userId === before.assigneeId);
    const isFaOnRedmineSourced = !!ctx && !!before.redmineTicketId && FA_REVIEW_ROLES.includes(ctx.role);
    if (!ctx || (!privileged && !isOwner && !isFaOnRedmineSourced)) {
      res.status(403).json({ error: "Only the author/assignee may edit this requirement" });
      return;
    }
  }

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

  // CR065 — milestone changed: linked test cases + their defects follow it
  if (parsed.data.milestoneId !== undefined && requirement.milestoneId !== (before as any)?.milestoneId) {
    await cascadeRequirementMilestoneMove(requirement.id, requirement.milestoneId, requirement.projectId).catch((err) => {
      console.error("[cascadeRequirementMilestoneMove]", err);
    });
  }

  // CR023p4 — a description change re-opens review on every linked test case
  // and task, and fans out a revision notice to the requirement's author,
  // assignee, and every assignee of a linked task.
  const descriptionChanged = !!diff?.newValue && Object.prototype.hasOwnProperty.call(diff.newValue, "description");
  if (descriptionChanged) {
    const now = new Date();
    const revisedTcs = await db.update(testCasesTable)
      .set({ requirementRevisedAt: now })
      .where(eq(testCasesTable.requirementId, requirement.id))
      .returning({ id: testCasesTable.id });

    const revisedTasks = await db.update(tasksTable)
      .set({ requirementRevisedAt: now })
      .where(eq(tasksTable.requirementId, requirement.id))
      .returning({ id: tasksTable.id, assigneeIds: tasksTable.assigneeIds });

    if (revisedTcs.length > 0 || revisedTasks.length > 0) {
      const recipients = new Set<number>();
      if (requirement.createdBy) recipients.add(requirement.createdBy);
      if (requirement.assigneeId) recipients.add(requirement.assigneeId);
      for (const t of revisedTasks) {
        for (const uid of t.assigneeIds ?? []) recipients.add(uid);
      }

      const actorId = actorFromReq(req);
      await Promise.all(
        [...recipients].map((uid) =>
          notifyUser(
            uid,
            "Requirement revised",
            `"${requirement.title}" was revised — linked test cases/tasks need re-review.`,
            "revision_required",
            "requirement",
            requirement.id,
            actorId,
          ).catch(() => {}),
        ),
      );

      await logActivity({
        type: "requirement_revised",
        description: `Requirement "${requirement.title}" description revised — ${revisedTcs.length} test case(s) and ${revisedTasks.length} task(s) flagged for re-review`,
        userId: actorId,
        entityId: requirement.id,
        entityType: "requirement",
      });
    }
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

// ─── FA Review Workflow (CR014 Part 4) ───────────────────────────────────────

const FA_REVIEW_ROLES = ["fa_lead", "fa_member", "hod_fa", "admin", "qa_lead", "hod_qa"];

// GET /requirements/review-queue — My Review Queue for FA roles
router.get("/requirements/review-queue", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isLead = ["fa_lead", "hod_fa", "hod_qa", "admin"].includes(ctx.role);
  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  // "Waiting on my review" — in_review, not authored by me
  // "Awaiting my revision" — rejected, authored by me
  // Lead sees team-wide queue; member sees only their own
  const allReqs = await db.select().from(requirementsTable);
  const scoped = allReqs.filter(r => accessible === null || (r.projectId != null && accessible.includes(r.projectId)));

  const waitingOnMe = scoped.filter(r => {
    const reviewStatus = (r as any).reviewStatus ?? "draft";
    const createdBy = (r as any).createdBy;
    return reviewStatus === "in_review" && (isLead || createdBy !== ctx.userId);
  });

  const awaitingMyRevision = scoped.filter(r => {
    const reviewStatus = (r as any).reviewStatus ?? "draft";
    const createdBy = (r as any).createdBy;
    return reviewStatus === "rejected" && createdBy === ctx.userId;
  });

  const now = Date.now();
  function withAge(reqs: typeof allReqs) {
    return reqs.map(r => ({
      id: r.id,
      title: r.title,
      module: r.module,
      projectId: r.projectId,
      reviewStatus: (r as any).reviewStatus ?? "draft",
      createdBy: (r as any).createdBy,
      rejectedAt: (r as any).rejectedAt ?? null,
      updatedAt: r.updatedAt.toISOString(),
      daysInStatus: Math.floor((now - r.updatedAt.getTime()) / 86400000),
      stale: Math.floor((now - r.updatedAt.getTime()) / 86400000) > 3,
    }));
  }

  res.json({ waitingOnMe: withAge(waitingOnMe), awaitingMyRevision: withAge(awaitingMyRevision) });
});

// PATCH /requirements/:id/review — approve or reject
router.patch("/requirements/:id/review", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!FA_REVIEW_ROLES.includes(ctx.role)) { res.status(403).json({ error: "FA role required for review actions" }); return; }

  const id = parseInt(req.params.id);
  const [req_] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!req_) { res.status(404).json({ error: "Requirement not found" }); return; }

  const { action, comment } = req.body; // action: 'submit' | 'approve' | 'reject'
  if (!["submit", "approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be submit, approve, or reject" }); return;
  }

  const createdBy = (req_ as any).createdBy;

  // Segregation of duties: author cannot review (approve or reject) their own requirement
  if ((action === "approve" || action === "reject") && createdBy === ctx.userId) {
    res.status(403).json({ error: `You cannot ${action} a requirement you authored` }); return;
  }

  const now = new Date();
  const update: any = {};

  if (action === "submit") {
    update.reviewStatus = "in_review";
  } else if (action === "approve") {
    update.reviewStatus = "approved";
    update.approvedBy = ctx.userId;
    update.approvedAt = now;
    update.rejectedBy = null;
    update.rejectedAt = null;
  } else {
    update.reviewStatus = "rejected";
    update.rejectedBy = ctx.userId;
    update.rejectedAt = now;
  }

  const [updated] = await db.update(requirementsTable).set(update).where(eq(requirementsTable.id, id)).returning();

  await logActivity({
    type: `requirement_${action}`,
    description: `Requirement "${req_.title}" ${action === "submit" ? "submitted for review" : action === "approve" ? "approved" : "rejected"}${comment ? `: ${comment}` : ""}`,
    userId: ctx.userId,
    entityId: id,
    entityType: "requirement",
    oldValue: { reviewStatus: (req_ as any).reviewStatus ?? "draft" },
    newValue: { reviewStatus: update.reviewStatus, comment: comment ?? null },
  });

  // Notify on submit: every FA-review-tier user with access to this project,
  // excluding the submitter — mirrors the review-queue's own eligibility check.
  // CR046 — module-scoped (CR044): a reviewer restricted to other modules
  // can't even open the requirement, so they aren't pinged about it.
  // Whole-project and tier-3+ reviewers are unaffected.
  if (action === "submit" && req_.projectId != null) {
    await notifyRolesInProject({
      roles: FA_REVIEW_ROLES,
      projectId: req_.projectId,
      module: req_.module,
      title: "Requirement submitted for review",
      message: `"${req_.title}" is waiting on your review.`,
      type: "review_request",
      entityType: "requirement",
      entityId: id,
      actorId: ctx.userId,
    }).catch(() => {});
  }

  // Notify on approve: author + assignee ("routine progress", no PM needed)
  // Notify on reject: author + assignee + the milestone's PM ("needs visibility because of a stall")
  if (action === "approve" || action === "reject") {
    const title = action === "approve" ? "Requirement approved" : "Requirement rejected";
    const msg = action === "approve"
      ? `Your requirement "${req_.title}" has been approved.`
      : `Requirement "${req_.title}" was rejected${comment ? `: ${comment}` : ""}.`;
    const notifType = action === "approve" ? "review_approved" : "review_rejected";

    const recipients = new Set<number>();
    if (createdBy) recipients.add(createdBy);
    if (req_.assigneeId) recipients.add(req_.assigneeId);

    if (action === "reject" && req_.milestoneId) {
      const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, req_.milestoneId));
      if (milestone?.createdBy) recipients.add(milestone.createdBy);
    }

    await Promise.all(
      [...recipients].map((uid) =>
        notifyUser(uid, title, msg, notifType, "requirement", id, ctx.userId).catch(() => {})
      )
    );

    // CR045 — approval means the requirement is ready for dev assignment, so
    // Dev Leads on this project (module-scoped per CR044; HODs excluded per
    // the notification matrix) get told to pick it up in the Dev Queue.
    if (action === "approve") {
      await notifyRolesInProject({
        roles: ["dev_lead"],
        projectId: req_.projectId,
        module: req_.module,
        title: "Requirement ready for dev assignment",
        message: `"${req_.title}" was approved — assign a developer in the Dev Queue.`,
        type: "review_approved",
        entityType: "requirement",
        entityId: id,
        actorId: ctx.userId,
        excludeUserIds: recipients,
      }).catch(() => {});
    }
  }

  res.json(await formatRequirement(updated));
});

// ─── Dev Handoff Workflow (CR030) ────────────────────────────────────────────
// Once FA-approved, a requirement can be handed to Dev. A Lead-tier user
// assigns a developer; the assignee (or a Lead) walks it through
// assigned → in_progress → ready_for_qa. ready_for_qa is the terminal dev-side
// state — QA picking the work back up for testing is tracked by the existing
// execution tables, not a further status here.

// GET /requirements/dev-queue — "Unassigned" (approved, no dev assignee yet —
// for a Lead to triage) + "My Dev Work" (assigned to me, any dev status)
router.get("/requirements/dev-queue", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const isLead = (await getRoleTierRank(ctx.role)) >= 2;
  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
  const allReqs = await db.select().from(requirementsTable);
  const scoped = allReqs.filter(r => accessible === null || (r.projectId != null && accessible.includes(r.projectId)));

  const unassigned = isLead
    ? scoped.filter(r => ((r as any).reviewStatus ?? "draft") === "approved" && !(r as any).devAssigneeId)
    : [];
  const myDevWork = scoped.filter(r => (r as any).devAssigneeId === ctx.userId);

  function withMeta(reqs: typeof allReqs) {
    return reqs.map(r => ({
      id: r.id,
      title: r.title,
      module: r.module,
      projectId: r.projectId,
      reviewStatus: (r as any).reviewStatus ?? "draft",
      devStatus: (r as any).devStatus ?? null,
      devAssigneeId: (r as any).devAssigneeId ?? null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  res.json({ unassigned: withMeta(unassigned), myDevWork: withMeta(myDevWork) });
});

// PATCH /requirements/:id/dev — action: 'assign' | 'start' | 'ready_for_qa'
router.patch("/requirements/:id/dev", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  // CR047 — every dev-handoff action requires access to the requirement's
  // project (and module, for module-scoped users). Previously only the
  // per-action role gates applied, so any qa_member org-wide could
  // return_to_dev (or a lead from another project could assign) a
  // requirement they have no grant on.
  if (requirement.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, requirement.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }
    if (!(await canAccessModule(ctx.userId, ctx.role, requirement.projectId, requirement.module))) {
      res.status(403).json({ error: "Access denied to this module" }); return;
    }
  }

  // CR063 — FA/PM flagged this requirement as blocked; freeze dev-handoff
  // until it's unblocked rather than let work silently keep progressing on
  // something that was deliberately called out as stalled.
  if ((requirement as any).isBlocked) {
    res.status(409).json({ error: "Requirement is blocked — unblock it first (FA/PM) before continuing dev work" }); return;
  }

  const { action, devAssigneeId, reason } = req.body ?? {};
  if (!["assign", "start", "ready_for_qa", "return_to_dev"].includes(action)) {
    res.status(400).json({ error: "action must be assign, start, ready_for_qa, or return_to_dev" }); return;
  }

  if (((requirement as any).reviewStatus ?? "draft") !== "approved") {
    res.status(409).json({ error: "Requirement must be FA-approved before dev handoff" }); return;
  }

  const currentDevAssigneeId: number | null = (requirement as any).devAssigneeId ?? null;
  const currentDevStatus: string | null = (requirement as any).devStatus ?? null;
  const isLead = (await getRoleTierRank(ctx.role)) >= 2;

  const update: Record<string, any> = {};
  const now = new Date();
  let assignedDevName: string | null = null;

  if (action === "assign") {
    if (!isLead) { res.status(403).json({ error: "Lead-tier role required to assign a developer" }); return; }
    const targetId = Number(devAssigneeId);
    if (!Number.isInteger(targetId)) { res.status(400).json({ error: "devAssigneeId is required" }); return; }
    const [devUser] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, targetId));
    if (!devUser) { res.status(400).json({ error: "Assignee not found" }); return; }
    assignedDevName = devUser.name;
    update.devAssigneeId = targetId;
    update.devStatus = "assigned";
    update.devAssignedAt = now;
    update.devAssignedBy = ctx.userId;
  } else if (action === "return_to_dev") {
    // CR046 — QA found the work isn't actually done: push it back to the dev.
    // ready_for_qa is no longer terminal; the requirement re-enters
    // in_progress with the same assignee.
    if (!currentDevAssigneeId) { res.status(409).json({ error: "Requirement has no dev assignee yet" }); return; }
    if (currentDevStatus !== "ready_for_qa") {
      res.status(409).json({ error: "Only a requirement marked ready for QA can be returned to development" }); return;
    }
    const QA_RETURN_ROLES = ["qa_member", "qa_lead", "hod_qa", "admin", "cto"];
    if (!QA_RETURN_ROLES.includes(ctx.role) && !isLead) {
      res.status(403).json({ error: "Only QA or a Lead can return a requirement to development" }); return;
    }
    update.devStatus = "in_progress";
    update.readyForQaAt = null;
  } else {
    if (!currentDevAssigneeId) { res.status(409).json({ error: "Requirement has no dev assignee yet" }); return; }
    if (ctx.userId !== currentDevAssigneeId && !isLead) {
      res.status(403).json({ error: "Only the assignee or a Lead can update dev status" }); return;
    }
    if (currentDevStatus === "ready_for_qa") { res.status(409).json({ error: "Already marked ready for QA" }); return; }
    if (action === "start") {
      update.devStatus = "in_progress";
    } else {
      update.devStatus = "ready_for_qa";
      update.readyForQaAt = now;
    }
  }

  const [updated] = await db.update(requirementsTable).set(update).where(eq(requirementsTable.id, id)).returning();

  await logActivity({
    type: `requirement_dev_${action}`,
    description: action === "assign"
      ? `Requirement "${requirement.title}" assigned to ${assignedDevName} for development`
      : action === "start"
        ? `Requirement "${requirement.title}" — development started`
        : action === "return_to_dev"
          ? `Requirement "${requirement.title}" returned to development by QA${typeof reason === "string" && reason.trim() ? `: ${reason.trim()}` : ""}`
          : `Requirement "${requirement.title}" marked ready for QA`,
    userId: ctx.userId,
    entityId: id,
    entityType: "requirement",
    oldValue: { devStatus: currentDevStatus, devAssigneeId: currentDevAssigneeId },
    newValue: { devStatus: update.devStatus, devAssigneeId: update.devAssigneeId ?? currentDevAssigneeId },
  });

  if (action === "assign") {
    await notifyUser(
      update.devAssigneeId,
      "Requirement assigned for development",
      `"${requirement.title}" has been assigned to you for development.`,
      "requirement_dev_assigned",
      "requirement",
      id,
      ctx.userId,
    ).catch(() => {});
  } else if (action === "ready_for_qa") {
    const recipients = new Set<number>();
    if (requirement.assigneeId) recipients.add(requirement.assigneeId);
    if (requirement.milestoneId) {
      const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, requirement.milestoneId));
      if (milestone?.createdBy) recipients.add(milestone.createdBy);
    }
    await Promise.all(
      [...recipients].map((uid) =>
        notifyUser(uid, "Ready for QA", `"${requirement.title}" is ready for QA testing.`, "requirement_ready_for_qa", "requirement", id, ctx.userId).catch(() => {}),
      ),
    );

    // CR045 — QA Leads on this project (module-scoped per CR044; HODs
    // excluded per the notification matrix) plan the test assignment, so
    // dev completion is their signal.
    await notifyRolesInProject({
      roles: ["qa_lead"],
      projectId: requirement.projectId,
      module: requirement.module,
      title: "Ready for QA",
      message: `"${requirement.title}" completed development — assign QA for testing.`,
      type: "requirement_ready_for_qa",
      entityType: "requirement",
      entityId: id,
      actorId: ctx.userId,
      excludeUserIds: recipients,
    }).catch(() => {});
  } else if (action === "return_to_dev") {
    // CR046 — the assigned dev hears why their work came back; their Dev
    // Lead (module-scoped, HODs excluded) sees the bounce too.
    const reasonSuffix = typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim()}` : "";
    await notifyUser(
      currentDevAssigneeId,
      "Returned to development",
      `"${requirement.title}" was returned to you by QA — it isn't ready for testing yet.${reasonSuffix}`,
      "returned_to_dev",
      "requirement",
      id,
      ctx.userId,
    ).catch(() => {});
    await notifyRolesInProject({
      roles: ["dev_lead"],
      projectId: requirement.projectId,
      module: requirement.module,
      title: "Requirement returned to development",
      message: `"${requirement.title}" was returned to development by QA.${reasonSuffix}`,
      type: "returned_to_dev",
      entityType: "requirement",
      entityId: id,
      actorId: ctx.userId,
      excludeUserIds: currentDevAssigneeId != null ? [currentDevAssigneeId] : [],
    }).catch(() => {});
  }

  res.json(await formatRequirement(updated));
});

// ─── Blocked flag (CR063) ────────────────────────────────────────────────────
// FA/PM-only, project/module-scoped like the dev-handoff actions above — not
// tier-gated, since the ask was "any FA or PM with access to this
// requirement," not "Lead+ only." A mandatory reason on block (e.g. "needs
// more time, exclude from this release, transfer to a new milestone" — the
// milestone move itself is just the existing generic PATCH /requirements/:id,
// no restriction added there). Freezing dev-handoff actions while blocked is
// enforced in the /dev route above, not here.
router.patch("/requirements/:id/block", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  if (requirement.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, requirement.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }
    if (!(await canAccessModule(ctx.userId, ctx.role, requirement.projectId, requirement.module))) {
      res.status(403).json({ error: "Access denied to this module" }); return;
    }
  }

  if (ctx.role !== "admin" && ctx.role !== "cto") {
    const department = await getRoleDepartment(ctx.role);
    if (department !== "fa" && department !== "pm") {
      res.status(403).json({ error: "Only FA or PM can change the blocked status" }); return;
    }
  }

  const { action, reason } = req.body ?? {};
  if (!["block", "unblock"].includes(action)) {
    res.status(400).json({ error: "action must be block or unblock" }); return;
  }

  const update: Record<string, any> = {};
  const now = new Date();

  if (action === "block") {
    if (requirement.isBlocked) { res.status(409).json({ error: "Already blocked" }); return; }
    if (typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ error: "A reason is required to block a requirement" }); return;
    }
    update.isBlocked = true;
    update.blockedReason = reason.trim();
    update.blockedAt = now;
    update.blockedBy = ctx.userId;
  } else {
    if (!requirement.isBlocked) { res.status(409).json({ error: "Not currently blocked" }); return; }
    update.isBlocked = false;
    update.blockedReason = null;
    update.blockedAt = null;
    update.blockedBy = null;
  }

  const [updated] = await db.update(requirementsTable).set(update).where(eq(requirementsTable.id, id)).returning();

  await logActivity({
    type: action === "block" ? "requirement_blocked" : "requirement_unblocked",
    description: action === "block"
      ? `Requirement "${requirement.title}" blocked: ${update.blockedReason}`
      : `Requirement "${requirement.title}" unblocked`,
    userId: ctx.userId,
    entityId: id,
    entityType: "requirement",
    oldValue: { isBlocked: requirement.isBlocked, blockedReason: requirement.blockedReason },
    newValue: { isBlocked: update.isBlocked, blockedReason: update.blockedReason },
  });

  // Whoever's actively working it (dev assignee, or the FA author if it
  // hasn't reached dev yet) should hear about it either direction.
  const recipientId = requirement.devAssigneeId ?? requirement.createdBy;
  if (recipientId) {
    await notifyUser(
      recipientId,
      action === "block" ? "Requirement blocked" : "Requirement unblocked",
      action === "block"
        ? `"${requirement.title}" was marked blocked: ${update.blockedReason}`
        : `"${requirement.title}" is no longer blocked.`,
      action === "block" ? "requirement_blocked" : "requirement_unblocked",
      "requirement",
      id,
      ctx.userId,
    ).catch(() => {});
  }

  res.json(await formatRequirement(updated));
});

// ─── Requirement Events (CR068) ──────────────────────────────────────────────
// A lightweight, editable, date-ranged event log (Blocker/Server down/
// Automation unavailable/custom) — distinct from the CR063 isBlocked flag,
// which freezes dev/QA actions. This is purely informational and open to any
// user with access to the requirement, not gated to FA/PM like /block.
async function requireRequirementAccess(req: any, res: any, id: number) {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return null; }
  if (requirement.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, requirement.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return null;
    }
    if (!(await canAccessModule(ctx.userId, ctx.role, requirement.projectId, requirement.module))) {
      res.status(403).json({ error: "Access denied to this module" }); return null;
    }
  }
  return { ctx, requirement };
}

async function formatRequirementEvent(e: typeof requirementEventsTable.$inferSelect) {
  let createdByName: string | null = null;
  let updatedByName: string | null = null;
  if (e.createdBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, e.createdBy));
    createdByName = u?.name ?? null;
  }
  if (e.updatedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, e.updatedBy));
    updatedByName = u?.name ?? null;
  }
  return { ...e, createdByName, updatedByName };
}

router.get("/requirements/:id/events", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const gate = await requireRequirementAccess(req, res, id);
  if (!gate) return;

  const events = await db.select().from(requirementEventsTable)
    .where(eq(requirementEventsTable.requirementId, id))
    .orderBy(desc(requirementEventsTable.startDate));
  res.json(await Promise.all(events.map(formatRequirementEvent)));
});

router.post("/requirements/:id/events", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const gate = await requireRequirementAccess(req, res, id);
  if (!gate) return;
  const { ctx, requirement } = gate;

  const { type, description, startDate, endDate } = req.body ?? {};
  if (typeof type !== "string" || !type.trim()) {
    res.status(400).json({ error: "type is required" }); return;
  }
  const parsedStart = startDate ? new Date(startDate) : null;
  if (!parsedStart || isNaN(parsedStart.getTime())) {
    res.status(400).json({ error: "A valid startDate is required" }); return;
  }
  const parsedEnd = endDate ? new Date(endDate) : null;
  if (endDate && (!parsedEnd || isNaN(parsedEnd.getTime()))) {
    res.status(400).json({ error: "endDate is not a valid date" }); return;
  }

  const [created] = await db.insert(requirementEventsTable).values({
    requirementId: id,
    type: type.trim(),
    description: description ? String(description).trim() : null,
    startDate: parsedStart,
    endDate: parsedEnd,
    createdBy: ctx.userId,
  }).returning();

  await logActivity({
    type: "requirement_event_logged",
    description: `"${type.trim()}" event logged on "${requirement.title}"`,
    userId: ctx.userId,
    entityId: id,
    entityType: "requirement",
    oldValue: null,
    newValue: { type: created.type, startDate: created.startDate, endDate: created.endDate },
  });

  res.status(201).json(await formatRequirementEvent(created));
});

router.patch("/requirements/events/:eventId", async (req, res): Promise<void> => {
  const eventId = parseInt(req.params.eventId);
  if (isNaN(eventId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [event] = await db.select().from(requirementEventsTable).where(eq(requirementEventsTable.id, eventId));
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const gate = await requireRequirementAccess(req, res, event.requirementId);
  if (!gate) return;
  const { ctx, requirement } = gate;

  const { type, description, startDate, endDate } = req.body ?? {};
  const update: Record<string, any> = { updatedBy: ctx.userId };
  if (type !== undefined) {
    if (typeof type !== "string" || !type.trim()) { res.status(400).json({ error: "type cannot be empty" }); return; }
    update.type = type.trim();
  }
  if (description !== undefined) update.description = description ? String(description).trim() : null;
  if (startDate !== undefined) {
    const parsed = new Date(startDate);
    if (isNaN(parsed.getTime())) { res.status(400).json({ error: "startDate is not a valid date" }); return; }
    update.startDate = parsed;
  }
  if (endDate !== undefined) {
    if (endDate === null || endDate === "") {
      update.endDate = null;
    } else {
      const parsed = new Date(endDate);
      if (isNaN(parsed.getTime())) { res.status(400).json({ error: "endDate is not a valid date" }); return; }
      update.endDate = parsed;
    }
  }

  const [updated] = await db.update(requirementEventsTable).set(update).where(eq(requirementEventsTable.id, eventId)).returning();

  await logActivity({
    type: "requirement_event_updated",
    description: `Event on "${requirement.title}" updated`,
    userId: ctx.userId,
    entityId: event.requirementId,
    entityType: "requirement",
    oldValue: { type: event.type, startDate: event.startDate, endDate: event.endDate },
    newValue: { type: updated.type, startDate: updated.startDate, endDate: updated.endDate },
  });

  res.json(await formatRequirementEvent(updated));
});

// History Trail — every event across every project the caller can access,
// joined with its requirement/milestone/project for display without a
// second round-trip per row.
router.get("/requirements/events/all", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  const rows = await db
    .select({
      event: requirementEventsTable,
      requirementId: requirementsTable.id,
      requirementTitle: requirementsTable.title,
      projectId: requirementsTable.projectId,
      projectName: projectsTable.name,
      milestoneId: requirementsTable.milestoneId,
      milestoneName: milestonesTable.name,
    })
    .from(requirementEventsTable)
    .innerJoin(requirementsTable, eq(requirementsTable.id, requirementEventsTable.requirementId))
    .leftJoin(projectsTable, eq(projectsTable.id, requirementsTable.projectId))
    .leftJoin(milestonesTable, eq(milestonesTable.id, requirementsTable.milestoneId))
    .where(accessible === null ? undefined : accessible.length > 0 ? inArray(requirementsTable.projectId, accessible) : sql`false`)
    .orderBy(desc(requirementEventsTable.startDate));

  const formatted = await Promise.all(rows.map(async (r) => ({
    ...(await formatRequirementEvent(r.event)),
    requirementId: r.requirementId,
    requirementTitle: r.requirementTitle,
    projectId: r.projectId,
    projectName: r.projectName,
    milestoneId: r.milestoneId,
    milestoneName: r.milestoneName,
  })));

  res.json(formatted);
});

// ─── Return to FA (CR053) ────────────────────────────────────────────────────
// The symmetric counterpart to Return-to-Dev (CR046): when Dev or QA finds an
// already-approved requirement is incomplete or wrong, they can send it back
// to the FA author for revision as a first-class phase transition — distinct
// from raising a requirement defect (CR031), which tracks the problem as a
// parallel artifact without moving the requirement's phase. Both remain
// available; the user picks. This reuses the reject/re-review machinery: the
// requirement goes back to "rejected", the author edits and re-submits via the
// existing review endpoint, and a fresh Requirements cycle shows on the PM
// timeline (the phase machine treats requirement_return_to_fa as a boundary).
const RETURN_TO_FA_ROLES = [
  "dev_member", "dev_lead", "hod_dev",
  "qa_member", "qa_lead", "hod_qa",
  "admin", "cto",
];

router.patch("/requirements/:id/return-to-fa", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!RETURN_TO_FA_ROLES.includes(ctx.role)) {
    res.status(403).json({ error: "Only Dev or QA can return a requirement to FA" }); return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  // Same access gate as the dev workflow (CR047): project + module scope.
  if (requirement.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, requirement.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }
    if (!(await canAccessModule(ctx.userId, ctx.role, requirement.projectId, requirement.module))) {
      res.status(403).json({ error: "Access denied to this module" }); return;
    }
  }

  if (((requirement as any).reviewStatus ?? "draft") !== "approved") {
    res.status(409).json({ error: "Only an approved requirement can be returned to FA" }); return;
  }

  const { reason } = req.body ?? {};
  const now = new Date();
  const currentDevStatus: string | null = (requirement as any).devStatus ?? null;

  // Back to the FA author for revision (reuse the "rejected" state so the
  // existing re-review flow applies), and pause dev handoff so it can't be
  // worked until re-approved.
  // Full reset of the dev handoff — the requirement re-enters review, so it
  // shouldn't linger in the old assignee's dev queue. After re-approval a Lead
  // re-triages it (the content may have changed).
  const [updated] = await db.update(requirementsTable).set({
    reviewStatus: "rejected",
    rejectedBy: ctx.userId,
    rejectedAt: now,
    devStatus: null,
    devAssigneeId: null,
    readyForQaAt: null,
  } as any).where(eq(requirementsTable.id, id)).returning();

  const reasonSuffix = typeof reason === "string" && reason.trim() ? `: ${reason.trim()}` : "";
  await logActivity({
    type: "requirement_return_to_fa",
    description: `Requirement "${requirement.title}" returned to FA${reasonSuffix}`,
    userId: ctx.userId,
    entityId: id,
    entityType: "requirement",
    oldValue: { reviewStatus: "approved", devStatus: currentDevStatus },
    newValue: { reviewStatus: "rejected", reason: reason ?? null },
  });

  // Notify the requirement's author (the FA who wrote it) + the FA team on the
  // project (module-scoped, author deduped).
  const authorId = (requirement as any).createdBy as number | null;
  if (authorId) {
    await notifyUser(
      authorId,
      "Requirement returned for revision",
      `"${requirement.title}" was returned to you by ${ctx.role.startsWith("dev") ? "Dev" : "QA"} — it needs changes before it can proceed.${typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim()}` : ""}`,
      "requirement_returned_to_fa",
      "requirement",
      id,
      ctx.userId,
    ).catch(() => {});
  }
  await notifyRolesInProject({
    roles: ["fa_lead", "fa_member"],
    projectId: requirement.projectId,
    module: requirement.module,
    title: "Requirement returned to FA",
    message: `"${requirement.title}" was returned for revision.${typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim()}` : ""}`,
    type: "requirement_returned_to_fa",
    entityType: "requirement",
    entityId: id,
    actorId: ctx.userId,
    excludeUserIds: authorId != null ? [authorId] : [],
  }).catch(() => {});

  res.json(await formatRequirement(updated));
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

// CR023p1.4 — Redmine issues carry an author name, not a QAPulse user ID. Matching
// is approximate (name string vs. a separate identity system), so a miss falls
// back to the importing user rather than ever leaving createdBy null.
async function resolveRedmineCreatedBy(
  authorName: string | undefined,
  importingUserId: number,
  ticketId: string,
): Promise<number> {
  const name = authorName?.trim();
  if (name) {
    const [match] = await db.select().from(usersTable).where(ilike(usersTable.name, name));
    if (match) return match.id;
  }
  console.warn(`[Redmine import] No QAPulse user matched Redmine author "${name ?? "(none)"}" for issue #${ticketId} — falling back to importing user #${importingUserId}`);
  return importingUserId;
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
  milestoneId: number | undefined,
  apiKey: string,
  importingUserId: number,
  isRoot = true,
): Promise<number | undefined> {
  const resp = await redmineFetchLocal(`/issues/${encodeURIComponent(ticketId)}.json?include=children,journals,attachments`, apiKey);
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
  // Only touch milestoneId when explicitly provided — undefined means "the
  // caller has no milestone context," not "clear the requirement's milestone."
  if (milestoneId !== undefined) mappedData.milestoneId = milestoneId;

  let savedId: number | undefined;
  if (existing) {
    mappedData.status = existing.status;
    mappedData.release = existing.release ?? undefined;
    mappedData.assigneeId = existing.assigneeId ?? undefined;
    if (!(existing as any).createdBy) {
      mappedData.createdBy = await resolveRedmineCreatedBy(issue.author?.name, importingUserId, fetchedId);
    }
    await db.update(requirementsTable).set(mappedData).where(eq(requirementsTable.id, existing.id));
    savedId = existing.id;
  } else {
    mappedData.status = "draft";
    mappedData.createdBy = await resolveRedmineCreatedBy(issue.author?.name, importingUserId, fetchedId);
    const [created] = await db.insert(requirementsTable).values(mappedData).returning();
    savedId = created.id;
  }

  // Sync Redmine attachments — download any not already stored locally
  if (savedId) {
    await syncRequirementAttachments(savedId, issue.attachments ?? [], apiKey).catch(() => {});
  }

  if (issue.children && Array.isArray(issue.children)) {
    for (const child of issue.children) {
      await syncRedmineTicket(String(child.id), targetModule, targetProjectId, savedId, trackerFilter, milestoneId, apiKey, importingUserId, false);
    }
  }

  return savedId;
}

// POST /requirements/import-redmine
// Body: { ticketId, module, projectId, trackerFilter?, milestoneId? }
router.post("/requirements/import-redmine", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { ticketId, module, projectId, trackerFilter, milestoneId } = req.body;
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
      milestoneId ? Number(milestoneId) : undefined,
      apiKey,
      ctx.userId,
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
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ticketId = String(req.body?.ticketId ?? "").trim();
  const milestoneId = req.body?.milestoneId ? Number(req.body.milestoneId) : null;
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

    const createdBy = await resolveRedmineCreatedBy(issue.author?.name, ctx.userId, ticketId);

    const [created] = await db
      .insert(requirementsTable)
      .values({
        title: issue.subject,
        description: issue.description ?? "",
        priority: PRIORITY_MAP[issue.priority?.name?.toLowerCase()] ?? "normal",
        redmineTicketId: ticketId,
        tracker: issue.tracker?.name ?? "Task",
        milestoneId,
        status: "draft",
        createdBy,
      })
      .returning();

    res.status(201).json({ created: true, requirement: await formatRequirement(created) });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || `Failed to fetch Redmine issue #${ticketId}` });
  }
});

// ─── Requirement Attachments ──────────────────────────────────────────────────

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "requirements");

async function ensureUploadsDir() {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
}

// Download attachments from Redmine and store locally (dedup by redmineAttachmentId)
async function syncRequirementAttachments(
  requirementId: number,
  attachments: any[],
  apiKey: string,
) {
  if (!Array.isArray(attachments) || attachments.length === 0) return;
  await ensureUploadsDir();

  for (const att of attachments) {
    const redmineId = String(att.id);
    const [existing] = await db
      .select({ id: requirementAttachmentsTable.id })
      .from(requirementAttachmentsTable)
      .where(eq(requirementAttachmentsTable.redmineAttachmentId, redmineId));
    if (existing) continue;

    try {
      const resp = await fetch(att.content_url, {
        headers: { "X-Redmine-API-Key": apiKey },
      });
      if (!resp.ok) continue;

      const buffer = Buffer.from(await resp.arrayBuffer());
      const ext = path.extname(att.filename || "") || "";
      const storageFilename = `${crypto.randomUUID()}${ext}`;
      await fs.promises.writeFile(path.join(UPLOADS_DIR, storageFilename), buffer);

      await db.insert(requirementAttachmentsTable).values({
        requirementId,
        filename: att.filename ?? "attachment",
        mimeType: att.content_type ?? "application/octet-stream",
        size: buffer.length,
        storagePath: storageFilename,
        redmineAttachmentId: redmineId,
        redmineFileUrl: att.content_url ?? null,
      });
    } catch {
      // Skip failed individual downloads — don't abort the whole import
    }
  }
}

// POST /requirements/:id/sync-redmine-attachments
// Frontend passes the attachments[] it received from the Redmine proxy; server downloads and stores them.
router.post("/requirements/:id/sync-redmine-attachments", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachments: any[] = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const apiKey = await resolveApiKeyFromToken(req.headers.authorization);

  await syncRequirementAttachments(id, attachments, apiKey).catch(() => {});
  res.json({ success: true });
});

// GET /requirements/:id/attachments
router.get("/requirements/:id/attachments", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachments = await db
    .select()
    .from(requirementAttachmentsTable)
    .where(eq(requirementAttachmentsTable.requirementId, id))
    .orderBy(requirementAttachmentsTable.createdAt);

  res.json(attachments.map(a => ({
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    redmineAttachmentId: a.redmineAttachmentId,
    redmineFileUrl: a.redmineFileUrl,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt,
  })));
});

// POST /requirements/:id/attachments  — upload a file (base64 JSON body)
// Body: { filename: string, mimeType: string, data: string (base64) }
router.post("/requirements/:id/attachments", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [requirement] = await db
    .select({ id: requirementsTable.id })
    .from(requirementsTable)
    .where(eq(requirementsTable.id, id));
  if (!requirement) { res.status(404).json({ error: "Requirement not found" }); return; }

  const { filename, mimeType, data } = req.body ?? {};
  if (!filename || !data) {
    res.status(400).json({ error: "filename and data (base64) are required" });
    return;
  }

  try {
    await ensureUploadsDir();
    const buffer = Buffer.from(data, "base64");
    const ext = path.extname(filename) || "";
    const storageFilename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(UPLOADS_DIR, storageFilename), buffer);

    const [attachment] = await db.insert(requirementAttachmentsTable).values({
      requirementId: id,
      filename,
      mimeType: mimeType ?? "application/octet-stream",
      size: buffer.length,
      storagePath: storageFilename,
      uploadedBy: ctx.userId,
    }).returning();

    res.status(201).json(attachment);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Upload failed" });
  }
});

// GET /requirements/attachments/:attachmentId/download
router.get("/requirements/attachments/:attachmentId/download", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const attachmentId = parseInt(req.params.attachmentId);
  if (isNaN(attachmentId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [attachment] = await db
    .select()
    .from(requirementAttachmentsTable)
    .where(eq(requirementAttachmentsTable.id, attachmentId));
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const filePath = path.join(UPLOADS_DIR, attachment.storagePath);
  try {
    await fs.promises.access(filePath);
  } catch {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
  res.setHeader("Content-Type", attachment.mimeType);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res as any);
});

// DELETE /requirements/attachments/:attachmentId
router.delete("/requirements/attachments/:attachmentId", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const attachmentId = parseInt(req.params.attachmentId);
  if (isNaN(attachmentId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [attachment] = await db
    .select()
    .from(requirementAttachmentsTable)
    .where(eq(requirementAttachmentsTable.id, attachmentId));
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  await db.delete(requirementAttachmentsTable).where(eq(requirementAttachmentsTable.id, attachmentId));

  // Best-effort file removal — don't fail if file is missing
  fs.promises.unlink(path.join(UPLOADS_DIR, attachment.storagePath)).catch(() => {});

  res.sendStatus(204);
});

export default router;