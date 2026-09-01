import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, tasksTable, usersTable, projectsTable, requirementsTable, taskEventsTable, executionModulesTable, milestonesTable, rolesTable } from "@workspace/db";
import { notifyUser } from "./_notify";
import { actorFromReq } from "./auth";
import { getAuthContext, scopeToUserProjects, canAccessProject, getModuleScope, getRoleTierRank, getRoleDepartment } from "../middleware/access";
import { logActivity, diffChanges } from "./_audit";
import { submitForReview, getLatestReview, decideReview, maybeAdvanceRequirement, notifyDevPeersOfReview, EvidenceRejectedError } from "./_code-review";

const ENV_NAMES: Record<number, string> = { 1: "Env 1", 2: "Env 2", 3: "Env 3", 4: "Env 4", 5: "Env 5", 6: "Env 6", 7: "Env 7" };
import {
  CreateTaskBody,
  UpdateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  DeleteTaskParams,
  ListTasksQueryParams,
  ReleaseTaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// CR059 — department-scoped task visibility: qa/fa/dev each only see tasks
// with at least one assignee in their own department; pm (any tier) and
// admin/cto see everything, since PM owns cross-department milestone delivery.
async function getUserIdsInDepartment(department: string): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(rolesTable, eq(rolesTable.name, usersTable.role))
    .where(eq(rolesTable.department, department));
  return rows.map(r => r.id);
}

function isOverdue(task: typeof tasksTable.$inferSelect): boolean {
  if (task.status === "done" || task.status === "released_to_production") return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date();
}

// CR036 — single-blocker dependency guard. Blocker must exist, share the task's
// project, not be the task itself, and not close a cycle. taskId is null on
// create (no id yet, so only existence/project can be violated).
async function validateBlocker(
  blockedByTaskId: number,
  taskId: number | null,
  projectId: number | null | undefined,
): Promise<string | null> {
  if (taskId !== null && blockedByTaskId === taskId) return "A task cannot be blocked by itself";

  const [blocker] = await db.select().from(tasksTable).where(eq(tasksTable.id, blockedByTaskId));
  if (!blocker) return "Blocking task not found";
  if (projectId != null && blocker.projectId !== projectId) return "Blocking task must belong to the same project";

  // Chains are short; a bounded walk with a visited set beats a recursive CTE here.
  if (taskId !== null) {
    const visited = new Set<number>([taskId]);
    let current: typeof blocker | undefined = blocker;
    while (current) {
      if (visited.has(current.id)) return "This dependency would create a cycle";
      visited.add(current.id);
      if (current.blockedByTaskId == null) break;
      [current] = await db.select().from(tasksTable).where(eq(tasksTable.id, current.blockedByTaskId));
    }
  }
  return null;
}


