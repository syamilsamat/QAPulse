import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "qa-pulse-dev-secret-change-in-production-2024";
const JWT_EXPIRES_IN = "8h";

export function signToken(payload: { id: number; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { id: number; email: string; role: string } {
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
}

export async function getAuthUser(req: Request): Promise<typeof usersTable.$inferSelect | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    return user ?? null;
  } catch {
    return null;
  }
}

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    redmineApiKey: user.redmineApiKey ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  let passwordValid = false;
  if (user.password.startsWith("$2")) {
    passwordValid = await bcrypt.compare(password, user.password);
  } else {
    passwordValid = user.password === password;
    if (passwordValid) {
      const hashed = await bcrypt.hash(password, 12);
      await db.update(usersTable).set({ password: hashed }).where(eq(usersTable.id, user.id));
    }
  }

  if (!passwordValid) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });

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
    const payload = verifyToken(token);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json(formatUser(user));
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: "Token expired" });
    } else {
      logger.error({ e }, "Error decoding token");
      res.status(401).json({ error: "Invalid token" });
    }
  }
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const { userId, currentPassword, newPassword } = req.body;

  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
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

  if (!user.mustChangePassword && currentPassword) {
    let currentValid = false;
    if (user.password.startsWith("$2")) {
      currentValid = await bcrypt.compare(currentPassword, user.password);
    } else {
      currentValid = user.password === currentPassword;
    }
    if (!currentValid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  const [updated] = await db
    .update(usersTable)
    .set({ password: hashed, mustChangePassword: false })
    .where(eq(usersTable.id, user.id))
    .returning();

  res.json(formatUser(updated));
});

export default router;
