/**
 * 10 additional Defects-page scenarios (DX-01…DX-10), layered on top of the
 * CR-2026-014 SPARROW dataset. Every defect here is raised the way the
 * Defects page actually expects — from a failed row in a NEW execution file
 * ("Defects Showcase — Regression & Governance Deep Dive"), not as a
 * requirement defect (see RQ-06 for that) and not an ad-hoc production
 * pull. This showcases governance/lifecycle features the main storyline's
 * 6 defects don't: reassignment, a double-fail retest loop, reopening after
 * a regression, category classification, deferral by category, both
 * remaining escape classifications (selection_gap, passed_wrongly), an
 * aging/stale open defect, and auto-generating a regression TC from an
 * ordinary QA-found defect (not just a production escape).
 *
 * Requires seed-sparrow-data.ts to have already been run. Pure data — no
 * API calls. seed-sparrow-defects-bonus.ts creates everything;
 * finalize-sparrow-defects-bonus.ts backdates it (DX-09's staleness is
 * anchored to the real current date, same trick as TX-11).
 */

import { pd, pt } from "./sparrow-data";

export const DEFECTS_FILE = {
  redmineTicketId: "DEFECTS-SHOWCASE-01",
  title: "Defects Showcase — Regression & Governance Deep Dive",
  qaPicName: "Melissa Lim",
};

export interface DxRow {
  key: string;
  rowId: string;
  tcTitle: string;
  tcKey: string; // library TC key this row executes (reused from sparrow-data.ts's TEST_CASES)
  module: string;
}

// Rows hosting each scenario's failure — reusing existing library TCs so no
// new test-case authoring is needed; each execution ROW is independent of
// how that TC performed in SIT/UAT, so reuse here doesn't affect those
// numbers.
export const ROWS: DxRow[] = [
  { key: "dx01", rowId: "DX-01", tcTitle: "Duplicate bank callback is ignored idempotently", tcKey: "reg7", module: "Payment" },
  { key: "dx02", rowId: "DX-02", tcTitle: "Reconciliation report daily totals match the gateway", tcKey: "reg9", module: "Reporting" },
  { key: "dx03", rowId: "DX-03", tcTitle: "FPX bank list falls back to cache when the refresh fails", tcKey: "reg10", module: "Payment" },
  { key: "dx04", rowId: "DX-04", tcTitle: "Payment status webhook retries with exponential backoff", tcKey: "reg11", module: "Payment" },
  { key: "dx05", rowId: "DX-05", tcTitle: "Declined FPX payment keeps order UNPAID with the bank's reason", tcKey: "tc202", module: "Payment" },
  { key: "dx06", rowId: "DX-06", tcTitle: "Receipt e-mail for a requery-completed payment", tcKey: "reg6", module: "Notification" },
  { key: "dx07", rowId: "DX-07", tcTitle: "Wallet balance unchanged after a same-session double payment attempt", tcKey: "reg4", module: "Wallet" },
  { key: "dx08", rowId: "DX-08", tcTitle: "Pending payment resolves to PAID after the bank settles", tcKey: "tc213", module: "Payment" },
  { key: "dx09", rowId: "DX-09", tcTitle: "FPX bank selection screen remembers the buyer's last-used bank", tcKey: "tc205", module: "Payment" },
  { key: "dx10", rowId: "DX-10", tcTitle: "Wallet top-up receipt shows the new balance at the daily cap boundary", tcKey: "reg8", module: "Wallet" },
];

// ── DX-01 — critical blocker, still open today ──────────────────────────
export const DX01 = {
  title: "Duplicate bank callback processed twice under high concurrent load",
  description:
    "Under high concurrent load, two near-simultaneous copies of the same bank callback both pass the idempotency check — a race condition, not a simple duplicate-reference check failure. The order is marked PAID twice and a reconciliation mismatch results.",
  stepsToReproduce: "1. Fire the same bank callback twice within a 50ms window under load-test conditions\n2. Inspect the payment record and reconciliation log",
  expectedResult: "Exactly one of the two callbacks is processed; the other is recognised as in-flight and rejected.",
  actualResult: "Both callbacks were processed, creating a duplicate PAID state and a reconciliation discrepancy.",
  severity: "critical" as const,
  reporterKey: "nurul",
  daysAgo: 12, // still open, 12 days without a fix landing
  finalStatus: "Open",
};

