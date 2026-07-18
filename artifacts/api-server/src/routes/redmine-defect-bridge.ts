import { eq, ilike, inArray, isNotNull } from "drizzle-orm";
import { db, defectsTable, trackersTable, redmineStatusesTable, requirementsTable, redmineProjectConfigsTable, usersTable, type Defect } from "@workspace/db";

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

// Tracker routing shared by every import path:
// User Story / Change Request → requirement · Prod Defect → production tab ·
// QA Defect/Bug → QA tab · anything else → Others tab (full details kept)
export function routeForTracker(trackerName: string): "qa" | "production" | "requirement" | "other" {
  const n = (trackerName ?? "").toLowerCase().trim();
  if (n.includes("prod")) return "production";
  if (n.includes("user story") || n.includes("story")) return "requirement";
  if (n.includes("change request") || n === "cr") return "requirement";
  if (n.includes("defect") || n.includes("bug")) return "qa";
  return "other";
}

export function defectCodePrefix(route: string): string {
  if (route === "production") return "DEF-P";
  if (route === "other") return "DEF-O";
  return "DEF-";
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
  opts: {
    redmineProjectId?: number | null;
    sourceIssueId?: string | null;
    trackerName?: string;
    assigneeId?: number | null;
    complexity?: string | null;
    targetedStartDate?: string | null;
    targetedCompletionDate?: string | null;
  } = {},
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

  // Look up custom field IDs from stored project config
  const [config] = await db.select().from(redmineProjectConfigsTable).where(eq(redmineProjectConfigsTable.redmineProjectId, projectId)).catch(() => []);
  const customFields: { id: number; value: string }[] = [];
  if (config?.complexityFieldId && opts.complexity) customFields.push({ id: config.complexityFieldId, value: opts.complexity });
  if (config?.targetedStartDateFieldId && opts.targetedStartDate) customFields.push({ id: config.targetedStartDateFieldId, value: opts.targetedStartDate });
  if (config?.targetedCompletionDateFieldId && opts.targetedCompletionDate) customFields.push({ id: config.targetedCompletionDateFieldId, value: opts.targetedCompletionDate });

  const descriptionParts = [
    defect.description?.trim(),
    defect.stepsToReproduce ? `*Steps to reproduce:*\n${defect.stepsToReproduce}` : null,
    defect.expectedResult ? `*Expected:*\n${defect.expectedResult}` : null,
    defect.actualResult ? `*Actual:*\n${defect.actualResult}` : null,
    `_Severity: ${defect.severity} · Found in: ${defect.foundIn} · ${defect.defectCode ?? `QMPulse defect #${defect.id}`} (created via QMPulse)_`,
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
          ...(opts.assigneeId ? { assigned_to_id: opts.assigneeId } : {}),
          ...(customFields.length ? { custom_fields: customFields } : {}),
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

// Sync the full Redmine status list (/issue_statuses.json) into QAPulse so
// the Defects page can offer the real status options for editing.
export async function syncIssueStatuses(apiKey: string): Promise<{ synced: number; error?: string }> {
  try {
    const res = await redmineFetch(`/issue_statuses.json`, apiKey);
    if (!res.ok) return { synced: 0, error: `Redmine ${res.status}` };
    const data: any = await res.json();
    const statuses: any[] = data?.issue_statuses ?? [];
    for (const s of statuses) {
      await db
        .insert(redmineStatusesTable)
        .values({ redmineId: s.id, name: s.name, isClosed: s.is_closed ? 1 : 0, syncedAt: new Date() })
        .onConflictDoUpdate({
          target: redmineStatusesTable.redmineId,
          set: { name: s.name, isClosed: s.is_closed ? 1 : 0, syncedAt: new Date() },
        });
    }
    return { synced: statuses.length };
  } catch (err: any) {
    return { synced: 0, error: err?.message ?? "Redmine unreachable" };
  }
}

// Status write-through: push a status change made in QAPulse to Redmine.
// The caller only updates the local cache when this succeeds — Redmine stays
// the system of record until CR021.
export async function pushStatusToRedmine(
  redmineIssueId: string,
  statusRedmineId: number,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await redmineFetch(`/issues/${encodeURIComponent(redmineIssueId)}.json`, apiKey, {
      method: "PUT",
      body: JSON.stringify({ issue: { status_id: statusRedmineId } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Redmine ${res.status}: ${body.slice(0, 300) || "status change rejected (check workflow permissions)"}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Redmine unreachable" };
  }
}

// CR030 — QAPulse doesn't store a Redmine user id for its own accounts, so
// pushing a native assignment out requires a best-effort name search against
// Redmine's own user list. Silent miss (no match / Redmine down) just means
// the push doesn't happen this cycle — the native assignment still stands
// locally and the next refresh retries via the same recency comparison.
async function resolveRedmineUserIdByName(name: string, apiKey: string): Promise<number | null> {
  try {
    const res = await redmineFetch(`/users.json?name=${encodeURIComponent(name)}`, apiKey);
    if (!res.ok) return null;
    const data: any = await res.json();
    const users: any[] = data?.users ?? [];
    const exact = users.find(
      (u: any) => `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    // CR050 — only an exact name match is safe. Redmine's ?name= is a
    // substring search, so falling back to users[0] would assign the wrong
    // person (e.g. "Ali" → "Alia Rahman") into Redmine, the system of record.
    return exact?.id ?? null;
  } catch {
    return null;
  }
}

// Push a native (QAPulse) defect assignee to Redmine. Non-fatal on failure —
// callers treat this as best-effort, same as pushDefectToRedmine's philosophy
// of never blocking a QAPulse-side action on Redmine being reachable.
export async function pushAssigneeToRedmine(
  redmineIssueId: string,
  qaPulseUserId: number,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, qaPulseUserId));
    if (!user?.name) return { ok: false, error: "Assignee not found" };
    const redmineUserId = await resolveRedmineUserIdByName(user.name, apiKey);
    if (!redmineUserId) return { ok: false, error: `No matching Redmine user for "${user.name}"` };
    const res = await redmineFetch(`/issues/${encodeURIComponent(redmineIssueId)}.json`, apiKey, {
      method: "PUT",
      body: JSON.stringify({ issue: { assigned_to_id: redmineUserId } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Redmine ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Redmine unreachable" };
  }
}

// Refresh cached lifecycle fields (status, assignee) from Redmine for every
// defect that has a Redmine id. Status stays a one-way read (Redmine is still
// the record until CR021). Assignee is reconciled both ways (CR030): whichever
// side changed more recently wins — Redmine's issue.updated_on vs our own
// assigneeAssignedAt — since native in-app assignment is now a first-class
// QAPulse action, not just a Redmine-side fact QAPulse mirrors.
export async function refreshDefectStatuses(apiKey: string): Promise<{ refreshed: number }> {
  const rows = await db
    .select({
      id: defectsTable.id,
      redmineId: defectsTable.redmineId,
      assigneeId: defectsTable.assigneeId,
      assigneeAssignedAt: defectsTable.assigneeAssignedAt,
    })
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

        const update: Record<string, any> = {
          status: issue.status?.name ?? "Unknown",
          statusSyncedAt: new Date(),
        };

        const redmineUpdatedAt = issue.updated_on ? new Date(issue.updated_on) : null;
        const localIsNewer =
          !!local.assigneeAssignedAt && (!redmineUpdatedAt || local.assigneeAssignedAt > redmineUpdatedAt);

        if (localIsNewer) {
          // Our native assignment is the more recent change — push it instead
          // of letting this read clobber it. Fire-and-forget: the endpoint
          // that made the assignment already reports its own push result.
          if (local.assigneeId) {
            pushAssigneeToRedmine(String(issue.id), local.assigneeId, apiKey).catch(() => {});
          }
        } else if (issue.assigned_to?.name) {
          update.assigneeName = issue.assigned_to.name;
          const [match] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(ilike(usersTable.name, issue.assigned_to.name));
          if (match) {
            update.assigneeId = match.id;
            update.assigneeAssignedAt = redmineUpdatedAt ?? new Date();
          }
        } else {
          update.assigneeName = null;
        }

        await db.update(defectsTable).set(update).where(eq(defectsTable.id, local.id));
        refreshed++;
      }
    } catch {
      // best-effort: stale cache is acceptable, next refresh catches up
    }
  }
  return { refreshed };
}

// Sync-from-Redmine dialog: walk the WHOLE subtree under a parent ticket
// (children, grandchildren, …) breadth-first, so parents always come before
// their children in the returned list. Read-only. Caps: depth 5, ~300 issues.
export async function fetchIssueTree(
  apiKey: string,
  rootRedmineId: string,
): Promise<{ issues: { issue: any; parentRedmineId: string }[]; error?: string }> {
  const collected: { issue: any; parentRedmineId: string }[] = [];
  const seen = new Set<string>([String(rootRedmineId)]);
  let frontier = [String(rootRedmineId)];

  try {
    for (let depth = 0; depth < 5 && frontier.length > 0 && collected.length < 300; depth++) {
      const next: string[] = [];
      for (const parentId of frontier) {
        const res = await redmineFetch(
          `/issues.json?parent_id=${encodeURIComponent(parentId)}&status_id=*&limit=100`,
          apiKey,
        );
        if (!res.ok) {
          if (collected.length === 0) return { issues: [], error: `Redmine ${res.status}` };
          continue;
        }
        const data: any = await res.json();
        for (const issue of data?.issues ?? []) {
          const rid = String(issue.id);
          if (seen.has(rid)) continue;
          seen.add(rid);
          collected.push({ issue, parentRedmineId: parentId });
          next.push(rid);
        }
      }
      frontier = next;
    }
    return { issues: collected };
  } catch (err: any) {
    return { issues: collected, error: collected.length === 0 ? err?.message ?? "Redmine unreachable" : undefined };
  }
}

// "Pull now": import the 100 most recently updated issues of the chosen
// tracker, each routed by its tracker (QA/Prod/Others tabs, User Story →
// requirement). INSERT-ONLY: issues already in QAPulse are ignored untouched
// ("Refresh status" is the update mechanism).
export interface PullResultCounts {
  imported: number;
  ignored: number;
  qaDefects: number;
  prodDefects: number;
  others: number;
  requirements: number;
  error?: string;
}

export async function pullTrackerIssues(apiKey: string, trackerName: string, milestoneId: number | null = null): Promise<PullResultCounts> {
  const empty: PullResultCounts = { imported: 0, ignored: 0, qaDefects: 0, prodDefects: 0, others: 0, requirements: 0 };
  const trackers = await db.select().from(trackersTable);
  const tracker = trackers.find((t: any) => t.name.toLowerCase() === trackerName.toLowerCase());
  if (!tracker) return { ...empty, error: `Tracker "${trackerName}" not found — sync trackers first` };

  let issues: any[] = [];
  try {
    const res = await redmineFetch(
      `/issues.json?tracker_id=${tracker.redmineId}&status_id=*&limit=100&sort=updated_on:desc`,
      apiKey,
    );
    if (!res.ok) return { ...empty, error: `Redmine ${res.status}` };
    const data: any = await res.json();
    issues = data?.issues ?? [];
  } catch (err: any) {
    return { ...empty, error: err?.message ?? "Redmine unreachable" };
  }

  if (issues.length === 0) return empty;

  const counts = { ...empty };
  for (const issue of issues) {
    const rid = String(issue.id);
    const issueTracker = issue.tracker?.name ?? trackerName;
    const route = routeForTracker(issueTracker);

    if (route === "requirement") {
      // insert-only against the requirements table
      const [existing] = await db
        .select({ id: requirementsTable.id })
        .from(requirementsTable)
        .where(eq(requirementsTable.redmineTicketId, rid));
      if (existing) {
        counts.ignored++;
        continue;
      }
      await db.insert(requirementsTable).values({
        title: issue.subject ?? "Untitled",
        description: issue.description ?? null,
        module: issue.category?.name ?? null,
        redmineTicketId: rid,
        tracker: issueTracker,
        status: "open",
        milestoneId,
        redmineCreatedAt: issue.created_on ? new Date(issue.created_on) : null,
      });
      counts.imported++;
      counts.requirements++;
      continue;
    }

    // defect destinations (qa / production / other)
    const [existing] = await db
      .select({ id: defectsTable.id })
      .from(defectsTable)
      .where(eq(defectsTable.redmineId, rid));
    if (existing) {
      counts.ignored++;
      continue;
    }
    const [row] = await db
      .insert(defectsTable)
      .values({
        title: issue.subject ?? "Untitled",
        description: issue.description ?? null,
        severity: severityFromPriority(issue.priority?.name),
        module: issue.category?.name ?? null,
        category: issue.category?.name ?? null,
        tracker: issueTracker,
        redmineId: rid,
        syncStatus: "synced",
        source: route,
        foundIn: route === "production" ? "Production" : "SIT",
        milestoneId,
        redmineCreatedAt: issue.created_on ? new Date(issue.created_on) : null,
        status: issue.status?.name ?? "Unknown",
        assigneeName: issue.assigned_to?.name ?? null,
        statusSyncedAt: new Date(),
      })
      .returning();
    await db
      .update(defectsTable)
      .set({ defectCode: `${defectCodePrefix(route)}${String(row.id).padStart(4, "0")}` })
      .where(eq(defectsTable.id, row.id));
    counts.imported++;
    if (route === "production") counts.prodDefects++;
    else if (route === "other") counts.others++;
    else counts.qaDefects++;
  }
  return counts;
}
