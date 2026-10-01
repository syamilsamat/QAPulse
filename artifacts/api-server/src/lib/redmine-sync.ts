import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  requirementsTable,
  testCasesTable,
  tasksTable,
  redmineSyncStateTable,
  redmineSyncRunsTable,
  requirementRedmineChangesTable,
} from "@workspace/db";
import { refreshDefectStatuses } from "../routes/redmine-defect-bridge";
import { logActivity } from "../routes/_audit";
import { notifyUser } from "../routes/_notify";
import { logger } from "./logger";
import { AUTO_APPLY_STATES, diffRequirement, type ChangeSet, type FieldChange, type SyncField } from "./redmine-sync-diff";

export { diffRequirement, type ChangeSet, type FieldChange, type SyncField };

/**
 * Scheduled Redmine → QM Pulse sync.
 *
 * Redmine stays the source of truth for what it owns; QM Pulse stays the
 * source of truth for its own workflow:
 *   - Defects: status and assignee are refreshed from Redmine (the existing
 *     refreshDefectStatuses, which already protects a newer local assignment).
 *   - Requirements: title, description, priority and tracker follow Redmine.
 *     A requirement still in draft (or returned) takes the change straight
 *     away; one that is in review or approved is NOT overwritten — the change
 *     is recorded for a person to accept or dismiss, because silently
 *     rewriting reviewed text would invalidate the review.
 *
 * Runs as a background job on the API server, guarded by a database lock so
 * only one instance syncs at a time.
 */

export const STATE_ID = 1;
const LOCK_STALE_MS = 30 * 60 * 1000; // a run older than this is presumed dead
const CURSOR_OVERLAP_MS = 5 * 60 * 1000; // re-check a little before the last success
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;
const ISSUE_BATCH = 90; // Redmine returns at most 100 per page


const redmineBase = () => (process.env.REDMINE_URL ?? "https://redmine.bestinet.my").replace(/\/$/, "");

