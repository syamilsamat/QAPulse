# QA Defect Field Mapping — Redmine vs QAPulse

Draft review document (2026-07-05), not yet folded into `CHANGE_REQUESTS.md` — captures the gap between Redmine's "QA Defect Tracking Form" (as given by the user) and what QAPulse's two defect-creation paths actually send today. Verified directly against code, not assumed:

- `artifacts/api-server/src/routes/redmine.ts` (`POST /redmine/issues`) — used by the execution **fail pill's "Create Defect" modal** (`DefectCreationModal.tsx`)
- `artifacts/api-server/src/routes/redmine-defect-bridge.ts` (`pushDefectToRedmine`) — used by the Defects page's **"New Defect" dialog** (`NewDefectDialog` in `Defects.tsx`)

These are two separate code paths with different levels of completeness — noted per field below.

## Field-by-field mapping

| Redmine Field | Required in Redmine? | QAPulse mapping today | Status |
|---|---|---|---|
| Project | Yes | Project dropdown, both dialogs | ✅ Mapped |
| Tracker | Yes (QA Defect default, can switch to Prod. Defect) | Auto-detected "QA Defect" tracker, rendered as a **disabled** field in both dialogs | ⚠️ **Locked — can't actually switch to Prod. Defect** |
| Subject | Yes | Title | ✅ Mapped |
| Description | No | Description + Expected Result + Actual Result, concatenated | ✅ Mapped |
| Status | Yes (New on create) | Not sent | ✅ Fine — Redmine defaults new issues to "New" anyway |
| Priority | Yes | **Not sent at all** — no field in either payload | ❌ **Gap.** QAPulse's `severity` (critical/high/medium/low) is never mapped to Redmine's `priority_id` |
| Assignee | No | Assignee picker → `assigned_to_id` | ✅ Mapped |
| Category (Redmine's native field) | No | Not sent | ❌ Not populated on create (distinct from QAPulse's own new `defectCategory` field, which is deliberately local-only) |
| Parent task | No | `parentIssueId` → `parent_issue_id` | ✅ Mapped in the fail-pill path only. **Missing** from the "New Defect" dialog — `pushDefectToRedmine` never sends `parent_issue_id` |
| Complexity | Yes | Complexity dropdown → custom field | ✅ Mapped, both paths |
| Sprint | Yes | **Not sent at all** — no field, no custom-field-ID config slot exists for it | ❌ **Highest-risk gap** — see note below |
| Story Points | No | Not present anywhere in QAPulse | ❌ Not built |
| Roadblock Reason | No | Not present anywhere in QAPulse | ❌ Not built |
| Targeted Start Date | Yes | Date picker → custom field | ✅ Mapped, both paths |
| Targeted Completion Date | Yes | Date picker → custom field. **Required-checked** in the fail-pill modal; **not required-checked** in the "New Defect" dialog (only Title is validated there) | ⚠️ Inconsistent between the two paths |
| Actual Start Date | No | Not present | ❌ Not built |
| Actual Completion Date | No | Not present | ❌ Not built |
| Files | No | Uploaded as Redmine attachments in the fail-pill modal | ⚠️ **Silently dropped** in the "New Defect" dialog — collected in UI state, never sent to Redmine or stored locally |

## Sprint vs Milestone

QAPulse already models "sprint" as one of four `milestones.type` values (`cr` | `phase` | `sprint` | `release`). So conceptually, Redmine's Sprint field on a defect would map to a QAPulse Milestone of type `sprint`.

At the data level, however, **`defects` has no `milestoneId` column at all** — unlike `requirements`, `execution_files`, and `tasks`, which all got that column earlier in this project. There's currently no way to tag a defect with a sprint/milestone in QAPulse, so nothing can be pushed to Redmine's Sprint field regardless of mapping logic.

## Gaps ranked by how much this could be actively breaking things

1. **Sprint** — required by Redmine, never sent. If the Redmine project enforces this custom field, defect creation from QAPulse may already be silently failing validation (landing as "pending sync" with an error).
2. **Priority** — never mapped from `severity`. Every QA defect lands in Redmine at the tracker's default priority, regardless of how it was classified in QAPulse.
3. **Tracker lock** — can't route a defect to "Prod. Defect" from either creation dialog, despite that being an explicit option on the Redmine form.
4. **Parent task / Files** — each wired up in only one of the two creation paths, not both — inconsistent behavior depending on which dialog was used.
5. **Targeted Completion Date** required-check missing on the "New Defect" dialog — could submit blank where the fail-pill modal would block it.
6. **Category (Redmine native), Story Points, Roadblock Reason, Actual Start/Completion Date** — not built at all. Lower priority since none are required on the Redmine side (except Category isn't required either).

## Not yet scoped

This document is descriptive only — no fixes have been implemented. Scoping/prioritizing which of the above to build is a separate decision once reviewed.
