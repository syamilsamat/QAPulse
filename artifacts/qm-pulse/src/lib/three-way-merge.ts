// Field-level three-way merge for a requirement's content (CR104).
//
// base   = the copy the person started editing from
// mine   = what they typed
// theirs = the latest saved version, which someone else changed meanwhile
//
// A field only one side changed is taken from that side; a field both changed
// to different values is a conflict for the person to settle. Acceptance
// criteria are a list: the latest version is kept, the person's removals are
// applied and their additions appended, so lists never conflict.

export type Content = { title: string; description: string; acceptanceCriteria: string[]; priority: string };
export type ScalarKey = "title" | "description" | "priority";
export type MergeResult = { merged: Content; conflicts: ScalarKey[]; autoApplied: string[] };

const norm = (v: string) => v.replace(/\r\n/g, "\n").trim();

export function mergeThreeWay(base: Content, mine: Content, theirs: Content): MergeResult {
  const merged: Content = { ...theirs, acceptanceCriteria: [...theirs.acceptanceCriteria] };
  const conflicts: ScalarKey[] = [];
  const autoApplied: string[] = [];

  (["title", "description", "priority"] as ScalarKey[]).forEach((k) => {
    const m = norm(mine[k]), b = norm(base[k]), t = norm(theirs[k]);
    if (m === b) { merged[k] = theirs[k]; return; }            // I did not touch it
    if (t === b || m === t) {                                  // only I changed it, or we agree
      merged[k] = mine[k];
      if (t === b) autoApplied.push(k);
      return;
    }
    merged[k] = mine[k];                                       // both changed it differently
    conflicts.push(k);
  });

  const removed = base.acceptanceCriteria.filter((c) => !mine.acceptanceCriteria.includes(c));
  const added = mine.acceptanceCriteria.filter((c) => !base.acceptanceCriteria.includes(c));
  merged.acceptanceCriteria = merged.acceptanceCriteria.filter((c) => !removed.includes(c));
  for (const c of added) if (!merged.acceptanceCriteria.includes(c)) merged.acceptanceCriteria.push(c);
  if (removed.length || added.length) autoApplied.push("acceptanceCriteria");

  return { merged, conflicts, autoApplied };
}
