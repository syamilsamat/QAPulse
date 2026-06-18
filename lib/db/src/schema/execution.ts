import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

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
  remarks: text("remarks"),
  selectedModules: text("selected_modules"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 3. Child Test Cases Table (The spreadsheet rows)
export const executionTestCasesTable = pgTable("execution_test_cases", {
  id: serial("id").primaryKey(),
  executionFileId: integer("execution_file_id")
    .references(() => executionFilesTable.id, { onDelete: "cascade" })
    .notNull(),
  moduleName: text("module_name"),
  caseId: text("case_id"),
  userStory: text("user_story"),
  tracker: text("tracker"), // <--- ADDED HERE
  scenario: text("scenario"),
  preCondition: text("pre_condition"),
  caseName: text("case_name"),
  testSteps: text("test_steps"),
  testData: text("test_data"),
  expectedResult: text("expected_result"),
  result: text("result"),
  actualResult: text("actual_result"),
  defectNumber: text("defect_number"),
  defectScreenshots: text("defect_screenshots"), // JSON array of base64 or file paths
  comments: text("comments"),
  qaPic: text("qa_pic"),
  rowOrder: integer("row_order").notNull().default(0),
});

// 4. Execution Summary Table (aggregated module-level data for the Execution Details page)
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
});
