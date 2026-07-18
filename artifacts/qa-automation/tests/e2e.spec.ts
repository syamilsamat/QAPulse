/**
 * End-to-end journey suite — docs/test-plans/qapulse-e2e-tests.xlsx
 * (E2E-001 … E2E-012). Each test is linked to its Excel case via the qcase()
 * title + annotation.
 *
 * These are multi-actor journeys driven through the API with role-correct
 * actors at every step (FA authors, FA Lead approves, Dev Lead assigns, Dev
 * builds, QA tests, PM owns milestones) — asserting the state transition and
 * the notification fan-out at each meaningful boundary, not just the final
 * state.
 */
import { Api } from "../src/api";
import {
  test, expect, qcase, uniq, ACTOR_PASSWORD,
  createRequirement, approvedRequirement, readyForQaRequirement,
  createExecutionFile, expectNotification,
  type Requirement,
} from "../src/qtest";

// ── Shared response shapes ────────────────────────────────────────────────────

interface Milestone {
  id: number;
  status: string;
  completedAt: string | null;
  createdBy: number | null;
}

interface SavedTestCases {
  testCases: { id: number; testCaseId: string | null }[];
}

/** CR032 phase-breakdown timeline segment (routes/dashboard.ts makeSegment). */
interface PhaseSegment {
  key: string;
  cycle: number;
  start: string;
  end: string | null;
  days: number;
  ongoing: boolean;
}

interface PhaseBreakdown {
  requirements: { id: number; title: string; status: string; timeline: PhaseSegment[] }[];
}

interface DefectStatus {
  redmineId: number;
  name: string;
  isClosed: boolean;
}

// ── Delivery ──────────────────────────────────────────────────────────────────

qcase("E2E-001", "Requirement to go-live (happy path)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const devLead = as(world.actors.devLead);
  const dev = as(world.actors.dev);
  const qa = as(world.actors.qa);
  const pm = as(world.actors.pm);

  // PM opens the delivery window; the requirement rides this milestone so the
  // phase timeline and the close-out at the end have something to aggregate.
  const milestone = await pm.post<Milestone>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW E2E-001 milestone"),
  });

  // FA authors (with AC — stored as a JSON text column) and submits.
  const req = await createRequirement(fa, world, {
    milestoneId: milestone.id,
    acceptanceCriteria: JSON.stringify(["User can log in", "Session persists"]),
  });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await expectNotification(world, world.actors.faLead, {
    entityId: req.id, entityType: "requirement", type: "review_request",
  });

  // FA2 approves → author + Dev Lead hear about it (CR045).
  const approved = await faLead.patch<Requirement>(`/requirements/${req.id}/review`, { action: "approve" });
  expect(approved.reviewStatus).toBe("approved");
  await expectNotification(world, world.actors.fa, {
    entityId: req.id, entityType: "requirement", type: "review_approved",
  });
  await expectNotification(world, world.actors.devLead, {
    entityId: req.id, entityType: "requirement", type: "review_approved",
  });

  // Dev Lead assigns → Dev starts → Ready for QA (each transition asserted).
  const assigned = await devLead.patch<Requirement>(`/requirements/${req.id}/dev`, {
    action: "assign", devAssigneeId: world.actors.dev.id,
  });
  expect(assigned.devStatus).toBe("assigned");
  await expectNotification(world, world.actors.dev, {
    entityId: req.id, entityType: "requirement", type: "requirement_dev_assigned",
  });
  const started = await dev.patch<Requirement>(`/requirements/${req.id}/dev`, { action: "start" });
  expect(started.devStatus).toBe("in_progress");
  const ready = await dev.patch<Requirement>(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });
  expect(ready.devStatus).toBe("ready_for_qa");
  await expectNotification(world, world.actors.qaLead, {
    entityId: req.id, entityType: "requirement", type: "requirement_ready_for_qa",
  });

  // QA compiles library TCs into an execution file and runs them all Pass
  // (CR003 flow, same rows the compile dialog writes).
  const tc1 = await qa.post<{ id: number }>("/test-cases", {
    title: uniq("PW E2E-001 TC login"), requirementId: req.id, projectId: world.project.id,
  });
  const tc2 = await qa.post<{ id: number }>("/test-cases", {
    title: uniq("PW E2E-001 TC session"), requirementId: req.id, projectId: world.project.id,
  });
  const file = await createExecutionFile(qa, world, {
    requirementId: req.id, milestoneId: milestone.id, qaPic: world.actors.qa.name,
  });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [tc1, tc2].map((tc, i) => ({
      caseId: `PW-E2E-001-${i + 1}`,
      caseName: `Happy path case ${i + 1}`,
      scenario: "E2E",
      result: "Passed",
      qaPic: world.actors.qa.name,
      rowOrder: i,
      libraryTcId: tc.id,
      requirementId: req.id,
    })),
  });
  const saved = await qa.get<{ testCases: { result: string | null }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  expect(saved.testCases.every((r) => r.result === "Passed")).toBe(true);

  // Verdict email (step 7) is not sent here: /pmo/send-verdict dispatches a
  // real SMTP email to real recipients — delivery is verified manually against
  // a mailbox, not from this suite.

  // PM closes the milestone (completedAt auto-stamps on the transition).
  const closed = await pm.patch<Milestone>(`/milestones/${milestone.id}`, { status: "completed" });
  expect(closed.status).toBe("completed");
  expect(closed.completedAt).not.toBeNull();

  // Timeline shows Requirements → Develop → QA for this requirement (CR032).
  const breakdown = await pm.get<PhaseBreakdown>(
    `/dashboard/milestone-phase-breakdown?milestoneId=${milestone.id}`,
  );
  const entry = breakdown.requirements.find((r) => r.id === req.id);
  expect(entry).toBeTruthy();
  const keys = entry!.timeline.map((s) => s.key);
  expect(keys).toContain("requirements");
  expect(keys).toContain("develop");
  expect(keys).toContain("qa");
});

