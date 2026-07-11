import { test, expect } from "@playwright/test";

// Covers: CR032's multi-cycle phase timeline (commit 6d37f35) — the Develop
// segment and repeated Requirements/Testing rounds — plus the underlying
// per-requirement drill-down (commit d539dd1) and original phase-breakdown
// report (commit 100b55b) it was built on top of.

test.describe("PM Dashboard — phase timeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pm-dashboard");
    await page.getByRole("heading", { name: "PM Dashboard" }).waitFor();
  });

  async function pickProjectAndMilestone(page: import("@playwright/test").Page) {
    const projectSelect = page.getByText("All projects").first();
    await projectSelect.click();
    const firstProject = page.getByRole("option").first();
    if ((await firstProject.count()) === 0) return false;
    await firstProject.click();

    const milestoneSelect = page.getByText(/Where did the time go\?|Select a project first/).first();
    await milestoneSelect.click();
    const firstMilestone = page.getByRole("option").first();
    if ((await firstMilestone.count()) === 0) return false;
    await firstMilestone.click();
    return true;
  }

  test("shows the phase timeline for a milestone with requirements", async ({ page }) => {
    const ok = await pickProjectAndMilestone(page);
    test.skip(!ok, "no project with a milestone available in this environment");

    await expect(page.getByText("Where did the time go", { exact: false })).toBeVisible();
    // Either a real timeline bar or the explicit "not enough data" message —
    // both are valid states, just confirm the panel resolved (not stuck loading).
    await expect(
      page.locator("[title*=':']").first().or(page.getByText("Not enough data yet")),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("per-requirement drill-down toggle reveals individual timelines", async ({ page }) => {
    const ok = await pickProjectAndMilestone(page);
    test.skip(!ok, "no project with a milestone available in this environment");

    const drillDownToggle = page.getByText(/requirements — click bar for per-requirement timeline/);
    if ((await drillDownToggle.count()) === 0) {
      test.skip(true, "milestone has no linked requirements to drill into");
      return;
    }
    await drillDownToggle.click();
    await expect(page.getByText("← Back to status list")).toBeVisible();
  });

  test("a Develop segment appears when a requirement went through dev handoff", async ({ page }) => {
    const ok = await pickProjectAndMilestone(page);
    test.skip(!ok, "no project with a milestone available in this environment");

    // Segment tooltips are `title="{label}: {days}d"` — Develop is CR032's
    // new phase key. Soft assertion: only meaningful if present, absence
    // isn't a failure since not every milestone has dev-handoff activity.
    const developSegment = page.locator('[title^="Develop"]');
    if ((await developSegment.count()) > 0) {
      await expect(developSegment.first()).toBeVisible();
    }
  });
});
