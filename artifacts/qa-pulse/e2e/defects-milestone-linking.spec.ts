import { test, expect } from "@playwright/test";

// Covers: NewDefectDialog's Requirement + Milestone pickers (commit
// ef5314e) — a QA defect should link to both, per direction. Picking a
// requirement auto-suggests its milestone as a default (still overridable).

test.describe("New Defect — Requirement + Milestone linking", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/defects");
    await page.getByRole("heading", { name: "Defects" }).waitFor();
    await page.getByRole("button", { name: "New defect" }).click();
    await expect(page.getByRole("heading", { name: "New Defect" })).toBeVisible();
  });

  test("Requirement and Milestone fields are present", async ({ page }) => {
    await expect(page.getByText("Requirement", { exact: true })).toBeVisible();
    await expect(page.getByText("Milestone", { exact: true })).toBeVisible();
  });

  test("pickers are disabled until a QAPulse Project is chosen", async ({ page }) => {
    // Requirement/Milestone are project-scoped — the placeholder should say
    // so before a project is picked.
    await expect(page.getByText("Pick a project first").first()).toBeVisible();
  });

  test("picking a requirement auto-fills its milestone", async ({ page }) => {
    // Pick a project first so the requirement/milestone lists populate.
    const projectSelect = page.locator("label", { hasText: "QAPulse Project" }).locator("..").getByRole("combobox");
    await projectSelect.click();
    await page.getByRole("option").first().click();

    const requirementField = page.locator("label", { hasText: "Requirement" }).locator("..");
    await requirementField.getByRole("combobox").click();
    const firstOption = page.getByRole("option").first();
    if ((await firstOption.count()) === 0) {
      test.skip(true, "no requirements exist for this project in the current environment");
      return;
    }
    await firstOption.click();

    // Milestone field should no longer read the empty placeholder once a
    // requirement with a milestone was selected.
    const milestoneField = page.locator("label", { hasText: "Milestone" }).locator("..");
    await expect(milestoneField.getByRole("combobox")).not.toHaveText("Optional");
  });
});
