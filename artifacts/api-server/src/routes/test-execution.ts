import { resolveDocumentReference } from "./_document-register";
import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, notInArray, ilike, isNull } from "drizzle-orm";
import {
  db,
  executionFilesTable,
  executionModulesTable,
  executionTestCasesTable,
  executionTcEvidenceTable,
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
  tasksTable,
} from "@workspace/db";
import { verifyToken, actorFromReq } from "./auth";
import { getAuthContext, scopeToUserProjects, canAccessProject, getModuleScope } from "../middleware/access";
import { logActivity } from "./_audit";
import { notifyUser, notifyRolesInProject } from "./_notify";
import { canReview, canApproveExecutionFile, reviewRoleNames, fileApprovalRoleNames } from "../lib/review-eligibility";
import { syncMilestoneStatus } from "../lib/milestone-status";
import { computeRequirementTimelines, computeRequirementTimelinesBatch, buildPhaseTimelineRollup } from "./dashboard";
import { syncRedmineTicket, resolveApiKeyFromToken } from "./requirements";
import { buildTestCaseExcel, trackerCode, runCapaAI, type ExcelEvidenceLink } from "./excel-builder";
import { buildZip, type ZipEntry } from "./zip-writer";
import { fetchActiveDefectsForIssue } from "./verdict-report";

const router: IRouter = Router();

const MAX_EXECUTION_EVIDENCE_BYTES = 10 * 1024 * 1024;
const SAFE_INLINE_EVIDENCE_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"]);

/** Folder the download ZIP puts evidence under, beside the workbook at its root. */
const EVIDENCE_ZIP_ROOT = "evidence";

