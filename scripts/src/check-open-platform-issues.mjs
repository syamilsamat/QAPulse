/**
 * Read-only check: any open/in_progress rows in prod `platform_issues`?
 * Ignores fixed/wont_fix/duplicate and the historical bug.md backfill on purpose —
 * this is a "is there anything new to look at right now" check, not a full history dump.
 *
 * Run from scripts/:
 *   node --env-file=.env.platform-issues src/check-open-platform-issues.mjs
 */
import pg from "pg";

const connectionString = process.env.PLATFORM_ISSUES_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing PLATFORM_ISSUES_DB_URL (or DATABASE_URL). Set it in scripts/.env.platform-issues.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(`
  SELECT id, title, type, severity, status, page_path, reporter_id, created_at
  FROM platform_issues
  WHERE status IN ('open', 'in_progress')
  ORDER BY
    CASE severity WHEN 'blocking' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,
    created_at DESC;
`);

await client.end();

if (rows.length === 0) {
  console.log("No open or in-progress platform issues.");
  process.exit(0);
}

console.log(`${rows.length} open/in-progress platform issue(s):\n`);
for (const r of rows) {
  console.log(`#${r.id} [${r.severity}/${r.status}] ${r.title}`);
  console.log(`    type: ${r.type} · page: ${r.page_path ?? "—"} · reporter_id: ${r.reporter_id ?? "—"} · reported: ${r.created_at.toISOString()}`);
}
