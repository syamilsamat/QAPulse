/**
 * Backdates requirements.createdAt, activity-log timestamps, AND execution
 * test case executedAt values so the PM Dashboard phase timeline shows all
 * phase bars (Requirements → Gap → Develop → QA testing).
 *
 * What was missing:
 *  1. requirements.createdAt was still "now" — making all backdated events
 *     appear to pre-date the requirement's creation → 0d segments
 *  2. requirement_dev_assign and requirement_dev_ready_for_qa activity events
 *     were never created by the seed (seed only does review flows) — without
 *     these the machine stays in "gap" forever, never reaching "develop" or
 *     "testing"
 *  3. execution_test_cases.executedAt was null — even when the machine reaches
 *     "testing", emitTesting() returns nothing if there are no exec timestamps
 *  4. QA-type and UAT-type execution_test_cases were both backdated to the
 *     exact same qaExecAgo timestamp — collapsing the QA segment to 0 days
 *     (qaEnd = uatTimes[0] in emitTesting) and making it look like UAT
 *     happened straight after development with no testing in between. Now
 *     backdated separately (uatExecAgo, strictly after qaExecAgo finishes).
 *
 * Run AFTER seed-demo-data.ts:
 *   cd /home/runner/workspace/scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/backdate-demo-activity.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray, and, isNull, isNotNull } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { loadManifest } from "./seed-client.js";
import { MILESTONES } from "./demo-data.js";

// ── Minimal table shapes ──────────────────────────────────────────────────

const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  userId: integer("user_id"),
  entityId: integer("entity_id"),
  entityType: text("entity_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const requirementsTable = pgTable("requirements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  milestoneId: integer("milestone_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  reqTargetDate: timestamp("req_target_date", { withTimezone: true }),
  devTargetDate: timestamp("dev_target_date", { withTimezone: true }),
  qaTargetDate: timestamp("qa_target_date", { withTimezone: true }),
  uatTargetDate: timestamp("uat_target_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

const executionFilesTable = pgTable("execution_files", {
  id: serial("id").primaryKey(),
  fileType: text("file_type").notNull().default("qa"),
});

const executionTestCasesTable = pgTable("execution_test_cases", {
  id: serial("id").primaryKey(),
  executionFileId: integer("execution_file_id").notNull(),
  requirementId: integer("requirement_id"),
  result: text("result"),
  executedAt: timestamp("executed_at"),
});

// ── Timeline config per milestone ─────────────────────────────────────────
// All values are "days before today". Must be strictly decreasing down each
// column — created > submit > approve > devAssign > readyForQA > qaExec.
// devAssign sits ~3 days after approve so the Gap phase is a small,
// deliberate segment instead of an accident of jitter.
// `completed` (completed milestones only) backdates milestones.completedAt —
// without it the real PATCH transition stamps completedAt = seed time, which
// makes every open-ended trailing phase (QA with no UAT file, UAT) run all
// the way to "now" and dwarf the rest of the timeline.

const ANCHORS: Record<string, {
  created: number;
  submit: number;
  approve: number;
  devAssign: number;
  readyForQA: number;
  qaExec: number;    // when first QA execution result was recorded
  uatExec: number;   // when first UAT execution result was recorded — must
                      // stay well below qaExec so QA visibly finishes first
  completed?: number; // completed milestones only — see note above
}> = {
  // Portal — completed sprint history worsens 10 → 11 → 12 so the
  // "Is this a pattern?" benchmark table tells a visible story.
  "Sprint 10":   { created: 122, submit: 119, approve: 115, devAssign: 112, readyForQA: 102, qaExec: 99, uatExec: 95, completed: 92 },
  "Sprint 11":   { created: 94,  submit: 91,  approve: 86,  devAssign: 83,  readyForQA: 70,  qaExec: 67, uatExec: 61, completed: 58 },
  "Sprint 12":   { created: 60, submit: 57, approve: 54, devAssign: 51, readyForQA: 37, qaExec: 34, uatExec: 29, completed: 22 },
  "Sprint 13":   { created: 28, submit: 26, approve: 24, devAssign: 21, readyForQA: 14, qaExec: 11, uatExec: 6  },
  "Sprint 14":   { created: 12, submit: 10, approve: 8,  devAssign: 5,  readyForQA: 2,  qaExec: 1,  uatExec: 0  },
  // Banking
  "SIT Phase 1": { created: 110, submit: 107, approve: 103, devAssign: 100, readyForQA: 89, qaExec: 86, uatExec: 82, completed: 79 },
  "Release 2.0": { created: 48, submit: 45, approve: 42, devAssign: 39, readyForQA: 21, qaExec: 18, uatExec: 12 },
  "Release 2.1": { created: 14, submit: 12, approve: 10, devAssign: 7,  readyForQA: 4,  qaExec: 2,  uatExec: 0  },
  "UAT Phase 1": { created: 80, submit: 77, approve: 73, devAssign: 70, readyForQA: 49, qaExec: 45, uatExec: 39, completed: 31 },
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var is required");

  const manifest = loadManifest();
  const reqIds = manifest.filter((e) => e.type === "requirement").map((e) => e.id as number);
  if (reqIds.length === 0) {
    console.log("No demo requirements in manifest. Run seed-demo-data.ts first.");
    return;
  }
  console.log(`Backdating ${reqIds.length} requirements from manifest...\n`);

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    // ── Step 0: patch phase target dates onto existing seeded milestones ──
    // Handles the case where milestones were seeded before this feature shipped.
    console.log("Setting phase target dates on demo milestones...");
    const milestoneManifest = manifest.filter((e) => e.type === "milestone");
    for (const entry of milestoneManifest) {
      const demoM = MILESTONES.find((m) => (entry.label as string).startsWith(m.name));
      if (!demoM || (!demoM.startDate && !demoM.reqTargetDate && !demoM.devTargetDate && !demoM.qaTargetDate && !demoM.uatTargetDate)) continue;
      // Backdate completedAt too — the seed's real PATCH transition stamped
      // it "now", which would stretch every trailing phase to today.
      const anchor = ANCHORS[demoM.name];
      const completedAt = demoM.status === "completed" && anchor?.completed !== undefined
        ? daysAgo(anchor.completed)
        : undefined;
      await db.update(milestonesTable).set({
        startDate: demoM.startDate ? new Date(demoM.startDate) : null,
        reqTargetDate: demoM.reqTargetDate ? new Date(demoM.reqTargetDate) : null,
        devTargetDate: demoM.devTargetDate ? new Date(demoM.devTargetDate) : null,
        qaTargetDate: demoM.qaTargetDate ? new Date(demoM.qaTargetDate) : null,
        uatTargetDate: demoM.uatTargetDate ? new Date(demoM.uatTargetDate) : null,
        ...(completedAt ? { completedAt } : {}),
      }).where(eq(milestonesTable.id, entry.id as number));
      console.log(`  [${demoM.name}] start=${demoM.startDate} req=${demoM.reqTargetDate} dev=${demoM.devTargetDate} qa=${demoM.qaTargetDate} uat=${demoM.uatTargetDate}${completedAt ? ` completed=${anchor!.completed}d ago` : ""}`);
    }
    console.log("");

    const reqs = await db
      .select({ id: requirementsTable.id, title: requirementsTable.title, milestoneId: requirementsTable.milestoneId })
      .from(requirementsTable)
      .where(inArray(requirementsTable.id, reqIds));

    const milestoneIds = [...new Set(reqs.map((r) => r.milestoneId).filter(Boolean))] as number[];
    const milestones = milestoneIds.length > 0
      ? await db.select().from(milestonesTable).where(inArray(milestonesTable.id, milestoneIds))
      : [];
    const milestoneById = new Map(milestones.map((m) => [m.id, m]));

    // Existing activity events for these requirements
    const events = await db
      .select()
      .from(activityTable)
      .where(and(
        eq(activityTable.entityType, "requirement"),
        inArray(activityTable.entityId, reqIds),
      ));

    // Execution test cases linked to these requirements (for executedAt).
    // Joined to executionFilesTable so QA-type and UAT-type cases can be
    // backdated to different anchors below (see "What was missing" #4).
    const execCases = await db
      .select({
        id: executionTestCasesTable.id,
        requirementId: executionTestCasesTable.requirementId,
        executionFileId: executionTestCasesTable.executionFileId,
        fileType: executionFilesTable.fileType,
      })
      .from(executionTestCasesTable)
      .innerJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
      .where(inArray(executionTestCasesTable.requirementId, reqIds));

    console.log(`Found ${events.length} activity events, ${execCases.length} linked execution test cases.\n`);

    let reqsUpdated = 0;
    let eventsUpdated = 0;
    let eventsInserted = 0;
    let execUpdated = 0;

    for (const req of reqs) {
      const milestone = req.milestoneId ? milestoneById.get(req.milestoneId) : null;
      if (!milestone) { console.log(`  req ${req.id}: no milestone — skip`); continue; }

      const anchorKey =
        Object.keys(ANCHORS).find((k) => k === milestone.name) ??
        Object.keys(ANCHORS).find((k) => milestone.name.toLowerCase().includes(k.toLowerCase()));

      if (!anchorKey) {
        console.log(`  req ${req.id}: no anchor for "${milestone.name}" — skip`);
        continue;
      }

      const a = ANCHORS[anchorKey];
      // ONE random offset per requirement, applied to every anchor — shifts
      // each requirement's whole timeline by 0–2 days so rows don't align
      // perfectly, without ever reordering events. (Jittering each anchor
      // independently could put e.g. dev_assign before approve, which left
      // the phase state machine stuck in "gap" until milestone completion —
      // the source of the phantom multi-week Gap segments.)
      const off = Math.floor(Math.random() * 3);
      const createdAgo    = a.created    + off;
      const submitAgo     = a.submit     + off;
      const approveAgo    = a.approve    + off;
      const devAssignAgo  = a.devAssign  + off;
      const readyForQaAgo = a.readyForQA + off;
      const qaExecAgo     = a.qaExec     + off;
      const uatExecAgo    = a.uatExec    + off;

      // 1. Backdate the requirement row
      await db
        .update(requirementsTable)
        .set({ createdAt: daysAgo(createdAgo), updatedAt: daysAgo(approveAgo) })
        .where(eq(requirementsTable.id, req.id));
      reqsUpdated++;

      // 2. Backdate existing activity events
      const reqEvents = events.filter((e) => e.entityId === req.id).sort((a, b) => a.id - b.id);
      // Requirements with multiple submit events come from two flows that
      // need different second-submit placement:
      //  - reject-then-approve (has a reject event): the re-submit happened
      //    BEFORE the approve → land it just before approveAgo, otherwise
      //    the state machine sees a post-approve submit and opens a phantom
      //    second Requirements cycle that runs to milestone completion.
      //  - approve-then-edit (no reject): the re-submit is a genuine
      //    mid-development rework → land it between devAssign and readyForQA.
      const submitEvents = reqEvents.filter((e) => e.type === "requirement_submit");
      const hasReject = reqEvents.some((e) => e.type === "requirement_reject");
      const resubmitAgo = hasReject
        ? approveAgo + 1
        : Math.round((devAssignAgo + readyForQaAgo) / 2);
      let submitIdx = 0;
      for (const ev of reqEvents) {
        let target: Date | null = null;
        if (ev.type === "requirement_submit") {
          target = submitIdx === 0 ? daysAgo(submitAgo) : daysAgo(resubmitAgo);
          submitIdx++;
        } else if (ev.type === "requirement_approve")           target = daysAgo(approveAgo);
        else if (ev.type === "requirement_reject")              target = daysAgo(submitAgo - 1);
        else if (ev.type === "requirement_dev_assign")          target = daysAgo(devAssignAgo);
        else if (ev.type === "requirement_dev_ready_for_qa")    target = daysAgo(readyForQaAgo);
        else if (ev.type === "requirement_updated" || ev.type === "requirement_revised") {
          target = daysAgo(approveAgo + 1);
        }
        if (target) {
          await db.update(activityTable).set({ createdAt: target }).where(eq(activityTable.id, ev.id));
          eventsUpdated++;
        }
      }

      // 3. Insert dev_assign event if none exists (seed never creates these)
      const hasDevAssign = reqEvents.some((e) => e.type === "requirement_dev_assign");
      if (!hasDevAssign) {
        await db.insert(activityTable).values({
          type: "requirement_dev_assign",
          description: `Requirement "${req.title}" assigned to developer`,
          entityId: req.id,
          entityType: "requirement",
          createdAt: daysAgo(devAssignAgo),
        });
        eventsInserted++;
      }

      // 4. Insert dev_ready_for_qa event if none exists.
      //    Skip for requirements that have a re-submit after dev-assign
      //    (approve-then-edit flow) — dev was blocked, never reached QA.
      //    A reject-then-approve requirement also has two submits, but both
      //    happened before the approve — its dev ran to completion normally.
      const hasResubmitAfterDev = submitEvents.length > 1 && !hasReject;
      const hasReadyForQa = reqEvents.some((e) => e.type === "requirement_dev_ready_for_qa");
      if (!hasReadyForQa && !hasResubmitAfterDev) {
        await db.insert(activityTable).values({
          type: "requirement_dev_ready_for_qa",
          description: `Requirement "${req.title}" marked ready for QA`,
          entityId: req.id,
          entityType: "requirement",
          createdAt: daysAgo(readyForQaAgo),
        });
        eventsInserted++;
      }

      // 5. Update executedAt on linked execution test cases so the testing
      //    phase has timestamps inside the testing window. Only the
      //    timestamp — result is untouched so the deliberate Passed/Failed/
      //    Blocked mix seeded in demo-data.ts survives (an earlier version
      //    of this script blanket-set result: "pass" on every row here,
      //    which silently erased every seeded defect scenario and also
      //    rendered as a lowercase "pass" pill instead of "Passed").
      //    QA-type and UAT-type cases get different anchors (see "What was
      //    missing" #4) — QA must visibly finish before UAT begins, matching
      //    a real QA process where nothing reaches UAT without passing QA.
      const linkedCases = execCases.filter((tc) => tc.requirementId === req.id);
      for (const tc of linkedCases) {
        const executedAt = tc.fileType === "uat" ? daysAgo(uatExecAgo) : daysAgo(qaExecAgo);
        await db
          .update(executionTestCasesTable)
          .set({ executedAt })
          .where(eq(executionTestCasesTable.id, tc.id));
        execUpdated++;
      }

      console.log(
        `  [${milestone.name}] req ${req.id} "${req.title.slice(0, 35)}" ` +
        `created=${createdAgo}d approve=${approveAgo}d devAssign=${devAssignAgo}d readyForQA=${readyForQaAgo}d qaExec=${qaExecAgo}d uatExec=${uatExecAgo}d` +
        (linkedCases.length > 0 ? ` (${linkedCases.length} exec TCs)` : ""),
      );
    }

    console.log(`\nDone:`);
    console.log(`  ${reqsUpdated} requirements backdated`);
    console.log(`  ${eventsUpdated} activity events backdated`);
    console.log(`  ${eventsInserted} dev_assign/ready_for_qa events inserted`);
    console.log(`  ${execUpdated} execution test case executedAt values set`);
    console.log("\nRefresh the PM Dashboard to see all phase bars.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
