// Rules for revising a requirement (CR104). No database imports, so they can
// be tested on their own.
//
//   - Editing needs approval: changing the content of an approved (or
//     in-review) requirement sends it back to Draft.
//   - A draft or in-review requirement is locked to its owner, like test cases
//     (CR089): whoever saved the draft owns it; others read it.
//   - The approver must differ from both the author and the last editor.

export const CONTENT_KEYS = ["title", "description", "acceptanceCriteria", "priority"] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];

export type Content = { title: string; description: string; acceptanceCriteria: string[]; priority: string };
export type ChangeMap = Partial<Record<ContentKey, { from: unknown; to: unknown }>>;

export function parseCriteria(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function contentOf(row: { title: string; description: string | null; acceptanceCriteria: unknown; priority: string }): Content {
  return {
    title: row.title,
    description: row.description ?? "",
    acceptanceCriteria: parseCriteria(row.acceptanceCriteria),
    priority: row.priority,
  };
}

const norm = (v: string) => v.replace(/\r\n/g, "\n").trim();

export function diffContent(a: Content, b: Content): ChangeMap {
  const out: ChangeMap = {};
  if (norm(a.title) !== norm(b.title)) out.title = { from: a.title, to: b.title };
  if (norm(a.description) !== norm(b.description)) out.description = { from: a.description, to: b.description };
  if (a.priority !== b.priority) out.priority = { from: a.priority, to: b.priority };
  if (JSON.stringify(a.acceptanceCriteria) !== JSON.stringify(b.acceptanceCriteria)) {
    out.acceptanceCriteria = { from: a.acceptanceCriteria, to: b.acceptanceCriteria };
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// One short line per changed field, for the collapsed view of a log entry.
export function describeChanges(changes: ChangeMap): string[] {
  const lines: string[] = [];
  if (changes.title) lines.push("Title changed");
  if (changes.description) lines.push("Description changed");
  if (changes.priority) lines.push(`Priority ${cap(String(changes.priority.from))} → ${cap(String(changes.priority.to))}`);
  if (changes.acceptanceCriteria) {
    const from = changes.acceptanceCriteria.from as string[];
    const to = changes.acceptanceCriteria.to as string[];
    const added = to.filter((c) => !from.includes(c)).length;
    const removed = from.filter((c) => !to.includes(c)).length;
    const parts = [added ? `${added} added` : "", removed ? `${removed} removed` : ""].filter(Boolean);
    lines.push(`Acceptance criteria${parts.length ? `: ${parts.join(", ")}` : " reordered"}`);
  }
  return lines;
}

export type LockInput = {
  status: string | null | undefined;
  draftOwnerId: number | null;
  createdBy: number | null;
  actorId: number;
  actorIsAdmin: boolean;
};
export type LockDecision = { allowed: true; claim: boolean } | { allowed: false; ownerId: number | null; reason: string };

export function decideRevisionLock(c: LockInput): LockDecision {
  // An approved requirement is open to any permitted editor; whoever saves
  // first owns the new draft.
  if (c.status === "approved") return { allowed: true, claim: true };
  // Draft, in review or returned: the owner edits. A draft with no recorded owner
  // (older rows) falls back to its author; with nobody there is nobody to protect.
  // A requirement returned to FA by Dev or QA has no draft owner yet and is open
  // to whichever FA picks it up; only a plain draft falls back to its author.
  const owner = c.draftOwnerId ?? (c.status === "draft" || c.status == null ? c.createdBy : null) ?? null;
  if (owner == null || owner === c.actorId) return { allowed: true, claim: c.draftOwnerId !== c.actorId };
  if (c.actorIsAdmin) return { allowed: true, claim: true };
  return {
    allowed: false,
    ownerId: owner,
    reason: c.status === "in_review"
      ? "This requirement is in review and can only be edited by its owner"
      : "This requirement is a draft owned by someone else",
  };
}

// The approver must differ from the author and the last editor.
export function canApprove(c: { actorId: number; createdBy: number | null; lastEditedBy: number | null }): boolean {
  return c.actorId !== c.createdBy && c.actorId !== c.lastEditedBy;
}
