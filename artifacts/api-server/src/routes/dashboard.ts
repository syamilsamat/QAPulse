import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, tasksTable, testCasesTable, requirementsTable, usersTable, projectsTable, activityTable, milestonesTable, executionFilesTable, executionTestCasesTable, defectsTable, defectLinksTable } from "@workspace/db";
import { GetDashboardSummaryQueryParams, GetTeamDashboardQueryParams, GetWeeklyTrendQueryParams, GetRecentActivityQueryParams } from "@workspace/api-zod";
import { getAuthContext, scopeToUserProjects, canAccessProject } from "../middleware/access";

const router: IRouter = Router();

const PM_ROLES = ["pmo", "pm_lead", "hod_pm", "admin", "cto"];

function classifyResult(result: string | null): "passed" | "failed" | "blocked" | "notRun" {
  const r = result?.toLowerCase() ?? "";
  if (r === "passed" || r === "pass") return "passed";
  if (r === "failed" || r === "fail") return "failed";
  if (r === "blocked") return "blocked";
  return "notRun";
}

// Coarse pass/fail/blocked/notRun rollup for a set of milestones, scoped to one
// execution file type (qa | uat). Unlike the traceability matrix, this does not
// resolve "latest result per TC identity across files" — it counts whatever is
// currently saved on each execution_test_cases row. Good enough for a summary
// readiness signal; use the traceability matrix's milestone filter for the
// rigorous per-TC view.
async function rollupExecutionByMilestone(milestoneIds: number[], fileType: "qa" | "uat") {
  const map = new Map<number, { tcCount: number; passed: number; failed: number; blocked: number; notRun: number; passPct: number }>();
  if (milestoneIds.length === 0) return map;

  const rows = await db
    .select({ milestoneId: executionFilesTable.milestoneId, result: executionTestCasesTable.result })
    .from(executionTestCasesTable)
    .innerJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
    .where(and(inArray(executionFilesTable.milestoneId, milestoneIds), eq(executionFilesTable.fileType, fileType)));

  const byMilestone = new Map<number, string[]>();
  for (const row of rows) {
    if (row.milestoneId == null) continue;
    if (!byMilestone.has(row.milestoneId)) byMilestone.set(row.milestoneId, []);
    byMilestone.get(row.milestoneId)!.push(row.result ?? "");
  }

  for (const id of milestoneIds) {
    const results = byMilestone.get(id) ?? [];
    let passed = 0, failed = 0, blocked = 0, notRun = 0;
    for (const r of results) {
      const c = classifyResult(r);
      if (c === "passed") passed++;
      else if (c === "failed") failed++;
      else if (c === "blocked") blocked++;
      else notRun++;
    }
    const tcCount = results.length;
    map.set(id, { tcCount, passed, failed, blocked, notRun, passPct: tcCount > 0 ? Math.round((passed / tcCount) * 100) : 0 });
  }
  return map;
}

type ScheduleRisk = "on-track" | "at-risk" | "overdue" | "no-date" | "completed" | "cancelled";

function computeScheduleRisk(status: string, targetDate: Date | null, readinessPct: number): ScheduleRisk {
  if (status === "completed" || status === "cancelled") return status;
  if (!targetDate) return "no-date";
  const daysLeft = (targetDate.getTime() - Date.now()) / 86_400_000;
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 5 && readinessPct < 80) return "at-risk";
  return "on-track";
}

