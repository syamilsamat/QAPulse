import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool, rolesTable, usersTable } from "@workspace/db";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ROLES: Array<{ name: string; description: string; isSystem: boolean; department: string | null; tierRank: number | null }> = [
  { name: "admin",      description: "Admin",                    isSystem: true,  department: null, tierRank: null },
  { name: "cto",        description: "CTO / Director",           isSystem: false, department: null, tierRank: 5 },
  { name: "hod_qa",     description: "Head of QA",               isSystem: false, department: "qa", tierRank: 4 },
  { name: "hod_pm",     description: "Head of PM",               isSystem: false, department: "pm", tierRank: 4 },
  { name: "hod_fa",     description: "Head of FA",               isSystem: false, department: "fa", tierRank: 4 },
  { name: "hod_dev",    description: "Head of Dev",              isSystem: false, department: "dev", tierRank: 4 },
  { name: "qa_manager", description: "QA Manager",               isSystem: false, department: "qa", tierRank: 3 },
  { name: "qa_lead",    description: "QA Lead",                  isSystem: false, department: "qa", tierRank: 2 },
  { name: "qa_member",  description: "QA Member",                isSystem: false, department: "qa", tierRank: 1 },
  { name: "fa_lead",    description: "Functional Analyst Lead",  isSystem: false, department: "fa", tierRank: 2 },
  { name: "fa_member",  description: "Functional Analyst",       isSystem: false, department: "fa", tierRank: 1 },
  { name: "dev_lead",   description: "Dev Lead",                 isSystem: false, department: "dev", tierRank: 2 },
  { name: "dev_member", description: "Developer",                isSystem: false, department: "dev", tierRank: 1 },
  { name: "pm_lead",    description: "PM Lead",                  isSystem: false, department: "pm", tierRank: 2 },
  { name: "pmo",        description: "PMO",                      isSystem: false, department: "pm", tierRank: 1 },
];

export const ALL_NAV_KEYS = [
  "nav:requirements",
  "nav:test-cases",
  "nav:traceability",
  "nav:tasks",
  "nav:ai-hub",
  "nav:report",
  "nav:inbox",
  "nav:team",
  "nav:admin-search",
  "nav:team-hangouts",
  "nav:configurations",
  "nav:milestones",
  "nav:pm-dashboard", // CR014 Part 3
  "nav:audit-log", // CR011 — admin-only; endpoint is also role-gated server-side
  "nav:qa-analytics", // CR026 — QA lead+ analytics dashboard
  "nav:defects", // CR030 — was role-gated only; now also opens Defects to the dev department
  "nav:resources", // CR034 — lead+ resourcing view (active/idle/closed-history milestone focus)
  "nav:risk-register", // CR040 — standalone Risk Register page, split out of nav:pm-dashboard
  "nav:uat-signoffs", // CR054 — UAT sign-off registry (upload + project-scoped listing)
];

