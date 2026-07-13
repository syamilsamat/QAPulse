import { pgTable, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

// CR035 — direct project (+ optional module) access assignment, replacing
// team-based project access. moduleId null = whole-project access; a set
// moduleId scopes the grant to just that module (must be associated with
// the project via project_modules first). assignedBy/assignedAt are the
// audit trail this table never had before — who actually granted access
// and when, instead of the old team-assignment-or-bootstrap ambiguity.
export const projectMembersTable = pgTable("project_members", {
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  moduleId: integer("module_id"),
  assignedBy: integer("assigned_by"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
]);
