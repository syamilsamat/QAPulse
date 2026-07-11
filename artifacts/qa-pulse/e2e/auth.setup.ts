import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

// Runs once before the suite (see playwright.config.ts's "setup" project +
// the chromium project's dependency on it) and saves a logged-in session
// so every spec reuses it instead of re-authenticating per test.
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL and TEST_USER_PASSWORD must be set — see .env.example. " +
        "Never hardcode credentials in a spec file.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Landing on the dashboard (or anywhere past /login) confirms auth succeeded.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});
