import { defineConfig, devices } from "@playwright/test";

/**
 * QAPulse E2E. Assumes the local stack from QAPulse-LOCAL-SETUP.md is already
 * running (Vite dev on 5173, api-server on 8080, docker `qmpulse-db`), so no
 * `webServer` block — see finding #6, the two servers need distinct PORTs that
 * only the human-run commands supply.
 *
 * Timeouts are deliberately generous: Vite dev transforms this app's routes
 * cold on first navigation, which is far slower than a built bundle.
 */
const baseURL = process.env.QMPULSE_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.output",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    navigationTimeout: 180_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "./e2e/.auth/state.json" },
    },
    {
      // co2-skills conductors (conductor-defect, conductor-feature-develop) write
      // one-off specs into `<app>/context/bug/<module>/<BUG-XXX>/` and run them as
      // `playwright test <path> --config=playwright.config.ts`. Those paths sit
      // outside the suite's testDir, so without a project that owns them the run
      // dies with "No tests found". Project-level testDir widens the net without
      // letting the main suite scan the whole repo.
      name: "bugs",
      dependencies: ["setup"],
      testDir: ".",
      // Layout-agnostic on purpose: matches `<app>/context/bug/**` whether the app
      // folder sits at the repo root (co2's own convention) or under artifacts/.
      // Playwright normalises separators to "/" before matching, so no \ branch.
      testMatch: /(^|\/)[^\/]+\/context\/bug\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "./e2e/.auth/state.json" },
    },
    {
      name: "phone",
      dependencies: ["setup"],
      testMatch: /routes\.spec\.ts/,
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 }, storageState: "./e2e/.auth/state.json" },
    },
    {
      name: "tablet",
      dependencies: ["setup"],
      testMatch: /routes\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, storageState: "./e2e/.auth/state.json" },
    },
  ],
});
