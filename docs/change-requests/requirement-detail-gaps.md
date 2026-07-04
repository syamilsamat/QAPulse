# CR023: Requirement Detail & Review Workflow Gaps

**Status:** Planned — not yet started

## Context

CR014 (Org-wide Role Hierarchy & Project-Level Access Control) and CR022 (FA Requirement Workflow Enhancements) both shipped, while a more detailed design for the Requirements page and FA review workflow was worked out independently in `docs/change-requests/pm-ba-onboarding.md`. Comparing what actually shipped against that design surfaced real gaps — most are missing polish, but four are actual bugs that undermine guarantees the review workflow is supposed to provide. This CR closes both.

Current shipped baseline (confirmed by direct code read, not assumed):
- `requirementsTable` has `reviewStatus`, `createdBy`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`, `milestoneId` — the audit-column design already matches CR014's plan
- `RequirementDetail.tsx` exists at `/requirements/:id` with a working review box correctly hidden from the author
- `routes/requirements.ts`'s `PATCH /requirements/:id/review` exists and blocks self-approval

## Part 1 — Bug fixes (do these regardless of what else lands)

**1.1 — Reject isn't guarded against self-review.** In `PATCH /requirements/:id/review`, the segregation-of-duties check is:
```js
if (action === "approve" && createdBy === ctx.userId) { res.status(403)... }
```
Only the `approve` branch is checked. Add the same guard to `reject`: an author must not be able to reject (or approve) their own requirement — both actions are "review," and only a different FA-track user should be able to perform either.

**1.2 — Reject notification is incomplete.** Currently only `createdBy` (author) is notified on reject. Extend to also notify:
- The requirement's `assigneeId` (if set and different from the author)
- The requirement's Milestone's creator (PM) — requires a join from `requirementsTable.milestoneId` → `milestonesTable` → whichever field identifies who created it (check current `milestonesTable` schema for a `createdBy`-equivalent column; add one if it doesn't already track this, since the PM-notification-on-reject design depends on knowing who to notify)

Approve should continue to notify only the author + assignee — no PM involvement needed there, consistent with the original design ("routine progress" vs. "needs visibility because of a stall").

**1.3 — No restriction on editing a rejected requirement.** The generic `PATCH /requirements/:id` handler has zero awareness of `reviewStatus`. Add: while `reviewStatus === "rejected"`, only `ctx.userId === createdBy || ctx.userId === assigneeId` (or `admin`/`cto`) may successfully `PATCH` it — everyone else gets 403. This is what actually makes "revise and resubmit" a controlled loop instead of open editing by anyone.

**1.4 — Redmine-imported requirements never get `createdBy` set.** Neither `syncRedmineTicket()` nor `POST /requirements/resolve-redmine` populate it — it's left `null`/undefined on insert. Since `null` never equals any real user ID, imported requirements currently have **no segregation-of-duties protection at all** — anyone can approve them, including whoever ran the import. Fix: resolve `createdBy` from the Redmine issue's `author.name`, matched case-insensitively against `usersTable.name`; if no match exists, fall back to the importing user (never leave it `null`). Log the fallback case so it can be reconciled later — name-matching across two systems is inherently approximate, not a real identity link.

## Part 2 — Complete `RequirementDetail.tsx`

**2.1 — Breadcrumb should trace the actual `parentId` ancestry**, not the current generic "Requirements › {title}". Walk `parentId` up to the root ancestor (reusing the same parent/child data the list view's tree already builds), rendering each ancestor as a clickable link to its own detail page and the current requirement as the non-clickable, bolded rightmost segment. A root-level requirement with no parent just shows itself.

**2.2 — Add a "Child Requirements" section** listing this requirement's children (`requirementsTable.parentId = this.id`), each a link into that child's own detail view — the detail-view equivalent of the list's expand/collapse tree nesting.

**2.3 — Add a "History" section** — a chronological activity journal for this requirement (creation, every review action, any AI analysis runs — see Part 4 for how test-case/task impact should also surface here). Reuse whatever activity-log infrastructure CR011 already shipped (`_audit.ts`'s `logActivity`) rather than building new logging — this requirement already gets activity rows written on creation and review actions; the gap is purely that `RequirementDetail.tsx` never fetches or renders them.

**2.4 — Add the AI Requirement Analyzer entry point.** Add an "Analyze with AI" button in the page header (reusing the existing `/ai/analyze-requirement` endpoint already used elsewhere in the app). On click: button shows a loading state, then the result (quality score, risk badge, missing items, clarifying questions) expands **inline** on the page — directly below Description — rather than opening a separate modal, since this page already has room and its own scroll. Log each run as a History entry so past results stay reviewable without re-running. Available to **both** the author and any potential approver — no restriction here, unlike the review action itself.

**2.5 — Add test coverage count** to the metadata sidebar (`tcCount`/`execPass`/`execFail`) — the list page already computes this; the detail page just needs to fetch and display the same numbers for this one requirement.

## Part 3 — Complete the list view (`Requirements.tsx`)

**3.1 — Add a Milestone column** to the table (comfy mode at minimum) — `milestoneId` is already captured in the create/edit form but never surfaced in the list.

**3.2 — Title click should navigate to the detail page**, not open the edit modal. Currently the only path to `/requirements/:id` is the row's "⋮" → "View Detail" — an extra click most users won't discover. Keep "Edit" as its own explicit dropdown action for people who want the quick-edit modal without leaving the list, but make the primary click target (the title) go to the detail page, consistent with how Redmine and the rest of this design treats "click the subject" as "open the full record."

**3.3 — Priority as a left-stripe, not a pill badge** (optional polish, lower priority than 3.1/3.2) — thin colored border on the row instead of `PRIORITY_COLORS` pill badges, freeing up column width now that Milestone is being added.

**3.4 — Filters as removable chips instead of dropdowns** (optional polish, lowest priority in this Part) — matches the same visual language as 3.3; defer if time-constrained, these two are cosmetic compared to 3.1/3.2.

## Part 4 — Requirement-change re-review flow (confirmed entirely unbuilt)

This is a full port of Part 7 from `pm-ba-onboarding.md` — nothing here has changed conceptually, it just needs to actually be built against the current schema:

**Schema additions** — three new columns, no new tables:
- `testCasesTable.requirementRevisedAt timestamp` (nullable) — set to `now()` whenever `PATCH /requirements/:id` changes `description` on a requirement with ≥1 linked test case (`testCasesTable.requirementId = this.id`)
- `tasksTable.requirementRevisedAt timestamp` (nullable) — same trigger, mirrored onto linked tasks (`tasksTable.requirementId = this.id`)
- `executionTestCasesTable.reviewAcknowledgedAt timestamp` (nullable) — per-execution-instance acknowledgment, since one library test case can be compiled into multiple execution files independently

**Notification fan-out on requirement revision**: the requirement's `createdBy`, its `assigneeId`, and every entry in `assigneeIds` on each linked Task.

**Alert visibility (computed at read time):**
- Test cases: an execution test case row shows the alert when `testCase.requirementRevisedAt IS NOT NULL AND (executionTestCase.reviewAcknowledgedAt IS NULL OR executionTestCase.reviewAcknowledgedAt < testCase.requirementRevisedAt)` — re-triggers correctly if the requirement changes again after a prior acknowledgment. Test Case Library page shows an informational badge (no action there); the Execution file page gets the actionable **"Revised"** button next to the existing result-selection UI.
- Tasks: the Tasks page shows an informational alert banner with a simple **Acknowledge** action (clears `requirementRevisedAt`) — no forced status change, visibility only.

**"Revised" action on a test case** — resets `result` to `"Not Executed"` through the *existing* save path (not a new endpoint), since that path already auto-logs every result change to `executionTcHistoryTable` — the audit trail this needs already exists, just needs the reset routed through it. Sets `reviewAcknowledgedAt = now()` for that instance. QA then retests normally; the new result is logged the same way as any other change.

## Verification

- Reject own requirement as its author → confirm 403 (currently succeeds — this is the bug from 1.1)
- Reject a requirement → confirm author, assignee, and the milestone's PM/creator all get notified (currently only author does)
- As a third FA-track user (not author/assignee) → attempt to edit a `rejected` requirement → confirm 403; author or assignee can still edit successfully
- Import a Redmine ticket → confirm `createdBy` resolves to a name-matched QAPulse user (or the importer as fallback), never `null`
- Open a requirement's detail page → confirm breadcrumb shows real ancestor IDs (not generic text), confirm Child Requirements section lists actual children, confirm History shows creation + review entries, confirm "Analyze with AI" works inline and logs to History
- On the list view, click a requirement's title → confirm it navigates to `/requirements/:id`, not the edit modal
- Edit a requirement's description with linked test cases and tasks → confirm both show the re-review alert, confirm "Revised" resets result and logs to `executionTcHistoryTable`, confirm Task alert clears via Acknowledge without changing task status
