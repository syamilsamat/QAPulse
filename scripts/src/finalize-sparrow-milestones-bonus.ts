/**
 * Backdates the 10 Milestones-page bonus scenarios (MS-01…MS-10) added by
 * seed-sparrow-milestones-bonus.ts. Run AFTER that script:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-milestones-bonus.ts
 *
 * Note: the milestone sign-off endpoint (/milestones/:id/review) sets
 * status but — unlike a plain PATCH — does NOT stamp completedAt itself
 * (same gap the main dataset's finalize-sparrow-data.ts already routes
 * around for CR-2026-014). MS-05's completedAt is set directly here for
 * the same reason.
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { MS01, MS02, MS03, MS04, MS05, MS06, MS07, MS08, MS09 } from "./sparrow-milestones-bonus-data";

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

  async function backdateMilestoneActivity(milestoneId: number, dates: { created?: string; updated?: string }[]) {
    const rows = await pool.query(
      `SELECT id, type FROM activity WHERE entity_type='milestone' AND entity_id=$1 ORDER BY id ASC`, [milestoneId],
    );
    return rows.rows as { id: number; type: string }[];
  }

  try {
    // ── MS-01 — re-planned before work starts ──────────────────────────
    console.log("MS-01 — backdating CR-2026-021's replan history...");
    const m01 = idOf(manifest, "milestone", MS01.key);
    if (m01) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$3 WHERE id=$1`, [m01, MS01.createdDate, MS01.replanned.date]);
      const events = await backdateMilestoneActivity(m01, []);
      const dates = [MS01.createdDate, MS01.replanned.date]; // created, then the replan PATCH
      for (let i = 0; i < events.length && i < dates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [events[i].id, dates[i]]);
      }
    }
    const r01 = idOf(manifest, "risk", "ms01risk");
    if (r01) {
      await pool.query(`UPDATE risks SET created_at=$2, updated_at=$3, closed_at=$3 WHERE id=$1`, [r01, MS01.riskRaisedDate, MS01.riskClosedDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='risk' AND entity_id=$1 AND type='risk_created'`, [r01, MS01.riskRaisedDate]);
    }

    // ── MS-02 — sprint, completed clean ─────────────────────────────────
    console.log("MS-02 — backdating Sprint 7...");
    const m02 = idOf(manifest, "milestone", MS02.key);
    if (m02) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$3, completed_at=$3 WHERE id=$1`, [m02, MS02.startDate, MS02.completedDate]);
      const events = await backdateMilestoneActivity(m02, []);
      const dates = [MS02.startDate, MS02.completedDate];
      for (let i = 0; i < events.length && i < dates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [events[i].id, dates[i]]);
      }
    }

    // ── MS-03 — phase, completed clean ──────────────────────────────────
    console.log("MS-03 — backdating Phase 2...");
    const m03 = idOf(manifest, "milestone", MS03.key);
    if (m03) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$3, completed_at=$3 WHERE id=$1`, [m03, MS03.startDate, MS03.completedDate]);
      const events = await backdateMilestoneActivity(m03, []);
      const dates = [MS03.startDate, MS03.completedDate];
      for (let i = 0; i < events.length && i < dates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [events[i].id, dates[i]]);
      }
    }

    // ── MS-04 — cancelled ────────────────────────────────────────────────
    console.log("MS-04 — backdating CR-2026-022's cancellation...");
    const m04 = idOf(manifest, "milestone", MS04.key);
    if (m04) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$3 WHERE id=$1`, [m04, MS04.startDate, MS04.cancelledDate]);
      const events = await backdateMilestoneActivity(m04, []);
      const dates = [MS04.startDate, MS04.cancelledDate];
      for (let i = 0; i < events.length && i < dates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [events[i].id, dates[i]]);
      }
    }

    // ── MS-05 — reject → fix → approve ──────────────────────────────────
    console.log("MS-05 — backdating CR-2026-023's reject/re-approve cycle...");
    const m05 = idOf(manifest, "milestone", MS05.key);
    if (m05) {
      await pool.query(
        `UPDATE milestones SET created_at=$2, updated_at=$3, completed_at=$3 WHERE id=$1`,
        [m05, MS05.startDate, MS05.secondApproveDate],
      );
      const events = await pool.query(
        `SELECT id, type FROM activity WHERE entity_type='milestone' AND entity_id=$1 ORDER BY id ASC`, [m05],
      );
      for (const ev of events.rows as { id: number; type: string }[]) {
        let target: string | null = null;
        if (ev.type === "milestone_created") target = MS05.startDate;
        else if (ev.type === "milestone_rejected") target = MS05.firstRejectDate;
        else if (ev.type === "milestone_approved") target = MS05.secondApproveDate;
        if (target) await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [ev.id, target]);
      }
    }
    const uatFileId = idOf(manifest, "executionFile", "ms05uat");
    if (uatFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$3 WHERE id=$1`, [uatFileId, MS05.startDate, MS05.fixedDate]);
      await pool.query(`UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1`, [uatFileId, MS05.fixedDate]);
    }

    // ── MS-06 — deleted ──────────────────────────────────────────────────
    console.log("MS-06 — backdating CR-2026-024's created/deleted trail...");
    const m06 = idOf(manifest, "milestone", MS06.key);
    if (m06) {
      const events = await pool.query(
        `SELECT id, type FROM activity WHERE entity_type='milestone' AND entity_id=$1 ORDER BY id ASC`, [m06],
      );
      for (const ev of events.rows as { id: number; type: string }[]) {
        const target = ev.type === "milestone_created" ? MS06.createdDate : MS06.deletedDate;
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [ev.id, target]);
      }
    }

    // ── MS-07 — environment contention resolved proactively ────────────
    console.log("MS-07 — backdating the two ENV6-contention milestones...");
    const m07a = idOf(manifest, "milestone", MS07.keyA);
    const m07b = idOf(manifest, "milestone", MS07.keyB);
    if (m07a) await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [m07a, MS07.createdDate]);
    if (m07b) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$3 WHERE id=$1`, [m07b, MS07.createdDate, MS07.resolvedDate]);
      const events = await backdateMilestoneActivity(m07b, []);
      const dates = [MS07.createdDate, MS07.resolvedDate];
      for (let i = 0; i < events.length && i < dates.length; i++) {
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [events[i].id, dates[i]]);
      }
    }

    // ── MS-08 — vendor dependency delay ─────────────────────────────────
    console.log("MS-08 — backdating CR-2026-027's delayed start...");
    const m08 = idOf(manifest, "milestone", MS08.key);
    if (m08) await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [m08, MS08.createdDate]);
    const r08 = idOf(manifest, "risk", "ms08risk");
    if (r08) {
      await pool.query(`UPDATE risks SET created_at=$2, updated_at=$3, closed_at=$3 WHERE id=$1`, [r08, MS08.delayNoticedDate, MS08.resolvedDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='risk' AND entity_id=$1 AND type='risk_created'`, [r08, MS08.delayNoticedDate]);
    }

    // ── MS-09 — pure placeholder ─────────────────────────────────────────
    console.log("MS-09 — backdating CR-2026-028's creation date...");
    const m09 = idOf(manifest, "milestone", MS09.key);
    if (m09) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [m09, MS09.createdDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='milestone' AND entity_id=$1 AND type='milestone_created'`, [m09, MS09.createdDate]);
    }

    console.log("\nDone. Milestones-page bonus scenarios (MS-01…MS-10) are backdated.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
