/**
 * A single, continuous "what happens when it goes wrong" storyline for the
 * PM Dashboard — a NEW milestone (CR-2026-020) that repeats the
 * requirement → dev → QA → requirement → dev → QA cycle because of a
 * mid-flight scope change and a critical regression, and is still active
 * and overdue TODAY. This is deliberately the opposite of CR-2026-014's
 * clean success story — a cautionary tale for the same PM Dashboard.
 *
 * Every date is a "days ago from whenever finalize-sparrow-pmdashboard.ts
 * actually runs" offset (same trick as TX-11/DX-01/DX-09) — NOT a shifted
 * historical narrative date — so the milestone reads as genuinely,
 * currently overdue (computeScheduleRisk in dashboard.ts compares
 * targetDate against the real Date.now()) no matter when this is run.
 *
 * The PM-01…PM-10 numbering below is a SEQUENTIAL narrative (one story,
 * ten checkpoints), not ten independent scenarios like the RQ/TX/DX sets.
 *
 * Requires seed-sparrow-data.ts to have already been run (reuses the
 * project + the 11 personas). Pure data — no API calls.
 */

// ── Milestone (PM-01) ────────────────────────────────────────────────────
export const MILESTONE_PM = {
  key: "cr2026020",
  name: "CR-2026-020 — Loyalty Rewards Integration",
  type: "cr",
  environment: "ENV3",
  createdDaysAgo: 70,
  reqTargetDaysAgo: 63,
  devTargetDaysAgo: 49,
  qaTargetDaysAgo: 35,
  uatTargetDaysAgo: 28,
  goLiveDaysAgo: 21, // the milestone's targetDate — already 21 days in the past
};

// ── Requirement (cycles through review twice) ───────────────────────────
export const REQ_PM = {
  key: "reqpm1",
  title: "REQ-201 — Loyalty rewards points calculation on checkout",
  module: "Rewards",
  priority: "high" as const,
  description:
    "As a buyer, I earn loyalty points on every FPX payment, with the rate depending on my reward tier (Standard / Premium). Points post to the rewards ledger within 1 minute of settlement and the buyer's tier is re-evaluated after every purchase.",
  acceptanceCriteria: [
    "AC1 — Standard-tier purchases earn 1 point per RM 10 spent",
    "AC2 — Premium-tier purchases earn 1.5 points per RM 10 spent",
    "AC3 — A tier upgrade takes effect immediately, on the purchase that crosses the threshold",
    "AC4 — Points post to the third-party rewards ledger within 1 minute of settlement",
    "AC5 — A buyer exactly at a tier threshold is assigned the higher tier",
  ],
  createdDaysAgo: 68,
  cycle1: {
    submitDaysAgo: 67,
    approveDaysAgo: 65, // ahead of the 63-day requirements target — on track initially
    reviewerKey: "harith",
    devAssignDaysAgo: 64,
    devStartDaysAgo: 63,
    readyForQaDaysAgo: 50, // 1 day ahead of the 49-day dev target
  },
  scopeChange: {
    // Business changes the reward tier thresholds mid-flight — this is the
    // literal "requirement -> dev -> qa -> requirement" loop: an FA edit +
    // re-submit right as QA testing should have been finishing.
    resubmitDaysAgo: 35, // exactly the qaTarget (35 days ago) — "just when we thought we were done"
    revisedDescription:
      "As a buyer, I earn loyalty points on every FPX payment, with the rate depending on my reward tier (Standard / Premium / Gold — Gold tier added after Finance revised the loyalty program mid-quarter). " +
      "Points post to the rewards ledger within 1 minute of settlement and the buyer's tier is re-evaluated after every purchase using the revised thresholds (RM 5,000/quarter for Premium, RM 15,000/quarter for Gold).",
    revisedAcceptanceCriteria: [
      "AC1 — Standard-tier purchases earn 1 point per RM 10 spent",
      "AC2 — Premium-tier purchases earn 1.5 points per RM 10 spent",
      "AC3 — Gold-tier purchases earn 2 points per RM 10 spent (NEW)",
      "AC4 — A tier upgrade takes effect immediately, on the purchase that crosses the threshold",
      "AC5 — Points post to the third-party rewards ledger within 1 minute of settlement",
      "AC6 — A buyer exactly at a tier threshold (RM 5,000 or RM 15,000/quarter) is assigned the higher tier",
    ],
  },
  cycle2: {
    approveDaysAgo: 34,
    reviewerKey: "daniel", // FA Lead gets pulled in once things start slipping
    devAssignDaysAgo: 33,
    devStartDaysAgo: 32,
    readyForQaDaysAgo: 27, // already past the 28-day UAT target before QA round 3 even starts
  },
};

