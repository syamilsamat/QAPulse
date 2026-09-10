import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const requirementCommentsTable = pgTable("requirement_comments", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("requirement_comments_requirement_idx").on(t.requirementId),
]);

export type RequirementComment = typeof requirementCommentsTable.$inferSelect;
