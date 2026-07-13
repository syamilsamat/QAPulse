import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";

// CR035 — many-to-many: which of the global execution_modules catalog
// entries apply to which project. A module can belong to more than one
// project (e.g. "Authentication" is relevant to both a customer portal and
// a banking app) — this is purely the association layer; execution_modules
// itself stays the flat catalog of module names it already was.
export const projectModulesTable = pgTable("project_modules", {
  projectId: integer("project_id").notNull(),
  moduleId: integer("module_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.moduleId] }),
]);
