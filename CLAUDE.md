# Context
QM Pulse is a QA management platform for software testing teams. It centralises
test case authoring, task tracking, execution progress, defect creation and PMO
reporting, with Redmine integration throughout.

# Project Detail
- Project Name: QM Pulse
- Project Code: qmpulse
- Repository Root: `C:\rndsoftware\QAPulse`
- Current Version: v1.0.0
  <!-- TODO(human): confirm. No semver exists in the repo (package.json is 0.0.0);
       change history is tracked as CR numbers in CHANGE_REQUESTS.md, currently up
       to CR049. co2 sequences work by semver, so a version boundary must be
       agreed before any conductor-feature-* run. -->
- Environments: local only. There is no staging or production environment under
  our control — production is a Replit deployment (see `.replit`).

# Goals
<!-- TODO(human): co2 reads this for intent. The draft below is inferred from the
     code and docs, NOT from a stated roadmap — correct it before relying on it. -->
- Replace scattered spreadsheets with a single QA system of record.
- Keep Redmine as the defect system of record; QM Pulse writes into it.
- Produce PMO-ready reporting without manual collation.

# Source of Truth
`PROJECT.md` is **stale and must not be trusted**. Every claim in this file was
re-verified against code or the live database on 2026-10-01; four of seven checked
claims in `PROJECT.md` were wrong:

| Claim | `PROJECT.md` | Verified reality |
|---|---|---|
| Roles | 4, incl. `pmo` | **15**; `pmo` exists nowhere |
| Frontend routes | 19 | **36** (`App.tsx`) |
| JWT expiry | 8h | **1h** (`auth.ts:18`) |
| API route modules | 17 | **53** files |
| React version | 18 | **19** (pnpm catalog) |
| DB tables | 55 | 55 ✅ |
| Rate limits | 20/15min, 300/min | ✅ |
| `lib/*` packages | 7 listed | ✅ |

When a fact is needed, read the code: `App.tsx` for routes, `lib/db/src/schema/`
for tables, `lib/api-spec/openapi.yaml` for the API contract, `pnpm-workspace.yaml`
for dependency versions.

# Terminology
- Requirement: a unit of scope traced to Redmine user stories.
- Milestone: a release or iteration grouping requirements and test cases.
- QA Pipeline: the staged flow from requirement to execution sign-off.
- Verdict: the pass/fail outcome reported for a ticket.
- CR: Change Request, the repo's unit of change history (see CHANGE_REQUESTS.md).

# Supporting 3rd Party Applications
## PostgreSQL
- Role: primary datastore. **55 tables**, all defined in Drizzle under
  `lib/db/src/schema/` — verified: the schema and the live database match exactly,
  with no unmodelled tables and no orphan definitions.
- Local: Docker container `qmpulse-db`, host port 5433, database `qmpulse`.

## Redmine
- Role: defect and user-story system of record. Two separate surfaces:
  - REST API at `https://redmine.bestinet.my` (`REDMINE_URL`), per-user API keys.
  - Direct MySQL read at `10.10.4.130:3306`, database `redmine`, user `bestqa`
    (`REDMINE_DB_*`). Reachable only on the corporate network.

## Office 365 SMTP
- Role: PMO report delivery. `smtp.office365.com:587`, STARTTLS.

## OpenAI-compatible AI endpoint
- Role: AI-assisted test case generation.
- `AI_INTEGRATIONS_OPENAI_BASE_URL` = `https://api.openai.com/v1`.
- Note: `@google/genai` is also a dependency and the README cites Google GenAI —
  both paths exist in the tree.

# Custom Applications
## qm-pulse
- Type: React SPA (frontend).
- Source: `artifacts/qm-pulse`   ·   Context: `qm-pulse/context`
- Stack: React 19 · Vite · TypeScript · Wouter · TanStack Query · Tailwind CSS ·
  Radix UI / shadcn-ui · React Hook Form · Zod · Recharts · Framer Motion.
- Local dev: `PORT=5173 pnpm --filter @workspace/qm-pulse run dev`

