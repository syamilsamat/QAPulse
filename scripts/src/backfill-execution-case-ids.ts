/**
 * One-time migration: backfill caseId on execution_test_cases rows that have
 * a libraryTcId but a null caseId. Looks up the caseId from the test_cases
 * library table and writes it back.
 *
 * Run on Replit with:
 *   cd scripts && npx tsx src/backfill-execution-case-ids.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql, isNull, isNotNull, eq } from "drizzle-orm";
import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

// Inline minimal table definitions so this script is self-contained
const executionTestCasesTable = pgTable("execution_test_cases", {
  id:          serial("id").primaryKey(),
  caseId:      text("case_id"),
  libraryTcId: integer("library_tc_id"),
});

const testCasesTable = pgTable("test_cases", {
  id:     serial("id").primaryKey(),
  caseId: text("case_id"),
});

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  // Find all execution rows with a libraryTcId but no caseId
  const rows = await db
    .select({
      id:          executionTestCasesTable.id,
      libraryTcId: executionTestCasesTable.libraryTcId,
    })
    .from(executionTestCasesTable)
    .where(
      sql`${executionTestCasesTable.caseId} IS NULL AND ${executionTestCasesTable.libraryTcId} IS NOT NULL`
    );

  console.log(`Found ${rows.length} execution rows missing caseId.`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  // Collect unique libraryTcIds and fetch their caseIds from the library
  const libraryIds = [...new Set(rows.map(r => r.libraryTcId!))];
  const libraryRows = await db
    .select({ id: testCasesTable.id, caseId: testCasesTable.caseId })
    .from(testCasesTable)
    .where(sql`${testCasesTable.id} = ANY(ARRAY[${sql.join(libraryIds.map(id => sql`${id}`), sql`, `)}]::integer[])`);

  const libraryMap = new Map(libraryRows.map(r => [r.id, r.caseId]));

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const caseId = libraryMap.get(row.libraryTcId!);
    if (!caseId) {
      console.warn(`  ⚠ execution row id=${row.id} — library TC ${row.libraryTcId} has no caseId, skipping`);
      skipped++;
      continue;
    }
    await db
      .update(executionTestCasesTable)
      .set({ caseId })
      .where(eq(executionTestCasesTable.id, row.id));
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
