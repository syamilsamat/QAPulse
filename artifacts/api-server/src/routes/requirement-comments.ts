import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, requirementCommentsTable, requirementsTable, usersTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";
import { notifyUser } from "./_notify";

const router: IRouter = Router();

// GET /requirements/:id/comments
router.get("/requirements/:id/comments", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const reqId = parseInt(req.params.id);
  const comments = await db.select().from(requirementCommentsTable)
    .where(eq(requirementCommentsTable.requirementId, reqId))
    .orderBy(requirementCommentsTable.createdAt);

  const withAuthors = await Promise.all(comments.map(async (c) => {
    const [author] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, c.authorId));
    return { ...c, authorName: author?.name ?? "Unknown", createdAt: c.createdAt.toISOString() };
  }));

  res.json(withAuthors);
});

// POST /requirements/:id/comments
router.post("/requirements/:id/comments", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const reqId = parseInt(req.params.id);
  const body = req.body.body?.trim();
  if (!body) { res.status(400).json({ error: "body is required" }); return; }

  const [req_] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, reqId));
  if (!req_) { res.status(404).json({ error: "Requirement not found" }); return; }

  const [comment] = await db.insert(requirementCommentsTable).values({
    requirementId: reqId,
    authorId: ctx.userId,
    body,
  }).returning();

  // Notify: author + anyone who previously commented (deduped, minus commenter)
  const toNotify = new Set<number>();
  if (req_.createdBy && req_.createdBy !== ctx.userId) toNotify.add(req_.createdBy);
  if (req_.assigneeId && req_.assigneeId !== ctx.userId) toNotify.add(req_.assigneeId);
  const priorCommenters = await db.select({ authorId: requirementCommentsTable.authorId })
    .from(requirementCommentsTable)
    .where(eq(requirementCommentsTable.requirementId, reqId));
  for (const p of priorCommenters) {
    if (p.authorId !== ctx.userId) toNotify.add(p.authorId);
  }
  for (const uid of toNotify) {
    notifyUser(
      uid,
      "New comment",
      `New comment on requirement "${req_.title}"`,
      "comment_posted",
      "requirement",
      reqId,
      ctx.userId,
    ).catch(() => {});
  }

  const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ctx.userId));
  res.status(201).json({ ...comment, authorName: author?.name ?? "Unknown", createdAt: comment.createdAt.toISOString() });
});

export default router;
