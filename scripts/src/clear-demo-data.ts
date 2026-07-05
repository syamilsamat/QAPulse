/**
 * Reverses seed-demo-data.ts: deletes every tracked entity in
 * demo-seed-manifest.json via the real API (in dependency-safe order), then
 * does a raw-SQL sweep for the couple of tables that have no delete endpoint
 * at all (defects — the app has no DELETE /defects/:id route since native
 * defect lifecycle doesn't exist until CR021).
 *
 * Safe to run even if a previous seed run only partially completed — it
 * only ever touches IDs recorded in the manifest, and deletes are wrapped so
 * an already-missing row (404) doesn't stop the rest of the cleanup.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/clear-demo-data.ts
 */

import pg from "pg";
import { loginAdmin, api, loadManifest, deleteManifest, type ManifestEntry, type ManifestEntityType } from "./seed-client";

const DELETE_ORDER: ManifestEntityType[] = [
  "task", "defect", "executionFile", "testCase", "requirement",
  "milestone", "team", "project", "user",
];

const DELETE_PATH: Partial<Record<ManifestEntityType, (id: number | string) => string>> = {
  task: (id) => `/tasks/${id}`,
  executionFile: (id) => `/execution-files/${id}`,
  testCase: (id) => `/test-cases/${id}`,
  requirement: (id) => `/requirements/${id}`,
  milestone: (id) => `/milestones/${id}`,
  team: (id) => `/teams/${id}`,
  project: (id) => `/projects/${id}`,
  user: (id) => `/users/${id}`,
};

async function main() {
  const manifest = loadManifest();
  if (manifest.length === 0) {
    console.log("No demo-seed-manifest.json found (or it's empty) — nothing to clear.");
    return;
  }

  console.log(`Clearing ${manifest.length} tracked entities...`);
  const adminToken = await loginAdmin();

  const byType = new Map<ManifestEntityType, ManifestEntry[]>();
  for (const entry of manifest) {
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type)!.push(entry);
  }

  // Defects have no DELETE endpoint (native defect lifecycle is CR021, not
  // built yet) — clean up directly via SQL. defect_links cascades on delete.
  const defectEntries = byType.get("defect") ?? [];
  if (defectEntries.length > 0) {
    console.log(`\nDeleting ${defectEntries.length} defects directly (no DELETE /defects endpoint exists yet)...`);
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const ids = defectEntries.map((e) => Number(e.id));
      await pool.query(`DELETE FROM defects WHERE id = ANY($1)`, [ids]);
      console.log(`  - removed ${ids.length} defects (+ cascaded defect_links)`);
    } finally {
      await pool.end();
    }
  }

  for (const type of DELETE_ORDER) {
    if (type === "defect") continue; // handled above
    const entries = byType.get(type) ?? [];
    if (entries.length === 0) continue;
    const pathFor = DELETE_PATH[type]!;
    console.log(`\nDeleting ${entries.length} ${type}(s)...`);
    for (const entry of entries) {
      try {
        await api(pathFor(entry.id), adminToken, { method: "DELETE" });
        console.log(`  - ${entry.label}`);
      } catch (err: any) {
        // A 404 here just means it was already removed (e.g. cascaded away
        // by an earlier delete in this same run) — not worth failing over.
        console.warn(`  ! ${entry.label}: ${err.message}`);
      }
    }
  }

  deleteManifest();
  console.log("\nDone. demo-seed-manifest.json removed.");
}

main().catch((err) => {
  console.error("\nClear failed:", err.message);
  console.error("Manifest was left in place — safe to re-run once the underlying issue is fixed.");
  process.exit(1);
});
