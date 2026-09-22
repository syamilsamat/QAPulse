import { Router, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, defectsTable, defectHistoryTable, usersTable } from "@workspace/db";
import { getAuthContext, canAccessProject, getModuleScope, type AuthContext } from "../middleware/access";
import { fetchHistory, historyRead, HistoryError, redmineHistoryBaseUrl } from "./redmine-history";

const router = Router();
type HistoryRow = typeof defectHistoryTable.$inferSelect;
type DefectRow = typeof defectsTable.$inferSelect;

async function access(ctx: AuthContext, defect: DefectRow): Promise<boolean> {
  if (defect.projectId == null) return true;
  if (!await canAccessProject(ctx.userId, ctx.role, defect.projectId)) return false;
  const scope = await getModuleScope(ctx.userId, ctx.role, defect.projectId);
  return !scope.restricted || (defect.module != null && scope.moduleNames.includes(defect.module));
}
async function credentials(ctx: AuthContext) {
  const [user] = await db.select({ key: usersTable.redmineApiKey }).from(usersTable).where(eq(usersTable.id, ctx.userId));
  const key = user?.key?.trim();
  // A service account could reveal journals the current user cannot read.
  if (!key) throw new HistoryError(428, "Add your personal Redmine API key in Settings to view history.");
  return { key, fingerprint: createHash("sha256").update(`${redmineHistoryBaseUrl()}\0${key}`).digest("hex") };
}
async function linkedDefect(req: Request, ctx: AuthContext) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HistoryError(400, "Invalid defect ID");
  const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
  if (!defect || !await access(ctx, defect)) throw new HistoryError(404, "Defect not found");
  if (!defect.redmineId || !/^\d+$/.test(defect.redmineId)) throw new HistoryError(409, "This defect is not linked to Redmine.");
  return defect as DefectRow & { redmineId: string };
}
function ownRow(defectId: number, userId: number) {
  return and(eq(defectHistoryTable.defectId, defectId), eq(defectHistoryTable.userId, userId));
}
export function usableHistory(row: HistoryRow | undefined, redmineId: string, fingerprint: string) {
  return row?.redmineId === redmineId && row.credentialFingerprint === fingerprint ? row : undefined;
}
export function historyResponse(row: HistoryRow, stale: boolean, error?: string) {
  return {
    entries: row.entries, syncedAt: row.syncedAt.toISOString(), snapshotId: row.snapshotId,
    unreadIds: row.seenUpdatedAt ? row.entries.filter(e => e.id > row.seenJournalId).map(e => e.id) : [],
    issueUpdatedAt: row.issueUpdatedAt.toISOString(), stale, error,
    issueUrl: `${redmineHistoryBaseUrl()}/issues/${encodeURIComponent(row.redmineId)}`,
  };
}
async function handle(req: Request, res: Response, action: (ctx: AuthContext) => Promise<void>) {
  res.setHeader("Cache-Control", "private, no-store");
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  try { await action(ctx); }
  catch (err) {
    const known = err instanceof HistoryError;
    if (!known) console.error("[defect history]", err instanceof Error ? err.message : "Unexpected error");
    res.status(known ? err.status : 500).json({ error: known ? err.message : "Could not load defect history. Please try again." });
  }
}

