import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  db,
  activityTable,
  requirementsTable,
  requirementApprovedSnapshotsTable,
  requirementRevisionLogTable,
  tasksTable,
  testCasesTable,
  usersTable,
} from "@workspace/db";
import { notifyRolesInProject, notifyUser } from "../routes/_notify";
import {
  contentOf,
  describeChanges,
  diffContent,
  type ChangeMap,
  type Content,
} from "./requirement-revision-rules";

type Requirement = typeof requirementsTable.$inferSelect;

export async function logRevision(opts: {
  requirementId: number;
  action: "create" | "edit" | "submit" | "approve" | "return" | "discard" | "takeover";
  actorId: number | null;
  remark?: string | null;
  changes?: ChangeMap | null;
  version?: number | null;
}): Promise<void> {
  try {
    const [actor] = opts.actorId
      ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, opts.actorId))
      : [];
    await db.insert(requirementRevisionLogTable).values({
      requirementId: opts.requirementId,
      action: opts.action,
      actorId: opts.actorId,
      actorName: actor?.name ?? null,
      remark: opts.remark?.trim() || null,
      changes: opts.changes && Object.keys(opts.changes).length > 0 ? JSON.stringify(opts.changes) : null,
      version: opts.version ?? null,
    });
  } catch (err) {
    console.error("[logRevision]", err);
  }
}

export async function getSnapshot(requirementId: number): Promise<Content | null> {
  const [row] = await db.select().from(requirementApprovedSnapshotsTable).where(eq(requirementApprovedSnapshotsTable.requirementId, requirementId));
  if (!row) return null;
  try {
    const c = JSON.parse(row.content);
    return { title: c.title ?? "", description: c.description ?? "", acceptanceCriteria: Array.isArray(c.acceptanceCriteria) ? c.acceptanceCriteria : [], priority: c.priority ?? "normal" };
  } catch {
    return null;
  }
}

export async function saveSnapshot(requirementId: number, content: Content, approvedBy: number | null): Promise<void> {
  const values = { requirementId, content: JSON.stringify(content), approvedBy, approvedAt: new Date() };
  await db.insert(requirementApprovedSnapshotsTable).values(values)
    .onConflictDoUpdate({ target: requirementApprovedSnapshotsTable.requirementId, set: { content: values.content, approvedBy, approvedAt: values.approvedAt } });
}

// Requirements approved before this feature have no snapshot. The first edit
// captures what is approved right now, so there is something to restore.
export async function ensureSnapshot(row: Requirement): Promise<void> {
  if ((row as any).reviewStatus !== "approved") return;
  if (await getSnapshot(row.id)) return;
  await saveSnapshot(row.id, contentOf(row as any), (row as any).approvedBy ?? null);
}

// CR090 — when a requirement that had been approved before is approved again
// with different content, tell everyone building or testing against it.
export async function notifyReapproval(opts: {
  requirement: Requirement;
  before: Content;
  after: Content;
  actorId: number;
}): Promise<void> {
  const changes = diffContent(opts.before, opts.after);
  const lines = describeChanges(changes);
  if (lines.length === 0) return;
  const { requirement } = opts;

  // Test cases and tasks built on the old text need another look.
  if (changes.description || changes.acceptanceCriteria) {
    const now = new Date();
    await db.update(testCasesTable).set({ requirementRevisedAt: now }).where(eq(testCasesTable.requirementId, requirement.id));
    await db.update(tasksTable).set({ requirementRevisedAt: now }).where(eq(tasksTable.requirementId, requirement.id));
  }

  const tasks = await db.select({ assigneeIds: tasksTable.assigneeIds, status: tasksTable.status })
    .from(tasksTable)
    .where(and(eq(tasksTable.requirementId, requirement.id), ne(tasksTable.status, "cancelled")));
  const recipients = new Set<number>();
  for (const t of tasks) for (const uid of t.assigneeIds ?? []) recipients.add(uid);
  if ((requirement as any).devAssigneeId) recipients.add((requirement as any).devAssigneeId);

  // The return-to-FA step clears the dev assignee; its log entry remembers who it was.
  const [returned] = await db.select().from(activityTable)
    .where(and(eq(activityTable.entityType, "requirement"), eq(activityTable.entityId, requirement.id), eq(activityTable.type, "requirement_return_to_fa")))
    .orderBy(desc(activityTable.createdAt), desc(activityTable.id)).limit(1);
  try {
    const prev = returned?.oldValue ? JSON.parse(returned.oldValue).devAssigneeId : null;
    if (typeof prev === "number") recipients.add(prev);
  } catch { /* an old entry without the field */ }

  recipients.delete(opts.actorId);
  const message = `"${requirement.title}" was approved again with changes: ${lines.join("; ")}. Check your work against the new version.`;
  await Promise.all([...recipients].map((uid) =>
    notifyUser(uid, "Requirement changed and re-approved", message, "requirement_reapproved", "requirement", requirement.id, opts.actorId).catch(() => {}),
  ));
  await notifyRolesInProject({
    roles: ["dev_lead"],
    projectId: requirement.projectId,
    module: requirement.module,
    title: "Requirement changed and re-approved",
    message,
    type: "requirement_reapproved",
    entityType: "requirement",
    entityId: requirement.id,
    actorId: opts.actorId,
    excludeUserIds: recipients,
  }).catch(() => {});
}

export async function userNames(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const want = [...new Set(ids.filter((i): i is number => i != null))];
  if (want.length === 0) return new Map();
  const rows = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, want));
  return new Map(rows.map((r) => [r.id, r.name]));
}
