// Who may change a test case's CONTENT inside an execution file.
//
// Content is what the test case says: scenario, pre-condition, case name,
// steps, test data, expected result, module, user story, requirement and
// tracker. Recording a result, a defect, a comment or the QA PIC is
// execution, not content, and is governed by its own existing rules.
//
// The rule follows the file's review state:
//   draft / in review / returned: locked to the test case's owner. A reviewer
//     reads and approves or returns; they do not edit. Leads may step in on a
//     draft or returned file (for example when the owner is away) but never
//     while it is in review.
//   approved: any QA role may edit. If it is someone other than the owner,
//     the row goes back to "pending" so a third person accepts the change.
//
// Kept free of database imports so it can be tested on its own.

export const CONTENT_FIELDS = [
  "moduleName", "caseId", "userStory", "requirementId", "tracker",
  "scenario", "preCondition", "caseName", "testSteps", "testData", "expectedResult",
] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

export type EditContext = {
  fileReviewStatus: string | null | undefined; // draft | in_review | approved | rejected
  fileOwnerId: number | null; // executionFiles.qaPicSetBy
  rowOwnerId: number | null; // execution_test_cases.addedBy
  actorId: number | null;
  actorIsQa: boolean; // a QA-department role, or admin / cto
  actorIsLead: boolean; // lead tier or above, or admin / cto
};

export type EditDecision =
  | { allowed: true; repend: boolean }
  | { allowed: false; reason: string };

export function decideContentEdit(c: EditContext): EditDecision {
  if (!c.actorIsQa) return { allowed: false, reason: "Only QA roles can edit test cases" };

  const status = c.fileReviewStatus ?? "draft";
  // An unowned row (legacy data) falls back to the file's owner; if neither
  // is known there is nobody to protect, so QA roles may edit it.
  const owner = c.rowOwnerId ?? c.fileOwnerId;
  const isOwner = c.actorId != null && (c.actorId === c.rowOwnerId || c.actorId === c.fileOwnerId);

  if (status === "approved") {
    // Someone other than the owner is changing reviewed content, so it must be
    // accepted again by a different person.
    return { allowed: true, repend: owner != null && !isOwner };
  }
  if (owner == null || isOwner) return { allowed: true, repend: false };
  if (status !== "in_review" && c.actorIsLead) return { allowed: true, repend: false };
  return {
    allowed: false,
    reason: status === "in_review"
      ? "This test case is in review and can only be edited by its owner"
      : "This test case is a draft owned by someone else",
  };
}

const norm = (v: unknown) => (v == null ? "" : String(v).replace(/\r\n/g, "\n").trim());

// Which content fields differ between what is stored and what was sent.
export function changedContentFields(
  stored: Partial<Record<ContentField, unknown>>,
  incoming: Partial<Record<ContentField, unknown>>,
): ContentField[] {
  return CONTENT_FIELDS.filter((f) => incoming[f] !== undefined && norm(stored[f]) !== norm(incoming[f]));
}
