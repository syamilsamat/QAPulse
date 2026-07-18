# SPARROW / CR-2026-014 demo data

Seeds QAPulse with the exact end-to-end storyline from "QAPulse — End-to-End
Delivery Workflow & Mock-Up Scenario Guide" (v1.0, 17 July 2026): one
project (SPARROW — ePayment Gateway Revamp), 11 named users across every
role in the lifecycle, the CR-2026-014 "FPX Online Payment Integration"
milestone plus a contrasting compressed hotfix milestone, 4 requirements
taken through the full FA review workflow (including a blocked
self-approval and a reject → revise → approve cycle), dev assignment and
reassignment, 28 test cases, a full SIT execution round with a defect loop,
an environment outage, and AI-selected regression — then a UAT round with
its own escape, FA-Lead sign-off, milestone closure, a production escape two
weeks after go-live, the full risk register (R-01…R-09), and 3 lessons-learned
entries.

**Presenting a specific page?** There are five optional bonus layers, run
after the main steps below, each independent of the others:

- `seed-sparrow-requirements-bonus.ts` — 12 Requirements-page scenarios
  (parent/child hierarchy, Redmine import/sync, attachments, comment
  threads, a QA-raised defect, priority escalation, milestone reassignment,
  backlog items, bulk delete, and one honest edge case).
- `seed-sparrow-testcases-bonus.ts` — 12 Test Cases/Execution scenarios
  (clone, compiling TCs into a new execution file, AI duplicate-detection,
  AI coverage-gap, AI CAPA analysis, natural-language search, AI test-data
  generation, execution-file clone, the audit log vs. per-row history, a
  stale file, and a deprecated/superseded test case).
- `seed-sparrow-defects-bonus.ts` — 10 Defects-page scenarios, every one
  raised from a failed execution row (not a requirement defect, not a
  production pull): reassignment, a fails-twice retest loop, reopening
  after a regression, category classification, deferral, both remaining
  escape classifications, a stale/aging open defect, and auto-generating a
  regression TC from an ordinary QA-found defect.
- `seed-sparrow-pmdashboard.ts` — a single continuous "what happens when it
  goes wrong" storyline: a NEW milestone (CR-2026-020) that cycles through
  requirement → dev → QA → **requirement (again)** → dev → QA because of a
  mid-flight scope change and a critical regression, and is still active
  and overdue **today**. Ten checkpoints (PM-01…PM-10), one narrative.
- `seed-sparrow-milestones-bonus.ts` — 10 Milestones-page scenarios: a
  milestone re-planned before work starts, the sprint and phase types (not
  just cr/release), a cancelled milestone, a sign-off rejected then
  approved on retry, a deleted milestone, environment contention resolved
  proactively (a month ahead, not mid-run), an external-vendor start delay,
  and a milestone that's still just a placeholder nobody's touched.

See `SPARROW_SCENARIOS.html` for the full reference covering **all five**
— every scenario, actor, and data value spelled out. Open it in a browser
and keep it up while presenting.

Everything is created through the real API — not raw SQL — so the FA review
workflow, segregation-of-duties blocks, dev hand-off gates, defect codes,
notifications and audit trail all fire exactly as they would for real users.
Two scenarios are deliberately exercised as *expected failures* to prove
governance is enforced: an author trying to approve their own requirement,
and a Dev Lead trying to assign an unapproved requirement to a developer —
both are logged as "✓ blocked as expected."

## Before you run it

1. Find your app's public URL (the one you open QAPulse at in a browser),
   e.g. `https://your-repl-name.username.repl.co`.
