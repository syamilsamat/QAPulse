# CR022: FA Requirement Workflow Enhancements — Acceptance Criteria, Discussion Threads, UAT Evidence

**Status:** 📋 Planned (2026-07-04). Part 1 is independent and can ship any time (ideally with/before CR015); Parts 2–3 depend on CR014.

## Context

Follow-ups to CR014's FA track onboarding (`docs/change-requests/pm-ba-onboarding.md`). CR014 gives the FA track its roles, the upstream requirement-approval gate, the downstream milestone UAT gate, the Requirement Detail page, the review queue, and description diffs. This CR deepens the workflow around those gates with three separable features:

1. **Acceptance criteria** — a structured "how do we know this is done" list on every requirement, so FA review, QA test authoring, AI test-case generation, and UAT all check against something concrete instead of prose.
2. **Discussion threads** — the reject → revise → resubmit loop is a conversation; keep it in QAPulse instead of Teams/email.
3. **UAT with evidence** — CR014's milestone UAT gate is a single approve/reject; without recorded per-requirement UAT results it's a rubber stamp with no trail, which undercuts the audit-heavy design of everything else in CR014.

They're bundled as one CR because they share a theme (FA requirement workflow) and an audience, but each Part is independently shippable and sequenced separately — see Sequencing at the bottom.

## Part 1 — Acceptance criteria as a structured field (no CR014 dependency)

