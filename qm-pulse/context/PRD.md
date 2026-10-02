# QM Pulse

# Common

## UI/UX Standards

### User Story
[v1.0.0]
- As a qa_member, I want a collapsible left sidebar grouped into sections that shows only the pages my role is permitted to open so that I can reach my work without seeing links that would reject me.
  - Sections, in order: My Workspace, Delivery Flow, AI, Communication, People & Resources, Administration.
  - My Work Today, Dashboard, Platform Issues and Account are always visible to every signed-in user.
  - Collapsing reduces the sidebar to icons, with a flyout for items that have sub-pages.
- As a qa_member, I want to open a global search from any page with Ctrl+K or Cmd+K so that I can jump to any record without knowing which page it lives on.
  - Searches requirements, test cases, tasks, defects, milestones, risks, UAT sign-offs, projects, modules, contacts, users and teams.
  - Results are grouped by record type and can be narrowed to a single type.
- As a qa_member, I want to switch between light and dark theme so that I can work comfortably in different lighting conditions.
- As a qa_member, I want a link that carries a highlight parameter to scroll the matching row into view and briefly ring it so that I can find the exact item a notification refers to.
- As a dev_member, I want the sidebar to become a slide-out drawer on narrow screens so that I can use QM Pulse from a small display.

### Non Functional Requirement
[v1.0.0]
- Every page except the landing page and sign-in is loaded on demand per route, with one shared full-screen spinner shown while a page loads or while permissions resolve.
- Fetched data is reused for 30 seconds during normal navigation, failed reads are retried once, and data is not refetched when the browser window regains focus.
- The sidebar's collapsed or expanded state is remembered per browser.
- Global search runs only once at least 2 characters are typed and is debounced while the user types.
- Success and failure feedback is shown as toast notifications, with a distinct destructive style for failures.
- An application-level error boundary catches unhandled rendering errors so that one broken component does not blank the whole application.

### Constraint
[v1.0.0]
- The UI is built with Tailwind CSS and Radix UI / shadcn-ui components.
- Only the landing page (`/`) and the sign-in page (`/login`) are reachable without signing in; both redirect a signed-in user to `/my-work`.
- An unknown address shows a Not Found page, inside the application shell when the user is signed in.

## Accessibility

### Non Functional Requirement
[v1.0.0]
- Dialogs, menus, selects, tabs, tooltips and other interactive components are built on Radix UI primitives, which supply keyboard navigation, focus management and ARIA roles.
- Icon-only controls carry an accessible name, as the theme toggle does with `aria-label`.
- Password fields offer a show/hide toggle so that users can check what they typed.
- The animated 3D scene on the landing and sign-in pages honours the operating system's reduced-motion preference.

# System Module

## Authentication

### User Story
[v1.0.0]
- As a qa_member, I want a public landing page when I am not signed in, with a way through to sign-in, so that I understand what QM Pulse is before I log in.
- As a qa_member, I want to sign in with my email address and password so that I can use QM Pulse with my own role and data.
  - On success the user lands on My Work Today (`/my-work`).
  - On failure a "Login failed" message is shown without revealing whether the email or the password was wrong.
- As a qa_member, I want a "Remember me" option at sign-in so that I can choose whether my session survives closing the browser.
  - Ticked: the session is kept in persistent browser storage.
  - Unticked: the session is kept for the browser session only.
- As a qa_member, I want to be made to set a new password at first sign-in when my account requires it so that the initial password an admin gave me is not kept.
  - The new password must be entered twice and match.
  - After the change the user must sign in again with the new password.
- As a qa_member, I want my session to be renewed silently while I am working so that I am not logged out in the middle of a task.
- As a qa_member, I want to sign out so that my session is revoked and cannot be reused on this device.

### Non Functional Requirement
[v1.0.0]
- The access token is a JWT that expires after 1 hour. The refresh token is valid for 7 days and is replaced with a new one on every refresh.
- The session is refreshed silently 2 minutes before the access token expires; if the refresh fails, the user is logged out.
- A "Session expiring soon" notice is shown 5 minutes before the access token expires.
- When an API call made through the generated API client is rejected as unauthorised, the client refreshes the session once and retries the call before logging the user out.
- On application load, a stored session is validated against the server before it is trusted; an invalid session is cleared and the user is sent to sign-in.
- Signing out blacklists the access token and revokes the refresh token on the server, and clears every stored session value from the browser.
- Sign-in attempts are rate-limited to 20 per 15 minutes, and all API requests to 300 per minute.
- An unknown email and a wrong password return the same "Invalid credentials" response after a randomised delay, so that valid accounts cannot be discovered.
- A deactivated account is refused sign-in with the message "Your account has been deactivated. Please contact your administrator."
- Every successful sign-in is recorded in the `Audit Trail` with the client IP address.

### Constraint
[v1.0.0]
- Email and password is the only sign-in method.
- Email addresses are matched case-insensitively, ignoring surrounding spaces.
- A new password must be at least 8 characters; the server enforces this on every password change.
- The session is held in the browser under the keys `qa_pulse_token`, `qa_pulse_user` and `qa_pulse_refresh_token`, in localStorage when "Remember me" is ticked and sessionStorage otherwise.
- API calls made with raw `fetch()` instead of the generated client, including every `/redmine/*` call, do not get the refresh-and-retry behaviour.

