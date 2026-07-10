import { logNotification } from "../lib/notifications";

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
