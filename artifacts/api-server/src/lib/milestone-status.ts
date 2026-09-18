/**
 * Automatic milestone status. There's no dedicated team keeping this field
 * current by hand, so it's derived from real signals already recorded
 * elsewhere (requirement review state, execution file review, recorded
 * results, functional/UAT sign-off) instead of relying on a PM to update it.
 *
 * The 6-value lifecycle (see milestones.ts VALID_STATUSES, CR054p1):
 *   planned -> active -> verified (QA passed) -> uat (business testing) -> completed
 * with 'cancelled' reachable manually at any point.
 *
 * Rules:
 *  - 'cancelled' is never touched — that's an explicit human decision.
 *  - Transitions only ever move forward (planned -> ... -> completed). A
 *    milestone someone manually pushed further ahead than the computed
 *    signals justify is left alone rather than pulled back.
 *  - Each call recomputes the *highest* status the current data justifies
 *    and jumps straight there — it does not require passing through every
 *    intermediate status one sync at a time.
 *
 * Called after the specific writes that can actually move these signals
 * (requirement FA-approval, execution file create/approve/reject, test case
 * results saved, milestone sign-off, UAT sign-off upload) — not on every
 * read, so this never turns a GET into a write.
 */
import { eq, and, inArray } from "drizzle-orm";
import {
  db,
  milestonesTable,
  requirementsTable,
  executionFilesTable,
  executionTestCasesTable,
  uatSignoffsTable,
} from "@workspace/db";
import { logActivity } from "../routes/_audit";
import { rollupExecutionByMilestone } from "../routes/dashboard";

const STATUS_RANK: Record<string, number> = {
  planned: 0,
  active: 1,
  verified: 2,
  uat: 3,
  completed: 4,
  cancelled: 99, // never auto-touched, but ranked highest so nothing "advances" past it
};

function isExecuted(result: string | null): boolean {
  const r = result?.toLowerCase() ?? "";
  return r === "passed" || r === "pass" || r === "failed" || r === "fail" || r === "blocked";
}

async function computeTargetStatus(m: typeof milestonesTable.$inferSelect): Promise<string | null> {
  if (m.pipelineEnabled) {
    const files = await db
      .select({ id: executionFilesTable.id, reviewStatus: executionFilesTable.reviewStatus })
      .from(executionFilesTable)
      .where(eq(executionFilesTable.milestoneId, m.id));
    if (files.length === 0) return null; // still 'planned' — no test cases written yet

    const allFilesApproved = files.every((f) => f.reviewStatus === "approved");

    const execRows = await db
      .select({ result: executionTestCasesTable.result })
      .from(executionTestCasesTable)
      .where(inArray(executionTestCasesTable.executionFileId, files.map((f) => f.id)));
    const totalExecRows = execRows.length;
    const executedRows = execRows.filter((r) => isExecuted(r.result)).length;

    const signedOff = !!m.signedOffAt;
    const uatDocCount = (await db.select({ id: uatSignoffsTable.id }).from(uatSignoffsTable).where(eq(uatSignoffsTable.milestoneId, m.id))).length;

    if (signedOff && (!m.requiresUat || uatDocCount > 0)) return "completed";
    if (signedOff && m.requiresUat) return "uat";
    if (allFilesApproved && totalExecRows > 0 && executedRows >= totalExecRows) return "verified";
    return "active";
  }

  // Normal flow — driven by requirement review state and recorded QA/UAT results.
  const [approvedReq] = await db
    .select({ id: requirementsTable.id })
    .from(requirementsTable)
    .where(and(eq(requirementsTable.milestoneId, m.id), eq(requirementsTable.reviewStatus, "approved")))
    .limit(1);
  if (!approvedReq) return null; // still 'planned' — nothing past FA review yet

  const [qaRollup, uatRollup] = await Promise.all([
    rollupExecutionByMilestone([m.id], "qa"),
    rollupExecutionByMilestone([m.id], "uat"),
  ]);
  const qa = qaRollup.get(m.id);
  const uat = uatRollup.get(m.id);
  const qaAllPassed = !!qa && qa.tcCount > 0 && qa.failed === 0 && qa.blocked === 0 && qa.notRun === 0;
  const uatAllPassed = !!uat && uat.tcCount > 0 && uat.failed === 0 && uat.blocked === 0 && uat.notRun === 0;
  const uatStarted = !!uat && uat.tcCount > 0;

  if (qaAllPassed && (!m.requiresUat || uatAllPassed)) return "completed";
  if (qaAllPassed && m.requiresUat && uatStarted && !uatAllPassed) return "uat";
  if (qaAllPassed) return "verified";
  return "active";
}

/** Recompute and, if warranted, advance one milestone's status. Best-effort —
 *  never throws, so a call site's own success response is never put at risk
 *  by this. */
export async function syncMilestoneStatus(milestoneId: number): Promise<void> {
  try {
    const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
    if (!m || m.status === "cancelled") return;

    const target = await computeTargetStatus(m);
    if (!target) return;
    if ((STATUS_RANK[target] ?? -1) <= (STATUS_RANK[m.status] ?? -1)) return;

    const now = new Date();
    await db
      .update(milestonesTable)
      .set({
        status: target,
        completedAt: target === "completed" ? now : m.completedAt,
      })
      .where(eq(milestonesTable.id, milestoneId));

    await logActivity({
      type: "milestone_status_auto",
      description: `Milestone "${m.name}" automatically moved to ${target}`,
      userId: null,
      entityId: milestoneId,
      entityType: "milestone",
      oldValue: { status: m.status },
      newValue: { status: target },
    }).catch(() => {});
  } catch (err) {
    console.error(`syncMilestoneStatus(${milestoneId}) failed:`, err);
  }
}
