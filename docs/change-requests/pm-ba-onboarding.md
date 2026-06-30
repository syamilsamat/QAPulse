# CR: Expand QAPulse beyond QA — Project Manager + Business Analyst onboarding

**Status:** Deferred — not yet started

## Context

QAPulse today is a QA-only tool: 4 roles (`admin`, `qa_lead`, `qa_member`, `pmo`), and every authenticated user can read/write every project's requirements, test cases, execution files, and tasks — there is no project-level data scoping (`requirements.ts` etc. barely call `verifyToken`, and nothing checks "does this user belong to this project"). The goal is to widen QAPulse into a multi-department platform (eventually BA, SA, Developer, DevOps, PM). This first increment is scoped to **Project Manager** and **Business Analyst** only, with **project-level access control built first** as a prerequisite, and **Microsoft/Azure AD SSO kept out of scope** (tracked separately in `microsoft-login-sso.md`).

The role/nav-permission system is already fully data-driven (`roles` + `role_nav_permissions` tables, admin-editable via `POST /roles` and `PUT /roles/:id/permissions`), and `projectId` columns already exist on `requirements`, `test_cases`, `tasks`, and `execution_files`. The missing piece is *enforcing* that scoping, plus two new department-facing surfaces (PM dashboard, BA requirements-review workflow).

## Part 1 — Project-level access control (prerequisite)

**New table** `lib/db/src/schema/project-members.ts` (mirrors the composite-PK style of `role-nav-permissions.ts`):
```ts
export const projectMembersTable = pgTable("project_members", {
  projectId: integer("project_id").notNull(),
  userId: integer("user_id").notNull(),
  projectRole: text("project_role"), // free text, unenforced in this phase
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.projectId, table.userId] })]);
```
No FK constraints, consistent with existing `projectId` columns elsewhere. Export from `schema/index.ts`.

**New middleware** `artifacts/api-server/src/middleware/auth.ts`:
- `requireAuth` — reads the Bearer token, calls the existing `verifyToken()` (from `routes/auth.ts`), sets `req.authUser = { id, email, role, isAdmin }`. Replaces scattered inline `verifyToken()` calls.
- `resolveProjectAccess` — after `requireAuth`; admins get `req.accessibleProjectIds = null` (unrestricted sentinel), everyone else gets the array of `projectId`s from `project_members` for their user.

**New helper** `artifacts/api-server/src/lib/scope.ts`:
- `canAccessProject(req, projectId)` — for routes that filter in-memory after `db.select()` (the existing pattern in `requirements.ts`/`tasks.ts`/`test-cases.ts`). `projectId: null` rows are hidden from non-admins.
- `scopeToUserProjects(req, projectIdColumn)` — for raw-SQL/`pool.query` routes (`traceability.ts`), returns a `WHERE project_id = ANY($n)` clause fragment (using `[-1]` as a safe empty-result sentinel rather than an empty array).

**Wiring** in `artifacts/api-server/src/routes/index.ts`: since each router already owns its full path internally (`router.use(requirementsRouter)` with no prefix), insert the middleware inline before the routers that need it — e.g. `router.use(requireAuth, resolveProjectAccess, requirementsRouter)` — for: `requirementsRouter`, `testCasesRouter`, `tasksRouter`, `traceabilityRouter`, `projectsRouter`, and `testExecutionRouter` (execution files were explicitly part of the original scoping ask). Also apply `requireAuth` (admin-only check) to the mutating endpoints in `rolesRouter` and `usersRouter`, which currently have no backend authorization at all beyond the frontend hiding the UI — cheap to close while this middleware exists.

**Per-route retrofit** (one-line-per-handler, no rewrites): in each protected route file, after the existing `db.select()`/fetch, add a `canAccessProject` filter (list endpoints) or guard (single-resource endpoints), returning **404** on denied access (not 403, to avoid leaking existence of inaccessible records). `projects.ts`'s `GET /projects` becomes the project-picker source automatically — frontend needs no changes there since it already calls the existing `listProjects()` hook.

**Migration**: repo uses `drizzle-kit push` (no migrations folder) — add the schema file, run `pnpm --filter @workspace/db push`. To avoid locking every non-admin out of every project the moment the middleware activates, ship a one-time backfill script that grandfathers all current active users into all current active projects in `project_members`, run in the same deploy as the middleware activation. Admins narrow access afterward via the (new, see Part 3) project-members admin UI.

