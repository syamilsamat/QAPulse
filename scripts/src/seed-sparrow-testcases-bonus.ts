/**
 * Adds 12 Test Cases / Execution Dashboard bonus scenarios (TX-01…TX-12) on
 * top of the already-seeded CR-2026-014 SPARROW dataset. See
 * sparrow-testcases-bonus-data.ts for what each one demonstrates and
 * SPARROW_SCENARIOS.html for the presentation reference.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run. Safe to run
 * whether or not seed-sparrow-requirements-bonus.ts has also run — this
 * script only reads keys it needs and appends to the same manifest.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-testcases-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-testcases-bonus.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD, TEST_CASES, SIT_FILE } from "./sparrow-data";
import {
  TX01_CLONE, TX02_SMOKE_FILE, TX03_DUPLICATE, REQ_117, TX04_GAP_CLOSED_TC,
  TX05_CAPA_ROW_KEYS, TX07_TEST_DATA_REQUEST, TX08_CLONE, TX0910_FILE,
  TX11_STALE_FILE, TX12_DEPRECATE,
} from "./sparrow-testcases-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds bonus Test Cases/Execution scenarios on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}

function findId(type: SparrowEntityType, key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" in the manifest — did the earlier seed scripts run to completion?`);
  return Number(entry.id);
}

async function tryAi(what: string, fn: () => Promise<unknown>) {
  if (process.env.SEED_RUN_AI === "0") { console.log(`  (skipped AI: ${what} — SEED_RUN_AI=0)`); return; }
  try {
    await fn();
    console.log(`  ✓ AI: ${what}`);
  } catch (err: any) {
    console.log(`  ! AI failed (continuing, this is fine to re-run live): ${what} — ${String(err.message).slice(0, 120)}`);
  }
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
  const req101Id = findId("requirement", "req101");
  const req102Id = findId("requirement", "req102");
  const sitFileDbId = findId("executionFile", "sit");

  const ainaTok = tok.get("aina")!;
  const harithTok = tok.get("harith")!;
  const melissaTok = tok.get("melissa")!;
  const syafiqTok = tok.get("syafiq")!;
  const nurulTok = tok.get("nurul")!;

  const tcByKey = new Map(TEST_CASES.map((t) => [t.key, t]));
  // key -> real DB id for library test cases created by the main seed
  const libTcId = new Map<string, number>();
  for (const tc of TEST_CASES) {
    const entry = manifest.find((e) => e.type === "testCase" && keyOf(e) === tc.key);
    if (entry) libTcId.set(tc.key, Number(entry.id));
  }

  // ── TX-01 — clone a test case for a second bank variant ──────────────────
  console.log("\nTX-01 — cloning TC-201 for a CIMB Clicks variant...");
  const sourceId = libTcId.get(TX01_CLONE.sourceTcKey)!;
  const cloned = await api<{ id: number }>(`/test-cases/${sourceId}/clone`, syafiqTok, { method: "POST", body: {} });
  await api(`/test-cases/${cloned.id}`, syafiqTok, {
    method: "PATCH",
    body: { title: TX01_CLONE.newTitle, preconditions: TX01_CLONE.newPreconditions },
  });
  track("testCase", cloned.id, "tx01-clone", TX01_CLONE.newTitle);
  console.log(`  + cloned TC-201 → "${TX01_CLONE.newTitle}"`);

  // ── TX-02 — compile library TCs into a new Smoke Test execution file ─────
  console.log("\nTX-02 — compiling 5 happy-path TCs into a new Smoke Test execution file...");
  const smokeFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", nurulTok, {
    method: "POST",
    body: {
      redmineTicketId: TX02_SMOKE_FILE.redmineTicketId, title: TX02_SMOKE_FILE.title,
      qaPic: TX02_SMOKE_FILE.qaPicName, tracker: "QA Testing", projectId, milestoneId: crId, fileType: "qa",
    },
  });
  track("executionFile", smokeFile.id, "smoke", TX02_SMOKE_FILE.title);
  const smokeRows = TX02_SMOKE_FILE.tcKeys.map((key, idx) => {
    const tc = tcByKey.get(key)!;
    return {
      testCaseId: `SMK-${idx + 1}`, moduleName: tc.module ?? "Payment", libraryTcId: libTcId.get(key),
      requirementId: key.startsWith("reg") ? undefined : req101Id, caseName: tc.title,
      testSteps: tc.testSteps, expectedResult: tc.expectedResult, result: "Passed",
      actualResult: "As expected.", executedAt: new Date().toISOString(), qaPic: TX02_SMOKE_FILE.qaPicName, rowOrder: idx,
    };
  });
  await api(`/execution-files/${smokeFile.redmineTicketId}/test-cases`, nurulTok, {
    method: "POST", body: { testCases: smokeRows, isFullSync: true },
  });
  console.log(`  + ${TX02_SMOKE_FILE.title} — 5 rows, all Passed`);

  // ── TX-03 — AI duplicate-detection flags a near-duplicate TC ─────────────
  console.log("\nTX-03 — Nurul authors a near-duplicate of TC-201; AI duplicate-detection flags it...");
  const dup = await api<{ id: number }>("/test-cases", nurulTok, {
    method: "POST",
    body: {
      title: TX03_DUPLICATE.title, preconditions: TX03_DUPLICATE.preconditions, testSteps: TX03_DUPLICATE.testSteps,
      expectedResult: TX03_DUPLICATE.expectedResult, requirementId: req101Id, projectId, module: "Payment",
      authorId: uid.get(TX03_DUPLICATE.authorKey),
    },
  });
  track("testCase", dup.id, "tx03-dup", TX03_DUPLICATE.title);
  await tryAi("TX-03 duplicate-detection on the new test case", () =>
    api("/ai/duplicate-detection", nurulTok, {
      method: "POST", body: { title: TX03_DUPLICATE.title, steps: TX03_DUPLICATE.testSteps, projectId },
    }));
  await api(`/test-cases/${dup.id}`, melissaTok, { method: "DELETE" });
  console.log("  + AI recommended delete (≈92% similar to TC-201) — Melissa removed it");

  // ── TX-04 — AI coverage-gap surfaces a zero-coverage requirement ─────────
  console.log("\nTX-04 — REQ-117 created with zero test cases; AI coverage-gap surfaces it, then the gap is closed...");
  const r117 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_117.title, description: REQ_117.description, module: REQ_117.module,
      projectId, priority: REQ_117.priority, status: "open", milestoneId: crId,
      acceptanceCriteria: JSON.stringify(REQ_117.acceptanceCriteria),
    },
  });
  track("requirement", r117.id, "req117", REQ_117.title);
  await api(`/requirements/${r117.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
  await api(`/requirements/${r117.id}/review`, harithTok, { method: "PATCH", body: { action: "approve" } });
  await tryAi("TX-04 coverage-gap on REQ-117", () =>
    api("/ai/coverage-gap", melissaTok, { method: "POST", body: { requirementId: r117.id } }));
  const gapTc = await api<{ id: number }>("/test-cases", nurulTok, {
    method: "POST",
    body: {
      title: TX04_GAP_CLOSED_TC.title, preconditions: TX04_GAP_CLOSED_TC.preconditions,
      testSteps: TX04_GAP_CLOSED_TC.testSteps, expectedResult: TX04_GAP_CLOSED_TC.expectedResult,
      requirementId: r117.id, projectId, module: REQ_117.module, authorId: uid.get(TX04_GAP_CLOSED_TC.authorKey),
    },
  });
  track("testCase", gapTc.id, "tx04-gapclose", TX04_GAP_CLOSED_TC.title);
  console.log("  + REQ-117 approved with 0 TCs → coverage-gap flagged it → TC authored to close the gap");

  // ── TX-05 — AI CAPA analysis on the existing SIT failure cluster ─────────
  console.log("\nTX-05 — running AI CAPA/root-cause analysis over the already-seeded SIT failures (live/ephemeral)...");
  await tryAi("TX-05 CAPA analysis on the SIT failure cluster", () =>
    api("/ai/capa-analysis", melissaTok, {
      method: "POST",
      body: {
        ticketId: SIT_FILE.redmineTicketId,
        testCases: TX05_CAPA_ROW_KEYS.map((key) => {
          const tc = tcByKey.get(key)!;
          return { testCaseId: key.toUpperCase(), caseName: tc.title, moduleName: tc.module ?? "Payment", result: "Failed", actualResult: "See SIT execution notes." };
        }),
      },
    }));
  console.log("  (ephemeral — nothing persisted; re-run live during the demo for a fresh CAPA report)");

  // ── TX-06 — natural-language search (no data to seed, live-demo only) ────
  console.log("\nTX-06 — natural-language search is a live-demo action against existing TCs; nothing to seed.");

  // ── TX-07 — AI test-data generation (live/ephemeral) ─────────────────────
  console.log("\nTX-07 — running AI test-data generation for bulk wallet top-up amounts (live/ephemeral)...");
  await tryAi("TX-07 test-data generation", () =>
    api("/ai/test-data", melissaTok, { method: "POST", body: TX07_TEST_DATA_REQUEST }));

  // ── TX-08 — clone the SIT execution file into an ad-hoc regression pack ──
  console.log("\nTX-08 — cloning the SIT execution file into a standalone ad-hoc regression snapshot...");
  const cloneFile = await api<{ id: number }>(`/execution-files/${SIT_FILE.redmineTicketId}/clone`, melissaTok, {
    method: "POST",
    body: { newTicketId: TX08_CLONE.newTicketId, newTitle: TX08_CLONE.newTitle, resetResults: false, copyQaPic: true },
  });
  track("executionFile", cloneFile.id, "tx08-clone", TX08_CLONE.newTitle);
  console.log(`  + ${TX08_CLONE.newTitle} — results preserved from SIT, not linked to a milestone (the clone endpoint doesn't set one)`);

  // ── TX-09 / TX-10 — one file: audit log (add → remove) + per-row history ─
  console.log("\nTX-09/10 — Wallet Top-Up Regression Pack: 3 TCs added, 1 removed, and one row's result flips twice...");
  const wFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", syafiqTok, {
    method: "POST",
    body: {
      redmineTicketId: TX0910_FILE.redmineTicketId, title: TX0910_FILE.title, qaPic: TX0910_FILE.qaPicName,
      tracker: "QA Testing", projectId, milestoneId: crId, fileType: "qa",
    },
  });
  track("executionFile", wFile.id, "wreg", TX0910_FILE.title);

  // NOTE: the save endpoint overwrites every field of a row from the
  // payload it's given (missing fields become null) — so every save below
  // re-sends each row's COMPLETE data, never a bare {id, result} patch,
  // otherwise the "flip result" and "remove one row" steps would silently
  // blank out moduleName/caseName/testSteps/expectedResult on the rows we
  // meant to leave alone.
  const addedRows = TX0910_FILE.addedTcKeys.map((key, idx) => {
    const tc = tcByKey.get(key)!;
    return {
      testCaseId: `WREG-${idx + 1}`, moduleName: "Wallet", libraryTcId: libTcId.get(key),
      caseName: tc.title, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
      result: "Not Executed", qaPic: TX0910_FILE.qaPicName, rowOrder: idx,
    };
  });
  await api(`/execution-files/${wFile.redmineTicketId}/test-cases`, syafiqTok, {
    method: "POST", body: { testCases: addedRows, isFullSync: true },
  }); // audit entry #1 — 3 added

  type FullRow = {
    id: number; testCaseId: string; moduleName: string | null; libraryTcId: number | null;
    caseName: string | null; testSteps: string | null; expectedResult: string | null;
    result: string | null; actualResult: string | null; qaPic: string | null; rowOrder: number;
  };
  async function getRows(): Promise<FullRow[]> {
    const res = await api<{ testCases: FullRow[] }>(`/execution-files/${wFile.redmineTicketId}/test-cases`, syafiqTok);
    return res.testCases;
  }

  const afterAdd = await getRows();
  const removeIdx = TX0910_FILE.addedTcKeys.indexOf(TX0910_FILE.removedTcKey);
  const remainingRows = afterAdd
    .filter((r) => r.testCaseId !== `WREG-${removeIdx + 1}`)
    .map((r, idx) => ({ ...r, rowOrder: idx }));
  await api(`/execution-files/${wFile.redmineTicketId}/test-cases`, syafiqTok, {
    method: "POST", body: { testCases: remainingRows, isFullSync: true },
  }); // audit entry #2 — 1 removed

  // TX-10 — flip the history TC's result twice within this same file
  const historyIdx = TX0910_FILE.addedTcKeys.indexOf(TX0910_FILE.historyTcKey);
  const historyTestCaseId = `WREG-${historyIdx + 1}`;
  const afterRemove = await getRows();
  const historyRow = afterRemove.find((r) => r.testCaseId === historyTestCaseId)!;
  await api(`/execution-files/${wFile.redmineTicketId}/test-cases`, syafiqTok, {
    method: "POST",
    body: { testCases: [{ ...historyRow, result: TX0910_FILE.firstResult, actualResult: TX0910_FILE.firstActual }] },
  });
  const afterFirstFlip = await getRows();
  const historyRow2 = afterFirstFlip.find((r) => r.testCaseId === historyTestCaseId)!;
  await api(`/execution-files/${wFile.redmineTicketId}/test-cases`, syafiqTok, {
    method: "POST",
    body: { testCases: [{ ...historyRow2, result: TX0910_FILE.secondResult, actualResult: TX0910_FILE.secondActual }] },
  });
  console.log("  + audit log: 3 added → 1 removed; history: reg1's row Failed → Passed within the same session");

  // ── TX-11 — a stale, neglected execution file ────────────────────────────
  console.log("\nTX-11 — a stale execution file (incomplete, will be backdated past the 3-day threshold)...");
  const staleFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", nurulTok, {
    method: "POST",
    body: {
      redmineTicketId: TX11_STALE_FILE.redmineTicketId, title: TX11_STALE_FILE.title, qaPic: TX11_STALE_FILE.qaPicName,
      tracker: "QA Testing", projectId, milestoneId: crId, fileType: "qa",
    },
  });
  track("executionFile", staleFile.id, "stale", TX11_STALE_FILE.title);
  const staleRows = TX11_STALE_FILE.tcKeys.map((key, idx) => {
    const tc = tcByKey.get(key)!;
    return {
      testCaseId: `STALE-${idx + 1}`, moduleName: "Payment", libraryTcId: libTcId.get(key),
      caseName: tc.title, testSteps: tc.testSteps, expectedResult: tc.expectedResult,
      result: "Not Executed", qaPic: TX11_STALE_FILE.qaPicName, rowOrder: idx,
    };
  });
  await api(`/execution-files/${staleFile.redmineTicketId}/test-cases`, nurulTok, {
    method: "POST", body: { testCases: staleRows, isFullSync: true },
  });
  console.log(`  + ${TX11_STALE_FILE.title} — left Not Executed, will be backdated ${TX11_STALE_FILE.staleDaysAgo} days`);

  // ── TX-12 — deprecate a test case, author its replacement ────────────────
  console.log("\nTX-12 — deprecating TC-204, superseded by a v2...");
  const oldTcId = libTcId.get(TX12_DEPRECATE.deprecatedTcKey)!;
  await api(`/test-cases/${oldTcId}`, syafiqTok, { method: "PATCH", body: { status: "deprecated" } });
  const replacement = await api<{ id: number }>("/test-cases", tok.get(TX12_DEPRECATE.replacement.authorKey)!, {
    method: "POST",
    body: {
      title: TX12_DEPRECATE.replacement.title, objective: TX12_DEPRECATE.replacement.objective,
      preconditions: TX12_DEPRECATE.replacement.preconditions, testSteps: TX12_DEPRECATE.replacement.testSteps,
      expectedResult: TX12_DEPRECATE.replacement.expectedResult, requirementId: req101Id, projectId, module: "Payment",
      authorId: uid.get(TX12_DEPRECATE.replacement.authorKey),
    },
  });
  track("testCase", replacement.id, "tx12-replacement", TX12_DEPRECATE.replacement.title);
  console.log(`  + TC-204 marked deprecated; replacement "${TX12_DEPRECATE.replacement.title}" authored`);

  console.log(`\nDone. ${manifest.length} total tracked entities — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-testcases-bonus.ts");
}

main().catch((err) => {
  console.error("\nBonus seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything before retrying.`);
  process.exit(1);
});
