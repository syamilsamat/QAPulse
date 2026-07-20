import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, milestonesTable, milestoneAssigneesTable, usersTable, projectMembersTable, requirementsTable, executionFilesTable } from "@workspace/db";
import { getAuthContext, canAccessProject } from "../middleware/access";
import { verifyToken } from "./auth";
import { logActivity } from "./_audit";
import { notifyRolesInProject, notifyUser } from "./_notify";

const router: IRouter = Router();

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  try {
    const { id, role } = verifyToken(auth.slice(7));
    return { userId: id, role };
  }
  catch { res.status(401).json({ error: "Unauthorized" }); return null; }
}

function canWrite(role: string) {
  // pm_lead/pmo were missing here even though dashboard.ts's PM_ROLES
  // already treats them as legitimate PM roles for reading milestone data —
  // without them a PM couldn't create, edit, or close their own milestones.
  return ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pmo", "cto"].includes(role);
}

const VALID_ENVIRONMENTS = ["ENV1", "ENV2", "ENV3", "ENV4", "ENV5", "ENV6"];
const VALID_STATUSES = ["planned", "active", "verified", "uat", "completed", "cancelled"];
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];

function fmt(m: typeof milestonesTable.$inferSelect) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    type: m.type,
    status: m.status,
    priority: m.priority ?? null,
    targetDate: m.targetDate?.toISOString() ?? null,
    startDate: m.startDate?.toISOString() ?? null,
    reqTargetDate: m.reqTargetDate?.toISOString() ?? null,
    devTargetDate: m.devTargetDate?.toISOString() ?? null,
    qaTargetDate: m.qaTargetDate?.toISOString() ?? null,
    uatTargetDate: m.uatTargetDate?.toISOString() ?? null,
    goLiveDate: m.goLiveDate?.toISOString() ?? null,
    environment: m.environment ?? null,
    createdBy: m.createdBy ?? null,
    completedAt: m.completedAt?.toISOString() ?? null,
    lessonsLearned: m.lessonsLearned ?? null,
    closedBy: m.closedBy ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// GET /milestones?projectId=X
router.get("/milestones", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db.select().from(milestonesTable)
    .where(eq(milestonesTable.projectId, projectId))
    .orderBy(milestonesTable.targetDate);

  const ids = rows.map(m => m.id);
  const reqs = ids.length
    ? await db.select({ milestoneId: requirementsTable.milestoneId, reviewStatus: requirementsTable.reviewStatus })
        .from(requirementsTable).where(inArray(requirementsTable.milestoneId, ids))
    : [];
  const execFiles = ids.length
    ? await db.select({ milestoneId: executionFilesTable.milestoneId, fileType: executionFilesTable.fileType })
        .from(executionFilesTable).where(inArray(executionFilesTable.milestoneId, ids))
    : [];

  res.json(rows.map(m => {
    const mReqs = reqs.filter(r => r.milestoneId === m.id);
    const mExecFiles = execFiles.filter(f => f.milestoneId === m.id);
    return {
      ...fmt(m),
      requirementCount: mReqs.length,
      approvedCount: mReqs.filter(r => r.reviewStatus === "approved").length,
      executionFileCount: mExecFiles.filter(f => f.fileType === "qa").length,
      uatFileCount: mExecFiles.filter(f => f.fileType === "uat").length,
    };
  }));
});

// POST /milestones
router.post("/milestones", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }

  const { projectId, name, type = "cr", status = "planned", priority, targetDate, startDate, reqTargetDate, devTargetDate, qaTargetDate, uatTargetDate, goLiveDate, environment } = req.body;
  if (!projectId || !name?.trim()) { res.status(400).json({ error: "projectId and name are required" }); return; }
  if (environment != null && !VALID_ENVIRONMENTS.includes(environment)) {
    res.status(400).json({ error: `environment must be one of ${VALID_ENVIRONMENTS.join(", ")}` }); return;
  }
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }); return;
  }
  if (priority != null && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }); return;
  }

  const ok = await canAccessProject(ctx.userId, ctx.role, Number(projectId));
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const [m] = await db.insert(milestonesTable).values({
    projectId: Number(projectId),
    name: name.trim(),
    type,
    status,
    priority: priority ?? null,
    targetDate: targetDate ? new Date(targetDate) : null,
    startDate: startDate ? new Date(startDate) : null,
    reqTargetDate: reqTargetDate ? new Date(reqTargetDate) : null,
    devTargetDate: devTargetDate ? new Date(devTargetDate) : null,
    qaTargetDate: qaTargetDate ? new Date(qaTargetDate) : null,
    uatTargetDate: uatTargetDate ? new Date(uatTargetDate) : null,
    goLiveDate: goLiveDate ? new Date(goLiveDate) : null,
    environment: environment ?? null,
    createdBy: (ctx as any).id ?? ctx.userId,
    // Edge case: importing a historical milestone already marked completed.
    completedAt: status === "completed" ? new Date() : null,
  }).returning();

  await logActivity({ type: "milestone_created", description: `Milestone "${m.name}" created`, userId: ctx.id ?? ctx.userId, entityId: m.id, entityType: "milestone" });

  // CR045 — FAs on this project kick off requirement writing when a milestone
  // opens, so they're the ones told about it (lead + member; HODs excluded
  // per the notification matrix).
  await notifyRolesInProject({
    roles: ["fa_lead", "fa_member"],
    projectId: m.projectId,
    title: "New milestone created",
    message: `Milestone "${m.name}" was created — requirements can now be raised against it.`,
    type: "milestone_created",
    entityType: "milestone",
    entityId: m.id,
    actorId: (ctx as any).id ?? ctx.userId,
  }).catch(() => {});

  res.status(201).json(fmt(m));
});

