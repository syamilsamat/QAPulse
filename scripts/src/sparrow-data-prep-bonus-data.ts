/**
 * CR070 — one Data Prep milestone scenario (MS-10), layered on top of the
 * base SPARROW dataset. Demonstrates the new milestone type end to end: the
 * auto-populated "what QA needs to prepare" description, multi-assignee
 * staffing, a task-completion rollup for the PM Dashboard (CR069's whole
 * reason for existing — Data Prep milestones have no requirements to derive
 * readiness from), and the QA-uploads / PM-downloads file handoff.
 *
 * Tied into the existing storyline: CR-2026-026 (Merchant Settlement Batch
 * Job, MS-07 in sparrow-milestones-bonus-data.ts) needs a realistic but
 * anonymized transaction dataset before its SIT round can start on ENV1 —
 * production data can't be used directly for testing.
 *
 * Requires seed-sparrow-data.ts to have already been run. Pure data — no API
 * calls. seed-sparrow-data-prep-bonus.ts creates everything;
 * finalize-sparrow-data-prep-bonus.ts backdates it.
 */
import { pd, pt } from "./sparrow-data";

export const MS10 = {
  key: "cr2026029",
  name: "CR-2026-029 — Merchant Settlement Test Dataset Prep",
  type: "data_prep",
  environment: "ENV1",
  createdDate: pt("2026-08-20", "09:00"),
  targetDate: pd("2026-08-27"),
  description:
`Data source / system: Production settlement ledger (anonymized export via Data Engineering)
Fields & format required: merchant_id, transaction_id, amount, currency, settlement_date, status — CSV, UTF-8
Number of records needed: ~500 representative transactions across 10 merchants, incl. refund/chargeback edge cases
Target environment: ENV1
Special conditions (edge cases, boundary values): zero-amount transactions, cross-currency settlements, at least 3 records dated 31 Aug (Merdeka Day) to test the batch job's public-holiday skip logic
Deadline for handover to QA: 2026-08-27 — 3 days before CR-2026-026's QA phase starts`,
  assigneeKeys: ["melissa", "syafiq"] as const, // qa_lead overseeing + qa_member doing the actual prep
  note: "Feeds CR-2026-026 — QA can't test the settlement batch job against real merchant data, so this dataset has to exist before that milestone's SIT round can start on ENV1.",
};

export interface DataPrepTask {
  key: string;
  name: string;
  assigneeKey: string;
  status: "done" | "in_progress";
  estimatedHours: number;
  actualHours: number;
  completionPercentage: number;
  startDate: string;
  dueDate: string;
  actualStartDate: string;
  actualEndDate?: string;
}

// Two done, one in-flight — a realistic snapshot for the CR069 task rollup
// card on the PM Dashboard rather than a suspiciously tidy 100%.
export const DATA_PREP_TASKS: DataPrepTask[] = [
  { key: "tdp1", name: "Extract & anonymize merchant transaction records", assigneeKey: "syafiq", status: "done", estimatedHours: 6, actualHours: 7, completionPercentage: 100, startDate: pd("2026-08-20"), dueDate: pd("2026-08-23"), actualStartDate: pd("2026-08-20"), actualEndDate: pd("2026-08-23") },
  { key: "tdp2", name: "Validate dataset against settlement batch job schema", assigneeKey: "syafiq", status: "done", estimatedHours: 2, actualHours: 2, completionPercentage: 100, startDate: pd("2026-08-24"), dueDate: pd("2026-08-25"), actualStartDate: pd("2026-08-24"), actualEndDate: pd("2026-08-25") },
  { key: "tdp3", name: "Package dataset and hand off to PM for client email", assigneeKey: "syafiq", status: "in_progress", estimatedHours: 1, actualHours: 0.5, completionPercentage: 50, startDate: pd("2026-08-26"), dueDate: pd("2026-08-27"), actualStartDate: pd("2026-08-26") },
];

export const DATA_PREP_FILE = {
  uploaderKey: "syafiq",
  fileName: "merchant_settlement_test_dataset.csv",
  mimeType: "text/csv",
  note: "Anonymized transaction sample across 10 merchants — ready for CR-2026-026 SIT on ENV1.",
  uploadDate: pt("2026-08-26", "16:00"),
  fileContents:
`merchant_id,transaction_id,amount,currency,settlement_date,status
MER-001,TXN-100234,152.40,MYR,2026-08-25,SETTLED
MER-001,TXN-100235,0.00,MYR,2026-08-25,SETTLED
MER-002,TXN-100236,89.90,SGD,2026-08-25,REFUNDED
MER-003,TXN-100237,4210.00,MYR,2026-08-26,SETTLED
MER-004,TXN-100238,76.50,MYR,2026-08-31,SETTLED
MER-005,TXN-100239,312.00,MYR,2026-08-31,CHARGEBACK
MER-006,TXN-100240,15.00,MYR,2026-08-25,SETTLED
MER-007,TXN-100241,998.20,USD,2026-08-25,SETTLED
MER-008,TXN-100242,45.60,MYR,2026-08-26,SETTLED
MER-009,TXN-100243,60.00,MYR,2026-08-31,SETTLED
`,
};
