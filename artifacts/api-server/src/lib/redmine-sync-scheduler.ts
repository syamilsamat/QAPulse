import { getSyncState, runRedmineSync } from "./redmine-sync";
import { logger } from "./logger";

// Wakes every minute and runs a sync when one is due. The schedule is read
// from the database each time, so changing the interval (or switching sync
// off) from the admin screen takes effect without a restart, and every API
// instance agrees on it. The run itself takes a database lock, so two
// instances ticking together still produce one sync.
const TICK_MS = 60_000;
const FIRST_TICK_MS = 30_000; // let startup finish before the first check
const MAX_BACKOFF_FACTOR = 8;
const FULL_EVERY_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  try {
    const state = await getSyncState();
    if (!state.enabled) return;

    // After failures, wait longer between attempts (2x, 4x, 8x the interval)
    // so a down Redmine is not hammered every 15 minutes.
    const backoff = Math.min(2 ** state.consecutiveFailures, MAX_BACKOFF_FACTOR);
    const waitMs = state.intervalMinutes * 60_000 * backoff;
    const due = !state.lastRunAt || Date.now() - state.lastRunAt.getTime() >= waitMs;
    if (!due) return;

    const needsFull = !state.lastFullAt || Date.now() - state.lastFullAt.getTime() > FULL_EVERY_MS;
    const result = await runRedmineSync(needsFull ? "nightly" : "schedule");
    if (!result.skipped) logger.info({ runId: result.runId, status: result.status, error: result.error }, "Redmine sync finished");
  } catch (err) {
    logger.error({ err }, "Redmine sync tick failed");
  }
}

export function startRedmineSyncScheduler(): void {
  if (process.env.REDMINE_SYNC_DISABLED === "1") {
    logger.info("Redmine sync scheduler disabled by REDMINE_SYNC_DISABLED");
    return;
  }
  if (timer) return;
  setTimeout(() => { void tick(); }, FIRST_TICK_MS).unref();
  timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref();
}
