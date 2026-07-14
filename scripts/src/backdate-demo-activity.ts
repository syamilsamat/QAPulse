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
// column — created > submit > approve > devAssign > readyForQA > qaExec

const ANCHORS: Record<string, {
  created: number;
  submit: number;
  approve: number;
  devAssign: number;  // same as approve → 0d gap → gap bar hidden
  readyForQA: number;
  qaExec: number;    // when first QA execution result was recorded
}> = {
  "Sprint 12":   { created: 60, submit: 57, approve: 54, devAssign: 54, readyForQA: 37, qaExec: 34 },
  "Sprint 13":   { created: 28, submit: 26, approve: 24, devAssign: 24, readyForQA: 14, qaExec: 11 },
  "Sprint 14":   { created: 12, submit: 10, approve: 8,  devAssign: 8,  readyForQA: 2,  qaExec: 1  },
  "Release 2.0": { created: 48, submit: 45, approve: 42, devAssign: 42, readyForQA: 21, qaExec: 18 },
  "Release 2.1": { created: 14, submit: 12, approve: 10, devAssign: 10, readyForQA: 4,  qaExec: 2  },
  "UAT Phase 1": { created: 80, submit: 77, approve: 73, devAssign: 73, readyForQA: 49, qaExec: 45 },
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Small jitter so requirements in the same milestone have slightly different
// timestamps — looks natural in the per-requirement timeline view.
function jitter(base: number, max = 2): number {
  return base + Math.floor(Math.random() * (max + 1));
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
      await db.update(milestonesTable).set({
        startDate: demoM.startDate ? new Date(demoM.startDate) : null,
        reqTargetDate: demoM.reqTargetDate ? new Date(demoM.reqTargetDate) : null,
        devTargetDate: demoM.devTargetDate ? new Date(demoM.devTargetDate) : null,
        qaTargetDate: demoM.qaTargetDate ? new Date(demoM.qaTargetDate) : null,
        uatTargetDate: demoM.uatTargetDate ? new Date(demoM.uatTargetDate) : null,
      }).where(eq(milestonesTable.id, entry.id as number));
      console.log(`  [${demoM.name}] start=${demoM.startDate} req=${demoM.reqTargetDate} dev=${demoM.devTargetDate} qa=${demoM.qaTargetDate} uat=${demoM.uatTargetDate}`);
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

    // Execution test cases linked to these requirements (for executedAt)
    const execCases = await db
      .select({
        id: executionTestCasesTable.id,
        requirementId: executionTestCasesTable.requirementId,
        executionFileId: executionTestCasesTable.executionFileId,
      })
      .from(executionTestCasesTable)
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
      const createdAgo    = jitter(a.created);
      const submitAgo     = jitter(a.submit);
      const approveAgo    = jitter(a.approve);
      const devAssignAgo  = jitter(a.devAssign);
      const readyForQaAgo = jitter(a.readyForQA);
      const qaExecAgo     = jitter(a.qaExec);

      // 1. Backdate the requirement row
      await db
        .update(requirementsTable)
        .set({ createdAt: daysAgo(createdAgo), updatedAt: daysAgo(approveAgo) })
        .where(eq(requirementsTable.id, req.id));
      reqsUpdated++;

      // 2. Backdate existing activity events
      const reqEvents = events.filter((e) => e.entityId === req.id).sort((a, b) => a.id - b.id);
      // For requirements with multiple submit events (e.g. approve-then-edit:
      // first submit before approve, second submit after dev-assign), assign
      // timestamps in order so the sequence remains valid.
      const submitEvents = reqEvents.filter((e) => e.type === "requirement_submit");
      // resubmit mid-dev lands halfway between devAssign and readyForQA
      const resubmitAgo = Math.round((devAssignAgo + readyForQaAgo) / 2);
      let submitIdx = 0;
      for (const ev of reqEvents) {
        let target: Date | null = null;
        if (ev.type === "requirement_submit") {
          // First submit = before approve; any further submit = re-submit mid-dev
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
      const hasResubmitAfterDev = submitEvents.length > 1;
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
      const linkedCases = execCases.filter((tc) => tc.requirementId === req.id);
      for (const tc of linkedCases) {
        await db
          .update(executionTestCasesTable)
          .set({ executedAt: daysAgo(qaExecAgo) })
          .where(eq(executionTestCasesTable.id, tc.id));
        execUpdated++;
      }

      console.log(
        `  [${milestone.name}] req ${req.id} "${req.title.slice(0, 35)}" ` +
        `created=${createdAgo}d approve=${approveAgo}d devAssign=${devAssignAgo}d readyForQA=${readyForQaAgo}d qaExec=${qaExecAgo}d` +
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
