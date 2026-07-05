import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, refreshTokensTable, rolesTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { logActivity } from "./_audit";

const router: IRouter = Router();

// CR007-6: Fail fast in production if JWT_SECRET is not set
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET env var is required in production — server will not start without it");
}
const JWT_SECRET = process.env.JWT_SECRET ?? "qa-pulse-dev-secret-change-in-production-2024";
const JWT_EXPIRES_IN = "15m";
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// CR007-4: In-memory access token blacklist (invalidated on logout)
const tokenBlacklist = new Set<string>();

// Prune expired tokens from the blacklist every minute to prevent unbounded growth
setInterval(() => {
  for (const t of tokenBlacklist) {
    try {
      jwt.verify(t, JWT_SECRET);
    } catch (e: any) {
      if (e.name === "TokenExpiredError") tokenBlacklist.delete(t);
    }
  }
}, 60_000);

export function signToken(payload: { id: number; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { id: number; email: string; role: string } {
  if (tokenBlacklist.has(token)) throw new Error("Token revoked");
  return jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
}

// CR011: actor identity for audit rows — null when unauthenticated/invalid
export function actorFromReq(req: Request): number | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(authHeader.slice(7)).id;
  } catch {
    return null;
  }
}

// CR011: client IP — parse X-Forwarded-For directly (Replit sits behind a proxy)
export function clientIp(req: Request): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf) return xf.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? null;
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

async function formatUser(user: typeof usersTable.$inferSelect) {
  let tierRank: number | null = null;
  if (user.role === "admin") {
    tierRank = 99; // unrestricted — kept finite so it round-trips through JSON
  } else {
    try {
      const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, user.role));
      tierRank = roleRow?.tierRank ?? 1;
    } catch {
      tierRank = 1;
    }
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    tierRank,
    team: user.team,
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive ?? true,
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

  if (user.isActive === false) {
    res.status(403).json({ error: "Your account has been deactivated. Please contact your administrator." });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });

  // CR007-3: Issue refresh token
  const refreshToken = randomBytes(40).toString("hex");
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
  });

  await logActivity({
    type: "user_login",
    description: `${user.name} logged in`,
    userId: user.id,
    entityId: user.id,
    entityType: "system",
    newValue: { ip: clientIp(req) },
  });

  res.json({ user: await formatUser(user), token, refreshToken });
});

// CR007-4: Stateful logout — blacklist access token + revoke refresh token
router.post("/auth/logout", async (req, res): Promise<void> => {
  const actorId = actorFromReq(req); // resolve before blacklisting the token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    tokenBlacklist.add(authHeader.slice(7));
  }
  if (actorId) {
    await logActivity({
      type: "user_logout",
      description: `User #${actorId} logged out`,
      userId: actorId,
      entityId: actorId,
      entityType: "system",
      newValue: { ip: clientIp(req) },
    });
  }
  const { refreshToken } = req.body ?? {};
  if (refreshToken && typeof refreshToken === "string") {
    await db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.token, refreshToken));
  }
  res.json({ success: true });
});

// CR007-3: Silent refresh endpoint with token rotation
router.post("/auth/refresh", async (req, res): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== "string") {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }

  const [record] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.token, refreshToken));

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, record.userId));
  if (!user || user.isActive === false) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  // Rotate: revoke old token, issue new ones
  await db.update(refreshTokensTable).set({ revokedAt: new Date() }).where(eq(refreshTokensTable.id, record.id));

  const newRefreshToken = randomBytes(40).toString("hex");
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
  });

  const newAccessToken = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ token: newAccessToken, refreshToken: newRefreshToken });
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

    res.json(await formatUser(user));
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

  res.json(await formatUser(updated));
});

export default router;
