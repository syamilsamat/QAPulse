import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  userTeamsTable,
  projectTeamsTable,
  projectMembersTable,
  projectModulesTable,
  executionModulesTable,
  usersTable,
  projectsTable,
  rolesTable,
} from "@workspace/db";
import { verifyToken } from "./auth";
import { getAuthContext, getRoleTierRank } from "../middleware/access";
import { logActivity } from "./_audit";

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

// CR035 — tier >= 3 (manager/HOD) or admin/cto. Used for both project-module
// association (any manager+ can decide a module applies to a project) and,
// with the extra target-tier check below, for assigning people.
async function requireManagerTier(req: any, res: any): Promise<{ userId: number; role: string } | null> {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const tier = await getRoleTierRank(ctx.role);
  if (tier < 3) { res.status(403).json({ error: "Manager role or above required" }); return null; }
  return ctx;
}

// Assigning (or revoking) a specific person's project access needs the
// extra same-department + tier >= target's tier check on top of
// requireManagerTier — a qa_manager can assign a qa_lead, but not a
// dev_lead (different department) or an hod_qa (higher tier).
// CR044 — normalize the request's module scope. Accepts the new
// moduleIds array, or the legacy single moduleId (seed scripts, old
// clients). Returns null for whole-project access, a deduped id array
// for a module-scoped grant, or undefined when the payload is malformed.
function parseModuleIds(body: any): number[] | null | undefined {
  if (Array.isArray(body?.moduleIds)) {
    const ids = [...new Set(body.moduleIds.map(Number))] as number[];
    if (ids.some((id) => !Number.isInteger(id))) return undefined;
    return ids.length > 0 ? ids : null;
  }
  if (body?.moduleIds != null) return undefined;
  if (body?.moduleId != null) {
    const id = Number(body.moduleId);
    return Number.isInteger(id) ? [id] : undefined;
  }
  return null;
}

async function modulesBelongToProject(projectId: number, moduleIds: number[]): Promise<boolean> {
  const assoc = await db.select({ moduleId: projectModulesTable.moduleId })
    .from(projectModulesTable)
    .where(and(eq(projectModulesTable.projectId, projectId), inArray(projectModulesTable.moduleId, moduleIds)));
  return assoc.length === moduleIds.length;
}

async function requireAssignerRights(req: any, res: any, targetUserId: number): Promise<{ userId: number; role: string } | null> {
  const ctx = await requireManagerTier(req, res);
  if (!ctx) return null;
  if (ctx.role === "admin" || ctx.role === "cto") return ctx;

  const [assignerRole, targetUser] = await Promise.all([
    db.select().from(rolesTable).where(eq(rolesTable.name, ctx.role)).then(r => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).then(r => r[0]),
  ]);
  if (!targetUser) { res.status(404).json({ error: "Target user not found" }); return null; }
  const [targetRole] = await db.select().from(rolesTable).where(eq(rolesTable.name, targetUser.role));

  const sameDept = assignerRole?.department && assignerRole.department === targetRole?.department;
  const tierOk = (assignerRole?.tierRank ?? 1) >= (targetRole?.tierRank ?? 1);
  if (!sameDept || !tierOk) {
    res.status(403).json({ error: "Can only assign people in your own department at or below your tier" });
    return null;
  }
  return ctx;
}

// ─── Teams CRUD ───────────────────────────────────────────────────────────────

