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
| [CR011](#cr011--audit-trail-enhancement) | Audit Trail Enhancement | 📋 Planned | 2026-06-29 |
| [CR012](#cr012--scalability--performance-hardening) | Scalability & Performance Hardening | 📋 Planned | 2026-06-30 |
| [CR013](#cr013--microsoft-login-sso) | Microsoft Login SSO | ⏳ Pending | — |
| [CR014](#cr014--org-wide-role-hierarchy--project-level-access-control) | Org-wide Role Hierarchy & Project-Level Access Control | ⏳ Pending | — |
| [CR015](#cr015--per-requirement-ai-test-case-generation) | Per-Requirement AI Test Case Generation | 📋 Planned | 2026-07-02 |

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
**Status:** 📋 Planned (2026-06-29)

Enhances the History Trail for real compliance/audit use:

**P0 — Core Audit Integrity**
- Before/after change diffs (`oldValue`/`newValue` columns on `activity` table)
- Actor identity (join users on every activity row)

**P1 — Usability**
- Date range filter with URL-persisted params
- Export Audit Log to Excel (Date, Actor, Entity, Action, Old, New)

**P2 — Coverage Gaps**
- Execution result change tracking (`execution_result_changed` activity type)
- Verdict send audit entries

**P3 — Security**
- Login/logout event logging with IP, admin-only System filter

**P4 — Send Verdict Excel Integration**
- Actor names + diffs in Review Log sheet
- CAPA status auto-filled from verdict send log

DB change: `ALTER TABLE activity ADD COLUMN old_value text; ADD COLUMN new_value text;`

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
**Status:** ⏳ Pending
**Source:** unmerged branch `claude/microsoft-login-integration-6cm4go` (originally scoped as "PM/BA onboarding"; BA role renamed to Functional Analyst since this org merged Business Analyst and System Analyst into one title)

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
- `reviewedBy` / `reviewedAt` columns on `requirementsTable`
- `PATCH /requirements/:id/review` — upstream requirement baseline approval
- `PATCH /milestones/:id/review` — downstream UAT sign-off, closing the loop back to the FA track (notifies the milestone's creator/PM)
- `bi`/`bi_lead` role names reserved (so `hod_fa_bi` visibility is forward-compatible) but BI itself is **not** onboarded in this CR

**Part 5 — QA tier expansion (`qa_manager`, `hod_qa` — new)**
- `qa_member`/`qa_lead` already exist; adds the two tiers above plus tiered visibility itself — **note:** `qa_lead` gains broader visibility than before (every `qa_member`'s projects, not just its own), a real behavior change for existing accounts

**Part 6 — CTO (`cto`)**
- Broadest nav (like `admin`) but no role/user-management permissions — "see everything, configure nothing"
- Unrestricted project visibility (same `null` sentinel as `admin`)

Full plan: `docs/change-requests/pm-ba-onboarding.md` (on the `claude/microsoft-login-integration-6cm4go` branch, not yet on `main`)

---

### CR015 — Per-Requirement AI Test Case Generation
**Status:** 📋 Planned (2026-07-02)

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

Full implementation plan drafted 2026-07-02 (not yet executed).

---

### CR016 — Traceability Matrix Requirement Hierarchy
**Status:** ⏳ Pending deploy (2026-07-03)

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
**Status:** 📋 Planned (2026-07-03)

Extends the traceability matrix (CR005/CR016) once milestones/sprints exist as a first-class entity. Drafted ahead of the milestone feature itself; blocked on that feature's data model landing first.

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
**Status:** ⏳ Pending deploy (2026-07-03)

The "In N runs" badge on the Test Case Library (table and mobile card views) is now clickable. It opens a dialog listing every execution file that contains the test case — Redmine ticket ID, file title, the TC's case ID in that file, its result, executed date, and defect number. Clicking a row navigates to that execution file's detail page.

Supports impact analysis before editing/deleting a library TC, avoiding duplicate compiles (CR003), and jumping straight to a failing run.

**Scope:** `artifacts/api-server/src/routes/test-cases.ts` (new `GET /test-cases/:id/executions` — on-demand, one entry per execution file, newest row wins), `artifacts/qa-pulse/src/pages/TestCases.tsx` (`ExecutionRunsDialog` + clickable badges). No DB changes.
