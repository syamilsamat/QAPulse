# Step 5 Findings — QM Pulse PRD

Written 2026-10-02 by the Step 5 session that produced `qm-pulse/context/PRD.md`. It
lists every decision, contradiction and defect found while checking the PRD against
the code (`artifacts/qm-pulse/src/` and the api-server routes it calls). Item IDs
(D/B/C) are stable and are referenced in the Step 5 conversation and in the
`# Pending Decisions` section of `CLAUDE.md`.

Status at hand-back:
- PRD complete: 28 modules, 207 user stories, 109 NFRs, 125 constraints, all
  `[v1.0.0]`, **untagged**.
- util-usanalyzer has been run; all its TODOs are resolved.
- util-ustagger has **not** run, because of the folder-prefix issue (D10).

How the PRD treats these findings: where the UI and server disagree, the PRD states
the intended rule (D2). The defects below are **not** written into the PRD as
requirements; they are recorded only here.

---

## A. Decisions

| ID | Decision | Status |
|---|---|---|
| D1 | Version for the existing system | **Resolved:** `[v1.0.0]`; recorded in CLAUDE.md |
| D2 | Where UI and server disagree, should the PRD state the intended rule (current approach) or the server's actual behaviour? | Open |
| D3 | Configuration → Team Members tab: `qa_lead` sees a create-user form that always fails (needs tier 3) | **Resolved:** v1.1.0 change agreed — the tab shows a read-only member list; `qa_lead` views only; create is limited to tier 3+ and `admin`. Not yet applied; apply with `util-updprd` after tagging |
| D4 | CR058–CR077 are missing from CHANGE_REQUESTS.md, but 17 of them are cited in shipped code. Backfill the register? | Open |
| D5 | File the defects in section C into `qm-pulse/context/BUG.md` for conductor-defect, or report only? (BUG.md not touched.) | Open |
| D6 | CR links are left out of PRD References so co2 generators don't read stale history. Keep it that way? | Open |
| D7 | The Dashboard module covers three pages (My Work Today, Dashboard, PM Dashboard), as in the §10 list. Split them? | Open |
| D8 | The team calendar is written under Dashboard; its reminders are under Notification, and hangouts feed it. Give it its own module? | Open |
| D9 | CLAUDE.md corrections (see C54, C60): the 15 roles are *default* roles (admins can add more); AI provider is Gemini + OpenRouter, not the OpenAI endpoint; PMO email is inline PNG + Excel, not PDF; SMTP default host is inconsistent | Open |
| D10 | util-ustagger and modelgen-relational only match numeric-prefixed folders (`1_qm-pulse`), so `qm-pulse` doesn't resolve. Rename the folders, or treat unprefixed as a match? Confirmed in Step 5 | Open — blocks tagging |

---

## B. CHANGE_REQUESTS.md vs code

- **B1.** CR048 says "pmo keeps its two-page special-casing". No `pmo` role exists anywhere in the code.
- **B2.** CR035 removed team-based project access, but the Teams page still says "assign users to projects by team" and still links teams to projects. Those links grant nothing (`access.ts:35`).
- **B3.** CR022: acceptance-criteria edits don't trigger re-review (only description edits do). The detail page can remove or move criteria but not add or reorder them.
- **B4.** CR030: no developer-assignment picker exists, so Start Work / Mark Ready for QA can't be reached. Defect assignment has no lead-tier check.
- **B5.** CR031: the server allows re-submitting an approved requirement; the UI doesn't offer it.
- **B6.** CR033: lessons learned aren't shown on milestone cards; there's no closure sign-off, only "closed by".
- **B7.** CR039: the Requirement Q&A chat is in the AI Hub and the global Copilot, not on the Requirements pages.
- **B8.** CR054: UAT upload is described as "lead-tier+", but the code allows `qa_member` and excludes `qa_manager`. Assignable-users isn't lead-tier only.
- **B9.** CR003: Case ID isn't carried into execution files (compile sends it blank).
- **B10.** CR002: the test-case export never fills the Review Log / Rework / Pareto / CAPA sheets.
- **B11.** CR008 / CR081: the unsaved-changes indicator and step renumbering live in the spreadsheet view, which can no longer be reached.
- **B12.** CR018: global search links to `/test-cases?tc=<id>`, but the library page only reads `?highlight=`.
- **B13.** The CR060 comment says the Tasks board is department-scoped; the code isn't. The CR068 comment says events are per requirement; the UI logs them per milestone. (CR060/068/074 aren't in the register.)
- **B14.** CR005 / CR016: the hierarchical (indented) RTM Excel export no longer exists. CR017: the "Milestone column" is missing from the RTM export.
- **B15.** CR026: no pass-rate colour thresholds, no Redis cache, no URL params, defect density isn't date-filtered, and the milestone doesn't set the time window. CR038 Utilization % is only on the PM Dashboard.
- **B16.** CR029 / CR030 put defect category and defect assignment at lead tier and above; the code lets everyone. CR080 says root cause has no tier gate; the code restricts it to the Dev department. CR019 says defect codes are per project; they're global.
- **B17.** `REDMINE_DEFECT_FIELD_MAPPING.md` is stale: `milestoneId` exists, screenshots are uploaded, and the tracker isn't locked.
- **B18.** CR036 says the route stays `/pmo-report` and is renamed "Verdict Report"; the code has `/verdict-report` and a separate `/report` page. CR039 says it relies on `nav:ai-hub` gating; the server has none, and the Copilot exposes it to all 15 roles. CR001's Excel path has changed.

