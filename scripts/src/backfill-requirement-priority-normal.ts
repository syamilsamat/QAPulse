/**
 * One-time migration (DEF-0014): the requirements.priority column default
 * changed from "medium" to "normal" (the actual value set the rest of the
 * app — filters, badges, Redmine import mapping — has always used). Existing
 * rows still carrying the old "medium" default need a one-off backfill.
 *
 * Run on Replit with:
 *   cd scripts && npx tsx src/backfill-requirement-priority-normal.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";

// Inline minimal table definition so this script is self-contained.
const requirementsTable = pgTable("requirements", {
  id: serial("id").primaryKey(),
  priority: text("priority").notNull(),
});

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const result = await db
    .update(requirementsTable)
    .set({ priority: "normal" })
    .where(eq(requirementsTable.priority, "medium"))
    .returning({ id: requirementsTable.id });

  console.log(`Done. Updated ${result.length} requirement(s) from priority "medium" to "normal".`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
