/**
 * Backdates the 12 Test Cases / Execution Dashboard bonus scenarios
 * (TX-01…TX-12) added by seed-sparrow-testcases-bonus.ts. Run AFTER that
 * script:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-testcases-bonus.ts
 *
 * TX-11's staleness is judged against the REAL current date (the app
 * computes "is this file untouched for >3 days?" against wall-clock now),
 * so that one file's updated_at is backdated relative to whenever this
 * script actually runs — every other date below uses the shifted narrative
 * dates via pd()/pt(), same as the rest of the SPARROW dataset.
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import {
  TX01_CLONE, TX02_SMOKE_FILE, TX03_DUPLICATE, REQ_117, TX04_GAP_CLOSED_TC,
  TX08_CLONE, TX0910_FILE, TX11_STALE_FILE, TX12_DEPRECATE,
} from "./sparrow-testcases-bonus-data";

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
    // ── TX-01 — cloned CIMB Clicks variant ───────────────────────────────
    console.log("TX-01 — backdating the cloned test case...");
    const cloneTc = idOf(manifest, "testCase", "tx01-clone");
    if (cloneTc) {
      await pool.query(`UPDATE test_cases SET created_at=$2, updated_at=$2 WHERE id=$1`, [cloneTc, TX01_CLONE.date]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [cloneTc, TX01_CLONE.date]);
    }

    // ── TX-02 — Smoke Test execution file ────────────────────────────────
    console.log("TX-02 — backdating the Smoke Test execution file...");
    const smokeFileId = idOf(manifest, "executionFile", "smoke");
    if (smokeFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$2 WHERE id=$1`, [smokeFileId, TX02_SMOKE_FILE.date]);
      await pool.query(`UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1`, [smokeFileId, TX02_SMOKE_FILE.date]);
    }

    // ── TX-03 — near-duplicate test case (created then deleted) ─────────
    console.log("TX-03 — backdating the duplicate-detection scenario...");
    const dupTc = idOf(manifest, "testCase", "tx03-dup");
    if (dupTc) {
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [dupTc, TX03_DUPLICATE.createdDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_deleted'`, [dupTc, TX03_DUPLICATE.deletedDate]);
    }

    // ── TX-04 — REQ-117 (zero-coverage) + the TC that closes the gap ────
    console.log("TX-04 — backdating REQ-117 and its coverage-closing test case...");
    const r117 = idOf(manifest, "requirement", "req117");
    if (r117) {
      await pool.query(
        `UPDATE requirements SET created_at=$2, updated_at=$3, approved_at=$3 WHERE id=$1`,
        [r117, REQ_117.createdDate, REQ_117.approveDate],
      );
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r117, REQ_117.createdDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_submit'`, [r117, REQ_117.submitDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_approve'`, [r117, REQ_117.approveDate]);
    }
    const gapTc = idOf(manifest, "testCase", "tx04-gapclose");
    if (gapTc) {
      await pool.query(`UPDATE test_cases SET created_at=$2, updated_at=$2 WHERE id=$1`, [gapTc, TX04_GAP_CLOSED_TC.date]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [gapTc, TX04_GAP_CLOSED_TC.date]);
    }

    // ── TX-08 — ad-hoc regression snapshot cloned from SIT ───────────────
    console.log("TX-08 — backdating the cloned ad-hoc regression file...");
    const cloneFileId = idOf(manifest, "executionFile", "tx08-clone");
    if (cloneFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$2 WHERE id=$1`, [cloneFileId, TX08_CLONE.date]);
      // Row-level executedAt values were carried over from SIT (resetResults:false)
      // and are already correct from finalize-sparrow-data.ts — left untouched.
    }

    // ── TX-09/10 — Wallet Top-Up Regression Pack ─────────────────────────
    console.log("TX-09/10 — backdating the Wallet Top-Up Regression Pack (file, audit log, history)...");
    const wFileId = idOf(manifest, "executionFile", "wreg");
    if (wFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$3 WHERE id=$1`, [wFileId, TX0910_FILE.addedDate, TX0910_FILE.secondResultDate]);

      // Audit log — 2 entries, in creation order: "added" then "removed"
      const auditRows = await pool.query(
        `SELECT id FROM execution_file_audit WHERE execution_file_id=$1 ORDER BY id ASC`, [wFileId],
      );
      const auditDates = [TX0910_FILE.addedDate, TX0910_FILE.removedDate];
      for (let i = 0; i < auditRows.rows.length && i < auditDates.length; i++) {
        await pool.query(`UPDATE execution_file_audit SET created_at=$2 WHERE id=$1`, [auditRows.rows[i].id, auditDates[i]]);
      }

      // Per-row result history — 2 entries for reg1's row: Not Executed→Failed, Failed→Passed
      const historyRows = await pool.query(
        `SELECT id FROM execution_tc_history WHERE execution_file_id=$1 ORDER BY id ASC`, [wFileId],
      );
      const historyDates = [TX0910_FILE.firstResultDate, TX0910_FILE.secondResultDate];
      for (let i = 0; i < historyRows.rows.length && i < historyDates.length; i++) {
        await pool.query(`UPDATE execution_tc_history SET changed_at=$2 WHERE id=$1`, [historyRows.rows[i].id, historyDates[i]]);
      }

      // The 4 "execution_saved" activity rows (add, remove, flip1, flip2), in order
      const savedActivity = await pool.query(
        `SELECT id FROM activity WHERE entity_type='execution' AND entity_id=$1 AND type='execution_saved' ORDER BY id ASC`, [wFileId],
      );
      const savedDates = [TX0910_FILE.addedDate, TX0910_FILE.removedDate, TX0910_FILE.firstResultDate, TX0910_FILE.secondResultDate];
      for (let i = 0; i < savedActivity.rows.length && i < savedDates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [savedActivity.rows[i].id, savedDates[i]]);
      }

      // Row executedAt: reg1's row → secondResultDate; reg4's row (untouched,
      // still Not Executed) → left null; reg8's row was removed entirely.
      await pool.query(
        `UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1 AND test_case_id=$3`,
        [wFileId, TX0910_FILE.secondResultDate, "WREG-1"],
      );
    }

    // ── TX-11 — stale execution file ─────────────────────────────────────
    console.log(`TX-11 — backdating the stale execution file ${TX11_STALE_FILE.staleDaysAgo} days before today (real date, not the narrative timeline)...`);
    const staleFileId = idOf(manifest, "executionFile", "stale");
    if (staleFileId) {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - TX11_STALE_FILE.staleDaysAgo);
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$2 WHERE id=$1`, [staleFileId, staleDate.toISOString()]);
    }

    // ── TX-12 — deprecated test case + its replacement ───────────────────
    console.log("TX-12 — backdating the deprecation + replacement test case...");
    const oldTcKey = "tc204"; // resolved via the same key TEST_CASES uses in sparrow-data.ts
    const oldTc = manifest.find((e) => e.type === "testCase" && keyOf(e) === oldTcKey);
    if (oldTc) {
      await pool.query(`UPDATE test_cases SET updated_at=$2 WHERE id=$1`, [Number(oldTc.id), TX12_DEPRECATE.deprecatedDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_updated'`, [Number(oldTc.id), TX12_DEPRECATE.deprecatedDate]);
    }
    const replacementTc = idOf(manifest, "testCase", "tx12-replacement");
    if (replacementTc) {
      await pool.query(`UPDATE test_cases SET created_at=$2, updated_at=$2 WHERE id=$1`, [replacementTc, TX12_DEPRECATE.replacement.date]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [replacementTc, TX12_DEPRECATE.replacement.date]);
    }

    console.log("\nDone. Test Cases/Execution bonus scenarios (TX-01…TX-12) are backdated.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
