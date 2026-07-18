/**
 * Case-linked Playwright test wrapper.
 *
 * Every automated test is declared through qcase(caseId, ...) so the Excel
 * Case ID (docs/test-plans/*.xlsx, "Test Step" sheet, column A) is carried in
 * both the test title ("SMOKE-001 · Valid login") and a structured
 * `test-case` annotation — which reporters (and the future CR009
 * Playwright→QAPulse reporter, which upserts by caseId) can key on.
 */
import { test as base, expect, type Page } from "@playwright/test";
import { Api } from "./api";
import { ACTOR_PASSWORD, loadWorld, uniq, type Actor, type World } from "./world";

export { expect, uniq, ACTOR_PASSWORD };
export type { Actor, World };

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface Fixtures {
  world: World;
  /** API client bound to an actor's token. */
  as: (actor: Actor) => Api;
  /** Admin API client. */
  admin: Api;
  /** Anonymous API client (no token). */
  anon: Api;
  /**
   * Browser login via storage injection: performs a real /auth/login for a
   * fresh token, plants it exactly like "Remember me" does
   * (AuthContext.tsx storage keys), then lands on /dashboard.
   */
  loginAs: (actor: Actor, landing?: string) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  world: async ({}, use) => {
    await use(loadWorld());
  },
  as: async ({ world }, use) => {
    await use((actor: Actor) => new Api(world.baseUrl, actor.token));
  },
  admin: async ({ world }, use) => {
    await use(new Api(world.baseUrl, world.admin.token));
  },
  anon: async ({ world }, use) => {
    await use(new Api(world.baseUrl, null));
  },
  loginAs: async ({ page, world }, use) => {
    await use(async (actor: Actor, landing = "/dashboard") => {
      const session = await new Api(world.baseUrl).login(actor.email, ACTOR_PASSWORD);
      await page.addInitScript(
        ([token, user, refresh]) => {
          localStorage.setItem("qa_pulse_remember_me", "true");
          localStorage.setItem("qa_pulse_token", token);
          localStorage.setItem("qa_pulse_user", user);
          localStorage.setItem("qa_pulse_refresh_token", refresh);
        },
        [session.token, JSON.stringify(session.user), session.refreshToken] as const,
      );
      await page.goto(landing);
    });
  },
});

// ── Case-linked declarations ──────────────────────────────────────────────────

type TestBody = Parameters<typeof test>[2];

function caseTitle(caseId: string, title: string): string {
  return `${caseId} · ${title}`;
}

function caseDetails(caseId: string, note?: string) {
  const suite = caseId.split("-")[0].toLowerCase(); // SMOKE-001 → @smoke
  return {
    tag: `@${suite}`,
    annotation: [
      { type: "test-case", description: caseId },
      ...(note ? [{ type: "note", description: note }] : []),
    ],
  };
}

/** Declare an automated test linked to an Excel Case ID. */
export const qcase = Object.assign(
  (caseId: string, title: string, body: TestBody): void => {
    test(caseTitle(caseId, title), caseDetails(caseId), body);
  },
  {
    /**
     * A case that stays manual by nature (visual judgement, external mailbox,
     * AI output quality, live Redmine …). Declared so the run report and the
     * traceability matrix still account for it — shows as skipped.
     */
    manual: (caseId: string, title: string, reason: string): void => {
      test.skip(caseTitle(caseId, title), caseDetails(caseId, `manual-only: ${reason}`), async () => {});
    },
    /** Automatable, but blocked on something — shows as fixme. */
    fixme: (caseId: string, title: string, reason: string): void => {
      test.fixme(caseTitle(caseId, title), caseDetails(caseId, reason), async () => {});
    },
  },
);

// ── Shared workflow factories (API-first, same calls the UI makes) ────────────

export interface Requirement {
  id: number;
  title: string;
  reviewStatus?: string;
  devStatus?: string | null;
  [key: string]: unknown;
}

