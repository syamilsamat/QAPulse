// Guards the Dev Tasks regression: POST /tasks validated its body against
// api-zod's generated CreateTaskBody, which is generated from openapi.yaml and
// had drifted from the tasks table — it still required a `type` column that had
// been dropped, and carried a single `assigneeId` where the table has an
// `assigneeIds` array. Every dev task added from an FA-approved requirement
// failed with 400 "type: Required", and any assignee that did get through would
// have been stripped as an unknown key.
//
// The route now validates against insertTaskSchema (drizzle-zod, derived from
// the table itself). These tests bundle that real schema — no database, no
// server, no network — so the same drift can't come back unnoticed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildSync } = require("esbuild");

const apiServerRoot = path.join(__dirname, "..");

function loadDbSchema() {
  const result = buildSync({
    stdin: {
      // The "/schema" entry point, not the package root: the root constructs a
      // database client on import and would demand DATABASE_URL. The schema
      // module is pure table/zod definitions, and re-exports the very same
      // insertTaskSchema the route imports.
      contents: 'export { insertTaskSchema } from "@workspace/db/schema";',
      resolveDir: apiServerRoot,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    // Driver only — the schema definitions never open a connection.
    external: ["pg", "mysql2"],
  });
  const mod = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports;
}

const { insertTaskSchema } = loadDbSchema();

// Exactly what components/DevTasksPanel.tsx sends when a Dev Lead clicks Add.
const devTaskPayload = {
  name: "Wire up the quota endpoint",
  requirementId: 412,
  projectId: 7,
  assigneeIds: [31],
  status: "not_started",
};

test("the Dev Tasks panel payload is accepted", () => {
  const parsed = insertTaskSchema.safeParse(devTaskPayload);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
});

test("assigneeIds survives parsing — a stripped assignee would create an unowned task", () => {
  const parsed = insertTaskSchema.safeParse(devTaskPayload);
  assert.deepEqual(parsed.data.assigneeIds, [31]);
});

test("no `type` is required — the column was dropped from the table", () => {
  const withoutType = insertTaskSchema.safeParse({ name: "Any task" });
  assert.equal(withoutType.success, true, withoutType.success ? "" : JSON.stringify(withoutType.error?.issues));
});

test("an optional estimate is accepted as a number, and omitting it is fine", () => {
  assert.equal(insertTaskSchema.safeParse({ ...devTaskPayload, estimatedHours: 6 }).success, true);
  assert.equal(insertTaskSchema.safeParse(devTaskPayload).success, true);
});

test("a nameless task is still rejected — the schema validates, it doesn't wave everything through", () => {
  assert.equal(insertTaskSchema.safeParse({ status: "not_started" }).success, false);
});

test("a stale client still sending `type` is not broken by it", () => {
  // Unknown keys are stripped rather than rejected, so an older deployed bundle
  // keeps working — and `type` never reaches the insert, where the column that
  // no longer exists would fail the query.
  const parsed = insertTaskSchema.safeParse({ ...devTaskPayload, type: "test_execution" });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
  assert.equal("type" in parsed.data, false);
});

test("PATCH's partial form accepts a single-field edit", () => {
  const parsed = insertTaskSchema.partial().safeParse({ notes: "Blocked on the staging refresh" });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error?.issues));
});