2. Make sure `admin@qapulse.com` is still a working admin login (override
   via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` if you changed it).

## Run it (3 steps, in order)

From the Replit shell:

```bash
cd scripts
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-data.ts
```

This makes a few hundred real API calls — takes a minute or two. It prints
progress phase by phase (matching the PDF's Phase 1–12 structure) and ends
with a PDF-code → real-defect-code mapping (e.g. `DEF-0042 → DEF-0007`) so
you can cross-reference the document while presenting.

Then backdate every timestamp to the storyline's actual dates and stamp
final defect statuses (Closed / Deferred):

```bash
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data.ts
```

Without this step everything will have been created "just now," so the PM
Dashboard's phase timeline, SPI, and the defect escape funnel will look
flat/instant instead of telling the multi-week story the PDF describes.

That's the main storyline done — log in as any of the 11 personas below and
present. **Presenting the Requirements page?**

```bash
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-requirements-bonus.ts
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-requirements-bonus.ts
```

**Presenting Test Cases / Execution / QA Analytics?**

```bash
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-testcases-bonus.ts
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-testcases-bonus.ts
```

**Presenting the Defects page?**

```bash
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-defects-bonus.ts
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-defects-bonus.ts
```

**Presenting the PM Dashboard?**

```bash
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-pmdashboard.ts
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-pmdashboard.ts
```

**Presenting the Milestones page?**

```bash
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-sparrow-milestones-bonus.ts
DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-milestones-bonus.ts
```

All five are independent and can be run in any order (or just the ones you
need). Then open `SPARROW_SCENARIOS.html` for the full RQ-01…12 / TX-01…12 /
DX-01…10 / PM-01…10 / MS-01…10 reference (data, actors, dates, what each one
demonstrates).

**Re-run the PM Dashboard finalize close to when you actually present** —
its dates are anchored to "today" at run time (same as TX-11's stale file
and DX-01/DX-09), so the milestone reads as freshly overdue whenever you
run it, not just on the day you first seeded it.

## Dates

The PDF's timeline runs 04 Aug 2026 → 23 Oct 2026, which is in the future
relative to "today." `sparrow-data.ts` shifts every date back 4 months by
default (`PDF_DATE_SHIFT_MONTHS`, top of the file) so the whole lifecycle —
including the production escape ~2 weeks after go-live — lands in the recent
past. Change that one constant and re-run if you'd rather anchor it
differently; every date in the file is written in PDF terms via `pd("2026-08-04")`
so it stays readable against the document regardless of the shift.

## Logging in

All 11 users share one password: `Sparrow@2026`. Emails are
`firstname.lastname@demo.qapulse.local`.

| Name | Role | Email |
|---|---|---|
| Salmah Idris | PMO | salmah.idris@demo.qapulse.local |
| Rizal Hamzah | Head of PM | rizal.hamzah@demo.qapulse.local |
| Aina Zulkifli | FA (author) | aina.zulkifli@demo.qapulse.local |
| Daniel Wong | FA Lead (approver/sign-off) | daniel.wong@demo.qapulse.local |
| Harith Rahman | FA (peer reviewer) | harith.rahman@demo.qapulse.local |
| Farhan Abdullah | Dev Lead | farhan.abdullah@demo.qapulse.local |
| Wei Jun Tan | Developer | weijun.tan@demo.qapulse.local |
| Kavitha Nair | Developer | kavitha.nair@demo.qapulse.local |
| Melissa Lim | QA Lead | melissa.lim@demo.qapulse.local |
| Syafiq Osman | QA Engineer (PIC) | syafiq.osman@demo.qapulse.local |
| Nurul Huda | QA Engineer | nurul.huda@demo.qapulse.local |

Good pages to show the CEO, in PDF order: **Milestones** (CR-2026-014's
phase Gantt + the ENV2→ENV4 change history) → **Requirements** (REQ-101…104
with AI analysis history, the reject/revise trail) → **Traceability Matrix**
→ **Test Cases** → **Execution** (SIT then UAT files) → **Defects** (the
escape funnel: SIT 3 / UAT 1 / Production 1) → **Risk Register** →
**PM Dashboard** (SPI dip and recovery around DEF-0051) → the closed
milestone's **Lessons Learned**.

If you've also seeded the PM Dashboard bonus layer, save CR-2026-020 for
last as the contrast: same PM Dashboard, same project, but active, overdue
today, 2 full rework cycles, and a defect still open right now.

## Clear it before/after a demo

```bash
cd scripts
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/clear-sparrow-data.ts
```

Reads `sparrow-seed-manifest.json` (written incrementally while seeding) and
deletes exactly those entities, in dependency-safe order — never by name
matching, so it's safe even if real client data exists alongside it.
Re-running `seed-sparrow-data.ts` while a manifest already exists is refused
on purpose; clear first.

If a run fails partway through, the manifest still has everything created so
far — run the clear script before retrying.

## Known limitations

- **Defects show a "pending sync" badge.** The write-through push to Redmine
  will fail with no live Redmine connection in a sandbox — expected, not a
  bug (same as the older two-project demo set). `finalize-sparrow-data.ts`
  stamps the final status (Closed/Deferred) directly in the DB since the
  normal status-change endpoint requires a synced Redmine status row.
- **AI calls are best-effort.** `seed-sparrow-data.ts` tries the requirement
  analyzer (twice on REQ-103, once each on REQ-101/102) and two milestone
  risk assessments; any failure is logged and the script continues — set
  `SEED_RUN_AI=0` to skip them outright if you don't have AI integration
  credentials configured.
- **`sparrow-seed-manifest.json` is gitignored** — local run state, not
  something to commit.
- **TX-05 (CAPA analysis), TX-06 (natural-language search), and TX-07
  (AI test-data) are ephemeral.** None of these AI responses are persisted
  anywhere in the database — the seed scripts call them once just to prove
  they work, but for the actual demo you'll want to trigger them live from
  the UI so the CEO sees a fresh response, not a stale one.
- **TX-08's cloned SIT snapshot isn't linked to any milestone.** The
  execution-file clone endpoint doesn't accept a `milestoneId`, and there's
  currently no way to set one on a file after it's created either — a real
  gap in the app, not a demo mistake, worth mentioning if it comes up.
- **DX-01 and DX-09, and the whole PM Dashboard layer, are anchored to the
  real current date, not the shifted historical timeline.** That's
  deliberate — "still open today" and "overdue today" are meant to be true
  whenever you actually present, not fixed to the day you first seeded
  them. Re-run the relevant `finalize` script again shortly before
  presenting if it's been more than a day or two since you last ran it.
- **DX-03/DX-04's retest and reopen history is narrated in the defect's
  own description/actual-result text, not as separate status-history
  rows.** The app doesn't expose a native multi-step status-history log
  outside the Redmine-gated flow, so the "fixed → still failed → fixed
  again" story is written into the record itself — read it there rather
  than expecting a visual timeline widget.
- **Milestone sign-off (`/milestones/:id/review`) doesn't stamp
  `completedAt` itself** — only a plain field-edit PATCH does that
  automatically. MS-05 (and the main storyline's CR-2026-014) route around
  this by setting `completedAt` directly in the `finalize` script, same
  gap either way.
- **MS-06's deleted milestone leaves any linked requirements/execution
  files with a dangling `milestoneId`**, same "no cascade" pattern as
  RQ-11's orphaned requirement child — not a bug specific to this demo, a
  real characteristic of the app worth knowing before it surprises anyone.
- **MS-01's re-planned milestone stays `planned` and may still show as
  "overdue" on today's real-time dashboard**, since (like the rest of the
  historical-narrative dates) its shifted target date has already passed
  relative to the real calendar. The interesting thing to point at is the
  re-planning *action* itself — the before/after dates and the linked risk
  — not that day's live schedule-risk badge.
