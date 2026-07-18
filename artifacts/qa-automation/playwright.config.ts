import { defineConfig, devices } from "@playwright/test";

/**
 * QAPulse automation — runs against a live QAPulse instance (local or Replit).
 *
 *   QAPULSE_BASE_URL   the URL you open QAPulse at in the browser
 *                      (no trailing slash, no /api suffix). Defaults to
 *                      http://localhost:5000 for local runs.
 *   QAPULSE_ADMIN_EMAIL / QAPULSE_ADMIN_PASSWORD
 *                      an admin account used by global-setup to bootstrap the
 *                      dedicated "PW Automation" project, modules, and actor
 *                      users. Defaults match scripts/seed-client.ts.
 *
 * The suites mutate data (requirements, defects, notifications), so they run
 * single-worker against the shared backend — parallel workers would race on
 * notification-count assertions.
 */
export const BASE_URL = (
  process.env.QAPULSE_BASE_URL ??
  process.env.QAPULSE_API_URL ?? // same var the seed scripts use
  "http://localhost:5000"
).replace(/\/$/, "");

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