- **Schema**: nullable `acceptanceCriteria jsonb` on `requirementsTable` — an ordered array of plain strings (a checklist). No per-criterion status lives on the requirement itself; pass/fail is recorded per UAT execution row (Part 3), the same way library test cases don't carry results but execution instances do.
- **UI**: a checklist-style editor (add / remove / reorder rows) in the New/Edit Requirement dialogs and on the Requirement Detail page once CR014 lands (until then, the edit modal alone is enough — this Part doesn't wait for CR014).
- **Feeds AI test-case generation (CR015)**: CR015's per-requirement payload (`requirements: [{id, title, description}]`) gains an `acceptanceCriteria` field; the prompt instructs the model to cover each criterion with at least one test case. This is the main reason to ship Part 1 early — generated test cases anchored to explicit criteria beat ones inferred from a description.
- **Feeds FA review and UAT**: the CR014 review box and the milestone UAT sign-off both display the criteria list — reviewers approve against criteria, not vibes.
- **Interaction with CR014 Part 7 (re-review flag)**: extend the "only `description` edits trigger `requirementRevisedAt`" rule to *`description` or `acceptanceCriteria`* edits — criteria are exactly the substance test cases are written against. (CR014 already notes the field list is a one-line change.)
- **Redmine-imported requirements**: `acceptanceCriteria` stays `null` on import (Redmine has no structured equivalent); FA fills it in post-import. No parsing heuristics.

## Part 2 — Discussion thread on requirements (depends on CR014's Detail page)

- **New table** `lib/db/src/schema/requirement-comments.ts` (no FK constraints, matching codebase style):
  ```ts
  export const requirementCommentsTable = pgTable("requirement_comments", {
    id: serial("id").primaryKey(),
    requirementId: integer("requirement_id").notNull(),
    userId: integer("user_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  });
  ```
- **Endpoints**: `GET /requirements/:id/comments` and `POST /requirements/:id/comments` in `routes/requirements.ts`, behind `requireAuth, resolveProjectAccess` + the standard `canAccessProject` guard (404 on denied). Any role that can *view* the requirement can comment — commenting has no self-service conflict, same reasoning as CR014's "Analyze with AI" access rule.
- **UI**: a chronological thread on the Requirement Detail page, between the FA review box and the History panel. Plain text, newest last. No @-mentions, no threading/replies in v1.
- **Notifications** (via `notificationsTable`, one insert per recipient, same as `tasks.ts`): a new comment notifies the requirement's `createdBy`, its `assigneeId`, and every prior commenter on that requirement — deduped, minus the commenter themselves.
- **Comments are permanent** — no edit or delete in v1, consistent with the audit posture of CR014's `activityTable` journal. (Admin cleanup tooling deferred until someone actually needs it.)
- Review-action comments (the approve/reject comment from CR014) stay in `activityTable` where CR014 put them — this thread is for discussion *between* review actions, not a replacement for the review audit trail. The Detail page renders both, so the full conversation reads in order.

## Part 3 — UAT with evidence (depends on CR014 Milestones + UAT gate)

Reuses the existing execution machinery rather than building a parallel UAT module — the audit trail (`executionTcHistoryTable` rows on every result change) then works for free.

- **Schema**: two nullable columns on `executionFilesTable`: `fileType text default 'qa'` (`qa` | `uat` — free text like every other type column) and `milestoneId integer`.
- **"Start UAT" action** on a milestone (PM Dashboard milestone card / milestone view, visible once the milestone reaches its UAT stage): creates a `fileType: 'uat'` execution file linked to the milestone, pre-populated with one row per **acceptance criterion** of each of the milestone's requirements (Part 1 data), falling back to one row per **requirement** for requirements with no criteria. Row text = the criterion text (or requirement title), so the FA checks off exactly what "done" was defined as.
- **FA access**: FA-track roles gain access to the execution progress page for `fileType = 'uat'` files only (route-level check — QA execution files stay invisible to FA). Reached via a link on the milestone card; no new top-level nav item.
- **Recording results**: the existing `ResultPills` → `saveTestCases()` → `POST /execution-files/:ticketId/test-cases` path, unchanged — which means every UAT pass/fail lands in `executionTcHistoryTable` (`fromStatus`/`toStatus`/`changedBy`/`changedAt`) automatically, the same audit mechanism CR014 Part 7 leans on.
- **Tie-in to the UAT gate**: CR014's `PATCH /milestones/:id/review` UI shows the linked UAT file's rolled-up summary (passed/failed/not-executed counts) next to the approve/reject buttons. A **warning** (not a block) is shown when signing off `uat_passed` while failures or not-executed rows remain — consistent with CR014's "milestone status is unenforced free text" default. The sign-off itself still writes to `activityTable` per CR014; now there's evidence behind it.
- One active UAT file per milestone — clicking "Start UAT" again opens the existing file instead of creating a duplicate. A re-UAT round after a rejection reuses the same file; prior results stay in history.
- PMO-report surfacing of UAT summaries: explicitly out of scope here (natural follow-up once this data exists).

## Defaults adopted

- Acceptance criteria are plain strings — no per-criterion IDs, owners, or statuses on the requirement itself.
- Comments are permanent (no edit/delete) and plain text (no mentions/attachments) in v1.
- One UAT file per milestone; criterion-level rows when criteria exist, requirement-level rows otherwise.
- UAT sign-off with outstanding failures warns but doesn't block.

## Verification

- **Criteria round-trip**: create a requirement with 3 acceptance criteria; confirm they store, render in order, and reorder correctly. Edit one criterion on a requirement with a linked test case and a linked task — confirm CR014 Part 7's revised-flag fires on both (same as a description edit).
- **Criteria → AI**: with CR015 in place, generate test cases for a requirement with criteria — confirm the criteria appear in the request payload and the prompt.
- **Thread + notification fan-out**: FA B comments on A's requirement — A is notified. C (a third user with project access) comments — A and B are notified, C is not self-notified. A user with no `project_members` row for the project gets a 404 on both GET and POST.
- **Comments vs review audit**: approve a requirement with a comment (CR014) and post a thread comment — confirm the review lands in `activityTable`/History and the comment in the thread, both visible on the Detail page, neither duplicated into the other.
- **UAT file generation**: milestone with 2 requirements — one with 3 criteria, one with none → "Start UAT" creates one UAT file with 4 rows (3 criterion rows + 1 requirement row). Clicking "Start UAT" again opens the same file.
- **UAT access scoping**: an FA-track user can open the UAT file's execution page but gets 404 on a `fileType = 'qa'` file in the same project; a `qa_member` sees the UAT file listed but QA workflows are otherwise unchanged.
- **UAT evidence trail**: mark rows Passed/Failed — confirm `executionTcHistoryTable` rows appear per change. Open the milestone review with one row Failed — confirm the summary and the warning render, and `uat_passed` can still be submitted (warn, not block).

## Sequencing

1. **Part 1** — any time; no dependencies. Ship with or before CR015 so AI generation benefits immediately.
2. **Parts 2–3** — after CR014 ships (Detail page and Milestones/UAT gate are the surfaces they attach to).
