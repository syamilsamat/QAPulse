# QAPulse — Project Overview

QAPulse is a QA management platform built for software testing teams. It centralises test case authoring, task tracking, execution progress, defect creation, and PMO reporting — with deep Redmine integration throughout.

---

## Architecture

```
QAPulse/                        ← pnpm workspace root
├── artifacts/
│   ├── qa-pulse/               ← React frontend (Vite + TypeScript)
│   ├── api-server/             ← Express REST API (TypeScript)
│   └── mockup-sandbox/         ← Design playground
├── lib/
│   ├── db/                     ← Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/               ← OpenAPI YAML + Orval codegen config
│   ├── api-zod/                ← Shared Zod request/response schemas
│   ├── api-client-react/       ← Generated TanStack Query hooks
│   ├── integrations/           ← Shared integration utilities
│   ├── integrations-openai-ai-react/
│   └── integrations-openai-ai-server/
└── scripts/                    ← DB seed + post-merge utilities
```

**Frontend**: React 18 · Vite · Wouter (routing) · TanStack Query · Tailwind CSS · Radix UI / shadcn-ui · Framer Motion · Recharts · React Hook Form · Zod

**Backend**: Express.js · Drizzle ORM · PostgreSQL · JWT (8h expiry, bcrypt passwords) · Pino logging · Helmet · Rate limiting (20 auth req/15min, 300 API req/min) · CORS

**Integrations**: Redmine REST API · Google GenAI · Office 365 SMTP (smtp.office365.com:587) · SheetJS / xlsx-js-style / ExcelJS

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full access including Admin Search |
| `qa_lead` | Full QA access + Team management + Configurations |
| `qa_member` | QA workflows (test cases, tasks, execution, requirements) |
| `pmo` | PMO Report Portal only (redirected on login) |

Authentication is JWT Bearer token. The server reads the user from the token on each request via `getAuthUser(req)`.

---

## Frontend Routes

| Path | Page | Roles |
|------|------|-------|
| `/` | Landing (Main2) or redirect | Public |
| `/login` | Login | Public |
| `/dashboard` | Dashboard | qa_member, qa_lead, admin |
| `/requirements` | Requirements | qa_member, qa_lead, admin |
| `/configurations` | Project & Module Config | qa_lead, admin |
| `/test-cases` | Test Case Library | qa_member, qa_lead, admin |
| `/test-cases/execution` | Execution Dashboard | qa_member, qa_lead, admin |
| `/test-cases/execution/:id` | Execution Progress (per file) | qa_member, qa_lead, admin |
| `/test-cases/execution-details/:ticketId` | Execution Summary (read-only PMO view) | qa_member, qa_lead, admin |
| `/tasks` | Task Tracker | qa_member, qa_lead, admin |
| `/history-trail` | History Trail | qa_member, qa_lead, admin |
| `/team` | Team Management | qa_lead, admin |
| `/admin/search` | Admin Search | admin |
| `/settings` | User Settings | qa_member, qa_lead, admin |
| `/inbox` | Inbox | qa_member, qa_lead, admin |
| `/team-hangouts` | Team Hangouts / Social Events | qa_member, qa_lead, admin |
| `/ai-features` | AI Features | qa_member, qa_lead, admin |
| `/report` | Report Dashboard | qa_member, qa_lead, admin |
| `/pmo-report` | PMO Report Portal | All authenticated |

---

## API Route Modules

`/api/auth` · `/api/users` · `/api/projects` · `/api/requirements` · `/api/test-cases` · `/api/test-execution` · `/api/tasks` · `/api/redmine` · `/api/ai` · `/api/dashboard` · `/api/pmo-report` · `/api/excel-builder` · `/api/contacts` · `/api/notifications` · `/api/calendar` · `/api/social-events` · `/api/health`

---

## Database Tables

### Core

| Table | Purpose |
|-------|---------|
| `users` | Accounts with role, team, avatar, Redmine API key |
| `projects` | QAPulse projects |
| `requirements` | Requirements linked to Redmine tickets and projects |
| `test_cases` | Test case library (steps, expected result, module, AI-assisted flag) |
| `tasks` | Tasks linked to Redmine IDs with multi-assignee, dates, hours |
| `task_events` | Timeline events per task |

### Execution

