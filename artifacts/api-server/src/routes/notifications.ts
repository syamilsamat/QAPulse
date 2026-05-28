import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

function formatNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    entityType: n.entityType ?? null,
    entityId: n.entityId ?? null,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const unreadOnly = req.query.unreadOnly === "true";

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt));

  const result = unreadOnly
    ? notifications.filter((n) => !n.read).map(formatNotification)
    : notifications.map(formatNotification);

  res.json(result);
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(formatNotification(updated));
});

router.post("/notifications/mark-all-read", async (req, res): Promise<void> => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)));

  res.json({ success: true });
});

export default router;
