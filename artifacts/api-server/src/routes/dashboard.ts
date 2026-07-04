import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db, tasksTable, testCasesTable, requirementsTable, usersTable, projectsTable, activityTable, milestonesTable, executionFilesTable, executionTestCasesTable } from "@workspace/db";
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

export default router;
