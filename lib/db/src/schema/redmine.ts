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

export const redmineGlobalConfigTable = pgTable("redmine_global_config", {
  id: serial("id").primaryKey(),
  complexityFieldId: integer("complexity_field_id"),
  targetedStartDateFieldId: integer("targeted_start_date_field_id"),
  targetedCompletionDateFieldId: integer("targeted_completion_date_field_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CR019 status write-through: the full Redmine status list, synced locally so
// QAPulse can offer status editing (pushed back to Redmine on save).
export const redmineStatusesTable = pgTable("redmine_statuses", {
  id: serial("id").primaryKey(),
  redmineId: integer("redmine_id").notNull().unique(),
  name: text("name").notNull(),
  isClosed: integer("is_closed").notNull().default(0), // 0 | 1 (Redmine is_closed flag)
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export type RedmineStatus = typeof redmineStatusesTable.$inferSelect;
export type RedmineProject = typeof redmineProjectsTable.$inferSelect;
export type RedmineProjectConfig = typeof redmineProjectConfigsTable.$inferSelect;
export type RedmineGlobalConfig = typeof redmineGlobalConfigTable.$inferSelect;
