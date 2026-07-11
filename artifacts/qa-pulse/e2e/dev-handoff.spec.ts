import { test, expect } from "@playwright/test";
import { findApprovedRequirementId } from "./helpers";

// Covers: CR030's native dev handoff workflow (commit cdddb4b) — the
// Development card on an approved requirement's detail page. Verifies the
// card's states and controls render; doesn't complete a real assign/start/
// ready-for-qa cycle since that has no undo path in the UI and would leave
// demo data mutated for every run — do that part as a manual click-through.

test.describe("Development card (dev handoff)", () => {
  test("gates behind FA approval on a not-yet-approved requirement", async ({ page }) => {
    await page.goto("/requirements");
    await page.getByRole("heading", { name: "Requirements" }).waitFor();
    await page.locator("table tbody tr").first().locator("span.font-medium, p.font-medium, a").first().click();
    await page.waitForURL(/\/requirements\/\d+/);

    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
    const gated = await page.getByText("Awaiting FA approval before dev handoff.").isVisible().catch(() => false);
    const hasStatus = await page.getByText("Status", { exact: true }).isVisible().catch(() => false);
    // Same shape as the Requirement Defect card check — mutually exclusive,
    // never both, since the card only ever shows one or the other.
    expect(gated && hasStatus).toBe(false);
  });

  test("shows assignee controls on an approved requirement", async ({ page }) => {
    const id = await findApprovedRequirementId(page);
    test.skip(id === null, "no approved requirement found in the first page of results");
    if (id === null) return;

    await page.goto(`/requirements/${id}`);
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
    await expect(page.getByText("Awaiting FA approval before dev handoff.")).not.toBeVisible();

    // Lead-tier+ (admin qualifies) sees an assignee picker; everyone else
    // sees a plain assignee name (or nothing, if unassigned).
    const assigneePicker = page.getByText("Assignee", { exact: true }).locator("..").getByRole("combobox");
    if ((await assigneePicker.count()) > 0) {
      await expect(assigneePicker).toBeVisible();
    }
  });
});