qcase("E2E-002", "Rejection and rework loop", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const pm = as(world.actors.pm);

  // The reject fan-out only reaches a PM through the requirement's milestone
  // (milestone.createdBy) — so the milestone must be PM-created.
  const milestone = await pm.post<Milestone>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW E2E-002 milestone"),
  });

  const req = await createRequirement(fa, world, { milestoneId: milestone.id });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });

  // FA2 rejects with a comment → author AND the milestone's PM are notified.
  const rejected = await faLead.patch<Requirement>(`/requirements/${req.id}/review`, {
    action: "reject", comment: "AC incomplete — please add the negative flow",
  });
  expect(rejected.reviewStatus).toBe("rejected");
  await expectNotification(world, world.actors.fa, {
    entityId: req.id, entityType: "requirement", type: "review_rejected",
  });
  await expectNotification(world, world.actors.pm, {
    entityId: req.id, entityType: "requirement", type: "review_rejected",
  });

  // Author edits (author/assignee-only gate) and resubmits (CR023 re-review).
  await fa.patch(`/requirements/${req.id}`, {
    description: "Revised after rejection — negative flow added.",
  });
  const resubmitted = await fa.patch<Requirement>(`/requirements/${req.id}/review`, { action: "submit" });
  expect(resubmitted.reviewStatus).toBe("in_review");

  const approved = await faLead.patch<Requirement>(`/requirements/${req.id}/review`, { action: "approve" });
  expect(approved.reviewStatus).toBe("approved");

  // The activity journal shows the full loop: two submits around one reject.
  const history = await fa.get<{ type: string }[]>(`/requirements/${req.id}/history`);
  const types = history.map((h) => h.type);
  expect(types.filter((t) => t === "requirement_submit").length).toBeGreaterThanOrEqual(2);
  expect(types).toContain("requirement_reject");
  expect(types).toContain("requirement_approve");
});

