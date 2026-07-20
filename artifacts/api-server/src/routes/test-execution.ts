import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, notInArray, ilike } from "drizzle-orm";
import {
  db,
  executionFilesTable,
  executionModulesTable,
  executionTestCasesTable,
  executionTcHistoryTable,
  executionSummariesTable,
  executionFileAuditTable,
  trackersTable,
  usersTable,
  requirementsTable,
  testCasesTable,
  milestonesTable,
  notificationsTable,
  projectMembersTable,
} from "@workspace/db";
import { verifyToken, actorFromReq } from "./auth";
import { getAuthContext, scopeToUserProjects, canAccessProject, getModuleScope } from "../middleware/access";
import { logActivity } from "./_audit";
import { notifyUser } from "./_notify";
import { syncRedmineTicket, resolveApiKeyFromToken } from "./requirements";
import { buildTestCaseExcel, trackerCode, runCapaAI } from "./excel-builder";
import { fetchActiveDefectsForIssue } from "./pmo-report";

const router: IRouter = Router();

// CR014 access control (per-route, not router-level, because /execution-events
// is an SSE stream the browser's EventSource opens without headers).
function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return ctx;
}

// Files with no project are legacy rows that predate project scoping — visible
// to any authenticated user. Scoping applies only to project-tagged files.
async function canAccessFileProject(
  ctx: { userId: number; role: string },
  projectId: number | null | undefined,
): Promise<boolean> {
  if (projectId == null) return true;
  return canAccessProject(ctx.userId, ctx.role, projectId);
}

// An execution file can be created without a milestone (add/edit test cases
// still works fine), but it may not RECORD a real result until one is
// linked — otherwise a defect raised off that row (see defects.ts's
// executionTcId → milestone resolution) would permanently have no
// milestone, since a file's milestone can't be backfilled onto rows that
// already recorded results before one existed. "Not Executed" and empty/
// null are not real results — they're the unstarted state, not an outcome.
function hasRealResult(result: unknown): boolean {
  if (typeof result !== "string") return false;
  const trimmed = result.trim();
  return trimmed !== "" && trimmed.toLowerCase() !== "not executed";
}

// --- 1. SETUP SERVER-SENT EVENTS (SSE) CLIENTS ---
const clients = new Set<any>();

// Deliberately unauthenticated: EventSource cannot send an Authorization
// header, and the stream only emits {ticketId, type:"UPDATED"} pings — no
// test data. Revisit if the payload ever grows.
router.get("/execution-events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

const broadcastUpdate = (ticketId: string) => {
  clients.forEach((client) => {
    // CR050 — a dead SSE client throwing on write must not 500 the save that
    // triggered this broadcast; drop the client instead.
    try {
      client.write(`data: ${JSON.stringify({ ticketId, type: "UPDATED" })}\n\n`);
    } catch {
      clients.delete(client);
    }
  });
};

/* ────────────────────────────────
   MODULES
   ──────────────────────────────── */

router.get("/modules", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const modules = await db.select().from(executionModulesTable);
    res.json(
      modules.map((m) => ({
        id: m.id,
        name: m.name,
        createdAt: m.createdAt,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch modules" });
  }
});

router.post("/modules", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const [mod] = await db
      .insert(executionModulesTable)
      .values({ name: name.trim() })
      .returning();
    res
      .status(201)
      .json({ id: mod.id, name: mod.name, createdAt: mod.createdAt });
  } catch {
    res.status(500).json({ error: "Failed to add module" });
  }
});

router.delete("/modules/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(executionModulesTable)
      .where(eq(executionModulesTable.id, id));

    // CR050 — a member scoped to this module (CR044 module_ids / legacy
    // module_id) would otherwise be left referencing a dead id, which
    // getModuleScope reads as {restricted:true, moduleNames:[]} → they see
    // nothing in the project. Drop the id from every grant; an empty scope
    // falls back to whole-project, matching pre-CR044 behavior.
    await db.update(projectMembersTable).set({ moduleId: null }).where(eq(projectMembersTable.moduleId, id));
    await db.update(projectMembersTable)
      .set({ moduleIds: sql`NULLIF(array_remove(${projectMembersTable.moduleIds}, ${id}), '{}')` })
      .where(sql`${projectMembersTable.moduleIds} @> ARRAY[${id}]::integer[]`);

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete module" });
  }
});

router.patch("/modules/:id", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const [updatedModule] = await db
      .update(executionModulesTable)
      .set({ name: name.trim() })
      .where(eq(executionModulesTable.id, id))
      .returning();

    if (!updatedModule) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    res.json({
      id: updatedModule.id,
      name: updatedModule.name,
      createdAt: updatedModule.createdAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to update module" });
  }
});

/* ────────────────────────────────
   EXECUTION FILES
   ──────────────────────────────── */

router.get("/execution-files", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    let files = await db.select().from(executionFilesTable);
    if (accessible !== null) {
      files = files.filter((f) => f.projectId == null || accessible.includes(f.projectId));
    }

    const milestoneIds = [...new Set(files.map((f) => (f as any).milestoneId).filter((id): id is number => id != null))];
    const milestoneById = new Map(
      milestoneIds.length
        ? (await db.select().from(milestonesTable).where(inArray(milestonesTable.id, milestoneIds))).map((m) => [m.id, m])
        : [],
    );

    res.json(
      files.map((f) => {
        const milestone = (f as any).milestoneId != null ? milestoneById.get((f as any).milestoneId) : undefined;
        return {
          id: f.id,
          redmineTicketId: f.redmineTicketId,
          title: f.title,
          qaPic: f.qaPic,
          remarks: f.remarks,
          selectedModules: f.selectedModules,
          tracker: f.tracker,
          projectId: f.projectId,
          requirementId: f.requirementId,
          milestoneId: (f as any).milestoneId ?? null,
          milestoneName: milestone?.name ?? null,
          milestonePriority: (milestone as any)?.priority ?? null,
          milestoneStatus: milestone?.status ?? null,
          fileType: (f as any).fileType ?? "qa",
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        };
      }),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch execution files" });
  }
});