// GET /dashboard/pm-summary — CR014 Part 3. Portfolio view for the PM track
// (pmo, pm_lead, hod_pm) plus admin/cto: per-project milestone health
// (requirement approval + QA/UAT execution readiness, schedule risk) and a
// project-level resource capacity strip. Optional ?projectId= drills into one.
router.get("/dashboard/pm-summary", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!PM_ROLES.includes(ctx.role)) { res.status(403).json({ error: "PM role required" }); return; }

  const projectIdParam = req.query.projectId ? Number(req.query.projectId) : null;
  if (projectIdParam) {
    const ok = await canAccessProject(ctx.userId, ctx.role, projectIdParam);
    if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
  }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  let projects = await db.select().from(projectsTable);
  if (projectIdParam) {
    projects = projects.filter(p => p.id === projectIdParam);
  } else if (accessible !== null) {
    projects = projects.filter(p => accessible.includes(p.id));
  }
  const projectIds = projects.map(p => p.id);

  const milestones = projectIds.length
    ? await db.select().from(milestonesTable).where(inArray(milestonesTable.projectId, projectIds)).orderBy(milestonesTable.targetDate)
    : [];
  const milestoneIds = milestones.map(m => m.id);

  const reqs = milestoneIds.length
    ? await db.select({ milestoneId: requirementsTable.milestoneId, reviewStatus: requirementsTable.reviewStatus })
        .from(requirementsTable).where(inArray(requirementsTable.milestoneId, milestoneIds))
    : [];

  const qaRollup = await rollupExecutionByMilestone(milestoneIds, "qa");
  const uatRollup = await rollupExecutionByMilestone(milestoneIds, "uat");

  // Resource capacity — project level only. tasks has no milestone-scoped
  // enough history yet to slice finer with confidence; see CR014 register.
  const allUsers = await db.select().from(usersTable);
  const userNameById = new Map<number, string>(allUsers.map(u => [u.id, u.name] as [number, string]));
  const allTasks = projectIds.length
    ? await db.select().from(tasksTable).where(inArray(tasksTable.projectId, projectIds))
    : [];

  const now = new Date();
  const isOpenTask = (t: typeof tasksTable.$inferSelect) => t.status !== "done" && t.status !== "released_to_production";
  const isOverdueTask = (t: typeof tasksTable.$inferSelect) => isOpenTask(t) && !!t.dueDate && new Date(t.dueDate) < now;

  const resultProjects = projects.map(project => {
    const projectMilestones = milestones.filter(m => m.projectId === project.id);

    const milestoneSummaries = projectMilestones.map(m => {
      const mReqs = reqs.filter(r => r.milestoneId === m.id);
      const requirementCount = mReqs.length;
      const approvedCount = mReqs.filter(r => r.reviewStatus === "approved").length;
      const approvedPct = requirementCount > 0 ? Math.round((approvedCount / requirementCount) * 100) : 0;

      const qa = qaRollup.get(m.id) ?? { tcCount: 0, passed: 0, failed: 0, blocked: 0, notRun: 0, passPct: 0 };
      const uat = uatRollup.get(m.id) ?? { tcCount: 0, passed: 0, failed: 0, blocked: 0, notRun: 0, passPct: 0 };

      const readinessPct = qa.tcCount > 0 ? qa.passPct : approvedPct;
      const scheduleRisk = computeScheduleRisk(m.status, m.targetDate, readinessPct);

      return {
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        targetDate: m.targetDate?.toISOString() ?? null,
        requirementCount,
        approvedCount,
        approvedPct,
        qa,
        uat: uat.tcCount > 0 ? uat : null,
        scheduleRisk,
      };
    });

    const projectTasks = allTasks.filter(t => t.projectId === project.id);
    const capacityByUser = new Map<number, { userId: number; name: string; openTaskCount: number; estimatedHours: number; overdueTaskCount: number }>();
    for (const t of projectTasks) {
      if (!isOpenTask(t)) continue;
      for (const uid of t.assigneeIds ?? []) {
        if (!capacityByUser.has(uid)) {
          capacityByUser.set(uid, { userId: uid, name: userNameById.get(uid) ?? `User #${uid}`, openTaskCount: 0, estimatedHours: 0, overdueTaskCount: 0 });
        }
        const entry = capacityByUser.get(uid)!;
        entry.openTaskCount++;
        entry.estimatedHours += t.estimatedHours ?? 0;
        if (isOverdueTask(t)) entry.overdueTaskCount++;
      }
    }

    return {
      projectId: project.id,
      projectName: project.name,
      milestones: milestoneSummaries,
      capacity: Array.from(capacityByUser.values()).sort((a, b) => b.openTaskCount - a.openTaskCount),
    };
  });

  const allMilestoneSummaries = resultProjects.flatMap(p => p.milestones);
  const portfolio = {
    totalProjects: projects.length,
    activeMilestones: allMilestoneSummaries.filter(m => m.status === "active").length,
    milestonesAtRisk: allMilestoneSummaries.filter(m => m.scheduleRisk === "at-risk").length,
    milestonesOverdue: allMilestoneSummaries.filter(m => m.scheduleRisk === "overdue").length,
  };

  res.json({ portfolio, projects: resultProjects });
});

// ─── Milestone phase breakdown ───────────────────────────────────────────────
// "Where did the time go" report: Requirements -> Gap before QA -> QA testing
// -> [Gap before UAT -> UAT], so a PM can see which phase actually consumed
// the schedule instead of QA absorbing blame for delays upstream of testing.

