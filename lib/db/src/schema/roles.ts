import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  department: text("department"),  // 'qa' | 'pm' | 'fa' | 'dev' | null
  tierRank: integer("tier_rank"),  // 1=member 2=lead 3=manager 4=hod 5=cto; null=unrestricted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof rolesTable.$inferSelect;
