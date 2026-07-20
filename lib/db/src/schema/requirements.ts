import { pgTable, text, varchar, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  tracker: varchar("tracker", { length: 255 }),
  parentId: integer("parent_id"),
  redmineCreatedAt: timestamp("redmine_created_at", { withTimezone: true }),
  // CR014p2 — milestone scoping
  milestoneId: integer("milestone_id"),
  // CR022p1 — structured acceptance criteria (JSON array of strings)
  acceptanceCriteria: text("acceptance_criteria"),
  // CR014p4 — FA review workflow
  reviewStatus: text("review_status").notNull().default("draft"), // 'draft' | 'in_review' | 'approved' | 'rejected'
  createdBy: integer("created_by"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: integer("rejected_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  // CR030 — dev handoff. Only meaningful once reviewStatus = 'approved'; null
  // means dev work hasn't started. Terminal state is 'ready_for_qa' — QA
  // picking it back up for execution is tracked by the existing execution
  // tables, not a further dev-side state.
  devStatus: text("dev_status"), // 'assigned' | 'in_progress' | 'ready_for_qa' | null
  devAssigneeId: integer("dev_assignee_id"),
  devAssignedAt: timestamp("dev_assigned_at", { withTimezone: true }),
  devAssignedBy: integer("dev_assigned_by"),
  readyForQaAt: timestamp("ready_for_qa_at", { withTimezone: true }),
  // CR063 — FA/PM can flag a requirement as blocked (e.g. needs more time,
  // should be excluded from the current release) with a mandatory reason.
  // While blocked, dev-handoff actions (PATCH /requirements/:id/dev) are
  // frozen — this is deliberately a separate overlay flag, not a devStatus/
  // reviewStatus value, so unblocking resumes exactly wherever the
  // requirement already was (in development, in testing, etc.) with no
  // extra step to "restore" a phase.
  isBlocked: boolean("is_blocked").notNull().default(false),
  blockedReason: text("blocked_reason"),
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockedBy: integer("blocked_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRequirementSchema = createInsertSchema(requirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirementsTable.$inferSelect;