import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// CR035 — direct project (+ optional module) access assignment, replacing
// team-based project access. assignedBy/assignedAt are the audit trail this
// table never had before — who actually granted access and when, instead of
// the old team-assignment-or-bootstrap ambiguity.
//
// CR044 — module scope is now multi-valued: moduleIds null/empty means
// whole-project access, otherwise the grant covers exactly those modules
// (each must be associated with the project via project_modules first).
// Legacy single-value moduleId is kept only so pre-CR044 rows keep working
// without a data migration — readers fall back to it when moduleIds is null,
// and every new write clears it.
export const projectMembersTable = pgTable("project_members", {
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  moduleId: integer("module_id"),
  moduleIds: integer("module_ids").array(),
  assignedBy: integer("assigned_by"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
]);
