import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import { addSseConnection, removeSseConnection } from "../lib/notifications";
import { getAuthContext } from "../middleware/access";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// CR047 — every notification is private to its owner. Endpoints derive the
// user from the JWT, never a client-supplied userId, so nobody can read or
// mutate another user's feed.
function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return ctx;
}

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
  // EventSource can't send an Authorization header, so the token rides as a
  // query param here (CR047). The stream is bound to the token's own user —
  // the userId query param is ignored for authorization.
  const token = typeof req.query.token === "string" ? req.query.token : "";
  let userId: number;
  try {
    userId = verifyToken(token).id;
  } catch {
    res.status(401).end();
    return;
  }
  if (!userId || isNaN(userId)) {
    res.status(401).end();
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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const userId = ctx.userId; // always the caller's own feed, never a query param
  const unreadOnly = req.query.unreadOnly === "true";

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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }

  // Ownership enforced in the WHERE clause — a notification belonging to
  // someone else simply isn't matched and returns 404.
  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, ctx.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(formatNotification(updated));
});

router.post("/notifications/mark-all-read", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.userId, ctx.userId), eq(notificationsTable.read, false)));

  res.json({ success: true });
});

export default router;
