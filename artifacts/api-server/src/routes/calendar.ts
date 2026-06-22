import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, calendarEventsTable, usersTable, notificationsTable } from "@workspace/db";
import {
  ListCalendarEventsQueryParams,
  CreateCalendarEventBody,
  UpdateCalendarEventParams,
  UpdateCalendarEventBody,
  DeleteCalendarEventParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function notifyUser(userId: number, title: string, message: string, type: string, entityId: number) {
  await db.insert(notificationsTable).values({
    userId,
    title,
    message,
    type,
    entityType: "calendar_event",
    entityId,
    read: false,
  });
}

function parseTaggedUserIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function formatEvent(event: typeof calendarEventsTable.$inferSelect) {
  const taggedIds = parseTaggedUserIds(event.taggedUserIds);

  const allUsers = taggedIds.length > 0 || event.createdBy
    ? await db.select().from(usersTable)
    : [];

  const usersMap: Record<number, string> = {};
  allUsers.forEach((u) => { usersMap[u.id] = u.name; });

  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    date: event.date,
    dateTo: event.dateTo ?? null,
    eventType: event.eventType,
    taggedUserIds: taggedIds,
    taggedUserNames: taggedIds.map((id) => usersMap[id] ?? "Unknown"),
    color: event.color ?? null,
    createdBy: event.createdBy ?? null,
    createdByName: event.createdBy ? (usersMap[event.createdBy] ?? null) : null,
    createdAt: event.createdAt.toISOString(),
  };
}

router.get("/calendar/events", async (req, res): Promise<void> => {
  const parsed = ListCalendarEventsQueryParams.safeParse(req.query);

  let events = await db.select().from(calendarEventsTable);

  if (parsed.success) {
    const { month, year } = parsed.data;
    if (month !== undefined && year !== undefined) {
      const monthStr = String(month).padStart(2, "0");
      const yearStr = String(year);
      events = events.filter((e) => e.date.startsWith(`${yearStr}-${monthStr}`));
    } else if (year !== undefined) {
      events = events.filter((e) => e.date.startsWith(String(year)));
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const formatted = await Promise.all(events.map(formatEvent));
  res.json(formatted);
});

router.post("/calendar/events", async (req, res): Promise<void> => {
  const parsed = CreateCalendarEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { taggedUserIds, ...rest } = parsed.data;

  const [event] = await db.insert(calendarEventsTable).values({
    ...rest,
    taggedUserIds: taggedUserIds ? JSON.stringify(taggedUserIds) : null,
  }).returning();

  // Notify tagged users immediately (same pattern as task assignment)
  if (taggedUserIds?.length) {
    for (const userId of taggedUserIds) {
      await notifyUser(userId, "You were tagged in an event", `"${event.title}" on ${event.date}`, "calendar_tag", event.id);
    }
  }

  res.status(201).json(await formatEvent(event));
});

router.patch("/calendar/events/:id", async (req, res): Promise<void> => {
  const params = UpdateCalendarEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCalendarEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { taggedUserIds, ...rest } = parsed.data;

  // Fetch existing event to diff tagged users
  const [existing] = await db.select().from(calendarEventsTable).where(eq(calendarEventsTable.id, params.data.id));
  const prevTaggedIds = parseTaggedUserIds(existing?.taggedUserIds);

  const updateData: Record<string, unknown> = { ...rest };
  if (taggedUserIds !== undefined) {
    updateData.taggedUserIds = JSON.stringify(taggedUserIds);
  }

  const [event] = await db.update(calendarEventsTable)
    .set(updateData)
    .where(eq(calendarEventsTable.id, params.data.id))
    .returning();

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Notify only newly added tagged users
  if (taggedUserIds?.length) {
    const newlyTagged = taggedUserIds.filter(id => !prevTaggedIds.includes(id));
    for (const userId of newlyTagged) {
      await notifyUser(userId, "You were tagged in an event", `"${event.title}" on ${event.date}`, "calendar_tag", event.id);
    }
  }

  res.json(await formatEvent(event));
});

router.delete("/calendar/events/:id", async (req, res): Promise<void> => {
  const params = DeleteCalendarEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [event] = await db.delete(calendarEventsTable)
    .where(eq(calendarEventsTable.id, params.data.id))
    .returning();

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
