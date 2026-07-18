/**
 * Adds 10 Milestones-page bonus scenarios (MS-01…MS-10) on top of the
 * already-seeded CR-2026-014 SPARROW dataset. See
 * sparrow-milestones-bonus-data.ts for what each one demonstrates and
 * SPARROW_SCENARIOS.html for the presentation reference.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-milestones-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-milestones-bonus.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD } from "./sparrow-data";
import { MS01, MS02, MS03, MS04, MS05, MS06, MS07, MS08, MS09 } from "./sparrow-milestones-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds bonus Milestones-page scenarios on top of the existing CR-2026-014 dataset.",
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
  const salmahTok = tok.get("salmah")!;
  const rizalTok = tok.get("rizal")!;
  const danielTok = tok.get("daniel")!;
  const melissaTok = tok.get("melissa")!;

  // ── MS-01 — re-planned before any work starts ────────────────────────────
  console.log("\nMS-01 — CR-2026-021 created, then re-planned before any work starts...");
  const m01 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MS01.name, type: MS01.type, status: "planned", environment: MS01.environment,
      startDate: MS01.initial.startDate, reqTargetDate: MS01.initial.reqTargetDate, devTargetDate: MS01.initial.devTargetDate,
      qaTargetDate: MS01.initial.qaTargetDate, uatTargetDate: MS01.initial.uatTargetDate, goLiveDate: MS01.initial.goLiveDate,
      targetDate: MS01.initial.goLiveDate,
    },
  });
  track("milestone", m01.id, MS01.key, MS01.name);
  await api(`/milestones/${m01.id}`, salmahTok, {
    method: "PATCH",
    body: {
      startDate: MS01.replanned.startDate, reqTargetDate: MS01.replanned.reqTargetDate, devTargetDate: MS01.replanned.devTargetDate,
      qaTargetDate: MS01.replanned.qaTargetDate, uatTargetDate: MS01.replanned.uatTargetDate, goLiveDate: MS01.replanned.goLiveDate,
      targetDate: MS01.replanned.goLiveDate,
    },
  });
  const r01 = await api<{ id: number }>("/risks", rizalTok, {
    method: "POST",
    body: {
      projectId, milestoneId: m01.id, title: MS01.riskTitle, category: "external", probability: "high", impact: "medium",
      status: "closed", mitigationPlan: MS01.replanned.reason, ownerId: uid.get("salmah"),
    },
  });
  track("risk", r01.id, "ms01risk", MS01.riskTitle);
  console.log(`  + ${MS01.name} replanned +2 weeks across every phase target; risk raised and closed`);

  // ── MS-02 — sprint-type, clean & completed ───────────────────────────────
  console.log("\nMS-02 — Sprint 7 (sprint type) — clean, completed on time...");
  const m02 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MS02.name, type: MS02.type, status: "active", environment: MS02.environment,
      startDate: MS02.startDate, reqTargetDate: MS02.reqTargetDate, devTargetDate: MS02.devTargetDate,
      qaTargetDate: MS02.qaTargetDate, goLiveDate: MS02.goLiveDate, targetDate: MS02.targetDate,
    },
  });
  track("milestone", m02.id, MS02.key, MS02.name);
  await api(`/milestones/${m02.id}`, salmahTok, { method: "PATCH", body: { status: "completed", lessonsLearned: MS02.lessonsLearned } });
  console.log(`  + ${MS02.name} completed`);

  // ── MS-03 — phase-type, clean & completed ────────────────────────────────
  console.log("\nMS-03 — Phase 2 (phase type) — clean, completed on time...");
  const m03 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MS03.name, type: MS03.type, status: "active", environment: MS03.environment,
      startDate: MS03.startDate, reqTargetDate: MS03.reqTargetDate, devTargetDate: MS03.devTargetDate,
      qaTargetDate: MS03.qaTargetDate, goLiveDate: MS03.goLiveDate, targetDate: MS03.targetDate,
    },
  });
  track("milestone", m03.id, MS03.key, MS03.name);
  await api(`/milestones/${m03.id}`, salmahTok, { method: "PATCH", body: { status: "completed", lessonsLearned: MS03.lessonsLearned } });
  console.log(`  + ${MS03.name} completed`);

  // ── MS-04 — cancelled mid-flight ──────────────────────────────────────────
  console.log("\nMS-04 — CR-2026-022 created, then cancelled by the steering committee...");
  const m04 = await api<{ id: number }>("/milestones", rizalTok, {
    method: "POST",
    body: {
      projectId, name: MS04.name, type: MS04.type, status: "active", environment: MS04.environment,
      startDate: MS04.startDate, reqTargetDate: MS04.reqTargetDate, targetDate: MS04.targetDate,
    },
  });
  track("milestone", m04.id, MS04.key, MS04.name);
  await api(`/milestones/${m04.id}`, rizalTok, { method: "PATCH", body: { status: "cancelled", lessonsLearned: MS04.cancelReason } });
  console.log(`  + ${MS04.name} cancelled`);

  // ── MS-05 — sign-off rejected, then approved on retry ────────────────────
  console.log("\nMS-05 — CR-2026-023 sign-off rejected (locale bug), fixed, approved on retry...");
  const m05 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MS05.name, type: MS05.type, status: "active", environment: MS05.environment,
      startDate: MS05.startDate, reqTargetDate: MS05.reqTargetDate, devTargetDate: MS05.devTargetDate,
      qaTargetDate: MS05.qaTargetDate, uatTargetDate: MS05.uatTargetDate, goLiveDate: MS05.goLiveDate, targetDate: MS05.goLiveDate,
    },
  });
  track("milestone", m05.id, MS05.key, MS05.name);
  const uatFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: { redmineTicketId: MS05.uatFile.redmineTicketId, title: MS05.uatFile.title, qaPic: "Nurul Huda", tracker: "UAT", projectId, milestoneId: m05.id, fileType: "uat" },
  });
  track("executionFile", uatFile.id, "ms05uat", MS05.uatFile.title);
  await api(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST",
    body: {
      testCases: [{
        testCaseId: "UAT-01", moduleName: "Notification", caseName: MS05.uatRowTitle,
        testSteps: "1. Force push notification delivery to fail\n2. Check the SMS fallback content for a BM-preference buyer",
        expectedResult: "SMS arrives in the buyer's preferred language.",
        result: "Failed", actualResult: "SMS arrived in English regardless of the buyer's BM preference.",
        executedAt: new Date().toISOString(), qaPic: "Nurul Huda", rowOrder: 0,
      }],
      isFullSync: true,
    },
  });
  await api(`/milestones/${m05.id}/review`, danielTok, { method: "PATCH", body: { action: "reject" } });
  console.log(`  + sign-off rejected: ${MS05.rejectReason.slice(0, 60)}...`);
  const uatSaved = await api<{ testCases: { id: number; testCaseId: string }[] }>(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok);
  const uatRowId = uatSaved.testCases.find((r) => r.testCaseId === "UAT-01")!.id;
  await api(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST",
    body: {
      testCases: [{
        id: uatRowId, testCaseId: "UAT-01", moduleName: "Notification", caseName: MS05.uatRowTitle,
        testSteps: "1. Force push notification delivery to fail\n2. Check the SMS fallback content for a BM-preference buyer",
        expectedResult: "SMS arrives in the buyer's preferred language.",
        result: "Passed", actualResult: "SMS now correctly arrives in Bahasa Melayu for BM-preference buyers.",
        executedAt: new Date().toISOString(), qaPic: "Nurul Huda", rowOrder: 0,
      }],
    },
  });
  await api(`/milestones/${m05.id}/review`, danielTok, { method: "PATCH", body: { action: "approve" } });
  console.log(`  + fixed and re-approved — status completed`);

  // ── MS-06 — deleted (duplicate, created by mistake) ──────────────────────
  console.log("\nMS-06 — CR-2026-024 created by mistake, then deleted...");
  const m06 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: { projectId, name: MS06.name, type: MS06.type, status: "planned", environment: MS06.environment },
  });
  track("milestone", m06.id, MS06.key, MS06.name);
  await api(`/milestones/${m06.id}`, salmahTok, { method: "DELETE" });
  console.log(`  + ${MS06.name} deleted — check the Activity feed for "created → deleted"`);

  // ── MS-07 — environment contention resolved proactively ──────────────────
  console.log("\nMS-07 — two milestones both plan for ENV6; one is moved before it becomes a conflict...");
  const m07a = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: { projectId, name: MS07.nameA, type: "cr", status: "active", environment: MS07.environment },
  });
  track("milestone", m07a.id, MS07.keyA, MS07.nameA);
  const m07b = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: { projectId, name: MS07.nameB, type: "cr", status: "active", environment: MS07.environment },
  });
  track("milestone", m07b.id, MS07.keyB, MS07.nameB);
  await api(`/milestones/${m07b.id}`, salmahTok, { method: "PATCH", body: { environment: MS07.resolvedEnvironment } });
  console.log(`  + ${MS07.nameB} moved ${MS07.environment} → ${MS07.resolvedEnvironment}, a month ahead of either SIT window`);

  // ── MS-08 — start delayed by an external vendor dependency ───────────────
  console.log("\nMS-08 — CR-2026-027 start delayed 18 days by a vendor SDK license, then resolved...");
  const m08 = await api<{ id: number }>("/milestones", rizalTok, {
    method: "POST",
    body: { projectId, name: MS08.name, type: MS08.type, status: "active", environment: MS08.environment, startDate: MS08.actualStartDate, targetDate: MS08.targetDate },
  });
  track("milestone", m08.id, MS08.key, MS08.name);
  const r08 = await api<{ id: number }>("/risks", rizalTok, {
    method: "POST",
    body: {
      projectId, milestoneId: m08.id, title: "R-MS08 — Biometric SDK vendor license certificate delayed",
      category: "external", probability: "medium", impact: "medium", status: "closed",
      mitigationPlan: MS08.delayNote, ownerId: uid.get("farhan"),
    },
  });
  track("risk", r08.id, "ms08risk", "R-MS08 — Biometric SDK vendor license certificate delayed");
  console.log(`  + start delayed to ${MS08.actualStartDate}; risk raised and closed once the certificate arrived`);

  // ── MS-09 — pure placeholder, never activated ────────────────────────────
  console.log("\nMS-09 — CR-2026-028 created as a pure placeholder — no dates, no environment, nothing started...");
  const m09 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: { projectId, name: MS09.name, type: MS09.type, status: "planned" },
  });
  track("milestone", m09.id, MS09.key, MS09.name);
  console.log(`  + ${MS09.name} — status planned, no target date, no environment`);

  console.log(`\nDone. ${manifest.length} total tracked entities — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-milestones-bonus.ts");
}

main().catch((err) => {
  console.error("\nBonus seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything before retrying.`);
  process.exit(1);
});
