import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Which Redmine tracker a requirement gets when it is created under a
// milestone of a given type (e.g. "cr" -> "Change Request"). Set by an
// administrator; a type with no row leaves the tracker a free choice.
export const milestoneTypeTrackersTable = pgTable("milestone_type_trackers", {
  milestoneType: text("milestone_type").primaryKey(), // 'cr' | 'phase' | 'sprint' | 'release'
  trackerName: text("tracker_name").notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MilestoneTypeTracker = typeof milestoneTypeTrackersTable.$inferSelect;
