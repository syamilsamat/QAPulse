import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tasksTable, usersTable, projectsTable, requirementsTable, activityTable, notificationsTable, taskEventsTable } from "@workspace/db";
import {
  CreateTaskBody,
  UpdateTaskBody,
  GetTaskParams,
  UpdateTaskParams,
  DeleteTaskParams,
  ListTasksQueryParams,
  ReleaseTaskParams,
  AssignTaskBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isOverdue(task: typeof tasksTable.$inferSelect): boolean {
  if (task.status === "done" || task.status === "released_to_production") return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date();
}

async function notifyUser(userId: number | null | undefined, title: string, message: string, type: string, entityType: string, entityId: number) {
  if (!userId) return;
  await db.insert(notificationsTable).values({
    userId,
    title,
    message,
    type,
    entityType,
    entityId,
    read: false,
  });
}

async function formatTask(task: typeof tasksTable.$inferSelect) {
  let assigneeName = null;
  let projectName = null;
  let requirementTitle = null;

  if (task.assigneeId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, task.assigneeId));
    assigneeName = user?.name ?? null;
  }
  if (task.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, task.projectId));
    projectName = project?.name ?? null;
  }
  if (task.requirementId) {
    const [req] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, task.requirementId));
    requirementTitle = req?.title ?? null;
  }

  return {
    id: task.id,
    name: task.name,
    type: task.type,
    redmineId: task.redmineId,
    requirementId: task.requirementId,
    requirementTitle,
    testCaseId: task.testCaseId,
    projectId: task.projectId,
    projectName,
    assigneeId: task.assigneeId,
    assigneeName,
    startDate: task.startDate,
    dueDate: task.dueDate,
    status: task.status,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    completionPercentage: task.completionPercentage,
    notes: task.notes,
    isOverdue: isOverdue(task),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  let tasks = await db.select().from(tasksTable).orderBy(tasksTable.createdAt);

  if (parsed.success) {
    const { projectId, assigneeId, status, type, requirementId, overdue } = parsed.data;
    if (projectId) tasks = tasks.filter(t => t.projectId === projectId);
    if (assigneeId) tasks = tasks.filter(t => t.assigneeId === assigneeId);
    if (status) tasks = tasks.filter(t => t.status === status);
    if (type) tasks = tasks.filter(t => t.type === type);
    if (requirementId) tasks = tasks.filter(t => t.requirementId === requirementId);
    if (overdue) tasks = tasks.filter(t => isOverdue(t));
  }

  const formatted = await Promise.all(tasks.map(formatTask));
  res.json(formatted);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.insert(tasksTable).values(parsed.data).returning();

  await db.insert(activityTable).values({
    type: "task_created",
    description: `Task "${task.name}" was created`,
    userId: task.assigneeId,
    entityId: task.id,
    entityType: "task",
  });

  await notifyUser(task.assigneeId, "New task assigned", `You have been assigned task "${task.name}".`, "task", "task", task.id);

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

  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  if (prevTask && parsed.data.status && prevTask.status !== parsed.data.status) {
    await db.insert(activityTable).values({
      type: "task_status_changed",
      description: `Task "${task.name}" status changed from ${prevTask.status} to ${parsed.data.status}`,
      userId: task.assigneeId,
      entityId: task.id,
      entityType: "task",
    });
    await notifyUser(task.assigneeId, "Task updated", `Task "${task.name}" status changed to ${parsed.data.status}.`, "task", "task", task.id);
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
    .set({ assigneeId: null, status: "new" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  await db.insert(activityTable).values({
    type: "task_released",
    description: `Task "${task.name}" was released and is now available for pick-up`,
    userId: prevTask.assigneeId,
    entityId: task.id,
    entityType: "task",
  });

  await notifyUser(prevTask.assigneeId, "Task released", `Task "${task.name}" was released and is now available for pick-up.`, "task", "task", task.id);

  res.json(await formatTask(task));
});

router.post("/tasks/:id/assign", async (req, res): Promise<void> => {
  const params = ReleaseTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AssignTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db.update(tasksTable)
    .set({ assigneeId: parsed.data.assigneeId, status: "in_progress" })
    .where(eq(tasksTable.id, params.data.id))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  await db.insert(activityTable).values({
    type: "task_assigned",
    description: `Task "${task.name}" was assigned`,
    userId: parsed.data.assigneeId,
    entityId: task.id,
    entityType: "task",
  });

  await notifyUser(parsed.data.assigneeId, "Task assigned", `Task "${task.name}" was assigned to you.`, "task", "task", task.id);

  res.json(await formatTask(task));
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
