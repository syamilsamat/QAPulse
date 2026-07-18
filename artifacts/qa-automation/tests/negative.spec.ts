/**
 * Negative suite — docs/test-plans/qapulse-negative-tests.xlsx (NEG-001 … NEG-035).
 * Validation, wrong-state transitions, and authorization denials — mostly at
 * the API layer, where the guards live.
 */
import { Api } from "../src/api";
import {
  test, expect, qcase, uniq, ACTOR_PASSWORD,
  createRequirement, approvedRequirement, readyForQaRequirement,
  createExecutionFile, expectNotification, expectNoNotification,
} from "../src/qtest";

// ── Authentication ────────────────────────────────────────────────────────────

qcase("NEG-001", "Login with empty fields", async ({ anon }) => {
  const res = await anon.raw("POST", "/auth/login", {});
  expect(res.status).toBe(400);
});

qcase("NEG-002", "Deactivated user cannot log in", async ({ world, admin, anon }) => {
  const email = `${uniq("pw.deact")}@qapulse.test`;
  const user = await admin.post<{ id: number }>("/users", {
    name: "PW Deactivated",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  await admin.patch(`/users/${user.id}/active`, { isActive: false });
  const res = await anon.raw("POST", "/auth/login", { email, password: ACTOR_PASSWORD });
  expect(res.status).toBe(403);
});

qcase("NEG-003", "Expired token auto-logout", async ({ world }) => {
  const res = await new Api(world.baseUrl, "expired.or.garbage.token").raw("GET", "/auth/me");
  expect(res.status).toBe(401);
});

// ── Access control ────────────────────────────────────────────────────────────

qcase("NEG-004", "Route blocked for role redirects safely (CR048)", async ({ page, world, as, loginAs }) => {
  const perms = await as(world.actors.qa).get<string[]>("/my-nav-permissions");
  test.skip(perms.includes("nav:roles"), "qa_member unexpectedly holds nav:roles in this environment");
  await loginAs(world.actors.qa);
  await page.goto("/roles");
  await expect(page).toHaveURL(/\/dashboard/); // bounced, not blank/404
});

qcase("NEG-005", "Module-scoped user cannot see other module (CR044)", async ({ world, as }) => {
  const betaReq = await createRequirement(as(world.actors.fa), world, {
    module: world.modules.beta.name,
  });
  const list = await as(world.actors.scopedQa).get<{ id: number }[]>("/requirements");
  expect(list.map((r) => r.id)).not.toContain(betaReq.id);
});

qcase("NEG-006", "Cross-project defect access blocked (CR047)", async ({ world, admin }) => {
  // A user with NO membership in the world project must be denied its defects.
  const email = `${uniq("pw.outsider")}@qapulse.test`;
  await admin.post("/users", {
    name: "PW Outsider",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  const outsider = new Api(world.baseUrl);
  await outsider.login(email, ACTOR_PASSWORD);
  const res = await outsider.raw("GET", `/defects?projectId=${world.project.id}`);
  expect(res.status).toBe(403);
});

qcase("NEG-007", "Unauthenticated API rejected (CR049)", async ({ anon, world }) => {
  const attempts: [string, string, unknown?][] = [
    ["POST", "/requirements", { title: "anon" }],
    ["PATCH", `/requirements/1/dev`, { action: "assign", devAssigneeId: 1 }],
    ["GET", "/audit-log"],
    ["POST", "/defects", { title: "anon" }],
    ["GET", "/contacts"],
    ["GET", "/document-register"],
  ];
  for (const [method, path, body] of attempts) {
    const res = await anon.raw(method, path, body);
    expect([401, 403], `${method} ${path} anonymously`).toContain(res.status);
  }
});

qcase("NEG-008", "Anon cannot create admin (CR049)", async ({ anon }) => {
  const res = await anon.raw("POST", "/users", {
    name: "Evil Admin",
    email: `${uniq("evil")}@qapulse.test`,
    password: "hacked123",
    role: "admin",
  });
  expect(res.status).toBe(401);
});

qcase("NEG-009", "Non-admin cannot change a role (CR049)", async ({ world, as }) => {
  const res = await as(world.actors.qa).raw("PATCH", `/users/${world.actors.qa.id}`, {
    role: "admin",
  });
  expect(res.status).toBe(403);
});

qcase("NEG-010", "Non-admin cannot delete a user (CR049)", async ({ world, as }) => {
  const res = await as(world.actors.qa).raw("DELETE", `/users/${world.actors.dev.id}`);
  expect(res.status).toBe(403);
});

qcase("NEG-011", "Non-lead cannot assign a developer", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  const res = await as(world.actors.dev).raw("PATCH", `/requirements/${req.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });
  expect(res.status).toBe(403);
});

// ── Requirements ──────────────────────────────────────────────────────────────

qcase("NEG-012", "Empty title rejected", async ({ world, as }) => {
  const res = await as(world.actors.fa).raw("POST", "/requirements", {
    description: "No title supplied",
    projectId: world.project.id,
  });
  expect(res.status).toBe(400);
});

qcase("NEG-013", "Author cannot approve own requirement (CR023)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  const res = await fa.raw("PATCH", `/requirements/${req.id}/review`, { action: "approve" });
  expect(res.status).toBe(403);
});

qcase("NEG-014", "Return to FA on non-approved rejected (CR053)", async ({ world, as }) => {
  const draft = await createRequirement(as(world.actors.fa), world);
  const res = await as(world.actors.qa).raw("PATCH", `/requirements/${draft.id}/return-to-fa`, {
    reason: "should be rejected — still a draft",
  });
  expect(res.status).toBe(409);
});

qcase("NEG-015", "Return to Dev on non-ready req (CR046)", async ({ world, as }) => {
  // assigned + started, but never marked ready_for_qa
  const req = await approvedRequirement(world);
  await as(world.actors.devLead).patch(`/requirements/${req.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });
  await as(world.actors.dev).patch(`/requirements/${req.id}/dev`, { action: "start" });
  const res = await as(world.actors.qaLead).raw("PATCH", `/requirements/${req.id}/dev`, {
    action: "return_to_dev",
    reason: "not ready yet",
  });
  expect(res.status).toBe(409);
});

qcase("NEG-016", "Dev action before FA approval", async ({ world, as }) => {
  const draft = await createRequirement(as(world.actors.fa), world);
  const res = await as(world.actors.devLead).raw("PATCH", `/requirements/${draft.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });
  expect(res.status).toBe(409);
});

qcase("NEG-017", "Raise requirement defect by wrong role (CR031)", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  // pm_lead is not in REQUIREMENT_DEFECT_RAISER_ROLES (dev/qa tiers + admin/cto)
  const res = await as(world.actors.pm).raw("POST", "/defects", {
    source: "requirement",
    requirementId: req.id,
    title: uniq("PW wrong-role defect"),
  });
  expect(res.status).toBe(403);
});

qcase("NEG-018", "Edit restriction on rejected req (CR023)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await as(world.actors.faLead).patch(`/requirements/${req.id}/review`, {
    action: "reject",
    comment: "rejected for the edit-restriction test",
  });
  // qa is neither author nor assignee — edit must be denied
  const res = await as(world.actors.qa).raw("PATCH", `/requirements/${req.id}`, {
    title: "hijacked title",
  });
  expect(res.status).toBe(403);
});

// ── Defects ───────────────────────────────────────────────────────────────────

qcase("NEG-019", "Double-submit register = one defect (CR051)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const redmineId = Math.floor(Date.now() / 1000) + 1;
  const body = {
    redmineId,
    title: uniq("PW double-submit defect"),
    severity: "minor",
  };
  // Concurrent double-click — the CR051 partial unique index + 23505 catch
  // must collapse both into a single row.
  const [r1, r2] = await Promise.all([
    qa.raw("POST", "/defects/register", body),
    qa.raw("POST", "/defects/register", body),
  ]);
  expect(r1.ok, `first register → ${r1.status}`).toBe(true);
  expect(r2.ok, `second register → ${r2.status}`).toBe(true);

  const all = await qa.get<{ redmineId: number | null }[]>("/defects");
  expect(all.filter((d) => d.redmineId === redmineId)).toHaveLength(1);
});

qcase("NEG-020", "Unknown status rejected", async ({ world, as }) => {
  const qaLead = as(world.actors.qaLead);
  const defect = await qaLead.post<{ id: number }>("/defects", {
    title: uniq("PW unknown-status defect"),
    severity: "minor",
    projectId: world.project.id,
    source: "qa",
  });
  const res = await qaLead.raw("PATCH", `/defects/${defect.id}/status`, {
    statusRedmineId: 987654321,
  });
  expect(res.status).toBe(400);
});

qcase("NEG-021", "Invalid defect id", async ({ world, as }) => {
  const res = await as(world.actors.qaLead).raw("PATCH", "/defects/99999999/assign", {
    assigneeId: world.actors.dev.id,
  });
  expect(res.status).toBe(404);
});

qcase("NEG-022", "NaN projectId filter rejected (CR051)", async ({ world, as }) => {
  const res = await as(world.actors.qa).raw("GET", "/defects?projectId=abc");
  expect(res.status).toBe(400);
});

// ── Execution & milestones ────────────────────────────────────────────────────

qcase("NEG-023", "Duplicate Redmine ticket file", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const ticket = uniq("PW-DUP");
  await createExecutionFile(qa, world, { redmineTicketId: ticket });
  const res = await qa.raw("POST", "/execution-files", {
    redmineTicketId: ticket,
    title: "duplicate ticket",
    projectId: world.project.id,
  });
  // redmine_ticket_id is NOT NULL UNIQUE — the duplicate must not create a row
  expect(res.ok).toBe(false);
  const files = await qa.get<{ redmineTicketId: string }[]>("/execution-files");
  expect(files.filter((f) => f.redmineTicketId === ticket)).toHaveLength(1);
});

qcase("NEG-024", "Missing name / project", async ({ world, as }) => {
  const pm = as(world.actors.pm);
  expect((await pm.raw("POST", "/milestones", { name: "no project" })).status).toBe(400);
  expect((await pm.raw("POST", "/milestones", { projectId: world.project.id })).status).toBe(400);
});

qcase("NEG-025", "Invalid environment value", async ({ world, as }) => {
  const res = await as(world.actors.pm).raw("POST", "/milestones", {
    projectId: world.project.id,
    name: uniq("PW bad-env milestone"),
    environment: "moon-base",
  });
  expect(res.status).toBe(400);
});

// ── Access assignment ─────────────────────────────────────────────────────────

qcase("NEG-026", "Assign a module not on the project (CR044)", async ({ world, admin }) => {
  // A module that exists in the registry but was never linked to the project
  const orphan = await admin.post<{ id: number }>("/modules", { name: uniq("PW-Orphan") });
  const res = await admin.raw("POST", `/projects/${world.project.id}/members`, {
    userId: world.actors.qa.id,
    moduleIds: [orphan.id],
  });
  expect(res.status).toBe(400);
});

qcase("NEG-027", "Assign outside department/tier", async ({ world, as }) => {
  // A tier-1 member has no assigner rights at all
  const res = await as(world.actors.qa).raw("POST", `/projects/${world.project.id}/members`, {
    userId: world.actors.dev.id,
    moduleIds: null,
  });
  expect(res.status).toBe(403);
});

// ── Notifications ─────────────────────────────────────────────────────────────

qcase("NEG-028", "Actor not self-notified", async ({ world, as }) => {
  // faLead submits their own requirement — the review_request fan-out targets
  // FA reviewers but must exclude the actor themselves.
  const faLead = as(world.actors.faLead);
  const req = await createRequirement(faLead, world);
  await faLead.patch(`/requirements/${req.id}/review`, { action: "submit" });
  // sanity: the fan-out did fire for someone else eligible
  await expectNotification(world, world.actors.fa, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_request",
  });
  await expectNoNotification(world, world.actors.faLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_request",
  });
});

qcase("NEG-029", "Module-scoped reviewer not pinged out-of-scope (CR045)", async ({ world, admin, as }) => {
  // An FA reviewer scoped to alpha only must not hear about a beta submission.
  const email = `${uniq("pw.fa.scoped")}@qapulse.test`;
  const scopedFa = await admin.post<{ id: number }>("/users", {
    name: "PW FA Scoped",
    email,
    password: ACTOR_PASSWORD,
    role: "fa_member",
  });
  await admin.post(`/projects/${world.project.id}/members`, {
    userId: scopedFa.id,
    moduleIds: [world.modules.alpha.id],
  });

  const fa = as(world.actors.fa);
  const betaReq = await createRequirement(fa, world, { module: world.modules.beta.name });
  await fa.patch(`/requirements/${betaReq.id}/review`, { action: "submit" });

  // whole-project reviewer hears it…
  await expectNotification(world, world.actors.faLead, {
    entityId: betaReq.id,
    entityType: "requirement",
    type: "review_request",
  });
  // …the alpha-scoped reviewer does not
  const scopedActor = {
    key: "scopedFa",
    name: "PW FA Scoped",
    email,
    role: "fa_member",
    id: scopedFa.id,
    token: (await new Api(world.baseUrl).login(email, ACTOR_PASSWORD)).token,
  };
  await expectNoNotification(world, scopedActor, {
    entityId: betaReq.id,
    entityType: "requirement",
    type: "review_request",
  });
});

// ── Boundary ──────────────────────────────────────────────────────────────────

qcase.fixme(
  "NEG-030",
  "Oversized upload rejected",
  "Needs a multipart client + the configured attachment size limit — automate once the limit is pinned down",
);

qcase("NEG-031", "Very long requirement title", async ({ world, as }) => {
  const res = await as(world.actors.fa).raw("POST", "/requirements", {
    title: "PW long title ".repeat(700), // ~10k chars
    projectId: world.project.id,
  });
  // Must be handled gracefully — accepted or validation-rejected, never a 5xx
  expect([200, 201, 400]).toContain(res.status);
});

qcase("NEG-032", "Uncovered requirement in traceability", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  interface ReqNode { reqId: number; tcCount: number; children: ReqNode[] }
  const roots = await as(world.actors.qaLead).get<ReqNode[]>("/traceability");
  const flatten = (nodes: ReqNode[]): ReqNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
  const node = flatten(roots).find((n) => n.reqId === req.id);
  expect(node, `requirement #${req.id} missing from traceability`).toBeTruthy();
  expect(node!.tcCount).toBe(0);
});

qcase("NEG-033", "Save with no changes", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const file = await createExecutionFile(qa, world);
  const res = await qa.raw("POST", `/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [],
  });
  expect(res.ok).toBe(true);
  const saved = await qa.get<{ testCases: unknown[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  expect(saved.testCases).toHaveLength(0);
});

qcase("NEG-034", "Fail-modal defect carries milestone (CR050)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const milestone = await as(world.actors.pm).post<{ id: number }>("/milestones", {
    projectId: world.project.id,
    name: uniq("PW milestone"),
  });
  const file = await createExecutionFile(qa, world, { milestoneId: milestone.id });
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [{ caseId: "PW-NEG-034", caseName: "fails", result: "Failed", rowOrder: 0 }],
  });
  const rows = await qa.get<{ testCases: { id: number; caseId: string | null }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  const row = rows.testCases.find((r) => r.caseId === "PW-NEG-034");
  expect(row).toBeTruthy();

  const defect = await qa.post<{ id: number; milestoneId: number | null }>("/defects/register", {
    redmineId: Math.floor(Date.now() / 1000) + 2,
    title: uniq("PW milestone-carrying defect"),
    executionTcId: row!.id,
  });
  expect(defect.milestoneId).toBe(milestone.id);
});

qcase("NEG-035", "Module delete does not lock out members (CR050)", async ({ world, admin }) => {
  // Scope a fresh user to a disposable module, delete the module from the
  // project — the membership must survive (module cleaned from the array).
  const gamma = await admin.post<{ id: number }>("/modules", { name: uniq("PW-Gamma") });
  await admin.post(`/projects/${world.project.id}/modules`, { moduleId: gamma.id });
  const email = `${uniq("pw.gamma")}@qapulse.test`;
  const user = await admin.post<{ id: number }>("/users", {
    name: "PW Gamma-Scoped",
    email,
    password: ACTOR_PASSWORD,
    role: "qa_member",
  });
  await admin.post(`/projects/${world.project.id}/members`, {
    userId: user.id,
    moduleIds: [gamma.id, world.modules.alpha.id],
  });

  await admin.delete(`/projects/${world.project.id}/modules/${gamma.id}`);

  const members = await admin.get<{ userId: number; moduleIds: number[] | null }[]>(
    `/projects/${world.project.id}/members`,
  );
  const member = members.find((m) => m.userId === user.id);
  expect(member, "membership must survive the module delete").toBeTruthy();
  expect(member!.moduleIds ?? []).not.toContain(gamma.id);
  expect(member!.moduleIds ?? []).toContain(world.modules.alpha.id);
});
