// Pure comparison logic for the Redmine sync, kept free of database imports so
// it can be unit-tested on its own.

export const PRIORITY_MAP: Record<string, string> = { low: "low", normal: "normal", high: "high", urgent: "urgent" };

// Review states where Redmine's change is applied immediately. Anything else
// (in_review, approved) is flagged for a person instead.
export const AUTO_APPLY_STATES = ["draft", "rejected"];

export type SyncField = "title" | "description" | "priority" | "tracker";
export type FieldChange = { from: string; to: string };
export type ChangeSet = Partial<Record<SyncField, FieldChange>>;

// Compare ignoring line-ending and edge-whitespace noise so a CRLF round trip
// through Redmine never looks like an edit.
export const norm = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").trim();

export function diffRequirement(
  local: { title: string; description: string | null; priority: string; tracker: string | null },
  issue: any,
): ChangeSet {
  const changes: ChangeSet = {};
  const remote = {
    title: String(issue.subject ?? ""),
    description: String(issue.description ?? ""),
    priority: PRIORITY_MAP[issue.priority?.name?.toLowerCase()] ?? "normal",
    tracker: String(issue.tracker?.name ?? "Task"),
  };
  if (remote.title && norm(local.title) !== norm(remote.title)) changes.title = { from: local.title, to: remote.title };
  if (norm(local.description) !== norm(remote.description)) changes.description = { from: local.description ?? "", to: remote.description };
  if (local.priority !== remote.priority) changes.priority = { from: local.priority, to: remote.priority };
  if (local.tracker && local.tracker !== remote.tracker) changes.tracker = { from: local.tracker, to: remote.tracker };
  return changes;
}