---

## C. Defects and UI/server mismatches

"Confirmed" means the Step 5 session read the server code itself, not just a sub-agent's report.

### C-1. Security and data integrity
- **C1.** Execution sheet "Save" (full sync) deletes every stored row the client didn't send, including rows returned for rework (hidden from the sheet) and rows hidden by module access. **Data loss. Confirmed** (`test-execution.ts` ~1984-2001).
- **C2.** The execution-file approval lock and the "other QA's row" lock are UI-only; the save route never checks them. **Confirmed.**
- **C3.** `DELETE /requirements/:id`: any signed-in user can delete any requirement (no permission or project check). **Confirmed.**
- **C4.** Test case edit, delete, clone and detail: no project, module or role check on the server.
- **C5.** Calendar events: anyone can edit or delete any event, and `createdBy` comes from the client.
- **C6.** Requirement history, test-cases, dev-tasks, by-redmine and AI-analyse endpoints skip the project-access check.
- **C7.** Defect reassignment has no role or assignee check on the server.
- **C45.** Defects pulled from Redmine get no project, so every user can see them. PATCH can also set `projectId` to null.
- **C46.** Anyone with project access can change a defect's status, assignee, category or details; pull and sync have no role gate.
- **C50.** Team Hangouts: the UI offers edit and delete only to the organiser, but the server has no ownership check and `createdBy` comes from the client. Editing or deleting a hangout doesn't update or remove the calendar copy it created.
- **C52.** Verdict-report endpoints (report, execution-details, send-email, send-verdict) check login only, not project access, so any signed-in user can query or email any ticket.
- **C53.** Reporting: `senderName`, the "sent by" user and the report contents come from the client. Email HTML inserts defect names and subjects unescaped. No recipient cap and no check that recipients are contacts. Send Report with an empty To falls back to a hard-coded address.
- **C56.** AI: no AI endpoint checks role or `nav:ai-hub` on the server. Duplicate Check (first 50 test cases of *any* project) and Weekly Summary (all tasks and test cases) aren't project-scoped; the Duplicate Check UI says "in your project".
- **C57.** AI: the Requirement Chat candidate-chip path loads any requirement id as AI context with no project-access check. **Confirmed** (`ai.ts` ~1897-1925).
- **C58.** AI: no PII confirmation in the AI Hub or Copilot (only QA Pipeline step 2 asks). Prompts include user names and comments, and fall back to third-party OpenRouter models, including `:free` ones. No AI timeouts. Most AI failures return fake fallback results with HTTP 200, which the UI shows as real; the Analyzer saves the fallback as a real suggestion.
- **C59.** AI: General Copilot history stays in localStorage and isn't cleared on logout. Requirement Chat conversations are kept forever with no delete.

### C-2. Permission mismatches (UI vs server)
- **C8.** Audit Log: the route lets `cto` in, but the server is admin-only, so `cto` gets an error.
- **C9.** Configuration → Team Members: `qa_lead` sees a create-user form; the server needs tier 3+, so it always fails. (See D3.)
- **C10.** Configuration → Projects: the server is admin-only, but the form is shown more widely. Module create/delete has no server check at all.
- **C11.** User management: the Team page shows controls to `admin` only, but the server lets tier 3+ create users, reset passwords and deactivate, and lets `cto` delete users and change roles.
- **C12.** QA Pipeline step 8 deploy: any pipeline-edit role can deploy, including `qa_member` and `pm_member`; only reopening is restricted.
- **C13.** `qa_manager` is left out of: raising requirement defects, UAT upload, Data Prep upload, the QA-team member filter, and Data Prep staffing (gets 403).
- **C14.** `dev_lead` sees the milestone Edit dialog but saving fails with 403; the server would let them staff a milestone, but the UI hides that section.
- **C15.** PM Dashboard: the nav permission can be edited, but the server role list is fixed, so granting it to another role leads to 403.
- **C30.** Risk Register: the write roles (tier 2+) include `qa_manager`, `hod_qa`, `hod_fa`, `hod_dev` and `dev_lead`, but the `/risk-register` route only allows `hod_pm`, `pm_lead`, `pm_member`, `qa_lead`, `fa_lead`, `admin` and `cto`.
- **C36.** `/dashboard/task-board` has no role check; roles without `nav:tasks` can still call it.
- **C40.** QA Analytics: the server role list is hard-coded, so granting `nav:qa-analytics` to another role leads to 403. With a milestone selected, the date inputs are disabled but still drive the week axis. CSV export has no quoting, so commas break columns.

