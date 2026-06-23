import { Router, type IRouter } from "express";
import { eq, like, or, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  tasksTable,
  testCasesTable,
  activityTable,
} from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserBody,
  GetUserParams,
  UpdateUserParams,
  GetUserStatsParams,
  ListUsersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    team: u.team,
    avatarUrl: u.avatarUrl,
    mustChangePassword: u.mustChangePassword,
    isActive: u.isActive ?? true,
    redmineApiKey: u.redmineApiKey ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  let users = await db.select().from(usersTable).orderBy(usersTable.name);

  if (parsed.success) {
    const { role, search } = parsed.data;
    if (role) {
      users = users.filter((u) => u.role === role);
    }
    if (search) {
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      );
    }
  }

  res.json(users.map(formatUser));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const insertData = {
    ...parsed.data,
    mustChangePassword: true,
  };
  const [user] = await db.insert(usersTable).values(insertData).returning();
  res.status(201).json(formatUser(user));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(formatUser(user));
});

router.patch("/users/:id/redmine-key", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  const { redmineApiKey } = req.body;
  const [user] = await db
    .update(usersTable)
    .set({ redmineApiKey: redmineApiKey?.trim() || null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.get("/users/:id/stats", async (req, res): Promise<void> => {
  const params = GetUserStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { id } = params.data;
  const now = new Date();

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.assigneeId, id));

  const tasksCompleted = tasks.filter((t) => t.status === "released_to_production").length;
  const tasksPending = tasks.filter((t) =>
    ["uat", "sit"].includes(t.status),
  ).length;
  const tasksBlocked = tasks.filter((t) => t.status === "blocked").length;
  const tasksOverdue = tasks.filter((t) => {
    if (t.status === "released_to_production") return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < now;
  }).length;

  const testCases = await db
    .select()
    .from(testCasesTable)
    .where(eq(testCasesTable.authorId, id));
  const testCasesCreated = testCases.length;
  const automationContribution = testCases.filter(
    (tc) => tc.type === "automation_candidate",
  ).length;

  const completedOnTime = tasks.filter((t) => {
    if (t.status !== "released_to_production") return false;
    if (!t.dueDate) return true;
    return new Date(t.updatedAt) <= new Date(t.dueDate);
  }).length;

  const onTimeRate =
    tasksCompleted > 0 ? (completedOnTime / tasksCompleted) * 100 : 0;
  const totalNonDone = tasks.filter((t) => t.status !== "released_to_production").length;
  const overdueRate =
    totalNonDone > 0 ? (tasksOverdue / totalNonDone) * 100 : 0;

  const recentActivity = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.userId, id))
    .orderBy(desc(activityTable.createdAt))
    .limit(10);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));

  res.json({
    userId: id,
    tasksCompleted,
    tasksPending,
    tasksBlocked,
    tasksOverdue,
    testCasesCreated,
    bugsReported: 0,
    bugsVerified: 0,
    onTimeRate: Math.round(onTimeRate),
    overdueRate: Math.round(overdueRate),
    automationContribution,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      userId: a.userId,
      userName: user?.name ?? null,
      entityId: a.entityId,
      entityType: a.entityType,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

router.patch("/users/:id/active", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive must be a boolean" }); return; }
    const [user] = await db.update(usersTable).set({ isActive }).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update user status" });
  }
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  // Using GetUserParams since it already validates the :id parameter perfectly
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
