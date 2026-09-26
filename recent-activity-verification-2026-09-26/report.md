# Recent Activity verification — 26 September 2026

Implemented locally; not committed, pushed, or deployed.

## Behavior

- Login/logout remain in audit history and are excluded from Recent Activity.
- Work events require a resolvable current record in an accessible project. Module-restricted users see only matching module records; mixed-module execution files require access to every listed module.
- Members can filter their own activity. Leads/managers can filter department members in accessible projects. PM leads/managers can filter across departments in those projects. Admin/CTO have organization scope. Project activity itself includes other contributors' work within the viewer's resource access.
- Project, member, and cursor predicates run before the row limit. Pagination orders by creation timestamp and ID, retaining PostgreSQL microsecond precision.
- Descriptions contain action and current record title, without audit descriptions, review comments, or before/after payloads.
- Dashboard has independent Project activity / My activity controls, project and permitted member choices, project labels, record links, View more, manual refresh, and refresh every minute while active.
- Empty, loading, and error states are distinct. API failures fail closed.
- Defect links select the correct tab and include closed records. Milestone links select their project.

Deleted, unlinked, unknown resource types, and project-wide records without a resolvable module for a module-restricted viewer are intentionally omitted. Their audit records are retained. Standalone task and risk links open their relevant list pages.

## Verification

- 12 PostgreSQL-backed activity tests passed using isolated PGlite, no application database.
- 10 existing defect regression tests passed.
- API and frontend TypeScript checks passed after rebuilding generated library declarations.
- API and frontend production builds passed. Existing frontend sourcemap and large-chunk warnings remain.
- Local browser fixture passed: initial five items, View more to eight with no duplicates, own activity, member and project filters, empty results, simulated API failure, recovery, and manual refresh preserving filters.
- No live deployment verification was performed for these new changes.

The temporary browser fixture and local preview server were removed after verification. Reproducible database test instructions are in artifacts/api-server/tests/README.md.
