import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { verifyToken, actorFromReq } from "./auth";
import { logActivity, diffChanges } from "./_audit";
import { notifyUser, notifyRolesInProject } from "./_notify";
import { getAuthContext, scopeToUserProjects, canAccessProject, getRoleTierRank, getModuleScope } from "../middleware/access";
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
  tasksTable,
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

  if (req.assigneeId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.assigneeId));
    assigneeName = user?.name ?? null;
  }
  if ((req as any).devAssigneeId) {
    const [devUser] = await db.select().from(usersTable).where(eq(usersTable.id, (req as any).devAssigneeId));
    devAssigneeName = devUser?.name ?? null;
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

  res.json({
    ...(await formatRequirement(requirement)),
    tcCount: distinctTcs.size,
    execPass,
    execFail,
    execPending,
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