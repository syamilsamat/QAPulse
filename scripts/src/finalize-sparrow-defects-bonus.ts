/**
 * Backdates the 10 Defects-page bonus scenarios (DX-01…DX-10) added by
 * seed-sparrow-defects-bonus.ts, and stamps final statuses that the
 * sandboxed Redmine write-through can't set (no live Redmine connection —
 * same documented limitation as the rest of this dataset).
 *
 * DX-01's "still open 12 days" and DX-09's "stale 47 days" are both anchored
 * to the REAL current date (like TX-11), so they read as genuinely
 * current/aging whenever this actually runs — every other date here is a
 * days-ago offset from today too, since this whole bonus layer is framed as
 * "live, ongoing governance," not a historical narrative.
 *
 * Run AFTER seed-sparrow-defects-bonus.ts:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-defects-bonus.ts
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { DX01, DX02, DX03, DX04, DX05, DX06, DX07, DX08, DX09, DX10 } from "./sparrow-defects-bonus-data";

const { Pool } = pg;

function idOf(manifest: ReturnType<typeof loadSparrowManifest>, type: SparrowEntityType, key: string): number | undefined {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  return entry ? Number(entry.id) : undefined;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
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

  async function setDefect(key: string, opts: { created: string; updated: string; status: string }) {
    const id = idOf(manifest, "defect", key);
    if (!id) { console.log(`  ! ${key} not in manifest — skip`); return; }
    await pool.query(
      `UPDATE defects SET created_at=$2, updated_at=$3, status=$4, status_synced_at=$3 WHERE id=$1`,
      [id, opts.created, opts.updated, opts.status],
    );
    const activityRows = await pool.query(`SELECT id, type FROM activity WHERE entity_type='defect' AND entity_id=$1 ORDER BY id ASC`, [id]);
    for (const ev of activityRows.rows as { id: number; type: string }[]) {
      const target = ev.type === "defect_created" ? opts.created : opts.updated;
      await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [ev.id, target]);
    }
  }

  try {
    console.log("Backdating the Defects Showcase execution file...");
    const fileId = idOf(manifest, "executionFile", "defects-showcase");
    if (fileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$2 WHERE id=$1`, [fileId, daysAgo(30)]);
      await pool.query(`UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1`, [fileId, daysAgo(28)]);
    }

    console.log("DX-01 — critical, still open...");
    await setDefect("dx01", { created: daysAgo(DX01.daysAgo), updated: daysAgo(DX01.daysAgo), status: DX01.finalStatus });

    console.log("DX-02 — reassignment history...");
    await setDefect("dx02", { created: daysAgo(DX02.openedDaysAgo), updated: daysAgo(DX02.closedDaysAgo), status: DX02.finalStatus });
    {
      const id = idOf(manifest, "defect", "dx02");
      if (id) {
        const assignRows = await pool.query(`SELECT id FROM activity WHERE entity_type='defect' AND entity_id=$1 AND type='defect_assigned' ORDER BY id ASC`, [id]);
        const dates = [daysAgo(DX02.openedDaysAgo), daysAgo(DX02.reassignedDaysAgo)];
        for (let i = 0; i < assignRows.rows.length && i < dates.length; i++) {
          await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [assignRows.rows[i].id, dates[i]]);
        }
      }
    }

    console.log("DX-03 — retest-twice loop...");
    await setDefect("dx03", {
      created: daysAgo(DX03.openedDaysAgo), updated: daysAgo(DX03.closedDaysAgo), status: DX03.finalStatus,
    });
    {
      const id = idOf(manifest, "defect", "dx03");
      if (id) {
        const retestLog =
          `\n\n[Retest 1 — ${daysAgo(DX03.attempt1FailDaysAgo).slice(0, 10)}]: ${DX03.attempt1Note}` +
          `\n[Retest 2 — ${daysAgo(DX03.attempt2FailDaysAgo).slice(0, 10)}]: ${DX03.attempt2Note}` +
          `\n[Final]: ${DX03.finalNote}`;
        await pool.query(`UPDATE defects SET actual_result = COALESCE(actual_result, '') || $2 WHERE id=$1`, [id, retestLog]);
      }
    }

    console.log("DX-04 — closed → reopened → closed...");
    await setDefect("dx04", { created: daysAgo(DX04.openedDaysAgo), updated: daysAgo(DX04.reClosedDaysAgo), status: DX04.finalStatus });
    {
      const id = idOf(manifest, "defect", "dx04");
      if (id) {
        const timeline =
          `\n\n[Timeline] First closed ${daysAgo(DX04.firstClosedDaysAgo).slice(0, 10)}. ` +
          `Reopened ${daysAgo(DX04.reopenedDaysAgo).slice(0, 10)}: ${DX04.reopenedNote} ` +
          `Re-closed ${daysAgo(DX04.reClosedDaysAgo).slice(0, 10)}.`;
        await pool.query(`UPDATE defects SET description = COALESCE(description, '') || $2 WHERE id=$1`, [id, timeline]);
      }
    }

    console.log("DX-05 — security category...");
    await setDefect("dx05", { created: daysAgo(DX05.openedDaysAgo), updated: daysAgo(DX05.closedDaysAgo), status: DX05.finalStatus });

    console.log("DX-06 — usability, deferred...");
    await setDefect("dx06", { created: daysAgo(DX06.openedDaysAgo), updated: daysAgo(DX06.deferredDaysAgo), status: DX06.finalStatus });
    {
      const id = idOf(manifest, "defect", "dx06");
      if (id) {
        await pool.query(
          `UPDATE defects SET escape_notes=$2 WHERE id=$1`,
          [id, DX06.deferralNote],
        );
      }
    }

    console.log("DX-07 — escape: selection_gap...");
    await setDefect("dx07", { created: daysAgo(DX07.openedDaysAgo), updated: daysAgo(DX07.closedDaysAgo), status: DX07.finalStatus });

    console.log("DX-08 — escape: passed_wrongly...");
    await setDefect("dx08", { created: daysAgo(DX08.openedDaysAgo), updated: daysAgo(DX08.closedDaysAgo), status: DX08.finalStatus });

    console.log(`DX-09 — stale, ${DX09.staleDaysAgo} days untouched...`);
    await setDefect("dx09", { created: daysAgo(DX09.staleDaysAgo), updated: daysAgo(DX09.staleDaysAgo), status: DX09.finalStatus });

    console.log("DX-10 — auto-regression TC...");
    await setDefect("dx10", { created: daysAgo(DX10.openedDaysAgo), updated: daysAgo(DX10.closedDaysAgo), status: DX10.finalStatus });
    {
      const tcId = idOf(manifest, "testCase", "dx10-regression-tc");
      if (tcId) {
        await pool.query(`UPDATE test_cases SET created_at=$2, updated_at=$2 WHERE id=$1`, [tcId, daysAgo(DX10.closedDaysAgo)]);
        await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [tcId, daysAgo(DX10.closedDaysAgo)]);
      }
    }

    console.log("\nDone. Defects-page bonus scenarios (DX-01…DX-10) are backdated and finalized.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
