import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// CR019: native defect records. QAPulse is the front door for QA defects
// (write-through to Redmine, which stays the system of record for lifecycle);
// production defects are pulled in from the Redmine incident tracker (CR020).
// All Redmine-specific sync code lives in redmine-defect-bridge.ts only.
export const defectsTable = pgTable(
  "defects",
  {
    id: serial("id").primaryKey(),
    defectCode: text("defect_code"), // DEF-0001 / DEF-P0001, filled right after insert
    title: text("title").notNull(),
    description: text("description"),
    stepsToReproduce: text("steps_to_reproduce"),
    expectedResult: text("expected_result"),
    actualResult: text("actual_result"),
    severity: text("severity").notNull().default("medium"), // critical | high | medium | low
    // Lifecycle status — cached read-only from Redmine until CR021 cutover
    status: text("status").notNull().default("New"),
    module: text("module"),
    projectId: integer("project_id"),
    reporterId: integer("reporter_id"),
    assigneeName: text("assignee_name"), // cached from Redmine
    redmineId: text("redmine_id"), // legacy id after CR021 cutover
    syncStatus: text("sync_status").notNull().default("pending"), // pending | synced | error
    syncError: text("sync_error"),
    source: text("source").notNull().default("qa"), // qa | production
    foundIn: text("found_in").notNull().default("SIT"), // SIT | UAT | Production
    // Actual Redmine tracker name — "other" trackers land in the QA list for
    // now but keep their real tracker recorded (Sync from Redmine dialog)
    tracker: text("tracker"),
    // CR020 escape review (production defects only)
    escapeStatus: text("escape_status").notNull().default("pending"), // pending | analyzing | closed
    escapeClass: text("escape_class"), // coverage_gap | selection_gap | passed_wrongly
    escapeNotes: text("escape_notes"),
    statusSyncedAt: timestamp("status_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("defects_source_idx").on(t.source),
    index("defects_redmine_id_idx").on(t.redmineId),
    index("defects_project_idx").on(t.projectId),
  ],
);

// A defect can link to an execution row (QA defects), and later to the
// library TC / requirement (production escapes + regression backfill).
export const defectLinksTable = pgTable(
  "defect_links",
  {
    id: serial("id").primaryKey(),
    defectId: integer("defect_id")
      .references(() => defectsTable.id, { onDelete: "cascade" })
      .notNull(),
    executionTcId: integer("execution_tc_id"),
    testCaseId: integer("test_case_id"),
    requirementId: integer("requirement_id"),
    linkType: text("link_type").notNull().default("found_by"), // found_by | regression_tc | requirement
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("defect_links_defect_idx").on(t.defectId)],
);

export const insertDefectSchema = createInsertSchema(defectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDefect = z.infer<typeof insertDefectSchema>;
export type Defect = typeof defectsTable.$inferSelect;
export type DefectLink = typeof defectLinksTable.$inferSelect;
