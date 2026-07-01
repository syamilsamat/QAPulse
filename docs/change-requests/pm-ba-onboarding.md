# CR: Expand QAPulse beyond QA — Project Manager + Functional Analyst onboarding

**Status:** Deferred — not yet started

## Context

QAPulse today is a QA-only tool: 4 roles (`admin`, `qa_lead`, `qa_member`, `pmo`), and every authenticated user can read/write every project's requirements, test cases, execution files, and tasks — there is no project-level data scoping (`requirements.ts` etc. barely call `verifyToken`, and nothing checks "does this user belong to this project"). The goal is to widen QAPulse into a multi-department platform (eventually Functional Analyst, Developer, DevOps, PM — note: BA and SA are already merged into a single "Functional Analyst" role in this org, so no separate SA role is needed later). This first increment is scoped to **Project Manager** and **Functional Analyst** only, with **project-level access control built first** as a prerequisite, and **Microsoft/Azure AD SSO kept out of scope** (tracked separately in `microsoft-login-sso.md`).

The role/nav-permission system is already fully data-driven (`roles` + `role_nav_permissions` tables, admin-editable via `POST /roles` and `PUT /roles/:id/permissions`), and `projectId` columns already exist on `requirements`, `test_cases`, `tasks`, and `execution_files`. The missing piece is *enforcing* that scoping, plus two new department-facing surfaces (PM dashboard, Functional Analyst requirements-review workflow).

### Workflow this needs to support

The real SDLC loop QAPulse is being asked to formalize is not a straight line, it loops back through the Functional Analyst (FA) twice:

```
PM (intake) → FA (analyze + requirement) → [approval gate] → PM (assign) → Dev (build)
                    ↑                                                          ↓
                    └──────────── UAT (FA verify) ←── QA (test) ←──────────────┘
                                        ↓
                                  PM (close out)
```

This same loop has to serve **two different scales**:
- **A Change Request (CR)** — a small, usually single-pass slice: PM logs a CR, FA writes 1–3 requirements against it, they get approved, Dev builds, QA tests, FA does UAT, PM closes it.
- **A brand-new project** — the identical loop, but run at BRD/FRD scale (dozens–hundreds of requirements) and sliced into multiple sequential phases/sprints, each with its own requirement set, its own QA pass, and its own UAT.

Rather than build separate machinery for "CR mode" and "new project mode," both are modeled as the same primitive at different sizes: a **Milestone** — a named, time-boxed slice of work within a Project. A CR is a Project with exactly one Milestone. A new project is a Project with a sequence of Milestones (Phase 1, Phase 2, ... or Sprint 1, Sprint 2, ...). Everything downstream (requirements, tasks, PM dashboard grouping, FA review/UAT sign-off) hangs off this one primitive, so the same code path serves both cases.

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

## Part 2 — Milestones (shared primitive for CR and new-project work)

**New table** `lib/db/src/schema/milestones.ts`:
```ts
export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(), // e.g. "CR-042: Add SSO integration" or "Sprint 3 — Payment Module"
  type: text("type").notNull().default("cr"), // free text: cr | phase | sprint | release — reporting label only, unenforced
  status: text("status").notNull().default("planning"), // free text: planning | in_progress | qa | uat | done
  targetDate: timestamp("target_date", { withTimezone: true }),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```
No FK constraints, consistent with existing `projectId` columns elsewhere. A CR is simply a Project with one Milestone (`type: "cr"`); a new project is a Project with a sequence of Milestones (`type: "phase"`/`"sprint"`). `status` is free text like every other status column in this codebase — no DB enum to fight, extend the frontend dropdown as needed.

**Schema additions**: nullable `milestoneId integer` on `requirementsTable` and `tasksTable` — nullable so existing/ad-hoc requirements and tasks that aren't part of any tracked slice keep working unchanged. A Project can have several concurrent Milestones (e.g. a hotfix CR opened mid-sprint alongside the current phase).

**New endpoints** in a new `routes/milestones.ts`, mounted behind `requireAuth, resolveProjectAccess`:
- `GET /projects/:projectId/milestones`, `POST /milestones`, `PATCH /milestones/:id` (status transitions) — same `canAccessProject` guard pattern as every other route in Part 1.
- `Requirements.tsx` and `Tasks.tsx` forms get an optional Milestone picker, scoped to the item's project (reuses the existing project-scoped dropdown pattern already used for Module pickers).

## Part 3 — Project Manager onboarding

