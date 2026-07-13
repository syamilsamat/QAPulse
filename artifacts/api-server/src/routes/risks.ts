import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, risksTable } from "@workspace/db";
import { getAuthContext, canAccessProject, getRoleTierRank } from "../middleware/access";
import { logActivity, diffChanges } from "./_audit";

const router: IRouter = Router();

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return ctx;
}

async function canWriteRisk(role: string): Promise<boolean> {
  return (await getRoleTierRank(role)) >= 2;
}

function fmt(r: typeof risksTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    milestoneId: r.milestoneId ?? null,
    title: r.title,
    description: r.description ?? null,
    category: r.category,
    probability: r.probability,
    impact: r.impact,
    status: r.status,
    mitigationPlan: r.mitigationPlan ?? null,
    ownerId: r.ownerId ?? null,
    raisedBy: r.raisedBy ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// GET /risks?projectId=X&milestoneId=Y (milestoneId optional)
router.get("/risks", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const milestoneId = req.query.milestoneId ? Number(req.query.milestoneId) : null;
  const where = milestoneId
    ? and(eq(risksTable.projectId, projectId), eq(risksTable.milestoneId, milestoneId))
    : eq(risksTable.projectId, projectId);

  const rows = await db.select().from(risksTable).where(where).orderBy(desc(risksTable.createdAt));
  res.json(rows.map(fmt));
});

// POST /risks
router.post("/risks", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!(await canWriteRisk(ctx.role))) { res.status(403).json({ error: "Lead role or above required" }); return; }

  const { projectId, milestoneId, title, description, category, probability, impact, status, mitigationPlan, ownerId } = req.body ?? {};
  if (!projectId || !title?.trim()) { res.status(400).json({ error: "projectId and title are required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, Number(projectId));
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const [r] = await db.insert(risksTable).values({
    projectId: Number(projectId),
    milestoneId: milestoneId != null ? Number(milestoneId) : null,
    title: title.trim(),
    description: description ?? null,
    category: category ?? "other",
    probability: probability ?? "medium",
    impact: impact ?? "medium",
    status: status ?? "open",
    mitigationPlan: mitigationPlan ?? null,
    ownerId: ownerId != null ? Number(ownerId) : null,
    raisedBy: ctx.userId,
    // Edge case: importing a historical risk already marked closed/realized.
    closedAt: (status === "closed" || status === "realized") ? new Date() : null,
  }).returning();

  await logActivity({
    type: "risk_created",
    description: `Risk "${r.title}" raised`,
    userId: ctx.userId,
    entityId: r.id,
    entityType: "risk",
    newValue: { title: r.title, category: r.category, probability: r.probability, impact: r.impact },
  });
  res.status(201).json(fmt(r));
});

// PATCH /risks/:id
router.patch("/risks/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!(await canWriteRisk(ctx.role))) { res.status(403).json({ error: "Lead role or above required" }); return; }

  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Risk not found" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, existing.projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const update: Partial<typeof risksTable.$inferInsert> = {};
  if (req.body.title !== undefined) update.title = req.body.title.trim();
  if (req.body.description !== undefined) update.description = req.body.description;
  if (req.body.category !== undefined) update.category = req.body.category;
  if (req.body.probability !== undefined) update.probability = req.body.probability;
  if (req.body.impact !== undefined) update.impact = req.body.impact;
  if (req.body.mitigationPlan !== undefined) update.mitigationPlan = req.body.mitigationPlan;
  if (req.body.ownerId !== undefined) update.ownerId = req.body.ownerId != null ? Number(req.body.ownerId) : null;
  if (req.body.milestoneId !== undefined) update.milestoneId = req.body.milestoneId != null ? Number(req.body.milestoneId) : null;
  if (req.body.status !== undefined) {
    update.status = req.body.status;
    if ((req.body.status === "closed" || req.body.status === "realized") && existing.status !== "closed" && existing.status !== "realized") {
      update.closedAt = new Date();
    } else if (req.body.status === "open" || req.body.status === "mitigating") {
      update.closedAt = null;
    }
  }

  const [updated] = await db.update(risksTable).set(update).where(eq(risksTable.id, id)).returning();

  const diff = diffChanges(existing, updated);
  await logActivity({
    type: req.body.status !== undefined && req.body.status !== existing.status ? "risk_status_changed" : "risk_updated",
    description: `Risk "${updated.title}" updated`,
    userId: ctx.userId,
    entityId: id,
    entityType: "risk",
    oldValue: diff?.oldValue ?? null,
    newValue: diff?.newValue ?? null,
  });
  res.json(fmt(updated));
});

// DELETE /risks/:id
router.delete("/risks/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!(await canWriteRisk(ctx.role))) { res.status(403).json({ error: "Lead role or above required" }); return; }

  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(risksTable).where(eq(risksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Risk not found" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, existing.projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  await db.delete(risksTable).where(eq(risksTable.id, id));
  await logActivity({ type: "risk_deleted", description: `Risk "${existing.title}" deleted`, userId: ctx.userId, entityId: id, entityType: "risk" });
  res.sendStatus(204);
});

export default router;
