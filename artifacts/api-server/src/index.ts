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
bootstrap()
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
