import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, tasksTable, testCasesTable, requirementsTable, usersTable, projectsTable, activityTable } from "@workspace/db";
import { GetDashboardSummaryQueryParams, GetTeamDashboardQueryParams, GetWeeklyTrendQueryParams, GetRecentActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

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
  const completedTasks = tasks.filter(t => t.status === "done").length;
  const pendingTasks = tasks.filter(t => ["new", "in_progress", "pending"].includes(t.status)).length;
  const blockedTasks = tasks.filter(t => t.status === "blocked").length;
  const overdueTasks = tasks.filter(t => {
    if (t.status === "done" || !t.dueDate) return false;
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
      if (t.status === "done" || !t.dueDate) return false;
      return new Date(t.dueDate) < now;
    })
    .map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      dueDate: t.dueDate,
      isOverdue: t.status !== "done" && !!t.dueDate && new Date(t.dueDate) < now,
    }));

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
      completed: userTasks.filter(t => t.status === "done").length,
      pending: userTasks.filter(t => ["new", "in_progress", "pending"].includes(t.status)).length,
      blocked: userTasks.filter(t => t.status === "blocked").length,
      overdue: userTasks.filter(t => {
        if (t.status === "done" || !t.dueDate) return false;
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
  let allTestCases = await db.select().from(testCasesTable);

  if (userId) {
    allTasks = allTasks.filter((t) => t.assigneeId === userId);
    allTestCases = allTestCases.filter((tc) => tc.authorId === userId);
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

    const completed = allTasks.filter(t => {
      const updated = new Date(t.updatedAt);
      return t.status === "done" && updated >= weekStart && updated <= weekEnd;
    }).length;

    const pending = allTasks.filter(t => {
      const created = new Date(t.createdAt);
      return ["new", "in_progress", "pending"].includes(t.status) && created >= weekStart && created <= weekEnd;
    }).length;

    const created = allTasks.filter(t => {
      const c = new Date(t.createdAt);
      return c >= weekStart && c <= weekEnd;
    }).length;

    const testCases = allTestCases.filter(tc => {
      const c = new Date(tc.createdAt);
      return c >= weekStart && c <= weekEnd;
    }).length;

    trendData.push({ week: weekIso, completed, pending, created, testCases });
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
