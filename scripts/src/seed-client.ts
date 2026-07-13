/**
 * Shared helper for the demo-data scripts: authenticates against the real
 * QAPulse API (not the DB directly) and tracks every entity created so the
 * clear script can reverse it precisely.
 *
 * Required env var:
 *   QAPULSE_API_URL — the same URL you open QAPulse at in your browser,
 *   e.g. https://your-repl-name.username.repl.co (no trailing slash, no
 *   /api suffix — this script appends /api itself, same as the frontend's
 *   own getApiUrl()).
 *
 * Optional env vars:
 *   SEED_ADMIN_EMAIL    (default: admin@qapulse.com)
 *   SEED_ADMIN_PASSWORD (default: admin123)
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MANIFEST_PATH = join(__dirname, "..", "demo-seed-manifest.json");

export function getBaseUrl(): string {
  const url = process.env.QAPULSE_API_URL;
  if (!url) {
    throw new Error(
      "QAPULSE_API_URL is required — set it to the same URL you open QAPulse at in your browser " +
      "(e.g. https://your-repl-name.username.repl.co), with no trailing slash and no /api suffix.",
    );
  }
  return `${url.replace(/\/$/, "")}/api`;
}

const tokenCache = new Map<string, string>();

export async function login(email: string, password: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;

  const res = await fetch(`${getBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Login failed for ${email}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { token: string };
  tokenCache.set(email, data.token);
  return data.token;
}

export async function loginAdmin(): Promise<string> {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@qapulse.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "password123";
  return login(email, password);
}

export interface ApiCallOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/** Authenticated JSON fetch. Throws with the response body on non-2xx. */
export async function api<T = any>(path: string, token: string, opts: ApiCallOptions = {}): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${opts.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
  }
  // A few endpoints reply with res.sendStatus(201) on success — that sends
  // the plain-text HTTP reason phrase ("Created"), not JSON, not empty.
  // Only parse when the server actually says it sent JSON.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ─── Manifest ────────────────────────────────────────────────────────────────
// Ordered list of every entity the seed script created, so the clear script
// can delete in exact reverse order without guessing at dependencies.

export type ManifestEntityType =
  | "task" | "defect" | "executionFile" | "testCase" | "requirement"
  | "milestone" | "projectMember" | "projectTeam" | "teamMember" | "team"
  | "project" | "user" | "risk";

export interface ManifestEntry {
  type: ManifestEntityType;
  id: number | string; // string for composite keys like "teamId:userId"
  label: string; // human-readable, for clear-script logging
}

export function loadManifest(): ManifestEntry[] {
  if (!existsSync(MANIFEST_PATH)) return [];
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

export function saveManifest(entries: ManifestEntry[]) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2));
}

export function deleteManifest() {
  if (existsSync(MANIFEST_PATH)) unlinkSync(MANIFEST_PATH);
}

/** Append one entry and persist immediately, so a mid-run failure still
 *  leaves a usable manifest for partial cleanup. */
export function record(manifest: ManifestEntry[], entry: ManifestEntry) {
  manifest.push(entry);
  saveManifest(manifest);
}
