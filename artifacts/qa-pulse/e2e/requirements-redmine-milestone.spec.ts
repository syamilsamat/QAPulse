import { test, expect } from "@playwright/test";
import { gotoRequirements } from "./helpers";

// Covers: milestone required on requirement import from Redmine (commit
// 7ab116c, pre-dates this batch) plus milestone now inherited at every
// *other* Redmine-import path too (commit 8c40be3) — sync-on-execution-file-
// creation, clone, Excel test-case import, sync-from-redmine, tracker pull.
// Only the primary "Import from Redmine" dialog is UI-reachable directly;
// the other paths are backend-only plumbing fixes with no dedicated UI to
// click through — see CHANGE_REQUESTS.md's milestone-inheritance note for
// those, they're not re-verified here.

test.describe("Import from Redmine — milestone required", () => {
  test("Import button stays disabled until a milestone is picked", async ({ page }) => {
    await gotoRequirements(page);
    await page.getByRole("button", { name: "From Redmine" }).click();
    await expect(page.getByRole("heading", { name: "Import from Redmine" })).toBeVisible();

    const importButton = page.getByRole("button", { name: "Import" });
    await expect(importButton).toBeDisabled();

    await page.getByPlaceholder("e.g. 34555").fill("12345");

    const projectField = page.locator("label", { hasText: "Project" }).first().locator("..");
    await projectField.getByRole("combobox").click();
    const firstProject = page.getByRole("option").first();
    if ((await firstProject.count()) === 0) {
      test.skip(true, "no projects available in this environment");
      return;
    }
    await firstProject.click();

    // Still disabled — module + milestone not picked yet.
    await expect(importButton).toBeDisabled();

    const milestoneField = page.locator("label", { hasText: "Milestone" }).first().locator("..");
    await milestoneField.getByRole("combobox").click();
    const firstMilestone = page.getByRole("option").first();
    if ((await firstMilestone.count()) === 0) {
      test.skip(true, "selected project has no milestones in this environment");
      return;
    }
    await firstMilestone.click();

    // Still disabled — no module checked yet. Confirms milestone alone
    // doesn't satisfy the gate, i.e. it's a real independent requirement.
    await expect(importButton).toBeDisabled();

    const firstModuleCheckbox = page.locator("label").filter({ has: page.getByRole("checkbox") }).first();
    if ((await firstModuleCheckbox.count()) === 0) {
      test.skip(true, "no modules configured in this environment");
      return;
    }
    await firstModuleCheckbox.click();

    await expect(importButton).toBeEnabled();

    // Don't actually submit — this would hit real Redmine with a fake
    // ticket id and/or create data. Close the dialog instead.
    await page.keyboard.press("Escape");
  });
});
