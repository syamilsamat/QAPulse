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
