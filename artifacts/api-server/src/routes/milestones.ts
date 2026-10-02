import { Router, type IRouter } from "express";
import { eq, and, ne, inArray, sql, desc, or } from "drizzle-orm";
import { db, activityTable, milestonesTable, milestoneModulesTable, milestoneAssigneesTable, usersTable, projectMembersTable, projectsTable, requirementsTable, executionFilesTable, executionTestCasesTable, uatSignoffsTable, dataPrepFilesTable, risksTable } from "@workspace/db";
import { getAuthContext, canAccessProject, getRoleDepartment } from "../middleware/access";
import { verifyToken } from "./auth";
import { logActivity } from "./_audit";
import { notifyRolesInProject, notifyUser } from "./_notify";
import { buildLessonsLearnedExcel, type LessonLogRow, type LessonLogHistoryRow } from "./lessons-learned-excel";
import { syncMilestoneStatus } from "../lib/milestone-status";
import { loadMilestoneModules, parseModuleIds, validateMilestoneModules, setMilestoneModules } from "../lib/milestone-modules";
import { loadTypeTrackerMap } from "../lib/milestone-trackers";
import { milestonePermissions, canEditMilestone, canStaffMilestone } from "../lib/milestone-permissions";
import { describeMilestoneChanges, summariseChanges } from "../lib/milestone-changes";
import { loadPipelineFacts, executionOutcome, isConditionalSignoff, computeDeployChecks } from "../lib/pipeline-facts";

const router: IRouter = Router();

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return null; }
  try {
    const { id, role } = verifyToken(auth.slice(7));
    return { userId: id, role };
  }
  catch { res.status(401).json({ error: "Unauthorized" }); return null; }
}

function canWrite(role: string) {
  // pm_lead/pm_member were missing here even though dashboard.ts's PM_ROLES
  // already treats them as legitimate PM roles for reading milestone data —
  // without them a PM couldn't create, edit, or close their own milestones.
  return ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"].includes(role);
}

// DEF-0012 — dev_lead needs the Team section, not full milestone CRUD.
// Kept narrower than canWrite() on purpose: dev_lead can staff/unstaff a
// milestone's team but can't create, edit other fields, or delete it.
function canManageTeam(role: string) {
  return canWrite(role) || role === "dev_lead";
}

// DEF-0019 — department-restricted staffing: a department lead can only
// staff/unstaff their own department, PM-tier can staff qa/dev/fa, and
// HOD/CTO/admin are unrestricted. Shared by the milestone-create staffing
// loop and the POST/DELETE assignee endpoints so none of them can drift out
// of sync with each other again.
const SINGLE_DEPT_LEADS: Record<string, string> = { qa_lead: "qa", qa_manager: "qa", dev_lead: "dev", fa_lead: "fa" };
const ROLE_LABEL: Record<string, string> = { qa_lead: "QA Lead", qa_manager: "QA Manager", dev_lead: "Dev Lead", fa_lead: "FA Lead" };
const PM_TIER = ["pm_lead", "pm_member"];
async function checkDepartmentAssignment(actorRole: string, targetRole: string): Promise<string | null> {
  if (actorRole in SINGLE_DEPT_LEADS) {
    const targetDept = await getRoleDepartment(targetRole);
    if (targetDept !== SINGLE_DEPT_LEADS[actorRole]) {
      return `${ROLE_LABEL[actorRole] ?? actorRole} can only assign ${SINGLE_DEPT_LEADS[actorRole]} department members`;
    }
    return null;
  }
  if (PM_TIER.includes(actorRole)) {
    const targetDept = await getRoleDepartment(targetRole);
    if (!targetDept || !["qa", "dev", "fa"].includes(targetDept)) {
      return "PM roles can only assign QA, Dev, or FA department members";
    }
    return null;
  }
  // hod_*/cto/admin are unrestricted.
  return null;
}

// Shared by create-time staffing and later assignments.
async function ensureAssigningLead(milestoneId: number, role: string, leadId: number) {
  if (!(role in SINGLE_DEPT_LEADS)) return;
  const existing = await db.select().from(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, milestoneId), eq(milestoneAssigneesTable.userId, leadId)));
  if (existing.length === 0) {
    await db.insert(milestoneAssigneesTable).values({ milestoneId, userId: leadId, assignedBy: leadId });
  }
}

// QA Pipeline milestones (pipelineEnabled: true) are meant to be owned by the
// whole QA department, not just leads — qa_member/qa_manager can't create or
// edit regular milestones via canWrite() above, but must be able to drive
// their own pipeline milestone end to end (sync requirements, advance steps,
// sign off). Kept narrower than canWrite so non-pipeline milestones (and
// other roles' write access) are unaffected.
const QA_PIPELINE_ROLES = ["admin", "cto", "qa_member", "qa_lead", "qa_manager", "hod_qa"];

// Formal QA authority: records the functional sign-off (Step 6) and may
// reopen a pipeline that was already marked as deployed. Mirrors the
// client-side gate in Step6SignOff, which on its own was only cosmetic.
const PIPELINE_SIGNOFF_ROLES = ["admin", "qa_lead", "qa_manager", "hod_qa", "cto"];
function canWritePipeline(role: string, pipelineEnabled: boolean) {
  return canWrite(role) || (pipelineEnabled && QA_PIPELINE_ROLES.includes(role));
}

const VALID_ENVIRONMENTS = ["ENV1", "ENV2", "ENV3", "ENV4", "ENV5", "ENV6"];
const VALID_STATUSES = ["planned", "active", "verified", "uat", "completed", "cancelled"];
// Matches the "Lessons Learnt Type" dropdown in Bestinet's export template exactly.
const VALID_LESSON_TYPES = ["what_went_wrong", "what_went_right", "best_practice"];
const LESSON_TYPE_LABEL: Record<string, string> = {
  what_went_wrong: "What went wrong",
  what_went_right: "What went right",
  best_practice: "Best Practice",
};
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];

