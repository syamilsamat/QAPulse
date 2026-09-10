import { db, usersTable, projectsTable, milestonesTable } from "@workspace/db";
import { cachedForRequest } from "../middleware/request-cache";

/**
 * id → display-name maps for the three small reference tables that list
 * formatters keep resolving one row at a time.
 *
 * Before this, `formatRequirement` issued up to six single-row lookups per
 * requirement (assignee, dev assignee, blocker, pipeline owners, project,
 * milestone) and the list endpoint ran it over every row — several thousand
 * queries for one page. Loading the three tables whole is three queries for
 * the entire request no matter how many rows are formatted; users, projects
 * and milestones are all small enough that this is strictly cheaper past
 * even a handful of rows.
 *
 * Memoised per request, so a single-record endpoint pays for it once too and
 * a formatter can call it freely without threading a context argument
 * through every call site.
 */
export interface NameDirectory {
  userName(id: number | null | undefined): string | null;
  projectName(id: number | null | undefined): string | null;
  milestoneName(id: number | null | undefined): string | null;
}

export function getNameDirectory(): Promise<NameDirectory> {
  return cachedForRequest("name-directory", async () => {
    const [users, projects, milestones] = await Promise.all([
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
      db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable),
      db.select({ id: milestonesTable.id, name: milestonesTable.name }).from(milestonesTable),
    ]);

    const userById = new Map(users.map((u) => [u.id, u.name]));
    const projectById = new Map(projects.map((p) => [p.id, p.name]));
    const milestoneById = new Map(milestones.map((m) => [m.id, m.name]));

    // Deleted rows resolve to null, matching what the old per-row lookups
    // returned when the referenced record was gone.
    return {
      userName: (id) => (id == null ? null : userById.get(id) ?? null),
      projectName: (id) => (id == null ? null : projectById.get(id) ?? null),
      milestoneName: (id) => (id == null ? null : milestoneById.get(id) ?? null),
    };
  });
}
