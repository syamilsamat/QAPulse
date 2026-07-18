/**
 * Seeds the SPARROW / CR-2026-014 dataset from the reference PDF
 * ("End-to-End Delivery Workflow & Mock-Up Scenario Guide") through the REAL
 * QAPulse API — so the review workflow, segregation-of-duties blocks, dev
 * hand-off gates, defect codes, notifications and audit trail all fire
 * exactly as they would for real users.
 *
 * Scripted scenario coverage:
 *   S1.1 milestone creation (Salmah/pmo) · S1.2 ENV2→ENV4 change ·
 *   S1.3 hotfix milestone · S2.1–S2.3 authoring + optional live AI runs ·
 *   S3.1 peer approval · S3.2 self-approval BLOCKED (expected 403) ·
 *   S3.3 reject→revise→approve · S3.4 late approval by FA Lead ·
 *   S4.1 dev assignment · S4.2 pre-approval assignment REFUSED (expected
 *   409) · S4.3 reassignment + handover comment · S5.2 requirement defect
 *   (auto-routes to the FA author) · S6.1–S6.4 test cases (4 AI-assisted) ·
 *   S6.3 description revision flags linked TCs · S5.4 ready-for-QA ·
 *   S7.1–S7.4 SIT rounds A/B incl. the defect loop, ENV outage blocks and
 *   the AI-selected regression rows · S8.2 deferred defect · S8.3 critical
 *   blocker · S9.1 UAT ≥80% alert (fires uat_milestone_ready) · S9.2 UAT
 *   escape · S10.1 FA-Lead sign-off → completed · S10.4 production escape +
 *   auto regression TC · S11 risks R-01…R-09 · S12 lessons learned.
 *
 * Run from the Replit shell (see scripts/SPARROW_DEMO.md):
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-data.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data.ts
 *
 * Optional env:
 *   SEED_RUN_AI=0  — skip the live AI calls (requirement analysis + the two
 *                    milestone risk assessments). Default is to attempt them
 *                    and continue on failure.
 */

import { loginAdmin, login, api } from "./seed-client";
import {
  loadSparrowManifest, saveSparrowManifest, type SparrowManifestEntry, type SparrowEntityType,
} from "./sparrow-manifest";
import {
  SPARROW_PASSWORD, USERS, TEAM, PROJECT, MODULES,
  MILESTONE_CR, MILESTONE_HOTFIX,
  REQ_101, REQ_102, REQ_103, REQ_104,
  TEST_CASES, SIT_FILE, UAT_FILE, DEFECTS, TASKS, RISKS,
  REQ102_HANDOVER_COMMENT,
  type SparrowExecRow,
} from "./sparrow-data";

const RUN_AI = process.env.SEED_RUN_AI !== "0";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length > 0) {
  console.error(
    `sparrow-seed-manifest.json already has ${manifest.length} entries — refusing to seed on top of an ` +
    `existing SPARROW dataset. Run "npx tsx src/clear-sparrow-data.ts" first.`,
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}

/** Run a call that is SUPPOSED to be rejected by the API (governance demo).
 *  Throws if it unexpectedly succeeds. */
async function expectRejected(what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err: any) {
    console.log(`  ✓ blocked as expected — ${what}\n      ${String(err.message).slice(0, 140)}`);
    return;
  }
  throw new Error(`Expected the API to reject: ${what} — but it succeeded. Aborting so the governance demo stays truthful.`);
}

async function tryAi(what: string, fn: () => Promise<unknown>) {
  if (!RUN_AI) { console.log(`  (skipped AI: ${what} — SEED_RUN_AI=0)`); return; }
  try {
    await fn();
    console.log(`  ✓ AI: ${what}`);
  } catch (err: any) {
    console.log(`  ! AI failed (continuing): ${what} — ${String(err.message).slice(0, 120)}`);
  }
}

