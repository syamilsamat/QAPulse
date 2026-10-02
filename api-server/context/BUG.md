# BUG.md — api-server (backend)

Input file for `/conductor-defect api-server`. Report bugs here as bullet items
under the relevant module heading.

**This file holds 12 live bugs**, all of them missing or incomplete server-side
authorization found during the Step 5 PRD review on 2026-10-02. Every one was read in
the api-server source, and the five marked **Verified** were additionally re-read
line-by-line before filing. They are ordered most severe first, because
`conductor-defect` works through them in file order.

The remaining ~48 findings from that review are recorded in `STEP5-FINDINGS.md` at the
repo root and deliberately NOT filed here — they are permission mismatches, functional
defects and documentation drift, and mixing them in would bury the items below.

> **Why the example at the bottom is commented out:** `conductor-defect` Step 1.2 tags
> and then attempts to fix **every untagged bullet** it finds under a module heading. A
> live example bullet would be picked up as a real bug and "fixed". Keep examples inside
> `<!-- -->`, and only ever un-comment a bullet you actually want worked on.

## Conventions

Written as prose, not bullets — a bullet here would be collected as a bug.

**Version tags.** A version in square brackets sits on its own line before the bullets
belonging to that version. Versions are processed sequentially in ascending semver
order. Everything below is tagged to the current system version, matching
`qm-pulse/context/PRD.md`.

**Bug tags.** The conductor writes `BUG-XXX` tags itself. New bugs are left untagged.

**Placement.** The H1 groups (`# Common`, `# System Module`, `# Business Module`) are
organisational only — never file a bug directly under one. There are **53 route files**
under `artifacts/api-server/src/routes/`; the modules below are groupings, not a 1:1
file map.

**Backend bugs are often not browser-reproducible**, and the conductor reproduces with
Playwright. Each bug below therefore gives an exact request — method, path, headers,
body — plus the expected versus actual status, so the reproduction can be driven
through Playwright's `request` fixture rather than a page. The `bugs` Playwright project
supplies an authenticated admin session automatically; to prove an authorization gap you
will need a **second, lower-privileged** session, which means logging that user in
explicitly via `POST /api/auth/login` inside the spec.

**A note on fixing these.** Every bug here is a missing check, so the fix is additive:
add the guard, return 403, leave the happy path alone. The helpers already exist —
`canAccessProject` / `scopeToUserProjects` in `middleware/access.ts`, and
`canAccessDefectProject` in `defects.ts`. Prefer them over writing new ones. Several
routes in the same file already call them correctly; copy the local pattern.

---

# Common

## Error Handling and Status Codes

---

## Logging and Observability

---

## Rate Limiting and Security Headers

---

# System Module

## Authentication

---

## Users and Roles

---

## Teams

---

## Notifications and Calendar
[v1.0.0]
- Any authenticated user can edit or delete any calendar event, and the event's owner is taken from the request body
  - Priority: High
  - Steps to Reproduce:
    1. As user A, POST /api/calendar/events to create an event
    2. Log in as user B — any role, no shared project required
    3. As user B, PATCH /api/calendar/events/<id> with {"title":"hijacked"}
    4. As user B, DELETE /api/calendar/events/<id>
  - Expected Result: 403 on both — a calendar event should be editable only by its
    creator, or by a role explicitly permitted to manage others' events
  - Actual Result: both succeed. The PATCH returns 200 with the modified event; the
    DELETE removes it
  - Notes: calendar.ts:105 (PATCH) and calendar.ts:150 (DELETE) parse params and body,
    then go straight to db.update / db.delete. There is no getAuthContext call and no
    ownership comparison in either handler. Separately, POST /calendar/events
    (calendar.ts:81) takes createdBy from the client body rather than from the session,
    so an event can be created already attributed to someone else. Verified — both
    handlers read in full.
- Team Hangouts have no ownership check on the server, and editing or deleting one leaves its calendar copy behind
  - Priority: Medium
  - Steps to Reproduce:
    1. As user A, create a hangout — note that it also creates a calendar event
    2. As user B, PATCH then DELETE that hangout
    3. Re-read /api/calendar/events
  - Expected Result: 403 for user B, since the UI offers edit and delete only to the
    organiser. When the organiser does delete a hangout, its calendar copy is removed
  - Actual Result: user B's edit and delete both succeed. The calendar copy survives a
    hangout deletion and is never updated when the hangout changes, so the calendar
    keeps showing a hangout that no longer exists
  - Notes: the organiser-only restriction exists in the frontend only. createdBy also
    comes from the client here, same pattern as the calendar bug above. The orphaned
    calendar copy is a second, independent defect in the same handler — fix both or
    note which is deferred.

---

## Audit Log

---

## Search

---

## Platform Issues

---

# Business Module

## Projects and Modules

---

