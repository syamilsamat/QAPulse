import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

// CR037 — stored AI milestone risk assessments. Append-only history: each
// "Assess now" run inserts a row, the PM Dashboard card renders the latest.
// factors/dataSnapshot are JSON stored as text (same convention as
// requirements.acceptance_criteria) — factors is what the model concluded,
// dataSnapshot is the pre-aggregated numbers it was shown, kept so a past
// assessment can always be explained against the data it actually saw.
export const milestoneRiskAssessmentsTable = pgTable(
  "milestone_risk_assessments",
  {
    id: serial("id").primaryKey(),
    milestoneId: integer("milestone_id").notNull(),
    projectId: integer("project_id").notNull(),
    riskLevel: text("risk_level").notNull(), // low | medium | high | critical
    factors: text("factors").notNull(), // JSON array of { signal, detail, weight }
    mitigation: text("mitigation"),
    dataSnapshot: text("data_snapshot"), // JSON of the aggregates fed to the model
    model: text("model"), // which pipeline produced it (gemini | openrouter)
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("milestone_risk_assessments_milestone_idx").on(t.milestoneId),
  ],
);

export type MilestoneRiskAssessment = typeof milestoneRiskAssessmentsTable.$inferSelect;
export type InsertMilestoneRiskAssessment = typeof milestoneRiskAssessmentsTable.$inferInsert;