router.get("/defects/:id/history", (req, res) => handle(req, res, async ctx => {
  const defect = await linkedDefect(req, ctx);
  const { key, fingerprint } = await credentials(ctx);
  const [stored] = await db.select().from(defectHistoryTable).where(ownRow(defect.id, ctx.userId));
  const cached = usableHistory(stored, defect.redmineId, fingerprint);
  const startedAt = new Date();
  let fresh: Awaited<ReturnType<typeof fetchHistory>>;
  try { fresh = await fetchHistory(defect.redmineId, key); }
  catch (err) {
    if (err instanceof HistoryError && [403, 404].includes(err.status)) {
      await db.delete(defectHistoryTable).where(ownRow(defect.id, ctx.userId));
      throw err;
    }
    if (cached && err instanceof HistoryError && err.status === 502) {
      res.json(historyResponse(cached, true, err.message)); return;
    }
    throw err;
  }
  const values = { defectId: defect.id, userId: ctx.userId, redmineId: defect.redmineId,
    credentialFingerprint: fingerprint, snapshotId: randomUUID(), ...fresh, syncedAt: startedAt };
  const sameIdentity = sql`${defectHistoryTable.credentialFingerprint} = ${fingerprint} AND ${defectHistoryTable.redmineId} = ${defect.redmineId}`;
  const [saved] = await db.insert(defectHistoryTable).values(values).onConflictDoUpdate({
    target: [defectHistoryTable.defectId, defectHistoryTable.userId],
    set: { ...values,
      seenJournalId: sql`CASE WHEN ${sameIdentity} THEN ${defectHistoryTable.seenJournalId} ELSE 0 END`,
      seenUpdatedAt: sql`CASE WHEN ${sameIdentity} THEN ${defectHistoryTable.seenUpdatedAt} ELSE NULL END`,
    },
    setWhere: sql`${defectHistoryTable.syncedAt} <= ${startedAt}`,
  }).returning();
  // An older in-flight request must not overwrite or mark a newer snapshot read.
  const row = saved ?? (await db.select().from(defectHistoryTable).where(ownRow(defect.id, ctx.userId)))[0];
  const safe = usableHistory(row, defect.redmineId, fingerprint);
  if (!safe) throw new HistoryError(409, "History changed while loading. Please refresh.");
  res.json(historyResponse(safe, false));
}));

router.post("/defects/:id/history/seen", (req, res) => handle(req, res, async ctx => {
  const defect = await linkedDefect(req, ctx);
  const { fingerprint } = await credentials(ctx);
  if (typeof req.body?.snapshotId !== "string" || req.body.snapshotId.length > 64) throw new HistoryError(400, "Invalid history snapshot");
  const [row] = await db.select().from(defectHistoryTable).where(ownRow(defect.id, ctx.userId));
  const safe = usableHistory(row, defect.redmineId, fingerprint);
  if (!safe || safe.snapshotId !== req.body.snapshotId) throw new HistoryError(409, "History changed. Refresh before marking it viewed.");
  const latestId = safe.entries.reduce((max, e) => Math.max(max, e.id), 0);
  const saved = await db.update(defectHistoryTable).set({ seenJournalId: latestId, seenUpdatedAt: safe.issueUpdatedAt })
    .where(and(ownRow(defect.id, ctx.userId), eq(defectHistoryTable.snapshotId, safe.snapshotId))).returning({ id: defectHistoryTable.defectId });
  if (!saved.length) throw new HistoryError(409, "History changed. Please refresh.");
  res.json({ ok: true });
}));

// Lightweight per-user checks for visible rows; full journals load only on opening History.
router.post("/defects/history/summaries", (req, res) => handle(req, res, async ctx => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length > 90 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw new HistoryError(400, "Provide up to 90 defect IDs");
  }
  if (!ids.length) { res.json({ items: [] }); return; }
  const { key, fingerprint } = await credentials(ctx);
  const rows = await db.select().from(defectsTable).where(inArray(defectsTable.id, ids));
  const visible: Array<DefectRow & { redmineId: string }> = [];
  for (const row of rows) if (row.redmineId && /^\d+$/.test(row.redmineId) && await access(ctx, row)) visible.push(row as DefectRow & { redmineId: string });
  if (!visible.length) { res.json({ items: [] }); return; }
  const data = await historyRead(`/issues.json?issue_id=${visible.map(d => d.redmineId).join(",")}&status_id=*&limit=100`, key);
  if (!Array.isArray(data.issues)) throw new HistoryError(502, "Redmine returned an invalid response.");
  const cached = await db.select().from(defectHistoryTable).where(and(eq(defectHistoryTable.userId, ctx.userId), inArray(defectHistoryTable.defectId, visible.map(d => d.id))));
  const checkedAt = new Date().toISOString();
  const items = [];
  for (const defect of visible) {
    const issue = data.issues.find((i: any) => String(i.id) === defect.redmineId);
    if (!issue) {
      await db.delete(defectHistoryTable).where(ownRow(defect.id, ctx.userId));
      continue;
    }
    const previous = usableHistory(cached.find(c => c.defectId === defect.id), defect.redmineId, fingerprint);
    const updated = Date.parse(issue.updated_on);
    items.push({ defectId: defect.id, hasUpdates: !!previous?.seenUpdatedAt && Number.isFinite(updated) && updated > previous.seenUpdatedAt.getTime(), checkedAt });
  }
  res.json({ items });
}));
export default router;
