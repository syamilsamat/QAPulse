import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("cr"), // 'cr' | 'phase' | 'sprint' | 'release'
  status: text("status").notNull().default("planned"), // 'planned' | 'active' | 'completed' | 'cancelled'
  targetDate: timestamp("target_date", { withTimezone: true }),
  // CR023p1.2 — needed to notify the milestone's PM on a linked requirement's rejection
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Milestone = typeof milestonesTable.$inferSelect;
export type InsertMilestone = typeof milestonesTable.$inferInsert;