/**
 * Per-step state for the QA Deployment Pipeline stepper.
 *
 * The stepper used to colour its icons purely by position - anything before
 * the step you happened to be viewing rendered as a green tick. Navigation is
 * free-roam (goToStep lets anyone jump to any step, and two QA members often
 * work different steps at once), so position says nothing about whether the
 * work is actually done. These are the real gates.
 *
 * The eight entries line up with PIPELINE_STEPS on the client, and gates 2-8
 * mirror the conditions computePipelineState() uses for the dashboard's
 * pipeline progress bar, with two deliberate differences on the execution
 * gate (Step 5):
 *
 *   - group rows are excluded here. They are section banners, never carry a
 *     result, and counting them leaves any file that uses one permanently
 *     short of "fully executed". computePipelineState() still counts them,
 *     so its progress bar can under-report on such a milestone.
 *   - only QA files count here. UAT execution has its own gate at Step 7;
 *     computePipelineState() pools both.
 *
 * Worth aligning computePipelineState() to match, but that changes the
 * dashboard's numbers, so it is left as a separate decision.
 */
// "conditional" — 100% executed but not 100% passed (Step 5 "Conditional
// Pass"), or a sign-off recorded under those conditions (Steps 6 and 8
// "Conditional Sign Off"). Distinct from "done" so the rail never reads as a
// success signal for a step that went through with failures — 100% executed
// is not 100% passed. See STEP_STATE_LABEL / StepStateIcon on the client.
export type PipelineStepState = "done" | "in_progress" | "not_started" | "skipped" | "conditional";

function computePipelineStepStates(input: {
  requirementCount: number;
  execFileCount: number;
  approvedFileCount: number;
  totalExecRows: number;
  executedRows: number;
  failedRows: number;
  signedOff: boolean;
  conditionalSignoff: boolean;
  requiresUat: boolean;
  uatDocCount: number;
  deployed: boolean;
}): Record<number, PipelineStepState> {
  const {
    requirementCount, execFileCount, approvedFileCount,
    totalExecRows, executedRows, failedRows, signedOff, conditionalSignoff, requiresUat, uatDocCount, deployed,
  } = input;

  // Step 5 is "Conditional Pass" when 100% of test cases were executed but
  // some failed/blocked. Steps 6 and 8 are "Conditional Sign Off" when the
  // recorded sign-off was conditional — read from the frozen snapshot, so a
  // later retest doesn't rewrite what was signed.
  const allExecuted = totalExecRows > 0 && executedRows >= totalExecRows;
  const hasDefects = failedRows > 0;

  // "partial" is the difference between not-started and in-progress: some of
  // the work exists but the gate has not cleared yet.
  const states: Record<number, PipelineStepState> = {
    // Step 1 is satisfied by the milestone existing at all - reaching this
    // endpoint means it does.
    1: "done",
    2: requirementCount > 0 ? "done" : "not_started",
    3: execFileCount > 0 ? "done" : "not_started",
    4: execFileCount > 0 && approvedFileCount >= execFileCount
      ? "done"
      : approvedFileCount > 0
        ? "in_progress"
        : "not_started",
    5: allExecuted
      ? (hasDefects ? "conditional" : "done")
      : executedRows > 0
        ? "in_progress"
        : "not_started",
    6: signedOff
      ? (conditionalSignoff ? "conditional" : "done")
      : "not_started",
    7: !requiresUat ? "skipped" : uatDocCount > 0 ? "done" : "not_started",
    8: deployed
      ? (conditionalSignoff ? "conditional" : "done")
      : "not_started",
  };

  // The earliest unfinished step is where the pipeline actually sits right
  // now, so show it as in-progress rather than as an untouched step - that is
  // the "current work" signal the rail exists to give.
  for (let id = 1; id <= 8; id++) {
    if (states[id] === "not_started") {
      states[id] = "in_progress";
      break;
    }
    if (states[id] === "in_progress") break;
    // "conditional" counts as cleared for the pipeline-position scan — the
    // work is done, it just went through with known defects.
    if (states[id] === "conditional") continue;
  }

  return states;
}

// CR070 follow-up — Data Prep milestones walk a 2-step branch in the QA
// Pipeline UI (see DATA_PREP_STEPS client-side) instead of the 8-step wizard:
// they have no requirement/exec/sign-off chain to gate on, so step 2 is
// driven by the uploaded file count and the completed status instead.
function computeDataPrepStepStates(input: { fileCount: number; completed: boolean }): Record<number, PipelineStepState> {
  const { fileCount, completed } = input;
  return {
    1: "done",
    2: completed ? "done" : fileCount > 0 ? "in_progress" : "not_started",
  };
}

function fmt(m: typeof milestonesTable.$inferSelect) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    type: m.type,
    status: m.status,
    priority: m.priority ?? null,
    targetDate: m.targetDate?.toISOString() ?? null,
    startDate: m.startDate?.toISOString() ?? null,
    reqTargetDate: m.reqTargetDate?.toISOString() ?? null,
    devTargetDate: m.devTargetDate?.toISOString() ?? null,
    qaTargetDate: m.qaTargetDate?.toISOString() ?? null,
    uatTargetDate: m.uatTargetDate?.toISOString() ?? null,
    goLiveDate: m.goLiveDate?.toISOString() ?? null,
    environment: m.environment ?? null,
    createdBy: m.createdBy ?? null,
    completedAt: m.completedAt?.toISOString() ?? null,
    lessonsLearned: m.lessonsLearned ?? null,
    lessonsLearnedType: m.lessonsLearnedType ?? null,
    closedBy: m.closedBy ?? null,
    description: m.description ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    requiresUat: m.requiresUat ?? false,
    pipelineEnabled: m.pipelineEnabled ?? false,
    pipelineStep: m.pipelineStep ?? null,
    signedOffAt: m.signedOffAt?.toISOString() ?? null,
    signedOffBy: m.signedOffBy ?? null,
    signoffType: m.signoffType ?? null,
    signoffFailedCount: m.signoffFailedCount ?? null,
    signoffTotalCount: m.signoffTotalCount ?? null,
  };
}

