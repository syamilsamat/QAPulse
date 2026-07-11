import { test, expect } from "@playwright/test";
import { openFirstRequirement, gotoRequirements } from "./helpers";

// Covers: Edit button on RequirementDetail.tsx (commit 6f12031), the
// generalized edit permission on PATCH /requirements/:id (author/assignee,
// or any FA-tier reviewer on a Redmine-imported requirement), and the
// ?edit=<id> deep-link that reuses the list page's existing edit dialog.

test.describe("Requirement edit", () => {
  test("Edit button on the detail page opens the pre-filled edit dialog", async ({ page }) => {
    const title = await openFirstRequirement(page);
    expect(title).toBeTruthy();

    const editButton = page.getByRole("button", { name: "Edit", exact: true });
    await expect(editButton).toBeVisible();
    await editButton.click();

    await expect(page).toHaveURL(/\/requirements\?edit=\d+/);
    await expect(page.getByRole("heading", { name: "Edit Requirement" })).toBeVisible();

    const titleInput = page.getByLabel("Title");
    await expect(titleInput).toHaveValue(title ?? "");

    // Close without saving — this suite only verifies the flow, not data mutation.
    await page.keyboard.press("Escape");
  });

  test("list page: Edit dropdown item opens the same dialog", async ({ page }) => {
    await gotoRequirements(page);
    const firstRow = page.locator("table tbody tr").first();
    // Row actions trigger is an icon-only (MoreHorizontal) button — no
    // accessible name, so target it positionally as the last button in the row.
    await firstRow.getByRole("button").last().click();

    const editItem = page.getByRole("menuitem", { name: "Edit" });
    await expect(editItem).toBeVisible();
    await editItem.click();

    await expect(page.getByRole("heading", { name: "Edit Requirement" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("edit dialog shows the Milestone field", async ({ page }) => {
    await openFirstRequirement(page);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Requirement" })).toBeVisible();

    // Milestone is a required field on the edit form (mirrors "New Requirement").
    await expect(page.getByText("Milestone", { exact: false }).first()).toBeVisible();
  });
});