qcase("E2E-003", "Return-to-Dev retest loop (CR046)", async ({ world, as }) => {
  const dev = as(world.actors.dev);
  const qa = as(world.actors.qa);

  const req = await readyForQaRequirement(world);

  // QA finds it incomplete → Return to Dev with a reason. The requirement
  // re-enters in_progress with the same assignee; dev + dev_lead notified.
  const returned = await qa.patch<Requirement>(`/requirements/${req.id}/dev`, {
    action: "return_to_dev", reason: "Validation missing on the edit form",
  });
  expect(returned.devStatus).toBe("in_progress");
  await expectNotification(world, world.actors.dev, {
    entityId: req.id, entityType: "requirement", type: "returned_to_dev",
  });
  await expectNotification(world, world.actors.devLead, {
    entityId: req.id, entityType: "requirement", type: "returned_to_dev",
  });

  // Dev fixes and marks Ready again — same handoff, no re-assign needed.
  const readyAgain = await dev.patch<Requirement>(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });
  expect(readyAgain.devStatus).toBe("ready_for_qa");

  // QA retests and passes.
  const file = await createExecutionFile(qa, world, { requirementId: req.id });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{
      caseId: "PW-E2E-003-1", caseName: "Retest after return", scenario: "E2E",
      result: "Passed", qaPic: world.actors.qa.name, rowOrder: 0, requirementId: req.id,
    }],
  });
  const saved = await qa.get<{ testCases: { result: string | null }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  expect(saved.testCases[0].result).toBe("Passed");
});

qcase("E2E-004", "Return-to-FA revision loop (CR053)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const devLead = as(world.actors.devLead);
  const dev = as(world.actors.dev);

  // Approved requirement, already in development.
  const req = await approvedRequirement(world);
  await devLead.patch(`/requirements/${req.id}/dev`, { action: "assign", devAssigneeId: world.actors.dev.id });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "start" });

  // Dev returns it to FA — status back to rejected, dev handoff fully reset.
  const returned = await dev.patch<Requirement>(`/requirements/${req.id}/return-to-fa`, {
    reason: "Spec contradicts the approved data model",
  });
  expect(returned.reviewStatus).toBe("rejected");
  expect(returned.devStatus).toBeNull();
  expect(returned.devAssigneeId).toBeNull();

  // Author is told individually; the FA team fan-out reaches the FA Lead.
  await expectNotification(world, world.actors.fa, {
    entityId: req.id, entityType: "requirement", type: "requirement_returned_to_fa",
  });
  await expectNotification(world, world.actors.faLead, {
    entityId: req.id, entityType: "requirement", type: "requirement_returned_to_fa",
  });

  // FA revises + resubmits; FA2 re-approves (reuses the reject/re-review path).
  await fa.patch(`/requirements/${req.id}`, { description: "Aligned with the data model." });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  const reapproved = await faLead.patch<Requirement>(`/requirements/${req.id}/review`, { action: "approve" });
  expect(reapproved.reviewStatus).toBe("approved");

  // Lead re-triages (the old assignment was cleared on purpose); dev completes.
  await devLead.patch(`/requirements/${req.id}/dev`, { action: "assign", devAssigneeId: world.actors.dev.id });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "start" });
  const done = await dev.patch<Requirement>(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });
  expect(done.devStatus).toBe("ready_for_qa");
});

// ── Defects ───────────────────────────────────────────────────────────────────

