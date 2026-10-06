import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

// Single-row global AI switchboard (id is always 1). Kept as a table, not env
// vars, so an admin can pause AI or change limits without a redeploy.
export const aiGlobalSettingsTable = pgTable("ai_global_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  // Calls one user may make per rolling 24h across all AI features, and per
  // rolling hour as a burst limit. A feature row can override the daily cap.
  dailyCapPerUser: integer("daily_cap_per_user").notNull().default(100),
  hourlyCapPerUser: integer("hourly_cap_per_user").notNull().default(30),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-feature override. A feature with no row uses the defaults in
// lib/ai-guard.ts (enabled, any signed-in user, global caps).
export const aiFeatureSettingsTable = pgTable("ai_feature_settings", {
  feature: text("feature").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  // Comma-separated role slugs allowed to run it; null = any signed-in role.
  allowedRoles: text("allowed_roles"),
  dailyCapPerUser: integer("daily_cap_per_user"), // null = use the global cap
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Append-only record of every AI call attempt, including blocked ones.
export const aiUsageLogTable = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userRole: text("user_role"),
  feature: text("feature").notNull(),
  projectId: integer("project_id"),
  status: text("status").notNull(), // 'ok' | 'error' | 'blocked' | 'cached' (answered from cache, no model call)
  blockedReason: text("blocked_reason"), // 'ai_disabled' | 'feature_disabled' | 'role' | 'daily_cap' | 'hourly_cap' | 'access'
  inputChars: integer("input_chars"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_usage_user_time_idx").on(t.userId, t.createdAt),
  index("ai_usage_feature_time_idx").on(t.feature, t.createdAt),
]);

export type AiGlobalSettings = typeof aiGlobalSettingsTable.$inferSelect;
export type AiFeatureSettings = typeof aiFeatureSettingsTable.$inferSelect;
export type AiUsageLog = typeof aiUsageLogTable.$inferSelect;
