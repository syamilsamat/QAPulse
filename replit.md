# QA Pulse

Internal QA management and analytics platform for tracking requirements, test cases, tasks, and team performance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/qa-pulse run dev` — run the React frontend (proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — session secret
- AI: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — provided by Replit AI integration

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, shadcn/ui, Wouter routing, Tanstack Query
- API: Express 5, OpenAPI-first (Orval codegen)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- AI: OpenAI via Replit AI Integrations (`@workspace/integrations-openai-ai-server`)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle ORM schema (users, projects, requirements, test_cases, tasks, activity)
- `lib/api-zod/` — generated Zod schemas (from Orval)
- `lib/api-client-react/` — generated React Query hooks (from Orval)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/qa-pulse/src/pages/` — React page components
- `artifacts/qa-pulse/src/contexts/AuthContext.tsx` — auth state (localStorage, token getter)

## Authentication

Token-based auth: token = `base64(id:email:role)`. Frontend stores in `localStorage` as `qa_pulse_token` and `qa_pulse_user`. The `setAuthTokenGetter` from the API client injects it as `Authorization: Bearer <token>`.

Demo accounts:
- `admin@qapulse.com` / `admin123` — admin role
- `sarah@qapulse.com` / `password123` — qa_lead role
- `james@qapulse.com` / `password123` — qa_member role
- `priya@qapulse.com` / `password123` — qa_member role
- `marcus@qapulse.com` / `password123` — qa_member role

## Architecture decisions

- Contract-first API: OpenAPI spec → Orval codegen → typed hooks and Zod schemas shared across frontend and backend
- Token auth (base64 encoded) avoids session complexity; suitable for internal tool
- `openai`, `p-limit`, `p-retry` added to `externals` in `build.mjs` to avoid esbuild bundling issues with the integrations lib
- AI test case generation uses `gpt-5.1` via Replit AI Integrations proxy
- DB queries done with Drizzle ORM; filters applied in-memory post-fetch for simplicity

## Product

**QA Pulse** is a full-stack QA management platform with:
- **Dashboard** — real-time metrics (tasks, test cases, overdue, AI-assisted stats), weekly trend chart, activity feed
- **Requirements** — create/edit/delete requirements linked to projects, with Redmine ticket ID support
- **Test Cases** — manual test case management with AI generation (via OpenAI), clone, expand-to-view steps
- **Tasks** — track QA tasks with status, due date, assignee, progress; quick status change inline
- **Team** — view team members with performance stats; admin can add/edit users
- **Admin Search** — cross-entity search across requirements, test cases, tasks, and users
- **Settings** — profile management, role info

## User preferences

- Role-based access: qa_member < qa_lead < admin
- Prefer real data over mocked placeholders
- Fail explicitly (show error toasts) instead of silent fallbacks

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Run `pnpm --filter @workspace/db run push` after changing DB schema
- The `openai`, `p-limit`, `p-retry` packages must stay in `external` list in `artifacts/api-server/build.mjs`
- Do not run `pnpm dev` at root — use workflows

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
