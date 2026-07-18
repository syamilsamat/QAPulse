/**
 * Adds 12 Requirements-page bonus scenarios (RQ-01…RQ-12) on top of the
 * already-seeded CR-2026-014 SPARROW dataset. See sparrow-requirements-bonus-data.ts
 * for what each one demonstrates and scripts/SPARROW_DEMO.md for the
 * presentation reference.
 *
 * REQUIRES seed-sparrow-data.ts to have already been run — this reads the
 * project/milestone/requirement/user IDs it created out of the existing
 * sparrow-seed-manifest.json and appends new entries to that SAME manifest,
 * so clear-sparrow-data.ts tears down both passes together.
 *
 * Run from the Replit shell (after the main seed):
 *   cd scripts
 *   QAPULSE_API_URL=https://<your-repl-url> npx tsx src/seed-sparrow-requirements-bonus.ts
 * then:
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-requirements-bonus.ts
 */

import { loginAdmin, login, api } from "./seed-client";
import { loadSparrowManifest, saveSparrowManifest, keyOf, type SparrowManifestEntry, type SparrowEntityType } from "./sparrow-manifest";
import { USERS, SPARROW_PASSWORD } from "./sparrow-data";
import {
  MILESTONE_CR2, REQ_105, REQ_106, REQ_107, REQ_108, REQ_109, REQ_110,
  RQ03_NOTE, RQ04_ATTACHMENT, RQ05_THREAD, RQ06_DEFECT, RQ07_NOTE,
  REQ_111, REQ_112, REQ_113, REQ_114, REQ_115, REQ_116,
} from "./sparrow-requirements-bonus-data";

const manifest: SparrowManifestEntry[] = loadSparrowManifest();
if (manifest.length === 0) {
  console.error(
    "sparrow-seed-manifest.json is empty — run seed-sparrow-data.ts first. " +
    "This script only adds bonus Requirements-page scenarios on top of the existing CR-2026-014 dataset.",
  );
  process.exit(1);
}

function track(type: SparrowEntityType, id: number | string, key: string, label: string) {
  manifest.push({ type, id, label: `${key}::${label}` });
  saveSparrowManifest(manifest);
}