// GET /milestones/:id
router.get("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, m.projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  // Counts for the milestone
  const reqs = await db.select({ id: requirementsTable.id, reviewStatus: requirementsTable.reviewStatus })
    .from(requirementsTable).where(eq(requirementsTable.milestoneId, id));
  const execFiles = await db.select({ id: executionFilesTable.id, fileType: executionFilesTable.fileType })
    .from(executionFilesTable).where(eq(executionFilesTable.milestoneId, id));

  res.json({
    ...fmt(m),
    requirementCount: reqs.length,
    approvedCount: reqs.filter(r => r.reviewStatus === "approved").length,
    executionFileCount: execFiles.filter(f => f.fileType === "qa").length,
    uatFileCount: execFiles.filter(f => f.fileType === "uat").length,
  });
});

// PATCH /milestones/:id
router.patch("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }

  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const update: Partial<typeof milestonesTable.$inferInsert> = {};
  if (req.body.name !== undefined) update.name = req.body.name.trim();
  if (req.body.type !== undefined) update.type = req.body.type;
  if (req.body.targetDate !== undefined) update.targetDate = req.body.targetDate ? new Date(req.body.targetDate) : null;
  if (req.body.startDate !== undefined) update.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  if (req.body.reqTargetDate !== undefined) update.reqTargetDate = req.body.reqTargetDate ? new Date(req.body.reqTargetDate) : null;
  if (req.body.devTargetDate !== undefined) update.devTargetDate = req.body.devTargetDate ? new Date(req.body.devTargetDate) : null;
  if (req.body.qaTargetDate !== undefined) update.qaTargetDate = req.body.qaTargetDate ? new Date(req.body.qaTargetDate) : null;
  if (req.body.uatTargetDate !== undefined) update.uatTargetDate = req.body.uatTargetDate ? new Date(req.body.uatTargetDate) : null;
  if (req.body.goLiveDate !== undefined) update.goLiveDate = req.body.goLiveDate ? new Date(req.body.goLiveDate) : null;
  if (req.body.environment !== undefined) {
    if (req.body.environment != null && !VALID_ENVIRONMENTS.includes(req.body.environment)) {
      res.status(400).json({ error: `environment must be one of ${VALID_ENVIRONMENTS.join(", ")}` }); return;
    }
    update.environment = req.body.environment ?? null;
  }
  if (req.body.lessonsLearned !== undefined) update.lessonsLearned = req.body.lessonsLearned;
  if (req.body.priority !== undefined) {
    if (req.body.priority != null && !VALID_PRIORITIES.includes(req.body.priority)) {
      res.status(400).json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }); return;
    }
    update.priority = req.body.priority ?? null;
  }
  if (req.body.status !== undefined) {
    // CR054p1 — lifecycle: planned → active → verified (QA passed) → uat
    // (business testing) → completed, or cancelled at any point.
    if (!VALID_STATUSES.includes(req.body.status)) {
      res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }); return;
    }
    update.status = req.body.status;
    // Auto-stamp the authoritative end-of-QA-phase boundary (PM Dashboard
    // phase breakdown) — set on the transition into 'completed', cleared if
    // it moves away again, same pattern as requirements' approvedAt/rejectedAt.
    if (req.body.status === "completed" && m.status !== "completed") {
      update.completedAt = new Date();
      if (!m.closedBy) update.closedBy = ctx.id ?? ctx.userId;
    } else if (req.body.status !== "completed" && m.status === "completed") {
      update.completedAt = null;
    }
  }

  const [updated] = await db.update(milestonesTable).set(update).where(eq(milestonesTable.id, id)).returning();
  await logActivity({ type: "milestone_updated", description: `Milestone "${updated.name}" updated`, userId: ctx.id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.json(fmt(updated));
});

// ── CR054p2: milestone staffing ─────────────────────────────────────────────
// A lead-tier user formally assigns members to a milestone (e.g. QA lead
// staffs testers). Distinct from project membership, which governs access.

// GET /milestones/:id/assignees
router.get("/milestones/:id/assignees", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({ id: milestoneAssigneesTable.id, userId: milestoneAssigneesTable.userId, name: usersTable.name, role: usersTable.role, createdAt: milestoneAssigneesTable.createdAt })
    .from(milestoneAssigneesTable)
    .innerJoin(usersTable, eq(usersTable.id, milestoneAssigneesTable.userId))
    .where(eq(milestoneAssigneesTable.milestoneId, id));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// GET /milestones/:id/assignable-users — staffing candidates = users with a
// project_members grant on this milestone's project. Lead-tier gate (the
// /projects/:id/members endpoint is manager-tier, too high for a QA lead
// staffing their own milestone).
router.get("/milestones/:id/assignable-users", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }
  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(projectMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
    .where(eq(projectMembersTable.projectId, m.projectId));
  const seen = new Set<number>();
  res.json(rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true))));
});

