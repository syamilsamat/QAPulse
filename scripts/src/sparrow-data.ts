/**
 * SPARROW / CR-2026-014 demo dataset — built 1:1 from the reference document
 * "QAPulse — End-to-End Delivery Workflow & Mock-Up Scenario Guide" (v1.0,
 * 17 July 2026). Every scenario S1.1…S12.3 in that PDF maps to data here or
 * to a scripted step in seed-sparrow-data.ts.
 *
 * DATES: the PDF timeline runs 04 Aug → 23 Oct 2026, which is in the FUTURE
 * relative to the demo. All dates are therefore shifted back by
 * PDF_DATE_SHIFT_MONTHS so the full lifecycle (creation → SIT → UAT →
 * sign-off → go-live → production escape → lessons learned) sits in the
 * recent past and dashboards render sensibly. With the default -4:
 *   PDF 04 Aug → 04 Apr · PDF 14 Oct (closure) → 14 Jun ·
 *   PDF 23 Oct (go-live) → 23 Jun · PDF ~06 Nov (prod escape) → ~06 Jul.
 * Write dates below in PDF terms via pd("2026-08-04") so this file reads
 * exactly like the document.
 *
 * This file is pure data — no API calls. seed-sparrow-data.ts creates
 * everything through the real endpoints; finalize-sparrow-data.ts backdates
 * timestamps; clear-sparrow-data.ts tears it all down via the manifest.
 */

export const SPARROW_PASSWORD = "Sparrow@2026";

export const PDF_DATE_SHIFT_MONTHS = -4;

