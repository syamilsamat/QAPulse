/**
 * CR035 one-time migration — run once, right before deploying the CR035
 * code (which removes team-based project access and the bootstrap
 * cross-join backfill).
 *
 * 1. Converts every *current* team-granted project access into a real
 *    project_members row (module_id: null, i.e. whole-project) — so nobody
 *    legitimately using the app today loses access the moment CR035 ships.
 *    Bootstrap-only "access" (a project_members row with no real team or
 *    direct grant behind it) is intentionally NOT specially preserved here;
 *    it just becomes an ordinary already-existing row that step 1 leaves
 *    alone (ON CONFLICT DO NOTHING) — the corrupting *source* (the
 *    bootstrap cross-join) is what CR035 removes, not these rows one by one.
 * 2. Backfills project_modules from whatever module names already appear
 *    per-project across test_cases, requirements, defects, and tasks, so
 *    existing module names don't just vanish from the assignment picker.
 *
 * Run on Replit Shell:
 *   cd scripts && npx tsx src/migrate-project-access.ts
 */

import { Pool } from "pg";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const pool = new Pool({ connectionString: dbUrl });
  try {
    // ── Step 1: team-granted access → real project_members rows ───────────
    console.log("Backfilling project_members from current team assignments...");
    const { rowCount: memberRows } = await pool.query(`
      INSERT INTO project_members (project_id, user_id, module_id, assigned_by, assigned_at)
      SELECT DISTINCT pt.project_id, ut.user_id, NULL, NULL, NOW()
      FROM project_teams pt
      JOIN user_teams ut ON ut.team_id = pt.team_id
      ON CONFLICT (project_id, user_id) DO NOTHING
    `);
    console.log(`  + ${memberRows ?? 0} project_members row(s) added from team assignments`);

    // ── Step 2: existing per-project module usage → project_modules ───────
    console.log("\nBackfilling project_modules from existing module usage...");

    const sources: { label: string; sql: string }[] = [
      {
        label: "test_cases",
        sql: `SELECT DISTINCT project_id, module FROM test_cases WHERE project_id IS NOT NULL AND module IS NOT NULL AND module <> ''`,
      },
      {
        label: "requirements",
        sql: `SELECT DISTINCT project_id, module FROM requirements WHERE project_id IS NOT NULL AND module IS NOT NULL AND module <> ''`,
      },
      {
        label: "defects",
        sql: `SELECT DISTINCT project_id, module FROM defects WHERE project_id IS NOT NULL AND module IS NOT NULL AND module <> ''`,
      },
    ];

    const pairs = new Set<string>(); // `${projectId}:${moduleName}`
    for (const source of sources) {
      const { rows } = await pool.query<{ project_id: number; module: string }>(source.sql);
      for (const r of rows) pairs.add(`${r.project_id}:${r.module}`);
      console.log(`  scanned ${source.label}: ${rows.length} distinct (project, module) pair(s)`);
    }

    // tasks stores module as a real module_id already (no name to resolve)
    const { rows: taskRows } = await pool.query<{ project_id: number; module_id: number }>(
      `SELECT DISTINCT project_id, module_id FROM tasks WHERE project_id IS NOT NULL AND module_id IS NOT NULL`,
    );
    console.log(`  scanned tasks: ${taskRows.length} distinct (project, module_id) pair(s)`);

    let inserted = 0;
    for (const pair of pairs) {
      const sep = pair.indexOf(":");
      const projectId = Number(pair.slice(0, sep));
      const moduleName = pair.slice(sep + 1);
      const { rows: modRows } = await pool.query<{ id: number }>(
        `SELECT id FROM execution_modules WHERE name = $1`,
        [moduleName],
      );
      if (modRows.length === 0) continue; // module name doesn't exist in the catalog — skip rather than inventing one
      const { rowCount } = await pool.query(
        `INSERT INTO project_modules (project_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [projectId, modRows[0].id],
      );
      inserted += rowCount ?? 0;
    }
    for (const r of taskRows) {
      const { rowCount } = await pool.query(
        `INSERT INTO project_modules (project_id, module_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [r.project_id, r.module_id],
      );
      inserted += rowCount ?? 0;
    }
    console.log(`  + ${inserted} project_modules row(s) added`);

    console.log("\nDone. Safe to deploy the CR035 code now.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
