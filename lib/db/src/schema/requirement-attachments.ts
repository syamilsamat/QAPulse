import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const requirementAttachmentsTable = pgTable("requirement_attachments", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  redmineAttachmentId: text("redmine_attachment_id"),
  redmineFileUrl: text("redmine_file_url"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequirementAttachment = typeof requirementAttachmentsTable.$inferSelect;
