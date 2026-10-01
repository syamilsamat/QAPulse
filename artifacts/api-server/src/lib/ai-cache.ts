import crypto from "crypto";
import * as XLSX from "xlsx";

/**
 * In-memory caches for the AI routes, so a large document is uploaded and
 * parsed once and an identical analysis is not paid for twice.
 *
 * Two caches, both bounded (entries and bytes) and expiring, because they live
 * in the API process's memory:
 *   - documents: an uploaded spec (PDF bytes, or a spreadsheet already parsed
 *     to text) keyed by the SHA-256 of its contents, per user. A later AI call
 *     sends the tiny documentId instead of re-posting up to 8 MB of base64.
 *   - results: a finished AI response keyed by a hash of everything it depended
 *     on (feature, document, a fingerprint of the project data). When any of
 *     that changes the key changes, so a stale answer is never served.
 *
 * Both are lost on restart and are per API process; that only costs a
 * re-upload or a fresh AI call, never a wrong answer.
 */

class BoundedCache<V> {
  private map = new Map<string, { value: V; at: number; bytes: number }>();
  private bytes = 0;

  constructor(
    private maxEntries: number,
    private maxBytes: number,
    private ttlMs: number,
    private sizeOf: (v: V) => number,
  ) {}

  get(key: string): { value: V; at: number } | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) { this.delete(key); return undefined; }
    // Re-insert so the Map's insertion order doubles as least-recently-used.
    this.map.delete(key);
    this.map.set(key, hit);
    return { value: hit.value, at: hit.at };
  }

  set(key: string, value: V): void {
    this.delete(key);
    const bytes = this.sizeOf(value);
    if (bytes > this.maxBytes) return; // never cache something bigger than the whole budget
    this.map.set(key, { value, at: Date.now(), bytes });
    this.bytes += bytes;
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  delete(key: string): void {
    const hit = this.map.get(key);
    if (!hit) return;
    this.bytes -= hit.bytes;
    this.map.delete(key);
  }
}

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_SHEET_TEXT_CHARS = 40_000;

export type CachedDocument = {
  fileName: string;
  mimeType: string;
  size: number;
  kind: "pdf" | "sheet";
  base64?: string; // pdf: sent to the model as-is
  text?: string; // sheet: parsed once to CSV text
};

const documents = new BoundedCache<CachedDocument>(
  20,
  64 * 1024 * 1024,
  2 * 60 * 60 * 1000,
  (d) => (d.base64?.length ?? 0) + (d.text?.length ?? 0) * 2,
);

const results = new BoundedCache<unknown>(
  200,
  16 * 1024 * 1024,
  30 * 60 * 1000,
  (v) => JSON.stringify(v ?? null).length * 2,
);

const docKey = (userId: number, id: string) => `${userId}:${id}`;

export function sha256(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type StoreResult =
  | { ok: true; documentId: string; cached: boolean; doc: CachedDocument }
  | { ok: false; error: string };

// Validates, parses and caches an uploaded document. Uploading the same bytes
// again is a cache hit and skips the parse.
export function storeDocument(
  userId: number,
  input: { fileName?: unknown; mimeType?: unknown; dataBase64?: unknown },
): StoreResult {
  const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 255) : "";
  const mimeType = typeof input.mimeType === "string" ? input.mimeType : "application/octet-stream";
  const dataBase64 = typeof input.dataBase64 === "string" ? input.dataBase64 : "";
  const buffer = Buffer.from(dataBase64, "base64");
  if (!fileName || buffer.length === 0 || buffer.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "Coverage document must be between 1 byte and 8 MB" };
  }

  // Type is checked before the cache lookup so identical bytes under an
  // unsupported file name are still rejected.
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isSheet = /\.(xlsx|xls)$/i.test(fileName);
  if (!isPdf && !isSheet) {
    return { ok: false, error: "Coverage document must be PDF, XLSX, or XLS" };
  }

  const documentId = sha256(buffer);
  const existing = documents.get(docKey(userId, documentId));
  if (existing) return { ok: true, documentId, cached: true, doc: existing.value };

  let doc: CachedDocument;
  if (isPdf) {
    doc = { fileName, mimeType: "application/pdf", size: buffer.length, kind: "pdf", base64: dataBase64 };
  } else {
    let text: string;
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      text = workbook.SheetNames
        .map((name) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`)
        .join("\n\n")
        .slice(0, MAX_SHEET_TEXT_CHARS);
    } catch {
      return { ok: false, error: "Could not read this spreadsheet" };
    }
    doc = { fileName, mimeType, size: buffer.length, kind: "sheet", text };
  }

  documents.set(docKey(userId, documentId), doc);
  return { ok: true, documentId, cached: false, doc };
}

export function getDocument(userId: number, documentId: string): CachedDocument | undefined {
  return documents.get(docKey(userId, documentId))?.value;
}

export function getCachedResult<T>(key: string): { value: T; at: number } | undefined {
  return results.get(key) as { value: T; at: number } | undefined;
}

export function setCachedResult(key: string, value: unknown): void {
  results.set(key, value);
}

// Stable hash over the rows an analysis was built from. Any add, delete or
// edit changes it, which is what retires a cached result.
export function fingerprintRows(rows: { id: number; updatedAt?: Date | string | null }[]): string {
  const h = crypto.createHash("sha256");
  for (const r of rows) h.update(`${r.id}:${r.updatedAt ? new Date(r.updatedAt).getTime() : 0};`);
  return h.digest("hex");
}
