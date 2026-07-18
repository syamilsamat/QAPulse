/**
 * The bootstrapped test world — a dedicated project, two modules, and one
 * user per role — created (idempotently) by global-setup.ts and shared with
 * every spec through .auth/world.json.
 */
import * as fs from "fs";
import * as path from "path";

/** Password for every bootstrapped actor (global-setup force-resets it). */
export const ACTOR_PASSWORD = "PwAuto@2026!";

export interface Actor {
  key: string;
  name: string;
  email: string;
  role: string;
  id: number;
  /** JWT captured at global-setup time — valid for the run. */
  token: string;
}

export interface World {
  baseUrl: string;
  admin: Actor;
  actors: {
    /** fa_member — default requirement author */
    fa: Actor;
    /** fa_lead — reviewer/approver */
    faLead: Actor;
    /** dev_lead — assigns developers */
    devLead: Actor;
    /** dev_member — the assignee */
    dev: Actor;
    /** qa_lead */
    qaLead: Actor;
    /** qa_member — whole-project access */
    qa: Actor;
    /** qa_member restricted to module alpha only (CR044) */
    scopedQa: Actor;
    /** pm_lead — PM dashboard user */
    pm: Actor;
  };
  project: { id: number; name: string };
  modules: {
    alpha: { id: number; name: string };
    beta: { id: number; name: string };
  };
}

export const WORLD_PATH = path.join(__dirname, "..", ".auth", "world.json");

export function loadWorld(): World {
  if (!fs.existsSync(WORLD_PATH)) {
    throw new Error(
      `world.json not found at ${WORLD_PATH} — global-setup did not run or failed. ` +
        `Run via "pnpm test" (which triggers globalSetup), not playwright directly on a stale checkout.`,
    );
  }
  return JSON.parse(fs.readFileSync(WORLD_PATH, "utf8")) as World;
}

/** Unique-per-run suffix so repeated runs never collide on titles/ticket IDs. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
