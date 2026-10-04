// CR105 — the testing phase a defect was found in. One list for the server;
// the web app keeps a matching one in qm-pulse/src/lib/defect-found-in.ts.
export const FOUND_IN_VALUES = ["System Testing", "SIT", "UAT", "Production"] as const;
export const DEFAULT_QA_FOUND_IN = "System Testing";

/**
 * The phase an execution file stands for: a QA file is System Testing, a SIT
 * file is SIT, a UAT file is UAT. Older files carry no distinct SIT type, so
 * the tracker text is a fallback (a tracker mentioning UAT or SIT).
 */
export function foundInForExecutionFile(fileType: string | null | undefined, tracker?: string | null): string {
  if (fileType === "uat") return "UAT";
  if (fileType === "sit") return "SIT";
  if (fileType === "qa") return DEFAULT_QA_FOUND_IN;
  if (/uat/i.test(tracker ?? "")) return "UAT";
  if (/\bsit\b/i.test(tracker ?? "")) return "SIT";
  return DEFAULT_QA_FOUND_IN;
}
