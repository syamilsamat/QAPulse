import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool, rolesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_ROLES = [
  { name: "admin", description: "Full system access", isSystem: true },
  { name: "qa_lead", description: "Team lead with elevated permissions", isSystem: false },
  { name: "qa_member", description: "Standard QA team member", isSystem: false },
];

let bootstrapped = false;

async function bootstrap() {
  if (bootstrapped) return;
  // Use raw pool.query for DDL — db.execute is unreliable for CREATE TABLE in some drizzle versions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const role of DEFAULT_ROLES) {
    await pool.query(
      `INSERT INTO roles (name, description, is_system) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
      [role.name, role.description, role.isSystem]
    );
  }
  bootstrapped = true;
}

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

router.get("/roles", async (req, res): Promise<void> => {
  await bootstrap();

  const roles = await db.select().from(rolesTable).orderBy(rolesTable.createdAt);

  const counts = await db
    .select({ role: usersTable.role, count: sql<number>`count(*)::int` })
    .from(usersTable)
    .groupBy(usersTable.role);

  const countMap: Record<string, number> = {};
  for (const row of counts) countMap[row.role] = row.count;

  res.json(roles.map((r) => formatRole(r, countMap[r.name] ?? 0)));
});

router.post("/roles", async (req, res): Promise<void> => {
  await bootstrap();
  const name = req.body.name?.trim();
  const description = req.body.description?.trim() || null;

  if (!name) {
    res.status(400).json({ error: "Role name is required" });
    return;
  }

  const existing = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, name));
  if (existing.length > 0) {
    res.status(409).json({ error: `A role named "${name}" already exists` });
    return;
  }

  const [role] = await db.insert(rolesTable).values({ name, description, isSystem: false }).returning();
  res.status(201).json(formatRole(role, 0));
});

router.patch("/roles/:id", async (req, res): Promise<void> => {
  await bootstrap();
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid role ID" }); return; }

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }

  const newName = req.body.name?.trim();
  const newDescription = req.body.description !== undefined ? (req.body.description?.trim() || null) : undefined;

  if (role.isSystem && newName && newName !== role.name) {
    res.status(403).json({ error: "System role names cannot be changed" });
    return;
  }

  if (newName && newName !== role.name) {
    const conflict = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, newName));
    if (conflict.length > 0) {
      res.status(409).json({ error: `A role named "${newName}" already exists` });
      return;
    }
    // Cascade rename to all users with the old role name
    await db.update(usersTable).set({ role: newName }).where(eq(usersTable.role, role.name));
  }

  const updateData: Partial<typeof rolesTable.$inferInsert> = {};
  if (newName) updateData.name = newName;
  if (newDescription !== undefined) updateData.description = newDescription;

  const [updated] = await db.update(rolesTable).set(updateData).where(eq(rolesTable.id, id)).returning();
  res.json(formatRole(updated));
});

router.delete("/roles/:id", async (req, res): Promise<void> => {
  await bootstrap();
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid role ID" }); return; }

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }

  if (role.isSystem) {
    res.status(403).json({ error: "System roles cannot be deleted" });
    return;
  }

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

  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  res.sendStatus(204);
});

export default router;
