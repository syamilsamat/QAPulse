# PMO Pain Points — Cross-Check Against QAPulse

Review of a proposed "PMO Digital Platform" pain-point list against what QAPulse actually has built today, grounded in the codebase (not just feature names). Purpose: decide what to fold into QAPulse's roadmap vs. what belongs to a different product surface entirely.

**Source table reviewed:** 7 pain points (No Single Source of Truth, Uncontrolled Project Intake & Scope Creep, Poor Resource Visibility & Over/Under Allocation, Planning Disconnect vs Execution Reality, Weak Dependency & Risk Management, Lack of Real-Time Visibility, Fragmented Tools & No Integration), each with challenges/symptoms/idea columns from the original pitch deck material.

---

## 1. No Single Source of Truth

**QAPulse today:** PM Dashboard is already a cross-project rollup (milestone health, resource capacity, phase timelines). But `PmoReport.tsx` — the page literally named "PMO" — is a **single-ticket verdict report** (test execution details, defect status, AI risk/readiness scoring for one Redmine ticket), not a portfolio view. The naming overlap between the two is a real confusion risk.

**Verdict:** Don't build a generic "PMO Digital Platform" — unbounded scope (budgets, contracts, org governance). Do position PM Dashboard as the source-of-truth answer, and fix the `PmoReport` naming/positioning before pitching this claim, or it undercuts credibility on first click.

## 2. Uncontrolled Project Intake & Scope Creep

**QAPulse today:** No WBS field, no business-case artifact, anywhere in the schema. The FA requirement-review gate (approve/reject, segregation of duties) is the closest analog, but it operates per-requirement, not per-project intake.

**Verdict:** Don't include. This is portfolio-governance tooling (stage-gates, charters, WBS) — a different product surface than a QA tool. No natural home in the current data model; building it would be scope creep.

## 3. Poor Resource Visibility & Over/Under Allocation

**QAPulse today:** Already built — per-assignee open-task count, estimated hours, overdue count, cross-project, in PM Dashboard's resource capacity table.

**Verdict:** Include — this is a real, working strength. Extend, don't rebuild. Natural next steps: utilization % (est. hours vs. available capacity), overallocation flags when someone spans multiple active milestones simultaneously.

## 4. Planning Disconnect vs Execution Reality

**QAPulse today:** This is exactly what the "Where did the time go" phase-timeline widget already does (plan dates vs. real activity timestamps) — and what CR032 (planned, not yet built) deepens further with multi-cycle rework tracking (repeating Requirement → Develop → Testing cycles instead of a single fixed window).

**Verdict:** Include and lead with this. It's QAPulse's most differentiated existing capability against this entire pain-point list. Ship CR032; don't reinvent.

## 5. Weak Dependency & Risk Management

**QAPulse today:** Confirmed gap — no task-dependency field anywhere in `lib/db/src/schema/tasks.ts`, no risk/RAID entity anywhere in the schema.

**Verdict:** Partial include, scoped small:
- Task dependencies (`blockedByTaskId` or similar) — cheap, fits the existing Tasks table naturally. Worth a scoped CR.
- Full RAID log — bigger new concept. Start with just "Risks," not all four RAID categories (Risks/Assumptions/Issues/Dependencies) at once — Issues already ≈ Defects+Tasks in practice.
- AI risk prediction — defer. It needs the risk data model to exist first before it can predict anything meaningful, and it's already the "Risk Predictor" feature sitting in the AI-pitch backlog (see [[project_competition]]) — not a new commitment, just don't double-count it as new scope here.

## 6. Lack of Real-Time Visibility (Management Blind Spot)

**QAPulse today:** Portfolio summary row already exists in PM Dashboard (total projects, active/at-risk/overdue milestone counts). CR026 (QA Analytics Dashboard — planned, not yet built) covers the trend/analytics half (execution trend, velocity, defect density/trend/escape funnel, coverage snapshot).

**Verdict:** Include — but it's "finish CR026," not a new initiative. No new schema or concept required.

## 7. Fragmented Tools & No Integration

**QAPulse today:** Redmine integration is already deep (requirement import, defect write-through per the standing thin-bridge principle). Excel integration is core to the product (verdict emails, execution sheets, traceability export). Git/commit linkage: confirmed absent — no `commitSha` or equivalent field anywhere in the schema or codebase.

**Verdict:** Redmine/Excel unification is already a strength, not a gap — say so explicitly in any pitch. Git integration is a real but narrow gap — only worth building if there's a specific workflow need (e.g., linking a fix commit to a defect for audit purposes), not a blanket "integrate with Git." CR009/CR010 (Playwright reporter + trigger-from-UI, both pending) is the more relevant dev-tool integration already in the pipeline.

---

## Bottom line

Three of these seven pain points (resource visibility, planning-vs-execution reality, real-time visibility) are places QAPulse already has real, working infrastructure and can credibly claim as wins with modest extension. Two (project intake/WBS governance, full dependency+risk management as originally scoped) are either the wrong product surface entirely or need to start much smaller than the ideas column implies.

**Recommendation:** frame this as "QAPulse: source of truth for delivery execution," not "PMO platform." Rebranding toward a generic PMO platform risks diluting what QAPulse already does well. Keep project-intake governance and full Git linkage explicitly out of scope rather than letting them sit as implied future work.
