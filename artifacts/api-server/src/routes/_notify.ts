import { db, notificationsTable } from "@workspace/db";

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
  await db.insert(notificationsTable).values({
    userId,
    title,
    message,
    type,
    entityType,
    entityId,
    read: false,
  });
}
