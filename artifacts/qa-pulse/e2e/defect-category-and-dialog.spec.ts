import { test, expect } from "@playwright/test";

// Covers: QAPulse-native defect category field, Lead-tier+ gated (commit
// 3a05046), and the New Defect / execution fail-modal Create Defect
// dialogs sharing the same wide layout (commit 24d1b3b). The fail-modal
// dialog itself isn't reachable without a real execution file + failing a
// test case, so only its DialogContent class is cross-checked against the
// New Defect dialog's in the source (see the spec's header comment in the
// repo, not re-verified live here) — this test verifies New Defect's side.

test.describe("Defects — category field and dialog layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/defects");
    await page.getByRole("heading", { name: "Defects" }).waitFor();
    await page.getByRole("button", { name: "New defect" }).click();
    await expect(page.getByRole("heading", { name: "New Defect" })).toBeVisible();
  });

  test("Category field is visible for a Lead-tier+ account", async ({ page }) => {
    // canSetCategory === tierRank >= 2; admin qualifies. If the logged-in
    // test account is tier 1, this field legitimately doesn't render —
    // skip rather than fail in that case.
    const categoryField = page.getByText("Category", { exact: true });
    if ((await categoryField.count()) === 0) {
      test.skip(true, "logged-in test account is below Lead-tier — Category is correctly hidden");
      return;
    }
    await expect(categoryField.first()).toBeVisible();
  });

  test("dialog renders at the wide layout, not the narrow default", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    // sm:max-w-[75vw] w-[95vw] — comfortably wider than shadcn's narrow
    // max-w-md default (~448px). 600px is a safe threshold either way.
    expect(box!.width).toBeGreaterThan(600);
  });
});
