/**
 * Global setup — bootstraps a dedicated, reusable automation world on the
 * target QAPulse instance via the real API (same philosophy as
 * scripts/seed-demo-data.ts: validation, audit and notifications all fire
 * like they would for a real user).
 *
 * Idempotent: re-running reuses the "PW Automation" project/modules/users and
 * just force-resets actor passwords + refreshes tokens.
 */
import * as fs from "fs";
import * as path from "path";
import { Api } from "./src/api";
import { ACTOR_PASSWORD, WORLD_PATH, type Actor, type World } from "./src/world";
import { BASE_URL } from "./playwright.config";

const PROJECT_NAME = "PW Automation";
const MODULE_ALPHA = "PW-Alpha";
const MODULE_BETA = "PW-Beta";

interface ActorSpec {
  key: keyof World["actors"];
  name: string;
  email: string;
  role: string;
}

const ACTORS: ActorSpec[] = [
  { key: "fa",      name: "PW FA Author",   email: "pw.fa@qapulse.test",       role: "fa_member" },
  { key: "faLead",  name: "PW FA Lead",     email: "pw.fa.lead@qapulse.test",  role: "fa_lead" },
  { key: "devLead", name: "PW Dev Lead",    email: "pw.dev.lead@qapulse.test", role: "dev_lead" },
  { key: "dev",     name: "PW Developer",   email: "pw.dev@qapulse.test",      role: "dev_member" },
  { key: "qaLead",  name: "PW QA Lead",     email: "pw.qa.lead@qapulse.test",  role: "qa_lead" },
  { key: "qa",      name: "PW QA Tester",   email: "pw.qa@qapulse.test",       role: "qa_member" },
  { key: "scopedQa", name: "PW QA Scoped",  email: "pw.qa.scoped@qapulse.test", role: "qa_member" },
  { key: "pm",      name: "PW PM Lead",     email: "pw.pm@qapulse.test",       role: "pm_lead" },
];

export default async function globalSetup(): Promise<void> {
  const api = new Api(BASE_URL);

  const adminEmail = process.env.QAPULSE_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@qapulse.com";
  const adminPassword = process.env.QAPULSE_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "password123";

  let adminLogin;
  try {
    adminLogin = await api.login(adminEmail, adminPassword);
  } catch (err) {
    throw new Error(
      `Could not log in as admin (${adminEmail}) at ${BASE_URL} — is the app running and ` +
        `QAPULSE_BASE_URL / QAPULSE_ADMIN_EMAIL / QAPULSE_ADMIN_PASSWORD correct?\n${String(err)}`,
    );
  }
  const admin: Actor = {
    key: "admin",
    name: adminLogin.user.name,
    email: adminLogin.user.email,
    role: adminLogin.user.role,
    id: adminLogin.user.id,
    token: adminLogin.token,
  };

  // ── Modules (shared registry — reuse by name) ─────────────────────────────
  const allModules = await api.get<{ id: number; name: string }[]>("/modules");
  async function ensureModule(name: string): Promise<{ id: number; name: string }> {
    const existing = allModules.find((m) => m.name === name);
    if (existing) return existing;
    const created = await api.post<{ id: number; name: string }>("/modules", { name });
    return created;
  }
  const alpha = await ensureModule(MODULE_ALPHA);
  const beta = await ensureModule(MODULE_BETA);

  // ── Project ───────────────────────────────────────────────────────────────
  const projects = await api.get<{ id: number; name: string }[]>("/projects");
  let project = projects.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    project = await api.post<{ id: number; name: string }>("/projects", {
      name: PROJECT_NAME,
      description: "Dedicated project for the Playwright automation suites (docs/test-plans).",
    });
  }
  // Link both modules (insert is onConflictDoNothing — safe to repeat)
  await api.post(`/projects/${project.id}/modules`, { moduleId: alpha.id });
  await api.post(`/projects/${project.id}/modules`, { moduleId: beta.id });

  // ── Actor users ───────────────────────────────────────────────────────────
  const users = await api.get<{ id: number; email: string; name: string; role: string }[]>("/users");
  const actors = {} as World["actors"];
  for (const spec of ACTORS) {
    let user = users.find((u) => u.email === spec.email);
    if (!user) {
      user = await api.post<{ id: number; email: string; name: string; role: string }>("/users", {
        name: spec.name,
        email: spec.email,
        password: ACTOR_PASSWORD,
        role: spec.role,
      });
    }
    // Force a known password, correct role, and skip the first-login
    // change-password gate — makes reruns immune to state drift.
    await api.patch(`/users/${user.id}`, {
      password: ACTOR_PASSWORD,
      role: spec.role,
      mustChangePassword: false,
    });
    const session = await new Api(BASE_URL).login(spec.email, ACTOR_PASSWORD);
    actors[spec.key] = {
      key: spec.key,
      name: spec.name,
      email: spec.email,
      role: spec.role,
      id: user.id,
      token: session.token,
    };
  }

  // ── Project memberships ───────────────────────────────────────────────────
  // Whole-project access for every actor except scopedQa, who is deliberately
  // restricted to module alpha (CR044 module scoping under test).
  for (const spec of ACTORS) {
    const actor = actors[spec.key];
    const moduleIds = spec.key === "scopedQa" ? [alpha.id] : null;
    await api.post(`/projects/${project.id}/members`, { userId: actor.id, moduleIds });
  }

  const world: World = {
    baseUrl: BASE_URL,
    admin,
    actors,
    project: { id: project.id, name: PROJECT_NAME },
    modules: { alpha, beta },
  };

  fs.mkdirSync(path.dirname(WORLD_PATH), { recursive: true });
  fs.writeFileSync(WORLD_PATH, JSON.stringify(world, null, 2));
  console.log(
    `[global-setup] world ready — project #${project.id} "${PROJECT_NAME}", ` +
      `modules ${alpha.id}/${beta.id}, ${ACTORS.length} actors @ ${BASE_URL}`,
  );
}
