/**
 * FULL DATABASE WIPE — deletes ALL application data, keeping only:
 *   - users with role 'admin'
 *   - the roles / role_nav_permissions config tables (bootstrap-owned)
 *
 * Unlike clear-demo-data.ts (which surgically removes only the entities the
 * seed script created, via the manifest), this empties every data table —
 * projects, requirements, test cases, executions, defects, tasks, risks,
 * milestones, teams, notifications, activity log, everything — regardless
 * of where the rows came from. There is NO undo.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL CONFIRM_WIPE=yes npx tsx src/clear-all-data.ts
 *
 * Without CONFIRM_WIPE=yes it only PRINTS what it would delete and exits.
 */

import { Pool } from "pg";
import { deleteManifest } from "./seed-client.js";

// Kept entirely (config the app's bootstrap owns, not user data).
const KEEP_TABLES = new Set(["roles", "role_nav_permissions"]);
// Kept partially — everything except role='admin' rows is deleted.
const USERS_TABLE = "users";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");
  const confirmed = process.env.CONFIRM_WIPE === "yes";

  const pool = new Pool({ connectionString: dbUrl });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const wipe = rows
      .map((r) => r.tablename)
      .filter((t) => t !== USERS_TABLE && !KEEP_TABLES.has(t) && !t.includes("drizzle"));

    const admins = await pool.query<{ id: number; email: string; name: string }>(
      `SELECT id, email, name FROM users WHERE role = 'admin'`,
    );
    const nonAdminCount = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM users WHERE role <> 'admin'`,
    );

    console.log(`Tables to be EMPTIED (${wipe.length}):`);
    for (const t of wipe) console.log(`  - ${t}`);
    console.log(`\nusers: ${nonAdminCount.rows[0].n} non-admin user(s) will be DELETED.`);
    console.log(`Admin user(s) kept (${admins.rows.length}):`);
    for (const a of admins.rows) console.log(`  - ${a.name} <${a.email}>`);
    console.log(`Kept untouched: ${[...KEEP_TABLES].join(", ")}`);

    if (admins.rows.length === 0) {
      console.error("\nABORTED: no user with role 'admin' exists — wiping now would lock everyone out.");
      process.exit(1);
    }

    if (!confirmed) {
      console.log("\nDry run only — nothing was deleted.");
      console.log("To execute, re-run with CONFIRM_WIPE=yes");
      return;
    }

    console.log("\nWiping...");
    // One statement: CASCADE resolves inter-table FKs, RESTART IDENTITY
    // resets the id sequences so a fresh seed starts from 1.
    await pool.query(`TRUNCATE TABLE ${wipe.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    // Data tables referencing users are now empty, so this cannot violate FKs.
    const del = await pool.query(`DELETE FROM users WHERE role <> 'admin'`);
    console.log(`  ${wipe.length} tables truncated, ${del.rowCount} non-admin user(s) deleted.`);

    // A stale seed manifest would make seed-demo-data.ts refuse to run (and
    // clear-demo-data.ts would try to delete ids that no longer exist).
    deleteManifest();
    console.log("  demo-seed-manifest.json removed (if it existed).");

    console.log("\nDone. Only the admin account(s) remain. Restart the app workflow, then re-seed if wanted.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