### Reference
[v1.0.0]
- The authentication endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/change-password`) are defined in [openapi.yaml](../../lib/api-spec/openapi.yaml).

### Test
[v1.0.0]
- Playwright specs receive an authenticated admin session from `e2e/auth.setup.ts`; specs must not script their own sign-in flow.

## Role

### User Story
[v1.0.0]
- As a admin, I want to list every role with its display name, department, tier, number of users and system or custom type so that I can see how access is organised.
- As a admin, I want to create a custom role with a role name, display name, department and tier rank so that I can model a job function the default roles do not cover.
- As a admin, I want to edit a role's display name, department and tier rank so that role labels shown across the application stay accurate.
  - Renaming a custom role also moves every user who holds it to the new name.
- As a admin, I want to delete a custom role that no one holds so that unused roles do not clutter the list.
  - A role still held by users cannot be deleted; the message names how many users must be moved first.
- As a admin, I want to choose which pages each role may open so that I can grant or withdraw access without a code change.
- As a admin, I want to view an access matrix of every role against every page so that I can review the whole permission model at once.
  - Roles are grouped by department and sorted by tier, highest first.
  - An Access view shows a tick for each granted page.
  - A RACI view shows each role's Responsible, Accountable, Consulted or Informed stake per page and flags any Responsible, Accountable or Consulted role that lacks access to that page.

### Non Functional Requirement
[v1.0.0]
- Route access is decided by the same page permission keys that drive sidebar visibility, so a visible sidebar item can never lead to a page that then rejects the user.
- When a page has a permission key, the user's granted keys are authoritative. A fixed list of roles per page is used only as a fallback when the permission fetch fails, or for pages with no permission key.
- A user who is denied a page is redirected to the Dashboard. A spinner, not a redirect, is shown while permissions are still loading.
- A user's granted page permissions are cached in the browser for up to 5 minutes, so a permission change can take up to 5 minutes to reach a signed-in user.
- Role display names are read from the roles list, with a built-in fallback name for each default role.
- The RACI designations are fixed in the application and are not stored or editable; only the access gaps are computed from live permissions.

### Constraint
[v1.0.0]
- The application ships with 15 default roles; these role names are the only valid roles in this document:
  - `admin` (Admin)
  - `cto` (CTO / Director)
  - `hod_qa` (Head of QA)
  - `hod_pm` (Head of PM)
  - `hod_fa` (Head of FA)
  - `hod_dev` (Head of Dev)
  - `qa_manager` (QA Manager)
  - `qa_lead` (QA Lead)
  - `qa_member` (QA Member)
  - `fa_lead` (FA Lead)
  - `fa_member` (FA Member)
  - `dev_lead` (Dev Lead)
  - `dev_member` (Developer)
  - `pm_lead` (PM Lead)
  - `pm_member` (PM Member)
- `admin` is the only system role: it holds every page permission, bypasses every route check, cannot be renamed or deleted, and its permissions cannot be edited.
- Only an `admin` may open the Roles page, and only an `admin` may create, edit or delete roles or change their permissions; the server enforces this.
- Each role may belong to one department and one tier:
  - Departments: QA, PM, FA / BI, Dev.
  - Tiers: 1 Member, 2 Lead, 3 Manager, 4 HOD, 5 CTO.
  - QA is the only department with a tier-3 role (`qa_manager`).
- Page permissions are granted per role using these keys: `nav:requirements`, `nav:test-cases`, `nav:traceability`, `nav:tasks`, `nav:ai-hub`, `nav:report`, `nav:inbox`, `nav:team`, `nav:admin-search`, `nav:team-hangouts`, `nav:configurations`, `nav:qa-pipeline`, `nav:milestones`, `nav:pm-dashboard`, `nav:audit-log`, `nav:qa-analytics`, `nav:defects`, `nav:resources`, `nav:risk-register`, `nav:uat-signoffs`.
- For the Audit Log, PM Dashboard and QA Analytics, a page permission controls only whether the page is shown; the server still applies the fixed role list stated in `Audit Trail`, `Dashboard` and `QA Analytics`, so granting `nav:audit-log`, `nav:pm-dashboard` or `nav:qa-analytics` to another role does not give it access to the data.
- Pages open to every signed-in user, with no permission key: My Work Today, Dashboard, Account (Settings), Platform Issues and Verdict Report. Roles and Teams are restricted to `admin`.

## User and Team

### User Story
[v1.0.0]
- As a qa_lead, I want to browse a directory of users showing each person's name, email, role, team and whether they are inactive so that I know who is on the team.
- As a qa_lead, I want to open a user's profile panel so that I can see their workload and delivery record.
  - Tasks completed, pending and blocked.
  - Test cases created.
  - On-time completion rate.
  - Recent activity.
- As a admin, I want to create a user with a full name, email, initial password, role and team so that a new colleague can sign in.
- As a admin, I want to edit a user's name, email, role and team so that their record stays correct when they move.
- As a admin, I want to reset a user's password so that someone who is locked out can regain access.
  - The new password must be entered twice and match.
- As a admin, I want to set a user inactive or active again so that a leaver loses access without their history being lost.
- As a admin, I want to delete a user after confirming so that accounts created in error can be removed.
- As a admin, I want to create, edit and delete teams with a name, department and optional linked projects so that people are grouped the way the organisation works.
- As a admin, I want to add users to a team as Member or Lead, change their team role and remove them so that team membership stays current.

### Constraint
[v1.0.0]
- On the Team page, only an `admin` sees the controls to create, edit, reset the password of, deactivate or delete a user, and an `admin` cannot edit another `admin`.
- The server applies these rules to user management regardless of which page calls it:
  - Creating a user, resetting another user's password, changing a user's email and activating or deactivating a user require tier 3 (Manager) or above.
  - Changing a user's role and deleting a user require `admin` or `cto`.
  - Only `admin` or `cto` may create an `admin` or `cto` account or reset an `admin` or `cto` password.
  - A user can never reset their own password through user management; they must use their own password change, which checks the current password.
- Every newly created user, and every user whose password is reset by someone else, must change their password at next sign-in.
- Only an `admin` may open the Teams page.
- A new or reset password must be at least 8 characters.
- Users offered for a team are filtered by the team's department; `admin` and `cto` users can join any team:
  - QA team: `qa_member`, `qa_lead`, `hod_qa`.
  - PM team: `pm_member`, `pm_lead`, `hod_pm`.
  - Dev team: `dev_member`, `dev_lead`, `hod_dev`.
  - FA team: `fa_member`, `fa_lead`, `hod_fa`.
- Linking a team to a project is an organisational label only and grants no project access; project access is assigned person by person in `Configuration`.

## Setting

### User Story
[v1.0.0]
- As a qa_member, I want to update my display name, team and profile photo so that colleagues recognise me in QM Pulse.
  - Photos may be JPG, PNG, GIF or WebP up to 2 MB.
  - Email is shown but cannot be changed.
- As a qa_member, I want to opt in to receiving my notifications by email so that I do not miss updates while I am away from QM Pulse.
  - Off by default; when on, everything that would notify the user in the `Notification` inbox is also emailed to their account address.
- As a qa_member, I want to save my personal Redmine API key so that defects and Redmine look-ups I trigger are made under my own Redmine identity.
  - The key is masked with a show/hide toggle.
  - Leaving it blank uses the system default key.
- As a qa_member, I want to change my password by giving my current password and a new one twice so that I can keep my account secure.
- As a qa_member, I want to see my current role and what it allows so that I understand my access, with a note to contact an admin to change it.
- As a qa_member, I want an About tab showing what QM Pulse is and its version so that I can quote the version when I report a problem.

### Non Functional Requirement
[v1.0.0]
- A saved Redmine API key takes effect immediately for the signed-in session without signing in again.

### Constraint
[v1.0.0]
- The Account page is open to every signed-in user and only ever changes that user's own record.
- Changing one's own password requires the current password, and the new password must be at least 8 characters.

## Notification

### User Story
[v1.0.0]
- As a qa_member, I want a notification bell in the sidebar with an unread count and my five most recent unread notifications so that I notice new activity without leaving my page.
  - The dropdown offers Mark all as read and a link to the full inbox.
- As a qa_member, I want an inbox listing all my notifications, newest first, so that I can review everything that has happened to my work.
  - Each notification shows a type badge, such as Task, Overdue, Review, Approved, Rejected, Revision, Defect, Reopened, Retest, Returned, Returned to FA, UAT, Milestone or Comment.
  - Unread notifications are visually marked.
- As a qa_member, I want to filter my inbox to unread only, and by Requirements, Defects, Tasks or Milestones, so that I can work through one kind of update at a time.
- As a qa_member, I want to mark one notification or all notifications as read so that my unread count reflects what I still need to look at.
- As a qa_member, I want to jump from a notification to the record it refers to so that I can act on it immediately.
  - Requirements open their detail page; defects, tasks, milestones and platform issues open their list with the row highlighted; test cases open the test case; execution files open the Execution Dashboard.
  - Opening a notification marks it as read.
- As a qa_member, I want a reminder the day before and on the day of a calendar event I am tagged in so that I do not miss it.

### Non Functional Requirement
[v1.0.0]
- The unread count and inbox refresh automatically every 30 seconds.
- Calendar event reminders are generated once a day at 08:00 server time, and a given reminder is never sent twice to the same person for the same event.
- When a user has opted in on the `Setting` page, notifications are also delivered to their account email address.

### Constraint
[v1.0.0]
- A user only ever sees their own notifications.

## Audit Trail

### User Story
[v1.0.0]
- As a admin, I want a paginated audit log of system activity, newest first, so that I can see who changed what and when.
  - Columns: date, actor, action, description, and changes shown field by field as old value → new value.
  - Actions are colour-coded by kind: created, updated, deleted, status or result changed, sign-in or sign-out, verdict sent.
- As a admin, I want to filter the audit log by entity, actor, date range and description text so that I can trace one change quickly.
  - Entities: Requirements, Test Cases, Tasks, Execution, Verdicts, System (sign-in and sign-out).
- As a admin, I want to export the filtered audit log to Excel so that I can keep or share an evidence record outside QM Pulse.

### Non Functional Requirement
[v1.0.0]
- The audit log shows 50 entries per page.
- The active filters and page number are kept in the page address, so that a filtered view can be bookmarked or shared.
- The Excel export applies the same filters as the screen and includes at most 2,000 entries, named with the export date and time.
- The audit log merges general activity with test execution history into a single timeline.

### Constraint
[v1.0.0]
- Only an `admin` may read the audit log; the server enforces this.

## History Trail

### User Story
[v1.0.0]
- As a qa_lead, I want a history of every requirement event that has been logged, such as Blocker, Server down, Automation unavailable or a custom event, so that I can see what disrupted delivery and for how long.
  - Columns: requirement, milestone, event type, start, end and who logged it.
  - An event logged against a whole milestone names the milestone scope instead of a single requirement.
- As a qa_lead, I want to search the history by requirement, milestone, type or description, and filter by event type and by open or closed status, so that I can find the events relevant to one piece of work.
  - An event is open until it has an end date.
- As a qa_lead, I want to open an event to read its full details so that I understand what happened.

### Non Functional Requirement
[v1.0.0]
- The history shows 15 events per page.

### Constraint
[v1.0.0]
- Requirement events are logged from the `Tasks` page; the History Trail is read-only.
- The History Trail uses the same page permission as `Tasks` (`nav:tasks`).

## Admin Search

### User Story
[v1.0.0]
- As a admin, I want one search box across requirements, test cases, tasks and users so that I can find and correct any record from one place.
  - Requirements match on title, description or module; test cases on title or objective; tasks on name or notes; users on name, email or team.
- As a admin, I want to edit a found record in place so that I can fix data without going to its own page.
- As a admin, I want to delete a found record after confirming so that bad or duplicate data can be removed.
- As a admin, I want to issue a user a generated temporary password so that they can regain access and are made to choose their own at next sign-in.

### Non Functional Requirement
[v1.0.0]
- Search starts once at least 2 characters are typed.
- Generated temporary passwords are random and meet the 8-character minimum.
- A failed edit, delete or reset shows the server's reason in the error message.

### Constraint
[v1.0.0]
- Every edit, delete and reset made from Admin Search is still subject to the server's own rules for that record type, including the user-management rules in `User and Team`.

## Platform Issues

### User Story
[v1.0.0]
- As a qa_member, I want a "Report an issue" button on every page so that I can report a bug, idea or question about QM Pulse itself while it is in front of me.
  - Fields: title (required), details, type (Bug, Idea, Question), severity (Blocking, Major, Minor) and an optional screenshot.
  - The page I was on and my browser details are attached automatically.
- As a qa_member, I want to see every platform issue that has been reported, filtered by status, so that I can check whether my problem is already known before reporting it.
  - Statuses: Open, In progress, Fixed, Won't fix, Duplicate.
  - Severity is shown by a coloured edge on each issue.
- As a qa_member, I want to edit an issue I reported, including replacing or removing its screenshot, so that I can add detail or correct it.
- As a admin, I want to change an issue's status, and correct its type or severity, so that the list reflects what is being worked on.
- As a qa_member, I want to be notified when the status of an issue I reported changes so that I know when it is fixed or declined.

### Non Functional Requirement
[v1.0.0]
- Every `admin` receives an in-app notification for each new platform issue.
- A Blocking or Major issue also sends an alert email to a fixed list of developer recipients.
- A screenshot may be at most 5 MB.

### Constraint
[v1.0.0]
- Platform Issues track problems in QM Pulse itself and are separate from `Defects`, which track problems in the projects QM Pulse is used to test.
- Any signed-in user may report and view platform issues; only the reporter may edit their own issue, and only an `admin` may change status or delete an issue.

## Configuration

### User Story
[v1.0.0]
- As a admin, I want to create, rename and delete projects, and search the project list, so that test work can be organised under the right project.
- As a qa_lead, I want to add, rename and delete modules in the shared module catalog, and search it, so that test work can be organised under the right module.
  - A module can apply to more than one project.
- As a qa_manager, I want to assign a person access to a project, either the whole project or one or more of its modules, so that each person sees only the work they are responsible for.
  - The list of assigned people shows each person's scope (Whole project, or the named modules), who assigned them and when.
  - An assignment can be changed or removed.
- As a qa_manager, I want to choose which modules from the shared catalog apply to a project so that only relevant modules can be assigned and filtered on it.
- As a qa_lead, I want to sync Redmine projects and Redmine trackers into QM Pulse so that project and tracker choices across the application match Redmine.
- As a qa_lead, I want to record the Redmine custom field IDs for Complexity, Targeted Start Date, Targeted Completion Date and Source so that defects created from QM Pulse fill those Redmine fields correctly.
  - The Source field is filled automatically with the reporter's department (qa, dev, fa or pm) on every new defect.
- As a qa_lead, I want to maintain a contact list of individuals and groups, synced from Redmine or added by hand, so that verdict and report emails can be addressed from it.
  - Contacts can be searched by name or email and filtered by type and by whether they have an email address.
- As a admin, I want to create a QA team member from Configuration with a name, email, role, team and temporary password so that a new tester can start straight away.
  - The new member must change the temporary password at first sign-in.
- As a qa_member, I want to keep a document register that maps a project, module and tracker to a document reference number so that generated Excel documents carry the correct reference on their Doc Info sheet.
- As a admin, I want to turn the guided QA Pipeline flow on or off for the whole system so that teams only see the workflow they actually use.
  - When the QA Pipeline flow is off, the `QA Pipeline` page is hidden from the sidebar.
  - It is off by default.

[v1.1.0]
- As a qa_lead, I want the Team Members tab to show a read-only list of the team so that I can see who is on the team without being offered an action I cannot complete.
  - The list shows each member's name, email, role and team.

### Non Functional Requirement
[v1.0.0]
- Configuration opens on the tab named in the page address (`?tab=`), so other pages can link directly to a tab such as Project Access.

### Constraint
[v1.0.0]
- Tabs are shown by role:
  - Projects & Modules, Project Access and Document Register: every role that can open Configuration.
  - Redmine Integration, Contacts and Team Members: `admin` and `qa_lead` only.
  - Teams and Global Settings: `admin` only.
- Only an `admin` may create, rename or delete projects; the server enforces this.
- Managing project access requires tier 3 (Manager) or above. A manager or HOD may assign only people in their own department at their own tier or below, including themselves; an `admin` may assign anyone.
- A person assigned to a project with no module sees the whole project. A person assigned to specific modules sees only those modules' data in that project. Users at tier 3 (Manager) and above see every project in which someone from their department is assigned, and `admin` and `cto` see every project.
- Project access comes only from direct assignment here; linking a team to a project grants no access.
- Syncing Redmine projects requires a Redmine administrator API key.
- The Team Members tab can create only `qa_member` or `qa_lead` users, plus `admin` when the creator is an `admin`.

[v1.1.0]
- The create-user form on the Team Members tab is shown only to tier 3 (Manager) and above, plus `admin`. A `qa_lead` sees the read-only member list and no form.
  - This matches the server, which already requires tier 3 to create a user.

# Business Module

## Dashboard

### User Story
[v1.0.0]
- As a qa_member, I want My Work Today to be my landing page after sign-in, listing everything waiting on me across every project I can access, so that I start the day knowing what to do first.
  - Items are grouped into Urgent, Needs action and Waiting on others, with counters for Urgent, Needs action and Waiting.
  - Each item shows its project and milestone, why it needs me, its owner, how long since it was updated, and a button that opens it.
  - Items come from: tasks assigned to me; requirements I own that are blocked, rejected back to me, waiting for my review or waiting for my development; execution test cases waiting for my acceptance or returned to me for correction; execution files waiting for my approval, correction or continued execution; defects assigned to me; risks I own; and overdue active milestones.
  - When nothing is waiting, an "all caught up" message is shown.
- As a qa_lead, I want My Work Today to offer My Team and Unassigned tabs so that I can see what my department is carrying and what nobody has picked up.
  - My Team covers every user in my department; for `admin` and `cto` it covers every user.
- As a qa_member, I want a Dashboard with my task counters, a weekly progress chart, recent activity and a team calendar so that I can see the overall state of delivery at a glance.
  - Counters: Total Tasks with how many are completed, Pending Tasks (in QA or UAT), Blocked / Overdue, and Test Cases with how many were AI-assisted.
  - Hovering the Pending and Blocked / Overdue counters lists the items; selecting one opens it on the `Tasks` board.
  - The Weekly Task Progression chart stacks the last 8 weeks of requirements by phase, using the `Tasks` phases with Gap counted as Development: Requirements, Development, Testing, UAT, plus Completed and Blocked.
- As a qa_member, I want a Recent Activity feed that I can switch between project activity and my own activity, and filter by project and member, so that I can catch up on what changed.
- As a qa_lead, I want to view the Dashboard as a chosen team member so that I can review that person's numbers.
- As a qa_member, I want a shared month-view team calendar so that everyone can see UAT windows, meetings, deadlines and releases.
  - An event has a title, date, type (UAT, Meeting, Deadline, Release, Other), description and tagged members.
  - Selecting a day adds an event; selecting an event shows it with Edit and Delete.
  - Each day shows up to 3 events, then "+N more".
  - Tagged members are notified when they are tagged.
- As a pm_lead, I want a PM Dashboard giving a portfolio view of every project's milestones and team capacity so that I can spot schedule risk early.
  - Portfolio counters: projects, active milestones, at risk and overdue.
  - Per project: a tile for each milestone with schedule status, due date and a readiness bar, and a capacity table of each person's open items.
  - Selecting a milestone tile opens that milestone's requirements.
  - The dashboard can be narrowed to one project, then one milestone.
- As a pm_lead, I want to drill into one milestone on the PM Dashboard so that I can see where its time went.
  - Phase target dates (Start, Requirements, Development, QA, UAT, End, Go-Live), each flagged Late when passed and not done.
  - A plan-versus-actual bar of average days per phase.
  - Per-requirement Status list, Timelines and Gantt views.
  - KPI cards for burn rate, schedule performance index (SPI), first-pass rate and requirement stability.
  - A benchmark against the project's last 5 completed milestones.
  - The top 5 requirements stuck in review or rejected, with days stuck.
- As a pm_lead, I want an AI risk assessment for a milestone, with a history of past assessments, so that I get an early, explained warning of delivery risk.
  - Each assessment gives a level (low, medium, high, critical), primary and secondary factors and a suggested next step.
  - A medium or higher assessment can be raised straight into the `Risk Register`, pre-filled from the assessment.
- As a pm_lead, I want the PM Dashboard to show a selected project's `Risk Register` and its closed milestones with their lessons learned so that project health and history sit in one place.

### Non Functional Requirement
[v1.0.0]
- My Work Today refreshes every 60 seconds, orders items urgent, then high, then normal, oldest first within each, and shows at most 75 items.
- My Work Today marks an item as stale, and raises its priority, once it has waited 3 days or more.
- Recent Activity refreshes every 60 seconds while the page is visible, shows 5 entries at a time with "View more", and excludes sign-in and sign-out entries.
- Schedule status on the PM Dashboard is: Overdue when past the target date; At risk when 5 days or fewer remain and readiness is below 80%; No date set when there is no target date; otherwise On track.
- Utilisation is estimated hours against a 40-hour week, shown amber from 80% and red from 100%.
- SPI is work completed % divided by time elapsed %, shown On track from 1.0, At risk from 0.8 and Critical below 0.8.

### Constraint
[v1.0.0]
- My Work Today, Dashboard and the team calendar are open to every signed-in user.
- The My Team and Unassigned tabs of My Work Today require tier 2 (Lead) or above.
- Requirement review items appear only for FA-department users at tier 2 or above; execution approval and test-case acceptance items appear only for QA-department users, `admin` and `cto`; risk and overdue-milestone items appear only for PM-department users, `admin` and `cto`.
- Viewing the Dashboard as another member is offered to `qa_lead` and `admin` only.
- The PM Dashboard is limited to `pm_member`, `pm_lead`, `hod_pm`, `admin` and `cto`, and shows only projects the user can access.
- Running an AI milestone risk assessment is limited to `pm_member`, `pm_lead`, `hod_pm`, `admin` and `cto`.
- A milestone may have only one open or mitigating AI-raised risk at a time.

## Requirements

### User Story
[v1.0.0]
- As a fa_member, I want to create a requirement with a title, Redmine ticket ID, description, project, one or more modules, tracker, priority, milestone, acceptance criteria and attachments so that the scope to be tested is captured in one place.
  - Priority is Low, Normal, High or Urgent.
  - Attachments may be files or web links; they are saved together with the requirement.
  - A new requirement starts in Draft.
- As a fa_member, I want to organise requirements as parents and children, and add a child that inherits its parent's project, milestone, tracker and modules, so that large features are broken into traceable pieces.
- As a fa_member, I want to import a Redmine ticket and all of its descendants as requirements into a chosen project, milestone and modules so that I do not retype scope that already exists in Redmine.
  - The ticket may be given as an ID or a Redmine URL.
  - I can choose whether to include the parent ticket itself, and narrow the import to one Redmine tracker.
  - Tickets that are Cancelled, Verified, Roadblock or Closed are skipped; children of a skipped ticket are attached to the nearest imported ancestor.
  - A ticket already imported is updated rather than duplicated.
- As a fa_member, I want to re-sync an imported requirement from Redmine so that its title, description and children pick up changes made in Redmine.
- As a qa_member, I want to search requirements by title, Redmine ID or module, filter by project, milestone, module and priority, and sort them, so that I can find the scope I am testing.
  - Search results include the descendants of every match.
  - Each row shows priority, tracker, review status, development status, a Blocked flag, open requirement-defect count, test case count and pass/fail results, and a link to the Redmine ticket.
  - Selecting the test case count opens `Test Cases` filtered to that requirement.
- As a fa_member, I want to edit and delete requirements, singly or in bulk after confirming, so that the requirement list stays correct.
- As a fa_member, I want to submit a draft or rejected requirement for review so that it can be approved before work starts.
- As a fa_lead, I want a review queue showing requirements waiting on my review and my rejected requirements waiting on my revision so that reviews do not stall.
  - The top 5 of each are shown; items not updated for more than 3 days are marked stale.
- As a fa_lead, I want to approve or reject a requirement under review, with an optional comment, so that only agreed scope goes into development and test.
- As a qa_member, I want a requirement detail page so that I can see everything about one requirement.
  - Parent breadcrumb, Redmine ticket, review status, project, modules and milestone.
  - Details: priority, status, tracker, assignee, test case count and results, and created, updated, approved and rejected dates.
  - Acceptance criteria, attachments, child requirements, a phase timeline of planned against actual dates, and a history of changes.
- As a fa_member, I want an AI analysis of a requirement that scores it out of 100, rates its risk and lists missing items, issues and questions to clarify so that I can strengthen it before review.
  - Accepting a missing item or issue rewords it and appends it to the description.
  - A question can be posted to the discussion as a clarification request.
  - Suggestions I have already acted on are not raised again.
- As a fa_member, I want to remove an acceptance criterion, or move a criterion phrased as a question into the discussion, from the detail page so that the criteria list holds only agreed criteria.
- As a qa_member, I want a discussion thread on each requirement so that questions and answers about the scope stay with it.
- As a fa_member, I want to upload attachments with a description to a requirement, download them and delete them so that supporting documents stay with the scope.
- As a dev_lead, I want to break an approved requirement into development tasks with an assignee each so that development work is tracked against the requirement.
  - The assignee submits a task for review with an optional pull-request link and evidence; a reviewer accepts it or sends it back.
  - When every development task is done, the requirement moves to Ready for QA automatically; adding or reopening a task moves it back to In progress.
- As a qa_member, I want to return a requirement that is Ready for QA to development, choosing which development tasks to reopen and giving a reason, so that work that fails QA goes back to the developer.
- As a fa_lead, I want to mark a requirement Blocked with a reason, and unblock it, so that everyone can see that work on it is stopped and why.
- As a qa_member, I want to raise a defect against an approved requirement, with a title and severity, so that a problem in the requirement itself is tracked and routed to its author.
  - Severity is Critical, High, Medium or Low; the default is Medium.
  - The defect is assigned to the requirement's author automatically.
  - The current assignee of a requirement defect can hand it off to a developer or QA user.
- As a dev_member, I want to return an approved requirement to FA with an optional reason so that unclear or wrong scope is reworked by its author.

### Non Functional Requirement
[v1.0.0]
- The requirement list shows 10 top-level requirements per page and remembers the comfortable or compact view per browser.
- The review queue refreshes every 60 seconds.
- Redmine import fetches child tickets 5 at a time and walks the tree to any depth.
- Changing a requirement's milestone moves its execution test cases, and their defects, to the new milestone.
- Changing a requirement's project or module is copied to all of its child requirements.
- When a requirement's description changes and it already has test cases or tasks, its author, assignee and task assignees are notified that revision may be required.
- Notifications are sent on submit (to FA reviewers in the project), approve (to the author, assignee and project QA and Dev leads), reject (to the author, assignee and milestone creator), return to development, block and unblock, return to FA, new comments, and requirement defects.

### Constraint
[v1.0.0]
- A requirement's review status is Draft, In review, Approved or Rejected; its development status is Assigned, In progress or Ready for QA; Blocked is a separate flag.
- Title, priority, project, at least one module and milestone are required on the form.
- A requirement may be reviewed by `admin`, `cto`, any FA-department role, and QA-department roles at tier 2 or above; an author can never approve or reject their own requirement.
- Only the author, `admin` or `cto` may submit a requirement for review.
- Editing is limited to `admin`, `cto`, the author, the assignee, and FA-eligible reviewers for requirements imported from Redmine.
- Development work can start only on an approved requirement that is not blocked.
- Development tasks may be created by Dev-department users at tier 2 or above, `admin` and `cto`.
- Returning to development is limited to `qa_member`, `qa_lead`, `hod_qa`, `admin`, `cto` and users at tier 2 or above.
- Blocking and unblocking are limited to FA- and PM-department users, `admin` and `cto`.
- Raising a requirement defect and returning to FA are limited to `dev_member`, `dev_lead`, `hod_dev`, `qa_member`, `qa_lead`, `hod_qa`, `admin` and `cto`.
- An attachment may be deleted only by its uploader, `admin` or `cto`.
- Attachments are at most 10 MB each and must be an image, PDF, Word, Excel, text or CSV file; links must be http or https.
- The list and every requirement action are limited to the projects, and the modules, the user has been given access to in `Configuration`.

## Milestones

### User Story
[v1.0.0]
- As a pm_lead, I want to create a milestone for a project with a name, type, status, priority, environment, description and phase target dates so that requirements and test work are grouped under a dated delivery.
  - Types: CR, Sprint, Phase, Release, Data Prep.
  - Phase dates: start, requirements, development, QA, UAT and go-live; the milestone's target date is taken from its go-live date.
- As a pm_lead, I want to list a project's milestones as cards, newest first, so that I can see each delivery's status at a glance.
  - Each card shows name, type, status, priority, target date, environment, and the number of requirements and how many are approved (or, for Data Prep, the number of files uploaded).
  - A "Conditional Sign Off" badge marks a milestone signed off with outstanding failures.
- As a pm_lead, I want to staff a milestone with team members, when creating it or later, so that everyone working on it is known and notified.
  - The person staffing a milestone is added to its team automatically.
- As a pm_lead, I want to edit, close or delete a milestone so that the delivery plan stays current.
  - Deleting keeps the milestone's requirements and execution files.
- As a pm_lead, I want to record lessons learned, typed as what went wrong, what went right or best practice, when a milestone is completed so that the next delivery benefits.
- As a pm_lead, I want to export a project's lessons learned to the Bestinet "5.1 Lesson Learned" Excel template so that I can hand the PMO its official record without retyping.
- As a qa_lead, I want a Data Prep milestone with a "what QA needs to prepare" brief and an uploaded file list so that test data preparation is tracked like any other delivery.
  - Files can be uploaded with an optional note, downloaded and deleted.

### Non Functional Requirement
[v1.0.0]
- A regular milestone's status advances automatically from its work: Planned until a requirement is FA-approved, then Active, Verified once QA has all passed, UAT once UAT has started when UAT is required, and Completed once QA and any required UAT have all passed. Automatic changes only move forward and never change a Cancelled milestone.
- Closing a milestone records who closed it and when; reopening clears the completion date.
- FA leads and FA members in the project are notified when a milestone is created, and each person is notified when they are added to a milestone's team.
- Lessons-learned exports include only completed milestones with lessons recorded, and are named with the date and project.

### Constraint
[v1.0.0]
- Milestone statuses: Planned, Active, Verified, UAT, Completed, Cancelled. A Data Prep milestone uses only Planned, In Progress, Completed and Cancelled.
- Priority is Low, Medium, High or Critical; environment is ENV1 to ENV6.
- Creating, editing and deleting milestones is limited to `admin`, `cto`, `hod_qa`, `hod_fa`, `hod_pm`, `qa_lead`, `fa_lead`, `pm_lead` and `pm_member`.
- Staffing follows department lines: `qa_lead`, `dev_lead` and `fa_lead` may staff only their own department; `pm_lead` and `pm_member` may staff QA, Dev and FA; HODs, `cto` and `admin` may staff anyone. Every team member must have access to the project.
- A Data Prep milestone cannot be completed until at least one file is uploaded.
- Data Prep files are at most 15 MB.
- Every milestone action is limited to projects the user can access.

## QA Pipeline

### User Story
[v1.0.0]
- As a qa_lead, I want to start a QA pipeline for a milestone and work through it as eight guided steps so that every release follows the same path from requirements to deployment.
  - Steps: 1 Milestone & UAT, 2 Sync Requirements, 3 Create Test Cases, 4 Approve Test Cases, 5 Execute Testing, 6 Sign Off Functional, 7 UAT Sign-offs, 8 Update Milestone.
  - Each step shows whether it is done, in progress, not started, skipped or conditional, and the pipeline reopens at the step last reached.
  - I can move between steps freely; only sign-off and deployment are gated.
- As a qa_lead, I want to pick a project and see its pipelines as cards showing the current step, status, priority, target date and environment so that I can resume the right one.
- As a qa_lead, I want step 1 to capture the milestone's details and whether it requires UAT sign-off so that the pipeline knows whether step 7 applies.
- As a qa_lead, I want step 2 to sync a parent Redmine ticket and its sub-tickets into requirements for chosen modules so that the pipeline's scope comes straight from Redmine.
  - Tickets that are Cancelled, Verified, Roadblock or Closed, and Task or QA Defect tickets, are skipped.
  - A summary shows new, already linked and failed tickets.
  - Requirements synced by the pipeline are approved automatically.
- As a qa_lead, I want to run AI analysis on selected pipeline requirements, after confirming that no personal data is included, so that weak requirements are caught before test design.
  - Each suggestion can be accepted, marked solved or ignored; accepted suggestions update the requirement exactly as accepting them on the `Requirements` detail page does.
- As a qa_lead, I want to name the FA, Dev and QA owners of each pipeline requirement so that everyone knows who answers for it.
- As a qa_lead, I want step 3 to show test case coverage of the pipeline's requirements, apply AI risk-based priority (Critical, High, Medium, Low) and compile chosen test cases into an execution file so that the riskiest cases are run first.
  - Draft or rejected execution files can be submitted for review from this step by their author.
- As a qa_lead, I want step 4 to show each execution file's review status and approve or reject submitted files so that only reviewed test cases are executed.
- As a qa_member, I want step 5 to show live execution totals (passed, failed, blocked, in progress, not executed) per file and overall so that I know how far testing has got.
  - An AI execution-risk assessment gives a release risk level, estimated defect leakage, factors and a recommendation, and keeps a history.
- As a qa_manager, I want to sign off functional testing in step 6 so that the release is formally accepted by QA.
  - Sign-off is Full when every test case passed and Conditional when some failed or are blocked.
  - The sign-off record shows who signed, their role, when, the type, the failed and total counts at sign-off, and what comes next.
- As a qa_lead, I want step 7 to list the milestone's UAT sign-off documents, with a link to upload them, so that business acceptance is evidenced before deployment.
  - When UAT is not required, step 7 is shown as Not Required.
- As a qa_lead, I want step 8 to show a readiness checklist, download the requirements traceability matrix and draft AI release notes so that deployment is checked and documented.
  - Readiness: requirements synced, test cases compiled, all files approved, all executed, signed off, and a UAT document when UAT is required.
- As a qa_lead, I want to mark the milestone as deployed once every readiness check passes so that the pipeline is closed and locked.
- As a qa_lead, I want a two-step Data Prep pipeline for Data Prep milestones, covering details, then staffing, file upload and completion, so that data preparation can be run through the same flow.

### Non Functional Requirement
[v1.0.0]
- A deployed pipeline is read-only; its milestone details and dates stay editable, but its step, sign-off and UAT requirement cannot change.
- A pipeline milestone's status is set from its execution files: Planned with no QA files, Active while testing, Verified once all files are approved and executed or signed off, and UAT once signed off when UAT is required. It reaches Completed only by deployment.
- Only QA execution files count towards pipeline progress and sign-off, and group heading rows are excluded.
- The server re-checks every readiness condition when deployment is requested and refuses with the list of outstanding items if any fail.
- The sign-off records the signer and time on the server and freezes the failed and total counts; retesting afterwards does not change a Conditional sign-off to Full.
- Execution file authors are notified when their file is approved or rejected, approvers are notified when a file is submitted, and named pipeline owners are notified.

### Constraint
[v1.0.0]
- The QA Pipeline appears in the sidebar only when the QA Pipeline flow is turned on in `Configuration`.
- Creating and editing pipeline milestones is limited to the milestone editing roles plus `qa_member` and `qa_manager`.
- Approving or rejecting an execution file is limited to `qa_lead`, `qa_manager`, `hod_qa`, `admin` and `cto`; a submitter cannot approve their own file.
- Functional sign-off is limited to `qa_lead`, `qa_manager`, `hod_qa`, `admin` and `cto`, and is possible only when every QA test case has been executed. A pipeline can be signed off only once; only an `admin` can withdraw a sign-off.
- Reopening a deployed pipeline is limited to the sign-off roles.
- A pipeline milestone cannot be created as Completed.

## Test Cases

### User Story
[v1.0.0]
- As a qa_member, I want to write a test case in the test case library with a title, requirement, project, modules, Redmine ticket ID, tracker, scenario, preconditions, test steps, test data, expected result, comments and tags so that test design is captured once and reused across executions.
  - Choosing a requirement fills in its project and modules.
  - Title, test steps, expected result, project and at least one module are required.
- As a qa_member, I want to attach files to a test case, with a description each, and preview or download them so that supporting material travels with the case.
  - Attachments added to a library case are visible read-only in the execution files it is compiled into.
- As a qa_member, I want to edit, clone and delete test cases, singly or in bulk, so that the library stays current.
  - Cloning asks for the target project and module, and optionally a requirement; the copy is titled "(Copy)" and credited to me.
  - Bulk delete asks for confirmation.
- As a qa_member, I want to filter the library by project, milestone, module, requirement and source (AI-assisted or manual), sort it, and group it by module so that I can find the cases for the scope I am testing.
  - Filtering by requirement includes all of its descendant requirements.
  - Filtering by milestone includes cases whose requirement is in the milestone.
  - The library can be opened pre-filtered by project, milestone or requirement from other pages.
  - A link to a single test case opens the library on that case, expanded and highlighted.
- As a qa_member, I want to search the library by title, user story, tracker, tags, QA PIC or author, or ask in plain language, so that I can find cases without knowing their exact wording.
  - A longer, sentence-like query is answered by AI search; if AI finds nothing, the plain text match is used.
- As a qa_member, I want to see which test cases have been flagged because their requirement was revised so that I can update them.
- As a qa_member, I want to generate test cases with AI for one or more requirements, including their child requirements, so that a first draft of coverage is produced quickly.
  - I choose the project, modules, tracker, author and whether to target positive, negative and edge cases, and can add notes.
  - Results are previewed grouped by requirement, and I choose which to keep.
  - Generated cases avoid duplicating cases that already exist for the requirement.
- As a qa_member, I want to see how many execution runs each test case appears in, and open any of them, so that I can trace a case to its results.
- As a qa_member, I want to export selected or filtered test cases to the standard Excel test case template so that I can share them outside QM Pulse.
- As a qa_lead, I want to compile selected test cases into a new or existing execution file so that they can be run in `Test Execution`.
  - A new file needs a project, milestone and at least one module; the Redmine ticket is optional.
  - Adding to an existing file merges in its modules.

### Non Functional Requirement
[v1.0.0]
- The library shows 10 cases per page, except when grouped by module, and remembers the comfortable or compact view per browser.
- AI generation processes up to 3 requirements at a time and produces 5 to 10 cases per requirement; a failure on one requirement does not stop the others.
- Saving AI-generated cases is all-or-nothing, up to 200 cases at a time.
- Every edit to a test case is recorded in the `Audit Trail` with its field changes.

### Constraint
[v1.0.0]
- Library test cases have no review status of their own; review happens on the execution file they are compiled into.
- Test case attachments are at most 20 MB each; only images, PDF and text can be previewed in the browser.
- An attachment may be deleted only by its uploader, `admin` or `cto`.
- The AI author picker offers only `qa_member`, `qa_lead`, `qa_manager` and `hod_qa` users in the project.
- The library lists only test cases in projects, and modules, the user has been given access to in `Configuration`.

## Test Execution

### User Story
[v1.0.0]
- As a qa_lead, I want an Execution Dashboard listing every execution file with its progress so that I can see where testing stands across tickets.
  - Summary tiles: total test cases, passed, failed, blocked and executed %.
  - Each file shows its ticket, title and review status, QA PIC, priority, a pass-rate bar, milestone phase and last modified date, marked Stale when untouched for more than 3 days and not fully executed.
  - Files can be searched by ticket or title, sorted, and filtered to In Progress, Has Failures, Completed or Not Started.
- As a qa_lead, I want to create an execution file for a Redmine ticket, with a project, milestone, modules, file type (QA or UAT), tracker and remarks, so that a test run is set up against the right scope.
  - A ticket already used by another file is flagged as I type.
  - If the ticket's requirement already has library test cases, I am offered to copy them in.
  - Test cases can be imported from an Excel sheet.
- As a qa_lead, I want to edit, clone and delete execution files so that test runs can be corrected, re-run or removed.
  - A clone takes a new ticket ID and can reset results and keep the QA PIC; defect numbers and screenshots are always cleared.
- As a qa_member, I want to submit my execution file for review, and see a review queue of files waiting on me and files returned to me, so that execution starts only once test cases are approved.
- As a qa_lead, I want to approve an execution file, or reject it with a reason, so that only reviewed test cases are executed.
- As a qa_member, I want to work through an execution file one test case at a time, grouped by module, recording each result so that execution is quick and complete.
  - Results: Passed, Failed, Blocked, In Progress, Not Executed.
  - Changing a result that has already been recorded asks for a reason.
  - Each test case shows its compact number, steps, expected result, actual result, QA notes, QA PIC and defect numbers.
- As a qa_member, I want to attach evidence files, with a description each, when I pass a test case so that the pass is backed by proof.
  - I can pass without evidence.
  - Only evidence uploaded since the latest result counts as current.
- As a qa_member, I want marking a test case Failed to open a defect form that raises a child issue in Redmine so that the failure is reported without leaving the sheet.
  - The form searches Redmine for possible duplicates first, and fills the subject, parent ticket and QA defect tracker automatically.
  - The new defect number is written back to the test case, and the defect is also registered in `Defects`.
- As a qa_member, I want to see each test case's history of result changes and review events, with who, when and why, so that every change is traceable.
- As a qa_lead, I want to edit an execution file's test cases in place so that the run reflects the agreed design.
  - Pull cases from the library for the file's milestone requirements, add rows and group headings, reorder by dragging, delete rows.
  - Promote a row to the library, update the library from a row, or pull the latest library version into a row.
- As a qa_lead, I want test cases added after a file is approved to wait for a peer to accept or return them so that late additions are reviewed too.
  - A returned test case goes back to its author with the reviewer's comment, to be edited and resubmitted.
- As a qa_member, I want to be warned when a test case's requirement has been revised, and reset it to Not Executed, so that I retest against the current requirement.
- As a qa_member, I want to import results into an execution file from an Excel workbook so that work done offline is brought in.
  - Import replaces every existing row in the file, and shows a summary of what succeeded.
- As a qa_lead, I want to download an execution file as an Excel workbook built from the standard template, or as a zip with its evidence files linked, so that I can deliver the results to the client.
  - The workbook includes the active Redmine defects, CAPA items, a document history, reviewer stamps and the document reference number from the `Configuration` document register.
- As a qa_lead, I want an AI-generated CAPA analysis for an execution file so that the corrective and preventive actions are drafted for me.
- As a qa_lead, I want an execution summary page per file showing totals, pass rate, executed % and a per-module breakdown so that I can report progress by module.
- As a qa_lead, I want to send a PASS verdict email with the execution workbook attached once every test case in a file has passed so that the client is told the ticket is verified.

### Non Functional Requirement
[v1.0.0]
- Changes on the execution sheet are saved automatically every 10 seconds and when the user leaves a test case, with a visible Saving, Saved or Save Failed status and the time of the last save.
- The execution sheet reloads other users' changes every 30 seconds while it is visible, without overwriting unsaved local edits.
- Test case numbers are compact and positional (`TC-<ticket>-NNN`), recalculated on every save; group headings take no number.
- Evidence files are renamed on upload to the test case, ticket and timestamp.
- The server stamps the execution time whenever a result changes.
- The QA PIC is notified when assigned; QA reviewers are notified when a file is submitted or test cases await acceptance; the submitter is notified of approval or rejection; and the milestone creator is notified once when a UAT file reaches 80% passed.
- An execution file with no Redmine ticket is given an internal reference of the form `INT-NNNN`.

### Constraint
[v1.0.0]
- Execution file review status: Draft, In review, Approved, Rejected.
- A file must belong to a milestone before any result can be recorded in it.
- A result can be recorded only when the file is approved, the test case has been accepted, its requirement is not in development or blocked, and it has a QA PIC; a `qa_member` may record results only on test cases assigned to them.
- Submitting a file for review is limited to its author, and to `admin`, `cto` and QA-department roles.
- Approving or rejecting a file is limited to `admin`, `cto` and QA-department roles at tier 2 or above, and never the person who submitted it.
- Accepting or returning a late-added test case is limited to QA reviewers other than its author.
- Evidence files are at most 10 MB each, and may be deleted only by their uploader, `admin` or `cto`.
- Every execution file action is limited to projects, and modules, the user has been given access to in `Configuration`.

## Tasks

### User Story
[v1.0.0]
- As a qa_lead, I want a Tasks board built automatically from every milestone's requirements, across all departments, so that delivery progress is tracked without anyone entering tasks by hand.
  - One row per milestone with its project, parent Redmine IDs, priority, FA, Dev and QA people in charge, status, requirement count, requirements per phase, progress, target and actual start and end dates, and go-live date.
  - Phases: Requirements, Gap, Development, Testing, UAT.
  - QA Pipeline milestones are badged and show the pipeline gate they are waiting on.
- As a qa_lead, I want to search the board by requirement, milestone or person, and filter it by project, milestone, phase and priority, so that I can focus on one slice of delivery.
- As a qa_lead, I want a team workload card showing how many open milestones each person carries so that I can see who is overloaded.
  - Users at tier 5, and PM-department users, see FA, Dev and QA staff; everyone else sees their own department.
- As a pm_lead, I want a Visualization tab showing where the work is now and who has the most of it so that bottlenecks are visible at a glance.
  - Tiles: all requirements, not finished, late, people working, nobody assigned.
  - "Where is the work right now?" counts requirements in each phase and Done, with how many are late.
  - "Who has the most work?" charts each person's milestones as late, in progress and finished, filterable by department.
- As a qa_lead, I want to open the list of late items, most overdue first, with how late each is, its stage and its people, so that I can chase the right person.
- As a qa_lead, I want to export the filtered board to Excel, one line per requirement, so that I can share delivery status outside QM Pulse.
- As a qa_lead, I want to log an event against a milestone, such as Blocker, Server down, Automation unavailable or a custom type, with a start date, optional end date and description, so that disruptions to delivery are recorded.
  - An event covers the whole milestone, or only the requirements I tick.
  - Events can be edited or ended now; a milestone with an open event is flagged.
  - Logged events appear in the `History Trail`.
- As a qa_lead, I want a link to a requirement on the Tasks board to jump to and highlight its milestone row so that I can find it from the `Dashboard` counters.

### Non Functional Requirement
[v1.0.0]
- The board shows 15 milestones per page, sorted by milestone name.
- A requirement's phase comes from its activity: review, development hand-off, ready for QA, return to development or FA, and QA and UAT execution. Its progress is 0, 50 or 100% through FA review, 33, 66 or 100% through development, and the pass rate of its execution files in QA and UAT.
- A pipeline milestone's progress is the share of its 7 gates passed, shown as Deployed at 100%.
- A milestone's progress is the average of its requirements' progress.
- An item is late when its progress is below 100% and its phase target date has passed.
- Logging or changing an event is recorded in the activity log.

### Constraint
[v1.0.0]
- The board lists only milestones in projects the user can access.
- Events cannot be deleted.
- An event's requirements must all belong to its milestone.
- The Tasks board is read-only apart from events; development tasks are managed on the `Requirements` detail page.

## Defects

### User Story
[v1.0.0]
- As a qa_member, I want defects organised in tabs for QA, Production, Requirement and Other defects so that each kind of defect is worked separately.
  - Each tab shows metric cards; the defect leakage rate is production defects as a share of all defects.
  - The QA tab offers quick views: All open, Blocking test cases, Awaiting retest, My Defects and All; the other tabs offer All, Open, Awaiting retest and My Defects.
- As a qa_member, I want to search defects by title, defect code or Redmine ID, and filter by project and severity, or to those whose Redmine issue is unavailable, so that I can find a defect quickly.
- As a qa_member, I want to raise a QA defect from the Defects page with a title, description, steps to reproduce, expected and actual result, severity, module, tracker, target dates and screenshots so that it is created in Redmine and tracked in QM Pulse.
  - The defect is saved in QM Pulse first and then created in Redmine; if Redmine is unreachable it stays pending and can be retried without creating a duplicate.
  - Each defect gets a code of the form `DEF-NNNN`.
- As a qa_member, I want a defect raised from a failed test case in `Test Execution` to be registered here and linked to that test case so that every failure is traceable to its defect.
  - Its Found In is set to UAT for a UAT execution file and SIT otherwise.
- As a qa_lead, I want to pull production and other Redmine issues into QM Pulse, by tracker or by syncing a parent ticket's subtree, so that defects raised outside QM Pulse are tracked too.
- As a qa_member, I want to refresh defect statuses from Redmine, with a single defect refreshed when I open it, so that QM Pulse shows Redmine's current status.
- As a dev_member, I want to change a defect's status, pushed to Redmine first, so that both systems agree on where the fix stands.
  - Moving a defect back from a resolved status, or to a reopened status, counts as a reopen and notifies its assignee.
- As a dev_lead, I want to assign or reassign a defect to a developer so that every defect has an owner.
  - Requirement defects can also be handed to `qa_member`, `qa_lead` or `hod_qa` users.
- As a dev_member, I want to submit my fix on a QA defect for code review, with an optional pull-request link and evidence, and have a reviewer approve it or send it back, so that fixes are peer-reviewed before they are marked resolved.
- As a dev_member, I want to record a root cause, root cause category and resolution summary on a QA defect so that the organisation learns why defects happen.
  - Categories: Code defect, Configuration, Data issue, Environment, Requirement gap, Third party.
- As a qa_member, I want to verify a fixed defect with mandatory evidence and a note, which are sent to Redmine with the Verified status, so that closure is backed by proof.
- As a qa_member, I want to classify a defect into a defect category so that defects can be analysed by kind.
- As a qa_member, I want to edit a defect's title, description, expected and actual result, tracker, severity and module, with Redmine-held fields updated in Redmine too, so that the record stays accurate.
- As a qa_member, I want to link a defect to a test case so that the test case that found it is recorded and shows the defect number.
- As a qa_lead, I want to analyse a production defect's escape, with a status (Pending, Analyzing, Closed), a class (Coverage gap, Selection gap, Passed wrongly) and notes, and to create a regression test case from it, so that escaped defects are prevented from recurring.
- As a qa_member, I want a defect's Redmine history, with comments, field changes and attachments, and what is new since I last looked, so that I can follow its progress without opening Redmine.
- As a qa_lead, I want to export selected defects to the Excel defect log so that defects can be reported outside QM Pulse.
- As a admin, I want to delete defects in bulk from QM Pulse so that test data and mistakes can be cleared.
  - Deletion does not touch Redmine; a synced defect returns on the next pull.

### Non Functional Requirement
[v1.0.0]
- Redmine is the system of record for QA, production and other defects; QM Pulse keeps a local copy plus its own workflow fields. Requirement defects exist only in QM Pulse.
- The Defects module reaches Redmine only through its REST API, using the user's personal Redmine API key where set and the system key otherwise; Redmine history requires a personal key. (`Reporting` additionally reads the Redmine database directly for the Verdict Report.)
- When a defect's assignee differs between QM Pulse and Redmine, the side changed most recently wins.
- Status refreshes run in batches of 90 issues; a tracker pull fetches the 100 most recently updated issues; a subtree sync reaches 5 levels deep.
- Redmine history shows 20 entries per page and can be filtered to comments, field changes or attachments.
- Notifications are sent when a defect is opened (to QA leads and above in the project), assigned, changes status, is reopened, needs retest, and is submitted for, approved in or rejected in code review.
- Defect exports are named with the date.

### Constraint
[v1.0.0]
- Severity is Critical, High, Medium or Low; Found In is SIT, UAT or Production.
- Defect statuses are Redmine's own status list.
- A defect cannot move to a resolved status until its latest code review is approved, and a Critical or High QA defect also needs a root cause.
- Only `qa_member`, `qa_lead`, `qa_manager`, `hod_qa`, `admin` and `cto` may verify a defect, and only from the "For QA Test" status.
- Root cause and resolution may be recorded only by Dev-department users, `admin` and `cto`.
- Linking a test case is limited to QA-department users, `admin` and `cto`.
- Code review is submitted only by the defect's assignee and decided by someone else in the Dev department, at tier 2 or above, or by `admin` or `cto`.
- Only an `admin` may delete defects.
- Production and other defects can only be brought in from Redmine, not created on the page.
- Defect screenshots are images of at most 5 MB, up to 10 per defect; verification evidence is at most 10 MB.
- A defect's status cannot be changed while its Redmine issue is unavailable.
- The defect list is limited to projects, and modules, the user has been given access to in `Configuration`.

## Traceability

### User Story
[v1.0.0]
- As a qa_lead, I want a traceability matrix linking each requirement to its test cases and their latest execution result so that I can prove every requirement has been tested.
  - Each requirement row shows its outline number, Redmine ID, title, module, test case count, passed, failed, blocked and not-run counts, a coverage bar and an overall status.
  - Expanding a requirement lists its test cases with case ID, title, any defect, execution date and result.
  - Requirements without test cases are flagged.
- As a qa_lead, I want parent requirements to roll up their children's test results, with each parent showing how many test cases are its own and how many come from its children, so that I can read coverage at any level of the hierarchy.
- As a qa_lead, I want the matrix grouped by project and then by milestone, ordered by milestone due date, so that coverage is read release by release.
- As a qa_lead, I want to scope the matrix to one milestone so that I see only that sprint's results.
  - Ancestors of in-scope requirements that sit outside the milestone are shown greyed as context only.
- As a qa_lead, I want to filter the matrix by project, module and overall status so that I can focus on gaps.
- As a qa_lead, I want summary counts of total requirements, fully passed, failing and with no test cases mapped so that overall coverage is visible at a glance.
- As a qa_lead, I want to export the requirements traceability matrix for a project and milestone in the BSB RTM template so that the client receives the traceability document in its required format.
  - The workbook has a Doc Info sheet, with a revision history built from approved requirements and approved execution files, and a Traceability Matrix sheet with one row per requirement and its system and integration test case IDs.
- As a qa_lead, I want to download a flat RTM workbook from step 8 of the `QA Pipeline` listing every requirement and test case with its latest result and defect so that the release has a full test evidence record.

### Non Functional Requirement
[v1.0.0]
- A requirement's status is No TCs when it has no test cases, otherwise Failing if any failed, Blocked if any blocked, Not Run if none were run, Passed if all passed, and In Progress otherwise.
- Coverage is the share of a requirement's test cases, including its descendants', that passed; a test case linked at two levels is counted once.
- A requirement's test cases include library test cases linked to it, execution test cases linked to it directly, and those linked to other requirements with the same Redmine ticket in the same project.
- When a milestone is selected, only execution results from that milestone's execution files are used.

### Constraint
[v1.0.0]
- The BSB RTM export requires both a project and a milestone.
- The matrix lists only projects the user can access.

## QA Analytics

### User Story
[v1.0.0]
- As a qa_manager, I want a QA analytics dashboard for a chosen project so that I can see testing and defect trends over time.
  - Execution trend: passed, failed, blocked and not run per week.
  - Execution velocity: test cases executed per week.
  - Pass rate for each of the project's 6 most recent milestones.
  - Defect density by module for the 10 modules with most defects, split by severity.
  - Defect trend: defects opened and closed per week.
  - Defect escape funnel for the 6 most recent milestones: defects found in SIT, UAT and Production.
  - Requirement coverage snapshot: total requirements, how many have test cases, how many have been executed and how many have passed.
- As a qa_manager, I want to narrow QA analytics to one milestone, or to a date range when no milestone is chosen, so that I can compare a release against the trend.
  - The date range defaults to the last 90 days.
- As a qa_manager, I want to export the analytics as CSV files so that I can build my own reports.

### Non Functional Requirement
[v1.0.0]
- Weekly charts use ISO weeks starting on Monday and cover at most the last 26 weeks.
- A defect counts as closed when its status is Closed, Resolved or Verified.

### Constraint
[v1.0.0]
- QA Analytics is limited to `qa_lead`, `qa_manager`, `hod_qa`, `admin` and `cto`, and to projects the user can access; a project must be chosen.

## Risk Register

### User Story
[v1.0.0]
- As a pm_lead, I want a Risk Register page for a chosen project so that project and schedule risks are tracked in one place outside the `Dashboard`.
  - The register can be opened pre-filtered to a project, and a linked risk is highlighted.
- As a pm_lead, I want to raise a risk with a title, description, category, milestone or project-wide scope, probability, impact, status, response strategy, owner and mitigation plan so that each risk is assessed and owned.
  - The score is calculated from probability × impact as I fill the form.
  - The owner is chosen from people assigned to the project.
- As a pm_lead, I want to edit and delete risks, deleting only after confirming, so that the register stays accurate.
- As a qa_lead, I want to see a project's risks sorted by status and score, each showing its score, category, probability and impact, milestone, strategy, owner, mitigation and status, so that I can see what threatens delivery.
- As a pm_lead, I want to export a project's risks to the Bestinet "4.3 Risk Log" Excel template so that the PMO receives its official risk log without retyping.
  - Risks are numbered R001, R002 and so on in the order they were raised.
  - The document history lists each risk's creation and every status change.

### Non Functional Requirement
[v1.0.0]
- Risks are listed open first, then mitigating and realised, then closed, and by score within each status.
- Closing or realising a risk records when it was closed; reopening it clears that date.
- Exports are named with the date and project.

### Constraint
[v1.0.0]
- Probability and impact are Low, Medium or High; the score band is Low, Medium, High or Critical.
- Status is Open, Mitigating, Realized or Closed.
- Category is Schedule, Scope, Resource, Technical, External or Other.
- Response strategy is Avoid, Transfer, Mitigate or Accept.
- A title and project are required for every risk.
- Raising, editing and deleting risks requires tier 2 (Lead) or above; `pm_member` can view risks only.
- Only one open or mitigating AI-raised risk may exist per milestone.
- Every risk action is limited to projects the user can access.

## UAT Sign-off

### User Story
[v1.0.0]
- As a pm_lead, I want a registry of UAT sign-off documents across my projects so that business acceptance evidence for every milestone is kept in one place.
  - Each document shows its file name and size, project, milestone, who uploaded it and when.
  - The registry can be narrowed to one project.
- As a pm_lead, I want to upload a signed UAT document against a project's milestone, with an optional description, so that the milestone's acceptance is on record.
  - Opening the registry from step 7 of the `QA Pipeline` starts an upload for that milestone.
- As a pm_lead, I want to download a sign-off document exactly as it was uploaded so that an auditor receives the original file.
- As a pm_lead, I want to delete a sign-off document I uploaded so that a wrong upload can be removed.

### Non Functional Requirement
[v1.0.0]
- The registry lists only documents from projects the user can access.

### Constraint
[v1.0.0]
- Documents may be PDF, Word, JPEG or PNG files of at most 15 MB, and must not be empty.
- Uploading is limited to `admin`, `cto`, `hod_qa`, `hod_fa`, `hod_pm`, `qa_lead`, `qa_member`, `fa_lead`, `pm_lead` and `pm_member`.
- A document may be deleted only by its uploader, `admin` or `cto`.

## Resources

### User Story
[v1.0.0]
- As a qa_lead, I want a Resources view of who is focused on which active milestone right now so that I can balance work across my people.
  - People are grouped into Active, No active milestone and Closed history.
  - Each person shows their department, role, projects, their active milestones, and why they count as on the milestone: QA PIC, QA pipeline assignment, authored requirement, development assignment or milestone ownership.
- As a pm_lead, I want people working on more than one active milestone flagged as overallocated, and to show only them, so that over-stretched people are spotted early.
- As a hod_qa, I want to filter the Resources view by project and department so that I can look at one team at a time.

### Constraint
[v1.0.0]
- The Resources view requires tier 2 (Lead) or above.
- What each viewer sees:
  - `admin`, `cto` and `hod_pm`: every department in every project.
  - `pm_lead`: every department in their own projects.
  - Tier 3 and above in QA, FA or Dev: their own department in every project.
  - Leads: their own department in their own projects.

## Reporting

### User Story
[v1.0.0]
- As a qa_lead, I want a Verdict Report for any execution ticket I choose so that I can present its QA status in one document.
  - Summary: ticket, subject, project and data source.
  - AI risk score by module and AI release readiness, with positives, blockers and an expected release date.
  - Test execution results: total, pass rate, success rate (passed plus in progress), a results chart and a per-module breakdown with a grand total.
  - Development code reviews completed, when the ticket has development tasks.
  - Defect status summary: total, open rate, and counts by status (New, In progress, For QA test, Reopen, Done, Roadblock, Verified, Closed).
  - Active defects, 10 per page, with how often each was reopened.
- As a qa_lead, I want each count in the Verdict Report to link to the execution sheet filtered to that result and module so that I can go straight from a number to the test cases behind it.
- As a qa_lead, I want to download the Verdict Report as a multi-page A4 PDF so that I can archive or forward it.
- As a qa_lead, I want to email the Verdict Report to recipients chosen from the contact list, after previewing it, so that stakeholders receive it without me assembling it.
  - The report is embedded in the email as an image, and an Excel list of open defects is attached when there are any.
  - Recipients are picked from `Configuration` contacts, as individuals or groups, in To and Cc.
- As a qa_lead, I want to send a verdict email for a ticket, PASS or CONDITIONAL SIGN OFF with a required reason, with the execution workbook attached, so that the client is formally told the outcome.
  - The workbook includes active and all QA defects, AI CAPA items, the document reference number, reviewer details and a review log of earlier verdicts.
  - The subject names the environment, tracker, ticket, subject and verdict.
- As a qa_lead, I want a Report Dashboard that calculates an AI risk score by module and an AI release readiness score across my work, and can be printed, so that I can brief management quickly.

### Non Functional Requirement
[v1.0.0]
- Defect data for the Verdict Report is read from the Redmine database first, then the Redmine REST API, then QM Pulse's own defects.
- Pass rate is passed ÷ total; open rate is defects not Verified or Closed ÷ total defects.
- Sending a verdict is recorded in the `Audit Trail` with the ticket, verdict, reason, recipients and whether a workbook was attached.
- Email dates are shown in the Asia/Kuala_Lumpur time zone unless configured otherwise.
- If the verdict workbook cannot be built, the verdict email is still sent without it.

### Constraint
[v1.0.0]
- Email is sent through the configured SMTP server; sending fails with an error when SMTP is not configured.
- A verdict email needs at least one To recipient, and a CONDITIONAL SIGN OFF needs a reason.
- The ticket list offers only execution files in projects the user can access.

## AI Features

### User Story
[v1.0.0]
- As a qa_member, I want an AI Hub of assistant tools so that AI help for testing work is in one place.
- As a qa_member, I want the Requirement Analyzer in the AI Hub to score a chosen requirement and list its risks, missing items and questions so that I can strengthen it before test design.
  - It runs the same analysis as the `Requirements` detail page and records its suggestions there.
- As a qa_member, I want AI to suggest up to 6 edge cases for a chosen requirement, each with a category, scenario, test input, expected behaviour and risk, so that unusual paths are covered.
- As a qa_lead, I want AI to find likely duplicate test cases, with a similarity score and a suggested action of delete, merge or keep, so that the library stays lean.
- As a qa_lead, I want an AI coverage gap analysis, optionally for one requirement and optionally against an uploaded specification (Excel or PDF), so that untested scope is found.
  - It returns a coverage score, covered and uncovered counts, a summary and the top 5 gaps.
- As a qa_lead, I want an AI weekly summary with a headline, health rating, highlights, risks and next week's focus so that I can report the week quickly.
- As a qa_member, I want AI to generate test data of a type I describe, such as Malaysian IC numbers, in a quantity and context I choose, so that I do not invent test data by hand.
- As a qa_member, I want to ask questions about a requirement in plain language and get an answer grounded in that requirement's details, test cases, execution results, defects and discussion so that I can understand it without reading everything.
  - The requirement is found from my question; when several match equally, I am offered up to 5 to choose from and given a combined answer where possible.
  - Once a requirement is identified, the conversation stays on it.
  - My past conversations are listed, newest first, and can be reopened.
- As a qa_member, I want a QA Copilot available on every page, in a General mode and a Requirement mode, so that I can get AI help without leaving my work.
  - General mode keeps my conversation on this browser until I start a new chat.
  - Requirement mode answers as the Requirement Chat does.
  - Replies are formatted with bold, italics, code, lists and headings.

### Non Functional Requirement
[v1.0.0]
- AI requests go to Google Gemini (`gemini-2.5-flash`) first; when Gemini is rate-limited or temporarily unavailable, they fall back through a list of OpenRouter models.
- Prompts sent to the AI providers can include requirement text, acceptance criteria, discussion comments, test case and defect titles, the names of approvers and assignees, and the content of uploaded specification files.
- Requirement Chat conversations are stored per user on the server.
- AI replies are rendered without allowing them to inject markup into the page.
- An uploaded coverage specification may be at most 8 MB; Excel content is cut to 40,000 characters.

### Constraint
[v1.0.0]
- The AI Hub uses the `nav:ai-hub` page permission; the QA Copilot is shown to every signed-in user.
- Requirement Chat searches only requirements in projects the user can access.
- A user can see and reopen only their own conversations.
- There is no Generate SRS/BRS feature.

## Team Hangouts

### User Story
[v1.0.0]
- As a qa_member, I want to plan a team hangout with a title, type, date, description and tagged team members so that the team can socialise together.
  - Types: Team Lunch, Team Dinner, Birthday, Team Outing, Team Event.
  - Each hangout is also added to the team calendar on the `Dashboard`.
  - Tagged members, other than the organiser, are notified.
- As a qa_member, I want to see upcoming and past hangouts so that I know what is planned and what has happened.
- As a qa_member, I want to edit or delete a hangout I organised so that plans stay accurate.
  - Members newly tagged on an edit are notified.

### Constraint
[v1.0.0]
- Title, date and type are required.
- Only the organiser is offered edit and delete.
