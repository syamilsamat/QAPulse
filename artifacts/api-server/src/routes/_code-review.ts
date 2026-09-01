import path from "path";
import fs from "fs";
import crypto from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  codeReviewsTable,
  reviewEvidenceTable,
  tasksTable,
  requirementsTable,
  rolesTable,
} from "@workspace/db";
import { logActivity } from "./_audit";
import { notifyRolesInProject } from "./_notify";

// Shared code-review primitive — Dev Tasks (requirement -> tasks) and defects
// assigned to a dev both drive through this same append-only table instead of
// two parallel schemas/route sets. See lib/db/src/schema/code-reviews.ts for
// the "why append-only" note.

export type ReviewEntityType = "task" | "defect";

const EVIDENCE_UPLOADS_DIR = path.join(process.cwd(), "uploads", "code-review-evidence");
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // 5MB — matches DefectCreationModal's existing client-side cap
const ALLOWED_EVIDENCE_MIME = /^image\/|^application\/pdf$/;

async function ensureEvidenceUploadsDir() {
  await fs.promises.mkdir(EVIDENCE_UPLOADS_DIR, { recursive: true });
}

export interface EvidenceInput {
  filename: string;
  mimeType?: string;
  data: string; // base64
}

export class EvidenceRejectedError extends Error {}

async function storeEvidence(codeReviewId: number, uploadedBy: number, evidence: EvidenceInput) {
  const buffer = Buffer.from(evidence.data, "base64");
  if (buffer.length > MAX_EVIDENCE_BYTES) {
    throw new EvidenceRejectedError("Evidence file exceeds the 5MB limit");
  }
  const mimeType = evidence.mimeType ?? "application/octet-stream";
  if (!ALLOWED_EVIDENCE_MIME.test(mimeType)) {
    throw new EvidenceRejectedError("Evidence must be an image or a PDF");
  }

  await ensureEvidenceUploadsDir();
  const ext = path.extname(evidence.filename) || "";
  const storageFilename = `${crypto.randomUUID()}${ext}`;
  await fs.promises.writeFile(path.join(EVIDENCE_UPLOADS_DIR, storageFilename), buffer);

  await db.insert(reviewEvidenceTable).values({
    codeReviewId,
    filename: evidence.filename,
    mimeType,
    size: buffer.length,
    storagePath: storageFilename,
    uploadedBy,
  });
}

/** Absolute path for a stored evidence file — for a download route to stream. */
export function resolveEvidencePath(storagePath: string): string {
  return path.join(EVIDENCE_UPLOADS_DIR, storagePath);
}

/** Evidence file(s) attached to one review round — usually 0 or 1. */
export async function getEvidenceForReview(codeReviewId: number) {
  return db.select().from(reviewEvidenceTable).where(eq(reviewEvidenceTable.codeReviewId, codeReviewId));
}

/** Latest review round for an entity, or null if it's never been submitted. */
export async function getLatestReview(entityType: ReviewEntityType, entityId: number) {
  const [row] = await db
    .select()
    .from(codeReviewsTable)
    .where(and(eq(codeReviewsTable.entityType, entityType), eq(codeReviewsTable.entityId, entityId)))
    .orderBy(desc(codeReviewsTable.submittedAt))
    .limit(1);
  return row ?? null;
}

/** Inserts a new review round (in_review). Rejects the evidence file, not the whole submission, on a bad file. */
export async function submitForReview(opts: {
  entityType: ReviewEntityType;
  entityId: number;
  submittedBy: number;
  prLink?: string | null;
  evidence?: EvidenceInput | null;
  logDescription: string;
  logEntityType: string; // "task" | "defect" — passed through to logActivity's entityType column
}) {
  const [review] = await db
    .insert(codeReviewsTable)
    .values({
      entityType: opts.entityType,
      entityId: opts.entityId,
      status: "in_review",
      prLink: opts.prLink || null,
      submittedBy: opts.submittedBy,
    })
    .returning();

  if (opts.evidence) {
    await storeEvidence(review.id, opts.submittedBy, opts.evidence);
  }

  await logActivity({
    type: `${opts.entityType}_submitted_for_review`,
    description: opts.logDescription,
    userId: opts.submittedBy,
    entityId: opts.entityId,
    entityType: opts.logEntityType,
    newValue: { reviewId: review.id, prLink: opts.prLink ?? null, hasEvidence: !!opts.evidence },
  });

  return review;
}