// ── Evidence file naming ──────────────────────────────────────────────────────
// Uploads used to keep the tester's own filename, so a downloaded
// "Screenshot 2026-09-18 142233.png" carried no trace of which test case it
// proved — the link existed only as a foreign key in the database. Evidence is
// renamed on the way in to <caseId>_<ticket>_<stamp>.<ext> so it stays
// identifiable outside the app, and in the Excel export's evidence folders.
// Restricted to [A-Za-z0-9._-] because these names also become ZIP entry paths
// and Excel hyperlink targets, where spaces and punctuation need escaping.
export function sanitiseEvidenceSegment(value: string, fallback: string): string {
  const cleaned = (value ?? "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  // Dots survive sanitising (they belong in filenames), so a test case id of
  // ".." would otherwise become a ZIP entry that escapes the evidence folder
  // when the archive is extracted.
  if (!cleaned || /^\.+$/.test(cleaned)) return fallback;
  return cleaned;
}

function evidenceStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Canonical evidence name. `taken` is the set of names already stored against
 * the same execution row — two files uploaded inside the same second would
 * otherwise collide and overwrite each other when the ZIP is extracted.
 */
export function buildEvidenceFileName(opts: {
  testCaseId: string | null;
  ticketId: string | null;
  rowId: number;
  originalName: string;
  uploadedAt?: Date;
  taken?: Set<string>;
}): string {
  const caseSeg = sanitiseEvidenceSegment(opts.testCaseId ?? "", `ROW${opts.rowId}`);
  const ticketSeg = sanitiseEvidenceSegment(opts.ticketId ?? "", "NA");
  const extMatch = /\.([A-Za-z0-9]{1,8})$/.exec(opts.originalName ?? "");
  const ext = extMatch ? `.${extMatch[1]!.toLowerCase()}` : "";
  const base = `${caseSeg}_${ticketSeg}_${evidenceStamp(opts.uploadedAt ?? new Date())}`;
  const taken = opts.taken ?? new Set<string>();
  let candidate = `${base}${ext}`;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

/** Folder this row's evidence occupies inside the export ZIP. */
export function evidenceFolderName(testCaseId: string | null, rowId: number): string {
  return sanitiseEvidenceSegment(testCaseId ?? "", `ROW${rowId}`);
}

async function getExecutionEvidenceScope(rowId: number) {
  const [scope] = await db
    .select({
      rowId: executionTestCasesTable.id,
      testCaseId: executionTestCasesTable.testCaseId,
      caseName: executionTestCasesTable.caseName,
      executionFileId: executionFilesTable.id,
      projectId: executionFilesTable.projectId,
      fileTitle: executionFilesTable.title,
      redmineTicketId: executionFilesTable.redmineTicketId,
    })
    .from(executionTestCasesTable)
    .innerJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
    .where(eq(executionTestCasesTable.id, rowId));
  return scope ?? null;
}

// CR014 access control (per-route, not router-level, because /execution-events
// authenticates its EventSource connection through a token query parameter).
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

// A requirement whose dev work is still open. devStatus runs
// null -> 'assigned' -> 'in_progress' -> 'ready_for_qa' (CR030), so these two
// values are the window where development is demonstrably still running and QA
// must not record an outcome against the code yet — an approved test case is
// approved to be *run later*, not approved to be run now.
const IN_DEVELOPMENT_DEV_STATUSES = ["assigned", "in_progress"];

/**
 * requirementIds (of those given) whose dev work is still open.
 *
 * Two independent signals, because either one alone leaves a hole:
 *
 *  - devStatus in ('assigned','in_progress') — the dev handoff was started and
 *    hasn't reached Ready for QA.
 *  - the requirement has dev tasks and not all of them are Done — the same
 *    "provably incomplete" test maybeAdvanceRequirement/maybeRevertIfIncomplete
 *    use. A Dev Lead who adds tasks straight from the Requirements page without
 *    going through PATCH /requirements/:id/dev leaves devStatus null, so the
 *    first signal alone would read that requirement as executable.
 *
 * A null devStatus with no dev tasks stays executable on purpose: it means the
 * requirement never entered the dev-handoff flow at all (QA Pipeline milestones
 * sync straight from Redmine and skip it), and freezing those would leave no
 * way to release them.
 */
async function findInDevelopmentRequirementIds(requirementIds: number[]): Promise<Set<number>> {
  if (requirementIds.length === 0) return new Set();

  const byDevStatus = await db
    .select({ id: requirementsTable.id })
    .from(requirementsTable)
    .where(
      and(
        inArray(requirementsTable.id, requirementIds),
        inArray(requirementsTable.devStatus, IN_DEVELOPMENT_DEV_STATUSES),
      ),
    );
  const inDevelopment = new Set(byDevStatus.map((r) => r.id));

  const devTasks = await db
    .select({ requirementId: tasksTable.requirementId, status: tasksTable.status })
    .from(tasksTable)
    .where(inArray(tasksTable.requirementId, requirementIds));
  for (const task of devTasks) {
    if (task.requirementId == null || task.status === "done") continue;
    inDevelopment.add(task.requirementId);
  }

  return inDevelopment;
}

// Reference for an execution file that has no Redmine ticket behind it.
// redmineTicketId is the unique key every /execution-files/:ticketId route
// resolves a file by, so one still has to exist — this mints a readable,
// obviously-not-a-Redmine-number stand-in ("INT-0007") from the highest
// INT- reference already stored. Concurrent creates can collide on the
// unique index; the caller retries, and the next read sees the winner.
const INTERNAL_TICKET_PREFIX = "INT-";

async function nextInternalTicketId(): Promise<string> {
  const existing = await db
    .select({ redmineTicketId: executionFilesTable.redmineTicketId })
    .from(executionFilesTable)
    .where(ilike(executionFilesTable.redmineTicketId, `${INTERNAL_TICKET_PREFIX}%`));
  let highest = 0;
  for (const row of existing) {
    const match = /^INT-(\d+)$/.exec(row.redmineTicketId ?? "");
    if (!match) continue;
    const n = parseInt(match[1], 10);
    if (n > highest) highest = n;
  }
  return `${INTERNAL_TICKET_PREFIX}${String(highest + 1).padStart(4, "0")}`;
}

// --- 1. SETUP SERVER-SENT EVENTS (SSE) CLIENTS ---
const clients = new Set<any>();

router.get("/execution-events", (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  try {
    verifyToken(token);
  } catch {
    res.status(401).end();
    return;
  }

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

    // CR062 — a milestone doesn't have one phase (its requirements can each be
    // at a different point: Requirement/Development/Testing/UAT), so this is
    // a breakdown count, not a single badge. Reuses the same per-requirement
    // phase engine CR032/CR060 already built (computeRequirementTimelines) —
    // one call per distinct milestone represented in this file list, not per
    // file, since several files can share a milestone.
    const phaseBreakdownByMilestone = new Map<number, { requirement: number; development: number; testing: number; uat: number }>();
    const timelineEntriesByMilestone = new Map<number, Awaited<ReturnType<typeof computeRequirementTimelines>>>();
    // One batched pass for every milestone in this file list — previously
    // three queries per milestone, fired concurrently and then queued behind
    // the connection pool.
    const batched = await computeRequirementTimelinesBatch(
      milestoneIds.map((mid) => ({ id: mid, completedAt: milestoneById.get(mid)?.completedAt ?? null })),
    );
    milestoneIds.forEach((mid) => {
      const entries = batched.get(mid) ?? [];
      timelineEntriesByMilestone.set(mid, entries);
      const breakdown = { requirement: 0, development: 0, testing: 0, uat: 0 };
      for (const entry of entries) {
        const lastSeg = entry.timeline[entry.timeline.length - 1];
        const phase = lastSeg?.key ?? "requirements";
        if (phase === "develop") breakdown.development += 1;
        else if (phase === "qa") breakdown.testing += 1;
        else if (phase === "uat") breakdown.uat += 1;
        else breakdown.requirement += 1; // "requirements" or "gap"
      }
      phaseBreakdownByMilestone.set(mid, breakdown);
    });

    // CR075 — per-file phase timeline rollup (Requirement Detail's phase
    // timeline, generalized across every requirement this file's test cases
    // link to). One extra query for the whole batch, not per file.
    const fileIds = files.map((f) => f.id);
    const linkRows = fileIds.length
      ? await db
          .select({ executionFileId: executionTestCasesTable.executionFileId, requirementId: executionTestCasesTable.requirementId })
          .from(executionTestCasesTable)
          .where(inArray(executionTestCasesTable.executionFileId, fileIds))
      : [];
    const linkedReqIdsByFile = new Map<number, Set<number>>();
    for (const row of linkRows) {
      if (row.requirementId == null) continue;
      if (!linkedReqIdsByFile.has(row.executionFileId)) linkedReqIdsByFile.set(row.executionFileId, new Set());
      linkedReqIdsByFile.get(row.executionFileId)!.add(row.requirementId);
    }

    res.json(
      files.map((f) => {
        const milestoneId = (f as any).milestoneId ?? null;
        const milestone = milestoneId != null ? milestoneById.get(milestoneId) : undefined;
        const linkedReqIds = linkedReqIdsByFile.get(f.id) ?? new Set<number>();
        const milestoneEntries = milestoneId != null ? timelineEntriesByMilestone.get(milestoneId) ?? [] : [];
        const linkedEntries = milestoneEntries.filter((e) => linkedReqIds.has(e.id));
        return {
          id: f.id,
          redmineTicketId: f.redmineTicketId,
          title: f.title,
          qaPic: f.qaPic,
          remarks: f.remarks,
          selectedModules: f.selectedModules,
          selectedModuleIds: (f as any).selectedModuleIds ?? null,
          tracker: f.tracker,
          projectId: f.projectId,
          requirementId: f.requirementId,
          milestoneId,
          milestoneName: milestone?.name ?? null,
          milestonePriority: (milestone as any)?.priority ?? null,
          milestoneStatus: milestone?.status ?? null,
          milestonePhaseBreakdown: milestoneId != null ? phaseBreakdownByMilestone.get(milestoneId) ?? null : null,
          phaseTimeline: milestone ? buildPhaseTimelineRollup(linkedEntries, milestone) : null,
          linkedRequirementCount: linkedEntries.length,
          fileType: (f as any).fileType ?? "qa",
          reviewStatus: (f as any).reviewStatus ?? "draft",
          rejectionReason: (f as any).rejectionReason ?? null,
          qaPicSetBy: (f as any).qaPicSetBy ?? null,
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

    // Counted in the database rather than by streaming every execution row
    // into Node — this endpoint reads the largest table in the product and
    // only ever needs six integers per file. Bucketing matches the previous
    // in-memory logic exactly: trim, lowercase, and anything unrecognised
    // (including null/empty) falls into notExecuted.
    const bucketExpr = sql<string>`lower(trim(coalesce(${executionTestCasesTable.result}, '')))`;
    const countRows = await db
      .select({
        executionFileId: executionTestCasesTable.executionFileId,
        total: sql<number>`count(*)::int`,
        passed: sql<number>`count(*) filter (where ${bucketExpr} = 'passed')::int`,
        failed: sql<number>`count(*) filter (where ${bucketExpr} = 'failed')::int`,
        blocked: sql<number>`count(*) filter (where ${bucketExpr} = 'blocked')::int`,
        inProgress: sql<number>`count(*) filter (where ${bucketExpr} = 'in progress')::int`,
        notExecuted: sql<number>`count(*) filter (where ${bucketExpr} not in ('passed', 'failed', 'blocked', 'in progress'))::int`,
      })
      .from(executionTestCasesTable)
      .where(inArray(executionTestCasesTable.executionFileId, fileIds))
      .groupBy(executionTestCasesTable.executionFileId);

    const agg: Record<string, { total: number; passed: number; failed: number; blocked: number; inProgress: number; notExecuted: number }> = {};
    for (const row of countRows) {
      const ticketId = ticketByFileId.get(row.executionFileId);
      if (!ticketId) continue;
      // Two files can share a ticket id only if the data is inconsistent;
      // summing rather than overwriting preserves the old behaviour.
      const bucket = agg[ticketId] ?? (agg[ticketId] = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 });
      bucket.total += row.total;
      bucket.passed += row.passed;
      bucket.failed += row.failed;
      bucket.blocked += row.blocked;
      bucket.inProgress += row.inProgress;
      bucket.notExecuted += row.notExecuted;
    }
    res.json(agg);
  } catch (err: any) {
    console.error("[GET /execution-progress]", err);
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
    const data: any = await response.json();
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
    const { redmineTicketId, title, qaPic, remarks, selectedModules, selectedModuleIds, tracker, projectId, requirementId, milestoneId, fileType } = req.body;
    if (!milestoneId) {
      res.status(400).json({ error: "Milestone is required" });
      return;
    }
    if (projectId && !(await canAccessProject(ctx.userId, ctx.role, Number(projectId)))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    // Not every run starts from a Redmine ticket — ad-hoc regression sweeps and
    // internal test rounds have no issue to quote. redmineTicketId is still the
    // column every /execution-files/:ticketId route addresses a file by, so a
    // blank one gets a generated in-house reference instead of being rejected.
    const suppliedTicketId = redmineTicketId ? String(redmineTicketId).trim() : "";
    const baseValues = {
      title: title || null,
      qaPic: qaPic || null,
      remarks: remarks || null,
      selectedModules: selectedModules || null,
      selectedModuleIds: Array.isArray(selectedModuleIds) && selectedModuleIds.length > 0
        ? selectedModuleIds.map(Number)
        : null,
      tracker: tracker || null,
      projectId: projectId ? Number(projectId) : null,
      requirementId: requirementId ? Number(requirementId) : null,
      milestoneId: milestoneId ? Number(milestoneId) : null,
      fileType: fileType || "qa",
      qaPicSetBy: ctx.userId,
      // DEF-0024 — author of record, so submit-for-review can be restricted
      // to whoever actually created this file.
      createdBy: ctx.userId,
    };

    let file: typeof executionFilesTable.$inferSelect | undefined;
    if (suppliedTicketId) {
      [file] = await db
        .insert(executionFilesTable)
        .values({ ...baseValues, redmineTicketId: suppliedTicketId } as any)
        .returning();
    } else {
      // Two people compiling at the same moment can derive the same next
      // reference; the unique index catches it, so take the next one and retry
      // rather than failing a create the user can do nothing about.
      for (let attempt = 0; attempt < 5 && !file; attempt++) {
        const candidate = await nextInternalTicketId();
        try {
          [file] = await db
            .insert(executionFilesTable)
            .values({ ...baseValues, redmineTicketId: candidate } as any)
            .returning();
        } catch (err: any) {
          const isDuplicate = err?.code === "23505" || err?.cause?.code === "23505";
          if (!isDuplicate || attempt === 4) throw err;
        }
      }
    }
    if (!file) {
      res.status(500).json({ error: "Failed to create execution file" });
      return;
    }
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
      // differ in casing from the QM Pulse user record.
      const [picUser] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.name, file.qaPic));
      if (picUser) {
        await notifyUser(picUser.id, "Assigned as QA PIC", `You have been assigned as QA PIC for execution file "${file.title || file.redmineTicketId}".`, "execution", "execution_file", file.id, actorId).catch(() => {});
      }
    }

    if ((file as any).milestoneId != null) {
      await syncMilestoneStatus((file as any).milestoneId);
    }

    res.status(201).json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      selectedModuleIds: (file as any).selectedModuleIds ?? null,
      tracker: file.tracker,
      projectId: file.projectId,
      requirementId: file.requirementId,
      milestoneId: (file as any).milestoneId ?? null,
      fileType: (file as any).fileType ?? "qa",
      createdBy: (file as any).createdBy ?? null,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch (err: any) {
    // PostgreSQL unique_violation code 23505 — drizzle-orm wraps driver
    // errors in DrizzleQueryError, so both the code and the real message
    // live at err.cause, not on err itself.
    if (err?.code === "23505" || err?.cause?.code === "23505" || err?.message?.includes("unique") || err?.cause?.message?.includes("unique")) {
      // With no ticket supplied, a duplicate here means five generated
      // references in a row were taken — a retry storm, not a user mistake.
      res.status(409).json({
        error: req.body.redmineTicketId
          ? `An execution file for ticket #${req.body.redmineTicketId} already exists`
          : "Couldn't reserve an internal reference for this execution file — please try again",
      });
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
    const { selectedModules, selectedModuleIds, title, redmineTicketId, remarks, tracker, projectId, requirementId, qaPic, milestoneId } = req.body;
    // Moving the file to another project also requires access to the target
    if (projectId && !(await canAccessProject(ctx.userId, ctx.role, Number(projectId)))) {
      res.status(403).json({ error: "Access denied to the target project" });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (selectedModules !== undefined) patch.selectedModules = selectedModules || null;
    if (selectedModuleIds !== undefined) {
      patch.selectedModuleIds = Array.isArray(selectedModuleIds) && selectedModuleIds.length > 0
        ? selectedModuleIds.map(Number)
        : null;
    }
    if (title !== undefined) patch.title = title || null;
    if (redmineTicketId !== undefined) patch.redmineTicketId = String(redmineTicketId).trim();
    if (remarks !== undefined) patch.remarks = remarks || null;
    if (tracker !== undefined) patch.tracker = tracker || null;
    if (projectId !== undefined) patch.projectId = projectId ? Number(projectId) : null;
    if (requirementId !== undefined) patch.requirementId = requirementId ? Number(requirementId) : null;
    if (qaPic !== undefined) {
      patch.qaPic = qaPic || null;
      patch.qaPicSetBy = qaPic ? ctx.userId : null;
    }
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
      selectedModuleIds: (updated as any).selectedModuleIds ?? null,
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

// GET /execution-files/review-queue - My Review Queue for QA roles
router.get("/execution-files/review-queue", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
  const mayApprove = await canApproveExecutionFile(ctx.role);

  try {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ctx.userId)).limit(1);
    const userName = u?.name;

    const allFiles = await db.select().from(executionFilesTable);
    const scoped = allFiles.filter(t => accessible === null || (t.projectId != null && accessible.includes(t.projectId)));

    // Only QA Lead+ can actually approve/reject a file (canApproveExecutionFile
    // on the review route above), so a qa_member's queue never lists items
    // they'd just get a 403 trying to act on. Module-scoped, same as that
    // route's own module gate — a lead scoped to another module shouldn't see
    // this file as "waiting on them" either.
    const waitingOnMeRaw = mayApprove
      ? scoped.filter(t => {
          const reviewStatus = (t as any).reviewStatus ?? "draft";
          // Ensure segregation of duties: You cannot review your own submitted execution files
          return reviewStatus === "in_review" && (t as any).qaPicSetBy !== ctx.userId && (t as any).qaPic !== userName;
        })
      : [];
    const waitingOnMe: typeof waitingOnMeRaw = [];
    for (const t of waitingOnMeRaw) {
      if (t.projectId == null) { waitingOnMe.push(t); continue; }
      const scope = await getModuleScope(ctx.userId, ctx.role, t.projectId);
      if (!scope.restricted) { waitingOnMe.push(t); continue; }
      const fileModules = (t.selectedModules ?? "").split(",").map((m) => m.trim()).filter(Boolean);
      if (fileModules.length === 0 || fileModules.some((m) => scope.moduleNames.includes(m))) waitingOnMe.push(t);
    }

    const awaitingMyRevision = scoped.filter(t => {
      const reviewStatus = (t as any).reviewStatus ?? "draft";
      return reviewStatus === "rejected" && (t as any).qaPicSetBy === ctx.userId;
    });

    const now = Date.now();
    function withAge(files: typeof allFiles) {
      return files.map(t => ({
        ...t,
        reviewStatus: (t as any).reviewStatus ?? "draft",
        rejectedAt: (t as any).rejectedAt ?? null,
        updatedAt: t.updatedAt.toISOString(),
        daysInStatus: Math.floor((now - t.updatedAt.getTime()) / 86400000),
        stale: Math.floor((now - t.updatedAt.getTime()) / 86400000) > 3,
      }));
    }

    res.json({ waitingOnMe: withAge(waitingOnMe), awaitingMyRevision: withAge(awaitingMyRevision) });
  } catch (error) {
    console.error("Failed to fetch execution files review queue:", error);
    res.status(500).json({ error: "Internal server error" });
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
      selectedModuleIds: (file as any).selectedModuleIds ?? null,
      projectId: file.projectId,
      requirementId: file.requirementId,
      milestoneId: (file as any).milestoneId ?? null,
      fileType: (file as any).fileType ?? "qa",
      reviewStatus: (file as any).reviewStatus ?? "draft",
      rejectionReason: (file as any).rejectionReason ?? null,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch execution file" });
  }
});

router.patch("/execution-files/:id/review", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parseInt(req.params.id);
  const { action, comment } = req.body as { action: "submit" | "approve" | "reject"; comment?: string };

  if (Number.isNaN(id) || !["submit", "approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid request payload" }); return;
  }

  // Submitting stays open to any QA role (a qa_member submits their own
  // work). Approving/rejecting — signing off on it — is reserved for QA
  // leadership (qa_lead/qa_manager/hod_qa), so it can't be self-approved via
  // a lower-tier peer the way per-row acceptance can.
  const authorized = action === "submit" ? await canReview("qa", ctx.role) : await canApproveExecutionFile(ctx.role);
  if (!authorized) {
    res.status(403).json({
      error: action === "submit" ? "QA role required for review actions" : "Only a QA Lead, QA Manager, or HOD QA can approve or reject",
    });
    return;
  }

  try {
    const [file_] = await db.select().from(executionFilesTable).where(eq(executionFilesTable.id, id));
    if (!file_) { res.status(404).json({ error: "Execution file not found" }); return; }
    if (!(await canAccessFileProject(ctx, file_.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }

    // DEF-0024 — only the file's author can submit it for review. canReview
    // above just confirms the caller is QA-tier, not that they created this
    // particular file. Rows created before the createdBy column existed have
    // no author on record and stay open to any QA role, same as before.
    if (action === "submit" && (file_ as any).createdBy != null && (file_ as any).createdBy !== ctx.userId) {
      res.status(403).json({ error: "Only the author can submit this execution file for review" }); return;
    }

    // Segregation of duties: the submitter can't approve or reject their own
    // file. executionFilesTable has no authorId — qaPicSetBy is stamped with
    // the submitter on "submit" below, so it is the accountable party here.
    if ((action === "approve" || action === "reject") && file_.qaPicSetBy === ctx.userId) {
      res.status(403).json({ error: `You cannot ${action} an execution file you authored` }); return;
    }

    // Same project/module reach as the reviewers this file's "submitted for
    // review" notification actually goes to (see notifyRolesInProject below)
    // — a QA Lead scoped to another module in this project shouldn't be able
    // to approve/reject a file outside it. Manager+ tiers are unrestricted
    // (getModuleScope), matching their department-wide project access.
    if ((action === "approve" || action === "reject") && file_.projectId != null) {
      const scope = await getModuleScope(ctx.userId, ctx.role, file_.projectId);
      if (scope.restricted) {
        const fileModules = (file_.selectedModules ?? "").split(",").map((m) => m.trim()).filter(Boolean);
        if (fileModules.length > 0 && !fileModules.some((m) => scope.moduleNames.includes(m))) {
          res.status(403).json({ error: "Access denied to this module" }); return;
        }
      }
    }

    const now = new Date();
    const update: any = {};

    if (action === "submit") {
      update.reviewStatus = "in_review";
      update.qaPicSetBy = ctx.userId;
      // Clear rejection reason on resubmit
      update.rejectionReason = null;
    } else if (action === "approve") {
      update.reviewStatus = "approved";
      update.approvedBy = ctx.userId;
      update.approvedAt = now;
      update.rejectedBy = null;
      update.rejectedAt = null;
      update.rejectionReason = null;
    } else {
      update.reviewStatus = "rejected";
      update.rejectedBy = ctx.userId;
      update.rejectedAt = now;
      update.rejectionReason = comment ?? null;
    }

    const [updated] = await db.update(executionFilesTable).set(update).where(eq(executionFilesTable.id, id)).returning();

    // Approving the file signs off on everything currently in it, so any row
    // still marked 'pending' is covered by this decision and needs no second
    // accept. Rows added *after* this moment start pending again — that is
    // exactly the gap this state closes. Rows returned to their author for
    // rework ('rejected') are deliberately left alone: they are off the sheet
    // and were not part of what was just reviewed.
    if (action === "approve") {
      await db
        .update(executionTestCasesTable)
        .set({ reviewState: "accepted", acceptedBy: ctx.userId, acceptedAt: now })
        .where(
          and(
            eq(executionTestCasesTable.executionFileId, id),
            eq(executionTestCasesTable.reviewState, "pending"),
          ),
        );

      // Same close-out for Doc Info's audit trail: every "update summary" row
      // still unreviewed at this moment is covered by this approval, so it
      // gets this reviewer/date individually — not just the file's single
      // approvedBy stamped onto whichever row happens to be last. Entries
      // added after this moment stay unreviewed until the next approval.
      const [approver] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ctx.userId));
      await db
        .update(executionFileAuditTable)
        .set({ reviewedByName: approver?.name ?? null, reviewedAt: now })
        .where(
          and(
            eq(executionFileAuditTable.executionFileId, id),
            isNull(executionFileAuditTable.reviewedByName),
          ),
        );
    }

    await logActivity({
      type: `execution_file_${action}`,
      description: `Execution file "${file_.title || file_.redmineTicketId}" ${action === "submit" ? "submitted for review" : action === "approve" ? "approved" : "rejected"}${comment ? `: ${comment}` : ""}`,
      userId: ctx.userId,
      entityId: id,
      entityType: "execution_file",
      oldValue: { reviewStatus: (file_ as any).reviewStatus ?? "draft" },
      newValue: { reviewStatus: update.reviewStatus, comment: comment ?? null },
    });

    // Peer review only works if peers hear about it — this flow previously
    // logged the transition and notified nobody, so a submitted file sat
    // unseen unless someone opened their review queue unprompted. Notify only
    // the roles that can actually act on it (QA Lead+) and only within this
    // file's own project/module — the same reach the approve/reject gate
    // above enforces.
    const label = file_.title || file_.redmineTicketId;
    if (action === "submit" && file_.projectId != null) {
      await notifyRolesInProject({
        roles: await fileApprovalRoleNames(),
        projectId: file_.projectId,
        module: file_.selectedModules,
        title: "Execution file submitted for review",
        message: `"${label}" is waiting on your review before execution can start.`,
        type: "review_request",
        entityType: "execution_file",
        entityId: id,
        actorId: ctx.userId,
      }).catch(() => {});
    } else if (action === "approve" || action === "reject") {
      await notifyUser(
        file_.qaPicSetBy,
        action === "approve" ? "Execution file approved" : "Execution file rejected",
        action === "approve"
          ? `"${label}" was approved — you can now execute its test cases.`
          : `"${label}" was rejected${comment ? `: ${comment}` : ""}.`,
        action === "approve" ? "review_approved" : "review_rejected",
        "execution_file",
        id,
        ctx.userId,
      ).catch(() => {});
    }

    if ((action === "approve" || action === "reject") && (file_ as any).milestoneId != null) {
      await syncMilestoneStatus((file_ as any).milestoneId);
    }

    res.json(updated);
  } catch (error) {
    console.error("Execution file review action failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /execution-test-cases/:id/content — DEF-0022: a row that was
// returned for rework is held off the main sheet, so its author has no other
// way to fix its Test Steps / Expected Result before resubmitting. Narrowly
// scoped: author-only, and only while the row is actually in rework — general
// row editing on the sheet goes through the bulk upsert endpoint below.
router.patch("/execution-test-cases/:id/content", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parseInt(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const [row] = await db.select().from(executionTestCasesTable).where(eq(executionTestCasesTable.id, id));
    if (!row) { res.status(404).json({ error: "Test case row not found" }); return; }
    const [file] = await db.select().from(executionFilesTable).where(eq(executionFilesTable.id, row.executionFileId));
    if (!file) { res.status(404).json({ error: "Execution file not found" }); return; }
    if (!(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }
    // Same author-only gate as resubmit.
    if ((row as any).addedBy !== ctx.userId) {
      res.status(403).json({ error: "Only the person who added this test case can edit it" }); return;
    }
    if (((row as any).reviewState ?? "accepted") !== "rejected") {
      res.status(409).json({ error: "Only a returned test case can be edited here" }); return;
    }

    const { testSteps, expectedResult } = req.body as { testSteps?: string; expectedResult?: string };
    const update: Record<string, unknown> = {};
    if (testSteps !== undefined) update.testSteps = testSteps;
    if (expectedResult !== undefined) update.expectedResult = expectedResult;
    if (Object.keys(update).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

    const [updated] = await db
      .update(executionTestCasesTable)
      .set(update)
      .where(eq(executionTestCasesTable.id, id))
      .returning();

    await logActivity({
      type: "execution_tc_edited",
      description: `Test case "${row.testCaseId || row.caseName || `row ${row.id}`}" edited while in rework`,
      userId: ctx.userId,
      entityId: id,
      entityType: "execution_test_case",
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Failed to update test case" });
  }
});

// PATCH /execution-test-cases/:id/review — per-row peer acceptance for test
// cases added to a file that was already approved.
//
//   accept  — reviewer signs the row off; it becomes executable.
//   return  — reviewer sends it back to whoever added it, with a comment
//             saying what to fix. The row comes off the sheet so the rest of
//             the run keeps executing, and the author resubmits it once fixed.
//   resubmit — the author puts a returned row back up for acceptance.
//
// Segregation of duties mirrors the file-level gate: you cannot accept or
// return a row you added yourself, and only the author can resubmit one.
router.patch("/execution-test-cases/:id/review", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parseInt(req.params.id);
  const { action, comment } = req.body as { action: "accept" | "return" | "resubmit"; comment?: string };
  if (Number.isNaN(id) || !["accept", "return", "resubmit"].includes(action)) {
    res.status(400).json({ error: "action must be accept, return, or resubmit" }); return;
  }

  try {
    const [row] = await db.select().from(executionTestCasesTable).where(eq(executionTestCasesTable.id, id));
    if (!row) { res.status(404).json({ error: "Test case row not found" }); return; }

    const [file] = await db.select().from(executionFilesTable).where(eq(executionFilesTable.id, row.executionFileId));
    if (!file) { res.status(404).json({ error: "Execution file not found" }); return; }
    if (!(await canAccessFileProject(ctx, file.projectId))) {
      res.status(403).json({ error: "Access denied to this project" }); return;
    }

    const state = (row as any).reviewState ?? "accepted";
    const label = row.testCaseId || row.caseName || `row ${row.id}`;
    const now = new Date();

    if (action === "resubmit") {
      if (state !== "rejected") {
        res.status(409).json({ error: "Only a returned test case can be resubmitted" }); return;
      }
      if ((row as any).addedBy !== ctx.userId) {
        res.status(403).json({ error: "Only the person who added this test case can resubmit it" }); return;
      }
      const [updated] = await db
        .update(executionTestCasesTable)
        .set({ reviewState: "pending", returnedBy: null, returnedAt: null, reviewComment: null })
        .where(eq(executionTestCasesTable.id, id))
        .returning();

      await logActivity({
        type: "execution_tc_resubmit",
        description: `Test case "${label}" resubmitted for peer acceptance`,
        userId: ctx.userId,
        entityId: id,
        entityType: "execution_test_case",
        oldValue: { reviewState: state },
        newValue: { reviewState: "pending" },
      });

      if (file.projectId != null) {
        await notifyRolesInProject({
          roles: await reviewRoleNames("qa"),
          projectId: file.projectId,
          module: file.selectedModules,
          title: "Test case resubmitted for acceptance",
          message: `"${label}" was revised and is waiting on your acceptance in ${file.title || file.redmineTicketId}.`,
          type: "review_request",
          entityType: "execution_file",
          entityId: file.id,
          actorId: ctx.userId,
        }).catch(() => {});
      }
      res.json(updated); return;
    }

    // accept / return are reviewer actions
    if (!(await canReview("qa", ctx.role))) {
      res.status(403).json({ error: "QA role required for review actions" }); return;
    }
    if (state !== "pending") {
      res.status(409).json({ error: "This test case is not awaiting acceptance" }); return;
    }
    if ((row as any).addedBy != null && (row as any).addedBy === ctx.userId) {
      res.status(403).json({ error: `You cannot ${action} a test case you added yourself` }); return;
    }

    const update = action === "accept"
      ? { reviewState: "accepted", acceptedBy: ctx.userId, acceptedAt: now, reviewComment: null }
      : { reviewState: "rejected", returnedBy: ctx.userId, returnedAt: now, reviewComment: comment ?? null };

    const [updated] = await db
      .update(executionTestCasesTable)
      .set(update)
      .where(eq(executionTestCasesTable.id, id))
      .returning();

    await logActivity({
      type: action === "accept" ? "execution_tc_accepted" : "execution_tc_returned",
      description: `Test case "${label}" ${action === "accept" ? "accepted into" : "returned from"} ${file.title || file.redmineTicketId}${comment ? `: ${comment}` : ""}`,
      userId: ctx.userId,
      entityId: id,
      entityType: "execution_test_case",
      oldValue: { reviewState: state },
      newValue: { reviewState: update.reviewState, comment: comment ?? null },
    });

    await notifyUser(
      (row as any).addedBy,
      action === "accept" ? "Test case accepted" : "Test case returned to you",
      action === "accept"
        ? `"${label}" was accepted into ${file.title || file.redmineTicketId} and can now be executed.`
        : `"${label}" was returned for rework${comment ? `: ${comment}` : ""}. Fix it and resubmit to put it back on the execution sheet.`,
      action === "accept" ? "review_approved" : "review_rejected",
      "execution_file",
      file.id,
      ctx.userId,
    ).catch(() => {});

    res.json(updated);
  } catch (error) {
    console.error("Execution test case review action failed:", error);
    res.status(500).json({ error: "Internal server error" });
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
      // DEF-0024 — the person doing the cloning is this file's author, not
      // a carry-over from the source file. Without this, createdBy stays
      // null and the clone is open to submit-for-review by any QA (the
      // null-author exemption is meant for legacy rows, not new ones).
      createdBy: actorFromReq(req) ?? null,
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
        res.json({ testCases: [], lastUpdatedAt: null, file: null });
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

      // Rows returned to their author for rework are held off the execution
      // sheet — the rest of the run carries on without them — and handed back
      // separately so the author can see the reviewer's comment and resubmit.
      const returnedRows = testCases.filter((t) => (t as any).reviewState === "rejected");
      testCases = testCases.filter((t) => (t as any).reviewState !== "rejected");

      const executionRowIds = testCases.map((t) => t.id).filter((id): id is number => typeof id === "number");
      const evidenceRows = executionRowIds.length > 0
        ? await db
            .select({
              id: executionTcEvidenceTable.id,
              executionTestCaseId: executionTcEvidenceTable.executionTestCaseId,
              fileName: executionTcEvidenceTable.fileName,
              originalFileName: executionTcEvidenceTable.originalFileName,
              mimeType: executionTcEvidenceTable.mimeType,
              sizeBytes: executionTcEvidenceTable.sizeBytes,
              uploadedBy: executionTcEvidenceTable.uploadedBy,
              createdAt: executionTcEvidenceTable.createdAt,
            })
            .from(executionTcEvidenceTable)
            .where(inArray(executionTcEvidenceTable.executionTestCaseId, executionRowIds))
        : [];
      const evidenceByRow = new Map<number, typeof evidenceRows>();
      for (const evidence of evidenceRows) {
        const list = evidenceByRow.get(evidence.executionTestCaseId) ?? [];
        list.push(evidence);
        evidenceByRow.set(evidence.executionTestCaseId, list);
      }

      // CR023p4 — flag rows whose library test case's linked requirement was
      // revised since this execution instance last acknowledged a revision.
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

      // Rows whose linked requirement is still being built. The sheet greys
      // their Result control out and says why, so a tester learns it before
      // clicking rather than from a reverted save afterwards.
      const linkedRequirementIds = [...new Set(
        testCases.map((t) => t.requirementId).filter((v): v is number => v != null),
      )];
      const inDevelopmentReqIds = await findInDevelopmentRequirementIds(linkedRequirementIds);

      // Names for whoever added / returned a row still under acceptance, so the
      // sheet can say who to chase without a second round-trip per row.
      const reviewUserIds = [...new Set(
        [...testCases, ...returnedRows]
          .flatMap((t) => [(t as any).addedBy, (t as any).returnedBy, (t as any).acceptedBy])
          .filter((v): v is number => typeof v === "number"),
      )];
      const reviewUserNames = new Map<number, string>();
      if (reviewUserIds.length > 0) {
        const users = await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, reviewUserIds));
        for (const u of users) reviewUserNames.set(u.id, u.name);
      }
      const nameOf = (uid: number | null | undefined) =>
        typeof uid === "number" ? reviewUserNames.get(uid) ?? null : null;

      res.json({
        lastUpdatedAt: file.updatedAt,
        file: {
          id: file.id,
          redmineTicketId: file.redmineTicketId,
          title: file.title,
          qaPic: file.qaPic,
          remarks: file.remarks,
          selectedModules: file.selectedModules,
          selectedModuleIds: (file as any).selectedModuleIds ?? null,
          tracker: file.tracker,
          projectId: file.projectId,
          requirementId: file.requirementId,
          milestoneId: (file as any).milestoneId ?? null,
          reviewStatus: (file as any).reviewStatus ?? "draft",
          rejectionReason: (file as any).rejectionReason ?? null,
          qaPicSetBy: (file as any).qaPicSetBy ?? null,
          updatedAt: file.updatedAt,
        },
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
            executedAt: t.executedAt?.toISOString() ?? null,
            actualResult: t.actualResult,
            defectNumber: t.defectNumber,
            defectScreenshots: t.defectScreenshots,
            passEvidence: (evidenceByRow.get(t.id) ?? []).map((e) => ({
              ...e,
              createdAt: e.createdAt.toISOString(),
            })),
            comments: t.comments,
            qaPic: t.qaPic,
            rowOrder: t.rowOrder,
            rowType: t.rowType,
            reviewAcknowledgedAt,
            alertRevised,
            // Per-row acceptance. 'pending' means this row was added after the
            // file was approved and is frozen until a peer accepts it.
            reviewState: (t as any).reviewState ?? "accepted",
            addedBy: (t as any).addedBy ?? null,
            addedByName: nameOf((t as any).addedBy),
            acceptedByName: nameOf((t as any).acceptedBy),
            // Dev work on the linked requirement is still open — not
            // executable yet, however the test case itself was reviewed.
            requirementInDevelopment: t.requirementId != null && inDevelopmentReqIds.has(t.requirementId),
          };
        }),
        // Held off the sheet, shown to their author for rework.
        returnedTestCases: returnedRows.map((t) => ({
          id: t.id,
          testCaseId: t.testCaseId,
          caseName: t.caseName,
          moduleName: t.moduleName,
          libraryTcId: t.libraryTcId,
          // DEF-0022 — the row's own content, so its author can fix it
          // straight from the rework banner instead of needing it back on
          // the (inaccessible while returned) main sheet.
          testSteps: t.testSteps,
          expectedResult: t.expectedResult,
          addedBy: (t as any).addedBy ?? null,
          addedByName: nameOf((t as any).addedBy),
          returnedByName: nameOf((t as any).returnedBy),
          returnedAt: (t as any).returnedAt?.toISOString?.() ?? null,
          reviewComment: (t as any).reviewComment ?? null,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch test cases" });
    }
  },
);

// Audit trail for one execution row: every result change (who, when, from ->
// to, and the reason they gave) plus the row's own acceptance lifecycle, so
// "why does this say Failed now when it passed last week" is answerable from
// the sheet instead of from memory.
//
// Result changes live in execution_tc_history keyed by the TC label, which
// CR078 renumbering rewrites in place — so reading by label here stays correct
// after a delete or reorder. The lifecycle entries are read off the row itself
// (added/accepted/returned are already stamped there) rather than duplicated
// into the history table.
router.get(
  "/execution-files/:ticketId/test-cases/:rowId/history",
  async (req, res): Promise<void> => {
    const ctx = requireAuth(req, res);
    if (!ctx) return;
    try {
      const rowId = Number(req.params.rowId);
      if (Number.isNaN(rowId)) {
        res.status(400).json({ error: "Invalid row id" });
        return;
      }

      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, req.params.ticketId));
      if (!file) {
        res.status(404).json({ error: "Execution file not found" });
        return;
      }
      if (!(await canAccessFileProject(ctx, file.projectId))) {
        res.status(403).json({ error: "Access denied to this project" });
        return;
      }

      const [row] = await db
        .select()
        .from(executionTestCasesTable)
        .where(
          and(
            eq(executionTestCasesTable.id, rowId),
            eq(executionTestCasesTable.executionFileId, file.id),
          ),
        );
      if (!row) {
        res.status(404).json({ error: "Test case not found in this execution file" });
        return;
      }

      const historyRows = row.testCaseId
        ? await db
            .select()
            .from(executionTcHistoryTable)
            .where(
              and(
                eq(executionTcHistoryTable.executionFileId, file.id),
                eq(executionTcHistoryTable.testCaseId, row.testCaseId),
              ),
            )
        : [];

      const userIds = [...new Set([
        ...historyRows.map((h) => h.changedBy),
        (row as any).addedBy,
        (row as any).acceptedBy,
        (row as any).returnedBy,
      ].filter((v): v is number => typeof v === "number"))];
      const nameById = new Map<number, string>();
      if (userIds.length > 0) {
        const users = await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds));
        for (const u of users) nameById.set(u.id, u.name);
      }
      const nameOf = (uid: number | null | undefined) =>
        typeof uid === "number" ? nameById.get(uid) ?? null : null;

      type TrailEntry = {
        kind: "result" | "lifecycle";
        at: string;
        actorName: string | null;
        fromStatus: string | null;
        toStatus: string | null;
        label: string;
        reason: string | null;
      };

      const entries: TrailEntry[] = historyRows.map((h) => ({
        kind: "result",
        at: h.changedAt.toISOString(),
        actorName: nameOf(h.changedBy),
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        label: "Result changed",
        reason: (h as any).reason ?? null,
      }));

      const acceptedAt = (row as any).acceptedAt as Date | null | undefined;
      if (acceptedAt) {
        entries.push({
          kind: "lifecycle",
          at: acceptedAt.toISOString(),
          actorName: nameOf((row as any).acceptedBy),
          fromStatus: null,
          toStatus: null,
          label: "Accepted for execution",
          reason: null,
        });
      }
      const returnedAt = (row as any).returnedAt as Date | null | undefined;
      if (returnedAt) {
        entries.push({
          kind: "lifecycle",
          at: returnedAt.toISOString(),
          actorName: nameOf((row as any).returnedBy),
          fromStatus: null,
          toStatus: null,
          label: "Returned for rework",
          reason: (row as any).reviewComment ?? null,
        });
      }
      // DEF-0029 — the row's arrival itself is a lifecycle event distinct
      // from any result change; without it, a freshly-added row that hasn't
      // been executed yet had nothing in its trail explaining how it got
      // there. reviewState "pending" means it's still awaiting the peer
      // acceptance a file approved after this row was added requires.
      if ((row as any).addedBy != null) {
        entries.push({
          kind: "lifecycle",
          at: row.createdAt.toISOString(),
          actorName: nameOf((row as any).addedBy),
          fromStatus: null,
          toStatus: null,
          label: (row as any).reviewState === "pending" ? "Added — draft, pending peer acceptance" : "Added",
          reason: null,
        });
      }

      // Newest first — a trail is read from "what happened last" backwards.
      entries.sort((a, b) => b.at.localeCompare(a.at));

      res.json({
        testCaseId: row.testCaseId,
        caseName: row.caseName,
        currentResult: row.result,
        addedByName: nameOf((row as any).addedBy),
        entries,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch test case history" });
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
          reviewState: executionTestCasesTable.reviewState,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      type ExistingState = { result: string | null; executedAt: Date | null; reviewState: string };
      const existingMap = new Map<string, ExistingState>(
        existingRows
          .filter((r) => r.testCaseId)
          .map((r) => [r.testCaseId!, {
            result: r.result ?? null,
            executedAt: r.executedAt ?? null,
            reviewState: r.reviewState ?? "accepted",
          }]),
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

      // A peer approved this file's contents as they stood at approval time.
      // Anything inserted afterwards was never part of that sign-off, so it
      // lands 'pending' and stays off the executable sheet until a peer
      // accepts it. Rows added while the file is still draft/in_review need
      // no separate gate — the file-level review that follows covers them.
      const fileApproved = (file as any).reviewStatus === "approved";
      const pendingInserts: { id: number; caseName: string | null; testCaseId: string | null }[] = [];

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

      // 2. Auto-assign TC IDs — find the highest existing sequence number.
      //
      // Matched on the trailing sequence rather than "TC-<digits>-<digits>":
      // a file created without a Redmine ticket carries a generated reference
      // ("INT-0004"), so its labels read TC-INT-0004-001 and the old
      // digits-only pattern matched none of them — every new row on such a
      // file would have been handed sequence 001.
      const trailingSeq = (label: string | null | undefined): number | null => {
        const match = label ? /-(\d+)$/.exec(label) : null;
        return match ? parseInt(match[1], 10) : null;
      };
      let nextSeq = 1;
      for (const r of existingRows) {
        const n = trailingSeq(r.testCaseId);
        if (n !== null && n >= nextSeq) nextSeq = n + 1;
      }
      for (const t of testCases) {
        const n = trailingSeq(t.testCaseId);
        if (n !== null && n >= nextSeq) nextSeq = n + 1;
      }

      // CR064 — a TC linked to a blocked requirement can't record a new
      // result until FA/PM unblocks it (same freeze principle as CR063's
      // dev-handoff freeze). Per-row, not a whole-request reject: a bulk
      // save that happens to include an already-unchanged blocked row
      // shouldn't lose everyone else's edits over it — the attempted
      // change is just silently reverted to whatever was already stored.
      const incomingReqIds = [...new Set(
        testCases.map((t: any) => (t.requirementId ? Number(t.requirementId) : null)).filter((id): id is number => id != null),
      )];
      const blockedReqIds = new Set<number>(
        incomingReqIds.length
          ? (await db.select({ id: requirementsTable.id }).from(requirementsTable)
              .where(and(inArray(requirementsTable.id, incomingReqIds), eq(requirementsTable.isBlocked, true))))
              .map((r) => r.id)
          : [],
      );
      // A test case can be written, reviewed and approved while the feature it
      // covers is still being built — that approval says the case is sound, not
      // that the build is ready to run it against. Until dev hands the
      // requirement over (devStatus 'ready_for_qa'), a result recorded here
      // would be an outcome against unfinished code. Reverted per row like the
      // blocked-requirement guard above, for the same reason: one frozen row
      // must not cost the rest of the sheet its edits.
      const inDevelopmentReqIds = await findInDevelopmentRequirementIds(incomingReqIds);
      const blockedResultRows: string[] = [];
      const unacceptedResultRows: string[] = [];
      const inDevelopmentResultRows: string[] = [];
      const unassignedResultRows: string[] = [];

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
        let newResult = (t.result?.trim() || null) as string | null;
        if (t.requirementId && blockedReqIds.has(Number(t.requirementId)) && newResult !== (existing?.result ?? null)) {
          blockedResultRows.push(tcId || t.caseId || `row ${idx + 1}`);
          newResult = existing?.result ?? null;
        }
        if (t.requirementId && inDevelopmentReqIds.has(Number(t.requirementId)) && newResult !== (existing?.result ?? null)) {
          inDevelopmentResultRows.push(tcId || t.caseId || `row ${idx + 1}`);
          newResult = existing?.result ?? null;
        }
        // A result is an outcome somebody owns: the QA PIC is who the trail,
        // the defect and any retest hang off. Changing the result on a row
        // nobody has taken leaves the verdict unattributable, so it is reverted
        // the same per-row way as the guards above. The incoming qaPic counts,
        // so "assign to me and record the result" still saves in one go.
        // Scoped to rows already stored: a first import carries whatever the
        // spreadsheet recorded, and legacy sheets routinely have no QA PIC
        // column — blanking their results on the way in would lose real data.
        if (existing && !(t.qaPic || "").trim() && newResult !== (existing.result ?? null)) {
          unassignedResultRows.push(tcId || t.caseId || `row ${idx + 1}`);
          newResult = existing.result ?? null;
        }
        // A row still waiting on peer acceptance isn't executable yet — the
        // same freeze the file-level gate applies, applied per row. Reverted
        // silently rather than failing the whole save, so one unaccepted row
        // never costs everyone else their edits (as with the block above).
        if (existing && existing.reviewState !== "accepted" && newResult !== (existing.result ?? null)) {
          unacceptedResultRows.push(tcId || t.caseId || `row ${idx + 1}`);
          newResult = existing.result ?? null;
        }
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
          // Group rows are section banners carrying no test content, so they
          // never need accepting — only real cases go through the gate.
          const needsAcceptance = fileApproved && !isGroupTag;
          const [inserted] = await db
            .insert(executionTestCasesTable)
            .values({
              ...rowData,
              addedBy: changedBy,
              ...(needsAcceptance ? { reviewState: "pending" } : {}),
            })
            .returning();
          if (inserted) {
            insertedRows.push({ ...inserted, _tempId: t._tempId });
            processedCases.push({ ...t, testCaseId: tcId });
            if (needsAcceptance) {
              pendingInserts.push({ id: inserted.id, caseName: inserted.caseName, testCaseId: inserted.testCaseId });
            }
          }
        }
      }

      // 3a. Write status change history for incoming rows. `resultChangeReason`
      // is what the sheet collects when a tester overwrites a result that was
      // already recorded — the trail's whole point is that "Passed -> Failed,
      // three weeks later" is answerable without asking around.
      const historyRows = processedCases
        .filter((t: any) => t.testCaseId)
        .flatMap((t: any) => {
          const existing = existingMap.get(t.testCaseId);
          const oldResult = existing?.result ?? null;
          const newResult = (t.result?.trim() || null) as string | null;
          if (oldResult === newResult || (!oldResult && !newResult)) return [];
          // DEF-0029 — a row's result defaults to the display string "Not
          // Executed" rather than empty, so a brand-new row otherwise reads
          // as a real null -> "Not Executed" transition. That's not a change
          // anyone made; skip it (the "Added" entry below covers the row's
          // actual arrival).
          if (oldResult === null && newResult === "Not Executed") return [];
          const reason = typeof t.resultChangeReason === "string" ? t.resultChangeReason.trim() : "";
          return [{
            executionFileId: file.id,
            testCaseId: t.testCaseId,
            changedBy,
            fromStatus: oldResult,
            toStatus: newResult,
            reason: reason || null,
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

      // 3c. CR078 — compact TC numbering. The sequence in a TC label is the
      // row's position in the sheet, not a permanent identity: deleting row 17
      // of 20 used to leave 15, 16, 18, 19, 20 forever, because step 2 only
      // ever hands out max(seq) + 1. This re-derives every label from the
      // file's real row order on each save, so a delete closes the gap and a
      // reorder moves the number with the position. Files that already carry
      // gaps heal on their next save — no migration needed.
      //
      // Runs after the history/audit blocks above on purpose: those diff on
      // the pre-renumber labels, and rewriting first would make every renamed
      // row look like a brand-new TC.
      //
      // Safe to rewrite: defects and tasks link to a test case by integer row
      // id (defects.test_case_id / tasks.test_case_id are integers), so only
      // the display label moves. execution_tc_history stores the label as
      // text, so it's remapped below to keep the History Trail pointing at the
      // right row.
      const orderedRows = await db
        .select({
          id: executionTestCasesTable.id,
          testCaseId: executionTestCasesTable.testCaseId,
          rowType: executionTestCasesTable.rowType,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id))
        .orderBy(executionTestCasesTable.rowOrder, executionTestCasesTable.id);

      // id -> new label, for every row whose label actually moved
      const renumbered: { id: number; testCaseId: string }[] = [];
      // old label -> new label, for remapping the text-keyed history rows
      const labelRenames = new Map<string, string>();
      let posSeq = 0;
      for (const r of orderedRows) {
        // Group tags are section banners, not test cases — they take no number
        // and must not consume one, or the numbering would skip at each banner.
        if (r.rowType === "group") continue;
        posSeq++;
        const wanted = `TC-${ticketId}-${String(posSeq).padStart(3, "0")}`;
        if (r.testCaseId === wanted) continue;
        renumbered.push({ id: r.id, testCaseId: wanted });
        if (r.testCaseId) labelRenames.set(r.testCaseId, wanted);
      }

      if (renumbered.length > 0) {
        for (const r of renumbered) {
          await db
            .update(executionTestCasesTable)
            .set({ testCaseId: r.testCaseId })
            .where(
              and(
                eq(executionTestCasesTable.id, r.id),
                eq(executionTestCasesTable.executionFileId, file.id),
              ),
            );
        }

        // Remap history by history-row id, not by label. A shift-up renames in
        // a chain (018 -> 017, 019 -> 018, ...); running those as sequential
        // WHERE test_case_id = old updates would re-catch rows an earlier step
        // had just renamed and drag them down twice.
        const historyToRemap = await db
          .select({
            id: executionTcHistoryTable.id,
            testCaseId: executionTcHistoryTable.testCaseId,
          })
          .from(executionTcHistoryTable)
          .where(eq(executionTcHistoryTable.executionFileId, file.id));
        for (const h of historyToRemap) {
          const nextLabel = labelRenames.get(h.testCaseId);
          if (!nextLabel || nextLabel === h.testCaseId) continue;
          await db
            .update(executionTcHistoryTable)
            .set({ testCaseId: nextLabel })
            .where(eq(executionTcHistoryTable.id, h.id));
        }

        // Rows inserted this request were returned with their pre-renumber
        // label; the client keys off this payload, so hand back the final one.
        const finalLabelById = new Map(renumbered.map((r) => [r.id, r.testCaseId]));
        for (const row of insertedRows) {
          const finalLabel = finalLabelById.get(row.id);
          if (finalLabel) row.testCaseId = finalLabel;
        }
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

      if (file.milestoneId != null) {
        await syncMilestoneStatus(file.milestoneId);
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
        // CR078 — existing rows whose TC label shifted because of a delete or
        // reorder, so the open sheet relabels them in place instead of showing
        // stale numbers until the next full reload.
        ...(renumbered.length > 0 ? { renumbered } : {}),
        // CR064 — any attempted result change reverted because its linked
        // requirement is blocked (the UI already prevents this, but a stale
        // page or direct API call could still try).
        ...(blockedResultRows.length > 0 ? { blockedResultRows } : {}),
        // Attempted result changes reverted because the row is still awaiting
        // peer acceptance (or was returned to its author for rework).
        ...(unacceptedResultRows.length > 0 ? { unacceptedResultRows } : {}),
        // Attempted result changes reverted because the linked requirement is
        // still in development, so there is nothing finished to test against.
        ...(inDevelopmentResultRows.length > 0 ? { inDevelopmentResultRows } : {}),
        // Attempted result changes reverted because the row has no QA PIC —
        // nobody owns the execution, so there is nobody to attribute it to.
        ...(unassignedResultRows.length > 0 ? { unassignedResultRows } : {}),
        ...(pendingInserts.length > 0 ? { pendingAcceptance: pendingInserts.length } : {}),
      });

      // Added to a live, already-approved file — tell the peers who can accept
      // them, otherwise the rows sit frozen until someone happens to look.
      if (pendingInserts.length > 0 && file.projectId != null) {
        const n = pendingInserts.length;
        const first = pendingInserts[0].testCaseId || pendingInserts[0].caseName || "A test case";
        notifyRolesInProject({
          roles: await reviewRoleNames("qa"),
          projectId: file.projectId,
          module: file.selectedModules,
          title: n === 1 ? "New test case awaiting acceptance" : `${n} new test cases awaiting acceptance`,
          message: `${n === 1 ? `"${first}" was` : `${n} test cases were`} added to the already-approved ${file.title || file.redmineTicketId} and cannot be executed until accepted.`,
          type: "review_request",
          entityType: "execution_file",
          entityId: file.id,
          actorId: changedBy,
        }).catch(() => {});
      }
    } catch {
      res.status(500).json({ error: "Failed to save test cases" });
    }
  },
);

// Optional evidence for a passed test-case execution result.
router.post("/execution-test-cases/:id/evidence", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const rowId = Number(req.params.id);
  if (!Number.isInteger(rowId)) { res.status(400).json({ error: "Invalid test case ID" }); return; }
  const scope = await getExecutionEvidenceScope(rowId);
  if (!scope) { res.status(404).json({ error: "Execution test case not found" }); return; }
  if (!(await canAccessFileProject(ctx, scope.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const [executionRow] = await db
    .select({ result: executionTestCasesTable.result })
    .from(executionTestCasesTable)
    .where(eq(executionTestCasesTable.id, rowId));
  if ((executionRow?.result ?? "").trim().toLowerCase() !== "passed") {
    res.status(409).json({ error: "Evidence can only be attached to a passed test case" }); return;
  }

  const { fileName, mimeType, dataBase64 } = req.body ?? {};
  if (!fileName || !dataBase64) { res.status(400).json({ error: "fileName and dataBase64 are required" }); return; }
  const cleanBase64 = String(dataBase64).replace(/^data:[^;]+;base64,/, "");
  if (cleanBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
    res.status(400).json({ error: "Attachment data is invalid" }); return;
  }
  const sizeBytes = Buffer.from(cleanBase64, "base64").length;
  if (sizeBytes === 0) { res.status(400).json({ error: "Attachment is empty" }); return; }
  if (sizeBytes > MAX_EXECUTION_EVIDENCE_BYTES) { res.status(400).json({ error: "File too large (max 10 MB)" }); return; }

  const originalName = String(fileName).replace(/[\r\n]/g, " ").slice(0, 255);
  // Names already on this row, so a second upload in the same second gets a
  // "-2" suffix instead of silently clashing once the export ZIP is extracted.
  const existingNames = await db
    .select({ fileName: executionTcEvidenceTable.fileName })
    .from(executionTcEvidenceTable)
    .where(eq(executionTcEvidenceTable.executionTestCaseId, rowId));
  const storedName = buildEvidenceFileName({
    testCaseId: scope.testCaseId ?? null,
    ticketId: scope.redmineTicketId ?? null,
    rowId,
    originalName,
    taken: new Set(existingNames.map((e) => e.fileName.toLowerCase())),
  });

  const [created] = await db.insert(executionTcEvidenceTable).values({
    executionTestCaseId: rowId,
    fileName: storedName,
    originalFileName: originalName,
    mimeType: String(mimeType || "application/octet-stream").slice(0, 150),
    sizeBytes,
    dataBase64: cleanBase64,
    uploadedBy: ctx.userId,
  }).returning({
    id: executionTcEvidenceTable.id,
    executionTestCaseId: executionTcEvidenceTable.executionTestCaseId,
    fileName: executionTcEvidenceTable.fileName,
    originalFileName: executionTcEvidenceTable.originalFileName,
    mimeType: executionTcEvidenceTable.mimeType,
    sizeBytes: executionTcEvidenceTable.sizeBytes,
    uploadedBy: executionTcEvidenceTable.uploadedBy,
    createdAt: executionTcEvidenceTable.createdAt,
  });

  await logActivity({
    type: "execution_evidence_uploaded",
    description: `Evidence "${created.originalFileName ?? created.fileName}" attached to ${scope.testCaseId ?? scope.caseName ?? `test case #${rowId}`}`,
    userId: ctx.userId,
    entityId: scope.executionFileId,
    entityType: "execution",
  });
  res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
});

router.get("/execution-test-cases/:rowId/evidence/:evidenceId/download", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const rowId = Number(req.params.rowId);
  const evidenceId = Number(req.params.evidenceId);
  if (!Number.isInteger(rowId) || !Number.isInteger(evidenceId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const scope = await getExecutionEvidenceScope(rowId);
  if (!scope) { res.status(404).json({ error: "Execution test case not found" }); return; }
  if (!(await canAccessFileProject(ctx, scope.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  const [evidence] = await db.select().from(executionTcEvidenceTable).where(
    and(eq(executionTcEvidenceTable.id, evidenceId), eq(executionTcEvidenceTable.executionTestCaseId, rowId)),
  );
  if (!evidence) { res.status(404).json({ error: "Evidence not found" }); return; }
  const wantsInline = req.query.inline === "1" || req.query.inline === "true";
  const disposition = wantsInline && SAFE_INLINE_EVIDENCE_MIME.has(evidence.mimeType) ? "inline" : "attachment";
  res.setHeader("Content-Type", evidence.mimeType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${evidence.fileName.replace(/"/g, "")}"`);
  res.send(Buffer.from(evidence.dataBase64, "base64"));
});

router.delete("/execution-test-cases/:rowId/evidence/:evidenceId", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const rowId = Number(req.params.rowId);
  const evidenceId = Number(req.params.evidenceId);
  if (!Number.isInteger(rowId) || !Number.isInteger(evidenceId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const scope = await getExecutionEvidenceScope(rowId);
  if (!scope) { res.status(404).json({ error: "Execution test case not found" }); return; }
  if (!(await canAccessFileProject(ctx, scope.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  const [evidence] = await db.select().from(executionTcEvidenceTable).where(
    and(eq(executionTcEvidenceTable.id, evidenceId), eq(executionTcEvidenceTable.executionTestCaseId, rowId)),
  );
  if (!evidence) { res.status(404).json({ error: "Evidence not found" }); return; }
  if (evidence.uploadedBy !== ctx.userId && !["admin", "cto"].includes(ctx.role)) {
    res.status(403).json({ error: "Only the uploader or an admin can delete this evidence" }); return;
  }
  await db.delete(executionTcEvidenceTable).where(eq(executionTcEvidenceTable.id, evidenceId));
  await logActivity({
    type: "execution_evidence_deleted",
    description: `Evidence "${evidence.originalFileName ?? evidence.fileName}" removed from ${scope.testCaseId ?? scope.caseName ?? `test case #${rowId}`}`,
    userId: ctx.userId,
    entityId: scope.executionFileId,
    entityType: "execution",
  });
  res.status(204).end();
});

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

    // Evidence attached to these rows. It rides along in the download so the
    // Excel is an audit-ready pack rather than a spreadsheet whose proof lives
    // behind one manual click per row, and so the sheet's Evidence column has
    // something to point at.
    const rowIds = testCases.map((t) => t.id).filter((id): id is number => typeof id === "number");
    const evidenceRows = rowIds.length > 0
      ? await db
          .select()
          .from(executionTcEvidenceTable)
          .where(inArray(executionTcEvidenceTable.executionTestCaseId, rowIds))
          .orderBy(executionTcEvidenceTable.createdAt)
      : [];

    const evidenceByRow = new Map<number, typeof evidenceRows>();
    for (const row of testCases) {
      // Same rule the grid applies: evidence from a previous pass attempt stays
      // in the audit trail but must not be exported as proof of the current
      // result, or a re-run would look evidenced when it isn't.
      const executedAtMs = row.executedAt ? new Date(row.executedAt as any).getTime() : 0;
      const forRow = evidenceRows.filter((e) =>
        e.executionTestCaseId === row.id
        && (!executedAtMs || new Date(e.createdAt).getTime() >= executedAtMs - 2_000));
      if (forRow.length > 0) evidenceByRow.set(row.id, forRow);
    }

    const evidenceEntries: ZipEntry[] = [];
    // Stored names are only deduplicated within their own execution row, but
    // two rows carrying the same test case id share a folder here — so the
    // archive gets the last word on uniqueness. Extracting a ZIP with repeated
    // paths silently drops files.
    const usedPaths = new Set<string>();
    const uniquePath = (folder: string, name: string): string => {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let path = `${folder}/${name}`;
      for (let n = 2; usedPaths.has(path.toLowerCase()); n++) path = `${folder}/${stem}-${n}${ext}`;
      usedPaths.add(path.toLowerCase());
      return path;
    };

    const testCasesForExcel = testCases.map((row) => {
      const attached = evidenceByRow.get(row.id);
      if (!attached || attached.length === 0) return row;
      const folder = `${EVIDENCE_ZIP_ROOT}/${evidenceFolderName(row.testCaseId ?? null, row.id)}`;
      const links: ExcelEvidenceLink[] = attached.map((e) => {
        const path = uniquePath(folder, e.fileName);
        evidenceEntries.push({ path, data: Buffer.from(e.dataBase64, "base64"), date: e.createdAt });
        return { fileName: e.fileName, originalFileName: e.originalFileName, path, folderPath: `${folder}/` };
      });
      return { ...row, evidence: links };
    });

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

    // Peer review: fill Doc Info's Reviewed By/Date once the file has actually
    // gone through submit-for-review -> approve, instead of leaving it blank
    // for manual fill regardless of whether the review already happened.
    let reviewedByName: string | null = null;
    if (file && (file as any).reviewStatus === "approved" && (file as any).approvedBy) {
      const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, (file as any).approvedBy));
      reviewedByName = reviewer?.name ?? null;
    }
    const reviewedAt = file && (file as any).reviewStatus === "approved"
      ? ((file as any).approvedAt instanceof Date ? (file as any).approvedAt.toISOString() : (file as any).approvedAt ?? null)
      : null;

    // The tracker also feeds the Excel's Tracker column for rows that have no
    // tracker of their own, so fall back to the file's before the placeholder.
    const typeLabel = issueType || file?.tracker || "Issue";

    // CR006: AI-generated CAPA items
    const capaItems = await runCapaAI(ticketId, testCases);

    // Document register — look up Ref No by project + module + tracker, same
    // lookup the Send Verdict flow uses, so the two Excel exports agree
    // instead of this one falling back to the QA-<ticketId> placeholder.
    // moduleName must come from the file's own selected module(s), not the
    // parent project — matching it against the project name here always
    // failed against Document Register entries like "ePLKS"/"eQuota". A file
    // can have several selected modules (comma-separated) and only one of
    // them may be registered. eQuota is the module of record when it's
    // among them, so check it first regardless of list order; otherwise
    // fall through the rest in their original order and use the first match.
    let refNo: string | undefined;
    try {
      refNo = await resolveDocumentReference({
        projectId: file?.projectId, projectName,
        selectedModules: file?.selectedModules, tracker: typeLabel,
      });
    } catch (err) {
      console.warn("[download-excel] document register lookup failed:", err);
    }

    const buffer = await buildTestCaseExcel(testCasesForExcel as any, {
      redmineId: ticketId,
      issueType: typeLabel,
      issueSubject: issueSubject || file?.title || "",
      senderName: senderName || undefined,
      activeDefects,
      capaItems: capaItems.length > 0 ? capaItems : undefined,
      refNo,
      auditEntries: auditRows.map((a: any) => ({
        summary: a.summary,
        updatedByName: a.updatedByName ?? null,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        tcCount: a.tcCount ?? 0,
        reviewedByName: a.reviewedByName ?? null,
        reviewedAt: a.reviewedAt instanceof Date ? a.reviewedAt.toISOString() : (a.reviewedAt ?? null),
      })),
      reviewedByName,
      reviewedAt,
    });

    if (!buffer) {
      res.status(500).json({ error: "Failed to build Excel file. Template may be unavailable." });
      return;
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const tracker = (issueType || typeLabel).replace(/[^a-zA-Z0-9]/g, "");
    const proj = (projectName || "").replace(/[^a-zA-Z0-9]/g, "");
    const stem = proj
      ? `${date}.${proj}_${tracker}_${ticketId}`
      : `${date}.${tracker}_${ticketId}`;

    // No attachments — nothing to bundle, so keep handing back a plain workbook
    // rather than making everyone unzip a one-file archive.
    if (evidenceEntries.length === 0) {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${stem}.xlsx"`);
      res.send(buffer);
      return;
    }

    // The workbook sits at the archive root and the evidence beside it, because
    // the sheet's hyperlinks are relative to the workbook — extract the ZIP and
    // the links resolve; the reviewer never leaves Excel to find a screenshot.
    const zip = buildZip([
      { path: `${stem}.xlsx`, data: buffer },
      ...evidenceEntries,
    ]);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${stem}.zip"`);
    res.send(zip);
  } catch {
    res.status(500).json({ error: "Failed to download execution file" });
  }
});

export default router;