// ── Test cases (6, covering the rewards calculation + ledger integration) ─
export interface PmTc { key: string; rowId: string; title: string; preconditions: string; testSteps: string; expectedResult: string; authorKey: string }
export const PM_TEST_CASES: PmTc[] = [
  { key: "pmtc301", rowId: "TC-301", title: "Reward points calculated correctly for a Standard-tier purchase", preconditions: "Buyer is Standard tier.", testSteps: "1. Complete an FPX payment of RM 100\n2. Check the rewards ledger", expectedResult: "10 points posted (1 point per RM 10).", authorKey: "syafiq" },
  { key: "pmtc302", rowId: "TC-302", title: "Reward points calculated correctly for a Premium-tier purchase", preconditions: "Buyer is Premium tier.", testSteps: "1. Complete an FPX payment of RM 100\n2. Check the rewards ledger", expectedResult: "15 points posted (1.5 points per RM 10).", authorKey: "syafiq" },
  { key: "pmtc303", rowId: "TC-303", title: "Reward tier upgrade applies immediately after threshold is crossed", preconditions: "Buyer is just under the Premium threshold.", testSteps: "1. Complete a purchase that crosses the buyer into Premium tier\n2. Immediately complete a second purchase\n3. Check the reward rate applied to the second purchase", expectedResult: "Second purchase earns points at the new (Premium) rate.", authorKey: "nurul" },
  { key: "pmtc304", rowId: "TC-304", title: "Third-party rewards ledger API records the points transaction", preconditions: "Ledger API sandbox reachable.", testSteps: "1. Complete a purchase\n2. Poll the ledger API for the posted transaction", expectedResult: "Transaction appears in the ledger within 1 minute.", authorKey: "syafiq" },
  { key: "pmtc305", rowId: "TC-305", title: "Reward tier boundary — exact threshold amount assigns the correct tier", preconditions: "Buyer's quarterly spend is exactly at a tier threshold.", testSteps: "1. Bring the buyer's quarterly spend to exactly the tier threshold\n2. Complete one more purchase\n3. Check the assigned tier", expectedResult: "Buyer is assigned the higher tier at the exact threshold, not one purchase later.", authorKey: "nurul" },
  { key: "pmtc306", rowId: "TC-306", title: "Reward points requery reconciles with the ledger after a timeout", preconditions: "Ledger API configured to time out once.", testSteps: "1. Complete a purchase while the ledger API times out on the first call\n2. Let the requery retry\n3. Check the final ledger total", expectedResult: "Exactly one points posting is recorded — the retry doesn't double-count.", authorKey: "syafiq" },
];

// ── SIT execution rounds ─────────────────────────────────────────────────
export const SIT_PM_FILE = { redmineTicketId: "SIT-CR-2026-020", title: "SIT — CR-2026-020 Loyalty Rewards", qaPicName: "Syafiq Osman" };

export interface PmRound { label: string; daysAgo: number; results: Record<string, { result: "Passed" | "Failed"; actual?: string }> }

