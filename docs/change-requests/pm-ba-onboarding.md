# CR: Expand QAPulse beyond QA — Org-wide role hierarchy & project-level access control

**Status:** Deferred — not yet started

## Context

QAPulse today is a QA-only tool: 4 roles (`admin`, `qa_lead`, `qa_member`, `pmo`), and every authenticated user can read/write every project's requirements, test cases, execution files, and tasks — there is no project-level data scoping (`requirements.ts` etc. barely call `verifyToken`, and nothing checks "does this user belong to this project"). The goal is to widen QAPulse into a genuinely multi-department platform matching this org's real reporting structure — not just flat "one role per department," but the full seniority hierarchy each department already uses. **Dev stays entirely outside QAPulse** (confirmed — Dev/Dev Lead/HOD Dev do not get logins; Dev work happens externally and QAPulse only sees the Task that PM creates once Dev is done). **Microsoft/Azure AD SSO stays out of scope** (tracked separately in `microsoft-login-sso.md`).

The role/nav-permission system is already fully data-driven (`roles` + `role_nav_permissions` tables, admin-editable via `POST /roles` and `PUT /roles/:id/permissions`), and `projectId` columns already exist on `requirements`, `test_cases`, `tasks`, and `execution_files`. The missing pieces are: (1) *enforcing* project-level scoping, (2) tiering that scoping so seniority escalates visibility, and (3) two new department-facing surfaces (PM dashboard, Functional Analyst requirements-review workflow).

### Workflow this needs to support

The real SDLC loop QAPulse is being asked to formalize is not a straight line, it loops back through the Functional Analyst (FA) twice:

```
PM (intake) → FA (analyze + requirement) → [approval gate] → PM (assign) → Dev (build, external)
                    ↑                                                          ↓
                    └──────────── UAT (FA verify) ←── QA (test) ←──────────────┘
                                        ↓
                                  PM (close out)
```

This same loop has to serve **two different scales**:
- **A Change Request (CR)** — a small, usually single-pass slice: PM logs a CR, FA writes 1–3 requirements against it, they get approved, Dev builds (external), QA tests, FA does UAT, PM closes it.
- **A brand-new project** — the identical loop, but run at BRD/FRD scale (dozens–hundreds of requirements) and sliced into multiple sequential phases/sprints, each with its own requirement set, its own QA pass, and its own UAT.

Rather than build separate machinery for "CR mode" and "new project mode," both are modeled as the same primitive at different sizes: a **Milestone** — a named, time-boxed slice of work within a Project. A CR is a Project with exactly one Milestone. A new project is a Project with a sequence of Milestones (Phase 1, Phase 2, ... or Sprint 1, Sprint 2, ...). Everything downstream (requirements, tasks, PM dashboard grouping, FA review/UAT sign-off) hangs off this one primitive, so the same code path serves both cases.

## Role hierarchy & tiered visibility model

The org's real structure, one CTO above every department:

```
                              CTO (everything, company-wide)
                                          │
        ┌───────────────┬────────────────┼────────────────┐
     HOD PM        HOD FA & BI        HOD QA           HOD Dev (external — no login)
        │            /      \             │
   PM Lead      FA Lead    BI Lead    QA Manager
        │            │         │          │
       PM           FA        BI       QA Lead
                                            │
                                          QA (qa_member)
```

