import { Router, type IRouter } from "express";
import express from "express";
import { eq, and } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";

let mysql2: any = null;
try {
  mysql2 = require("mysql2/promise");
} catch {}

const router: IRouter = Router();

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
  if (!fullName?.trim() || !email?.trim()) {
    res.status(400).json({ error: "fullName and email are required" });
    return;
  }
  try {
    const [contact] = await db
      .update(contactsTable)
      .set({ fullName: fullName.trim(), email: email.trim(), isGroup: isGroup ?? false })
      .where(and(eq(contactsTable.id, id), eq(contactsTable.source, "manual")))
      .returning();
    if (!contact) {
      res.status(404).json({ error: "Contact not found or cannot be edited" });
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

async function syncFromRedmineAPI(): Promise<Array<{ fullName: string; email: string; redmineId: number; redmineLogin: string }>> {
  const baseUrl = (process.env.REDMINE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.REDMINE_API_KEY ?? "";
  if (!baseUrl || !apiKey) throw new Error("REDMINE_URL and REDMINE_API_KEY must be set");

  const headers = { "X-Redmine-API-Key": apiKey, Accept: "application/json" };
  const users: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let data: any;
    try {
      const r = await fetch(`${baseUrl}/users.json?status=1&limit=${limit}&offset=${offset}`, { headers, signal: ctrl.signal });
      if (!r.ok) throw new Error(`Redmine API returned ${r.status}`);
      data = await r.json();
    } finally {
      clearTimeout(timer);
    }
    const batch: any[] = data?.users ?? [];
    users.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return users
    .filter((u: any) => u.mail?.trim())
    .map((u: any) => ({
      fullName: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.login,
      email: u.mail.trim(),
      redmineId: u.id,
      redmineLogin: u.login,
    }));
}

router.post("/contacts/sync-redmine", express.json(), async (_req, res) => {
  try {
    let users: Array<{ fullName: string; email: string; redmineId: number; redmineLogin: string }>;
    let source = "db";

    try {
      users = await syncFromRedmineDB();
    } catch {
      // DB unreachable — fall back to Redmine REST API
      source = "api";
      users = await syncFromRedmineAPI();
    }

    await db.delete(contactsTable).where(eq(contactsTable.source, "redmine"));
    const now = new Date();
    const values = users.map((u) => ({
      fullName: u.fullName,
      email: u.email,
      source: "redmine" as const,
      isGroup: false,
      redmineId: u.redmineId,
      redmineLogin: u.redmineLogin,
      syncedAt: now,
    }));
    if (values.length > 0) {
      await db.insert(contactsTable).values(values);
    }

    res.json({ success: true, synced: values.length, source });
  } catch (err: any) {
    console.error("Contacts sync error:", err);
    const msg = err.message ?? "Sync failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
