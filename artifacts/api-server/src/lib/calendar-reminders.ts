import { and, eq } from "drizzle-orm";
import { db, calendarEventsTable, notificationsTable } from "@workspace/db";
import { logger } from "./logger";

function parseTaggedUserIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function hasReminder(userId: number, eventId: number, type: string): Promise<boolean> {
  const rows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.entityType, "calendar_event"),
        eq(notificationsTable.entityId, eventId),
        eq(notificationsTable.type, type),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function sendCalendarReminders() {
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86_400_000));

  const events = await db.select().from(calendarEventsTable);

  for (const event of events) {
    const taggedIds = parseTaggedUserIds(event.taggedUserIds);
    if (!taggedIds.length) continue;

    if (event.date === today) {
      for (const userId of taggedIds) {
        if (await hasReminder(userId, event.id, "calendar_reminder_today")) continue;
        await db.insert(notificationsTable).values({
          userId,
          title: "Event today",
          message: `"${event.title}" is happening today.`,
          type: "calendar_reminder_today",
          entityType: "calendar_event",
          entityId: event.id,
          read: false,
        });
      }
    }

    if (event.date === tomorrow) {
      for (const userId of taggedIds) {
        if (await hasReminder(userId, event.id, "calendar_reminder_before")) continue;
        await db.insert(notificationsTable).values({
          userId,
          title: "Event tomorrow",
          message: `"${event.title}" is happening tomorrow.`,
          type: "calendar_reminder_before",
          entityType: "calendar_event",
          entityId: event.id,
          read: false,
        });
      }
    }
  }

  logger.info("Calendar reminders processed");
}

function msUntilNext8am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startCalendarReminderScheduler() {
  // Run immediately on startup to catch any missed reminders
  sendCalendarReminders().catch(err => logger.error({ err }, "Calendar reminder error"));

  // Then run daily at 8am
  setTimeout(function tick() {
    sendCalendarReminders().catch(err => logger.error({ err }, "Calendar reminder error"));
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, msUntilNext8am());

  logger.info({ nextRun: new Date(Date.now() + msUntilNext8am()).toISOString() }, "Calendar reminder scheduler started");
}
