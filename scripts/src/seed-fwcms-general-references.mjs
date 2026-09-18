/** Set FWCMS General defaults without replacing any configured reference.
 * Development: DATABASE_URL=... node scripts/src/seed-fwcms-general-references.mjs
 * Production: node --env-file=scripts/.env.platform-issues scripts/src/seed-fwcms-general-references.mjs
 */
import pg from "pg";
const connectionString = process.env.DATABASE_URL || process.env.PLATFORM_ISSUES_DB_URL;
if (!connectionString) throw new Error("A database connection is required");
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
const defaults = { CR: "BSB-QA-FWCMS-153-CRD-V1.0", SIT: "BSB-QA-FWCMS-154-SIT-V1.0", UAT: "BSB-QA-FWCMS-155-UAT-V1.0" };
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("LOCK TABLE document_register IN SHARE ROW EXCLUSIVE MODE");
  for (const [tracker, ref] of Object.entries(defaults)) {
    const match = "lower(trim(project_name)) = 'fwcms' AND lower(trim(module_name)) IN ('general','fwcms general') AND upper(trim(tracker)) = $1";
    await client.query(`UPDATE document_register SET ref_no=$2 WHERE ${match} AND trim(ref_no)=''`, [tracker, ref]);
    await client.query(`INSERT INTO document_register(project_name,module_name,tracker,ref_no) SELECT 'FWCMS','General',$1,$2 WHERE NOT EXISTS (SELECT 1 FROM document_register WHERE ${match})`, [tracker, ref]);
  }
  const { rows } = await client.query("SELECT project_name,module_name,tracker,ref_no FROM document_register WHERE lower(trim(project_name))='fwcms' ORDER BY module_name,tracker");
  await client.query("COMMIT");
  console.log(JSON.stringify(rows, null, 2));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { await client.end(); }
