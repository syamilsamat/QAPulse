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
| [CR017](#cr017--milestonesprint-aware-traceability-matrix) | Milestone/Sprint-Aware Traceability Matrix | 🟡 Partially Deployed | 2026-07-04 |
| [CR018](#cr018--tc-library-execution-file-drill-down) | TC Library: Execution File Drill-Down | ✅ Deployed | 2026-07-03 |
| [CR019](#cr019--defect-tracking-write-through-to-redmine--defects-page) | Defect Tracking: Write-Through to Redmine + Defects Page | ✅ Deployed | 2026-07-04 |
| [CR020](#cr020--production-defect-workflow-escape-analysis) | Production Defect Workflow (Escape Analysis) | ✅ Deployed | 2026-07-04 |
| [CR021](#cr021--native-defect-tracking-cutover-retire-redmine-for-defects) | Native Defect Tracking Cutover (Retire Redmine for Defects) | 📋 Planned | 2026-07-03 |
| [CR022](#cr022--fa-requirement-workflow-enhancements) | FA Requirement Workflow Enhancements | ✅ Deployed | 2026-07-04 |
| [CR023](#cr023--requirement-detail--review-workflow-gaps) | Requirement Detail & Review Workflow Gaps | ✅ Deployed | 2026-07-05 |

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

**Part 3 — PM dashboard** *(2026-07-05)*: `GET /dashboard/pm-summary` (role-gated to `pmo`/`pm_lead`/`hod_pm`/`admin`/`cto` — **`pmo` is excluded from the dashboard route itself**, see note below) + `PmDashboard.tsx` at `/pm-dashboard`, nav-gated behind new `nav:pm-dashboard` key. Per accessible project: milestone tiles (requirement approval count, QA/UAT execution readiness, a computed schedule-risk badge — on-track/at-risk/overdue/no-date, using the 5-day/80%-readiness threshold agreed earlier) and a project-level resource capacity table (open task count, estimated hours, overdue count per assignee, from `tasks`). Portfolio summary row: total projects, active/at-risk/overdue milestone counts.
- **Scope decision:** the QA/UAT execution rollup counts whatever's currently saved on `execution_test_cases` rows scoped to the milestone's files — it does not resolve "latest result per TC identity across multiple files" the way the traceability matrix does. Good enough for a summary readiness signal; use the traceability matrix's own milestone filter for the rigorous per-TC view.
- **`pmo` note:** `ProtectedRoute` and `Layout.tsx` both hard-code `pmo` to only ever see the PMO Report page regardless of route/nav permissions (predates CR014). Not unwound here — flagged as a separate, larger decision if `pmo` should join the PM Dashboard audience instead of (or alongside) `pm_lead`/`hod_pm`.
- **Found and fixed in passing:** `GET /milestones?projectId=` (the list endpoint the Milestones page grid actually calls) never computed `requirementCount`/`approvedCount` at all — only the singular `GET /milestones/:id` detail endpoint did. Every milestone card showed 0 regardless of actual linked requirements. Fixed with one batched query (not N+1) shared in spirit with the new dashboard's rollup.
- **Found and fixed in passing:** the nav-permission bootstrap only backfills new keys into `admin`'s permissions on restart, not other roles — meaning `hod_pm` (seeded before today) would never have picked up `nav:pm-dashboard` without a manual Roles-page edit. Extended the backfill to `admin`+`cto` (both meant to hold every key) plus a narrow single-key backfill for `hod_pm`/`pm_lead`, without blanket-reapplying full permission lists (which would silently undo any admin's deliberate customization via `PUT /roles/:id/permissions` on every restart).
- **Milestone filter on Requirements + deep-link** *(2026-07-05)*: the Requirements page already showed Milestone as a mandatory field and a list column but had no way to filter by it (unlike Project/Module/Priority, which all did). Added a Milestone filter select, scoped to the currently-selected Project filter (same dependency the create/edit form's own Milestone picker already has, since `GET /milestones` requires a `projectId`). Clicking a milestone tile on the PM Dashboard now deep-links to `/requirements?projectId=&milestoneId=`, pre-filtering both — mirrors CR018's `?tc=` deep-link convention.

**Still outstanding:**
- **Part 5 — `qa_manager` role** was never actually created — only `hod_qa` exists above `qa_lead`, the mirror image of the `pm_lead` gap fixed today (QA has Lead+HOD but no Manager tier; PM now has all three).
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
**Status:** 🟡 Partially Deployed (2026-07-04, PR #293 — core change shipped; grouping/export items open)

**Deployed:** milestone filter dropdown on the matrix (shown when a project is selected) + **sprint-scoped result resolution** — the core change (target #1): with a `milestoneId` filter active, requirements are scoped by `r.milestone_id` and the latest-result join only considers execution files belonging to that milestone, with a "Milestone scope active" banner explaining that unrun TCs show Not Run instead of stale green.

**Not implemented (from the plan below):** milestone grouping + per-milestone readiness header rows (target #2), grayed out-of-sprint parent context rows (target #3 — current behavior prunes by requirement `milestone_id` filter instead), Excel Milestone column (target #4). The `requirements.release` free-text column has not been migrated/deprecated.

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
- **Still open (cosmetic, not scheduled):** priority still renders as pill badges, not the left-stripe convention; filters still dropdowns, not chips.

**Part 4 — Requirement-change re-review flow** (`225b678`)
- New columns: `requirementRevisedAt` on `test_cases` and `tasks`, `reviewAcknowledgedAt` on `execution_test_cases`, `milestones.createdBy` (needed for Part 1's PM notification). **Requires `db push`** — not bootstrapped like CR014's tables.
- Editing an approved requirement's description now flags every linked test case and task as needing re-review; an "Alert: Revised" badge + acknowledge/"Revised" action surfaces across all three consumers — Tasks page, TC Library, and every execution view (Tree/Spreadsheet/Focus) in `TestCasesExecutionProgressPage.tsx`.

Full plan: `docs/change-requests/requirement-detail-gaps.md`
