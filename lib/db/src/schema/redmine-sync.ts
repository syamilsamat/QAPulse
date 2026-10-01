import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

// Single-row state for the scheduled Redmine sync (id is always 1). Lives in
// the database, not memory, so every API instance sees the same lock and
// schedule and an admin can change the interval without a redeploy.
export const redmineSyncStateTable = pgTable("redmine_sync_state", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  intervalMinutes: integer("interval_minutes").notNull().default(15),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  // Last run that ignored the "changed since" cursor and re-checked everything.
  lastFullAt: timestamp("last_full_at", { withTimezone: true }),
  lastStatus: text("last_status"), // 'ok' | 'partial' | 'error'
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  // Set while a run is in progress; a run only starts if this is empty or
  // stale, which is what stops two instances syncing at once.
  runningSince: timestamp("running_since", { withTimezone: true }),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per run, for the sync status screen and for answering "when did
// this last change and why".
export const redmineSyncRunsTable = pgTable("redmine_sync_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(), // 'schedule' | 'manual' | 'nightly'
  mode: text("mode").notNull(), // 'incremental' | 'full'
  status: text("status").notNull().default("running"), // 'running' | 'ok' | 'partial' | 'error'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  defectsRefreshed: integer("defects_refreshed").notNull().default(0),
  defectsFailed: integer("defects_failed").notNull().default(0),
  requirementsChecked: integer("requirements_checked").notNull().default(0),
  requirementsUpdated: integer("requirements_updated").notNull().default(0),
  requirementsFlagged: integer("requirements_flagged").notNull().default(0),
  error: text("error"),
}, (t) => [
  index("redmine_sync_runs_started_idx").on(t.startedAt),
]);

// A change made in Redmine to a requirement that QM Pulse will not overwrite
// on its own (it is in review or approved). A person accepts or dismisses it.
export const requirementRedmineChangesTable = pgTable("requirement_redmine_changes", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  redmineTicketId: text("redmine_ticket_id").notNull(),
  // JSON: { field: { from, to } } for title / description / priority / tracker
  changes: text("changes").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'dismissed'
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("req_redmine_changes_req_idx").on(t.requirementId, t.status),
]);

export type RedmineSyncState = typeof redmineSyncStateTable.$inferSelect;
export type RedmineSyncRun = typeof redmineSyncRunsTable.$inferSelect;
export type RequirementRedmineChange = typeof requirementRedmineChangesTable.$inferSelect;
