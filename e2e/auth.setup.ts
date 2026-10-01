import fs from "node:fs";
import path from "node:path";
import { expect, request, test as setup } from "@playwright/test";
import { AUTH_DIR, SESSION_FILE, STATE_FILE, type Session } from "./session";

/**
 * There is no login form worth automating — the app authenticates by holding a
 * JWT in web storage, so we mint one over the API and plant it.
 *
 * Which storage matters: `getAuthToken()` in artifacts/qm-pulse/src/lib/api.ts
 * reads localStorage first, sessionStorage second, keyed on the "Remember Me"
 * flag. Playwright's storageState can only carry localStorage, so we persist the
 * localStorage copy here and let ./session.ts re-plant the sessionStorage copy
 * per context. Both are populated so either read path finds the token.
 */
setup("authenticate as admin", async ({ baseURL }) => {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@qmpulse.com";
  const password = process.env.QMPULSE_TEST_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD;
  expect(password, "set QMPULSE_TEST_PASSWORD (or SEED_ADMIN_PASSWORD) in .env").toBeTruthy();

  const api = await request.newContext({ baseURL });
  const response = await api.post("/api/auth/login", { data: { email, password } });
  expect(response.ok(), `login failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  const session = (await response.json()) as Session;
  expect(session.token, "login returned no token").toBeTruthy();
  await api.dispose();

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));

  // Hand-built storageState: no browser needed just to set three keys.
  const origin = new URL(baseURL!).origin;
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin,
            localStorage: [
              { name: "qa_pulse_remember_me", value: "true" },
              { name: "qa_pulse_token", value: session.token },
              { name: "qa_pulse_refresh_token", value: session.refreshToken ?? "" },
              { name: "qa_pulse_user", value: JSON.stringify(session.user) },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );

  expect(fs.existsSync(path.resolve(STATE_FILE))).toBeTruthy();
});
