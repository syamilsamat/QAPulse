import { eq, inArray, isNotNull } from "drizzle-orm";
import { db, defectsTable, trackersTable, type Defect } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// CR019/CR020 Redmine defect bridge — DELIBERATELY the only file that knows
// how defects map to Redmine. At CR021 cutover this module is deleted and the
// defects tables/pages/metrics continue unchanged (see CHANGE_REQUESTS.md).
// ─────────────────────────────────────────────────────────────────────────────

function getBaseUrl() {
  return process.env.REDMINE_URL ?? "https://redmine.bestinet.my";
}

async function redmineFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (apiKey) headers["X-Redmine-API-Key"] = apiKey;
  return fetch(`${getBaseUrl()}${path}`, { ...options, headers });
}

// Redmine priority name → QAPulse severity
export function severityFromPriority(priority?: string | null): string {
  const p = (priority ?? "").toLowerCase();
  if (p.includes("immediate") || p.includes("urgent")) return "critical";
  if (p.includes("high")) return "high";
  if (p.includes("low")) return "low";
  return "medium";
}

async function findDefectTrackerId(preferredName?: string): Promise<number | null> {
  const trackers = await db.select().from(trackersTable);
  if (trackers.length === 0) return null;
  const wanted = (preferredName ?? "").toLowerCase().trim();
  const byName = (name: string) => trackers.find((t: any) => t.name.toLowerCase() === name);
  if (wanted) {
    const match = trackers.find((t: any) => t.name.toLowerCase() === wanted);
    if (match) return match.redmineId;
  }
  return (byName("defect") ?? byName("bug") ?? trackers[0]).redmineId;
}

// Resolve the Redmine project for a new defect: reuse the project of the
// execution file's Redmine ticket when available (defects raised from a run
// belong where the run's ticket lives).
export async function redmineProjectFromIssue(issueId: string, apiKey: string): Promise<number | null> {
  try {
    const res = await redmineFetch(`/issues/${issueId}.json`, apiKey);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.issue?.project?.id ?? null;
  } catch {
    return null;
  }
}

export interface PushResult {
  ok: boolean;
  redmineId?: string;
  error?: string;
}

