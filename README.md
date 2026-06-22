# QAPulse

QAPulse is a QA management platform built for software testing teams. It centralises test case authoring, task tracking, execution progress, defect creation, and PMO reporting — with deep Redmine integration throughout.

---

## Prerequisites

Before you begin, make sure you have the following installed and available:

- **Node.js** v18 or higher
- **pnpm** v8 or higher — this workspace enforces pnpm. Running `npm install` or `yarn` will exit with an error.
- **PostgreSQL** — a running instance with a database created for QAPulse
- **Redmine** — a running Redmine instance with API access enabled
- **Google GenAI API key** — required for AI-assisted test case generation
- **Office 365 SMTP credentials** — required for PMO report email delivery

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Autoraimix/QAPulse.git
cd QAPulse
```

### 2. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for details on each variable.

### 3. Install dependencies

```bash
pnpm install
```

### 4. Set up the database

Run the database migrations and optionally seed initial data:

```bash
pnpm --filter @workspace/db db:migrate
pnpm --filter @workspace/db db:seed   # optional
```

### 5. Start the development servers

Open two terminal windows and run each separately:

```bash
# Terminal 1 — Frontend
cd artifacts/qa-pulse
pnpm dev

# Terminal 2 — API server
cd artifacts/api-server
pnpm dev
```

The frontend will be available at `http://localhost:5173` and the API at `http://localhost:3000` by default.

---

## Environment Variables

Create a `.env` file at the workspace root with the following variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/qapulse` |
| `JWT_SECRET` | ✅ | Secret used to sign JWT tokens. Use a strong random string in production. |
| `CORS_ORIGIN` | ✅ | Allowed frontend origin, e.g. `http://localhost:5173` |
| `REDMINE_API_KEY` | ✅ | System-level fallback Redmine API key. Individual users can override this with their own key in Settings. |
| `SMTP_USER` | ✅ | Office 365 SMTP username (email address) |
| `SMTP_PASS` | ✅ | Office 365 SMTP password |
| `EMAIL_FROM` | ✅ | Sender address for outgoing emails |
| `PMO_EMAIL_TO` | ✅ | Recipient address for PMO report emails |

---

## Project Structure

QAPulse is a pnpm monorepo. The main packages are:

```
QAPulse/
├── artifacts/
│   ├── qa-pulse/           ← React frontend (Vite + TypeScript)
│   ├── api-server/         ← Express REST API (TypeScript)
│   └── mockup-sandbox/     ← Design playground
├── lib/
│   ├── db/                 ← Drizzle ORM schema + PostgreSQL client
│   ├── api-spec/           ← OpenAPI YAML + Orval codegen config
│   ├── api-zod/            ← Shared Zod request/response schemas
│   ├── api-client-react/   ← Generated TanStack Query hooks
│   └── integrations/       ← Shared integration utilities
└── scripts/                ← DB seed + post-merge utilities
```

---

## Tech Stack

**Frontend** — React 18, Vite, TypeScript, TanStack Query, Tailwind CSS, Radix UI / shadcn-ui, Wouter, Framer Motion, Recharts, React Hook Form, Zod

**Backend** — Express.js, Drizzle ORM, PostgreSQL, JWT authentication (8h expiry), Pino logging, Helmet, rate limiting

**Integrations** — Redmine REST API, Google GenAI, Office 365 SMTP, SheetJS / ExcelJS

---

## User Roles

QAPulse uses role-based access control. Roles are assigned per user account.

| Role | Access |
|---|---|
| `admin` | Full access including Admin Search |
| `qa_lead` | Full QA access + Team management + Configurations |
| `qa_member` | QA workflows — test cases, tasks, execution, requirements |
| `pmo` | PMO Report Portal only (redirected on login) |

Authentication uses JWT Bearer tokens with an 8-hour expiry.

---

## Key Features

**Test Case Library** — Create, clone, bulk-clone, and import test cases from Redmine. Supports AI-assisted generation via Google GenAI. Test cases can be compiled directly into execution files.

**Execution Dashboard** — One execution file per Redmine ticket. Track pass/fail/blocked/in-progress status per test case. Supports Excel upload on file creation and auto-generates PMO aggregation on every save.

**Redmine Integration** — Per-user Redmine API keys, project sync with caching, and auto defect creation when a test step is marked Failed. Defects are created as child issues of the parent Redmine ticket.

**Excel Export** — Auto-populates Review Log, Pareto Analysis, and CAPA sheets on Send Verdict or Download using SheetJS and ExcelJS.

**PMO Report Portal** — Sends a full QA report as an inline HTML email with a PDF attachment via Office 365 SMTP.

**AI Features** — Generate test cases from requirements or user stories using Google GenAI.

---

## Development Commands

```bash
# Install all dependencies
pnpm install

# Run frontend dev server
cd artifacts/qa-pulse && pnpm dev

# Run API server
cd artifacts/api-server && pnpm dev

# Type-check all packages
pnpm typecheck

# Build everything
pnpm build
```

---

## Contributing

1. Create a feature branch from `main`
2. Make your changes and ensure `pnpm typecheck` passes with no errors
3. Test your changes locally against a real PostgreSQL + Redmine instance
4. Open a pull request with a clear description of what changed and why

---

## Licence

Private repository. All rights reserved.