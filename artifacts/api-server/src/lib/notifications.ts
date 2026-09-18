import type { Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { emailConfigured, sendEmail, appBaseUrl } from "./email";

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

  // Opt-in email mirror — every notification already funnels through here,
  // so this is the one place that needs to know about the preference rather
  // than every individual notifyUser/notifyRolesInProject call site. Not
  // awaited: a slow or unconfigured SMTP server must never delay the
  // (much more common) in-app notification path.
  emailNotificationMirror(notif).catch(() => {});
}

async function emailNotificationMirror(notif: {
  userId: number;
  title: string;
  message: string;
}): Promise<void> {
  if (!emailConfigured()) return;
  const [user] = await db
    .select({ email: usersTable.email, emailNotificationsEnabled: usersTable.emailNotificationsEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, notif.userId));
  if (!user?.email || !user.emailNotificationsEnabled) return;

  const link = appBaseUrl();
  await sendEmail({
    to: user.email,
    subject: `[QM Pulse] ${notif.title}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.5;">
      <p><strong>${notif.title}</strong></p>
      <p>${notif.message}</p>
      ${link ? `<p><a href="${link}">Open QM Pulse</a></p>` : ""}
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">
        You're receiving this because email notifications are turned on in your QM Pulse profile settings.
      </p>
    </div>`,
  });
}