// GET /milestones?projectId=X
router.get("/milestones", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db.select().from(milestonesTable)
    .where(eq(milestonesTable.projectId, projectId))
    .orderBy(desc(milestonesTable.createdAt));

  const ids = rows.map(m => m.id);
  const reqs = ids.length
    ? await db.select({ milestoneId: requirementsTable.milestoneId, reviewStatus: requirementsTable.reviewStatus })
        .from(requirementsTable).where(inArray(requirementsTable.milestoneId, ids))
    : [];
  const execFiles = ids.length
    ? await db.select({ milestoneId: executionFilesTable.milestoneId, fileType: executionFilesTable.fileType })
        .from(executionFilesTable).where(inArray(executionFilesTable.milestoneId, ids))
    : [];
  // CR070 — data-prep files rollup, mirrors the execFiles pattern above.
  const dataFiles = ids.length
    ? await db.select({ milestoneId: dataPrepFilesTable.milestoneId })
        .from(dataPrepFilesTable).where(inArray(dataPrepFilesTable.milestoneId, ids))
    : [];

  const modulesByMilestone = await loadMilestoneModules(ids);
  const trackerByType = await loadTypeTrackerMap();
  const teamRows = ids.length
    ? await db.select({ milestoneId: milestoneAssigneesTable.milestoneId, userId: milestoneAssigneesTable.userId })
        .from(milestoneAssigneesTable).where(inArray(milestoneAssigneesTable.milestoneId, ids))
    : [];

  res.json(rows.map(m => {
    const mReqs = reqs.filter(r => r.milestoneId === m.id);
    const mExecFiles = execFiles.filter(f => f.milestoneId === m.id);
    return {
      ...fmt(m),
      modules: modulesByMilestone.get(m.id) ?? [],
      tracker: trackerByType[m.type] ?? null,
      // What the caller may do with this milestone (the UI shows only these).
      can: milestonePermissions(ctx.role, ctx.userId, m, teamRows.some((t) => t.milestoneId === m.id && t.userId === ctx.userId)),
      assigned: teamRows.some((t) => t.milestoneId === m.id && t.userId === ctx.userId),
      requirementCount: mReqs.length,
      approvedCount: mReqs.filter(r => r.reviewStatus === "approved").length,
      executionFileCount: mExecFiles.filter(f => f.fileType === "qa").length,
      uatFileCount: mExecFiles.filter(f => f.fileType === "uat").length,
      dataPrepFileCount: dataFiles.filter(f => f.milestoneId === m.id).length,
    };
  }));
});

// GET /milestones/lessons-learned/export?projectId=X — Bestinet's official
// "5.1 Lesson Learned" PMO template
router.get("/milestones/lessons-learned/export", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Only completed milestones that actually captured a lessons-learned note.
  const closed = await db.select().from(milestonesTable)
    .where(and(eq(milestonesTable.projectId, projectId), eq(milestonesTable.status, "completed")))
    .orderBy(milestonesTable.completedAt);
  const withLessons = closed.filter((m) => m.lessonsLearned && m.lessonsLearned.trim().length > 0);

  const closerIds = [...new Set(withLessons.map((m) => m.closedBy).filter((id): id is number => id != null))];
  const closerNameById = closerIds.length
    ? new Map((await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, closerIds))).map((u) => [u.id, u.name]))
    : new Map<number, string>();

  const rows: LessonLogRow[] = withLessons.map((m) => ({
    milestoneName: m.name,
    description: m.lessonsLearned!,
    submittedDate: m.completedAt?.toISOString() ?? null,
    lessonType: m.lessonsLearnedType ? (LESSON_TYPE_LABEL[m.lessonsLearnedType] ?? null) : null,
  }));

  // Doc Info history: one row per milestone, since QM Pulse doesn't log a
  // distinct "lessons learned" activity event separately from the
  // completion transition itself (closedBy/completedAt IS that moment).
  const history: LessonLogHistoryRow[] = withLessons.map((m) => ({
    date: m.completedAt?.toISOString() ?? null,
    updatedByName: m.closedBy != null ? (closerNameById.get(m.closedBy) ?? null) : null,
    summary: `Lessons learned captured for milestone "${m.name}"`,
  }));

  const buffer = await buildLessonsLearnedExcel(rows, { projectName: project.name, history });
  if (!buffer) { res.status(500).json({ error: "Failed to build Lessons Learnt Excel. Template may be unavailable." }); return; }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const proj = project.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${date}_LessonsLearnt_${proj}.xlsx"`);
  res.send(buffer);
});