async function formatTask(task: typeof tasksTable.$inferSelect) {
  let assigneeNames: string[] = [];
  let projectName = null;
  let requirementTitle = null;
  let moduleName = null;
  let milestoneName = null;

  if (task.assigneeIds && task.assigneeIds.length > 0) {
    const users = await db.select().from(usersTable).where(inArray(usersTable.id, task.assigneeIds));
    assigneeNames = users.map(u => u.name);
  }

  if (task.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, task.projectId));
    projectName = project?.name ?? null;
  }

  if (task.requirementId) {
    const [req] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, task.requirementId));
    requirementTitle = req?.title ?? null;
  }

  if (task.milestoneId) {
    const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, task.milestoneId));
    milestoneName = milestone?.name ?? null;
  }

  // Resolve module names — prefer moduleIds (multi), fall back to moduleId (single)
  let moduleNames: string[] = [];
  const parsedModuleIds = task.moduleIds
    ? task.moduleIds.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)
    : task.moduleId ? [task.moduleId] : [];
  if (parsedModuleIds.length > 0) {
    const mods = await db.select().from(executionModulesTable).where(inArray(executionModulesTable.id, parsedModuleIds));
    moduleNames = mods.map(m => m.name);
    moduleName = moduleNames[0] ?? null;
  }

  const environmentNames = (task.environmentIds ?? []).map(id => ENV_NAMES[id] ?? `Env ${id}`);

  // CR036 — resolve the blocker's name/status so the UI can render the
  // "Blocked by" badge (and gray it out once the blocker is done) in one fetch.
  let blockedByTaskName: string | null = null;
  let blockedByTaskStatus: string | null = null;
  if (task.blockedByTaskId) {
    const [blocker] = await db.select().from(tasksTable).where(eq(tasksTable.id, task.blockedByTaskId));
    blockedByTaskName = blocker?.name ?? null;
    blockedByTaskStatus = blocker?.status ?? null;
  }

  return {
    ...task,
    blockedByTaskName,
    blockedByTaskStatus,
    assigneeNames,
    projectName,
    requirementTitle,
    moduleName,
    moduleNames,
    milestoneName,
    environmentNames,
    isOverdue: isOverdue(task),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  const parsed = ListTasksQueryParams.safeParse(req.query);
  let tasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);

  if (parsed.success) {
    // Typecast to any to accommodate the newly added query params not yet in Zod
    const { projectId, status, priority, moduleId, requirementId, overdue } = parsed.data as any;
    const assigneeId = (parsed.data as any).assigneeId;

    if (projectId) {
      const ok = accessible === null || accessible.includes(Number(projectId));
      if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
      tasks = tasks.filter(t => t.projectId === Number(projectId));
    } else if (accessible !== null) {
      tasks = tasks.filter(t => t.projectId !== null && accessible.includes(t.projectId));
    }
    if (status) tasks = tasks.filter(t => t.status === status);
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (moduleId) tasks = tasks.filter(t => t.moduleId === Number(moduleId));
    if (requirementId) tasks = tasks.filter(t => t.requirementId === Number(requirementId));
    if (overdue) tasks = tasks.filter(t => isOverdue(t));
    if (assigneeId) tasks = tasks.filter(t => t.assigneeIds?.includes(Number(assigneeId)));
    const milestoneId = (parsed.data as any).milestoneId;
    if (milestoneId) tasks = tasks.filter(t => t.milestoneId === Number(milestoneId));
  } else if (accessible !== null) {
    tasks = tasks.filter(t => t.projectId !== null && accessible.includes(t.projectId));
  }

  let formatted = await Promise.all(tasks.map(formatTask));

  // CR035 — module-scope. tasksTable.moduleId is an FK, not a text name, so
  // this filters on the already-resolved moduleNames[] from formatTask
  // rather than doing a second id lookup.
  const taskProjectIds = [...new Set(formatted.map((t) => t.projectId).filter((id): id is number => id != null))];
  const taskModuleScopes = new Map(await Promise.all(taskProjectIds.map(async (pid) => [pid, await getModuleScope(ctx.userId, ctx.role, pid)] as const)));
  formatted = formatted.filter((t) => {
    const scope = t.projectId != null ? taskModuleScopes.get(t.projectId) : undefined;
    if (!scope || !scope.restricted) return true;
    return t.moduleNames.some((n) => scope.moduleNames.includes(n));
  });

  // CR059 — department-scoped visibility. pm (any tier) and admin/cto (tier
  // >=5) see every task in their project/module scope above; qa/fa/dev only
  // see tasks with at least one assignee in their own department.
  const tierRank = await getRoleTierRank(ctx.role);
  const department = await getRoleDepartment(ctx.role);
  if (tierRank < 5 && department && department !== "pm") {
    const deptUserIds = new Set(await getUserIdsInDepartment(department));
    formatted = formatted.filter((t) => t.assigneeIds?.some((id) => deptUserIds.has(id)));
  }

  res.json(formatted);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.projectId) {
    const ok = await canAccessProject(ctx.userId, ctx.role, parsed.data.projectId);
    if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
  }

  if (parsed.data.blockedByTaskId != null) {
    const blockerError = await validateBlocker(parsed.data.blockedByTaskId, null, parsed.data.projectId);
    if (blockerError) { res.status(400).json({ error: blockerError }); return; }
  }

  // Dev Tasks — a task carrying requirementId feeds the "all tasks done ->
  // requirement auto-advances to Ready for QA" rollup (maybeAdvanceRequirement),
  // so creating one is restricted to the dev department's lead tier (+ admin/cto),
  // not the general Task Tracker's open creation. Ad-hoc tasks (no requirementId)
  // are unaffected.
  if (parsed.data.requirementId != null) {
    const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, parsed.data.requirementId));
    if (!requirement) { res.status(400).json({ error: "Requirement not found" }); return; }
    if ((requirement as any).isBlocked) {
      res.status(409).json({ error: "Requirement is blocked — unblock it first before adding dev tasks" });
      return;
    }
    const department = await getRoleDepartment(ctx.role);
    const tierRank = await getRoleTierRank(ctx.role);
    const isDevLead = department === "dev" && tierRank >= 2;
    const isSuperuser = ctx.role === "admin" || ctx.role === "cto";
    if (!isDevLead && !isSuperuser) {
      res.status(403).json({ error: "Dev Lead role required to create a dev task" });
      return;
    }
  }

  const [task] = await db.insert(tasksTable).values(parsed.data).returning();

  // CR011: one audit row per event, attributed to the actor (not per assignee)
  await logActivity({
    type: "task_created",
    description: `Task "${task.name}" was created`,
    userId: actorFromReq(req),
    entityId: task.id,
    entityType: "task",
  });

  if (task.assigneeIds && task.assigneeIds.length > 0) {
    for (const id of task.assigneeIds) {
      await notifyUser(id, "New task assigned", `You have been assigned task "${task.name}".`, "task", "task", task.id);
    }
  }

  res.status(201).json(await formatTask(task));
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json(await formatTask(task));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [prevTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));

  // Dev Tasks — "in_review" and "done" are only reachable through the
  // reviewed path (submit-review / review below), never a direct field edit,
  // so the code-review gate can't be bypassed by PATCHing status straight in.
  // Only guarded for requirement-linked tasks — ad-hoc tasks aren't gated.
  if (prevTask?.requirementId != null && parsed.data.status && ["in_review", "done"].includes(parsed.data.status) && parsed.data.status !== prevTask.status) {
    res.status(409).json({ error: `Use /tasks/:id/submit-review or /tasks/:id/review to reach "${parsed.data.status}" — it can't be set directly` });
    return;
  }

  if (parsed.data.blockedByTaskId != null) {
    // Validate against the project the task will have after this update.
    const effectiveProjectId = parsed.data.projectId ?? prevTask?.projectId;
    const blockerError = await validateBlocker(parsed.data.blockedByTaskId, params.data.id, effectiveProjectId);
    if (blockerError) { res.status(400).json({ error: blockerError }); return; }
  }

  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // CR011: one diff row per update — keeps the task_status_changed type when status moved
  const diff = prevTask ? diffChanges(prevTask, parsed.data) : null;
  if (diff) {
    const statusChanged = "status" in diff.newValue;
    await logActivity({
      type: statusChanged ? "task_status_changed" : "task_updated",
      description: statusChanged
        ? `Task "${task.name}" status changed from ${prevTask!.status} to ${task.status}`
        : `Task "${task.name}" was updated`,
      userId: actorFromReq(req),
      entityId: task.id,
      entityType: "task",
      ...diff,
    });
  }

  if (prevTask && parsed.data.status && prevTask.status !== parsed.data.status) {
    // Loop through assignees to notify them of the status change
    if (task.assigneeIds && task.assigneeIds.length > 0) {
      for (const id of task.assigneeIds) {
        await notifyUser(id, "Task updated", `Task "${task.name}" status changed to ${parsed.data.status}.`, "task", "task", task.id);
      }
    }
  }

  res.json(await formatTask(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  await logActivity({
    type: "task_deleted",
    description: `Task "${task.name}" was deleted`,
    userId: actorFromReq(req),
    entityId: task.id,
    entityType: "task",
    oldValue: {
      name: task.name,
      status: task.status,
      priority: task.priority,
      projectId: task.projectId,
      requirementId: task.requirementId,
      assigneeIds: task.assigneeIds,
    },
  });

  res.sendStatus(204);
});

