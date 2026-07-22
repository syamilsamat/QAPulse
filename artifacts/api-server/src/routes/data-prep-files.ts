/**
 * CR070 — Data Prep source files.
 *
 * QA uploads the prepared dataset against a 'data_prep' milestone; the PM
 * downloads it to email to the client. File bytes live base64 in-row (same
 * pattern as uat_signoffs — these are small handoff files, not bulk storage).
 */
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, dataPrepFilesTable, milestonesTable, usersTable } from "@workspace/db";
import { getAuthContext, canAccessProject } from "../middleware/access";
import { logActivity } from "./_audit";

const router: IRouter = Router();

// Milestone writers plus qa_member — the actual data-prep work is often done
// by a QA member, not just leads (mirrors milestones.ts's canWrite + qa_member).
const UPLOAD_ROLES = ["admin", "qa_lead", "qa_member", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"];
const MAX_BYTES = 15 * 1024 * 1024;

// GET /data-prep-files?milestoneId=N
router.get("/data-prep-files", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const milestoneId = req.query.milestoneId ? Number(req.query.milestoneId) : null;
  if (!milestoneId) { res.status(400).json({ error: "milestoneId is required" }); return; }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const rows = await db
    .select({
      id: dataPrepFilesTable.id,
      projectId: dataPrepFilesTable.projectId,
      milestoneId: dataPrepFilesTable.milestoneId,
      fileName: dataPrepFilesTable.fileName,
      mimeType: dataPrepFilesTable.mimeType,
      sizeBytes: dataPrepFilesTable.sizeBytes,
      note: dataPrepFilesTable.note,
      uploadedBy: dataPrepFilesTable.uploadedBy,
      uploaderName: usersTable.name,
      createdAt: dataPrepFilesTable.createdAt,
    })
    .from(dataPrepFilesTable)
    .leftJoin(usersTable, eq(usersTable.id, dataPrepFilesTable.uploadedBy))
    .where(eq(dataPrepFilesTable.milestoneId, milestoneId))
    .orderBy(desc(dataPrepFilesTable.createdAt));

  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /data-prep-files { milestoneId, fileName, mimeType, dataBase64, note? }
router.post("/data-prep-files", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!UPLOAD_ROLES.includes(ctx.role)) { res.status(403).json({ error: "QA member or above required" }); return; }

  const { milestoneId, fileName, mimeType, dataBase64, note } = req.body ?? {};
  if (!milestoneId || !fileName || !dataBase64) {
    res.status(400).json({ error: "milestoneId, fileName and dataBase64 are required" }); return;
  }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, Number(milestoneId)));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const sizeBytes = Math.floor((String(dataBase64).length * 3) / 4);
  if (sizeBytes > MAX_BYTES) { res.status(400).json({ error: "File too large (max 15 MB)" }); return; }

  const [row] = await db.insert(dataPrepFilesTable).values({
    projectId: m.projectId,
    milestoneId: m.id,
    fileName: String(fileName).slice(0, 255),
    mimeType: String(mimeType ?? "application/octet-stream"),
    sizeBytes,
    note: note ? String(note) : null,
    dataBase64: String(dataBase64),
    uploadedBy: ctx.userId,
  }).returning({ id: dataPrepFilesTable.id });

  await logActivity({
    type: "data_prep_file_uploaded",
    description: `Data file "${fileName}" uploaded for milestone "${m.name}"`,
    userId: ctx.userId,
    entityId: m.id,
    entityType: "milestone",
  });
  res.status(201).json({ id: row.id });
});

// GET /data-prep-files/:id/download — decode + stream with original name/mime
router.get("/data-prep-files/:id/download", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(dataPrepFilesTable).where(eq(dataPrepFilesTable.id, id));
  if (!row) { res.status(404).json({ error: "File not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, row.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const buf = Buffer.from(row.dataBase64, "base64");
  res.setHeader("Content-Type", row.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${row.fileName.replace(/"/g, "")}"`);
  res.send(buf);
});

// DELETE /data-prep-files/:id — uploader or admin/cto only
router.delete("/data-prep-files/:id", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(dataPrepFilesTable).where(eq(dataPrepFilesTable.id, id));
  if (!row) { res.status(404).json({ error: "File not found" }); return; }
  const privileged = ["admin", "cto"].includes(ctx.role);
  if (!privileged && row.uploadedBy !== ctx.userId) {
    res.status(403).json({ error: "Only the uploader or an admin can delete this file" }); return;
  }
  await db.delete(dataPrepFilesTable).where(eq(dataPrepFilesTable.id, id));
  await logActivity({
    type: "data_prep_file_deleted",
    description: `Data file "${row.fileName}" deleted`,
    userId: ctx.userId,
    entityId: row.milestoneId,
    entityType: "milestone",
  });
  res.json({ ok: true });
});

export default router;