// POST /milestones/:id/assignees { userId }
router.post("/milestones/:id/assignees", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }
  const id = parseInt(req.params.id);
  const userId = Number(req.body.userId);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  // The assignee must be able to see the project they're being staffed on.
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!(await canAccessProject(target.id, target.role, m.projectId))) {
    res.status(400).json({ error: "User has no access to this project — grant project membership first" }); return;
  }

  const existing = await db.select().from(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, id), eq(milestoneAssigneesTable.userId, userId)));
  if (existing.length > 0) { res.json({ ok: true, already: true }); return; }

  await db.insert(milestoneAssigneesTable).values({ milestoneId: id, userId, assignedBy: (ctx as any).id ?? ctx.userId });
  await logActivity({ type: "milestone_assignee_added", description: `${target.name} assigned to milestone "${m.name}"`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });
  await notifyUser(userId, "Assigned to milestone", `You've been assigned to milestone "${m.name}".`, "milestone", "milestone", id, (ctx as any).id ?? ctx.userId).catch(() => {});
  res.status(201).json({ ok: true });
});

// DELETE /milestones/:id/assignees/:userId
router.delete("/milestones/:id/assignees/:userId", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }
  const id = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  await db.delete(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, id), eq(milestoneAssigneesTable.userId, userId)));
  await logActivity({ type: "milestone_assignee_removed", description: `User #${userId} removed from milestone "${m.name}"`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.json({ ok: true });
});

// DELETE /milestones/:id
router.delete("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWrite(ctx.role)) { res.status(403).json({ error: "Insufficient role" }); return; }

  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
  await logActivity({ type: "milestone_deleted", description: `Milestone "${m.name}" deleted`, userId: ctx.id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.sendStatus(204);
});

// PATCH /milestones/:id/review — UAT sign-off gate (CR014p4 / CR022p3)
router.patch("/milestones/:id/review", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const FA_ROLES = ["fa_lead", "hod_fa", "admin"];
  if (!FA_ROLES.includes(ctx.role)) { res.status(403).json({ error: "FA Lead or above required for milestone sign-off" }); return; }

  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const { action } = req.body; // 'approve' | 'reject'
  if (!["approve", "reject"].includes(action)) { res.status(400).json({ error: "action must be 'approve' or 'reject'" }); return; }

  // Check for outstanding failed UAT test cases (warn, don't block)
  const { pool } = await import("@workspace/db");
  const { rows: failedRows } = await pool.query(`
    SELECT COUNT(*)::int AS cnt
    FROM execution_test_cases etc
    JOIN execution_files ef ON ef.id = etc.execution_file_id
    WHERE ef.milestone_id = $1 AND ef.file_type = 'uat'
      AND etc.result IN ('Failed', 'Blocked')
  `, [id]);
  const outstandingFailures = failedRows[0]?.cnt ?? 0;

  const newStatus = action === "approve" ? "completed" : "planned";
  const [updated] = await db.update(milestonesTable).set({ status: newStatus }).where(eq(milestonesTable.id, id)).returning();

  await logActivity({
    type: action === "approve" ? "milestone_approved" : "milestone_rejected",
    description: `Milestone "${m.name}" ${action === "approve" ? "signed off" : "rejected"} by user #${ctx.id ?? ctx.userId}`,
    userId: ctx.id ?? ctx.userId, entityId: id, entityType: "milestone",
  });

  res.json({ ...fmt(updated), warning: outstandingFailures > 0 ? `${outstandingFailures} UAT test case(s) still failing` : null });
});

// GET /milestones/:id/risk-assessments — CR037 assessment history (newest first).
// Same PM-tier gate as the dashboard endpoints that render alongside it.
router.get("/milestones/:id/risk-assessments", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const PM_ROLES = ["pmo", "pm_lead", "hod_pm", "admin", "cto"];
  if (!PM_ROLES.includes(ctx.role)) { res.status(403).json({ error: "PM role required" }); return; }

  const id = parseInt(req.params.id);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject((ctx as any).id ?? ctx.userId, ctx.role, m.projectId))) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const { milestoneRiskAssessmentsTable } = await import("@workspace/db");
  const { desc } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(milestoneRiskAssessmentsTable)
    .where(eq(milestoneRiskAssessmentsTable.milestoneId, id))
    .orderBy(desc(milestoneRiskAssessmentsTable.createdAt))
    .limit(20);

  res.json(rows.map((a) => {
    let factors: unknown = [];
    try { factors = JSON.parse(a.factors); } catch { /* keep [] */ }
    return {
      id: a.id,
      milestoneId: a.milestoneId,
      riskLevel: a.riskLevel,
      factors,
      mitigation: a.mitigation ?? null,
      model: a.model ?? null,
      createdBy: a.createdBy ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }));
});

export default router;
