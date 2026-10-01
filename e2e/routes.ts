/**
 * Canonical page list, ported verbatim from
 * artifacts/api-server/scripts/preprod-browser.mjs — keep the two in step until
 * that script is retired.
 */
export const DESKTOP_ROUTES = [
  "/my-work", "/dashboard", "/requirements", "/milestones", "/qa-pipeline",
  "/pm-dashboard", "/test-cases", "/tasks", "/test-execution", "/execution-progress",
  "/defects", "/traceability", "/qa-analytics", "/risk-register", "/uat-signoffs",
  "/resources", "/history", "/team", "/teams", "/module-project", "/roles",
  "/admin-search", "/settings", "/inbox", "/team-hangouts",
] as const;

/** The subset the original walker re-checked at phone and tablet widths. */
export const RESPONSIVE_ROUTES = [
  "/my-work", "/dashboard", "/requirements", "/milestones", "/test-cases",
  "/tasks", "/defects", "/settings",
] as const;