// Default nav access per built-in role (mirrors the hardcoded roles arrays in Layout.tsx)
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin:      ALL_NAV_KEYS,
  cto:        ALL_NAV_KEYS,
  hod_qa:     ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:qa-analytics", "nav:defects", "nav:resources", "nav:uat-signoffs"],
  hod_pm:     ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:pm-dashboard", "nav:resources", "nav:risk-register", "nav:uat-signoffs"],
  hod_fa:     ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:resources"],
  hod_dev:    ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:defects", "nav:resources"],
  qa_manager: ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:qa-analytics", "nav:defects", "nav:resources", "nav:uat-signoffs"],
  qa_lead:    ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:qa-analytics", "nav:defects", "nav:resources", "nav:risk-register", "nav:uat-signoffs"],
  qa_member:  ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team-hangouts", "nav:milestones", "nav:defects"],
  fa_lead:    ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:milestones", "nav:resources", "nav:risk-register", "nav:defects"],
  fa_member:  ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:report", "nav:inbox", "nav:team-hangouts", "nav:milestones", "nav:defects"],
  dev_lead:   ["nav:requirements", "nav:test-cases", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:defects", "nav:resources"],
  dev_member: ["nav:requirements", "nav:test-cases", "nav:report", "nav:team-hangouts", "nav:defects"],
  pm_lead:    ["nav:requirements", "nav:test-cases", "nav:traceability", "nav:tasks", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations", "nav:milestones", "nav:pm-dashboard", "nav:resources", "nav:risk-register", "nav:uat-signoffs"],
  pmo:        ["nav:uat-signoffs"],
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let bootstrapped = false;

export async function bootstrap() {
  if (bootstrapped) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_nav_permissions (
      role_id INTEGER NOT NULL,
      permission_key TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_key)
    )
  `);

  // CR014 Part 1 — add department/tierRank columns to roles (idempotent)
  await pool.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS department TEXT`);
  await pool.query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS tier_rank INTEGER`);

  // CR014 Part 1 — teams and project membership tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_teams (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      PRIMARY KEY (team_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_teams (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, team_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    )
  `);

  // CR035 — the old cross-join backfill that grandfathered every user into
  // every project on every server restart was removed. project_members now
  // only ever gets rows from real, explicit assignment (see teams.ts —
  // POST /projects/:id/members) — access should be intentional, not an
  // accident of when the server last restarted.

  // CR035/CR044 — scope + audit columns. The CREATE TABLE above predates
  // CR035, so a fresh database needs these added explicitly. module_ids
  // (CR044) is the multi-module scope; legacy single module_id is kept for
  // pre-CR044 rows (readers fall back to it when module_ids is null).
  await pool.query(`ALTER TABLE project_members ADD COLUMN IF NOT EXISTS module_id INTEGER`);
  await pool.query(`ALTER TABLE project_members ADD COLUMN IF NOT EXISTS module_ids INTEGER[]`);
  await pool.query(`ALTER TABLE project_members ADD COLUMN IF NOT EXISTS assigned_by INTEGER`);
  await pool.query(`ALTER TABLE project_members ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW()`);

  // CR014 Part 2 — milestones
  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cr',
      status TEXT NOT NULL DEFAULT 'planned',
      target_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // CR023p1.2 — was added to the Drizzle schema but missed here; a brand-new
  // database's bootstrap-created milestones table never got this column.
  await pool.query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS created_by INTEGER`);
  // Auto-stamped end-of-QA-phase boundary for the PM Dashboard's phase
  // breakdown — see PATCH /milestones/:id.
  await pool.query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  // Planned go-live date — last phase marker on the PM Dashboard, set by the PM.
  await pool.query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS go_live_date TIMESTAMPTZ`);
  // Test environment (ENV1…ENV6) the milestone runs in, set by the PM.
  await pool.query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS environment TEXT`);

  // CR054p2 — formal milestone staffing (lead assigns members to a milestone)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestone_assignees (
      id SERIAL PRIMARY KEY,
      milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (milestone_id, user_id)
    )
  `);

  // CR054p3 — UAT sign-off documents (file bytes stored base64 in-row)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uat_signoffs (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      milestone_id INTEGER NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      note TEXT,
      data_base64 TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE execution_files ADD COLUMN IF NOT EXISTS milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE execution_files ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'qa'`);
  // PM Dashboard prerequisite — ties tasks to a milestone (nullable; ad-hoc tasks stay unassigned)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL`);

  // CR036 — single-blocker task dependency (same-project + cycle guard enforced in tasks.ts)
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS blocked_by_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`);

  // CR022 Part 1 — acceptance criteria (JSON array of strings stored as text)
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT`);

  // CR014 Part 4 — FA review workflow
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'draft'`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS rejected_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`);

  // CR030 — native dev assignment on defects (defects table itself predates
  // bootstrap coverage — created via drizzle-kit push in CR019 — so these are
  // the first bootstrap-owned columns on it)
  await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS assignee_assigned_at TIMESTAMPTZ`);

  // CR030 — requirement dev handoff (approved requirement → dev → ready for QA)
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS dev_status TEXT`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS dev_assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS dev_assigned_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS dev_assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE requirements ADD COLUMN IF NOT EXISTS ready_for_qa_at TIMESTAMPTZ`);

  // CR022 Part 2 — discussion thread
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requirement_comments (
      id SERIAL PRIMARY KEY,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // CR033p2 — Risk Register. Found-and-fixed during CR037 (2026-07-15): this
  // table existed only via drizzle-kit push, so a brand-new database's
  // bootstrap never created it and the PM Dashboard Risk Register would 500.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS risks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      milestone_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      probability TEXT NOT NULL DEFAULT 'medium',
      impact TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      mitigation_plan TEXT,
      owner_id INTEGER,
      raised_by INTEGER,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS risks_project_idx ON risks (project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS risks_milestone_idx ON risks (milestone_id)`);

  // CR037 — stored AI milestone risk assessments (append-only history)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestone_risk_assessments (
      id SERIAL PRIMARY KEY,
      milestone_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      factors TEXT NOT NULL,
      mitigation TEXT,
      data_snapshot TEXT,
      model TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS milestone_risk_assessments_milestone_idx ON milestone_risk_assessments (milestone_id)`);

  // CR039 — Requirement Q&A Chat. conversations/messages predate bootstrap
  // coverage entirely (existed only via an early ad-hoc drizzle-kit push,
  // same class of gap CR037 found for `risks` above) — first bootstrap-owned
  // entry for both. entity_type/entity_id stay null until a conversation
  // resolves to a matched requirement.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS conversations_entity_idx ON conversations (entity_type, entity_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id)`);
  // ALTER path for a dev DB where conversations already exists from the old
  // ad-hoc push (pre-dates user_id/entity_type/entity_id) — DEFAULT 0 on
  // user_id only matters for that branch; the CREATE path above always
  // starts from zero rows since the table was previously unused.
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entity_type TEXT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entity_id INTEGER`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const role of DEFAULT_ROLES) {
    await pool.query(
      `INSERT INTO roles (name, description, is_system, department, tier_rank) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE
         SET description = EXCLUDED.description,
             is_system   = EXCLUDED.is_system,
             department  = COALESCE(roles.department, EXCLUDED.department),
             tier_rank   = COALESCE(roles.tier_rank,  EXCLUDED.tier_rank)`,
      [role.name, role.description, role.isSystem, role.department, role.tierRank]
    );
  }

  // Seed default nav permissions for each built-in role (only if they have none yet)
  for (const [roleName, keys] of Object.entries(DEFAULT_PERMISSIONS)) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    const roleId = rows[0].id;

    const { rows: existing } = await pool.query(
      `SELECT 1 FROM role_nav_permissions WHERE role_id = $1 LIMIT 1`, [roleId]
    );
    if (existing.length > 0) continue; // already seeded

    for (const key of keys) {
      await pool.query(
        `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, key]
      );
    }
  }

  // admin and cto always have every nav key — backfills keys added by later
  // CRs (e.g. nav:audit-log, nav:pm-dashboard) into DBs seeded before the key
  // existed. NOT generalized to every role: PUT /roles/:id/permissions lets
  // admins deliberately remove a default key from a role, and a blanket
  // backfill across all DEFAULT_PERMISSIONS would silently undo that on
  // every restart.
  for (const roleName of ["admin", "cto"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    for (const key of ALL_NAV_KEYS) {
      await pool.query(
        `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [rows[0].id, key]
      );
    }
  }

  // nav:pm-dashboard specifically for hod_pm/pm_lead — narrow, single-key
  // backfill (not their whole DEFAULT_PERMISSIONS list) so any deliberate
  // customization on their other keys survives a restart.
  for (const roleName of ["hod_pm", "pm_lead"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:pm-dashboard') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // nav:qa-analytics for qa_lead/qa_manager/hod_qa — same narrow pattern.
  for (const roleName of ["qa_lead", "qa_manager", "hod_qa"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:qa-analytics') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // nav:defects for roles that already had Defects via the static role-array
  // fallback (qa_member/qa_lead were role-gated with no permKey before CR030)
  // plus the newly-onboarded dev department — narrow single-key backfill so
  // no role's other customizations get reapplied.
  for (const roleName of ["qa_member", "qa_lead", "qa_manager", "hod_qa", "dev_member", "dev_lead", "hod_dev"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:defects') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // nav:risk-register for hod_pm/pm_lead (preserves existing PM
  // Dashboard-side access to the Risk Register, now that it's split out)
  // plus qa_lead/fa_lead (CR040 — the new grant this CR exists for) — narrow
  // single-key backfill so no role's other customizations get reapplied.
  for (const roleName of ["hod_pm", "pm_lead", "qa_lead", "fa_lead"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:risk-register') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // nav:uat-signoffs (CR054p3) — PM family owns the sign-off registry;
  // QA managers/leads get read access to check UAT closure evidence.
  for (const roleName of ["hod_pm", "pm_lead", "pmo", "cto", "qa_manager", "hod_qa", "qa_lead"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:uat-signoffs') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // nav:defects for fa_lead/fa_member (CR042 — requirement defects route to
  // FA authors since CR031, but the FA department couldn't open the Defects
  // page at all) — narrow single-key backfill, same pattern as above.
  for (const roleName of ["fa_lead", "fa_member"]) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM roles WHERE name = $1`, [roleName]
    );
    if (!rows[0]) continue;
    await pool.query(
      `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, 'nav:defects') ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  // CR051 — partial UNIQUE index on defects.redmine_id backs the idempotent
  // register upsert. Dedupe any pre-existing duplicates first (repoint their
  // links to the surviving lowest-id row — FK cascades on delete, so repoint
  // before deleting or the links vanish), then create the index. All guarded:
  // a failure here must never block the rest of bootstrap.
  try {
    await pool.query(`
      UPDATE defect_links dl SET defect_id = s.keep_id
      FROM defects d
      JOIN (SELECT redmine_id, MIN(id) AS keep_id FROM defects WHERE redmine_id IS NOT NULL GROUP BY redmine_id) s
        ON d.redmine_id = s.redmine_id
      WHERE dl.defect_id = d.id AND d.id <> s.keep_id
    `);
    await pool.query(`
      DELETE FROM defects d USING (
        SELECT redmine_id, MIN(id) AS keep_id FROM defects WHERE redmine_id IS NOT NULL GROUP BY redmine_id
      ) s
      WHERE d.redmine_id = s.redmine_id AND d.id <> s.keep_id
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS defects_redmine_id_unique ON defects (redmine_id) WHERE redmine_id IS NOT NULL`);
  } catch (e) {
    console.error("[bootstrap] CR051: failed to create defects.redmine_id unique index", e);
  }

  bootstrapped = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRole(r: typeof rolesTable.$inferSelect, userCount = 0) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    isSystem: r.isSystem,
    department: r.department ?? null,
    tierRank: r.tierRank ?? null,
    userCount,
    createdAt: r.createdAt.toISOString(),
  };
}

function getRoleFromToken(req: import("express").Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(auth.slice(7)).role;
  } catch {
    return null;
  }
}

function jsonError(res: import("express").Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

// CR041 — found in passing: every mutating endpoint in this file had no
// backend auth gate at all, protection was purely the client-side
// ProtectedRoute on /roles. Every other admin-only route in the codebase
// (teams.ts, audit-log.ts) already has this exact helper; this file never
// got it. Reuses getRoleFromToken (above) rather than re-deriving the role
// from the auth header a second time.
function requireAdmin(req: import("express").Request, res: import("express").Response): boolean {
  const role = getRoleFromToken(req);
  if (!role) { res.status(401).json({ error: "Unauthorized" }); return false; }
  if (role !== "admin") { res.status(403).json({ error: "Admin access required" }); return false; }
  return true;
}

// ─── Role CRUD ───────────────────────────────────────────────────────────────

router.get("/roles", async (req, res): Promise<void> => {
  try {
    await bootstrap();
    const roles = await db.select().from(rolesTable).orderBy(rolesTable.createdAt);
    const counts = await db
      .select({ role: usersTable.role, count: sql<number>`count(*)::int` })
      .from(usersTable)
      .groupBy(usersTable.role);
    const countMap: Record<string, number> = {};
    for (const row of counts) countMap[row.role] = row.count;
    res.json(roles.map((r) => formatRole(r, countMap[r.name] ?? 0)));
  } catch (err: any) {
    console.error("[GET /roles]", err);
    jsonError(res, 500, err?.message ?? "Failed to load roles");
  }
});

router.post("/roles", async (req, res): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    await bootstrap();
    const name = req.body.name?.trim();
    const description = req.body.description?.trim() || null;
    if (!name) { jsonError(res, 400, "Role name is required"); return; }

    const existing = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, name));
    if (existing.length > 0) { jsonError(res, 409, `A role named "${name}" already exists`); return; }

    const [role] = await db.insert(rolesTable).values({ name, description, isSystem: false }).returning();

    for (const key of ALL_NAV_KEYS) {
      await pool.query(
        `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [role.id, key]
      );
    }

    res.status(201).json(formatRole(role, 0));
  } catch (err: any) {
    console.error("[POST /roles]", err);
    jsonError(res, 500, err?.message ?? "Failed to create role");
  }
});

