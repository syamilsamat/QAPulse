import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testCasesTable = pgTable("test_cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective"),
  preconditions: text("preconditions"),
  testSteps: text("test_steps"),
  expectedResult: text("expected_result"),
  tags: text("tags"),
  requirementId: integer("requirement_id"),
  projectId: integer("project_id"),
  linkedBug: text("linked_bug"),
  authorId: integer("author_id"),
  aiAssisted: boolean("ai_assisted").notNull().default(false),
  status: text("status").notNull().default("active"),

  // --- NEW FIELDS ADDED TO FIX SAVING ---
  redmineUserStory: text("redmine_user_story"),
  tracker: text("tracker"),
  scenario: text("scenario"),
  testData: text("test_data"),
  redmineDefectId: text("redmine_defect_id"),
  comments: text("comments"),
  qaPic: text("qa_pic"),
  module: text("module"),
  // --------------------------------------

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertTestCaseSchema = createInsertSchema(testCasesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTestCase = z.infer<typeof insertTestCaseSchema>;
export type TestCase = typeof testCasesTable.$inferSelect;
