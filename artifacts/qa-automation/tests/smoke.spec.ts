/**
 * Smoke suite — docs/test-plans/qapulse-smoke-tests.xlsx (SMOKE-001 … SMOKE-023).
 * Each test is linked to its Excel case via the qcase() title + annotation.
 */
import { Api } from "../src/api";
import {
  test, expect, qcase, uniq, ACTOR_PASSWORD,
  createRequirement, approvedRequirement, readyForQaRequirement,
  createExecutionFile, expectNotification, uiLogin,
  type Notification,
} from "../src/qtest";

// ── Authentication ────────────────────────────────────────────────────────────

qcase("SMOKE-001", "Valid login", async ({ page, world }) => {
  await uiLogin(page, world.actors.qa.email, ACTOR_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/);
});

qcase("SMOKE-002", "Invalid login rejected", async ({ page, world }) => {
  await uiLogin(page, world.actors.qa.email, "definitely-wrong-password");
  await expect(page.getByText("Login failed")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

qcase("SMOKE-003", "Session auto-logout on 401", async ({ page }) => {
  // A stale/garbage token must be rejected by the startup /auth/me validation
  // (CR007-2) and land the user back on /login with storage cleared.
  await page.addInitScript(() => {
    localStorage.setItem("qa_pulse_remember_me", "true");
    localStorage.setItem("qa_pulse_token", "not-a-real-jwt");
  });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("qa_pulse_token"))).toBeNull();
});

// ── Access Control ────────────────────────────────────────────────────────────

qcase("SMOKE-004", "Non-QA role reaches a landing page (CR048)", async ({ page, world, loginAs }) => {
  await loginAs(world.actors.dev);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).not.toHaveURL(/\/login/);
});

qcase("SMOKE-005", "Sidebar nav matches route access (CR048)", async ({ page, world, loginAs, as }) => {
  // dev_member has no nav:audit-log permission — the route gate must bounce
  // them to /dashboard instead of rendering (or blank-looping).
  const perms = await as(world.actors.dev).get<string[]>("/my-nav-permissions");
  expect(perms).not.toContain("nav:audit-log");
  await loginAs(world.actors.dev);
  await page.goto("/audit-log");
  await expect(page).toHaveURL(/\/dashboard/);
});

qcase("SMOKE-006", "Module-scoped user sees only their modules (CR044)", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const inAlpha = await createRequirement(fa, world, { module: world.modules.alpha.name });
  const inBeta = await createRequirement(fa, world, { module: world.modules.beta.name });

  const list = await as(world.actors.scopedQa).get<{ id: number }[]>("/requirements");
  const ids = list.map((r) => r.id);
  expect(ids).toContain(inAlpha.id);
  expect(ids).not.toContain(inBeta.id);
});

qcase("SMOKE-007", "Unauthenticated API is rejected (CR049)", async ({ anon }) => {
  for (const path of ["/requirements", "/defects", "/users", "/notifications"]) {
    const res = await anon.raw("GET", path);
    expect(res.status, `GET ${path} without a token`).toBe(401);
  }
});

// ── Requirements review workflow ──────────────────────────────────────────────

qcase("SMOKE-008", "Create requirement (FA)", async ({ world, as }) => {
  const created = await createRequirement(as(world.actors.fa), world);
  expect(created.id).toBeGreaterThan(0);
  const fetched = await as(world.actors.fa).get<{ id: number; title: string }>(
    `/requirements/${created.id}`,
  );
  expect(fetched.title).toBe(created.title);
});

qcase("SMOKE-009", "Submit for review notifies FA reviewers", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await expectNotification(world, world.actors.faLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_request",
  });
});

qcase("SMOKE-010", "Approve routes to Dev Lead (CR045)", async ({ world }) => {
  const req = await approvedRequirement(world);
  expect(req.reviewStatus).toBe("approved");
  await expectNotification(world, world.actors.devLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_approved",
  });
});

