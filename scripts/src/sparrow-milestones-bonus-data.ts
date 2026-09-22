/**
 * 10 additional Milestones-page scenarios (MS-01…MS-10), layered on top of
 * the CR-2026-014 SPARROW dataset. The main storyline only shows one
 * milestone's full lifecycle (planned → active → completed) plus a
 * compressed hotfix — this showcases the OTHER shapes a milestone takes:
 * re-planning before work starts, the sprint/phase types (not just cr /
 * release), a cancelled milestone, a rejected-then-approved sign-off, a
 * deleted milestone (honest no-cascade gap), proactive vs. reactive
 * environment contention, an external-dependency start delay, and a
 * milestone that's still just a placeholder nobody's touched yet.
 *
 * Requires seed-sparrow-data.ts to have already been run. Pure data — no
 * API calls. seed-sparrow-milestones-bonus.ts creates everything;
 * finalize-sparrow-milestones-bonus.ts backdates it.
 */

import { pd, pt } from "./sparrow-data";

// ── MS-01 — re-planned before any work starts ───────────────────────────
export const MS01 = {
  key: "cr2026021",
  name: "CR-2026-021 — Fraud Detection Rules Update",
  type: "cr",
  environment: "ENV1",
  createdDate: pd("2026-08-05"),
  initial: {
    startDate: pd("2026-08-05"), reqTargetDate: pd("2026-08-15"), devTargetDate: pd("2026-09-05"),
    qaTargetDate: pd("2026-09-20"), uatTargetDate: pd("2026-09-27"), goLiveDate: pd("2026-10-04"),
  },
  replanned: {
    date: pt("2026-08-08", "10:00"),
    reason: "Vendor's fraud-rules engine license renewal is delayed 2 weeks — every phase target pushed out to match rather than compressing QA.",
    startDate: pd("2026-08-19"), reqTargetDate: pd("2026-08-29"), devTargetDate: pd("2026-09-19"),
    qaTargetDate: pd("2026-10-04"), uatTargetDate: pd("2026-10-11"), goLiveDate: pd("2026-10-18"),
  },
  riskTitle: "R-MS01 — Vendor fraud-rules engine license renewal delayed",
  riskRaisedDate: pt("2026-08-08", "10:30"),
  riskClosedDate: pt("2026-08-20", "09:00"),
};

// ── MS-02 — sprint-type milestone, clean & completed ────────────────────
export const MS02 = {
  key: "sprint7",
  name: "SPARROW Sprint 7 — Wallet UX Polish",
  type: "sprint",
  environment: "ENV4",
  startDate: pd("2026-09-01"), targetDate: pd("2026-09-15"),
  reqTargetDate: pd("2026-09-03"), devTargetDate: pd("2026-09-08"), qaTargetDate: pd("2026-09-13"),
  goLiveDate: pd("2026-09-15"),
  completedDate: pt("2026-09-15", "16:00"),
  lessonsLearned: "Smallest, best-scoped milestone of the quarter — a 2-week sprint that shipped on the exact target date with zero defects. Worth using as the template for future small UX-only sprints.",
};

// ── MS-03 — phase-type milestone, clean & completed ─────────────────────
export const MS03 = {
  key: "phase2",
  name: "Phase 2 — Reporting Enhancements",
  type: "phase",
  environment: "ENV5",
  startDate: pd("2026-09-10"), targetDate: pd("2026-10-01"),
  reqTargetDate: pd("2026-09-14"), devTargetDate: pd("2026-09-22"), qaTargetDate: pd("2026-09-29"),
  goLiveDate: pd("2026-10-01"),
  completedDate: pt("2026-10-01", "15:00"),
  lessonsLearned: "A phase-type milestone (not tied to one CR) worked well for grouping the reconciliation-report backlog — recommend using this type again for cross-CR reporting work.",
};