function findId(type: SparrowEntityType, key: string): number {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  if (!entry) throw new Error(`Could not find ${type} with key "${key}" in the manifest — did seed-sparrow-data.ts run to completion?`);
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
  const crId = findId("milestone", "cr2026014");
  const req102Id = findId("requirement", "req102");
  const req103Id = findId("requirement", "req103");
  const req104Id = findId("requirement", "req104");

  const ainaTok = tok.get("aina")!;
  const harithTok = tok.get("harith")!;
  const danielTok = tok.get("daniel")!;
  const melissaTok = tok.get("melissa")!;
  const salmahTok = tok.get("salmah")!;

  // ── RQ-01 — parent/child hierarchy + module cascade ─────────────────────
  console.log("\nRQ-01 — REQ-105 (parent) with two children, then cascading a module change...");
  const r105 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_105.title, description: REQ_105.description, module: REQ_105.module,
      projectId, priority: REQ_105.priority, status: "open", milestoneId: crId,
      acceptanceCriteria: JSON.stringify(REQ_105.acceptanceCriteria),
    },
  });
  track("requirement", r105.id, "req105", REQ_105.title);
  await api(`/requirements/${r105.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
  await api(`/requirements/${r105.id}/review`, harithTok, { method: "PATCH", body: { action: "approve" } });

  const r106 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_106.title, description: REQ_106.description, module: REQ_105.module,
      projectId, priority: "normal", status: "open", milestoneId: crId, parentId: r105.id,
    },
  });
  track("requirement", r106.id, "req106", REQ_106.title);
  await api(`/requirements/${r106.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } }); // left in_review — mixed tree state

  const r107 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_107.title, description: REQ_107.description, module: REQ_105.module,
      projectId, priority: "normal", status: "open", milestoneId: crId, parentId: r105.id,
    },
  });
  track("requirement", r107.id, "req107", REQ_107.title); // left as draft — mixed tree state

  await api(`/requirements/${r105.id}`, ainaTok, { method: "PATCH", body: { module: REQ_105.moduleAfterCascade } });
  console.log(`  + REQ-105/106/107 created; parent module changed to "${REQ_105.moduleAfterCascade}" — cascades to both children`);

  // ── RQ-02 — recursive-import-shaped parent/children (simulated: no live Redmine) ─
  console.log("\nRQ-02 — REQ-108/109/110 seeded with the Redmine fields a recursive import would leave (no live Redmine in this sandbox)...");
  const r108 = await api<{ id: number }>("/requirements", harithTok, {
    method: "POST",
    body: {
      title: REQ_108.title, description: REQ_108.description, module: REQ_108.module,
      projectId, priority: REQ_108.priority, status: "open", milestoneId: crId,
      redmineTicketId: REQ_108.redmineTicketId, tracker: REQ_108.tracker,
    },
  });
  track("requirement", r108.id, "req108", REQ_108.title);
  await api(`/requirements/${r108.id}/review`, harithTok, { method: "PATCH", body: { action: "submit" } });
  await api(`/requirements/${r108.id}/review`, danielTok, { method: "PATCH", body: { action: "approve" } });

  for (const child of [REQ_109, REQ_110]) {
    const created = await api<{ id: number }>("/requirements", harithTok, {
      method: "POST",
      body: {
        title: child.title, description: child.description, module: REQ_108.module,
        projectId, priority: "normal", status: "open", milestoneId: crId, parentId: r108.id,
        redmineTicketId: child.redmineTicketId, tracker: child.tracker,
      },
    });
    track("requirement", created.id, child.key, child.title);
  }
  console.log("  + REQ-108 (Redmine #48300, tracker User Story) approved, with 2 imported-looking children");

  // ── RQ-03 — priority bump on the already-Redmine-linked REQ-102 ─────────
  console.log("\nRQ-03 — REQ-102 priority bumped locally; note recorded for the 'sync preserves local edits' story...");
  await api(`/requirements/${req102Id}`, melissaTok, { method: "PATCH", body: { priority: "high" } });
  await api(`/requirements/${req102Id}/comments`, melissaTok, { method: "POST", body: { body: RQ03_NOTE } });

  // ── RQ-04 — attachment on REQ-103 ────────────────────────────────────────
  console.log("\nRQ-04 — Aina uploads the Finance SOP approval matrix to REQ-103...");
  const b64 = Buffer.from(RQ04_ATTACHMENT.content, "utf8").toString("base64");
  const attachment = await api<{ id: number }>(`/requirements/${req103Id}/attachments`, ainaTok, {
    method: "POST",
    body: { filename: RQ04_ATTACHMENT.filename, mimeType: RQ04_ATTACHMENT.mimeType, data: b64 },
  });
  track("attachment", attachment.id, "rq04-attachment", `${RQ04_ATTACHMENT.filename} on REQ-103`);
  console.log(`  + ${RQ04_ATTACHMENT.filename} attached — download/delete it live to show the full lifecycle`);

  // ── RQ-05 — multi-participant comment thread on REQ-104 ─────────────────
  console.log("\nRQ-05 — comment thread on REQ-104 (Harith asks, Daniel answers, Melissa flags a dependency)...");
  for (const c of RQ05_THREAD) {
    await api(`/requirements/${req104Id}/comments`, tok.get(c.authorKey)!, { method: "POST", body: { body: c.body } });
  }
  console.log(`  + ${RQ05_THREAD.length} comments posted`);

  // ── RQ-06 — QA-raised requirement defect on REQ-102 ─────────────────────
  console.log("\nRQ-06 — Syafiq (QA) raises a requirement defect on REQ-102 (not Dev this time)...");
  const rq06Defect = await api<{ id: number; defectCode: string }>("/defects", tok.get(RQ06_DEFECT.reporterKey)!, {
    method: "POST",
    body: {
      title: RQ06_DEFECT.title, description: RQ06_DEFECT.description, severity: RQ06_DEFECT.severity,
      module: RQ06_DEFECT.module, source: "requirement", requirementId: req102Id,
    },
  });
  track("defect", rq06Defect.id, RQ06_DEFECT.key, RQ06_DEFECT.title);
  await api(`/requirements/${req102Id}/comments`, ainaTok, { method: "POST", body: { body: RQ06_DEFECT.resolutionComment } });
  console.log(`  + ${rq06Defect.defectCode} raised by QA, routed to Aina, resolution noted`);

  // ── RQ-07 — priority escalation on REQ-104 ───────────────────────────────
  console.log("\nRQ-07 — REQ-104 priority escalated normal → urgent (Finance go-live blocker)...");
  await api(`/requirements/${req104Id}`, danielTok, { method: "PATCH", body: { priority: "urgent" } });
  await api(`/requirements/${req104Id}/comments`, salmahTok, { method: "POST", body: { body: RQ07_NOTE } });

  // ── RQ-08 — requirement descoped and reassigned to CR-2026-015 ─────────
  console.log("\nRQ-08 — REQ-111 created in CR-2026-014, then descoped and reassigned to a new milestone...");
  const r111 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: {
      title: REQ_111.title, description: REQ_111.description, module: REQ_111.module,
      projectId, priority: REQ_111.priority, status: "open", milestoneId: crId,
    },
  });
  track("requirement", r111.id, "req111", REQ_111.title);
  await api(`/requirements/${r111.id}/review`, ainaTok, { method: "PATCH", body: { action: "submit" } });
  await api(`/requirements/${r111.id}/review`, harithTok, { method: "PATCH", body: { action: "approve" } });

  const cr2 = await api<{ id: number }>("/milestones", salmahTok, {
    method: "POST",
    body: {
      projectId, name: MILESTONE_CR2.name, type: MILESTONE_CR2.type, status: MILESTONE_CR2.status,
      targetDate: MILESTONE_CR2.targetDate, startDate: MILESTONE_CR2.startDate, environment: MILESTONE_CR2.environment,
    },
  });
  track("milestone", cr2.id, MILESTONE_CR2.key, MILESTONE_CR2.name);
  await api(`/requirements/${r111.id}`, ainaTok, { method: "PATCH", body: { milestoneId: cr2.id } });
  await api(`/requirements/${r111.id}/comments`, ainaTok, { method: "POST", body: { body: REQ_111.reassignComment } });
  console.log(`  + REQ-111 reassigned CR-2026-014 → ${MILESTONE_CR2.name}`);

  // ── RQ-09 — bulk multi-select delete of abandoned drafts ────────────────
  console.log("\nRQ-09 — two abandoned drafts created, then bulk-deleted (backlog grooming)...");
  const r112 = await api<{ id: number }>("/requirements", danielTok, {
    method: "POST",
    body: { title: REQ_112.title, description: REQ_112.description, module: REQ_112.module, projectId, priority: REQ_112.priority, status: "open" },
  });
  // Tracked even though it's about to be deleted — clear-sparrow-data.ts will
  // hit a harmless 404 on it, and finalize-sparrow-requirements-bonus.ts
  // needs the ID to backdate the requirement_created/requirement_deleted
  // activity rows so the History/Activity feed reads correctly.
  track("requirement", r112.id, "req112", REQ_112.title);
  const r113 = await api<{ id: number }>("/requirements", danielTok, {
    method: "POST",
    body: { title: REQ_113.title, description: REQ_113.description, module: REQ_113.module, projectId, priority: REQ_113.priority, status: "open" },
  });
  track("requirement", r113.id, "req113", REQ_113.title);
  await api(`/requirements/${r112.id}`, danielTok, { method: "DELETE" });
  await api(`/requirements/${r113.id}`, danielTok, { method: "DELETE" });
  console.log(`  + REQ-112 "${REQ_112.title}" and REQ-113 "${REQ_113.title}" created then bulk-deleted — check the History/Activity feed to show the audit trail`);

  // ── RQ-10 — backlog requirement with no milestone ───────────────────────
  console.log("\nRQ-10 — REQ-114 created with no milestone (backlog holding pen)...");
  const r114 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: { title: REQ_114.title, description: REQ_114.description, module: REQ_114.module, projectId, priority: REQ_114.priority, status: "open" },
  });
  track("requirement", r114.id, "req114", REQ_114.title);
  console.log("  + REQ-114 left with no milestone — visible under the Requirements page's unscoped/backlog view");

  // ── RQ-11 — orphaned child after parent delete (honest edge case) ───────
  console.log("\nRQ-11 — REQ-115 (parent) + REQ-116 (child), then parent deleted — child's parentId is left dangling on purpose...");
  const r115 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: { title: REQ_115.title, description: REQ_115.description, module: REQ_115.module, projectId, priority: REQ_115.priority, status: "open" },
  });
  track("requirement", r115.id, "req115", REQ_115.title);
  const r116 = await api<{ id: number }>("/requirements", ainaTok, {
    method: "POST",
    body: { title: REQ_116.title, description: REQ_116.description, module: REQ_115.module, projectId, priority: "normal", status: "open", parentId: r115.id },
  });
  track("requirement", r116.id, "req116", REQ_116.title);
  await api(`/requirements/${r115.id}`, ainaTok, { method: "DELETE" });
  console.log("  + REQ-115 deleted; REQ-116 remains with a dangling parentId — a known gap, not a feature, worth flagging honestly if asked");

  // ── RQ-12 — description edit reopens review on linked test cases, mid-SIT ─
  console.log("\nRQ-12 — REQ-103's AC4 tightened mid-SIT; linked test cases/tasks flagged revision_required again...");
  await api(`/requirements/${req103Id}`, ainaTok, {
    method: "PATCH",
    body: {
      acceptanceCriteria: JSON.stringify([
        "AC1 — A refund can be initiated only against a payment in PAID or PARTIALLY_REFUNDED state",
        "AC2 — Partial refunds are supported; the running refunded total can never exceed the original amount",
        "AC3 — The maximum single refund equals the remaining un-refunded balance of the payment",
        "AC4 — Refunds above RM 5,000 require two approvers per Finance SOP v3.2, and BOTH approvers must be a different user than the refund initiator",
        "AC5 — An approved refund is submitted to the bank within 15 minutes and tracked to completion",
        "AC6 — A rejected refund request records the rejector and reason, and notifies the initiator",
        "AC7 — The buyer receives a refund confirmation once the bank confirms the credit",
      ]),
    },
  });
  console.log("  + REQ-103 AC4 tightened — TC-REG-02/TC-REG-05 and the refund task should now show a revision_required flag");

  console.log(`\nDone. ${manifest.length} total tracked entities (main + bonus) — see scripts/sparrow-seed-manifest.json`);
  console.log("\nNEXT STEP (required for correct dates): DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-requirements-bonus.ts");
}

main().catch((err) => {
  console.error("\nBonus seed failed:", err.message);
  console.error(`Partial progress is saved in sparrow-seed-manifest.json (${manifest.length} total entries). Run "npx tsx src/clear-sparrow-data.ts" to tear down everything (main + bonus) before retrying.`);
  process.exit(1);
});
