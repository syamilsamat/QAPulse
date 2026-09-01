import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

// Shared code-review primitive for both Dev Tasks (Classic Delivery Flow)
// and defects assigned to a dev. Append-only: a rejection followed by a
// resubmit inserts a NEW row rather than overwriting this one, so the full
// review history for an entity survives — "current" review is just the
// latest row by submittedAt for a given (entityType, entityId).
//
// Deliberately NOT one row per task/defect — a task or defect can go through
// several review rounds (submit -> rejected -> resubmit -> approved), and
// each round needs its own reviewer/verdict/evidence trail for audit.
export const codeReviewsTable = pgTable("code_reviews", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'task' | 'defect'
  entityId: integer("entity_id").notNull(),
  status: text("status").notNull().default("in_review"), // 'in_review' | 'approved' | 'rejected'
  prLink: text("pr_link"),
  submittedBy: integer("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewerId: integer("reviewer_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CodeReview = typeof codeReviewsTable.$inferSelect;
export type InsertCodeReview = typeof codeReviewsTable.$inferInsert;

// Proof-of-completion evidence attached to a specific review round (not the
// entity directly) — same storagePath-on-local-disk pattern as
// requirement_attachments. Scoping to the round instead of the entity means
// a second submission's proof doesn't get confused with the first's.
export const reviewEvidenceTable = pgTable("review_evidence", {
  id: serial("id").primaryKey(),
  codeReviewId: integer("code_review_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReviewEvidence = typeof reviewEvidenceTable.$inferSelect;
