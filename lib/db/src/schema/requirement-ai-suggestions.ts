import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Persists each AI Requirement Analyzer suggestion (missing item / issue /
// clarifying question) per requirement, so a triage decision (accepted /
// ignored / solved) survives re-running the analyzer later — without this,
// every re-analysis would re-surface the exact same already-handled items.
export const requirementAiSuggestionsTable = pgTable("requirement_ai_suggestions", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  kind: text("kind").notNull(), // 'missing_item' | 'issue' | 'question'
  suggestionText: text("suggestion_text").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'ignored' | 'solved'
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RequirementAiSuggestion = typeof requirementAiSuggestionsTable.$inferSelect;
