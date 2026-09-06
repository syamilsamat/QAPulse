type Json = Record<string, any> | any[] | null;

export {};

const rawBaseUrl = process.env.QAPULSE_BASE_URL;
const password = process.env.QAPULSE_TEST_PASSWORD;

if (!rawBaseUrl || !password) {
  console.error("Set QAPULSE_BASE_URL and QAPULSE_TEST_PASSWORD before running preprod:crud.");
  process.exit(2);
}

const baseUrl = `${rawBaseUrl.replace(/\/$/, "")}/api`;
const runId = `PREPROD-SMOKE-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
const failures: Array<{ check: string; expected: string; actual: string; detail?: string }> = [];
const cleanup: Array<{ label: string; path: string }> = [];
let assertions = 0;
let adminToken = "";

async function request(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body: Json = contentType.includes("json") ? await response.json().catch(() => null) as Json : null;
  return { status: response.status, body };
}

function expect(check: string, actual: unknown, expected: unknown, detail?: string) {
  assertions++;
  if (actual !== expected) failures.push({ check, actual: String(actual), expected: String(expected), detail });
}

function expectStatus(check: string, result: Awaited<ReturnType<typeof request>>, expected: number) {
  expect(check, result.status, expected, (result.body as any)?.error);
}

async function login(email: string) {
  const result = await request("/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expectStatus(`login ${email}`, result, 200);
  return (result.body as any)?.token as string | undefined;
}

async function create(label: string, path: string, body: Record<string, unknown>, cleanupPath: (id: number) => string) {
  const result = await request(path, adminToken, { method: "POST", body: JSON.stringify(body) });
  expectStatus(`create ${label}`, result, 201);
  const id = Number((result.body as any)?.id);
  expect(`${label} returns a positive id`, Number.isInteger(id) && id > 0, true);
  if (Number.isInteger(id) && id > 0) cleanup.unshift({ label, path: cleanupPath(id) });
  return { id, body: result.body as Record<string, any> };
}

async function patchAndVerify(label: string, path: string, body: Record<string, unknown>, field: string, expected: unknown) {
  const result = await request(path, adminToken, { method: "PATCH", body: JSON.stringify(body) });
  expectStatus(`update ${label}`, result, 200);
  expect(`${label} update persisted`, (result.body as any)?.[field], expected);
}

try {
  adminToken = (await login("admin@qapulse.com")) ?? "";
  const memberToken = (await login("qa1@qapulse.com")) ?? "";

  const anonymousMutations = [
    ["POST", "/projects", { name: runId }],
    ["POST", "/milestones", { projectId: 1, name: runId }],
    ["POST", "/requirements", { title: runId, priority: "medium", status: "open" }],
    ["POST", "/test-cases", { title: runId }],
    ["POST", "/tasks", { name: runId }],
    ["POST", "/risks", { projectId: 1, title: runId }],
    ["PATCH", "/projects/1", { description: runId }],
    ["DELETE", "/projects/1", undefined],
  ] as const;
  for (const [method, path, body] of anonymousMutations) {
    const result = await request(path, undefined, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    expect(`anonymous ${method} ${path}`, result.status, 401, (result.body as any)?.error);
  }

  const forbiddenProject = await request("/projects", memberToken, {
    method: "POST",
    body: JSON.stringify({ name: runId }),
  });
  expectStatus("non-admin project creation is forbidden", forbiddenProject, 403);

  const project = await create("project", "/projects", {
    name: runId,
    description: "Temporary pre-production CRUD test record",
    status: "active",
  }, (id) => `/projects/${id}`);
  await patchAndVerify("project", `/projects/${project.id}`, { description: `${runId}-updated` }, "description", `${runId}-updated`);
  expectStatus("read project", await request(`/projects/${project.id}`, adminToken), 200);

  const milestone = await create("milestone", "/milestones", {
    projectId: project.id,
    name: `${runId}-milestone`,
    status: "planned",
    priority: "Medium",
    description: "Temporary test milestone",
  }, (id) => `/milestones/${id}`);
  await patchAndVerify("milestone", `/milestones/${milestone.id}`, { description: `${runId}-updated` }, "description", `${runId}-updated`);
  expectStatus("read milestone", await request(`/milestones/${milestone.id}`, adminToken), 200);

  const requirement = await create("requirement", "/requirements", {
    title: `${runId}-requirement`,
    description: "Temporary test requirement",
    projectId: project.id,
    milestoneId: milestone.id,
    priority: "medium",
    status: "open",
  }, (id) => `/requirements/${id}`);
  await patchAndVerify("requirement", `/requirements/${requirement.id}`, { description: `${runId}-updated` }, "description", `${runId}-updated`);
  expectStatus("read requirement", await request(`/requirements/${requirement.id}`, adminToken), 200);

  const testCase = await create("test case", "/test-cases", {
    title: `${runId}-test-case`,
    objective: "Exercise the create/update/delete contract",
    expectedResult: "The record is persisted and removed cleanly",
    projectId: project.id,
    requirementId: requirement.id,
    priority: "medium",
  }, (id) => `/test-cases/${id}`);
  await patchAndVerify("test case", `/test-cases/${testCase.id}`, { objective: `${runId}-updated` }, "objective", `${runId}-updated`);
  expectStatus("read test case", await request(`/test-cases/${testCase.id}`, adminToken), 200);

  const task = await create("task", "/tasks", {
    name: `${runId}-task`,
    projectId: project.id,
    milestoneId: milestone.id,
    priority: "medium",
    notes: "Temporary test task",
  }, (id) => `/tasks/${id}`);
  await patchAndVerify("task", `/tasks/${task.id}`, { notes: `${runId}-updated` }, "notes", `${runId}-updated`);
  expectStatus("read task", await request(`/tasks/${task.id}`, adminToken), 200);

  const risk = await create("risk", "/risks", {
    projectId: project.id,
    milestoneId: milestone.id,
    title: `${runId}-risk`,
    description: "Temporary test risk",
    category: "technical",
    probability: "low",
    impact: "medium",
    responseStrategy: "mitigate",
  }, (id) => `/risks/${id}`);
  await patchAndVerify("risk", `/risks/${risk.id}`, { mitigationPlan: `${runId}-updated` }, "mitigationPlan", `${runId}-updated`);
  const risks = await request(`/risks?projectId=${project.id}&milestoneId=${milestone.id}`, adminToken);
  expectStatus("list risks", risks, 200);
  expect("created risk appears in filtered list", Array.isArray(risks.body) && risks.body.some((item: any) => item.id === risk.id), true);

  const forbiddenRisk = await request("/risks", memberToken, {
    method: "POST",
    body: JSON.stringify({ projectId: project.id, title: `${runId}-forbidden` }),
  });
  expectStatus("member risk creation is forbidden", forbiddenRisk, 403);
} catch (error) {
  failures.push({ check: "unexpected test runner error", expected: "no exception", actual: String(error) });
} finally {
  for (const item of cleanup) {
    try {
      const deleted = await request(item.path, adminToken, { method: "DELETE" });
      expect(`delete ${item.label}`, [200, 204].includes(deleted.status), true, (deleted.body as any)?.error);
      const after = await request(item.path, adminToken);
      expect(`${item.label} absent after cleanup`, after.status, 404, (after.body as any)?.error);
    } catch (error) {
      failures.push({ check: `cleanup ${item.label}`, expected: "deleted", actual: String(error) });
    }
  }
}

console.log(JSON.stringify({ runId, assertions, passed: assertions - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exit(1);