## api-server
- Type: Express REST API (backend).
- Source: `artifacts/api-server`   ·   Context: `api-server/context`
- Stack: Express · Drizzle ORM · PostgreSQL · JWT (bcrypt) · Pino · Helmet ·
  rate limiting · CORS.
- API contract: `lib/api-spec/openapi.yaml` is authoritative; Orval generates the
  React client from it. Prefer it over a prose specification. Note it does NOT
  cover every endpoint — `/redmine/*` is absent, so those calls use raw `fetch()`.
- Route modules: **53 files** in `artifacts/api-server/src/routes/`. `PROJECT.md`
  lists 17 and is a stale subset; enumerate the directory instead.
- Local dev: `pnpm --filter @workspace/api-server run build` then `run start` (8080).

# Domains
<!-- Derived from artifacts/qm-pulse/src/App.tsx, the source of truth.
     PROJECT.md's route table is stale and must not be used. -->

# System Domain
## Authentication
- JWT bearer, **1h expiry** (`auth.ts:18`, `JWT_EXPIRES_IN = "1h"`; confirmed by
  decoding a live token). `PROJECT.md` claims 8h and is wrong.
- Token in localStorage or sessionStorage per "Remember Me"; keys
  `qa_pulse_token` / `qa_pulse_user` / `qa_pulse_refresh_token`.
- Refresh-and-retry on 401 happens only in the generated client
  (`lib/api-client-react/src/custom-fetch.ts`); raw `fetch()` callers bypass it.
- Rate limits (`app.ts:27`): 20 login attempts / 15 min, 300 API requests / min.

## Role
- Route: `/roles`.
- **15 roles**, verified against both `App.tsx` and the `users` table — they agree:
  `admin`, `cto`, `hod_qa`, `hod_pm`, `hod_fa`, `hod_dev`, `qa_manager`,
  `qa_lead`, `qa_member`, `fa_lead`, `fa_member`, `dev_lead`, `dev_member`,
  `pm_lead`, `pm_member`.
- Do NOT use `PROJECT.md`'s role table: it lists only 4 and includes `pmo`, which
  exists in neither the code nor the database.
- Access control is per-route via `ProtectedRoute` (`permKey` + a `roles` array),
  not role-hierarchy based.

## User and Team
- Routes: `/team`, `/teams`.

## Setting
- Route: `/settings`. Holds each user's personal Redmine API key.

## Notification
- Route: `/inbox`. Plus calendar reminders scheduled in api-server.

## Audit Trail
- Route: `/audit-log`.

## History Trail
- Route: `/history-trail`.

## Admin Search
- Route: `/admin/search`. Admin only.

## Platform Issues
- Route: `/platform-issues`.

## Configuration
- Route: `/configurations`. Project and module configuration.

# Business Domain
## Dashboard
- Routes: `/dashboard`, `/my-work`, `/pm-dashboard`.

## Requirements
- Routes: `/requirements`, `/requirements/:id`.

## Milestones
- Route: `/milestones`.

## QA Pipeline
- Routes: `/qa-pipeline`, `/qa-pipeline/:milestoneId`.

## Test Cases
- Route: `/test-cases`.

## Test Execution
- Routes: `/test-cases/execution`, `/test-cases/execution/:id`,
  `/test-cases/execution-details`, `/test-cases/execution-details/:ticketId`.

## Tasks
- Route: `/tasks`.

## Defects
- Route: `/defects`. Creates Redmine child issues when a step is marked Failed.

## Traceability
- Route: `/traceability`.

## QA Analytics
- Route: `/qa-analytics`.

## Risk Register
- Route: `/risk-register`.

## UAT Sign-off
- Route: `/uat-signoffs`.

## Resources
- Route: `/resources`.

## Reporting
- Routes: `/report`, `/verdict-report`. PMO report emails HTML + PDF via SMTP.

## AI Features
- Route: `/ai-features`.

## Team Hangouts
- Route: `/team-hangouts`.