qcase("E2E-005", "Defect find-fix-reopen-close", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const qaLead = as(world.actors.qaLead);
  const dev = as(world.actors.dev);

  // Status moves ride the synced Redmine status registry — resolve the three
  // lifecycle stops up front and skip cleanly when this environment lacks them.
  const statuses = await qa.get<DefectStatus[]>("/defects/statuses");
  const fixedLike = statuses.find((s) => /fixed|resolved/i.test(s.name));
  // A "Reopened" status is ideal; otherwise fixed→active-dev counts as a
  // reopen too (CR050's RESOLVED→ACTIVE detection).
  const reopenLike =
    statuses.find((s) => /reopen/i.test(s.name)) ??
    statuses.find((s) => /in.?progress|assigned/i.test(s.name));
  const closedLike = statuses.find((s) => s.isClosed) ?? statuses.find((s) => /closed/i.test(s.name));
  test.skip(!fixedLike || !reopenLike || !closedLike,
    "Status registry lacks fixed/reopen/closed-like statuses in this environment");

  // QA runs an execution and one TC fails — qaPic is what resolves the
  // "executor" recipient for retest/status notifications.
  const file = await createExecutionFile(qa, world, { qaPic: world.actors.qa.name });
  const savedRows = await qa.post<SavedTestCases>(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{
      caseId: "PW-E2E-005-1", caseName: "Fails on first run", scenario: "E2E",
      result: "Failed", actualResult: "500 on submit", qaPic: world.actors.qa.name, rowOrder: 0,
    }],
  });
  const execRow = savedRows.testCases[0];

  // QA registers the defect against the failed row.
  const defect = await qa.post<{ id: number; redmineId: number | null }>("/defects", {
    title: uniq("PW E2E-005 defect"),
    description: "Raised from a failed execution row by the e2e suite.",
    severity: "major",
    projectId: world.project.id,
    source: "qa",
    executionTcId: execRow.id,
  });
  // A live Redmine write-through means every status change below would mutate
  // the real tracker — same guard as SMOKE-020.
  test.skip(!!defect.redmineId, "Defect synced write-through to live Redmine — lifecycle would mutate the real tracker");

  // Lead assigns the dev → dev notified.
  await qaLead.patch(`/defects/${defect.id}/assign`, { assigneeId: world.actors.dev.id });
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id, entityType: "defect", type: "defect_assigned",
  });

  // Dev fixes → QA (reporter/executor) hears the status change, and because
  // the linked row is still Failed, gets an explicit retest-needed nudge.
  await dev.patch(`/defects/${defect.id}/status`, { statusRedmineId: fixedLike!.redmineId });
  await expectNotification(world, world.actors.qa, {
    entityId: defect.id, entityType: "defect", type: "defect_status_changed",
  });
  await expectNotification(world, world.actors.qa, {
    entityId: defect.id, entityType: "defect", type: "retest_needed",
  });

  // QA retests, still fails → reopen. The assigned dev gets the loud one (CR050).
  await qa.patch(`/defects/${defect.id}/status`, { statusRedmineId: reopenLike!.redmineId });
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id, entityType: "defect", type: "defect_reopened",
  });

  // Dev fixes again; QA retest passes this time — flip the row, then close.
  await dev.patch(`/defects/${defect.id}/status`, { statusRedmineId: fixedLike!.redmineId });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{
      id: execRow.id, testCaseId: execRow.testCaseId,
      caseId: "PW-E2E-005-1", caseName: "Fails on first run", scenario: "E2E",
      result: "Passed", qaPic: world.actors.qa.name, rowOrder: 0,
    }],
  });
  await qa.patch(`/defects/${defect.id}/status`, { statusRedmineId: closedLike!.redmineId });

  // Lifecycle reflected on the Defects page: closed status, no retest flag.
  const all = await qa.get<{ id: number; status: string; retestNeeded: boolean }[]>("/defects");
  const row = all.find((d) => d.id === defect.id);
  expect(row).toBeTruthy();
  expect(row!.status).toBe(closedLike!.name);
  expect(row!.retestNeeded).toBe(false);
});

// ── Requirements ──────────────────────────────────────────────────────────────

qcase("E2E-006", "Requirement defect via author (CR031)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const dev = as(world.actors.dev);

  const req = await approvedRequirement(world);

  // Dev raises a requirement defect → auto-routes to the FA author.
  const defect = await dev.post<{ id: number; assigneeId: number | null }>("/defects", {
    source: "requirement",
    requirementId: req.id,
    title: uniq("PW E2E-006 requirement defect"),
    description: "AC misses the bulk-import path.",
    severity: "major",
  });
  expect(defect.assigneeId).toBe(world.actors.fa.id);
  await expectNotification(world, world.actors.fa, {
    entityId: defect.id, entityType: "defect", type: "defect_opened",
  });

  // Author fixes the requirement and resubmits via the existing review flow.
  await fa.patch(`/requirements/${req.id}`, { description: "Bulk-import path covered." });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  const reapproved = await faLead.patch<Requirement>(`/requirements/${req.id}/review`, { action: "approve" });
  expect(reapproved.reviewStatus).toBe("approved");

  // Author hands the defect back to Dev — CR031 self-handoff, no Lead gate.
  const handedOff = await fa.patch<{ assigneeId: number | null }>(`/defects/${defect.id}/assign`, {
    assigneeId: world.actors.dev.id,
  });
  expect(handedOff.assigneeId).toBe(world.actors.dev.id);
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id, entityType: "defect", type: "defect_assigned",
  });

  // The requirement stays trackable throughout.
  const after = await fa.get<Requirement>(`/requirements/${req.id}`);
  expect(after.reviewStatus).toBe("approved");
});