// ── DX-02 — reassigned mid-fix ───────────────────────────────────────────
export const DX02 = {
  title: "Reconciliation report daily totals don't match the gateway ledger",
  description: "The daily reconciliation export undercounts settled payments by roughly 2% versus the gateway's own ledger — looks like a timezone boundary issue on the report's date-range filter.",
  stepsToReproduce: "1. Generate the daily reconciliation report for a day with payments near midnight\n2. Compare the total against the gateway ledger for the same 24h window",
  expectedResult: "Report total matches the gateway ledger exactly.",
  actualResult: "Report is short by the payments that settled between 23:45 and 00:15 — likely a UTC/local boundary bug.",
  severity: "high" as const,
  reporterKey: "syafiq",
  initialAssigneeKey: "kavitha",
  reassignedToKey: "weijun",
  reassignReason: "Kavitha is fully booked on the refund fixes this week — reassigning to Wei Jun, who owns the Reporting module's date-range logic.",
  openedDaysAgo: 20,
  reassignedDaysAgo: 17,
  closedDaysAgo: 10,
  finalStatus: "Closed",
};

// ── DX-03 — retest loop: fails twice before finally passing ─────────────
export const DX03 = {
  title: "Bank list cache fallback doesn't actually serve the cached list",
  description: "When the daily bank-list refresh fails, the code path meant to fall back to the last-known-good cached list instead returns an empty list.",
  stepsToReproduce: "1. Force the daily bank list refresh to fail\n2. Open the FPX bank selection screen",
  expectedResult: "The last successful list is served from cache with a staleness marker.",
  actualResult: "Bank selection screen shows no banks at all — checkout is blocked entirely.",
  severity: "high" as const,
  reporterKey: "nurul",
  assigneeKey: "weijun",
  openedDaysAgo: 26,
  attempt1FailDaysAgo: 22, // "fixed" but retest still failed — cache key mismatch
  attempt2FailDaysAgo: 18, // second "fix" still failed — wrong cache TTL config
  closedDaysAgo: 14,
  attempt1Note: "First fix pointed at the wrong cache key — retest still showed an empty bank list.",
  attempt2Note: "Second fix corrected the cache key but left the TTL at 0, so the cache was immediately evicted — retest still failed.",
  finalNote: "Third fix corrected both the cache key and a sane 24h TTL — retest passed.",
  finalStatus: "Closed",
};

// ── DX-04 — reopened after a regression ──────────────────────────────────
export const DX04 = {
  title: "Payment status webhook doesn't retry after a delivery failure",
  description: "The status webhook to the merchant's downstream system doesn't retry after a failed delivery attempt, silently dropping the notification.",
  stepsToReproduce: "1. Simulate a webhook delivery failure (downstream 500)\n2. Observe whether a retry is attempted",
  expectedResult: "Webhook retries with exponential backoff, up to 3 attempts.",
  actualResult: "No retry occurs — the notification is lost.",
  severity: "high" as const,
  reporterKey: "syafiq",
  assigneeKey: "weijun",
  openedDaysAgo: 33,
  firstClosedDaysAgo: 28,
  reopenedDaysAgo: 16,
  reopenedNote: "Regression: the retry logic was accidentally reverted by an unrelated refactor in the fix for DEF-03 (bank list caching) — same symptom resurfaced during regression testing.",
  reClosedDaysAgo: 11,
  finalStatus: "Closed",
};

// ── DX-05 — category classification (security) ──────────────────────────
export const DX05 = {
  title: "Forged decline callback can flip a PAID order back to UNPAID",
  description: "The decline-callback handler doesn't fully verify the bank's signature before acting on it — a crafted callback claiming a decline can revert an already-settled order's status.",
  stepsToReproduce: "1. Capture a legitimate decline callback's structure\n2. Replay a forged version against a PAID order without a valid signature\n3. Check the order status",
  expectedResult: "The forged callback is rejected — signature verification must pass before any status change.",
  actualResult: "The order was reverted from PAID to UNPAID despite the invalid signature.",
  severity: "high" as const,
  category: "security" as const,
  reporterKey: "melissa", // qa_lead — Lead-tier, can set defectCategory directly at creation
  assigneeKey: "weijun",
  openedDaysAgo: 24,
  closedDaysAgo: 19,
  finalStatus: "Closed",
};

// ── DX-06 — low severity, deferred (usability, distinct from DEF-0047) ──
export const DX06 = {
  title: "Requery-failure error message is too technical for buyers",
  description: "When an automatic status requery fails, the buyer-facing message reads \"REQUERY_TIMEOUT_5xx: upstream gateway unreachable\" instead of a plain-language explanation.",
  stepsToReproduce: "1. Force a requery failure\n2. Read the message shown to the buyer",
  expectedResult: "A plain-language message such as \"We're still checking your payment — please refresh in a minute.\"",
  actualResult: "Raw technical error code shown directly to the buyer.",
  severity: "low" as const,
  category: "usability" as const,
  reporterKey: "nurul",
  openedDaysAgo: 22,
  deferredDaysAgo: 18,
  deferralNote: "No functional impact — buyer can still retry/contact support. Deferred to the next content-and-copy pass rather than blocking this release.",
  finalStatus: "Deferred",
};

