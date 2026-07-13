/**
 * Backdates requirements.createdAt AND activity-log timestamps for seeded
 * demo requirements so the PM Dashboard phase timeline shows realistic bars.
 *
 * The root issue: requirements.createdAt stays at "now" (when seed ran), but
 * the phase state machine starts from requirementCreatedAt. If activity events
 * are backdated but the requirement itself isn't, the approve event appears to
 * pre-date creation → 0d segment. Both must move together.
 *
 * Run AFTER seed-demo-data.ts:
 *   cd /home/runner/workspace/scripts
 *   DATABASE_URL=$DATABASE_URL npx tsx src/backdate-demo-activity.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, inArray, and } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { loadManifest } from "./seed-client.js";

// ── Minimal table shapes ──────────────────────────────────────────────────

const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
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
});

// ── Timeline config per milestone ─────────────────────────────────────────
// All values are "days before today". Sequence must be strictly decreasing
// (further back = larger number):
//   created > submitted > approved > devAssigned > readyForQA

const ANCHORS: Record<string, {
  created: number;     // requirement created
  submit: number;      // submitted for review
  approve: number;     // approved
  gap: number;         // days from approve until dev assigned
  devDuration: number; // days from dev-assign until ready-for-qa
}> = {
  "Sprint 12":   { created: 60, submit: 57, approve: 54, gap: 3, devDuration: 14 },
  "Sprint 13":   { created: 28, submit: 26, approve: 24, gap: 2, devDuration: 8  },
  "Sprint 14":   { created: 12, submit: 10, approve: 8,  gap: 2, devDuration: 4  },
  "Release 2.0": { created: 48, submit: 45, approve: 42, gap: 3, devDuration: 18 },
  "Release 2.1": { created: 14, submit: 12, approve: 10, gap: 2, devDuration: 5  },
  "UAT Phase 1": { created: 80, submit: 77, approve: 73, gap: 4, devDuration: 20 },
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Small random jitter so requirements in the same milestone aren't all
// identical timestamps — makes the per-requirement timeline view look natural.
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
  console.log(`Backdating ${reqIds.length} requirements from manifest...`);

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    const reqs = await db
      .select({ id: requirementsTable.id, title: requirementsTable.title, milestoneId: requirementsTable.milestoneId })
      .from(requirementsTable)
      .where(inArray(requirementsTable.id, reqIds));

    const milestoneIds = [...new Set(reqs.map((r) => r.milestoneId).filter(Boolean))] as number[];
    const milestones = milestoneIds.length > 0
      ? await db.select().from(milestonesTable).where(inArray(milestonesTable.id, milestoneIds))
      : [];
    const milestoneById = new Map(milestones.map((m) => [m.id, m]));

    const events = await db
      .select()
      .from(activityTable)
      .where(and(
        eq(activityTable.entityType, "requirement"),
        inArray(activityTable.entityId, reqIds),
      ));

    console.log(`Found ${events.length} activity events across ${reqIds.length} requirements.\n`);

    let reqsUpdated = 0;
    let eventsUpdated = 0;

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
      // Apply small per-requirement jitter so they don't all land on the same second
      const createdAgo    = jitter(a.created);
      const submitAgo     = jitter(a.submit);
      const approveAgo    = jitter(a.approve);
      const devAssignAgo  = approveAgo - a.gap;
      const readyForQaAgo = devAssignAgo - a.devDuration;

      // 1. Backdate the requirement row itself
      await db
        .update(requirementsTable)
        .set({ createdAt: daysAgo(createdAgo), updatedAt: daysAgo(approveAgo) })
        .where(eq(requirementsTable.id, req.id));
      reqsUpdated++;

      // 2. Backdate matching activity events
      const reqEvents = events.filter((e) => e.entityId === req.id);
      for (const ev of reqEvents) {
        let target: Date | null = null;

        if (ev.type === "requirement_submit")          target = daysAgo(submitAgo);
        else if (ev.type === "requirement_approve")    target = daysAgo(approveAgo);
        else if (ev.type === "requirement_reject")     target = daysAgo(submitAgo - 1);
        else if (ev.type === "requirement_dev_assign") target = daysAgo(devAssignAgo);
        else if (ev.type === "requirement_dev_ready_for_qa") target = daysAgo(readyForQaAgo);
        else if (ev.type === "requirement_updated" || ev.type === "requirement_revised") {
          target = daysAgo(approveAgo + 1);
        }

        if (target) {
          await db.update(activityTable).set({ createdAt: target }).where(eq(activityTable.id, ev.id));
          eventsUpdated++;
        }
      }

      console.log(`  [${milestone.name}] req ${req.id} "${req.title.slice(0, 38)}"`);
      console.log(`    created=${createdAgo}d  submit=${submitAgo}d  approve=${approveAgo}d  devAssign=${devAssignAgo}d  readyForQA=${readyForQaAgo}d`);
    }

    console.log(`\nDone — ${reqsUpdated} requirements + ${eventsUpdated} events backdated.`);
    console.log("Refresh the PM Dashboard to see phase timeline bars.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