// Round 1 (PM-03): 4 of 6 fail — first rework wave
export const SIT_ROUND_1: PmRound = {
  label: "Round 1 — initial build", daysAgo: 48,
  results: {
    pmtc301: { result: "Passed" },
    pmtc302: { result: "Failed", actual: "Premium purchases earned 1 point/RM10 — same rate as Standard tier, the 1.5x multiplier was never applied." },
    pmtc303: { result: "Failed", actual: "Tier upgrade only takes effect on the buyer's NEXT session, not the very next purchase." },
    pmtc304: { result: "Failed", actual: "Ledger API call isn't retried on timeout — the points posting is silently dropped." },
    pmtc305: { result: "Failed", actual: "Buyer exactly at the threshold is still assigned the lower tier — off-by-one on the boundary comparison." },
    pmtc306: { result: "Passed" },
  },
};
// Round 2 (PM-04/05): the 4 are fixed, but a NEW regression appears
export const SIT_ROUND_2: PmRound = {
  label: "Round 2 — retest + new regression", daysAgo: 37,
  results: {
    pmtc302: { result: "Passed" },
    pmtc303: { result: "Passed" },
    pmtc304: { result: "Passed" },
    pmtc305: { result: "Passed" },
    pmtc306: { result: "Failed", actual: "The ledger API's timeout-retry (added to fix DEF-P3) double-posts the points when the retry succeeds after all — a regression from that same fix." },
  },
};
// Round 3 (PM-07/08): after the scope change, a NEW critical defect
export const SIT_ROUND_3: PmRound = {
  label: "Round 3 — post scope-change rebuild", daysAgo: 26,
  results: {
    pmtc301: { result: "Passed" }, pmtc302: { result: "Passed" }, pmtc304: { result: "Passed" }, pmtc306: { result: "Passed" },
    pmtc303: { result: "Passed" },
    pmtc305: { result: "Failed", actual: "Under the NEW Gold-tier threshold (RM 15,000/quarter), a buyer exactly at RM 15,000 is assigned Silver — the boundary bug came back under the new thresholds, this time misclassifying Gold-eligible customers as Silver, a much bigger revenue/perception issue than the original Premium boundary bug." },
  },
};
// Round 4 (PM-09): finally clean
export const SIT_ROUND_4: PmRound = {
  label: "Round 4 — final clean regression", daysAgo: 14,
  results: {
    pmtc301: { result: "Passed" }, pmtc302: { result: "Passed" }, pmtc303: { result: "Passed" },
    pmtc304: { result: "Passed" }, pmtc305: { result: "Passed" }, pmtc306: { result: "Passed" },
  },
};

// ── UAT (PM-10) — starts late, finds one more defect, still open today ──
export const UAT_PM_FILE = { redmineTicketId: "UAT-CR-2026-020", title: "UAT — CR-2026-020 Loyalty Rewards", qaPicName: "Nurul Huda" };
export const UAT_PM_ROUND = {
  daysAgo: 10,
  rows: [
    { rowId: "UAT-01", tcKey: "pmtc301", caseName: "UAT-01 — Buyer sees Standard-tier points on their statement", result: "Passed" as const },
    { rowId: "UAT-02", tcKey: "pmtc302", caseName: "UAT-02 — Buyer sees Premium-tier points on their statement", result: "Passed" as const },
    {
      rowId: "UAT-03", tcKey: "pmtc306", caseName: "UAT-03 — Buyer's displayed points balance matches the ledger",
      result: "Failed" as const,
      actual: "Displayed points balance lags the ledger by several minutes after a purchase, causing a support complaint from a business reviewer testing as a buyer.",
    },
  ],
};

// ── Defects (all raised from the SIT/UAT execution rows above) ──────────
export interface PmDefect {
  key: string; title: string; description: string; severity: "low" | "medium" | "high" | "critical";
  module: string; reporterKey: string; assigneeKey?: string; rowKey: string; round: "r1" | "r2" | "r3" | "uat";
  openedDaysAgo: number; closedDaysAgo?: number; // omit closedDaysAgo => still open today
}
export const PM_DEFECTS: PmDefect[] = [
  { key: "defp1", title: "Premium tier 1.5x point multiplier never applied", description: "Premium-tier purchases post points at the Standard rate — the multiplier lookup always returns 1x.", severity: "high", module: "Rewards", reporterKey: "syafiq", assigneeKey: "weijun", rowKey: "pmtc302", round: "r1", openedDaysAgo: 48, closedDaysAgo: 45 },
  { key: "defp2", title: "Tier upgrade doesn't apply until the next session", description: "Crossing a tier threshold mid-session doesn't affect the reward rate until the buyer logs in again.", severity: "medium", module: "Rewards", reporterKey: "syafiq", assigneeKey: "weijun", rowKey: "pmtc303", round: "r1", openedDaysAgo: 48, closedDaysAgo: 44 },
  { key: "defp3", title: "Ledger API timeout silently drops the points posting", description: "No retry on a ledger API timeout — the points transaction is lost with no error surfaced anywhere.", severity: "high", module: "Rewards", reporterKey: "syafiq", assigneeKey: "weijun", rowKey: "pmtc304", round: "r1", openedDaysAgo: 48, closedDaysAgo: 38 },
  { key: "defp4", title: "Buyer exactly at a tier threshold assigned the lower tier", description: "Boundary comparison uses a strict greater-than instead of greater-than-or-equal, so an exact-threshold buyer is misclassified.", severity: "medium", module: "Rewards", reporterKey: "syafiq", assigneeKey: "weijun", rowKey: "pmtc305", round: "r1", openedDaysAgo: 48, closedDaysAgo: 38 },
  { key: "defp5", title: "Ledger retry (fix for DEF-P3) double-posts points on a delayed success", description: "The timeout-retry added to fix DEF-P3 doesn't check whether the original call actually succeeded late — both the original and the retry post, doubling the buyer's points.", severity: "high", module: "Rewards", reporterKey: "nurul", assigneeKey: "weijun", rowKey: "pmtc306", round: "r2", openedDaysAgo: 37, closedDaysAgo: 35 },
  { key: "defp6", title: "New Gold-tier threshold boundary misclassifies exact-threshold buyers as Silver", description: "Same class of off-by-one bug as DEF-P4, resurfaced under the new 3-tier thresholds introduced by the scope change — this time misclassifying Gold-eligible buyers, a much higher-visibility issue.", severity: "critical", module: "Rewards", reporterKey: "syafiq", assigneeKey: "weijun", rowKey: "pmtc305", round: "r3", openedDaysAgo: 26, closedDaysAgo: 14 },
  { key: "defp7", title: "Displayed points balance lags the ledger by several minutes", description: "The points balance shown to the buyer is refreshed on a slow polling interval — it eventually catches up, but the lag caused a business reviewer to file a support complaint during UAT.", severity: "medium", module: "Rewards", reporterKey: "nurul", assigneeKey: "kavitha", rowKey: "pmtc306", round: "uat", openedDaysAgo: 10 /* still open — no closedDaysAgo */ },
];

