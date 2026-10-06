# co2 for QM Pulse — Onboarding

For developers who know this codebase but have never used co2.
Written 2026-10-02 against **co2-skills v1.1.12**.

---

## 1. What co2 actually is

co2 is not a framework, a library, or a build step. **Nothing in the running
application depends on it.** It is a set of 18 Claude Code *skills* — prompt
playbooks — that read plain Markdown files in this repo and write code, specs and
tests from them.

So the mental model is:

```
you edit Markdown  →  you invoke a skill  →  the skill edits source code
```

That is the whole thing. If you delete the co2 plugin tomorrow, `pnpm dev` still
works. What you lose is the ability to drive changes from the Markdown.

**The consequence to internalise:** `PRD.md` and `BUG.md` are no longer
documentation. They are **input**. A careless sentence in `PRD.md` becomes a
careless implementation. Treat them with the same care as code review.

---

## 2. Install (per machine, nothing is in this repo)

Two Claude Code plugins, both global:

| Plugin | Source | Why |
|---|---|---|
| `co2-skills` v1.1.12 | the co2 marketplace | the 18 skills themselves |
| `ralph-loop` | `claude-plugins-official` | persistence; see below |

**`ralph-loop` is not optional.** The conductors start it automatically and never
tell you. It re-feeds the same prompt after each session exit, so a run that
exceeds the context limit resumes instead of stopping half-finished. Without it
installed, a long conductor run silently loses that resilience and you get a
partly-implemented feature with no obvious error.

Nothing in the repo will warn a new developer that either plugin is missing.
Check with `/plugin` before your first run.

Also per machine, and already in `CLAUDE.md`: Node 24, pnpm 12.3.4, your own
`.env`, and **your own Postgres container**. A shared dev database is not viable —
`scripts/src/clear-*.ts` delete wholesale, so one person's reseed destroys
another's conductor run.

---

## 3. The file layout, and why ours is unusual

co2 normally expects one root folder per application holding **both** source and
context. This is a pnpm monorepo, so we split them:

```
qm-pulse/context/        ← co2 artifacts ONLY     (the name skills match on)
  PRD.md                 ← user stories, NFRs, constraints.  INPUT, by hand
  BUG.md                 ← bug reports.                      INPUT, by hand
  model/ mockup/ specification/ test/ develop/ bug/   ← all OUTPUT
api-server/context/      ← same shape
artifacts/qm-pulse/      ← the actual React source
artifacts/api-server/    ← the actual Express source
lib/*                    ← shared packages. OUTSIDE co2's model
CHANGELOG.md             ← root. The gatekeeper. See §6
```

Two rules that will bite you:

- **Never put co2 artifacts under `artifacts/`,** and never put source under
  `<app>/context/`. The folder name in the first column is the argument you pass to
  a skill (`/conductor-defect qm-pulse`).
- **`lib/*` is invisible to co2.** A real feature usually touches it, and no skill
  will sequence it for you. Do it by hand, in this order:
  `lib/db` → `lib/api-spec` → api-server → qm-pulse.

---

## 4. The 18 skills, grouped by when you'd reach for one

**Conductors — the orchestrators you actually invoke.**

| Skill | Does |
|---|---|
| `conductor-feature-prepare` | PRD.md → model, mockups, specs, test specs. Writes no app code |
| `conductor-feature-develop` | specs → source code. This is the one that writes the app |
| `conductor-defect` | BUG.md → reproduce, fix, verify, one bug at a time |
| `conductor-upgrade-version` | features then bugs for one version, in a single session |

**Generators — the prepare chain calls these in order; rarely invoked directly.**
`util-ustagger` → `modelgen-relational` (or `-nosql`) → `mockgen-tailwind` →
`specgen-*` → `testgen-functional`.

**specgen variants:** `laravel-eloquent-bladehtmx`, `react-mui`,
`spring-jpa-jtehtmx`, `spring-jpa-restapi`, `ts-cli`.
⚠️ **None of these fits us.** We are React + Tailwind + shadcn (not MUI) and
Express + Drizzle (no Node/Express variant exists at all). Expect to hand-correct
specgen output, or skip it and write the specification yourself.

**Utilities.**

| Skill | Does |
|---|---|
| `util-ustagger` | assigns `US-`/`NFR-`/`CONS-` codes in PRD.md, appends to CHANGELOG.md |
| `util-usanalyzer` | lints PRD.md for contradictions and gaps; writes `[TODO]` inline |
| `util-projectsync` | scaffolds folders, PRD/BUG sections from `CLAUDE.md`'s module list |
| `depgen-k8s`, `util-preparek8senv` | Dockerfile and k8s manifests. **We don't deploy this way** — production is Replit. Skip |

---

## 5. `CLAUDE.md` is read automatically, and it is load-bearing

Every skill reads `CLAUDE.md` at the start of a session without being asked. It
supplies the paths, credentials pointer, module list and shell rules that make
commands work on Windows.

This means **a wrong fact in `CLAUDE.md` propagates into generated code.** Four
wrong claims were found and corrected on 2026-10-02 (AI provider, PMO report
attachments, role extensibility, SMTP host). If you discover another, fix it there
first, before running anything.

