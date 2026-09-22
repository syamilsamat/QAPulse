import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, defectAvailabilityTable as availability } from "@workspace/db";

export function availabilityFingerprint(apiKey: string): string {
  return createHash("sha256").update(JSON.stringify([process.env.REDMINE_URL ?? "https://redmine.bestinet.my", apiKey])).digest("hex");
}
export async function readAvailability(userId: number, apiKey: string, ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(availability).where(and(
    eq(availability.userId, userId), eq(availability.credentialFingerprint, availabilityFingerprint(apiKey)),
    inArray(availability.defectId, ids),
  ));
}
export async function recordAvailability(userId: number, apiKey: string, defect: { id: number; redmineId: string | null }, unavailable: boolean) {
  if (!unavailable) {
    await db.delete(availability).where(and(eq(availability.defectId, defect.id), eq(availability.userId, userId)));
    return;
  }
  const values = { defectId: defect.id, userId, redmineId: defect.redmineId!, credentialFingerprint: availabilityFingerprint(apiKey), checkedAt: new Date() };
  await db.insert(availability).values(values).onConflictDoUpdate({ target: [availability.defectId, availability.userId], set: values });
}
