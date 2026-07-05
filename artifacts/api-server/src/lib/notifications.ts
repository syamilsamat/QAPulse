import type { Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";

// In-process SSE connection registry — maps userId → live response objects.
// Sufficient for a single-process server; upgrade to Redis pub/sub under CR012
// when the server goes multi-process.
const sseConnections = new Map<number, Set<Response>>();

export function addSseConnection(userId: number, res: Response): void {
  if (!sseConnections.has(userId)) sseConnections.set(userId, new Set());
  sseConnections.get(userId)!.add(res);
}

export function removeSseConnection(userId: number, res: Response): void {
  const conns = sseConnections.get(userId);
  if (conns) {
    conns.delete(res);
    if (conns.size === 0) sseConnections.delete(userId);
  }
}

function pingUser(userId: number, unreadCount: number): void {
  const conns = sseConnections.get(userId);
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: "new_notification", unreadCount })}\n\n`;
  for (const res of conns) {
    try {
      res.write(payload);
    } catch {
      conns.delete(res);
    }
  }
}

export async function logNotification(notif: {
  userId: number;
  title: string;
  message: string;
  type?: string;
  entityType?: string | null;
  entityId?: number | null;
}): Promise<void> {
  await db.insert(notificationsTable).values({
    userId: notif.userId,
    title: notif.title,
    message: notif.message,
    type: notif.type ?? "info",
    entityType: notif.entityType ?? null,
    entityId: notif.entityId ?? null,
  });

  // Count unread so the SSE ping carries an accurate badge number
  const unread = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, notif.userId), eq(notificationsTable.read, false)));

  pingUser(notif.userId, unread.length);
}