## Requirements
[v1.0.0]
- Any authenticated user can permanently delete any requirement, with no project or role check
  - Priority: Critical
  - Steps to Reproduce:
    1. Log in as the lowest-privileged user available (for example a qa_member with
       access to exactly one project)
    2. Find the id of a requirement belonging to a project that user is NOT a member of
    3. DELETE /api/requirements/<id> with that user's bearer token
  - Expected Result: 403, and the requirement still exists
  - Actual Result: 204/200. The requirement row is deleted and the deletion is written
    to the activity log attributed to that user
  - Notes: requirements.ts:737 validates the id with DeleteRequirementParams and then
    calls db.delete(requirementsTable) immediately. There is no canAccessProject call
    and no role gate — the router-level login check is the only thing standing in front
    of it. Compare PATCH /requirements/:id in the same file, which does more checking
    than the destructive route does. This is the most severe item in this file: the
    deletion is irreversible and cascades to linked rows. Verified — handler read in
    full.
- Several requirement sub-resources skip the project-access check that the main requirement routes apply
  - Priority: High
  - Steps to Reproduce:
    1. As a user with no membership of project P, pick a requirement id belonging to P
    2. Call each of: GET /api/requirements/<id>/history,
       GET /api/requirements/<id>/test-cases, GET /api/requirements/<id>/dev-tasks,
       GET /api/requirements/by-redmine/<ticketId>, and the AI-analyse endpoint for
       that requirement
  - Expected Result: 403 from each, matching GET /api/requirements/<id>
  - Actual Result: each returns the data
  - Notes: the project-scoping helper is applied on the list and detail routes but not
    on these five. The AI-analyse path is the most sensitive of them because it sends
    the requirement's content to a third-party model.

---

## Milestones and UAT Sign-off

---

## Test Cases
[v1.0.0]
- Test case edit, delete, clone and detail have no project, module or role check on the server
  - Priority: High
  - Steps to Reproduce:
    1. As a user with access to project P only, find a test case id in project Q
    2. PATCH /api/test-cases/<id> with {"title":"changed"}
    3. POST /api/test-cases/<id>/clone
    4. DELETE /api/test-cases/<id>
  - Expected Result: 403 from all four
  - Actual Result: all four succeed
  - Notes: test-cases.ts:580 (PATCH) calls getAuthContext and returns 401 when there is
    no session — then goes straight to db.update with no further check, so login is the
    only barrier. The same shape repeats at test-cases.ts:609 (DELETE) and
    test-cases.ts:634 (clone). Verified — PATCH handler read in full.

---

## Test Execution
[v1.0.0]
- Saving an execution sheet deletes stored rows the client did not send, including rows the client was never shown
  - Priority: Critical
  - Steps to Reproduce:
    1. Open an execution file that contains rows returned for rework (these are hidden
       from the sheet) or rows belonging to a module the current user cannot see
    2. Make any trivial edit and press Save, which issues a full sync
    3. Re-read the execution file's rows
  - Expected Result: only the rows the client sent are updated; rows withheld from the
    client are left untouched
  - Actual Result: every stored row absent from the incoming testCases array is deleted,
    so rework rows and module-hidden rows are destroyed by a normal save
  - Notes: test-execution.ts:1984, the isFullSync branch, computes orphanIds as
    "existing rows not in the incoming list, minus safeDeleteIds" and deletes them.
    Hidden rows are never in the incoming list, so they always qualify as orphans.
    This is silent, user-triggered data loss during ordinary use, which is why it sits
    above the authorization bugs in the same module. Verified — branch read in full.
- The execution-file approval lock and the per-QA row lock are enforced only in the UI
  - Priority: High
  - Steps to Reproduce:
    1. Approve an execution file, so the UI makes it read-only
    2. POST the save/sync payload for that file directly, bypassing the UI
    3. Repeat against a row the UI attributes to a different QA engineer
  - Expected Result: 403 for an approved file, and 403 when writing another QA's row
  - Actual Result: both writes are accepted
  - Notes: the save route never reads the file's approval state or compares row
    ownership. Verified.

---

## Tasks

---

## Defects
[v1.0.0]
- Defects pulled from Redmine are stored with no project, making them visible to every user, and a PATCH can clear the project of any defect
  - Priority: High
  - Steps to Reproduce:
    1. Pull production defects from Redmine
    2. Query /api/defects as a user who is a member of no project
    3. Separately, PATCH /api/defects/<id> with {"projectId": null}
  - Expected Result: pulled defects carry the project they belong to, and projectId
    cannot be set to null by a client
  - Actual Result: pulled defects have projectId null. Because the access helper treats
    a null project as unscoped, every authenticated user sees them. The PATCH also
    accepts projectId null, which converts any scoped defect into an unscoped one
  - Notes: projectId is in the PATCH allowlist at defects.ts:1772. The null-project
    fallback is deliberate for legacy rows, so the fix is to set the project on pull
    rather than to change the fallback, plus reject an explicit null in the PATCH.