- Seed role `project_manager` in `routes/roles.ts`'s `DEFAULT_ROLES`/`DEFAULT_PERMISSIONS` with nav keys: `nav:report`, `nav:tasks`, `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, plus a new `nav:pm-dashboard` key (dedicated nav item, cleaner than branching the existing Report page by role).
- **New endpoint** `GET /dashboard/pm-summary` in `routes/dashboard.ts`, mounted behind the new middleware, following the existing in-memory aggregation style of `GET /dashboard/summary`/`GET /dashboard/team` in the same file — aggregates `tasksTable`, `requirementsTable`, `milestonesTable`, and execution-file/summary data, grouped **per accessible project, then per Milestone within it** (milestone name/type/status/target date, requirement approval breakdown, task status breakdown, execution pass rate, overdue flag when `targetDate` has passed and `status != "done"`). Requirements/tasks with no `milestoneId` roll up into an "Unassigned" bucket per project so nothing is silently dropped.
- **New page** `artifacts/qa-pulse/src/pages/PmDashboard.tsx` at route `/pm-dashboard`, rendering `pm-summary` as a per-project → per-milestone card grid plus the existing `GET /dashboard/activity` feed.
- `Layout.tsx`: add `"project_manager"` to the hardcoded `roles: string[]` fallback arrays on the relevant `NavItem` entries (this array is the sole gate when the dynamic nav-permissions fetch hasn't resolved yet), and add the new PM Dashboard nav entry.

## Part 4 — Functional Analyst onboarding

- Seed role `functional_analyst` (description: "Functional Analyst" — merged BA+SA role in this org) with nav keys: `nav:requirements`, `nav:traceability`, `nav:inbox`, `nav:team-hangouts`, `nav:report`.
- **Schema**: add `reviewedBy integer` and `reviewedAt timestamp` to `requirementsTable` (`lib/db/src/schema/requirements.ts`). No new tables for this part — status stays a free-text column, extend the frontend's status list with `in_review`/`approved`/`rejected`.
- **New endpoint** `PATCH /requirements/:id/review` in `routes/requirements.ts`: restricted to `functional_analyst`/`admin`, also passes through the project-access check; updates `status`/`reviewedBy`/`reviewedAt`, writes one row to the existing `activityTable` (`entityType: "requirement"`, `entityId`, `description` = review comment) — reusing the generic activity log instead of inventing a new comment system — and notifies the requirement's `assigneeId` via the existing `notificationsTable` insert pattern already used in `tasks.ts`. This is the **upstream** approval gate (requirement baseline sign-off, before Dev starts).
- **New endpoint** `PATCH /milestones/:id/review` — same restricted/scoped/activity-log/notification pattern as above, but applied to a Milestone once its requirements have all passed QA: the FA sets `status` to `uat_passed`/`uat_rejected` with a comment. This is the **downstream** gate (UAT — verifying delivered work matches the original requirement), closing the loop back to the FA after QA. Notifies the Milestone's `createdBy` (the PM) rather than a single assignee.
- **New endpoint** `GET /requirements/:id/activity` (or extend the existing dashboard activity endpoint to accept `entityType`+`entityId` filters) so both the requirement detail view and the milestone view can show a "Review History" panel.
- `Requirements.tsx` (already the FA's natural home page): add approve/reject actions + comment box, visible when `role === "functional_analyst"` or `admin`. PM Dashboard's milestone cards get the same approve/reject affordance for the UAT gate.
- `Layout.tsx`: add `"functional_analyst"` to the relevant `NavItem.roles` fallback arrays.

## Defaults adopted for open design questions

- Project membership is **all-or-nothing** per project in this phase (no per-project sub-roles yet — `projectRole` column is stubbed for future use but unenforced).
- Rows with `projectId: null` are **hidden from non-admins**.
- `project_members` management is **admin-only** for this phase (via the existing admin Team/Roles surface — a simple members list/add-remove UI, no new page needed beyond a small admin panel addition).
- Access-denied returns **404**, not 403.
- Milestone `type`/`status` are free text and unenforced — a reporting label, not a workflow state machine. No automatic transitions (e.g. QA passing doesn't auto-flip status to `uat`); PM/FA move it manually. Automating that is a natural follow-up once this ships, not a blocker for v1.
- `milestoneId` on Requirements/Tasks is optional — nothing forces existing or informal work into a Milestone.

## Verification

- `pnpm --filter @workspace/db push` succeeds and creates `project_members` and `milestones`; backfill script runs cleanly against a copy of current data.
- As a non-admin `qa_member` with no `project_members` rows for Project X: `GET /requirements?projectId=X`, `GET /tasks?projectId=X`, `GET /test-cases?projectId=X` all return empty/404 instead of leaking data; same calls succeed for a project they're a member of.
- As `admin`: all projects remain visible, unaffected by the new middleware.
- **CR-scale flow**: create one Milestone (`type: "cr"`) on a project, attach 2 requirements to it, approve both as the FA, confirm PM Dashboard shows the milestone at 100% requirements-approved with an "awaiting Dev/QA" state.
- **New-project-scale flow**: create 3 sequential Milestones (`type: "phase"`) on one project with different `targetDate`s, attach separate requirement sets to each, confirm PM Dashboard lists all 3 independently with correct per-milestone rollups, and that one milestone's requirement review doesn't affect another's.
- Confirm a requirement/task with no `milestoneId` still displays correctly and rolls up into the "Unassigned" bucket on the PM Dashboard, not silently dropped.
- Create a user with role `project_manager`: confirm `/pm-dashboard` nav item appears, the page loads milestone-grouped data scoped to their accessible projects only, and QA-only nav items (e.g. `nav:test-cases`, `nav:ai-hub`) do **not** appear.
- Create a user with role `functional_analyst`: confirm they can open a requirement, submit an approve/reject review with a comment, the requirement's status and `reviewedBy`/`reviewedAt` update, the assignee gets a notification, and the review shows up in the requirement's activity history.
- Confirm the FA can also submit a milestone-level UAT review (`PATCH /milestones/:id/review`) once a milestone's requirements are done, and that the milestone's creator (PM) gets notified.
- Confirm existing QA roles (`qa_member`, `qa_lead`, `admin`, `pmo`) see no behavior change other than now being scoped to their `project_members` rows (post-backfill, this should be invisible since everyone is grandfathered into all current projects).
