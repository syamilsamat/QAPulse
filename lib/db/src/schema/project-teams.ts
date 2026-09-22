import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";

export const projectTeamsTable = pgTable("project_teams", {
  projectId: integer("project_id").notNull(),
  teamId: integer("team_id").notNull(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.teamId] }),
]);
