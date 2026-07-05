import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { addSseConnection, removeSseConnection } from "../lib/notifications";

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

// SSE stream — one persistent connection per browser tab per user.
// Sends a lightweight ping whenever logNotification() writes a new record,
// so the frontend invalidates its query cache without waiting for the 30s poll.
router.get("/notifications/stream", (req, res): void => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  if (!userId || isNaN(userId)) {
    res.status(400).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Send an initial heartbeat so the browser knows the connection is live
  res.write(": heartbeat\n\n");

  addSseConnection(userId, res);

  // Keep-alive ping every 25 seconds (browsers kill idle SSE after ~30s)
  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeSseConnection(userId, res);
  });
});

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
