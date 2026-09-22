/**
 * Backdates every SPARROW / CR-2026-014 record to the exact storyline dates
 * from the reference PDF (shifted by PDF_DATE_SHIFT_MONTHS so the whole
 * lifecycle sits in the recent past — see sparrow-data.ts's pd()/pt()), and
 * stamps final defect statuses that the sandboxed Redmine write-through
 * cannot set on its own (no live Redmine connection here — same known
 * limitation as scripts/DEMO_DATA.md's older two-project dataset).
 *
 * Run AFTER seed-sparrow-data.ts, from the Replit shell:
 *   cd scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/finalize-sparrow-data.ts
 *
 * Everything here is looked up by the KEYS recorded in
 * sparrow-seed-manifest.json (label = "key::human label") — never by name
 * matching — so it only ever touches rows this seed created.
 */

import pg from "pg";
import { loadSparrowManifest, keyOf, type SparrowEntityType } from "./sparrow-manifest";
import { pd, pt, DEFECTS, RISKS } from "./sparrow-data";

const { Pool } = pg;

function idMap(manifest: ReturnType<typeof loadSparrowManifest>, type: SparrowEntityType): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of manifest) {
    if (e.type !== type) continue;
    const k = keyOf(e);
    if (k) m.set(k, Number(e.id));
  }
  return m;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const manifest = loadSparrowManifest();
  if (manifest.length === 0) {
    console.log("No sparrow-seed-manifest.json found — run seed-sparrow-data.ts first.");
    return;
  }

  const milestoneId = idMap(manifest, "milestone");
  const reqId = idMap(manifest, "requirement");
  const tcId = idMap(manifest, "testCase");
  const execFileId = idMap(manifest, "executionFile");
  const defectId = idMap(manifest, "defect");
  const riskId = idMap(manifest, "risk");
  const taskId = idMap(manifest, "task");

  const pool = new Pool({ connectionString: dbUrl });

  try {
    // ── 1. Milestones ─────────────────────────────────────────────────────
    console.log("Backdating milestones...");
    const cr = milestoneId.get("cr2026014");
    const hotfix = milestoneId.get("hotfix2026003");
    if (cr) {
      await pool.query(
        `UPDATE milestones SET created_at = $2, updated_at = $2, completed_at = $3 WHERE id = $1`,
        [cr, pt("2026-08-04", "09:00"), pt("2026-10-14", "15:02")],
      );
      console.log(`  CR-2026-014: created ${pd("2026-08-04")}, completed ${pd("2026-10-14")} 15:02`);
    }
    if (hotfix) {
      await pool.query(
        `UPDATE milestones SET created_at = $2, updated_at = $3, completed_at = $3 WHERE id = $1`,
        [hotfix, pt("2026-09-07", "09:00"), pt("2026-09-13", "18:00")],
      );
      console.log(`  HOTFIX-2026-003: created ${pd("2026-09-07")}, completed ${pd("2026-09-13")}`);
    }

    // ── 2. Requirements — exact per-key timeline from the PDF ─────────────
    // Every date below is quoted (or directly implied) in Phase 2–5 of the
    // reference document; see the Sx.y scenario cited in each comment.
    type ReqTimeline = {
      created: string; submit: string; approve?: string; reject?: string; resubmit?: string;
      devAssign: string; devStart: string; readyForQa: string; revised?: string;
    };
    const REQ_TIMELINE: Record<string, ReqTimeline> = {
      req101: { // S2.1, S3.1 (approved 12 Aug 10:42), S4.1 (assigned 17 Aug 09:15), S5.1 (start 18 Aug), S6.3 (revised 26 Aug), S5.4 (ready 09 Sep 17:30)
        created: pt("2026-08-09", "09:00"), submit: pt("2026-08-11", "14:00"), approve: pt("2026-08-12", "10:42"),
        devAssign: pt("2026-08-17", "09:15"), devStart: pt("2026-08-18", "09:00"),
        revised: pt("2026-08-26", "11:00"), readyForQa: pt("2026-09-09", "17:30"),
      },
      req102: { // S2.3 (imported), approved before the Aug 14 req target; S4.3 reassigned 29 Aug
        created: pt("2026-08-09", "10:00"), submit: pt("2026-08-10", "11:00"), approve: pt("2026-08-13", "09:30"),
        devAssign: pt("2026-08-17", "10:00"), devStart: pt("2026-08-20", "09:00"),
        readyForQa: pt("2026-09-09", "17:00"),
      },
      req103: { // S2.2 (weak draft), S3.3 (rejected 13 Aug, approved 15 Aug), S4.2 (assigned same day)
        created: pt("2026-08-08", "09:00"), submit: pt("2026-08-12", "16:00"),
        reject: pt("2026-08-13", "09:00"), resubmit: pt("2026-08-14", "10:00"), approve: pt("2026-08-15", "11:00"),
        devAssign: pt("2026-08-15", "15:00"), devStart: pt("2026-08-20", "09:00"),
        readyForQa: pt("2026-09-09", "17:00"),
      },
      req104: { // S3.4 (submitted 10 Aug, stale >3 days, approved 14 Aug 16:05)
        created: pt("2026-08-10", "09:00"), submit: pt("2026-08-10", "09:30"), approve: pt("2026-08-14", "16:05"),
        devAssign: pt("2026-08-17", "11:00"), devStart: pt("2026-08-20", "09:00"),
        readyForQa: pt("2026-09-09", "17:30"), // gated behind T-85/T-88 (S5.3), resolved 05 Sep
      },
    };

    console.log("\nBackdating requirements...");
    for (const [key, t] of Object.entries(REQ_TIMELINE)) {
      const id = reqId.get(key);
      if (!id) { console.log(`  ! ${key} not in manifest — skip`); continue; }
      const lastEvent = t.readyForQa;
      await pool.query(
        `UPDATE requirements SET created_at = $2, updated_at = $3,
           approved_at = $4, rejected_at = $5, dev_assigned_at = $6, ready_for_qa_at = $7
         WHERE id = $1`,
        [id, t.created, lastEvent, t.approve ?? null, t.reject ?? null, t.devAssign, t.readyForQa],
      );

      // Backdate this requirement's own activity-log rows to match, event by
      // event. Extra/unexpected event rows are left untouched rather than
      // guessed at.
      const events = await pool.query(
        `SELECT id, type FROM activity WHERE entity_type = 'requirement' AND entity_id = $1 ORDER BY id ASC`,
        [id],
      );
      let submitsSeen = 0;
      for (const ev of events.rows as { id: number; type: string }[]) {
        let target: string | null = null;
        switch (ev.type) {
          case "requirement_created": target = t.created; break;
          case "requirement_submit":
            target = submitsSeen === 0 ? t.submit : (t.resubmit ?? t.submit);
            submitsSeen++;
            break;
          case "requirement_approve": target = t.approve ?? null; break;
          case "requirement_reject": target = t.reject ?? null; break;
          case "requirement_dev_assign": target = t.devAssign; break;
          case "requirement_dev_start": target = t.devStart; break;
          case "requirement_dev_ready_for_qa": target = t.readyForQa; break;
          case "requirement_updated":
          case "requirement_revised": target = t.revised ?? t.approve ?? null; break;
          default: target = null;
        }
        if (target) await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [ev.id, target]);
      }
      console.log(`  ${key}: created ${t.created.slice(0, 10)} → readyForQA ${t.readyForQa.slice(0, 10)} (${events.rowCount} activity rows touched)`);
    }

    // S4.3 — REQ-102 reassignment Kavitha → Wei Jun on 29 Aug (second
    // dev_assign row, if the API logged one — same switch above already
    // maps any further requirement_dev_assign rows to t.devAssign, so
    // nudge the SECOND one specifically to 29 Aug here.
    {
      const id = reqId.get("req102");
      if (id) {
        const rows = await pool.query(
          `SELECT id FROM activity WHERE entity_type = 'requirement' AND entity_id = $1 AND type = 'requirement_dev_assign' ORDER BY id ASC`,
          [id],
        );
        if (rows.rowCount && rows.rowCount > 1) {
          await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [rows.rows[1].id, pt("2026-08-29", "14:00")]);
          console.log("  req102: second dev_assign (reassignment) backdated to 29 Aug (S4.3)");
        }
      }
    }

    // ── 3. Execution rows — SIT (10–25 Sep) and UAT (06–14 Oct) ───────────
    console.log("\nBackdating execution test case rows...");
    const sitFileId = execFileId.get("sit");
    const uatFileId = execFileId.get("uat");

    // Round A default per file, then per-row overrides for the scenarios
    // that need a specific date (S7.1 outage window, S7.2/S8.3 defects,
    // S7.4 regression pack, S9.1/S9.2 UAT dates).
    const SIT_ROUND_A_DEFAULT = pt("2026-09-10", "11:00");
    const SIT_ROUND_A_OVERRIDES: Record<string, string> = {
      "TC-211": pt("2026-09-11", "10:00"), "TC-212": pt("2026-09-11", "10:00"),
      "TC-213": pt("2026-09-11", "10:00"), "TC-214": pt("2026-09-11", "10:00"),
      "TC-216": pt("2026-09-11", "10:00"), "TC-REG-03": pt("2026-09-11", "10:00"), // ENV4 outage window (S7.3)
      "TC-209": pt("2026-09-14", "09:00"),   // DEF-0042 found (S7.2)
      "TC-217": pt("2026-09-14", "09:30"),   // DEF-0047 found (S8.2)
      "TC-REG-02": pt("2026-09-20", "10:00"), // DEF-0051 critical found (S8.3)
    };
    const SIT_ROUND_B_DEFAULT = pt("2026-09-25", "16:00");
    const SIT_ROUND_B_OVERRIDES: Record<string, string> = {
      "TC-211": pt("2026-09-13", "09:00"), "TC-212": pt("2026-09-13", "09:00"),
      "TC-213": pt("2026-09-13", "09:00"), "TC-214": pt("2026-09-13", "09:00"),
      "TC-216": pt("2026-09-13", "09:00"), "TC-REG-03": pt("2026-09-13", "09:00"), // re-executed after ENV4 restore
      "TC-209": pt("2026-09-16", "10:00"),   // DEF-0042 retested + closed
      "TC-217": pt("2026-09-14", "09:30"),   // stays Failed — deferred, not retested
      "TC-REG-04": pt("2026-09-17", "11:00"), "TC-REG-05": pt("2026-09-17", "11:00"),
      "TC-REG-06": pt("2026-09-17", "11:00"), "TC-REG-07": pt("2026-09-17", "11:00"),
      "TC-REG-08": pt("2026-09-17", "11:00"), "TC-REG-09": pt("2026-09-17", "11:00"),
      "TC-REG-10": pt("2026-09-17", "11:00"), "TC-REG-11": pt("2026-09-17", "11:00"), // AI-selected pack (S7.4)
      "TC-REG-02": pt("2026-09-25", "10:00"), // DEF-0051 retest + AI regression pack (S8.3)
    };

    const UAT_ROUND_A_DEFAULT = pt("2026-10-07", "10:00");
    const UAT_ROUND_A_OVERRIDES: Record<string, string> = {
      "UAT-11": pt("2026-10-08", "09:00"),  // DEF-0058 found (S9.2)
      "UAT-14": pt("2026-10-08", "09:00"),
    };
    const UAT_ROUND_B_DEFAULT = pt("2026-10-09", "10:00");
    const UAT_ROUND_B_OVERRIDES: Record<string, string> = {
      "UAT-11": pt("2026-10-13", "11:00"),  // DEF-0058 retested with the business user (S9.2/S9.3)
    };

    async function backdateExecRows(
      fileId: number | undefined,
      roundADefault: string, roundAOverrides: Record<string, string>,
      roundBDefault: string, roundBOverrides: Record<string, string>,
    ) {
      if (!fileId) return;
      const rows = await pool.query(
        `SELECT id, test_case_id, result FROM execution_test_cases WHERE execution_file_id = $1`,
        [fileId],
      );
      for (const r of rows.rows as { id: number; test_case_id: string | null; result: string | null }[]) {
        if (!r.test_case_id) continue;
        // roundBOnly rows (appended AI-regression / previously "Not Executed"
        // rows) only ever got a round-B save, so a round-A override never
        // applies to them — fine, roundAOverrides simply won't be consulted
        // for TC-REG-04..11 / UAT-14 by construction of the seed script.
        const executedAt = r.result === "Not Executed"
          ? null
          : (roundBOverrides[r.test_case_id] ?? roundBDefault);
        if (executedAt) {
          await pool.query(`UPDATE execution_test_cases SET executed_at = $2 WHERE id = $1`, [r.id, executedAt]);
        }
      }
      console.log(`  execution file ${fileId}: ${rows.rowCount} rows backdated`);
    }
    await backdateExecRows(sitFileId, SIT_ROUND_A_DEFAULT, SIT_ROUND_A_OVERRIDES, SIT_ROUND_B_DEFAULT, SIT_ROUND_B_OVERRIDES);
    await backdateExecRows(uatFileId, UAT_ROUND_A_DEFAULT, UAT_ROUND_A_OVERRIDES, UAT_ROUND_B_DEFAULT, UAT_ROUND_B_OVERRIDES);

    // ── 4. Defects — final status + open/close timestamps ────────────────
    // PATCH /defects/:id/status requires a synced Redmine status row, which
    // this sandbox's write-through can't produce (no live Redmine) — same
    // documented limitation as the older two-project demo set. Status is
    // therefore stamped directly here, matching each scenario's narrated
    // outcome (S7.2, S8.2, S8.3, S9.2, S10.4).
    console.log("\nBackdating defects (open/close dates + final status)...");
    const DEFECT_TIMELINE: Record<string, { created: string; updated: string; status: string }> = {
      dreq: { created: pt("2026-08-25", "09:00"), updated: pt("2026-08-26", "11:00"), status: "Closed" }, // S5.2 → resolved via S6.3 clarification
      d42:  { created: pt("2026-09-14", "09:00"), updated: pt("2026-09-16", "10:00"), status: "Closed" }, // S7.2
      d47:  { created: pt("2026-09-14", "09:30"), updated: pt("2026-09-19", "12:00"), status: "Deferred" }, // S8.2
      d51:  { created: pt("2026-09-20", "10:00"), updated: pt("2026-09-24", "17:00"), status: "Closed" }, // S8.3 (fix lands 24 Sep, retest 25 Sep)
      d58:  { created: pt("2026-10-08", "09:00"), updated: pt("2026-10-13", "11:00"), status: "Closed" }, // S9.2
      dp4:  { created: pt("2026-10-28", "10:00"), updated: pt("2026-11-04", "15:00"), status: "Closed" }, // S10.4 — "two weeks after go-live" (23 Oct + 14d)
    };
    for (const [key, t] of Object.entries(DEFECT_TIMELINE)) {
      const id = defectId.get(key);
      if (!id) { console.log(`  ! ${key} not in manifest — skip`); continue; }
      await pool.query(
        `UPDATE defects SET created_at = $2, updated_at = $3, status = $4, status_synced_at = $3 WHERE id = $1`,
        [id, t.created, t.updated, t.status],
      );
      const activityRows = await pool.query(
        `SELECT id, type FROM activity WHERE entity_type = 'defect' AND entity_id = $1 ORDER BY id ASC`,
        [id],
      );
      for (const ev of activityRows.rows as { id: number; type: string }[]) {
        const target = ev.type === "defect_created" ? t.created : t.updated;
        await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [ev.id, target]);
      }
      const pdfCode = DEFECTS.find((d) => d.key === key)?.pdfCode ?? key;
      console.log(`  ${pdfCode}: opened ${t.created.slice(0, 10)} → ${t.status} ${t.updated.slice(0, 10)}`);
    }

    // ── 5. Risks — open/closed dates ───────────────────────────────────────
    console.log("\nBackdating risks...");
    const RISK_TIMELINE: Record<string, { created: string; closed?: string }> = {
      r01: { created: pt("2026-08-04", "09:30"), closed: pt("2026-08-22", "12:00") }, // S11.1
      r02: { created: pt("2026-08-04", "10:00"), closed: pt("2026-10-14", "15:02") },
      r04: { created: pt("2026-08-20", "09:00"), closed: pt("2026-09-25", "17:00") }, // S11.2
      r05: { created: pt("2026-09-11", "08:00"), closed: pt("2026-09-13", "09:00") }, // S7.3
      r06: { created: pt("2026-09-20", "10:30"), closed: pt("2026-09-25", "10:00") }, // S8.3
      r07: { created: pt("2026-09-15", "09:00") }, // S11.3 — realized, no closedAt (still "realized", not "closed")
      r09: { created: pt("2026-09-07", "09:00"), closed: pt("2026-09-13", "18:00") }, // S1.3 / hotfix
    };
    for (const [key, t] of Object.entries(RISK_TIMELINE)) {
      const id = riskId.get(key);
      if (!id) { console.log(`  ! ${key} not in manifest — skip`); continue; }
      await pool.query(
        `UPDATE risks SET created_at = $2, updated_at = $3, closed_at = $4 WHERE id = $1`,
        [id, t.created, t.closed ?? t.created, t.closed ?? null],
      );
      const activityRows = await pool.query(
        `SELECT id FROM activity WHERE entity_type = 'risk' AND entity_id = $1 AND type = 'risk_created'`,
        [id],
      );
      for (const ev of activityRows.rows as { id: number }[]) {
        await pool.query(`UPDATE activity SET created_at = $2 WHERE id = $1`, [ev.id, t.created]);
      }
      const pdfCode = RISKS.find((r) => r.key === key)?.pdfCode ?? key;
      console.log(`  ${pdfCode}: raised ${t.created.slice(0, 10)}${t.closed ? ` → closed ${t.closed.slice(0, 10)}` : " (still open/realized)"}`);
    }

    // ── 6. Milestone-level activity (created / signed off) ────────────────
    if (cr) {
      await pool.query(
        `UPDATE activity SET created_at = $2 WHERE entity_type = 'milestone' AND entity_id = $1 AND type = 'milestone_created'`,
        [cr, pt("2026-08-04", "09:00")],
      );
      await pool.query(
        `UPDATE activity SET created_at = $2 WHERE entity_type = 'milestone' AND entity_id = $1 AND type = 'milestone_approved'`,
        [cr, pt("2026-10-14", "15:02")],
      );
    }
    if (hotfix) {
      await pool.query(
        `UPDATE activity SET created_at = $2 WHERE entity_type = 'milestone' AND entity_id = $1 AND type = 'milestone_created'`,
        [hotfix, pt("2026-09-07", "09:00")],
      );
    }

    // ── 7. Tasks — align to the timeline (already dated at seed time via
    //    startDate/dueDate/actualStartDate/actualEndDate in the API payload;
    //    only created_at/updated_at need a nudge so they don't show as
    //    created "today"). ─────────────────────────────────────────────────
    console.log("\nBackdating task created_at...");
    for (const [, id] of taskId) {
      await pool.query(`UPDATE tasks SET created_at = $2, updated_at = $2 WHERE id = $1`, [id, pt("2026-08-18", "09:00")]);
    }

    // ── 8. Notifications — best-effort match to the sibling activity event
    // so the inbox doesn't show every notification stamped at seed time.
    console.log("\nBackdating notifications (best-effort match to activity)...");
    const notifMap: { notifType: string; entityType: string; activityTypes: string[] }[] = [
      { notifType: "review_request", entityType: "requirement", activityTypes: ["requirement_submit"] },
      { notifType: "review_approved", entityType: "requirement", activityTypes: ["requirement_approve"] },
      { notifType: "review_rejected", entityType: "requirement", activityTypes: ["requirement_reject"] },
      { notifType: "revision_required", entityType: "requirement", activityTypes: ["requirement_updated", "requirement_revised"] },
      { notifType: "requirement_dev_assigned", entityType: "requirement", activityTypes: ["requirement_dev_assign"] },
      { notifType: "requirement_ready_for_qa", entityType: "requirement", activityTypes: ["requirement_dev_ready_for_qa"] },
      { notifType: "defect_opened", entityType: "defect", activityTypes: ["defect_created"] },
      { notifType: "defect_assigned", entityType: "defect", activityTypes: ["defect_assigned"] },
      { notifType: "defect_status_changed", entityType: "defect", activityTypes: ["defect_status_changed", "defect_updated"] },
    ];
    let notifTouched = 0;
    for (const m of notifMap) {
      const res = await pool.query(
        `UPDATE notifications n
           SET created_at = a.created_at
           FROM activity a
          WHERE n.entity_type = $1 AND n.type = $2
            AND a.entity_type = $1 AND a.entity_id = n.entity_id
            AND a.type = ANY($3::text[])
            AND n.entity_id = ANY($4::int[])`,
        [m.entityType, m.notifType, m.activityTypes, m.entityType === "requirement" ? [...reqId.values()] : [...defectId.values()]],
      );
      notifTouched += res.rowCount ?? 0;
    }
    // uat_milestone_ready — fires once, when the UAT pass rate first crosses
    // 80% (S9.1, 08 Oct 14:20).
    if (cr) {
      await pool.query(
        `UPDATE notifications SET created_at = $2 WHERE entity_type = 'milestone' AND entity_id = $1 AND type = 'uat_milestone_ready'`,
        [cr, pt("2026-10-08", "14:20")],
      );
    }
    console.log(`  ${notifTouched} notifications backdated to their matching activity event`);

    console.log("\nDone. Refresh the app — PM Dashboard, Requirements, Defects, Risk Register, and QA Analytics should now all read the CR-2026-014 storyline in chronological order.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