/** Create a draft requirement in the world project (default author: fa). */
export async function createRequirement(
  author: Api,
  world: World,
  overrides: Record<string, unknown> = {},
): Promise<Requirement> {
  return author.post<Requirement>("/requirements", {
    title: uniq("PW req"),
    description: "Created by the QAPulse Playwright suite.",
    module: world.modules.alpha.name,
    projectId: world.project.id,
    ...overrides,
  });
}

/** submit (author) → approve (faLead): returns the approved requirement. */
export async function approvedRequirement(
  world: World,
  overrides: Record<string, unknown> = {},
): Promise<Requirement> {
  const fa = new Api(world.baseUrl, world.actors.fa.token);
  const faLead = new Api(world.baseUrl, world.actors.faLead.token);
  const req = await createRequirement(fa, world, overrides);
  await fa.patch(`/requirements/${req.id}/review`, { action: "submit" });
  return faLead.patch<Requirement>(`/requirements/${req.id}/review`, { action: "approve" });
}

/** Walk an approved requirement to ready_for_qa (assign → start → ready). */
export async function readyForQaRequirement(world: World): Promise<Requirement> {
  const req = await approvedRequirement(world);
  const devLead = new Api(world.baseUrl, world.actors.devLead.token);
  const dev = new Api(world.baseUrl, world.actors.dev.token);
  await devLead.patch(`/requirements/${req.id}/dev`, {
    action: "assign",
    devAssigneeId: world.actors.dev.id,
  });
  await dev.patch(`/requirements/${req.id}/dev`, { action: "start" });
  return dev.patch<Requirement>(`/requirements/${req.id}/dev`, { action: "ready_for_qa" });
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
}

/**
 * Poll the actor's own feed until a notification matching entityId (and
 * optionally type) appears — some emitters are fire-and-forget, so a single
 * immediate GET can race them.
 */
export async function expectNotification(
  world: World,
  actor: Actor,
  match: { entityId: number; entityType?: string; type?: string },
  timeoutMs = 8_000,
): Promise<Notification> {
  const api = new Api(world.baseUrl, actor.token);
  const deadline = Date.now() + timeoutMs;
  let last: Notification[] = [];
  while (Date.now() < deadline) {
    last = await api.get<Notification[]>("/notifications");
    const hit = last.find(
      (n) =>
        n.entityId === match.entityId &&
        (match.entityType === undefined || n.entityType === match.entityType) &&
        (match.type === undefined || n.type === match.type),
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `No notification for ${actor.key} matching ${JSON.stringify(match)} within ${timeoutMs}ms. ` +
      `Feed head: ${JSON.stringify(last.slice(0, 5))}`,
  );
}

/** Assert the actor has NO notification matching the filter (bounded wait). */
export async function expectNoNotification(
  world: World,
  actor: Actor,
  match: { entityId: number; entityType?: string; type?: string },
  settleMs = 2_500,
): Promise<void> {
  await new Promise((r) => setTimeout(r, settleMs));
  const api = new Api(world.baseUrl, actor.token);
  const feed = await api.get<Notification[]>("/notifications");
  const hit = feed.find(
    (n) =>
      n.entityId === match.entityId &&
      (match.entityType === undefined || n.entityType === match.entityType) &&
      (match.type === undefined || n.type === match.type),
  );
  if (hit) {
    throw new Error(`${actor.key} unexpectedly received notification ${JSON.stringify(hit)}`);
  }
}

/** Create an execution file in the world project. */
export async function createExecutionFile(
  api: Api,
  world: World,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; redmineTicketId: string; [key: string]: unknown }> {
  return api.post("/execution-files", {
    redmineTicketId: uniq("PW"),
    title: uniq("PW execution"),
    projectId: world.project.id,
    fileType: "qa",
    ...overrides,
  });
}

/** UI login through the real form (used by the auth smoke cases). */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
