type Json = Record<string, any> | any[] | null;

export {};

const rawBaseUrl = process.env.QAPULSE_BASE_URL;
const password = process.env.QAPULSE_TEST_PASSWORD;

if (!rawBaseUrl || !password) {
  console.error("Set QAPULSE_BASE_URL and QAPULSE_TEST_PASSWORD before running preprod:smoke.");
  process.exit(2);
}

const baseUrl = `${rawBaseUrl.replace(/\/$/, "")}/api`;
const accounts = [
  { email: "admin@qapulse.com", tier: "lead" },
  { email: "pmo1@qapulse.com", tier: "member" },
  { email: "fa1@qapulse.com", tier: "member" },
  { email: "dev1@qapulse.com", tier: "member" },
  { email: "qa1@qapulse.com", tier: "member" },
] as const;

const protectedReads = [
  "/auth/me", "/pipeline-settings", "/uat-signoffs", "/roles", "/roles/permissions-matrix",
  "/my-nav-permissions", "/test-cases", "/test-cases/review-queue", "/notifications",
  "/social-events", "/dashboard/pm-summary", "/dashboard/milestone-phase-breakdown",
  "/dashboard/task-board", "/dashboard/closed-milestones", "/dashboard/resource-view",
  "/dashboard/summary", "/dashboard/team", "/dashboard/weekly-trend", "/dashboard/activity",
  "/dashboard/qa-analytics", "/calendar/events", "/users", "/search?q=test", "/projects",
  "/defects", "/defects/metrics", "/defects/statuses", "/risks", "/risks/assignable-users",
  "/my-work", "/requirements", "/requirements/review-queue", "/requirements/dev-queue",
  "/requirements/events/all", "/document-register", "/data-prep-files", "/audit-log", "/tasks",
  "/tasks/events/all", "/contacts", "/teams", "/modules", "/execution-files",
  "/execution-progress", "/execution-files/review-queue", "/execution-events",
] as const;

const authenticatedReads = [
  "/auth/me", "/projects", "/requirements", "/requirements/review-queue",
  "/requirements/dev-queue", "/requirements/events/all", "/test-cases",
  "/test-cases/review-queue", "/tasks", "/tasks/events/all", "/defects", "/defects/metrics",
  "/defects/statuses", "/execution-files", "/execution-progress", "/execution-files/review-queue",
  "/modules", "/users", "/roles", "/my-nav-permissions", "/dashboard/summary",
  "/dashboard/task-board", "/dashboard/weekly-trend", "/dashboard/activity", "/dashboard/team",
  "/calendar/events", "/notifications", "/social-events", "/uat-signoffs", "/document-register",
  "/pipeline-settings", "/my-work?scope=mine",
] as const;

const protectedDetailReads = [
  "/uat-signoffs/1/download", "/milestones/1", "/milestones/1/assignees",
  "/milestones/1/assignable-users", "/milestones/1/risk-assessments", "/milestones/1/ai-risk-status",
  "/roles/1/permissions", "/test-cases/1", "/test-cases/1/executions", "/users/1",
  "/users/1/stats", "/projects/1", "/requirements/1/comments", "/defects/1/review",
  "/requirements/by-redmine/1", "/requirements/1/test-cases", "/requirements/1",
  "/requirements/1/history", "/requirements/1/events", "/requirements/1/dev-tasks",
  "/requirements/1/attachments", "/requirements/attachments/1/download", "/data-prep-files/1/download",
  "/tasks/1", "/tasks/1/events", "/teams/1", "/teams/1/members", "/projects/1/teams",
  "/projects/1/members", "/projects/1/modules", "/execution-files/1",
  "/execution-files/1/summaries", "/ai/execution-risk/1",
  "/ai/requirement-chat/conversations/1/messages",
] as const;