// ── DX-07 — escape: selection_gap (a valid edge case existed but wasn't
// selected into the run that would have caught it) ───────────────────────
export const DX07 = {
  title: "Wallet balance briefly double-debited on a same-session double payment attempt",
  description: "If a buyer double-clicks Pay from the wallet within the same session before the first debit's UI feedback returns, the wallet balance is debited twice before the second attempt is rejected — the debit reversal for the rejected attempt lags by several seconds.",
  stepsToReproduce: "1. Trigger two wallet payments in immediate succession within one session\n2. Watch the wallet balance during the few seconds before the second attempt is rejected",
  expectedResult: "Balance never reflects more than one debit at any point, even momentarily.",
  actualResult: "Balance briefly shows both debits applied before the reversal catches up.",
  severity: "high" as const,
  reporterKey: "syafiq",
  assigneeKey: "kavitha",
  openedDaysAgo: 19,
  closedDaysAgo: 13,
  escapeClass: "selection_gap" as const,
  escapeNotes: "The regular regression pack includes the single-session double-submit case (TC-210) but never included this same-session WALLET variant — it existed as an idea in a review comment but was never turned into a selected test case until this defect forced the issue.",
  finalStatus: "Closed",
};

// ── DX-08 — escape: passed_wrongly (TC ran, was marked Passed, but the
// assertion was too weak to catch the real bug) ──────────────────────────
export const DX08 = {
  title: "Settlement timestamp not recorded for auto-resolved (requeried) payments",
  description: "TC-213 (\"pending payment resolves to PAID after settlement\") was marked Passed because the order status correctly became PAID — but the test never asserted that the settlement timestamp was actually stored. A later audit found the timestamp column is null for every payment that resolved via requery rather than the direct callback.",
  stepsToReproduce: "1. Let a payment resolve to PAID via the automatic requery path (not the direct bank callback)\n2. Inspect the payment record's settlement timestamp field",
  expectedResult: "Settlement timestamp is populated the same way it is for callback-resolved payments.",
  actualResult: "Settlement timestamp is null for every requery-resolved payment — reconciliation reports silently drop these rows from time-based totals.",
  severity: "medium" as const,
  reporterKey: "melissa",
  assigneeKey: "weijun",
  openedDaysAgo: 15,
  closedDaysAgo: 9,
  escapeClass: "passed_wrongly" as const,
  escapeNotes: "TC-213's expected result only checked the order status, not the settlement timestamp — the assertion was too narrow to catch this. Test case has been strengthened as part of closing this out.",
  finalStatus: "Closed",
};

// ── DX-09 — stale/aging defect nobody's watching (real-date anchored) ───
export const DX09 = {
  title: "FPX bank selection doesn't remember the buyer's last-used bank",
  description: "Minor convenience gap found during SIT — the bank selection screen always shows the full list in default order instead of pre-selecting or promoting the buyer's most recently used bank.",
  stepsToReproduce: "1. Complete an FPX payment with Bank A\n2. Start a new payment and open the bank selection screen",
  expectedResult: "Bank A is pre-selected or shown first.",
  actualResult: "Full default-order list shown every time, no memory of prior selection.",
  severity: "low" as const,
  reporterKey: "syafiq",
  staleDaysAgo: 47, // opened long ago, never assigned, never touched since
  finalStatus: "New",
};

// ── DX-10 — regression TC auto-created from an ordinary QA-found defect ─
export const DX10 = {
  title: "Wallet top-up receipt omits the new balance at the exact daily cap boundary",
  description: "When a top-up brings the wallet to exactly its daily cap, the receipt e-mail is sent without the \"New balance\" line — it's present for every other amount.",
  stepsToReproduce: "1. Top up a wallet by an amount that brings today's cumulative total to exactly the daily cap\n2. Check the receipt e-mail",
  expectedResult: "Receipt shows the new balance, same as any other successful top-up.",
  actualResult: "\"New balance\" line is missing specifically at the exact cap boundary.",
  severity: "medium" as const,
  reporterKey: "nurul",
  assigneeKey: "kavitha",
  openedDaysAgo: 17,
  closedDaysAgo: 12,
  finalStatus: "Closed",
};
