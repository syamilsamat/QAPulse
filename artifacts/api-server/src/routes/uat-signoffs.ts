/**
 * CR054p3 — UAT sign-off registry.
 *
 * PMs upload the signed UAT acceptance document against a milestone; the
 * registry page lists every sign-off the caller's project scope allows.
 * File bytes live base64 in-row (sign-off packs are small); the download
 * endpoint decodes and streams with the original filename/mime.
 */
import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, uatSignoffsTable, milestonesTable, projectsTable, usersTable } from "@workspace/db";
import { getAuthContext, canAccessProject, scopeToUserProjects } from "../middleware/access";
import { logActivity } from "./_audit";

const router: IRouter = Router();

// Same write tier as milestones: PM family + QA/FA leadership + admin/cto.
const UPLOAD_ROLES = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pmo", "cto"];
const MAX_BYTES = 15 * 1024 * 1024;

// GET /uat-signoffs?projectId=N — metadata only, scoped to the caller's projects
router.get("/uat-signoffs", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  if (projectId != null && Number.isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }
  if (projectId != null && accessible !== null && !accessible.includes(projectId)) {
    res.status(403).json({ error: "Access denied to this project" }); return;
  }

  const rows = await db
    .select({
      id: uatSignoffsTable.id,
      projectId: uatSignoffsTable.projectId,
      projectName: projectsTable.name,
      milestoneId: uatSignoffsTable.milestoneId,
      milestoneName: milestonesTable.name,
      fileName: uatSignoffsTable.fileName,
      mimeType: uatSignoffsTable.mimeType,
      sizeBytes: uatSignoffsTable.sizeBytes,
      note: uatSignoffsTable.note,
      uploadedBy: uatSignoffsTable.uploadedBy,
      uploaderName: usersTable.name,
      createdAt: uatSignoffsTable.createdAt,
    })
    .from(uatSignoffsTable)
    .innerJoin(milestonesTable, eq(milestonesTable.id, uatSignoffsTable.milestoneId))
    .innerJoin(projectsTable, eq(projectsTable.id, uatSignoffsTable.projectId))
    .leftJoin(usersTable, eq(usersTable.id, uatSignoffsTable.uploadedBy))
    .orderBy(desc(uatSignoffsTable.createdAt));

  const visible = rows.filter(r =>
    (projectId == null || r.projectId === projectId) &&
    (accessible === null || accessible.includes(r.projectId)),
  );
  res.json(visible.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// POST /uat-signoffs { milestoneId, fileName, mimeType, dataBase64, note? }
router.post("/uat-signoffs", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!UPLOAD_ROLES.includes(ctx.role)) { res.status(403).json({ error: "Lead role or above required" }); return; }

  const { milestoneId, fileName, mimeType, dataBase64, note } = req.body ?? {};
  if (!milestoneId || !fileName || !dataBase64) {
    res.status(400).json({ error: "milestoneId, fileName and dataBase64 are required" }); return;
  }
  const [m] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, Number(milestoneId)));
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, m.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const sizeBytes = Math.floor((String(dataBase64).length * 3) / 4);
  if (sizeBytes > MAX_BYTES) { res.status(400).json({ error: "File too large (max 15 MB)" }); return; }

  const [row] = await db.insert(uatSignoffsTable).values({
    projectId: m.projectId,
    milestoneId: m.id,
    fileName: String(fileName).slice(0, 255),
    mimeType: String(mimeType ?? "application/octet-stream"),
    sizeBytes,
    note: note ? String(note) : null,
    dataBase64: String(dataBase64),
    uploadedBy: ctx.userId,
  }).returning({ id: uatSignoffsTable.id });

  await logActivity({
    type: "uat_signoff_uploaded",
    description: `UAT sign-off "${fileName}" uploaded for milestone "${m.name}"`,
    userId: ctx.userId,
    entityId: m.id,
    entityType: "milestone",
  });
  res.status(201).json({ id: row.id });
});

// GET /uat-signoffs/:id/download — decode + stream with original name/mime
router.get("/uat-signoffs/:id/download", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(uatSignoffsTable).where(eq(uatSignoffsTable.id, id));
  if (!row) { res.status(404).json({ error: "Sign-off not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, row.projectId))) { res.status(403).json({ error: "Access denied" }); return; }

  const buf = Buffer.from(row.dataBase64, "base64");
  res.setHeader("Content-Type", row.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${row.fileName.replace(/"/g, "")}"`);
  res.send(buf);
});

// DELETE /uat-signoffs/:id — uploader or admin/cto only
router.delete("/uat-signoffs/:id", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(uatSignoffsTable).where(eq(uatSignoffsTable.id, id));
  if (!row) { res.status(404).json({ error: "Sign-off not found" }); return; }
  const privileged = ["admin", "cto"].includes(ctx.role);
  if (!privileged && row.uploadedBy !== ctx.userId) {
    res.status(403).json({ error: "Only the uploader or an admin can delete a sign-off" }); return;
  }
  await db.delete(uatSignoffsTable).where(eq(uatSignoffsTable.id, id));
  await logActivity({
    type: "uat_signoff_deleted",
    description: `UAT sign-off "${row.fileName}" deleted`,
    userId: ctx.userId,
    entityId: row.milestoneId,
    entityType: "milestone",
  });
  res.json({ ok: true });
});

export default router;