- Any user with access to a defect's project can change its status, assignee, category and details, with no role check
  - Priority: Medium
  - Steps to Reproduce:
    1. As a qa_member with access to project P, pick a defect in P
    2. PATCH /api/defects/<id>/status, then PATCH /api/defects/<id>/assign
    3. POST /api/defects/pull-production and POST /api/defects/sync-statuses
  - Expected Result: per CR029 and CR030, defect category and defect assignment are
    lead tier and above; pull and sync are at least role-gated
  - Actual Result: all succeed for any role with project access
  - Notes: defects.ts guards defectCategory with canSetDefectCategory but silently
    drops the field rather than rejecting the request, so a caller gets a 200 and
    assumes it was applied. /defects/:id/assign (defects.ts:1386) has no role check and
    no check that the assignee is a plausible target. Note CR080's root-cause field is
    the opposite case — restricted to the Dev department where the CR says it should
    have no tier gate.
- Defect reassignment has no role check and no validation of the new assignee
  - Priority: Medium
  - Steps to Reproduce:
    1. As any user with project access, PATCH /api/defects/<id>/assign with
       {"assigneeId": <any user id>}
  - Expected Result: 403 unless the caller is lead tier or above, and 400 if the
    assignee is not a valid target for this defect
  - Actual Result: 200, and the defect is assigned to the given user id
  - Notes: defects.ts:1386. Overlaps the previous bug; fix together if the conductor
    reaches them in sequence.

---

## Risks

---

## Traceability

---

## Dashboard and Reporting
[v1.0.0]
- Verdict-report endpoints check only that the caller is logged in, so any user can read or email any ticket's report
  - Priority: High
  - Steps to Reproduce:
    1. As a user who is a member of no project, call
       GET /api/verdict-report/report?ticketId=<any ticket>
    2. Call GET /api/verdict-report/execution-details for the same ticket
    3. Call POST /api/verdict-report/send-email and POST /api/verdict-report/send-verdict
  - Expected Result: 403 on all four — report data is project data
  - Actual Result: all four succeed. The send-email paths will deliver a report for a
    ticket the caller has no access to
  - Notes: verdict-report.ts:757 (report), :97 and :179 (execution-details), :1424
    (send-email), :1555 (send-verdict). The file has no canAccessProject call anywhere.
    The two send paths are the serious half: they turn a read gap into outbound email.
- The report email trusts the client for its sender, its contents and its recipients, and inserts defect text unescaped
  - Priority: High
  - Steps to Reproduce:
    1. POST /api/verdict-report/send-email with senderName and the "sent by" user set
       to another person's name, a long recipient list, and report content supplied in
       the body
    2. Include a defect whose name or subject contains HTML, for example
       <img src=x onerror=alert(1)>
    3. Separately, POST the same endpoint with an empty To field
  - Expected Result: sender and attribution come from the session; recipients are
    capped and validated against the contact list; defect text is HTML-escaped; an
    empty recipient list is a 400
  - Actual Result: the email is sent as the named sender with client-supplied content.
    Defect names and subjects are interpolated into the HTML body unescaped. There is
    no recipient cap and no check that recipients are known contacts. An empty To falls
    back to a hard-coded address
  - Notes: this is four defects in one handler — impersonation, HTML injection into
    whatever client renders the email, unbounded outbound send, and a hard-coded
    fallback recipient. Worth fixing as one pass over the handler. Treat the hard-coded
    address as the easiest win and the unescaped interpolation as the most serious.

---

## Excel Builder and Templates

---

## Redmine Integration

---

## AI

---

<!--
================================================================================
WORKED EXAMPLE — commented out on purpose. Copy the bullet below out of this
comment, place it under the right module heading, and delete the [BUG-XXX] tag
(the conductor assigns tags itself).

This example is a real, verified bug, kept here because it shows the right level
of detail for an API-only defect: exact request, exact status, exact payload.

# Common

## Error Handling and Status Codes
[v1.0.0]
- A missing or rejected Redmine credential is reported as 500, not as a 4xx
  - Priority: Medium
  - Steps to Reproduce:
    1. Ensure neither REDMINE_API_KEY nor users.redmine_api_key is set
    2. GET /api/redmine/trackers with a valid QM Pulse bearer token
  - Expected Result: a 4xx status identifying this as a credential/configuration
    problem (401 or 403), so a caller can tell it apart from an outage
  - Actual Result: 500 with
    {"error":"Failed to fetch trackers: Redmine API returned status: 401"}
  - Notes: redmine.ts:311 maps every upstream failure to 500 — bad key, expired
    key, DNS failure and timeout are indistinguishable. This also contradicts the
    repo's own contract at scripts/src/preprod-smoke.ts:148, which asserts that
    authenticated reads never return 5xx. Low user impact: Defects.tsx:373 does
    `if (!res.ok) return []`, so the page degrades to an empty dropdown rather
    than breaking.
  - Caveat: `curl` cannot reach redmine.bestinet.my from this machine (returns
    000) but Node's fetch can. Reproduce through the API server, not via curl.

Field notes:
  - For an API bug, prefer an exact request over UI steps — it can be driven
    with Playwright's `request` fixture, no page needed.
  - State the expected STATUS, not just the expected behaviour.
  - Note anything that makes reproduction environment-dependent, as the curl
    caveat does above.
================================================================================
-->