// Returns aggregated execution progress per redmine ticket ID (full breakdown).
// Computed live from execution_test_cases, NOT executionSummariesTable — that
// table is only ever refreshed as a side effect of the test-cases save
// endpoint (below), so anything that lands in the DB another way (a seed
// script's timing, a restore, a manual fix) leaves it stale/empty while the
// real results already exist. Recomputing here removes that whole class of
// drift instead of requiring another one-off repair script.
router.get("/execution-progress", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    const files = await db
      .select({ id: executionFilesTable.id, redmineTicketId: executionFilesTable.redmineTicketId, projectId: executionFilesTable.projectId })
      .from(executionFilesTable);
    const visibleFiles = accessible === null
      ? files
      : files.filter((f) => f.projectId == null || accessible.includes(f.projectId));
    if (visibleFiles.length === 0) { res.json({}); return; }

    const fileIds = visibleFiles.map((f) => f.id);
    const ticketByFileId = new Map(visibleFiles.map((f) => [f.id, f.redmineTicketId]));

    const tcRows = await db
      .select({ executionFileId: executionTestCasesTable.executionFileId, result: executionTestCasesTable.result })
      .from(executionTestCasesTable)
      .where(inArray(executionTestCasesTable.executionFileId, fileIds));

    const agg: Record<string, { total: number; passed: number; failed: number; blocked: number; inProgress: number; notExecuted: number }> = {};
    for (const row of tcRows) {
      const ticketId = ticketByFileId.get(row.executionFileId);
      if (!ticketId) continue;
      if (!agg[ticketId]) agg[ticketId] = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };
      const bucket = agg[ticketId];
      bucket.total += 1;
      const result = (row.result?.trim() || "").toLowerCase();
      if (result === "passed") bucket.passed += 1;
      else if (result === "failed") bucket.failed += 1;
      else if (result === "blocked") bucket.blocked += 1;
      else if (result === "in progress") bucket.inProgress += 1;
      else bucket.notExecuted += 1;
    }
    res.json(agg);
  } catch {
    res.status(500).json({ error: "Failed to fetch execution progress" });
  }
});

// ─── Trackers (synced from Redmine) ──────────────────────────────────────────

router.get("/trackers", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const trackers = await db.select().from(trackersTable).orderBy(trackersTable.name);
    res.json(trackers);
  } catch {
    res.status(500).json({ error: "Failed to fetch trackers" });
  }
});

router.post("/trackers/sync", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const apiKey = (req.headers["x-redmine-user-key"] as string | undefined) || process.env.REDMINE_API_KEY || "";
    const redmineUrl = process.env.REDMINE_URL || "https://redmine.bestinet.my";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Redmine-API-Key"] = apiKey;

    const response = await fetch(`${redmineUrl}/trackers.json`, { headers });
    if (!response.ok) throw new Error(`Redmine returned ${response.status}`);
    const data = await response.json();
    const redmineTrackers: { id: number; name: string }[] = data.trackers ?? [];

    for (const t of redmineTrackers) {
      await db
        .insert(trackersTable)
        .values({ redmineId: t.id, name: t.name })
        .onConflictDoUpdate({ target: trackersTable.redmineId, set: { name: t.name } });
    }

    const stored = await db.select().from(trackersTable).orderBy(trackersTable.name);
    res.json({ synced: redmineTrackers.length, trackers: stored });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to sync trackers: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.post("/execution-files", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { redmineTicketId, title, qaPic, remarks, selectedModules, tracker, projectId, requirementId, milestoneId, fileType } = req.body;
    if (!redmineTicketId || !redmineTicketId.trim()) {
      res.status(400).json({ error: "Redmine Ticket ID is required" });
      return;
    }
    if (!milestoneId) {
      res.status(400).json({ error: "Milestone is required" });
      return;
    }
    if (projectId && !(await canAccessProject(ctx.userId, ctx.role, Number(projectId)))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const [file] = await db
      .insert(executionFilesTable)
      .values({
        redmineTicketId: redmineTicketId.trim(),
        title: title || null,
        qaPic: qaPic || null,
        remarks: remarks || null,
        selectedModules: selectedModules || null,
        tracker: tracker || null,
        projectId: projectId ? Number(projectId) : null,
        requirementId: requirementId ? Number(requirementId) : null,
        milestoneId: milestoneId ? Number(milestoneId) : null,
        fileType: fileType || "qa",
      } as any)
      .returning();
    // Audit: log execution file creation
    let creatorName: string | null = null;
    const createAuth = req.headers.authorization;
    if (createAuth?.startsWith("Bearer ")) {
      try {
        const userId = verifyToken(createAuth.slice(7)).id;
        const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
        if (u) creatorName = u.name;
      } catch {}
    }
    await db.insert(executionFileAuditTable).values({
      executionFileId: file.id,
      updatedByName: creatorName,
      summary: "Draft Test Case file for execution",
      tcCount: 0,
    }).catch(() => {});

    // CR045 — a file created with the QA PIC already set notifies them too,
    // not just the PATCH path (which only fires when the PIC changes later).
    if (file.qaPic) {
      let actorId: number | null = null;
      try { actorId = verifyToken(req.headers.authorization?.slice(7) ?? "").id; } catch {}
      // CR050 — case-insensitive match; qaPic is a free-text name that may
      // differ in casing from the QAPulse user record.
      const [picUser] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.name, file.qaPic));
      if (picUser) {
        await notifyUser(picUser.id, "Assigned as QA PIC", `You have been assigned as QA PIC for execution file "${file.title || file.redmineTicketId}".`, "execution", "execution_file", file.id, actorId).catch(() => {});
      }
    }

    res.status(201).json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      tracker: file.tracker,
      projectId: file.projectId,
      requirementId: file.requirementId,
      milestoneId: (file as any).milestoneId ?? null,
      fileType: (file as any).fileType ?? "qa",
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch (err: any) {
    // PostgreSQL unique_violation code 23505 — drizzle-orm wraps driver
    // errors in DrizzleQueryError, so both the code and the real message
    // live at err.cause, not on err itself.
    if (err?.code === "23505" || err?.cause?.code === "23505" || err?.message?.includes("unique") || err?.cause?.message?.includes("unique")) {
      res.status(409).json({ error: `An execution file for ticket #${req.body.redmineTicketId} already exists` });
      return;
    }
    console.error("[execution-files POST]", err);
    res.status(500).json({ error: "Failed to create execution file" });
  }
});

