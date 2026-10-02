import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  milestoneAssigneesTable,
  requirementRevisionLogTable,
  requirementsTable,
  requirementPrioritySchema,
} from "@workspace/db";
import { getAuthContext, canAccessProject, canAccessModule, getRoleTierRank } from "../middleware/access";
import { canCreateRequirementFor } from "../lib/milestone-permissions";
import { departmentRoleNames } from "../lib/review-eligibility";
import { notifyRolesInProject, notifyUser } from "./_notify";
import {
  contentOf,
  decideRevisionLock,
  describeChanges,
  diffContent,
  parseCriteria,
  type Content,
} from "../lib/requirement-revision-rules";
import { ensureSnapshot, getSnapshot, logRevision, userNames } from "../lib/requirement-revisions";

const router: IRouter = Router();

type Requirement = typeof requirementsTable.$inferSelect;

async function loadForUser(req: any, res: any) {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid requirement ID" }); return null; }
  const [row] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, id));
  if (!row) { res.status(404).json({ error: "Requirement not found" }); return null; }
  if (row.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, row.projectId))) { res.status(403).json({ error: "Access denied to this project" }); return null; }
    if (!(await canAccessModule(ctx.userId, ctx.role, row.projectId, row.module))) { res.status(403).json({ error: "Access denied to this module" }); return null; }
  }
  return { ctx, row };
}

// FA Leads, FA Members on the milestone's team, and admin (the CR101 rule) may
// author and revise a requirement.
async function mayRevise(ctx: { userId: number; role: string }, row: Requirement): Promise<boolean> {
  let onTeam = false;
  if (row.milestoneId != null) {
    const [m] = await db.select({ id: milestoneAssigneesTable.id }).from(milestoneAssigneesTable)
      .where(and(eq(milestoneAssigneesTable.milestoneId, row.milestoneId), eq(milestoneAssigneesTable.userId, ctx.userId)));
    onTeam = !!m;
  }
  return canCreateRequirementFor(ctx.role, onTeam);
}

const isAdmin = (role: string) => role === "admin" || role === "cto";

function snapshotView(c: Content) {
  return { title: c.title, description: c.description, acceptanceCriteria: c.acceptanceCriteria, priority: c.priority };
}

