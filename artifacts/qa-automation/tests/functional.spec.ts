/**
 * Functional suite — docs/test-plans/qapulse-functional-tests.xlsx (FUNC-001 … FUNC-049).
 * Core-workflow coverage: API-first (the same calls the UI makes), with browser
 * checks only where the case is genuinely about the UI. AI-judged, live-Redmine,
 * and real-mailbox cases are declared manual so the run report still accounts
 * for them.
 */
import { Api } from "../src/api";
import {
  test, expect, qcase, uniq, ACTOR_PASSWORD,
  createRequirement, approvedRequirement, readyForQaRequirement,
  createExecutionFile, expectNotification,
  type Actor,
} from "../src/qtest";

// ── Authentication ────────────────────────────────────────────────────────────

qcase("FUNC-001", "Remember-me persists session", async ({ page, world }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(world.actors.qa.email);
  await page.getByLabel("Password", { exact: true }).fill(ACTOR_PASSWORD);
  await page.getByLabel("Remember me").check();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  // Remember-me lands the session in localStorage (AuthContext storage keys)
  expect(await page.evaluate(() => localStorage.getItem("qa_pulse_remember_me"))).toBe("true");
  expect(await page.evaluate(() => localStorage.getItem("qa_pulse_token"))).toBeTruthy();
  // "Close and reopen the browser" — a cold navigation restores from storage
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
});

qcase("FUNC-002", "First-login forced password change", async ({ world, admin }) => {
  const email = `${uniq("pw.firstlogin")}@qapulse.test`;
  const created = await admin.post<{ id: number }>("/users", {
    name: "PW First Login",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  // Temp-password login succeeds but carries the flag the Login page uses to
  // hold the user in the change-password overlay before reaching the app.
  const client = new Api(world.baseUrl);
  const first = await client.login(email, ACTOR_PASSWORD);
  expect(first.user.mustChangePassword).toBe(true);

  const newPassword = `${ACTOR_PASSWORD}x`;
  await client.post("/auth/change-password", { userId: created.id, newPassword });
  const second = await new Api(world.baseUrl).login(email, newPassword);
  expect(second.user.mustChangePassword ?? false).toBe(false);
});

qcase("FUNC-003", "Logout clears session", async ({ world }) => {
  // A fresh session, so blacklisting doesn't kill the shared world token
  const session = new Api(world.baseUrl);
  const { refreshToken } = await session.login(world.actors.qa.email, ACTOR_PASSWORD);
  await session.post("/auth/logout", { refreshToken });
  // CR007 — the token is blacklisted server-side; back-nav can't restore it
  const res = await session.raw("GET", "/auth/me");
  expect(res.status).toBe(401);
});

// ── Requirements ──────────────────────────────────────────────────────────────

qcase("FUNC-004", "Create requirement with all fields", async ({ world, as }) => {
  const milestone = await as(world.actors.pm).post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW func4 milestone"),
  });
  const ac = ["User can log in", "Session persists across reloads"];
  const created = await createRequirement(as(world.actors.fa), world, {
    description: "Full-field requirement from the functional suite.",
    priority: "high",
    assigneeId: world.actors.fa.id,
    milestoneId: milestone.id,
    acceptanceCriteria: JSON.stringify(ac),
  });
  const fetched = await as(world.actors.fa).get<Record<string, unknown>>(
    `/requirements/${created.id}`,
  );
  expect(fetched.title).toBe(created.title);
  expect(fetched.priority).toBe("high");
  expect(fetched.module).toBe(world.modules.alpha.name);
  expect(fetched.milestoneId).toBe(milestone.id);
  expect(fetched.acceptanceCriteria).toEqual(ac);
  expect(fetched.reviewStatus).toBe("draft");
  const list = await as(world.actors.fa).get<{ id: number }[]>("/requirements");
  expect(list.map((r) => r.id)).toContain(created.id);
});

qcase("FUNC-005", "Nested child requirement (CR016)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const parent = await createRequirement(fa, world);
  const child = await createRequirement(fa, world, { parentId: parent.id });
  // A TC on the child must roll up into the parent's coverage (CR016)
  await as(world.actors.qa).post("/test-cases", {
    title: uniq("PW child TC"),
    projectId: world.project.id,
    requirementId: child.id,
  });
  interface Node { reqId: number; tcCount: number; children: Node[] }
  const roots = await as(world.actors.qaLead).get<Node[]>(
    `/traceability?projectId=${world.project.id}`,
  );
  const flatten = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
  const parentNode = flatten(roots).find((n) => n.reqId === parent.id);
  expect(parentNode, `parent #${parent.id} missing from traceability`).toBeTruthy();
  expect(parentNode!.children.map((c) => c.reqId)).toContain(child.id);
  expect(parentNode!.tcCount).toBeGreaterThanOrEqual(1); // rolled up from the child
});

