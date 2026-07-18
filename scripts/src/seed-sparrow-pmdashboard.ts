/**
 * Seeds the PM Dashboard "cautionary tale" storyline: a NEW milestone
 * (CR-2026-020 — Loyalty Rewards Integration) that repeats the requirement
 * → dev → QA cycle twice because of a mid-flight scope change and a
 * critical regression, and is still active and overdue TODAY. See
 * sparrow-pmdashboard-data.ts for the full PM-01…PM-10 narrative and
 * SPARROW_SCENARIOS.html for the presentation reference.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run (reuses the
 * project + the 11 personas).
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-pmdashboard.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-pmdashboard.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD } from "./sparrow-data";
import {
  MILESTONE_PM, REQ_PM, PM_TEST_CASES, SIT_PM_FILE, SIT_ROUND_1, SIT_ROUND_2, SIT_ROUND_3, SIT_ROUND_4,
  UAT_PM_FILE, UAT_PM_ROUND, PM_DEFECTS, PM_RISK, PM_TASKS, type PmRound,
} from "./sparrow-pmdashboard-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds the PM Dashboard bonus storyline on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}
function findId(type: SparrowEntityType, key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" — did seed-sparrow-data.ts run to completion?`);
  return Number(entry.id);
}
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function main() {
  console.log("Logging in as admin and resolving existing SPARROW entities...");
  const adminToken = await loginAdmin();

  const uid = new Map<string, number>();
  const tok = new Map<string, string>();
  for (const u of USERS) {
    const entry = manifest.find((e) => e.type === "user" && keyOf(e) === u.key);
    if (!entry) throw new Error(`User "${u.key}" not found in manifest — run seed-sparrow-data.ts first.`);
    uid.set(u.key, Number(entry.id));
    tok.set(u.key, await login(u.email, SPARROW_PASSWORD));
  }

  const projectId = findId("project", "project");
  const ainaTok = tok.get("aina")!;
  const farhanTok = tok.get("farhan")!;
  const melissaTok = tok.get("melissa")!;
  const salmahTok = tok.get("salmah")!;

  // ── PM-01 — the milestone, already overdue ──────────────────────────────
  console.log("\nPM-01 — creating CR-2026-020 (target date already in the past)...");
  const milestone = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MILESTONE_PM.name, type: MILESTONE_PM.type, status: "active",
      targetDate: daysAgoIso(MILESTONE_PM.goLiveDaysAgo),
      startDate: daysAgoIso(MILESTONE_PM.createdDaysAgo),
      reqTargetDate: daysAgoIso(MILESTONE_PM.reqTargetDaysAgo),
      devTargetDate: daysAgoIso(MILESTONE_PM.devTargetDaysAgo),
      qaTargetDate: daysAgoIso(MILESTONE_PM.qaTargetDaysAgo),
      uatTargetDate: daysAgoIso(MILESTONE_PM.uatTargetDaysAgo),
      goLiveDate: daysAgoIso(MILESTONE_PM.goLiveDaysAgo),
      environment: MILESTONE_PM.environment,
    },
  });
  const milestoneId = milestone.id;
  track("milestone", milestoneId, MILESTONE_PM.key, MILESTONE_PM.name);
  console.log(`  + ${MILESTONE_PM.name} — active, target date ${MILESTONE_PM.goLiveDaysAgo} days in the past`);

  // ── PM-02 — requirement, cycle 1: on-schedule approval + dev ────────────
  console.log("\nPM-02 — REQ-201 authored, approved, and dev starts on schedule (cycle 1)...");
  const req = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_PM.title, description: REQ_PM.description, module: REQ_PM.module,
      projectId, priority: REQ_PM.priority, status: "open", milestoneId,
      acceptanceCriteria: JSON.stringify(REQ_PM.acceptanceCriteria),
    },
  });
  const reqId = req.id;
  track("requirement", reqId, REQ_PM.key, REQ_PM.title);
  await api(`/requirements/${reqId}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
  await api(`/requirements/${reqId}/review`, tok.get(REQ_PM.cycle1.reviewerKey)!, { method: "PATCH", body: { action: "approve" } });
  await api(`/requirements/${reqId}/dev`, farhanTok, { method: "PATCH", body: { action: "assign", devAssigneeId: uid.get("weijun") } });
  await api(`/requirements/${reqId}/dev`, tok.get("weijun")!, { method: "PATCH", body: { action: "start" } });

  // ── PM-03 — dev hands off; SIT round 1 finds 4 defects ──────────────────
  console.log("\nPM-03 — dev hands off to QA; SIT round 1 finds 4 defects in one pass...");
  await api(`/requirements/${reqId}/dev`, tok.get("weijun")!, { method: "PATCH", body: { action: "ready_for_qa" } });

  const tcId = new Map<string, number>();
  for (const tc of PM_TEST_CASES) {
    const created = await api<{ id: number }>("/test-cases", tok.get(tc.authorKey)!, {
      method: "POST",
      body: {
        title: tc.title, preconditions: tc.preconditions, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
        requirementId: reqId, projectId, module: REQ_PM.module, authorId: uid.get(tc.authorKey),
      },
    });
    tcId.set(tc.key, created.id);
    track("testCase", created.id, tc.key, tc.title);
  }

  const sitFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: { redmineTicketId: SIT_PM_FILE.redmineTicketId, title: SIT_PM_FILE.title, qaPic: SIT_PM_FILE.qaPicName, tracker: "QA Testing", projectId, milestoneId, fileType: "qa" },
  });
  track("executionFile", sitFile.id, "pm-sit", SIT_PM_FILE.title);

  const tcMeta = new Map(PM_TEST_CASES.map((t) => [t.key, t]));
  // Every round must re-send each row's COMPLETE data (a bare partial patch
  // blanks out any field the API isn't given — see the TX-09/10 note in
  // seed-sparrow-testcases-bonus.ts for the full explanation), and must
  // include the row's existing `id` where one exists so a retest round
  // UPDATES that row instead of inserting a same-testCaseId duplicate.
  async function saveRound(redmineTicketId: string, qaPic: string, round: PmRound) {
    const existing = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${redmineTicketId}/test-cases`, melissaTok);
    const existingIdByTcRow = new Map(existing.testCases.map((r) => [r.testCaseId, r.id]));
    const rows = Object.entries(round.results).map(([key, r], idx) => {
      const tc = tcMeta.get(key)!;
      return {
        id: existingIdByTcRow.get(tc.rowId), testCaseId: tc.rowId, moduleName: REQ_PM.module, libraryTcId: tcId.get(key), requirementId: reqId,
        caseName: tc.title, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
        result: r.result, actualResult: r.actual ?? "As expected.", executedAt: new Date().toISOString(),
        qaPic, rowOrder: idx,
      };
    });
    await api(`/execution-files/${redmineTicketId}/test-cases`, melissaTok, { method: "POST", body: { testCases: rows, isFullSync: false } });
  }
  await saveRound(SIT_PM_FILE.redmineTicketId, SIT_PM_FILE.qaPicName, SIT_ROUND_1);
  console.log(`  + SIT round 1: 2 Passed, 4 Failed`);

  // Raise the 4 defects from round 1
  const sitSaved1 = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${SIT_PM_FILE.redmineTicketId}/test-cases`, melissaTok);
  const execRowId = new Map(sitSaved1.testCases.map((r) => [r.testCaseId, r.id]));

  const defectId = new Map<string, { id: number; code: string }>();
  async function raiseDefect(d: typeof PM_DEFECTS[number]) {
    const tc = tcMeta.get(d.rowKey)!;
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(d.reporterKey)!, {
      method: "POST",
      body: {
        title: d.title, description: d.description, severity: d.severity, module: d.module,
        projectId, foundIn: d.round === "uat" ? "UAT" : "SIT", executionTcId: execRowId.get(tc.rowId),
      },
    });
    defectId.set(d.key, { id: created.id, code: created.defectCode });
    track("defect", created.id, d.key, d.title);
    if (d.assigneeKey) await api(`/defects/${created.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(d.assigneeKey) } });
    return created;
  }
  for (const d of PM_DEFECTS.filter((x) => x.round === "r1")) await raiseDefect(d);
  console.log(`  + DEF-P1…P4 raised`);

  // ── PM-04/05 — retest clears round 1, but a regression appears ──────────
  console.log("\nPM-04/05 — round 1 defects fixed; retest finds a NEW regression (DEF-P5)...");
  await saveRound(SIT_PM_FILE.redmineTicketId, SIT_PM_FILE.qaPicName, SIT_ROUND_2);
  const sitSaved2 = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${SIT_PM_FILE.redmineTicketId}/test-cases`, melissaTok);
  for (const r of sitSaved2.testCases) execRowId.set(r.testCaseId, r.id);
  for (const d of PM_DEFECTS.filter((x) => x.round === "r2")) await raiseDefect(d);
  console.log(`  + DEF-P5 raised (regression from the DEF-P3 fix)`);

  // ── PM-06 — scope change: requirement goes back through FA review ──────
  console.log("\nPM-06 — business changes reward tier thresholds; requirement goes back through FA review (the requirement→dev→qa→requirement loop)...");
  await api(`/requirements/${reqId}`, ainaTok, {
    method: "PATCH",
    body: {
      description: REQ_PM.scopeChange.revisedDescription,
      acceptanceCriteria: JSON.stringify(REQ_PM.scopeChange.revisedAcceptanceCriteria),
    },
  });
  await api(`/requirements/${reqId}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });

  // ── PM-07 — re-approved; dev rebuilds against the new thresholds ────────
  console.log("\nPM-07 — Daniel (FA Lead) re-approves; dev rebuilds under the new scope (cycle 2)...");
  await api(`/requirements/${reqId}/review`, tok.get(REQ_PM.cycle2.reviewerKey)!, { method: "PATCH", body: { action: "approve" } });
  await api(`/requirements/${reqId}/dev`, farhanTok, { method: "PATCH", body: { action: "assign", devAssigneeId: uid.get("weijun") } });
  await api(`/requirements/${reqId}/dev`, tok.get("weijun")!, { method: "PATCH", body: { action: "start" } });
  await api(`/requirements/${reqId}/dev`, tok.get("weijun")!, { method: "PATCH", body: { action: "ready_for_qa" } });

  // ── PM-08 — SIT round 3 finds a NEW critical defect; risk raised ────────
  console.log("\nPM-08 — SIT round 3 (post scope-change) finds a critical boundary defect (DEF-P6); schedule risk raised...");
  await saveRound(SIT_PM_FILE.redmineTicketId, SIT_PM_FILE.qaPicName, SIT_ROUND_3);
  const sitSaved3 = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${SIT_PM_FILE.redmineTicketId}/test-cases`, melissaTok);
  for (const r of sitSaved3.testCases) execRowId.set(r.testCaseId, r.id);
  for (const d of PM_DEFECTS.filter((x) => x.round === "r3")) await raiseDefect(d);

  const risk = await api<{ id: number }>("/risks", farhanTok, {
    method: "POST",
    body: {
      projectId, milestoneId, title: PM_RISK.title, description: PM_RISK.description, category: PM_RISK.category,
      probability: PM_RISK.probability, impact: PM_RISK.impact, status: PM_RISK.status,
      mitigationPlan: PM_RISK.mitigationPlan, ownerId: uid.get(PM_RISK.ownerKey),
    },
  });
  track("risk", risk.id, "pmrisk", PM_RISK.title);
  console.log(`  + DEF-P6 (critical) raised; ${PM_RISK.title} logged as realized`);

  // ── PM-09 — critical defect finally fixed; SIT round 4 clean ────────────
  console.log("\nPM-09 — DEF-P6 finally fixed after ~2 weeks; SIT round 4 reaches 100% (well past the original target)...");
  await saveRound(SIT_PM_FILE.redmineTicketId, SIT_PM_FILE.qaPicName, SIT_ROUND_4);

  // ── PM-10 — UAT starts late, finds one more defect, still open today ───
  console.log("\nPM-10 — UAT starts late and finds a defect that's still open today...");
  const uatFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: { redmineTicketId: UAT_PM_FILE.redmineTicketId, title: UAT_PM_FILE.title, qaPic: UAT_PM_FILE.qaPicName, tracker: "UAT", projectId, milestoneId, fileType: "uat" },
  });
  track("executionFile", uatFile.id, "pm-uat", UAT_PM_FILE.title);
  const uatRows = UAT_PM_ROUND.rows.map((row, idx) => {
    const tc = tcMeta.get(row.tcKey)!;
    return {
      testCaseId: row.rowId, moduleName: REQ_PM.module, libraryTcId: tcId.get(row.tcKey), requirementId: reqId,
      caseName: row.caseName, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
      result: row.result, actualResult: (row as any).actual ?? "As expected.",
      executedAt: new Date().toISOString(), qaPic: UAT_PM_FILE.qaPicName, rowOrder: idx,
    };
  });
  await api(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok, { method: "POST", body: { testCases: uatRows, isFullSync: true } });
  const uatSaved = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok);
  const uatRowId = new Map(uatSaved.testCases.map((r) => [r.testCaseId, r.id]));
  for (const d of PM_DEFECTS.filter((x) => x.round === "uat")) {
    const tc = tcMeta.get(d.rowKey)!;
    const uatRowMatch = UAT_PM_ROUND.rows.find((r) => r.tcKey === d.rowKey);
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(d.reporterKey)!, {
      method: "POST",
      body: {
        title: d.title, description: d.description, severity: d.severity, module: d.module,
        projectId, foundIn: "UAT", executionTcId: uatRowMatch ? uatRowId.get(uatRowMatch.rowId) : undefined,
      },
    });
    defectId.set(d.key, { id: created.id, code: created.defectCode });
    track("defect", created.id, d.key, d.title);
    if (d.assigneeKey) await api(`/defects/${created.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(d.assigneeKey) } });
  }
  console.log(`  + DEF-P7 raised in UAT — left open (still unresolved today)`);

  // ── Tasks ────────────────────────────────────────────────────────────────
  console.log("\nCreating milestone tasks (visible on Tasks page / PM Dashboard capacity)...");
  for (const t of PM_TASKS) {
    const created = await api<{ id: number }>("/tasks", adminToken, {
      method: "POST",
      body: {
        name: t.name, priority: t.priority, status: t.status, assigneeIds: t.assigneeKeys.map((k) => uid.get(k)),
        projectId, milestoneId, requirementId: reqId, moduleIds: "",
        startDate: daysAgoIso(t.startDaysAgo), dueDate: daysAgoIso(t.dueDaysAgo),
        actualStartDate: t.actualStartDaysAgo != null ? daysAgoIso(t.actualStartDaysAgo) : undefined,
        actualEndDate: t.actualEndDaysAgo != null ? daysAgoIso(t.actualEndDaysAgo) : undefined,
        estimatedHours: t.estimatedHours, actualHours: t.actualHours, completionPercentage: t.completionPercentage,
      },
    });
    track("task", created.id, t.key, t.name);
  }
  console.log(`  + ${PM_TASKS.length} tasks`);

  // Optional: live AI milestone risk assessment
  if (process.env.SEED_RUN_AI !== "0") {
    try {
      await api("/ai/milestone-risk", farhanTok, { method: "POST", body: { milestoneId } });
      console.log("  ✓ AI milestone risk assessment run (should return high risk)");
    } catch (err: any) {
      console.log(`  ! AI risk assessment failed (continuing): ${String(err.message).slice(0, 120)}`);
    }
  }

  console.log(`\nDone. ${manifest.length} total tracked entities — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-pmdashboard.ts");
}

main().catch((err) => {
  console.error("\nPM Dashboard seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything before retrying.`);
  process.exit(1);
});
