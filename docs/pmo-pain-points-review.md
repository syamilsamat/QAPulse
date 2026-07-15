# PMO Pain Points — Cross-Check Against QAPulse

Review of a proposed "PMO Digital Platform" pain-point list against what QAPulse actually has built today, grounded in the codebase (not just feature names). Purpose: decide what to fold into QAPulse's roadmap vs. what belongs to a different product surface entirely.

**Source table reviewed:** 7 pain points (No Single Source of Truth, Uncontrolled Project Intake & Scope Creep, Poor Resource Visibility & Over/Under Allocation, Planning Disconnect vs Execution Reality, Weak Dependency & Risk Management, Lack of Real-Time Visibility, Fragmented Tools & No Integration), each with challenges/symptoms/idea columns from the original pitch deck material.

**Update (2026-07-15):** this review directly drove CR033–CR038 — several of them cite it as their origin by name. Status table below reflects current implementation; original per-item reasoning kept underneath for context on *why* each call was made.

**CR038 closed out two lingering items:** the utilization % question (parked in CR034/CR036/CR037) is resolved for resource item #3 — flat 40h/week, Dev/PM only (see item 3 below for why it doesn't extend to QA/FA). Separately, and not one of the original 7 pain points but tracked alongside this review since CR014: `qa_manager` now has real department-wide visibility, matching `hod_qa`'s reach, closing a scope-parity gap that had sat open since CR014.

---

## Status at a glance

| # | Pain point | Original verdict | Current status |
|---|---|---|---|
| 1 | No Single Source of Truth | Fix the `PmoReport` naming confusion; don't build a generic platform | ✅ **Resolved** — renamed to "Verdict Report" (CR036 Pt.1) |
| 2 | Uncontrolled Project Intake & Scope Creep | Don't include — different product surface | ⛔ **Still out of scope**, deliberately (CR033 non-goal) |
| 3 | Poor Resource Visibility & Over/Under Allocation | Include, extend the existing capacity table | ✅ **Resolved** — new Resources page (CR034) + overallocation badge/filter (CR036 Pt.3) + utilization % on the PM Dashboard Capacity table, flat 40h/week (CR038 Pt.2) |
| 4 | Planning Disconnect vs Execution Reality | Include and lead with this — already differentiated | ✅ **Strengthened further** — CR032 shipped; CR033 confirms Controlling coverage is now comprehensive |
| 5 | Weak Dependency & Risk Management | Task deps: small scoped CR. Risk: Risks-only register, not full RAID. AI prediction: defer until data model exists | ✅ **Resolved, in the exact sequence recommended** — `blockedByTaskId` (CR036 Pt.2), Risk Register (CR033 Pt.2), AI Risk Predictor built on top once the register existed (CR037) |
| 6 | Lack of Real-Time Visibility | "Finish CR026," not a new initiative | ✅ **Resolved** — CR026 QA Analytics Dashboard deployed |
| 7 | Fragmented Tools & No Integration | Redmine/Excel already a strength; Git linkage narrow, no concrete need yet | ⛔ **Unchanged** — no Git linkage built (correctly — still no concrete workflow need identified); CR009/CR010 Playwright reporter still pending |

**5 of 7 resolved**, both open items intentionally so (not oversights).

---

## 1. No Single Source of Truth

**Then:** PM Dashboard was already a cross-project rollup, but `PmoReport.tsx` — the page literally named "PMO" — was a single-ticket verdict report, not a portfolio view. Naming overlap flagged as "a real confusion risk."

**Now:** CR036 Part 1 renamed it — sidebar label and page header both now read "Verdict Report." Route (`/pmo-report`) and the `pmo` role name were deliberately left alone (bookmarks, existing role-based redirects, `PMO_EMAIL_TO` convention all keep working) — only the user-facing name changed, exactly the "positioning fix, not a platform rebuild" the original verdict called for.

## 2. Uncontrolled Project Intake & Scope Creep

**Then:** No WBS field, no business-case artifact anywhere in the schema; the FA requirement-review gate is the closest analog but operates per-requirement, not per-project intake.

**Now:** Unchanged, and explicitly confirmed as a deliberate non-goal in CR033's IPECC audit — "Initiating (project charter, stakeholder register) — a genuinely new concept with no existing data to build on, unlike Closing/Risk which extend structures already in place. Worth its own CR if the org wants formal charter sign-off tracked in-app." Still the right call: a different product surface, not a gap in what's been built so far.

