# Global Search — Feature Plan

**Status:** Proposed — awaiting approval to build
**Owner:** Raimi Rosman
**Scope:** New system-wide search, launched from the Dashboard, that finds any record the logged-in user is allowed to see and links straight to it.

---

## 1. Goal & scenario

A single **"Global Search"** entry point on the Dashboard where a user can search everything in the system relevant to them.

**Scenario**
1. User logs in.
2. User clicks **Global Search** on the Dashboard (opens a command-palette overlay).
3. User types a term (e.g. `password`).
4. The overlay shows **everything related** to that term that the user is allowed to see — across Requirements, Test Cases, Tasks, Defects, Milestones, Risks, UAT Sign-offs, Projects, Modules, Contacts, Users, Teams, Document Register.
5. Each result shows **what it is (type prefix), title, status, author, created date, Redmine ID (if any), and project** — so the user immediately knows what they're looking at.
6. Results are **strictly scoped to the logged-in user's access** — they never see another user's / another project's data.
7. Clicking a result **navigates directly to that record's page**.

---

## 2. UI design (matches the reference command palette)

A centered modal overlay over a dimmed backdrop, opened by a **Global Search** button on the Dashboard (and by the `⌘K` / `Ctrl+K` shortcut).

### Anatomy
- **Search field** — full width, left magnifying-glass icon, right circular submit button. Debounced (~250 ms) live search as the user types; `Enter` runs immediately.
- **Category filter chips** (below the field) — `All {total}` plus one chip per non-empty type with its count, e.g. `Requirements 8`, `Test Cases 12`, `Defects 3`. Selecting a chip filters the list to that type; `All` restores the grouped view.
- **Grouped results** — under `All`, results are grouped by type with a small uppercase gray **section header** (`REQUIREMENTS`, `TEST CASES`, …). Each group shows the top few results, then a **"{n} more results ›"** link that expands the group (or switches to that category chip).
- **Result row**
  - Left: a **type icon** (e.g. document = Requirement, flask = Test Case, bug = Defect).
  - Main: **title** (bold) + a **subtitle line**: `Type · Project · #RedmineID · Author · Created date`.
  - A **status pill** (colored by state, e.g. `Approved`, `Failing`, `Overdue`, `Open`) — the equivalent of the reference's "Trending" badge.
  - Right: a **chevron** indicating navigation.
- **States** — loading (spinner/skeleton rows), empty ("No results for '…'"), min-length hint (start searching at 2 chars), and an error row.
- **Keyboard** — `↑`/`↓` to move, `Enter` to open the highlighted result, `Esc` to close.
- **Responsive & theme-aware** — full-width on mobile; light/dark aware.

---

## 3. Coverage — entities & field map

All queries are **scoped to the logged-in user** (see §4). "Author" = the record's created-by; "—" where the table has no author column.

| Type (prefix) | Table | Searched text fields | Author | Status | Redmine | Scope | Navigates to |
|---|---|---|---|---|---|---|---|
| **Requirement** | `requirements` | title, description, module, tracker, release, blockedReason, acceptanceCriteria | `createdBy` | `status` / `reviewStatus` / `devStatus` | `redmineTicketId` | project + module | `/requirements/:id` (detail) |
| **Test Case** | `test_cases` | title, objective, preconditions, testSteps, expectedResult, tags, scenario, comments, caseId, module | `authorId` | `status` | `redmineUserStory` / `redmineDefectId` | project + module | `/test-cases?tc=:id` |
| **Task** | `tasks` | name, notes, tracker | — (show assignee) | `status` | `redmineId` | project + module + **department (CR059)** | `/tasks?highlight=:requirementId` |
| **Defect** | `defects` | defectCode, title, description, stepsToReproduce, actualResult, expectedResult, module, category, escapeNotes | `reporterId` | `status` / `escapeStatus` | `redmineId` | project + module (null-project visible) | `/defects?highlight=:id` |
| **Milestone** | `milestones` | name, description, lessonsLearned, type, environment | `createdBy` | `status` / `priority` | — | project | `/milestones?highlight=:id` |
| **Risk** | `risks` | title, description, mitigationPlan, category, responseStrategy | `raisedBy` / `ownerId` | `status` | — | project | `/risk-register?highlight=:id` * |
| **UAT Sign-off** | `uat_signoffs` | fileName, note | `uploadedBy` | — | — | project | `/uat-signoffs?highlight=:id` * |
| **Project** | `projects` | name, description | — | `status` | — | project list | `/configurations?tab=projects&highlight=:id` * |
| **Module** | `execution_modules` | name | — | — | — | global catalog | `/configurations?tab=modules&highlight=:id` * |
| **Contact** | `contacts` | fullName, email, redmineLogin | `addedBy` | — | `redmineId` (int) | global (auth) | `/configurations?tab=contacts&highlight=:id` * |
| **User** | `users` | name, email, role, team | — | `isActive` | — (API key **never** returned) | global (auth) | `/team?highlight=:id` (or Config → Team Members) |
| **Team** | `teams` | name, department | — | — | — | global | `/configurations?tab=teams&highlight=:id` * |
| **Document Register** | `document_register` | projectName, moduleName, tracker, refNo | — | — | — | project-named | `/configurations?tab=doc-register&highlight=:id` * |

`*` = deep-link anchor / tab param does not exist yet; a small **additive** change is needed (see §6).

---

## 4. Access control & security (requirement #5)

The single source of truth is the existing middleware `artifacts/api-server/src/middleware/access.ts`.

