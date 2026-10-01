import { expect, test } from "./fixtures";
import { DESKTOP_ROUTES, RESPONSIVE_ROUTES } from "./routes";

/**
 * Port of the Puppeteer route walk in
 * artifacts/api-server/scripts/preprod-browser.mjs. Same five assertions per
 * route, same route lists, but one Playwright test per route so a single broken
 * page names itself instead of landing in a JSON blob at the end.
 *
 * Desktop walks all 25 routes; the phone and tablet projects walk the
 * responsive subset (config decides which project runs this file at which
 * viewport).
 */

/**
 * Errors tolerated because they are known local-environment gaps, not app
 * regressions. Every entry needs a reason — never widen this to silence a real
 * bug. Tolerated errors are recorded as a `known-issue` annotation on the test
 * so they stay visible in the report.
 *
 * - /api/redmine/*: the Defects page fetches Redmine trackers on mount, and a
 *   local stack has no Redmine credentials, so the upstream 401 surfaces as a
 *   500 (artifacts/api-server/src/routes/redmine.ts:311 maps every upstream
 *   failure to 500). Drop this once local Redmine is configured, or once that
 *   route degrades gracefully.
 */
const KNOWN_ISSUES = [/\/api\/redmine\//];
const isKnown = (error: string) => KNOWN_ISSUES.some((pattern) => pattern.test(error));

const routes = (project: string) => (project === "desktop" ? DESKTOP_ROUTES : RESPONSIVE_ROUTES);

for (const route of DESKTOP_ROUTES) {
  test(`walk ${route}`, async ({ page }, testInfo) => {
    test.skip(!routes(testInfo.project.name).includes(route as never), "not in this viewport's route list");

    // Collected per navigation, exactly as the Puppeteer version did.
    const errors: string[] = [];
    const record = (error: string) => {
      if (isKnown(error)) testInfo.annotations.push({ type: "known-issue", description: error });
      else errors.push(error);
    };

    page.on("pageerror", (error) => record(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
        record(message.text());
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/api/")) {
        record(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect.soft([200, 304], "document loaded").toContain(response?.status());

    // The original slept 1.2s to let queries settle; wait on the network instead
    // and fall back to that sleep when a page polls and never goes idle.
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => page.waitForTimeout(1_200));

    const state = await page.evaluate(() => ({
      textLength: document.body.innerText.trim().length,
      hasFatalText: /something went wrong|application error|failed to fetch/i.test(document.body.innerText),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

    expect.soft(state.textLength, "renders content").toBeGreaterThan(80);
    expect.soft(state.hasFatalText, "no fatal error screen").toBe(false);
    expect.soft(errors.slice(0, 3).join(" | "), "no page/console errors").toBe("");
    expect.soft(state.overflow, "no document overflow").toBeLessThanOrEqual(2);
  });
}
