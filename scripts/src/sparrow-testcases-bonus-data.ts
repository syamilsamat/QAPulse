/**
 * 12 additional Test Cases / Execution Dashboard scenarios (TX-01…TX-12),
 * layered on top of the CR-2026-014 SPARROW dataset. These showcase
 * capabilities the main storyline doesn't exercise: cloning a test case,
 * compiling library TCs into a new execution file, AI duplicate-detection,
 * AI coverage-gap, AI CAPA/root-cause analysis, natural-language search, AI
 * test-data generation, cloning an execution file, the execution-file audit
 * log vs. per-row result history, a stale/neglected execution file, and
 * deprecating a superseded test case.
 *
 * Requires seed-sparrow-data.ts to have already been run — IDs are resolved
 * from the existing sparrow-seed-manifest.json.
 *
 * Pure data — no API calls. seed-sparrow-testcases-bonus.ts creates
 * everything; finalize-sparrow-testcases-bonus.ts backdates it.
 */

import { pd, pt } from "./sparrow-data";

// ── TX-01 — clone a test case for a second bank variant ────────────────────
export const TX01_CLONE = {
  sourceTcKey: "tc201", // "Successful FPX payment updates order to PAID"
  newTitle: "Successful FPX payment via CIMB Clicks updates order to PAID",
  newPreconditions: "Registered buyer with an active FPX bank account; order of MYR 150.00 in the cart; ENV4 connected to the CIMB Clicks sandbox.",
  date: pt("2026-08-19", "10:00"),
};

// ── TX-02 — compile library TCs into a new "Smoke Test" execution file ─────
export const TX02_SMOKE_FILE = {
  redmineTicketId: "SMOKE-CR-2026-014",
  title: "Smoke Test — Pre-UAT Sanity Check",
  qaPicName: "Nurul Huda",
  tcKeys: ["tc201", "tc211", "tc215", "reg1", "reg9"],
  date: pt("2026-10-04", "09:00"),
};

// ── TX-03 — AI duplicate-detection flags a near-duplicate TC ───────────────
export const TX03_DUPLICATE = {
  title: "Verify FPX payment updates order status after bank debit",
  preconditions: "Registered buyer; order in cart; FPX bank sandbox available.",
  testSteps: "1. Pay an order via FPX\n2. Complete the bank debit\n3. Check the order status",
  expectedResult: "Order status reflects PAID after the bank debit completes.",
  authorKey: "nurul",
  requirementKey: "req101" as const,
  createdDate: pt("2026-08-22", "11:00"),
  aiRecommendation: {
    similarityScore: 92,
    action: "delete" as const,
    reason: "Near-duplicate of TC-201 — same preconditions, same happy-path assertion, no additional edge case covered.",
  },
  deletedDate: pt("2026-08-22", "15:00"),
};

// ── TX-04 — AI coverage-gap surfaces a zero-coverage requirement ───────────
export const REQ_117 = {
  key: "req117",
  title: "REQ-117 — Payment reconciliation report export",
  module: "Reporting",
  priority: "normal" as const,
  description: "Finance can export a settlement reconciliation report (CSV) for a selected date range, listing every settled payment with bank reference and amount.",
  acceptanceCriteria: [
    "AC1 — Export includes every payment that reached PAID within the selected date range",
    "AC2 — Each row shows order ID, bank reference, amount, and settlement timestamp",
  ],
  createdDate: pt("2026-08-24", "09:00"),
  submitDate: pt("2026-08-24", "14:00"),
  approveDate: pt("2026-08-26", "10:00"),
};
export const TX04_GAP_CLOSED_TC = {
  title: "Reconciliation report includes all settled payments for the selected date range",
  preconditions: "At least 10 payments settled within the last 7 days, with 2 outside the range as a boundary check.",
  testSteps: "1. Set the export date range to the last 7 days\n2. Generate the reconciliation report\n3. Compare the row count and totals against the payment ledger for that range",
  expectedResult: "Report includes exactly the payments settled inside the range, with matching bank references and amounts; boundary-adjacent payments outside the range are excluded.",
  authorKey: "nurul",
  date: pt("2026-08-27", "10:00"),
};

