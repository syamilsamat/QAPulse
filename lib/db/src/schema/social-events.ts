import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialEventsTable = pgTable("social_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: text("event_date").notNull(),
  eventType: text("event_type").notNull().default("other"),
  taggedUserIds: text("tagged_user_ids"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSocialEventSchema = createInsertSchema(socialEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialEvent = z.infer<typeof insertSocialEventSchema>;
export type SocialEvent = typeof socialEventsTable.$inferSelect;
