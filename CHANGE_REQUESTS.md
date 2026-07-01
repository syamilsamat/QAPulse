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
| [CR014](#cr014--pm--functional-analyst-onboarding) | PM & Functional Analyst Onboarding | ⏳ Pending | — |

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

Replace email/password auth with Microsoft Entra ID (Azure AD) SSO, single-tenant, org accounts only. Password login removed entirely; admins pre-create user accounts (name, email, role — no password). Users signing in with a Microsoft email not already in QAPulse get a "contact admin" error (no auto-provisioning).

- Make `password` nullable on `usersTable`
- New `POST /auth/microsoft` — validates Azure AD ID token via `jwks-rsa` + `jsonwebtoken`, looks up user by email, issues QA Pulse JWT
- Remove `POST /auth/login`; keep `/auth/me`, `/auth/logout`, `/auth/change-password`
- Frontend: MSAL redirect flow (`@azure/msal-browser`, `@azure/msal-react`) replaces the Login page's email/password form
- Remove password fields from Settings' user creation form

Full plan: `docs/change-requests/microsoft-login-sso.md`

---

### CR014 — PM & Functional Analyst Onboarding
**Status:** ⏳ Pending

Expands QAPulse beyond QA into a multi-department platform, starting with Project Manager and Functional Analyst roles (role name `functional_analyst` — this org has already merged BA and SA into a single Functional Analyst title, so no separate SA role is needed later). Requires project-level access control as a prerequisite — today every authenticated user can read/write every project's data with no membership scoping. Designed to cover both a single Change Request and a full new-project rollout via one shared primitive (Milestones), rather than separate machinery for each.

**Part 1 — Project-level access control (prerequisite)**
- New `project_members` table (projectId + userId, no per-project sub-roles yet)
- New `requireAuth` / `resolveProjectAccess` middleware + `canAccessProject` / `scopeToUserProjects` helpers
- Retrofit `requirements`, `test-cases`, `tasks`, `traceability`, `projects`, `test-execution` routes to scope by membership; 404 on denied access
- One-time backfill grandfathering existing users into existing projects

**Part 2 — Milestones (shared CR / new-project primitive)**
- New `milestones` table (projectId, name, type: cr/phase/sprint/release, status, targetDate) — a CR is a project with one milestone; a new project is a sequence of milestones
- Nullable `milestoneId` on `requirementsTable` and `tasksTable`
- New `routes/milestones.ts` (create/list/status update, project-scoped)

**Part 3 — Project Manager onboarding**
- New `project_manager` role + `nav:pm-dashboard`
- New `GET /dashboard/pm-summary` aggregating tasks/requirements/execution data per accessible project, grouped per milestone
- New `PmDashboard.tsx` page

**Part 4 — Functional Analyst onboarding**
- New `functional_analyst` role
- `reviewedBy` / `reviewedAt` columns on `requirementsTable`
- `PATCH /requirements/:id/review` — upstream requirement baseline approval (comment, activity log, assignee notification)
- `PATCH /milestones/:id/review` — downstream UAT sign-off once a milestone's requirements pass QA, closing the loop back to the FA (notifies the milestone's creator/PM)
- Approve/reject UI + review history panel on `Requirements.tsx` and the PM Dashboard's milestone cards

Full plan: `docs/change-requests/pm-ba-onboarding.md`