async function main() {
  console.log("Logging in as admin...");
  const adminToken = await loginAdmin();

  // ── 1. Modules ─────────────────────────────────────────────────────────
  console.log("\nEnsuring modules exist (Payment, Wallet, Notification, Reporting)...");
  const existingModules = await api<{ id: number; name: string }[]>("/modules", adminToken);
  const moduleIdByName = new Map<string, number>(existingModules.map((m) => [m.name, m.id]));
  for (const name of MODULES) {
    if (moduleIdByName.has(name)) continue;
    const created = await api<{ id: number }>("/modules", adminToken, { method: "POST", body: { name } });
    moduleIdByName.set(name, created.id);
    console.log(`  + module: ${name}`);
  }

  // ── 2. Users (PDF Section 2) ───────────────────────────────────────────
  console.log("\nCreating the 11 SPARROW personas...");
  const uid = new Map<string, number>();
  const tok = new Map<string, string>();
  for (const u of USERS) {
    const created = await api<{ id: number }>("/users", adminToken, {
      method: "POST",
      body: { name: u.name, email: u.email, password: SPARROW_PASSWORD, role: u.role },
    });
    uid.set(u.key, created.id);
    track("user", created.id, u.key, `${u.name} (${u.role})`);
    await api(`/users/${created.id}`, adminToken, { method: "PATCH", body: { mustChangePassword: false } });
    tok.set(u.key, await login(u.email, SPARROW_PASSWORD));
    console.log(`  + ${u.name} <${u.email}> — ${u.role}`);
  }

  // ── 3. Team ────────────────────────────────────────────────────────────
  console.log("\nCreating the QA squad team...");
  const team = await api<{ id: number }>("/teams", adminToken, {
    method: "POST", body: { name: TEAM.name, department: TEAM.department },
  });
  track("team", team.id, "team", TEAM.name);
  for (const m of TEAM.members) {
    await api(`/teams/${team.id}/members`, adminToken, {
      method: "POST", body: { userId: uid.get(m.userKey), role: m.role },
    });
  }
  console.log(`  + ${TEAM.name} (${TEAM.members.length} members)`);

  // ── 4. Project SPARROW ─────────────────────────────────────────────────
  console.log("\nCreating project SPARROW...");
  const project = await api<{ id: number }>("/projects", adminToken, {
    method: "POST", body: { name: PROJECT.name, description: PROJECT.description, status: "active" },
  });
  const projectId = project.id;
  track("project", projectId, "project", PROJECT.name);
  await api(`/projects/${projectId}/teams`, adminToken, { method: "POST", body: { teamId: team.id } });
  for (const m of TEAM.members) {
    await api(`/projects/${projectId}/members`, adminToken, { method: "POST", body: { userId: uid.get(m.userKey) } });
  }
  for (const key of PROJECT.directMemberKeys) {
    await api(`/projects/${projectId}/members`, adminToken, { method: "POST", body: { userId: uid.get(key) } });
  }
  for (const name of PROJECT.moduleNames) {
    const moduleId = moduleIdByName.get(name);
    if (moduleId) await api(`/projects/${projectId}/modules`, adminToken, { method: "POST", body: { moduleId } });
  }
  console.log(`  + ${PROJECT.name} — 11 members, ${PROJECT.moduleNames.length} modules`);

  // ── 5. Milestones ──────────────────────────────────────────────────────
  // S1.1 — Salmah (pmo) creates CR-2026-014 herself so createdBy = Salmah
  // (that's who the uat_milestone_ready alert later goes to).
  console.log("\nS1.1 — Salmah creates milestone CR-2026-014 (planned, ENV2)...");
  const salmahTok = tok.get("salmah")!;
  const crMilestone = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MILESTONE_CR.name, type: MILESTONE_CR.type, status: "planned",
      targetDate: MILESTONE_CR.targetDate, startDate: MILESTONE_CR.startDate,
      reqTargetDate: MILESTONE_CR.reqTargetDate, devTargetDate: MILESTONE_CR.devTargetDate,
      qaTargetDate: MILESTONE_CR.qaTargetDate, uatTargetDate: MILESTONE_CR.uatTargetDate,
      goLiveDate: MILESTONE_CR.goLiveDate, environment: MILESTONE_CR.environmentInitial,
    },
  });
  const crId = crMilestone.id;
  track("milestone", crId, MILESTONE_CR.key, MILESTONE_CR.name);

  console.log("S1.2 — ENV2 is booked by another project → Salmah changes the environment to ENV4...");
  await api(`/milestones/${crId}`, salmahTok, { method: "PATCH", body: { environment: MILESTONE_CR.environmentFinal } });

  console.log("S1.3 — Rizal creates the compressed HOTFIX-2026-003 release milestone (ENV6)...");
  const rizalTok = tok.get("rizal")!;
  const hotfix = await api<{ id: number }>("/milestones", rizalTok, {
    method: "POST",
    body: {
      projectId, name: MILESTONE_HOTFIX.name, type: MILESTONE_HOTFIX.type, status: "active",
      targetDate: MILESTONE_HOTFIX.targetDate, startDate: MILESTONE_HOTFIX.startDate,
      devTargetDate: MILESTONE_HOTFIX.devTargetDate, qaTargetDate: MILESTONE_HOTFIX.qaTargetDate,
      goLiveDate: MILESTONE_HOTFIX.goLiveDate, environment: MILESTONE_HOTFIX.environment,
    },
  });
  track("milestone", hotfix.id, MILESTONE_HOTFIX.key, MILESTONE_HOTFIX.name);
  await api(`/milestones/${hotfix.id}`, rizalTok, {
    method: "PATCH",
    body: { status: "completed", lessonsLearned: "Delivered in 6 days on ENV6 with UAT waived by agreement. The compressed plan worked because scope was a single fix — do not treat this as a precedent for CRs." },
  });

  // ── 6. Requirements + review workflow ──────────────────────────────────
  const ainaTok = tok.get("aina")!;
  const harithTok = tok.get("harith")!;
  const danielTok = tok.get("daniel")!;
  const reqId = new Map<string, number>();

  console.log("\nPhase 2/3 — requirements, AI analysis and peer review...");

  // REQ-101 — S2.1 (well-formed, AI run) + S3.1 (straight-through approval by Harith)
  {
    const r = await api<{ id: number }>("/requirements", ainaTok, {
      method: "POST",
      body: {
        title: REQ_101.title, description: REQ_101.description, module: REQ_101.module,
        projectId, priority: REQ_101.priority, status: "open", milestoneId: crId,
        acceptanceCriteria: JSON.stringify(REQ_101.acceptanceCriteria),
      },
    });
    reqId.set("req101", r.id);
    track("requirement", r.id, "req101", REQ_101.title);
    await tryAi("S2.1 analyzer run on REQ-101", () =>
      api("/ai/analyze-requirement", ainaTok, { method: "POST", body: { requirementId: r.id } }));
    await api(`/requirements/${r.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
    await api(`/requirements/${r.id}/review`, harithTok, { method: "PATCH", body: { action: "approve" } });
    console.log("  + REQ-101 created, analyzed, submitted, approved by Harith (S3.1)");
  }

  // REQ-102 — S2.3 (Redmine-linked) + S3.2 (self-approval blocked) + approval by Daniel
  {
    const r = await api<{ id: number }>("/requirements", ainaTok, {
      method: "POST",
      body: {
        title: REQ_102.title, description: REQ_102.description, module: REQ_102.module,
        projectId, priority: REQ_102.priority, status: "open", milestoneId: crId,
        redmineTicketId: REQ_102.redmineTicketId,
        acceptanceCriteria: JSON.stringify(REQ_102.acceptanceCriteria),
      },
    });
    reqId.set("req102", r.id);
    track("requirement", r.id, "req102", REQ_102.title);
    await tryAi("S2.3 analyzer run on REQ-102", () =>
      api("/ai/analyze-requirement", ainaTok, { method: "POST", body: { requirementId: r.id } }));
    await api(`/requirements/${r.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
    console.log("  + REQ-102 created (Redmine #48213 linked), submitted");
    console.log("S3.2 — Aina attempts to approve her OWN requirement (segregation of duties)...");
    await expectRejected("author approving their own requirement", () =>
      api(`/requirements/${r.id}/review`, ainaTok, { method: "PATCH", body: { action: "approve" } }));
    await api(`/requirements/${r.id}/review`, danielTok, { method: "PATCH", body: { action: "approve" } });
    console.log("  + REQ-102 approved by Daniel");
  }

  // REQ-103 — S2.2 (weak draft → AI → rewrite) + S3.3 (reject → revise → approve)
  const farhanTok = tok.get("farhan")!;
  {
    const r = await api<{ id: number }>("/requirements", ainaTok, {
      method: "POST",
      body: {
        title: REQ_103.title, description: REQ_103.draftDescription, module: REQ_103.module,
        projectId, priority: REQ_103.priority, status: "open", milestoneId: crId,
      },
    });
    reqId.set("req103", r.id);
    track("requirement", r.id, "req103", REQ_103.title);
    await tryAi("S2.2 analyzer run 1 on the weak REQ-103 draft", () =>
      api("/ai/analyze-requirement", ainaTok, { method: "POST", body: { requirementId: r.id } }));
    // Rewrite after the low-scoring run
    await api(`/requirements/${r.id}`, ainaTok, {
      method: "PATCH",
      body: {
        description: REQ_103.description,
        acceptanceCriteria: JSON.stringify([
          ...REQ_103.acceptanceCriteria.slice(0, 3),
          "AC4 — Refunds above RM 5,000 require one approver", // the version Daniel will reject
          ...REQ_103.acceptanceCriteria.slice(4),
        ]),
      },
    });
    await tryAi("S2.2 analyzer run 2 on the rewritten REQ-103", () =>
      api("/ai/analyze-requirement", ainaTok, { method: "POST", body: { requirementId: r.id } }));
    await api(`/requirements/${r.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });

    console.log("S4.2 — Farhan tries to assign REQ-103 to dev BEFORE approval (gate demo)...");
    await expectRejected("dev assignment of an unapproved requirement", () =>
      api(`/requirements/${r.id}/dev`, farhanTok, { method: "PATCH", body: { action: "assign", devAssigneeId: uid.get("kavitha") } }));

    console.log("S3.3 — Daniel rejects REQ-103 (Finance SOP conflict), Aina revises AC4, re-submits...");
    await api(`/requirements/${r.id}/review`, danielTok, {
      method: "PATCH", body: { action: "reject", comment: REQ_103.rejectComment },
    });
    await api(`/requirements/${r.id}`, ainaTok, {
      method: "PATCH", body: { acceptanceCriteria: JSON.stringify(REQ_103.acceptanceCriteria) },
    });
    await api(`/requirements/${r.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
    await api(`/requirements/${r.id}/review`, danielTok, { method: "PATCH", body: { action: "approve" } });
    console.log("  + REQ-103 approved on the second cycle");
  }

  // REQ-104 — S3.4 (stale review, picked up and approved by the FA Lead)
  {
    const r = await api<{ id: number }>("/requirements", harithTok, {
      method: "POST",
      body: {
        title: REQ_104.title, description: REQ_104.description, module: REQ_104.module,
        projectId, priority: REQ_104.priority, status: "open", milestoneId: crId,
        acceptanceCriteria: JSON.stringify(REQ_104.acceptanceCriteria),
      },
    });
    reqId.set("req104", r.id);
    track("requirement", r.id, "req104", REQ_104.title);
    await api(`/requirements/${r.id}/review`, harithTok, { method: "PATCH", body: { action: "submit" } });
    await api(`/requirements/${r.id}/review`, danielTok, { method: "PATCH", body: { action: "approve" } });
    console.log("  + REQ-104 created by Harith, approved by Daniel (stale-review pickup, S3.4)");
  }

  // Milestone goes active now that delivery is underway
  await api(`/milestones/${crId}`, salmahTok, { method: "PATCH", body: { status: "active" } });
  console.log("\nMilestone CR-2026-014: planned → active");

  // ── 7. Dev assignment (Phase 4) ────────────────────────────────────────
  console.log("\nPhase 4 — dev queue: assignments, start, reassignment...");
  const assign = (rk: string, devKey: string) =>
    api(`/requirements/${reqId.get(rk)}/dev`, farhanTok, {
      method: "PATCH", body: { action: "assign", devAssigneeId: uid.get(devKey) },
    });
  const devAction = (rk: string, byKey: string, action: "start" | "ready_for_qa") =>
    api(`/requirements/${reqId.get(rk)}/dev`, tok.get(byKey)!, { method: "PATCH", body: { action } });

  await assign("req101", "weijun");   // S4.1
  await assign("req102", "kavitha");  // S4.4 (initial)
  await assign("req103", "kavitha");  // S4.2 — succeeds now that it's approved
  await assign("req104", "kavitha");  // S4.4
  await devAction("req101", "weijun", "start");   // S5.1
  await devAction("req102", "kavitha", "start");
  await devAction("req103", "kavitha", "start");
  await devAction("req104", "kavitha", "start");
  console.log("  + 4 requirements assigned and in progress (Wei Jun ×1, Kavitha ×3)");

  // S4.3 — Kavitha's planned leave: REQ-102 reassigned to Wei Jun, handover comment attached
  await assign("req102", "weijun");
  await devAction("req102", "weijun", "start");
  await api(`/requirements/${reqId.get("req102")}/comments`, tok.get("kavitha")!, {
    method: "POST", body: { body: REQ102_HANDOVER_COMMENT },
  });
  console.log("  + S4.3 — REQ-102 reassigned Kavitha → Wei Jun, handover note attached as a comment");

  // ── 8. S5.2 — requirement defect raised by the developer mid-build ─────
  console.log("\nS5.2 — Wei Jun raises a requirement defect on REQ-101 (auto-routes to Aina)...");
  const dreqData = DEFECTS.find((d) => d.key === "dreq")!;
  const defectIds = new Map<string, { id: number; code: string }>();
  {
    const d = await api<{ id: number; defectCode: string }>("/defects", tok.get("weijun")!, {
      method: "POST",
      body: {
        title: dreqData.title, description: dreqData.description, severity: dreqData.severity,
        module: dreqData.module, source: "requirement", requirementId: reqId.get("req101"),
      },
    });
    defectIds.set("dreq", { id: d.id, code: d.defectCode });
    track("defect", d.id, "dreq", dreqData.title);
    console.log(`  + ${d.defectCode} routed to the requirement author`);
  }

  // ── 9. Test cases (Phase 6) — written during the build ─────────────────
  console.log("\nPhase 6 — test case library (17 authored + 11 standing regression)...");
  const tcId = new Map<string, number>();
  const reqByKey = { req101: REQ_101, req102: REQ_102, req103: REQ_103, req104: REQ_104 } as const;
  for (const tc of TEST_CASES) {
    const parentReq = reqByKey[tc.requirementKey as keyof typeof reqByKey];
    const created = await api<{ id: number }>("/test-cases", tok.get(tc.authorKey) ?? adminToken, {
      method: "POST",
      body: {
        title: tc.title, preconditions: tc.preconditions, testSteps: tc.testSteps,
        expectedResult: tc.expectedResult, type: tc.type, priority: tc.priority,
        requirementId: reqId.get(tc.requirementKey), projectId,
        module: tc.module ?? parentReq.module,
        authorId: uid.get(tc.authorKey), aiAssisted: !!tc.aiAssisted,
      },
    });
    tcId.set(tc.key, created.id);
    track("testCase", created.id, tc.key, `${tc.rowId} ${tc.title}`);
  }
  console.log(`  + ${TEST_CASES.length} test cases (TC-207…TC-210 AI-assisted)`);

  // S5.2/S6.3 — Aina clarifies AC3; linked TCs are flagged revision_required
  console.log("S6.3 — Aina clarifies REQ-101's description; linked test cases are flagged for re-review...");
  await api(`/requirements/${reqId.get("req101")}`, ainaTok, {
    method: "PATCH", body: { description: REQ_101.clarifiedDescription },
  });

  // ── 10. S5.4 — builds complete, hand-over to QA ────────────────────────
  console.log("\nS5.4 — developers mark all four requirements Ready for QA...");
  await devAction("req101", "weijun", "ready_for_qa");
  await devAction("req102", "weijun", "ready_for_qa");
  await devAction("req103", "kavitha", "ready_for_qa");
  await devAction("req104", "kavitha", "ready_for_qa");

  // ── 11. SIT execution (Phase 7) ────────────────────────────────────────
  console.log("\nPhase 7 — SIT execution file on ENV4...");
  const melissaTok = tok.get("melissa")!;
  const sitFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: {
      redmineTicketId: SIT_FILE.redmineTicketId, title: SIT_FILE.title, qaPic: SIT_FILE.qaPicName,
      tracker: SIT_FILE.tracker, projectId, milestoneId: crId, fileType: SIT_FILE.fileType,
    },
  });
  track("executionFile", sitFile.id, "sit", SIT_FILE.title);

  const tcByKey = new Map(TEST_CASES.map((t) => [t.key, t]));
  function buildRows(file: typeof SIT_FILE | typeof UAT_FILE, round: "A" | "B", idByRow: Map<string, number>) {
    const rows: any[] = [];
    let order = 0;
    for (const row of file.rows as SparrowExecRow[]) {
      if (round === "A" && row.roundBOnly) continue;
      const tc = tcByKey.get(row.tcKey)!;
      const parentReq = reqByKey[tc.requirementKey as keyof typeof reqByKey];
      const result = round === "A" ? row.resultA : row.resultB;
      const actual = round === "A" ? row.actualA : (row.actualB ?? (row.resultB === "Passed" ? "As expected." : undefined));
      rows.push({
        id: idByRow.get(row.rowId),
        testCaseId: row.rowId,
        moduleName: tc.module ?? parentReq.module,
        libraryTcId: tcId.get(row.tcKey),
        requirementId: reqId.get(tc.requirementKey),
        caseName: row.caseName ?? tc.title,
        testSteps: tc.testSteps,
        expectedResult: tc.expectedResult,
        result,
        actualResult: actual,
        executedAt: result === "Not Executed" ? undefined : new Date().toISOString(),
        qaPic: file.qaPicName,
        rowOrder: order++,
      });
    }
    return rows;
  }

  console.log("  Round A — first execution: failures found (TC-209, TC-217, TC-REG-02), 6 rows Blocked by the ENV4 outage...");
  await api(`/execution-files/${sitFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST", body: { testCases: buildRows(SIT_FILE, "A", new Map()), isFullSync: true },
  });
  const sitSaved = await api<{ testCases: { id: number; testCaseId: string }[] }>(
    `/execution-files/${sitFile.redmineTicketId}/test-cases`, melissaTok,
  );
  const sitRowId = new Map(sitSaved.testCases.map((r) => [r.testCaseId, r.id]));

  // Defects raised from the failed SIT rows (S7.2, S8.2, S8.3)
  console.log("  Raising SIT defects from the failed rows...");
  for (const key of ["d42", "d47", "d51"] as const) {
    const d = DEFECTS.find((x) => x.key === key)!;
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(d.reporterKey)!, {
      method: "POST",
      body: {
        title: d.title, description: d.description, stepsToReproduce: d.stepsToReproduce,
        expectedResult: d.expectedResult, actualResult: d.actualResult,
        severity: d.severity, module: d.module, projectId, foundIn: d.foundIn,
        executionTcId: sitRowId.get(d.rowId!),
        requirementId: d.requirementKey ? reqId.get(d.requirementKey) : undefined,
      },
    });
    defectIds.set(key, { id: created.id, code: created.defectCode });
    track("defect", created.id, key, d.title);
    if (d.assignToKey) {
      await api(`/defects/${created.id}/assign`, melissaTok, {
        method: "PATCH", body: { assigneeId: uid.get(d.assignToKey) },
      });
    }
    console.log(`    + ${created.defectCode} (${d.severity}) — ${d.title.slice(0, 60)}…`);
  }

  console.log("  Round B — fixes retested, blocked rows re-executed, 8 AI-selected regression rows appended (S7.4)...");
  await api(`/execution-files/${sitFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST", body: { testCases: buildRows(SIT_FILE, "B", sitRowId), isFullSync: true },
  });
  console.log("  Final SIT tally: 27 Passed / 1 Failed (deferred cosmetic) / 0 Blocked — 96.4% (S8.2 exit)");

  // Optional mid-flight AI milestone risk assessment (S11.4 — the "high" one)
  await tryAi("S11.4 milestone risk assessment #1 (blocker open)", () =>
    api("/ai/milestone-risk", rizalTok, { method: "POST", body: { milestoneId: crId } }));

  // ── 12. UAT (Phase 9) ──────────────────────────────────────────────────
  console.log("\nPhase 9 — UAT execution file on ENV5...");
  const uatFile = await api<{ id: number; redmineTicketId: string }>("/execution-files", melissaTok, {
    method: "POST",
    body: {
      redmineTicketId: UAT_FILE.redmineTicketId, title: UAT_FILE.title, qaPic: UAT_FILE.qaPicName,
      tracker: UAT_FILE.tracker, projectId, milestoneId: crId, fileType: UAT_FILE.fileType,
    },
  });
  track("executionFile", uatFile.id, "uat", UAT_FILE.title);

  console.log("  Round A — 13/15 passed (86.7%) → crossing 80% fires uat_milestone_ready to Salmah (S9.1)...");
  await api(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST", body: { testCases: buildRows(UAT_FILE, "A", new Map()), isFullSync: true },
  });
  const uatSaved = await api<{ testCases: { id: number; testCaseId: string }[] }>(
    `/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok,
  );
  const uatRowId = new Map(uatSaved.testCases.map((r) => [r.testCaseId, r.id]));

  // S9.2 — the UAT escape
  {
    const d = DEFECTS.find((x) => x.key === "d58")!;
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(d.reporterKey)!, {
      method: "POST",
      body: {
        title: d.title, description: d.description, stepsToReproduce: d.stepsToReproduce,
        expectedResult: d.expectedResult, actualResult: d.actualResult,
        severity: d.severity, module: d.module, projectId, foundIn: d.foundIn,
        executionTcId: uatRowId.get(d.rowId!),
        requirementId: reqId.get(d.requirementKey!),
      },
    });
    defectIds.set("d58", { id: created.id, code: created.defectCode });
    track("defect", created.id, "d58", d.title);
    if (d.assignToKey) {
      await api(`/defects/${created.id}/assign`, melissaTok, { method: "PATCH", body: { assigneeId: uid.get(d.assignToKey) } });
    }
    console.log(`    + ${created.defectCode} (UAT escape) — feeds the SIT/UAT/Production escape funnel`);
  }

  console.log("  Round B — fix retested with the business user; 15/15 Passed (S9.4)...");
  await api(`/execution-files/${uatFile.redmineTicketId}/test-cases`, melissaTok, {
    method: "POST", body: { testCases: buildRows(UAT_FILE, "B", uatRowId), isFullSync: true },
  });

  // ── 13. Tasks (S5.3, S8.4, S10.3) ──────────────────────────────────────
  console.log("\nCreating milestone tasks (build, T-85/T-88 dependency story, SIT/regression/UAT roll-up)...");
  for (const t of TASKS) {
    const created = await api<{ id: number }>("/tasks", adminToken, {
      method: "POST",
      body: {
        name: t.name, priority: t.priority, status: t.status,
        assigneeIds: t.assigneeKeys.map((k) => uid.get(k)),
        projectId,
        milestoneId: t.milestoneKey === "hotfix" ? hotfix.id : crId,
        requirementId: t.requirementKey ? reqId.get(t.requirementKey) : undefined,
        moduleIds: "",
        startDate: t.startDate, dueDate: t.dueDate,
        actualStartDate: t.actualStartDate, actualEndDate: t.actualEndDate,
        estimatedHours: t.estimatedHours, actualHours: t.actualHours,
        completionPercentage: t.completionPercentage,
      },
    });
    track("task", created.id, t.key, t.name);
  }
  console.log(`  + ${TASKS.length} tasks`);

  // ── 14. Risk register (Phase 11) ───────────────────────────────────────
  console.log("\nPhase 11 — risk register R-01…R-09 (incl. one realized)...");
  for (const r of RISKS) {
    const created = await api<{ id: number }>("/risks", tok.get(r.raisedByKey)!, {
      method: "POST",
      body: {
        projectId,
        milestoneId: r.milestoneKey === "hotfix" ? hotfix.id : crId,
        title: r.title, description: r.description ?? null, category: r.category,
        probability: r.probability, impact: r.impact, status: r.status,
        mitigationPlan: r.mitigationPlan ?? null,
        ownerId: r.ownerKey ? uid.get(r.ownerKey) : null,
      },
    });
    track("risk", created.id, r.key, r.title);
  }
  console.log(`  + ${RISKS.length} risks`);

  // ── 15. S10.4 — production escape (after go-live) ──────────────────────
  console.log("\nS10.4 — production escape DEF-P0004 + escape review + auto regression TC...");
  {
    const d = DEFECTS.find((x) => x.key === "dp4")!;
    const created = await api<{ id: number; defectCode: string }>("/defects", tok.get(d.reporterKey)!, {
      method: "POST",
      body: {
        title: d.title, description: d.description, stepsToReproduce: d.stepsToReproduce,
        expectedResult: d.expectedResult, actualResult: d.actualResult,
        severity: d.severity, module: d.module, projectId, foundIn: d.foundIn,
        requirementId: reqId.get(d.requirementKey!), milestoneId: crId,
      },
    });
    defectIds.set("dp4", { id: created.id, code: created.defectCode });
    track("defect", created.id, "dp4", d.title);
    await api(`/defects/${created.id}`, adminToken, {
      method: "PATCH",
      body: { source: "production", escapeClass: d.escapeClass, escapeStatus: d.escapeStatus },
    });
    await api(`/defects/${created.id}/regression-tc`, melissaTok, { method: "POST", body: {} });
    console.log(`  + ${created.defectCode} classified coverage_gap, regression TC auto-created (the "TC-224" of S10.4)`);
  }

  // Second AI risk assessment (S11.4 — should come back calmer)
  await tryAi("S11.4 milestone risk assessment #2 (after the fix landed)", () =>
    api("/ai/milestone-risk", rizalTok, { method: "POST", body: { milestoneId: crId } }));

  // ── 16. S10.1 — FA Lead sign-off → completed; lessons learned ──────────
  console.log("\nS10.1 — Daniel (FA Lead) signs off the milestone → status completed...");
  const signOff = await api<{ warning?: string | null }>(`/milestones/${crId}/review`, danielTok, {
    method: "PATCH", body: { action: "approve" },
  });
  if (signOff?.warning) console.log(`  (sign-off warning surfaced: ${signOff.warning})`);
  await api(`/milestones/${crId}`, salmahTok, {
    method: "PATCH", body: { lessonsLearned: MILESTONE_CR.lessonsLearned },
  });
  console.log("  + milestone completed; 3 lessons-learned entries recorded (S12.1–S12.3)");

  // ── Done ───────────────────────────────────────────────────────────────
  console.log(`\nDone. ${manifest.length} entities created — see scripts/sparrow-seed-manifest.json`);
  console.log("\nPDF defect code → actual defect code in this database:");
  for (const d of DEFECTS) {
    const real = defectIds.get(d.key);
    if (real) console.log(`  ${d.pdfCode.padEnd(9)} → ${real.code}`);
  }
  console.log("\nNEXT STEP (required): backdate all timestamps to the storyline dates + stamp final defect statuses:");
  console.log("  DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data.ts");
  console.log(`\nAll 11 personas log in with password: ${SPARROW_PASSWORD}`);
  console.log("  e.g. salmah.idris@demo.qapulse.local (PMO), melissa.lim@demo.qapulse.local (QA Lead), daniel.wong@demo.qapulse.local (FA Lead)");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  if (manifest.length > 0) {
    console.error(`Partial progress saved in sparrow-seed-manifest.json (${manifest.length} entities) — run "npx tsx src/clear-sparrow-data.ts" before retrying.`);
  }
  process.exit(1);
});
