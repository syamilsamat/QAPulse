/**
 * Backdates the CR070 Data Prep milestone scenario (MS-10) added by
 * seed-sparrow-data-prep-bonus.ts. Run AFTER that script:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data-prep-bonus.ts
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { MS10, DATA_PREP_TASKS, DATA_PREP_FILE } from "./sparrow-data-prep-bonus-data";

const { Pool } = pg;

function idOf(manifest: ReturnType<typeof loadSparrowManifest>, type: SparrowEntityType, key: string): number | undefined {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  return entry ? Number(entry.id) : undefined;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const manifest = loadSparrowManifest();
  if (manifest.length === 0) {
    console.log("No sparrow-seed-manifest.json found — run the seed scripts first.");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    console.log("MS-10 — backdating CR-2026-029 (Data Prep)...");
    const m10 = idOf(manifest, "milestone", MS10.key);
    if (m10) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [m10, MS10.createdDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='milestone' AND entity_id=$1 AND type='milestone_created'`, [m10, MS10.createdDate]);
    }

    console.log("  Backdating tasks...");
    for (const t of DATA_PREP_TASKS) {
      const id = idOf(manifest, "task", t.key);
      if (!id) continue;
      await pool.query(`UPDATE tasks SET created_at=$2, updated_at=$2 WHERE id=$1`, [id, t.actualStartDate]);
    }

    console.log("  Backdating the uploaded dataset...");
    const fileId = idOf(manifest, "dataPrepFile", "ms10file");
    if (fileId) {
      await pool.query(`UPDATE data_prep_files SET created_at=$2 WHERE id=$1`, [fileId, DATA_PREP_FILE.uploadDate]);
    }

    console.log("\nDone. MS-10 (CR-2026-029 Data Prep) is backdated.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