// POST /milestones
router.post("/milestones", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  if (!canWritePipeline(ctx.role, Boolean(req.body.pipelineEnabled))) { res.status(403).json({ error: "Insufficient role" }); return; }

  const { projectId, name, type = "cr", status = "planned", priority, targetDate, startDate, reqTargetDate, devTargetDate, qaTargetDate, uatTargetDate, goLiveDate, environment, description, assigneeUserIds, requiresUat, pipelineEnabled, pipelineStep } = req.body;
  if (!projectId || !name?.trim()) { res.status(400).json({ error: "projectId and name are required" }); return; }
  if (environment != null && !VALID_ENVIRONMENTS.includes(environment)) {
    res.status(400).json({ error: `environment must be one of ${VALID_ENVIRONMENTS.join(", ")}` }); return;
  }
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }); return;
  }
  // A pipeline only becomes 'completed' through Step 8's gated deploy action.
  if (pipelineEnabled && status === "completed") {
    res.status(400).json({ error: "A QA Pipeline milestone can't be created as completed — it is closed from Step 8" }); return;
  }
  if (priority != null && !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }); return;
  }

  const ok = await canAccessProject(ctx.userId, ctx.role, Number(projectId));
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  // Module scope — required for every type except data_prep. moduleIds picks
  // specific modules; allModules explicitly means "the whole project".
  const moduleIds = parseModuleIds(req.body.moduleIds ?? []);
  if (moduleIds == null) { res.status(400).json({ error: "moduleIds must be an array of module IDs" }); return; }
  const moduleError = await validateMilestoneModules({
    projectId: Number(projectId), type, moduleIds, allModules: req.body.allModules === true,
  });
  if (moduleError) { res.status(400).json({ error: moduleError }); return; }

  const [m] = await db.insert(milestonesTable).values({
    projectId: Number(projectId),
    name: name.trim(),
    type,
    status,
    priority: priority ?? null,
    // DEF-0013 — Target Date is no longer a client-facing field; it tracks
    // Go-Live Date automatically so the two never drift apart.
    targetDate: goLiveDate ? new Date(goLiveDate) : (targetDate ? new Date(targetDate) : null),
    startDate: startDate ? new Date(startDate) : null,
    reqTargetDate: reqTargetDate ? new Date(reqTargetDate) : null,
    devTargetDate: devTargetDate ? new Date(devTargetDate) : null,
    qaTargetDate: qaTargetDate ? new Date(qaTargetDate) : null,
    uatTargetDate: uatTargetDate ? new Date(uatTargetDate) : null,
    goLiveDate: goLiveDate ? new Date(goLiveDate) : null,
    environment: environment ?? null,
    description: description ? String(description).trim() || null : null,
    createdBy: (ctx as any).id ?? ctx.userId,
    // Edge case: importing a historical milestone already marked completed.
    completedAt: status === "completed" ? new Date() : null,
    requiresUat: Boolean(requiresUat),
    pipelineEnabled: Boolean(pipelineEnabled),
    pipelineStep: pipelineStep ? Number(pipelineStep) : null,
  }).returning();

  await setMilestoneModules(m.id, moduleIds);

  await logActivity({ type: "milestone_created", description: `Milestone "${m.name}" created`, userId: (ctx as any).id ?? ctx.userId, entityId: m.id, entityType: "milestone" });

  // CR102 — every lead (QA, FA, Dev, PM) with access to the project is told a
  // milestone opened; when it is limited to some modules, only leads whose
  // access covers one of them. People put on the team are told separately that
  // they were assigned, so they are not sent this one as well. (Before, only FA
  // Leads and FA Members were told.)
  const createdModules = ((await loadMilestoneModules([m.id])).get(m.id) ?? []).map((x) => x.name);
  const assignedAtCreate = Array.isArray(assigneeUserIds) ? assigneeUserIds.map(Number).filter(Boolean) : [];
  await notifyRolesInProject({
    roles: ["qa_lead", "fa_lead", "dev_lead", "pm_lead"],
    projectId: m.projectId,
    module: createdModules,
    title: "New milestone created",
    message: `Milestone "${m.name}" was created${createdModules.length ? ` for ${createdModules.join(", ")}` : ""}.`,
    type: "milestone_created",
    entityType: "milestone",
    entityId: m.id,
    actorId: (ctx as any).id ?? ctx.userId,
    excludeUserIds: assignedAtCreate,
  }).catch(() => {});

  // Apply the same department and lead-membership rules as later staffing.
  // Invalid targets are skipped without discarding the saved milestone.
  if (Array.isArray(assigneeUserIds)) {
    let staffed = false;
    for (const userId of new Set<number>(assigneeUserIds.map(Number))) {
      if (!userId) continue;
      const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
      if (!target || !(await canAccessProject(target.id, target.role, m.projectId))) continue;
      // DEF-0019 — same department restriction as POST /milestones/:id/assignees;
      // staffing at create time isn't a separate door around that rule.
      if (await checkDepartmentAssignment(ctx.role, target.role)) continue;
      await db.insert(milestoneAssigneesTable).values({ milestoneId: m.id, userId, assignedBy: (ctx as any).id ?? ctx.userId });
      staffed = true;
      await notifyUser(userId, "Assigned to milestone", `You've been assigned to milestone "${m.name}".`, "milestone", "milestone", m.id, (ctx as any).id ?? ctx.userId).catch(() => {});
    }
    if (staffed) await ensureAssigningLead(m.id, ctx.role, ctx.userId);
  }

  res.status(201).json({ ...fmt(m), modules: (await loadMilestoneModules([m.id])).get(m.id) ?? [] });
});

// GET /milestones/assignable-users?projectId=N — same staffing-candidate
// list as /milestones/:id/assignable-users, but keyed by project instead of
// an existing milestone so the create dialog can offer it before the
// milestone exists. Must be registered before GET /milestones/:id or Express
// would treat "assignable-users" as the :id param.
router.get("/milestones/assignable-users", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  // No canWrite gate here on purpose: this is a read-only project-roster
  // lookup (also used by DEF-0021's AI Test Case "Assign Author" picker,
  // which qa_member needs to use), not a staffing action — the
  // canAccessProject check below is the real boundary, same names/roles a
  // project member can already see on the Team page.
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(projectMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
    .where(eq(projectMembersTable.projectId, projectId));
  const seen = new Set<number>();
  const deduped = rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  // DEF-0019 — the picker itself should only offer candidates the caller is
  // actually allowed to staff, not rely on the POST 403 to catch a bad pick
  // after the fact. checkDepartmentAssignment is a no-op for roles it
  // doesn't restrict (qa_member, hod_*, cto, admin), so this doesn't affect
  // DEF-0021's AI Test Case "Assign Author" use of this same endpoint.
  const deptChecks = await Promise.all(deduped.map((r) => checkDepartmentAssignment(ctx.role, r.role)));
  res.json(deduped.filter((_, i) => deptChecks[i] === null));
});