router.patch("/roles/:id", async (req, res): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    await bootstrap();
    const id = parseInt(req.params.id);
    if (isNaN(id)) { jsonError(res, 400, "Invalid role ID"); return; }

    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
    if (!role) { jsonError(res, 404, "Role not found"); return; }

    const newName = req.body.name?.trim();
    const newDescription = req.body.description !== undefined ? (req.body.description?.trim() || null) : undefined;

    if (role.isSystem && newName && newName !== role.name) {
      jsonError(res, 403, "System role names cannot be changed"); return;
    }

    if (newName && newName !== role.name) {
      const conflict = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, newName));
      if (conflict.length > 0) { jsonError(res, 409, `A role named "${newName}" already exists`); return; }
      await db.update(usersTable).set({ role: newName }).where(eq(usersTable.role, role.name));
    }

    const updateData: Partial<typeof rolesTable.$inferInsert> = {};
    if (newName) updateData.name = newName;
    if (newDescription !== undefined) updateData.description = newDescription;
    if (req.body.department !== undefined) updateData.department = req.body.department?.trim() || null;
    if (req.body.tierRank !== undefined) updateData.tierRank = req.body.tierRank != null ? Number(req.body.tierRank) : null;

    const [updated] = await db.update(rolesTable).set(updateData).where(eq(rolesTable.id, id)).returning();
    res.json(formatRole(updated));
  } catch (err: any) {
    console.error("[PATCH /roles/:id]", err);
    jsonError(res, 500, err?.message ?? "Failed to update role");
  }
});

