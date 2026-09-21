export const VERDICT_RESULTS = ["Passed", "Failed", "Blocked", "In Progress", "Not Executed"] as const;
export type VerdictResult = typeof VERDICT_RESULTS[number];

export function verdictExecutionUrl(ticketId: string, result: VerdictResult, module?: string): string {
  const query = new URLSearchParams({ source: "verdict", result });
  if (module !== undefined) query.set("module", module === "Unassigned Module" ? "" : module);
  return `/test-cases/execution/${encodeURIComponent(ticketId)}?${query}`;
}

export function readVerdictDrilldown(search: string) {
  const query = new URLSearchParams(search);
  const result = query.get("result");
  if (query.get("source") !== "verdict" || !VERDICT_RESULTS.includes(result as VerdictResult)) return null;
  return { result: result as VerdictResult, module: query.get("module") };
}

export function matchesExecutionResult(value: string | null | undefined, selected: string[]) {
  if (selected.length === 0) return true;
  const raw = (value ?? "").trim();
  const normalized = ({ pass: "Passed", passed: "Passed", fail: "Failed", failed: "Failed", blocked: "Blocked", "in progress": "In Progress", "not executed": "Not Executed" } as Record<string, string>)[raw.toLowerCase()] ?? raw;
  return selected.includes(normalized) || (!raw && selected.includes("Not Executed"));
}