- **`getAuthContext(req)`** → `{ userId, role }` from the Bearer JWT.
- **`scopeToUserProjects(userId, role)`** → `number[] | null` (accessible project IDs; `null` = unrestricted):
  - `admin` and CTO-tier (`tierRank ≥ 5`) → `null`.
  - Manager+ (`tierRank ≥ 3`) with a department → every project that has a `project_members` row for anyone in their department.
  - Member/Lead → only their own `project_members` assignments.
- The search endpoint calls `scopeToUserProjects` **once**, then filters each project-scoped table with `inArray(projectId, accessible)` when `accessible !== null`.
- **Replicate the per-entity nuances exactly** or scoped users see rows they can't open:
  - Requirements / Test Cases / Defects / Tasks → also **module-scope** via `getModuleScope`.
  - Tasks → also the **CR059 department filter** (qa/fa/dev only see tasks assigned within their own department; pm/admin/cto exempt).
  - Defects → `projectId == null` defects stay visible to scoped users (matches the defects list route).
  - Milestones / Risks → their normal list routes are hard-gated to a single `projectId`, so the search endpoint **queries those tables directly** with `inArray(projectId, accessible)`.
- **Global entities** (Users, Contacts, Teams, Modules) are readable by any authenticated user today — search mirrors that. (If these should be tightened later, that's a separate change.)

**Never returned in results:** the Redmine API key value (`users.redmineApiKey`), file blobs (`uat_signoffs.dataBase64`), passwords/hashes, tokens. Results carry only display metadata.

---

## 5. Backend design

**New route:** `artifacts/api-server/src/routes/search.ts`, mounted in `routes/index.ts`.

```
GET /search?q=<term>&type=<optional single type>&limit=<optional>
```

- Rejects `q` shorter than 2 chars (returns empty).
- Auth + scope once (§4).
- Runs a case-insensitive multi-field `ILIKE %q%` per entity across the fields in §3.
- **Ranking** (highest first): exact title/name/code match → title starts-with → title contains → Redmine ID / code exact → other-field contains. Ties broken by most-recent `createdAt`.
- **Caps:** in the grouped ("All") view, ~6 results per type + a per-type total so the UI can render "{n} more results". When `type=` is supplied (a category chip is active), return a larger page (e.g. up to 50) for that one type.
- Author display names resolved via a single `users` lookup (id → name); project names via a `projects` lookup — reuse the existing list-formatter helpers where possible.

**Response shape**

```jsonc
{
  "query": "password",
  "total": 27,
  "groups": [
    {
      "type": "requirement",
      "label": "Requirements",
      "count": 8,                 // total matches (for "N more results")
      "results": [
        {
          "type": "requirement",
          "id": 335,
          "title": "Secure 6-digit PIN login",
          "subtitle": "Requirement · Mobile Banking App · #335 · Nadia · 24 Apr 2026",
          "status": "approved",
          "statusTone": "success", // drives the pill color
          "author": "Nadia",
          "createdAt": "2026-04-24T...",
          "redmineId": "335",
          "projectName": "Mobile Banking App",
          "route": "/requirements/335"
        }
      ]
    }
  ]
}
```

The server owns the `route` string (single source of truth for navigation), so the client just follows it.

**Do not** build on `POST /ai/natural-language-search` — it is unscoped and references removed columns.

---

## 6. Frontend design

- **New component:** `artifacts/qa-pulse/src/components/GlobalSearch.tsx` — the command-palette overlay (search field, category chips, grouped results, keyboard nav, states) described in §2.
- **Trigger:** a **Global Search** button on the Dashboard, plus a `⌘K` / `Ctrl+K` global key listener. (Optional later: promote to the app header so it's reachable everywhere.)
- **Data:** debounced `GET /search?q=` via react-query; category chip sets `type=`.
- **Navigation:** follow each result's server-provided `route`; reuse the highlight/deep-link convention (`use-highlight.ts`).

### Additive deep-link changes (so click-through lands precisely)
1. **Task results** navigate by `requirementId` (the Tasks table highlights by requirement, not task id).
2. **Risk Register** (`RiskRegister.tsx`) — add `useHighlightRow()` + `id={highlightRowId(risk.id)}` and accept `?highlight=`.
3. **UAT Sign-offs** (`UatSignoffs.tsx`) — add the same row anchor + `?highlight=`.
4. **Configuration page** (`ModuleAndProject.tsx`) — read a `?tab=` param to open the right tab, and add row anchors for Projects/Modules/Contacts/Document Register so `?highlight=` lands on the row.
5. **Team page** — row anchor for Users (or route users to Config → Team Members).

Each of these is small and purely additive (no-op when the param is absent).

---

## 7. Known limitations / honest caveats

- **Tasks have no author column** — the Task row shows the **assignee** (or "—"), not an author.
- **v1 matching is substring**, not fuzzy/typo-tolerant (fast and predictable; easy to upgrade later).
- **"Configuration/Settings" free-text is thin** — a term like `password` will match Requirements/Test Cases/Tasks/Defects, but **not** a project/module unless one is literally named that. There is no free-text "settings" store to search.
- Global entities (Users/Contacts/Teams/Modules) follow today's "any authenticated user can read" rule.

---

## 8. Build order

1. **Backend** — `routes/search.ts` (`GET /search`) with scoped, ranked, capped queries across all §3 tables; mount in `routes/index.ts`.
2. **Frontend** — `GlobalSearch.tsx` command palette + Dashboard trigger + `⌘K`.
3. **Deep-link additions** — the small additive changes in §6 so every result type lands on the exact record.
4. **Polish** — loading/empty states, keyboard nav, dark mode, mobile.

---

## 9. Future enhancements (out of scope for v1)

- Fuzzy / typo-tolerant matching and highlighted matched terms.
- Recent searches & quick filters.
- Promote the launcher into the global app header.
- Include comments / requirement events / execution rows in results.
