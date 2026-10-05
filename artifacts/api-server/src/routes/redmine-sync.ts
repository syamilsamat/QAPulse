import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  requirementsTable,
  redmineSyncStateTable,
  redmineSyncRunsTable,
  requirementRedmineChangesTable,
} from "@workspace/db";
import { getAuthContext, canAccessProject, getRoleTierRank } from "../middleware/access";
import { logActivity } from "./_audit";
import {
  STATE_ID,
  getSyncState,
  runRedmineSync,
  applyRequirementChanges,
  resolveServiceApiKey,
  type ChangeSet,
} from "../lib/redmine-sync";

const router: IRouter = Router();

const ALLOWED_INTERVALS = [5, 15, 30, 60, 120, 240];
const LOCK_STALE_MS = 30 * 60 * 1000;

const isAdmin = (role: string) => role === "admin" || role === "cto";

function requireAdmin(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!isAdmin(ctx.role)) { res.status(403).json({ error: "Only an administrator can manage Redmine sync" }); return null; }
  return ctx;
}

// GET /redmine-sync/status — freshness for everyone (drives the "synced X ago"
// label); the error text and key source are for administrators only.
router.get("/redmine-sync/status", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const s = await getSyncState();
    const running = !!s.runningSince && Date.now() - s.runningSince.getTime() < LOCK_STALE_MS;
    const base = {
      enabled: s.enabled,
      intervalMinutes: s.intervalMinutes,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null,
      lastStatus: s.lastStatus,
      consecutiveFailures: s.consecutiveFailures,
      running,
    };
    if (!isAdmin(ctx.role)) { res.json(base); return; }
    const { source } = await resolveServiceApiKey();
    res.json({ ...base, lastError: s.lastError, keySource: source, allowedIntervals: ALLOWED_INTERVALS });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load sync status" });
  }
});

// GET /redmine-sync/runs — recent run history.
router.get("/redmine-sync/runs", async (req, res): Promise<void> => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  try {
    const rows = await db.select().from(redmineSyncRunsTable).orderBy(desc(redmineSyncRunsTable.startedAt), desc(redmineSyncRunsTable.id)).limit(30);
    res.json(rows.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load sync runs" });
  }
});

// PUT /redmine-sync/settings — on/off and interval.
router.put("/redmine-sync/settings", async (req, res): Promise<void> => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;
  try {
    const cur = await getSyncState();
    const body = req.body ?? {};
    const next: { enabled?: boolean; intervalMinutes?: number } = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") { res.status(400).json({ error: "enabled must be true or false" }); return; }
      next.enabled = body.enabled;
    }
    if (body.intervalMinutes !== undefined) {
      const n = Number(body.intervalMinutes);
      if (!ALLOWED_INTERVALS.includes(n)) { res.status(400).json({ error: `intervalMinutes must be one of ${ALLOWED_INTERVALS.join(", ")}` }); return; }
      next.intervalMinutes = n;
    }
    await db.update(redmineSyncStateTable).set({ ...next, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(redmineSyncStateTable.id, STATE_ID));
    await logActivity({
      type: "redmine_sync_settings_updated",
      description: `Redmine sync settings changed${next.enabled !== undefined && next.enabled !== cur.enabled ? ` — sync turned ${next.enabled ? "on" : "off"}` : ""}${next.intervalMinutes ? ` — every ${next.intervalMinutes} min` : ""}`,
      userId: ctx.userId,
      entityId: STATE_ID,
      entityType: "redmine_sync",
      oldValue: { enabled: cur.enabled, intervalMinutes: cur.intervalMinutes },
      newValue: next,
    });
    res.json({ ...(await getSyncState()) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update sync settings" });
  }
});

// POST /redmine-sync/run — "Sync now". Starts in the background and returns
// straight away; the status endpoint reports progress.
router.post("/redmine-sync/run", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(ctx.role) && (await getRoleTierRank(ctx.role)) < 3) {
    res.status(403).json({ error: "Manager role or above required" }); return;
  }
  const s = await getSyncState();
  if (s.runningSince && Date.now() - s.runningSince.getTime() < LOCK_STALE_MS) {
    res.status(409).json({ error: "A sync is already running" }); return;
  }
  void runRedmineSync("manual", ctx.userId).catch((err) => console.error("[redmine-sync] manual run failed", err));
  res.status(202).json({ started: true });
});