router.post("/tasks/:id/release", async (req, res): Promise<void> => {
  const params = ReleaseTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [prevTask] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!prevTask) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const [task] = await db.update(tasksTable)
    .set({ assigneeIds: [], status: "new" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  await logActivity({
    type: "task_released",
    description: `Task "${task.name}" was released and is now available for pick-up`,
    userId: actorFromReq(req),
    entityId: task.id,
    entityType: "task",
    oldValue: { assigneeIds: prevTask.assigneeIds, status: prevTask.status },
    newValue: { assigneeIds: [], status: "new" },
  });

  // Notify the previously assigned users that the task was released
  if (prevTask.assigneeIds && prevTask.assigneeIds.length > 0) {
    for (const id of prevTask.assigneeIds) {
      await notifyUser(id, "Task released", `Task "${task.name}" was released and is now available for pick-up.`, "task", "task", task.id);
    }
  }

  res.json(await formatTask(task));
});

router.post("/tasks/:id/assign", async (req, res): Promise<void> => {
  const params = ReleaseTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const assigneeIds = req.body.assigneeIds;
  if (!Array.isArray(assigneeIds)) {
    res.status(400).json({ error: "assigneeIds must be an array" });
    return;
  }

  const [task] = await db.update(tasksTable)
    .set({ assigneeIds: assigneeIds, status: "in_progress" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  await logActivity({
    type: "task_assigned",
    description: `Task "${task.name}" was assigned`,
    userId: actorFromReq(req),
    entityId: task.id,
    entityType: "task",
    newValue: { assigneeIds: task.assigneeIds, status: "in_progress" },
  });

  if (task.assigneeIds && task.assigneeIds.length > 0) {
    for (const id of task.assigneeIds) {
      await notifyUser(id, "Task assigned", `Task "${task.name}" was assigned to you.`, "task", "task", task.id);
    }
  }

  res.json(await formatTask(task));
});

// CR023p4 — clears the requirement-revision alert; visibility only, no status change
router.post("/tasks/:id/acknowledge-revision", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [task] = await db.update(tasksTable)
    .set({ requirementRevisedAt: null })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  await logActivity({
    type: "task_revision_acknowledged",
    description: `Task "${task.name}" requirement-revision alert acknowledged`,
    userId: actorFromReq(req),
    entityId: task.id,
    entityType: "task",
  });

  res.json(await formatTask(task));
});

/* ────────────────────────────────
   DEV TASKS — CODE REVIEW
   ──────────────────────────────── */

// POST /tasks/:id/submit-review — the task's own assignee submits it for
// peer review. Body: { prLink?: string, evidence?: { filename, mimeType, data (base64) } }
router.post("/tasks/:id/submit-review", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  if (!task.assigneeIds || !task.assigneeIds.includes(ctx.userId)) {
    res.status(403).json({ error: "Only a task's own assignee can submit it for review" });
    return;
  }
  if (task.status === "in_review" || task.status === "done") {
    res.status(409).json({ error: `Task is already ${task.status}` });
    return;
  }

  if (task.requirementId != null) {
    const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, task.requirementId));
    if ((requirement as any)?.isBlocked) {
      res.status(409).json({ error: "Requirement is blocked — unblock it first before submitting for review" });
      return;
    }
  }

  const { prLink, evidence } = req.body ?? {};
  let review;
  try {
    review = await submitForReview({
      entityType: "task",
      entityId: id,
      submittedBy: ctx.userId,
      prLink: typeof prLink === "string" ? prLink : null,
      evidence: evidence && evidence.filename && evidence.data ? evidence : null,
      logDescription: `Task "${task.name}" submitted for code review`,
      logEntityType: "task",
    });
  } catch (err) {
    if (err instanceof EvidenceRejectedError) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }

  const [updatedTask] = await db.update(tasksTable).set({ status: "in_review" }).where(eq(tasksTable.id, id)).returning();

  await notifyDevPeersOfReview({
    projectId: task.projectId,
    title: "Code review requested",
    message: `Task "${task.name}" is ready for review.`,
    type: "task_review_requested",
    entityType: "task",
    entityId: id,
    actorId: ctx.userId,
    excludeUserIds: task.assigneeIds,
  }).catch(() => {});

  res.json({ task: await formatTask(updatedTask), review });
});

