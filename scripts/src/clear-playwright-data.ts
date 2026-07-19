/**
 * Clears every entity created by the qa-automation Playwright suite,
 * keeping ALL users intact and never touching the demo dataset
 * (seed-demo-data.ts) or the SPARROW dataset (seed-sparrow-data.ts).
 *
 * Unlike clear-demo-data.ts / clear-sparrow-data.ts, there's no manifest to
 * replay — the Playwright suite runs hundreds of times across many
 * throwaway requirements/defects/executions/etc., so instead this targets
 * data structurally:
 *
 *   - everything scoped to the "PW Automation" project (id resolved by
 *     name, not hardcoded)
 *   - every "PW-%" named module (execution_modules), e.g. PW-Alpha,
 *     PW-Beta, and the ad-hoc PW-Gamma and PW-Orphan ones some negative
 *     tests create
 *   - as a safety net, any row whose title/name starts with "PW " or
 *     "PW-" even without a project_id set (some test paths — e.g. a
 *     requirement-defect — never set one). Every entity the suite creates
 *     goes through qa-automation's uniq() helper, which always prefixes
 *     with "PW " or "PW-"; neither the demo dataset (realistic titles like
 *     "User login with email and password") nor SPARROW (RQ- and TX-
 *     prefixed scenario titles) uses that convention anywhere.
 *
 * Kept untouched, always:
 *   - the `users` table (every account — pw.*@qapulse.test test actors AND
 *     the *@qapulse.org org hierarchy — survives so nothing needs
 *     re-provisioning)
 *   - the SPARROW project and everything in it
 *   - the demo dataset and everything in it
 *   - roles / role_nav_permissions (bootstrap-owned config)
 *   - the activity log (audit trail is meant to be an immutable historical
 *     record — same call clear-sparrow-data.ts makes)
 *
 * Dry-run by default — prints exactly what would be deleted and exits.
 * Add CONFIRM_CLEAR=yes to actually execute (same safety gate convention
 * as clear-all-data.ts's CONFIRM_WIPE).
 *
 * Run from the Replit shell:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/clear-playwright-data.ts              # dry run
 *   DATABASE_URL=$DATABASE_URL CONFIRM_CLEAR=yes npx tsx src/clear-playwright-data.ts
 */

import { Pool } from "pg";

