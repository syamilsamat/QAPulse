import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { defectsTable } from "./defects";
import { usersTable } from "./users";
// Missing issues are relative to the requesting user's current credentials.
export const defectAvailabilityTable = pgTable("defect_availability", {
  defectId: integer("defect_id").notNull().references(() => defectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  redmineId: text("redmine_id").notNull(),
  credentialFingerprint: text("credential_fingerprint").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.defectId, t.userId] })]);
