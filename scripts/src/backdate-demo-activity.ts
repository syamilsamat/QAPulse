/**
 * Backdates activity-log timestamps for seeded demo requirements so the
 * PM Dashboard phase timeline shows realistic bars (not 0d everywhere).
 *
 * Run AFTER seed-demo-data.ts:
 *   cd scripts
 *   DATABASE_URL=<your-db-url> npx tsx src/backdate-demo-activity.ts
 *
 * On Replit the DATABASE_URL is already set as a secret — just run:
 *   cd /home/runner/workspace/scripts && DATABASE_URL=$DATABASE_URL npx tsx src/backdate-demo-activity.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql, eq, inArray, and } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { loadManifest, MANIFEST_PATH } from "./seed-client.js";

// ── Inline minimal table shapes (avoid importing the full lib/db) ─────────

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
});

const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

// ── Milestone-based backdate config ───────────────────────────────────────
// Each milestone gets a realistic "anchor" date (when requirements were
// approved) and phase offsets. All values are days-before-today.

const MILESTONE_ANCHORS: Record<string, {
  reqApprove: number;  // days ago requirement was approved
  gap: number;         // days after approve before dev started
  devDuration: number; // days dev took before ready-for-qa
}> = {
  "Sprint 12":  { reqApprove: 52, gap: 3, devDuration: 14 },
  "Sprint 13":  { reqApprove: 22, gap: 2, devDuration: 8  },
  "Sprint 14":  { reqApprove: 8,  gap: 2, devDuration: 4  },
  "Release 2.0": { reqApprove: 38, gap: 3, devDuration: 18 },
  "Release 2.1": { reqApprove: 10, gap: 2, devDuration: 5  },
  "UAT Phase 1": { reqApprove: 65, gap: 4, devDuration: 20 },
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Scatter individual requirements ±N days around the anchor so each req
// doesn't land on exactly the same timestamp (looks more realistic).
function scatter(base: number, spread: number): number {
  return base - Math.floor(Math.random() * spread);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL env var required");

  const manifest = loadManifest();
  const reqIds = manifest.filter((e) => e.type === "requirement").map((e) => e.id as number);
  if (reqIds.length === 0) {
    console.log("No demo requirements in manifest — run seed-demo-data.ts first.");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  try {
    // Load requirement → milestone mapping
    const reqs = await db
      .select({ id: requirementsTable.id, title: requirementsTable.title, milestoneId: requirementsTable.milestoneId })
      .from(requirementsTable)
      .where(inArray(requirementsTable.id, reqIds));

    const milestoneIds = [...new Set(reqs.map((r) => r.milestoneId).filter(Boolean))] as number[];
    const milestones = milestoneIds.length > 0
      ? await db.select().from(milestonesTable).where(inArray(milestonesTable.id, milestoneIds))
      : [];

    const milestoneById = new Map(milestones.map((m) => [m.id, m]));

    // Load all activity events for these requirements
    const events = await db
      .select()
      .from(activityTable)
      .where(
        and(
          eq(activityTable.entityType, "requirement"),
          inArray(activityTable.entityId, reqIds),
        ),
      );

    console.log(`Found ${events.length} activity events for ${reqIds.length} requirements.`);

    let updated = 0;

    for (const req of reqs) {
      const milestone = req.milestoneId ? milestoneById.get(req.milestoneId) : null;
      if (!milestone) continue;

      // Find matching anchor by exact milestone name, then substring fallback
      const anchorKey =
        Object.keys(MILESTONE_ANCHORS).find((k) => k === milestone.name) ??
        Object.keys(MILESTONE_ANCHORS).find((k) =>
          milestone.name.toLowerCase().includes(k.toLowerCase()),
        );
      if (!anchorKey) {
        console.log(`  No anchor config for milestone "${milestone.name}" — skipping req ${req.id}`);
        continue;
      }
      const anchor = MILESTONE_ANCHORS[anchorKey];
      const reqEvents = events.filter((e) => e.entityId === req.id);

      // Assign realistic timestamps per event type
      // submitted: a few days before approval
      // approved: anchor.reqApprove days ago
      // dev_assign: approved + gap
      // dev_ready_for_qa: dev_assign + devDuration
      const approveAgo = scatter(anchor.reqApprove, 3);
      const submitAgo = approveAgo + scatter(3, 2) + 1;      // submitted before approved
      const devAssignAgo = approveAgo - anchor.gap;           // after approved
      const readyForQaAgo = devAssignAgo - anchor.devDuration;

      for (const ev of reqEvents) {
        let targetDate: Date | null = null;

        if (ev.type === "requirement_submit") {
          targetDate = daysAgo(submitAgo);
        } else if (ev.type === "requirement_approve") {
          targetDate = daysAgo(approveAgo);
        } else if (ev.type === "requirement_reject") {
          // Rejection happens a day after first submit
          targetDate = daysAgo(submitAgo - 1);
        } else if (ev.type === "requirement_dev_assign") {
          targetDate = daysAgo(devAssignAgo);
        } else if (ev.type === "requirement_dev_ready_for_qa") {
          targetDate = daysAgo(readyForQaAgo);
        } else if (ev.type === "requirement_updated" || ev.type === "requirement_revised") {
          // Put misc updates at approve time
          targetDate = daysAgo(approveAgo + 1);
        }

        if (targetDate) {
          await db
            .update(activityTable)
            .set({ createdAt: targetDate })
            .where(eq(activityTable.id, ev.id));
          updated++;
        }
      }

      console.log(`  req ${req.id} "${req.title.slice(0, 40)}": approved ~${approveAgo}d ago`);
    }

    console.log(`\nDone — updated ${updated} activity log timestamps.`);
    console.log("Refresh the PM Dashboard to see the phase timeline bars.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
