import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Allow overriding root via env for running from subdirectories
const dataRoot = process.env.DATA_ROOT || root;

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function load(file) {
  return JSON.parse(readFileSync(join(dataRoot, file), "utf8"));
}

async function insertWithId(client, table, rows, columns) {
  if (!rows.length) return;
  console.log(`  Inserting ${rows.length} rows into ${table}...`);
  for (const row of rows) {
    const cols = columns.filter((c) => row[c.json] !== undefined && row[c.json] !== null);
    const names = cols.map((c) => c.db).join(", ");
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((c) => row[c.json]);
    await client.query(
      `INSERT INTO ${table} (${names}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
      values,
    );
  }
  // Reset sequence to max id
  await client.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM ${table}`,
  );
  console.log(`  Done: ${table}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const users = load("attached_assets/users_1778892259516.json");
    const projects = load("attached_assets/projects_1778892259519.json");
    const requirements = load("attached_assets/requirements_1778892259518.json");
    const testCases = load("attached_assets/test_cases_1778892259517.json");
    const tasks = load("attached_assets/tasks_1778892259517.json");
    const calendarEvents = load("attached_assets/calendar_events_1778892259520.json");
    const activity = load("attached_assets/activity_1778892259521.json");

    console.log("Starting import...\n");

    // Users
    await insertWithId(client, "users", users, [
      { json: "id", db: "id" },
      { json: "name", db: "name" },
      { json: "email", db: "email" },
      { json: "password", db: "password" },
      { json: "role", db: "role" },
      { json: "team", db: "team" },
      { json: "avatar_url", db: "avatar_url" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Projects
    await insertWithId(client, "projects", projects, [
      { json: "id", db: "id" },
      { json: "name", db: "name" },
      { json: "description", db: "description" },
      { json: "status", db: "status" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Requirements
    await insertWithId(client, "requirements", requirements, [
      { json: "id", db: "id" },
      { json: "title", db: "title" },
      { json: "description", db: "description" },
      { json: "module", db: "module" },
      { json: "project_id", db: "project_id" },
      { json: "priority", db: "priority" },
      { json: "release", db: "release" },
      { json: "assignee_id", db: "assignee_id" },
      { json: "redmine_ticket_id", db: "redmine_ticket_id" },
      { json: "status", db: "status" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Test Cases
    await insertWithId(client, "test_cases", testCases, [
      { json: "id", db: "id" },
      { json: "title", db: "title" },
      { json: "objective", db: "objective" },
      { json: "preconditions", db: "preconditions" },
      { json: "test_steps", db: "test_steps" },
      { json: "expected_result", db: "expected_result" },
      { json: "type", db: "type" },
      { json: "priority", db: "priority" },
      { json: "tags", db: "tags" },
      { json: "requirement_id", db: "requirement_id" },
      { json: "project_id", db: "project_id" },
      { json: "linked_bug", db: "linked_bug" },
      { json: "author_id", db: "author_id" },
      { json: "ai_assisted", db: "ai_assisted" },
      { json: "status", db: "status" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Tasks
    await insertWithId(client, "tasks", tasks, [
      { json: "id", db: "id" },
      { json: "name", db: "name" },
      { json: "type", db: "type" },
      { json: "requirement_id", db: "requirement_id" },
      { json: "test_case_id", db: "test_case_id" },
      { json: "project_id", db: "project_id" },
      { json: "assignee_id", db: "assignee_id" },
      { json: "start_date", db: "start_date" },
      { json: "due_date", db: "due_date" },
      { json: "status", db: "status" },
      { json: "estimated_hours", db: "estimated_hours" },
      { json: "actual_hours", db: "actual_hours" },
      { json: "completion_percentage", db: "completion_percentage" },
      { json: "notes", db: "notes" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Calendar Events
    await insertWithId(client, "calendar_events", calendarEvents, [
      { json: "id", db: "id" },
      { json: "title", db: "title" },
      { json: "description", db: "description" },
      { json: "date", db: "date" },
      { json: "event_type", db: "event_type" },
      { json: "tagged_user_ids", db: "tagged_user_ids" },
      { json: "color", db: "color" },
      { json: "created_by", db: "created_by" },
      { json: "created_at", db: "created_at" },
      { json: "updated_at", db: "updated_at" },
    ]);

    // Activity
    await insertWithId(client, "activity", activity, [
      { json: "id", db: "id" },
      { json: "type", db: "type" },
      { json: "description", db: "description" },
      { json: "user_id", db: "user_id" },
      { json: "entity_id", db: "entity_id" },
      { json: "entity_type", db: "entity_type" },
      { json: "created_at", db: "created_at" },
    ]);

    console.log("\nAll data imported successfully!");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
