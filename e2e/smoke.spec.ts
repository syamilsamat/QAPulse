import { expect as baseExpect, test as baseTest } from "@playwright/test";
import { readSession } from "./session";
import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("dashboard renders for an authenticated admin", async ({ page, session }) => {
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(response?.status(), "dashboard document").toBe(200);

    // The app redirects unauthenticated visitors to /login (App.tsx:118), so
    // staying on /dashboard is the real assertion that the planted token worked.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("body")).not.toContainText(/sign in|log in to/i);

    await expect
      .poll(async () => (await page.locator("body").innerText()).trim().length, { timeout: 60_000 })
      .toBeGreaterThan(80);

    expect(session.user.role).toBe("admin");
  });
});

// Auth is a Bearer header read from web storage, not a cookie, so storageState
// buys a request context nothing — send the token explicitly.
baseTest("the API is reachable through the dev proxy", async ({ request }) => {
  const { token } = readSession();
  const response = await request.get("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
  baseExpect(response.status(), await response.text()).toBe(200);
});