// ── Access ────────────────────────────────────────────────────────────────────

qcase("E2E-007", "Multi-module staffing (CR044)", async ({ world, as, admin }) => {
  const fa = as(world.actors.fa);
  const qaLead = as(world.actors.qaLead);

  // A third module ("C") the member is deliberately NOT granted.
  const gamma = await admin.post<{ id: number; name: string }>("/modules", { name: uniq("PW-Gamma") });
  await admin.post(`/projects/${world.project.id}/modules`, { moduleId: gamma.id });

  // HOD (admin here) provisions the member and staffs them on A + B only.
  const email = `${uniq("pw.e2e007").toLowerCase()}@qapulse.test`;
  const memberUser = await admin.post<{ id: number }>("/users", {
    name: uniq("PW E2E-007 Member"), email, password: ACTOR_PASSWORD, role: "qa_member",
  });
  // POST /users forces mustChangePassword — clear it the same way global-setup does.
  await admin.patch(`/users/${memberUser.id}`, { password: ACTOR_PASSWORD, mustChangePassword: false });
  await admin.post(`/projects/${world.project.id}/members`, {
    userId: memberUser.id,
    moduleIds: [world.modules.alpha.id, world.modules.beta.id],
  });

  // Records in all three modules, created by unrestricted actors.
  const inAlpha = await createRequirement(fa, world, { module: world.modules.alpha.name });
  const inBeta = await createRequirement(fa, world, { module: world.modules.beta.name });
  const inGamma = await approvedRequirement(world, { module: gamma.name });
  const alphaDefect = await qaLead.post<{ id: number }>("/defects", {
    title: uniq("PW E2E-007 alpha defect"), severity: "minor",
    projectId: world.project.id, source: "qa", module: world.modules.alpha.name,
  });
  const gammaDefect = await qaLead.post<{ id: number }>("/defects", {
    title: uniq("PW E2E-007 gamma defect"), severity: "minor",
    projectId: world.project.id, source: "qa", module: gamma.name,
  });

  // Member logs in for real (fresh token, real /auth/login).
  const session = await new Api(world.baseUrl).login(email, ACTOR_PASSWORD);
  const member = new Api(world.baseUrl, session.token);

  // Requirements: A and B visible, C filtered out by module scope.
  const reqIds = (await member.get<{ id: number }[]>("/requirements")).map((r) => r.id);
  expect(reqIds).toContain(inAlpha.id);
  expect(reqIds).toContain(inBeta.id);
  expect(reqIds).not.toContain(inGamma.id);

  // Defects: same scoping (module-name match, CR035).
  const defectIds = (await member.get<{ id: number }[]>("/defects")).map((d) => d.id);
  expect(defectIds).toContain(alphaDefect.id);
  expect(defectIds).not.toContain(gammaDefect.id);

  // A module-C mutation is denied outright (canAccessModule gate, CR047).
  const res = await member.raw("PATCH", `/requirements/${inGamma.id}/return-to-fa`, {
    reason: "should be blocked",
  });
  expect(res.status).toBe(403);
});

// ── Notifications ─────────────────────────────────────────────────────────────

