# QAPulse — Change Request Register

Canonical list of all CRs for QAPulse. Update status here whenever a CR is deployed, started, or planned.

---

## CR List

| CR | Title | Status | Date |
|---|---|---|---|
| [CR001](#cr001--verdict-email--contact-management) | Verdict Email & Contact Management | ✅ Deployed | 2026-06-20 |
| [CR002](#cr002--auto-populate-excel-sheets) | Auto-populate Excel Sheets | ✅ Deployed | 2026-06-21 |
| [CR003](#cr003--compile-tcs-to-execution-file) | Compile TCs to Execution File | ✅ Deployed | 2026-06-22 |
| [CR004](#cr004--tracker-filter-on-import-from-redmine) | Tracker Filter on Import from Redmine | ✅ Deployed | 2026-06-22 |
| [CR005](#cr005--traceability-matrix) | Traceability Matrix | ✅ Deployed | 2026-06-27 |
| [CR006](#cr006--ai-enhancements) | AI Enhancements | ✅ Deployed | 2026-06-27 |
| [CR007](#cr007--auth--session-management) | Auth & Session Management | ✅ Deployed | 2026-06-29 |
| [CR008](#cr008--execution-sheet-ux-overhaul) | Execution Sheet UX Overhaul | ✅ Deployed | 2026-06-28 |
| [CR009](#cr009--playwrightqapulse-reporter) | Playwright→QAPulse Reporter | ⏳ Pending | — |
| [CR010](#cr010--trigger-playwright-from-qapulse-ui) | Trigger Playwright from QAPulse UI | ⏳ Pending | — |
| [CR011](#cr011--audit-trail-enhancement) | Audit Trail Enhancement | ✅ Deployed | 2026-07-04 |
| [CR012](#cr012--scalability--performance-hardening) | Scalability & Performance Hardening | 📋 Planned | 2026-06-30 |
| [CR013](#cr013--microsoft-login-sso) | Microsoft Login SSO | ⏳ Pending | — |
| [CR014](#cr014--org-wide-role-hierarchy--project-level-access-control) | Org-wide Role Hierarchy & Project-Level Access Control | 🟡 Partially Deployed | 2026-07-04 |
| [CR015](#cr015--per-requirement-ai-test-case-generation) | Per-Requirement AI Test Case Generation | ✅ Deployed | 2026-07-04 |
| [CR016](#cr016--traceability-matrix-requirement-hierarchy) | Traceability Matrix Requirement Hierarchy | ✅ Deployed | 2026-07-03 |
| [CR017](#cr017--milestonesprint-aware-traceability-matrix) | Milestone/Sprint-Aware Traceability Matrix | ✅ Deployed | 2026-07-06 |
| [CR018](#cr018--tc-library-execution-file-drill-down) | TC Library: Execution File Drill-Down | ✅ Deployed | 2026-07-03 |
| [CR019](#cr019--defect-tracking-write-through-to-redmine--defects-page) | Defect Tracking: Write-Through to Redmine + Defects Page | ✅ Deployed | 2026-07-04 |
| [CR020](#cr020--production-defect-workflow-escape-analysis) | Production Defect Workflow (Escape Analysis) | ✅ Deployed | 2026-07-04 |
| [CR021](#cr021--native-defect-tracking-cutover-retire-redmine-for-defects) | Native Defect Tracking Cutover (Retire Redmine for Defects) | 📋 Planned | 2026-07-03 |
| [CR022](#cr022--fa-requirement-workflow-enhancements) | FA Requirement Workflow Enhancements | ✅ Deployed | 2026-07-04 |
| [CR023](#cr023--requirement-detail--review-workflow-gaps) | Requirement Detail & Review Workflow Gaps | ✅ Deployed | 2026-07-05 |
| [CR024](#cr024--tc-library-requirement-filter-includes-descendants) | TC Library: Requirement Filter Includes Descendants | ✅ Deployed | 2026-07-05 |
| [CR025](#cr025--tc-library-milestone-filter) | TC Library: Milestone Filter | ✅ Deployed | 2026-07-05 |
| [CR026](#cr026--qa-analytics-dashboard) | QA Analytics Dashboard | ✅ Deployed | 2026-07-05 |
| [CR027](#cr027--notification-center-ux) | Notification Center UX | ✅ Deployed | 2026-07-10 |
| [CR028](#cr028--client-demo-data-toolkit) | Client Demo Data Toolkit | ✅ Deployed | 2026-07-05 |
| [CR029](#cr029--defect-category-classification) | Defect Category Classification | ✅ Deployed | 2026-07-05 |
| [CR030](#cr030--developer-workflow-requirement-handoff--defect-assignment) | Developer Workflow: Requirement Handoff & Defect Assignment | ✅ Deployed | 2026-07-05 |
| [CR031](#cr031--requirement-defect-workflow) | Requirement Defect Workflow | ✅ Deployed | 2026-07-10 |
| [CR032](#cr032--pm-dashboard-multi-cycle-phase-timeline) | PM Dashboard: Multi-Cycle Phase Timeline | ✅ Deployed | 2026-07-10 |
| [CR033](#cr033--pm-dashboard-ipecc-coverage-milestone-closing--risk-register) | PM Dashboard: IPECC Coverage (Milestone Closing + Risk Register) | ✅ Deployed | 2026-07-13 |
| [CR034](#cr034--resource-management-project-scoped-capacity--milestone-focus) | Resource Management: Project-Scoped Capacity & Milestone Focus | ✅ Deployed | 2026-07-13 |
| [CR035](#cr035--direct-project--module-access-assignment-replaces-team-based-project-access) | Direct Project & Module Access Assignment (replaces team-based project access) | ✅ Deployed | 2026-07-13 |

---

## CR Details

### CR001 — Verdict Email & Contact Management
**Status:** ✅ Deployed (2026-06-20)

Verdict email sending with contacts management and send-verdict endpoint. Excel attachment generated via SheetJS with xlsx-populate fallback.

---

### CR002 — Auto-populate Excel Sheets
**Status:** ✅ Deployed (2026-06-21)

On Send Verdict and Download, auto-fills the following Excel sheets from execution data:
- Review Log
- Review & Rework Effort
- Pareto Analysis
- CAPA

---

### CR003 — Compile TCs to Execution File
**Status:** ✅ Deployed (2026-06-22)

Select test cases on the TC Library page → Compile → adds them to an existing execution file or creates a new one. TCs are pre-populated from library metadata (caseId carried over).

---

### CR004 — Tracker Filter on Import from Redmine
**Status:** ✅ Deployed (2026-06-22)

Optional tracker dropdown in the Import from Redmine dialog. Filters child issues by selected tracker; root issue is always imported regardless.

---

### CR005 — Traceability Matrix
**Status:** ✅ Deployed (2026-06-27)

Requirement → Test Case → Execution result traceability matrix with:
- Project grouping
- Excel export
- Redmine ID display

---

### CR006 — AI Enhancements
**Status:** ✅ Deployed (2026-06-27)

- NL Search Bar on TC Library (natural language query to filter test cases)
- CAPA Intelligence dialog + Excel auto-fill on Send Verdict

---

### CR007 — Auth & Session Management
**Status:** ✅ Deployed (2026-06-29)

Full session & auth hardening:
- Auto-logout on 401
- Validate token on load
- Silent refresh
- Token blacklisting
- Remember Me
- JWT secret enforcement
- Session expiry warning

---

### CR008 — Execution Sheet UX Overhaul
**Status:** ✅ Deployed (2026-06-28)

- Execute/Edit mode toggle
- ResultPills for test result selection
- Dirty indicator (unsaved changes warning)
- Skip defect option
- Grouped action bar

---

### CR009 — Playwright→QAPulse Reporter
**Status:** ⏳ Pending

Custom Playwright reporter that auto-pushes test results into QAPulse execution files:
- Upsert by caseId
- Covers all suites
- One fixed ticketId per suite

---

### CR010 — Trigger Playwright from QAPulse UI
**Status:** ⏳ Pending
**Depends on:** CR009

"Run Automation" button on the execution file page:
- Spawns Playwright child process on the server
- Streams live output to UI via SSE
- Results auto-populate the execution file on completion

---

### CR011 — Audit Trail Enhancement
**Status:** ✅ Deployed (2026-07-04)

Builds a compliance-grade **Audit Log** (new admin-only page — note: `HistoryTrail.tsx` is a *task* history page, not the audit log; the activity feed lives on the Dashboard).

**Current-state findings (2026-07-03 survey):** three disconnected audit systems exist. (1) `activity` table logs only six create/assign event types — **updates and deletes are not logged anywhere**. (2) `execution_tc_history` already records from/to result with `changedBy` per execution TC (test-execution.ts save path) — P2's data layer already exists, it's just not surfaced. (3) `execution_file_audit` writes per-save summaries feeding the Review Log Excel sheet — P4 is half-built.

**Decisions (locked 2026-07-03):**
- **Best-effort audit writes:** `logActivity()` helper wraps insert in try/catch — an audit failure never fails the business operation. (Revisit to strict mode only if compliance demands.)
- **Audit Log page is admin-only** (nav-gated + route-gated).

**Phase 1 — P0 Core integrity**
- Migration: `old_value` / `new_value` (nullable text, JSON of changed fields only) on `activity`; indexes on `created_at` and `(entity_type, entity_id)`.
- `logActivity(db, {...})` helper (best-effort) replaces the six inline inserts.
- Update/delete logging in requirements, test-cases, tasks PATCH/DELETE: fetch old row → changed-fields diff → one activity row. Creates keep `old_value = null`.
- New `GET /audit-log`: paginated, actor name joined in SQL (not the current load-all-users pattern), filters entityType / userId / date range.

**Phase 2 — P1 Usability**
- New Audit Log page (admin-only): table view, date-range filter with URL-persisted params, Excel export (Date, Actor, Entity, Action, Old, New) client-side via `xlsx-js-style`.

**Phase 3 — P2 Coverage**
- Surface `execution_tc_history` in the audit page as a merged view (mapped to Old/New format) — do NOT double-write per-row activity.
- **One summarized activity row per execution save** (bulk saves touch dozens of rows; per-row entries would flood the feed).
- `verdict_sent` activity entry in send-verdict flow (recipients + file in `new_value`).

**Phase 4 — P3 Security**
- `user_login` / `user_logout` activity rows with IP. Requires `app.set("trust proxy", 1)` + `X-Forwarded-For` (Replit proxy) — global Express config change, verify it doesn't confuse future rate limiting (CR012).
- Shown only under an admin-gated "System" filter.

**Phase 5 — P4 Verdict Excel**
- Review Log sheet gains actor + diff summaries (extends `execution_file_audit`); CAPA status auto-filled from `verdict_sent` entries.

**Impact assessment:** low-risk/additive. Two nullable columns (one `db push`); dashboard feed response gains optional fields (non-breaking); each PATCH gains one SELECT + one INSERT (negligible); activity volume grows with update logging (mitigated by indexes + paginated endpoint).

**Sequencing:** implement **before CR019** — the defects CR reuses this history pattern and the `logActivity` hook.

DB change: `ALTER TABLE activity ADD COLUMN old_value text, ADD COLUMN new_value text;` + two indexes.

---

### CR012 — Scalability & Performance Hardening
**Status:** 📋 Planned (2026-06-30)

Addresses bottlenecks found in codebase audit:

**P0 — Critical**
- BullMQ + Redis job queue for Excel/Puppeteer generation (currently blocking Express event loop ~5–10s per request)
  - Affected: `pmo-report.ts:1407,1619`, `test-execution.ts:1004`, `test-cases.ts:453`

**P1 — High**
- Redis caching layer (no caching exists; Redmine API calls, dashboard aggregates hit cold every request)
- DB connection pool tuning (`lib/db/src/index.ts:13` — no `max` set, defaults to 10)
- Consistent pagination on all list endpoints (several return all rows unbounded)

**P2 — Medium**
- Batch Redmine defect-history fetch (`pmo-report.ts:591–621` — 1 API call per defect, up to 50 serial calls)
- Per-user rate limiting (current limiter is IP-based only, affects users on shared NAT)

**Delivery order:** Job queue → DB pool → Pagination → Redis cache → Batch Redmine → Per-user rate limit

---

### CR013 — Microsoft Login SSO
**Status:** ⏳ Pending
**Source:** unmerged branch `claude/microsoft-login-integration-6cm4go`

Replace email/password auth with Microsoft Entra ID (Azure AD) SSO, single-tenant, org accounts only. Password login removed entirely; admins pre-create user accounts (name, email, role — no password). Users signing in with a Microsoft email not already in QAPulse get a "contact admin" error (no auto-provisioning).

- Make `password` nullable on `usersTable`
- New `POST /auth/microsoft` — validates Azure AD ID token via `jwks-rsa` + `jsonwebtoken`, looks up user by email, issues QA Pulse JWT
- Remove `POST /auth/login`; keep `/auth/me`, `/auth/logout`, `/auth/change-password`
- Frontend: MSAL redirect flow (`@azure/msal-browser`, `@azure/msal-react`) replaces the Login page's email/password form
- Remove password fields from Settings' user creation form

Full plan: `docs/change-requests/microsoft-login-sso.md` (on the `claude/microsoft-login-integration-6cm4go` branch, not yet on `main`)

---

### CR014 — Org-wide Role Hierarchy & Project-Level Access Control
**Status:** 🟡 Partially Deployed (2026-07-04)
**Source:** originally drafted on branch `claude/microsoft-login-integration-6cm4go` (as "PM/BA onboarding"; BA role renamed to Functional Analyst since this org merged Business Analyst and System Analyst into one title). Implementation landed on `main` independently of that branch (commits `d028150`, `795b878` + PR #293) — only CR013 (SSO) still lives on the unmerged branch.

**Deployed (2026-07-04):**
- **Part 1 — access-control foundation** (commits `d028150`, `795b878`): `teams` / `user_teams` / `project_teams` / `project_members` tables, `roles.department` + `roles.tier_rank` columns, idempotent bootstrap on API start (table/column creation, role backfill, grandfathering all existing users into all existing projects), `scopeToUserProjects` / `canAccessProject` in `middleware/access.ts`. Team-scoped access with `project_members` fallback. Teams tab on Configuration page (admin-only). Scoping applied to `requirements`, `test-cases`, `tasks`, `projects`, `milestones`, `teams`, `roles` routes.
- **Part 2 — Milestones** (PR #293): `milestones` table + CRUD + `/milestones` page.
- **Part 4 — FA track** (PR #293): review workflow with segregation of duties, RequirementDetail page, review queue banner, description snapshots + diffs.
- **Role tiers seeded** (Parts 3/5/6 role definitions): `cto` (tier 5), `hod_qa`/`hod_pm`/`hod_fa`/`hod_dev` (tier 4), FA/Dev lead + member roles, all with department/tierRank and nav permissions; Department + Tier Rank admin-editable on the Roles page.
- **Part 1 completion — `traceability`, `test-execution`, `defects` routes scoped** *(2026-07-04, second pass)*: all three now require auth (previously traceability had **no auth check at all**, and the other two only parsed tokens opportunistically) and enforce project scoping — list endpoints filter to accessible projects, entity endpoints 403 on inaccessible projects, project moves also check the target project. Rows with `projectId = null` (legacy files / Redmine pulls without a project) stay visible to any authenticated user. The `/execution-events` SSE stream stays deliberately unauthenticated (EventSource can't send headers; it only emits `{ticketId, type}` pings — revisit if the payload grows). Three token-less frontend fetches fixed along the way (`TestCases.tsx` modules/trackers, `Tasks.tsx` execution-progress).

**Part 3 prerequisites landed** *(2026-07-05, ahead of building the dashboard itself)*:
- **`pm_lead` role added** (tier 2, department `pm`) — closes the gap where PM was the only department with just an IC (`pmo`, tier 1) and an HOD (`hod_pm`, tier 4) and no mid tier, unlike QA/FA which both have a Lead tier. Nav permissions mirror `hod_pm`'s set.
- **`tasks.milestone_id`** column added (nullable, `ON DELETE SET NULL`, bootstrapped like the other CR014 milestone FKs — no manual `db push` needed). `tasks` previously had no milestone linkage at all — only `requirements` and `execution_files` did — which would have forced the PM dashboard's resource-capacity view to live at the project level only. `GET /tasks` now takes a `milestoneId` filter; `formatTask` resolves `milestoneName`; the task form has a Milestone picker (optional — ad-hoc tasks can stay unassigned) that resets when the project changes.

**Part 3 — PM dashboard** *(2026-07-05)*: `GET /dashboard/pm-summary` (role-gated to `pmo`/`pm_lead`/`hod_pm`/`admin`/`cto`) + `PmDashboard.tsx` at `/pm-dashboard`, nav-gated behind new `nav:pm-dashboard` key. Per accessible project: milestone tiles (requirement approval count, QA/UAT execution readiness, a computed schedule-risk badge — on-track/at-risk/overdue/no-date, using the 5-day/80%-readiness threshold agreed earlier) and a project-level resource capacity table (open task count, estimated hours, overdue count per assignee, from `tasks`). Portfolio summary row: total projects, active/at-risk/overdue milestone counts.
- **Scope decision:** the QA/UAT execution rollup counts whatever's currently saved on `execution_test_cases` rows scoped to the milestone's files — it does not resolve "latest result per TC identity across multiple files" the way the traceability matrix does. Good enough for a summary readiness signal; use the traceability matrix's own milestone filter for the rigorous per-TC view.
- **`pmo` access resolved** *(2026-07-05)*: `pmo` initially couldn't reach this page even though the backend already allowed it — three separate frontend mechanisms hard-coded `pmo` down to a single page (PMO Report only, no `Layout`/sidebar at all): `ProtectedRoute`'s unconditional `if (role === "pmo") return <PmoReport/>` override (fired *after* the per-route role check passed, silently replacing whatever component the route actually pointed to), the `/pmo-report` route's own no-`Layout` branch for `pmo`, and `Layout.tsx`'s nav filter hard-coding `pmo` to see only the `/pmo-report` href. Decision: give `pmo` PM Dashboard *alongside* PMO Report, not the full `pm_lead` nav (a separate option that was considered and declined) — implemented by removing the `ProtectedRoute` override (now redundant once a route's `roles` array legitimately includes `pmo`), adding `pmo` to `/pm-dashboard`'s `roles`, wrapping `/pmo-report` in `Layout` for every role including `pmo` (previously the only role denied it), and widening `Layout.tsx`'s nav filter to both hrefs. `pmo` still doesn't get the full `navPermissions`/DB-driven nav system (that query stays disabled for this role) — the two-page allowlist is intentionally hard-coded to keep `pmo` a deliberately minimal role rather than open-ended.
- **Found and fixed in passing:** `GET /milestones?projectId=` (the list endpoint the Milestones page grid actually calls) never computed `requirementCount`/`approvedCount` at all — only the singular `GET /milestones/:id` detail endpoint did. Every milestone card showed 0 regardless of actual linked requirements. Fixed with one batched query (not N+1) shared in spirit with the new dashboard's rollup.
- **Found and fixed in passing:** the nav-permission bootstrap only backfills new keys into `admin`'s permissions on restart, not other roles — meaning `hod_pm` (seeded before today) would never have picked up `nav:pm-dashboard` without a manual Roles-page edit. Extended the backfill to `admin`+`cto` (both meant to hold every key) plus a narrow single-key backfill for `hod_pm`/`pm_lead`, without blanket-reapplying full permission lists (which would silently undo any admin's deliberate customization via `PUT /roles/:id/permissions` on every restart).
- **Milestone filter on Requirements + deep-link** *(2026-07-05)*: the Requirements page already showed Milestone as a mandatory field and a list column but had no way to filter by it (unlike Project/Module/Priority, which all did). Added a Milestone filter select, scoped to the currently-selected Project filter (same dependency the create/edit form's own Milestone picker already has, since `GET /milestones` requires a `projectId`). Clicking a milestone tile on the PM Dashboard now deep-links to `/requirements?projectId=&milestoneId=`, pre-filtering both — mirrors CR018's `?tc=` deep-link convention.
- **Part 5 — `qa_manager` role added** *(2026-07-05)*: tier 3, department `qa`, sitting between `qa_lead` (2) and `hod_qa` (4) — closes the mirror-image gap of the `pm_lead` addition (QA now has Member/Lead/Manager/HOD, one tier deeper than PM/FA/Dev, matching the original Part 5 spec's intent that QA gets an extra tier). Nav permissions mirror `qa_lead`'s set. Seeded fresh (new role, no backfill needed — unlike `hod_pm`/`pm_lead`'s `nav:pm-dashboard` backfill, which needed the narrow single-key treatment since those roles already existed).
- **Scope-parity caveat:** `middleware/access.ts`'s `scopeToUserProjects` only has two visibility buckets — `tierRank >= 5` (unrestricted) and `tierRank >= 4` (whole department). Everything below tier 4 — including the new `qa_manager` at tier 3 — falls into the same team-scoped bucket as `qa_lead`/`qa_member`. The role exists and is selectable, but it does **not** yet have functionally broader visibility than `qa_lead`; giving "Manager" a real middle scope (e.g. "sees all teams a manager is assigned to, not just their own") would need a new access-control tier and a way to record which teams a manager owns — not built.
- **`milestones.completed_at` added** *(2026-07-05)*: authoritative timestamp for when a milestone actually finished, auto-stamped by `PATCH /milestones/:id` on the transition into `status = "completed"` (and cleared if it moves away again) — same pattern as `requirements.approvedAt`/`rejectedAt`. Built as groundwork for the phase-breakdown report below.
- **"Where did the time go" phase-breakdown report** *(2026-07-05)*: `GET /dashboard/milestone-phase-breakdown?milestoneId=` + a Milestone selector added to PM Dashboard (next to the existing Project selector, same project-scoped pattern used everywhere else). Selecting a milestone shows a segmented timeline plus a 5-milestone trend strip with averaged phase lengths — built specifically so a QA lead can show, with real timestamps instead of an argument, that a delay sat upstream of testing rather than assuming QA caused it.
  - **Up to 5 phases, computed from data that already exists** (no new tracking beyond `completedAt` above): **Requirements** (first requirement created → last requirement approved, only once *all* are approved) → **Gap before QA** (last approval → first QA test actually executed) → **QA testing** (first QA execution → last QA execution *if a UAT file exists for the milestone, else through to `completedAt`* — QA absorbs any final wrap-up when there's no UAT lane to hand off to) → **Gap before UAT** (only shown if non-zero and a UAT file exists) → **UAT** (first UAT execution → `completedAt`, or ongoing).
  - **Why QA and UAT are split rather than one "testing" phase:** the original scope only had one testing phase ending at milestone completion — which would have quietly blamed QA for however long business sign-off took after QA was done, the same unfairness the report exists to fix, just moved one phase later. Splitting them means QA's own bar is tightly bounded to QA's actual work.
  - **Trend** averages the same phase breakdown across a project's last 5 `status = 'completed'` milestones (only completed ones — an in-progress milestone would contribute an artificially short, unfinished QA/UAT phase and understate the pattern). A milestone missing a phase (e.g. no UAT file) is excluded from that phase's average, not counted as zero.
  - A milestone with zero requirements returns `phases: null` rather than misleading zeros.
  - **Per-requirement drill-down** *(2026-07-05, same day)*: the milestone-level aggregate has a real ambiguity when requirements are at different stages within one milestone — e.g. one requirement approved and in testing, one approved but not yet picked up by QA, one not approved at all. The aggregate's "Requirements phase" only closes once *every* requirement is approved, so it shows as ongoing for the whole milestone even when most requirements have moved on — and the aggregate then renders two "ongoing" segments side by side (Requirements + QA) as if sequential, when they're really overlapping in calendar time. Fixed by adding a per-requirement breakdown: each requirement gets the *same* phase computation scoped to just itself (no "wait for every requirement" ambiguity, since a single requirement has exactly one `createdAt`/`approvedAt` pair) plus a derived status string (`"Approved · in QA testing"` / `"Approved · awaiting QA"` / `"Not yet approved"` / etc.).
  - **UI**: the aggregate bar is clickable and toggles between a compact status table (default — requirement + status badge) and a list of mini per-requirement timelines (click again to go back) — progressive disclosure: quick scan by default, full timing detail on demand.
- **Found and fixed in passing:** `milestones.created_by` existed in the Drizzle schema (added for CR023p1.2, needed to notify a milestone's PM on a linked requirement's rejection) but was never added to the bootstrap SQL's `CREATE TABLE IF NOT EXISTS milestones` block or given its own `ALTER TABLE` — meaning a brand-new database's bootstrap-created milestones table was missing this column entirely, and creating a milestone would have failed. Added the missing `ALTER TABLE milestones ADD COLUMN IF NOT EXISTS created_by INTEGER`.
- **Found and fixed — "mandatory `milestoneId`" had a loophole** *(2026-07-05)*: the create/edit form has required Milestone since CR023 Part 3, but the Requirements page's "Import from Redmine" dialog was a separate code path (`processRedmineSync`, direct create/update calls — it doesn't go through the form) that never set `milestoneId` at all, on the root ticket or any of its recursively-imported children. Redmine-imported requirement trees could sit at `milestoneId = null` indefinitely unless someone manually edited every node afterward — exactly the child-requirement gap that made the phase-breakdown report above under-count a milestone's requirements. Fixed by adding a mandatory Milestone picker to the Import dialog (scoped to the selected Project, same dependency pattern as the create/edit form's own picker) and threading `milestoneId` through `processRedmineSync` so the root ticket and every recursively-imported subtask are tagged with the same milestone in one shot. A resync of an *already-imported* ticket (`handleSingleSync`, e.g. re-pulling updated fields from Redmine) deliberately passes no `milestoneId` so it doesn't clobber a milestone someone may have since customized per-requirement.

**Still outstanding:**
- See CR023 for review-workflow gaps found when auditing the shipped FA track against the full design.

---

**Original plan (for reference):**

Expands QAPulse to match this org's real reporting structure: a CTO above four department HODs (PM, FA & BI combined, QA, Dev — Dev stays external/no login), each with Lead/Manager tiers below. Requires project-level access control as a prerequisite — today every authenticated user can read/write every project's data with no membership scoping. Visibility escalates by role tier (IC → Lead → Manager → HOD → CTO), driven by two new **admin-configurable** columns on the existing `roles` table (`department`, `tierRank`) rather than a hardcoded lookup — admin can retier/re-department any role via the existing Roles page, no deploy needed. Still **no new "reports-to" schema** — a deliberate simplification, not true org-chart modeling. Covers both a single Change Request and a full new-project rollout via one shared primitive (Milestones).

**Part 1 — Project-level access control (prerequisite)**
- New `project_members` table (projectId + userId, no per-project sub-roles yet)
- New `department`/`tierRank` columns on the existing `rolesTable`, editable via `Roles.tsx` + `PATCH /roles/:id` + `requireAuth` / `resolveProjectAccess` middleware (reads department/tierRank at request time) + `canAccessProject` / `scopeToUserProjects` helpers (unchanged, tier logic lives entirely in `resolveProjectAccess`)
- Retrofit `requirements`, `test-cases`, `tasks`, `traceability`, `projects` routes to scope by membership; `test-execution` retrofitted per-route (not router-level, due to its SSE endpoint); 404 on denied access
- One-time backfill grandfathering existing users into existing projects, plus backfilling `department`/`tierRank` onto the pre-existing `qa_member`/`qa_lead` role rows

**Part 2 — Milestones (shared CR / new-project primitive)**
- New `milestones` table (projectId, name, type: cr/phase/sprint/release, status, targetDate) — a CR is a project with one milestone; a new project is a sequence of milestones
- Nullable `milestoneId` on `requirementsTable` and `tasksTable`
- New `routes/milestones.ts` (create/list/status update, project-scoped)

**Part 3 — PM track (`project_manager`, `pm_lead`, `hod_pm`)**
- All three roles share nav (`nav:pm-dashboard` + existing PM-relevant keys); tiers differ only in project-visibility scope
- New `GET /dashboard/pm-summary` + `PmDashboard.tsx`, grouped per project → per milestone

**Part 4 — FA track (`functional_analyst`, `fa_lead`, `hod_fa_bi`)**
- Audit columns on `requirementsTable`: `createdBy` + separate `approvedBy`/`approvedAt` and `rejectedBy`/`rejectedAt` (last approval and last rejection independently retrievable; full journal in `activityTable`)
- `PATCH /requirements/:id/review` — upstream approval gate, with segregation of duties (author cannot approve own requirement) + notification fan-out (PM looped in on reject)
- `PATCH /milestones/:id/review` — downstream UAT sign-off, closing the loop back to the FA track (notifies the milestone's creator/PM)
- Requirement Detail page (`/requirements/:id`) — ancestry breadcrumb, child requirements, History panel, "Analyze with AI"
- **"My Review Queue"** — per-FA buckets ("waiting on my review" / "awaiting my revision") as a tab on the Requirements page; `fa_lead`+ automatically see the team-wide queue with aging (days in status, stalled rows highlighted) *(added 2026-07-04)*
- **Description snapshots + old-vs-new diff** — new `oldValue`/`newValue` columns on `activityTable` (additive slice of CR011); every description edit journals both versions, History panel renders the diff so re-reviewers see exactly what changed between reject and resubmit *(added 2026-07-04)*
- `bi`/`bi_lead` role names reserved (so `hod_fa_bi` visibility is forward-compatible) but BI itself is **not** onboarded in this CR

**Part 5 — QA tier expansion (`qa_manager`, `hod_qa` — new)**
- `qa_member`/`qa_lead` already exist; adds the two tiers above plus tiered visibility itself — **note:** `qa_lead` gains broader visibility than before (every `qa_member`'s projects, not just its own), a real behavior change for existing accounts

**Part 6 — CTO (`cto`)**
- Broadest nav (like `admin`) but no role/user-management permissions — "see everything, configure nothing"
- Unrestricted project visibility (same `null` sentinel as `admin`)

Full plan: `docs/change-requests/pm-ba-onboarding.md`

---

### CR015 — Per-Requirement AI Test Case Generation
**Status:** ✅ Deployed (2026-07-04, commit `2f356f3`)

Fixes AI Generate on the Test Cases page so multi-requirement batches (e.g. #23123 + #32134) are generated and saved per-requirement instead of bundled.

**Current behavior (bug):** all selected requirements' descriptions are concatenated into one Gemini prompt; the response is one flat array of test cases with no link back to source requirement. On save, every generated test case is written with the same single `requirementId` (whichever requirement was picked in the "Base Requirement" dropdown), regardless of which requirement actually produced it.

**Target behavior:**
- Parallel per-requirement Gemini calls (capped concurrency via `p-limit`, already a project dependency) — one call per selected requirement, not one bundled call with self-tagging. Guarantees correct requirement linkage structurally.
- Each requirement gets its own independent ~5–10 test case count based on its own complexity (not scaled by batch size) — e.g. 5 for #23123, 3 for #32134.
- Preview UI groups generated cases under requirement headers ("#23123 — 5 test cases").
- Save writes each test case with its own group's `requirementId`, fixing the mislink bug.
- Partial-failure handling: if one requirement's generation fails (Gemini + OpenRouter both exhausted), the rest of the batch still returns (`Promise.allSettled`), with an `error` field on the failed group.
- Test Cases list reloads/refetches after save (existing `queryClient.invalidateQueries` pattern already covers this).

**Scope:**
- `lib/api-spec/openapi.yaml` — replace singular `requirementDescription`/`requirementId` on `AIGenerateInput` with a `requirements: [{id, title, description}]` array; wrap `AIGenerateResponse` in per-requirement `results` groups; also correct `AIGeneratedTestCase` schema fields to match actual route output (drops stale `objective`/`automationCandidate`, which don't match what the route returns). Regenerate via `pnpm --filter @workspace/api-spec run codegen`.
- `artifacts/api-server/src/routes/test-cases.ts:178-314` — extract single-generation logic into a per-requirement helper, fan out with `p-limit` + `Promise.allSettled`.
- `artifacts/qa-pulse/src/pages/TestCases.tsx` — `handleGenerate` (~126-152) sends requirement array instead of joined string; preview screen (~478-523) renders grouped sections; `handleAISuccess` (~1230-1263) saves each test case with its own group's `requirementId`.

Implemented as planned above; deployed 2026-07-04 (commit `2f356f3`). The mislink bug (all generated TCs saved under one `requirementId`) is fixed — generation and save are per-requirement.

---

### CR016 — Traceability Matrix Requirement Hierarchy
**Status:** ✅ Deployed (2026-07-03)

Follow-up to CR005. Now that child requirements carry their own test case links, the matrix shows the full requirement tree instead of only root requirements:

- Child requirements render as nested, expandable rows under their parent (any depth).
- Parent coverage/status is **rolled up** from all descendant TCs, deduped by TC identity (a TC linked to both parent and child counts once). A failing child TC bubbles up to the parent's status; a parent with no direct TCs but covered children no longer shows "No TCs".
- Parents with children show a "X direct · Y rolled up from N children" subtitle.
- TC sources now match the Requirements page: library links (`test_cases.requirement_id`) **plus** direct execution-file links (`execution_test_cases.requirement_id`), deduped via the same `lib:`/`exec:` identity convention.
- Excel export mirrors the hierarchy: indented `↳` child rows, plus a rolled-up summary row for parents.
- Module filter keeps a tree when the root or any descendant matches; status filter applies to the root's rolled-up status.

**Scope:** `artifacts/api-server/src/routes/traceability.ts` (rewritten — tree assembly + recursive rollup), `artifacts/qa-pulse/src/pages/TraceabilityMatrix.tsx` (recursive rows + hierarchical export). No DB changes.

---

### CR017 — Milestone/Sprint-Aware Traceability Matrix
**Status:** ✅ Deployed (2026-07-04 PR #293 core change; targets #2/#4 + release deprecation added 2026-07-05; target #3 added 2026-07-06)

**Deployed 2026-07-04:** milestone filter dropdown on the matrix (shown when a project is selected) + **sprint-scoped result resolution** — the core change (target #1): with a `milestoneId` filter active, requirements are scoped by `r.milestone_id` and the latest-result join only considers execution files belonging to that milestone, with a "Milestone scope active" banner explaining that unrun TCs show Not Run instead of stale green.

**Deployed 2026-07-05 — target #2, milestone grouping + readiness header:** `traceability.ts`'s SQL now `LEFT JOIN`s `milestones` to carry `milestoneName`/`milestoneTargetDate`/`milestoneStatus` on every node. When browsing "All Milestones" (no specific milestone filter), each project's **root** requirements are sub-grouped client-side by their own `milestoneId` into collapsible header rows — milestone name, target date, requirement count, summed TC/pass/fail/blocked/not-run counts, coverage bar, and a status badge (reusing the existing `passed/failing/blocked/not-run/no-tcs/in-progress` classification). **Simplification:** grouping buckets by the *root's* milestone, not each descendant's own milestone tag — a root's rolled-up counts already include its full subtree regardless of a child's own milestone (unchanged CR016 behavior), so this is "group requirement trees by milestone," not "attribute every TC to its own node's milestone." When a specific milestone filter *is* active, sub-grouping is skipped (everything already shares one milestone) and rows render flat as before.

**Deployed 2026-07-05 — target #4, Excel milestone column:** added between Module and Test Case ID; populated per-row from each node's own `milestoneName` (not just the root's), so child rows in a mixed-milestone subtree show their actual milestone, not an inherited one.

**Deployed 2026-07-05 — `requirements.release` deprecation:** the free-text Release field is removed from the create/edit form for new data entry; the DB column is *not* dropped, and existing values are still shown read-only (relabeled "Release (legacy)") on the form and on `RequirementDetail.tsx` wherever a requirement already has one, so historical data isn't silently lost. No automatic migration of `release` strings into milestone rows — inferring which milestone an arbitrary legacy string like "v3.0" corresponds to isn't safe to automate (risks fabricating duplicate/junk milestones); every requirement already carries a mandatory `milestoneId` since CR023 Part 3, so the field it was meant to replace is already populated going forward.

**Deployed 2026-07-06 — target #3, grayed out-of-sprint parent context rows:** `traceability.ts` now walks the `parent_id` chain up from every milestone-matched requirement (`WITH RECURSIVE` over `requirements`) and pulls in any out-of-milestone ancestors purely as context — no test cases fetched for them, so a parent's own rollup stays scoped to exactly its in-sprint descendants (never its unrelated siblings, since only the ancestor chain is fetched, not the whole subtree). Each `ReqNode`/`TraceabilityRow` gains `inMilestone: boolean`. On `TraceabilityMatrix.tsx`, a context row (`inMilestone === false`) renders grayed (`bg-muted/30 opacity-70`) with an "(out of sprint — context only)" label, is always expanded (not independently collapsible, since it exists purely to show its descendant), and is excluded from the "No TCs" warning icon. A matched requirement no longer loses its parent context or renders as a misleading standalone root.

Extends the traceability matrix (CR005/CR016) now that milestones exist as a first-class entity (CR014 Part 2 landed the data model).

**Prerequisite data model (part of the milestone feature, not this CR):**
- New `milestones` table: `id`, `name`, `project_id`, `start_date`, `end_date`, `status`.
- `milestone_id` FK on `requirements` (scope commitment) and on `execution_files` (test cycle). The existing free-text `requirements.release` column migrates into the milestone entity and is deprecated.

**Target behavior (priority order):**
1. **Sprint-scoped result resolution — the core change.** Today the matrix takes the latest result *ever* for each TC. With a `milestoneId` filter active, the latest-result LATERAL join only considers `execution_test_cases` rows whose execution file belongs to that milestone. A TC that passed last sprint but hasn't run this sprint shows **Not Run**, not stale green.
2. **Milestone grouping + readiness header.** Grouping becomes Project → Milestone → requirement tree. Each milestone header row carries its own rolled-up summary (N requirements, coverage %, pass/fail/blocked counts, one status badge) — a per-sprint "ready to ship?" line. Summary cards scope to the selected milestone when the filter is active.
3. **Hierarchy scoping rule (deliberately different from the module filter).** Module filter keeps the whole tree if any node matches (lossless browsing). Milestone filter *prunes*: out-of-sprint children are excluded from rollup; an out-of-sprint parent of an in-sprint child renders as a grayed context row whose rollup counts only in-sprint descendants. Prevents sprint coverage numbers from including out-of-scope TCs.
4. **Excel export:** add a Milestone column to the existing sheet (start simple; per-milestone sheets later if asked).

**Explicitly out of scope (first cut):** carry-over/trend view ("requirement slipped 3 sprints"), burndown charts — needs result history semantics not yet settled.

**Scope estimate:** `lib/db/src/schema/` (milestones table + FKs — shared with the milestone feature), `artifacts/api-server/src/routes/traceability.ts` (milestoneId param, scoped LATERAL join, pruned rollup), `artifacts/qa-pulse/src/pages/TraceabilityMatrix.tsx` (milestone filter dropdown, milestone group headers, scoped summary cards, export column).

---

### CR018 — TC Library: Execution File Drill-Down
**Status:** ✅ Deployed (2026-07-03)

The "In N runs" badge on the Test Case Library (table and mobile card views) is now clickable. It opens a dialog listing every execution file that contains the test case — Redmine ticket ID, file title, the TC's case ID in that file, its result, executed date, and defect number. Clicking a row navigates to that execution file's detail page.

Supports impact analysis before editing/deleting a library TC, avoiding duplicate compiles (CR003), and jumping straight to a failing run.

**Scope:** `artifacts/api-server/src/routes/test-cases.ts` (new `GET /test-cases/:id/executions` — on-demand, one entry per execution file, newest row wins), `artifacts/qa-pulse/src/pages/TestCases.tsx` (`ExecutionRunsDialog` + clickable badges). No DB changes.

---

### CR019 — Defect Tracking: Write-Through to Redmine + Defects Page
**Status:** ✅ Deployed (2026-07-04, PR #270 + follow-up commits)

**Post-deploy amendments (2026-07-04):** editable status with write-through to Redmine (ownership rule 1 amended below); Sync from Redmine dialog — whole-subtree import with per-issue tracker routing (Change Request tracker → Requirements, Others tab for unmapped trackers); Redmine imports are insert-only (existing rows ignored).

**Implementation note:** the execution fail modal already created Redmine issues directly (with assignee/custom fields/screenshots/duplicate check), so that flow was kept and extended with local registration (`POST /defects/register`, upsert by redmineId) instead of replacing it. Write-through `POST /defects` exists for the manual New Defect dialog. All Redmine code isolated in `redmine-defect-bridge.ts` as designed.

First step toward native defect tracking in QAPulse. QAPulse becomes the **front door** for defect creation while **Redmine stays the system of record** for defect lifecycle (write-through pattern). Designed so the future full cutover (CR021) only removes the Redmine write — schema and UI carry over unchanged.

**Migration principle (applies to all Redmine-touching CRs):** every part is classified permanent or bridge. Permanent = QAPulse tables/pages/links/metrics, Redmine-agnostic, survive cutover unchanged. Bridge = the Redmine push/pull code, isolated in a single module (`redmine-defect-bridge.ts`) that nothing else imports Redmine details from — deleted at cutover.

**Ownership rules (the design hinges on these):**
1. **One-way ownership** *(amended 2026-07-04 by user decision)*. QAPulse owns creation + TC linkage. Status is now **editable in QAPulse as write-through**: the full Redmine status list is synced locally (`redmine_statuses` table), a status change is pushed to Redmine first (`PUT /issues/:id`), and the local cache updates only on Redmine's success — on rejection QAPulse keeps the old status. Redmine remains the system of record (devs can still change status there; "Refresh status" reconciles, last write wins). Comments/assignment still Redmine-only until CR021. This is an early slice of CR021's native lifecycle, kept inside the bridge module.
2. **Backfill `defect_number`.** On creation, the returned Redmine ID is written into `execution_test_cases.defect_number` exactly as if typed — Pareto/CAPA sheets, verdict Excel, traceability matrix, and link-out chips keep working with zero changes, and IDs are guaranteed real (no more typo'd defect numbers).
3. **Never block execution on Redmine.** If Redmine is down when a TC is failed, the defect row is created locally as "pending sync"; a background retry (with idempotency guard against duplicate Redmine tickets) pushes it and fills in the Redmine ID.
4. **Reporter identity.** Per-user Redmine API keys (existing `resolveApiKey`) → actual QA shows as reporter in Redmine. Global-key fallback → prepend "Reported by {name} via QAPulse" to the description.

**Data model (new tables):**
- `defects`: id, `defect_code` (auto `DEF-NNNN` per project), title, description, steps to reproduce / expected / actual, severity, status (cached from Redmine), module, `project_id`, `reporter_id`, `assignee_name` (cached), `redmine_id`, `sync_status` (`pending` | `synced` | `error`), **`source` (`qa` | `production`)**, **`found_in` (`SIT` | `UAT` | `Production`)**, timestamps. The source/found_in columns are added now (cheap) so CR020 prod defects need no migration.
- `defect_links`: defect_id ↔ target, where target is an `execution_test_cases.id` **or** a library `test_cases.id` **or** a `requirements.id` (nullable FK columns; QA defects link execution rows, prod defects link requirement/module first and the regression TC later).

**Creation flows:**
- Primary: the existing fail modal in the execution file (`TestCasesExecutionProgressPage.tsx`) — pre-filled from the TC row's steps/expected/actual, creates the defect, pushes to Redmine (`POST /issues.json` via existing `redmineFetch` plumbing in `redmine.ts`), links the TC, backfills `defect_number`.
- Secondary: manual "New defect" on the Defects page.

**Defects page (new, mockup approved 2026-07-03):**
- Summary cards: Open · In progress · Awaiting retest · Closed (30d).
- Saved-view tabs: All open / Blocking TCs / Awaiting retest / My defects; project + severity filters, search.
- Rows: `DEF-NNNN` + Redmine chip (links out) + title, severity badge (QAPulse-owned), status badge (Redmine-cached, "synced N min ago" indicator), assignee. Pending-sync rows show a "Syncing to Redmine" badge.
- Expand row → linked TCs from `defect_links` with execution file + current result, deep-linking to the execution file via the CR018 `?tc=` filter.
- **Retest flag:** defect Fixed/Resolved in Redmine while a linked TC is still Failed → TC line shows "Retest needed"; collected under the Awaiting retest tab/card.
- Deliberately absent: comments, reassignment — those stay in Redmine until CR021. (Status editing was originally absent too, but was added post-deploy 2026-07-04 as write-through — see ownership rule 1.)
- Fail-modal create dialog and Defects page mockups approved 2026-07-03.

**Scope estimate:** `lib/db/src/schema/` (defects + defect_links, DB push required), `artifacts/api-server/src/routes/` (new defects.ts: CRUD + Redmine push + status refresh batch), `artifacts/api-server/src/routes/redmine.ts` (issue-create helper), `artifacts/qa-pulse/src/pages/Defects.tsx` (new page + nav entry), `artifacts/qa-pulse/src/pages/TestCasesExecutionProgressPage.tsx` (fail modal → create-and-link flow).

**Sequencing:** supersedes the earlier "read-only defect dashboard" idea. Implement after CR011 (reuses the `logActivity` audit pattern). Production defect workflow = CR020; full native cutover = CR021 (after CR014 so developers have proper roles).

---

### CR020 — Production Defect Workflow (Escape Analysis)
**Status:** ✅ Deployed (2026-07-04, together with CR019). PMO report Excel integration of leakage rate deferred — metrics live on the Defects page Production tab.

Handles defects found in **production** — the mirror image of CR019: for prod incidents, **Redmine stays the front door** (support/helpdesk report there; they will never log into QAPulse) and **QAPulse pulls them in** (read-side sync filtered by the incident/support tracker, building on CR004's tracker sync). Both directions agree Redmine is the record; QAPulse closes the QA loop.

**Framing:** a prod defect is an *escape* — a bug that got past testing. The workflow answers "why did we miss it, and how do we make sure we never miss it again."

**Target behavior (Production tab on the CR019 Defects page — mockup approved 2026-07-03):**
- **Pull sync (bridge):** import incident-tracker issues as `defects` rows with `source='production'`, `found_in='Production'`; Redmine status shown read-only with last-synced indicator.
- **Escape analysis per defect:** map to module/requirement, then classify the root cause using traceability data — *coverage gap* (no TC covered the scenario) vs *selection gap* (TC existed but wasn't in the run) vs *test passed wrongly*. Tracked as an escape-review status: Pending review → Analyzing → Closed loop.
- **Create regression TC from defect:** one-click, pre-filled from the defect's steps/expected/actual, linked back via `defect_links` — the regression suite grows from real escapes.
- **Closed loop state:** regression TC added + retest passed → escape review complete.
- **Metrics cards + PMO report:** prod defect count per release, **defect leakage rate** (prod ÷ total), escapes analyzed, regression TCs added. Leakage rate also feeds the existing Pareto/CAPA process.

**Permanent vs bridge:** escape review, regression backfill, leakage metrics, Production tab = permanent (read QAPulse tables only). Pull sync + read-only Redmine status = bridge, lives in `redmine-defect-bridge.ts`, deleted at CR021 cutover (prod intake then happens directly in QAPulse or its replacement).

**Scope estimate:** `artifacts/api-server/src/routes/defects.ts` (pull-sync job + escape-review endpoints), `artifacts/qa-pulse/src/pages/Defects.tsx` (Production tab, escape panel, create-regression-TC dialog), `pmo-report.ts` (leakage metrics). No schema change beyond CR019's tables.

---

### CR021 — Native Defect Tracking Cutover (Retire Redmine for Defects)
**Status:** 📋 Planned (2026-07-03). Depends on CR019 + CR020; sequenced after CR014 (dev roles).

The end state: QAPulse becomes the **system of record** for defects; Redmine is retired for defect tracking (it may remain for other uses — requirements import etc. are unaffected).

- **Delete the bridges:** remove `redmine-defect-bridge.ts` (write-through push, status read, prod pull). Everything permanent from CR019/CR020 continues unchanged.
- **Enable native lifecycle:** status transitions (New → Open → In Progress → Fixed → Verified/Closed + Reopened/Rejected/Duplicate/Deferred), comments, assignment — on the existing Defects page. Developers work in QAPulse (requires CR014 roles).
- **History migration:** one-time import of remaining Redmine defect tickets via `redmine_legacy_id` (subject, status, assignee, journal); legacy `RM #` chips keep resolving for old records; unresolvable IDs surfaced in a data-quality report.
- **Notifications:** assignee/reporter notified on transitions via the existing notifications table.
- Retest loop switches from Redmine-status polling to native status transitions (same UI, different trigger).

---

### CR022 — FA Requirement Workflow Enhancements
**Status:** ✅ Deployed (2026-07-04, PR #293 — all three parts: AC editor, discussion thread, UAT file type + milestone picker).

Follow-ups to CR014's FA track onboarding — three separable features that deepen the FA requirement workflow beyond the approval/UAT gates CR014 establishes:

**Part 1 — Acceptance criteria as a structured field** *(no CR014 dependency)*
- Nullable `acceptanceCriteria jsonb` (ordered string checklist) on `requirementsTable`, with an add/remove/reorder editor in the requirement dialogs and Detail page
- Feeds CR015's AI test-case generation (criteria included in the per-requirement prompt payload, one TC per criterion minimum), FA review, and UAT sign-off — reviewers approve against criteria, not prose
- Criteria edits also trigger CR014 Part 7's `requirementRevisedAt` re-review flag (extends the "description only" rule)
- Redmine imports leave it `null` — FA fills in post-import, no parsing heuristics

**Part 2 — Discussion thread on requirements** *(depends on CR014's Detail page)*
- New `requirement_comments` table + `GET`/`POST /requirements/:id/comments` (project-scoped; anyone who can view can comment)
- Chronological thread on the Requirement Detail page between the review box and History panel — keeps the reject → revise → resubmit conversation in QAPulse instead of Teams/email
- New comment notifies author, assignee, and prior commenters (deduped, minus the commenter); comments permanent (no edit/delete in v1)
- Review-action comments stay in `activityTable` per CR014 — the thread is for discussion *between* review actions, not a replacement audit trail

**Part 3 — UAT with evidence** *(depends on CR014 Milestones + UAT gate)*
- Reuses execution machinery: `fileType` (`qa`|`uat`) + `milestoneId` columns on `executionFilesTable`; "Start UAT" on a milestone creates a UAT file pre-populated with one row per acceptance criterion (fallback: per requirement)
- FA-track roles get route-scoped access to UAT execution files only; results recorded via the existing ResultPills/save path, so `executionTcHistoryTable` auditing works for free
- CR014's milestone UAT review shows the UAT file's rolled-up summary next to approve/reject; outstanding failures warn but don't block (consistent with unenforced milestone status)
- Turns the UAT sign-off from a rubber stamp into a verdict with a recorded trail

Full plan: `docs/change-requests/fa-workflow-enhancements.md`

---

### CR023 — Requirement Detail & Review Workflow Gaps
**Status:** ✅ Deployed (2026-07-05, commits `9e70477`, `e82dd6a`, `cf25efb`, `225b678`) — 2 cosmetic list-view items open

A follow-up audit comparing CR014/CR022's actual shipped implementation against the fuller design worked out in parallel (`docs/change-requests/pm-ba-onboarding.md`) found real gaps — some missing features, two actual security/consistency bugs in the review workflow. All four parts below shipped; verified against code 2026-07-05 (this register previously lagged the actual commits by a day).

**Part 1 — Bugs fixed** (`9e70477`)
- Segregation-of-duties check now guards both `approve` and `reject` — an author can no longer reject their own requirement.
- Reject notifications now fan out to author + assignee + the milestone's PM (approve stays author+assignee only — "routine progress, no PM needed").
- Editing a `rejected` requirement is now restricted to its author/assignee (revise & resubmit).
- Redmine imports resolve `createdBy` by matching the Redmine issue's author name against QAPulse users (`ilike` on name); on no match, falls back to the importing user rather than ever leaving it `null` — closes the segregation-of-duties bypass for imported requirements.

**Part 2 — `RequirementDetail.tsx` completed** (`e82dd6a`)
- Breadcrumb now traces the real `parentId` ancestry chain (root first).
- Child Requirements section, History journal (chronological activity log), "Analyze with AI" entry point, and a test-coverage count in the metadata sidebar all added.

**Part 3 — `Requirements.tsx` list view** (`cf25efb`)
- Milestone column added; title click now navigates to `/requirements/:id` instead of opening the old edit modal.
- **Cosmetic items closed out** *(2026-07-05)*: priority now renders as a colored left-border stripe on each row (`border-l-4`, semantic color per priority) instead of a pill badge — the Priority column keeps a plain colored text label for accessibility, since color alone isn't a sufficient signal. The Priority filter is now a row of toggle chips (All/Low/Normal/High/Urgent), matching the chip convention already used for Defects' saved-view tabs; Project/Module/Milestone stay dropdowns since they're open-ended lists, not small fixed sets — same reasoning Defects.tsx already applies (chips for fixed small sets, dropdowns for open ones). No local precedent existed for the left-stripe treatment before this — designed fresh, not copied from elsewhere in the app.

**Part 4 — Requirement-change re-review flow** (`225b678`)
- New columns: `requirementRevisedAt` on `test_cases` and `tasks`, `reviewAcknowledgedAt` on `execution_test_cases`, `milestones.createdBy` (needed for Part 1's PM notification). **Requires `db push`** — not bootstrapped like CR014's tables.
- Editing an approved requirement's description now flags every linked test case and task as needing re-review; an "Alert: Revised" badge + acknowledge/"Revised" action surfaces across all three consumers — Tasks page, TC Library, and every execution view (Tree/Spreadsheet/Focus) in `TestCasesExecutionProgressPage.tsx`.

Full plan: `docs/change-requests/requirement-detail-gaps.md`

---

### CR024 — TC Library: Requirement Filter Includes Descendants
**Status:** ✅ Deployed (2026-07-05)

Filtering the TC Library by requirement previously matched only test cases linked to that exact requirement — a parent requirement's filter would miss test cases linked to its children, grandchildren, etc., even though CR016 already treats the requirement hierarchy as a single unit for coverage rollup on the Traceability Matrix. Same tree, different page, was inconsistent.

- Filtering by a requirement now includes every descendant in the subtree (child, grandchild, and beyond), not just direct children.
- Extracted the recursive `getAllDescendants(parentId, allReqs, depth)` walk to module scope in `TestCases.tsx` — it previously existed only as an inline closure inside the AI Generate dialog's requirement picker. Both the filter and the AI dialog now share one implementation.
- Client-side only: the filter builds a `Set` of {selected requirement id} ∪ all descendant ids and checks membership instead of strict equality, in both the normal and NL-search filter branches.

**Scope:** `artifacts/qa-pulse/src/pages/TestCases.tsx` only. No backend or schema changes.

---

### CR025 — TC Library: Milestone Filter
**Status:** ✅ Deployed (2026-07-05)

Requirements and Tasks both gained a Milestone filter earlier the same day; TC Library had Project/Module/Source/Requirement filters but no Milestone filter, an inconsistency spotted from the deployed page.

- New Milestone filter, scoped to the selected Project filter (same `GET /milestones?projectId=` dependency as the Requirements page filter and the create/edit forms' Milestone pickers) — resets to "all" when the Project filter changes.
- `test_cases` has no `milestoneId` column of its own; a TC's milestone is derived through its linked requirement (`requirements.milestoneId`, mandatory per CR023 Part 3). A memoized `requirementId → milestoneId` lookup map drives the filter — a direct lookup, not a tree-expansion like CR024's requirement filter (each requirement, including children, already carries its own milestone value).
- `?projectId=` and `?milestoneId=` URL params now pre-fill the Project and Milestone filters on load, extending the `?requirementId=` deep-link convention this page already had — enables future deep-links (e.g. from PM Dashboard or Milestones page) straight into a milestone-scoped TC list.

**Scope:** `artifacts/qa-pulse/src/pages/TestCases.tsx` only. No backend or schema changes.

---

### CR026 — QA Analytics Dashboard
**Status:** ✅ Deployed (2026-07-05)

A dedicated analytics page giving QA leads and managers trend visibility across milestones. Today the Traceability Matrix answers "what is the current state?" — CR026 answers "how has quality moved over time, and where are the risks?". All source data already exists in the DB; this CR is pure query + visualisation work, no schema changes.

**Problem statement:** A QA Lead preparing a milestone handover today must manually cross-reference the execution file, defect tracker, and the traceability matrix to answer basic questions — "are we improving sprint over sprint?", "which module keeps failing?", "how does our defect leakage look?". No single view answers these.

---

**Target metrics (seven panels, three filter controls)**

Filters at the top of the page:
- **Project** (dropdown, required — scoped to user's accessible projects)
- **Milestone** (dropdown, optional — "All Milestones" default; scoped to selected project)
- **Date range** (start/end date picker, defaults to last 90 days; ignored when a specific milestone is selected — the milestone's own date range takes over)

**Panel 1 — Execution Trend (line chart)**
X-axis: week (ISO week, last N weeks based on date range). Y-axis: TC count. Four series: Passed / Failed / Blocked / Not Run. Source: `execution_test_cases.result` + `executed_at` (rows where `executed_at IS NOT NULL`). Milestone filter restricts to execution files with `milestone_id = ?`. Shows whether quality is improving week-over-week — the primary "are we headed in the right direction?" chart.

**Panel 2 — Execution Velocity (bar chart)**
X-axis: week. Y-axis: TCs executed (any result other than Not Run). Single bar per week. Optional overlay line: planned TCs (total in milestone's files ÷ weeks remaining — a rough pace guide, not a committed forecast). Answers "are we picking up speed or stalling?"

**Panel 3 — Pass Rate by Milestone (horizontal bar chart)**
One bar per milestone (last 6 milestones for the selected project, newest at top). Bar = pass % of all executed TCs. Color: green ≥ 80%, amber 60–79%, red < 60%. Gives instant cross-sprint quality comparison without drilling into each execution file.

**Panel 4 — Defect Density by Module (bar chart)**
X-axis: module name (top 10 by defect count). Y-axis: defect count. Stacked by severity (critical / high / medium / low). Source: `defects.module` + `defects.severity`, filtered by `project_id` and date range. Answers "which module needs the most QA attention next sprint?"

**Panel 5 — Defect Trend (dual-line chart)**
X-axis: week. Two lines: New defects opened vs Defects closed/resolved. Area between them = open backlog growth. Source: `defects.created_at` for opened, `defects.updated_at` + status ∈ {Closed, Resolved, Verified} for closed. Shows whether defects are being resolved faster than they're created — the "burning down" check.

**Panel 6 — Defect Escape Funnel (stacked bar per milestone)**
Three buckets per milestone: Found in SIT / Found in UAT / Escaped to Production. Source: `defects.found_in` grouped by milestone (join via `defect_links.execution_test_case_id → execution_test_cases.execution_file_id → execution_files.milestone_id`; production defects with no execution link resolved by `defects.project_id` + `created_at` falling within the milestone's date window). The goal: the "Escaped to Production" bar should shrink sprint over sprint. If it doesn't, that's the signal for CAPA. Absent from all existing dashboards today.

**Panel 7 — Requirement Coverage Snapshot (summary cards + mini-funnel bar)**
Four cards: Total Requirements / TC Coverage % (≥1 TC linked) / Execution Coverage % (≥1 TC run) / Pass Coverage % (≥1 TC passed). Values scoped to selected project + milestone. Below the cards: a proportional horizontal bar showing the three-layer funnel (requirements → covered → executed → passed) as color segments. Not a trend — a current-state summary complementing the Traceability Matrix, placed here so the page is self-contained.

---

**Backend — new endpoint `GET /dashboard/qa-analytics`**

Auth: requires auth, scoped to user's accessible projects via `scopeToUserProjects`. Role gate: `qa_lead` / `qa_manager` / `hod_qa` / `admin` / `cto` (QA tier 2+, admin, CTO). `qa_member` excluded — analytics is a lead-and-above concern.

Query params: `projectId` (required), `milestoneId` (optional), `startDate` / `endDate` (optional ISO strings, default last 90 days).

Response shape:
```json
{
  "executionTrend": [{ "week": "2026-W25", "passed": 0, "failed": 0, "blocked": 0, "notRun": 0 }],
  "velocity":       [{ "week": "2026-W25", "executed": 0 }],
  "passByMilestone":[{ "milestoneId": 0, "milestoneName": "", "total": 0, "passed": 0, "pct": 0 }],
  "defectByModule": [{ "module": "", "critical": 0, "high": 0, "medium": 0, "low": 0 }],
  "defectTrend":    [{ "week": "2026-W25", "opened": 0, "closed": 0 }],
  "escapeFunnel":   [{ "milestoneId": 0, "milestoneName": "", "sit": 0, "uat": 0, "production": 0 }],
  "coverage":       { "totalReqs": 0, "tcCoveredReqs": 0, "executedReqs": 0, "passedReqs": 0 }
}
```

All aggregates in one request (7 grouped queries, all on indexed columns). No N+1. Response cached in Redis (CR012) with a 5-minute TTL keyed on `projectId:milestoneId:startDate:endDate`. Analytics data changes only when executions are saved or defects are updated.

Key query patterns:
- Execution trend: `SELECT DATE_TRUNC('week', etc.executed_at) AS week, etc.result, COUNT(*) FROM execution_test_cases etc JOIN execution_files ef ON etc.execution_file_id = ef.id WHERE ef.project_id = ? AND etc.executed_at BETWEEN ? AND ? GROUP BY 1, 2`
- Defect escape funnel: `defects` left-joined to `defect_links` → `execution_test_cases` → `execution_files` for `found_in` + `milestone_id` resolution; production defects (no execution link) resolved by `defects.project_id` + `created_at` within the milestone's `start_date`/`end_date` window.
- Coverage: reuse the `WITH RECURSIVE` CTE already in `traceability.ts` for requirement tree expansion, then aggregate.

---

**Frontend — `QAAnalytics.tsx` at `/qa-analytics`**

Nav entry: label "QA Analytics", icon `HoverBarChart` (new animated icon), permission key `nav:qa-analytics`, roles `qa_lead` / `qa_manager` / `hod_qa` / `admin` / `cto`, `activeColor` `text-indigo-500`. Positioned after "Traceability" in the nav sidebar.

Layout: top filter bar (Project / Milestone / Date range), then a 2-column responsive grid for the 7 panels. Panel 1 (Execution Trend) spans full width; panels 2–7 in pairs. Each panel: white card with title. Loading skeleton while fetching.

Chart components (all recharts, already installed):
- Panels 1, 5: `LineChart` with `ResponsiveContainer`
- Panels 2, 4: `BarChart` (stacked for Panel 4)
- Panel 3: `BarChart` `layout="horizontal"`
- Panel 6: `BarChart` stacked per milestone (X-axis = milestone names)
- Panel 7: summary `div` cards + CSS flexbox proportional bar (no chart component needed)

Export: "Export CSV" for the whole page (one CSV per panel, client-side). PNG export deferred — `html2canvas` not yet a dependency; add only if requested.

URL params: `?projectId=&milestoneId=&start=&end=` — persisted on filter change so the view is shareable and bookmarkable. Same convention as PM Dashboard's `?projectId=`.

**Permission bootstrap:** add `nav:qa-analytics` to `admin` + `cto` backfill list and seed into `qa_lead` / `qa_manager` / `hod_qa` in the nav-permissions bootstrap — same narrow single-key pattern used for `hod_pm`'s `nav:pm-dashboard` backfill (does not blanket-reapply full permission sets).

**Scope:** `artifacts/api-server/src/routes/dashboard.ts` (new endpoint), `artifacts/api-server/src/routes/index.ts` (register), `artifacts/qa-pulse/src/pages/QAAnalytics.tsx` (new page), `artifacts/qa-pulse/src/components/Layout.tsx` (nav entry), `artifacts/qa-pulse/src/components/icons/animated.tsx` (HoverBarChart icon). No schema changes. No DB migration.

**Delivery order:** backend endpoint first (verify all 7 queries), then frontend panel-by-panel: Panel 1 Execution Trend → Panel 3 Pass by Milestone → Panels 4–5 Defect panels → Panel 2 Velocity → Panel 6 Escape Funnel → Panel 7 Coverage snapshot → CSV export.

---

### CR027 — Notification Center UX
**Status:** ✅ Deployed (2026-07-10)

The notification infrastructure is already built: `notifications` table, three API routes (`GET /notifications`, `PATCH /:id/read`, `POST /mark-all-read`), `Inbox.tsx` page, and a bell badge in the nav with 30-second polling. What's missing is the quality layer: notifications don't route you anywhere when clicked, 30-second polling introduces meaningful latency for review-workflow events, and most business events fall through as the generic `info` type — making the Inbox a flat chronological dump rather than an actionable feed.

**This CR does not add notification preferences** (opt-in/out per event type) — explicitly deferred as phase 2. Focus: make existing notifications useful through routing, latency, and type structure.

**Deployment note (2026-07-10):** Parts 1, 3, 4, 5 (deep-link routing, SSE, bell dropdown, Inbox polish) shipped 2026-07-05 in commit `9c7c089` alongside CR026. Part 2's 9 structured types had frontend icon/color mappings from that same commit but were never actually emitted by any backend route — `requirements.ts` had zero `logNotification`/`notifyUser` calls for review events, `defects.ts` used old type names (`defect_created` instead of `defect_opened`, no `retest_needed`), `milestones.ts` had no `uat_milestone_ready`, and `requirement-comments.ts` both used the old `requirement_comment` type **and** called `notifyUser()` with a mismatched signature (object literal instead of positional args) — a live TypeScript error (`Expected 6-7 arguments, but got 2`) that silently broke comment notifications entirely. This session (2026-07-10) closed all of those gaps:
- `_notify.ts`'s `notifyUser()` now wraps `logNotification()` internally, so all pre-existing call sites (tasks.ts, calendar.ts, test-execution.ts, etc.) get SSE delivery for free, not just new ones.
- `requirements.ts`: added `review_request` fan-out to FA-review-tier users with project access on submit; renamed `requirement_approve`/`requirement_reject` → `review_approved`/`review_rejected`; renamed `requirement_revised` → `revision_required`.
- `defects.ts`: added `defect_opened` (fan-out to project's `qa_lead`+) on both `POST /defects` and `POST /defects/register`; added `defect_status_changed` notification (previously activity-logged only, never notified) to reporter + linked TC's executor; added `retest_needed` to the TC's last executor when a defect moves to a "fixed" status while its linked execution row is still Failed.
- `test-execution.ts`: added `uat_milestone_ready`, firing once per milestone (deduped via existing `notifications` rows, no schema change) when a UAT execution file's pass rate crosses 80%.
- `requirement-comments.ts`: fixed the broken `notifyUser()` call and renamed the type to `comment_posted`.

All 9 types are now genuinely wired end-to-end. No schema changes.

---

**Part 1 — Deep-link routing (highest value, zero schema change)**

`notifications.entityType` and `notifications.entityId` are already stored. `Inbox.tsx` currently renders them display-only — clicking a row marks it read but does not navigate. Fix: map `(entityType, entityId)` to a route and call `setLocation()` (wouter) after mark-read.

Routing table:
| entityType | navigation target |
|---|---|
| `requirement` | `/requirements/:id` (RequirementDetail) |
| `execution_file` | `/test-execution/:id` |
| `defect` | `/defects?highlight=:id` |
| `task` | `/tasks?highlight=:id` |
| `milestone` | `/milestones?highlight=:id` |
| `test_case` | `/test-cases?tc=:id` |
| `audit_log` | `/audit-log?entityId=:id` |
| null / unknown | no navigation (stays on Inbox) |

`highlight=:id` convention: target pages scroll the matching row into view and apply a brief yellow-flash highlight (2s fade). Requires threading a `highlight` URL param reader into each list page — low-effort, one `useEffect` per page.

**Part 2 — Notification type taxonomy (coarse → structured)**

Current types: `task`, `overdue`, `social`, `warning`, `info`. Review workflow events, defect events, and revision alerts all land as `info`. New types added alongside the existing set (existing rows untouched, no migration):

| type | when written | who receives | entityType |
|---|---|---|---|
| `review_request` | requirement status → `pending_review` | all FAs + `fa_lead`+ in project | `requirement` |
| `review_approved` | review action = approve | requirement author + assignee | `requirement` |
| `review_rejected` | review action = reject | author + assignee + milestone PM | `requirement` |
| `revision_required` | approved requirement description/AC edited (CR023 Part 4) | linked TC owners + task assignees | `requirement` |
| `defect_opened` | defect created | project's `qa_lead`+ | `defect` |
| `defect_status_changed` | defect status write-through updated | defect reporter + linked TC's executor | `defect` |
| `retest_needed` | defect resolved but linked TC still Failed | TC's last executor (`qaPic`) | `defect` |
| `uat_milestone_ready` | milestone UAT execution file pass % ≥ 80% | milestone's PM (`milestones.createdBy`) | `milestone` |
| `comment_posted` | new comment on requirement thread | requirement author + prior commenters (deduped, minus commenter) | `requirement` |

Inbox icon/color map updated for all new types. Title + message remain free-text from the notification writer — no Inbox structure changes beyond the icon/color lookup expansion.

**Part 3 — Real-time delivery via SSE**

Current: `useQuery({ refetchInterval: 30000 })` in `Layout.tsx` — up to 30s before a reject notification appears.

New endpoint: `GET /notifications/stream` — a per-user SSE stream that pushes a lightweight ping `{ type: "new_notification", unreadCount: N }` whenever a notification is written for the connected user. The Inbox and bell badge respond by invalidating the `listNotifications` query cache — actual notification data still comes from `GET /notifications` REST (no payload duplication in the stream).

Implementation: mirrors the existing `/execution-events` SSE endpoint pattern. In-process `Map<userId, Set<Response>>` tracks live connections (sufficient for a single-process server; upgrades to Redis pub/sub under CR012 multi-process). New `logNotification(db, {...})` helper in `lib/notifications.ts` wraps the `db.insert(notificationsTable)` + SSE ping. All existing `db.insert(notificationsTable)` call sites across routes refactored to use the helper (approximately 6–8 call sites; grep-findable).

Frontend: `Layout.tsx` opens `new EventSource('/api/notifications/stream')` on mount; on `message` event calls `queryClient.invalidateQueries(['notifications'])`. The existing 30s poll remains as a correctness fallback (SSE reconnects automatically on disconnect, but the poll catches stalls).

**Part 4 — Bell dropdown (quick glance without leaving the page)**

Currently the bell icon is a plain nav link to `/inbox`. Replace with a Radix `Popover` that opens on bell click and shows the 5 most recent unread notifications — icon + title + relative time + deep-link arrow button. Footer: "Mark all read" + "See all" link to `/inbox`. Clicking a notification row: marks it read + navigates (Part 1 routing). Popover closes on outside-click.

New component: `NotificationDropdown.tsx`. Uses the same `listNotifications` query data already loaded in `Layout.tsx` — no extra API call. Unread count badge stays on the bell icon unchanged.

**Part 5 — Inbox UX polish (minor, bundled)**

- **Entity-type filter chips:** All / Requirements / Defects / Tasks / Milestones — client-side filter on loaded data (no new API call). Complements the existing unread-only toggle.
- **Explicit navigation button:** small `→` icon button on hover per row for the deep-link, so "mark read" (row click) and "navigate" (arrow button) are separate — avoids accidental navigation when just clearing the inbox.
- **Empty state:** "You're all caught up" illustration when no notifications match the current filter (currently blank).
- **Type badge:** icon + label in a dedicated column so the feed is scannable by event type.

---

**Scope:**

Backend:
- `artifacts/api-server/src/routes/notifications.ts` — new `GET /notifications/stream` SSE endpoint
- `lib/notifications.ts` (new) — `logNotification()` helper + in-process SSE connection registry
- `artifacts/api-server/src/routes/requirements.ts` — update notification writes to use `logNotification()` + new type values (`review_request`, `review_approved`, `review_rejected`, `revision_required`)
- `artifacts/api-server/src/routes/defects.ts` — `defect_opened`, `defect_status_changed`, `retest_needed`
- `artifacts/api-server/src/routes/milestones.ts` — `uat_milestone_ready`
- `artifacts/api-server/src/routes/requirement_comments.ts` — `comment_posted`

Frontend:
- `artifacts/qa-pulse/src/components/Layout.tsx` — replace bell link with `NotificationDropdown`; open SSE `EventSource` on mount; keep 30s poll as fallback
- `artifacts/qa-pulse/src/components/NotificationDropdown.tsx` (new) — 5-item quick-glance popover with Part 1 routing
- `artifacts/qa-pulse/src/pages/Inbox.tsx` — deep-link routing on click, entity-type filter chips, type badge column, explicit `→` nav button, empty state

No schema changes. No DB migration. `entityType` and `entityId` columns already exist on `notificationsTable`.

---

### CR028 — Client Demo Data Toolkit
**Status:** ✅ Deployed (2026-07-05)

Dev tooling, not an in-app feature: a reversible seed/clear script pair producing a realistic, fully-linked dataset for client demos — two projects with a full sprint/release history, real requirement hierarchy and FA review states, test cases, execution results, defects (including a production escape with escape analysis and an auto-created regression TC), and tasks across a 6-person team.

- **Everything is created through the real API**, not raw SQL — so validation, the FA review workflow (submit/reject/revise/resubmit/approve), defect code generation, and audit logging all fire exactly as they would for a real user. The one place this mattered enough to require a product fix: `PATCH /defects/:id` only allowed `escapeStatus`/`escapeClass`/`escapeNotes`/`severity`/`module`/`projectId` — `source` wasn't editable, meaning a production-escape defect (created via `POST /defects`, which always hardcodes `source: "qa"`) could never actually become `source: "production"` afterward. Added `source` to the allowed PATCH fields — a small, permanent, generally-useful fix (reclassifying a mis-filed defect is a legitimate QA action), not just a script workaround.
- **Reversible via a manifest**, not name-pattern matching: `seed-demo-data.ts` writes `scripts/demo-seed-manifest.json` (gitignored) incrementally as it creates each entity, so a failed run leaves a safe, partial manifest. `clear-demo-data.ts` deletes only IDs recorded there — never guesses by project name or email domain — so it can't accidentally touch real data added alongside the demo set.
- **Cascade behavior mapped before writing the clear script**: confirmed which FKs actually cascade (`execution_test_cases`→file, `defect_links`→defect, `user_teams`/`project_teams`/`project_members`→team/project/user) versus which don't (`requirements`/`test_cases`/`tasks`/`defects`/`execution_files`.`project_id` are plain integers with no FK constraint at all — deleting a project does **not** clean these up). Defects have no `DELETE` endpoint at all (native defect lifecycle is CR021, not built) — cleared via one direct SQL statement, the only raw-SQL step in either script.
- **Scope estimate:** `scripts/src/demo-data.ts` (pure content — projects/teams/users/milestones/requirements/test cases/execution results/defects/tasks), `scripts/src/seed-client.ts` (login, authenticated fetch, manifest helpers), `scripts/src/seed-demo-data.ts`, `scripts/src/clear-demo-data.ts`, `scripts/package.json` (`seed:demo` / `seed:demo:clear`), `scripts/DEMO_DATA.md` (run instructions), `artifacts/api-server/src/routes/defects.ts` (the one product fix). No new tables.

**Known limitation, by design:** seeded defects show a "pending sync" badge — the write-through push to Redmine fails with no real Redmine connection in a sandbox, which is CR019's "never block on Redmine" behavior working as intended, not a bug to fix here.

---

### CR029 — Defect Category Classification
**Status:** ✅ Deployed (2026-07-05)

A fixed, QAPulse-native defect taxonomy (Functional, UI/UX, Usability, Performance, Security, Data/Database, Compatibility, Integration/API, Configuration/Environment, Localization), settable on both defect-creation paths (the Defects page's "New Defect" dialog and the execution fail pill's "Create Defect" modal) and gated to Lead-tier and above.

- **New column, not a repurpose of the existing `category` field:** `defects.category` already existed, but it's a Redmine-mirror (whatever a given Redmine project's own issue-category field happens to say — freeform, only populated on production-defect pulls). Overloading it with a fixed QAPulse taxonomy would have collided with that unrelated existing meaning, so a new `defectCategory` column was added instead. Requires a `db push` (the `defects` table has no bootstrap `CREATE TABLE`/`ALTER TABLE` SQL at all — it was created via `drizzle-kit push` originally, unlike `milestones`/`requirements`, which have hand-written idempotent bootstrap statements).
- **Lead-tier+ gate, enforced server-side, not just hidden in the UI:** added `getRoleTierRank(role)` to `middleware/access.ts` (admin → unrestricted, everyone else looked up from `roles.tier_rank`; Lead = 2 across every department by the existing tier convention). `POST /defects`, `POST /defects/register`, and `PATCH /defects/:id` all silently drop an incoming `defectCategory` if the caller's tier is below 2, rather than rejecting the whole request — a lower-tier caller hitting the API directly (bypassing the UI, which simply doesn't render the field for them) can't set it, but their otherwise-valid defect still gets created.
- **`GET /auth/me` (and login/refresh) now return `tierRank`** so the frontend can decide whether to render the field at all — `formatUser()` in `auth.ts` was made async to join `roles.tier_rank` by the user's role name (admin hardcoded to a finite sentinel, 99, since `Infinity` doesn't survive `JSON.stringify`).
- **Shared `DefectCategoryField` component** (dropdown + an (i) info button opening a dialog with all 10 categories and their descriptions) used identically by both creation dialogs — "all dialogs regarding defects" now means exactly these two, since a separate "Edit Defect" dialog doesn't exist (edits happen via small inline controls for `escapeStatus`/`escapeClass`/`escapeNotes` only). `PATCH /defects/:id` accepts `defectCategory` too, ahead of any future edit UI needing it.
- **Scope estimate:** `lib/db/src/schema/defects.ts` (new column), `artifacts/api-server/src/middleware/access.ts` (`getRoleTierRank`), `artifacts/api-server/src/routes/auth.ts` (`tierRank` on the user payload), `artifacts/api-server/src/routes/defects.ts` (taxonomy constant + tier gate on all three write endpoints), `artifacts/qa-pulse/src/lib/defect-categories.ts` (taxonomy + label lookup, new), `artifacts/qa-pulse/src/components/DefectCategoryField.tsx` (new), `artifacts/qa-pulse/src/pages/Defects.tsx` + `DefectCreationModal.tsx` (both creation dialogs, plus a list-row display), `artifacts/qa-pulse/src/lib/execution-api.ts` (`registerLocalDefect` payload).
- **Not done:** no filter-by-category on the Defects list, and it isn't fed into CR026's planned defect-density dashboard yet — both natural follow-ups once real category data exists to look at.

---

### CR030 — Developer Workflow: Requirement Handoff & Defect Assignment
**Status:** ✅ Deployed (2026-07-05)

First slice of bringing Development into QAPulse as a native workflow participant rather than an external, no-login department (a reversal of CR014's original assumption — the `dev_member`/`dev_lead`/`hod_dev` roles it seeded already existed and can log in, but had no dev-specific workflow to do anything with). Two independent handoff loops, matching how the org actually works day to day:

- **Requirements:** FA-approved requirement → Lead assigns a developer → dev works it → dev marks Ready for QA. Ready-for-QA is the terminal dev-side state; QA picking the work back up for testing is already tracked by the existing execution tables, not a further status here.
- **Defects:** QA creates/finds a defect → Lead-tier assigns a developer natively in QAPulse → dev fixes it (existing status-edit flow) → the already-built "Retest needed" surfacing (CR019/CR020) closes the loop back to QA. No new hand-back mechanism was needed — it already existed, just without a native assignee to notify.

**Part 1 — Native defect assignment, reconciled against Redmine by recency**

Redmine assignment was previously read-only cache (`defects.assigneeName`, a plain string, refreshed one-way from Redmine on every status refresh). Decision (user call, 2026-07-05): make assignment native in QAPulse now — the Lead-tier+ user assigns a real QAPulse user — but keep the Redmine side in sync via **last-write-wins by timestamp**, not by picking one system as permanently authoritative:

- New columns on `defects`: `assigneeId` (FK to `users`, the source of truth for "who owns this in QAPulse") and `assigneeAssignedAt` (when that assignment was made).
- `PATCH /defects/:id/assign` (Lead-tier+ gate, `getRoleTierRank >= 2` — mirrors the existing `canSetDefectCategory` gate) sets both columns, updates the cached `assigneeName` for display, logs activity, notifies the new assignee, and — if the defect already has a `redmineId` — best-effort pushes the assignment to Redmine.
- Pushing to Redmine requires a Redmine *user id*, which QAPulse doesn't store for its own accounts (unlike the existing per-user Redmine API key, which authenticates outbound calls but doesn't identify the account to look up). Added `resolveRedmineUserIdByName`/`pushAssigneeToRedmine` in `redmine-defect-bridge.ts` — a best-effort name search against Redmine's own `/users.json`. A miss (no matching Redmine user, or Redmine unreachable) is silent: the native assignment stands locally regardless, exactly like `pushDefectToRedmine`'s existing "never block on Redmine" philosophy.
- `refreshDefectStatuses` (the existing bulk Redmine→QAPulse pull) now reconciles the assignee both ways instead of blindly overwriting the cache: compares Redmine's `issue.updated_on` against our own `assigneeAssignedAt`. If QAPulse's native assignment is newer, the pull leaves it alone and fires the same best-effort push instead of clobbering it; if Redmine's is newer, the pull adopts Redmine's assignee name into the cache and — if it name-matches a QAPulse user — updates `assigneeId` too, so the native "My Defects" view stays consistent with reassignments made directly in Redmine.
- Defects page: assignee picker (Lead-tier+ only; everyone else sees read-only text) scoped to `dev_member`/`dev_lead`/`hod_dev` users, and a new "My Defects" view tab (`view=mine`, filters to `assigneeId === current user`) alongside the existing All open/Blocking/Retest tabs.
- Defects nav item, previously hardcoded to `["qa_member", "qa_lead", "admin"]` with no permission key (deliberately, per CR019, so it wouldn't get hidden on existing DBs before permission keys existed) now carries `nav:defects`, seeded to the dev department plus every role that could already reach it (`qa_manager`/`hod_qa` were quietly missing from that original hardcoded list too — now included).

**Part 2 — Requirement dev handoff**

- New columns on `requirements`: `devStatus` (`null` | `'assigned'` | `'in_progress'` | `'ready_for_qa'` — null until dev work starts), `devAssigneeId`, `devAssignedAt`, `devAssignedBy`, `readyForQaAt`.
- `PATCH /requirements/:id/dev` — actions `assign` (Lead-tier+ only, requires `reviewStatus = 'approved'` first — dev handoff is downstream of FA approval, not a parallel track), `start`, and `ready_for_qa` (assignee or any Lead-tier+ can drive the latter two). `ready_for_qa` notifies the requirement's own QA assignee plus the milestone's PM (same recipient logic as the existing reject-notification fan-out).
- `GET /requirements/dev-queue` — "Unassigned" (approved, no dev assignee yet — Lead-tier+ only, for triage) and "My Dev Work" (assigned to me), mirroring CR014 Part 4's "My Review Queue" shape.
- `RequirementDetail.tsx` gained a Development sidebar card: dev status badge, an assignee picker for Lead-tier+ (plain text for everyone else), and Start Work/Mark Ready for QA buttons gated to the assignee or a Lead. `Requirements.tsx` list rows show a small Dev status badge next to the existing tracker badge once handoff has started.
- **Not built this round:** a dedicated "Dev Queue" tab/page UI consuming the new `GET /requirements/dev-queue` endpoint (the endpoint exists and the per-requirement workflow is fully usable from Requirement Detail; the triage list view is a natural follow-up once dev volume warrants it).

**Found and fixed in passing:** `GET /requirements/:id` was registered before `GET /requirements/review-queue` (both single-segment paths under `/requirements`), and Express matches routes strictly in registration order, not by specificity — so any request to `/requirements/review-queue` was being swallowed by the `:id` handler first, failing `zod.coerce.number()` on the literal string "review-queue" and 400ing before the real handler ever ran. This means CR014 Part 4's "My Review Queue" has likely been broken since it shipped. Fixed with a minimal, safe change: the `:id` handler now calls `next()` on a non-numeric id instead of returning 400, falling through to the routes registered after it (review-queue, and this CR's new dev-queue) — rather than physically reordering route registrations, which would've meant moving several hundred lines of code around for the same effect.

**Also fixed in passing:** `lib/db/src/schema/requirements.ts` imported `z` from `"zod"` while every sibling schema file (and `drizzle-zod`'s own internals) uses `"zod/v4"` — a preexisting mismatch that was already failing typecheck on `main` before this CR (confirmed via `git stash`), and got worse (but not newly broken) as this CR added five more columns to the same table. Aligned the import with every other schema file.

**Scope:** `lib/db/src/schema/defects.ts`, `lib/db/src/schema/requirements.ts` (new columns), `artifacts/api-server/src/routes/roles.ts` (bootstrap `ALTER TABLE`s, `nav:defects` permission key + narrow backfill), `artifacts/api-server/src/routes/redmine-defect-bridge.ts` (`pushAssigneeToRedmine`, `resolveRedmineUserIdByName`, reconciliation in `refreshDefectStatuses`), `artifacts/api-server/src/routes/defects.ts` (`PATCH /defects/:id/assign`, `view=mine`), `artifacts/api-server/src/routes/requirements.ts` (`PATCH /requirements/:id/dev`, `GET /requirements/dev-queue`, the route-ordering fix), `artifacts/qa-pulse/src/components/Layout.tsx` (nav), `artifacts/qa-pulse/src/pages/Defects.tsx`, `artifacts/qa-pulse/src/pages/RequirementDetail.tsx`, `artifacts/qa-pulse/src/pages/Requirements.tsx`.

**DB change:** new columns only, all bootstrapped (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) — no manual `db push` required, unlike CR029's `defects.defectCategory` (that table predates bootstrap coverage; these are the first bootstrap-owned columns added to it).

---

### CR031 — Requirement Defect Workflow
**Status:** ✅ Deployed (2026-07-10)

**Deployment note:** Both open decisions flagged below were resolved during build: (1) raiser roles — went with the explicit list (`dev_member`/`dev_lead`/`hod_dev`/`qa_member`/`qa_lead`/`hod_qa`/`admin`/`cto`), matching the codebase's existing explicit-list convention (e.g. `FA_REVIEW_ROLES`) rather than a dynamic tier check; (2) self-handoff — implemented as an exception on the existing `PATCH /defects/:id/assign` (not a separate `/route` endpoint), consistent with CR030's precedent. One deviation from the original "no new tab required" plan: `Defects.tsx`'s three tabs are hard-mapped 1:1 to `source` values (`tab` is sent directly as the `source` query param), so a `source: 'requirement'` defect would have been invisible under any existing tab. Added a 4th "Requirement defects" tab instead — same low-risk pattern already used to add the "Others" tab.

Today "something is wrong with this requirement" has exactly one outlet — flipping `reviewStatus` to `rejected` during the CR023 FA review — and that outlet closes the moment a requirement is approved. Once CR030's dev handoff starts (Lead assigns dev → dev works → Ready for QA), a developer or QA engineer who discovers the requirement itself is ambiguous, contradictory, or wrong has nothing structured to raise: no severity, no assignee, no record on the Defects page, no metric. CR031 gives requirement-authoring problems the same first-class treatment code defects already have, by routing them through the existing `defects` entity instead of inventing a parallel one.

**Explicitly out of scope:** raising a requirement defect *during* the review action itself (approve/reject already covers that moment — CR031 is for problems discovered after review, at any later phase).

---

**Flow**

1. `dev_member` / `dev_lead` / `qa_member` / `qa_lead` (plus `hod_dev` / `hod_qa` / `admin` implicitly, same tier-and-above convention used elsewhere) raises a requirement defect against a specific requirement, any time after it has been approved.
2. It auto-routes to the requirement's own author (`requirements.createdBy`) — no Lead-tier+ assign action needed for this hop, since it's deterministic routing to the accountable person, not a discretionary assignment.
3. The author (FA) triages: edits the requirement to fix the ambiguity/error, then calls the existing `PATCH /requirements/:id/review` with `action: 'submit'` — reusing the CR023 review workflow verbatim. The current code has no guard on the requirement's prior `reviewStatus` before accepting `submit`, so this works unmodified on an already-`approved` requirement.
4. A non-author FA/QA-lead reviews and approves (or rejects) the correction — the existing segregation-of-duties check (`requirements.ts:573`) already forces a second pair of eyes with zero special-casing.
5. Once re-approved, the author reassigns the *defect* — to a developer if code needs to change (rejoins the normal fix → retest → QA loop unchanged from CR019/CR020), or straight to QA if it was a pure spec correction with no code impact (QA re-verifies against the corrected requirement text).

---

**Data model — no schema changes, no migration**

`defects.source` and `defects.foundIn` are free-text columns, not DB-level enums, so this needs zero `ALTER TABLE`s:
- `source`: new value `"requirement"` alongside existing `qa` / `production`.
- `foundIn`: new value `"Development"` for defects discovered outside a testing phase (e.g. a dev mid-implementation); `SIT` / `UAT` still apply when QA notices the issue during execution.
- Link to the requirement via the existing `defectLinksTable` (`requirementId` + `linkType: 'requirement'`, already present and previously unused for this purpose — see comment at `defects.ts:63-75`).
- `defectCategory` (the functional/ui_ux/... taxonomy) does not apply to this source and stays `null` — it's a product-defect classification, not a requirement-authoring one.
- Requirement defects are QAPulse-native only: `redmineId` stays null, no Redmine push, consistent with the standing principle that Redmine integrations stay thin and disposable — this is a QAPulse concept with no Redmine tracker equivalent.
- Status/retest lifecycle reuses the existing plain-string vocabulary and regex-based `retestNeeded` calculation (`New` → `In Progress` → `Fixed`/`Ready` → QA sees it needs retest → `Verified`/`Closed`) — no new state machine.

---

**Backend changes**

- `POST /defects` — accept `source: 'requirement'` + `requirementId` (required for this source). On insert, auto-set `assigneeId = requirement.createdBy` and `assigneeAssignedAt = now()`; skip the Redmine push path entirely for this source.
- `PATCH /defects/:id/assign` — add a self-handoff exception: when `defect.source === 'requirement'` and the caller is the *current* assignee, allow reassignment regardless of tier (mirrors CR030's precedent of letting the dev assignee self-drive `start`/`ready_for_qa` without a Lead gate). Falls back to the existing tier ≥ 2 gate for anyone else. This matters because the auto-routed first assignee is often an `fa_member` (tier 1), who must still be able to hand the defect off to dev or QA without escalating to `fa_lead`.
- No changes needed to `PATCH /requirements/:id/review` — confirmed it already accepts `submit` on any prior `reviewStatus`, including `approved`.

**Frontend changes**

- `RequirementDetail.tsx` — new "Requirement Defect" card (same visual pattern as CR030's Development card): open defect count, a "Raise Requirement Defect" button for the raiser roles above, and once raised, assignee + status + a reassign control visible only to the current assignee.
- `Requirements.tsx` — small "N open defects" badge next to the existing tracker/dev-status badges.
- `Defects.tsx` — `source: 'requirement'` becomes a filterable value; no new tab required for v1 (the existing "Mine" view already works since it filters on `assigneeId` regardless of source).

**Stretch, not v1 scope:** a new `escapeClass` value (e.g. `bad_requirement`) on *production* defects, settable during CR020 escape review, to distinguish "QA missed a real code bug" from "the requirement itself was wrong" — and ideally auto-suggesting raising a requirement defect against the culprit requirement when that class is picked. Deferred until requirement defects have shipped and there's a production incident to validate the linkage against.

**Scope:** `artifacts/api-server/src/routes/defects.ts` (`POST /defects` source handling + auto-assign, self-handoff exception on `PATCH /defects/:id/assign`), `artifacts/qa-pulse/src/pages/RequirementDetail.tsx` (Requirement Defect card), `artifacts/qa-pulse/src/pages/Requirements.tsx` (badge), `artifacts/qa-pulse/src/pages/Defects.tsx` (source filter). No schema files, no migration.

**Open decisions before build starts:** (1) confirm the raiser role list above is complete — should `hod_dev`/`hod_qa` be explicit rather than implicit-via-tier; (2) confirm the self-handoff exception on `PATCH /defects/:id/assign` is the right mechanism vs. a dedicated `PATCH /defects/:id/route` action kept separate from Lead-tier assignment semantics.

---

### CR032 — PM Dashboard: Multi-Cycle Phase Timeline
**Status:** ✅ Deployed (2026-07-10)
**Depends on:** CR014 Part 3 (built the "Where did the time go" phase-breakdown report this CR rewrites the internals of), CR030 (`devAssignedAt`/`readyForQaAt` columns on `requirements`, currently unused by the dashboard), CR031 (Requirement Defect Workflow — the primary motivating case for a requirement bouncing through a second review cycle, though the same gap already exists today via CR023's plain reject→revise→resubmit).

**Deployment note:** Backend rewrite in `dashboard.ts` uses activity-log events directly (`requirement_submit`/`requirement_approve`/`requirement_dev_assign`/`requirement_dev_ready_for_qa`) rather than the `devAssignedAt`/`readyForQaAt` columns cited above — those columns get overwritten on every cycle the same way `approvedAt` does, so they can't distinguish cycle 1 from cycle 2; the activity log is the only append-only source of truth for multi-cycle reconstruction. Implemented as a look-ahead state machine per requirement (`computeTimelineFromEvents`) rather than a single reactive pass — at each state (`requirements`/`gap`/`develop`/`testing`) it finds the earliest of the possible next boundary events and jumps to it, which is what makes "resubmit while still churning inside Requirements" (CR023 reject/revise loop) correctly *not* open a new cycle, while "resubmit after Testing has opened" correctly does. Also handles milestones that never use the CR030 dev-handoff flow at all: the `gap` state closes on whichever comes first — a `requirement_dev_assign` event, or the first execution timestamp recorded (same boundary the old model used). Batches activity-log and execution rows in 2 queries for the whole milestone (not per-requirement) to avoid N+1, same discipline as CR026.

Today's phase-breakdown report (`GET /dashboard/milestone-phase-breakdown`) computes each named phase as a single `min(start) → max(end)` window: Requirements is `createdAt → approvedAt`, one value each, full stop. Two consequences follow directly from that:

1. **"Develop" isn't represented at all.** The bar goes straight from Requirements to Gap-before-QA to QA testing — CR030's `devAssignedAt`/`readyForQaAt` columns exist but this dashboard never reads them.
2. **A second review cycle doesn't add a segment — it silently corrupts the first one.** `PATCH /requirements/:id/review`'s `approve` branch sets `approvedAt = now()` unconditionally every time it fires (`requirements.ts:582-587`), including a resubmit-and-reapprove. Since the milestone aggregate takes the *max* `approvedAt` across all requirements, one late-discovered problem on a single requirement drags the whole milestone's "Requirements" bucket out to that later date — misattributing dev/QA time as slow requirements review. This already happens today via CR023's reject→revise→resubmit loop; CR031 adds a second, more frequent reason for the same cycle to occur.

**Target:** a repeating sequence — Requirement → Develop → Testing → Requirement → Develop → Testing → ... — as many times as a given requirement actually cycled, reconstructed from data that already exists (no new tracking).

---

**Data model — no new tables or columns**

Everything needed is already logged:
- `requirement_submit` / `requirement_approve` / `requirement_reject` activity-log entries (`requirements.ts:596-604`) — ordered, one row per event, unlike the single overwritten `approvedAt` column.
- `requirement_dev_assign` / `requirement_dev_start` / `requirement_dev_ready_for_qa` activity-log entries (CR030, `requirements.ts` dev-handoff endpoint).
- `executionTestCasesTable.executedAt`, scoped per file type (`qa`/`uat`) — same source the dashboard already queries, just needs bucketing into whichever cycle's time window each timestamp falls in rather than one continuous min/max.

**Backend changes — `artifacts/api-server/src/routes/dashboard.ts`**

Replace the fixed-named-phase model (`buildPhaseBreakdown`, `computeMilestonePhases`, `computeRequirementBreakdowns`, lines 190-391) with an event-timeline reconstruction per requirement:
1. Pull the requirement's ordered activity-log rows for the event types above, plus `createdAt`.
2. Walk them in order, opening/closing segments: `createdAt` opens Requirement #1; the next `requirement_approve` closes it; the next `requirement_dev_assign` opens Develop #1; the next `requirement_dev_ready_for_qa` closes it and opens Testing #1 (bounded by execution timestamps in that window); a subsequent `requirement_submit` (a resubmission — reviewStatus was already `approved`) closes Testing #1 and opens Requirement #2; repeat for as many cycles as actually occurred.
3. Return a flat ordered array (`{ key, cycle, label, start, end, days }`) instead of a fixed named object — `key` stays one of `requirements`/`develop`/`gap`/`qa`/`uat` for color-mapping purposes, `cycle` distinguishes the 1st occurrence from the 2nd/3rd for labeling ("Requirements (round 2)").
4. Milestone-level aggregation: **sum a requirement's own per-cycle durations for a given phase key before averaging across requirements/milestones** (e.g. a requirement with two Requirements-phase cycles contributes their total, not two separate data points) — this answers "how much total time did requirements churn cost," which is the report's whole purpose, rather than diluting the average with cycle-count noise.

**Frontend changes — `artifacts/qa-pulse/src/pages/PmDashboard.tsx`**

`PhaseTimelineBar`/`phasesToSegments` (lines 225-280) already renders an arbitrary number of segments — it just needs to accept the new flat array shape instead of the fixed named object, plus a `develop` entry in `PHASE_COLOR` (lines 212-217). Repeated cycles of the same phase key can reuse that key's color (a repeating pattern reads more clearly than inventing new colors per cycle) with the round number available on hover/tooltip.

**Stretch, not core scope:** labeling a Requirements-phase restart with *why* it reopened (CR031 requirement defect vs. a plain CR023 reject) by cross-referencing `defectLinksTable` for a `linkType: "requirement"` row created around that `requirement_submit` timestamp. Deferred — the phase timeline is useful without it, and the linkage is a nice-to-have, not required to fix the core distortion.

**Scope:** `artifacts/api-server/src/routes/dashboard.ts` (phase reconstruction rewrite), `artifacts/qa-pulse/src/pages/PmDashboard.tsx` (segment shape + Develop color). No schema files, no migration.

---

### CR033 — PM Dashboard: IPECC Coverage (Milestone Closing + Risk Register)
**Status:** ✅ Deployed (2026-07-13)

**Origin:** stakeholder review feedback that the PM Dashboard needs to "follow IPECC" — the five PMBOK process groups (Initiating, Planning, Executing, Controlling, Closing). An audit of the current dashboard against all five groups:

| IPECC phase | Current coverage |
|---|---|
| Initiating | Milestones/projects get created with no charter, stakeholder register, or kickoff record |
| Planning | Target dates per phase (Req/Dev/QA-by), Plan bar in the phase timeline, a capacity snapshot — but no risk register, no scope-baseline tracking |
| Executing | Dev handoff status and task board exist elsewhere in the app; the dashboard itself shows execution *results*, not live work-in-progress |
| **Controlling** | **Comprehensive** — Burn Rate, SPI, First-Pass Rate, Req Stability, Top Blockers, the multi-cycle phase timeline (CR032), and the cross-milestone benchmark trend all live here |
| Closing | `milestones.completedAt` is auto-stamped (CR032 dependency), but there's no closure UI at all — no sign-off, no lessons-learned capture, no retrospective view |

The dashboard is, honestly, a strong **Controlling** dashboard mislabeled as a general PM dashboard. This CR closes the two highest-value gaps — **Closing** (cheapest: the data trigger already exists) and **Planning/Risk** (the gap most likely meant by "IPECC" specifically, since a risk register is the canonical PMP artifact this dashboard is missing). Initiating (charter/stakeholder register) and a live Executing/WIP board are explicitly deferred — see Non-Goals.

---

**Part 1 — Milestone Closing**

Today marking a milestone `completed` (`Milestones.tsx`'s edit dialog, `status` select) just stamps `completedAt` and stops — no retrospective, no formal record of what was learned or who signed off.

**Data model** — two new nullable columns on `milestonesTable`, no new table:
```ts
lessonsLearned: text("lessons_learned"),
closedBy: integer("closed_by"), // usersTable.id — who actually closed it, may differ from createdBy
```

**Backend:**
- `PATCH /milestones/:id` — accept `lessonsLearned` in the body (already a generic partial-update endpoint per the existing pattern in `milestones.ts`). When `status` transitions to `completed` and `closedBy` isn't already set, set it to the acting user's id (mirrors `assigneeAssignedAt`-style auto-stamping already used elsewhere, e.g. CR030's `devAssignedAt`).
- New `GET /dashboard/closed-milestones?projectId=` — returns completed milestones for the project with their final `phaseSummary` (reuse `computeRequirementTimelines`/`summarizeTimelines` from CR032, just scoped to `status: 'completed'` milestones) plus `lessonsLearned`/`closedBy` — a closure record, not a live view.

**Frontend:**
- `Milestones.tsx` — add a "Lessons Learned" textarea to the edit dialog (shown once `status === 'completed'`, matching how the Development card only shows post-approval elsewhere in the app), and surface existing lessons text on the milestone card/detail view.
- `PmDashboard.tsx` — new "Closed Milestones" section (collapsible, below the existing benchmark table): one row per completed milestone showing its final Burn Rate/First-Pass/Stability snapshot + lessons-learned excerpt. This is explicitly a *retrospective* view, distinct from the live Controlling metrics above it.

---

**Part 2 — Risk Register**

Note the existing "Top Blockers" card is an **Issue Log** (already-happened problems: rejected/stuck-in-review requirements) — a different, equally valid PMBOK artifact from a **Risk Register** (not-yet-happened potential problems). Adding risk doesn't duplicate Top Blockers; it fills a gap next to it.

**Scoped to project, not milestone.** A risk like "payment gateway sandbox unstable" or "vendor API deprecation" isn't really a single-sprint problem — it outlives whichever milestone happens to be active when it's raised. `milestoneId` is an optional tag (a risk *can* be pinned to the milestone it was raised against, for context — or left general), but the register itself lives at the project level, visible regardless of which milestone is currently selected in the dashboard's filter.

**Data model** — new table:
```ts
export const risksTable = pgTable("risks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  milestoneId: integer("milestone_id"), // optional — the milestone it was raised against, if any
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"), // schedule | scope | resource | technical | external | other
  probability: text("probability").notNull().default("medium"), // low | medium | high
  impact: text("impact").notNull().default("medium"), // low | medium | high
  status: text("status").notNull().default("open"), // open | mitigating | closed | realized
  mitigationPlan: text("mitigation_plan"),
  ownerId: integer("owner_id"), // usersTable.id — who's accountable for watching/mitigating it
  raisedBy: integer("raised_by"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
```
Risk score is derived at read time from a 3×3 probability×impact matrix (low/medium/high/critical), not stored — keeps `mitigationPlan` edits from silently going stale against a cached score.

**Backend** — new `artifacts/api-server/src/routes/risks.ts`:
- `GET /risks?projectId=` (required) `&milestoneId=` (optional filter) — list, scoped via `canAccessProject` same as every other project-scoped list endpoint
- `POST /risks`, `PATCH /risks/:id`, `DELETE /risks/:id` — Lead-tier+ gated (`getRoleTierRank >= 2`), matching the convention used for defect category and dev assignment elsewhere
- `logActivity` on create/status-change, consistent with every other entity in the app

**Frontend:**
- `PmDashboard.tsx` — new "Risks" card at the **project** level (sits alongside the portfolio/benchmark-trend sections, not nested inside the per-milestone "Where did the time go" block) — visible once a project is picked, independent of milestone selection. Open risks sorted by derived score (critical → low), each row shows its tagged milestone if any ("Sprint 13") or "General" if project-wide. Quick-add form (title, category, probability, impact, optional milestone tag — description/mitigation/owner editable after creation to keep the quick-add fast).
- No standalone `/risks` page in v1 — a dedicated page (mirroring `Defects.tsx`) is a natural CR034 if risk volume grows past what a dashboard card comfortably shows.

---

**Non-goals for this CR:**
- **Initiating** (project charter, stakeholder register) — a genuinely new concept with no existing data to build on, unlike Closing/Risk which extend structures already in place. Worth its own CR if the org wants formal charter sign-off tracked in-app rather than in a separate doc.
- **Executing** as a live work-in-progress board — the task board and dev-handoff status already exist elsewhere in the app (`Tasks.tsx`, the Development card); duplicating a live WIP view into the PM Dashboard is a bigger, separate design question (what's the delta over just linking to those existing pages?) rather than a natural extension of what's here.
- **Cost/budget tracking** (would enable a PMBOK CPI alongside the existing SPI) — no cost/budget field exists anywhere in the schema today; out of scope until there's a decision on whether QAPulse tracks cost at all.

**Scope:** `lib/db/src/schema/milestones.ts` (2 new columns), `lib/db/src/schema/risks.ts` (new table + export from `schema/index.ts`), `artifacts/api-server/src/routes/milestones.ts` (closing fields), `artifacts/api-server/src/routes/dashboard.ts` (closed-milestones endpoint), `artifacts/api-server/src/routes/risks.ts` (new), `artifacts/api-server/src/routes/index.ts` (register), `artifacts/qa-pulse/src/pages/Milestones.tsx` (lessons-learned field), `artifacts/qa-pulse/src/pages/PmDashboard.tsx` (Closed Milestones section, Risks card). Requires a DB migration (`risks` table + 2 `milestones` columns).

---

### CR034 — Resource Management: Project-Scoped Capacity & Milestone Focus
**Status:** ✅ Deployed (2026-07-13)

**Problem.** The PM Dashboard's existing Capacity table (CR014 Part 3) shows raw open-task counts per person, per project — but only to PM-tier roles (`PM_ROLES` in `dashboard.ts`), and with no sense of whether someone is actually *engaged on an active milestone right now* versus just carrying stray open tasks. QA/FA/Dev leads have no equivalent view at all today — none of `qa_lead`/`fa_lead`/`dev_lead` have access to any dashboard page (no `nav:pm-dashboard`, no `nav:qa-analytics`). Both gaps come from the same underlying question a resourcing conversation actually needs answered: **is this person currently focused on a milestone, sitting idle, or only has closed-milestone history?** — and it needs answering for all four departments (qa, fa, dev, pm), not just QA and PM.

**Access model — department-generic, using the existing role-tier system (`getRoleTierRank`), with one deliberate asymmetry for PM:**

QA / FA / Dev are functionally siloed — a lead only needs to see their own department's people:
- Tier 2 (`qa_lead`, `fa_lead`, `dev_lead`) — sees **their own department's** resources, scoped to projects they're a member of (same team/`project_members` scoping `scopeToUserProjects` already does for tier < 4).
- Tier ≥ 3 (`qa_manager`, `hod_qa`, `hod_fa`, `hod_dev`) — sees their own department's resources across **all** projects (mirrors the existing HOD branch in `scopeToUserProjects`, except that helper only unlocks "all projects" at tier ≥ 4 — this view intentionally lowers that to tier ≥ 3 so `qa_manager` gets it too, matching the explicit ask; QA is the only department with a tier-3 role today, so this is a no-op for fa/dev).

PM is cross-cutting by design — a PM's job is overseeing everyone on their project, not just other PMs:
- `pm_lead` (tier 2) — sees **all departments'** resources (QA + FA + Dev + PM), scoped to projects they're a member of.
- `hod_pm` (tier 4) — sees **all departments' resources across all projects** — the same reach as admin/cto, for this view specifically.

Tier 1 (`qa_member`, `fa_member`, `dev_member`, `pmo`) gets no access to this view in any department — team resourcing is a lead-and-above concern. `admin`/`cto` always see everything, every department, every project.

**"Active focus" signal — per department's real system of record, not `tasksTable` for everyone.** Dropped the task-based signal for QA entirely — QA work is already tracked at the execution-file level. Checked the other three departments against actual usage rather than assuming `tasksTable` fits all of them: `tasksTable.assigneeIds` is confirmed Dev/PM territory (both appear as task assignees throughout the demo data — `assigneeIds` is literally commented "Multi-select QA PICs" in the schema, a naming relic, but Dev/PM tasks do exist in practice), but **FA never appears as a task assignee anywhere** — an FA's actual unit of work is the requirement they authored, not a task row. So:
1. **QA** — QA PIC (`executionFilesTable.qaPic`) on a QA/UAT execution file tied to *M*. For QA, task = milestone, no separate signal needed.
2. **FA** — they authored (`requirementsTable.createdBy`) a requirement with `milestoneId = M` whose `reviewStatus` isn't yet `approved` (draft/in_review/rejected all still need FA attention — same "not yet closed out" shape as Dev/PM's non-`done` task check, just using the requirement lifecycle instead of the task lifecycle).
3. **Dev / PM** — open (non-`done`) task in `tasksTable` with `milestoneId = M`.

No one is double-counted; a person can be "focused" on more than one active milestone simultaneously (shown as a list, not a single value) — e.g. two open tasks for a Dev, two authored requirements still in review for an FA, or PIC on two execution files for a QA.

Known caveat carried into this CR, not fixed by it: `qaPic` is a free-text field (`text`, not a `usersTable.id` foreign key — see `lib/db/src/schema/execution.ts`), matched here against `usersTable.name`. A typo'd or since-renamed `qaPic` value won't resolve to a real user and that execution file's signal is silently dropped for that person. Migrating `qaPic` to a proper FK is a separate, larger CR (touches every execution-file write path) and explicitly out of scope here.

**Three-state result per person:**
- **Active** — has ≥1 active-milestone focus signal; shows which milestone(s).
- **No active milestone** — project member with zero active-milestone signal right now (the "idle/available" case the resourcing conversation cares about).
- **Closed history** — completed milestones where the same two signals (execution PIC or task assignment) existed at some point; shown as a collapsed list/count per person regardless of their current active/idle state, since someone can be idle now but still have a closed-milestone track record worth seeing.

**Backend:**
- New `GET /dashboard/resource-view?projectId=` (optional — omitted means "all accessible projects," subject to the scoping rules above) `&department=` (optional filter; ignored/forced server-side for siloed viewers, meaningful for PM/admin/cto viewers who can see multiple departments).
- Viewer's effective scope (department(s) + project list) computed server-side from their own role/tier per the access model above — never trust a client-supplied department/project outside what that role is actually allowed to see, same discipline as every other endpoint in this file.
- Returns one row per resource: `{ userId, name, role, department, projectId, projectName, activeMilestones: [{id, name, signal}], hasNoActiveMilestone, closedMilestones: [{id, name}] }`.

**Frontend:**
- New page `Resources.tsx` + new nav key `nav:resources`, added to `DEFAULT_PERMISSIONS` for `qa_lead`, `qa_manager`, `hod_qa`, `fa_lead`, `hod_fa`, `dev_lead`, `hod_dev`, `pm_lead`, `hod_pm`, `admin`, `cto` (`roles.ts`) — needed because `fa_lead`/`hod_fa`/`dev_lead`/`hod_dev` have no dashboard access of any kind today, so this can't be bolted onto `PmDashboard.tsx` or `QAAnalytics.tsx` without leaving those two departments out.
- Project filter (only shown/enabled if the viewer's scope includes more than one project); department filter only shown for viewers who can see more than one department (`pm_lead`, `hod_pm`, `admin`, `cto`).
- Three sections: Active (grouped by milestone, each person shown with a milestone chip), No Active Milestone, Closed History (collapsed by default) — same visual language as the Closed Milestones/Risk Register cards from CR033 for consistency.
- The existing `PmDashboard.tsx` `CapacityTable` stays as-is for now — this is a new, separate page rather than a replacement, so PM-tier users get both the existing burn-rate-oriented Capacity table *and* this new resourcing view; collapsing them into one is a possible follow-up once the new page proves out, not part of this CR.

**Non-goals:** no new "assignment" table — this stays purely a read/derived view over existing task and execution-file data, same as the PM Dashboard's other panels. No historical trend of resource utilization over time (that's a QA Analytics-style panel, not this CR). No capacity *planning* (future allocation, what-if scenarios) — this is a current-state snapshot only.

**Scope:** `artifacts/api-server/src/routes/roles.ts` (new `nav:resources` key + permission grants), `artifacts/api-server/src/routes/dashboard.ts` (new `resource-view` endpoint), `artifacts/qa-pulse/src/pages/Resources.tsx` (new page), `artifacts/qa-pulse/src/App.tsx`/`Layout.tsx` (new route + nav entry, gated on `nav:resources`). No schema changes, no DB migration.

---

### CR035 — Direct Project & Module Access Assignment (replaces team-based project access)
**Status:** ✅ Deployed (2026-07-13) — requires running `scripts/src/migrate-project-access.ts` once before/at deploy time (see Part 1)

**Problem.** Project access today comes from two places, neither of them intentional or auditable: (1) `project_teams` — assign a whole Team to a project via the Teams page, granting every team member access; (2) an undocumented "escape hatch" (`POST /projects/:id/members` in `teams.ts`) with **no frontend UI at all** — the only caller anywhere in the codebase is the demo seed script hitting the API directly. On top of both, `roles.ts`'s `bootstrap()` cross-joins every user × every project into `project_members` on every server restart (see CR034's `resource-view` fix, which had to stop trusting that table entirely because of this). Net effect: nobody can look at the app today and answer "who is actually supposed to have access to this project" — it's whatever the last bootstrap run plus whichever teams happen to be assigned produced. There's also no way to scope someone to just one module of a project — access is all-or-nothing at the project level.

**New model — manager-tier-and-above assigns downward, direct, project + optional module:**
- Project only, no module → sees the whole project, every module.
- Project + a specific module → sees only that module's data within that project.
- Team-based project access (`project_teams`) is removed as an access mechanism. Teams themselves, Team Hangouts, and the Team page are **untouched** — this only removes the team → project grant, not the Teams feature (confirmed with user 2026-07-13: teams stay for org grouping/social, they just stop being how project access works).

**Who can assign whom (confirmed with user 2026-07-13):** tier ≥ 3 (manager, HOD) within a department can assign project(+module) access to themselves or anyone in their own department at their tier or below — e.g. `qa_manager` (tier 3) can assign `qa_manager` (itself), `qa_lead`, and `qa_member`; `hod_qa` (tier 4) can assign `qa_manager`, `qa_lead`, and `qa_member` (and, by the same self-inclusive logic as `qa_manager`, itself too). `qa_lead` (tier 2) and `qa_member` (tier 1) cannot assign anyone — matches the existing "lead-and-above" pattern already used for who can *view* resourcing in CR034, one notch stricter (assigning access is manager-and-above, viewing it is lead-and-above). Generalizes department-agnostically: QA is the only department with a real tier-3 role today, so for FA/Dev/PM only the HOD (tier 4) can assign, same rule, just no manager tier to exercise it. Assignment stays siloed to the assigner's own department — this doesn't inherit PM's cross-cutting *viewing* reach from CR034; a `hod_pm` assigns PM people, not QA/FA/Dev people, unless told otherwise.

**Part 1 — Data model:**
- Remove the cross-join backfill in `roles.ts`'s `bootstrap()` — access should be explicit from here on, not auto-granted on every restart.
- Extend `project_members`: add `moduleId` (`integer`, references `execution_modules.id`, nullable — `null` = whole project), `assignedBy` (`usersTable.id`), `assignedAt` (`timestamp`). References the module by id, not a freetext name string — see below for why.
- New `project_modules` junction table (`projectId`, `moduleId`) — **many-to-many**, confirmed with user 2026-07-13: a module can belong to more than one project (e.g. "Authentication" is relevant to both the portal and the banking app), so it can't be "this module belongs to exactly one project." `execution_modules` itself stays the flat catalog of module *names* it already is (id, name) — `project_modules` is purely the association layer on top, and is what actually answers "which modules is this project allowed to be assigned by module." This replaces the freetext-matching approach originally sketched here — matching against whatever `.module` string values happen to already exist in a project's test cases/requirements is too fragile (a brand-new project with zero historical data would show no assignable modules at all, and there's no explicit "this module is valid for this project" declaration anywhere).
- **Migration/rollout — don't silently revoke existing access.** Before removing the team-based mechanism, run a one-time script (same style as the `scripts/` seed toolkit) that converts every *current* effective team-granted project access into a real `project_members` row (`moduleId: null`, i.e. whole-project) — so nobody legitimately using the app today loses access the moment this ships. Bootstrap-only "access" (no real team or direct grant behind it) is **not** migrated — that's exactly the noise this CR removes. The same script also backfills `project_modules` from whatever `.module` values already exist per-project in test cases/requirements/tasks/defects/execution files today, so existing module names don't just vanish from the picker on day one.

**Part 2 — Backend:**
- `middleware/access.ts` — `scopeToUserProjects` drops the team-based branch entirely; sources purely from `project_members`. HOD tier (≥4) still sees every project in their department (unchanged); admin/cto unrestricted (unchanged); tier 1–3 scoped to their own direct `project_members` rows only.
- New `canAccessModule(userId, role, projectId, moduleId)` in `access.ts` — HOD-tier+/admin/cto always pass; everyone else checks their `project_members` row for that project: `moduleId: null` passes for any module, a set `moduleId` only passes for that exact module.
- New `GET /projects/:id/modules` — returns the modules in `project_modules` for that project (what the assignment picker and any module-filter dropdown should source from), and `POST`/`DELETE /projects/:id/modules/:moduleId` to manage the association itself (tier ≥ 3/admin gated, same as project-member assignment — deciding "does this module apply to this project" is a manager-level call, separate from assigning a *person* to a project+module).
- `POST /projects/:id/members` (`teams.ts`) — currently admin-only; extend to accept optional `moduleId` in the body (must already be in that project's `project_modules`) and open it to tier ≥ 3 (manager/HOD) of the target user's own department, not just admin — gate checks the *assigner's* tier is ≥ 3 AND ≥ the *target's* tier, both in the same department (self-assignment allowed, upward assignment blocked). New `PATCH /projects/:id/members/:userId` to change an existing assignment's module scope, same gate.
- `POST /projects/:id/teams` / `DELETE .../teams/:teamId` stay in place (Teams page keeps working for org purposes) but stop being consulted by `scopeToUserProjects` — assigning a team to a project no longer grants project access on its own.
- Module-scope enforcement added wherever a project-scoped list currently returns every module's data unconditionally: Test Cases, Requirements, Execution Files/Traceability, Defects, Tasks, QA Analytics. This is the widest-reaching part of the change — every one of those endpoints needs a `canAccessModule` check added alongside its existing `canAccessProject` check.

**Part 3 — Frontend:**
- New "Project Access" panel (tier ≥ 3 manager/HOD/admin gated — matches the backend assigner check) — likely a tab on `Configuration.tsx` rather than a new page, since it's an admin-adjacent settings surface, not a daily-use view. Per project: list of assigned people with their scope (whole project, or a specific module badge), add-assignment form (user picker restricted to same-department + own-tier-or-below per the rule above, project picker, optional module dropdown sourced from `GET /projects/:id/modules` — that project's *actual* associated modules, not a global guess), edit/remove controls.
- Same panel (or an adjacent "Modules" sub-tab) needs a small UI to manage `project_modules` itself — which of the global `execution_modules` catalog entries apply to the selected project — since a module has to be associated with a project before it can show up in the assignment picker at all. A multi-select against the existing global module list is enough; no new module CRUD needed.
- `Teams.tsx` — remove the "Assign to project" button/section under a team's detail view (the `project_teams` UI). Team creation, team membership, and Team Hangouts stay exactly as they are.
- Pages with module filters (Test Cases, Requirements, etc.) should reflect a module-scoped viewer's restricted set in their own filter dropdowns too, not just enforce it silently server-side — a module-scoped QA member shouldn't see an "Authentication" filter option for a module they can't access.

**Non-goals:** not adding project-specific module *names* — `execution_modules` stays one global catalog of module names, `project_modules` only decides which of those names apply to which project(s) (a module can apply to more than one, per user 2026-07-13). Not touching Teams/Team Hangouts as a feature, only its role in project access. Not building module rename/delete tooling beyond the existing `POST /modules`.

**Scope:** `lib/db/src/schema/project-members.ts` (3 new columns: `moduleId`, `assignedBy`, `assignedAt`), `lib/db/src/schema/project-modules.ts` (new junction table), `artifacts/api-server/src/routes/roles.ts` (remove bootstrap cross-join), `artifacts/api-server/src/middleware/access.ts` (rewrite `scopeToUserProjects`, new `canAccessModule`), `artifacts/api-server/src/routes/teams.ts` (extend members endpoints, HOD-tier gate, new project-modules endpoints), `artifacts/api-server/src/routes/{test-cases,requirements,test-execution,traceability,defects,tasks,dashboard}.ts` (module-scope checks), `artifacts/qa-pulse/src/pages/Configuration.tsx` (new Project Access panel + module association UI), `artifacts/qa-pulse/src/pages/Teams.tsx` (remove project-assignment UI), a new one-off migration script under `scripts/`. Requires a DB migration (new `project_modules` table + 3 new `project_members` columns) and a one-time data migration script.
