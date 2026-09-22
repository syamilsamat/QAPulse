/**
 * Backdates the UAT sign-off document added by
 * seed-sparrow-uat-signoff-bonus.ts to its storyline date. Run AFTER that
 * script:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-uat-signoff-bonus.ts
 */
import pg from "pg";
import { loadSparrowManifest, keyOf } from "./sparrow-manifest";
import { UAT_SIGNOFF } from "./sparrow-uat-signoff-bonus-data";

const { Pool } = pg;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const manifest = loadSparrowManifest();
  const entry = manifest.find((e) => e.type === "uatSignoff" && keyOf(e) === "uatsignoff-cr2026014");
  if (!entry) {
    console.log("No uat sign-off entry found in the manifest — run seed-sparrow-uat-signoff-bonus.ts first.");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    await pool.query(`UPDATE uat_signoffs SET created_at = $2 WHERE id = $1`, [Number(entry.id), UAT_SIGNOFF.signOffDate]);
    console.log(`Backdated UAT sign-off #${entry.id} to ${UAT_SIGNOFF.signOffDate}`);
  } finally {
    await pool.end();
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
