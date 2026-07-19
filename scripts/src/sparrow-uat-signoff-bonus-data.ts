/**
 * UAT sign-off document for CR-2026-014, layered on top of the base SPARROW
 * dataset — demonstrates CR056's "Go-Live sign-off gap": the gap between the
 * UAT sign-off pack being uploaded and the milestone actually being marked
 * completed.
 *
 * The base seed's S10.1 step (Daniel, FA Lead, approves the milestone via
 * the review endpoint) sets status="completed" in the same call as the
 * sign-off action, so it can never show a gap — that's a status
 * transition, not a document upload. This adds the separate, real UAT
 * sign-off DOCUMENT the review action doesn't otherwise produce, backdated
 * to 3 days before the milestone's completedAt (2026-10-14 15:02, pre-shift)
 * so the story reads: business signs off the acceptance pack on the 11th,
 * the FA Lead doesn't formally close the milestone in QAPulse until the 14th.
 */
import { pt } from "./sparrow-data";

export const UAT_SIGNOFF = {
  milestoneKey: "cr2026014",
  uploaderKey: "rizal", // hod_pm — a PM collecting the signed business acceptance is the natural real-world uploader
  fileName: "UAT-Signoff-CR-2026-014-FPX-Online-Payment.txt",
  mimeType: "text/plain",
  note: "Business UAT acceptance signed off by Finance and Wallet Operations for CR-2026-014 — all UAT scenarios passed. Retained here as the formal sign-off record.",
  signOffDate: pt("2026-10-11", "10:00"),
  fileContents:
`UAT SIGN-OFF — CR-2026-014: FPX Online Payment Integration
SPARROW — ePayment Gateway Revamp

Business Acceptance: APPROVED

Signed off by:
  - Finance Operations
  - Wallet Operations

All User Acceptance Test scenarios for the FPX Online Payment Integration
release have been executed and passed. This document constitutes formal
business sign-off to proceed with production go-live.
`,
};
