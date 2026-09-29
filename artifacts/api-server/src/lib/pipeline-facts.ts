/**
 * Single source of truth for the QA Deployment Pipeline's gates.
 *
 * The stepper rail, Step 6's sign-off guard, Step 8's readiness checklist,
 * the server-side deploy gate and the automatic milestone status all read
 * these facts, so they can no longer disagree with each other about whether
 * a step is done.
 *
 * Counting rules:
 *  - Only QA execution files count. UAT execution belongs to UAT (Step 7).
 *  - Group rows are section banners, never carry a result, and are excluded.
 *  - Executed  = passed / pass / failed / fail / blocked. "In Progress" is NOT
 *    executed — the test case hasn't produced a result yet.
 *  - Not passed = failed / fail / blocked.
 *
 * Outcome of execution:
 *  - full        — 100% executed and 100% passed
 *  - conditional — 100% executed, at least one failed/blocked ("Conditional
 *                  Pass" at Step 5, "Conditional Sign Off" at Steps 6 and 8)
 *  - incomplete  — some test cases not yet executed
 *  - none        — nothing to execute yet
 */
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import {
  db,
  milestonesTable,
  requirementsTable,
  executionFilesTable,
  executionTestCasesTable,
  uatSignoffsTable,
} from "@workspace/db";

type Milestone = typeof milestonesTable.$inferSelect;

export type ExecutionOutcome = "none" | "incomplete" | "full" | "conditional";

export interface PipelineFacts {
  reqs: { id: number; reviewStatus: string | null }[];
  execFiles: { id: number; fileType: string | null; reviewStatus: string | null }[];
  requirementCount: number;
  qaFileCount: number;
  approvedQaFileCount: number;
  totalExecRows: number;
  executedRows: number;
  failedRows: number;
  uatDocCount: number;
}

const resultExpr = sql`lower(trim(coalesce(${executionTestCasesTable.result}, '')))`;

export async function loadPipelineFacts(milestoneId: number): Promise<PipelineFacts> {
  const reqs = await db.select({ id: requirementsTable.id, reviewStatus: requirementsTable.reviewStatus })
    .from(requirementsTable).where(eq(requirementsTable.milestoneId, milestoneId));
  const execFiles = await db
    .select({ id: executionFilesTable.id, fileType: executionFilesTable.fileType, reviewStatus: executionFilesTable.reviewStatus })
    .from(executionFilesTable).where(eq(executionFilesTable.milestoneId, milestoneId));

  const qaFiles = execFiles.filter((f) => (f.fileType ?? "qa") === "qa");
  const qaFileIds = qaFiles.map((f) => f.id);

  const [tally] = qaFileIds.length
    ? await db
        .select({
          total: sql<number>`count(*)::int`,
          executed: sql<number>`count(*) filter (where ${resultExpr} in ('passed', 'pass', 'failed', 'fail', 'blocked'))::int`,
          failed: sql<number>`count(*) filter (where ${resultExpr} in ('failed', 'fail', 'blocked'))::int`,
        })
        .from(executionTestCasesTable)
        .where(and(
          inArray(executionTestCasesTable.executionFileId, qaFileIds),
          ne(executionTestCasesTable.rowType, "group"),
        ))
    : [{ total: 0, executed: 0, failed: 0 }];

  const uatDocs = await db.select({ id: uatSignoffsTable.id })
    .from(uatSignoffsTable).where(eq(uatSignoffsTable.milestoneId, milestoneId));

  return {
    reqs,
    execFiles,
    requirementCount: reqs.length,
    qaFileCount: qaFiles.length,
    approvedQaFileCount: qaFiles.filter((f) => f.reviewStatus === "approved").length,
    totalExecRows: tally?.total ?? 0,
    executedRows: tally?.executed ?? 0,
    failedRows: tally?.failed ?? 0,
    uatDocCount: uatDocs.length,
  };
}

export function executionOutcome(f: Pick<PipelineFacts, "totalExecRows" | "executedRows" | "failedRows">): ExecutionOutcome {
  if (f.totalExecRows === 0) return "none";
  if (f.executedRows < f.totalExecRows) return "incomplete";
  return f.failedRows > 0 ? "conditional" : "full";
}

/** Whether the recorded functional sign-off was conditional. Uses the frozen
 *  snapshot; sign-offs recorded before the snapshot existed fall back to the
 *  live failed/blocked count. */
export function isConditionalSignoff(m: Milestone, f: Pick<PipelineFacts, "failedRows">): boolean {
  if (!m.signedOffAt) return false;
  if (m.signoffType) return m.signoffType === "conditional";
  return f.failedRows > 0;
}

export interface DeployCheck {
  step: number;
  label: string;
  ok: boolean;
  detail: string;
}

/** Everything Step 8 requires before a pipeline can be marked as deployed.
 *  Rendered by Step 8 and enforced by PATCH /milestones/:id. */
export function computeDeployChecks(m: Milestone, f: PipelineFacts, signerName: string | null): DeployCheck[] {
  const pendingApproval = f.qaFileCount - f.approvedQaFileCount;
  const notExecuted = f.totalExecRows - f.executedRows;
  const checks: DeployCheck[] = [
    {
      step: 2,
      label: "Requirements synced",
      ok: f.requirementCount > 0,
      detail: f.requirementCount > 0
        ? `${f.requirementCount} requirement(s) linked`
        : "No requirements linked to this milestone",
    },
    {
      step: 3,
      label: "Test cases compiled for execution",
      ok: f.qaFileCount > 0,
      detail: f.qaFileCount > 0
        ? `${f.qaFileCount} execution file(s) compiled`
        : "No test cases compiled into an execution file",
    },
    {
      step: 4,
      label: "Test cases approved",
      ok: f.qaFileCount > 0 && pendingApproval === 0,
      detail: f.qaFileCount === 0
        ? "Nothing to approve yet"
        : pendingApproval === 0
          ? "All execution files approved"
          : `${pendingApproval} of ${f.qaFileCount} file(s) still awaiting approval`,
    },
    {
      step: 5,
      label: "Test execution finished",
      ok: f.totalExecRows > 0 && notExecuted === 0,
      detail: f.totalExecRows === 0
        ? "No test cases to execute yet"
        : notExecuted === 0
          ? `All ${f.totalExecRows} test case(s) executed${f.failedRows > 0 ? ` — ${f.failedRows} failed/blocked (Conditional Pass)` : ""}`
          : `${notExecuted} of ${f.totalExecRows} test case(s) not executed yet`,
    },
    {
      step: 6,
      label: "Functional testing signed off",
      ok: !!m.signedOffAt,
      detail: m.signedOffAt
        ? `${isConditionalSignoff(m, f) ? "Conditional sign off" : "Signed off"} by ${signerName ?? "a QA authority"}`
        : "Awaiting formal QA sign-off",
    },
  ];
  // UAT is only a gate when the milestone was configured to require it.
  if (m.requiresUat) {
    checks.push({
      step: 7,
      label: "UAT sign-off document uploaded",
      ok: f.uatDocCount > 0,
      detail: f.uatDocCount > 0
        ? `${f.uatDocCount} UAT document(s) on record`
        : "No UAT sign-off document uploaded",
    });
  }
  return checks;
}
