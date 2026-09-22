import { db, activityTable } from "@workspace/db";

// Fields that never belong in an audit diff
const IGNORED_FIELDS = new Set(["id", "createdAt", "updatedAt"]);

// Compare only the keys present in `after` (a PATCH payload) against the row
// as it was before the update. Returns null when nothing actually changed.
export function diffChanges(
  before: Record<string, any>,
  after: Record<string, any>,
): { oldValue: Record<string, any>; newValue: Record<string, any> } | null {
  const oldValue: Record<string, any> = {};
  const newValue: Record<string, any> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const a = before[key] instanceof Date ? before[key].toISOString() : before[key] ?? null;
    const b = after[key] instanceof Date ? after[key].toISOString() : after[key] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValue[key] = a;
      newValue[key] = b;
    }
  }
  return Object.keys(newValue).length > 0 ? { oldValue, newValue } : null;
}

export interface AuditEntry {
  type: string;
  description: string;
  userId?: number | null;
  entityId?: number | null;
  entityType?: string | null;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
}

// CR011: best-effort — an audit failure must never fail the business operation.
export async function logActivity(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(activityTable).values({
      type: entry.type,
      description: entry.description,
      userId: entry.userId ?? null,
      entityId: entry.entityId ?? null,
      entityType: entry.entityType ?? null,
      oldValue: entry.oldValue ? JSON.stringify(entry.oldValue) : null,
      newValue: entry.newValue ? JSON.stringify(entry.newValue) : null,
    });
  } catch (err) {
    console.error("[logActivity] audit write failed:", err);
  }
}
