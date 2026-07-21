import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("cr"), // 'cr' | 'phase' | 'sprint' | 'release'
  status: text("status").notNull().default("planned"), // 'planned' | 'active' | 'completed' | 'cancelled'
  // CR060 — PM-set urgency for the whole milestone (Low/Medium/High/Critical),
  // distinct from an individual requirement's own priority field.
  priority: text("priority"),
  targetDate: timestamp("target_date", { withTimezone: true }),
  startDate: timestamp("start_date", { withTimezone: true }),
  reqTargetDate: timestamp("req_target_date", { withTimezone: true }),
  devTargetDate: timestamp("dev_target_date", { withTimezone: true }),
  qaTargetDate: timestamp("qa_target_date", { withTimezone: true }),
  uatTargetDate: timestamp("uat_target_date", { withTimezone: true }),
  // Planned go-live (deployment) date — the last phase marker, set by the
  // PM. Plan-only: there is no activity-log event stream behind it, so it
  // renders as a target pill/marker, not a measured actual-duration phase.
  goLiveDate: timestamp("go_live_date", { withTimezone: true }),
  // Test environment this milestone runs in ('ENV1'…'ENV6'), set by the PM.
  environment: text("environment"),
  // CR023p1.2 — needed to notify the milestone's PM on a linked requirement's rejection
  createdBy: integer("created_by"),
  // Auto-stamped when status transitions to 'completed' (and cleared if it
  // moves away again) — authoritative end-of-QA-phase boundary for the PM
  // Dashboard's phase-breakdown report, instead of approximating from the
  // last execution result timestamp.
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // CR033 — retrospective fields, filled in on/after the 'completed' transition
  lessonsLearned: text("lessons_learned"),
  // CR057 follow-up — matches the "Lessons Learnt Type" dropdown in
  // Bestinet's official export template exactly: 'what_went_wrong' |
  // 'what_went_right' | 'best_practice'. Null when not yet classified.
  lessonsLearnedType: text("lessons_learned_type"),
  closedBy: integer("closed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Milestone = typeof milestonesTable.$inferSelect;
export type InsertMilestone = typeof milestonesTable.$inferInsert;

// CR054p2 — formal milestone staffing (e.g. QA lead assigns testers to a
// milestone), distinct from project membership which governs access.
export const milestoneAssigneesTable = pgTable("milestone_assignees", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id").notNull(),
  userId: integer("user_id").notNull(),
  assignedBy: integer("assigned_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// CR054p3 — UAT sign-off documents. File bytes stored base64 in-row: sign-off
// packs are small (a few MB) and this keeps backup/restore trivial; revisit
// only if volume grows.
export const uatSignoffsTable = pgTable("uat_signoffs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  milestoneId: integer("milestone_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  note: text("note"),
  dataBase64: text("data_base64").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MilestoneAssignee = typeof milestoneAssigneesTable.$inferSelect;
export type UatSignoff = typeof uatSignoffsTable.$inferSelect;
