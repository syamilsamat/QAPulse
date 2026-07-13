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

// ─── Milestone phase breakdown (CR032 — multi-cycle) ─────────────────────────
// "Where did the time go" report. Each requirement's lifecycle is
// reconstructed as a repeating Requirements -> Gap -> [Develop] -> QA/UAT
// sequence from its ordered activity-log events plus execution timestamps —
// not a single min/max window per fixed phase. Two problems that fixed-window
// model had: (1) Develop was never represented even though CR030's dev-handoff
// events exist; (2) a resubmit-and-reapprove cycle (CR023 reject/revise, or a
// CR031 requirement defect raised after approval) silently dragged the single
// "Requirements" window out to the later date instead of appearing as its own
// segment — misattributing dev/QA time as slow requirements review.

type PhaseKey = "requirements" | "gap" | "develop" | "qa" | "uat";

const PHASE_LABELS: Record<PhaseKey, string> = {
  requirements: "Requirements",
  gap: "Gap",
  develop: "Develop",
  qa: "QA testing",
  uat: "UAT",
};

interface PhaseSegment {
  key: PhaseKey;
  cycle: number;
  label: string;
  start: string;
  end: string | null;
  days: number;
  ongoing: boolean;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000 * 10) / 10);
}

function makeSegment(key: PhaseKey, cycle: number, start: Date, end: Date | null, now: Date): PhaseSegment {
  const effectiveEnd = end ?? now;
  return {
    key,
    cycle,
    label: cycle > 1 ? `${PHASE_LABELS[key]} (round ${cycle})` : PHASE_LABELS[key],
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    days: daysBetween(start, effectiveEnd),
    ongoing: !end,
  };
}

const RELEVANT_EVENT_TYPES = [
  "requirement_submit",
  "requirement_approve",
  "requirement_dev_assign",
  "requirement_dev_ready_for_qa",
];

