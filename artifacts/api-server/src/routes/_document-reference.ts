export const FWCMS_GENERAL_REFERENCES = {
  CR: "BSB-QA-FWCMS-153-CRD-V1.0",
  SIT: "BSB-QA-FWCMS-154-SIT-V1.0",
  UAT: "BSB-QA-FWCMS-155-UAT-V1.0",
} as const;

export function normaliseTracker(tracker: string): keyof typeof FWCMS_GENERAL_REFERENCES {
  const value = (tracker ?? "").toLowerCase();
  if (value.includes("uat")) return "UAT";
  if (value.includes("sit")) return "SIT";
  return "CR";
}

type Entry = { projectName: string; moduleName: string; tracker: string; refNo: string };
const normalise = (value: string) => value.trim().toLowerCase();

// Exact names avoid empty-module wildcard matches and substring collisions
// (e.g. eVDR vs eVDR PRA). Explicit module references always win over General.
export function selectDocumentReference(entries: Entry[], projectName: string, selectedModules: string, trackerLabel: string): string | undefined {
  const project = normalise(projectName);
  if (!project) return undefined;
  const tracker = normaliseTracker(trackerLabel);
  const candidates = entries.filter(row => normalise(row.projectName) === project && row.tracker.trim().toUpperCase() === tracker && row.refNo.trim());
  const modules = selectedModules.split(",").map(normalise).filter(Boolean);
  const eQuota = modules.indexOf("equota");
  if (eQuota > 0) modules.unshift(...modules.splice(eQuota, 1));
  for (const module of modules) {
    const entry = candidates.find(row => normalise(row.moduleName) === module);
    if (entry) return entry.refNo.trim();
  }
  if (project !== "fwcms") return undefined;
  const general = candidates.find(row => ["general", "fwcms general"].includes(normalise(row.moduleName)));
  return general?.refNo.trim() || FWCMS_GENERAL_REFERENCES[tracker];
}
