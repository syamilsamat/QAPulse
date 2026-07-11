import type { Page } from "@playwright/test";

/** Opens the Requirements list and waits for at least one row to render. */
export async function gotoRequirements(page: Page) {
  await page.goto("/requirements");
  await page.getByRole("heading", { name: "Requirements" }).waitFor();
  // The list renders as a table (desktop) — wait for the first data row.
  await page.locator("table tbody tr, [role='row']").first().waitFor({ timeout: 10_000 }).catch(() => {});
}

// The title cell renders as a <span> (tree view) or <p> (flat view), both
// with a font-medium class — cast a wide net across both view modes.
const TITLE_SELECTOR = "span.font-medium, p.font-medium, a";

/**
 * Finds the first requirement row whose visible text includes the given
 * status/badge label (e.g. "Approved", "Draft") and returns its title text
 * plus a locator for the row. Returns null if none match — callers should
 * skip the test rather than fail when demo data doesn't have that state.
 */
export async function findRequirementRowByBadge(page: Page, badgeText: string) {
  await gotoRequirements(page);
  const row = page.locator("tr", { hasText: badgeText }).first();
  if ((await row.count()) === 0) return null;
  const titleLink = row.locator(TITLE_SELECTOR).first();
  const title = (await titleLink.textContent())?.trim() ?? null;
  return title ? { row, title } : null;
}

/** Clicks a requirement's title in the list to open its detail page. */
export async function openFirstRequirement(page: Page) {
  await gotoRequirements(page);
  const titleCell = page.locator("table tbody tr").first().locator(TITLE_SELECTOR).first();
  const title = (await titleCell.textContent())?.trim();
  await titleCell.click();
  await page.waitForURL(/\/requirements\/\d+/, { timeout: 10_000 });
  return title;
}

/**
 * The Requirements list doesn't show reviewStatus per row, so finding an
 * Approved one means checking detail pages directly. Walks the first
 * `limit` rows' detail pages and returns the id of the first Approved one
 * found, or null. Used by specs that need an approved requirement (the
 * Requirement Defect card, dev handoff) since those features only appear
 * post-approval.
 */
export async function findApprovedRequirementId(page: Page, limit = 15): Promise<number | null> {
  await gotoRequirements(page);
  const rows = page.locator("table tbody tr");
  const count = Math.min(await rows.count(), limit);
  for (let i = 0; i < count; i++) {
    const titleCell = rows.nth(i).locator(TITLE_SELECTOR).first();
    if ((await titleCell.count()) === 0) continue;
    await titleCell.click();
    await page.waitForURL(/\/requirements\/\d+/, { timeout: 10_000 });
    const approved = await page.getByText("Approved", { exact: true }).first().isVisible().catch(() => false);
    if (approved) {
      const match = page.url().match(/\/requirements\/(\d+)/);
      return match ? Number(match[1]) : null;
    }
    await page.goBack();
    await gotoRequirements(page);
  }
  return null;
}