// GET /milestones/:id
router.get("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, m.projectId);
  if (!ok) { res.status(403).json({ error: "Access denied" }); return; }

  // Counts for the milestone. Execution tallies count QA files only and skip
  // group rows — see lib/pipeline-facts.ts for the shared rules.
  const facts = await loadPipelineFacts(id);
  const { reqs, execFiles } = facts;
  const dataFiles = await db.select({ id: dataPrepFilesTable.id })
    .from(dataPrepFilesTable).where(eq(dataPrepFilesTable.milestoneId, id));

  const detailAssigned = (await db.select({ id: milestoneAssigneesTable.id }).from(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, id), eq(milestoneAssigneesTable.userId, ctx.userId)))).length > 0;
  const createdByName = m.createdBy
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, m.createdBy)))[0]?.name ?? null
    : null;
  const conditionalSignoff = isConditionalSignoff(m, facts);
  const pipelineStepStates = m.type === "data_prep"
    ? computeDataPrepStepStates({
        fileCount: dataFiles.length,
        completed: m.status === "completed",
      })
    : computePipelineStepStates({
        requirementCount: facts.requirementCount,
        execFileCount: facts.qaFileCount,
        approvedFileCount: facts.approvedQaFileCount,
        totalExecRows: facts.totalExecRows,
        executedRows: facts.executedRows,
        failedRows: facts.failedRows,
        signedOff: !!m.signedOffAt,
        conditionalSignoff,
        requiresUat: !!m.requiresUat,
        uatDocCount: facts.uatDocCount,
        deployed: m.status === "completed",
      });

  // Resolve the sign-off signer so the pipeline's sign-off step can name who
  // approved it — fmt() only carries the raw user id.
  let signedOffByName: string | null = null;
  let signedOffByRole: string | null = null;
  if (m.signedOffBy) {
    const [signer] = await db
      .select({ name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, m.signedOffBy));
    signedOffByName = signer?.name ?? null;
    signedOffByRole = signer?.role ?? null;
  }

  res.json({
    ...fmt(m),
    modules: (await loadMilestoneModules([id])).get(id) ?? [],
    tracker: (await loadTypeTrackerMap())[m.type] ?? null,
    can: milestonePermissions(ctx.role, ctx.userId, m, detailAssigned),
    assigned: detailAssigned,
    createdByName,
    signedOffByName,
    signedOffByRole,
    requirementCount: reqs.length,
    approvedCount: reqs.filter(r => r.reviewStatus === "approved").length,
    executionFileCount: execFiles.filter(f => f.fileType === "qa").length,
    uatFileCount: execFiles.filter(f => f.fileType === "uat").length,
    uatSignoffCount: facts.uatDocCount,
    dataPrepFileCount: dataFiles.length,
    execRowCount: facts.totalExecRows,
    execExecutedCount: facts.executedRows,
    execFailedCount: facts.failedRows,
    executionOutcome: executionOutcome(facts),
    signoffConditional: conditionalSignoff,
    deployChecks: computeDeployChecks(m, facts, signedOffByName),
    pipelineStepStates,
  });
});