type PhaseBoundary = { start: string | null; end: string | null; days: number | null; ongoing: boolean };

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000 * 10) / 10;
}

function makePhase(start: Date | null, end: Date | null, now: Date): PhaseBoundary {
  if (!start) return { start: null, end: null, days: null, ongoing: false };
  const effectiveEnd = end ?? now;
  return {
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    days: daysBetween(start, effectiveEnd),
    ongoing: !end,
  };
}

interface PhaseBreakdown {
  requirements: PhaseBoundary;
  gapBeforeQa: PhaseBoundary;
  qa: PhaseBoundary;
  gapBeforeUat: PhaseBoundary | null; // null when this milestone has no UAT file at all
  uat: PhaseBoundary | null;
}

async function computeMilestonePhases(milestoneId: number, milestoneCompletedAt: Date | null): Promise<PhaseBreakdown | null> {
  const now = new Date();

  const reqs = await db
    .select({ createdAt: requirementsTable.createdAt, approvedAt: requirementsTable.approvedAt })
    .from(requirementsTable)
    .where(eq(requirementsTable.milestoneId, milestoneId));
  if (reqs.length === 0) return null;

  const reqCreatedMin = reqs.reduce((min, r) => (!min || r.createdAt < min ? r.createdAt : min), null as Date | null);
  const allApproved = reqs.every((r) => r.approvedAt !== null);
  const reqApprovedMax = allApproved
    ? reqs.reduce((max, r) => (!max || r.approvedAt! > max ? r.approvedAt! : max), null as Date | null)
    : null;

  const execRows = await db
    .select({ fileType: executionFilesTable.fileType, executedAt: executionTestCasesTable.executedAt })
    .from(executionTestCasesTable)
    .innerJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
    .where(eq(executionFilesTable.milestoneId, milestoneId));

  const uatFileExists = (
    await db.select({ id: executionFilesTable.id }).from(executionFilesTable)
      .where(and(eq(executionFilesTable.milestoneId, milestoneId), eq(executionFilesTable.fileType, "uat")))
  ).length > 0;

  const qaExecuted = execRows.filter((r) => r.fileType === "qa" && r.executedAt).map((r) => r.executedAt!);
  const uatExecuted = execRows.filter((r) => r.fileType === "uat" && r.executedAt).map((r) => r.executedAt!);
  const minOf = (arr: Date[]) => (arr.length ? arr.reduce((a, b) => (b < a ? b : a)) : null);
  const maxOf = (arr: Date[]) => (arr.length ? arr.reduce((a, b) => (b > a ? b : a)) : null);

  const qaExecutedMin = minOf(qaExecuted);
  const qaExecutedMax = maxOf(qaExecuted);
  const uatExecutedMin = minOf(uatExecuted);

  const requirementsPhase = makePhase(reqCreatedMin, reqApprovedMax, now);
  const gapBeforeQaPhase = makePhase(reqApprovedMax, qaExecutedMin, now);

  // QA's own bounded window when a UAT lane exists; otherwise QA absorbs
  // everything up to milestone completion since there's no handoff to split on.
  const qaPhaseEnd = uatFileExists ? qaExecutedMax : milestoneCompletedAt;
  const qaPhase = makePhase(qaExecutedMin, qaPhaseEnd, now);

  let gapBeforeUatPhase: PhaseBoundary | null = null;
  let uatPhase: PhaseBoundary | null = null;
  if (uatFileExists) {
    gapBeforeUatPhase = makePhase(qaExecutedMax, uatExecutedMin, now);
    uatPhase = makePhase(uatExecutedMin, milestoneCompletedAt, now);
  }

  return { requirements: requirementsPhase, gapBeforeQa: gapBeforeQaPhase, qa: qaPhase, gapBeforeUat: gapBeforeUatPhase, uat: uatPhase };
}