// Look-ahead state machine, not a single reactive pass over events — at each
// state we find the earliest of the possible next boundary events (which
// differs per state) and jump straight to it. This is what makes the
// "resubmit while still churning inside Requirements" case fall out for
// free: requirement_submit only ends a cycle from the "gap" or "testing"
// states below, never from "requirements" itself — only requirement_approve
// closes that segment, no matter how many reject/revise/resubmit loops
// (CR023) happened first. requirement_reject and requirement_dev_start are
// intentionally not queried anywhere here — neither one moves a boundary.
function computeTimelineFromEvents(
  requirementCreatedAt: Date,
  events: { type: string; createdAt: Date }[], // pre-filtered to RELEVANT_EVENT_TYPES, ascending
  qaExecTimes: Date[], // ascending
  uatExecTimes: Date[], // ascending
  milestoneCompletedAt: Date | null,
): PhaseSegment[] {
  const now = new Date();
  const segments: PhaseSegment[] = [];

  const nextEventOfType = (types: string[], after: Date) =>
    events.find((e) => types.includes(e.type) && e.createdAt > after) ?? null;
  const nextExecAfter = (after: Date): Date | null => {
    const all = [...qaExecTimes, ...uatExecTimes].filter((d) => d > after).sort((a, b) => a.getTime() - b.getTime());
    return all[0] ?? null;
  };
  // Bounded by [windowStart, windowEnd) — emits a qa segment, then a uat
  // segment, back to back, using whichever execution timestamps actually
  // fall in this cycle's testing window.
  const emitTesting = (windowStart: Date, windowEnd: Date | null, cycle: number) => {
    const inWindow = (d: Date) => d >= windowStart && (windowEnd === null || d < windowEnd);
    const qaTimes = qaExecTimes.filter(inWindow);
    const uatTimes = uatExecTimes.filter(inWindow);
    if (qaTimes.length === 0 && uatTimes.length === 0) return;
    if (qaTimes.length > 0) {
      const qaEnd = uatTimes.length > 0 ? uatTimes[0] : windowEnd;
      segments.push(makeSegment("qa", cycle, qaTimes[0], qaEnd, now));
    }
    if (uatTimes.length > 0) {
      segments.push(makeSegment("uat", cycle, uatTimes[0], windowEnd, now));
    }
  };

  let cycle = 1;
  let phaseStart = requirementCreatedAt;
  let state: "requirements" | "gap" | "develop" | "testing" = "requirements";
  let testingWindowStart: Date | null = null;
  let guard = 0;

  while (guard++ < 100) {
    if (state === "requirements") {
      const approveEv = nextEventOfType(["requirement_approve"], phaseStart);
      if (!approveEv) { segments.push(makeSegment("requirements", cycle, phaseStart, milestoneCompletedAt, now)); break; }
      segments.push(makeSegment("requirements", cycle, phaseStart, approveEv.createdAt, now));
      phaseStart = approveEv.createdAt;
      state = "gap";
    } else if (state === "gap") {
      // Whichever comes first — a dev handoff (CR030), the first execution
      // recorded (projects that skip dev handoff go straight from approval
      // to QA, same as the old model's gapBeforeQa->qa boundary), or a
      // resubmit before either of those ever happened — decides how the
      // gap closes.
      const devAssignEv = nextEventOfType(["requirement_dev_assign"], phaseStart);
      const submitEv = nextEventOfType(["requirement_submit"], phaseStart);
      const execTime = nextExecAfter(phaseStart);
      const candidates: { at: Date; kind: "dev" | "exec" | "submit" }[] = [];
      if (devAssignEv) candidates.push({ at: devAssignEv.createdAt, kind: "dev" });
      if (execTime) candidates.push({ at: execTime, kind: "exec" });
      if (submitEv) candidates.push({ at: submitEv.createdAt, kind: "submit" });
      if (candidates.length === 0) { segments.push(makeSegment("gap", cycle, phaseStart, milestoneCompletedAt, now)); break; }
      candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
      const winner = candidates[0];
      segments.push(makeSegment("gap", cycle, phaseStart, winner.at, now));
      if (winner.kind === "submit") {
        cycle += 1;
        phaseStart = winner.at;
        state = "requirements";
      } else if (winner.kind === "dev") {
        phaseStart = winner.at;
        state = "develop";
      } else {
        phaseStart = winner.at;
        testingWindowStart = winner.at;
        state = "testing";
      }
    } else if (state === "develop") {
      const readyEv = nextEventOfType(["requirement_dev_ready_for_qa"], phaseStart);
      const submitEv = nextEventOfType(["requirement_submit"], phaseStart);
      // FA edits the requirement mid-development and re-submits for review —
      // if that re-submit arrives before ready_for_qa, end this develop cycle
      // and start a new Requirements cycle (dev is now blocked).
      const resubmitBreaks = submitEv && (!readyEv || submitEv.createdAt < readyEv.createdAt);
      if (resubmitBreaks) {
        segments.push(makeSegment("develop", cycle, phaseStart, submitEv!.createdAt, now));
        cycle += 1;
        phaseStart = submitEv!.createdAt;
        state = "requirements";
      } else if (!readyEv) {
        segments.push(makeSegment("develop", cycle, phaseStart, milestoneCompletedAt, now));
        break;
      } else {
        segments.push(makeSegment("develop", cycle, phaseStart, readyEv.createdAt, now));
        phaseStart = readyEv.createdAt;
        testingWindowStart = readyEv.createdAt;
        state = "testing";
      }
    } else {
      const submitEv = nextEventOfType(["requirement_submit"], phaseStart);
      const windowEnd = submitEv ? submitEv.createdAt : milestoneCompletedAt;
      emitTesting(testingWindowStart!, windowEnd, cycle);
      if (!submitEv) break;
      cycle += 1;
      phaseStart = submitEv.createdAt;
      state = "requirements";
    }
  }

  return segments;
}

