/**
 * One-off backfill for the automatic milestone status feature (see
 * artifacts/api-server/src/lib/milestone-status.ts — keep this in sync with
 * that file's rules if either changes).
 *
 * From here on, status auto-advances live off specific writes (requirement
 * FA-approval, execution file create/approve/reject, test case results
 * saved, milestone sign-off, UAT sign-off upload). This script applies that
 * same logic once to every EXISTING milestone, since those historical writes
 * already happened before the auto-sync code existed and won't re-fire.
 *
 * Safe by default: with no flags it only PRINTS what would change. Nothing
 * is written until you pass --apply.
 *
 * Run on Replit Shell, once per environment (dev, then prod — each has its
 * own DATABASE_URL):
 *   cd scripts && npx tsx src/sync-milestone-statuses.ts             # preview
 *   cd scripts && npx tsx src/sync-milestone-statuses.ts --verbose   # preview + why each milestone did/didn't change
 *   cd scripts && npx tsx src/sync-milestone-statuses.ts --apply     # write
 */

import { Pool } from "pg";

const STATUS_RANK: Record<string, number> = {
  planned: 0,
  active: 1,
  verified: 2,
  uat: 3,
  completed: 4,
};

function isExecuted(result: string | null): boolean {
  const r = (result ?? "").toLowerCase();
  return r === "passed" || r === "pass" || r === "failed" || r === "fail" || r === "blocked";
}

async function computeTargetStatus(pool: Pool, m: {
  id: number;
  pipeline_enabled: boolean;
  requires_uat: boolean;
  signed_off_at: string | null;
}): Promise<{ target: string | null; debug: Record<string, unknown> }> {
  if (m.pipeline_enabled) {
    const { rows: files } = await pool.query<{ id: number; review_status: string }>(
      `SELECT id, review_status FROM execution_files WHERE milestone_id = $1`,
      [m.id],
    );
    if (files.length === 0) return { target: null, debug: { flow: "pipeline", executionFileCount: 0 } };

    const allFilesApproved = files.every((f) => f.review_status === "approved");

    const { rows: execRows } = await pool.query<{ result: string | null }>(
      `SELECT result FROM execution_test_cases WHERE execution_file_id = ANY($1::int[])`,
      [files.map((f) => f.id)],
    );
    const totalExecRows = execRows.length;
    const executedRows = execRows.filter((r) => isExecuted(r.result)).length;

    const signedOff = !!m.signed_off_at;
    const { rows: uatDocs } = await pool.query(`SELECT id FROM uat_signoffs WHERE milestone_id = $1`, [m.id]);
    const uatDocCount = uatDocs.length;

    const debug = {
      flow: "pipeline", executionFileCount: files.length, allFilesApproved,
      totalExecRows, executedRows, signedOff, requiresUat: m.requires_uat, uatDocCount,
    };
    if (signedOff && (!m.requires_uat || uatDocCount > 0)) return { target: "completed", debug };
    if (signedOff && m.requires_uat) return { target: "uat", debug };
    if (allFilesApproved && totalExecRows > 0 && executedRows >= totalExecRows) return { target: "verified", debug };
    return { target: "active", debug };
  }

  const { rows: approved } = await pool.query(
    `SELECT id FROM requirements WHERE milestone_id = $1 AND review_status = 'approved' LIMIT 1`,
    [m.id],
  );
  if (approved.length === 0) return { target: null, debug: { flow: "normal", approvedRequirementExists: false } };

  async function rollup(fileType: "qa" | "uat") {
    const { rows } = await pool.query<{ result: string | null }>(
      `SELECT etc.result FROM execution_test_cases etc
       JOIN execution_files ef ON ef.id = etc.execution_file_id
       WHERE ef.milestone_id = $1 AND ef.file_type = $2`,
      [m.id, fileType],
    );
    const tcCount = rows.length;
    let failed = 0, blocked = 0, notRun = 0;
    for (const r of rows) {
      const v = (r.result ?? "").toLowerCase();
      if (v === "failed" || v === "fail") failed++;
      else if (v === "blocked") blocked++;
      else if (!isExecuted(r.result)) notRun++;
    }
    return { tcCount, failed, blocked, notRun };
  }

  const qa = await rollup("qa");
  const uat = await rollup("uat");
  const qaAllPassed = qa.tcCount > 0 && qa.failed === 0 && qa.blocked === 0 && qa.notRun === 0;
  const uatAllPassed = uat.tcCount > 0 && uat.failed === 0 && uat.blocked === 0 && uat.notRun === 0;
  const uatStarted = uat.tcCount > 0;

  const debug = { flow: "normal", qa, uat, qaAllPassed, uatAllPassed, uatStarted, requiresUat: m.requires_uat };
  if (qaAllPassed && (!m.requires_uat || uatAllPassed)) return { target: "completed", debug };
  if (qaAllPassed && m.requires_uat && uatStarted && !uatAllPassed) return { target: "uat", debug };
  if (qaAllPassed) return { target: "verified", debug };
  return { target: "active", debug };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const verbose = process.argv.includes("--verbose");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const pool = new Pool({ connectionString: dbUrl });
  try {
    const { rows: milestones } = await pool.query<{
      id: number; name: string; status: string; pipeline_enabled: boolean;
      requires_uat: boolean; signed_off_at: string | null;
    }>(
      `SELECT id, name, status, pipeline_enabled, requires_uat, signed_off_at
       FROM milestones WHERE status <> 'cancelled' ORDER BY id`,
    );
    console.log(`${apply ? "Applying" : "Previewing"} auto-status sync across ${milestones.length} milestone(s) (excluding cancelled)...\n`);

    let changed = 0;
    for (const m of milestones) {
      const { target, debug } = await computeTargetStatus(pool, m);
      const wouldChange = !!target && (STATUS_RANK[target] ?? -1) > (STATUS_RANK[m.status] ?? -1);

      if (verbose) {
        console.log(`  #${m.id} "${m.name}" [current: ${m.status}, computed: ${target ?? "planned (no signal yet)"}${wouldChange ? " -> CHANGES" : ""}]`);
        console.log(`      ${JSON.stringify(debug)}`);
      }

      if (!wouldChange) continue;

      changed++;
      if (!verbose) console.log(`  #${m.id} "${m.name}": ${m.status} -> ${target}`);
      if (apply) {
        if (target === "completed") {
          await pool.query(`UPDATE milestones SET status = $1, completed_at = NOW() WHERE id = $2`, [target, m.id]);
        } else {
          await pool.query(`UPDATE milestones SET status = $1 WHERE id = $2`, [target, m.id]);
        }
        await pool.query(
          `INSERT INTO activity (type, description, user_id, entity_id, entity_type, old_value, new_value, created_at)
           VALUES ($1, $2, NULL, $3, 'milestone', $4, $5, NOW())`,
          [
            "milestone_status_auto",
            `Milestone "${m.name}" automatically moved to ${target}`,
            m.id,
            JSON.stringify({ status: m.status }),
            JSON.stringify({ status: target }),
          ],
        ).catch(() => {}); // best-effort audit row — never block the actual status fix on it
      }
    }

    console.log(`\n${changed} milestone(s) ${apply ? "updated" : "would change"}.`);
    if (!apply && changed > 0) {
      console.log("Re-run with --apply to write these changes.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
