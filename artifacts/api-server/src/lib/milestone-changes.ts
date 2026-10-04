// Describes what changed on a milestone, in words, for the notification sent
// to its team (CR102). Pure, so it can be tested without a database.

type Row = Record<string, unknown>;

const FIELDS: [key: string, label: string, kind: "text" | "date"][] = [
  ["name", "name", "text"],
  ["status", "status", "text"],
  ["priority", "priority", "text"],
  ["type", "type", "text"],
  ["environment", "environment", "text"],
  ["startDate", "start date", "date"],
  ["reqTargetDate", "requirements date", "date"],
  ["devTargetDate", "dev date", "date"],
  ["qaTargetDate", "System Testing date", "date"],
  ["sitTargetDate", "SIT date", "date"],
  ["uatTargetDate", "UAT date", "date"],
  ["goLiveDate", "go-live date", "date"],
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function show(v: unknown, kind: "text" | "date"): string {
  if (v == null || v === "") return "not set";
  if (kind === "date") {
    const d = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return String(v);
}

const same = (a: unknown, b: unknown, kind: "text" | "date") => show(a, kind) === show(b, kind);

export function describeMilestoneChanges(
  before: Row,
  after: Row,
  modulesBefore: string[],
  modulesAfter: string[],
): string[] {
  const out: string[] = [];
  for (const [key, label, kind] of FIELDS) {
    if (!same(before[key], after[key], kind)) out.push(`${label} ${show(before[key], kind)} → ${show(after[key], kind)}`);
  }
  const b = [...modulesBefore].sort().join(", ");
  const a = [...modulesAfter].sort().join(", ");
  if (b !== a) out.push(`modules ${b || "all"} → ${a || "all"}`);
  return out;
}

// A short sentence, capped so one big edit does not produce a wall of text.
export function summariseChanges(changes: string[], max = 4): string {
  if (changes.length <= max) return changes.join("; ");
  return `${changes.slice(0, max).join("; ")}; and ${changes.length - max} more`;
}
