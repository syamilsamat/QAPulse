import { pgTable, integer, text, primaryKey } from "drizzle-orm/pg-core";

export const userTeamsTable = pgTable("user_teams", {
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("member"), // 'member' | 'lead'
}, (table) => [
  primaryKey({ columns: [table.teamId, table.userId] }),
]);
