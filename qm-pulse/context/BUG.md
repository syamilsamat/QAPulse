# BUG.md — qm-pulse (frontend)

Input file for `/conductor-defect qm-pulse`. Report bugs here as bullet items under
the relevant module heading.

**This file is intentionally empty of live bugs.** The module skeleton below mirrors
the Domains in `CLAUDE.md`. A worked example sits inside an HTML comment at the
bottom — copy it out of the comment when filing a real bug.

> **Why the example is commented out:** `conductor-defect` Step 1.2 tags and then
> attempts to fix **every untagged bullet** it finds under a module heading. A live
> example bullet would be picked up as a real bug and "fixed". Keep examples inside
> `<!-- -->`, and only ever un-comment a bullet you actually want worked on.

With no live bullets, a conductor run resolves zero bugs and stops cleanly — that
is the expected state, not an error.

## Conventions

Written as prose, not bullets, and with no literal version tag anywhere outside a
comment — a bullet here would be collected as a bug, and a bare version tag would
be picked up by the conductor's version scan.

**Version tags.** Put a version in square brackets, such as v1.0.0, on its own line
before the bullets belonging to that version. Versions are processed sequentially in
ascending semver order.

**Bug tags.** The conductor writes `BUG-XXX` tags itself. Leave new bugs untagged.

**Placement.** Keep each bug under the module whose behaviour is wrong. The H1
groups (`# Common`, `# System Module`, `# Business Module`) are organisational only
— never file a bug directly under one.

**Not every bug suits this workflow.** The conductor reproduces with Playwright, so
bugs that cannot be reproduced in a browser — build scripts, env and config, Windows
path handling — will be marked `CANNOT_REPRODUCE`. File those as plain issues
instead.

---

# Common

## UI/UX Standards

---

## Accessibility

---

# System Module

## Authentication

---

## Role

---

## User and Team

---

## Setting

---

## Notification

---

## Audit Trail

---

## History Trail

---

## Admin Search

---

## Platform Issues

---

## Configuration

---

# Business Module

## Dashboard

---

## Requirements

---

## Milestones

---

## QA Pipeline

---

## Test Cases

---

## Test Execution

---

## Tasks

---

## Defects

---

## Traceability

---

## QA Analytics

---

## Risk Register

---

## UAT Sign-off

---

## Resources

---

## Reporting

---

## AI Features

---

## Team Hangouts

---

<!--
================================================================================
WORKED EXAMPLE — commented out on purpose. Copy the bullet below out of this
comment, place it under the right module heading, and delete the [BUG-XXX] tag
(the conductor assigns tags itself).

This example is a real, verified bug, kept here because it shows the right level
of detail: an exact route, an exact observable symptom, and a file:line pointer.

# Business Module

## Test Execution
[v1.0.0]
- Opening a test execution detail page fails to subscribe to live updates, and
  leaks the auth token into the URL
  - Priority: High
  - Steps to Reproduce:
    1. Log in as admin
    2. Navigate to /test-cases/execution-details
    3. Open the browser devtools Network tab
  - Expected Result: the EventSource subscription to /api/execution-events
    connects, and no credential appears in any request URL
  - Actual Result: GET /api/execution-events?token=<JWT> returns 401, so live
    updates never arrive. The JWT is passed as a query parameter, so it is
    recorded in server logs, proxy logs and browser history.
  - Notes: TestExecutionDetail.tsx:290 builds the URL. EventSource cannot send
    headers, which is why the token was put in the query string;
    test-execution.ts:112 already special-cases access control for this route.

Field notes:
  - "Priority" is free text; High / Medium / Low is the convention.
  - "Actual Result" is not in co2's minimal format but is worth including — the
    conductor uses it to confirm it has reproduced the right thing.
  - A file:line pointer saves the conductor a search. Include one when known.
================================================================================
-->
