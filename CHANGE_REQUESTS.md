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
| [CR013](#cr013--per-requirement-ai-test-case-generation) | Per-Requirement AI Test Case Generation | 📋 Planned | 2026-07-02 |

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

### CR013 — Per-Requirement AI Test Case Generation
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
