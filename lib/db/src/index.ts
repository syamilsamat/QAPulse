import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool sizing — node-postgres defaults to max: 10, which was the real ceiling
// on dashboard/execution page loads: those endpoints fan out into dozens of
// concurrent queries, so everything past the tenth sat in the pool's wait
// queue rather than at the database. 20 is a safe default against a managed
// Postgres (typical connection caps are 100+ and this is one app process);
// override with DB_POOL_MAX if the instance is smaller.
const poolMax = Number(process.env.DB_POOL_MAX ?? 20);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 20,
  // Reclaim idle connections instead of holding the full pool open forever.
  idleTimeoutMillis: 30_000,
  // Fail fast with a real error rather than hanging the request when the pool
  // is exhausted or the database is unreachable.
  connectionTimeoutMillis: 10_000,
  // Keeps NAT/proxy layers between the app and a managed database from
  // silently dropping pooled connections that then fail on next use.
  keepAlive: true,
});

// A pool-level error (a backend terminating an idle connection, for example)
// is emitted on the pool, not on any single query. Without a listener Node
// treats it as an unhandled 'error' event and crashes the API process.
pool.on("error", (err) => {
  console.error("[db] idle client error", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
