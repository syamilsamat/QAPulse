import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || user.password !== password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = Buffer.from(`${user.id}:${user.email}:${user.role}`).toString("base64");

  res.json({ user: formatUser(user), token });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const [idStr] = decoded.split(":");
    const id = parseInt(idStr, 10);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json(formatUser(user));
  } catch (e) {
    logger.error({ e }, "Error decoding token");
    res.status(401).json({ error: "Invalid token" });
  }
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const { userId, currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(userId)));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // If not a forced change, verify current password
  if (!user.mustChangePassword && currentPassword) {
    if (user.password !== currentPassword) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set({ password: newPassword, mustChangePassword: false })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(formatUser(updated));
});

export default router;
