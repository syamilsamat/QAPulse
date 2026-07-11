# QAPulse E2E (Playwright)

Runs against a real, already-running QAPulse instance — local `pnpm dev`
or a deployed Replit dev workspace — not a mocked server. These tests
exercise real Redmine/DB-backed behavior that a mock can't reproduce.

## Setup

```bash
cd artifacts/qa-pulse
pnpm add -D @playwright/test dotenv   # if not already installed
npx playwright install chromium

cp .env.example .env.local
# edit .env.local: PLAYWRIGHT_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD
# use a dedicated test/demo account — never your personal admin login
```

## Run

```bash
pnpm test:e2e          # headless, full suite
pnpm test:e2e:ui       # interactive UI mode — best for writing/debugging
pnpm test:e2e:report   # open the last HTML report
```

## What's covered

Each spec file maps to a recent feature/fix — see the file name and the
comment at the top of each spec for what it verifies and where in the app.
Specs assume the `Mobile Banking App — DEMO` project's seed data exists
(see `scripts/src/seed-demo-data.ts`); if you're pointing at a fresh or
different environment, some assertions may need adjusting to match
whatever data is actually there.

## Notes

- `auth.setup.ts` logs in once and saves a session to `e2e/.auth/` — every
  spec reuses it instead of re-authenticating per test.
- Some checklist items (Redmine attachment sync, non-admin contact-sync
  pagination/fallback) need specific external state — a Redmine ticket
  with real attachments, a non-admin account against a large org — that's
  impractical to fake reliably in an E2E run. Those are called out as
  manual-verification items in the relevant spec's header comment rather
  than given a flaky automated test.