### C-3. Functional defects
- **C16.** Passwords: the server requires 8 characters; the Login forced-change screen and Settings accept 6.
- **C17.** Calendar "Date To" is dropped (missing from the create/update API schema), so multi-day events become single-day. **Confirmed.**
- **C18.** PM Dashboard capacity hours and utilisation always show 0.
- **C19.** Test case "Redmine Defect #" is never saved; edits to a test case's project or author are silently dropped.
- **C20.** The BDD generator returns cases but never saves them; the screen still says "generated".
- **C21.** Redmine attachment sync on the requirement list can never run (the proxy leaves out attachments).
- **C22.** QA Pipeline step 2 sync doesn't send `redmineSync`, so QA users who aren't project members get 403.
- **C23.** The session-expiry toast says "Click to stay logged in" but has no action.
- **C24.** My Work Today: the Urgent counter counts different items from the Urgent section.
- **C25.** "Executed %" has three different formulas (dashboard, sheet, summary page).
- **C26.** Execution live updates (SSE) probably never connect, because the query-string token is blocked by earlier login checks. Not verified at runtime.
- **C27.** Cloning an execution file turns group headings into test cases and resets the file type to QA.
- **C28.** Module scoping compares exact strings, so multi-module values ("A,B") never match a module-restricted user.
- **C31.** Risk Register: the server validates only response strategy; category, probability, impact and status accept any value.
- **C32.** Assigning a risk owner sends no notification.
- **C33.** Task notifications link `/tasks?highlight=<dev-task id>`, but the Tasks page reads `highlight` as a requirement id.
- **C35.** The "late" rule differs between the Tasks page (progress < 100) and the Dashboard (milestone not completed).
- **C37.** Task events: no end ≥ start check, and the edit form can't change which requirements an event covers (the server allows it).
- **C38.** Traceability BSB export skips sibling-ticket widening and milestone-scoped results, so it can list different test cases from the on-screen matrix.
- **C39.** Traceability: changing the project doesn't reset the milestone, so a stale `milestoneId` is sent. Summary cards count context-only ancestor rows.
- **C41.** QA Analytics coverage counts only library test cases, so it can disagree with the Traceability Matrix.
- **C42.** Defect "Steps to Reproduce" edits are lost: the PATCH allowlist leaves the field out. **Confirmed** (`defects.ts:1773`).
- **C43.** Defect descriptions pushed from New Defect use a format the description parser can't read, so later field edits don't merge cleanly.
- **C44.** Defect notification and search links omit `&tab=`, so production and requirement defects open on the QA tab and aren't found.
- **C47.** Severity is never sent to Redmine as priority.
- **C48.** The "Link" button on similar issues in New Defect does nothing. Found In in the execution fail modal is collected but never sent.
- **C49.** UAT Sign-off: file type is restricted only by the browser's file picker; the server accepts any MIME type.
- **C55.** `/report` (Report Dashboard) has no sidebar link and runs its AI over every project, unscoped. The verdict rule is "100% pass rate" on Verdict Report but "0 failed and 0 blocked" on the Execution Dashboard.

### C-4. Documentation and code hygiene
- **C29.** Platform Issues hard-codes two developers' email addresses as alert recipients (left out of the PRD).
- **C34.** Several code comments call `tasksTable` "orphaned / nothing writes it", but Dev Tasks still write it, and My Work Today and the AI routes read it.
- **C51.** A `dashboard.ts` comment (Resources) says bootstrap adds every user to every project; CR035 removed that.
- **C54.** SMTP host defaults to smtp.gmail.com in `verdict-report.ts` but smtp.office365.com in `lib/email.ts`. CLAUDE.md says PMO reports email "HTML + PDF", but no PDF is ever attached (inline PNG + Excel).
- **C60.** The `lib/integrations-openai-*` packages are unused. CLAUDE.md names `AI_INTEGRATIONS_OPENAI_BASE_URL` as the AI endpoint, but the real provider is Google Gemini with OpenRouter fallback.

---

## D. Evidence notes
- **Thin evidence:** Accessibility (4 NFRs, no stories). The code offers little more: Radix primitives, a few `aria-label`s, reduced motion on the landing page only.
- **Code only:** CR058–CR077 features (Tasks redesign, History Trail events, and others) are documented nowhere but the code.
- **Left out of the PRD:** the 6 undeployed CRs (009, 010, 012, 013, 021, 082); unrendered or disabled code (Settings document register, Redmine card behind `{false && …}`, spreadsheet execution view, UAT Word export, conditional verdict path on the Execution Dashboard); and non-functional features (BDD generation, developer assignment).
- **Sub-agent corrections:** two sub-agent reports claimed some AI and Redmine endpoints need no login. That is wrong: the router-level login checks in `requirements.ts:49` and `test-cases.ts:37` run for every router mounted after them (`routes/index.ts`).