// PATCH /milestones/:id
router.patch("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!canEditMilestone(ctx.role, ctx.userId, m)) { res.status(403).json({ error: "Only the milestone's author or a PM Lead can edit it" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const isPipeline = !!m.pipelineEnabled;
  const isDeployed = m.status === "completed";
  const reopening = req.body.status !== undefined && req.body.status !== "completed" && isDeployed;
  const deploying = req.body.status === "completed" && !isDeployed;
  const touchesSignoff = req.body.signedOffAt !== undefined || req.body.signedOffBy !== undefined;

  if (isPipeline) {
    if (reopening && !PIPELINE_SIGNOFF_ROLES.includes(ctx.role)) {
      res.status(403).json({ error: "Only QA Leads, QA Managers, HOD QA, CTO or admin can reopen a deployed pipeline" }); return;
    }
    // A deployed pipeline is a closed record: its position and sign-off can't
    // be rewritten. Milestone details and dates stay editable.
    // requiresUat decides whether Step 7 gated the deployment, so flipping it
    // afterwards would rewrite what the pipeline was closed against.
    const changesUat = req.body.requiresUat !== undefined && Boolean(req.body.requiresUat) !== !!m.requiresUat;
    if (isDeployed && !reopening && (req.body.pipelineStep !== undefined || touchesSignoff || changesUat)) {
      res.status(409).json({ error: "This pipeline is completed and locked" }); return;
    }
  }

  const update: Partial<typeof milestonesTable.$inferInsert> = {};
  if (req.body.name !== undefined) update.name = req.body.name.trim();
  if (req.body.type !== undefined) update.type = req.body.type;
  if (req.body.targetDate !== undefined) update.targetDate = req.body.targetDate ? new Date(req.body.targetDate) : null;
  if (req.body.startDate !== undefined) update.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
  if (req.body.reqTargetDate !== undefined) update.reqTargetDate = req.body.reqTargetDate ? new Date(req.body.reqTargetDate) : null;
  if (req.body.devTargetDate !== undefined) update.devTargetDate = req.body.devTargetDate ? new Date(req.body.devTargetDate) : null;
  if (req.body.qaTargetDate !== undefined) update.qaTargetDate = req.body.qaTargetDate ? new Date(req.body.qaTargetDate) : null;
  if (req.body.uatTargetDate !== undefined) update.uatTargetDate = req.body.uatTargetDate ? new Date(req.body.uatTargetDate) : null;
  if (req.body.goLiveDate !== undefined) {
    const newGoLiveDate = req.body.goLiveDate ? new Date(req.body.goLiveDate) : null;
    update.goLiveDate = newGoLiveDate;
    // DEF-0013 — Target Date is no longer a client-facing field; keep it in
    // sync with Go-Live Date, but only when Go-Live is actually changing.
    // The edit form always resends the current goLiveDate on every save
    // (even one that only touches, say, the name), so syncing unconditionally
    // would silently null out an existing targetDate on any milestone that
    // has one but has never had a goLiveDate set.
    const currentGoLiveTime = m.goLiveDate ? new Date(m.goLiveDate).getTime() : null;
    const newGoLiveTime = newGoLiveDate ? newGoLiveDate.getTime() : null;
    if (newGoLiveTime !== currentGoLiveTime) {
      update.targetDate = newGoLiveDate;
    }
  }
  if (req.body.environment !== undefined) {
    if (req.body.environment != null && !VALID_ENVIRONMENTS.includes(req.body.environment)) {
      res.status(400).json({ error: `environment must be one of ${VALID_ENVIRONMENTS.join(", ")}` }); return;
    }
    update.environment = req.body.environment ?? null;
  }
  if (req.body.requiresUat !== undefined) update.requiresUat = Boolean(req.body.requiresUat);
  if (req.body.lessonsLearned !== undefined) update.lessonsLearned = req.body.lessonsLearned;
  if (req.body.description !== undefined) update.description = req.body.description ? String(req.body.description).trim() || null : null;
  if (req.body.lessonsLearnedType !== undefined) {
    if (req.body.lessonsLearnedType != null && !VALID_LESSON_TYPES.includes(req.body.lessonsLearnedType)) {
      res.status(400).json({ error: `lessonsLearnedType must be one of ${VALID_LESSON_TYPES.join(", ")}` }); return;
    }
    update.lessonsLearnedType = req.body.lessonsLearnedType ?? null;
  }
  if (req.body.priority !== undefined) {
    if (req.body.priority != null && !VALID_PRIORITIES.includes(req.body.priority)) {
      res.status(400).json({ error: `priority must be one of ${VALID_PRIORITIES.join(", ")}` }); return;
    }
    update.priority = req.body.priority ?? null;
  }
  if (req.body.status !== undefined) {
    // CR054p1 — lifecycle: planned → active → verified (QA passed) → uat
    // (business testing) → completed, or cancelled at any point.
    if (!VALID_STATUSES.includes(req.body.status)) {
      res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }); return;
    }
    // Data Prep milestones have no requirement/exec chain to prove the work
    // happened — the uploaded dataset file IS the deliverable, so block the
    // transition into 'completed' until at least one has been attached.
    const effectiveType = update.type ?? m.type;
    if (req.body.status === "completed" && effectiveType === "data_prep") {
      const dataFiles = await db.select({ id: dataPrepFilesTable.id })
        .from(dataPrepFilesTable).where(eq(dataPrepFilesTable.milestoneId, id));
      if (dataFiles.length === 0) {
        res.status(400).json({ error: "Upload the prepared data file before marking this milestone complete" }); return;
      }
    } else if (deploying && isPipeline) {
      // Marking a pipeline as deployed is gated on every earlier step, exactly
      // as Step 8's readiness checklist shows it — enforced here so the gate
      // can't be skipped from the Milestones page or a direct API call.
      const outstanding = computeDeployChecks(m, await loadPipelineFacts(id), null).filter((c) => !c.ok);
      if (outstanding.length > 0) {
        res.status(400).json({
          error: `Cannot mark as deployed — outstanding: ${outstanding.map((c) => `Step ${c.step} ${c.label.toLowerCase()}`).join("; ")}`,
          outstanding,
        });
        return;
      }
    }
    update.status = req.body.status;
    // Auto-stamp the authoritative end-of-QA-phase boundary (PM Dashboard
    // phase breakdown) — set on the transition into 'completed', cleared if
    // it moves away again, same pattern as requirements' approvedAt/rejectedAt.
    if (req.body.status === "completed" && m.status !== "completed") {
      update.completedAt = new Date();
      if (!m.closedBy) update.closedBy = (ctx as any).id ?? ctx.userId;
    } else if (req.body.status !== "completed" && m.status === "completed") {
      update.completedAt = null;
    }
  }
  if (req.body.pipelineStep !== undefined) {
    const step = req.body.pipelineStep == null ? null : Number(req.body.pipelineStep);
    if (step != null && (!Number.isInteger(step) || step < 1 || step > 8)) {
      res.status(400).json({ error: "pipelineStep must be an integer between 1 and 8" }); return;
    }
    update.pipelineStep = step;
  }
  if (touchesSignoff) {
    if (!PIPELINE_SIGNOFF_ROLES.includes(ctx.role)) {
      res.status(403).json({ error: "Only QA Leads, QA Managers, HOD QA, CTO or admin can record functional sign-off" }); return;
    }
    if (req.body.signedOffAt) {
      if (m.signedOffAt) {
        res.status(409).json({ error: "Functional testing is already signed off for this milestone" }); return;
      }
      // Sign-off needs 100% of test cases executed. Whether it is Full or
      // Conditional is decided here, from the server's own counts, and frozen
      // so a later retest can't rewrite the record. The signer and time are
      // always the caller and now — never taken from the request body.
      const facts = await loadPipelineFacts(id);
      const outcome = executionOutcome(facts);
      if (outcome === "none") {
        res.status(400).json({ error: "Nothing to sign off yet — no test cases have been compiled for execution" }); return;
      }
      if (outcome === "incomplete") {
        res.status(400).json({ error: `Cannot sign off — ${facts.totalExecRows - facts.executedRows} of ${facts.totalExecRows} test case(s) not executed yet` }); return;
      }
      update.signedOffAt = new Date();
      update.signedOffBy = ctx.userId;
      update.signoffType = outcome;
      update.signoffFailedCount = facts.failedRows;
      update.signoffTotalCount = facts.totalExecRows;
    } else {
      // Undoing a sign-off reopens the Full vs Conditional decision, so it is
      // reserved for admins correcting a mistake.
      if (ctx.role !== "admin") {
        res.status(403).json({ error: "Only an admin can withdraw a functional sign-off" }); return;
      }
      update.signedOffAt = null;
      update.signedOffBy = null;
      update.signoffType = null;
      update.signoffFailedCount = null;
      update.signoffTotalCount = null;
    }
  }

  // Only touched when the caller sends moduleIds (the edit form always does).
  let newModuleIds: number[] | null = null;
  if (req.body.moduleIds !== undefined) {
    newModuleIds = parseModuleIds(req.body.moduleIds);
    if (newModuleIds == null) { res.status(400).json({ error: "moduleIds must be an array of module IDs" }); return; }
    const moduleError = await validateMilestoneModules({
      projectId: m.projectId, type: update.type ?? m.type, moduleIds: newModuleIds, allModules: req.body.allModules === true,
    });
    if (moduleError) { res.status(400).json({ error: moduleError }); return; }
  }

  const modulesBefore = ((await loadMilestoneModules([id])).get(id) ?? []).map((x) => x.name);
  const [updated] = await db.update(milestonesTable).set(update).where(eq(milestonesTable.id, id)).returning();
  if (newModuleIds) await setMilestoneModules(id, newModuleIds);

  // Clicking between pipeline steps only saves where the user is standing —
  // not worth an activity-log entry or a status recompute on every click.
  const bodyKeys = Object.keys(req.body ?? {});
  const positionOnly = bodyKeys.length > 0 && bodyKeys.every((k) => k === "pipelineStep");
  if (positionOnly) { res.json(fmt(updated)); return; }

  await logActivity({ type: "milestone_updated", description: `Milestone "${updated.name}" updated`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });

  // CR102 — tell the team what changed. One message per save, listing only the
  // fields people plan around (status, dates, priority, environment, modules,
  // name); the person who made the edit is not told about their own change.
  try {
    const modulesAfter = ((await loadMilestoneModules([id])).get(id) ?? []).map((x) => x.name);
    const changes = describeMilestoneChanges(m as any, updated as any, modulesBefore, modulesAfter);
    if (changes.length > 0) {
      const team = await db.select({ userId: milestoneAssigneesTable.userId }).from(milestoneAssigneesTable).where(eq(milestoneAssigneesTable.milestoneId, id));
      const summary = summariseChanges(changes);
      await Promise.all(team.filter((t) => t.userId !== ctx.userId).map((t) =>
        notifyUser(t.userId, "Milestone updated", `"${updated.name}" was updated: ${summary}.`, "milestone_updated", "milestone", id, ctx.userId).catch(() => {}),
      ));
    }
  } catch (err) {
    console.error("[milestone-update-notify]", err);
  }

  // Don't fight a status the caller just set explicitly in this same request —
  // otherwise re-sync (e.g. after signedOffAt changed) so the response
  // reflects any auto-advance immediately instead of on the next load.
  let responseMilestone = updated;
  if (req.body.status === undefined) {
    await syncMilestoneStatus(id);
    const [fresh] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
    if (fresh) responseMilestone = fresh;
  }

  res.json({ ...fmt(responseMilestone), modules: (await loadMilestoneModules([id])).get(id) ?? [] });
});

