import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const requirementCommentsTable = pgTable("requirement_comments", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  authorId: integer("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequirementComment = typeof requirementCommentsTable.$inferSelect;