router.delete("/roles/:id", async (req, res): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    await bootstrap();
    const id = parseInt(req.params.id);
    if (isNaN(id)) { jsonError(res, 400, "Invalid role ID"); return; }

    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
    if (!role) { jsonError(res, 404, "Role not found"); return; }
    if (role.isSystem) { jsonError(res, 403, "System roles cannot be deleted"); return; }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, role.name));

    if (count > 0) {
      res.status(409).json({
        error: `Cannot delete "${role.name}". ${count} user${count === 1 ? " has" : "s have"} this role — switch their role first before deleting.`,
        userCount: count,
      });
      return;
    }

    await pool.query(`DELETE FROM role_nav_permissions WHERE role_id = $1`, [id]);
    await db.delete(rolesTable).where(eq(rolesTable.id, id));
    res.sendStatus(204);
  } catch (err: any) {
    console.error("[DELETE /roles/:id]", err);
    jsonError(res, 500, err?.message ?? "Failed to delete role");
  }
});

// ─── Nav Permissions ─────────────────────────────────────────────────────────

// CR041 — bulk read for the Roles page's access-matrix view. One query
// instead of the N+1 a naive matrix would otherwise need (one GET
// .../permissions per role). admin-gated, same as the page it serves.
router.get("/roles/permissions-matrix", async (req, res): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    await bootstrap();

    const roles = await db.select().from(rolesTable).orderBy(rolesTable.createdAt);
    const { rows } = await pool.query<{ role_id: number; permission_key: string }>(
      `SELECT role_id, permission_key FROM role_nav_permissions`
    );
    const permsByRole = new Map<number, string[]>();
    for (const row of rows) {
      const list = permsByRole.get(row.role_id) ?? [];
      list.push(row.permission_key);
      permsByRole.set(row.role_id, list);
    }

    res.json({
      allKeys: ALL_NAV_KEYS,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        department: r.department ?? null,
        tierRank: r.tierRank ?? null,
        isSystem: r.isSystem,
        // admin's permissions aren't trusted from DB rows here either — same
        // special case GET /roles/:id/permissions already relies on below.
        permissions: r.isSystem && r.name === "admin" ? ALL_NAV_KEYS : (permsByRole.get(r.id) ?? []),
      })),
    });
  } catch (err: any) {
    console.error("[GET /roles/permissions-matrix]", err);
    jsonError(res, 500, err?.message ?? "Failed to load permissions matrix");
  }
});

