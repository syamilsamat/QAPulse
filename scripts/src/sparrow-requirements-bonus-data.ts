/**
 * 12 additional Requirements-page scenarios (RQ-01…RQ-12), layered on top of
 * the CR-2026-014 SPARROW dataset from seed-sparrow-data.ts. These showcase
 * Requirements-module capabilities the main PDF storyline doesn't exercise:
 * parent/child hierarchy + module cascade, Redmine import (recursive) vs.
 * single-ticket re-sync, attachments, multi-participant comment threads, a
 * QA-raised (not Dev-raised) requirement defect, priority escalation,
 * milestone reassignment, backlog (no-milestone) requirements, bulk delete,
 * and one deliberately-unflattering edge case (orphaned child on parent
 * delete) worth being upfront about rather than hiding.
 *
 * Requires seed-sparrow-data.ts to have already been run — this script reads
 * project/milestone/requirement/user IDs out of the existing
 * sparrow-seed-manifest.json rather than recreating them.
 *
 * Pure data — no API calls. seed-sparrow-requirements-bonus.ts creates
 * everything; finalize-sparrow-requirements-bonus.ts backdates it.
 */

import { pd, pt } from "./sparrow-data";

// ── RQ-08 — a second, lightweight milestone to reassign a requirement into ──
export const MILESTONE_CR2 = {
  key: "cr2026015",
  name: "CR-2026-015 — Notification Enhancements",
  type: "cr",
  status: "planned" as const,
  environment: "ENV2",
  targetDate: pd("2026-11-20"),
  startDate: pd("2026-11-03"),
};

// ── RQ-01 — parent/child hierarchy + module cascade ─────────────────────────
export const REQ_105 = {
  key: "req105",
  title: "REQ-105 — Wallet balance reconciliation",
  module: "Wallet",
  priority: "high" as const,
  description:
    "As the finance team, we need the wallet ledger reconciled against the gateway's own ledger daily so discrepancies are caught before month-end close.",
  acceptanceCriteria: [
    "AC1 — A daily reconciliation job compares wallet balances against the gateway ledger",
    "AC2 — Any mismatch is surfaced to finance within the same business day",
  ],
  // Later cascaded to "Wallet, Reporting" — demonstrates module cascade to children (RQ-01)
  moduleAfterCascade: "Wallet, Reporting",
};
export const REQ_106 = {
  key: "req106",
  title: "REQ-106 — Reconcile against gateway ledger daily",
  parentKey: "req105",
  description: "A scheduled job pulls the gateway's end-of-day ledger and diffs it line-by-line against the wallet ledger.",
};
export const REQ_107 = {
  key: "req107",
  title: "REQ-107 — Flag mismatches for manual review",
  parentKey: "req105",
  description: "Any line that doesn't reconcile is queued on a manual-review screen for finance, with the two conflicting amounts shown side by side.",
};

// ── RQ-02 — recursive Redmine import (parent + 2 children) ─────────────────
// NOTE: this sandbox has no live Redmine connection, so the seed script sets
// these fields directly (as the real import-redmine flow would leave them)
// rather than calling the network-dependent import endpoint. Say so plainly
// when demoing — the *data* looks like a completed import; the *button*
// won't actually reach Redmine here.
export const REQ_108 = {
  key: "req108",
  title: "REQ-108 — Wallet top-up limits",
  module: "Wallet",
  priority: "normal" as const,
  redmineTicketId: "48300",
  tracker: "User Story",
  description: "Wallet top-ups are subject to a daily cap and a per-transaction cap, both configurable per account tier.",
};
export const REQ_109 = {
  key: "req109",
  title: "REQ-109 — Enforce daily top-up cap",
  parentKey: "req108",
  redmineTicketId: "48301",
  tracker: "User Story",
  description: "A top-up that would push the day's cumulative total over the daily cap is rejected with the remaining allowance shown.",
};
export const REQ_110 = {
  key: "req110",
  title: "REQ-110 — Enforce per-transaction top-up cap",
  parentKey: "req108",
  redmineTicketId: "48302",
  tracker: "User Story",
  description: "A single top-up above the per-transaction cap is rejected outright, regardless of the daily total.",
};

// ── RQ-03 — "Sync from Redmine" preserves local edits ───────────────────────
// REQ-102 is already Redmine-linked (ticket #48213) from the main seed.
// Melissa bumps its priority locally; the (simulated) re-sync only refreshes
// description/AC from the ticket and leaves the locally-set priority alone.
export const RQ03_NOTE =
  "Local priority raised to high ahead of the 14 Aug requirements target — re-synced from Redmine #48213 same day; description/AC refreshed, priority untouched by the sync.";

// ── RQ-04 — attachment lifecycle ────────────────────────────────────────────
export const RQ04_ATTACHMENT = {
  filename: "Finance-SOP-Refund-Approval-Matrix.txt",
  mimeType: "text/plain",
  content:
    "Finance SOP v3.2 — Refund Approval Matrix\n" +
    "Effective 01 Aug 2026\n\n" +
    "Refund amount          Required approvers\n" +
    "Up to RM 5,000         1 approver\n" +
    "Above RM 5,000         2 approvers\n\n" +
    "Attached by Aina Zulkifli as evidence when resubmitting REQ-103 after Daniel Wong's rejection (S3.3).",
};