`util-projectsync` derives the project structure from `CLAUDE.md`'s module list, so
that list is a schema, not prose.

---

## 6. `CHANGELOG.md` — read this before you touch it

The root `CHANGELOG.md` is hand-written and **its `## v1.0.0` row names
`conductor-feature-develop` as the skill even though that skill has never run
here.** That is deliberate. Read the note above its `---` separator before adding
anything.

Why it matters — two separate mechanisms, and only one protects you:

**Version Gate** (ustagger, conductor-defect, conductor-feature-develop) reads the
highest `## vX.Y.Z` here and rejects a *lower* requested version. But it **skips
entirely when the version argument is `all` or omitted** — and omitted is the
default. So it protects nothing in normal use.

**Redo/Redevelop Guard** (conductor-feature-develop only) splits the requested
versions into "already completed" and "new" by looking for a
`conductor-feature-develop` row *for that application*. This guard **does** apply to
`version:all`. The v1.0.0 row is the only thing standing between a bare
`/conductor-feature-develop qm-pulse` and a very long attempt to re-implement 207
user stories that already exist.

Two rules follow:

- **Do not add a `## v1.1.0` section until the 12 defects in
  `api-server/context/BUG.md` are fixed.** They are tagged `[v1.0.0]`; making v1.1.0
  the highest version would make the Version Gate refuse the bug run.
- **`api-server` needs its own baseline row** when it gets a PRD. The guard matches
  per application.

---

## 7. `BUG.md` — do not tidy it

`conductor-defect` tags and then **attempts to fix every untagged `- ` bullet under
an H2 module heading.** The file's shape is therefore executable:

- Worked examples must stay sealed inside `<!-- -->`.
- Preamble prose must contain **no `- ` bullets** and **no literal `[vX.Y.Z]`**.
- H1s (`# Common`, `# System Module`, `# Business Module`) are organisational only.
  A bullet under a bare H1 will not be found.
- Order matters: the conductor works top to bottom, so most severe goes first.

Write each bug as an **exact request** — method, path, body — plus expected vs
actual status and a `file:line` pointer. These are server-authorization bugs; they
are not reproducible as browser clicks.

---

## 8. Playwright is part of co2 here, not a nicety

Both conductors reproduce and verify through Playwright. Config is
`playwright.config.ts` at the repo root.

- Both servers must already be running — there is no `webServer` block, on purpose.
- Bug repro specs live in `<app>/context/bug/<module-slug>/<BUG-XXX>/` and are
  picked up by the **`bugs` project**, which has `testDir: "."` and a layout-agnostic
  `testMatch` *because* `conductor-defect` runs `playwright test <path>` on paths
  outside the normal `testDir`. Don't "clean that up" — it is a hard requirement.
- The `bugs` project supplies an authenticated admin session. **Do not write a login
  flow.**
- Save every screenshot to the bug folder with an explicit `path:`.
- `pnpm run test:e2e` is the regression suite and excludes bug specs — those are red
  by design until their fix lands. `pnpm run test:e2e:bugs` runs them.

---

## 9. Before any conductor run — checklist

1. **Pause Replit Agent.** It has 181 commits here and will edit files underneath a
   running conductor.
2. `set -a; source .env; set +a` — there is no dotenv loader.
3. `docker start qmpulse-db`, then api-server on 8080, then
   `PORT=5173 pnpm --filter @workspace/qm-pulse run dev`.
   Both default to the same port, hence the `PORT=5173` prefix.
4. Commit or stash first. A conductor edits many files across a long run; `git diff`
   is your only undo.
5. Confirm both plugins are installed (§2).

Do **not** use `/api/health` as a liveness probe — it returns 401, like every route.

---

## 10. Known blockers and gaps, as of 2026-10-02

| Item | State |
|---|---|
| Numeric folder prefix | `util-ustagger` and `modelgen-relational` only match root folders with a `1_` style prefix. Ours have none, so they stop with no match. `util-usanalyzer` and the conductors tolerate it. **Deferred by decision** — don't rename unprompted |
| `qm-pulse/context/PRD.md` is untagged | Blocked by the above. Needs `[v1.0.0]` (81 blocks) **and** `[v1.1.0]` (2 blocks) |
| `api-server` has no PRD | Only `BUG.md`. `conductor-defect` works; `conductor-feature-*` does not |
| No specgen fits our stack | See §4 |
| 12 filed defects | Filed, **not fixed** |
| `util-updprd` | **Does not exist** in v1.1.12, despite being named in `CLAUDE.md`. Edit `PRD.md` by hand |

---

## 11. Where to read next

| File | What it holds |
|---|---|
| `CLAUDE.md` | the authoritative project facts, the decision log, and the shell/server rules |
| `STEP5-FINDINGS.md` | all findings with IDs D1–D10, B1–B18, C1–C60 |
| `CO2_ADOPTION_REPORT.pdf` | what the adoption work changed, and why |
| `qm-pulse/context/bug/BUG_MASTER.md` | the zero-bug `conductor-defect` dry run; records which mechanisms were actually validated |
| `PROJECT.md` | **stale, do not trust.** Four of seven checked claims were wrong |
