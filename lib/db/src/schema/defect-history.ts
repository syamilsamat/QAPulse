import { pgTable, integer, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { defectsTable } from "./defects";
import { usersTable } from "./users";
export interface DefectHistoryEntry {
  id: number; author: string; createdAt: string; private: boolean; notes: string;
  changes: Array<{ kind: "field" | "attachment"; field: string; before: string | null; after: string | null }>;
}
// Private journals must never cross users, credentials, or Redmine hosts.
export const defectHistoryTable = pgTable("defect_history", {
  defectId: integer("defect_id").notNull().references(() => defectsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  redmineId: text("redmine_id").notNull(),
  credentialFingerprint: text("credential_fingerprint").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  entries: jsonb("entries").$type<DefectHistoryEntry[]>().notNull(),
  issueUpdatedAt: timestamp("issue_updated_at", { withTimezone: true }).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
  seenJournalId: integer("seen_journal_id").notNull().default(0),
  seenUpdatedAt: timestamp("seen_updated_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.defectId, t.userId] })]);
