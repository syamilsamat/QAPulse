import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { testCasesTable } from "./test-cases";

// Reference material belongs to the library record, never an execution/result.
export const testCaseAttachmentsTable = pgTable("test_case_attachments", {
  id: serial("id").primaryKey(),
  testCaseId: integer("test_case_id").notNull().references(() => testCasesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  dataBase64: text("data_base64").notNull(),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("test_case_attachments_case_idx").on(t.testCaseId)]);
