// Who may do what on a milestone (CR100, CR101).
//
//   edit      the milestone's details: its author (createdBy), PM Lead, PM head,
//             admin and CTO. A milestone with no recorded author (legacy rows)
//             keeps the old rule so nobody is locked out of their own data.
//             QA Pipeline milestones keep their own rule: QA roles drive them
//             end to end (sync requirements, advance steps, sign off).
//   staff     add or remove team members: everyone who can edit, plus the
//             department leads, QA Manager and the HODs. The department limits
//             (who may add whom) are enforced separately in routes/milestones.ts.
//   create a requirement for the milestone: FA Leads, FA Members who are on the
//             milestone's team, and admin. Nobody else.
//
// No database imports so the rules can be tested on their own.

// Roles that could create/edit milestones before CR100 (kept for legacy rows).
export const LEGACY_WRITE_ROLES = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"];
export const QA_PIPELINE_ROLES = ["admin", "cto", "qa_member", "qa_lead", "qa_manager", "hod_qa"];
const ALWAYS_EDIT = ["admin", "cto", "pm_lead", "hod_pm"];
const STAFF_ROLES = ["qa_lead", "fa_lead", "dev_lead", "qa_manager", "hod_qa", "hod_fa", "hod_pm"];

export type MilestoneRef = { createdBy: number | null; pipelineEnabled: boolean | null };

export function canEditMilestone(role: string, userId: number, m: MilestoneRef): boolean {
  if (ALWAYS_EDIT.includes(role)) return true;
  if (m.createdBy != null && m.createdBy === userId) return true;
  if (m.createdBy == null && LEGACY_WRITE_ROLES.includes(role)) return true;
  if (m.pipelineEnabled && QA_PIPELINE_ROLES.includes(role)) return true;
  return false;
}

export function canStaffMilestone(role: string, userId: number, m: MilestoneRef): boolean {
  return canEditMilestone(role, userId, m) || STAFF_ROLES.includes(role);
}

export function canCreateRequirementFor(role: string, isOnTeam: boolean): boolean {
  if (role === "admin" || role === "fa_lead") return true;
  return role === "fa_member" && isOnTeam;
}

export type MilestoneCan = { edit: boolean; staff: boolean; createRequirement: boolean };

export function milestonePermissions(role: string, userId: number, m: MilestoneRef, isOnTeam: boolean): MilestoneCan {
  return {
    edit: canEditMilestone(role, userId, m),
    staff: canStaffMilestone(role, userId, m),
    createRequirement: canCreateRequirementFor(role, isOnTeam),
  };
}
