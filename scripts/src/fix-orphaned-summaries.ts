/**
 * One-time cleanup: remove orphaned execution_summaries rows whose
 * redmineTicketId no longer has a matching execution_files row.
 * Then rebuilds summaries from scratch for all existing files.
 *
 * Run on Replit Shell:
 *   cd scripts && npx tsx src/fix-orphaned-summaries.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

const executionFilesTable = pgTable("execution_files", {
  id:              serial("id").primaryKey(),
  redmineTicketId: text("redmine_ticket_id").notNull(),
});

const executionTestCasesTable = pgTable("execution_test_cases", {
  id:              serial("id").primaryKey(),
  executionFileId: integer("execution_file_id").notNull(),
  moduleName:      text("module_name"),
  caseName:        text("case_name"),
  result:          text("result"),
});

const executionSummariesTable = pgTable("execution_summaries", {
  id:              serial("id").primaryKey(),
  redmineTicketId: text("redmine_ticket_id").notNull(),
  module:          text("module").notNull(),
  total:           integer("total").notNull().default(0),
  passed:          integer("passed").notNull().default(0),
  failed:          integer("failed").notNull().default(0),
  blocked:         integer("blocked").notNull().default(0),
  inProgress:      integer("in_progress").notNull().default(0),
  notExecuted:     integer("not_executed").notNull().default(0),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
  updatedAt:       timestamp("updated_at").defaultNow().notNull(),
});

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // 1. Delete all summaries — we'll rebuild from scratch
  const deleted = await db.delete(executionSummariesTable);
  console.log("Cleared all execution_summaries rows.");

  // 2. Load all execution files
  const files = await db.select().from(executionFilesTable);
  console.log(`Rebuilding summaries for ${files.length} execution file(s)...`);

  let rebuilt = 0;
  for (const file of files) {
    const tcRows = await db
      .select({ moduleName: executionTestCasesTable.moduleName, caseName: executionTestCasesTable.caseName, result: executionTestCasesTable.result })
      .from(executionTestCasesTable)
      .where(eq(executionTestCasesTable.executionFileId, file.id));

    const moduleMap: Record<string, { total: number; passed: number; failed: number; blocked: number; inProg: number; notExec: number }> = {};
    for (const tc of tcRows) {
      if (!tc.moduleName && !tc.caseName && !tc.result) continue;
      const mod = tc.moduleName || "Unassigned Module";
      if (!moduleMap[mod]) moduleMap[mod] = { total: 0, passed: 0, failed: 0, blocked: 0, inProg: 0, notExec: 0 };
      moduleMap[mod].total++;
      const r = (tc.result?.trim() || "").toLowerCase();
      if (r === "passed") moduleMap[mod].passed++;
      else if (r === "failed") moduleMap[mod].failed++;
      else if (r === "blocked") moduleMap[mod].blocked++;
      else if (r === "in progress") moduleMap[mod].inProg++;
      else moduleMap[mod].notExec++;
    }

    const rows = Object.entries(moduleMap);
    if (rows.length === 0) continue;

    await db.insert(executionSummariesTable).values(
      rows.map(([mod, s]) => ({
        redmineTicketId: file.redmineTicketId,
        module: mod,
        total: s.total,
        passed: s.passed,
        failed: s.failed,
        blocked: s.blocked,
        inProgress: s.inProg,
        notExecuted: s.notExec,
      }))
    );
    rebuilt++;
  }

  console.log(`Done. Rebuilt summaries for ${rebuilt} file(s).`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
