/**
 * Backdates the 12 Requirements-page bonus scenarios (RQ-01…RQ-12) added by
 * seed-sparrow-requirements-bonus.ts. Run AFTER that script, from the Replit
 * shell:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-requirements-bonus.ts
 *
 * Safe to run even if finalize-sparrow-data.ts already ran on the main
 * dataset — everything here is looked up by KEY from the manifest and only
 * touches rows the bonus seed created (plus a couple of activity rows on
 * REQ-102/103/104 that the main dataset also touches — always targeted by
 * "most recent matching row" so it never clobbers the main finalize pass's
 * work, which always runs first).
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { pt } from "./sparrow-data";
import { RQ06_DEFECT, RQ07_DATE, REQ_111, RQ11_DATE, RQ09_DATE, RQ12_DATE } from "./sparrow-requirements-bonus-data";

const { Pool } = pg;

function idOf(manifest: ReturnType<typeof loadSparrowManifest>, type: SparrowEntityType, key: string): number | undefined {
  const entry = manifest.find((e) => e.type === type && keyOf(e) === key);
  return entry ? Number(entry.id) : undefined;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const manifest = loadSparrowManifest();
  if (manifest.length === 0) {
    console.log("No sparrow-seed-manifest.json found — run seed-sparrow-data.ts and seed-sparrow-requirements-bonus.ts first.");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // ── RQ-01 — REQ-105/106/107 ──────────────────────────────────────────
    console.log("RQ-01 — backdating REQ-105/106/107...");
    const r105 = idOf(manifest, "requirement", "req105");
    const r106 = idOf(manifest, "requirement", "req106");
    const r107 = idOf(manifest, "requirement", "req107");
    const created105 = pt("2026-08-11", "09:00");
    const submit105 = pt("2026-08-11", "15:00");
    const approve105 = pt("2026-08-13", "10:00");
    const cascade105 = pt("2026-08-14", "09:00");
    if (r105) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$3, approved_at=$3 WHERE id=$1`, [r105, created105, approve105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r105, created105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_submit'`, [r105, submit105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_approve'`, [r105, approve105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_updated'`, [r105, cascade105]);
    }
    if (r106) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$3 WHERE id=$1`, [r106, created105, submit105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r106, created105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_submit'`, [r106, submit105]);
    }
    if (r107) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$2 WHERE id=$1`, [r107, created105]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r107, created105]);
    }

    // ── RQ-02 — REQ-108/109/110 ──────────────────────────────────────────
    console.log("RQ-02 — backdating REQ-108/109/110...");
    const r108 = idOf(manifest, "requirement", "req108");
    const r109 = idOf(manifest, "requirement", "req109");
    const r110 = idOf(manifest, "requirement", "req110");
    const created108 = pt("2026-08-09", "09:00");
    const submit108 = pt("2026-08-09", "16:00");
    const approve108 = pt("2026-08-13", "11:00");
    if (r108) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$3, approved_at=$3 WHERE id=$1`, [r108, created108, approve108]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r108, created108]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_submit'`, [r108, submit108]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_approve'`, [r108, approve108]);
    }
    for (const id of [r109, r110]) {
      if (!id) continue;
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$2 WHERE id=$1`, [id, created108]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [id, created108]);
    }

    // ── RQ-03 — REQ-102 priority bump + note ─────────────────────────────
    console.log("RQ-03 — backdating REQ-102's priority-bump note...");
    const r102 = idOf(manifest, "requirement", "req102");
    const rq03Date = pt("2026-08-18", "11:00");
    if (r102) {
      await pool.query(
        `UPDATE activity SET created_at=$2 WHERE id = (SELECT id FROM activity WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_updated' ORDER BY id DESC LIMIT 1)`,
        [r102, rq03Date],
      );
      await pool.query(
        `UPDATE requirement_comments SET created_at=$2 WHERE id = (SELECT id FROM requirement_comments WHERE requirement_id=$1 ORDER BY id DESC LIMIT 1)`,
        [r102, rq03Date],
      );
    }

    // ── RQ-04 — attachment on REQ-103 ────────────────────────────────────
    console.log("RQ-04 — backdating the REQ-103 attachment...");
    const attachmentId = idOf(manifest, "attachment", "rq04-attachment");
    if (attachmentId) {
      await pool.query(`UPDATE requirement_attachments SET created_at=$2 WHERE id=$1`, [attachmentId, pt("2026-08-13", "17:00")]);
    }

    // ── RQ-05 — comment thread on REQ-104 ────────────────────────────────
    console.log("RQ-05 — backdating the REQ-104 comment thread...");
    const r104 = idOf(manifest, "requirement", "req104");
    if (r104) {
      const threadTimes = [pt("2026-08-11", "10:00"), pt("2026-08-11", "10:20"), pt("2026-08-11", "14:00")];
      const rows = await pool.query(`SELECT id FROM requirement_comments WHERE requirement_id=$1 ORDER BY id ASC LIMIT 3`, [r104]);
      const commentRows = rows.rows as { id: number }[];
      // The 3 RQ-05 thread comments are the FIRST 3 on REQ-104 (posted before
      // RQ-07's later note) — but RQ-07 posts a 4th comment afterward, so
      // ordering by id ASC and taking the first 3 correctly isolates them
      // regardless of run order.
      for (let i = 0; i < Math.min(3, commentRows.length); i++) {
        await pool.query(`UPDATE requirement_comments SET created_at=$2 WHERE id=$1`, [commentRows[i].id, threadTimes[i]]);
      }
    }

    // ── RQ-06 — QA-raised defect on REQ-102 ──────────────────────────────
    console.log("RQ-06 — backdating the QA-raised defect on REQ-102...");
    const rq06 = idOf(manifest, "defect", RQ06_DEFECT.key);
    if (rq06) {
      await pool.query(
        `UPDATE defects SET created_at=$2, updated_at=$3, status='Closed', status_synced_at=$3 WHERE id=$1`,
        [rq06, RQ06_DEFECT.created, RQ06_DEFECT.closed],
      );
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='defect' AND entity_id=$1 AND type='defect_created'`, [rq06, RQ06_DEFECT.created]);
      if (r102) {
        // The resolution comment (Aina's clarification) is the LAST comment
        // added on REQ-102 in the bonus pass — most recent row by id.
        await pool.query(
          `UPDATE requirement_comments SET created_at=$2 WHERE id = (SELECT id FROM requirement_comments WHERE requirement_id=$1 ORDER BY id DESC LIMIT 1)`,
          [r102, RQ06_DEFECT.closed],
        );
      }
    }

    // ── RQ-07 — priority escalation on REQ-104 ───────────────────────────
    console.log("RQ-07 — backdating REQ-104's priority escalation...");
    if (r104) {
      await pool.query(
        `UPDATE activity SET created_at=$2 WHERE id = (SELECT id FROM activity WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_updated' ORDER BY id DESC LIMIT 1)`,
        [r104, RQ07_DATE],
      );
      await pool.query(
        `UPDATE requirement_comments SET created_at=$2 WHERE id = (SELECT id FROM requirement_comments WHERE requirement_id=$1 ORDER BY id DESC LIMIT 1)`,
        [r104, RQ07_DATE],
      );
    }

    // ── RQ-08 — REQ-111 created, approved, reassigned to CR-2026-015 ─────
    console.log("RQ-08 — backdating REQ-111 and the new CR-2026-015 milestone...");
    const r111 = idOf(manifest, "requirement", "req111");
    const cr2 = idOf(manifest, "milestone", "cr2026015");
    if (cr2) {
      await pool.query(`UPDATE milestones SET created_at=$2, updated_at=$2 WHERE id=$1`, [cr2, REQ_111.reassignedDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='milestone' AND entity_id=$1 AND type='milestone_created'`, [cr2, REQ_111.reassignedDate]);
    }
    if (r111) {
      const submit111 = pt("2026-08-12", "11:00");
      const approve111 = pt("2026-08-13", "09:00");
      await pool.query(
        `UPDATE requirements SET created_at=$2, updated_at=$3, approved_at=$3 WHERE id=$1`,
        [r111, REQ_111.createdDate, approve111],
      );
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r111, REQ_111.createdDate]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_submit'`, [r111, submit111]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_approve'`, [r111, approve111]);
      await pool.query(
        `UPDATE activity SET created_at=$2 WHERE id = (SELECT id FROM activity WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_updated' ORDER BY id DESC LIMIT 1)`,
        [r111, REQ_111.reassignedDate],
      );
      await pool.query(
        `UPDATE requirement_comments SET created_at=$2 WHERE id = (SELECT id FROM requirement_comments WHERE requirement_id=$1 ORDER BY id DESC LIMIT 1)`,
        [r111, REQ_111.reassignedDate],
      );
    }

    // ── RQ-09 — REQ-112/113 created + deleted (backlog grooming) ─────────
    console.log("RQ-09 — backdating the bulk-deleted drafts' activity trail...");
    for (const key of ["req112", "req113"]) {
      const id = idOf(manifest, "requirement", key);
      if (!id) continue;
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [id, pt("2026-08-09", "09:00")]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_deleted'`, [id, RQ09_DATE]);
    }

    // ── RQ-10 — REQ-114 backlog ───────────────────────────────────────────
    console.log("RQ-10 — backdating REQ-114 (backlog, no milestone)...");
    const r114 = idOf(manifest, "requirement", "req114");
    if (r114) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$2 WHERE id=$1`, [r114, pt("2026-08-20", "09:00")]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r114, pt("2026-08-20", "09:00")]);
    }

    // ── RQ-11 — REQ-115 (deleted) / REQ-116 (orphaned child) ─────────────
    console.log("RQ-11 — backdating REQ-115/116 (orphan-on-delete edge case)...");
    const r115 = idOf(manifest, "requirement", "req115");
    const r116 = idOf(manifest, "requirement", "req116");
    const created115 = pt("2026-08-09", "10:00");
    if (r115) {
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r115, created115]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_deleted'`, [r115, RQ11_DATE]);
    }
    if (r116) {
      await pool.query(`UPDATE requirements SET created_at=$2, updated_at=$2 WHERE id=$1`, [r116, created115]);
      await pool.query(`UPDATE activity SET created_at=$2 WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_created'`, [r116, created115]);
    }

    // ── RQ-12 — REQ-103's AC4 tightened mid-SIT ──────────────────────────
    console.log("RQ-12 — backdating REQ-103's mid-SIT AC4 revision...");
    const r103 = idOf(manifest, "requirement", "req103");
    if (r103) {
      await pool.query(`UPDATE requirements SET updated_at=$2 WHERE id=$1`, [r103, RQ12_DATE]);
      await pool.query(
        `UPDATE activity SET created_at=$2 WHERE id = (SELECT id FROM activity WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_updated' ORDER BY id DESC LIMIT 1)`,
        [r103, RQ12_DATE],
      );
      await pool.query(
        `UPDATE activity SET created_at=$2 WHERE id = (SELECT id FROM activity WHERE entity_type='requirement' AND entity_id=$1 AND type='requirement_revised' ORDER BY id DESC LIMIT 1)`,
        [r103, RQ12_DATE],
      );
      // Any test_case/task rows whose requirementRevisedAt this triggered
      // should read as "flagged mid-SIT," not "flagged in August."
      await pool.query(`UPDATE test_cases SET requirement_revised_at=$2 WHERE requirement_id=$1 AND requirement_revised_at IS NOT NULL`, [r103, RQ12_DATE]);
      await pool.query(`UPDATE tasks SET requirement_revised_at=$2 WHERE requirement_id=$1 AND requirement_revised_at IS NOT NULL`, [r103, RQ12_DATE]);
    }

    console.log("\nDone. Requirements-page bonus scenarios (RQ-01…RQ-12) are backdated.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