// POST /tasks/:id/review — a peer dev (never a co-assignee) approves or
// rejects the task's latest review round. Body: { decision: "approve"|"reject", note?: string }
router.post("/tasks/:id/review", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { decision, note } = req.body ?? {};
  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ error: "decision must be approve or reject" });
    return;
  }

  const [task] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (task.status !== "in_review") {
    res.status(409).json({ error: "Task is not awaiting review" });
    return;
  }
  if (task.assigneeIds && task.assigneeIds.includes(ctx.userId)) {
    res.status(403).json({ error: "Can't review your own task" });
    return;
  }

  const department = await getRoleDepartment(ctx.role);
  const tierRank = await getRoleTierRank(ctx.role);
  const isEligibleReviewer = department === "dev" || tierRank >= 2 || ctx.role === "admin" || ctx.role === "cto";
  if (!isEligibleReviewer) {
    res.status(403).json({ error: "Dev department or Lead-tier role required to review" });
    return;
  }

  if (task.projectId != null) {
    if (!(await canAccessProject(ctx.userId, ctx.role, task.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const parsedModuleIds = task.moduleIds
      ? task.moduleIds.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0)
      : task.moduleId ? [task.moduleId] : [];
    if (parsedModuleIds.length > 0) {
      const mods = await db.select({ name: executionModulesTable.name }).from(executionModulesTable).where(inArray(executionModulesTable.id, parsedModuleIds));
      const taskModuleNames = mods.map(m => m.name);
      const scope = await getModuleScope(ctx.userId, ctx.role, task.projectId);
      if (scope.restricted && !taskModuleNames.some(n => scope.moduleNames.includes(n))) {
        res.status(403).json({ error: "Access denied to this module" });
        return;
      }
    }
  }

  const review = await getLatestReview("task", id);
  if (!review || review.status !== "in_review") {
    res.status(409).json({ error: "No pending review found for this task" });
    return;
  }

  const updatedReview = await decideReview({
    reviewId: review.id,
    reviewerId: ctx.userId,
    decision,
    note: typeof note === "string" ? note : null,
    logDescription: decision === "approve"
      ? `Task "${task.name}" — code review approved`
      : `Task "${task.name}" — changes requested${note ? `: ${note}` : ""}`,
    logEntityType: "task",
    entityId: id,
  });

  const [updatedTask] = await db
    .update(tasksTable)
    .set({ status: decision === "approve" ? "done" : "in_progress" })
    .where(eq(tasksTable.id, id))
    .returning();

  if (decision === "approve" && task.requirementId != null) {
    const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ctx.userId));
    await maybeAdvanceRequirement(task.requirementId, reviewer?.name ?? "a reviewer");
  }

  if (task.assigneeIds && task.assigneeIds.length > 0) {
    for (const uid of task.assigneeIds) {
      await notifyUser(
        uid,
        decision === "approve" ? "Code review approved" : "Changes requested",
        decision === "approve"
          ? `Task "${task.name}" was approved and marked Done.`
          : `Task "${task.name}" needs changes${note ? `: ${note}` : ""}.`,
        decision === "approve" ? "task_review_approved" : "task_review_rejected",
        "task",
        id,
        ctx.userId,
      ).catch(() => {});
    }
  }

  res.json({ task: await formatTask(updatedTask), review: updatedReview });
});

/* ────────────────────────────────
   TASK EVENTS
   ──────────────────────────────── */

router.get("/tasks/events/all", async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(taskEventsTable)
    .orderBy(taskEventsTable.createdAt);
  res.json(events);
});

router.get("/tasks/:id/events", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const events = await db
    .select()
    .from(taskEventsTable)
    .where(eq(taskEventsTable.taskId, params.data.id))
    .orderBy(taskEventsTable.createdAt);

  res.json(events);
});

router.post("/tasks/:id/events", async (req, res): Promise<void> => {
  const params = GetTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { title, description, startDate, endDate, severity, createdBy } = req.body;
  if (!title || !title.trim()) {
    res.status(400).json({ error: "Event title is required" });
    return;
  }

  const [event] = await db
    .insert(taskEventsTable)
    .values({
      taskId: params.data.id,
      title: title.trim(),
      description: description || null,
      startDate: startDate || null,
      endDate: endDate || null,
      severity: severity || "medium",
      createdBy: createdBy || null,
    })
    .returning();

  res.status(201).json(event);
});

export default router;