// ── Risk (PM-08) ─────────────────────────────────────────────────────────
export const PM_RISK = {
  title: "R-PM01 — Repeated rework cycles have pushed go-live past the target date",
  description: "The mid-flight tier-threshold scope change forced a second full requirement → dev → QA cycle, and the resulting critical boundary defect (DEF-P6) took two weeks to resolve. The milestone's original go-live target has already passed.",
  category: "schedule" as const,
  probability: "high" as const,
  impact: "high" as const,
  status: "realized" as const,
  mitigationPlan: "No further scope changes accepted for this milestone. UAT is being run in parallel with any remaining fix verification rather than sequentially, to claw back what schedule is left.",
  raisedByKey: "farhan",
  ownerKey: "farhan",
  raisedDaysAgo: 25,
};

// ── Tasks (visible on Tasks page / PM Dashboard capacity) ───────────────
export interface PmTask { key: string; name: string; priority: "Low" | "Medium" | "High" | "Critical"; status: string; assigneeKeys: string[]; startDaysAgo: number; dueDaysAgo: number; actualStartDaysAgo?: number; actualEndDaysAgo?: number; estimatedHours?: number; actualHours?: number; completionPercentage?: number }
export const PM_TASKS: PmTask[] = [
  { key: "tpm1", name: "Build loyalty rewards calculation (Cycle 1)", priority: "High", status: "done", assigneeKeys: ["weijun"], startDaysAgo: 64, dueDaysAgo: 50, actualStartDaysAgo: 64, actualEndDaysAgo: 50, estimatedHours: 60, actualHours: 68, completionPercentage: 100 },
  { key: "tpm2", name: "Fix SIT round 1 defects (DEF-P1…P4)", priority: "High", status: "done", assigneeKeys: ["weijun"], startDaysAgo: 48, dueDaysAgo: 40, actualStartDaysAgo: 48, actualEndDaysAgo: 38, estimatedHours: 24, actualHours: 32, completionPercentage: 100 },
  { key: "tpm3", name: "Rework rewards calculation for revised tier thresholds (Cycle 2)", priority: "Critical", status: "done", assigneeKeys: ["weijun"], startDaysAgo: 33, dueDaysAgo: 27, actualStartDaysAgo: 33, actualEndDaysAgo: 27, estimatedHours: 40, actualHours: 46, completionPercentage: 100 },
  { key: "tpm4", name: "Fix critical Gold-tier boundary defect (DEF-P6)", priority: "Critical", status: "done", assigneeKeys: ["weijun"], startDaysAgo: 26, dueDaysAgo: 19, actualStartDaysAgo: 26, actualEndDaysAgo: 14, estimatedHours: 16, actualHours: 28, completionPercentage: 100 },
  { key: "tpm5", name: "UAT support for loyalty rewards", priority: "High", status: "in_progress", assigneeKeys: ["nurul", "kavitha"], startDaysAgo: 10, dueDaysAgo: -2 /* due 2 days from now — negative offset applied as-is by finalize */, estimatedHours: 20, actualHours: 14, completionPercentage: 70 },
];