// ── CR054p2: milestone staffing ─────────────────────────────────────────────
// A lead-tier user formally assigns members to a milestone (e.g. QA lead
// staffs testers). Distinct from project membership, which governs access.

// GET /milestones/:id/assignees
// GET /milestones/:id/activity — what has happened on this milestone: its own
// changes and team moves, plus events on the requirements that belong to it.
router.get("/milestones/:id/activity", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const reqIds = (await db.select({ id: requirementsTable.id }).from(requirementsTable).where(eq(requirementsTable.milestoneId, id))).map((r) => r.id);
  const rows = await db
    .select({ id: activityTable.id, type: activityTable.type, description: activityTable.description, createdAt: activityTable.createdAt, userName: usersTable.name })
    .from(activityTable)
    .leftJoin(usersTable, eq(usersTable.id, activityTable.userId))
    .where(or(
      and(eq(activityTable.entityType, "milestone"), eq(activityTable.entityId, id)),
      reqIds.length ? and(eq(activityTable.entityType, "requirement"), inArray(activityTable.entityId, reqIds)) : sql`false`,
    ))
    .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
    .limit(60);
  res.json(rows.map((r) => ({ id: r.id, type: r.type, description: r.description, userName: r.userName ?? null, createdAt: r.createdAt.toISOString() })));
});