- **PM track:** `project_manager` → `pm_lead` → `hod_pm`
- **FA track (shares one HOD with BI):** `functional_analyst` → `fa_lead` → `hod_fa_bi`
- **BI track:** *deferred* — `bi` / `bi_lead` role names are reserved (so `hod_fa_bi`'s visibility computation is forward-compatible) but no BI-specific pages/endpoints are built in this CR. BI's actual QAPulse purpose gets designed later.
- **QA track (already partly exists):** `qa_member` (existing) → `qa_lead` (existing) → `qa_manager` (**new**) → `hod_qa` (**new**)
- **Dev track:** out of scope — no roles, no logins.
- **CTO:** `cto` — sits above all HODs, sees everything.

**Visibility model — configurable via the `roles` table, no new "reports-to" schema.** There is no "who reports to whom" data in QAPulse and this CR doesn't add one. Instead, two new columns go on the existing (already admin-editable) `roles` table:

```ts
// lib/db/src/schema/roles.ts (add to existing rolesTable)
department: text("department"),   // nullable free text: "pm" | "fa_bi" | "qa" | null (unset = no department/tiering, e.g. admin, pmo)
tierRank:   integer("tier_rank"), // nullable: higher = more senior within the department; null = flat/no escalation
```

Seeded defaults for this CR's 12 new/changed roles (admin can rename departments, add tiers, or move a role between departments later — **no code deploy needed**, same as editing nav permissions today):

| Role | department | tierRank |
|---|---|---|
| `project_manager` | `pm` | 10 |
| `pm_lead` | `pm` | 20 |
| `hod_pm` | `pm` | 40 |
| `functional_analyst` | `fa_bi` | 10 |
| `fa_lead` | `fa_bi` | 20 |
| `bi` *(reserved, not onboarded)* | `fa_bi` | 10 |
| `bi_lead` *(reserved, not onboarded)* | `fa_bi` | 20 |
| `hod_fa_bi` | `fa_bi` | 40 |
| `qa_member` *(existing)* | `qa` | 10 |
| `qa_lead` *(existing)* | `qa` | 20 |
| `qa_manager` | `qa` | 30 |
| `hod_qa` | `qa` | 40 |
| `cto` | *(null — special-cased, see below)* | — |
| `admin` | *(null — special-cased, unchanged)* | — |

**`resolveProjectAccess` algorithm** (fully data-driven, reads the caller's `department`/`tierRank` from `roles` at request time):
```ts
if (role === "admin" || role === "cto") { accessibleProjectIds = null; return; } // unrestricted
const myRole = SELECT department, tierRank FROM roles WHERE name = req.authUser.role;
if (!myRole.department || myRole.tierRank == null) {
  accessibleProjectIds = [own direct project_members rows]; // safe default for unconfigured/legacy roles
} else {
  const peerUserIds = SELECT id FROM users u JOIN roles r ON r.name = u.role
                       WHERE r.department = myRole.department AND r.tierRank <= myRole.tierRank;
  accessibleProjectIds = [project_members rows for peerUserIds] UNION [own direct rows];
}
```
A role at `tierRank` N sees every project touched by anyone in the same `department` at rank ≤ N, plus their own direct assignments regardless of rank (covers the edge case of a senior person also being personally added to a project). This is one uniform rule for every tier — HOD naturally ends up seeing "the whole department" simply because it's configured as the highest rank in that department, not because of a special case. One consequence worth being explicit about: `qa_manager` (rank 30) and `hod_qa` (rank 40) are **not** guaranteed identical under this rule — `hod_qa` additionally picks up any project the HOD is *personally* a direct member of that a rank-30-and-below query wouldn't otherwise surface. In practice this rarely matters (HODs are rarely individually assigned to projects), but it's a more honest model than claiming the two tiers are always equivalent.

Since the output is still the same `number[] | null` shape, **no changes needed** to `canAccessProject`/`scopeToUserProjects` or any of the already-designed per-route retrofits.

## Part 1 — Project-level access control (prerequisite)

**New table** `lib/db/src/schema/project-members.ts` (mirrors the composite-PK style of `role-nav-permissions.ts`):
```ts
export const projectMembersTable = pgTable("project_members", {
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  projectRole: text("project_role"), // free text, unenforced in this phase
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.projectId, table.userId] })]);
```
No FK constraints, consistent with existing `projectId` columns elsewhere. Export from `schema/index.ts`.

**Schema addition** to the existing `lib/db/src/schema/roles.ts` (`rolesTable`): nullable `department text` and `tierRank integer` columns, per the section above. This is the only new schema for the tiering system — no separate lookup file.

**Admin UI**: `Roles.tsx` and `routes/roles.ts`'s `PATCH /roles/:id` get two new editable fields — Department (text/select) and Tier Rank (number). Existing `POST /roles` also accepts them at creation. This means an admin can retier or re-department **any** role — including ones this CR seeds — without a code deploy, exactly like nav permissions today.

**New middleware** `artifacts/api-server/src/middlewares/auth.ts`:
- `requireAuth` — reads the Bearer token, calls the existing `verifyToken()` (from `routes/auth.ts`), sets `req.authUser = { id, email, role }`. Replaces scattered inline `verifyToken()` calls.
- `resolveProjectAccess` — after `requireAuth`; computes `req.accessibleProjectIds` per the `department`/`tierRank` algorithm above (`null` = unrestricted, for `admin`/`cto`).

**Caching, not a dependency on CR012.** The Lead/Manager/HOD tier computation is a join across `users`/`roles`/`project_members` that now runs on nearly every request. Rather than block this CR on **CR012** (Scalability & Performance Hardening — still 📋 Planned, and largely orthogonal anyway: its concerns are Excel/Puppeteer blocking the event loop, DB pool tuning, rate limiting, different hot paths entirely), `resolveProjectAccess` ships with a **short-TTL in-memory cache** (keyed by `userId`, a few seconds' TTL, invalidated on any `project_members` write for that user) as a cheap stopgap. When CR012 eventually builds its Redis caching layer, migrating this one query to it is a small follow-up, not a blocker now.

**New helper** `artifacts/api-server/src/lib/scope.ts` (unchanged from original design — tiering is fully absorbed into `resolveProjectAccess`, not these helpers):
- `canAccessProject(req, projectId)` — for routes that filter in-memory after `db.select()`. `projectId: null` rows are hidden from non-admins.
- `scopeToUserProjects(req, projectIdColumn, params)` — for raw-SQL/`pool.query` routes (`traceability.ts`), returns a `WHERE project_id = ANY($n)` clause fragment (using `[-1]` as a safe empty-result sentinel rather than an empty array).

**Wiring** in `artifacts/api-server/src/routes/index.ts`: `router.use(requireAuth, resolveProjectAccess, requirementsRouter)` (and the same for `testCasesRouter`, `tasksRouter`, `traceabilityRouter`, `projectsRouter`). `testExecutionRouter` needs a per-route (not router-level) application — it has an SSE endpoint (`GET /execution-events`) that can't carry an Authorization header, so blanket-mounting `requireAuth` there would break live execution updates. Also apply `requireAuth` + an admin/CTO-only check to the mutating endpoints in `rolesRouter` and `usersRouter`.

**Two routers originally missed** — both need the same `requireAuth, resolveProjectAccess` treatment as everything else, or Part 1's "no more unscoped project data" goal is only partially true:
- `pmoReportRouter` (`pmo-report.ts`) — currently fully unscoped; PMO reports pull project-specific data and should respect the same `canAccessProject` checks.
- `documentRegisterRouter` (`document-register.ts`) — same gap, lower sensitivity (mostly project/module/tracker/ref-no mappings) but still project-scoped data with zero access control today.

**AI endpoints also need scoping.** `POST /ai/analyze-requirement` (and other `aiRouter` endpoints that take a `requirementId`/`testCaseId`/`projectId` and fetch the record server-side) currently have no `canAccessProject` check at all — a user could analyze, and read the content of, a requirement outside their accessible projects just by knowing or guessing its ID. Mount `requireAuth, resolveProjectAccess` on `aiRouter` and add the same guard pattern used everywhere else (404 on denied access) to every AI endpoint that resolves a project-scoped record.

**Per-route retrofit**: unchanged from the original design (one-line-per-handler, 404 on denied access, `projects.ts`'s `GET /projects` stays an unfiltered picker source).

**Migration**: `pnpm --filter @workspace/db push`, plus a one-time backfill script grandfathering all current active users into all current active projects in `project_members` (run in the same deploy as middleware activation, so nobody gets locked out on day one).

**Admin UI for `project_members`** — lives on the **existing** "Project & Module Config" page (`ModuleAndProject.tsx`), as a new "Members" section alongside the Document Register section already on that page, not a new page. When a project is selected/expanded: a list of current members (name, role, added date) with a remove (✕) per row, and an "Add Member" row using the existing `SearchableSelect` component (filtered to exclude already-added members) + Add button. Backed by three small new endpoints, admin/cto-only (same gating pattern as `roles.ts`'s mutating endpoints): `GET /projects/:id/members`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:userId`.

## Part 2 — Milestones (shared primitive for CR and new-project work)

**New table** `lib/db/src/schema/milestones.ts`:
```ts
export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(), // e.g. "CR-042: Add SSO integration" or "Sprint 3 — Payment Module"
  type: text("type").notNull().default("cr"), // free text: cr | phase | sprint | release — reporting label only, unenforced
  status: text("status").notNull().default("planning"), // free text: planning | in_progress | qa | uat | done
  targetDate: timestamp("target_date", { withTimezone: true }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```
No FK constraints. A CR is simply a Project with one Milestone (`type: "cr"`); a new project is a Project with a sequence of Milestones (`type: "phase"`/`"sprint"`). `status` is free text like every other status column in this codebase.

**Schema additions**: nullable `milestoneId integer` on `requirementsTable` and `tasksTable`.

**New endpoints** in a new `routes/milestones.ts`, mounted behind `requireAuth, resolveProjectAccess`:
- `GET /projects/:projectId/milestones`, `POST /milestones`, `PATCH /milestones/:id` (status transitions) — same `canAccessProject` guard pattern as every other route in Part 1.
- `Requirements.tsx` and `Tasks.tsx` forms get an optional Milestone picker, scoped to the item's project.

## Part 3 — PM track onboarding (`project_manager`, `pm_lead`, `hod_pm`)

- Seed all three roles in `routes/roles.ts`'s `DEFAULT_ROLES`/`DEFAULT_PERMISSIONS`, with `department: "pm"` and `tierRank` 10/20/40 per the seed table above assigned at creation time. All three get the **same nav keys** — `nav:report`, `nav:tasks`, `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, `nav:pm-dashboard` — the tiers differ in *data scope* (via `resolveProjectAccess`), not which pages they can reach. Admin can adjust department/tierRank/nav for any of the three later via the Roles page.
- **New endpoint** `GET /dashboard/pm-summary` in `routes/dashboard.ts`, mounted behind the new middleware, aggregating `tasksTable`, `requirementsTable`, `milestonesTable`, and execution-file/summary data, grouped **per accessible project, then per Milestone within it**. Because `accessibleProjectIds` already reflects the caller's tier (own projects for `project_manager`, team's for `pm_lead`, whole department's for `hod_pm`), this one endpoint serves all three tiers without branching logic — the tiering is fully handled upstream in the middleware.
- **New page** `artifacts/qa-pulse/src/pages/PmDashboard.tsx` at route `/pm-dashboard`.
- `Layout.tsx`: add `"project_manager"`, `"pm_lead"`, `"hod_pm"` to the hardcoded `roles: string[]` fallback arrays on the relevant `NavItem` entries, and add the new PM Dashboard nav entry.

## Part 4 — FA track onboarding (`functional_analyst`, `fa_lead`, `hod_fa_bi`)

- Seed all three roles with `department: "fa_bi"` and `tierRank` 10/20/40, and nav keys: `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, `nav:report`. Same nav across tiers; scope differs via `resolveProjectAccess`. Also seed the reserved `bi`/`bi_lead` roles with `department: "fa_bi"`, `tierRank` 10/20 and **no nav keys** (no pages to show yet) — this is what makes `hod_fa_bi`'s visibility already correct once BI is actually onboarded later, without touching this CR's code again.
- **Schema**: add four explicit audit columns to `requirementsTable`, replacing the earlier generic `reviewedBy`/`reviewedAt` design — the org wants the *last approval* and *last rejection* independently retrievable, not overwriting each other if a requirement bounces back and forth:
  - `createdBy integer` (the table has **no author-tracking column at all** today; `createdAt` already exists) — populated from the auth token on `POST /requirements`, same pattern `test-cases.ts` already uses for `authorId`. **For Redmine-imported requirements specifically** (`syncRedmineTicket()` in `requirements.ts`), `createdBy` must **not** default to the importing QAPulse user — it should reflect who actually authored the ticket in Redmine. `syncRedmineTicket()` already has the full `issue` object from Redmine's API, which includes `issue.author.name`; resolve `createdBy` by matching that name (case-insensitive) against `usersTable.name`. If no QAPulse user matches (name drift, ex-employee, etc.), fall back to the importing user as a last resort so the column is never left `null` — but log this fallback so admins can reconcile the mapping later. Name-matching is inherently fuzzy (this is a stopgap, not a real cross-system identity link); flagged as a known limitation, not a blocker.
  - `approvedBy integer`, `approvedAt timestamp` — set only on an `approved` review action.
  - `rejectedBy integer`, `rejectedAt timestamp` — set only on a `rejected` review action.
  - These four columns always reflect the **most recent** approve/reject event (for quick display/filtering without a join); the **complete** history of every review action ever taken — including ones these columns have since been overwritten by — lives in `activityTable`, which is never overwritten. Both matter: the columns for "what's the current state," the journal for "show me everything that ever happened."
- **Segregation of duties**: the FA who authored a requirement **cannot** approve it — approval must come from a *different* FA-track user (any tier, including a peer at the same IC tier, not just a senior one). Confirmed explicitly: this is not "only Lead+ can approve," it's "not the author."
- **New endpoint** `PATCH /requirements/:id/review` in `routes/requirements.ts`: restricted to any FA-track role (`functional_analyst`, `fa_lead`, `hod_fa_bi`) or `admin`/`cto`, also passes through the project-access check; **additionally rejects with 403 if `req.authUser.id === requirement.createdBy`** ("cannot approve your own requirement"); sets `status` + (`approvedBy`/`approvedAt` or `rejectedBy`/`rejectedAt` depending on outcome), writes a permanent entry to `activityTable` (never deleted/overwritten — this is the audit trail). This is the **upstream** approval gate.
- **Notification fan-out on review** (via `notificationsTable`, mirroring the existing `tasks.ts` pattern of one insert per recipient):
  - **On approve**: notify `createdBy` (author) and `assigneeId` (if set and different from the author) — "proceeding as expected," no need to loop in PM.
  - **On reject**: notify `createdBy`, `assigneeId`, **and** the requirement's Milestone's `createdBy` (the PM) — a rejection means the CR/phase may stall, and PM is the one tracking that timeline, so they get looped in for **visibility only**. No PM action is required and nothing about the Milestone's own status changes automatically — "FA revises, resubmits, loop continues" without PM lifting a finger. This mirrors why the milestone-level UAT review already notifies PM the same way.
  - **Revise-and-resubmit is restricted to the author or the assignee** — while a requirement's `status` is `rejected`, `PATCH /requirements/:id` (edit) and whatever resubmits it back to `in_review` are only permitted for `req.authUser.id === requirement.createdBy || req.authUser.id === requirement.assigneeId` (or `admin`/`cto`). Any other FA-track user — even one who could otherwise approve/reject it — gets a 403 and the UI shows the requirement as locked to those two people until it's back in a reviewable state.
- **New endpoint** `PATCH /milestones/:id/review` — same pattern (own `approvedBy`/`approvedAt`/`rejectedBy`/`rejectedAt` columns on `milestonesTable`, plus a permanent `activityTable` entry), applied to a Milestone once its requirements have all passed QA: sets `status` to `uat_passed`/`uat_rejected` with a comment. This is the **downstream** UAT gate, closing the loop back to the FA track after QA. Notifies the Milestone's `createdBy` (the PM).
- **New endpoint** `GET /requirements/:id/activity` for the History panel — reads the permanent `activityTable` log for that requirement (creation, every review, every AI analysis run — see the new detail view below), oldest to newest.
- **Description snapshots → old-vs-new diff in the History panel.** Add nullable `oldValue text` / `newValue text` columns to the existing `activityTable` (an additive slice of what CR011 already plans for its unified audit table — when CR011 lands, these columns are already in place, not a conflict). Every `PATCH /requirements/:id` that changes `description` writes its activity entry with the previous and new description in those columns — the same triggering edit that sets Part 7's `requirementRevisedAt`, one code path for both. The Detail page's History panel renders these entries as "Description revised" with an expandable inline old-vs-new diff (computed client-side at render time — snapshots are stored full-text, descriptions are short). This is what makes the reject → revise → resubmit loop actually reviewable: the re-reviewing FA sees exactly what changed since they rejected it, not just "it was edited".
- **New page** `artifacts/qa-pulse/src/pages/RequirementDetail.tsx` at route `/requirements/:id` — replaces "click a row → open edit modal" with a real detail view (see mockup shared in chat), containing:
  - **Back button** + a **clickable breadcrumb that traces the actual `parentId` ancestry**, not a generic location path — e.g. for `#32133` whose parent is `#23132`, whose parent is `#13231`: `#13231 › #23132 › #32133`, walking the existing self-referencing `parentId` chain up to its root ancestor. Every segment except the current (rightmost, bolded, non-clickable) one navigates to that ancestor's own detail view. A root-level requirement with no parent just shows itself, no chain. This reuses the exact parent/child data the list view's tree already builds — no new schema.
  - Metadata grid (Status, Priority, Milestone, Project, Module, Assignee, Redmine #, test coverage), Description, the FA review box (approve/reject + comment, hidden for the author per the segregation rule above).
  - **Child Requirements section** — lists this requirement's children (via the existing `parentId` relationship, same data the list view's tree already uses), each a clickable link that navigates to that child's own detail view. This is the detail-view equivalent of the list view's expand/collapse tree nesting.
  - **History panel** — the full `activityTable` journal for this requirement, chronological: created, every approve/reject (by whom, when), every AI Requirement Analyzer run.
  - **"Analyze with AI" button** in the header — available to **both the author and any potential approver** (any FA-track role or admin/cto that can view the requirement, no restriction here — unlike the approve/reject action, there's no self-service conflict in *analyzing* your own or someone else's work). Every run is logged to the History panel as its own entry.
- **"My Review Queue" view — the FA's daily entry point**, so reviewables don't have to be hunted down in the Requirements list. A new `GET /requirements/review-queue` endpoint (behind `requireAuth, resolveProjectAccess`) returns two buckets, both scoped to the caller's accessible projects:
  - **"Waiting on my review"** — requirements with `status = in_review` where `createdBy !== req.authUser.id` (author-excluded per the segregation rule, so nothing in this bucket is ever un-actionable for the viewer).
  - **"Awaiting my revision"** — requirements with `status = rejected` where the caller is the `createdBy` or `assigneeId` (mirrors the revise-and-resubmit permission rule above — this bucket only ever contains items the viewer can actually act on).
  - Because project scoping already widens by tier, `fa_lead`/`hod_fa_bi` automatically see the whole team's queue from the same endpoint with zero branching logic — same pattern as the PM dashboard. For Lead+ tiers each row also shows **aging**: days in current status, computed from a new nullable `statusChangedAt timestamp` on `requirementsTable` (set whenever `status` changes in any endpoint; falls back to `updatedAt` for pre-migration rows), with rows past the threshold (default 5 days) highlighted — surfacing stalled reviews is the Lead's actual job.
  - UI: a "Review Queue" tab/section at the top of `Requirements.tsx` (a filter view, not a new page) plus a count badge on the Requirements nav item. Gated by the existing `nav:requirements` key — no new nav key needed. The tab only renders for FA-track roles (and admin/cto); other roles see the Requirements page unchanged.
- `Requirements.tsx` (list view): row click navigates to `/requirements/:id` instead of opening the edit modal; add a dedicated **Milestone** column; PM Dashboard's milestone cards get the same approve/reject affordance for the UAT gate (milestones have no single "author," so no self-approval restriction applies there).
- `Layout.tsx`: add `"functional_analyst"`, `"fa_lead"`, `"hod_fa_bi"` to the relevant `NavItem.roles` fallback arrays.
- **BI is not onboarded in this CR** — the `bi`/`bi_lead` role names exist only so `hod_fa_bi`'s visibility computation (Part 1's tiered model) already accounts for BI users once that role is designed. No BI pages, endpoints, or nav keys are built here.

## Part 5 — QA tier expansion (`qa_manager`, `hod_qa` — new)

QA already has `qa_member` and `qa_lead`; this CR only adds the two tiers above `qa_lead`, plus the tiering behavior itself:
- Seed `qa_manager` (`tierRank: 30`) and `hod_qa` (`tierRank: 40`) with `department: "qa"` and the **same nav keys `qa_lead` already has** (`nav:requirements`, `nav:test-cases`, `nav:traceability`, `nav:tasks`, `nav:ai-hub`, `nav:report`, `nav:inbox`, `nav:team`, `nav:team-hangouts`, `nav:configurations`).
- Backfill `department: "qa"` / `tierRank: 10` and `20` onto the **existing** `qa_member`/`qa_lead` role rows as part of this migration — they predate the `department`/`tierRank` columns, so without this step they'd fall into the "unconfigured role" fallback (IC-only visibility) rather than actually tiering.
- **Behavior change to flag clearly in testing**: today `qa_lead` and `qa_member` see identical (unscoped) data, since no access control exists yet. Once this CR ships, `qa_lead` becomes a genuine Lead tier — it will see every project any `qa_member` is assigned to, not just its own direct assignments. This is a real, user-visible change for existing `qa_lead` accounts, not just new roles — call it out to QA leadership before rollout.
- `Layout.tsx`: add `"qa_manager"`, `"hod_qa"` to the same fallback arrays `qa_lead` is already in.
- **Decision: no new "QA Leadership Dashboard" in this CR.** PM got a brand-new Dashboard because PM had zero cross-project rollup before this CR — nothing existed. QA already has `ReportDashboard.tsx` and `GET /dashboard/team` (execution stats, pass rates, defect summaries, per-member workload); once tiering lands, those same existing pages automatically show department-wide data for `qa_manager`/`hod_qa` for free, since `accessibleProjectIds` just widens. Building a parallel new page would solve a problem that mostly doesn't exist once that's accounted for.

## Part 6 — CTO onboarding (`cto`)

- Seed `cto` with `department: null`, `tierRank: null` (special-cased in `resolveProjectAccess`, not part of the department comparison), and the **broadest nav set** — everything `admin` has via `ALL_NAV_KEYS`, so the CTO can see any department's pages — but `cto` is **not** `admin`: it does not get access to `POST /roles`, `PUT /roles/:id/permissions`, or user-management mutations (those stay `admin`-only). CTO is "see everything, configure nothing."
- `resolveProjectAccess`: `cto` gets `accessibleProjectIds = null`, identical to `admin`'s unrestricted sentinel — project-level visibility, not object-model access.
- `Layout.tsx`: add `"cto"` to the fallback arrays used by `ALL_NAV_KEYS`-equivalent items.

## Part 7 — Requirement-change re-review flow (QA + Task-facing)

Closes a real gap: today, editing a requirement's `description` after test cases (or tasks) already exist against it doesn't notify anyone — QA has no way to know their existing pass/fail results were validated against a now-outdated requirement, and neither does whoever's working the linked Task.

**Schema additions** — three new columns, no new tables:
- `testCasesTable.requirementRevisedAt timestamp` (nullable) — the source flag for test cases. Set to `now()` whenever `PATCH /requirements/:id` changes the `description` field (title/priority/milestone/etc. changes do **not** trigger this — only edits to the substance test cases were written against) on a requirement that has ≥1 linked test case (`testCasesTable.requirementId = this.id`).
- `tasksTable.requirementRevisedAt timestamp` (nullable) — the same flag, mirrored onto any Task linked via `tasksTable.requirementId = this.id`, set in the same `PATCH /requirements/:id` side effect (one pass finds both linked test cases and linked tasks).
- `executionTestCasesTable.reviewAcknowledgedAt timestamp` (nullable) — per-execution-instance acknowledgment for test cases specifically (see below). Tasks don't need an equivalent acknowledgment column beyond dismissing the alert on `tasksTable` directly, since a Task doesn't have the "multiple independent execution instances" problem a library test case does.
- One `activityTable` entry is also written on the triggering edit: "Requirement #X revised — N test case(s) and M task(s) flagged for review."

**Notification fan-out on requirement revision** (via `notificationsTable`): notify the requirement's `createdBy` (author), its `assigneeId`, **and every entry in `assigneeIds` on each linked Task** — everyone whose work might be affected: whoever wrote it, whoever owns the requirement itself, and everyone actively working a task derived from it.

**Alert visibility (computed at read time, not a separately-maintained stored "flag"):**
- **Test cases**: an execution test case row shows the alert when `testCase.requirementRevisedAt IS NOT NULL AND (executionTestCase.reviewAcknowledgedAt IS NULL OR executionTestCase.reviewAcknowledgedAt < testCase.requirementRevisedAt)`. This means if the requirement changes *again* after QA already acknowledged a prior revision, the alert correctly reappears. The **Test Case Library page** (`TestCases.tsx`) shows the same signal as an informational badge (no action there, since results only exist per execution instance); the **Execution file page** (`TestCasesExecutionProgressPage.tsx`) is where the actionable "Revised" button lives, next to the existing `ResultPills` component.
- **Tasks**: the **Tasks page** (`Tasks.tsx`) shows an informational alert banner on any task with `requirementRevisedAt` set, with a simple **Acknowledge** action that clears it (`requirementRevisedAt = null`). Unlike test cases, this does **not** force any change to the task's own `status` — Task status is free-form workflow state (new/in_progress/uat/sit/done) that this CR has no basis to reset automatically; it's visibility only, same spirit as the PM-notification-on-reject design from Part 4.

**"Revised" action on a test case** — clicking it on a flagged row:
1. Sets that row's `result` to `"Not Executed"` (the existing exact string used throughout `RESULT_OPTIONS`), submitted through the **same existing** `saveTestCases()` → `POST /execution-files/:ticketId/test-cases` path every other result edit already goes through — **not a new endpoint**. This matters because that endpoint already auto-inserts into `executionTcHistoryTable` (`fromStatus`/`toStatus`/`changedBy`/`changedAt`) on every result change, which is exactly the audit trail being asked for — it already exists and needs no new mechanism, just reuse.
2. Sets `executionTestCasesTable.reviewAcknowledgedAt = now()` for that specific row, clearing the alert for this execution instance.
3. QA then retests normally via the existing `ResultPills` UI — each subsequent result change is, again, already logged automatically by the existing history mechanism.

**Relationship to CR011 (Audit Trail Enhancement, still 📋 Planned):** CR011 separately plans to fold execution-result history into a unified `activity` table with `oldValue`/`newValue` columns. This CR does **not** wait on that — `executionTcHistoryTable` already does the job for this specific need today. If/when CR011 ships, that's a migration of *where* the audit data lives, not a prerequisite for this feature to work now.

## Defaults adopted for open design questions

- Project membership is **all-or-nothing** per project at the IC tier (no per-project sub-roles yet — `projectRole` column is stubbed for future use but unenforced).
- Rows with `projectId: null` are **hidden from non-admins/non-cto**.
- `project_members` management is **admin-only** for this phase — see the concrete UI design in Part 1 (Members section on the Project & Module Config page).
- Access-denied returns **404**, not 403.
- Milestone `type`/`status` are free text and unenforced — a reporting label, not a workflow state machine. PM/FA move status manually.
- `milestoneId` on Requirements/Tasks is optional.
- **Department/tierRank are admin-configurable, but there's still no "reports-to" schema.** Lead/Manager/HOD/CTO visibility is a pure function of role-level `department`/`tierRank` values (editable via the Roles page, no deploy needed), not actual line-management data. If the org later needs "a Lead only sees *their own* reports, not every IC in the department," that requires a follow-up CR to add real per-user reporting-line data — explicitly deferred, not built here.
- `qa_manager` (rank 30) and `hod_qa` (rank 40) are **not** guaranteed identical visibility — `hod_qa` additionally includes any project the HOD is personally a direct member of. See the algorithm note above.
- Existing `qa_member`/`qa_lead` role rows get `department`/`tierRank` backfilled in this migration (they predate these columns) — without this, they'd silently fall back to unconfigured/IC-only behavior instead of actually tiering.
- Only `description` edits trigger the requirement-revised flag — not title/priority/milestone/tracker/status changes. If that turns out too narrow or too broad in practice, it's a one-line change to which fields are diffed, not a schema change.
- The re-review alert is **per execution instance**, not per library test case — acknowledging/retesting in one execution file does not clear the alert in a different execution file that also compiled the same library test case.
- Review-queue aging threshold is a UI constant (5 days) in this phase, not admin-configurable.
- Description snapshots are stored as full text in `activityTable.oldValue`/`newValue` (not deltas); the diff rendering is a client-side concern.

## Verification

- `pnpm --filter @workspace/db push` succeeds and creates `project_members` and `milestones`; backfill script runs cleanly against a copy of current data.
- As a non-admin `qa_member` with no `project_members` rows for Project X: `GET /requirements?projectId=X`, `GET /tasks?projectId=X`, `GET /test-cases?projectId=X` all return empty/404; same calls succeed for a project they're a member of.
- As `admin` and as `cto`: all projects remain visible.
- **Tier escalation check**: create `project_manager` A on Project 1 only, `pm_lead` B with no direct project_members rows, `hod_pm` C with no direct rows. Confirm B sees Project 1 (via A's membership) and any other project any `project_manager` is on; confirm C sees every project any PM-track user (any tier) is on.
- **QA behavior-change check**: confirm an existing `qa_lead` account now sees every project any `qa_member` is assigned to, not just their own prior direct assignments — flag this to whoever owns the QA rollout before enabling in production.
- **Admin-configurability check**: via the Roles page, change `pm_lead`'s `tierRank` from 20 to 5 (below the IC's 10) and confirm that `pm_lead`'s visibility immediately drops to IC-scope-or-less on next request — no restart/deploy required. Then set it back to 20 and confirm visibility returns.
- **CR-scale flow**: create one Milestone (`type: "cr"`) on a project, attach 2 requirements to it, approve both as the FA, confirm PM Dashboard shows the milestone at 100% requirements-approved.
- **New-project-scale flow**: create 3 sequential Milestones (`type: "phase"`) on one project, attach separate requirement sets to each, confirm PM Dashboard lists all 3 independently with correct per-milestone rollups.
- Confirm a requirement/task with no `milestoneId` rolls up into an "Unassigned" bucket, not silently dropped.
- Create `project_manager`/`pm_lead`/`hod_pm` users: confirm `/pm-dashboard` appears for all three, scoped per their tier, and QA-only nav items don't appear.
- Create `functional_analyst`/`fa_lead`/`hod_fa_bi` users: confirm requirement approve/reject and milestone UAT review work identically across tiers, scoped per their tier's visible projects.
- **Segregation-of-duties check**: FA user A authors a requirement; confirm A sees no clickable approve/reject action on it (`PATCH /requirements/:id/review` returns 403 if attempted directly as A). Confirm FA user B — same tier as A, not a Lead/HOD — *can* approve/reject A's requirement.
- **Audit-columns-don't-overwrite check**: reject a requirement (confirm `rejectedBy`/`rejectedAt` set), author revises it, a different FA approves it (confirm `approvedBy`/`approvedAt` now set) — confirm `rejectedBy`/`rejectedAt` are **still populated** (not cleared), and `GET /requirements/:id/activity` shows both the reject and the approve as separate, permanent entries.
- **Detail view navigation check**: open a requirement's detail view, confirm the Back button and every breadcrumb segment navigate correctly (not just cosmetic), confirm a requirement with children lists them under "Child Requirements" with working links into each child's own detail view.
- **AI analyzer access check**: confirm both the requirement's author and a non-author FA (potential approver) can trigger "Analyze with AI" with no restriction, and that each run appears as its own entry in the History panel.
- **Reject notification/permission check**: reject a requirement; confirm the author, the assignee, and the PM who created its Milestone all receive a notification (approving the same requirement instead should notify only the author + assignee, not PM). Confirm a third FA-track user (not the author or assignee) gets a 403 attempting to edit or resubmit the rejected requirement, while the author or assignee can successfully revise and move it back to `in_review`.
- **Review-queue check**: FA user A authors a requirement and submits it to `in_review`; confirm it appears in FA B's "Waiting on my review" bucket but **not** in A's (author exclusion). B rejects it; confirm it moves to A's "Awaiting my revision" bucket and disappears from B's. Confirm `fa_lead` sees both users' queue items with the aging column, and that `statusChangedAt` resets on each transition (aging counts from the latest status change, not from creation). Confirm a non-FA role doesn't see the Review Queue tab at all.
- **Description-diff check**: edit a requirement's description twice; confirm the History panel shows two separate "Description revised" entries, each diffing against its own immediately-prior version (the second entry's `oldValue` equals the first entry's `newValue`), and both entries survive a subsequent reject/approve cycle unchanged.
- Create `cto`: confirm unrestricted project visibility but no access to role/user management endpoints.
- Confirm `admin` and `pmo` see no behavior change beyond project scoping (post-backfill, invisible since everyone is grandfathered into all current projects).
- **Requirement-revised re-review check**: create a requirement, attach a test case, compile it into two separate execution files, mark it "Passed" in both. Edit the requirement's `description`. Confirm both execution instances now show the re-review alert, and the Test Case Library page shows the informational badge. Click "Revised" on one execution instance — confirm its `result` resets to "Not Executed", `executionTcHistoryTable` gets a new `Passed → Not Executed` row, and **only that instance's** alert clears (the other execution file's instance still shows it). Retest and confirm the new result is logged the same way as any normal result change.
- **Task-flagging + notification fan-out check**: create a requirement with a linked Task (assigned to two users) and a linked test case; edit the requirement's `description`. Confirm the Task shows the alert banner on the Tasks page, and confirm the requirement's author, its assignee, and both Task assignees all receive a notification. Acknowledge the Task alert and confirm the Task's own `status` is unchanged (visibility only, no forced state reset).
- **Redmine-import `createdBy` check**: import a Redmine ticket whose Redmine author's name matches an existing QAPulse user — confirm `createdBy` resolves to that QAPulse user, **not** whoever ran the import. Import a ticket whose Redmine author has no matching QAPulse user — confirm it falls back to the importer (not `null`) and a reconciliation warning is logged.
- **Newly-scoped routers check**: as a non-admin/non-cto with no `project_members` row for Project X, confirm `pmo-report` and `document-register` endpoints touching Project X now return empty/404 instead of leaking data, and `POST /ai/analyze-requirement` for a requirement outside their accessible projects returns 404 rather than running the analysis.

## Rollout sequence

Order matters — this activates access control across the whole app, so getting the sequence wrong risks locking out existing users mid-deploy:

1. **Schema migration** (`pnpm --filter @workspace/db push`) — all new tables/columns from every Part above. Additive and non-destructive; safe to run ahead of any code deploy since old code simply ignores columns it doesn't know about yet.
2. **Backfill + role seeding, together, before enforcement activates**: grandfather all existing users into all existing projects (`project_members`); backfill `department`/`tierRank` onto the existing `qa_member`/`qa_lead` rows; seed the 9 new roles with their nav/tier defaults. **Must** complete before step 3 — otherwise the moment access control goes live, anyone not yet backfilled is locked out of everything.
3. **Backend deploy** — middleware (`requireAuth`/`resolveProjectAccess`), retrofitted routes, all new endpoints (milestones, review, pm-summary, project-members admin API). This is what actually flips enforcement on.
4. **Frontend deploy** — new pages (`PmDashboard`, `RequirementDetail`), nav entries, review UI, the Requirements revamp, Task/Test-Case alert banners. Can ship in the same release as step 3, or immediately after.
5. **Validate** — run the Verification checklist above against staging before wide rollout.
6. **Communicate before flipping on** — specifically warn QA leadership that `qa_lead` visibility is about to genuinely widen (every `qa_member`'s projects, not just their own). That's a real, user-visible behavior change for existing accounts, not just new roles, and shouldn't be a surprise when it lands.
