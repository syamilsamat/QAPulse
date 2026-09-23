import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const requirementAttachmentsTable = pgTable("requirement_attachments", {
  id: serial("id").primaryKey(),
  requirementId: integer("requirement_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  // Empty string on a link row — there is no file on disk to point at. Every
  // read path therefore has to check linkUrl before touching storagePath.
  storagePath: text("storage_path").notNull(),
  // Set only on a link attachment (a Confluence page, a spec in Drive, a
  // Figma board). Mutually exclusive with storagePath: a row is a stored file
  // or an external link, never both. Always http(s) — validated on write, so
  // rendering it straight into an anchor can't smuggle in a javascript: URL.
  linkUrl: text("link_url"),
  redmineAttachmentId: text("redmine_attachment_id"),
  redmineFileUrl: text("redmine_file_url"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequirementAttachment = typeof requirementAttachmentsTable.$inferSelect;