const malformedDetailReads = [
  "/users/not-a-number", "/projects/not-a-number", "/requirements/not-a-number",
  "/requirements/not-a-number/test-cases", "/requirements/not-a-number/history",
  "/requirements/not-a-number/events", "/requirements/not-a-number/dev-tasks",
  "/requirements/not-a-number/attachments", "/test-cases/not-a-number",
  "/test-cases/not-a-number/executions", "/tasks/not-a-number", "/tasks/not-a-number/events",
  "/milestones/not-a-number", "/milestones/not-a-number/assignees",
  "/milestones/not-a-number/risk-assessments", "/teams/not-a-number",
  "/execution-files/not-a-number", "/defects/not-a-number/review",
  "/roles/not-a-number/permissions", "/ai/execution-risk/not-a-number",
  "/ai/requirement-chat/conversations/not-a-number/messages",
] as const;

interface Failure { check: string; expected: string; actual: string; detail?: string }
const failures: Failure[] = [];
let assertions = 0;

async function request(path: string, token?: string, init: RequestInit = {}): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (response.headers.get("content-type") ?? "").includes("json")
    ? await response.json().catch(() => null) as Json
    : null;
  return { status: response.status, body };
}

function expect(check: string, actual: unknown, expected: unknown, detail?: string) {
  assertions++;
  if (actual !== expected) failures.push({ check, actual: String(actual), expected: String(expected), detail });
}

async function login(email: string): Promise<{ token: string; role: string; userId: number }> {
  const result = await request("/auth/login", undefined, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(`login ${email}`, result.status, 200, (result.body as any)?.error);
  return {
    token: (result.body as any)?.token ?? "",
    role: (result.body as any)?.user?.role ?? "",
    userId: Number((result.body as any)?.user?.id ?? 0),
  };
}

const health = await request("/healthz");
expect("public health check", health.status, 200);
const readiness = await request("/readyz");
expect("database readiness check", readiness.status, 200, (readiness.body as any)?.status);

for (const path of protectedReads) {
  const result = await request(path);
  expect(`anonymous ${path}`, result.status, 401, (result.body as any)?.error);
}

for (const path of protectedDetailReads) {
  const result = await request(path);
  expect(`anonymous detail ${path}`, result.status, 401, (result.body as any)?.error);
}

for (const account of accounts) {
  const { token, userId } = await login(account.email);
  if (!token) continue;

  const directory = await request("/users", token);
  expect(`${account.email} user directory status`, directory.status, 200, (directory.body as any)?.error);
  expect(
    `${account.email} user directory never exposes Redmine API keys`,
    Array.isArray(directory.body) && directory.body.every((user: any) => !Object.prototype.hasOwnProperty.call(user, "redmineApiKey")),
    true,
  );
  const ownProfile = await request(`/users/${userId}`, token);
  expect(`${account.email} may read own profile`, ownProfile.status, 200, (ownProfile.body as any)?.error);

  for (const path of authenticatedReads) {
    const result = await request(path, token);
    expect(`${account.email} ${path} has no server error`, result.status >= 500, false, (result.body as any)?.error);
  }


  if (account.email === "admin@qapulse.com") {
    for (const path of malformedDetailReads) {
      const result = await request(path, token);
      expect(`malformed ${path} is a controlled client error`, result.status >= 400 && result.status < 500, true, (result.body as any)?.error);
    }
  }

  for (const scope of ["mine", "team", "unassigned"] as const) {
    const result = await request(`/my-work?scope=${scope}`, token);
    const expectedStatus = account.tier === "member" && scope !== "mine" ? 403 : 200;
    expect(`${account.email} My Work ${scope}`, result.status, expectedStatus, (result.body as any)?.error);
    if (result.status !== 200) continue;
    const body = result.body as any;
    expect(`${account.email} My Work ${scope} items`, Array.isArray(body?.items), true);
    expect(`${account.email} My Work ${scope} total`, body?.summary?.total, body?.items?.length);
    expect(
      `${account.email} My Work ${scope} action URLs`,
      body.items.every((item: any) => typeof item.actionUrl === "string" && item.actionUrl.startsWith("/")),
      true,
    );
  }
}

console.log(JSON.stringify({ assertions, passed: assertions - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exit(1);
