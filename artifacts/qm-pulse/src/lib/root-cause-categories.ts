// CR080 — root cause taxonomy for the Root Cause & Resolution card on the
// Defects page. QM Pulse-native, no tier gate — see ROOT_CAUSE_CATEGORIES in
// api-server/src/routes/defects.ts.
export interface RootCauseCategoryOption {
  value: string;
  label: string;
}

export const ROOT_CAUSE_CATEGORIES: RootCauseCategoryOption[] = [
  { value: "code_defect", label: "Code Defect" },
  { value: "configuration", label: "Configuration" },
  { value: "data_issue", label: "Data Issue" },
  { value: "environment", label: "Environment" },
  { value: "requirement_gap", label: "Requirement Gap" },
  { value: "third_party", label: "Third-Party Integration" },
];

export const rootCauseCategoryLabel = (value?: string | null): string | null =>
  ROOT_CAUSE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