qcase("E2E-008", "Milestone-to-QA fan-out (CR045)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const devLead = as(world.actors.devLead);
  const dev = as(world.actors.dev);
  const pm = as(world.actors.pm);

  // PM creates a milestone → FA team (lead + member) told to start writing
  // requirements. HOD exclusion is per the notification matrix but can't be
  // asserted here — the world has no HOD actors.
  const milestone = await pm.post<Milestone>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW E2E-008 milestone"),
  });
  await expectNotification(world, world.actors.fa, {
    entityId: milestone.id, entityType: "milestone", type: "milestone_created",
  });
  await expectNotification(world, world.actors.faLead, {
    entityId: milestone.id, entityType: "milestone", type: "milestone_created",
  });

  // FA writes + submits against the milestone → FA reviewers pinged.
  const req = await createRequirement(fa, world, { milestoneId: milestone.id });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await expectNotification(world, world.actors.faLead, {
    entityId: req.id, entityType: "requirement", type: "review_request",
  });

  // Approve → author + Dev Lead (module-scoped role fan-out).
  await faLead.patch(`/requirements/${req.id}/review`, { action: "approve" });
  await expectNotification(world, world.actors.fa, {
    entityId: req.id, entityType: "requirement", type: "review_approved",
  });
  await expectNotification(world, world.actors.devLead, {
    entityId: req.id, entityType: "requirement", type: "review_approved",
  });

  // Assign → the dev; Ready for QA → the QA Lead.
  await devLead.patch(`/requirements/${req.id}/dev`, { action: "assign", devAssigneeId: world.actors.dev.id });
  await expectNotification(world, world.actors.dev, {
    entityId: req.id, entityType: "requirement", type: "requirement_dev_assigned",
  });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "start" });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });
  await expectNotification(world, world.actors.qaLead, {
    entityId: req.id, entityType: "requirement", type: "requirement_ready_for_qa",
  });
});

// ── Traceability ──────────────────────────────────────────────────────────────

qcase("E2E-009", "Coverage end-to-end", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const qa = as(world.actors.qa);
  const qaLead = as(world.actors.qaLead);

  const req = await createRequirement(fa, world);

  // One library TC linked to the requirement …
  const libTc = await qa.post<{ id: number }>("/test-cases", {
    title: uniq("PW E2E-009 lib TC"), requirementId: req.id, projectId: world.project.id,
  });

  // … compiled into an execution file alongside two ad-hoc rows, run with
  // mixed results: the lib-linked row Passed, one Failed, one never run.
  const file = await createExecutionFile(qa, world, { requirementId: req.id });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      {
        caseId: "PW-E2E-009-1", caseName: "Compiled from library", scenario: "E2E",
        result: "Passed", qaPic: world.actors.qa.name, rowOrder: 0,
        libraryTcId: libTc.id, requirementId: req.id,
      },
      {
        caseId: "PW-E2E-009-2", caseName: "Ad-hoc failing case", scenario: "E2E",
        result: "Failed", actualResult: "Broken", qaPic: world.actors.qa.name, rowOrder: 1,
        requirementId: req.id,
      },
      {
        caseId: "PW-E2E-009-3", caseName: "Not yet executed", scenario: "E2E",
        qaPic: world.actors.qa.name, rowOrder: 2, requirementId: req.id,
      },
    ],
  });

  // Matrix rolls up: lib TC and its execution row collapse onto one identity
  // (CR016 dedupe), so 3 distinct TCs — 1 passed, 1 failed, 1 not run.
  interface TraceNode {
    reqId: number; tcCount: number; passed: number; failed: number;
    blocked: number; notRun: number; overallStatus: string; children: TraceNode[];
  }
  const matrix = await qaLead.get<TraceNode[]>("/traceability");
  const node = matrix.find((n) => n.reqId === req.id);
  expect(node).toBeTruthy();
  expect(node!.tcCount).toBe(3);
  expect(node!.passed).toBe(1);
  expect(node!.failed).toBe(1);
  expect(node!.notRun).toBe(1);
  expect(node!.overallStatus).toBe("failing");
});

// ── UAT ───────────────────────────────────────────────────────────────────────