// Write-through push: create the Redmine issue for a QAPulse defect.
// Idempotent — a defect that already carries a redmineId is never re-pushed.
export async function pushDefectToRedmine(
  defect: Defect,
  apiKey: string,
  opts: { redmineProjectId?: number | null; sourceIssueId?: string | null; trackerName?: string } = {},
): Promise<PushResult> {
  if (defect.redmineId) return { ok: true, redmineId: defect.redmineId };

  let projectId = opts.redmineProjectId ?? null;
  if (!projectId && opts.sourceIssueId) {
    projectId = await redmineProjectFromIssue(opts.sourceIssueId, apiKey);
  }
  if (!projectId) {
    return { ok: false, error: "No Redmine project could be resolved for this defect" };
  }

  const trackerId = await findDefectTrackerId(opts.trackerName);

  const descriptionParts = [
    defect.description?.trim(),
    defect.stepsToReproduce ? `*Steps to reproduce:*\n${defect.stepsToReproduce}` : null,
    defect.expectedResult ? `*Expected:*\n${defect.expectedResult}` : null,
    defect.actualResult ? `*Actual:*\n${defect.actualResult}` : null,
    `_Severity: ${defect.severity} · Found in: ${defect.foundIn} · ${defect.defectCode ?? `QAPulse defect #${defect.id}`} (created via QAPulse)_`,
  ].filter(Boolean);

  try {
    const res = await redmineFetch(`/issues.json`, apiKey, {
      method: "POST",
      body: JSON.stringify({
        issue: {
          project_id: projectId,
          ...(trackerId ? { tracker_id: trackerId } : {}),
          subject: defect.title,
          description: descriptionParts.join("\n\n"),
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Redmine ${res.status}: ${body.slice(0, 300)}` };
    }
    const data: any = await res.json();
    const redmineId = data?.issue?.id != null ? String(data.issue.id) : undefined;
    if (!redmineId) return { ok: false, error: "Redmine returned no issue id" };
    return { ok: true, redmineId };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Redmine unreachable" };
  }
}

// Refresh cached lifecycle fields (status, assignee) from Redmine for every
// defect that has a Redmine id. One-way read; QAPulse never writes status back.
export async function refreshDefectStatuses(apiKey: string): Promise<{ refreshed: number }> {
  const rows = await db
    .select({ id: defectsTable.id, redmineId: defectsTable.redmineId })
    .from(defectsTable)
    .where(isNotNull(defectsTable.redmineId));
  if (rows.length === 0) return { refreshed: 0 };

  let refreshed = 0;
  for (let i = 0; i < rows.length; i += 90) {
    const chunk = rows.slice(i, i + 90);
    const ids = chunk.map((r: any) => r.redmineId).join(",");
    try {
      const res = await redmineFetch(`/issues.json?issue_id=${ids}&status_id=*&limit=100`, apiKey);
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const issue of data?.issues ?? []) {
        const local = chunk.find((r: any) => r.redmineId === String(issue.id));
        if (!local) continue;
        await db
          .update(defectsTable)
          .set({
            status: issue.status?.name ?? "Unknown",
            assigneeName: issue.assigned_to?.name ?? null,
            statusSyncedAt: new Date(),
          })
          .where(eq(defectsTable.id, local.id));
        refreshed++;
      }
    } catch {
      // best-effort: stale cache is acceptable, next refresh catches up
    }
  }
  return { refreshed };
}

// CR020 pull sync: import production incidents from the chosen Redmine tracker
// as source='production' defects. Insert new, update cached fields on existing.
export async function pullProductionDefects(
  apiKey: string,
  trackerName: string,
): Promise<{ imported: number; updated: number; error?: string }> {
  const trackers = await db.select().from(trackersTable);
  const tracker = trackers.find((t: any) => t.name.toLowerCase() === trackerName.toLowerCase());
  if (!tracker) return { imported: 0, updated: 0, error: `Tracker "${trackerName}" not found — sync trackers first` };

  let issues: any[] = [];
  try {
    const res = await redmineFetch(
      `/issues.json?tracker_id=${tracker.redmineId}&status_id=*&limit=100&sort=updated_on:desc`,
      apiKey,
    );
    if (!res.ok) return { imported: 0, updated: 0, error: `Redmine ${res.status}` };
    const data: any = await res.json();
    issues = data?.issues ?? [];
  } catch (err: any) {
    return { imported: 0, updated: 0, error: err?.message ?? "Redmine unreachable" };
  }

  if (issues.length === 0) return { imported: 0, updated: 0 };

  const redmineIds = issues.map((i) => String(i.id));
  const existing = await db
    .select({ id: defectsTable.id, redmineId: defectsTable.redmineId })
    .from(defectsTable)
    .where(inArray(defectsTable.redmineId, redmineIds));
  const existingByRedmine = new Map<string | null, number>(existing.map((e: any) => [e.redmineId, e.id]));

  let imported = 0;
  let updated = 0;
  for (const issue of issues) {
    const rid = String(issue.id);
    const cached = {
      status: issue.status?.name ?? "Unknown",
      assigneeName: issue.assigned_to?.name ?? null,
      statusSyncedAt: new Date(),
    };
    const localId = existingByRedmine.get(rid);
    if (localId) {
      await db
        .update(defectsTable)
        .set({ ...cached, title: issue.subject ?? "Untitled" })
        .where(eq(defectsTable.id, localId));
      updated++;
    } else {
      const [row] = await db
        .insert(defectsTable)
        .values({
          title: issue.subject ?? "Untitled",
          description: issue.description ?? null,
          severity: severityFromPriority(issue.priority?.name),
          module: issue.category?.name ?? null,
          redmineId: rid,
          syncStatus: "synced",
          source: "production",
          foundIn: "Production",
          ...cached,
        })
        .returning();
      await db
        .update(defectsTable)
        .set({ defectCode: `DEF-P${String(row.id).padStart(4, "0")}` })
        .where(eq(defectsTable.id, row.id));
      imported++;
    }
  }
  return { imported, updated };
}
