import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, milestonesTable, requirementsTable, executionFilesTable } from "@workspace/db";
import { getAuthContext, canAccessProject } from "../middleware/access";
import { verifyToken } from "./auth";
import { logActivity } from "./_audit";

const router: IRouter = Router();

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  try { return verifyToken(auth.slice(7)); }
  catch { res.status(401).json({ error: "Unauthorized" }); return null; }
}

function canWrite(role: string) {
  return ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "cto"].includes(role);
}

function fmt(m: typeof milestonesTable.$inferSelect) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    type: m.type,
    status: m.status,
    targetDate: m.targetDate?.toISOString() ?? null,
    createdBy: m.createdBy ?? null,
    completedAt: m.completedAt?.toISOString() ?? null,
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

  const { projectId, name, type = "cr", status = "planned", targetDate } = req.body;
  if (!projectId || !name?.trim()) { res.status(400).json({ error: "projectId and name are required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, Number(projectId));
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const [m] = await db.insert(milestonesTable).values({
    projectId: Number(projectId),
    name: name.trim(),
    type,
    status,
    targetDate: targetDate ? new Date(targetDate) : null,
    createdBy: (ctx as any).id ?? ctx.userId,
    // Edge case: importing a historical milestone already marked completed.
    completedAt: status === "completed" ? new Date() : null,
  }).returning();

  await logActivity({ type: "milestone_created", description: `Milestone "${m.name}" created`, userId: ctx.id ?? ctx.userId, entityId: m.id, entityType: "milestone" });
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
  if (req.body.status !== undefined) {
    update.status = req.body.status;
    // Auto-stamp the authoritative end-of-QA-phase boundary (PM Dashboard
    // phase breakdown) — set on the transition into 'completed', cleared if
    // it moves away again, same pattern as requirements' approvedAt/rejectedAt.
    if (req.body.status === "completed" && m.status !== "completed") {
      update.completedAt = new Date();
    } else if (req.body.status !== "completed" && m.status === "completed") {
      update.completedAt = null;
    }
  }

  const [updated] = await db.update(milestonesTable).set(update).where(eq(milestonesTable.id, id)).returning();
  await logActivity({ type: "milestone_updated", description: `Milestone "${updated.name}" updated`, userId: ctx.id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.json(fmt(updated));
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

export default router;
