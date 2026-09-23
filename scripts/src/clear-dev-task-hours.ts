/**
 * One-time cleanup: clear estimated_hours on every dev task.
 *
 * The Dev Tasks panel on a requirement was the only place that ever set this
 * field, and it no longer collects it. Leaving the old values behind would
 * make the PM Dashboard's capacity/utilization figures a mix of hours entered
 * before the change and nothing at all after it — worse than reading zero
 * everywhere, because the numbers would look real.
 *
 * Scoped to requirement-linked tasks (dev tasks). Ad-hoc tasks from the Task
 * Tracker keep whatever hours they carry.
 *
 * Not part of bootstrap on purpose: bootstrap runs on every cold start, and an
 * unconditional wipe there would silently erase hours if any future screen
 * starts collecting them again.
 *
 * Run on Replit Shell:
 *   cd scripts && npx tsx src/clear-dev-task-hours.ts
 */

import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: [before] } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tasks
      WHERE requirement_id IS NOT NULL AND estimated_hours IS NOT NULL`,
  );
  console.log(`Dev tasks carrying estimated hours: ${before.count}`);

  const result = await pool.query(
    `UPDATE tasks SET estimated_hours = NULL
      WHERE requirement_id IS NOT NULL AND estimated_hours IS NOT NULL`,
  );
  console.log(`Cleared estimated_hours on ${result.rowCount} dev task(s).`);

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
