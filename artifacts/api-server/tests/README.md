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
