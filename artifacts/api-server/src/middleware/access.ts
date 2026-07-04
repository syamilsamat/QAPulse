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
      // Lead / Member — only projects in their teams
      const rows = await db
        .select({ projectId: projectTeamsTable.projectId })
        .from(projectTeamsTable)
        .innerJoin(userTeamsTable, eq(userTeamsTable.teamId, projectTeamsTable.teamId))
        .where(eq(userTeamsTable.userId, userId));
      for (const r of rows) ids.add(r.projectId);
    }

    // Direct project_members escape hatch
    const direct = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(eq(projectMembersTable.userId, userId));
    for (const r of direct) ids.add(r.projectId);

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
