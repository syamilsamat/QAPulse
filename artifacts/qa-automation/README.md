# @workspace/qa-automation

Playwright automation for the QAPulse test suites in `docs/test-plans/`.
Every automated test is declared through `qcase(caseId, title, fn)` so the
Excel Case ID (workbook → "Test Step" sheet → column A) appears in the test
title (`SMOKE-001 · Valid login`) **and** as a structured `test-case`
annotation — the link between the manual test register and the scripts.

| Spec | Workbook | Cases |
|---|---|---|
| `tests/smoke.spec.ts` | `docs/test-plans/qapulse-smoke-tests.xlsx` | SMOKE-001…023 |
| `tests/functional.spec.ts` | `docs/test-plans/qapulse-functional-tests.xlsx` | FUNC-001…049 |
| `tests/negative.spec.ts` | `docs/test-plans/qapulse-negative-tests.xlsx` | NEG-001…035 |
| `tests/e2e.spec.ts` | `docs/test-plans/qapulse-e2e-tests.xlsx` | E2E-001…012 |

Cases that are inherently manual (AI output quality, live Redmine, real
mailboxes, visual judgement) are declared with `qcase.manual(...)` so the run
report and the traceability matrix still account for them — they show as
skipped, never as silently missing.

## Running

The suites run against a **live QAPulse instance** (local or Replit) and
bootstrap their own isolated world on it — a `PW Automation` project, two
modules (`PW-Alpha`, `PW-Beta`), and one user per role (`pw.*@qapulse.test`).
Bootstrap is idempotent; reruns reuse everything.

```bash
# one-time
pnpm install
pnpm --filter @workspace/qa-automation exec playwright install chromium

# run (defaults to http://localhost:5000)
cd artifacts/qa-automation
QAPULSE_BASE_URL=https://your-repl.repl.co pnpm test          # everything
pnpm test:smoke                                               # one suite
pnpm report                                                   # open HTML report
```

Environment:

| Variable | Default | Purpose |
|---|---|---|
| `QAPULSE_BASE_URL` | `http://localhost:5000` | The URL you open QAPulse at (no `/api` suffix) |
| `QAPULSE_ADMIN_EMAIL` | `admin@qapulse.com` | Admin used by global-setup to bootstrap the world |
| `QAPULSE_ADMIN_PASSWORD` | `password123` | — |

Notes:
- Suites **mutate data** (requirements, defects, notifications) inside the
  `PW Automation` project — don't point them at production.
- Because tests are declared through the `qcase()` wrapper, reporters show
  `src/qtest.ts` as every test's location — filter by **file**
  (`playwright test tests/smoke.spec.ts`), **tag** (`--grep @smoke`, `@func`,
  `@neg`, `@e2e`) or **Case ID** (`--grep SMOKE-014`), not by line number.
- Runs are single-worker on purpose: notification assertions race under
  parallel workers against one shared backend.
- Some cases self-skip per environment (e.g. defect status changes need
  Redmine statuses synced; they also skip rather than write through to a live
  Redmine).
- `docs/test-plans/AUTOMATION_TRACEABILITY.md` maps every Case ID → spec
  file/line + automation status, and each workbook's Comments column carries
  the same link.

The `test-case` annotation is also the hook for CR009 (the future
Playwright→QAPulse reporter, which upserts execution results by case ID).
