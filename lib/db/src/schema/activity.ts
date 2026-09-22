import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityTable = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    userId: integer("user_id"),
    entityId: integer("entity_id"),
    entityType: text("entity_type"),
    // CR011: JSON of changed fields only — null on creates
    oldValue: text("old_value"),
    newValue: text("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_created_at_idx").on(t.createdAt),
    index("activity_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activityTable.$inferSelect;
