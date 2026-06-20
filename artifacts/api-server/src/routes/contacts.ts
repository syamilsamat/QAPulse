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

router.post("/contacts/sync-redmine", express.json(), async (_req, res) => {
  if (!mysql2) {
    res.status(500).json({ error: "mysql2 is not available" });
    return;
  }
  const cfg = {
    host: process.env.REDMINE_DB_HOST ?? "10.10.4.130",
    port: parseInt(process.env.REDMINE_DB_PORT ?? "3306"),
    user: process.env.REDMINE_DB_USER ?? "bestqa",
    password: process.env.REDMINE_DB_PASSWORD ?? "",
    database: process.env.REDMINE_DB_NAME ?? "redmine",
    connectTimeout: 8000,
  };
  let conn: any = null;
  try {
    conn = await mysql2.createConnection(cfg);
    const [rows] = await conn.query(
      "SELECT id, login, firstname, lastname, mail FROM users WHERE type = 'User' AND status = 1 AND mail != '' ORDER BY firstname, lastname",
    );
    await db.delete(contactsTable).where(eq(contactsTable.source, "redmine"));
    const now = new Date();
    const values = (rows as any[])
      .filter((r: any) => r.mail?.trim())
      .map((r: any) => ({
        fullName: `${r.firstname ?? ""} ${r.lastname ?? ""}`.trim() || r.login,
        email: r.mail.trim(),
        source: "redmine" as const,
        isGroup: false,
        redmineId: r.id,
        redmineLogin: r.login,
        syncedAt: now,
      }));
    if (values.length > 0) {
      await db.insert(contactsTable).values(values);
    }
    res.json({ success: true, synced: values.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Sync failed" });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

export default router;
