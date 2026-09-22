import type { DefectHistoryEntry } from "@workspace/db";
export class HistoryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const redmineHistoryBaseUrl = () => (process.env.REDMINE_URL ?? "https://redmine.bestinet.my").replace(/\/$/, "");
export async function historyRead(path: string, key: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${redmineHistoryBaseUrl()}${path}`, {
      headers: { "X-Redmine-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000), redirect: "error",
    });
  } catch { throw new HistoryError(502, "Redmine is unavailable. Please try again."); }
  if (res.status === 401 || res.status === 403) throw new HistoryError(403, "Redmine denied access. Check your personal API key and issue permissions.");
  if (res.status === 404) throw new HistoryError(404, "This issue is unavailable or you no longer have access in Redmine.");
  if (!res.ok) throw new HistoryError(502, `Redmine returned HTTP ${res.status}. Please try again.`);
  try { return await res.json(); }
  catch { throw new HistoryError(502, "Redmine returned an invalid response. Please try again."); }
}
const labels: Record<string, string> = {
  status_id: "Status", assigned_to_id: "Assignee", priority_id: "Priority", tracker_id: "Tracker",
  subject: "Title", description: "Description", start_date: "Start date", due_date: "Due date",
  done_ratio: "% done", estimated_hours: "Estimated hours", fixed_version_id: "Target version",
  category_id: "Category", project_id: "Project", parent_id: "Parent issue", is_private: "Private issue",
};
type Names = Record<string, Record<string, string>>;
export function normalizeHistory(issue: any, names: Names): DefectHistoryEntry[] {
  if (!issue || !Array.isArray(issue.journals) || !Number.isFinite(Date.parse(issue.updated_on))) {
    throw new HistoryError(502, "Redmine returned incomplete history. Please try again.");
  }
  const custom = new Map((issue.custom_fields ?? []).map((f: any) => [String(f.id), String(f.name)]));
  const value = (field: string, raw: unknown): string | null => {
    if (raw == null || raw === "") return null;
    const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
    if (names[field]?.[text]) return names[field][text];
    if (field === "done_ratio") return `${text}%`;
    if (field === "is_private") return text === "1" ? "Yes" : "No";
    return field.endsWith("_id") ? `#${text}` : text;
  };
  const entries = issue.journals.map((j: any) => {
    if (!Number.isSafeInteger(j.id) || j.id <= 0 || !Number.isFinite(Date.parse(j.created_on)) || !Array.isArray(j.details)) {
      throw new HistoryError(502, "Redmine returned incomplete history. Please try again.");
    }
    return {
      id: j.id, author: j.user?.name ?? "Unknown user", createdAt: new Date(j.created_on).toISOString(),
      private: j.private_notes === true, notes: typeof j.notes === "string" ? j.notes : "",
      changes: j.details.map((d: any) => ({
        kind: d.property === "attachment" ? "attachment" as const : "field" as const,
        field: d.property === "attachment" ? "Attachment" : d.property === "cf"
          ? String(custom.get(String(d.name)) ?? `Custom field #${d.name}`)
          : labels[d.name] ?? String(d.name ?? "Field").replace(/_/g, " "),
        before: value(d.property === "attr" ? d.name : "", d.old_value),
        after: value(d.property === "attr" ? d.name : "", d.new_value),
      })),
    };
  });
  return [...new Map<number, DefectHistoryEntry>(entries.map((e: DefectHistoryEntry) => [e.id, e])).values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
}
export async function fetchHistory(redmineId: string, key: string) {
  const data = await historyRead(`/issues/${encodeURIComponent(redmineId)}.json?include=journals,attachments`, key);
  const issue = data.issue;
  if (String(issue?.id) !== redmineId) throw new HistoryError(502, "Redmine returned an unexpected issue.");
  const names: Names = {};
  const add = (field: string, items: any[]) => {
    names[field] ??= {};
    for (const item of items) if (item?.id != null && item?.name) names[field][String(item.id)] = item.name;
  };
  for (const [field, item] of Object.entries({ status_id: issue.status, assigned_to_id: issue.assigned_to, priority_id: issue.priority, tracker_id: issue.tracker, category_id: issue.category, fixed_version_id: issue.fixed_version, project_id: issue.project })) add(field, [item]);
  add("assigned_to_id", [issue.author, ...(issue.journals ?? []).map((j: any) => j.user)]);
  // Optional lookups use the same personal key. Unresolvable historic IDs stay explicit.
  await Promise.allSettled([
    ["status_id", "/issue_statuses.json", "issue_statuses"],
    ["priority_id", "/enumerations/issue_priorities.json", "issue_priorities"],
    ["tracker_id", "/trackers.json", "trackers"],
  ].map(async ([field, path, prop]) => {
    const lookup = await historyRead(path, key);
    if (Array.isArray(lookup[prop])) add(field, lookup[prop]);
  }));
  return { entries: normalizeHistory(issue, names), issueUpdatedAt: new Date(issue.updated_on) };
}
