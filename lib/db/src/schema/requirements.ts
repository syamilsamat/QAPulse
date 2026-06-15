// 1. Add 'varchar' to your imports here
import { pgTable, text, varchar, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const requirementsTable = pgTable("requirements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  module: text("module"),
  projectId: integer("project_id"),
  priority: text("priority").notNull().default("medium"),
  release: text("release"),
  assigneeId: integer("assignee_id"),
  redmineTicketId: text("redmine_ticket_id"),
  status: text("status").notNull().default("open"),
  tracker: varchar("tracker", { length: 255 }), // This will now work!
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRequirementSchema = createInsertSchema(requirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirementsTable.$inferSelect;