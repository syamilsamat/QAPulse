/**
 * Uploads a real UAT sign-off document for CR-2026-014, on top of the
 * already-seeded SPARROW dataset. See sparrow-uat-signoff-bonus-data.ts for
 * what this demonstrates.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-uat-signoff-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-uat-signoff-bonus.ts
 */
import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD } from "./sparrow-data";
import { UAT_SIGNOFF } from "./sparrow-uat-signoff-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds a UAT sign-off document on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function findId(type: SparrowManifestEntry["type"], key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" — did seed-sparrow-data.ts run to completion?`);
  return Number(entry.id);
}

function track(id: number, key: string, label: string) {
  manifest.push({ type: "uatSignoff", id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}

async function main() {
  console.log("Logging in as admin and resolving existing SPARROW entities...");
  await loginAdmin();

  const uploader = USERS.find((u) => u.key === UAT_SIGNOFF.uploaderKey);
  if (!uploader) throw new Error(`No SPARROW user with key "${UAT_SIGNOFF.uploaderKey}"`);
  const uploaderTok = await login(uploader.email, SPARROW_PASSWORD);

  const milestoneId = findId("milestone", UAT_SIGNOFF.milestoneKey);
  const dataBase64 = Buffer.from(UAT_SIGNOFF.fileContents, "utf-8").toString("base64");

  console.log(`\nUploading "${UAT_SIGNOFF.fileName}" for milestone #${milestoneId} as ${uploader.name}...`);
  const created = await api<{ id: number }>("/uat-signoffs", uploaderTok, {
    method: "POST",
    body: {
      milestoneId,
      fileName: UAT_SIGNOFF.fileName,
      mimeType: UAT_SIGNOFF.mimeType,
      dataBase64,
      note: UAT_SIGNOFF.note,
    },
  });
  track(created.id, "uatsignoff-cr2026014", UAT_SIGNOFF.fileName);
  console.log(`  + uploaded (id #${created.id})`);

  console.log("\nDone. NEXT STEP (required): backdate its timestamp to the storyline date:");
  console.log("  DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-uat-signoff-bonus.ts");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
