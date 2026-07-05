// QAPulse-native defect classification — fixed taxonomy, independent of
// whatever a given Redmine project's own "category" field holds. Settable
// only by Lead-tier and above (tierRank >= 2) — see canSetDefectCategory
// in api-server/src/routes/defects.ts.
export interface DefectCategoryOption {
  value: string;
  label: string;
  description: string;
}

export const DEFECT_CATEGORIES: DefectCategoryOption[] = [
  { value: "functional", label: "Functional", description: "Feature doesn't behave per spec/requirement (wrong output, broken workflow, missing validation)." },
  { value: "ui_ux", label: "UI/UX (Cosmetic)", description: "Layout, alignment, styling, responsiveness, visual inconsistency — doesn't block usage." },
  { value: "usability", label: "Usability", description: "Technically works but confusing, unintuitive, poor accessibility." },
  { value: "performance", label: "Performance", description: "Slow response, timeout, high resource usage, doesn't meet SLA." },
  { value: "security", label: "Security", description: "Auth bypass, data exposure, injection, permission/access-control gaps." },
  { value: "data", label: "Data/Database", description: "Data corruption, incorrect calculation, integrity/constraint violations." },
  { value: "compatibility", label: "Compatibility", description: "Fails on a specific browser, device, OS, or screen size." },
  { value: "integration", label: "Integration/API", description: "Breaks at a system boundary — third-party API, Redmine sync, webhook, external service." },
  { value: "configuration", label: "Configuration/Environment", description: "Works in one env (dev/staging) but not another; deployment/config issue." },
  { value: "localization", label: "Localization", description: "Translation, date/currency/timezone formatting, RTL layout issues." },
];

export const defectCategoryLabel = (value?: string | null): string | null =>
  DEFECT_CATEGORIES.find((c) => c.value === value)?.label ?? null;
