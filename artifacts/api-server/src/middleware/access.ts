import { and, eq } from "drizzle-orm";
import {
  db,
  rolesTable,
  usersTable,
  projectMembersTable,
  executionModulesTable,
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
 *
 * CR035 — team-based project access (project_teams) is no longer consulted
 * here at all; project_members is the sole source of truth, and (since the
 * old cross-join backfill was removed) it now only ever holds real, explicit
 * assignments. HOD tier still gets department-wide reach, computed from
 * whoever in their department has a real direct assignment — safe to do now
 * that the table isn't universally noisy anymore.
 */
export async function scopeToUserProjects(userId: number, role: string): Promise<number[] | null> {
  if (role === "admin") return null;

  try {
    const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
    const tierRank = roleRow?.tierRank ?? 1;
    const department = roleRow?.department ?? null;

    // CTO tier — sees everything
    if (tierRank >= 5) return null;

    if (tierRank >= 4 && department) {
      // HOD — every project with at least one direct assignment for
      // someone in their department (not "their own" assignments only).
      const rows = await db
        .select({ projectId: projectMembersTable.projectId })
        .from(projectMembersTable)
        .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
        .innerJoin(rolesTable, eq(rolesTable.name, usersTable.role))
        .where(eq(rolesTable.department, department));
      return [...new Set(rows.map(r => r.projectId))];
    }

    // Member / Lead / Manager — only their own direct assignments.
    const direct = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(eq(projectMembersTable.userId, userId));
    return [...new Set(direct.map(r => r.projectId))];
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

export interface ModuleScope {
  restricted: boolean;
  moduleName: string | null;
}

/**
 * CR035 — resolves a user's module scope for a project in one lookup, for
 * endpoints that need to filter a whole list of records in memory (the
 * common case — module-scope filtering happens after the project-level
 * fetch, same pattern as every other batch-then-filter endpoint in this
 * codebase). restricted: false means "no module filter" — either the user
 * has whole-project access, or their tier is high enough to bypass module
 * scoping entirely (HOD+/admin/cto).
 */
export async function getModuleScope(userId: number, role: string, projectId: number): Promise<ModuleScope> {
  if (role === "admin") return { restricted: false, moduleName: null };

  const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
  const tierRank = roleRow?.tierRank ?? 1;
  if (tierRank >= 4) return { restricted: false, moduleName: null };

  const [assignment] = await db
    .select({ moduleId: projectMembersTable.moduleId })
    .from(projectMembersTable)
    .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));
  if (!assignment || assignment.moduleId == null) return { restricted: false, moduleName: null };

  const [mod] = await db.select({ name: executionModulesTable.name }).from(executionModulesTable).where(eq(executionModulesTable.id, assignment.moduleId));
  return { restricted: true, moduleName: mod?.name ?? null };
}

/** Single-record convenience wrapper over getModuleScope — prefer
 *  getModuleScope directly when filtering a list (one lookup, not N). */
export async function canAccessModule(userId: number, role: string, projectId: number, recordModule: string | null): Promise<boolean> {
  const scope = await getModuleScope(userId, role, projectId);
  if (!scope.restricted) return true;
  return recordModule === scope.moduleName;
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
