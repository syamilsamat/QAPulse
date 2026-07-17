import { inArray } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logNotification } from "../lib/notifications";
import { canAccessProject, getModuleScope } from "../middleware/access";

// Thin wrapper over logNotification() — routes it through the SSE ping so
// every existing call site gets real-time delivery (CR027 Part 3) without
// each one needing to switch APIs.
export async function notifyUser(
  userId: number | null | undefined,
  title: string,
  message: string,
  type: string,
  entityType: string,
  entityId: number,
  actorId?: number | null,
) {
  if (!userId) return;
  if (actorId && actorId === userId) return; // don't notify if user made the change themselves
  await logNotification({ userId, title, message, type, entityType, entityId });
}

// CR045 — role fan-out scoped by project (and optionally module). Notifies
// every user holding one of `roles` who can access `projectId`; when `module`
// is set, module-scoped users (CR044) are skipped unless their grant covers
// that module — mirroring exactly what those users can see. Per the
// notification matrix, HOD-level roles are deliberately NOT part of any
// lead fan-out — pass lead/member roles only.
export async function notifyRolesInProject(opts: {
  roles: string[];
  projectId: number | null | undefined;
  module?: string | null;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: number;
  actorId?: number | null;
  /** Users already notified about this event through another path. */
  excludeUserIds?: Iterable<number>;
}) {
  if (opts.projectId == null || opts.roles.length === 0) return;
  const projectId = opts.projectId;
  const excluded = new Set(opts.excludeUserIds ?? []);
  const candidates = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(inArray(usersTable.role, opts.roles));

  const recipients: number[] = [];
  for (const u of candidates) {
    if (u.id === opts.actorId || excluded.has(u.id)) continue;
    if (!(await canAccessProject(u.id, u.role, projectId))) continue;
    if (opts.module) {
      const scope = await getModuleScope(u.id, u.role, projectId);
      if (scope.restricted && !scope.moduleNames.includes(opts.module)) continue;
    }
    recipients.push(u.id);
  }

  await Promise.all(
    recipients.map((uid) =>
      notifyUser(uid, opts.title, opts.message, opts.type, opts.entityType, opts.entityId, opts.actorId).catch(() => {}),
    ),
  );
}
