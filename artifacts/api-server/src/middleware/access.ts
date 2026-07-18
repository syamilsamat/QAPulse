import { and, eq, inArray } from "drizzle-orm";
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
 * assignments. Manager tier and above get department-wide reach (CR038 —
 * previously HOD-only; the gap where qa_manager didn't have functionally
 * broader visibility than qa_lead, called out at CR014, is closed here),
 * computed from whoever in their department has a real direct assignment —
 * safe to do now that the table isn't universally noisy anymore.
 */
export async function scopeToUserProjects(userId: number, role: string): Promise<number[] | null> {
  if (role === "admin") return null;

  try {
    const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
    const tierRank = roleRow?.tierRank ?? 1;
    const department = roleRow?.department ?? null;
    console.log(`[TEMPDEBUG scopeToUserProjects] userId=${userId} role=${role} roleRowFound=${!!roleRow} tierRank=${tierRank} department=${department}`);

    // CTO tier — sees everything
    if (tierRank >= 5) return null;

    if (tierRank >= 3 && department) {
      // Manager tier and above — every project with at least one direct
      // assignment for someone in their department (not "their own"
      // assignments only).
      const rows = await db
        .select({ projectId: projectMembersTable.projectId })
        .from(projectMembersTable)
        .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
        .innerJoin(rolesTable, eq(rolesTable.name, usersTable.role))
        .where(eq(rolesTable.department, department));
      const result = [...new Set(rows.map(r => r.projectId))];
      console.log(`[TEMPDEBUG scopeToUserProjects] department-wide branch result=${JSON.stringify(result)}`);
      return result;
    }

    // Member / Lead / Manager — only their own direct assignments.
    const direct = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(eq(projectMembersTable.userId, userId));
    const result = [...new Set(direct.map(r => r.projectId))];
    console.log(`[TEMPDEBUG scopeToUserProjects] direct branch userId=${userId} result=${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    // Tables not yet created (bootstrap pending) — fall back to unrestricted
    console.log(`[TEMPDEBUG scopeToUserProjects] CAUGHT ERROR, falling back to unrestricted: ${(err as any)?.message ?? err}`);
    return null;
  }
}

export async function canAccessProject(userId: number, role: string, projectId: number): Promise<boolean> {
  const accessible = await scopeToUserProjects(userId, role);
  console.log(`[TEMPDEBUG canAccessProject] userId=${userId} role=${role} projectId=${projectId} (type=${typeof projectId}) accessible=${JSON.stringify(accessible)}`);
  if (accessible === null) return true;
  return accessible.includes(projectId);
}

export interface ModuleScope {
  restricted: boolean;
  moduleNames: string[];
}

/**
 * CR035 — resolves a user's module scope for a project in one lookup, for
 * endpoints that need to filter a whole list of records in memory (the
 * common case — module-scope filtering happens after the project-level
 * fetch, same pattern as every other batch-then-filter endpoint in this
 * codebase). restricted: false means "no module filter" — either the user
 * has whole-project access, or their tier is high enough to bypass module
 * scoping entirely (Manager+/HOD+/admin/cto — CR038 lowered this from
 * HOD-only to match scopeToUserProjects' tier-3 threshold, so a manager
 * with department-wide project reach isn't still module-restricted within
 * an individual project they were previously given a narrower assignment
 * on).
 *
 * CR044 — a grant can now cover several modules (moduleIds array); legacy
 * single-moduleId rows are read as a one-element list so pre-CR044 grants
 * keep working without a data migration.
 */
export async function getModuleScope(userId: number, role: string, projectId: number): Promise<ModuleScope> {
  if (role === "admin") return { restricted: false, moduleNames: [] };

  const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
  const tierRank = roleRow?.tierRank ?? 1;
  if (tierRank >= 3) return { restricted: false, moduleNames: [] };

  const [assignment] = await db
    .select({ moduleId: projectMembersTable.moduleId, moduleIds: projectMembersTable.moduleIds })
    .from(projectMembersTable)
    .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, userId)));
  if (!assignment) return { restricted: false, moduleNames: [] };

  const ids = assignment.moduleIds ?? (assignment.moduleId != null ? [assignment.moduleId] : []);
  if (ids.length === 0) return { restricted: false, moduleNames: [] };

  const mods = await db.select({ name: executionModulesTable.name }).from(executionModulesTable).where(inArray(executionModulesTable.id, ids));
  return { restricted: true, moduleNames: mods.map(m => m.name) };
}

/** Single-record convenience wrapper over getModuleScope — prefer
 *  getModuleScope directly when filtering a list (one lookup, not N). */
export async function canAccessModule(userId: number, role: string, projectId: number, recordModule: string | null): Promise<boolean> {
  const scope = await getModuleScope(userId, role, projectId);
  if (!scope.restricted) return true;
  return recordModule != null && scope.moduleNames.includes(recordModule);
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
