import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

// CR079 — Platform Issues: bugs/ideas/questions about QM Pulse itself,
// reported by whoever is using the tool. Deliberately separate from
// `defects` (which tracks bugs in the client projects QM Pulse tests) — no
// Redmine involvement, this table is the system of record from day one.
export const platformIssuesTable = pgTable(
  "platform_issues",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("bug"), // bug | idea | question
    severity: text("severity").notNull().default("minor"), // blocking | major | minor
    status: text("status").notNull().default("open"), // open | in_progress | fixed | wont_fix | duplicate
    // Nullable, not a real FK constraint (matches risks.raisedBy / defects.reporterId
    // style elsewhere in this schema) — also lets the bug.md backfill seed rows
    // with no known reporter.
    reporterId: integer("reporter_id"),
    // Auto-captured client-side at submit time — which page the reporter was on.
    pagePath: text("page_path"),
    // Auto-captured client-side — navigator.userAgent, kept as one flat string
    // rather than jsonb (no jsonb column exists anywhere else in this schema;
    // a single string is enough for "what browser" and keeps the pattern flat).
    browserInfo: text("browser_info"),
    // A single screenshot as a data: URI, not a disk/S3 upload — the request
    // body cap (25mb, app.ts) comfortably covers one screenshot, and this
    // avoids pulling in the multer/UPLOADS_DIR machinery requirement-attachments
    // uses for a v1 that's meant to stay boring.
    screenshotUrl: text("screenshot_url"),
    // Set once an issue is folded into a change request, e.g. "CR080".
    promotedCr: text("promoted_cr"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("platform_issues_status_idx").on(t.status),
    index("platform_issues_created_idx").on(t.createdAt),
  ],
);

export type PlatformIssue = typeof platformIssuesTable.$inferSelect;
export type InsertPlatformIssue = typeof platformIssuesTable.$inferInsert;
