import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // REMOVED: type
  priority: text("priority").notNull().default("Medium"),
  redmineId: text("redmine_id"),
  requirementId: integer("requirement_id"),
  testCaseId: integer("test_case_id"),
  projectId: integer("project_id"),
  moduleId: integer("module_id"),
  moduleIds: text("module_ids"),                        // Comma-separated module IDs for multi-select
  environmentIds: integer("environment_ids").array(), // Multi-select Environments
  assigneeIds: integer("assignee_ids").array(),       // Multi-select QA PICs
  startDate: text("start_date"),                      // Planned Start Date
  dueDate: text("due_date"),                          // Planned End Date
  actualStartDate: text("actual_start_date"),         // NEW
  actualEndDate: text("actual_end_date"),             // NEW
  status: text("status").notNull().default("uat"),
  estimatedHours: real("estimated_hours"),
  actualHours: real("actual_hours"),
  completionPercentage: integer("completion_percentage").default(0),
  tracker: text("tracker"),
  notes: text("notes"),
  // CR023p4 — requirement-change re-review flow
  requirementRevisedAt: timestamp("requirement_revised_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const taskEventsTable = pgTable("task_events", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  severity: text("severity").notNull().default("medium"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskEventSchema = createInsertSchema(taskEventsTable).omit({ id: true, createdAt: true });
export type InsertTaskEvent = z.infer<typeof insertTaskEventSchema>;
export type TaskEvent = typeof taskEventsTable.$inferSelect;

