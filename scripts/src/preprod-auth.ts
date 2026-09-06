type Json = Record<string, any> | any[] | null;

export {};

const rawBaseUrl = process.env.QAPULSE_BASE_URL;
const password = process.env.QAPULSE_TEST_PASSWORD;
if (!rawBaseUrl || !password) {
  console.error("Set QAPULSE_BASE_URL and QAPULSE_TEST_PASSWORD before running preprod:auth.");
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

function expectStatus(check: string, result: Awaited<ReturnType<typeof request>>, expected: number) {
  expect(check, result.status, expected, (result.body as any)?.error);
}

const invalid = await request("/auth/login", undefined, {
  method: "POST",
  body: JSON.stringify({ email: "admin@qapulse.com", password: `${password}-incorrect` }),
});
expectStatus("invalid credentials rejected", invalid, 401);

const unknown = await request("/auth/login", undefined, {
  method: "POST",
  body: JSON.stringify({ email: "not-a-user@qapulse.invalid", password }),
});
expectStatus("unknown account rejected", unknown, 401);
expect("login errors do not reveal account existence", (invalid.body as any)?.error, (unknown.body as any)?.error);

const login = await request("/auth/login", undefined, {
  method: "POST",
  body: JSON.stringify({ email: "qa1@qapulse.com", password }),
});
expectStatus("valid login", login, 200);
const accessToken = String((login.body as any)?.token ?? "");
const refreshToken = String((login.body as any)?.refreshToken ?? "");
const userId = Number((login.body as any)?.user?.id);
expect("login returns access token", accessToken.length > 20, true);
expect("login returns refresh token", refreshToken.length > 20, true);
expectStatus("access token reads current user", await request("/auth/me", accessToken), 200);

const anonymousPasswordChange = await request("/auth/change-password", undefined, {
  method: "POST",
  body: JSON.stringify({ userId, newPassword: "NeverApply-123!" }),
});
expectStatus("anonymous password reset rejected", anonymousPasswordChange, 401);

const omittedCurrentPassword = await request("/auth/change-password", accessToken, {
  method: "POST",
  body: JSON.stringify({ userId, newPassword: "NeverApply-123!" }),
});
expectStatus("normal password change requires current password", omittedCurrentPassword, 400);

const crossAccountPasswordChange = await request("/auth/change-password", accessToken, {
  method: "POST",
  body: JSON.stringify({ userId: userId + 1, newPassword: "NeverApply-123!" }),
});
expectStatus("cross-account password reset rejected", crossAccountPasswordChange, 403);

const refreshed = await request("/auth/refresh", undefined, {
  method: "POST",
  body: JSON.stringify({ refreshToken }),
});
expectStatus("refresh token rotates", refreshed, 200);
const rotatedAccessToken = String((refreshed.body as any)?.token ?? "");
const rotatedRefreshToken = String((refreshed.body as any)?.refreshToken ?? "");
expect("rotation returns a different access token", rotatedAccessToken !== accessToken, true);
expect("rotation returns a different refresh token", rotatedRefreshToken !== refreshToken, true);
expectStatus("rotated access token works", await request("/auth/me", rotatedAccessToken), 200);

const replay = await request("/auth/refresh", undefined, {
  method: "POST",
  body: JSON.stringify({ refreshToken }),
});
expectStatus("rotated refresh token cannot be replayed", replay, 401);

const logout = await request("/auth/logout", rotatedAccessToken, {
  method: "POST",
  body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
});
expectStatus("logout succeeds", logout, 200);
expectStatus("logged-out access token is revoked", await request("/auth/me", rotatedAccessToken), 401);
const revokedRefresh = await request("/auth/refresh", undefined, {
  method: "POST",
  body: JSON.stringify({ refreshToken: rotatedRefreshToken }),
});
expectStatus("logged-out refresh token is revoked", revokedRefresh, 401);

console.log(JSON.stringify({ assertions, passed: assertions - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exit(1);
