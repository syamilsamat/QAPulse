/**
 * Manifest helpers for the SPARROW dataset — same idea as seed-client.ts's
 * demo manifest, but a separate file so the SPARROW set can be seeded and
 * cleared independently of the older two-project demo dataset.
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SPARROW_MANIFEST_PATH = join(__dirname, "..", "sparrow-seed-manifest.json");

export type SparrowEntityType =
  | "task" | "defect" | "executionFile" | "testCase" | "requirement"
  | "milestone" | "team" | "project" | "user" | "risk" | "attachment" | "uatSignoff";

export interface SparrowManifestEntry {
  type: SparrowEntityType;
  id: number | string;
  /** "key::human label" — finalize/clear scripts split on "::" to map key → id */
  label: string;
}

export function loadSparrowManifest(): SparrowManifestEntry[] {
  if (!existsSync(SPARROW_MANIFEST_PATH)) return [];
  return JSON.parse(readFileSync(SPARROW_MANIFEST_PATH, "utf8"));
}

export function saveSparrowManifest(entries: SparrowManifestEntry[]) {
  writeFileSync(SPARROW_MANIFEST_PATH, JSON.stringify(entries, null, 2));
}

export function deleteSparrowManifest() {
  if (existsSync(SPARROW_MANIFEST_PATH)) unlinkSync(SPARROW_MANIFEST_PATH);
}

/** key from a "key::label" manifest label (or null if unkeyed). */
export function keyOf(entry: SparrowManifestEntry): string | null {
  const i = entry.label.indexOf("::");
  return i === -1 ? null : entry.label.slice(0, i);
}