qcase("FUNC-006", "Acceptance criteria editor (CR022)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world, {
    acceptanceCriteria: JSON.stringify(["AC one", "AC two", "AC three"]),
  });
  // Add + edit + remove in one save — the editor persists the whole list
  const edited = ["AC one (edited)", "AC three", "AC four"];
  await fa.patch(`/requirements/${req.id}`, { acceptanceCriteria: JSON.stringify(edited) });
  const fetched = await fa.get<{ acceptanceCriteria: string[] }>(`/requirements/${req.id}`);
  expect(fetched.acceptanceCriteria).toEqual(edited);
});

qcase("FUNC-007", "Discussion thread (CR022)", async ({ world, as }) => {
  const req = await createRequirement(as(world.actors.fa), world);
  const body = uniq("PW comment");
  await as(world.actors.qa).post(`/requirements/${req.id}/comments`, { body });
  const thread = await as(world.actors.fa).get<
    { body: string; authorName: string; createdAt: string }[]
  >(`/requirements/${req.id}/comments`);
  const posted = thread.find((c) => c.body === body);
  expect(posted).toBeTruthy();
  expect(posted!.authorName).toBe(world.actors.qa.name);
  expect(posted!.createdAt).toBeTruthy();
});

qcase("FUNC-008", "Submit → approve → shows approved", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  const submitted = await fa.patch<{ reviewStatus: string }>(
    `/requirements/${req.id}/review`,
    { action: "submit" },
  );
  expect(submitted.reviewStatus).toBe("in_review");
  const approved = await as(world.actors.faLead).patch<{ reviewStatus: string }>(
    `/requirements/${req.id}/review`,
    { action: "approve" },
  );
  expect(approved.reviewStatus).toBe("approved");
  // History timeline logs each transition
  const history = await fa.get<{ type: string }[]>(`/requirements/${req.id}/history`);
  const types = history.map((h) => h.type);
  expect(types).toContain("requirement_submit");
  expect(types).toContain("requirement_approve");
});

qcase("FUNC-009", "Re-review after edit (CR023)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const faLead = as(world.actors.faLead);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await faLead.patch(`/requirements/${req.id}/review`, {
    action: "reject",
    comment: "Functional test — needs more detail",
  });
  // Author revises, then resubmits — the re-review loop
  await fa.patch(`/requirements/${req.id}`, { title: uniq("PW revised req") });
  const resubmitted = await fa.patch<{ reviewStatus: string }>(
    `/requirements/${req.id}/review`,
    { action: "submit" },
  );
  expect(resubmitted.reviewStatus).toBe("in_review");
  const approved = await faLead.patch<{ reviewStatus: string }>(
    `/requirements/${req.id}/review`,
    { action: "approve" },
  );
  expect(approved.reviewStatus).toBe("approved");
});

qcase.manual(
  "FUNC-010",
  "Requirement Q&A chat auto-match (CR039)",
  "needs live AI provider; requirement auto-match quality is human-judged",
);

qcase("FUNC-011", "Filter by milestone / status / module", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const milestone = await as(world.actors.pm).post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW filter milestone"),
  });
  const inAlpha = await createRequirement(fa, world, {
    module: world.modules.alpha.name,
    milestoneId: milestone.id,
  });
  const inBeta = await createRequirement(fa, world, { module: world.modules.beta.name });

  // Module (like status/priority) narrows server-side …
  const alphaOnly = await fa.get<{ id: number }[]>(
    `/requirements?projectId=${world.project.id}&module=${encodeURIComponent(world.modules.alpha.name)}`,
  );
  const alphaIds = alphaOnly.map((r) => r.id);
  expect(alphaIds).toContain(inAlpha.id);
  expect(alphaIds).not.toContain(inBeta.id);

  // … while the page's milestone filter narrows client-side over fields every
  // list row carries (Requirements.tsx passesBaseFilters) — assert the contract.
  const all = await fa.get<{ id: number; milestoneId: number | null; status: string }[]>(
    `/requirements?projectId=${world.project.id}`,
  );
  const row = all.find((r) => r.id === inAlpha.id);
  expect(row!.milestoneId).toBe(milestone.id);
  expect(typeof row!.status).toBe("string");
  // Milestone + module combination: only the alpha requirement is in this milestone
  expect(all.filter((r) => r.milestoneId === milestone.id).map((r) => r.id)).toEqual([inAlpha.id]);
});

qcase.manual(
  "FUNC-012",
  "Redmine import with tracker filter (CR004)",
  "needs a live Redmine instance to import from",
);

// ── Dev handoff ───────────────────────────────────────────────────────────────

