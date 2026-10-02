import type { Content } from "./three-way-merge";

// What changed between two copies of a requirement's content, for the dialog's
// "what changed" list and for deciding whether Save is allowed (CR104).
// Mirrors the server's comparison so the button never promises a save the
// server will refuse as "nothing changed".

export type DiffKey = "title" | "description" | "priority" | "acceptanceCriteria";

const norm = (v: string) => v.replace(/\r\n/g, "\n").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function diffKeys(a: Content, b: Content): DiffKey[] {
  const out: DiffKey[] = [];
  if (norm(a.title) !== norm(b.title)) out.push("title");
  if (norm(a.description) !== norm(b.description)) out.push("description");
  if (a.priority !== b.priority) out.push("priority");
  if (JSON.stringify(a.acceptanceCriteria) !== JSON.stringify(b.acceptanceCriteria)) out.push("acceptanceCriteria");
  return out;
}

export function describeDiff(a: Content, b: Content): string[] {
  return diffKeys(a, b).map((k) => {
    if (k === "title") return "Title changed";
    if (k === "description") return "Description changed";
    if (k === "priority") return `Priority ${cap(a.priority)} → ${cap(b.priority)}`;
    const added = b.acceptanceCriteria.filter((c) => !a.acceptanceCriteria.includes(c)).length;
    const removed = a.acceptanceCriteria.filter((c) => !b.acceptanceCriteria.includes(c)).length;
    const parts = [added ? `${added} added` : "", removed ? `${removed} removed` : ""].filter(Boolean);
    return `Acceptance criteria${parts.length ? `: ${parts.join(", ")}` : " reordered"}`;
  });
}

export function contentFromApi(r: { title: string; description: string | null; acceptanceCriteria: unknown; priority: string }): Content {
  return {
    title: r.title,
    description: r.description ?? "",
    acceptanceCriteria: Array.isArray(r.acceptanceCriteria) ? (r.acceptanceCriteria as unknown[]).map(String) : [],
    priority: r.priority,
  };
}

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const priorityLabel = cap;
