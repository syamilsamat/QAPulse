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
  // QA Pipeline — per-department owners assigned up front in Step 2.
  //
  // The Tasks board normally *derives* FA/Dev/QA names from workflow events
  // (author + approver, the dev-handoff assignee, the execution file's QA PIC),
  // which only fill in as the work progresses. A pipeline milestone names its
  // people at the start instead, so for requirements in a pipeline milestone
  // these explicit values take precedence on the board.
  //
  // Arrays because more than one person per department is normal — two testers
  // splitting a requirement, a dev pair, an FA plus a reviewer. Same
  // `integer(...).array()` shape as tasksTable.assigneeIds.
  //
  // Deliberately separate from devAssigneeId (CR030 dev handoff): writing that
  // column would half-enter its state machine (devStatus/devAssignedAt) and
  // requires FA approval first, which a freshly-synced requirement doesn't
  // have. These are plain labels of accountability, no workflow attached.
  pipelineFaIds: integer("pipeline_fa_ids").array(),
  pipelineDevIds: integer("pipeline_dev_ids").array(),
  pipelineQaIds: integer("pipeline_qa_ids").array(),
  // Superseded by the *_ids arrays above; nothing reads these any more.
  // Still declared so `drizzle-kit push` — which runs non-interactively under
  // `set -e` in scripts/post-merge.sh — never tries to drop a column and stall
  // the deploy on a confirmation prompt. Safe to delete once you're ready to
  // run the drop by hand (see the note in roles.ts bootstrap).
  pipelineFaId: integer("pipeline_fa_id"),
  pipelineDevId: integer("pipeline_dev_id"),
  pipelineQaId: integer("pipeline_qa_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRequirementSchema = createInsertSchema(requirementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRequirement = z.infer<typeof insertRequirementSchema>;
export type Requirement = typeof requirementsTable.$inferSelect;

// CR068 — a lightweight, editable event log on a requirement (Blocker, Server
// down, Automation unavailable, or a custom label), distinct from the CR063
// isBlocked/blockedReason flag: that's a single current-state gate that
// freezes dev/QA actions, this is just an informational, date-ranged record
// (open-ended until endDate is set) any user with access to the requirement
// can log and later close out. Replaces the old ad-hoc taskEventsTable
// (lib/db/src/schema/tasks.ts) as what the Tasks/History Trail pages surface,
// since that table is hard-FK'd to the now-frozen ad-hoc tasksTable and can't
// attach to a requirement.
export const requirementEventsTable = pgTable("requirement_events", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  type: text("type").notNull(), // e.g. "Blocker" | "Server down" | "Automation unavailable" | custom text
  description: text("description"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RequirementEvent = typeof requirementEventsTable.$inferSelect;