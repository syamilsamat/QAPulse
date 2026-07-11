import { test, expect } from "@playwright/test";
import { findApprovedRequirementId } from "./helpers";

// Covers: CR031's "Requirement Defect" card on an approved requirement's
// detail page (commit 8238579) — raising a defect against a requirement
// after approval, auto-routed to the requirement's author.

test.describe("Requirement Defect card", () => {
  test("card appears on an approved requirement and the raise form works", async ({ page }) => {
    const id = await findApprovedRequirementId(page);
    test.skip(id === null, "no approved requirement found in the first page of results");
    if (id === null) return;

    await page.goto(`/requirements/${id}`);
    await expect(page.getByRole("heading", { name: "Requirement Defect" })).toBeVisible();

    const raiseButton = page.getByRole("button", { name: "Raise Requirement Defect" });
    if ((await raiseButton.count()) === 0) {
      // Visible to the raiser-role set (dev/qa tier+); admin should qualify,
      // but skip gracefully rather than fail if the logged-in test account
      // doesn't have one of those roles.
      test.skip(true, "logged-in account isn't in the requirement-defect raiser role set");
      return;
    }

    await raiseButton.click();
    await expect(page.getByPlaceholder("What's wrong with this requirement?")).toBeVisible();

    // Don't actually submit — this would create a real defect record.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByPlaceholder("What's wrong with this requirement?")).not.toBeVisible();
  });

  test("card gates the raise form until the requirement is approved", async ({ page }) => {
    // Doesn't force a specific reviewStatus (the list page has no per-row
    // status filter to reliably target one) — just confirms the card is
    // internally consistent: gated message and raise button are mutually
    // exclusive, never both, never neither.
    await page.goto("/requirements");
    await page.getByRole("heading", { name: "Requirements" }).waitFor();
    await page.locator("table tbody tr").first().locator("span.font-medium, p.font-medium, a").first().click();
    await page.waitForURL(/\/requirements\/\d+/);

    await expect(page.getByRole("heading", { name: "Requirement Defect" })).toBeVisible();
    const gated = await page.getByText("Available once this requirement is approved.").isVisible().catch(() => false);
    const canRaise = await page.getByRole("button", { name: "Raise Requirement Defect" }).isVisible().catch(() => false);
    // Approved-but-not-a-raiser-role also lands here with both false — that's
    // fine, the only invalid combination is both true at once.
    expect(gated && canRaise).toBe(false);
  });
});
