import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

// Stored AI release-risk / defect-leakage assessments for a milestone's test
// execution (QA Pipeline step 5). Append-only history in the same shape as
// milestone_risk_assessments: each "Assess with AI" run inserts a row and the
// step renders the latest. Distinct from milestone_risk_assessments, which
// judges *delivery* risk from schedule/rework/register signals — this one
// judges *release* risk from actual execution results (pass/fail/blocked,
// failed-case priority, open defects), and additionally predicts the
// probability that defects leak to production.
export const executionRiskAssessmentsTable = pgTable(
  "execution_risk_assessments",
  {
    id: serial("id").primaryKey(),
    milestoneId: integer("milestone_id").notNull(),
    projectId: integer("project_id"),
    releaseRisk: text("release_risk").notNull(), // low | medium | high | critical
    leakageProbability: integer("leakage_probability").notNull(), // 0-100
    riskRationale: text("risk_rationale"),
    leakageRationale: text("leakage_rationale"),
    factors: text("factors"), // JSON array of { signal, detail, weight }
    recommendation: text("recommendation"),
    dataSnapshot: text("data_snapshot"), // JSON of the aggregates fed to the model
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("execution_risk_assessments_milestone_idx").on(t.milestoneId),
  ],
);

export type ExecutionRiskAssessment = typeof executionRiskAssessmentsTable.$inferSelect;
export type InsertExecutionRiskAssessment = typeof executionRiskAssessmentsTable.$inferInsert;