router.get("/dashboard/milestone-phase-breakdown", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!PM_ROLES.includes(ctx.role)) { res.status(403).json({ error: "PM role required" }); return; }

  const milestoneId = req.query.milestoneId ? Number(req.query.milestoneId) : null;
  if (!milestoneId) { res.status(400).json({ error: "milestoneId is required" }); return; }

  const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
  if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, milestone.projectId))) {
    res.status(403).json({ error: "Access denied to this project" }); return;
  }

  const phases = await computeMilestonePhases(milestoneId, milestone.completedAt);
  if (!phases) {
    res.json({ milestone: { id: milestone.id, name: milestone.name, status: milestone.status }, phases: null, trend: null });
    return;
  }

  // Trend: last 5 completed milestones in the same project (this one included,
  // if it's itself completed), each given the same phase computation.
  const completedMilestones = await db
    .select().from(milestonesTable)
    .where(and(eq(milestonesTable.projectId, milestone.projectId), eq(milestonesTable.status, "completed")))
    .orderBy(desc(milestonesTable.targetDate))
    .limit(5);

  const trendEntries: { id: number; name: string; requirementsDays: number | null; gapDays: number | null; qaDays: number | null; uatDays: number | null }[] = [];
  for (const m of completedMilestones) {
    const p = await computeMilestonePhases(m.id, m.completedAt);
    if (!p) continue;
    trendEntries.push({
      id: m.id, name: m.name,
      requirementsDays: p.requirements.days, gapDays: p.gapBeforeQa.days,
      qaDays: p.qa.days, uatDays: p.uat?.days ?? null,
    });
  }

  const avg = (vals: (number | null)[]) => {
    const present = vals.filter((v): v is number => v !== null);
    return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
  };

  res.json({
    milestone: { id: milestone.id, name: milestone.name, status: milestone.status, targetDate: milestone.targetDate?.toISOString() ?? null },
    phases,
    trend: {
      count: trendEntries.length,
      avgRequirementsDays: avg(trendEntries.map((e) => e.requirementsDays)),
      avgGapDays: avg(trendEntries.map((e) => e.gapDays)),
      avgQaDays: avg(trendEntries.map((e) => e.qaDays)),
      avgUatDays: avg(trendEntries.map((e) => e.uatDays)),
      milestones: trendEntries,
    },
  });
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const now = new Date();

  let tasks = await db.select().from(tasksTable);
  let testCases = await db.select().from(testCasesTable);
  let requirements = await db.select().from(requirementsTable);

  const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (parsed.success) {
    const { projectId, userId } = parsed.data;
    if (projectId) {
      tasks = tasks.filter(t => t.projectId === projectId);
      testCases = testCases.filter(tc => tc.projectId === projectId);
      requirements = requirements.filter(r => r.projectId === projectId);
    }
    if (userId) {
      tasks = tasks.filter(t => t.assigneeId === userId);
      testCases = testCases.filter(tc => tc.authorId === userId);
    }
  }

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "released_to_production").length;
  const pendingTasks = tasks.filter(t => ["uat", "sit"].includes(t.status)).length;
  const blockedTasks = tasks.filter(t => t.status === "blocked").length;
  const overdueTasks = tasks.filter(t => {
    if (t.status === "released_to_production" || !t.dueDate) return false;
    return new Date(t.dueDate) < now;
  }).length;

  const totalRequirements = requirements.length;
  const openRequirements = requirements.filter(r => r.status !== "done").length;

  const totalTestCases = testCases.length;
  const aiAssistedTestCases = testCases.filter(tc => tc.aiAssisted).length;
  const manualTestCases = testCases.filter(tc => tc.type === "manual").length;
  const automationCandidates = testCases.filter(tc => tc.type === "automation_candidate").length;

  // Blocked/overdue task details
  const blockedOrOverdueTasks = tasks
    .filter(t => {
      if (t.status === "blocked") return true;
      if (t.status === "released_to_production" || !t.dueDate) return false;
      return new Date(t.dueDate) < now;
    })
    .map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      dueDate: t.dueDate,
      isOverdue: t.status !== "released_to_production" && !!t.dueDate && new Date(t.dueDate) < now,
    }));

  // Pending task details (UAT / SIT)
  const pendingTasksList = tasks
    .filter(t => ["uat", "sit"].includes(t.status))
    .map(t => ({ id: t.id, name: t.name, status: t.status, dueDate: t.dueDate ?? null }));

  res.json({
    totalTasks,
    completedTasks,
    pendingTasks,
    blockedTasks,
    overdueTasks,
    totalRequirements,
    openRequirements,
    totalTestCases,
    aiAssistedTestCases,
    manualTestCases,
    automationCandidates,
    blockedOrOverdueTasks,
    pendingTasksList,
  });
});

