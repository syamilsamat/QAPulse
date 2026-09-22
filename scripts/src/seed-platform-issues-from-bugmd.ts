/**
 * CR079 one-time backfill: migrates the 16 entries in bug.md (the workspace
 * root's hand-maintained bug table) into `platform_issues` as historical
 * `status = 'fixed'` rows, so they show up in the Platform Issues page
 * instead of only living in a markdown file. Safe to re-run — skipped
 * entirely if any row already exists (checked once, not per-row), so it
 * won't double-insert on a second run.
 *
 * bug.md never recorded severity or a reporter, so every row lands as
 * severity "minor" / reporterId null rather than guessing either — that's
 * real information this backfill doesn't have, not a default worth hiding.
 * resolvedAt/createdAt are stamped at migration time for the same reason:
 * bug.md has no per-entry dates to carry over.
 *
 * Run on Replit Shell:
 *   cd scripts && npx tsx src/seed-platform-issues-from-bugmd.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

const platformIssuesTable = pgTable("platform_issues", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("bug"),
  severity: text("severity").notNull().default("minor"),
  status: text("status").notNull().default("open"),
  reporterId: integer("reporter_id"),
  pagePath: text("page_path"),
  browserInfo: text("browser_info"),
  screenshotUrl: text("screenshot_url"),
  promotedCr: text("promoted_cr"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Verbatim from bug.md, numbered as they appear there (not chronological —
// bug.md itself is out of order, e.g. #12 appears before #9).
const BUGMD_ENTRIES: { no: number; title: string; description: string }[] = [
  {
    no: 1,
    title: `"No values to set" Drizzle ORM error on PATCH /api/users/:id`,
    description: `Generated \`useUpdateUser\` hook strips unknown fields like \`redmineApiKey\`. Fixed by creating a dedicated \`PATCH /users/:id/redmine-key\` endpoint and using direct \`fetch\` instead of the generated mutation.`,
  },
  {
    no: 2,
    title: "404 on GET /api/redmine/project-configs",
    description: "Replit server was running stale compiled TypeScript from `dist/`. Fixed by rebuilding and restarting the server.",
  },
  {
    no: 3,
    title: "404 on PATCH /api/users/:id/redmine-key",
    description: "Same root cause as Bug 2, stale compiled code on Replit. Fixed by rebuilding the API server.",
  },
  {
    no: 4,
    title: "Edit testcase button opens in a new tab instead of navigating in-app",
    description: `Edit testcase button in execution dashboard opens in a new tab/browser instead of navigating in the same app. Fixed by replacing \`<a target="_blank">\` with wouter \`setLocation()\` in \`TestCasesExecution.tsx\`.`,
  },
  {
    no: 5,
    title: "Redmine API Key input reverts to hidden after saving",
    description: `\`showRedmineKey\` state was not updated on save. Fixed by calling \`setShowRedmineKey(true)\` after a successful save in \`Settings.tsx\`.`,
  },
  {
    no: 6,
    title: "Redmine Project dropdown in Create Defect popup not rendering as smart search",
    description: `\`PopoverContent\` used \`w-full\` which does not resolve correctly inside a Dialog portal. Fixed by changing to \`min-w-[var(--radix-popper-anchor-width)]\` in \`searchable-select.tsx\`.`,
  },
  {
    no: 7,
    title: "Leftover </Select> tags broke the Vite build",
    description: `Leftover \`</Select>\` closing tags in \`Team.tsx\` and \`Dashboard.tsx\` after Select → SearchableSelect conversion caused Vite build to fail with JSX parse error. Fixed by removing the stray closing tags.`,
  },
  {
    no: 8,
    title: "Auto defect creation ignored the user's personal Redmine API key",
    description: `Auto defect creation always uses the default Redmine API key even when user has saved a personal key — \`getHeaders()\` in \`execution-api.ts\` never sent the \`Authorization: Bearer\` token, so the server could not identify the user and always fell back to the env default. Fixed by (1) including the JWT token in \`getHeaders()\` and (2) updating \`resolveApiKey\` in \`redmine.ts\` to call \`getAuthUser(req)\` which reads the user from the JWT header.`,
  },
  {
    no: 12,
    title: "Assignee dropdown stays disabled after selecting a Redmine project",
    description: `\`disabled={!selectedProjectId || members.length === 0}\` kept it disabled while members were loading or if the API returned an empty list. Fixed by removing \`members.length === 0\` from the condition so it only disables when no project is selected.`,
  },
  {
    no: 11,
    title: `Screenshot filename appears as "undefined" in Redmine`,
    description: `Frontend stored screenshots as \`{ name, contentType, base64 }\` but \`CreateDefectPayload.uploads\` and the API server both expected \`{ filename, contentType, base64 }\`. Fixed by renaming the \`name\` field to \`filename\` throughout \`DefectCreationModal.tsx\`.`,
  },
  {
    no: 10,
    title: "Expected Result field blank on first open of Create Defect modal",
    description: `\`useState(expectedResult ?? "")\` only captures the value at component mount time, when \`defectRow\` is still \`null\` and \`expectedResult\` is \`undefined\`. Fixed by adding \`setExpectedResultValue(expectedResult ?? "")\` inside the \`useEffect\` that fires when \`open\` becomes \`true\`, so it always syncs with the current prop value.`,
  },
  {
    no: 9,
    title: "Defect not linked as child of parent Redmine ticket",
    description: `Defect created from execution progress page was not linked as a child of the parent Redmine ticket — \`parentIssueId\` was never passed to the Redmine issue creation payload. Fixed by passing \`ticketId\` from \`TestCasesExecutionProgressPage\` as \`parentIssueId\` prop through \`DefectCreationModal\` → \`createRedmineDefect\` → API server → Redmine \`parent_issue_id\` field. Only set if the ticket ID is a valid number.`,
  },
  {
    no: 13,
    title: "Runtime crash on Requirements page (temporal dead zone)",
    description: `\`Cannot access 'filtered' before initialization\` — auto-expand \`useEffect\` referenced \`filtered\` (a \`const\`) before its \`useMemo\` declaration, causing a JavaScript temporal dead zone error. Fixed by moving the \`useEffect\` to after the \`filtered = useMemo(...)\` declaration.`,
  },
  {
    no: 14,
    title: `History Trail Assignee always shows "Unassigned"`,
    description: `Page read \`t.assigneeName\` / \`t.assigneeId\` (singular, old fields) but API returns \`t.assigneeNames\` / \`t.assigneeIds\` (arrays). Fixed by updating all 4 spots: role filter, column filter, search, and display cell.`,
  },
  {
    no: 15,
    title: "Clone Test Case always fails",
    description: `\`handleConfirmClone\` used \`createMutation\` which routes through \`CreateTestCaseBody\` zod schema that stripped \`module\`; also fails if DB \`module\` column not yet migrated. Fixed by using the dedicated \`POST /test-cases/:id/clone\` endpoint (updated to accept \`projectId\`, \`module\`, \`requirementId\` body overrides) via direct fetch.`,
  },
  {
    no: 16,
    title: "Task filter bar layout overflow on small screens",
    description: `Orphaned search icon and "All Assignees" overflow — filter items wrapped incorrectly on smaller screens. Fixed by splitting into two rows: search full-width on row 1, filters \`flex-wrap\` on row 2.`,
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const existing = await db.select({ id: platformIssuesTable.id }).from(platformIssuesTable).limit(1);
  if (existing.length > 0) {
    console.log("platform_issues already has rows — skipping backfill (safe to delete this guard for a deliberate re-run).");
    await pool.end();
    return;
  }

  const now = new Date();
  await db.insert(platformIssuesTable).values(
    BUGMD_ENTRIES.map((e) => ({
      title: e.title,
      description: `${e.description}\n\n(Migrated from bug.md entry #${e.no}.)`,
      type: "bug" as const,
      severity: "minor" as const,
      status: "fixed" as const,
      reporterId: null,
      pagePath: null,
      browserInfo: null,
      screenshotUrl: null,
      promotedCr: null,
      resolvedAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  );

  console.log(`Backfilled ${BUGMD_ENTRIES.length} platform_issues rows from bug.md.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
