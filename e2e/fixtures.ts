import { test as base } from "@playwright/test";
import { readSession, type Session } from "./session";

/**
 * storageState restores localStorage only. The app also accepts the token from
 * sessionStorage (finding #9 in QAPulse-LOCAL-SETUP.md), and the Puppeteer
 * walker this suite replaces used that path — so mirror the token into
 * sessionStorage on every document, keeping both read paths exercised.
 */
export const test = base.extend<{ session: Session }>({
  session: async ({ page }, use) => {
    const session = readSession();
    await page.addInitScript((data: Session) => {
      sessionStorage.setItem("qa_pulse_token", data.token);
      sessionStorage.setItem("qa_pulse_refresh_token", data.refreshToken ?? "");
      sessionStorage.setItem("qa_pulse_user", JSON.stringify(data.user));
    }, session);
    await use(session);
  },
});

export { expect } from "@playwright/test";
