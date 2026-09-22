type Json = Record<string, any> | any[] | null;

export {};

const rawBaseUrl = process.env.QMPULSE_BASE_URL;
const password = process.env.QMPULSE_TEST_PASSWORD;
if (!rawBaseUrl || !password) {
  console.error("Set QMPULSE_BASE_URL and QMPULSE_TEST_PASSWORD before running preprod:boundaries.");
  process.exit(2);
}

const baseUrl = `${rawBaseUrl.replace(/\/$/, "")}/api`;
const failures: Array<{ check: string; expected: string; actual: string; detail?: string }> = [];
let assertions = 0;

async function request(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body: Json = (response.headers.get("content-type") ?? "").includes("json")
    ? await response.json().catch(() => null) as Json
    : null;
  return { status: response.status, body };
}

function expect(check: string, actual: unknown, expected: unknown, detail?: string) {
  assertions++;
  if (actual !== expected) failures.push({ check, actual: String(actual), expected: String(expected), detail });
}

const login = await request("/auth/login", undefined, {
  method: "POST",
  body: JSON.stringify({ email: "admin@qmpulse.com", password }),
});
expect("admin login", login.status, 200, (login.body as any)?.error);
const token = String((login.body as any)?.token ?? "");

const malformedIdMutations = [
  ["PATCH", "/projects/not-a-number", {}],
  ["DELETE", "/projects/not-a-number", undefined],
  ["PATCH", "/milestones/not-a-number", {}],
  ["DELETE", "/milestones/not-a-number", undefined],
  ["PATCH", "/requirements/not-a-number", {}],
  ["DELETE", "/requirements/not-a-number", undefined],
  ["PATCH", "/test-cases/not-a-number", {}],
  ["DELETE", "/test-cases/not-a-number", undefined],
  ["PATCH", "/tasks/not-a-number", {}],
  ["DELETE", "/tasks/not-a-number", undefined],
  ["PATCH", "/risks/not-a-number", {}],
  ["DELETE", "/risks/not-a-number", undefined],
  ["PATCH", "/defects/not-a-number", {}],
  ["DELETE", "/defects/not-a-number", undefined],
  ["PATCH", "/users/not-a-number", {}],
  ["DELETE", "/users/not-a-number", undefined],
  ["PATCH", "/teams/not-a-number", {}],
  ["DELETE", "/teams/not-a-number", undefined],
  ["PATCH", "/modules/not-a-number", {}],
  ["DELETE", "/modules/not-a-number", undefined],
] as const;

for (const [method, path, body] of malformedIdMutations) {
  const result = await request(path, token, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  expect(`${method} ${path} returns controlled 4xx`, result.status >= 400 && result.status < 500, true, `${result.status}: ${(result.body as any)?.error ?? ""}`);
}

const invalidCreates = [
  ["/projects", {}],
  ["/milestones", {}],
  ["/requirements", {}],
  ["/test-cases", {}],
  ["/tasks", {}],
  ["/risks", {}],
  ["/defects", {}],
  ["/users", {}],
  ["/teams", {}],
  ["/modules", {}],
] as const;

for (const [path, body] of invalidCreates) {
  const result = await request(path, token, { method: "POST", body: JSON.stringify(body) });
  expect(`POST ${path} rejects incomplete payload`, result.status >= 400 && result.status < 500, true, `${result.status}: ${(result.body as any)?.error ?? ""}`);
}

const malformedJson = await fetch(`${baseUrl}/projects`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: "{not-json",
  signal: AbortSignal.timeout(15_000),
});
expect("malformed JSON is a controlled client error", malformedJson.status >= 400 && malformedJson.status < 500, true, String(malformedJson.status));

console.log(JSON.stringify({ assertions, passed: assertions - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exit(1);