async function redmineGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${redmineBase()}${path}`, {
    headers: { "Content-Type": "application/json", "X-Redmine-API-Key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
}

// ── service key ───────────────────────────────────────────────────────────
// A background job has no signed-in user, so it needs its own Redmine key:
// the REDMINE_API_KEY environment variable first, otherwise the Redmine key
// saved on an administrator's account.
export async function resolveServiceApiKey(): Promise<{ key: string; source: "env" | "admin" | "none" }> {
  const env = process.env.REDMINE_API_KEY?.trim();
  if (env) return { key: env, source: "env" };
  const admins = await db
    .select({ key: usersTable.redmineApiKey })
    .from(usersTable)
    .where(and(eq(usersTable.role, "admin"), isNotNull(usersTable.redmineApiKey), eq(usersTable.isActive, true)))
    .orderBy(usersTable.id);
  const found = admins.find((a) => a.key?.trim());
  return found ? { key: found.key!.trim(), source: "admin" } : { key: "", source: "none" };
}

// ── state ─────────────────────────────────────────────────────────────────
export async function getSyncState() {
  await db.insert(redmineSyncStateTable).values({ id: STATE_ID }).onConflictDoNothing();
  const [state] = await db.select().from(redmineSyncStateTable).where(eq(redmineSyncStateTable.id, STATE_ID));
  return state;
}


// Writes accepted/auto-applied Redmine changes to a requirement. A description
// change re-opens review on the requirement's test cases and tasks, exactly as
// editing the description in QM Pulse does (CR023p4).
export async function applyRequirementChanges(
  requirementId: number,
  changes: ChangeSet,
  actorId: number | null,
  origin: string,
): Promise<void> {
  const set: Record<string, string> = {};
  for (const [field, c] of Object.entries(changes) as [SyncField, FieldChange][]) set[field] = c.to;
  if (Object.keys(set).length === 0) return;

  const [updated] = await db.update(requirementsTable).set(set as any).where(eq(requirementsTable.id, requirementId)).returning();
  if (!updated) return;

  if (changes.description) {
    const now = new Date();
    await db.update(testCasesTable).set({ requirementRevisedAt: now }).where(eq(testCasesTable.requirementId, requirementId));
    await db.update(tasksTable).set({ requirementRevisedAt: now }).where(eq(tasksTable.requirementId, requirementId));
  }

  await logActivity({
    type: "requirement_updated",
    description: `Requirement "${updated.title}" updated from Redmine (${origin}): ${Object.keys(changes).join(", ")}`,
    userId: actorId,
    entityId: requirementId,
    entityType: "requirement",
    oldValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v!.from])),
    newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v!.to])),
  });
}

// ── requirements pass ─────────────────────────────────────────────────────
async function syncRequirements(
  apiKey: string,
  since: Date | null,
): Promise<{ checked: number; updated: number; flagged: number; error?: string }> {
  const rows = await db
    .select({
      id: requirementsTable.id,
      title: requirementsTable.title,
      description: requirementsTable.description,
      priority: requirementsTable.priority,
      tracker: requirementsTable.tracker,
      reviewStatus: requirementsTable.reviewStatus,
      redmineTicketId: requirementsTable.redmineTicketId,
      createdBy: requirementsTable.createdBy,
      assigneeId: requirementsTable.assigneeId,
      updatedAt: requirementsTable.updatedAt,
    })
    .from(requirementsTable)
    .where(isNotNull(requirementsTable.redmineTicketId));

  let checked = 0;
  let updated = 0;
  let flagged = 0;
  let firstError: string | undefined;
  const pendingIds = new Set(
    (await db.select({ id: requirementRedmineChangesTable.requirementId }).from(requirementRedmineChangesTable).where(eq(requirementRedmineChangesTable.status, "pending"))).map((r) => r.id),
  );

  for (let i = 0; i < rows.length; i += ISSUE_BATCH) {
    const chunk = rows.slice(i, i + ISSUE_BATCH).filter((r) => /^\d+$/.test(r.redmineTicketId ?? ""));
    if (chunk.length === 0) continue;
    const ids = chunk.map((r) => r.redmineTicketId).join(",");
    const sinceParam = since ? `&updated_on=${encodeURIComponent(`>=${since.toISOString()}`)}` : "";
    try {
      const res = await redmineGet(`/issues.json?issue_id=${ids}&status_id=*&limit=100${sinceParam}`, apiKey);
      if (!res.ok) {
        firstError ??= res.status === 401 || res.status === 403
          ? "Redmine rejected the service key for requirements"
          : `Redmine returned ${res.status}`;
        continue;
      }
      const data: any = await res.json();
      // An incomplete page must never be read as "nothing changed".
      if (!Array.isArray(data?.issues) || (data.total_count != null && data.total_count > data.issues.length)) {
        firstError ??= "Incomplete Redmine response";
        continue;
      }

      for (const issue of data.issues) {
        const local = chunk.find((r) => r.redmineTicketId === String(issue.id));
        if (!local) continue;
        checked++;
        const changes = diffRequirement(local, issue);
        if (Object.keys(changes).length === 0) {
          // Redmine now matches QM Pulse again (the change was reverted), so
          // a flag raised earlier no longer describes anything.
          if (pendingIds.has(local.id)) {
            await db.update(requirementRedmineChangesTable)
              .set({ status: "dismissed", resolvedAt: new Date() })
              .where(and(eq(requirementRedmineChangesTable.requirementId, local.id), eq(requirementRedmineChangesTable.status, "pending")));
            pendingIds.delete(local.id);
          }
          continue;
        }

        // Auto-apply only when the requirement is still a draft AND Redmine was
        // edited after the last local edit. If someone changed it in QM Pulse
        // more recently, overwriting it with Redmine's older text would lose
        // their work, so that case is flagged for a person like a reviewed one.
        const redmineEditedAt = issue.updated_on ? new Date(issue.updated_on) : null;
        const localIsNewer = !!local.updatedAt && (!redmineEditedAt || local.updatedAt > redmineEditedAt);
        if (AUTO_APPLY_STATES.includes(local.reviewStatus) && !localIsNewer) {
          await applyRequirementChanges(local.id, changes, null, "scheduled sync");
          updated++;
          // Anything previously flagged is now moot for these fields.
          await db.update(requirementRedmineChangesTable)
            .set({ status: "dismissed", resolvedAt: new Date() })
            .where(and(eq(requirementRedmineChangesTable.requirementId, local.id), eq(requirementRedmineChangesTable.status, "pending")));
        } else {
          const isNew = await flagChange(local.id, String(issue.id), changes);
          if (isNew) {
            flagged++;
            const label = `"${local.title}"`;
            for (const uid of new Set([local.createdBy, local.assigneeId].filter((u): u is number => u != null))) {
              await notifyUser(
                uid,
                "Redmine changed a requirement",
                `${label} was changed in Redmine (${Object.keys(changes).join(", ")}). Review the change before it is applied.`,
                "requirement_redmine_change",
                "requirement",
                local.id,
                null,
              ).catch(() => {});
            }
          }
        }
      }
    } catch (err: any) {
      firstError ??= err?.message ?? "Could not reach Redmine";
    }
  }
  return { checked, updated, flagged, ...(firstError ? { error: firstError } : {}) };
}

// Records (or refreshes) the single pending change for a requirement. Returns
// true only when this is news — a new pending row, or a different change from
// the one already waiting — so people are not re-notified every 15 minutes.
async function flagChange(requirementId: number, ticketId: string, changes: ChangeSet): Promise<boolean> {
  const payload = JSON.stringify(changes);
  const [pending] = await db
    .select()
    .from(requirementRedmineChangesTable)
    .where(and(eq(requirementRedmineChangesTable.requirementId, requirementId), eq(requirementRedmineChangesTable.status, "pending")))
    .orderBy(desc(requirementRedmineChangesTable.id))
    .limit(1);
  // A person already chose to keep QM Pulse's text for exactly this difference;
  // do not ask again every run. A *different* Redmine edit has a different
  // payload and is flagged normally.
  const [dismissed] = await db
    .select({ id: requirementRedmineChangesTable.id })
    .from(requirementRedmineChangesTable)
    .where(and(
      eq(requirementRedmineChangesTable.requirementId, requirementId),
      eq(requirementRedmineChangesTable.status, "dismissed"),
      eq(requirementRedmineChangesTable.changes, payload),
      isNotNull(requirementRedmineChangesTable.resolvedBy),
    ))
    .limit(1);
  if (dismissed) return false;
  if (pending && pending.changes === payload) return false;
  if (pending) {
    await db.update(requirementRedmineChangesTable).set({ changes: payload, detectedAt: new Date() }).where(eq(requirementRedmineChangesTable.id, pending.id));
    return true;
  }
  await db.insert(requirementRedmineChangesTable).values({ requirementId, redmineTicketId: ticketId, changes: payload });
  return true;
}

// ── the run ───────────────────────────────────────────────────────────────
export type RunTrigger = "schedule" | "manual" | "nightly";
export type RunResult =
  | { skipped: true; reason: string }
  | { skipped: false; runId: number; status: "ok" | "partial" | "error"; error?: string };

export async function runRedmineSync(trigger: RunTrigger, actorId: number | null = null): Promise<RunResult> {
  const state = await getSyncState();

  // Take the lock atomically: only one run proceeds if two start together.
  const now = new Date();
  const [locked] = await db
    .update(redmineSyncStateTable)
    .set({ runningSince: now })
    .where(and(
      eq(redmineSyncStateTable.id, STATE_ID),
      sql`(${redmineSyncStateTable.runningSince} is null or ${redmineSyncStateTable.runningSince} < ${new Date(now.getTime() - LOCK_STALE_MS)})`,
    ))
    .returning();
  if (!locked) return { skipped: true, reason: "A sync is already running" };

  const full = trigger === "nightly" || !state.lastFullAt || now.getTime() - state.lastFullAt.getTime() > FULL_EVERY_MS || !state.lastSuccessAt;
  const mode = full ? "full" : "incremental";
  const [run] = await db.insert(redmineSyncRunsTable).values({ trigger, mode }).returning();

  let status: "ok" | "partial" | "error" = "ok";
  let error: string | undefined;
  const counts = { defectsRefreshed: 0, defectsFailed: 0, requirementsChecked: 0, requirementsUpdated: 0, requirementsFlagged: 0 };

  try {
    const { key, source } = await resolveServiceApiKey();
    if (!key) {
      status = "error";
      error = "No Redmine service key. Set REDMINE_API_KEY, or save a Redmine API key on an administrator account.";
    } else {
      logger.info({ trigger, mode, keySource: source }, "Redmine sync starting");

      const defects = await refreshDefectStatuses(key);
      counts.defectsRefreshed = defects.refreshed;
      counts.defectsFailed = defects.failed;
      if (defects.error) { status = "partial"; error = defects.error; }

      const since = full ? null : new Date((state.lastSuccessAt as Date).getTime() - CURSOR_OVERLAP_MS);
      const reqs = await syncRequirements(key, since);
      counts.requirementsChecked = reqs.checked;
      counts.requirementsUpdated = reqs.updated;
      counts.requirementsFlagged = reqs.flagged;
      if (reqs.error) { status = status === "ok" ? "partial" : status; error = error ? `${error} ${reqs.error}` : reqs.error; }

      // Redmine was reachable but nothing at all could be read: treat as a failure.
      if (defects.error && reqs.error && counts.defectsRefreshed === 0 && counts.requirementsChecked === 0) status = "error";
    }
  } catch (err: any) {
    status = "error";
    error = err?.message ?? "Sync failed";
    logger.error({ err }, "Redmine sync crashed");
  }

  const finished = new Date();
  await db.update(redmineSyncRunsTable).set({ status, finishedAt: finished, error: error ?? null, ...counts }).where(eq(redmineSyncRunsTable.id, run.id));

  const failures = status === "error" ? state.consecutiveFailures + 1 : 0;
  await db.update(redmineSyncStateTable).set({
    runningSince: null,
    lastRunAt: finished,
    lastStatus: status,
    lastError: error ?? null,
    consecutiveFailures: failures,
    // The cursor only advances on a run that actually read Redmine, so a
    // failed run is retried over the same window instead of skipping it.
    ...(status !== "error" ? { lastSuccessAt: finished, ...(full ? { lastFullAt: finished } : {}) } : {}),
  }).where(eq(redmineSyncStateTable.id, STATE_ID));

  // Tell administrators once when it has failed three runs in a row.
  if (status === "error" && failures === 3) {
    const admins = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, ["admin"]));
    for (const a of admins) {
      await notifyUser(a.id, "Redmine sync is failing", `The scheduled Redmine sync has failed 3 times in a row: ${error ?? "unknown error"}`, "redmine_sync_failed", "redmine_sync", STATE_ID, actorId).catch(() => {});
    }
  }

  return { skipped: false, runId: run.id, status, ...(error ? { error } : {}) };
}

// Pending changes for a requirement, newest first.
export async function pendingChangesFor(requirementIds: number[]) {
  if (requirementIds.length === 0) return [];
  return db
    .select()
    .from(requirementRedmineChangesTable)
    .where(and(inArray(requirementRedmineChangesTable.requirementId, requirementIds), eq(requirementRedmineChangesTable.status, "pending")))
    .orderBy(desc(requirementRedmineChangesTable.id));
}
