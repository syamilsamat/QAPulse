import { Router, type IRouter } from "express";
import express from "express";
import { eq, and } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";

let mysql2: any = null;
try {
  mysql2 = require("mysql2/promise");
} catch {}

const router: IRouter = Router();

// CR049 — contacts (verdict-email recipients) require auth on every route.
router.use((req, res, next) => {
  if (!getAuthContext(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
});

router.get("/contacts", async (_req, res) => {
  try {
    const contacts = await db.select().from(contactsTable).orderBy(contactsTable.fullName);
    res.json(contacts);
  } catch {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

router.post("/contacts", express.json(), async (req, res) => {
  const { fullName, email, isGroup } = req.body;
  if (!fullName?.trim() || !email?.trim()) {
    res.status(400).json({ error: "fullName and email are required" });
    return;
  }
  try {
    const [contact] = await db
      .insert(contactsTable)
      .values({ fullName: fullName.trim(), email: email.trim(), source: "manual", isGroup: isGroup ?? false })
      .returning();
    res.json(contact);
  } catch {
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.put("/contacts/:id", express.json(), async (req, res) => {
  const id = parseInt(req.params.id);
  const { fullName, email, isGroup } = req.body;
  if (!fullName?.trim()) {
    res.status(400).json({ error: "fullName is required" });
    return;
  }
  try {
    const [contact] = await db
      .update(contactsTable)
      .set({ fullName: fullName.trim(), email: (email ?? "").trim(), isGroup: isGroup ?? false })
      .where(eq(contactsTable.id, id))
      .returning();
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(contact);
  } catch {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

router.delete("/contacts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.delete(contactsTable).where(eq(contactsTable.id, id));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

async function syncFromRedmineDB(): Promise<Array<{ fullName: string; email: string; redmineId: number; redmineLogin: string }>> {
  if (!mysql2) throw new Error("mysql2 not available");
  const cfg = {
    host: process.env.REDMINE_DB_HOST ?? "10.10.4.130",
    port: parseInt(process.env.REDMINE_DB_PORT ?? "3306"),
    user: process.env.REDMINE_DB_USER ?? "bestqa",
    password: process.env.REDMINE_DB_PASSWORD ?? "",
    database: process.env.REDMINE_DB_NAME ?? "redmine",
    connectTimeout: 6000,
  };
  let conn: any = null;
  try {
    conn = await mysql2.createConnection(cfg);
    const [rows] = await conn.query(
      "SELECT id, login, firstname, lastname, mail FROM users WHERE type = 'User' AND status = 1 AND mail != '' ORDER BY firstname, lastname",
    );
    return (rows as any[])
      .filter((r: any) => r.mail?.trim())
      .map((r: any) => ({
        fullName: `${r.firstname ?? ""} ${r.lastname ?? ""}`.trim() || r.login,
        email: r.mail.trim(),
        redmineId: r.id,
        redmineLogin: r.login,
      }));
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function syncFromRedmineAPI(overrideKey?: string): Promise<{ users: Array<{ fullName: string; email: string; redmineId: number; redmineLogin: string }>; nameOnly: boolean }> {
  const baseUrl = (process.env.REDMINE_URL ?? "").replace(/\/$/, "");
  const apiKey = overrideKey?.trim() || process.env.REDMINE_API_KEY || "";
  if (!baseUrl || !apiKey) throw new Error("REDMINE_URL and REDMINE_API_KEY must be set");

  const headers = { "X-Redmine-API-Key": apiKey, Accept: "application/json" };

  // Try admin endpoint first — returns full user list with emails
  try {
    const users: any[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const data = await fetchJson(`${baseUrl}/users.json?status=1&limit=${limit}&offset=${offset}`, headers);
      const batch: any[] = data?.users ?? [];
      users.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }
    return {
      nameOnly: false,
      users: users
        .filter((u: any) => u.mail?.trim())
        .map((u: any) => ({
          fullName: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.login,
          email: u.mail.trim(),
          redmineId: u.id,
          redmineLogin: u.login ?? "",
        })),
    };
  } catch (err: any) {
    if (err.status !== 403) throw err;
  }

  // Non-admin key — fall back to project memberships (names only, no email)
  const projects: any[] = [];
  {
    const limit = 100;
    let offset = 0;
    while (true) {
      const data = await fetchJson(`${baseUrl}/projects.json?limit=${limit}&offset=${offset}`, headers);
      const batch: any[] = data?.projects ?? [];
      projects.push(...batch);
      if (batch.length < limit) break;
      offset += limit;
    }
  }

  const userMap = new Map<number, { fullName: string; email: string; redmineId: number; redmineLogin: string }>();
  await Promise.all(
    projects.map(async (p: any) => {
      try {
        const limit = 100;
        let offset = 0;
        while (true) {
          const data = await fetchJson(`${baseUrl}/projects/${p.id}/memberships.json?limit=${limit}&offset=${offset}`, headers);
          const batch: any[] = data?.memberships ?? [];
          for (const m of batch) {
            if (m.user && !userMap.has(m.user.id)) {
              userMap.set(m.user.id, {
                fullName: m.user.name ?? "",
                email: "",
                redmineId: m.user.id,
                redmineLogin: "",
              });
            }
          }
          if (batch.length < limit) break;
          offset += limit;
        }
      } catch { /* skip inaccessible projects */ }
    }),
  );

  return { nameOnly: true, users: Array.from(userMap.values()) };
}

router.post("/contacts/sync-redmine", express.json(), async (req, res) => {
  try {
    const overrideKey: string | undefined = req.body?.apiKey;
    let users: Array<{ fullName: string; email: string; redmineId: number; redmineLogin: string }>;
    let source = "db";
    let nameOnly = false;

    try {
      users = await syncFromRedmineDB();
    } catch {
      source = "api";
      const result = await syncFromRedmineAPI(overrideKey);
      users = result.users;
      nameOnly = result.nameOnly;
    }

    const existing = await db.select().from(contactsTable).where(eq(contactsTable.source, "redmine"));
    const byRedmineId = new Map(existing.filter((c) => c.redmineId).map((c) => [c.redmineId!, c]));
    const byName     = new Map(existing.map((c) => [c.fullName.toLowerCase(), c]));

    const now = new Date();
    const syncedIds = new Set<number>();

    for (const u of users) {
      if (u.redmineId) syncedIds.add(u.redmineId);

      const found = (u.redmineId ? byRedmineId.get(u.redmineId) : null)
                 ?? byName.get(u.fullName.toLowerCase());

      if (nameOnly) {
        // Name-only path (non-admin key): only insert missing contacts, never update existing ones
        if (!found) {
          await db.insert(contactsTable).values({
            fullName:  u.fullName,
            email:     "",
            source:    "redmine" as const,
            isGroup:   false,
            redmineId: u.redmineId,
            syncedAt:  now,
          });
        }
      } else {
        const email = u.email?.trim() || found?.email || "";
        if (found) {
          await db.update(contactsTable)
            .set({
              fullName:     u.fullName,
              email,
              redmineId:    u.redmineId    || found.redmineId,
              redmineLogin: u.redmineLogin || found.redmineLogin,
              syncedAt:     now,
            })
            .where(eq(contactsTable.id, found.id));
        } else {
          await db.insert(contactsTable).values({
            fullName:     u.fullName,
            email,
            source:       "redmine" as const,
            isGroup:      false,
            redmineId:    u.redmineId,
            redmineLogin: u.redmineLogin,
            syncedAt:     now,
          });
        }
      }
    }

    // Remove contacts that have been removed from Redmine
    // (only applies when we have redmineId references to compare against)
    if (syncedIds.size > 0) {
      for (const c of existing) {
        if (c.redmineId && !syncedIds.has(c.redmineId)) {
          await db.delete(contactsTable).where(eq(contactsTable.id, c.id));
        }
      }
    }

    res.json({ success: true, synced: users.length, source, nameOnly });
  } catch (err: any) {
    console.error("Contacts sync error:", err);
    const msg = err.message ?? "Sync failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
