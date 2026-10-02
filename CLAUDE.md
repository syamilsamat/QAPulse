# Context
QM Pulse is a QA management platform for software testing teams. It centralises
test case authoring, task tracking, execution progress, defect creation and PMO
reporting, with Redmine integration throughout.

# Project Detail
- Project Name: QM Pulse
- Project Code: qmpulse
- Repository Root: `C:\rndsoftware\QAPulse`
- Current Version: v1.0.0
  - Agreed 2026-10-02: the entire system as deployed today is v1.0.0, and
    `qm-pulse/context/PRD.md` tags every existing item `[v1.0.0]`. The first new
    feature becomes v1.1.0. There is no CR-to-semver mapping; CR numbers in
    CHANGE_REQUESTS.md remain history only (package.json stays 0.0.0).
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

## SMTP (PMO report delivery)
- `SMTP_HOST` has **two conflicting defaults**: `smtp.office365.com` in
  `lib/email.ts` and `smtp.gmail.com` in `routes/verdict-report.ts`. Whichever
  sends depends on the code path, so set `SMTP_HOST` explicitly rather than relying
  on a default. Port 587, STARTTLS.

## Google Gemini (with OpenRouter fallback)
- Role: AI-assisted test case generation, risk assessment and Excel/CAPA drafting.
- **Primary: Google Gemini** via `@google/genai`, model `gemini-2.5-flash`
  (`routes/ai.ts:34`, `routes/excel-builder.ts:64`). **Fallback: OpenRouter**
  (`OPENROUTER_API_KEY`, `https://openrouter.ai/api/v1/chat/completions`) — tried
  only when Gemini throws. `milestone_risk_assessments.model` records which
  pipeline produced a row (`gemini` or `openrouter`).
- `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` are read ONLY
  by the unused audio and image clients in `lib/integrations*`. **No api-server route
  calls the OpenAI endpoint** — do not treat it as the AI provider.

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
- **15 roles currently exist**, verified against both `App.tsx` and the `users` table
  — they agree. These are **defaults, not a fixed enum**: `roles` is a table, and
  `routes/roles.ts` exposes create, rename and delete, so an admin can add roles the
  hardcoded `permKey` checks will not know about. Enumerate the table, not this list,
  when the count matters:
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
- Routes: `/report`, `/verdict-report`. The PMO report email is **HTML with an inline
  PNG** of the report (embedded by `cid`, `verdict-report.ts:1502`) plus an **optional
  `.xlsx`** of open defects. **No PDF is generated anywhere** — the string "pdf" does
  not appear in `verdict-report.ts`.

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

# Pending Decisions (from Step 5, 2026-10-02)
Claude: raise the items below with the user before running util-ustagger,
util-updprd or any conductor-* skill. Remove an item once it is resolved. Full
detail, with IDs D1-D10, B1-B18 and C1-C60, is in
[STEP5-FINDINGS.md](STEP5-FINDINGS.md).

1. **Folder prefix blocks util-ustagger (D10) — user chose to DELAY this, do not
   act on it unprompted.** Its folder resolution (and modelgen-relational's) only
   matches root folders with a numeric prefix, e.g. `1_hub_middleware`; `qm-pulse`
   and `api-server` have none, so the tagger stops with no match. Confirmed in
   Step 5. When it is taken up, the two options are: rename to `1_qm-pulse` /
   `2_api-server` and update the two `Context:` paths above (these folders hold
   only co2 artifacts; nothing imports them), or treat the unprefixed folder as a
   match for this run only (util-usanalyzer and the conductors already allow
   that). The Step 6 conductor run will hit the same problem.
2. **`qm-pulse/context/PRD.md` is still UNTAGGED** (note: `CHANGELOG.md` now exists, hand-written — ustagger will append to it rather than create it), blocked by item 1. Once that is
   settled, run `util-ustagger qm-pulse`. It must tag **both** `[v1.0.0]` (81
   blocks, the existing system) and `[v1.1.0]` (2 blocks, the Configuration change
   recorded under D3 below). It will append a row to the existing root `CHANGELOG.md`.

3. **`CHANGELOG.md` was hand-written, not generated** (2026-10-02). Its `## v1.0.0`
   row names `conductor-feature-develop` as the skill even though that skill has
   never run here, because its Redo/Redevelop Guard looks for exactly that entry to
   decide v1.0.0 is already built. The file explains itself in full — read the note
   above its `---` before adding to it. Two rules it imposes: do NOT add a
   `## v1.1.0` section until the 12 defects in `api-server/context/BUG.md` are
   resolved (that would make v1.1.0 the highest version and conductor-defect would
   then refuse the `[v1.0.0]` bug run), and `api-server` needs its own baseline row
   when it gets a PRD, since the guard matches per application.

## Resolved 2026-10-02
- **D1 — version.** v1.0.0 for the system as deployed; see `Current Version` above.
- **D2 — UI/server disagreement.** The PRD states the **intended** rule. Where the
  server actually behaves differently, that is recorded in STEP5-FINDINGS.md, and
  the security-relevant cases are filed as bugs (D5).
- **D3 — Configuration / Team Members.** Applied by hand to
  `qm-pulse/context/PRD.md` as `[v1.1.0]`, rather than waiting for util-updprd,
  because item 1 blocks the tagging it was meant to follow: the tab shows a
  read-only member list, `qa_lead` views only, and the create-user form is limited
  to tier 3 (Manager) and above plus `admin`. Needs tagging per item 2.
- **D4 — CR058-CR077 are missing from CHANGE_REQUESTS.md** and will not be
  backfilled. 17 of them are cited in shipped code comments, which are now the only
  record of them; the register is incomplete history by design. The PRD describes
  current behaviour from the code, so nothing depends on the gap.
- **D5 — defects.** The 12 security and data-integrity defects are filed in
  `api-server/context/BUG.md` (all are missing server-side authorization in
  `artifacts/api-server/src/routes/`, so none belong in the qm-pulse file). The
  other ~48 findings stay in STEP5-FINDINGS.md only.
- **D6 — CR links stay out of PRD References.** CHANGE_REQUESTS.md is
  implementation history that later CRs revise, so a generator following a CR link
  could reintroduce something deleted — the `pmo` role is the worked example.
- **D7 / D8 — module structure unchanged.** Dashboard keeps all three pages (My
  Work Today, Dashboard, PM Dashboard) and the team calendar stays under it, with
  reminders under Notification. 28 modules, matching the BUG.md skeletons and the
  `# Domains` list above.
- **D9 — this file's four wrong claims** (AI provider, PMO attachments, role
  extensibility, SMTP default) are corrected above.

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
