import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const redmineProjectsTable = pgTable("redmine_projects", {
  id: serial("id").primaryKey(),
  redmineId: integer("redmine_id").notNull().unique(),
  name: text("name").notNull(),
  identifier: text("identifier").notNull(),
  description: text("description"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const redmineProjectConfigsTable = pgTable("redmine_project_configs", {
  id: serial("id").primaryKey(),
  redmineProjectId: integer("redmine_project_id")
    .references(() => redmineProjectsTable.redmineId, { onDelete: "cascade" })
    .notNull()
    .unique(),
  complexityFieldId: integer("complexity_field_id"),
  targetedStartDateFieldId: integer("targeted_start_date_field_id"),
  targetedCompletionDateFieldId: integer("targeted_completion_date_field_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RedmineProject = typeof redmineProjectsTable.$inferSelect;
export type RedmineProjectConfig = typeof redmineProjectConfigsTable.$inferSelect;
