import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

// CR033p2 — PM Dashboard Risk Register (PMBOK Planning artifact, distinct from
// the Top Blockers Issue Log which tracks already-happened problems). Score
// is derived from probability x impact at read time, not stored, so it never
// goes stale against a later mitigationPlan edit.
export const risksTable = pgTable(
  "risks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    // Optional tag only — a risk can outlive a single milestone (e.g. "vendor
    // API deprecation"), so this is never required. See project_cr033 memory.
    milestoneId: integer("milestone_id"),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("other"), // schedule | scope | resource | technical | external | other
    probability: text("probability").notNull().default("medium"), // low | medium | high
    impact: text("impact").notNull().default("medium"), // low | medium | high
    status: text("status").notNull().default("open"), // open | mitigating | closed | realized
    mitigationPlan: text("mitigation_plan"),
    // CR056 — PMBOK's four standard risk response categories, distinct from
    // the free-text mitigationPlan (the "what" vs. mitigationPlan's "how").
    responseStrategy: text("response_strategy"), // avoid | transfer | mitigate | accept | null (not yet decided)
    ownerId: integer("owner_id"),
    raisedBy: integer("raised_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("risks_project_idx").on(t.projectId),
    index("risks_milestone_idx").on(t.milestoneId),
  ],
);

export type Risk = typeof risksTable.$inferSelect;
export type InsertRisk = typeof risksTable.$inferInsert;