router.get("/dashboard/team", async (req, res): Promise<void> => {
  const now = new Date();
  const users = await db.select().from(usersTable);
  const allTasks = await db.select().from(tasksTable);
  const allTestCases = await db.select().from(testCasesTable);
  const allProjects = await db.select().from(projectsTable);

  const memberStats = users.filter(u => u.role === "qa_member" || u.role === "qa_lead").map(user => {
    const userTasks = allTasks.filter(t => t.assigneeId === user.id);
    const userTestCases = allTestCases.filter(tc => tc.authorId === user.id);

    return {
      userId: user.id,
      userName: user.name,
      completed: userTasks.filter(t => t.status === "released_to_production").length,
      pending: userTasks.filter(t => ["uat", "sit"].includes(t.status)).length,
      blocked: userTasks.filter(t => t.status === "blocked").length,
      overdue: userTasks.filter(t => {
        if (t.status === "released_to_production" || !t.dueDate) return false;
        return new Date(t.dueDate) < now;
      }).length,
      testCasesCreated: userTestCases.length,
    };
  });

  const projectCounts = allProjects.map(p => ({
    projectId: p.id,
    projectName: p.name,
    count: allTasks.filter(t => t.projectId === p.id).length,
  }));

  res.json({ memberStats, tasksByProject: projectCounts });
});

router.get("/dashboard/weekly-trend", async (req, res): Promise<void> => {
  const parsed = GetWeeklyTrendQueryParams.safeParse(req.query);
  const weeks = parsed.success && parsed.data.weeks ? parsed.data.weeks : 6;
  const userId = parsed.success ? parsed.data.userId : undefined;

  let allTasks = await db.select().from(tasksTable);

  if (userId) {
    allTasks = allTasks.filter((t) => t.assigneeId === userId);
  }

  const now = new Date();
  // Find start of current week (Monday-based)
  const currentDay = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

  const trendData = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday - i * 7);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // ISO date string so the frontend chart can parse it
    const weekIso = weekStart.toISOString().split("T")[0];

    // Get all tasks that were updated/active during this specific week
    const weekTasks = allTasks.filter(t => {
      const updated = new Date(t.updatedAt);
      return updated >= weekStart && updated <= weekEnd;
    });

    // Count tasks by their exact status
    const newCount = weekTasks.filter(t => t.status === "new").length;
    const pendingCount = weekTasks.filter(t => t.status === "pending").length;
    const inProgressCount = weekTasks.filter(t => t.status === "in_progress").length;
    const blockedCount = weekTasks.filter(t => t.status === "blocked").length;
    const sitCount = weekTasks.filter(t => t.status === "sit").length;
    const uatCount = weekTasks.filter(t => t.status === "uat").length;
    const doneCount = weekTasks.filter(t => t.status === "done").length;
    const releasedCount = weekTasks.filter(t => t.status === "released_to_production").length;

    trendData.push({ 
      week: weekIso, 
      new: newCount,
      pending: pendingCount,
      in_progress: inProgressCount,
      blocked: blockedCount,
      sit: sitCount,
      uat: uatCount,
      done: doneCount,
      released_to_production: releasedCount
    });
  }

  res.json(trendData);
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 20;
  const userId = parsed.success ? parsed.data.userId : undefined;

  const query = db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(limit);

  const activities = await query;

  const usersMap: Record<number, string> = {};
  const users = await db.select().from(usersTable);
  users.forEach(u => { usersMap[u.id] = u.name; });

  const filtered = userId ? activities.filter(a => a.userId === userId) : activities;

  res.json(filtered.map(a => ({
    id: a.id,
    type: a.type,
    description: a.description,
    userId: a.userId,
    userName: a.userId ? (usersMap[a.userId] ?? null) : null,
    entityId: a.entityId,
    entityType: a.entityType,
    createdAt: a.createdAt.toISOString(),
  })));
});

// ── CR026: QA Analytics Dashboard ────────────────────────────────────────────

const QA_ANALYTICS_ROLES = ["qa_lead", "qa_manager", "hod_qa", "admin", "cto"];

function toIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weeksBetween(start: Date, end: Date): string[] {
  const weeks: string[] = [];
  const d = new Date(start);
  // Snap to start of week (Monday)
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  while (d <= end) {
    weeks.push(toIsoWeek(d));
    d.setDate(d.getDate() + 7);
  }
  // Cap at 26 weeks to avoid oversized responses
  return weeks.slice(-26);
}

