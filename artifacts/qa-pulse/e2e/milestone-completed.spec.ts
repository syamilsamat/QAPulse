import { test, expect } from "@playwright/test";

// Covers: milestones gain a completedAt timestamp, auto-stamped when marked
// Completed (commit 448a236). There's no dedicated UI display for the raw
// timestamp itself — it's consumed internally by PM Dashboard's phase-
// breakdown queries (milestoneCompletedAt bounds the last open phase
// segment) — so this only verifies the status-change affordance exists and
// results in the Completed badge; it does not flip real demo data to
// Completed, since that would change what PM Dashboard reports on every run.

test.describe("Milestones — Completed status", () => {
  test("edit form offers a Completed status option", async ({ page }) => {
    await page.goto("/milestones");
    await page.getByRole("heading", { name: "Milestones" }).waitFor();

    const editButton = page.getByRole("button", { name: "Edit" }).first();
    if ((await editButton.count()) === 0) {
      test.skip(true, "no milestones exist in this environment");
      return;
    }
    await editButton.click();

    const statusField = page.getByText("Status", { exact: true }).locator("..").getByRole("combobox");
    await statusField.click();
    await expect(page.getByRole("option", { name: "Completed" })).toBeVisible();

    // Don't actually save — leaves demo data (and PM Dashboard's reports
    // built on it) untouched.
    await page.keyboard.press("Escape");
  });

  test("a milestone already marked Completed shows the Completed badge", async ({ page }) => {
    await page.goto("/milestones");
    await page.getByRole("heading", { name: "Milestones" }).waitFor();

    const completedBadge = page.getByText("Completed", { exact: true });
    if ((await completedBadge.count()) === 0) {
      test.skip(true, "no completed milestones exist in this environment");
      return;
    }
    await expect(completedBadge.first()).toBeVisible();
  });
});
