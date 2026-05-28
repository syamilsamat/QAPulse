import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, requirementsTable, testCasesTable, tasksTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/pmo/report", async (req, res): Promise<void> => {
  const { redmineId } = req.query;

  if (!redmineId || typeof redmineId !== "string") {
    res.status(400).json({ error: "redmineId query parameter is required" });
    return;
  }

  const cleanId = redmineId.replace(/^#/, "").trim();

  const requirements = await db.select().from(requirementsTable);
  const matchedReqs = requirements.filter(r =>
    r.redmineTicketId === cleanId ||
    r.redmineTicketId === `#${cleanId}` ||
    r.title.toLowerCase().includes(cleanId.toLowerCase())
  );

  if (matchedReqs.length === 0) {
    res.status(404).json({ error: `No requirements found for Redmine ticket #${cleanId}` });
    return;
  }

  const reqIds = matchedReqs.map(r => r.id);

  const allTestCases = await db.select().from(testCasesTable);
  const allTasks = await db.select().from(tasksTable);
  const allUsers = await db.select().from(usersTable);

  const linkedTestCases = allTestCases.filter(tc => tc.requirementId && reqIds.includes(tc.requirementId));
  const linkedTasks = allTasks.filter(t => t.requirementId && reqIds.includes(t.requirementId));

  const getUserName = (userId: number | null) => {
    if (!userId) return "Unassigned";
    return allUsers.find(u => u.id === userId)?.name ?? "Unassigned";
  };

  const statusNormalize = (status: string) => {
    const s = status.toLowerCase();
    if (["done", "passed", "closed"].includes(s)) return "passed";
    if (["failed", "fail"].includes(s)) return "failed";
    if (["blocked", "roadblock"].includes(s)) return "blocked";
    if (["in_progress", "in progress"].includes(s)) return "in_progress";
    return "not_executed";
  };

  const defectStatusNormalize = (status: string) => {
    const s = status.toLowerCase();
    if (s === "done") return "done";
    if (s === "in_progress") return "in_progress";
    if (s === "blocked") return "roadblock";
    if (["new", "open"].includes(s)) return "new";
    return "new";
  };

  const modules: Record<string, {
    total: number; passed: number; failed: number; blocked: number; inProgress: number; notExecuted: number;
  }> = {};

  for (const req of matchedReqs) {
    const mod = req.module ?? req.title ?? "General";
    const modTCs = linkedTestCases.filter(tc => tc.requirementId === req.id);

    if (!modules[mod]) modules[mod] = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };

    for (const tc of modTCs) {
      modules[mod].total++;
      const s = statusNormalize(tc.status);
      if (s === "passed") modules[mod].passed++;
      else if (s === "failed") modules[mod].failed++;
      else if (s === "blocked") modules[mod].blocked++;
      else if (s === "in_progress") modules[mod].inProgress++;
      else modules[mod].notExecuted++;
    }
  }

  const totalPassed = Object.values(modules).reduce((a, m) => a + m.passed, 0);
  const totalFailed = Object.values(modules).reduce((a, m) => a + m.failed, 0);
  const totalBlocked = Object.values(modules).reduce((a, m) => a + m.blocked, 0);
  const totalInProgress = Object.values(modules).reduce((a, m) => a + m.inProgress, 0);
  const totalNotExecuted = Object.values(modules).reduce((a, m) => a + m.notExecuted, 0);
  const totalTests = linkedTestCases.length;

  const defectTasks = linkedTasks.filter(t => ["bug_fix", "defect", "bug"].includes(t.type));

  const defectCounts = {
    new: 0, in_progress: 0, for_qa_test: 0, reopen: 0, done: 0, roadblock: 0, verified: 0, closed: 0,
  };
  for (const task of defectTasks) {
    const s = defectStatusNormalize(task.status);
    if (s in defectCounts) defectCounts[s as keyof typeof defectCounts]++;
    else defectCounts.new++;
  }

  const activeDefects = defectTasks
    .filter(t => !["done", "closed"].includes(t.status))
    .map(t => ({
      id: t.id,
      name: t.name,
      priority: t.type === "bug_fix" ? "Normal" : "Normal",
      status: t.status,
      category: "Bug",
      assignee: getUserName(t.assigneeId),
      createdAt: t.createdAt.toISOString(),
    }));

  const moduleDetails = Object.entries(modules).map(([modName, m]) => {
    const passCompletion = m.total > 0 ? Math.round((m.passed / m.total) * 100) : 0;
    const totalCompletion = m.total > 0 ? Math.round(((m.total - m.notExecuted) / m.total) * 100) : 0;
    return { module: modName, ...m, passCompletion, totalCompletion };
  });

  res.json({
    redmineId: cleanId,
    generatedAt: new Date().toISOString(),
    requirements: matchedReqs.map(r => ({ id: r.id, title: r.title, module: r.module, status: r.status, priority: r.priority })),
    testExecution: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      blocked: totalBlocked,
      inProgress: totalInProgress,
      notExecuted: totalNotExecuted,
      passRate: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100 * 10) / 10 : 0,
      successRate: totalTests > 0 ? Math.round(((totalPassed + totalInProgress) / totalTests) * 100 * 10) / 10 : 0,
    },
    moduleDetails,
    defects: {
      total: defectTasks.length,
      openRate: defectTasks.length > 0 ? Math.round(((defectTasks.length - defectCounts.done - defectCounts.closed) / defectTasks.length) * 100) : 0,
      counts: defectCounts,
    },
    activeDefects,
  });
});

export default router;
