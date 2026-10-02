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
import { eq, and } from "drizzle-orm";
import {
  db,
  milestonesTable,
  milestoneAssigneesTable,
  requirementsTable,
} from "@workspace/db";
import { logActivity } from "../routes/_audit";
import { notifyUser } from "../routes/_notify";
import { rollupExecutionByMilestone } from "../routes/dashboard";
import { loadPipelineFacts } from "./pipeline-facts";

const STATUS_RANK: Record<string, number> = {
  planned: 0,
  active: 1,
  verified: 2,
  uat: 3,
  completed: 4,
  cancelled: 99, // never auto-touched, but ranked highest so nothing "advances" past it
};

async function computeTargetStatus(m: typeof milestonesTable.$inferSelect): Promise<string | null> {
  if (m.pipelineEnabled) {
    // Same counting rules as the pipeline stepper and Step 8 (QA files only,
    // group rows excluded) — see lib/pipeline-facts.ts.
    const f = await loadPipelineFacts(m.id);
    if (f.qaFileCount === 0) return null; // still 'planned' — no test cases written yet

    const allFilesApproved = f.approvedQaFileCount === f.qaFileCount;
    const allExecuted = f.totalExecRows > 0 && f.executedRows >= f.totalExecRows;

    // Never 'completed' from here: closing a pipeline is the explicit
    // "Mark Milestone as DEPLOYED" action at Step 8, which is gated on every
    // earlier step. Auto-completing on sign-off used to lock the pipeline
    // before Step 8's checklist and artifacts could ever be used.
    if (m.signedOffAt && m.requiresUat) return "uat";
    if (m.signedOffAt || (allFilesApproved && allExecuted)) return "verified";
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

    // CR102 — the system moved it on its own, so nobody else would know:
    // tell the team and the milestone's author.
    const team = await db.select({ userId: milestoneAssigneesTable.userId }).from(milestoneAssigneesTable)
      .where(eq(milestoneAssigneesTable.milestoneId, milestoneId));
    const recipients = new Set<number>(team.map((t) => t.userId));
    if (m.createdBy != null) recipients.add(m.createdBy);
    await Promise.all([...recipients].map((uid) =>
      notifyUser(uid, "Milestone status changed", `"${m.name}" moved from ${m.status} to ${target} automatically.`, "milestone_updated", "milestone", milestoneId, null).catch(() => {}),
    ));
  } catch (err) {
    console.error(`syncMilestoneStatus(${milestoneId}) failed:`, err);
  }
}