qcase("E2E-010", "UAT milestone acceptance", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const pm = as(world.actors.pm);

  // uat_milestone_ready targets milestone.createdBy — so the PM creates it.
  const milestone = await pm.post<Milestone>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW E2E-010 UAT milestone"),
  });
  expect(milestone.createdBy).toBe(world.actors.pm.id);

  const file = await createExecutionFile(qa, world, {
    fileType: "uat", milestoneId: milestone.id, qaPic: world.actors.qa.name,
  });

  // Execute UAT to exactly the 80% threshold: 4 of 5 pass.
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: Array.from({ length: 5 }, (_, i) => ({
      caseId: `PW-E2E-010-${i + 1}`,
      caseName: `UAT case ${i + 1}`,
      scenario: "UAT",
      result: i < 4 ? "Passed" : "Failed",
      qaPic: world.actors.qa.name,
      rowOrder: i,
    })),
  });

  // The threshold-crossing save fires the (deduped-per-milestone) PM signal.
  await expectNotification(world, world.actors.pm, {
    entityId: milestone.id, entityType: "milestone", type: "uat_milestone_ready",
  });

  // Verdict send (step 4) is a real SMTP dispatch via /pmo/send-verdict —
  // mailbox delivery is verified manually, not from this suite.
});

// ── PM Dashboard ──────────────────────────────────────────────────────────────

qcase("E2E-011", "Multi-cycle timeline (CR032)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const devLead = as(world.actors.devLead);
  const dev = as(world.actors.dev);
  const qa = as(world.actors.qa);
  const pm = as(world.actors.pm);

  const milestone = await pm.post<Milestone>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW E2E-011 milestone"),
  });

  // Cycle 1: approve → develop → ready.
  const req = await createRequirement(fa, world, { milestoneId: milestone.id });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await faLead.patch(`/requirements/${req.id}/review`, { action: "approve" });
  await devLead.patch(`/requirements/${req.id}/dev`, { action: "assign", devAssigneeId: world.actors.dev.id });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "start" });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });

  // A QA run inside the first testing window, so a qa segment materializes
  // (segments only exist where execution timestamps land).
  const file = await createExecutionFile(qa, world, { requirementId: req.id });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{
      caseId: "PW-E2E-011-1", caseName: "First QA round", scenario: "E2E",
      result: "Failed", actualResult: "Not done", qaPic: world.actors.qa.name,
      rowOrder: 0, requirementId: req.id,
    }],
  });

  // Bounce 1 — Return to Dev (CR046): Develop resumes within the SAME cycle.
  await qa.patch(`/requirements/${req.id}/dev`, { action: "return_to_dev", reason: "Incomplete" });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });

  // Bounce 2 — Return to FA (CR053): a NEW Requirements cycle begins.
  await qa.patch(`/requirements/${req.id}/return-to-fa`, { reason: "Spec gap found in testing" });
  await fa.patch(`/requirements/${req.id}`, { description: "Spec gap closed." });
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await faLead.patch(`/requirements/${req.id}/review`, { action: "approve" });

  // The phase timeline shows repeating cycles, not one flat window:
  // two Requirements rounds (cycle 2 opened by the return-to-FA), two Develop
  // stints (the return-to-dev resume), and the QA round in between.
  const breakdown = await pm.get<PhaseBreakdown>(
    `/dashboard/milestone-phase-breakdown?milestoneId=${milestone.id}`,
  );
  const entry = breakdown.requirements.find((r) => r.id === req.id);
  expect(entry).toBeTruthy();
  const timeline = entry!.timeline;
  expect(Math.max(...timeline.map((s) => s.cycle))).toBeGreaterThanOrEqual(2);
  expect(timeline.filter((s) => s.key === "requirements").length).toBeGreaterThanOrEqual(2);
  expect(timeline.filter((s) => s.key === "develop").length).toBeGreaterThanOrEqual(2);
  expect(timeline.some((s) => s.key === "qa" && s.cycle === 1)).toBe(true);
});

// ── Integration ───────────────────────────────────────────────────────────────

qcase.manual(
  "E2E-012",
  "Redmine round-trip",
  "needs a live Redmine instance — import, defect push (dedupe on retry), status write-through and sync all mutate/read the real tracker",
);
