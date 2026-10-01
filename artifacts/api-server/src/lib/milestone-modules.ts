import { eq, inArray } from "drizzle-orm";
import { db, milestoneModulesTable, projectModulesTable, executionModulesTable } from "@workspace/db";

export type MilestoneModuleRef = { id: number; name: string };

// A milestone with no rows covers the whole project (see the schema note),
// so an empty list means "all modules", not "none".
export async function loadMilestoneModules(milestoneIds: number[]): Promise<Map<number, MilestoneModuleRef[]>> {
  const out = new Map<number, MilestoneModuleRef[]>();
  if (milestoneIds.length === 0) return out;
  const rows = await db
    .select({ milestoneId: milestoneModulesTable.milestoneId, id: executionModulesTable.id, name: executionModulesTable.name })
    .from(milestoneModulesTable)
    .innerJoin(executionModulesTable, eq(executionModulesTable.id, milestoneModulesTable.moduleId))
    .where(inArray(milestoneModulesTable.milestoneId, milestoneIds));
  for (const r of rows) {
    const list = out.get(r.milestoneId) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.milestoneId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export function parseModuleIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  return [...new Set(ids)];
}

// Checks a requested module selection against the project's module catalog.
// Returns an error message, or null when the selection is acceptable. A
// project with no modules associated can't be scoped, so an empty selection
// is fine there; otherwise a non-data-prep milestone must pick at least one
// module or explicitly choose "all modules" (allModules).
export async function validateMilestoneModules(opts: {
  projectId: number;
  type: string;
  moduleIds: number[];
  allModules: boolean;
}): Promise<string | null> {
  const { projectId, type, moduleIds, allModules } = opts;
  const assoc = await db
    .select({ moduleId: projectModulesTable.moduleId })
    .from(projectModulesTable)
    .where(eq(projectModulesTable.projectId, projectId));
  const allowed = new Set(assoc.map((a) => a.moduleId));
  if (moduleIds.some((id) => !allowed.has(id))) {
    return "One or more modules do not belong to this project";
  }
  if (moduleIds.length === 0 && allowed.size > 0 && type !== "data_prep" && !allModules) {
    return "Select at least one module, or choose All modules";
  }
  return null;
}

export async function setMilestoneModules(milestoneId: number, moduleIds: number[]): Promise<void> {
  await db.delete(milestoneModulesTable).where(eq(milestoneModulesTable.milestoneId, milestoneId));
  if (moduleIds.length > 0) {
    await db.insert(milestoneModulesTable).values(moduleIds.map((moduleId) => ({ milestoneId, moduleId })));
  }
}

// Requirements store module as a comma-joined name list ("A,B"). Returns a
// human-readable warning when any of those names fall outside the milestone's
// module set, or null when in scope / the milestone covers the whole project.
export async function moduleScopeWarning(milestoneId: number | null | undefined, moduleCsv: string | null | undefined): Promise<string | null> {
  if (!milestoneId || !moduleCsv) return null;
  const scope = (await loadMilestoneModules([milestoneId])).get(milestoneId);
  if (!scope || scope.length === 0) return null;
  const allowed = new Set(scope.map((m) => m.name));
  const outside = moduleCsv.split(",").map((s) => s.trim()).filter((n) => n && !allowed.has(n));
  if (outside.length === 0) return null;
  return `Module ${outside.join(", ")} is outside this milestone's modules (${scope.map((m) => m.name).join(", ")})`;
}