| Table | Purpose |
|-------|---------|
| `execution_files` | One per Redmine ticket; parent container for a test run |
| `execution_test_cases` | Individual test case rows within an execution file |
| `execution_modules` | Reusable module names |
| `execution_tc_history` | Audit trail of status changes (supports CAPA/Pareto) |
| `execution_file_audit` | Save history log (populates Doc Info + Review Log Excel sheets) |
| `execution_summaries` | Aggregated module-level pass/fail/blocked counts for PMO view |

### Integrations & Social

| Table | Purpose |
|-------|---------|
| `redmine_projects` | Cached Redmine project list (synced on demand) |
| `redmine_project_configs` | Per-project custom field IDs (Complexity, Start/End dates) |
| `contacts` | Email contacts for verdict/report sending (manual + Redmine-synced) |
| `notifications` | In-app notifications |
| `conversations` / `messages` | Inbox messaging |
| `social_events` | Team Hangouts events |
| `calendar_events` | Calendar entries |
| `activity` | Activity/audit log |

---

## Key Features

### Redmine Integration
- Per-user Redmine API key (falls back to `REDMINE_API_KEY` env if unset)
- Redmine project sync + cache (`redmine_projects` table); QA Lead can refresh via button
- Per-project custom field ID config (Complexity, Targeted Start/End Date)
- Auto defect creation modal: opens when a test step/case is marked Failed
  - Fields: Description, Expected Result (editable), Actual Result, Screenshots, Assignee (loaded from project memberships), Complexity, Dates
  - Smart duplicate check before creating
  - Scope toggle: "This step" vs "Entire test case"
  - Created defect linked as child of parent Redmine ticket
  - Redmine issue ID saved back to the execution record

### Test Case Library
- Full CRUD with module, project, requirement, tags, AI-assisted flag
- Clone single or bulk clone to different project/module
- AI-assisted generation via Google GenAI
- Import from Redmine (optional tracker filter)
- Compile selected TCs → new or existing execution file

### Execution Dashboard
- One execution file per Redmine ticket
- Mini progress bar per row (Passed / Failed / Blocked / In Progress / Not Executed)
- Column visibility toggle, sortable columns
- Pull test cases from library directly into execution file
- Excel upload on file creation (column-mapped, saved immediately)
- Execution timestamp auto-fills on result change
- Defect number renders as clickable Redmine link
- Auto PMO aggregation on every save (no manual refresh needed)

### Execution Summary (read-only)
- Auto-loads from `/test-cases/execution-details/:ticketId`
- Color-coded progress bars per module + grand total row
- Shows linked task status

### Excel Export
- Auto-populates Review Log, Review & Rework Effort, Pareto Analysis, and CAPA sheets on Send Verdict and Download
- Uses SheetJS with xlsx-js-style; ExcelJS for advanced formatting

### PMO Report Portal
- Full report as inline HTML email body + PDF attachment
- Sends via Office 365 SMTP
- Config: `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `PMO_EMAIL_TO`

### AI Features
- Powered by Google GenAI (`@google/genai`)
- Test case generation from requirements/user stories

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (default: dev placeholder) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `REDMINE_API_KEY` | System-level fallback Redmine key |
| `SMTP_USER` | Office 365 SMTP username |
| `SMTP_PASS` | Office 365 SMTP password |
| `EMAIL_FROM` | Sender address for emails |
| `PMO_EMAIL_TO` | PMO report recipient address |

---

## Shared Library Packages (`lib/`)

| Package | Role |
|---------|------|
| `@workspace/db` | Drizzle schema exports + `db` client instance |
| `@workspace/api-spec` | `openapi.yaml` — single source of truth for the API contract |
| `@workspace/api-zod` | Zod schemas for request/response validation, shared by client and server |
| `@workspace/api-client-react` | TanStack Query hooks auto-generated from OpenAPI spec via Orval |
| `@workspace/integrations` | Shared integration helpers |

---

## Development

```bash
# Install dependencies
pnpm install

# Run frontend
cd artifacts/qa-pulse && pnpm dev

# Run API server
cd artifacts/api-server && pnpm dev

# Type-check everything
pnpm typecheck

# Build everything
pnpm build
```

> The workspace enforces pnpm — running `npm install` or `yarn` will exit with an error.
