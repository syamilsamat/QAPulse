import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, testCasesTable, testCaseAttachmentsTable as attachments, usersTable } from "@workspace/db";
import { getAuthContext, canAccessProject, canAccessModule } from "../middleware/access";
import { logActivity } from "./_audit";

const router: IRouter = Router();
const MAX_BYTES = 20 * 1024 * 1024;
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);
const metadata = {
  id: attachments.id, testCaseId: attachments.testCaseId, fileName: attachments.fileName,
  mimeType: attachments.mimeType, sizeBytes: attachments.sizeBytes,
  uploadedBy: attachments.uploadedBy, createdAt: attachments.createdAt,
};
const canDelete = (userId: number, role: string, uploadedBy: number) =>
  uploadedBy === userId || role === "admin" || role === "cto";

// Library editing currently has no separate role permission: authenticated users
// within the record's project/module scope can edit. Apply that scope to uploads
// as well as reads; never infer access from a supplied execution or file ID.
router.use("/test-cases/:testCaseId/attachments", async (req, res, next) => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.testCaseId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid test case ID" }); return; }
  const [tc] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, id));
  if (!tc) { res.status(404).json({ error: "Test case not found" }); return; }
  const allowed = tc.projectId != null
    ? await canAccessProject(ctx.userId, ctx.role, tc.projectId) && await canAccessModule(ctx.userId, ctx.role, tc.projectId, tc.module)
    : tc.authorId === ctx.userId || ["admin", "cto"].includes(ctx.role);
  if (!allowed) { res.status(403).json({ error: "Access denied to this test case" }); return; }
  res.locals.attachmentContext = { ...ctx, testCaseId: id };
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

router.get("/test-cases/:testCaseId/attachments", async (_req, res) => {
  const ctx = res.locals.attachmentContext;
  const rows = await db.select({ ...metadata, uploadedByName: usersTable.name }).from(attachments)
    .leftJoin(usersTable, eq(usersTable.id, attachments.uploadedBy))
    .where(eq(attachments.testCaseId, ctx.testCaseId)).orderBy(desc(attachments.createdAt), desc(attachments.id));
  res.json({ canUpload: true, attachments: rows.map(row => ({ ...row, canDelete: canDelete(ctx.userId, ctx.role, row.uploadedBy) })) });
});

router.post("/test-cases/:testCaseId/attachments", async (req, res) => {
  const ctx = res.locals.attachmentContext;
  const { fileName, mimeType, dataBase64 } = req.body ?? {};
  if (typeof fileName !== "string" || !fileName.trim() || typeof dataBase64 !== "string" || !dataBase64.length) {
    res.status(400).json({ error: "A filename and non-empty attachment are required" }); return;
  }
  if (dataBase64.length > Math.ceil(MAX_BYTES / 3) * 4) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }
  if (dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    res.status(400).json({ error: "Invalid attachment data" }); return;
  }
  const buffer = Buffer.from(dataBase64, "base64");
  if (!buffer.length || buffer.toString("base64") !== dataBase64) { res.status(400).json({ error: "Invalid attachment data" }); return; }
  if (buffer.length > MAX_BYTES) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }
  const safeName = fileName.replace(/[\x00-\x1f\x7f/\\]/g, "_").trim().slice(0, 255);
  const safeType = typeof mimeType === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType) && mimeType.length <= 150
    ? mimeType.toLowerCase() : "application/octet-stream";
  const [created] = await db.insert(attachments).values({
    testCaseId: ctx.testCaseId, fileName: safeName, mimeType: safeType,
    dataBase64, sizeBytes: buffer.length, uploadedBy: ctx.userId,
  }).returning(metadata);
  await logActivity({ type: "test_case_attachment_uploaded", description: `Library attachment "${safeName}" uploaded`, userId: ctx.userId, entityId: ctx.testCaseId, entityType: "test_case" });
  res.status(201).json({ ...created, canDelete: true });
});

router.get("/test-cases/:testCaseId/attachments/:attachmentId/download", async (req, res) => {
  const id = Number(req.params.attachmentId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid attachment ID" }); return; }
  const [file] = await db.select().from(attachments).where(and(eq(attachments.id, id), eq(attachments.testCaseId, res.locals.attachmentContext.testCaseId)));
  if (!file) { res.status(404).json({ error: "Attachment not found" }); return; }
  const inline = req.query.inline === "1" && INLINE_TYPES.has(file.mimeType);
  res.setHeader("Content-Type", INLINE_TYPES.has(file.mimeType) ? file.mimeType : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`);
  res.send(Buffer.from(file.dataBase64, "base64"));
});

router.delete("/test-cases/:testCaseId/attachments/:attachmentId", async (req, res) => {
  const ctx = res.locals.attachmentContext;
  const id = Number(req.params.attachmentId);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid attachment ID" }); return; }
  const [file] = await db.select(metadata).from(attachments).where(and(eq(attachments.id, id), eq(attachments.testCaseId, ctx.testCaseId)));
  if (!file) { res.status(404).json({ error: "Attachment not found" }); return; }
  if (!canDelete(ctx.userId, ctx.role, file.uploadedBy)) { res.status(403).json({ error: "Only the uploader or an admin can delete this attachment" }); return; }
  await db.delete(attachments).where(and(eq(attachments.id, id), eq(attachments.testCaseId, ctx.testCaseId)));
  await logActivity({ type: "test_case_attachment_deleted", description: `Library attachment "${file.fileName}" deleted`, userId: ctx.userId, entityId: ctx.testCaseId, entityType: "test_case" });
  res.status(204).end();
});
export default router;