router.get("/roles/:id/permissions", async (req, res): Promise<void> => {
  try {
    await bootstrap();
    const id = parseInt(req.params.id);
    if (isNaN(id)) { jsonError(res, 400, "Invalid role ID"); return; }

    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
    if (!role) { jsonError(res, 404, "Role not found"); return; }

    if (role.isSystem && role.name === "admin") {
      res.json({ permissions: ALL_NAV_KEYS }); return;
    }

    const { rows } = await pool.query<{ permission_key: string }>(
      `SELECT permission_key FROM role_nav_permissions WHERE role_id = $1`, [id]
    );
    res.json({ permissions: rows.map((r) => r.permission_key) });
  } catch (err: any) {
    console.error("[GET /roles/:id/permissions]", err);
    jsonError(res, 500, err?.message ?? "Failed to load permissions");
  }
});

router.put("/roles/:id/permissions", async (req, res): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;
    await bootstrap();
    const id = parseInt(req.params.id);
    if (isNaN(id)) { jsonError(res, 400, "Invalid role ID"); return; }

    const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
    if (!role) { jsonError(res, 404, "Role not found"); return; }
    if (role.isSystem && role.name === "admin") {
      jsonError(res, 403, "Admin permissions cannot be changed"); return;
    }

    const permissions: string[] = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const validKeys = permissions.filter((k) => ALL_NAV_KEYS.includes(k));

    await pool.query(`DELETE FROM role_nav_permissions WHERE role_id = $1`, [id]);
    for (const key of validKeys) {
      await pool.query(
        `INSERT INTO role_nav_permissions (role_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, key]
      );
    }

    res.json({ permissions: validKeys });
  } catch (err: any) {
    console.error("[PUT /roles/:id/permissions]", err);
    jsonError(res, 500, err?.message ?? "Failed to save permissions");
  }
});

// Returns nav permission keys for the currently authenticated user (used by the sidebar)
router.get("/my-nav-permissions", async (req, res): Promise<void> => {
  try {
    await bootstrap();
    const roleName = getRoleFromToken(req);
    if (!roleName) { jsonError(res, 401, "Unauthorized"); return; }

    if (roleName === "admin") { res.json(ALL_NAV_KEYS); return; }

    const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, roleName));
    if (!roleRow) {
      res.json(DEFAULT_PERMISSIONS[roleName] ?? ALL_NAV_KEYS);
      return;
    }

    const { rows: permRows } = await pool.query<{ permission_key: string }>(
      `SELECT permission_key FROM role_nav_permissions WHERE role_id = $1`, [roleRow.id]
    );
    res.json(permRows.map((r) => r.permission_key));
  } catch (err: any) {
    console.error("[GET /my-nav-permissions]", err);
    jsonError(res, 500, err?.message ?? "Failed to load nav permissions");
  }
});

export default router;
