# Client-demo data

Populates QAPulse with a realistic, fully-linked dataset for demoing to a
client, and cleanly removes it again afterward. Everything is created
through the real API — not raw SQL inserts — so validation, the FA review
workflow, defect codes, and audit logging all fire exactly as they would for
a real user.

## What gets created

Two projects, each with a full sprint/release history:

- **Customer Portal Revamp — DEMO** — auth, search, checkout, cart, wishlist
  - Sprint 12 (completed, ~90% pass)
  - Sprint 13 (active, **overdue** — due 3 days ago, still incomplete)
  - Sprint 14 (planned, nothing executed yet)
- **Mobile Banking App — DEMO** — fund transfer, statements, bill payment,
  biometrics, rewards
  - UAT Phase 1 (completed, ~95% pass)
  - Release 2.0 (active, **at risk** — due in 4 days, ~50% coverage)
  - Release 2.1 (planned)

Plus: 6 users across the real role ladder (PM Lead, QA Lead, 2 QA Members,
FA Lead, Dev Lead), 2 teams, ~25 requirements in a real parent/child
hierarchy with FA review states (including one rejected → revised →
resubmitted → approved, to show the full re-review flow), ~30 test cases,
5 execution files (QA + UAT) with realistic pass/fail/blocked/not-run
results, 6 defects (including a production escape with root-cause
classification and an auto-created regression test case), and 12 tasks
spread across the team with a couple deliberately overdue.

This is enough to make every major page — Requirements, Traceability
Matrix, TC Library, Execution, Defects, Tasks, PM Dashboard, Milestones —
show something real instead of empty states.

## Before you run it

1. **Find your app's public URL** — the same one you use to open QAPulse in
   your browser (e.g. `https://your-repl-name.username.repl.co`). The
   script appends `/api` itself, exactly like the frontend does.
2. Make sure `admin@qapulse.com` / `admin123` is still the working admin
   login (or override via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## Run it

From the Replit shell:

```bash
cd scripts
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-demo-data.ts
```

Takes a minute or two — it's making several hundred real API calls, the same
as a person clicking through the app would. Progress prints as it goes.

All demo users share one password: `Demo@2026` (see `demo-data.ts`'s
`DEMO_PASSWORD` if you change it). Their emails are all
`firstname.lastname@demo.qapulse.local`, so they're easy to spot in the
Team/Roles pages and won't collide with anyone real.

## Clear it before/after a demo

```bash
cd scripts
QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/clear-demo-data.ts
```

This reads `demo-seed-manifest.json` (written automatically while seeding —
one entry per entity created, in creation order) and deletes every one of
those entities and nothing else. It never guesses by name pattern — only
IDs it actually created are touched, so it's safe to run even if you've
since added real client data alongside the demo data.

Re-running `seed-demo-data.ts` while a manifest already exists is refused on
purpose (to avoid double-seeding) — run the clear script first.

## If a run fails partway through

The manifest is written incrementally (one line per entity, as it's
created), so a failed run still leaves a usable, safe-to-clear manifest.
Run `clear-demo-data.ts` before retrying `seed-demo-data.ts`.

## Known limitations

- **Defects show a "pending sync" badge.** The write-through push to Redmine
  (`redmine-defect-bridge.ts`) will fail in a sandbox with no real Redmine
  connection — this is by design (CR019's "never block on Redmine" rule),
  not a bug. It's a small badge on the Defects page, not a blocker; if it
  looks odd mid-demo, mention it's expected without a live Redmine link.
- **`demo-seed-manifest.json` is gitignored** — it's local run state, not
  something to commit. Don't remove it manually between seed/clear runs
  unless you're certain the corresponding data is already gone.
