# co2 Adoption — Change Report

**Branch:** `co2_env`   ·   **Date:** 2026-10-02   ·   **Baseline:** commit `fa98acb`

This report covers the second batch of co2 adoption work, which carried the project
from "the tooling is wired up" to "the tooling has real input to work on". It is a
summary of what changed and why; the detailed findings behind it are in
[STEP5-FINDINGS.md](STEP5-FINDINGS.md), and the decisions it recorded are in the
`# Pending Decisions` section of [CLAUDE.md](CLAUDE.md).

**No application code was changed.** Nothing under `artifacts/` or `lib/` was
touched. Everything here is documentation, co2 input files, and project
configuration.

---

## 1. `qm-pulse/context/PRD.md` — new, 996 lines

The main deliverable: a Product Requirements Document for QM Pulse in co2's format,
reverse-engineered from the code. 28 modules under the three H1 groups, holding 207
user stories, 109 non-functional requirements and 125 constraints.

**Why:** every co2 generator and both conductors read `PRD.md`. Without it,
`conductor-feature-prepare` has no input and Step 6 cannot start.

**How it was written, and why that matters.** `CHANGE_REQUESTS.md` was used for
business intent only, never as a statement of current behaviour, and every user
story was confirmed against `artifacts/qm-pulse/src/` before being written. The
register is implementation history: later CRs revise earlier ones, and it describes
things that never shipped. CR014 discusses a `pmo` role at length and plans roles
named `project_manager` and `hod_fa_bi`; none of the three exist. A PRD written by
summarising the register in order would have reintroduced a deleted role into the
document that now drives code generation.

Two versions are tagged. `[v1.0.0]` (81 blocks) is the system as deployed today.
`[v1.1.0]` (2 blocks) is one agreed change, described in section 4 below. Items are
otherwise **untagged** — `util-ustagger` assigns the `US-`/`NFR-`/`CONS-` codes, and
it has not been able to run yet (section 6).

The known limitation of any reverse-engineered PRD applies: it documents what the
code *does*, not what it *should* do. Where the UI and the server disagree, the PRD
states the **intended** rule, and the actual server behaviour is recorded in
`STEP5-FINDINGS.md` instead.

---

## 2. `api-server/context/BUG.md` — 12 defects filed

Previously an empty module skeleton. It now holds 12 bugs, all of them missing or
incomplete **server-side authorization**, found while checking the PRD against the
api-server routes. Each entry gives an exact request (method, path, body), the
expected versus actual status, and a `file:line` pointer, because `conductor-defect`
reproduces with Playwright and these are not browser-reproducible as UI steps.

| Module | Count | Most serious |
|---|---|---|
| Requirements | 2 | Any signed-in user can permanently delete any requirement — no project or role check (`requirements.ts:737`) |
| Test Execution | 2 | A normal Save deletes stored rows the client was never sent, destroying rework rows (`test-execution.ts:1984`) |
| Test Cases | 1 | Edit, delete and clone are gated on login only (`test-cases.ts:580`) |
| Defects | 3 | Redmine-pulled defects are stored with no project, so every user sees them |
| Notifications and Calendar | 2 | Any user can edit or delete any calendar event; `createdBy` is taken from the request body (`calendar.ts:105`) |
| Dashboard and Reporting | 2 | Verdict-report reads *and* outbound emails are gated on login only; defect text is interpolated into email HTML unescaped |

Entries are ordered most-severe-first because `conductor-defect` works through them
in file order. Five were re-read line by line and are marked **Verified**.

The remaining ~48 findings from the same review were deliberately **not** filed.
They are permission mismatches, functional defects and documentation drift; mixing
them in would bury the items above. They stay in `STEP5-FINDINGS.md`.

`qm-pulse/context/BUG.md` is unchanged and still holds no live bugs.

> **Do not "tidy" either BUG.md.** Their shape is load-bearing. `conductor-defect`
> tags and then attempts to fix **every untagged `- ` bullet under a module
> heading**, so the worked examples must stay sealed inside `<!-- -->`, and preamble
> text must not use `- ` bullets or contain a literal `[vX.Y.Z]` tag.

---

## 3. `CHANGELOG.md` — new, and deliberately hand-written

Records v1.0.0 as already developed. **Its `## v1.0.0` row names
`conductor-feature-develop` as the skill even though that skill has never run in
this repository.** This is intentional, not an error, and the file explains itself
in a note above its separator.

**Why:** `conductor-feature-develop` has a Redo/Redevelop Guard that partitions the
versions it was asked for into "already completed" and "new", by looking for exactly
that skill name in this file for that application. With the row present, a bare
`/conductor-feature-develop qm-pulse` filters v1.0.0 out and builds only v1.1.0.
Without it, nothing protects the existing application: the older Version Gate skips
its check entirely when the version argument is `all` or omitted — and omitted is
the default. The guard is the only thing standing between a default invocation and a
very long attempt to re-implement 207 user stories that already exist.

Two rules follow from it, both repeated in `CLAUDE.md`:

- **Do not add a `## v1.1.0` section until the 12 defects above are resolved.**
  `conductor-defect` uses the Version Gate, which rejects a requested version
  *lower* than the highest recorded. The defects are tagged `[v1.0.0]`; with v1.0.0
  highest they still run, but recording v1.1.0 would lock the bug run out.