router.get("/teams", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const teams = await db.select().from(teamsTable).orderBy(teamsTable.name);

    const memberRows = await db
      .select({ teamId: userTeamsTable.teamId, userId: userTeamsTable.userId, teamRole: userTeamsTable.role, name: usersTable.name })
      .from(userTeamsTable)
      .innerJoin(usersTable, eq(usersTable.id, userTeamsTable.userId));

    const projectRows = await db
      .select({ teamId: projectTeamsTable.teamId, projectId: projectTeamsTable.projectId, name: projectsTable.name })
      .from(projectTeamsTable)
      .innerJoin(projectsTable, eq(projectsTable.id, projectTeamsTable.projectId));

    const membersByTeam: Record<number, Array<{ id: number; name: string; teamRole: string }>> = {};
    for (const r of memberRows) {
      (membersByTeam[r.teamId] ??= []).push({ id: r.userId, name: r.name, teamRole: r.teamRole });
    }

    const projectsByTeam: Record<number, Array<{ id: number; name: string }>> = {};
    for (const r of projectRows) {
      (projectsByTeam[r.teamId] ??= []).push({ id: r.projectId, name: r.name });
    }

    res.json(teams.map((t) => ({
      ...t,
      memberCount: membersByTeam[t.id]?.length ?? 0,
      members: membersByTeam[t.id] ?? [],
      projects: projectsByTeam[t.id] ?? [],
    })));
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

// ─── Direct Project Members (CR035 — the real assignment mechanism) ──────────

router.get("/projects/:id/members", async (req, res): Promise<void> => {
  const ctx = await requireManagerTier(req, res);
  if (!ctx) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const rows = await db
      .select()
      .from(projectMembersTable)
      .where(eq(projectMembersTable.projectId, projectId));

    // CR044 — a row's module scope is moduleIds (array), falling back to the
    // legacy single moduleId for rows written before the multi-module change.
    const scopeIdsOf = (r: typeof rows[number]): number[] =>
      r.moduleIds ?? (r.moduleId != null ? [r.moduleId] : []);

    const userIds = [...new Set(rows.map(r => r.userId))];
    const moduleIds = [...new Set(rows.flatMap(scopeIdsOf))];
    const assignedByIds = [...new Set(rows.map(r => r.assignedBy).filter((id): id is number => id != null))];
    const [users, modules, assigners] = await Promise.all([
      userIds.length ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      moduleIds.length ? db.select().from(executionModulesTable).where(inArray(executionModulesTable.id, moduleIds)) : [],
      assignedByIds.length ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, assignedByIds)) : [],
    ]);
    const userById = new Map(users.map(u => [u.id, u]));
    const moduleById = new Map(modules.map(m => [m.id, m]));
    const assignerById = new Map(assigners.map(u => [u.id, u.name]));

    const members = rows.map(r => {
      const user = userById.get(r.userId);
      if (!user) return null;
      const scopeIds = scopeIdsOf(r);
      return {
        ...user,
        moduleIds: scopeIds,
        moduleNames: scopeIds.map(id => moduleById.get(id)?.name).filter((n): n is string => n != null),
        assignedBy: r.assignedBy,
        assignedByName: r.assignedBy != null ? (assignerById.get(r.assignedBy) ?? null) : null,
        assignedAt: r.assignedAt,
      };
    });
    res.json(members.filter(Boolean));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load project members" });
  }
});

router.post("/projects/:id/members", async (req, res): Promise<void> => {
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const userId = Number(req.body.userId);
    if (!userId) { res.status(400).json({ error: "userId is required" }); return; }
    const moduleIds = parseModuleIds(req.body);
    if (moduleIds === undefined) { res.status(400).json({ error: "moduleIds must be an array of module IDs" }); return; }

    const ctx = await requireAssignerRights(req, res, userId);
    if (!ctx) return;

    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    if (moduleIds !== null && !(await modulesBelongToProject(projectId, moduleIds))) {
      res.status(400).json({ error: "One or more modules aren't associated with this project yet" }); return;
    }

    await db.insert(projectMembersTable)
      .values({ projectId, userId, moduleIds, moduleId: null, assignedBy: ctx.userId, assignedAt: new Date() })
      .onConflictDoUpdate({ target: [projectMembersTable.projectId, projectMembersTable.userId], set: { moduleIds, moduleId: null, assignedBy: ctx.userId, assignedAt: new Date() } });

    await logActivity({
      type: "project_member_assigned",
      description: `Assigned to project #${projectId}${moduleIds !== null ? ` (${moduleIds.length} module${moduleIds.length === 1 ? "" : "s"})` : " (whole project)"}`,
      userId: ctx.userId, entityId: userId, entityType: "project_member",
    });
    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to add project member" });
  }
});