## 3. Poor Resource Visibility & Over/Under Allocation

**Then:** A resource capacity table already existed (open-task count, est. hours, overdue, per assignee) but only for PM-tier roles, with no cross-milestone overallocation signal.

**Now:** CR034 built a whole new department-generic Resources page (QA/FA/Dev/PM, each using their actual system of record — execution PIC for QA, authored requirements for FA, tasks for Dev/PM — rather than forcing everyone through `tasksTable`), with Active / No Active Milestone / Closed History views. CR036 Part 3 added the amber "Overallocated" badge + filter for anyone spanning 2+ active milestones — the exact signal flagged as a "natural next step." Utilization % was resolved in CR038: flat 40h/week per person, no per-user configurable capacity field — added to the PM Dashboard's Capacity table (Dev/PM, where task-based `estimatedHours` already existed), deliberately **not** added to the Resources page, since QA/FA have no hours-based signal at all there (execution PIC / requirement authorship don't carry effort estimates) — that would need a different proxy metric entirely, a separate problem from the capacity-model decision.

## 4. Planning Disconnect vs Execution Reality

**Then:** The phase-timeline widget (plan dates vs. real activity) was already QAPulse's most differentiated capability against this pain point; CR032 was planned to deepen it with multi-cycle rework tracking.

**Now:** CR032 shipped. CR033's own IPECC audit confirms the dashboard's "Controlling" coverage is now "comprehensive — Burn Rate, SPI, First-Pass Rate, Req Stability, Top Blockers, the multi-cycle phase timeline, and the cross-milestone benchmark trend all live here." The honest read from that audit: it's a strong Controlling dashboard that had been mislabeled as a general PM dashboard — which is exactly why CR033 added the missing Closing and Planning/Risk pieces around it rather than touching this core.

## 5. Weak Dependency & Risk Management

**Then:** Confirmed gap — no task-dependency field, no risk/RAID entity anywhere in the schema. Recommendation: task dependencies as a small scoped addition, a Risks-only register (not full RAID), and AI risk prediction deferred until the data model exists.

**Now:** Landed in exactly that sequence:
- **Task dependencies** (CR036 Part 2) — single `blockedByTaskId` column, deliberately *not* many-to-many ("if real usage demands multiple blockers later, a join table can supersede the column without losing data") — matches "start small," not the ideas column's implied full dependency graph.
- **Risk Register** (CR033 Part 2) — a dedicated `risks` table (category/probability/impact/status/mitigation/owner), explicitly scoped to just Risks, distinguished from the existing "Top Blockers" card (which is really an Issue Log — already-happened problems, a different PMBOK artifact) — matches "start with just Risks, not all four RAID categories."
- **AI Risk Predictor** (CR037) — built only once the Risk Register existed to feed it, citing this review directly as the reason it was deferred until then. Milestone-level, on-demand with stored history (not compute-on-page-load), synthesizing five existing signals (risk register, phase-timeline cycle counts, defect trends, coverage gaps, schedule drift) rather than inventing new tracking.

## 6. Lack of Real-Time Visibility (Management Blind Spot)

**Then:** Portfolio summary row already existed in PM Dashboard; CR026 (QA Analytics Dashboard) was planned but not yet built.

**Now:** CR026 shipped — execution trend, velocity, pass-by-milestone, defect density/trend/escape funnel, coverage snapshot. CR033 added a further "Closed Milestones" retrospective section (final Burn Rate/First-Pass/Stability snapshot + lessons-learned per completed milestone). No new initiative was needed beyond finishing what was already planned.

## 7. Fragmented Tools & No Integration

**Then:** Redmine and Excel integration were already deep and core to the product; Git/commit linkage was confirmed absent.

**Now:** Unchanged, correctly. No CR has added Git/commit linkage — there's still no concrete workflow need driving it (vs. a blanket "integrate with Git" ask). CR009/CR010 (Playwright reporter + trigger-from-UI) remain the more relevant pending dev-tool integration and haven't been picked up yet.

---

## Bottom line

Five of the seven pain points are now resolved, in most cases through the exact scoping this review recommended (small first, defer AI until the data model exists, extend rather than rebuild). The two still open — project-intake governance and Git linkage — are open by deliberate choice, documented as non-goals with a stated reason, not oversights. The original recommendation stands: keep framing this as "QAPulse: source of truth for delivery execution," not a generic PMO platform, and keep those two items explicitly out of scope rather than letting them drift into implied future work.