// POST /requirements/:id/revision
// body: { baseVersion, changes: { title?, description?, acceptanceCriteria?: string[], priority? }, action: "save_draft" | "submit" }
//
// The one way the milestone page changes a requirement's content. It enforces
// the lock (the draft's owner only), refuses a save made from an out-of-date
// copy (409 stale), refuses a save that changes nothing (409 no_changes), and
// sends an approved or in-review requirement back to Draft.
router.post("/requirements/:id/revision", async (req, res): Promise<void> => {
  try {
    const loaded = await loadForUser(req, res);
    if (!loaded) return;
    const { ctx, row } = loaded;
    if (!(await mayRevise(ctx, row))) {
      res.status(403).json({ error: "Only FA Leads, and FA Members on this milestone's team, can edit requirements" }); return;
    }

    const { baseVersion, changes, action } = req.body ?? {};
    if (!["save_draft", "submit"].includes(action)) { res.status(400).json({ error: "action must be save_draft or submit" }); return; }
    if (!Number.isInteger(baseVersion)) { res.status(400).json({ error: "baseVersion is required" }); return; }

    const status = (row as any).reviewStatus ?? "draft";
    const lock = decideRevisionLock({
      status,
      draftOwnerId: (row as any).draftOwnerId ?? null,
      createdBy: (row as any).createdBy ?? null,
      actorId: ctx.userId,
      actorIsAdmin: isAdmin(ctx.role),
    });
    if (!lock.allowed) {
      const names = await userNames([lock.ownerId]);
      res.status(409).json({ code: "locked", error: lock.reason, ownerId: lock.ownerId, ownerName: lock.ownerId ? names.get(lock.ownerId) ?? null : null });
      return;
    }

    const current = contentOf(row as any);
    const currentVersion = (row as any).version ?? 1;
    if (baseVersion !== currentVersion) {
      const names = await userNames([(row as any).lastEditedBy]);
      res.status(409).json({
        code: "stale",
        error: "This requirement changed while you were editing",
        version: currentVersion,
        reviewStatus: status,
        content: snapshotView(current),
        lastEditedByName: (row as any).lastEditedBy ? names.get((row as any).lastEditedBy) ?? null : null,
      });
      return;
    }

    const next: Content = { ...current };
    if (changes?.title !== undefined) next.title = String(changes.title);
    if (changes?.description !== undefined) next.description = String(changes.description ?? "");
    if (changes?.priority !== undefined) next.priority = String(changes.priority);
    if (changes?.acceptanceCriteria !== undefined) next.acceptanceCriteria = parseCriteria(changes.acceptanceCriteria);
    if (!next.title.trim()) { res.status(400).json({ error: "Title is required" }); return; }
    if (!requirementPrioritySchema.safeParse(next.priority).success) { res.status(400).json({ error: "Invalid priority" }); return; }

    const diff = diffContent(current, next);
    // Attachments are uploaded through their own routes after this call; the
    // client names what it is about to add or remove so that, alone, it still
    // counts as a change worth sending back through review.
    const attachmentNotes: string[] = Array.isArray(req.body?.attachmentNotes) ? req.body.attachmentNotes.map(String).slice(0, 20) : [];
    if (Object.keys(diff).length === 0 && attachmentNotes.length === 0) { res.status(409).json({ code: "no_changes", error: "Nothing has changed" }); return; }

    // Keep what is approved so it can be restored, compared and shown.
    await ensureSnapshot(row);

    const submitting = action === "submit";
    const newVersion = currentVersion + 1;
    const [updated] = await db.update(requirementsTable).set({
      title: next.title.trim(),
      description: next.description,
      acceptanceCriteria: JSON.stringify(next.acceptanceCriteria),
      priority: next.priority,
      reviewStatus: submitting ? "in_review" : (status === "approved" || status === "in_review" ? "draft" : status),
      draftOwnerId: ctx.userId,
      lastEditedBy: ctx.userId,
      lastEditedAt: new Date(),
      version: newVersion,
    } as any).where(eq(requirementsTable.id, row.id)).returning();

    await logRevision({ requirementId: row.id, action: "edit", actorId: ctx.userId, changes: diff, remark: attachmentNotes.length ? `Attachments: ${attachmentNotes.join(", ")}` : null, version: newVersion });
    if (submitting) await logRevision({ requirementId: row.id, action: "submit", actorId: ctx.userId, version: newVersion });

    if (submitting && row.projectId != null) {
      await notifyRolesInProject({
        roles: await departmentRoleNames("fa"),
        projectId: row.projectId,
        module: row.module,
        title: "Requirement submitted for review",
        message: `"${next.title}" is waiting on your review${Object.keys(diff).length ? ` (${describeChanges(diff).join("; ")})` : ""}.`,
        type: "review_request",
        entityType: "requirement",
        entityId: row.id,
        actorId: ctx.userId,
        excludeUserIds: [ctx.userId, (row as any).createdBy].filter((x): x is number => x != null),
      }).catch(() => {});
    }

    res.json({
      id: updated.id,
      version: newVersion,
      reviewStatus: (updated as any).reviewStatus,
      content: snapshotView(next),
    });
  } catch (err: any) {
    console.error("[POST /requirements/:id/revision]", err);
    res.status(500).json({ error: err?.message ?? "Failed to save the requirement" });
  }
});

// POST /requirements/:id/takeover — an FA Lead (or admin) takes over a draft
// whose owner is away.
router.post("/requirements/:id/takeover", async (req, res): Promise<void> => {
  const loaded = await loadForUser(req, res);
  if (!loaded) return;
  const { ctx, row } = loaded;
  if (ctx.role !== "fa_lead" && !isAdmin(ctx.role) && (await getRoleTierRank(ctx.role)) < 3) {
    res.status(403).json({ error: "Only an FA Lead can take over a draft" }); return;
  }
  const status = (row as any).reviewStatus ?? "draft";
  if (status === "approved") { res.status(409).json({ error: "This requirement is approved; there is no draft to take over" }); return; }
  const previous = (row as any).draftOwnerId ?? (row as any).createdBy ?? null;
  if (previous === ctx.userId) { res.json({ ok: true }); return; }
  const version = ((row as any).version ?? 1) + 1;
  await db.update(requirementsTable).set({ draftOwnerId: ctx.userId, version } as any).where(eq(requirementsTable.id, row.id));
  await logRevision({ requirementId: row.id, action: "takeover", actorId: ctx.userId, remark: req.body?.remark, version });
  if (previous != null) {
    await notifyUser(previous, "Draft taken over", `Your draft of "${row.title}" was taken over by a lead.`, "requirement_takeover", "requirement", row.id, ctx.userId).catch(() => {});
  }
  res.json({ ok: true, version });
});

