import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  teamsTable,
  userTeamsTable,
  projectTeamsTable,
  projectMembersTable,
  usersTable,
  projectsTable,
} from "@workspace/db";
import { verifyToken } from "./auth";

const router: IRouter = Router();

function requireAdmin(req: any, res: any): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  try {
    const { role } = verifyToken(auth.slice(7));
    if (role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
}

// ─── Teams CRUD ───────────────────────────────────────────────────────────────

router.get("/teams", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const teams = await db.select().from(teamsTable).orderBy(teamsTable.name);
    const memberships = await db.select({ teamId: userTeamsTable.teamId }).from(userTeamsTable);
    const counts: Record<number, number> = {};
    for (const m of memberships) counts[m.teamId] = (counts[m.teamId] ?? 0) + 1;
    res.json(teams.map((t) => ({ ...t, memberCount: counts[t.id] ?? 0 })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load teams" });
  }
});

router.post("/teams", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const name = req.body.name?.trim();
    const department = req.body.department?.trim();
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!department) { res.status(400).json({ error: "department is required" }); return; }
    const [team] = await db.insert(teamsTable).values({ name, department }).returning();
    res.status(201).json(team);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create team" });
  }
});

router.get("/teams/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid team ID" }); return; }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, id));
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    const memberRows = await db
      .select({ userId: userTeamsTable.userId, teamRole: userTeamsTable.role })
      .from(userTeamsTable)
      .where(eq(userTeamsTable.teamId, id));

    const members = await Promise.all(
      memberRows.map(async (r) => {
        const [user] = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, r.userId));
        return user ? { ...user, teamRole: r.teamRole } : null;
      })
    );

    const projectRows = await db
      .select({ projectId: projectTeamsTable.projectId })
      .from(projectTeamsTable)
      .where(eq(projectTeamsTable.teamId, id));

    res.json({ ...team, members: members.filter(Boolean), projectIds: projectRows.map((r) => r.projectId) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load team" });
  }
});

router.patch("/teams/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid team ID" }); return; }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, id));
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    const update: Partial<typeof teamsTable.$inferInsert> = {};
    if (req.body.name?.trim()) update.name = req.body.name.trim();
    if (req.body.department?.trim()) update.department = req.body.department.trim();

    const [updated] = await db.update(teamsTable).set(update).where(eq(teamsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update team" });
  }
});

router.delete("/teams/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid team ID" }); return; }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, id));
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }
    await db.delete(userTeamsTable).where(eq(userTeamsTable.teamId, id));
    await db.delete(projectTeamsTable).where(eq(projectTeamsTable.teamId, id));
    await db.delete(teamsTable).where(eq(teamsTable.id, id));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete team" });
  }
});

// ─── Team Members ─────────────────────────────────────────────────────────────

router.get("/teams/:id/members", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid team ID" }); return; }

    const rows = await db
      .select({ userId: userTeamsTable.userId, teamRole: userTeamsTable.role })
      .from(userTeamsTable)
      .where(eq(userTeamsTable.teamId, id));

    const members = await Promise.all(
      rows.map(async (r) => {
        const [user] = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, r.userId));
        return user ? { ...user, teamRole: r.teamRole } : null;
      })
    );
    res.json(members.filter(Boolean));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load members" });
  }
});

router.post("/teams/:id/members", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const teamId = parseInt(req.params.id);
    if (isNaN(teamId)) { res.status(400).json({ error: "Invalid team ID" }); return; }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    const userId = Number(req.body.userId);
    const role = req.body.role ?? "member";
    if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
    if (!["member", "lead"].includes(role)) {
      res.status(400).json({ error: 'role must be "member" or "lead"' }); return;
    }

    await db
      .insert(userTeamsTable)
      .values({ teamId, userId, role })
      .onConflictDoUpdate({
        target: [userTeamsTable.teamId, userTeamsTable.userId],
        set: { role },
      });
    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to add member" });
  }
});

router.delete("/teams/:id/members/:userId", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const teamId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    if (isNaN(teamId) || isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .delete(userTeamsTable)
      .where(and(eq(userTeamsTable.teamId, teamId), eq(userTeamsTable.userId, userId)));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to remove member" });
  }
});

// ─── Project ↔ Team Assignment ────────────────────────────────────────────────

router.get("/projects/:id/teams", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const rows = await db
      .select({ teamId: projectTeamsTable.teamId })
      .from(projectTeamsTable)
      .where(eq(projectTeamsTable.projectId, projectId));

    const teams = await Promise.all(
      rows.map(async (r) => {
        const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, r.teamId));
        return team ?? null;
      })
    );
    res.json(teams.filter(Boolean));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load project teams" });
  }
});

router.post("/projects/:id/teams", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const teamId = Number(req.body.teamId);
    if (!teamId) { res.status(400).json({ error: "teamId is required" }); return; }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
    if (!team) { res.status(404).json({ error: "Team not found" }); return; }

    await db.insert(projectTeamsTable).values({ projectId, teamId }).onConflictDoNothing();
    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to assign team" });
  }
});

router.delete("/projects/:id/teams/:teamId", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    const teamId = parseInt(req.params.teamId);
    if (isNaN(projectId) || isNaN(teamId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .delete(projectTeamsTable)
      .where(and(eq(projectTeamsTable.projectId, projectId), eq(projectTeamsTable.teamId, teamId)));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to remove team from project" });
  }
});

// ─── Direct Project Members (escape hatch) ────────────────────────────────────

router.get("/projects/:id/members", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const rows = await db
      .select({ userId: projectMembersTable.userId })
      .from(projectMembersTable)
      .where(eq(projectMembersTable.projectId, projectId));

    const members = await Promise.all(
      rows.map(async (r) => {
        const [user] = await db
          .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
          .from(usersTable)
          .where(eq(usersTable.id, r.userId));
        return user ?? null;
      })
    );
    res.json(members.filter(Boolean));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load project members" });
  }
});

router.post("/projects/:id/members", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const userId = Number(req.body.userId);
    if (!userId) { res.status(400).json({ error: "userId is required" }); return; }

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    await db.insert(projectMembersTable).values({ projectId, userId }).onConflictDoNothing();
    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to add project member" });
  }
});

router.delete("/projects/:id/members/:userId", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const projectId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    if (isNaN(projectId) || isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    await db
      .delete(projectMembersTable)
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to remove project member" });
  }
});

export default router;
