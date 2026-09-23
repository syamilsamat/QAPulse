/**
 * One-time migration (DEF-0013): the top-level "Target Date" field on a
 * milestone is now auto-synced from Go-Live Date on every create/update
 * going forward. Existing rows that already have a goLiveDate but a
 * different (or missing) targetDate need a one-off backfill so the two
 * agree for milestones created before this change shipped.
 *
 * Run on Replit with:
 *   cd scripts && npx tsx src/backfill-milestone-target-date.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isNotNull, ne, or, isNull, sql } from "drizzle-orm";
import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

// Inline minimal table definition so this script is self-contained.
const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  targetDate: timestamp("target_date", { withTimezone: true }),
  goLiveDate: timestamp("go_live_date", { withTimezone: true }),
});

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const rows = await db
    .select({ id: milestonesTable.id, targetDate: milestonesTable.targetDate, goLiveDate: milestonesTable.goLiveDate })
    .from(milestonesTable)
    .where(
      sql`${milestonesTable.goLiveDate} IS NOT NULL AND (${milestonesTable.targetDate} IS NULL OR ${milestonesTable.targetDate} <> ${milestonesTable.goLiveDate})`
    );

  console.log(`Found ${rows.length} milestone(s) whose targetDate is out of sync with goLiveDate.`);

  for (const row of rows) {
    await db
      .update(milestonesTable)
      .set({ targetDate: row.goLiveDate })
      .where(sql`${milestonesTable.id} = ${row.id}`);
  }

  console.log(`Done. Updated: ${rows.length}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