router.patch("/projects/:id/members/:userId", async (req, res): Promise<void> => {
  try {
    const projectId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    if (isNaN(projectId) || isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }
    const moduleIds = parseModuleIds(req.body);
    if (moduleIds === undefined) { res.status(400).json({ error: "moduleIds must be an array of module IDs" }); return; }

    const ctx = await requireAssignerRights(req, res, userId);
    if (!ctx) return;

    if (moduleIds !== null && !(await modulesBelongToProject(projectId, moduleIds))) {
      res.status(400).json({ error: "One or more modules aren't associated with this project yet" }); return;
    }

    await db.update(projectMembersTable)
      .set({ moduleIds, moduleId: null, assignedBy: ctx.userId, assignedAt: new Date() })
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));

    await logActivity({
      type: "project_member_updated",
      description: `Project #${projectId} assignment updated${moduleIds !== null ? ` (${moduleIds.length} module${moduleIds.length === 1 ? "" : "s"})` : " (whole project)"}`,
      userId: ctx.userId, entityId: userId, entityType: "project_member",
    });
    res.sendStatus(200);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update project member" });
  }
});

router.delete("/projects/:id/members/:userId", async (req, res): Promise<void> => {
  try {
    const projectId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    if (isNaN(projectId) || isNaN(userId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const ctx = await requireAssignerRights(req, res, userId);
    if (!ctx) return;

    await db
      .delete(projectMembersTable)
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));

    await logActivity({
      type: "project_member_removed",
      description: `Removed from project #${projectId}`,
      userId: ctx.userId, entityId: userId, entityType: "project_member",
    });
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to remove project member" });
  }
});

// ─── Project Modules (CR035 — which global modules apply to this project) ────

router.get("/projects/:id/modules", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }

    const rows = await db.select({ moduleId: projectModulesTable.moduleId }).from(projectModulesTable).where(eq(projectModulesTable.projectId, projectId));
    const moduleIds = rows.map(r => r.moduleId);
    const modules = moduleIds.length ? await db.select().from(executionModulesTable) : [];
    res.json(modules.filter(m => moduleIds.includes(m.id)));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load project modules" });
  }
});

router.post("/projects/:id/modules", async (req, res): Promise<void> => {
  const ctx = await requireManagerTier(req, res);
  if (!ctx) return;
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid project ID" }); return; }
    const moduleId = Number(req.body.moduleId);
    if (!moduleId) { res.status(400).json({ error: "moduleId is required" }); return; }

    const [mod] = await db.select().from(executionModulesTable).where(eq(executionModulesTable.id, moduleId));
    if (!mod) { res.status(404).json({ error: "Module not found" }); return; }

    await db.insert(projectModulesTable).values({ projectId, moduleId }).onConflictDoNothing();
    res.sendStatus(201);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to associate module with project" });
  }
});

router.delete("/projects/:id/modules/:moduleId", async (req, res): Promise<void> => {
  const ctx = await requireManagerTier(req, res);
  if (!ctx) return;
  try {
    const projectId = parseInt(req.params.id);
    const moduleId = parseInt(req.params.moduleId);
    if (isNaN(projectId) || isNaN(moduleId)) { res.status(400).json({ error: "Invalid ID" }); return; }

    await db.delete(projectModulesTable).where(and(eq(projectModulesTable.projectId, projectId), eq(projectModulesTable.moduleId, moduleId)));
    // Any existing assignments scoped to this module on this project drop it from
    // their scope rather than being silently orphaned/invalid — a grant left with
    // no modules falls back to whole-project, same as the pre-CR044 behavior.
    await db.update(projectMembersTable).set({ moduleId: null }).where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.moduleId, moduleId)));
    await db.update(projectMembersTable)
      .set({ moduleIds: sql`NULLIF(array_remove(${projectMembersTable.moduleIds}, ${moduleId}), '{}')` })
      .where(and(
        eq(projectMembersTable.projectId, projectId),
        sql`${projectMembersTable.moduleIds} @> ARRAY[${moduleId}]::integer[]`,
      ));
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to remove module from project" });
  }
});

export default router;