router.get("/milestones/:id/assignees", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({ id: milestoneAssigneesTable.id, userId: milestoneAssigneesTable.userId, name: usersTable.name, role: usersTable.role, createdAt: milestoneAssigneesTable.createdAt })
    .from(milestoneAssigneesTable)
    .innerJoin(usersTable, eq(usersTable.id, milestoneAssigneesTable.userId))
    .where(eq(milestoneAssigneesTable.milestoneId, id));
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// GET /milestones/:id/assignable-users — staffing candidates = users with a
// project_members grant on this milestone's project. Lead-tier gate (the
// /projects/:id/members endpoint is manager-tier, too high for a QA lead
// staffing their own milestone).
router.get("/milestones/:id/assignable-users", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  // canWritePipeline, not canWrite: QA Pipeline Step 2 lets a qa_member name
  // the FA/Dev/QA owner per requirement, and qa_member isn't in canWrite — the
  // lead-tier gate would leave them with an empty picker on their own pipeline.
  if (!canStaffMilestone(ctx.role, ctx.userId, m) && !canWritePipeline(ctx.role, Boolean(m.pipelineEnabled))) { res.status(403).json({ error: "Insufficient role" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(projectMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
    .where(eq(projectMembersTable.projectId, m.projectId));
  const seen = new Set<number>();
  let deduped = rows.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  // DEF-0019 — this endpoint is shared with Step2Requirements' per-requirement
  // FA/Dev/QA owner picker, which is deliberately cross-department, so the
  // department filter is opt-in (forTeamStaffing=1) rather than applied
  // unconditionally. Only the milestone Team section (Milestones.tsx) sets it.
  if (req.query.forTeamStaffing === "1") {
    const deptChecks = await Promise.all(deduped.map((r) => checkDepartmentAssignment(ctx.role, r.role)));
    deduped = deduped.filter((_, i) => deptChecks[i] === null);
  }
  res.json(deduped);
});

// POST /milestones/:id/assignees { userId }
router.post("/milestones/:id/assignees", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const userId = Number(req.body.userId);
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!canStaffMilestone(ctx.role, ctx.userId, m)) { res.status(403).json({ error: "Only a lead, or the milestone's PM, can add team members" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  // The assignee must be able to see the project they're being staffed on.
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!(await canAccessProject(target.id, target.role, m.projectId))) {
    res.status(400).json({ error: "User has no access to this project — grant project membership first" }); return;
  }

  const deptError = await checkDepartmentAssignment(ctx.role, target.role);
  if (deptError) { res.status(403).json({ error: deptError }); return; }

  const existing = await db.select().from(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, id), eq(milestoneAssigneesTable.userId, userId)));
  if (existing.length > 0) {
    await ensureAssigningLead(id, ctx.role, ctx.userId);
    res.json({ ok: true, already: true }); return;
  }

  await db.insert(milestoneAssigneesTable).values({ milestoneId: id, userId, assignedBy: (ctx as any).id ?? ctx.userId });
  await logActivity({ type: "milestone_assignee_added", description: `${target.name} assigned to milestone "${m.name}"`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });
  await notifyUser(userId, "Assigned to milestone", `You've been assigned to milestone "${m.name}".`, "milestone", "milestone", id, (ctx as any).id ?? ctx.userId).catch(() => {});

  await ensureAssigningLead(id, ctx.role, ctx.userId);

  res.status(201).json({ ok: true });
});

// DELETE /milestones/:id/assignees/:userId
router.delete("/milestones/:id/assignees/:userId", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const userId = parseInt(req.params.userId);
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!canStaffMilestone(ctx.role, ctx.userId, m)) { res.status(403).json({ error: "Only a lead, or the milestone's PM, can remove team members" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (target) {
    const deptError = await checkDepartmentAssignment(ctx.role, target.role);
    if (deptError) { res.status(403).json({ error: deptError }); return; }
  }
  const removed = await db.delete(milestoneAssigneesTable)
    .where(and(eq(milestoneAssigneesTable.milestoneId, id), eq(milestoneAssigneesTable.userId, userId)))
    .returning({ id: milestoneAssigneesTable.id });
  if (removed.length > 0 && userId !== ctx.userId) {
    await notifyUser(userId, "Removed from milestone", `You were removed from the team of milestone "${m.name}".`, "milestone_team_removed", "milestone", id, ctx.userId).catch(() => {});
  }
  await logActivity({ type: "milestone_assignee_removed", description: `User #${userId} removed from milestone "${m.name}"`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.json({ ok: true });
});

// DELETE /milestones/:id
router.delete("/milestones/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!canEditMilestone(ctx.role, ctx.userId, m)) { res.status(403).json({ error: "Only the milestone's author or a PM Lead can delete it" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  await db.delete(milestoneModulesTable).where(eq(milestoneModulesTable.milestoneId, id));
  await db.delete(milestonesTable).where(eq(milestonesTable.id, id));
  await logActivity({ type: "milestone_deleted", description: `Milestone "${m.name}" deleted`, userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone" });
  res.sendStatus(204);
});

// PATCH /milestones/:id/review — UAT sign-off gate (CR014p4 / CR022p3)
router.patch("/milestones/:id/review", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const FA_ROLES = ["fa_lead", "hod_fa", "admin"];
  if (!FA_ROLES.includes(ctx.role)) { res.status(403).json({ error: "FA Lead or above required for milestone sign-off" }); return; }

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const { action } = req.body; // 'approve' | 'reject'
  if (!["approve", "reject"].includes(action)) { res.status(400).json({ error: "action must be 'approve' or 'reject'" }); return; }

  // Check for outstanding failed UAT test cases (warn, don't block)
  const { pool } = await import("@workspace/db");
  const { rows: failedRows } = await pool.query(`
    SELECT COUNT(*)::int AS cnt
    FROM execution_test_cases etc
    JOIN execution_files ef ON ef.id = etc.execution_file_id
    WHERE ef.milestone_id = $1 AND ef.file_type = 'uat'
      AND etc.result IN ('Failed', 'Blocked')
  `, [id]);
  const outstandingFailures = failedRows[0]?.cnt ?? 0;

  const newStatus = action === "approve" ? "completed" : "planned";
  const [updated] = await db.update(milestonesTable).set({ status: newStatus }).where(eq(milestonesTable.id, id)).returning();

  await logActivity({
    type: action === "approve" ? "milestone_approved" : "milestone_rejected",
    description: `Milestone "${m.name}" ${action === "approve" ? "signed off" : "returned"} by user #${(ctx as any).id ?? ctx.userId}`,
    userId: (ctx as any).id ?? ctx.userId, entityId: id, entityType: "milestone",
  });

  res.json({ ...fmt(updated), warning: outstandingFailures > 0 ? `${outstandingFailures} UAT test case(s) still failing` : null });
});

// GET /milestones/:id/risk-assessments — CR037 assessment history (newest first).
// Same PM-tier gate as the dashboard endpoints that render alongside it.
router.get("/milestones/:id/risk-assessments", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const PM_ROLES = ["pm_member", "pm_lead", "hod_pm", "admin", "cto"];
  if (!PM_ROLES.includes(ctx.role)) { res.status(403).json({ error: "PM role required" }); return; }

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject((ctx as any).id ?? ctx.userId, ctx.role, m.projectId))) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const { milestoneRiskAssessmentsTable } = await import("@workspace/db");
  const { desc } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(milestoneRiskAssessmentsTable)
    .where(eq(milestoneRiskAssessmentsTable.milestoneId, id))
    .orderBy(desc(milestoneRiskAssessmentsTable.createdAt))
    .limit(20);

  res.json(rows.map((a) => {
    let factors: unknown = [];
    try { factors = JSON.parse(a.factors); } catch { /* keep [] */ }
    return {
      id: a.id,
      milestoneId: a.milestoneId,
      riskLevel: a.riskLevel,
      factors,
      mitigation: a.mitigation ?? null,
      model: a.model ?? null,
      createdBy: a.createdBy ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }));
});

// GET /milestones/:id/ai-risk-status — CR077: does this milestone already
// have an open (open/mitigating) AI-sourced Risk Register entry? Drives the
// "Raise as Risk" button's state. Deliberately NOT gated to PM_ROLES like
// risk-assessments above — the write action this feeds (Raise as Risk) is
// gated to the Risk Register's own write-tier (qa_lead/fa_lead/dev_lead/...,
// broader than PM-only), so the read needs to match. Same gate as GET /risks.
router.get("/milestones/:id/ai-risk-status", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid milestone ID" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, id));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject((ctx as any).id ?? ctx.userId, ctx.role, m.projectId))) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const [openRisk] = await db.select({ id: risksTable.id })
    .from(risksTable)
    .where(and(
      eq(risksTable.milestoneId, id),
      eq(risksTable.source, "ai_assessment"),
      inArray(risksTable.status, ["open", "mitigating"]),
    ));
  res.json({ hasOpenAiRisk: !!openRisk, riskId: openRisk?.id ?? null });
});

export default router;