// ── flagged requirement changes ───────────────────────────────────────────

async function loadChangeForUser(req: any, res: any) {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid change ID" }); return null; }
  const [change] = await db.select().from(requirementRedmineChangesTable).where(eq(requirementRedmineChangesTable.id, id));
  if (!change) { res.status(404).json({ error: "Change not found" }); return null; }
  const [reqRow] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, change.requirementId));
  if (!reqRow) { res.status(404).json({ error: "Requirement not found" }); return null; }
  if (reqRow.projectId != null && !(await canAccessProject(ctx.userId, ctx.role, reqRow.projectId))) {
    res.status(403).json({ error: "Access denied to this project" }); return null;
  }
  // The author, the assignee, or a lead can decide what happens to the text.
  const isOwner = reqRow.createdBy === ctx.userId || reqRow.assigneeId === ctx.userId;
  if (!isOwner && !isAdmin(ctx.role) && (await getRoleTierRank(ctx.role)) < 2) {
    res.status(403).json({ error: "Only the requirement's author, assignee or a lead can resolve this" }); return null;
  }
  return { ctx, change, requirement: reqRow };
}

// GET /redmine-sync/changes?requirementId=N — pending Redmine changes.
router.get("/redmine-sync/changes", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const requirementId = parseInt(String(req.query.requirementId ?? ""), 10);
  if (Number.isNaN(requirementId)) { res.status(400).json({ error: "requirementId is required" }); return; }
  try {
    const [reqRow] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
    if (!reqRow) { res.status(404).json({ error: "Requirement not found" }); return; }
    if (reqRow.projectId != null && !(await canAccessProject(ctx.userId, ctx.role, reqRow.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }
    const rows = await db
      .select()
      .from(requirementRedmineChangesTable)
      .where(and(eq(requirementRedmineChangesTable.requirementId, requirementId), eq(requirementRedmineChangesTable.status, "pending")))
      .orderBy(desc(requirementRedmineChangesTable.id));
    res.json(rows.map((r) => ({
      id: r.id,
      requirementId: r.requirementId,
      redmineTicketId: r.redmineTicketId,
      changes: JSON.parse(r.changes) as ChangeSet,
      detectedAt: r.detectedAt.toISOString(),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load Redmine changes" });
  }
});

router.post("/redmine-sync/changes/:id/accept", async (req, res): Promise<void> => {
  try {
    const loaded = await loadChangeForUser(req, res);
    if (!loaded) return;
    const { ctx, change } = loaded;
    if (change.status !== "pending") { res.status(409).json({ error: "This change was already resolved" }); return; }
    await applyRequirementChanges(change.requirementId, JSON.parse(change.changes) as ChangeSet, ctx.userId, "accepted by a user");
    await db.update(requirementRedmineChangesTable)
      .set({ status: "accepted", resolvedBy: ctx.userId, resolvedAt: new Date() })
      .where(eq(requirementRedmineChangesTable.id, change.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to apply the Redmine change" });
  }
});

router.post("/redmine-sync/changes/:id/dismiss", async (req, res): Promise<void> => {
  try {
    const loaded = await loadChangeForUser(req, res);
    if (!loaded) return;
    const { ctx, change } = loaded;
    if (change.status !== "pending") { res.status(409).json({ error: "This change was already resolved" }); return; }
    await db.update(requirementRedmineChangesTable)
      .set({ status: "dismissed", resolvedBy: ctx.userId, resolvedAt: new Date() })
      .where(eq(requirementRedmineChangesTable.id, change.id));
    await logActivity({
      type: "requirement_redmine_change_dismissed",
      description: `Redmine change to requirement "${loaded.requirement.title}" dismissed (QM Pulse text kept)`,
      userId: ctx.userId,
      entityId: change.requirementId,
      entityType: "requirement",
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to dismiss the Redmine change" });
  }
});

export default router;