## Part 2 — Project Manager onboarding

- Seed role `project_manager` in `routes/roles.ts`'s `DEFAULT_ROLES`/`DEFAULT_PERMISSIONS` with nav keys: `nav:report`, `nav:tasks`, `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, plus a new `nav:pm-dashboard` key (dedicated nav item, cleaner than branching the existing Report page by role).
- **New endpoint** `GET /dashboard/pm-summary` in `routes/dashboard.ts`, mounted behind the new middleware, following the existing in-memory aggregation style of `GET /dashboard/summary`/`GET /dashboard/team` in the same file — **no new sprint/release data model**, purely aggregates existing `tasksTable`, `requirementsTable`, and execution-file/summary data, grouped per accessible project (requirement counts, task status breakdown, overdue tasks, execution pass rate).
- **New page** `artifacts/qa-pulse/src/pages/PmDashboard.tsx` at route `/pm-dashboard`, rendering `pm-summary` as a per-project card grid plus the existing `GET /dashboard/activity` feed (unfiltered by project for this MVP — `activityTable` has no `projectId` column, so precise per-project filtering is a stretch goal, not blocking).
- `Layout.tsx`: add `"project_manager"` to the hardcoded `roles: string[]` fallback arrays on the relevant `NavItem` entries (this array is the sole gate when the dynamic nav-permissions fetch hasn't resolved yet), and add the new PM Dashboard nav entry.

## Part 3 — Business Analyst onboarding

- Seed role `business_analyst` with nav keys: `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, `nav:report`.
- **Schema**: add `reviewedBy integer` and `reviewedAt timestamp` to `requirementsTable` (`lib/db/src/schema/requirements.ts`). No new tables — status stays a free-text column (no DB enum to fight), extend the frontend's status list with `in_review`/`approved`/`rejected`.
- **New endpoint** `PATCH /requirements/:id/review` in `routes/requirements.ts`: restricted to `business_analyst`/`admin`, also passes through the project-access check; updates `status`/`reviewedBy`/`reviewedAt`, writes one row to the existing `activityTable` (`entityType: "requirement"`, `entityId`, `description` = review comment) — reusing the generic activity log instead of inventing a new comment system — and notifies the requirement's `assigneeId` via the existing `notificationsTable` insert pattern already used in `tasks.ts`.
- **New endpoint** `GET /requirements/:id/activity` (or extend the existing dashboard activity endpoint to accept `entityType`+`entityId` filters) so the requirement detail view can show a "Review History" panel.
- `Requirements.tsx` (already BA's natural home page): add approve/reject actions + comment box, visible when `role === "business_analyst"` or `admin`.
- `Layout.tsx`: add `"business_analyst"` to the relevant `NavItem.roles` fallback arrays.

## Defaults adopted for open design questions

- Project membership is **all-or-nothing** per project in this phase (no per-project sub-roles yet — `projectRole` column is stubbed for future use but unenforced).
- Rows with `projectId: null` are **hidden from non-admins**.
- `project_members` management is **admin-only** for this phase (via the existing admin Team/Roles surface — a simple members list/add-remove UI, no new page needed beyond a small admin panel addition).
- Access-denied returns **404**, not 403.

## Verification

- `pnpm --filter @workspace/db push` succeeds and creates `project_members`; backfill script runs cleanly against a copy of current data.
- As a non-admin `qa_member` with no `project_members` rows for Project X: `GET /requirements?projectId=X`, `GET /tasks?projectId=X`, `GET /test-cases?projectId=X` all return empty/404 instead of leaking data; same calls succeed for a project they're a member of.
- As `admin`: all projects remain visible, unaffected by the new middleware.
- Create a user with role `project_manager`: confirm `/pm-dashboard` nav item appears, the page loads aggregated data scoped to their accessible projects only, and QA-only nav items (e.g. `nav:test-cases`, `nav:ai-hub`) do **not** appear.
- Create a user with role `business_analyst`: confirm they can open a requirement, submit an approve/reject review with a comment, the requirement's status and `reviewedBy`/`reviewedAt` update, the assignee gets a notification, and the review shows up in the requirement's activity history.
- Confirm existing QA roles (`qa_member`, `qa_lead`, `admin`, `pmo`) see no behavior change other than now being scoped to their `project_members` rows (post-backfill, this should be invisible since everyone is grandfathered into all current projects).
