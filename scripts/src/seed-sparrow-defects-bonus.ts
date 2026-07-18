/**
 * Adds 10 Defects-page bonus scenarios (DX-01…DX-10) on top of the
 * already-seeded CR-2026-014 SPARROW dataset. Every defect here is raised
 * from a failed row in a NEW execution file — the same path the Defects
 * page's own data actually comes from — rather than as a requirement
 * defect or an ad-hoc production pull. See sparrow-defects-bonus-data.ts
 * for what each one demonstrates and SPARROW_SCENARIOS.html for the
 * presentation reference.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-defects-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-defects-bonus.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD, TEST_CASES } from "./sparrow-data";
import { DEFECTS_FILE, ROWS, DX01, DX02, DX03, DX04, DX05, DX06, DX07, DX08, DX09, DX10 } from "./sparrow-defects-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds bonus Defects-page scenarios on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}

function findId(type: SparrowEntityType, key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" in the manifest — did seed-sparrow-data.ts run to completion?`);
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
  const crId = findId("milestone", "cr2026014");
  const melissaTok = tok.get("melissa")!;

  const tcByKey = new Map(TEST_CASES.map((t) => [t.key, t]));
  const libTcId = new Map<string, number>();
  for (const tc of TEST_CASES) {
    const entry = manifest.find((e) => e.type === "testCase" && keyOf(e) === tc.key);
    if (entry) libTcId.set(tc.key, Number(entry.id));
  }

  // ── Execution file hosting all 10 defect rows ────────────────────────
  console.log("\nCreating the Defects Showcase execution file...");
  const file = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: {
      redmineTicketId: DEFECTS_FILE.redmineTicketId, title: DEFECTS_FILE.title,
      qaPic: DEFECTS_FILE.qaPicName, tracker: "QA Testing", projectId, milestoneId: crId, fileType: "qa",
    },
  });
  track("executionFile", file.id, "defects-showcase", DEFECTS_FILE.title);

  const rows = ROWS.map((r, idx) => {
    const tc = tcByKey.get(r.tcKey)!;
    return {
      testCaseId: r.rowId, moduleName: r.module, libraryTcId: libTcId.get(r.tcKey),
      caseName: r.tcTitle, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
      result: "Failed", actualResult: "See the linked defect for detail.",
      executedAt: new Date().toISOString(), qaPic: DEFECTS_FILE.qaPicName, rowOrder: idx,
    };
  });
  await api(`/execution-files/${file.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST", body: { testCases: rows, isFullSync: true },
  });
  const saved = await api<{ testCases: { id: number; testCaseId: string }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`, melissaTok,
  );
  const execRowId = new Map(saved.testCases.map((r) => [r.testCaseId, r.id]));
  console.log(`  + ${ROWS.length} rows, all Failed, each hosting one defect scenario`);

  async function raiseDefect(rowKey: string, opts: {
    title: string; description: string; stepsToReproduce?: string; expectedResult?: string; actualResult?: string;
    severity: "low" | "medium" | "high" | "critical"; reporterKey: string; category?: string;
  }) {
    const row = ROWS.find((r) => r.key === rowKey)!;
    const body: any = {
      title: opts.title, description: opts.description, stepsToReproduce: opts.stepsToReproduce,
      expectedResult: opts.expectedResult, actualResult: opts.actualResult, severity: opts.severity,
      module: row.module, projectId, foundIn: "SIT", executionTcId: execRowId.get(row.rowId),
    };
    if (opts.category) body.defectCategory = opts.category;
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(opts.reporterKey)!, { method: "POST", body });
    track("defect", created.id, rowKey, opts.title);
    return created;
  }

  console.log("\nDX-01 — critical blocker, still open today...");
  await raiseDefect("dx01", { title: DX01.title, description: DX01.description, stepsToReproduce: DX01.stepsToReproduce, expectedResult: DX01.expectedResult, actualResult: DX01.actualResult, severity: DX01.severity, reporterKey: DX01.reporterKey });

  console.log("DX-02 — reassigned mid-fix (Kavitha → Wei Jun)...");
  const d02 = await raiseDefect("dx02", { title: DX02.title, description: DX02.description, stepsToReproduce: DX02.stepsToReproduce, expectedResult: DX02.expectedResult, actualResult: DX02.actualResult, severity: DX02.severity, reporterKey: DX02.reporterKey });
  await api(`/defects/${d02.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX02.initialAssigneeKey) } });
  await api(`/defects/${d02.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX02.reassignedToKey) } });

  console.log("DX-03 — fails retest twice before finally passing...");
  const d03 = await raiseDefect("dx03", { title: DX03.title, description: DX03.description, stepsToReproduce: DX03.stepsToReproduce, expectedResult: DX03.expectedResult, actualResult: DX03.actualResult, severity: DX03.severity, reporterKey: DX03.reporterKey });
  await api(`/defects/${d03.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX03.assigneeKey) } });

  console.log("DX-04 — closed, then reopened after a regression, then re-closed...");
  const d04 = await raiseDefect("dx04", { title: DX04.title, description: DX04.description, stepsToReproduce: DX04.stepsToReproduce, expectedResult: DX04.expectedResult, actualResult: DX04.actualResult, severity: DX04.severity, reporterKey: DX04.reporterKey });
  await api(`/defects/${d04.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX04.assigneeKey) } });

  console.log("DX-05 — security-categorised defect...");
  const d05 = await raiseDefect("dx05", { title: DX05.title, description: DX05.description, stepsToReproduce: DX05.stepsToReproduce, expectedResult: DX05.expectedResult, actualResult: DX05.actualResult, severity: DX05.severity, reporterKey: DX05.reporterKey, category: DX05.category });
  await api(`/defects/${d05.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX05.assigneeKey) } });

  console.log("DX-06 — low-severity usability defect, deferred...");
  await raiseDefect("dx06", { title: DX06.title, description: DX06.description, stepsToReproduce: DX06.stepsToReproduce, expectedResult: DX06.expectedResult, actualResult: DX06.actualResult, severity: DX06.severity, reporterKey: DX06.reporterKey, category: DX06.category });

  console.log("DX-07 — escape classified selection_gap...");
  const d07 = await raiseDefect("dx07", { title: DX07.title, description: DX07.description, stepsToReproduce: DX07.stepsToReproduce, expectedResult: DX07.expectedResult, actualResult: DX07.actualResult, severity: DX07.severity, reporterKey: DX07.reporterKey });
  await api(`/defects/${d07.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX07.assigneeKey) } });
  await api(`/defects/${d07.id}`, melissaTok, { method: "PATCH", body: { escapeClass: DX07.escapeClass, escapeStatus: "closed", escapeNotes: DX07.escapeNotes } });

  console.log("DX-08 — escape classified passed_wrongly...");
  const d08 = await raiseDefect("dx08", { title: DX08.title, description: DX08.description, stepsToReproduce: DX08.stepsToReproduce, expectedResult: DX08.expectedResult, actualResult: DX08.actualResult, severity: DX08.severity, reporterKey: DX08.reporterKey });
  await api(`/defects/${d08.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX08.assigneeKey) } });
  await api(`/defects/${d08.id}`, melissaTok, { method: "PATCH", body: { escapeClass: DX08.escapeClass, escapeStatus: "closed", escapeNotes: DX08.escapeNotes } });

  console.log("DX-09 — stale, aging defect (will be backdated relative to today)...");
  await raiseDefect("dx09", { title: DX09.title, description: DX09.description, stepsToReproduce: DX09.stepsToReproduce, expectedResult: DX09.expectedResult, actualResult: DX09.actualResult, severity: DX09.severity, reporterKey: DX09.reporterKey });

  console.log("DX-10 — auto-generating a regression TC from an ordinary QA-found defect...");
  const d10 = await raiseDefect("dx10", { title: DX10.title, description: DX10.description, stepsToReproduce: DX10.stepsToReproduce, expectedResult: DX10.expectedResult, actualResult: DX10.actualResult, severity: DX10.severity, reporterKey: DX10.reporterKey });
  await api(`/defects/${d10.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(DX10.assigneeKey) } });
  const regressionTc = await api<{ id: number; title: string }>(`/defects/${d10.id}/regression-tc`, melissaTok, { method: "POST", body: {} }).catch(() => null);
  if (regressionTc) {
    track("testCase", regressionTc.id, "dx10-regression-tc", regressionTc.title);
    console.log(`  + regression TC "${regressionTc.title}" auto-created from DX-10`);
  }

  console.log(`\nDone. ${manifest.length} total tracked entities — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates/statuses): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-defects-bonus.ts");
}

main().catch((err) => {
  console.error("\nBonus seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything before retrying.`);
  process.exit(1);
});