// ── MS-04 — cancelled mid-flight ────────────────────────────────────────
export const MS04 = {
  key: "cr2026022",
  name: "CR-2026-022 — Crypto Payment Support",
  type: "cr",
  environment: "ENV3",
  startDate: pd("2026-08-10"), targetDate: pd("2026-11-01"),
  reqTargetDate: pd("2026-08-20"),
  cancelledDate: pt("2026-08-25", "11:00"),
  cancelReason: "Deprioritised by the steering committee — regulatory approval for crypto acceptance isn't expected within this fiscal year. Requirements already drafted are archived for reconsideration next year.",
};

// ── MS-05 — sign-off rejected, then approved on retry ───────────────────
export const MS05 = {
  key: "cr2026023",
  name: "CR-2026-023 — SMS OTP Fallback",
  type: "cr",
  environment: "ENV2",
  startDate: pd("2026-08-12"), targetDate: pd("2026-09-10"),
  reqTargetDate: pd("2026-08-18"), devTargetDate: pd("2026-08-28"), qaTargetDate: pd("2026-09-05"),
  uatTargetDate: pd("2026-09-08"), goLiveDate: pd("2026-09-10"),
  uatFile: { redmineTicketId: "UAT-CR-2026-023", title: "UAT — CR-2026-023 SMS OTP Fallback" },
  uatRowTitle: "Buyer receives an SMS OTP fallback when push notification delivery fails",
  firstRejectDate: pt("2026-09-08", "14:00"),
  rejectReason: "A business reviewer found the fallback SMS arrives in English only, even for buyers with a Bahasa Melayu preference — needs to respect the locale before this ships.",
  fixedDate: pt("2026-09-09", "12:00"),
  secondApproveDate: pt("2026-09-10", "10:00"),
};

// ── MS-06 — deleted (duplicate, created by mistake) ─────────────────────
export const MS06 = {
  key: "cr2026024",
  name: "CR-2026-024 — Duplicate of CR-2026-023 (created by mistake)",
  type: "cr",
  environment: "ENV2",
  createdDate: pt("2026-08-12", "09:05"), // 5 minutes after the real CR-2026-023
  deletedDate: pt("2026-08-12", "09:20"),
};

// ── MS-07 — environment contention resolved proactively (contrast to the
// main storyline's reactive ENV2→ENV4 story) ─────────────────────────────
export const MS07 = {
  keyA: "cr2026025",
  nameA: "CR-2026-025 — Statement Export Redesign",
  keyB: "cr2026026",
  nameB: "CR-2026-026 — Merchant Settlement Batch Job",
  environment: "ENV6",
  resolvedEnvironment: "ENV1",
  createdDate: pt("2026-08-14", "09:00"),
  spottedDate: pt("2026-08-15", "10:00"),
  resolvedDate: pt("2026-08-15", "11:00"),
  note: "Both milestones' SIT windows would have overlapped on ENV6 in mid-September — spotted a month ahead during planning, not discovered mid-run like the CR-2026-014 ENV2 clash. CR-2026-026 moved to ENV1 before either milestone's QA phase began.",
};

// ── MS-08 — start delayed by an external vendor dependency ──────────────
export const MS08 = {
  key: "cr2026027",
  name: "CR-2026-027 — Biometric Login for Wallet",
  type: "cr",
  environment: "ENV4",
  plannedStartDate: pd("2026-08-15"),
  actualStartDate: pd("2026-09-02"),
  targetDate: pd("2026-10-20"),
  delayNote: "Start delayed 18 days waiting on the biometric SDK vendor's updated license certificate — flagged the day the milestone was created, resolved before it materially threatened the go-live date.",
  createdDate: pt("2026-08-14", "09:00"),
  delayNoticedDate: pt("2026-08-15", "09:00"),
  resolvedDate: pt("2026-09-02", "09:00"),
};

// ── MS-09 — pure placeholder, never activated ───────────────────────────
export const MS09 = {
  key: "cr2026028",
  name: "CR-2026-028 — Multi-Currency Wallet (placeholder)",
  type: "cr",
  environment: null as string | null,
  createdDate: pt("2026-09-01", "09:00"),
  note: "Created to reserve the CR number once Finance greenlights multi-currency support — no requirements, no target dates, and no test environment picked yet.",
};