router.get("/dashboard/qa-analytics", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!QA_ANALYTICS_ROLES.includes(ctx.role)) { res.status(403).json({ error: "QA lead role or higher required" }); return; }

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (!projectId || isNaN(projectId)) { res.status(400).json({ error: "projectId is required" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, projectId);
  if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }

  const milestoneId = req.query.milestoneId ? Number(req.query.milestoneId) : null;
  const now = new Date();
  const startDate = req.query.startDate ? new Date(String(req.query.startDate)) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const endDate = req.query.endDate ? new Date(String(req.query.endDate)) : now;

  // Load all execution files for the project
  const projectFiles = await db.select().from(executionFilesTable).where(eq(executionFilesTable.projectId, projectId));

  // Files scoped by milestone filter (if active)
  const scopedFiles = milestoneId ? projectFiles.filter(f => f.milestoneId === milestoneId) : projectFiles;
  const scopedFileIds = scopedFiles.map(f => f.id);

  // Execution test cases for the scoped files
  const etcs = scopedFileIds.length > 0
    ? await db.select().from(executionTestCasesTable).where(inArray(executionTestCasesTable.executionFileId, scopedFileIds))
    : [];

  // Defects for the project
  const defects = await db.select().from(defectsTable).where(eq(defectsTable.projectId, projectId));

  // Recent milestones for the project (last 6, for cross-milestone panels)
  const allMilestones = await db.select().from(milestonesTable)
    .where(eq(milestonesTable.projectId, projectId))
    .orderBy(desc(milestonesTable.createdAt));
  const recentMilestones = allMilestones.slice(0, 6).reverse();

  // Requirements for coverage (scoped by milestone if active)
  const reqFilter = milestoneId
    ? and(eq(requirementsTable.projectId, projectId), eq(requirementsTable.milestoneId, milestoneId))
    : eq(requirementsTable.projectId, projectId);
  const reqs = await db.select({ id: requirementsTable.id }).from(requirementsTable).where(reqFilter);
  const reqIds = reqs.map(r => r.id);

  // Library test cases linked to those requirements
  const tcs = reqIds.length > 0
    ? await db.select({ id: testCasesTable.id, requirementId: testCasesTable.requirementId })
        .from(testCasesTable).where(inArray(testCasesTable.requirementId, reqIds))
    : [];

  // ── Panel 1: Execution Trend ──────────────────────────────────────────────
  const weeks = weeksBetween(startDate, endDate);
  const executionTrend = weeks.map(week => {
    const wEtcs = etcs.filter(e => e.executedAt && toIsoWeek(e.executedAt) === week);
    let passed = 0, failed = 0, blocked = 0, notRun = 0;
    for (const e of wEtcs) {
      const c = classifyResult(e.result);
      if (c === "passed") passed++;
      else if (c === "failed") failed++;
      else if (c === "blocked") blocked++;
      else notRun++;
    }
    return { week, passed, failed, blocked, notRun };
  });

  // ── Panel 2: Velocity ────────────────────────────────────────────────────
  const velocity = weeks.map(week => {
    const executed = etcs.filter(e =>
      e.executedAt && toIsoWeek(e.executedAt) === week && classifyResult(e.result) !== "notRun"
    ).length;
    return { week, executed };
  });

  // ── Panel 3: Pass Rate by Milestone ──────────────────────────────────────
  const passByMilestone: { milestoneId: number; milestoneName: string; total: number; passed: number; pct: number }[] = [];
  for (const m of recentMilestones) {
    const mFileIds = projectFiles.filter(f => f.milestoneId === m.id).map(f => f.id);
    const mEtcs = mFileIds.length > 0
      ? await db.select({ result: executionTestCasesTable.result })
          .from(executionTestCasesTable).where(inArray(executionTestCasesTable.executionFileId, mFileIds))
      : [];
    const total = mEtcs.length;
    const passed = mEtcs.filter(e => classifyResult(e.result) === "passed").length;
    passByMilestone.push({ milestoneId: m.id, milestoneName: m.name, total, passed, pct: total > 0 ? Math.round((passed / total) * 100) : 0 });
  }

  // ── Panel 4: Defect Density by Module ────────────────────────────────────
  const moduleMap = new Map<string, { critical: number; high: number; medium: number; low: number }>();
  for (const d of defects) {
    const mod = d.module ?? "Unassigned";
    if (!moduleMap.has(mod)) moduleMap.set(mod, { critical: 0, high: 0, medium: 0, low: 0 });
    const entry = moduleMap.get(mod)!;
    const sev = d.severity ?? "medium";
    if (sev === "critical") entry.critical++;
    else if (sev === "high") entry.high++;
    else if (sev === "low") entry.low++;
    else entry.medium++;
  }
  const defectByModule = Array.from(moduleMap.entries())
    .map(([module, c]) => ({ module, ...c, _total: c.critical + c.high + c.medium + c.low }))
    .sort((a, b) => b._total - a._total)
    .slice(0, 10)
    .map(({ _total: _, ...rest }) => rest);

  // ── Panel 5: Defect Trend ─────────────────────────────────────────────────
  const closedStatuses = new Set(["Closed", "Resolved", "Verified"]);
  const defectTrend = weeks.map(week => {
    const opened = defects.filter(d => d.createdAt && toIsoWeek(d.createdAt) === week).length;
    const closed = defects.filter(d => d.updatedAt && toIsoWeek(d.updatedAt) === week && closedStatuses.has(d.status)).length;
    return { week, opened, closed };
  });

  // ── Panel 6: Escape Funnel by Milestone ──────────────────────────────────
  // Resolve defect → milestone via defect_links → execution_test_cases → execution_files
  const allLinks = await db.select({ defectId: defectLinksTable.defectId, executionTcId: defectLinksTable.executionTcId })
    .from(defectLinksTable);

  // Build executionTcId → milestoneId from all project execution files
  const allProjectEtcIds = scopedFileIds.length > 0
    ? await db.select({ id: executionTestCasesTable.id, executionFileId: executionTestCasesTable.executionFileId })
        .from(executionTestCasesTable).where(inArray(executionTestCasesTable.executionFileId, projectFiles.map(f => f.id)))
    : [];
  const etcToFileId = new Map<number, number>(allProjectEtcIds.map(e => [e.id, e.executionFileId]));
  const fileToMilestoneId = new Map<number, number | null>(projectFiles.map(f => [f.id, f.milestoneId]));

  const defectToMilestone = new Map<number, number>();
  for (const link of allLinks) {
    if (!link.executionTcId) continue;
    const fileId = etcToFileId.get(link.executionTcId);
    if (!fileId) continue;
    const mId = fileToMilestoneId.get(fileId);
    if (mId) defectToMilestone.set(link.defectId, mId);
  }

  const escapeFunnel = recentMilestones.map(m => {
    const mDefects = defects.filter(d => defectToMilestone.get(d.id) === m.id);
    return {
      milestoneId: m.id,
      milestoneName: m.name,
      sit: mDefects.filter(d => d.foundIn === "SIT").length,
      uat: mDefects.filter(d => d.foundIn === "UAT").length,
      production: mDefects.filter(d => d.foundIn === "Production").length,
    };
  });

  // ── Panel 7: Coverage Snapshot ────────────────────────────────────────────
  const tcCoveredReqIds = new Set(tcs.map(tc => tc.requirementId).filter((id): id is number => id != null));

  // Map libraryTcId → results from scoped execution files
  const execResultsByTcId = new Map<number, string[]>();
  for (const e of etcs) {
    if (!e.libraryTcId) continue;
    if (!execResultsByTcId.has(e.libraryTcId)) execResultsByTcId.set(e.libraryTcId, []);
    execResultsByTcId.get(e.libraryTcId)!.push(e.result ?? "");
  }
  const tcsByReqId = new Map<number, number[]>();
  for (const tc of tcs) {
    if (!tc.requirementId) continue;
    if (!tcsByReqId.has(tc.requirementId)) tcsByReqId.set(tc.requirementId, []);
    tcsByReqId.get(tc.requirementId)!.push(tc.id);
  }

  let executedReqs = 0, passedReqs = 0;
  for (const rid of reqIds) {
    const linkedTcIds = tcsByReqId.get(rid) ?? [];
    const allResults = linkedTcIds.flatMap(id => execResultsByTcId.get(id) ?? []);
    if (allResults.some(r => classifyResult(r) !== "notRun")) executedReqs++;
    if (allResults.some(r => classifyResult(r) === "passed")) passedReqs++;
  }

  res.json({
    executionTrend,
    velocity,
    passByMilestone,
    defectByModule,
    defectTrend,
    escapeFunnel,
    coverage: {
      totalReqs: reqIds.length,
      tcCoveredReqs: tcCoveredReqIds.size,
      executedReqs,
      passedReqs,
    },
  });
});

export default router;
