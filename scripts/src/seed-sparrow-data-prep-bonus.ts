/**
 * Adds the CR070 Data Prep milestone scenario (MS-10 — CR-2026-029) on top
 * of the already-seeded CR-2026-014 SPARROW dataset. See
 * sparrow-data-prep-bonus-data.ts for what it demonstrates.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-data-prep-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data-prep-bonus.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD } from "./sparrow-data";
import { MS10, DATA_PREP_TASKS, DATA_PREP_FILE } from "./sparrow-data-prep-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds the Data Prep bonus scenario on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}
function findId(type: SparrowEntityType, key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" — did seed-sparrow-data.ts run to completion?`);
  return Number(entry.id);
}

async function main() {
  console.log("Logging in as admin and resolving existing SPARROW entities...");
  const adminToken = await loginAdmin();

  const uid = new Map<string, number>();
  const tok = new Map<string, string>();
  for (const u of USERS) {
    const entry = manifest.find((e) => e.type === "user" && keyOf(e) === u.key);
    if (!entry) throw new Error(`User "${u.key}" not found in manifest — run seed-sparrow-data.ts first.`);
    uid.set(u.key, Number(entry.id));
    tok.set(u.key, await login(u.email, SPARROW_PASSWORD));
  }

  const projectId = findId("project", "project");
  const salmahTok = tok.get("salmah")!;
  const melissaTok = tok.get("melissa")!;
  const syafiqTok = tok.get("syafiq")!;

  // ── MS-10 — Data Prep milestone, description auto-populated from the
  // checklist template, then filled in by the QA lead ─────────────────────
  console.log("\nMS-10 — CR-2026-029 (Data Prep) — dataset needed before CR-2026-026's SIT can start...");
  const m10 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: { projectId, name: MS10.name, type: MS10.type, status: "active", environment: MS10.environment, targetDate: MS10.targetDate, description: MS10.description },
  });
  track("milestone", m10.id, MS10.key, MS10.name);
  console.log(`  + created, environment ${MS10.environment}, description filled in`);

  // ── Multi-assignee staffing — qa_lead overseeing + qa_member doing the prep
  console.log("  Staffing (multi-assignee)...");
  for (const key of MS10.assigneeKeys) {
    await api(`/milestones/${m10.id}/assignees`, melissaTok, { method: "POST", body: { userId: uid.get(key) } });
    console.log(`    + ${USERS.find((u) => u.key === key)!.name}`);
  }

  // ── Tasks — feeds the CR069 task-completion rollup on the PM Dashboard ──
  console.log("  Creating tasks (2 done, 1 in progress)...");
  for (const t of DATA_PREP_TASKS) {
    const created = await api<{ id: number }>("/tasks", adminToken, {
      method: "POST",
      body: {
        name: t.name, priority: "Medium", status: t.status, assigneeIds: [uid.get(t.assigneeKey)],
        projectId, milestoneId: m10.id, moduleIds: "",
        startDate: t.startDate, dueDate: t.dueDate, actualStartDate: t.actualStartDate, actualEndDate: t.actualEndDate,
        estimatedHours: t.estimatedHours, actualHours: t.actualHours, completionPercentage: t.completionPercentage,
      },
    });
    track("task", created.id, t.key, t.name);
  }
  console.log(`  + ${DATA_PREP_TASKS.length} tasks`);

  // ── Data file — QA uploads, PM downloads to email the client ────────────
  console.log("  Uploading the prepared dataset...");
  const dataBase64 = Buffer.from(DATA_PREP_FILE.fileContents, "utf-8").toString("base64");
  const file = await api<{ id: number }>("/data-prep-files", syafiqTok, {
    method: "POST",
    body: { milestoneId: m10.id, fileName: DATA_PREP_FILE.fileName, mimeType: DATA_PREP_FILE.mimeType, dataBase64, note: DATA_PREP_FILE.note },
  });
  track("dataPrepFile", file.id, "ms10file", DATA_PREP_FILE.fileName);
  console.log(`  + uploaded "${DATA_PREP_FILE.fileName}" as Syafiq Osman (id #${file.id})`);

  console.log(`\nDone. ${manifest.length} total tracked entities — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data-prep-bonus.ts");
}

main().catch((err) => {
  console.error("\nBonus seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything before retrying.`);
  process.exit(1);
});
