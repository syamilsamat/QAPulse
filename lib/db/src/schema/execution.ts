import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// 1. Reusable Modules Table
export const executionModulesTable = pgTable("execution_modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 2. Parent Execution Files Table (1 per Redmine Ticket)
export const executionFilesTable = pgTable("execution_files", {
  id: serial("id").primaryKey(),
  redmineTicketId: text("redmine_ticket_id").notNull().unique(),
  title: text("title"),
  qaPic: text("qa_pic"),
  qaPicSetBy: integer("qa_pic_set_by"),
  remarks: text("remarks"),
  selectedModules: text("selected_modules"),
  tracker: text("tracker"),
  projectId: integer("project_id"),
  requirementId: integer("requirement_id"),
  // CR014p2 / CR022p3 — milestone linkage and file type
  milestoneId: integer("milestone_id"),
  fileType: text("file_type").notNull().default("qa"), // 'qa' | 'uat'
  reviewStatus: text("review_status").notNull().default("draft"), // 'draft' | 'in_review' | 'approved' | 'rejected'
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: integer("rejected_by"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // Every list/dashboard endpoint scopes files by project or milestone before
  // doing anything else; without these both were sequential scans.
  index("execution_files_project_idx").on(t.projectId),
  index("execution_files_milestone_idx").on(t.milestoneId),
  // rollupExecutionByMilestone() filters on the pair, not either alone.
  index("execution_files_milestone_type_idx").on(t.milestoneId, t.fileType),
  index("execution_files_requirement_idx").on(t.requirementId),
]);

// 3. Child Test Cases Table (The spreadsheet rows)
export const executionTestCasesTable = pgTable("execution_test_cases", {
  id: serial("id").primaryKey(),
  executionFileId: integer("execution_file_id")
    .references(() => executionFilesTable.id, { onDelete: "cascade" })
    .notNull(),
  moduleName: text("module_name"),
  caseId: text("case_id"),
  testCaseId: text("test_case_id"),
  libraryTcId: integer("library_tc_id"),
  userStory: text("user_story"),
  requirementId: integer("requirement_id"),
  tracker: text("tracker"), // <--- ADDED HERE
  scenario: text("scenario"),
  preCondition: text("pre_condition"),
  caseName: text("case_name"),
  testSteps: text("test_steps"),
  testData: text("test_data"),
  expectedResult: text("expected_result"),
  result: text("result"),
  executedAt: timestamp("executed_at"),
  actualResult: text("actual_result"),
  defectNumber: text("defect_number"),
  defectScreenshots: text("defect_screenshots"), // JSON array of base64 or file paths
  comments: text("comments"),
  qaPic: text("qa_pic"),
  rowOrder: integer("row_order").notNull().default(0),
  rowType: text("row_type").notNull().default("testcase"), // "testcase" | "group" — group rows are section banners, label lives in caseName
  // CR023p4 — per-execution-instance ack of a requirement revision
  reviewAcknowledgedAt: timestamp("review_acknowledged_at"),
}, (t) => [
  // This is the largest table in the product and previously had no index at
  // all. Both of these columns are the join/filter key for essentially every
  // dashboard, progress and traceability query, so each one of those was a
  // full sequential scan of the whole table.
  index("exec_tc_file_idx").on(t.executionFileId),
  index("exec_tc_requirement_idx").on(t.requirementId),
  // The execution progress page reads one file's rows in sheet order.
  index("exec_tc_file_order_idx").on(t.executionFileId, t.rowOrder),
  // Library-linked dedupe in the requirements list.
  index("exec_tc_library_tc_idx").on(t.libraryTcId),
]);

// Optional evidence for a passed execution result. File bytes live in the
// database so evidence survives application restarts and backup/restore.
// Multiple files are supported per test-case execution row.
export const executionTcEvidenceTable = pgTable("execution_tc_evidence", {
  id: serial("id").primaryKey(),
  executionTestCaseId: integer("execution_test_case_id")
    .references(() => executionTestCasesTable.id, { onDelete: "cascade" })
    .notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  dataBase64: text("data_base64").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("exec_tc_evidence_row_idx").on(t.executionTestCaseId),
]);

// 4. Status Change History Table (audit trail for CAPA / Pareto analysis)
export const executionTcHistoryTable = pgTable("execution_tc_history", {
  id: serial("id").primaryKey(),
  executionFileId: integer("execution_file_id").notNull(),
  testCaseId: text("test_case_id").notNull(),
  changedBy: integer("changed_by"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (t) => [
  index("exec_tc_history_file_idx").on(t.executionFileId),
]);

// 5. Execution File Audit Log (populates Doc Info + Review Log sheets)
export const executionFileAuditTable = pgTable("execution_file_audit", {
  id: serial("id").primaryKey(),
  executionFileId: integer("execution_file_id")
    .references(() => executionFilesTable.id, { onDelete: "cascade" })
    .notNull(),
  updatedByName: text("updated_by_name"),
  summary: text("summary").notNull(),
  tcCount: integer("tc_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("exec_file_audit_file_idx").on(t.executionFileId),
]);

// 6. Document Register (Project + Module → Ref No for Excel G4)
export const documentRegisterTable = pgTable("document_register", {
  id: serial("id").primaryKey(),
  projectName: text("project_name").notNull(),
  moduleName: text("module_name").notNull(),
  tracker: text("tracker").notNull().default("CR"), // "CR" | "SIT" | "UAT"
  refNo: text("ref_no").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 7. Trackers Table (synced from Redmine, used as dropdown options)
export const trackersTable = pgTable("trackers", {
  id: serial("id").primaryKey(),
  redmineId: integer("redmine_id").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 6. Execution Summary Table (aggregated module-level data for the Execution Details page)
export const executionSummariesTable = pgTable("execution_summaries", {
  id: serial("id").primaryKey(),
  redmineTicketId: text("redmine_ticket_id").notNull(),
  module: text("module").notNull(),
  total: integer("total").notNull().default(0),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  blocked: integer("blocked").notNull().default(0),
  inProgress: integer("in_progress").notNull().default(0),
  notExecuted: integer("not_executed").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("execution_summaries_ticket_idx").on(t.redmineTicketId),
]);
