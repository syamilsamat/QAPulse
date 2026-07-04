import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";

export const projectMembersTable = pgTable("project_members", {
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] }),
]);
