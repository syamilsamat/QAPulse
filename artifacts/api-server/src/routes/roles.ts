import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool, rolesTable, usersTable } from "@workspace/db";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ROLES = [
  { name: "admin", description: "Full system access", isSystem: true },
  { name: "qa_lead", description: "Team lead with elevated permissions", isSystem: false },
  { name: "qa_member", description: "Standard QA team member", isSystem: false },
];

export const ALL_NAV_KEYS = [
  "nav:requirements",
  "nav:test-cases",
  "nav:tasks",
  "nav:ai-hub",
  "nav:report",
  "nav:inbox",
  "nav:team",
  "nav:admin-search",
  "nav:team-hangouts",
  "nav:configurations",
];

// Default nav access per built-in role (mirrors the hardcoded roles arrays in Layout.tsx)
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ALL_NAV_KEYS,
  qa_lead: ["nav:requirements", "nav:test-cases", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team", "nav:team-hangouts", "nav:configurations"],
  qa_member: ["nav:requirements", "nav:test-cases", "nav:tasks", "nav:ai-hub", "nav:report", "nav:inbox", "nav:team-hangouts"],
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let bootstrapped = false;

async function bootstrap() {
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

  for (const role of DEFAULT_ROLES) {
    await pool.query(
      `INSERT INTO roles (name, description, is_system) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [role.name, role.description, role.isSystem]
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

  bootstrapped = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRole(r: typeof rolesTable.$inferSelect, userCount = 0) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    isSystem: r.isSystem,
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

    const [updated] = await db.update(rolesTable).set(updateData).where(eq(rolesTable.id, id)).returning();
    res.json(formatRole(updated));
  } catch (err: any) {
    console.error("[PATCH /roles/:id]", err);
    jsonError(res, 500, err?.message ?? "Failed to update role");
  }
});

router.delete("/roles/:id", async (req, res): Promise<void> => {
  try {
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
