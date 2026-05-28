import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, socialEventsTable, usersTable, calendarEventsTable, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

function parseTaggedUserIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function formatSocialEvent(event: typeof socialEventsTable.$inferSelect) {
  const taggedIds = parseTaggedUserIds(event.taggedUserIds);
  const allUsers = await db.select().from(usersTable);
  const usersMap: Record<number, string> = {};
  allUsers.forEach((u) => { usersMap[u.id] = u.name; });

  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    eventDate: event.eventDate,
    eventType: event.eventType,
    taggedUserIds: taggedIds,
    taggedUserNames: taggedIds.map((id) => usersMap[id] ?? "Unknown"),
    createdBy: event.createdBy ?? null,
    createdByName: event.createdBy ? (usersMap[event.createdBy] ?? null) : null,
    createdAt: event.createdAt.toISOString(),
  };
}

async function notifyUsers(userIds: number[], title: string, message: string, type: string, entityId: number) {
  if (userIds.length === 0) return;
  await db.insert(notificationsTable).values(
    userIds.map((userId) => ({
      userId,
      title,
      message,
      type,
      entityType: "social_event",
      entityId,
      read: false,
    }))
  );
}

router.get("/social-events", async (req, res): Promise<void> => {
  const events = await db.select().from(socialEventsTable).orderBy(socialEventsTable.eventDate);
  const formatted = await Promise.all(events.map(formatSocialEvent));
  res.json(formatted);
});

router.post("/social-events", async (req, res): Promise<void> => {
  const { title, description, eventDate, eventType, taggedUserIds, createdBy } = req.body;

  if (!title || !eventDate || !eventType) {
    res.status(400).json({ error: "title, eventDate, and eventType are required" });
    return;
  }

  const [event] = await db.insert(socialEventsTable).values({
    title,
    description: description ?? null,
    eventDate,
    eventType,
    taggedUserIds: taggedUserIds ? JSON.stringify(taggedUserIds) : null,
    createdBy: createdBy ?? null,
  }).returning();

  // Auto-add to calendar as a "other" type event
  await db.insert(calendarEventsTable).values({
    title,
    description: description ?? null,
    date: eventDate,
    eventType: "other",
    taggedUserIds: taggedUserIds ? JSON.stringify(taggedUserIds) : null,
    createdBy: createdBy ?? null,
  });

  // Send notifications to all tagged users
  if (taggedUserIds && taggedUserIds.length > 0) {
    const allUsers = await db.select().from(usersTable);
    const creatorName = allUsers.find((u) => u.id === createdBy)?.name ?? "Someone";

    const eventTypeLabel: Record<string, string> = {
      lunch: "lunch",
      dinner: "dinner",
      birthday: "birthday celebration",
      outing: "team outing",
      other: "team event",
    };
    const label = eventTypeLabel[eventType] ?? "team event";

    const notifications = (taggedUserIds as number[]).filter((id) => id !== createdBy);
    await notifyUsers(
      notifications,
      `Team Hangout: ${title}`,
      `${creatorName} invited you to a ${label} on ${eventDate}. Don't miss it!`,
      "social",
      event.id
    );
  }

  const formatted = await formatSocialEvent(event);
  res.status(201).json(formatted);
});

router.patch("/social-events/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { taggedUserIds, ...rest } = req.body;
  const updateData: Record<string, unknown> = { ...rest };
  if (taggedUserIds !== undefined) {
    updateData.taggedUserIds = JSON.stringify(taggedUserIds);
  }

  const [updated] = await db
    .update(socialEventsTable)
    .set(updateData)
    .where(eq(socialEventsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Social event not found" });
    return;
  }

  if (taggedUserIds !== undefined && Array.isArray(taggedUserIds) && taggedUserIds.length > 0) {
    const allUsers = await db.select().from(usersTable);
    const creatorName = allUsers.find((u) => u.id === updated.createdBy)?.name ?? "Someone";
    const notifications = (taggedUserIds as number[]).filter((userId) => userId !== updated.createdBy);
    await notifyUsers(
      notifications,
      `Team Hangout Updated: ${updated.title}`,
      `${creatorName} updated the team event "${updated.title}".`,
      "social",
      updated.id
    );
  }

  res.json(await formatSocialEvent(updated));
});

router.delete("/social-events/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(socialEventsTable)
    .where(eq(socialEventsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Social event not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
