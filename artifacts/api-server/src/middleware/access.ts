import { eq } from "drizzle-orm";
import {
  db,
  rolesTable,
  userTeamsTable,
  projectTeamsTable,
  projectMembersTable,
  teamsTable,
} from "@workspace/db";
import { verifyToken } from "../routes/auth";
import type { Request } from "express";

export interface AuthContext {
  userId: number;
  role: string;
}

export function getAuthContext(req: Request): AuthContext | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { id, role } = verifyToken(auth.slice(7));
    return { userId: id, role };
  } catch {
    return null;
  }
}

/**
 * Returns the set of project IDs this user can access, or null meaning
 * unrestricted (admin / cto). Falls back to null if the membership tables
 * haven't been created yet (bootstrap hasn't run), preserving pre-CR014
 * behaviour until the schema is ready.
 */
export async function scopeToUserProjects(userId: number, role: string): Promise<number[] | null> {
  if (role === "admin") return null;

  try {
    const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
    const tierRank = roleRow?.tierRank ?? 1;
    const department = roleRow?.department ?? null;

    // CTO tier — sees everything
    if (tierRank >= 5) return null;

    const ids = new Set<number>();

    if (tierRank >= 4 && department) {
      // HOD — all projects whose teams belong to their department
      const rows = await db
        .select({ projectId: projectTeamsTable.projectId })
        .from(projectTeamsTable)
        .innerJoin(teamsTable, eq(teamsTable.id, projectTeamsTable.teamId))
        .where(eq(teamsTable.department, department));
      for (const r of rows) ids.add(r.projectId);
    } else {
      // Lead / Member — check whether they belong to any team first
      const teamMemberships = await db
        .select({ teamId: userTeamsTable.teamId })
        .from(userTeamsTable)
        .where(eq(userTeamsTable.userId, userId));

      if (teamMemberships.length > 0) {
        // User is in teams → team-scoped access + any explicit individual overrides
        const teamRows = await db
          .select({ projectId: projectTeamsTable.projectId })
          .from(projectTeamsTable)
          .innerJoin(userTeamsTable, eq(userTeamsTable.teamId, projectTeamsTable.teamId))
          .where(eq(userTeamsTable.userId, userId));
        for (const r of teamRows) ids.add(r.projectId);

        // Explicit individual project_members (intentional overrides, not backfill)
        const direct = await db
          .select({ projectId: projectMembersTable.projectId })
          .from(projectMembersTable)
          .where(eq(projectMembersTable.userId, userId));
        for (const r of direct) ids.add(r.projectId);
      } else {
        // No team assignments yet — fall back to project_members (bootstrap backfill
        // gives everyone access to all projects until teams are configured).
        const direct = await db
          .select({ projectId: projectMembersTable.projectId })
          .from(projectMembersTable)
          .where(eq(projectMembersTable.userId, userId));
        for (const r of direct) ids.add(r.projectId);
      }
    }

    return Array.from(ids);
  } catch {
    // Tables not yet created (bootstrap pending) — fall back to unrestricted
    return null;
  }
}

export async function canAccessProject(userId: number, role: string, projectId: number): Promise<boolean> {
  const accessible = await scopeToUserProjects(userId, role);
  if (accessible === null) return true;
  return accessible.includes(projectId);
}

/**
 * Numeric tier for a role name — admin is treated as unrestricted (Infinity),
 * everything else is looked up from the roles table (Member=1, Lead=2,
 * Manager=3, HOD=4, CTO=5). Defaults to 1 if the role row/table isn't found.
 */
export async function getRoleTierRank(role: string): Promise<number> {
  if (role === "admin") return Infinity;
  try {
    const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
    return roleRow?.tierRank ?? 1;
  } catch {
    return 1;
  }
}