interface RequirementTimelineEntry {
  id: number;
  title: string;
  status: string;
  timeline: PhaseSegment[];
}

// Batches activity-log and execution rows for the whole milestone in two
// queries (not one per requirement) and partitions them in memory — same
// no-N+1 discipline as the CR026 analytics endpoint.
async function computeRequirementTimelines(milestoneId: number, milestoneCompletedAt: Date | null): Promise<RequirementTimelineEntry[]> {
  const reqs = await db
    .select({ id: requirementsTable.id, title: requirementsTable.title, reviewStatus: requirementsTable.reviewStatus, devStatus: requirementsTable.devStatus, createdAt: requirementsTable.createdAt })
    .from(requirementsTable)
    .where(eq(requirementsTable.milestoneId, milestoneId));
  if (reqs.length === 0) return [];
  const reqIds = reqs.map((r) => r.id);

  const activityRows = await db
    .select({ entityId: activityTable.entityId, type: activityTable.type, createdAt: activityTable.createdAt })
    .from(activityTable)
    .where(and(eq(activityTable.entityType, "requirement"), inArray(activityTable.entityId, reqIds)))
    .orderBy(activityTable.createdAt);

  const execRows = await db
    .select({ requirementId: executionTestCasesTable.requirementId, fileType: executionFilesTable.fileType, executedAt: executionTestCasesTable.executedAt })
    .from(executionTestCasesTable)
    .innerJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
    .where(inArray(executionTestCasesTable.requirementId, reqIds));

  const activityByReq = new Map<number, { type: string; createdAt: Date }[]>();
  for (const row of activityRows) {
    if (row.entityId == null || !RELEVANT_EVENT_TYPES.includes(row.type)) continue;
    if (!activityByReq.has(row.entityId)) activityByReq.set(row.entityId, []);
    activityByReq.get(row.entityId)!.push({ type: row.type, createdAt: row.createdAt });
  }
  const execByReq = new Map<number, { qa: Date[]; uat: Date[] }>();
  for (const row of execRows) {
    if (row.requirementId == null || !row.executedAt) continue;
    if (!execByReq.has(row.requirementId)) execByReq.set(row.requirementId, { qa: [], uat: [] });
    const bucket = execByReq.get(row.requirementId)!;
    if (row.fileType === "qa") bucket.qa.push(row.executedAt);
    else if (row.fileType === "uat") bucket.uat.push(row.executedAt);
  }

  return reqs.map((r) => {
    const events = activityByReq.get(r.id) ?? [];
    const exec = execByReq.get(r.id) ?? { qa: [], uat: [] };
    const qaExecTimes = [...exec.qa].sort((a, b) => a.getTime() - b.getTime());
    const uatExecTimes = [...exec.uat].sort((a, b) => a.getTime() - b.getTime());
    const timeline = computeTimelineFromEvents(r.createdAt, events, qaExecTimes, uatExecTimes, milestoneCompletedAt);

    let status: string;
    const reviewStatus = (r as any).reviewStatus ?? "draft";
    if (reviewStatus !== "approved") {
      status = reviewStatus === "in_review" ? "In review" : reviewStatus === "rejected" ? "Rejected — awaiting revision" : "Not yet approved";
    } else if (uatExecTimes.length > 0) {
      status = "Approved · in UAT";
    } else if (qaExecTimes.length > 0) {
      status = "Approved · in QA testing";
    } else if (r.devStatus) {
      status = "Approved · in development";
    } else {
      status = "Approved · awaiting QA";
    }

    return { id: r.id, title: r.title, status, timeline };
  });
}

interface PhaseSummaryEntry {
  key: PhaseKey;
  label: string;
  avgDays: number | null;
  ongoing: false;
}

