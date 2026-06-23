import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof rolesTable.$inferSelect;