qcase("SMOKE-011", "Reject notifies author", async ({ world, as }) => {
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  await as(world.actors.faLead).patch(`/requirements/${req.id}/review`, {
    action: "reject",
    comment: "Smoke-test rejection",
  });
  await expectNotification(world, world.actors.fa, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_rejected",
  });
});

// ── Dev handoff ───────────────────────────────────────────────────────────────

qcase("SMOKE-012", "Assign developer notifies dev", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  await as(world.actors.devLead).patch(`/requirements/${req.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });
  await expectNotification(world, world.actors.dev, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_dev_assigned",
  });
});

qcase("SMOKE-013", "Mark Ready for QA notifies QA Lead (CR045)", async ({ world }) => {
  const req = await readyForQaRequirement(world);
  expect(req.devStatus).toBe("ready_for_qa");
  await expectNotification(world, world.actors.qaLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_ready_for_qa",
  });
});

qcase("SMOKE-014", "QA Return to Dev (CR046)", async ({ world, as }) => {
  const req = await readyForQaRequirement(world);
  const returned = await as(world.actors.qaLead).patch<{ devStatus: string }>(
    `/requirements/${req.id}/dev`,
    { action: "return_to_dev", reason: "Smoke test — not actually done" },
  );
  expect(returned.devStatus).not.toBe("ready_for_qa");
  await expectNotification(world, world.actors.dev, {
    entityId: req.id,
    entityType: "requirement",
    type: "returned_to_dev",
  });
});

qcase("SMOKE-015", "Return to FA (CR053)", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  const returned = await as(world.actors.qa).patch<{ reviewStatus: string }>(
    `/requirements/${req.id}/return-to-fa`,
    { reason: "Smoke test — requirement incomplete" },
  );
  expect(returned.reviewStatus).toBe("rejected");
  await expectNotification(world, world.actors.fa, {
    entityId: req.id,
    entityType: "requirement",
    type: "requirement_returned_to_fa",
  });
});

qcase("SMOKE-016", "Raise requirement defect (CR031)", async ({ world, as }) => {
  const req = await approvedRequirement(world);
  const defect = await as(world.actors.qa).post<{ id: number; assigneeId: number | null }>(
    "/defects",
    {
      source: "requirement",
      requirementId: req.id,
      title: uniq("PW requirement defect"),
      description: "Raised by the smoke suite against an approved requirement.",
      severity: "major",
    },
  );
  // CR031 — auto-routes to the requirement's author
  expect(defect.assigneeId).toBe(world.actors.fa.id);
  await expectNotification(world, world.actors.fa, {
    entityId: defect.id,
    entityType: "defect",
  });
});

// ── Execution ─────────────────────────────────────────────────────────────────

qcase("SMOKE-017", "Create execution file + notify QA PIC (CR045)", async ({ world, as }) => {
  const file = await createExecutionFile(as(world.actors.qaLead), world, {
    qaPic: world.actors.qa.name,
  });
  expect(file.id).toBeGreaterThan(0);
  await expectNotification(world, world.actors.qa, {
    entityId: file.id,
    entityType: "execution_file",
  });
});

qcase("SMOKE-018", "Record pass/fail results", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const file = await createExecutionFile(qa, world);
  await qa.post(`/execution-files/${file.redmineTicketId}/test-cases`, {
    testCases: [
      {
        caseId: "PW-SMOKE-018-1",
        caseName: "Row recorded as Passed",
        scenario: "Smoke",
        result: "Passed",
        qaPic: world.actors.qa.name,
        rowOrder: 0,
      },
      {
        caseId: "PW-SMOKE-018-2",
        caseName: "Row recorded as Failed",
        scenario: "Smoke",
        result: "Failed",
        actualResult: "Deliberate smoke failure",
        qaPic: world.actors.qa.name,
        rowOrder: 1,
      },
    ],
  });
  const saved = await qa.get<{ testCases: { caseId: string | null; result: string | null }[] }>(
    `/execution-files/${file.redmineTicketId}/test-cases`,
  );
  const byCase = new Map(saved.testCases.map((r) => [r.caseId, r.result]));
  expect(byCase.get("PW-SMOKE-018-1")).toBe("Passed");
  expect(byCase.get("PW-SMOKE-018-2")).toBe("Failed");
});

// ── Defects ───────────────────────────────────────────────────────────────────

qcase("SMOKE-019", "Fail modal registers defect (idempotent, CR051)", async ({ world, as }) => {
  const qa = as(world.actors.qa);
  const redmineId = Math.floor(Date.now() / 1000); // unique numeric ticket id
  const body = {
    redmineId,
    title: uniq("PW fail-modal defect"),
    description: "Registered twice by the smoke suite — must stay one row.",
    severity: "major",
  };
  const first = await qa.post<{ id: number }>("/defects/register", body);
  const second = await qa.post<{ id: number }>("/defects/register", body);
  expect(second.id).toBe(first.id);

  const all = await qa.get<{ id: number; redmineId: number | null }[]>("/defects");
  const matches = all.filter((d) => d.redmineId === redmineId);
  expect(matches).toHaveLength(1);
});

qcase("SMOKE-020", "Defect reopen notifies dev (CR050)", async ({ world, as }) => {
  const qaLead = as(world.actors.qaLead);
  // Status changes ride the synced Redmine status registry; skip cleanly when
  // this environment has never synced statuses.
  const statuses = await qaLead.get<{ redmineId: number; name: string }[]>("/defects/statuses");
  const reopenLike = statuses.find((s) => /reopen/i.test(s.name));
  test.skip(!reopenLike, "No 'Reopened'-like status synced from Redmine in this environment");

  const defect = await qaLead.post<{ id: number; redmineId: number | null }>("/defects", {
    title: uniq("PW reopen defect"),
    description: "Smoke: reopen must notify the assigned dev.",
    severity: "major",
    projectId: world.project.id,
    source: "qa",
  });
  test.skip(
    !!defect.redmineId,
    "Defect synced write-through to live Redmine — reopen would mutate the real tracker",
  );
  await qaLead.patch(`/defects/${defect.id}/assign`, { assigneeId: world.actors.dev.id });
  await qaLead.patch(`/defects/${defect.id}/status`, { statusRedmineId: reopenLike!.redmineId });
  await expectNotification(world, world.actors.dev, {
    entityId: defect.id,
    entityType: "defect",
    type: "defect_reopened",
  });
});

// ── Read-side pages ───────────────────────────────────────────────────────────

qcase("SMOKE-021", "Traceability matrix loads", async ({ page, world, loginAs }) => {
  await loginAs(world.actors.qaLead);
  await page.goto("/traceability");
  await expect(page.getByRole("heading", { name: "Traceability Matrix" })).toBeVisible();
});

qcase("SMOKE-022", "Phase timeline renders", async ({ page, world, loginAs }) => {
  await loginAs(world.actors.pm);
  await page.goto("/pm-dashboard");
  await expect(page.getByRole("heading", { name: "PM Dashboard" })).toBeVisible();
});

// ── Notifications ─────────────────────────────────────────────────────────────

qcase("SMOKE-023", "Deep-link navigates to entity", async ({ page, world, as, loginAs }) => {
  // Generate a fresh unread notification for faLead, then follow it from Inbox.
  const fa = as(world.actors.fa);
  const req = await createRequirement(fa, world);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  const notif: Notification = await expectNotification(world, world.actors.faLead, {
    entityId: req.id,
    entityType: "requirement",
    type: "review_request",
  });

  await loginAs(world.actors.faLead, "/inbox");
  const row = page
    .locator("div.group")
    .filter({ hasText: req.title })
    .first();
  await expect(row).toBeVisible();
  await row.getByTitle("Go to").click();
  await expect(page).toHaveURL(new RegExp(`/requirements/${notif.entityId}$`));
});