- **`api-server` will need its own baseline row** when it gets a PRD. The guard
  matches per application.

---

## 4. `CLAUDE.md` — four corrections and a decision log

**Four claims were wrong and are now fixed.** Each was re-verified in the code
first:

| Claim | Was | Actually |
|---|---|---|
| AI provider | an OpenAI-compatible endpoint at `api.openai.com/v1` | **Google Gemini** (`gemini-2.5-flash`) with **OpenRouter** as fallback. `AI_INTEGRATIONS_OPENAI_*` is read only by unused audio/image clients in `lib/integrations*`; no route calls OpenAI |
| PMO report email | HTML + PDF | HTML + an **inline PNG** (embedded by `cid`) + an optional `.xlsx`. "pdf" appears **zero** times in `verdict-report.ts` |
| Roles | 15, stated flatly | 15 **defaults, not a fixed enum** — `roles` is a table and `routes/roles.ts` exposes create/rename/delete, so an admin can add roles the hardcoded `permKey` checks will not know about |
| SMTP host | `smtp.office365.com` | **two conflicting defaults** — office365 in `lib/email.ts`, gmail in `verdict-report.ts`. Set `SMTP_HOST` explicitly |

The first three mattered because `CLAUDE.md` is loaded automatically into every
session and is the designated source of truth for this repo; a wrong claim there
propagates into generated specs.

**`Current Version` is settled at v1.0.0.** The whole system as deployed is v1.0.0
and the first new feature becomes v1.1.0. There is no CR-to-semver mapping; CR
numbers stay history only, and `package.json` stays `0.0.0`.

**A `# Pending Decisions` section** now carries the open items and, below them, a
`## Resolved 2026-10-02` log of decisions D1–D9 with their reasoning — so a future
session does not re-litigate settled questions. The decisions taken:

- Where UI and server disagree, the PRD states the **intended** rule (D2).
- The Configuration / Team Members change is applied as `[v1.1.0]` (D3) — see below.
- **CR058–CR077 will not be backfilled** into `CHANGE_REQUESTS.md` (D4). 17 of them
  are cited in shipped code comments, which are now their only record. Nothing
  depends on the gap, because the PRD was written from the code.
- The security subset of the findings is filed as bugs; the rest is reported only (D5).
- **CR links stay out of PRD References** (D6). A generator following a CR link
  could reintroduce something later CRs deleted — the `pmo` role is the worked
  example.
- **Module structure stays at 28** (D7, D8). Dashboard keeps all three pages and the
  team calendar stays under it, with reminders under Notification. Splitting would
  put the PRD out of step with both BUG.md skeletons and `CLAUDE.md`'s `# Domains`.

### The one agreed behaviour change (v1.1.0)

Configuration → Team Members: the tab shows a **read-only** member list, `qa_lead`
can view it but not create users, and the create-user form is limited to tier 3
(Manager) and above plus `admin`. **Reason:** today `qa_lead` is shown the create
form, but the server requires tier 3, so it always fails.

This was written into the PRD by hand rather than through `util-updprd`, because
that route runs after tagging and tagging is blocked (section 6). If `util-updprd`
is run later, check it does not duplicate these two items.

---

## 5. `qm-pulse/context/bug/BUG_MASTER.md` — dry-run record

Output of the first-ever `/conductor-defect qm-pulse`, run against the empty BUG.md
as a **plumbing test**: zero bugs collected, `BUG.md` left byte-identical. It is
kept because it records which mechanisms were actually validated (app-name
resolution, context auto-paths, version resolution, the Version Gate skipping on a
missing `CHANGELOG.md`) and which were deliberately not exercised — `depgen-k8s`
would have generated a `Dockerfile` and `k8s/` manifests that no bug fix justified.

---

## 6. Known blocker — numeric folder prefix

`util-ustagger` and `modelgen-relational` resolve the application folder by listing
*root-level folders that **have** a numeric prefix* (`1_hub_middleware`). This
repo's are `qm-pulse` and `api-server`, with none, so those two skills stop with no
match. `util-usanalyzer` and both conductors explicitly tolerate "or no prefix" —
the restriction is inconsistent across the skill set, and was confirmed in practice
while writing the PRD.

Consequence: the PRD is **untagged**, and `conductor-feature-prepare` cannot
complete, because `util-ustagger` is the first step of its chain. The two fixes are
to rename the folders to `1_qm-pulse` / `2_api-server` and update the two `Context:`
paths in `CLAUDE.md` (safe — these folders hold only co2 artifacts, no source, and
packages are named `@workspace/*`, so no import points at them), or to treat the
unprefixed folder as a match for a given run. **Deferred by decision**, not
overlooked.

---

## 7. Removed

`STEP5-HANDOVER.md` and `STEP5-PROMPT.txt` — scaffolding written to brief a
higher-limit Claude session on another machine to produce the PRD. That transfer has
happened and the PRD is in the tree, so both files are spent. Everything in them
that outlives the handover was folded into `CLAUDE.md` (environment rules, the
BUG.md warning) or into this report.