// ── RQ-05 — multi-participant comment thread on REQ-104 ─────────────────────
export const RQ05_THREAD: { authorKey: string; body: string }[] = [
  { authorKey: "harith", body: "Quick question on REQ-104 AC3 — does the BM/English choice come from the buyer's profile setting, or their browser locale at checkout time?" },
  { authorKey: "daniel", body: "Profile setting — same field the account statements already use. Browser locale isn't reliable enough for a financial document." },
  { authorKey: "melissa", body: "Noting for QA planning: the receipt send depends on the SMTP relay work (T-85) landing first — flagging so we don't schedule TC-215/216/217 execution before that's done." },
];

// ── RQ-06 — QA (not Dev) raises a requirement defect ────────────────────────
export const RQ06_DEFECT = {
  key: "dqa",
  pdfCode: "DEF-0033",
  title: "AC2's 5-minute requery interval isn't confirmed against the bank's own rate limit",
  description:
    "While writing TC-212 (requery throttling), Syafiq found the bank's integration guide caps status-inquiry calls at 1 per 3 minutes per merchant ID, not per payment — REQ-102 AC2 needs to say whether the 5-minute interval is per-payment or must also respect the per-merchant cap.",
  severity: "low" as const,
  module: "Payment",
  reporterKey: "syafiq",
  requirementKey: "req102",
  created: pt("2026-08-28", "10:00"),
  closed: pt("2026-08-29", "15:00"),
  resolutionComment: "Clarified: the 5-minute interval is per-payment AND capped globally so the merchant-wide rate never exceeds 1 call/3 minutes — batched if needed.",
};

// ── RQ-07 — priority escalation with an audit trail ─────────────────────────
export const RQ07_NOTE =
  "Finance flagged e-mail deliverability as a go-live blocker ahead of the 23 Oct launch — priority raised from normal to urgent so the receipt e-mail work gets UAT priority.";
export const RQ07_DATE = pt("2026-10-01", "09:00");

// ── RQ-08 — requirement descoped and reassigned to a different milestone ───
export const REQ_111 = {
  key: "req111",
  title: "REQ-111 — SMS payment notification (stretch)",
  module: "Notification",
  priority: "low" as const,
  description: "In addition to the e-mail receipt, send a short SMS confirmation for payments above RM 1,000.",
  createdDate: pt("2026-08-12", "09:00"),
  reassignedDate: pt("2026-08-15", "14:00"),
  reassignComment: "Descoped from CR-2026-014 — SMS gateway procurement won't land in time for the 23 Oct go-live. Moved to CR-2026-015.",
};

// ── RQ-09 — bulk multi-select delete of abandoned drafts ───────────────────
export const REQ_112 = {
  key: "req112",
  title: "REQ-112 — Payment analytics widget (draft)",
  module: "Reporting",
  priority: "low" as const,
  description: "Early, never-fleshed-out idea for a merchant-facing payment analytics widget on the dashboard.",
};
export const REQ_113 = {
  key: "req113",
  title: "REQ-113 — Old wallet cashback idea (draft)",
  module: "Wallet",
  priority: "low" as const,
  description: "Superseded cashback concept from an earlier planning session; no longer aligned with the wallet roadmap.",
};
export const RQ09_DATE = pt("2026-08-16", "11:00");

// ── RQ-10 — backlog requirement with no milestone yet ───────────────────────
export const REQ_114 = {
  key: "req114",
  title: "REQ-114 — Cross-border FPX support (future)",
  module: "Payment",
  priority: "low" as const,
  description: "Placeholder for future cross-border FPX acceptance — not yet scoped into any delivery; holding in the backlog until the banking partnership is confirmed.",
  createdDate: pt("2026-08-20", "09:00"),
};

// ── RQ-11 — orphaned child after a parent delete (honest edge case) ────────
export const REQ_115 = {
  key: "req115",
  title: "REQ-115 — Legacy reconciliation revamp (superseded)",
  module: "Wallet",
  priority: "normal" as const,
  description: "Original plan to revamp the legacy nightly reconciliation batch job — superseded by REQ-105's daily reconciliation approach.",
};
export const REQ_116 = {
  key: "req116",
  title: "REQ-116 — Update legacy reconciliation batch job",
  parentKey: "req115",
  description: "Sub-task of the (now superseded) legacy reconciliation revamp.",
};
export const RQ11_DATE = pt("2026-08-16", "11:30"); // parent deleted here, same grooming session as RQ-09

// ── RQ-12 — description edit reopens review on linked test cases, mid-SIT ──
export const RQ12_REVISED_AC4 =
  "AC4 — Refunds above RM 5,000 require two approvers per Finance SOP v3.2, and BOTH approvers must be a different user than the refund initiator.";
export const RQ12_DATE = pt("2026-09-18", "10:00");
