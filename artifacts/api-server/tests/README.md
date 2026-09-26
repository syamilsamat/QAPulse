# Excel review regression

Run `pnpm --filter @workspace/api-server test:excel` from the repository root.
These Node tests bundle the production Excel builder with the existing esbuild
dependency, generate real XLSX buffers, and read the Doc Info cells back using
SheetJS. They need no database, server, credentials, or network access.

Coverage includes distinct approval dates/reviewers, conflicting and absent
file-level fallback values, Row C before/after approval, the legacy latest-row
fallback (including creation exactly at approval time), and clearing the
template's sample reviewer/date. Dates are deterministic with `TZ=UTC`.

The companion live workflow test lives in the local sibling automation folder:
`qa-automation/tests/excel-review-regression.spec.ts`. It creates an execution
file and Document Register entry, uses real approval API calls, downloads and
parses the workbook, and cleans up its file, register entry, and milestone.
Run `npm run test:excel` there against a test backend started with `TZ=UTC`,
using its existing `QMPULSE_BASE_URL` and admin account configuration.
It uses separate authors to avoid same-author/day audit merging. A final
resubmission disables file-level fallback and verifies all row reviews persist.
The local automation folder is outside this Git repository.

# Defect Redmine history

Run `node --test artifacts/api-server/tests/defect-history.test.cjs artifacts/api-server/tests/defect-refresh.test.cjs` from the repository root.
Tests execute the production history adapter and routes with isolated Redmine and
DB boundaries. They cover journal normalization, personal credentials, project
and module access, per-user read tracking, stale snapshots, revoked access,
credential changes, and refresh feedback. No live issues or database are changed.

The `defect_history` table is created by the existing startup bootstrap. It stores
user-specific snapshots and read markers, invalidated on credential/issue changes.
A personal Redmine API key in Settings is required; history never falls back to the
shared service account. List activity checks use batched issue timestamps. Opening
History fetches journals; the first successful view establishes the unread baseline.
Cached snapshots are returned only for temporary upstream failures, never for
explicit access denial or a missing issue. Notes are rendered as plain text.

# Task create/update body

Run `node --test artifacts/api-server/tests/task-create-body.test.cjs` from the
repository root. The test bundles `insertTaskSchema` from `@workspace/db/schema`
with the existing esbuild dependency and parses the exact body the Requirements
page's Dev Tasks panel posts. No database, server, credentials or network.

It exists because POST /tasks used to validate against api-zod's generated
`CreateTaskBody`, which is generated from `openapi.yaml` and had drifted from
the table: it required a `type` column that had been dropped and carried a
single `assigneeId` where the table has an `assigneeIds` array. Adding a dev
task to an FA-approved requirement therefore always failed with 400
"type: Required". Coverage: the panel's payload parses, `assigneeIds` survives,
`type` is not required, an older client still sending `type` is not broken by it
(and `type` never reaches the insert), a nameless task is still rejected, and
the `.partial()` form used by PATCH accepts a single-field edit.

# Test step numbering

Run `node --test artifacts/api-server/tests/test-steps.test.cjs` from the
repository root. It compiles `artifacts/qm-pulse/src/lib/test-steps.ts` straight
from its path (a standalone module, no imports) with the existing esbuild
dependency. No database, server, credentials or network.

Step numbering is applied in three places — the execution sheet's read-only
views, the edit-mode normaliser that rewrites the stored text on blur, and the
Redmine defect description — so all three must agree or "step 4 failed" means a
different step depending on where it is read. The trap covered here is
idempotence: the defect modal prefills already-numbered text and numbers it
again on submit, and an edit blur re-runs over text it numbered a moment ago,
so anything that is not a fixed point produces "1. 1. Open statements".
Coverage also includes stripping the author's own numbering in its several
forms, renumbering from position after a deleted step, CRLF from pasted Word
content, and the decimal guard that keeps "1.5x zoom" intact.

# Recent activity access and pagination

This suite runs the actual route SQL against an isolated PostgreSQL WASM engine.
It never connects to the application database. Install the test-only runtime outside
this repository and run from the repository root:

```sh
npm install --prefix /tmp/qmpulse-activity-tests --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.3.14
PGLITE_PATH=/tmp/qmpulse-activity-tests/node_modules/@electric-sql/pglite node --test artifacts/api-server/tests/recent-activity.test.cjs
```

Covers authentication, project/module grants, department and PM member choices,
manager/admin/CTO scope, unauthorized filters, filtering before limits,
microsecond cursor ordering, safe summaries, login/logout exclusion, deleted
resources, invalid inputs, and fail-closed database errors.
