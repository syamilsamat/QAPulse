/**
 * Reverses seed-sparrow-data.ts: deletes every tracked entity in
 * sparrow-seed-manifest.json via the real API (in dependency-safe order),
 * then does a raw-SQL sweep for defects (no DELETE /defects/:id route
 * exists — same as the older two-project demo set's clear script).
 *
 * Safe to run even if a previous seed run only partially completed — it
 * only ever touches IDs recorded in the manifest.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/clear-sparrow-data.ts
 */

import pg from "pg";
import { loginAdmin, api } from "./seed-client";
import { loadSparrowManifest, deleteSparrowManifest, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";

const DELETE_ORDER: SparrowEntityType[] = [
  "task", "risk", "defect", "attachment", "executionFile", "testCase", "requirement",
  "milestone", "team", "project", "user",
];

const DELETE_PATH: Partial<Record<SparrowEntityType, (id: number | string) => string>> = {
  task: (id) => `/tasks/${id}`,
  risk: (id) => `/risks/${id}`,
  attachment: (id) => `/requirements/attachments/${id}`,
  executionFile: (id) => `/execution-files/${id}`,
  testCase: (id) => `/test-cases/${id}`,
  requirement: (id) => `/requirements/${id}`,
  milestone: (id) => `/milestones/${id}`,
  team: (id) => `/teams/${id}`,
  project: (id) => `/projects/${id}`,
  user: (id) => `/users/${id}`,
};

function label(entry: SparrowManifestEntry): string {
  const i = entry.label.indexOf("::");
  return i === -1 ? entry.label : entry.label.slice(i + 2);
}

async function main() {
  const manifest = loadSparrowManifest();
  if (manifest.length === 0) {
    console.log("No sparrow-seed-manifest.json found (or it's empty) — nothing to clear.");
    return;
  }

  console.log(`Clearing ${manifest.length} SPARROW entities...`);
  const adminToken = await loginAdmin();

  const byType = new Map<SparrowEntityType, SparrowManifestEntry[]>();
  for (const entry of manifest) {
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type)!.push(entry);
  }

  const defectEntries = byType.get("defect") ?? [];
  const requirementEntries = byType.get("requirement") ?? [];
  const executionFileEntries = byType.get("executionFile") ?? [];
  if (defectEntries.length > 0 || requirementEntries.length > 0 || executionFileEntries.length > 0) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      if (defectEntries.length > 0) {
        console.log(`\nDeleting ${defectEntries.length} defects directly (no DELETE /defects endpoint exists yet)...`);
        const ids = defectEntries.map((e) => Number(e.id));
        await pool.query(`DELETE FROM defects WHERE id = ANY($1)`, [ids]);
        console.log(`  - removed ${ids.length} defects (+ cascaded defect_links)`);
      }
      if (requirementEntries.length > 0) {
        // requirement_comments has no FK cascade and no DELETE endpoint —
        // sweep directly so a cleared demo doesn't leave orphaned comment
        // rows behind (harmless, but pointless debris).
        const reqIds = requirementEntries.map((e) => Number(e.id));
        const { rowCount } = await pool.query(`DELETE FROM requirement_comments WHERE requirement_id = ANY($1)`, [reqIds]);
        if (rowCount) console.log(`\nRemoved ${rowCount} requirement comment(s) (no DELETE endpoint exists for these).`);
      }
      if (executionFileEntries.length > 0) {
        // execution_tc_history has no FK/cascade back to execution_files
        // (unlike execution_test_cases and execution_file_audit, which do
        // cascade) — sweep it directly so deleting a file doesn't leave its
        // per-row result-change history behind.
        const fileIds = executionFileEntries.map((e) => Number(e.id));
        const { rowCount } = await pool.query(`DELETE FROM execution_tc_history WHERE execution_file_id = ANY($1)`, [fileIds]);
        if (rowCount) console.log(`\nRemoved ${rowCount} execution TC history row(s) (no cascade exists for this table).`);
      }
    } finally {
      await pool.end();
    }
  }

  for (const type of DELETE_ORDER) {
    if (type === "defect") continue;
    const entries = byType.get(type) ?? [];
    if (entries.length === 0) continue;
    const pathFor = DELETE_PATH[type]!;
    console.log(`\nDeleting ${entries.length} ${type}(s)...`);
    for (const entry of entries) {
      try {
        await api(pathFor(entry.id), adminToken, { method: "DELETE" });
        console.log(`  - ${label(entry)}`);
      } catch (err: any) {
        console.warn(`  ! ${label(entry)}: ${err.message}`);
      }
    }
  }

  deleteSparrowManifest();
  console.log("\nDone. sparrow-seed-manifest.json removed.");
}

main().catch((err) => {
  console.error("\nClear failed:", err.message);
  console.error("Manifest was left in place — safe to re-run once the underlying issue is fixed.");
  process.exit(1);
});