router.patch("/execution-files/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [currentFile] = await db
      .select({ projectId: executionFilesTable.projectId })
      .from(executionFilesTable)
      .where(eq(executionFilesTable.id, id));
    if (!currentFile) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    if (!(await canAccessFileProject(ctx, currentFile.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const { selectedModules, title, redmineTicketId, remarks, tracker, projectId, requirementId, qaPic, milestoneId } = req.body;
    // Moving the file to another project also requires access to the target
    if (projectId && !(await canAccessProject(ctx.userId, ctx.role, Number(projectId)))) {
      res.status(403).json({ error: "Access denied to the target project" });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (selectedModules !== undefined) patch.selectedModules = selectedModules || null;
    if (title !== undefined) patch.title = title || null;
    if (redmineTicketId !== undefined) patch.redmineTicketId = String(redmineTicketId).trim();
    if (remarks !== undefined) patch.remarks = remarks || null;
    if (tracker !== undefined) patch.tracker = tracker || null;
    if (projectId !== undefined) patch.projectId = projectId ? Number(projectId) : null;
    if (requirementId !== undefined) patch.requirementId = requirementId ? Number(requirementId) : null;
    if (qaPic !== undefined) patch.qaPic = qaPic || null;
    // Milestone can only ever be set at creation today otherwise — this is
    // the only way to link one onto a file created without one, which is
    // required before any row on it can carry a real result (see the
    // milestone guard in the test-cases upsert/clone handlers below).
    if (milestoneId !== undefined) patch.milestoneId = milestoneId ? Number(milestoneId) : null;

    // Get previous qaPic to detect changes for notification
    const [prevFile] = await db.select({ qaPic: executionFilesTable.qaPic }).from(executionFilesTable).where(eq(executionFilesTable.id, id));

    // Auto-link requirement by Redmine ticket ID when not explicitly set
    if (requirementId === undefined || requirementId === "" || requirementId === null) {
      const effectiveTicketId = redmineTicketId !== undefined
        ? String(redmineTicketId).trim()
        : (await db.select({ redmineTicketId: executionFilesTable.redmineTicketId })
            .from(executionFilesTable).where(eq(executionFilesTable.id, id))
          ).at(0)?.redmineTicketId ?? null;

      if (effectiveTicketId) {
        const [existingReq] = await db.select({ id: requirementsTable.id })
          .from(requirementsTable)
          .where(eq(requirementsTable.redmineTicketId, effectiveTicketId));

        if (existingReq) {
          patch.requirementId = existingReq.id;
        } else {
          // Try to fetch and create requirement from Redmine
          try {
            const importingUserId = actorFromReq(req);
            if (!importingUserId) throw new Error("Unauthenticated — cannot resolve a createdBy fallback for the imported requirement");

            const effectiveProjectId = projectId !== undefined
              ? (projectId ? Number(projectId) : null)
              : (await db.select({ projectId: executionFilesTable.projectId })
                  .from(executionFilesTable).where(eq(executionFilesTable.id, id))
                ).at(0)?.projectId ?? null;

            const effectiveModules = selectedModules !== undefined
              ? selectedModules
              : (await db.select({ selectedModules: executionFilesTable.selectedModules })
                  .from(executionFilesTable).where(eq(executionFilesTable.id, id))
                ).at(0)?.selectedModules ?? null;

            // The execution file already carries its own milestone (required
            // at creation) — the auto-imported requirement inherits it too.
            const effectiveMilestoneId = (
              await db.select({ milestoneId: executionFilesTable.milestoneId })
                .from(executionFilesTable).where(eq(executionFilesTable.id, id))
            ).at(0)?.milestoneId ?? undefined;

            const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
            const savedId = await syncRedmineTicket(
              effectiveTicketId,
              effectiveModules ?? undefined,
              effectiveProjectId ?? undefined,
              undefined,
              tracker || undefined,
              effectiveMilestoneId ?? undefined,
              apiKey,
              importingUserId,
            );
            if (savedId) patch.requirementId = savedId;
          } catch (syncErr: any) {
            // Non-fatal: proceed with save even if Redmine sync fails
            console.warn("[execution-files PATCH] Redmine requirement sync failed:", syncErr?.message);
          }
        }
      }
    }

    const [updated] = await db
      .update(executionFilesTable)
      .set(patch)
      .where(eq(executionFilesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Notify new QA PIC if changed
    if (updated.qaPic && updated.qaPic !== prevFile?.qaPic) {
      let actorId: number | null = null;
      try { actorId = verifyToken(req.headers.authorization?.slice(7) ?? "").id; } catch {}
      const [picUser] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.name, updated.qaPic));
      if (picUser) {
        // CR050 — best-effort: a notification failure must not 500 an
        // otherwise-successful file update.
        await notifyUser(picUser.id, "Assigned as QA PIC", `You have been assigned as QA PIC for execution file "${updated.title || updated.redmineTicketId}".`, "execution", "execution_file", updated.id, actorId).catch(() => {});
      }
    }

    res.json({
      id: updated.id,
      redmineTicketId: updated.redmineTicketId,
      title: updated.title,
      qaPic: updated.qaPic,
      remarks: updated.remarks,
      selectedModules: updated.selectedModules,
      tracker: updated.tracker,
      projectId: updated.projectId,
      requirementId: updated.requirementId,
      milestoneId: (updated as any).milestoneId ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err: any) {
    // drizzle-orm wraps driver errors in DrizzleQueryError — the real pg
    // code/message live at err.cause, not on err itself.
    if (err?.code === "23505" || err?.cause?.code === "23505" || err?.message?.includes("unique") || err?.cause?.message?.includes("unique")) {
      res.status(409).json({ error: "An execution file with that Redmine ticket ID already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to update execution file" });
  }
});

router.get("/execution-files/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [file] = await db
      .select()
      .from(executionFilesTable)
      .where(eq(executionFilesTable.id, id));
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    if (!(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    res.json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      projectId: file.projectId,
      requirementId: file.requirementId,
      milestoneId: (file as any).milestoneId ?? null,
      fileType: (file as any).fileType ?? "qa",
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch execution file" });
  }
});

router.delete("/execution-files/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    // Look up the ticket ID before deleting so we can clean up orphaned summaries
    const [file] = await db
      .select({ redmineTicketId: executionFilesTable.redmineTicketId, projectId: executionFilesTable.projectId })
      .from(executionFilesTable)
      .where(eq(executionFilesTable.id, id));
    if (file && !(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    await db.delete(executionFilesTable).where(eq(executionFilesTable.id, id));

    if (file?.redmineTicketId) {
      await db.delete(executionSummariesTable).where(eq(executionSummariesTable.redmineTicketId, file.redmineTicketId));
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete execution file" });
  }
});

/* ────────────────────────────────
   CLONE EXECUTION FILE
   ──────────────────────────────── */

router.post("/execution-files/:ticketId/clone", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { ticketId } = req.params;
    const { newTicketId, newTitle, resetResults = true, copyQaPic = true, module: targetModule, projectId: targetProjectId, trackerFilter, milestoneId: targetMilestoneId } = req.body;

    if (!newTicketId?.trim()) {
      res.status(400).json({ error: "New Ticket ID is required" });
      return;
    }

    const [sourceFile] = await db.select().from(executionFilesTable)
      .where(eq(executionFilesTable.redmineTicketId, ticketId));
    if (!sourceFile) {
      res.status(404).json({ error: "Source execution file not found" });
      return;
    }
    if (!(await canAccessFileProject(ctx, sourceFile.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    if (targetProjectId && !(await canAccessProject(ctx.userId, ctx.role, Number(targetProjectId)))) {
      res.status(403).json({ error: "Access denied to the target project" });
      return;
    }

    // Falls back to the source file's own milestone (same pattern as
    // tracker/module below) rather than always starting null — but if the
    // caller explicitly clears it (or the source never had one), copying
    // real results over would leave them permanently unable to trace back
    // to a milestone (see the upsert handler's same guard).
    const resolvedMilestoneId = targetMilestoneId !== undefined
      ? (targetMilestoneId ? Number(targetMilestoneId) : null)
      : ((sourceFile as any).milestoneId ?? null);
    if (!resetResults && resolvedMilestoneId == null) {
      res.status(409).json({
        error: "Cannot copy existing results into a clone with no milestone — link a milestone (or clone with resetResults) first.",
      });
      return;
    }

    const sourceTcs = await db.select().from(executionTestCasesTable)
      .where(eq(executionTestCasesTable.executionFileId, sourceFile.id));

    // Check if new ticket already exists locally as a requirement
    const [existingReq] = await db.select().from(requirementsTable)
      .where(eq((requirementsTable).redmineTicketId, newTicketId.trim()))
      .catch(() => [undefined]);

    let requirementId: number | undefined = existingReq?.id;
    let resolvedTitle = newTitle?.trim() || existingReq?.title || sourceFile.title;
    let resolvedProjectId = targetProjectId ? Number(targetProjectId) : (existingReq?.projectId ?? sourceFile.projectId);
    let resolvedTracker = trackerFilter || existingReq?.tracker || sourceFile.tracker;
    let resolvedModules = targetModule || existingReq?.module || sourceFile.selectedModules;

    // If not found locally and module+projectId provided, sync from Redmine
    if (!existingReq && targetModule && targetProjectId) {
      try {
        const importingUserId = actorFromReq(req);
        if (!importingUserId) throw new Error("Unauthenticated — cannot resolve a createdBy fallback for the imported requirement");

        const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
        const savedId = await syncRedmineTicket(
          newTicketId.trim(),
          targetModule,
          Number(targetProjectId),
          undefined,
          trackerFilter || undefined,
          sourceFile.milestoneId ?? undefined,
          apiKey,
          importingUserId,
        );
        requirementId = savedId;
        // Re-fetch to get the synced title
        const [synced] = await db.select().from(requirementsTable).where(eq((requirementsTable).id, savedId!)).catch(() => [undefined]);
        if (synced) {
          resolvedTitle = newTitle?.trim() || synced.title || sourceFile.title;
          resolvedTracker = synced.tracker || resolvedTracker;
        }
      } catch (syncErr: any) {
        // Non-fatal: continue with clone even if Redmine sync fails
        console.warn("[clone] Redmine sync failed:", syncErr?.message);
      }
    }

    const [newFile] = await db.insert(executionFilesTable).values({
      redmineTicketId: newTicketId.trim(),
      title: resolvedTitle,
      qaPic: sourceFile.qaPic,
      remarks: sourceFile.remarks,
      selectedModules: typeof resolvedModules === "string" ? resolvedModules : (targetModule || sourceFile.selectedModules),
      tracker: resolvedTracker,
      projectId: resolvedProjectId ?? null,
      requirementId: requirementId ?? null,
      milestoneId: resolvedMilestoneId,
    }).returning();

    if (sourceTcs.length > 0) {
      await db.insert(executionTestCasesTable).values(
        sourceTcs.map(tc => ({
          executionFileId: newFile.id,
          moduleName: targetModule || tc.moduleName,
          caseId: tc.caseId,
          testCaseId: tc.testCaseId,
          libraryTcId: tc.libraryTcId,
          userStory: tc.userStory,
          requirementId: tc.requirementId,
          tracker: trackerFilter || (tc as any).tracker,
          scenario: tc.scenario,
          preCondition: tc.preCondition,
          caseName: tc.caseName,
          testSteps: tc.testSteps,
          testData: tc.testData,
          expectedResult: tc.expectedResult,
          rowOrder: tc.rowOrder,
          qaPic: copyQaPic ? tc.qaPic : null,
          result: resetResults ? null : tc.result,
          executedAt: resetResults ? null : tc.executedAt,
          actualResult: resetResults ? null : tc.actualResult,
          defectNumber: null,
          defectScreenshots: null,
          comments: resetResults ? null : tc.comments,
        }))
      );
    }

    res.status(201).json({
      id: newFile.id,
      redmineTicketId: newFile.redmineTicketId,
      title: newFile.title,
      milestoneId: (newFile as any).milestoneId ?? null,
      clonedFrom: ticketId,
      tcCount: sourceTcs.length,
    });
  } catch (err: any) {
    // drizzle-orm wraps driver errors in DrizzleQueryError — the real pg
    // code/message live at err.cause, not on err itself.
    if (err?.code === "23505" || err?.cause?.code === "23505" || err?.message?.includes("unique") || err?.cause?.message?.includes("unique")) {
      res.status(409).json({ error: `An execution file for ticket #${req.body.newTicketId} already exists` });
      return;
    }
    console.error("[clone-execution-file]", err);
    res.status(500).json({ error: "Failed to clone execution file" });
  }
});

/* ────────────────────────────────
   EXECUTION SUMMARIES (by Redmine ticket ID)
   ──────────────────────────────── */

router.get("/execution-files/:ticketId/summaries", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { ticketId } = req.params;
    const [file] = await db
      .select({ projectId: executionFilesTable.projectId })
      .from(executionFilesTable)
      .where(eq(executionFilesTable.redmineTicketId, ticketId));
    if (file && !(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const rows = await db.select().from(executionSummariesTable)
      .where(eq(executionSummariesTable.redmineTicketId, ticketId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch summaries" });
  }
});

/* ────────────────────────────────
   TEST CASES (by Redmine ticket ID)
   ──────────────────────────────── */

router.get(
  "/execution-files/:ticketId/test-cases",
  async (req, res): Promise<void> => {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    try {
      const ticketId = req.params.ticketId;
      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, ticketId));

      if (!file) {
        res.json({ testCases: [], lastUpdatedAt: null });
        return;
      }
      if (!(await canAccessFileProject(ctx, file.projectId))) {
        res.status(403).json({ error: "Access denied to this project" });
        return;
      }

      let testCases = await db
        .select()
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      // CR035 — module-scope. A single file belongs to one project, so one lookup suffices.
      if (file.projectId != null) {
        const moduleScope = await getModuleScope(ctx.userId, ctx.role, file.projectId);
        if (moduleScope.restricted) {
          testCases = testCases.filter((t) => t.moduleName != null && moduleScope.moduleNames.includes(t.moduleName));
        }
      }

      // CR023p4 — flag rows whose library test case's linked requirement was
      // revised since this execution instance last acknowledged a revision
      const libTcIds = [...new Set(testCases.map((t) => t.libraryTcId).filter((v): v is number => v != null))];
      const revisedMap = new Map<number, Date>();
      if (libTcIds.length > 0) {
        const revisedRows = await db
          .select({ id: testCasesTable.id, requirementRevisedAt: testCasesTable.requirementRevisedAt })
          .from(testCasesTable)
          .where(inArray(testCasesTable.id, libTcIds));
        for (const row of revisedRows) {
          if (row.requirementRevisedAt) revisedMap.set(row.id, row.requirementRevisedAt);
        }
      }

      res.json({
        lastUpdatedAt: file.updatedAt,
        testCases: testCases.map((t) => {
          const revisedAt = t.libraryTcId != null ? revisedMap.get(t.libraryTcId) : undefined;
          const reviewAcknowledgedAt = (t as any).reviewAcknowledgedAt ?? null;
          const alertRevised = !!revisedAt && (!reviewAcknowledgedAt || new Date(reviewAcknowledgedAt) < revisedAt);
          return {
            id: t.id,
            moduleName: t.moduleName,
            caseId: t.caseId,
            testCaseId: t.testCaseId,
            libraryTcId: t.libraryTcId,
            userStory: t.userStory,
            requirementId: t.requirementId,
            tracker: (t as any).tracker,
            scenario: t.scenario,
            preCondition: t.preCondition,
            caseName: t.caseName,
            testSteps: t.testSteps,
            testData: t.testData,
            expectedResult: t.expectedResult,
            result: t.result,
            actualResult: t.actualResult,
            defectNumber: t.defectNumber,
            defectScreenshots: t.defectScreenshots,
            comments: t.comments,
            qaPic: t.qaPic,
            rowOrder: t.rowOrder,
            rowType: t.rowType,
            reviewAcknowledgedAt,
            alertRevised,
          };
        }),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch test cases" });
    }
  },
);

router.post(
  "/execution-files/:ticketId/test-cases",
  async (req, res): Promise<void> => {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    try {
      const ticketId = req.params.ticketId;
      // testCases: rows to upsert (dirty rows for auto-save, all rows for full sync)
      // deletedIds: numeric DB row IDs to explicitly delete
      // isFullSync: if true, also delete DB rows whose IDs are not in testCases
      const { testCases, deletedIds = [], isFullSync = false } = req.body;
      if (!Array.isArray(testCases)) {
        res.status(400).json({ error: "testCases array required" });
        return;
      }

      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, ticketId));

      if (!file) {
        res.status(404).json({ error: "Execution file not found" });
        return;
      }
      if (!(await canAccessFileProject(ctx, file.projectId))) {
        res.status(403).json({ error: "Access denied to this project" });
        return;
      }

      // A file with no milestone can still be built out (add/edit rows,
      // steps, expected results) — it just can't record a real outcome yet.
      // Structural fields never carry a "result", so this only blocks the
      // rows that are genuinely trying to log Pass/Fail/Blocked/etc.
      if ((file as any).milestoneId == null && testCases.some((t: any) => hasRealResult(t?.result))) {
        res.status(409).json({
          error: "This execution file has no milestone linked — link one before recording test results. You can still add or edit test cases.",
        });
        return;
      }

      // 0. Capture current rows for history diff + audit + upsert decisions
      const existingRows = await db
        .select({
          id: executionTestCasesTable.id,
          testCaseId: executionTestCasesTable.testCaseId,
          result: executionTestCasesTable.result,
          executedAt: executionTestCasesTable.executedAt,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      type ExistingState = { result: string | null; executedAt: Date | null };
      const existingMap = new Map<string, ExistingState>(
        existingRows
          .filter((r) => r.testCaseId)
          .map((r) => [r.testCaseId!, { result: r.result ?? null, executedAt: r.executedAt ?? null }]),
      );
      const existingDbIdSet = new Set(existingRows.map((r) => r.id));
      const oldTcIdSet = new Set(existingRows.map((r) => r.testCaseId).filter(Boolean) as string[]);

      // Extract changedBy from JWT if present
      let changedBy: number | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          changedBy = verifyToken(authHeader.slice(7)).id;
        } catch {}
      }

      // 1. Delete explicitly removed rows (only those belonging to this file)
      const safeDeleteIds = (deletedIds as any[])
        .map((id: any) => Number(id))
        .filter((id: number) => !isNaN(id) && existingDbIdSet.has(id));

      let removedTCCount = 0;
      if (safeDeleteIds.length > 0) {
        removedTCCount = existingRows.filter((r) => safeDeleteIds.includes(r.id) && r.testCaseId).length;
        await db.delete(executionTestCasesTable).where(
          and(
            eq(executionTestCasesTable.executionFileId, file.id),
            inArray(executionTestCasesTable.id, safeDeleteIds),
          ),
        );
      }

      // 1b. Full-sync: also delete DB rows not present in the incoming testCases array
      if (isFullSync && testCases.length > 0) {
        const incomingDbIds = testCases
          .map((t: any) => (typeof t.id === "number" ? t.id : null))
          .filter((id: number | null): id is number => id !== null && existingDbIdSet.has(id));
        const orphanIds = existingRows
          .map((r) => r.id)
          .filter((id) => !incomingDbIds.includes(id) && !safeDeleteIds.includes(id));
        if (orphanIds.length > 0) {
          removedTCCount += existingRows.filter((r) => orphanIds.includes(r.id) && r.testCaseId).length;
          await db.delete(executionTestCasesTable).where(
            and(
              eq(executionTestCasesTable.executionFileId, file.id),
              inArray(executionTestCasesTable.id, orphanIds),
            ),
          );
        }
      }

      // 2. Auto-assign TC IDs — find the highest existing sequence number
      let nextSeq = 1;
      for (const r of existingRows) {
        const match = r.testCaseId ? /TC-\d+-(\d+)/.exec(r.testCaseId) : null;
        if (match) {
          const n = parseInt(match[1], 10);
          if (n >= nextSeq) nextSeq = n + 1;
        }
      }
      for (const t of testCases) {
        const match = t.testCaseId ? /TC-\d+-(\d+)/.exec(t.testCaseId) : null;
        if (match) {
          const n = parseInt(match[1], 10);
          if (n >= nextSeq) nextSeq = n + 1;
        }
      }

      // 3. Upsert incoming rows — UPDATE if DB id exists, INSERT if new
      const insertedRows: any[] = [];
      const processedCases: any[] = [];
      const now = new Date();

      for (let idx = 0; idx < testCases.length; idx++) {
        const t = testCases[idx];
        const dbId = typeof t.id === "number" && existingDbIdSet.has(t.id) ? t.id : null;

        const isGroupTag = t.rowType === "group";
        let tcId: string = t.testCaseId || "";
        if (!tcId && !isGroupTag) {
          tcId = `TC-${ticketId}-${String(nextSeq).padStart(3, "0")}`;
          nextSeq++;
        }

        const existing = existingMap.get(tcId);
        const newResult = (t.result?.trim() || null) as string | null;
        const computedExecutedAt =
          newResult && existing?.result !== newResult
            ? now
            : (existing?.executedAt ?? (t.executedAt ? new Date(t.executedAt) : null));

        const rowData: any = {
          executionFileId: file.id,
          moduleName: t.moduleName || null,
          caseId: t.caseId || null,
          testCaseId: tcId,
          libraryTcId: t.libraryTcId ? Number(t.libraryTcId) : null,
          userStory: t.userStory || null,
          requirementId: t.requirementId ? Number(t.requirementId) : null,
          tracker: t.tracker || null,
          scenario: t.scenario || null,
          preCondition: t.preCondition || null,
          caseName: t.caseName || null,
          testSteps: t.testSteps || null,
          testData: t.testData || null,
          expectedResult: t.expectedResult || null,
          result: newResult,
          executedAt: computedExecutedAt,
          actualResult: t.actualResult || null,
          defectNumber: t.defectNumber || null,
          defectScreenshots: t.defectScreenshots || null,
          comments: t.comments || null,
          qaPic: t.qaPic || null,
          rowOrder: t.rowOrder ?? idx,
          rowType: isGroupTag ? "group" : "testcase",
        };
        // CR023p4 — "Revised" action acks this execution instance's requirement
        // revision alert; only set when the client explicitly sends it so a
        // routine autosave never clobbers an existing acknowledgment.
        if (t.reviewAcknowledgedAt !== undefined) {
          rowData.reviewAcknowledgedAt = t.reviewAcknowledgedAt ? new Date(t.reviewAcknowledgedAt) : null;
        }

        if (dbId !== null) {
          const [updated] = await db
            .update(executionTestCasesTable)
            .set(rowData)
            .where(
              and(
                eq(executionTestCasesTable.id, dbId),
                eq(executionTestCasesTable.executionFileId, file.id),
              ),
            )
            .returning();
          if (updated) processedCases.push({ ...t, testCaseId: tcId });
        } else {
          const [inserted] = await db
            .insert(executionTestCasesTable)
            .values(rowData)
            .returning();
          if (inserted) {
            insertedRows.push({ ...inserted, _tempId: t._tempId });
            processedCases.push({ ...t, testCaseId: tcId });
          }
        }
      }

      // 3a. Write status change history for incoming rows
      const historyRows = processedCases
        .filter((t: any) => t.testCaseId)
        .flatMap((t: any) => {
          const existing = existingMap.get(t.testCaseId);
          const oldResult = existing?.result ?? null;
          const newResult = (t.result?.trim() || null) as string | null;
          if (oldResult === newResult || (!oldResult && !newResult)) return [];
          return [{
            executionFileId: file.id,
            testCaseId: t.testCaseId,
            changedBy,
            fromStatus: oldResult,
            toStatus: newResult,
            changedAt: now,
          }];
        });
      if (historyRows.length > 0) {
        await db.insert(executionTcHistoryTable).values(historyRows);
      }

      // 3b. Audit log — record TC add/remove, merging same-user same-day entries
      const addedTCCount = processedCases.filter(
        (t: any) => t.testCaseId && !oldTcIdSet.has(t.testCaseId),
      ).length;
      if (addedTCCount > 0 || removedTCCount > 0) {
        let changedByName: string | null = null;
        if (changedBy) {
          try {
            const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, changedBy));
            if (u) changedByName = u.name;
          } catch {}
        }
        const allFileRows = await db
          .select({ id: executionTestCasesTable.id })
          .from(executionTestCasesTable)
          .where(eq(executionTestCasesTable.executionFileId, file.id));
        const currentTcCount = allFileRows.length;

        const existingAudit = changedByName
          ? await db
              .select()
              .from(executionFileAuditTable)
              .where(
                and(
                  eq(executionFileAuditTable.executionFileId, file.id),
                  eq(executionFileAuditTable.updatedByName, changedByName),
                  sql`DATE(${executionFileAuditTable.createdAt}) = CURRENT_DATE`,
                ),
              )
              .limit(1)
              .catch(() => [] as any[])
          : [];
        if (existingAudit.length > 0) {
          const prev = existingAudit[0].summary as string;
          if (prev === "Draft Test Case file for execution") {
            await db.update(executionFileAuditTable)
              .set({ tcCount: currentTcCount })
              .where(eq(executionFileAuditTable.id, existingAudit[0].id))
              .catch(() => {});
          } else {
            const prevAdded = parseInt(/(\d+) test cases? added/.exec(prev)?.[1] ?? "0");
            const prevRemoved = parseInt(/(\d+) test cases? removed/.exec(prev)?.[1] ?? "0");
            const totalAdded = prevAdded + addedTCCount;
            const totalRemoved = prevRemoved + removedTCCount;
            const parts: string[] = [];
            if (totalAdded > 0) parts.push(`${totalAdded} test case${totalAdded !== 1 ? "s" : ""} added`);
            if (totalRemoved > 0) parts.push(`${totalRemoved} test case${totalRemoved !== 1 ? "s" : ""} removed`);
            await db.update(executionFileAuditTable)
              .set({ summary: parts.join(", "), tcCount: currentTcCount })
              .where(eq(executionFileAuditTable.id, existingAudit[0].id))
              .catch(() => {});
          }
        } else {
          const parts: string[] = [];
          if (addedTCCount > 0) parts.push(`${addedTCCount} test case${addedTCCount !== 1 ? "s" : ""} added`);
          if (removedTCCount > 0) parts.push(`${removedTCCount} test case${removedTCCount !== 1 ? "s" : ""} removed`);
          await db.insert(executionFileAuditTable).values({
            executionFileId: file.id,
            updatedByName: changedByName,
            summary: parts.join(", "),
            tcCount: currentTcCount,
          }).catch(() => {});
        }
      }

      // CR011: ONE summarized activity row per save — per-TC result changes are
      // surfaced from execution_tc_history in the audit log, not double-written here
      if (historyRows.length > 0 || addedTCCount > 0 || removedTCCount > 0) {
        const parts: string[] = [];
        if (historyRows.length > 0) parts.push(`${historyRows.length} result change${historyRows.length !== 1 ? "s" : ""}`);
        if (addedTCCount > 0) parts.push(`${addedTCCount} TC${addedTCCount !== 1 ? "s" : ""} added`);
        if (removedTCCount > 0) parts.push(`${removedTCCount} TC${removedTCCount !== 1 ? "s" : ""} removed`);
        await logActivity({
          type: "execution_saved",
          description: `Execution file "${file.title ?? ticketId}" saved: ${parts.join(", ")}`,
          userId: changedBy,
          entityId: file.id,
          entityType: "execution",
          newValue: { resultChanges: historyRows.length, tcAdded: addedTCCount, tcRemoved: removedTCCount },
        });
      }

      // 4. Update file's updatedAt
      const [updatedFile] = await db
        .update(executionFilesTable)
        .set({ updatedAt: new Date() })
        .where(eq(executionFilesTable.id, file.id))
        .returning();

      // 5. Recompute summary from ALL rows in this file (not just incoming)
      const allTcRows = await db
        .select({
          moduleName: executionTestCasesTable.moduleName,
          caseName: executionTestCasesTable.caseName,
          result: executionTestCasesTable.result,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      const moduleMap: Record<string, { module: string; total: number; passed: number; failed: number; blocked: number; inProg: number; notExec: number }> = {};
      for (const tc of allTcRows) {
        if (!tc.moduleName && !tc.caseName && !tc.result) continue;
        const modName = tc.moduleName || "Unassigned Module";
        if (!moduleMap[modName]) {
          moduleMap[modName] = { module: modName, total: 0, passed: 0, failed: 0, blocked: 0, inProg: 0, notExec: 0 };
        }
        const row = moduleMap[modName];
        row.total += 1;
        const result = (tc.result?.trim() || "").toLowerCase();
        if (result === "passed") row.passed += 1;
        else if (result === "failed") row.failed += 1;
        else if (result === "blocked") row.blocked += 1;
        else if (result === "in progress") row.inProg += 1;
        else row.notExec += 1;
      }
      const aggregated = Object.values(moduleMap);
      if (aggregated.length > 0) {
        await db.delete(executionSummariesTable).where(eq(executionSummariesTable.redmineTicketId, ticketId));
        await db.insert(executionSummariesTable).values(
          aggregated.map((row) => ({
            redmineTicketId: ticketId,
            module: row.module,
            total: row.total,
            passed: row.passed,
            failed: row.failed,
            blocked: row.blocked,
            inProgress: row.inProg,
            notExecuted: row.notExec,
          })),
        );
      }

      // CR027 — uat_milestone_ready: a UAT file's overall pass rate crossing
      // 80% is the signal a PM is waiting on. Deduped against the notifications
      // table itself (no schema change) so it fires once per milestone, not on
      // every save once the file is already sitting above threshold.
      if (file.fileType === "uat" && file.milestoneId) {
        const totalAll = aggregated.reduce((sum, r) => sum + r.total, 0);
        const totalPassed = aggregated.reduce((sum, r) => sum + r.passed, 0);
        if (totalAll > 0 && totalPassed / totalAll >= 0.8) {
          const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, file.milestoneId));
          if (milestone?.createdBy) {
            const [already] = await db
              .select({ id: notificationsTable.id })
              .from(notificationsTable)
              .where(
                and(
                  eq(notificationsTable.type, "uat_milestone_ready"),
                  eq(notificationsTable.entityType, "milestone"),
                  eq(notificationsTable.entityId, file.milestoneId),
                ),
              );
            if (!already) {
              await notifyUser(
                milestone.createdBy,
                "UAT milestone ready",
                `"${milestone.name}" has reached ${Math.round((totalPassed / totalAll) * 100)}% UAT pass rate.`,
                "uat_milestone_ready",
                "milestone",
                file.milestoneId,
                changedBy,
              ).catch(() => {});
            }
          }
        }
      }

      // 6. Trigger live update to dashboard
      broadcastUpdate(ticketId);

      res.json({
        success: true,
        count: allTcRows.length,
        newUpdatedAt: updatedFile.updatedAt,
        // Only newly inserted rows are returned — the client needs their real DB IDs
        testCases: insertedRows.map((t) => ({
          id: t.id,
          testCaseId: t.testCaseId,
          libraryTcId: t.libraryTcId,
          rowOrder: t.rowOrder,
          _tempId: t._tempId,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to save test cases" });
    }
  },
);

/* ────────────────────────────────
   DOWNLOAD — template-based Excel (same as Send Verdict)
   ──────────────────────────────── */

router.get("/execution-files/:ticketId/download-excel", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { ticketId } = req.params;
    const { issueType, issueSubject, senderName, projectName } = req.query as Record<string, string>;

    const [file] = await db
      .select()
      .from(executionFilesTable)
      .where(eq(executionFilesTable.redmineTicketId, ticketId));
    if (file && !(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    const testCases = file
      ? await db
          .select()
          .from(executionTestCasesTable)
          .where(eq(executionTestCasesTable.executionFileId, file.id))
          .orderBy(executionTestCasesTable.rowOrder)
      : [];

    // CR002: fetch active defects for Pareto Analysis + CAPA auto-population
    const activeDefects = await fetchActiveDefectsForIssue(ticketId);

    // CR003: fetch audit entries for Doc Info
    const auditRows = file
      ? await db
          .select()
          .from(executionFileAuditTable)
          .where(eq(executionFileAuditTable.executionFileId, file.id))
          .orderBy(executionFileAuditTable.createdAt)
          .catch(() => [] as any[])
      : [];

    const typeLabel = issueType || "Issue";

    // CR006: AI-generated CAPA items
    const capaItems = await runCapaAI(ticketId, testCases);

    const buffer = await buildTestCaseExcel(testCases, {
      redmineId: ticketId,
      issueType: typeLabel,
      issueSubject: issueSubject || file?.title || "",
      senderName: senderName || undefined,
      activeDefects,
      capaItems: capaItems.length > 0 ? capaItems : undefined,
      auditEntries: auditRows.map((a: any) => ({
        summary: a.summary,
        updatedByName: a.updatedByName ?? null,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        tcCount: a.tcCount ?? 0,
      })),
    });

    if (!buffer) {
      res.status(500).json({ error: "Failed to build Excel file. Template may be unavailable." });
      return;
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const tracker = (issueType || typeLabel).replace(/[^a-zA-Z0-9]/g, "");
    const proj = (projectName || "").replace(/[^a-zA-Z0-9]/g, "");
    const filename = proj
      ? `${date}.${proj}_${tracker}_${ticketId}.xlsx`
      : `${date}.${tracker}_${ticketId}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch {
    res.status(500).json({ error: "Failed to download execution file" });
  }
});

export default router;