const PROJECT_NAME = "PW Automation";
// Matches every uniq()-generated title/name ("PW req-...", "PW-Gamma-...")
// even when a row's project_id wasn't set — see header comment.
const PW_PREFIX = "PW %";
const PW_HYPHEN_PREFIX = "PW-%";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");
  const confirmed = process.env.CONFIRM_CLEAR === "yes";

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const projectRes = await client.query<{ id: number }>(
      `SELECT id FROM projects WHERE name = $1 LIMIT 1`,
      [PROJECT_NAME],
    );
    const projectId = projectRes.rows[0]?.id ?? -1; // -1 matches nothing, keeps the OR-title-prefix path working even if the project itself was already removed

    const moduleRes = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM execution_modules WHERE name LIKE $1`,
      [PW_HYPHEN_PREFIX],
    );
    const moduleIds = moduleRes.rows.map((r) => r.id);

    const scoped = (table: string, titleCol: string, extra = "") => client.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE (project_id = $1 OR ${titleCol} LIKE $2 OR ${titleCol} LIKE $3)${extra}`,
      [projectId, PW_PREFIX, PW_HYPHEN_PREFIX],
    );

    const [requirements, defects, testCases, milestones, risks, tasks] = await Promise.all([
      scoped("requirements", "title"),
      scoped("defects", "title"),
      scoped("test_cases", "title"),
      scoped("milestones", "name"),
      scoped("risks", "title"),
      scoped("tasks", "name"),
    ]);
    const executionFiles = await client.query<{ id: number; redmine_ticket_id: string }>(
      `SELECT id, redmine_ticket_id FROM execution_files WHERE project_id = $1 OR title LIKE $2 OR title LIKE $3 OR redmine_ticket_id LIKE $2 OR redmine_ticket_id LIKE $3`,
      [projectId, PW_PREFIX, PW_HYPHEN_PREFIX],
    );
    const documentRegister = await client.query<{ id: number }>(
      `SELECT id FROM document_register WHERE project_name = $1`,
      [PROJECT_NAME],
    );

    const reqIds = requirements.rows.map((r) => r.id);
    const defectIds = defects.rows.map((r) => r.id);
    const tcIds = testCases.rows.map((r) => r.id);
    const milestoneIds = milestones.rows.map((r) => r.id);
    const riskIds = risks.rows.map((r) => r.id);
    const taskIds = tasks.rows.map((r) => r.id);
    const fileIds = executionFiles.rows.map((r) => r.id);
    const ticketIds = executionFiles.rows.map((r) => r.redmine_ticket_id);
    const docIds = documentRegister.rows.map((r) => r.id);

    console.log(`Target project: "${PROJECT_NAME}" ${projectId === -1 ? "(not found — clearing by name-prefix only)" : `(#${projectId})`}`);
    console.log(`\nFound:`);
    console.log(`  ${reqIds.length} requirement(s)`);
    console.log(`  ${defectIds.length} defect(s)`);
    console.log(`  ${fileIds.length} execution file(s)`);
    console.log(`  ${tcIds.length} library test case(s)`);
    console.log(`  ${milestoneIds.length} milestone(s)`);
    console.log(`  ${riskIds.length} risk(s)`);
    console.log(`  ${taskIds.length} task(s)`);
    console.log(`  ${docIds.length} document register entr(y/ies)`);
    console.log(`  ${moduleIds.length} PW-* module(s): ${moduleRes.rows.map((m) => m.name).join(", ") || "none"}`);
    console.log(`\nUsers: untouched (0 will be deleted, by design).`);

    if (!confirmed) {
      console.log("\nDry run only — nothing was deleted.");
      console.log("To execute, re-run with CONFIRM_CLEAR=yes");
      return;
    }

    if (
      reqIds.length === 0 && defectIds.length === 0 && fileIds.length === 0 &&
      tcIds.length === 0 && milestoneIds.length === 0 && riskIds.length === 0 &&
      taskIds.length === 0 && docIds.length === 0 && moduleIds.length === 0 &&
      projectId === -1
    ) {
      console.log("\nNothing to clear.");
      return;
    }

    console.log("\nClearing...");
    await client.query("BEGIN");
    try {
      // Children first — most of these columns have no FK/cascade defined
      // at all, so Postgres won't stop us skipping a step, it'll just leave
      // silent orphan rows behind if we do.
      await client.query(`DELETE FROM requirement_attachments WHERE requirement_id = ANY($1)`, [reqIds]);
      await client.query(`DELETE FROM requirement_comments WHERE requirement_id = ANY($1)`, [reqIds]);
      // messages cascades from conversations automatically (FK ON DELETE CASCADE)
      await client.query(`DELETE FROM conversations WHERE entity_type = 'requirement' AND entity_id = ANY($1)`, [reqIds]);
      await client.query(`DELETE FROM execution_tc_history WHERE execution_file_id = ANY($1)`, [fileIds]);
      await client.query(`DELETE FROM milestone_risk_assessments WHERE milestone_id = ANY($1)`, [milestoneIds]);
      await client.query(`DELETE FROM milestone_assignees WHERE milestone_id = ANY($1)`, [milestoneIds]);
      await client.query(`DELETE FROM uat_signoffs WHERE milestone_id = ANY($1)`, [milestoneIds]);

      // Dangling inbox links for whoever still holds an account (users are
      // never deleted, so leaving these would show dead "Go to" links).
      await client.query(
        `DELETE FROM notifications WHERE
           (entity_type = 'requirement' AND entity_id = ANY($1)) OR
           (entity_type = 'defect' AND entity_id = ANY($2)) OR
           (entity_type = 'execution_file' AND entity_id = ANY($3)) OR
           (entity_type = 'milestone' AND entity_id = ANY($4)) OR
           (entity_type = 'risk' AND entity_id = ANY($5)) OR
           (entity_type = 'task' AND entity_id = ANY($6)) OR
           (entity_type = 'test_case' AND entity_id = ANY($7))`,
        [reqIds, defectIds, fileIds, milestoneIds, riskIds, taskIds, tcIds],
      );

      // defect_links cascades from defects (FK ON DELETE CASCADE)
      await client.query(`DELETE FROM defects WHERE id = ANY($1)`, [defectIds]);
      // execution_test_cases + execution_file_audit cascade from execution_files
      await client.query(`DELETE FROM execution_files WHERE id = ANY($1)`, [fileIds]);
      // keyed by redmine_ticket_id text, not FK'd to execution_files.id
      await client.query(`DELETE FROM execution_summaries WHERE redmine_ticket_id = ANY($1)`, [ticketIds]);
      await client.query(`DELETE FROM test_cases WHERE id = ANY($1)`, [tcIds]);
      await client.query(`DELETE FROM requirements WHERE id = ANY($1)`, [reqIds]);
      await client.query(`DELETE FROM risks WHERE id = ANY($1)`, [riskIds]);
      // task_events cascades from tasks (FK ON DELETE CASCADE)
      await client.query(`DELETE FROM tasks WHERE id = ANY($1)`, [taskIds]);
      await client.query(`DELETE FROM milestones WHERE id = ANY($1)`, [milestoneIds]);
      await client.query(`DELETE FROM document_register WHERE id = ANY($1)`, [docIds]);

      if (projectId !== -1) {
        await client.query(`DELETE FROM project_members WHERE project_id = $1`, [projectId]);
        await client.query(`DELETE FROM project_modules WHERE project_id = $1 OR module_id = ANY($2)`, [projectId, moduleIds]);
      } else {
        await client.query(`DELETE FROM project_modules WHERE module_id = ANY($1)`, [moduleIds]);
      }
      await client.query(`DELETE FROM execution_modules WHERE id = ANY($1)`, [moduleIds]);
      if (projectId !== -1) {
        await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    console.log("\nDone. All Playwright testing data cleared — users, demo data, and SPARROW data untouched.");
    console.log("The next Playwright run will recreate \"PW Automation\" + its modules fresh (global-setup.ts is idempotent).");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nClear failed:", err.message);
  console.error("Any partial work was rolled back — safe to re-run.");
  process.exit(1);
});
