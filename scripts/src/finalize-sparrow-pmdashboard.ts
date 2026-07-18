/**
 * Backdates the PM Dashboard "cautionary tale" storyline (CR-2026-020)
 * added by seed-sparrow-pmdashboard.ts. Every date is a "days ago from
 * whenever THIS SCRIPT actually runs" offset — not a shifted historical
 * narrative — so the milestone reads as genuinely, currently overdue no
 * matter when it's actually run (dashboard.ts's computeScheduleRisk
 * compares targetDate against the real Date.now()).
 *
 * Run AFTER seed-sparrow-pmdashboard.ts:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-pmdashboard.ts
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { MILESTONE_PM, REQ_PM, PM_TEST_CASES, SIT_PM_FILE, UAT_PM_FILE, PM_DEFECTS, PM_RISK, PM_TASKS } from "./sparrow-pmdashboard-data";

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

  try {
    // ── Milestone ─────────────────────────────────────────────────────────
    console.log("Backdating CR-2026-020's created/updated timestamps...");
    const milestoneId = idOf(manifest, "milestone", MILESTONE_PM.key);
    if (milestoneId) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [milestoneId, daysAgo(MILESTONE_PM.createdDaysAgo)]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='milestone' AND entity_id=$1 AND type='milestone_created'`, [milestoneId, daysAgo(MILESTONE_PM.createdDaysAgo)]);
    }

    // ── Requirement — 2 full review/dev cycles ───────────────────────────
    console.log("Backdating REQ-201's two-cycle requirement→dev→QA history...");
    const reqId = idOf(manifest, "requirement", REQ_PM.key);
    if (reqId) {
      const latestApprove = daysAgo(REQ_PM.cycle2.approveDaysAgo);
      const latestDevAssign = daysAgo(REQ_PM.cycle2.devAssignDaysAgo);
      const latestReadyForQa = daysAgo(REQ_PM.cycle2.readyForQaDaysAgo);
      await pool.query(
        `UPDATE requirements SET created_at=$2, updated_at=$3, approved_at=$4, dev_assigned_at=$5, ready_for_qa_at=$6 WHERE id=$1`,
        [reqId, daysAgo(REQ_PM.createdDaysAgo), latestReadyForQa, latestApprove, latestDevAssign, latestReadyForQa],
      );

      const perType: Record<string, string[]> = {
        requirement_created: [daysAgo(REQ_PM.createdDaysAgo)],
        requirement_submit: [daysAgo(REQ_PM.cycle1.submitDaysAgo), daysAgo(REQ_PM.scopeChange.resubmitDaysAgo)],
        requirement_approve: [daysAgo(REQ_PM.cycle1.approveDaysAgo), daysAgo(REQ_PM.cycle2.approveDaysAgo)],
        requirement_dev_assign: [daysAgo(REQ_PM.cycle1.devAssignDaysAgo), daysAgo(REQ_PM.cycle2.devAssignDaysAgo)],
        requirement_dev_start: [daysAgo(REQ_PM.cycle1.devStartDaysAgo), daysAgo(REQ_PM.cycle2.devStartDaysAgo)],
        requirement_dev_ready_for_qa: [daysAgo(REQ_PM.cycle1.readyForQaDaysAgo), daysAgo(REQ_PM.cycle2.readyForQaDaysAgo)],
        requirement_updated: [daysAgo(REQ_PM.scopeChange.resubmitDaysAgo)],
        requirement_revised: [daysAgo(REQ_PM.scopeChange.resubmitDaysAgo)],
      };
      const cursor: Record<string, number> = {};
      const events = await pool.query(`SELECT id, type FROM activity WHERE entity_type='requirement' AND entity_id=$1 ORDER BY id ASC`, [reqId]);
      for (const ev of events.rows as { id: number; type: string }[]) {
        const queue = perType[ev.type];
        if (!queue) continue;
        const i = cursor[ev.type] ?? 0;
        if (i >= queue.length) continue;
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [ev.id, queue[i]]);
        cursor[ev.type] = i + 1;
      }
      console.log(`  + REQ-201: ${events.rowCount} activity rows backdated across 2 cycles`);
    }

    // ── Test cases ────────────────────────────────────────────────────────
    console.log("Backdating the 6 loyalty-rewards test cases...");
    for (const tc of PM_TEST_CASES) {
      const id = idOf(manifest, "testCase", tc.key);
      if (!id) continue;
      await pool.query(`UPDATE test_cases SET created_at=$2, updated_at=$2 WHERE id=$1`, [id, daysAgo(52)]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='test_case' AND entity_id=$1 AND type='test_case_created'`, [id, daysAgo(52)]);
    }

    // ── Execution files + rows (only the FINAL round's date matters per
    // row — every row is only ever "currently" at its last-touched state) ─
    console.log("Backdating the SIT and UAT execution files...");
    const sitFileId = idOf(manifest, "executionFile", "pm-sit");
    if (sitFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$3 WHERE id=$1`, [sitFileId, daysAgo(48), daysAgo(14)]);
      await pool.query(`UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1`, [sitFileId, daysAgo(14)]);
    }
    const uatFileId = idOf(manifest, "executionFile", "pm-uat");
    if (uatFileId) {
      await pool.query(`UPDATE execution_files SET created_at=$2, updated_at=$2 WHERE id=$1`, [uatFileId, daysAgo(10)]);
      await pool.query(`UPDATE execution_test_cases SET executed_at=$2 WHERE execution_file_id=$1`, [uatFileId, daysAgo(10)]);
    }

    // ── Defects ───────────────────────────────────────────────────────────
    console.log("Backdating DEF-P1…P7...");
    for (const d of PM_DEFECTS) {
      const id = idOf(manifest, "defect", d.key);
      if (!id) continue;
      const opened = daysAgo(d.openedDaysAgo);
      const updated = d.closedDaysAgo !== undefined ? daysAgo(d.closedDaysAgo) : opened;
      const status = d.closedDaysAgo !== undefined ? "Closed" : "Open";
      await pool.query(`UPDATE defects SET created_at=$2, updated_at=$3, status=$4, status_synced_at=$3 WHERE id=$1`, [id, opened, updated, status]);
      const events = await pool.query(`SELECT id, type FROM activity WHERE entity_type='defect' AND entity_id=$1 ORDER BY id ASC`, [id]);
      for (const ev of events.rows as { id: number; type: string }[]) {
        const target = ev.type === "defect_created" ? opened : updated;
        await pool.query(`UPDATE activity SET created_at=$2 WHERE id=$1`, [ev.id, target]);
      }
    }
    const stillOpen = PM_DEFECTS.filter((d) => d.closedDaysAgo === undefined).length;
    console.log(`  + ${PM_DEFECTS.length} defects backdated (${stillOpen} still open today)`);

    // ── Risk ──────────────────────────────────────────────────────────────
    console.log("Backdating the schedule risk...");
    const riskId = idOf(manifest, "risk", "pmrisk");
    if (riskId) {
      const raised = daysAgo(PM_RISK.raisedDaysAgo);
      await pool.query(`UPDATE risks SET created_at=$2, updated_at=$2 WHERE id=$1`, [riskId, raised]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='risk' AND entity_id=$1 AND type='risk_created'`, [riskId, raised]);
    }

    // ── Tasks ─────────────────────────────────────────────────────────────
    console.log("Backdating milestone tasks...");
    for (const t of PM_TASKS) {
      const id = idOf(manifest, "task", t.key);
      if (!id) continue;
      await pool.query(`UPDATE tasks SET created_at=$2, updated_at=$2 WHERE id=$1`, [id, daysAgo(t.startDaysAgo)]);
    }

    console.log("\nDone. The PM Dashboard storyline (CR-2026-020) is backdated — it should now show as overdue/at-risk with 2 rework cycles.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