// ── TX-05 — AI CAPA / root-cause analysis on the existing SIT failure cluster
// Live-demo scenario: no new data, just an AI call over rows already seeded
// by the main storyline (TC-209, TC-217, TC-REG-02, plus the 6 ENV4-outage
// blocks). Nothing persists server-side — re-run it live for the actual demo.
export const TX05_CAPA_ROW_KEYS = ["tc209", "tc217", "reg2", "tc211", "tc212", "tc213", "tc214", "tc216", "reg3"];

// ── TX-07 — AI test-data generation (live/ephemeral — run during seeding
// just to prove it works; re-run live for the actual demo) ─────────────────
export const TX07_TEST_DATA_REQUEST = {
  dataType: "Bulk wallet top-up amounts (MYR)",
  count: 10,
  context: "Wallet top-up testing for REQ-102 / Wallet module — need valid amounts, invalid amounts, and boundary values around the top-up caps.",
  format: "json",
};

// ── TX-08 — execution file cloned into a standalone ad-hoc regression pack ─
export const TX08_CLONE = {
  newTicketId: "REG-ADHOC-001",
  newTitle: "Ad-hoc Regression Snapshot — Payment (cloned from SIT)",
  date: pt("2026-09-26", "09:00"),
};

// ── TX-09 / TX-10 — one execution file, two features: the file-level audit
// log (TCs added, then one removed) and per-row result history (one row
// flips Failed → Passed within the same session).
export const TX0910_FILE = {
  redmineTicketId: "WALLET-REG-01",
  title: "Wallet Top-Up Regression Pack",
  qaPicName: "Syafiq Osman",
  addedTcKeys: ["reg1", "reg4", "reg8"], // TX-09: all 3 added first
  removedTcKey: "reg8",                   // TX-09: then removed — 2nd audit entry
  historyTcKey: "reg1",                   // TX-10: this row flips result twice
  addedDate: pt("2026-09-22", "09:00"),
  removedDate: pt("2026-09-22", "09:20"),
  firstResultDate: pt("2026-09-22", "10:00"),
  firstResult: "Failed" as const,
  firstActual: "Simulated top-up callback timeout on first attempt.",
  secondResultDate: pt("2026-09-22", "10:35"),
  secondResult: "Passed" as const,
  secondActual: "Retried — callback received, wallet balance and ledger match.",
};

// ── TX-11 — stale execution file (untouched while incomplete) ─────────────
// Staleness is judged against the REAL current date (not the shifted
// narrative dates), so finalize-sparrow-testcases-bonus.ts backdates this
// file's updated_at relative to whenever it actually runs, not to a pd()/pt()
// value from the storyline.
export const TX11_STALE_FILE = {
  redmineTicketId: "STALE-CHECK-01",
  title: "Regression — Legacy Bank List Refresh (draft, stalled)",
  qaPicName: "Nurul Huda",
  tcKeys: ["tc204", "tc214"], // both left Not Executed
  staleDaysAgo: 6, // > the app's 3-day staleness threshold
};

// ── TX-12 — test case deprecated and superseded ────────────────────────────
export const TX12_DEPRECATE = {
  deprecatedTcKey: "tc204", // "FPX bank list shows only active banks and refreshes daily"
  deprecatedDate: pt("2026-08-30", "11:00"),
  replacement: {
    title: "FPX bank list refresh respects a 24h staleness window (v2)",
    objective: "Supersedes TC-204 — clarifies the staleness window explicitly instead of relying on 'refreshes daily.'",
    preconditions: "Bank list feed's last successful refresh was more than 24 hours ago.",
    testSteps: "1. Force the bank list cache to be older than 24h\n2. Open the FPX bank selection screen\n3. Check the served list's staleness marker",
    expectedResult: "A stale marker appears once the cached list exceeds 24h, distinct from the normal daily-refresh case in the deprecated TC-204.",
    authorKey: "syafiq",
    date: pt("2026-08-30", "11:30"),
  },
};