/** PDF date "2026-08-04" → shifted ISO date "2026-04-04". */
export function pd(pdfDate: string): string {
  const [y, m, d] = pdfDate.split("-").map(Number);
  const total = y * 12 + (m - 1) + PDF_DATE_SHIFT_MONTHS;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** PDF date+time → shifted timestamptz string (Malaysia time). */
export function pt(pdfDate: string, time = "10:00"): string {
  return `${pd(pdfDate)}T${time}:00+08:00`;
}

// ── People (PDF Section 2) ────────────────────────────────────────────────

export interface SparrowUser {
  key: string;
  name: string;
  email: string;
  role: string;
}

export const USERS: SparrowUser[] = [
  { key: "salmah",  name: "Salmah Idris",    email: "salmah.idris@demo.qapulse.local",    role: "pm_member" },
  { key: "rizal",   name: "Rizal Hamzah",    email: "rizal.hamzah@demo.qapulse.local",    role: "hod_pm" },
  { key: "aina",    name: "Aina Zulkifli",   email: "aina.zulkifli@demo.qapulse.local",   role: "fa_member" },
  { key: "daniel",  name: "Daniel Wong",     email: "daniel.wong@demo.qapulse.local",     role: "fa_lead" },
  { key: "harith",  name: "Harith Rahman",   email: "harith.rahman@demo.qapulse.local",   role: "fa_member" },
  { key: "farhan",  name: "Farhan Abdullah", email: "farhan.abdullah@demo.qapulse.local", role: "dev_lead" },
  { key: "weijun",  name: "Wei Jun Tan",     email: "weijun.tan@demo.qapulse.local",      role: "dev_member" },
  { key: "kavitha", name: "Kavitha Nair",    email: "kavitha.nair@demo.qapulse.local",    role: "dev_member" },
  { key: "melissa", name: "Melissa Lim",     email: "melissa.lim@demo.qapulse.local",     role: "qa_lead" },
  { key: "syafiq",  name: "Syafiq Osman",    email: "syafiq.osman@demo.qapulse.local",    role: "qa_member" },
  { key: "nurul",   name: "Nurul Huda",      email: "nurul.huda@demo.qapulse.local",      role: "qa_member" },
];

export const TEAM = {
  name: "SPARROW QA Squad",
  department: "qa",
  members: [
    { userKey: "melissa", role: "lead" as const },
    { userKey: "syafiq", role: "member" as const },
    { userKey: "nurul", role: "member" as const },
  ],
};

export const PROJECT = {
  name: "SPARROW — ePayment Gateway Revamp",
  description:
    "Revamp of the corporate ePayment gateway: FPX online payment, wallet, payment notifications and reconciliation reporting.",
  moduleNames: ["Payment", "Wallet", "Notification", "Reporting"],
  // Everyone not in the QA squad gets direct project membership.
  directMemberKeys: ["salmah", "rizal", "aina", "daniel", "harith", "farhan", "weijun", "kavitha"],
};

export const MODULES = ["Payment", "Wallet", "Notification", "Reporting"];

// ── Milestones (S1.1, S1.3) ───────────────────────────────────────────────

export const MILESTONE_CR = {
  key: "cr2026014",
  name: "CR-2026-014 — FPX Online Payment Integration",
  type: "cr",
  environmentInitial: "ENV2", // S1.1 — created with ENV2
  environmentFinal: "ENV4",   // S1.2 — changed after ENV2 booking clash
  startDate: pd("2026-08-04"),
  reqTargetDate: pd("2026-08-14"),
  devTargetDate: pd("2026-09-11"),
  qaTargetDate: pd("2026-10-02"),
  uatTargetDate: pd("2026-10-16"),
  goLiveDate: pd("2026-10-23"),
  targetDate: pd("2026-10-16"),
  // S12.1–S12.3 — recorded on the closed milestone
  lessonsLearned: [
    "1. CONTINUE — Test case authoring in parallel with development saved ~5 working days; make it the default for all CRs. AI analysis also prevented one full rework cycle on the refunds requirement.",
    "2. FIX — Environment contention (ENV2 booking clash + mid-SIT ENV4 infra patch) cost 2.5 days; adopt a shared booking calendar and change-freeze notice for active SIT windows. Action owner: PMO.",
    "3. ESCAPES — Both escapes (UAT refund display, production zero-decimal receipt) were test-data gaps, not procedure gaps; the standard test-data pack was extended and two regression TCs added.",
  ].join("\n"),
};

export const MILESTONE_HOTFIX = {
  key: "hotfix2026003",
  name: "HOTFIX-2026-003 — Payment Timeout Fix",
  type: "release",
  environment: "ENV6", // mirrors production (S1.3)
  startDate: pd("2026-09-07"),
  devTargetDate: pd("2026-09-10"),
  qaTargetDate: pd("2026-09-12"),
  goLiveDate: pd("2026-09-13"),
  targetDate: pd("2026-09-13"),
};

// ── Requirements (Phase 2/3) ──────────────────────────────────────────────

export const REQ_101 = {
  key: "req101",
  title: "REQ-101 — FPX single payment (B2C)",
  module: "Payment",
  priority: "high" as const,
  description:
    "As a registered buyer, I can pay for an order using FPX (B2C) so that the order is confirmed immediately after a successful bank debit. " +
    "Covers bank selection, redirect to the chosen bank, and the signed callback that updates the order state.",
  // AC6 added after the first AI analysis run flagged the pending-status gap (S2.1)
  acceptanceCriteria: [
    "AC1 — A successful payment updates the order to PAID within 5 seconds of the bank callback",
    "AC2 — A declined payment keeps the order UNPAID and shows the bank's failure reason to the buyer",
    "AC3 — A duplicate transaction reference from the bank is rejected and logged",
    "AC4 — The FPX bank list shows only active banks and is refreshed daily",
    "AC5 — Payments above RM 30,000 are blocked with the FPX B2C limit message",
    "AC6 — A pending bank status keeps the order PENDING and schedules an automatic requery",
  ],
  // S5.2 / S6.3 — AC3 clarified after Wei Jun's requirement defect
  clarifiedDescription:
    "As a registered buyer, I can pay for an order using FPX (B2C) so that the order is confirmed immediately after a successful bank debit. " +
    "Covers bank selection, redirect to the chosen bank, and the signed callback that updates the order state. " +
    "AC3 clarification: when the bank returns a duplicate transaction reference, the callback is rejected with a DUPLICATE_REF error, the attempt is logged for reconciliation, and the original payment record is left untouched.",
};

export const REQ_102 = {
  key: "req102",
  title: "REQ-102 — Payment status inquiry & requery",
  module: "Payment",
  priority: "normal" as const,
  redmineTicketId: "48213", // S2.3 — imported from Redmine ticket #48213
  description:
    "Back-office users and the system itself can query the bank for the current status of a payment. Pending payments are requeried automatically " +
    "until a final state is reached. Requery interval: no more than once per 5 minutes per payment, up to 24 hours.",
  acceptanceCriteria: [
    "AC1 — Status inquiry returns the bank's final state for a completed payment",
    "AC2 — Automatic requery runs no more than once per 5 minutes per pending payment",
    "AC3 — A pending payment that settles at the bank resolves to PAID on the next requery",
    "AC4 — An inquiry for an unknown transaction reference returns a clear NOT_FOUND error",
  ],
};

export const REQ_103 = {
  key: "req103",
  title: "REQ-103 — Refund initiation & approval",
  module: "Payment",
  priority: "high" as const,
  // S2.2 — deliberately weak two-line draft; first AI run scores it low
  draftDescription:
    "Back office can refund a payment.\nRefund goes back to the buyer's account.",
  // Rewritten after the AI run (S2.2), then AC4 corrected after Daniel's rejection (S3.3)
  description:
    "Back-office users can initiate a full or partial refund against a settled FPX payment. Refunds are routed through an approval flow before " +
    "submission to the bank, and every state change is recorded against the original payment for reconciliation.",
  acceptanceCriteria: [
    "AC1 — A refund can be initiated only against a payment in PAID or PARTIALLY_REFUNDED state",
    "AC2 — Partial refunds are supported; the running refunded total can never exceed the original amount",
    "AC3 — The maximum single refund equals the remaining un-refunded balance of the payment",
    "AC4 — Refunds above RM 5,000 require two approvers, per Finance SOP", // corrected after S3.3 rejection
    "AC5 — An approved refund is submitted to the bank within 15 minutes and tracked to completion",
    "AC6 — A rejected refund request records the rejector and reason, and notifies the initiator",
    "AC7 — The buyer receives a refund confirmation once the bank confirms the credit",
  ],
  rejectComment:
    "Approval hierarchy conflicts with Finance SOP — refunds above RM 5,000 need two approvers. Please align AC4 before resubmission.",
};

export const REQ_104 = {
  key: "req104",
  title: "REQ-104 — Payment receipt e-mail",
  module: "Notification",
  priority: "normal" as const,
  description:
    "Buyers receive a payment receipt e-mail after every successful FPX payment. The receipt shows the order, amount, bank reference and " +
    "payment time, and renders in Bahasa Melayu or English based on the buyer's language preference.",
  acceptanceCriteria: [
    "AC1 — The receipt e-mail is sent within 1 minute of the payment reaching PAID",
    "AC2 — A bounce from an invalid address is flagged for customer-service follow-up",
    "AC3 — The template renders correctly in both BM and English, including amounts formatted as RM 1,234.56",
  ],
};

// ── Test cases (Phase 6) ──────────────────────────────────────────────────
// TC-201…TC-217 are the milestone's authored cases (S6.1–S6.4); TC-REG-xx
// are the standing regression library rows pulled into the SIT run (S7.1,
// S7.4).

export interface SparrowTestCase {
  key: string;          // internal key
  rowId: string;        // display id used in execution files ("TC-201")
  requirementKey: string;
  module?: string;      // defaults to the requirement's module
  title: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  type: "manual" | "automation_candidate";
  priority: "low" | "normal" | "high" | "urgent";
  authorKey: string;
  aiAssisted?: boolean;
}

export const TEST_CASES: SparrowTestCase[] = [
  // S6.1 — Syafiq authors TC-201…TC-206 from REQ-101's acceptance criteria
  {
    key: "tc201", rowId: "TC-201", requirementKey: "req101", authorKey: "syafiq", type: "automation_candidate", priority: "high",
    title: "Successful FPX payment updates order to PAID",
    preconditions: "Registered buyer with an active FPX bank account; order of MYR 150.00 in the cart; ENV4 connected to the Maybank2u sandbox.",
    testSteps: "1. Check out the MYR 150.00 order and choose FPX\n2. Select Maybank2u from the bank list\n3. Complete login and approve the debit at the bank sandbox\n4. Wait for redirect back to the merchant\n5. Open the order detail page\n6. Verify the bank reference is stored\n7. Verify the payment audit trail shows the signed callback",
    expectedResult: "Order status is PAID within 5 seconds of the callback; bank reference and callback signature are recorded.",
  },
  {
    key: "tc202", rowId: "TC-202", requirementKey: "req101", authorKey: "syafiq", type: "manual", priority: "high",
    title: "Declined FPX payment keeps order UNPAID with the bank's reason",
    preconditions: "Registered buyer; bank sandbox configured to decline the debit.",
    testSteps: "1. Check out an order via FPX\n2. Decline the payment at the bank page\n3. Return to the merchant site",
    expectedResult: "Order remains UNPAID; the buyer sees the bank's failure reason; no receipt e-mail is sent.",
  },
  {
    key: "tc203", rowId: "TC-203", requirementKey: "req101", authorKey: "syafiq", type: "manual", priority: "high",
    title: "Duplicate transaction reference from the bank is rejected and logged",
    preconditions: "A completed payment exists with bank reference FPX-REF-0001.",
    testSteps: "1. Replay the bank callback carrying the already-used reference FPX-REF-0001\n2. Inspect the payment record and the reconciliation log",
    expectedResult: "Callback is rejected with DUPLICATE_REF, the attempt is logged for reconciliation, and the original payment record is unchanged.",
  },
  {
    key: "tc204", rowId: "TC-204", requirementKey: "req101", authorKey: "syafiq", type: "manual", priority: "normal",
    title: "FPX bank list shows only active banks and refreshes daily",
    preconditions: "Bank list feed contains one bank flagged inactive.",
    testSteps: "1. Open the FPX bank selection screen\n2. Compare the list against the bank feed\n3. Verify the last-refreshed timestamp",
    expectedResult: "Inactive banks are hidden; the list's refresh timestamp is within the last 24 hours.",
  },
  {
    key: "tc205", rowId: "TC-205", requirementKey: "req101", authorKey: "syafiq", type: "manual", priority: "normal",
    title: "Payment above RM 30,000 is blocked with the FPX B2C limit message",
    preconditions: "Order totalling RM 30,001 in the cart.",
    testSteps: "1. Attempt to check out the RM 30,001 order via FPX",
    expectedResult: "Checkout is blocked before redirect with a clear FPX B2C limit message; no payment attempt is created.",
  },
  {
    key: "tc206", rowId: "TC-206", requirementKey: "req101", authorKey: "syafiq", type: "automation_candidate", priority: "high",
    title: "Pending bank status keeps the order PENDING and schedules a requery",
    preconditions: "Bank sandbox configured to return a pending status on debit.",
    testSteps: "1. Pay an order via FPX and trigger the pending response\n2. Inspect the order state and the requery queue",
    expectedResult: "Order is PENDING (not PAID, not UNPAID); an automatic requery is scheduled per AC6.",
  },

  // S6.2 — Nurul's AI-assisted edge cases TC-207…TC-210
  {
    key: "tc207", rowId: "TC-207", requirementKey: "req101", authorKey: "nurul", aiAssisted: true, type: "manual", priority: "high",
    title: "Payment abandoned at the bank page releases the order after timeout",
    preconditions: "Registered buyer mid-checkout; bank page opened.",
    testSteps: "1. Start an FPX payment and stop at the bank login page\n2. Close the tab without completing or cancelling\n3. Wait past the payment session timeout\n4. Check the order state",
    expectedResult: "The abandoned attempt expires; the order returns to UNPAID and can be paid again without a duplicate charge.",
  },
  {
    key: "tc208", rowId: "TC-208", requirementKey: "req101", authorKey: "nurul", aiAssisted: true, type: "manual", priority: "high",
    title: "Session timeout after debit still completes the order via callback",
    preconditions: "Bank sandbox configured to delay the redirect until after the merchant session expires.",
    testSteps: "1. Pay an order via FPX\n2. Let the merchant session expire while the bank processes the debit\n3. Let the bank callback arrive after the session timeout",
    expectedResult: "The signed callback alone completes the order to PAID; the buyer sees the paid state on next login.",
  },
  {
    key: "tc209", rowId: "TC-209", requirementKey: "req101", authorKey: "nurul", aiAssisted: true, type: "manual", priority: "urgent",
    title: "Callback amount mismatch is rejected and flagged for reconciliation",
    preconditions: "Order of MYR 150.00 paid at the bank; callback tampered to carry MYR 15.00.",
    testSteps: "1. Pay the MYR 150.00 order at the bank sandbox\n2. Replay the callback with the amount altered to MYR 15.00\n3. Inspect the order and the reconciliation queue",
    expectedResult: "The mismatched callback is rejected, the order does NOT move to PAID, and the attempt is flagged for reconciliation.",
  },
  {
    key: "tc210", rowId: "TC-210", requirementKey: "req101", authorKey: "nurul", aiAssisted: true, type: "manual", priority: "high",
    title: "Duplicate browser tab double-submit charges the customer once",
    preconditions: "Registered buyer with the checkout page open in two tabs.",
    testSteps: "1. Submit the same FPX payment from both tabs within seconds\n2. Complete the bank flow in the first tab\n3. Attempt to complete the second tab",
    expectedResult: "Exactly one payment is created; the second submission is recognised as in-flight and blocked.",
  },

  // TC-211…TC-214 — REQ-102 status inquiry & requery (Syafiq)
  {
    key: "tc211", rowId: "TC-211", requirementKey: "req102", authorKey: "syafiq", type: "manual", priority: "high",
    title: "Status inquiry returns the bank's final state for a completed payment",
    preconditions: "A settled payment exists with a known bank reference.",
    testSteps: "1. Run a status inquiry for the settled payment from the back office\n2. Compare against the bank sandbox state",
    expectedResult: "Inquiry returns the final PAID state with matching bank reference and amount.",
  },
  {
    key: "tc212", rowId: "TC-212", requirementKey: "req102", authorKey: "syafiq", type: "automation_candidate", priority: "normal",
    title: "Automatic requery is throttled to once per 5 minutes",
    preconditions: "A payment stuck in PENDING with requery scheduled.",
    testSteps: "1. Observe the requery log for 20 minutes\n2. Count the requery attempts",
    expectedResult: "No more than one requery per 5 minutes for the same payment; attempts are evenly spaced.",
  },
  {
    key: "tc213", rowId: "TC-213", requirementKey: "req102", authorKey: "syafiq", type: "manual", priority: "high",
    title: "Pending payment resolves to PAID after the bank settles",
    preconditions: "A PENDING payment whose bank-side debit has now settled.",
    testSteps: "1. Settle the payment at the bank sandbox\n2. Wait for (or trigger) the next requery\n3. Check the order state",
    expectedResult: "The next requery resolves the order to PAID and stores the settlement time.",
  },
  {
    key: "tc214", rowId: "TC-214", requirementKey: "req102", authorKey: "syafiq", type: "manual", priority: "low",
    title: "Status inquiry with an unknown reference returns a clear error",
    preconditions: "No payment exists with reference FPX-REF-9999.",
    testSteps: "1. Run a status inquiry for FPX-REF-9999",
    expectedResult: "Inquiry returns NOT_FOUND with a human-readable message; nothing is created or updated.",
  },

  // S6.4 — Nurul closes the REQ-104 coverage gap with TC-215…TC-217
  {
    key: "tc215", rowId: "TC-215", requirementKey: "req104", authorKey: "nurul", type: "manual", priority: "high",
    title: "Successful payment sends the receipt e-mail within one minute",
    preconditions: "Buyer with a valid e-mail address; SMTP relay reachable from ENV4.",
    testSteps: "1. Complete an FPX payment\n2. Watch the mail queue and the buyer inbox",
    expectedResult: "Receipt e-mail arrives within 1 minute, showing order, amount, bank reference and payment time.",
  },
  {
    key: "tc216", rowId: "TC-216", requirementKey: "req104", authorKey: "nurul", type: "manual", priority: "normal",
    title: "Receipt to an invalid address bounces and is flagged for follow-up",
    preconditions: "Buyer account with e-mail bounce@invalid.local.",
    testSteps: "1. Complete a payment for the bounce-address buyer\n2. Inspect the bounce queue and the CS follow-up list",
    expectedResult: "The bounce is captured and the payment appears on the customer-service follow-up list.",
  },
  {
    key: "tc217", rowId: "TC-217", requirementKey: "req104", authorKey: "nurul", type: "manual", priority: "normal",
    title: "Receipt template renders correctly in BM and English",
    preconditions: "Two buyer accounts, one with BM and one with English preference.",
    testSteps: "1. Complete a payment with each buyer\n2. Compare both receipts against the approved template, including amount formatting",
    expectedResult: "Both language variants render correctly with amounts formatted as RM 1,234.56.",
  },

  // Standing regression library (pulled into the SIT run — S7.1 "plus
  // regression rows" and S7.4 AI regression selection)
  {
    key: "reg1", rowId: "TC-REG-01", requirementKey: "req102", module: "Wallet", authorKey: "melissa", type: "automation_candidate", priority: "high",
    title: "REG — Wallet top-up callback reconciles with the gateway ledger",
    preconditions: "Wallet account with a completed top-up in the current cycle.",
    testSteps: "1. Top up the wallet via FPX\n2. Compare wallet balance, callback record and gateway ledger entry",
    expectedResult: "All three records agree on amount, reference and timestamp.",
  },
  {
    key: "reg2", rowId: "TC-REG-02", requirementKey: "req103", authorKey: "melissa", type: "automation_candidate", priority: "urgent",
    title: "REG — Refund callback posts exactly once, including on retry",
    preconditions: "An approved refund submitted to the bank; bank sandbox set to time out the first acknowledgement.",
    testSteps: "1. Submit the refund\n2. Force an acknowledgement timeout so the gateway retries\n3. Inspect the refund ledger",
    expectedResult: "The refund is posted exactly once; the retry is recognised as the same refund, not a new posting.",
  },
  {
    key: "reg3", rowId: "TC-REG-03", requirementKey: "req102", authorKey: "melissa", type: "manual", priority: "normal",
    title: "REG — Status requery recovers after a gateway timeout",
    preconditions: "A PENDING payment; gateway configured to time out one inquiry.",
    testSteps: "1. Let one requery time out\n2. Observe the next scheduled requery",
    expectedResult: "The timed-out requery is retried on schedule and the payment still resolves to its final state.",
  },
  {
    key: "reg4", rowId: "TC-REG-04", requirementKey: "req101", module: "Wallet", authorKey: "melissa", type: "manual", priority: "high",
    title: "REG — Wallet balance unchanged after a failed payment",
    preconditions: "Wallet buyer with a known balance; bank sandbox set to decline.",
    testSteps: "1. Attempt a wallet-funded payment that the bank declines\n2. Check the wallet balance and ledger",
    expectedResult: "Wallet balance and ledger are unchanged; the failed attempt is recorded without a debit.",
  },
  {
    key: "reg5", rowId: "TC-REG-05", requirementKey: "req103", authorKey: "melissa", type: "manual", priority: "high",
    title: "REG — Back-office refund initiation & approval end-to-end",
    preconditions: "A settled payment eligible for refund; approver accounts available.",
    testSteps: "1. Initiate a partial refund from the back office\n2. Approve it per the approval flow\n3. Confirm the bank submission and the buyer notification, including the net refund amount shown on the confirmation",
    expectedResult: "Refund completes end-to-end; every state change is recorded against the original payment and the confirmation shows the net amount.",
  },
  {
    key: "reg6", rowId: "TC-REG-06", requirementKey: "req104", authorKey: "melissa", type: "manual", priority: "normal",
    title: "REG — Receipt e-mail for a requery-completed payment",
    preconditions: "A payment that reached PAID via requery rather than callback.",
    testSteps: "1. Resolve a pending payment via requery\n2. Check the buyer inbox",
    expectedResult: "The receipt e-mail is sent when requery (not callback) completes the payment.",
  },
  {
    key: "reg7", rowId: "TC-REG-07", requirementKey: "req101", authorKey: "melissa", type: "manual", priority: "high",
    title: "REG — Duplicate bank callback is ignored idempotently",
    preconditions: "A completed payment whose callback is replayed verbatim.",
    testSteps: "1. Replay the exact original callback\n2. Inspect the payment record and logs",
    expectedResult: "The replay is acknowledged idempotently; no state change, no duplicate receipt e-mail.",
  },
  {
    key: "reg8", rowId: "TC-REG-08", requirementKey: "req104", module: "Wallet", authorKey: "melissa", type: "manual", priority: "low",
    title: "REG — Wallet top-up receipt e-mail",
    preconditions: "Wallet buyer with a valid e-mail address.",
    testSteps: "1. Top up the wallet via FPX\n2. Check the buyer inbox",
    expectedResult: "Top-up receipt arrives with the wallet reference and new balance.",
  },
  {
    key: "reg9", rowId: "TC-REG-09", requirementKey: "req102", module: "Reporting", authorKey: "melissa", type: "automation_candidate", priority: "high",
    title: "REG — Reconciliation report daily totals match the gateway",
    preconditions: "At least five settled payments today.",
    testSteps: "1. Generate the daily reconciliation report\n2. Compare totals against the gateway ledger",
    expectedResult: "Report totals (count and amount) match the gateway ledger exactly.",
  },
  {
    key: "reg10", rowId: "TC-REG-10", requirementKey: "req101", authorKey: "melissa", type: "manual", priority: "normal",
    title: "REG — FPX bank list falls back to cache when the refresh fails",
    preconditions: "Bank list feed blocked at the firewall for the test window.",
    testSteps: "1. Force the daily bank list refresh to fail\n2. Open the FPX bank selection screen",
    expectedResult: "The last successful list is served from cache with a staleness marker in the ops log.",
  },
  {
    key: "reg11", rowId: "TC-REG-11", requirementKey: "req102", authorKey: "melissa", type: "automation_candidate", priority: "normal",
    title: "REG — Payment status webhook retries with exponential backoff",
    preconditions: "Downstream webhook consumer configured to fail twice.",
    testSteps: "1. Complete a payment\n2. Observe webhook delivery attempts and spacing",
    expectedResult: "Webhook retries with exponential backoff and succeeds on the third attempt; no duplicate processing downstream.",
  },
];

// ── Execution files (Phases 7 & 9) ───────────────────────────────────────
// Each row appears twice: round A (mid-execution snapshot: failures found,
// ENV outage blocks) and round B (final state after the fix-and-retest
// loops). Round B is what the dashboards show; round A exists so defects are
// raised against genuinely-Failed rows and the save history shows the loop.

export interface SparrowExecRow {
  rowId: string;      // display id in the file ("TC-201" / "UAT-01")
  tcKey: string;      // library TC this row executes
  caseName?: string;  // override (UAT business-script names)
  resultA: "Passed" | "Failed" | "Blocked" | "Not Executed" | "In Progress";
  actualA?: string;
  resultB: "Passed" | "Failed";
  actualB?: string;
  roundBOnly?: boolean; // S7.4 — AI-selected regression rows appended late
}

export const SIT_FILE = {
  key: "sit",
  redmineTicketId: "SIT-CR-2026-014",
  title: "SIT — CR-2026-014 Payment",
  fileType: "qa" as const,
  tracker: "QA Testing",
  qaPicName: "Syafiq Osman",
  rows: [
    { rowId: "TC-201", tcKey: "tc201", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-202", tcKey: "tc202", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-203", tcKey: "tc203", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-204", tcKey: "tc204", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-205", tcKey: "tc205", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-206", tcKey: "tc206", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-207", tcKey: "tc207", resultA: "Passed", resultB: "Passed" },
    { rowId: "TC-208", tcKey: "tc208", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "TC-209", tcKey: "tc209",
      resultA: "Failed",
      actualA: "Mismatched callback (MYR 15.00 vs order MYR 150.00) was ACCEPTED and the order moved to PAID — must be rejected and flagged. DEF raised.",
      resultB: "Passed",
      actualB: "Retested after fix: mismatched callback rejected, order stays UNPAID, reconciliation flag created.",
    },
    { rowId: "TC-210", tcKey: "tc210", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "TC-211", tcKey: "tc211",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    {
      rowId: "TC-212", tcKey: "tc212",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    {
      rowId: "TC-213", tcKey: "tc213",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    {
      rowId: "TC-214", tcKey: "tc214",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    { rowId: "TC-215", tcKey: "tc215", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "TC-216", tcKey: "tc216",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    {
      rowId: "TC-217", tcKey: "tc217",
      resultA: "Failed",
      actualA: "BM receipt renders with the amount column misaligned when the order has 3+ line items — cosmetic only. DEF raised.",
      resultB: "Failed",
      actualB: "Deferred to the next release by agreement (cosmetic, no functional impact) — see the deferred defect.",
    },
    { rowId: "TC-REG-01", tcKey: "reg1", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "TC-REG-02", tcKey: "reg2",
      resultA: "Failed",
      actualA: "Refund double-posts when the bank acknowledgement times out and the gateway retries — TWO ledger postings for one refund. Critical DEF raised; UAT preparation suspended.",
      resultB: "Passed",
      actualB: "Retested after fix landed: retry recognised as the same refund, single posting. AI-selected regression pack also executed clean.",
    },
    {
      rowId: "TC-REG-03", tcKey: "reg3",
      resultA: "Blocked", actualA: "ENV4 outage — infra ticket INC-7731.",
      resultB: "Passed", actualB: "Re-executed after ENV4 restore — passed.",
    },
    // S7.4 — 8 AI-selected regression rows appended before the final round
    { rowId: "TC-REG-04", tcKey: "reg4", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-05", tcKey: "reg5", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-06", tcKey: "reg6", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-07", tcKey: "reg7", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-08", tcKey: "reg8", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-09", tcKey: "reg9", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-10", tcKey: "reg10", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
    { rowId: "TC-REG-11", tcKey: "reg11", resultA: "Not Executed", resultB: "Passed", roundBOnly: true },
  ] as SparrowExecRow[],
};
// Final SIT tally: 27 Passed / 1 Failed (TC-217, deferred cosmetic defect) /
// 0 Blocked → 96.4% pass — the governed-deferral exit of S8.2.

export const UAT_FILE = {
  key: "uat",
  redmineTicketId: "UAT-CR-2026-014",
  title: "UAT — CR-2026-014",
  fileType: "uat" as const,
  tracker: "UAT",
  qaPicName: "Aina Zulkifli", // FA facilitates; QA supports (Phase 9)
  rows: [
    { rowId: "UAT-01", tcKey: "tc201", caseName: "UAT-01 — Buyer pays an order with FPX (Maybank2u)", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-02", tcKey: "tc202", caseName: "UAT-02 — Buyer's payment is declined at the bank", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-03", tcKey: "tc207", caseName: "UAT-03 — Buyer abandons payment at the bank page", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-04", tcKey: "tc210", caseName: "UAT-04 — Buyer double-submits payment from two tabs", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-05", tcKey: "tc211", caseName: "UAT-05 — Back office checks a payment's status", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-06", tcKey: "tc213", caseName: "UAT-06 — Overnight-settled payment shows as PAID next morning", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-07", tcKey: "tc215", caseName: "UAT-07 — Buyer receives the payment receipt e-mail", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-08", tcKey: "tc217", caseName: "UAT-08 — Receipt renders correctly in Bahasa Melayu", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-09", tcKey: "reg1", caseName: "UAT-09 — Wallet top-up reflected in the wallet balance", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-10", tcKey: "reg9", caseName: "UAT-10 — Finance runs the daily reconciliation report", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "UAT-11", tcKey: "reg5", caseName: "UAT-11 — Back-office refund initiation & approval",
      resultA: "Failed",
      actualA: "Refund confirmation shows the GROSS amount instead of the NET amount after partial refund. DEF raised (found in UAT).",
      resultB: "Passed",
      actualB: "Re-run after fix: confirmation shows the net amount. Passed with the business user present.",
    },
    { rowId: "UAT-12", tcKey: "reg2", caseName: "UAT-12 — Refund posts exactly once on the statement", resultA: "Passed", resultB: "Passed" },
    { rowId: "UAT-13", tcKey: "tc205", caseName: "UAT-13 — Payment above the FPX B2C limit is blocked", resultA: "Passed", resultB: "Passed" },
    {
      rowId: "UAT-14", tcKey: "tc214", caseName: "UAT-14 — Unknown reference inquiry shows a clear error",
      resultA: "Not Executed", resultB: "Passed",
    },
    { rowId: "UAT-15", tcKey: "reg6", caseName: "UAT-15 — Receipt for a requery-completed payment", resultA: "Passed", resultB: "Passed" },
  ] as SparrowExecRow[],
};
// Round A: 13 Passed / 1 Failed / 1 Not Executed = 86.7% → crossing 80%
// fires uat_milestone_ready to the milestone PM (S9.1). Round B: 15/15.

// ── Defects ───────────────────────────────────────────────────────────────
// Real defect codes are assigned sequentially by the DB — the seed prints a
// PDF-code → real-code mapping at the end. pdfCode below is the label used
// in the document.

export interface SparrowDefect {
  key: string;
  pdfCode: string;
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  severity: "low" | "medium" | "high" | "critical";
  module: string;
  reporterKey: string;
  source?: "requirement" | "production";
  foundIn?: "SIT" | "UAT" | "Production";
  requirementKey?: string;
  executionFileKey?: "sit" | "uat";
  rowId?: string;             // execution row the defect was raised from
  assignToKey?: string;       // dev assignment (PATCH /defects/:id/assign)
  finalStatus: string;        // stamped by finalize-sparrow-data.ts
  escapeClass?: "coverage_gap" | "selection_gap" | "passed_wrongly";
  escapeStatus?: "pending" | "analyzing" | "closed";
  createRegressionTc?: boolean;
}

export const DEFECTS: SparrowDefect[] = [
  {
    // S5.2 — requirement defect raised by the developer during the build;
    // auto-routes to the requirement author (Aina)
    key: "dreq", pdfCode: "DEF-0031",
    title: "AC3 does not define behaviour for a duplicate transaction reference from the bank",
    description:
      "The FPX specification is ambiguous about duplicate payment references. REQ-101 AC3 says duplicates are 'rejected and logged' but does not " +
      "say what happens to the original payment record or whether the buyer is notified — the integration cannot be completed as written.",
    severity: "medium", module: "Payment",
    reporterKey: "weijun", source: "requirement", requirementKey: "req101",
    finalStatus: "Closed",
  },
  {
    // S7.2 — the full defect loop on TC-209
    key: "d42", pdfCode: "DEF-0042",
    title: "Callback amount mismatch is accepted instead of rejected",
    description: "A tampered bank callback carrying a different amount than the order is accepted and the order moves to PAID.",
    stepsToReproduce: "1. Pay an order of MYR 150.00 at the bank sandbox\n2. Replay the callback with the amount altered to MYR 15.00\n3. Observe the order state",
    expectedResult: "Callback is rejected; order does not move to PAID; attempt flagged for reconciliation.",
    actualResult: "Callback accepted; order marked PAID at the tampered amount; no reconciliation flag.",
    severity: "high", module: "Payment",
    reporterKey: "nurul", foundIn: "SIT",
    executionFileKey: "sit", rowId: "TC-209", requirementKey: "req101",
    assignToKey: "weijun",
    finalStatus: "Closed",
  },
  {
    // S8.2 — the deferred cosmetic defect
    key: "d47", pdfCode: "DEF-0047",
    title: "BM receipt amount column misaligned for orders with 3+ line items",
    description: "Cosmetic alignment issue on the Bahasa Melayu receipt template when an order has three or more line items. No functional impact.",
    stepsToReproduce: "1. Complete a payment for an order with 3 line items using a BM-preference buyer\n2. Open the receipt e-mail",
    expectedResult: "Amount column aligned per the approved template.",
    actualResult: "Amount column drifts right by one tab stop from the third line item onward.",
    severity: "medium", module: "Notification",
    reporterKey: "syafiq", foundIn: "SIT",
    executionFileKey: "sit", rowId: "TC-217", requirementKey: "req104",
    finalStatus: "Deferred", // deferral agreed by FA Lead + PMO, S8.2
  },
  {
    // S8.3 — the blocker that halts the milestone in QA
    key: "d51", pdfCode: "DEF-0051",
    title: "Refund double-posts on retry",
    description:
      "When the bank acknowledgement times out and the gateway retries the refund submission, the refund is posted twice to the ledger. " +
      "Critical — UAT preparation suspended until fixed.",
    stepsToReproduce: "1. Submit an approved refund\n2. Force the bank acknowledgement to time out\n3. Let the gateway retry\n4. Inspect the refund ledger",
    expectedResult: "Retry is recognised as the same refund; exactly one ledger posting.",
    actualResult: "Two ledger postings for one refund.",
    severity: "critical", module: "Payment",
    reporterKey: "nurul", foundIn: "SIT",
    executionFileKey: "sit", rowId: "TC-REG-02", requirementKey: "req103",
    assignToKey: "weijun",
    finalStatus: "Closed",
  },
  {
    // S9.2 — the UAT escape that feeds the funnel
    key: "d58", pdfCode: "DEF-0058",
    title: "Refund confirmation shows the gross amount instead of the net amount",
    description: "After a partial refund, the back-office confirmation screen shows the original gross payment amount instead of the net refunded amount.",
    stepsToReproduce: "1. Initiate and approve a partial refund from the back office\n2. Read the confirmation screen",
    expectedResult: "Confirmation shows the net refund amount.",
    actualResult: "Confirmation shows the gross original amount.",
    severity: "medium", module: "Payment",
    reporterKey: "syafiq", foundIn: "UAT",
    executionFileKey: "uat", rowId: "UAT-11", requirementKey: "req103",
    assignToKey: "weijun",
    finalStatus: "Closed",
  },
  {
    // S10.4 — production escape two weeks after go-live
    key: "dp4", pdfCode: "DEF-P0004",
    title: "Receipts for zero-decimal amounts show \"RM 100.\" instead of \"RM 100.00\"",
    description:
      "Customer report: receipts for whole-ringgit amounts render the amount with a trailing dot and no decimals. Escape review classified it as a " +
      "coverage gap — no SIT test data used whole-ringgit amounts. A regression TC was added so the gap never recurs.",
    stepsToReproduce: "1. Complete a payment of exactly RM 100.00\n2. Open the receipt e-mail",
    expectedResult: "Amount renders as RM 100.00.",
    actualResult: "Amount renders as RM 100. (trailing dot, no decimals).",
    severity: "medium", module: "Notification",
    reporterKey: "melissa", source: "production", foundIn: "Production",
    requirementKey: "req104",
    finalStatus: "Closed",
    escapeClass: "coverage_gap", escapeStatus: "closed", createRegressionTc: true,
  },
];

// ── Tasks (S5.3, S8.4, S10.3) ─────────────────────────────────────────────

export interface SparrowTask {
  key: string;
  name: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: string;
  assigneeKeys: string[];
  milestoneKey?: "cr" | "hotfix";
  requirementKey?: string;
  startDate: string;
  dueDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  estimatedHours?: number;
  actualHours?: number;
  completionPercentage?: number;
}

export const TASKS: SparrowTask[] = [
  {
    key: "t-fpx", name: "Build FPX single payment integration (REQ-101)", priority: "Critical",
    status: "released_to_production", assigneeKeys: ["weijun"], milestoneKey: "cr", requirementKey: "req101",
    startDate: pd("2026-08-18"), dueDate: pd("2026-09-11"), actualStartDate: pd("2026-08-18"), actualEndDate: pd("2026-09-09"),
    estimatedHours: 80, actualHours: 76, completionPercentage: 100,
  },
  {
    key: "t-inquiry", name: "Build payment status inquiry & requery (REQ-102)", priority: "High",
    status: "released_to_production", assigneeKeys: ["weijun"], milestoneKey: "cr", requirementKey: "req102",
    startDate: pd("2026-08-20"), dueDate: pd("2026-09-11"), actualStartDate: pd("2026-08-20"), actualEndDate: pd("2026-09-08"),
    estimatedHours: 40, actualHours: 44, completionPercentage: 100,
  },
  {
    key: "t-refund", name: "Build refund initiation & approval (REQ-103)", priority: "High",
    status: "released_to_production", assigneeKeys: ["kavitha"], milestoneKey: "cr", requirementKey: "req103",
    startDate: pd("2026-08-20"), dueDate: pd("2026-09-11"), actualStartDate: pd("2026-08-20"), actualEndDate: pd("2026-09-09"),
    estimatedHours: 60, actualHours: 63, completionPercentage: 100,
  },
  {
    // S5.3 — T-85, the upstream dependency
    key: "t85", name: "T-85 — SMTP relay configuration for ENV4", priority: "Medium",
    status: "done", assigneeKeys: ["farhan"], milestoneKey: "cr",
    startDate: pd("2026-08-28"), dueDate: pd("2026-09-03"), actualStartDate: pd("2026-08-28"), actualEndDate: pd("2026-09-05"),
    estimatedHours: 8, actualHours: 10, completionPercentage: 100,
  },
  {
    // S5.3 — T-88, blocked 4 working days by T-85
    key: "t88", name: "T-88 — Receipt e-mail template (was blocked 4 days by T-85 SMTP relay)", priority: "Medium",
    status: "released_to_production", assigneeKeys: ["kavitha"], milestoneKey: "cr", requirementKey: "req104",
    startDate: pd("2026-08-28"), dueDate: pd("2026-09-08"), actualStartDate: pd("2026-09-05"), actualEndDate: pd("2026-09-09"),
    estimatedHours: 16, actualHours: 14, completionPercentage: 100,
  },
  {
    // S8.4 — QA task roll-up
    key: "t-sit", name: "SIT execution — Payment", priority: "High",
    status: "released_to_production", assigneeKeys: ["syafiq"], milestoneKey: "cr", requirementKey: "req101",
    startDate: pd("2026-09-10"), dueDate: pd("2026-09-25"), actualStartDate: pd("2026-09-10"), actualEndDate: pd("2026-09-25"),
    estimatedHours: 40, actualHours: 38, completionPercentage: 100,
  },
  {
    key: "t-regr", name: "Regression round (AI-selected pack)", priority: "Medium",
    status: "released_to_production", assigneeKeys: ["nurul"], milestoneKey: "cr", requirementKey: "req103",
    startDate: pd("2026-09-17"), dueDate: pd("2026-09-25"), actualStartDate: pd("2026-09-17"), actualEndDate: pd("2026-09-25"),
    estimatedHours: 12, actualHours: 12, completionPercentage: 100,
  },
  {
    key: "t-uat", name: "UAT support", priority: "High",
    status: "released_to_production", assigneeKeys: ["syafiq", "nurul"], milestoneKey: "cr", requirementKey: "req103",
    startDate: pd("2026-10-05"), dueDate: pd("2026-10-16"), actualStartDate: pd("2026-10-06"), actualEndDate: pd("2026-10-14"),
    estimatedHours: 24, actualHours: 21, completionPercentage: 100,
  },
];

// ── Risk register (Phase 11) ──────────────────────────────────────────────
// POST /risks is Lead-tier+ — Salmah (pmo, tier 1) can't raise via API, so
// PDF risks she "raises" are raised by Rizal with Salmah as owner where the
// owner matters.

export interface SparrowRisk {
  key: string;
  pdfCode: string;
  title: string;
  description?: string;
  category: "schedule" | "scope" | "resource" | "technical" | "external" | "other";
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  status: "open" | "mitigating" | "closed" | "realized";
  mitigationPlan?: string;
  ownerKey?: string;
  raisedByKey: string; // must be Lead-tier+
  milestoneKey?: "cr" | "hotfix";
}

export const RISKS: SparrowRisk[] = [
  {
    key: "r01", pdfCode: "R-01", category: "external", probability: "high", impact: "medium", status: "closed",
    raisedByKey: "rizal", ownerKey: "salmah", milestoneKey: "cr",
    title: "R-01 — Bank FPX sandbox credentials may arrive after the dev start date",
    description: "The bank's FPX sandbox onboarding normally takes three weeks; dev starts in under three weeks.",
    mitigationPlan: "Submit onboarding forms immediately; develop against the FPX simulator until credentials arrive. (Credentials arrived before the SIT window — closed.)",
  },
  {
    key: "r02", pdfCode: "R-02", category: "schedule", probability: "medium", impact: "medium", status: "closed",
    raisedByKey: "rizal", ownerKey: "salmah", milestoneKey: "cr",
    title: "R-02 — External dependency slip could force a re-baseline of the phase plan",
    description: "Bank-side dependencies (sandbox access, spec clarifications) have historically slipped and would push every phase target.",
    mitigationPlan: "Weekly dependency checkpoint with the bank's integration team; re-baseline early rather than compressing QA. Not realized — closed at milestone closure.",
  },
  {
    key: "r04", pdfCode: "R-04", category: "technical", probability: "medium", impact: "high", status: "closed",
    raisedByKey: "farhan", ownerKey: "weijun", milestoneKey: "cr",
    title: "R-04 — Crypto library deprecation may force a late swap",
    description: "Callback signature verification depends on a library with a published deprecation notice.",
    mitigationPlan: "Isolate verification behind an interface so the library can be replaced without touching business logic. Closed after SIT passed against the abstraction.",
  },
  {
    key: "r05", pdfCode: "R-05", category: "technical", probability: "medium", impact: "high", status: "closed",
    raisedByKey: "melissa", ownerKey: "melissa", milestoneKey: "cr",
    title: "R-05 — ENV4 outage during the SIT window (infra ticket INC-7731)",
    description: "ENV4 database taken down by an unannounced infrastructure patch mid-run; 6 SIT rows blocked for 1.5 days.",
    mitigationPlan: "Escalated to infra; blocked rows re-executed after restore. QA target still met. Closed.",
  },
  {
    key: "r06", pdfCode: "R-06", category: "scope", probability: "medium", impact: "high", status: "closed",
    raisedByKey: "farhan", ownerKey: "farhan", milestoneKey: "cr",
    title: "R-06 — Critical refund double-posting blocker may compress the UAT window",
    description: "The critical refund double-post defect suspended UAT preparation and dipped SPI below 1.0; the UAT window was at risk.",
    mitigationPlan: "Two developers pulled onto the fix; retest plus AI-selected regression pack before re-opening the gate. Closed after the gate re-opened.",
  },
  {
    key: "r07", pdfCode: "R-07", category: "resource", probability: "high", impact: "medium", status: "realized",
    raisedByKey: "melissa", ownerKey: "melissa", milestoneKey: "cr",
    title: "R-07 — QA capacity dip during SIT week 2",
    description: "Nurul called for two days of committee duty in the middle of the SIT window.",
    mitigationPlan: "Syafiq absorbs the priority rows; non-critical regression shifts by one day. REALIZED — actual impact: 1 day slip on regression, recovered within the QA window.",
  },
  {
    key: "r09", pdfCode: "R-09", category: "schedule", probability: "high", impact: "high", status: "closed",
    raisedByKey: "rizal", ownerKey: "rizal", milestoneKey: "hotfix",
    title: "R-09 — Compressed 6-day hotfix plan leaves no contingency",
    description: "HOTFIX-2026-003 runs start-to-go-live in 6 days with the UAT phase waived by agreement.",
    mitigationPlan: "Daily go/no-go checkpoint; ENV6 chosen because it mirrors production. Delivered on time — closed.",
  },
];

// S4.3 — Kavitha's handover note when REQ-102 is reassigned to Wei Jun
export const REQ102_HANDOVER_COMMENT =
  "Handover before my leave: requery scheduler and throttling are done and unit-tested; bank inquiry adapter is stubbed against the simulator — " +
  "swap to the real sandbox once R-01 credentials land. Remaining: NOT_FOUND error mapping (AC4) and the settlement-time persistence on AC3. — Kavitha";