# Folder structure
- This repository is a **pnpm workspace monorepo**, so it deliberately departs
  from co2's usual "one root folder holds both context and source" convention.
  Context and source are SPLIT. This is verified to work: every `<app_folder>`
  reference in the conductor skills resolves under `<app_folder>/context/`, and
  none requires source code to sit beside it.
  - `<application>/context`: root-level, co2 artifacts ONLY. The folder name is
    what `/conductor-* <application>` matches against.
    - model: the domain data model. Output by `modelgen-*`.
    - mockup: HTML mockups for UI design. Output by `mockgen-tailwind`.
    - specification: the detailed specification. Output by `specgen-*`.
    - test: the test specification. Output by `testgen-*`.
    - develop: planning and tracking for the development phase. Output by
      `conductor-feature-*`.
    - bug: planning and tracking for the bug fixing phase. Output by
      `conductor-defect`.
    - PRD.md: user stories, NFRs and constraints by domain. Input by user.
    - BUG.md: bugs reported by user. Input by user.
  - `artifacts/<application>`: the actual source code. Never put co2 artifacts here.
  - `artifacts/mockup-sandbox`: a third artifact, a design playground. Not a co2
    application; ignore it.
  - `lib/*`: shared packages (db, api-spec, api-zod, api-client-react,
    integrations). Outside co2's model — a feature often touches these, so
    sequence by hand: `lib/db` → `lib/api-spec` → api-server → qm-pulse.
  - `scripts`: seed and preprod utilities.
  - `e2e`: the Playwright suite (config at the repo root).

# Path and Credentials
**Refer to [SECRET.md](SECRET.md) for credentials.** SECRET.md is gitignored and
holds only the secrets that Replit injects at runtime and that exist in NO file in
this repo: `REDMINE_API_KEY`, `REDMINE_DB_PASSWORD`,
`AI_INTEGRATIONS_OPENAI_API_KEY` (or `OPENROUTER_API_KEY`), and `SMTP_USER` /
`SMTP_PASS`. Every other host, port, user and path is non-secret and is recorded
above or in `.env`.

- Node: 24   ·   Package manager: pnpm 12.3.4   ·   Shell: **Git Bash**
- Local env file: `.env` at the repo root (gitignored).
- Postgres CLI: `docker exec qmpulse-db psql -U postgres -d qmpulse -c "<sql>"`

# Rules
## Shell
- Use **Git Bash**, not PowerShell or cmd. PowerShell's execution policy blocks
  pnpm's `.ps1` shim, and `source` does not exist there.
- The app has **no dotenv loader**. Run `set -a; source .env; set +a` in EVERY new
  shell before any command that touches the database or API.
- `artifacts/api-server`'s `dev` script is Bash-only and fails on Windows; run
  `build` then `start` separately.
- `lib/db/drizzle.config.ts` breaks on Windows (backslash paths defeat the glob).
  Pass `--schema ./src/schema/index.ts --url "$DATABASE_URL"` on the CLI instead.

## Servers
- Bring up: `docker start qmpulse-db`, then api-server (8080), then
  `PORT=5173 ... run dev` for the frontend. Both default to the same port, so the
  `PORT=5173` prefix is required.
- `/api/health` returns **401**, not 200 — every route is authenticated. Do not
  use it as a liveness probe.
- There is no static-build serving mode; `vite preview` has no `/api` proxy.
  Always use the dev server locally.

## Playwright
- Config: `playwright.config.ts` at the repo root. Both servers must already be
  running; the config has no `webServer` block on purpose.
- Bug repro specs go in `<application>/context/bug/<module-slug>/<BUG-XXX>/` and
  are picked up by the `bugs` project, which supplies an authenticated admin
  session automatically. Do not write a login flow.
- Save ALL screenshots to the bug folder via an explicit `path:`, never
  Playwright's default location.
- Run the regression suite with `pnpm run test:e2e` (it excludes bug specs, which
  are red by design until their fix lands). `pnpm run test:e2e:bugs` runs those.

## Replit
- **Pause Replit Agent before any conductor run.** It has 181 commits in this repo
  and will edit files underneath a running conductor.
