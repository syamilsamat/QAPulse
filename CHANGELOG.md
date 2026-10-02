# Changelog

- This file tracks all skill executions by version across all applications.
- The highest version recorded here is the current project version.
- Skills MUST NOT execute for a version lower than the highest version in this file.

> **Read this before trusting the v1.0.0 row below.** It is a deliberate, hand-written
> record, not the output of a skill run. `conductor-feature-develop` has never
> executed in this repository. The row exists because that skill's
> **Redo/Redevelop Guard** partitions requested versions by looking for a matching
> `conductor-feature-develop` entry here: with this row present, v1.0.0 lands in
> `completed_versions` and is filtered out, so a bare
> `/conductor-feature-develop qm-pulse` builds only v1.1.0 instead of trying to
> re-implement 207 user stories that already exist in `artifacts/qm-pulse/src/`.
> Without it, the guard sees no completed versions and the Version Gate does not
> help, because it skips the check entirely for `version:all` and for an omitted
> version.
>
> Consequences worth knowing:
> - **v1.0.0 is now closed to feature development.** An explicit
>   `/conductor-feature-develop qm-pulse version:v1.0.0` will stop with "already
>   developed". That is the intent. To genuinely redo it you would have to delete
>   `IMPLEMENTATION_MASTER.md` and the source code first — do not.
> - **Bug fixing is NOT blocked.** `conductor-defect` uses the older Version Gate,
>   which rejects only a version *lower* than the highest recorded. v1.0.0 is the
>   highest here, so `/conductor-defect api-server version:v1.0.0` still runs — which
>   matters, because the 12 defects in `api-server/context/BUG.md` are tagged
>   `[v1.0.0]`.
> - **Do not add a `## v1.1.0` section until those defects are resolved.** Recording
>   v1.1.0 would make it the highest version and the Version Gate would then refuse
>   the v1.0.0 bug run.
> - **This covers `qm-pulse` only.** The guard matches per application. `api-server`
>   has no PRD yet; when it gets one, it needs its own baseline row.
> - `util-ustagger` has **not** run, so nothing in `qm-pulse/context/PRD.md` is tagged
>   yet. When it does run it will append its own row here. See the folder-prefix issue
>   in CLAUDE.md's Pending Decisions.

---

## v1.0.0

| Date | Application | Skill | Module | Notes |
|---|---|---|---|---|
| 2026-10-02 | qm-pulse | conductor-feature-develop | All | Baseline: QM Pulse v1.0.0 was built by hand and by Replit Agent BEFORE co2 was adopted — see the note above the separator. Row written by hand to record v1.0.0 as already developed. 28 modules, 207 user stories, 109 NFRs, 125 constraints, all described in qm-pulse/context/PRD.md. |
