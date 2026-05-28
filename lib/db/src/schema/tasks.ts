import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("test_case_creation"),
  requirementId: integer("requirement_id"),
  testCaseId: integer("test_case_id"),
  projectId: integer("project_id"),
  assigneeId: integer("assignee_id"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("new"),
  estimatedHours: real("estimated_hours"),
  actualHours: real("actual_hours"),
  completionPercentage: integer("completion_percentage").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
