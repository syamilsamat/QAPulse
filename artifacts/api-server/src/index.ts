import app from "./app";
import { logger } from "./lib/logger";
import { startCalendarReminderScheduler } from "./lib/calendar-reminders";
import { pool } from "@workspace/db";
import { bootstrap } from "./routes/roles";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure is_active column exists (added after initial schema creation)
pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`)
  .catch((e) => logger.error({ e }, "Failed to migrate users.is_active"));

// Run bootstrap (creates tables, seeds roles, backfills memberships) before
// accepting requests so access-control queries never hit missing tables.
//
// Bounded, though: bootstrap issues DDL, and DDL can block indefinitely behind
// another session's lock (a concurrent drizzle push, an idle transaction). An
// unbounded wait here means the process never reaches app.listen and the
// workflow looks like it simply won't start, with nothing in the log to say
// why. On timeout we start serving anyway and let bootstrap finish in the
// background — middleware/access.ts already falls back safely when a table it
// wants isn't there yet.
const BOOTSTRAP_TIMEOUT_MS = 60_000;

const bootstrapOrTimeout = Promise.race([
  bootstrap().then(() => "done" as const),
  new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), BOOTSTRAP_TIMEOUT_MS)),
]);

bootstrapOrTimeout
  .then((outcome) => {
    if (outcome === "timeout") {
      logger.warn(
        { timeoutMs: BOOTSTRAP_TIMEOUT_MS },
        "Bootstrap still running after timeout — starting server anyway (it will finish in the background)",
      );
    }
  })
  .catch((e) => logger.error({ e }, "Bootstrap failed"))
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startCalendarReminderScheduler();
    });
  });
