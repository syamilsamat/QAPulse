import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// CR039 — Requirement Q&A Chat. entityType/entityId are nullable: a
// conversation stays unresolved (no requirement matched yet, or the match
// was ambiguous) until POST /ai/requirement-chat sets them.
export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    userId: integer("user_id").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("conversations_entity_idx").on(t.entityType, t.entityId),
    index("conversations_user_idx").on(t.userId),
  ],
);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