// Sums a requirement's own per-cycle durations for a given phase key first,
// then averages that per-requirement total across requirements — so a
// requirement with two Requirements-phase cycles contributes their combined
// total, not two diluting data points. This is what makes the milestone
// number answer "how much total time did requirements churn cost."
function summarizeTimelines(entries: RequirementTimelineEntry[]): PhaseSummaryEntry[] {
  const perReqTotals = entries.map((e) => {
    const totals: Partial<Record<PhaseKey, number>> = {};
    for (const seg of e.timeline) totals[seg.key] = (totals[seg.key] ?? 0) + seg.days;
    return totals;
  });
  const avg = (vals: (number | undefined)[]) => {
    const present = vals.filter((v): v is number => v !== undefined);
    return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
  };
  const keys: PhaseKey[] = ["requirements", "gap", "develop", "qa", "uat"];
  return keys
    .map((key) => ({ key, label: PHASE_LABELS[key], avgDays: avg(perReqTotals.map((t) => t[key])), ongoing: false as const }))
    .filter((entry) => entry.avgDays !== null && entry.avgDays > 0);
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

  const requirementTimelines = await computeRequirementTimelines(milestoneId, milestone.completedAt);
  if (requirementTimelines.length === 0) {
    res.json({ milestone: { id: milestone.id, name: milestone.name, status: milestone.status }, phaseSummary: null, trend: null, requirements: [] });
    return;
  }

  const phaseSummary = summarizeTimelines(requirementTimelines);

  // Trend: last 5 completed milestones in the same project (this one included,
  // if it's itself completed), each given the same phase computation.
  const completedMilestones = await db
    .select().from(milestonesTable)
    .where(and(eq(milestonesTable.projectId, milestone.projectId), eq(milestonesTable.status, "completed")))
    .orderBy(desc(milestonesTable.targetDate))
    .limit(5);

  const trendEntries: { id: number; name: string; requirementsDays: number | null; gapDays: number | null; developDays: number | null; qaDays: number | null; uatDays: number | null }[] = [];
  for (const m of completedMilestones) {
    const entries = await computeRequirementTimelines(m.id, m.completedAt);
    if (entries.length === 0) continue;
    const summary = summarizeTimelines(entries);
    const byKey = Object.fromEntries(summary.map((s) => [s.key, s.avgDays])) as Partial<Record<PhaseKey, number | null>>;
    trendEntries.push({
      id: m.id, name: m.name,
      requirementsDays: byKey.requirements ?? null, gapDays: byKey.gap ?? null,
      developDays: byKey.develop ?? null, qaDays: byKey.qa ?? null, uatDays: byKey.uat ?? null,
    });
  }

  const avg = (vals: (number | null)[]) => {
    const present = vals.filter((v): v is number => v !== null);
    return present.length ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10 : null;
  };

  res.json({
    milestone: { id: milestone.id, name: milestone.name, status: milestone.status, targetDate: milestone.targetDate?.toISOString() ?? null },
    phaseSummary,
    trend: {
      count: trendEntries.length,
      avgRequirementsDays: avg(trendEntries.map((e) => e.requirementsDays)),
      avgGapDays: avg(trendEntries.map((e) => e.gapDays)),
      avgDevelopDays: avg(trendEntries.map((e) => e.developDays)),
      avgQaDays: avg(trendEntries.map((e) => e.qaDays)),
      avgUatDays: avg(trendEntries.map((e) => e.uatDays)),
      milestones: trendEntries,
    },
    requirements: requirementTimelines,
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
  // Resolve defect → milestone primarily from defects.milestoneId directly
  // (set at creation time on every path since the milestone-traceability
  // fix — manual QA defect, fail-modal, Redmine pull, sync-from-redmine).
  // Falls back to the old defect_links → execution_test_cases →
  // execution_files chain for defects created before that column existed,
  // so historical data doesn't just disappear from the panel.
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
  for (const d of defects) {
    if (d.milestoneId) defectToMilestone.set(d.id, d.milestoneId);
  }
  for (const link of allLinks) {
    if (defectToMilestone.has(link.defectId)) continue; // direct milestoneId already resolved it
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