// POST /requirements/:id/discard-draft — back to what was last approved.
router.post("/requirements/:id/discard-draft", async (req, res): Promise<void> => {
  const loaded = await loadForUser(req, res);
  if (!loaded) return;
  const { ctx, row } = loaded;
  const status = (row as any).reviewStatus ?? "draft";
  if (status === "approved") { res.status(409).json({ error: "Nothing to discard: this requirement is approved" }); return; }
  const owner = (row as any).draftOwnerId ?? (row as any).createdBy ?? null;
  if (owner !== ctx.userId && ctx.role !== "fa_lead" && !isAdmin(ctx.role)) {
    res.status(403).json({ error: "Only the draft's owner, or an FA Lead, can discard it" }); return;
  }
  const snap = await getSnapshot(row.id);
  if (!snap) { res.status(409).json({ error: "This requirement has never been approved, so there is no approved version to go back to" }); return; }
  const version = ((row as any).version ?? 1) + 1;
  await db.update(requirementsTable).set({
    title: snap.title,
    description: snap.description,
    acceptanceCriteria: JSON.stringify(snap.acceptanceCriteria),
    priority: snap.priority,
    reviewStatus: "approved",
    draftOwnerId: null,
    version,
  } as any).where(eq(requirementsTable.id, row.id));
  await logRevision({ requirementId: row.id, action: "discard", actorId: ctx.userId, remark: "Draft discarded; restored the approved version", changes: diffContent(contentOf(row as any), snap), version });
  res.json({ ok: true, version });
});

// GET /requirements/:id/revision-log — newest first, expandable detail.
router.get("/requirements/:id/revision-log", async (req, res): Promise<void> => {
  const loaded = await loadForUser(req, res);
  if (!loaded) return;
  const { row } = loaded;
  const rows = await db.select().from(requirementRevisionLogTable)
    .where(eq(requirementRevisionLogTable.requirementId, row.id))
    .orderBy(desc(requirementRevisionLogTable.createdAt), desc(requirementRevisionLogTable.id));
  const out = rows.map((r) => {
    let changes: any = null;
    try { changes = r.changes ? JSON.parse(r.changes) : null; } catch { /* leave null */ }
    return {
      id: r.id,
      action: r.action,
      actorName: r.actorName,
      remark: r.remark,
      summary: changes ? describeChanges(changes) : [],
      changes,
      createdAt: r.createdAt.toISOString(),
    };
  });
  // Requirements made before the log existed still have a known author.
  if (!out.some((e) => e.action === "create")) {
    const names = await userNames([(row as any).createdBy]);
    out.push({ id: -1, action: "create", actorName: (row as any).createdBy ? names.get((row as any).createdBy) ?? null : null, remark: null, summary: [], changes: null, createdAt: row.createdAt.toISOString() });
  }
  const authorNames = await userNames([(row as any).createdBy, (row as any).lastEditedBy, (row as any).draftOwnerId]);
  res.json({
    authorName: (row as any).createdBy ? authorNames.get((row as any).createdBy) ?? null : null,
    lastEditedByName: (row as any).lastEditedBy ? authorNames.get((row as any).lastEditedBy) ?? null : null,
    draftOwnerId: (row as any).draftOwnerId ?? null,
    draftOwnerName: (row as any).draftOwnerId ? authorNames.get((row as any).draftOwnerId) ?? null : null,
    version: (row as any).version ?? 1,
    entries: out,
  });
});

// GET /requirements/:id/approved-version — what was last approved, if anything.
router.get("/requirements/:id/approved-version", async (req, res): Promise<void> => {
  const loaded = await loadForUser(req, res);
  if (!loaded) return;
  const snap = await getSnapshot(loaded.row.id);
  res.json(snap ? snapshotView(snap) : null);
});

export default router;