qcase("FUNC-013", "Dev queue: unassigned + my work (CR030)", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  const devLead = as(world.actors.devLead);
  interface Queue {
    unassigned: { id: number }[];
    myDevWork: { id: number; devStatus: string | null }[];
  }
  const before = await devLead.get<Queue>("/requirements/dev-queue");
  expect(before.unassigned.map((r) => r.id)).toContain(req.id);

  await devLead.patch(`/requirements/${req.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });

  const after = await devLead.get<Queue>("/requirements/dev-queue");
  expect(after.unassigned.map((r) => r.id)).not.toContain(req.id);
  const mine = await as(world.actors.dev).get<Queue>("/requirements/dev-queue");
  const work = mine.myDevWork.find((r) => r.id === req.id);
  expect(work).toBeTruthy();
  expect(work!.devStatus).toBe("assigned");
});

qcase("FUNC-014", "Assign / start / ready transitions notify", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  const assigned = await as(world.actors.devLead).patch<{ devStatus: string }>(
    `/requirements/${req.id}/dev`,
    { action: "assign", devAssigneeId: world.actors.dev.id },
  );
  expect(assigned.devStatus).toBe("assigned");
  await expectNotification(world, world.actors.dev, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_dev_assigned",
  });

  const dev = as(world.actors.dev);
  const started = await dev.patch<{ devStatus: string }>(`/requirements/${req.id}/dev`, {
    action: "start",
  });
  expect(started.devStatus).toBe("in_progress");

  const ready = await dev.patch<{ devStatus: string }>(`/requirements/${req.id}/dev`, {
    action: "ready_for_qa",
  });
  expect(ready.devStatus).toBe("ready_for_qa");
  await expectNotification(world, world.actors.qaLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_ready_for_qa",
  });
});

qcase("FUNC-015", "Return to Dev resumes development (CR046)", async ({ world, as }) => {
  const req = await readyForQaRequirement(world);
  const returned = await as(world.actors.qaLead).patch<{ devStatus: string }>(
    `/requirements/${req.id}/dev`,
    { action: "return_to_dev", reason: "Functional test — QA found gaps" },
  );
  // return_to_dev un-terminals ready_for_qa: same assignee, back in progress
  expect(returned.devStatus).toBe("in_progress");
  await expectNotification(world, world.actors.dev, {
    entityId: req.id,
    entityType: "requirement",
    type: "returned_to_dev",
  });
  await expectNotification(world, world.actors.devLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "returned_to_dev",
  });
});

qcase("FUNC-016", "Return to FA resets dev handoff (CR053)", async ({ world, as }) => {
  const req = await readyForQaRequirement(world);
  const returned = await as(world.actors.qa).patch<{
    reviewStatus: string;
    devStatus: string | null;
    devAssigneeId: number | null;
  }>(`/requirements/${req.id}/return-to-fa`, {
    reason: "Functional test — requirement is wrong",
  });
  // Reuses the rejected state so the existing re-review flow applies, and the
  // dev handoff is fully reset so it can't be worked until re-approved.
  expect(returned.reviewStatus).toBe("rejected");
  expect(returned.devStatus).toBeNull();
  expect(returned.devAssigneeId).toBeNull();
  await expectNotification(world, world.actors.fa, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_returned_to_fa",
  });
});

// ── Test cases ────────────────────────────────────────────────────────────────

qcase("FUNC-017", "Create library test case", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const title = uniq("PW library TC");
  const tc = await qa.post<{ id: number }>("/test-cases", {
    title,
    objective: "Verify the functional-suite TC round-trips",
    preconditions: "QAPulse test world bootstrapped",
    testSteps: "1. Create TC\n2. Search for it",
    expectedResult: "TC saved to library and searchable",
    tags: "functional,playwright",
    priority: "high",
    type: "manual",
    projectId: world.project.id,
    module: world.modules.alpha.name,
  });
  expect(tc.id).toBeGreaterThan(0);
  const found = await qa.get<{ id: number }[]>(
    `/test-cases?search=${encodeURIComponent(title)}`,
  );
  expect(found.map((t) => t.id)).toContain(tc.id);
});

qcase.manual(
  "FUNC-018",
  "Natural-language search (CR006)",
  "needs live AI provider; search relevance is human-judged",
);

qcase.manual(
  "FUNC-019",
  "AI TC generation from requirement (CR015)",
  "needs live AI provider; generated TC quality is human-judged",
);

qcase("FUNC-020", "Compile TCs to execution file (CR003)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const tc = await qa.post<{
    id: number;
    title: string;
    testSteps: string | null;
    expectedResult: string | null;
  }>("/test-cases", {
    title: uniq("PW compile TC"),
    testSteps: "1. Do the thing",
    expectedResult: "The thing happens",
    scenario: "Compile",
    projectId: world.project.id,
    module: world.modules.alpha.name,
  });
  const file = await createExecutionFile(qa, world);
  // Same payload the TC Library's Compile dialog builds (TestCases.tsx)
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      {
        moduleName: world.modules.alpha.name,
        caseId: `PW-C-${tc.id}`,
        caseName: tc.title,
        scenario: "Compile",
        testSteps: tc.testSteps ?? "",
        expectedResult: tc.expectedResult ?? "",
        libraryTcId: tc.id,
        result: "Not Executed",
        rowOrder: 0,
      },
    ],
  });
  const saved = await qa.get<{
    testCases: {
      caseName: string | null;
      testSteps: string | null;
      expectedResult: string | null;
      libraryTcId: number | null;
      result: string | null;
    }[];
  }>(`/execution-files/${file.redmineTicketId}/test-cases`);
  const row = saved.testCases.find((r) => r.caseName === tc.title);
  expect(row, "compiled row pre-populated from TC metadata").toBeTruthy();
  expect(row!.testSteps).toBe(tc.testSteps);
  expect(row!.expectedResult).toBe(tc.expectedResult);
  expect(row!.libraryTcId).toBe(tc.id);
  expect(row!.result).toBe("Not Executed");
});

// ── Execution ─────────────────────────────────────────────────────────────────

qcase("FUNC-021", "Create execution file (QA + UAT) (CR022)", async ({ world, as }) => {
  const qaLead = as(world.actors.qaLead);
  const milestone = await as(world.actors.pm).post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW exec milestone"),
  });
  const qaFile = await createExecutionFile(qaLead, world, {
    fileType: "qa",
    milestoneId: milestone.id,
  });
  const uatFile = await createExecutionFile(qaLead, world, {
    fileType: "uat",
    milestoneId: milestone.id,
  });
  expect(qaFile.fileType).toBe("qa");
  expect(uatFile.fileType).toBe("uat");
  expect(qaFile.milestoneId).toBe(milestone.id);
  expect(uatFile.milestoneId).toBe(milestone.id);
});

qcase("FUNC-022", "Execute vs Edit mode (CR008)", async ({ world, as, page, loginAs }) => {
  const qa = as(world.actors.qa);
  const file = await createExecutionFile(qa, world);
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{ caseId: "PW-F022", caseName: uniq("PW mode row"), result: "Not Executed", rowOrder: 0 }],
  });
  await loginAs(world.actors.qa);
  await page.goto(`/test-cases/execution/${file.redmineTicketId}`);
  // Opens in Execute mode: run-time utilities, no structural editing
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Row" })).toHaveCount(0);
  // Edit mode: structural changes + the "editing the execution copy" warning
  await page.getByRole("button", { name: "Edit test cases" }).click();
  await expect(page.getByRole("button", { name: "Add Row" })).toBeVisible();
  await expect(page.getByText("You're editing the execution copy")).toBeVisible();
  await page.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add Row" })).toHaveCount(0);
});

qcase("FUNC-023", "Record pass / fail / blocked", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const file = await createExecutionFile(qa, world);
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      { caseId: "PW-F023-1", caseName: "passes", result: "Passed", rowOrder: 0 },
      { caseId: "PW-F023-2", caseName: "fails", result: "Failed", actualResult: "deliberate", rowOrder: 1 },
      { caseId: "PW-F023-3", caseName: "blocked", result: "Blocked", rowOrder: 2 },
    ],
  });
  const saved = await qa.get<{ testCases: { caseId: string | null; result: string | null }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  const byCase = new Map(saved.testCases.map((r) => [r.caseId, r.result]));
  expect(byCase.get("PW-F023-1")).toBe("Passed");
  expect(byCase.get("PW-F023-2")).toBe("Failed");
  expect(byCase.get("PW-F023-3")).toBe("Blocked");
});

qcase("FUNC-024", "Views: Tree / Spreadsheet / Focus", async ({ world, as, page, loginAs }) => {
  const qa = as(world.actors.qa);
  const caseName = uniq("PW view row");
  const file = await createExecutionFile(qa, world);
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      {
        caseId: "PW-F024",
        caseName,
        moduleName: world.modules.alpha.name,
        result: "Not Executed",
        rowOrder: 0,
      },
    ],
  });
  await loginAs(world.actors.qa);
  // The layout is a per-user preference read from localStorage on page open
  for (const layout of ["tree", "spreadsheet", "focus"] as const) {
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [`qa_pulse_exec_view_${world.actors.qa.id}`, layout] as const,
    );
    await page.goto(`/test-cases/execution/${file.redmineTicketId}`);
    await expect(page.getByText(caseName).first(), `row visible in ${layout} view`).toBeVisible();
  }
});

qcase("FUNC-025", "Download auto-filled Excel (CR002)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const file = await createExecutionFile(qa, world);
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{ caseId: "PW-F025", caseName: "executed row", result: "Passed", rowOrder: 0 }],
  });
  // Sheet contents (Review Log / Effort / Pareto / CAPA) are inspected in the
  // workbook by hand — here we pin the deterministic part: a real spreadsheet.
  const res = await qa.raw("GET", `/execution-files/${file.redmineTicketId}/download-excel`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("spreadsheetml");
});

// ── Verdict ───────────────────────────────────────────────────────────────────

qcase.manual(
  "FUNC-026",
  "Send verdict email with attachment (CR001)",
  "verdict email + Excel attachment must be received and inspected in a real mailbox",
);

// ── Defects ───────────────────────────────────────────────────────────────────

qcase.manual(
  "FUNC-027",
  "Create defect (write-through Redmine)",
  "write-through issue creation needs a live Redmine instance",
);

qcase("FUNC-028", "Assign defect to dev (CR030)", async ({ world, as }) => {
  const qaLead = as(world.actors.qaLead);
  const defect = await qaLead.post<{ id: number }>("/defects", {
    title: uniq("PW assignable defect"),
    severity: "major",
    projectId: world.project.id,
    source: "qa",
  });
  const updated = await qaLead.patch<{ assigneeId: number | null }>(
    `/defects/${defect.id}/assign`,
    { assigneeId: world.actors.dev.id },
  );
  expect(updated.assigneeId).toBe(world.actors.dev.id);
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id,
    entityType: "defect",
    type: "defect_assigned",
  });
});

qcase("FUNC-029", "Status change / retest / reopen (CR050)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const qaLead = as(world.actors.qaLead);
  // Status edits ride the synced Redmine status registry — skip cleanly when
  // this environment has never synced statuses.
  const statuses = await qaLead.get<{ redmineId: number; name: string }[]>("/defects/statuses");
  const fixedLike = statuses.find((s) => /fixed|resolved/i.test(s.name));
  const reopenLike =
    statuses.find((s) => /reopen/i.test(s.name)) ??
    statuses.find((s) => /in.?progress|assigned/i.test(s.name));
  test.skip(
    !fixedLike || !reopenLike,
    "No 'Fixed'/'Reopened'-like statuses synced from Redmine in this environment",
  );

  const defect = await qa.post<{ id: number; redmineId: number | null }>("/defects", {
    title: uniq("PW reopen-cycle defect"),
    severity: "major",
    projectId: world.project.id,
    source: "qa",
  });
  test.skip(
    !!defect.redmineId,
    "Defect synced write-through to live Redmine — status moves would mutate the real tracker",
  );

  await qaLead.patch(`/defects/${defect.id}/assign`, { assigneeId: world.actors.dev.id });
  // → Fixed: the reporter (QA) hears the status move
  await qaLead.patch(`/defects/${defect.id}/status`, { statusRedmineId: fixedLike!.redmineId });
  await expectNotification(world, world.actors.qa, {
    entityId: defect.id,
    entityType: "defect",
    type: "defect_status_changed",
  });
  // Fixed → active again = a reopen (CR050 rule) — the assigned dev gets the
  // louder defect_reopened ping
  await qaLead.patch(`/defects/${defect.id}/status`, { statusRedmineId: reopenLike!.redmineId });
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id,
    entityType: "defect",
    type: "defect_reopened",
  });
});

qcase("FUNC-030", "QA / Production / Requirement tabs filter by source (CR019/031)", async ({ world, as }) => {
  const qaLead = as(world.actors.qaLead);
  const qaDefect = await qaLead.post<{ id: number }>("/defects", {
    title: uniq("PW qa-tab defect"),
    severity: "minor",
    projectId: world.project.id,
    source: "qa",
  });
  const req = await approvedRequirement(world);
  const reqDefect = await as(world.actors.qa).post<{ id: number }>("/defects", {
    source: "requirement",
    requirementId: req.id,
    title: uniq("PW req-tab defect"),
    severity: "minor",
  });
  // Defects.tsx passes the active tab straight through as ?source= — asserting
  // the query contract asserts the tab filtering.
  const qaTab = await qaLead.get<{ id: number }[]>(
    `/defects?projectId=${world.project.id}&source=qa`,
  );
  expect(qaTab.map((d) => d.id)).toContain(qaDefect.id);
  expect(qaTab.map((d) => d.id)).not.toContain(reqDefect.id);
  const reqTab = await qaLead.get<{ id: number }[]>(
    `/defects?projectId=${world.project.id}&source=requirement`,
  );
  expect(reqTab.map((d) => d.id)).toContain(reqDefect.id);
  expect(reqTab.map((d) => d.id)).not.toContain(qaDefect.id);
});

// ── Milestones ────────────────────────────────────────────────────────────────

qcase("FUNC-031", "Create milestone with phases + env", async ({ world, as }) => {
  const pm = as(world.actors.pm);
  const day = 24 * 60 * 60 * 1000;
  const start = Date.now();
  const m = await pm.post<Record<string, unknown>>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW phased milestone"),
    startDate: new Date(start).toISOString(),
    reqTargetDate: new Date(start + 7 * day).toISOString(),
    devTargetDate: new Date(start + 21 * day).toISOString(),
    qaTargetDate: new Date(start + 28 * day).toISOString(),
    uatTargetDate: new Date(start + 35 * day).toISOString(),
    goLiveDate: new Date(start + 40 * day).toISOString(),
    targetDate: new Date(start + 40 * day).toISOString(),
    environment: "ENV2",
  });
  expect(m.environment).toBe("ENV2");
  for (const key of [
    "startDate", "reqTargetDate", "devTargetDate", "qaTargetDate", "uatTargetDate", "goLiveDate",
  ]) {
    expect(m[key], `${key} persisted`).toBeTruthy();
  }
  const list = await pm.get<{ id: number }[]>(`/milestones?projectId=${world.project.id}`);
  expect(list.map((x) => x.id)).toContain(m.id as number);
});

qcase("FUNC-032", "Close milestone with lessons learned (CR033)", async ({ world, as }) => {
  const pm = as(world.actors.pm);
  const m = await pm.post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW closing milestone"),
  });
  const closed = await pm.patch<{
    status: string;
    completedAt: string | null;
    closedBy: number | null;
    lessonsLearned: string | null;
  }>(`/milestones/${m.id}`, {
    status: "completed",
    lessonsLearned: "Playwright suite: close early, close often.",
  });
  expect(closed.status).toBe("completed");
  expect(closed.completedAt).toBeTruthy();
  expect(closed.closedBy).toBe(world.actors.pm.id);
  expect(closed.lessonsLearned).toContain("close early");
});

// ── PM Dashboard ──────────────────────────────────────────────────────────────

qcase("FUNC-033", "Phase timeline plan vs actual (CR032)", async ({ world, as }) => {
  const pm = as(world.actors.pm);
  const day = 24 * 60 * 60 * 1000;
  const start = Date.now();
  const m = await pm.post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW timeline milestone"),
    startDate: new Date(start).toISOString(),
    reqTargetDate: new Date(start + 7 * day).toISOString(),
    devTargetDate: new Date(start + 21 * day).toISOString(),
    qaTargetDate: new Date(start + 28 * day).toISOString(),
    targetDate: new Date(start + 30 * day).toISOString(),
  });
  // Activity to plot: an approved requirement inside this milestone
  await approvedRequirement(world, { milestoneId: m.id });
  const body = await pm.get<{
    milestone: { id: number };
    plannedPhaseDays: unknown;
    phaseSummary: unknown;
    requirements: unknown[];
  }>(`/dashboard/milestone-phase-breakdown?milestoneId=${m.id}`);
  expect(body.milestone.id).toBe(m.id);
  expect(body.plannedPhaseDays, "Plan bars from the phase target dates").toBeTruthy();
  expect(body.phaseSummary, "Actual bars from activity-log events").toBeTruthy();
  expect(body.requirements.length).toBeGreaterThanOrEqual(1);
});

qcase("FUNC-034", "KPI cards (Burn Rate / SPI / First-Pass / Stability)", async ({ world, as }) => {
  const pm = as(world.actors.pm);
  const m = await pm.post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW kpi milestone"),
    targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await approvedRequirement(world, { milestoneId: m.id });
  const body = await pm.get<{ kpis: Record<string, unknown> | null }>(
    `/dashboard/milestone-phase-breakdown?milestoneId=${m.id}`,
  );
  // The four PM Dashboard cards render straight off this object
  expect(body.kpis).toBeTruthy();
  for (const key of ["timeElapsedPct", "workCompletedPct", "spi", "firstPassPct", "stabilityPct"]) {
    expect(body.kpis, `kpis.${key} present`).toHaveProperty(key);
  }
  expect(body.kpis!.firstPassPct).toBe(100); // one approval, zero rejections
});

qcase.manual(
  "FUNC-035",
  "AI milestone risk assessment (CR037)",
  "needs live AI provider; risk level and rationale are human-judged",
);

// ── Risk register ─────────────────────────────────────────────────────────────

qcase("FUNC-036", "Add / view risks (CR033/040)", async ({ world, as, page, loginAs }) => {
  const qaLead = as(world.actors.qaLead);
  const risk = await qaLead.post<{ id: number; probability: string; impact: string }>("/risks", {
    projectId: world.project.id,
    title: uniq("PW schedule risk"),
    probability: "high",
    impact: "medium",
    mitigationPlan: "Add regression buffer to the QA window",
  });
  expect(risk.probability).toBe("high");
  expect(risk.impact).toBe("medium");
  const list = await qaLead.get<{ id: number }[]>(`/risks?projectId=${world.project.id}`);
  expect(list.map((r) => r.id)).toContain(risk.id);
  // CR040 — the standalone page is reachable by qa_lead without PM Dashboard access
  await loginAs(world.actors.qaLead);
  await page.goto("/risk-register");
  await expect(page.getByRole("heading", { name: "Risk Register" })).toBeVisible();
});

// ── Access ────────────────────────────────────────────────────────────────────

qcase("FUNC-037", "Create user (manager+) (CR049)", async ({ world, admin }) => {
  const email = `${uniq("pw.newuser")}@qapulse.test`;
  const created = await admin.post<{ id: number }>("/users", {
    name: "PW Created User",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  expect(created.id).toBeGreaterThan(0);
  // Stored hashed (CR049) — proven by the round-trip login, which also
  // carries the temp-password flag
  const session = await new Api(world.baseUrl).login(email, ACTOR_PASSWORD);
  expect(session.user.id).toBe(created.id);
  expect(session.user.mustChangePassword).toBe(true);
});

qcase("FUNC-038", "Whole-project access sees all modules (CR044)", async ({ world, admin, as }) => {
  const email = `${uniq("pw.whole")}@qapulse.test`;
  const user = await admin.post<{ id: number }>("/users", {
    name: "PW Whole-Project",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  await admin.post(`/projects/${world.project.id}/members`, { userId: user.id, moduleIds: null });

  const fa = as(world.actors.fa);
  const inAlpha = await createRequirement(fa, world, { module: world.modules.alpha.name });
  const inBeta = await createRequirement(fa, world, { module: world.modules.beta.name });

  const member = new Api(world.baseUrl);
  await member.login(email, ACTOR_PASSWORD);
  const ids = (await member.get<{ id: number }[]>("/requirements")).map((r) => r.id);
  expect(ids).toContain(inAlpha.id);
  expect(ids).toContain(inBeta.id);
});

qcase("FUNC-039", "Multi-module scope sees only those modules (CR044)", async ({ world, admin, as }) => {
  // A third module on the project so "2 of 3" is a real restriction
  const gammaName = uniq("PW-Gamma");
  const gamma = await admin.post<{ id: number }>("/modules", { name: gammaName });
  await admin.post(`/projects/${world.project.id}/modules`, { moduleId: gamma.id });

  const email = `${uniq("pw.twomod")}@qapulse.test`;
  const user = await admin.post<{ id: number }>("/users", {
    name: "PW Two-Module",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  await admin.post(`/projects/${world.project.id}/members`, {
    userId: user.id,
    moduleIds: [world.modules.alpha.id, world.modules.beta.id],
  });

  const fa = as(world.actors.fa);
  const inAlpha = await createRequirement(fa, world, { module: world.modules.alpha.name });
  const inGamma = await createRequirement(fa, world, { module: gammaName });

  const member = new Api(world.baseUrl);
  await member.login(email, ACTOR_PASSWORD);
  const ids = (await member.get<{ id: number }[]>("/requirements")).map((r) => r.id);
  expect(ids).toContain(inAlpha.id);
  expect(ids).not.toContain(inGamma.id);
});

qcase("FUNC-040", "Roles matrix + RACI overlay (CR041/043)", async ({ world, admin, page, loginAs }) => {
  const matrix = await admin.get<{
    allKeys: string[];
    roles: { name: string; permissions: string[] }[];
  }>("/roles/permissions-matrix");
  expect(matrix.allKeys.length).toBeGreaterThan(0);
  expect(matrix.roles.find((r) => r.name === "admin")?.permissions).toEqual(matrix.allKeys);

  await loginAs(world.admin);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  await page.getByRole("button", { name: "View Access Matrix" }).click();
  await expect(page.getByRole("heading", { name: "Access Matrix" })).toBeVisible();
  // RACI overlay (CR043) — legend renders once the view flips
  await page.getByRole("button", { name: "RACI", exact: true }).click();
  await expect(page.getByText("Responsible")).toBeVisible();
  await expect(page.getByText("Accountable")).toBeVisible();
});

// ── Notifications ─────────────────────────────────────────────────────────────

qcase("FUNC-041", "Bell updates in real time via SSE (CR027)", async ({ world, page, loginAs }) => {
  await loginAs(world.actors.qaLead);
  // The sidebar bell row reads "Inbox" + unread badge (NotificationDropdown.tsx)
  const inboxRow = page.getByText("Inbox", { exact: true }).locator("..");
  await expect(inboxRow).toBeVisible();
  const readBadge = async (): Promise<number> => {
    const text = (await inboxRow.textContent()) ?? "";
    const match = text.match(/(\d+)\s*$/);
    return match ? Number(match[1]) : 0;
  };
  const before = await readBadge();
  // Trigger a qa_lead-targeted notification from outside the browser session
  await readyForQaRequirement(world);
  // No reload — the badge must move on the SSE push. Poll well under Layout's
  // 30s fallback refetch so a dead stream can't fake a pass.
  await expect.poll(readBadge, { timeout: 15_000 }).toBeGreaterThan(before);
});

qcase("FUNC-042", "Inbox filters + deep-link (CR027)", async ({ world, as, page, loginAs }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await expectNotification(world, world.actors.faLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_request",
  });

  await loginAs(world.actors.faLead, "/inbox");
  const row = page.locator("div.group").filter({ hasText: req.title }).first();

  // Entity-type chips narrow the feed
  await page.getByRole("button", { name: "Requirements" }).click();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Defects" }).click();
  await expect(row).toHaveCount(0);

  // Deep-link navigates to the entity
  await page.getByRole("button", { name: "Requirements" }).click();
  await row.getByTitle("Go to").click();
  await expect(page).toHaveURL(new RegExp(`/requirements/${req.id}$`));
});

// ── Contacts & configuration ──────────────────────────────────────────────────

qcase.manual(
  "FUNC-043",
  "Manage + sync contacts from Redmine (CR001)",
  "the contact sync half needs a live Redmine instance",
);

qcase("FUNC-044", "Document register CRUD", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const refNo = uniq("PW-REF");
  const created = await qa.post<{ id: number; refNo: string }>("/document-register", {
    projectName: world.project.name,
    moduleName: world.modules.alpha.name,
    tracker: "CR",
    refNo,
  });
  expect(created.refNo).toBe(refNo);

  const newRef = `${refNo}-v2`;
  await qa.put(`/document-register/${created.id}`, {
    projectName: world.project.name,
    moduleName: world.modules.alpha.name,
    tracker: "CR",
    refNo: newRef,
  });
  let rows = await qa.get<{ id: number; refNo: string }[]>("/document-register");
  expect(rows.find((r) => r.id === created.id)?.refNo).toBe(newRef);

  await qa.delete(`/document-register/${created.id}`);
  rows = await qa.get<{ id: number; refNo: string }[]>("/document-register");
  expect(rows.map((r) => r.id)).not.toContain(created.id);
});

// ── Audit log ─────────────────────────────────────────────────────────────────

qcase("FUNC-045", "Admin audit trail (CR011)", async ({ world, as, admin }) => {
  const req = await createRequirement(as(world.actors.fa), world);
  interface AuditPage {
    total: number;
    entries: {
      entityType: string | null;
      actorName: string | null;
      createdAt: string;
      description: string;
    }[];
  }
  const log = await admin.get<AuditPage>(
    `/audit-log?entityType=requirement&search=${encodeURIComponent(req.title)}`,
  );
  expect(log.total).toBeGreaterThanOrEqual(1);
  const entry = log.entries.find((e) => e.description.includes(req.title));
  expect(entry, "creation entry surfaced in the merged audit feed").toBeTruthy();
  expect(entry!.entityType).toBe("requirement");
  expect(entry!.actorName).toBe(world.actors.fa.name);
  expect(entry!.createdAt).toBeTruthy();
  // The entityType filter really filters
  expect(log.entries.every((e) => e.entityType === "requirement")).toBe(true);
});

// ── QA Analytics ──────────────────────────────────────────────────────────────

qcase("FUNC-046", "QA Analytics trend dashboard (CR026)", async ({ world, as, page, loginAs }) => {
  const body = await as(world.actors.qaLead).get<Record<string, unknown>>(
    `/dashboard/qa-analytics?projectId=${world.project.id}`,
  );
  // One key per panel: trend, velocity, pass-by-milestone, density, defect
  // trend, escape funnel, coverage snapshot
  for (const key of [
    "executionTrend", "velocity", "passByMilestone", "defectByModule",
    "defectTrend", "escapeFunnel", "coverage",
  ]) {
    expect(body, `${key} panel data present`).toHaveProperty(key);
  }
  await loginAs(world.actors.qaLead);
  await page.goto("/qa-analytics");
  await expect(page.getByRole("heading", { name: "QA Analytics" })).toBeVisible();
});

// ── Resources ─────────────────────────────────────────────────────────────────

qcase("FUNC-047", "Resources capacity view (CR034/038)", async ({ world, as, page, loginAs }) => {
  // Lead+ gate + per-person milestone focus rows (utilization % rides the
  // PM Dashboard capacity table, off this same signal set)
  const rows = await as(world.actors.pm).get<unknown[]>("/dashboard/resource-view");
  expect(Array.isArray(rows)).toBe(true);
  await loginAs(world.actors.pm);
  await page.goto("/resources");
  await expect(page.getByRole("heading", { name: "Resources" })).toBeVisible();
});

// ── Traceability ──────────────────────────────────────────────────────────────

qcase("FUNC-048", "Traceability matrix with coverage (CR005/016)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const req = await approvedRequirement(world);
  const tc = await qa.post<{ id: number; title: string }>("/test-cases", {
    title: uniq("PW traced TC"),
    projectId: world.project.id,
    requirementId: req.id,
  });
  const file = await createExecutionFile(qa, world, { requirementId: req.id });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      { caseId: `PW-T-${tc.id}`, caseName: tc.title, libraryTcId: tc.id, result: "Passed", rowOrder: 0 },
    ],
  });
  interface Node { reqId: number; tcCount: number; passed: number; children: Node[] }
  const roots = await as(world.actors.qaLead).get<Node[]>(
    `/traceability?projectId=${world.project.id}`,
  );
  const flatten = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
  const node = flatten(roots).find((n) => n.reqId === req.id);
  expect(node, `requirement #${req.id} missing from the matrix`).toBeTruthy();
  expect(node!.tcCount).toBeGreaterThanOrEqual(1);
  expect(node!.passed).toBeGreaterThanOrEqual(1); // Req → TC → execution result
  // (The page's Excel export is built client-side from this same payload.)
});

// ── PMO ───────────────────────────────────────────────────────────────────────

qcase("FUNC-049", "PMO report portal", async ({ world, admin, page, loginAs }) => {
  const email = `${uniq("pw.pmo")}@qapulse.test`;
  const created = await admin.post<{ id: number }>("/users", {
    name: "PW PMO",
    email,
    password: ACTOR_PASSWORD,
    role: "pmo",
  });
  // Clear the temp-password gate so the portal (not the change-password
  // overlay) is what renders
  await new Api(world.baseUrl).post("/auth/change-password", {
    userId: created.id,
    newPassword: ACTOR_PASSWORD,
  });
  const pmoActor: Actor = { key: "pmo", name: "PW PMO", email, role: "pmo", id: created.id, token: "" };
  await loginAs(pmoActor, "/pmo-report");
  // Standalone shell — its own sidebar, not wrapped in the QAPulse Layout
  await expect(page.getByText("PMO Portal")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verdict Report Portal" })).toBeVisible();
  // (Send report/verdict is outbound email — covered manually with FUNC-026.)
});