/** Approve or reject the given review round. Caller has already checked the reviewer isn't a co-assignee/author. */
export async function decideReview(opts: {
  reviewId: number;
  reviewerId: number;
  decision: "approve" | "reject";
  note?: string | null;
  logDescription: string;
  logEntityType: string;
  entityId: number;
}) {
  const [updated] = await db
    .update(codeReviewsTable)
    .set({
      status: opts.decision === "approve" ? "approved" : "rejected",
      reviewerId: opts.reviewerId,
      reviewedAt: new Date(),
    })
    .where(eq(codeReviewsTable.id, opts.reviewId))
    .returning();

  await logActivity({
    type: opts.decision === "approve" ? `${updated.entityType}_review_approved` : `${updated.entityType}_review_rejected`,
    description: opts.logDescription,
    userId: opts.reviewerId,
    entityId: opts.entityId,
    entityType: opts.logEntityType,
    newValue: { reviewId: opts.reviewId, note: opts.note ?? null },
  });

  return updated;
}

/**
 * Fires once every dev task on a requirement is Done — sets devStatus to
 * ready_for_qa exactly like the manual PATCH /requirements/:id/dev
 * ready_for_qa branch does, so nothing downstream (Tasks board,
 * buildPhaseTimeline's development segment) needs to know this happened
 * automatically rather than by a click. No-ops if the requirement has zero
 * tasks (an empty set is not "all done") or is already ready_for_qa.
 */
export async function maybeAdvanceRequirement(requirementId: number, lastActorName: string): Promise<void> {
  const tasks = await db.select({ status: tasksTable.status }).from(tasksTable).where(eq(tasksTable.requirementId, requirementId));
  if (tasks.length === 0) return;
  if (!tasks.every((t) => t.status === "done")) return;

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!requirement || (requirement as any).devStatus === "ready_for_qa") return;

  await db
    .update(requirementsTable)
    .set({ devStatus: "ready_for_qa", readyForQaAt: new Date() } as any)
    .where(eq(requirementsTable.id, requirementId));

  await logActivity({
    type: "requirement_dev_ready_for_qa",
    description: `Requirement "${requirement.title}" — all ${tasks.length} dev task${tasks.length === 1 ? "" : "s"} reviewed and Done, automatically moved to Ready for QA (last task closed by ${lastActorName})`,
    userId: null,
    entityId: requirementId,
    entityType: "requirement",
    oldValue: { devStatus: (requirement as any).devStatus ?? null },
    newValue: { devStatus: "ready_for_qa" },
  });
}

/** Role names in the 'dev' department, for notifyRolesInProject fan-out. */
export async function getDevDepartmentRoleNames(): Promise<string[]> {
  const rows = await db.select({ name: rolesTable.name }).from(rolesTable).where(eq(rolesTable.department, "dev"));
  return rows.map((r) => r.name);
}

/** Notify dev-department peers on a project/module that something needs review, excluding the submitter(s). */
export async function notifyDevPeersOfReview(opts: {
  projectId: number | null | undefined;
  module?: string | null;
  title: string;
  message: string;
  type: string;
  entityType: string;
  entityId: number;
  actorId: number;
  excludeUserIds: Iterable<number>;
}) {
  const devRoles = await getDevDepartmentRoleNames();
  if (devRoles.length === 0) return;
  await notifyRolesInProject({
    roles: devRoles,
    projectId: opts.projectId,
    module: opts.module,
    title: opts.title,
    message: opts.message,
    type: opts.type,
    entityType: opts.entityType,
    entityId: opts.entityId,
    actorId: opts.actorId,
    excludeUserIds: opts.excludeUserIds,
  });
}
