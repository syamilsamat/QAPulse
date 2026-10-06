// CR105 — the testing phase a defect was found in. One list for every defect
// dialog; the server keeps a matching one in api-server/src/lib/defect-found-in.ts.
export const FOUND_IN_OPTIONS = ["System Testing", "SIT", "UAT", "Production"] as const;
export const DEFAULT_FOUND_IN = "System Testing";

/** The phase an execution file stands for: QA is System Testing, SIT is SIT, UAT is UAT. */
export function foundInForFileType(fileType?: string | null): string {
  if (fileType === "sit") return "SIT";
  if (fileType === "uat") return "UAT";
  return DEFAULT_FOUND_IN;
}
