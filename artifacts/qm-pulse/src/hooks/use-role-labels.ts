import { useMemo } from "react";
import { useRoles } from "@/hooks/use-roles";

/**
 * Human-readable names for role slugs.
 *
 * The authoritative source is the `roles` table's `description`, managed on the
 * Roles page and served by GET /roles — so renaming a role there flows through
 * to every label. This map is the offline fallback and mirrors DEFAULT_ROLES in
 * the API's roles.ts; keep the two in sync when a role is added.
 */
export const ROLE_LABEL_FALLBACK: Record<string, string> = {
  admin: "Admin",
  cto: "CTO / Director",
  hod_qa: "Head of QA",
  hod_pm: "Head of PM",
  hod_fa: "Head of FA",
  hod_dev: "Head of Dev",
  qa_manager: "QA Manager",
  qa_lead: "QA Lead",
  qa_member: "QA Member",
  fa_lead: "FA Lead",
  fa_member: "FA Member",
  dev_lead: "Dev Lead",
  dev_member: "Developer",
  pm_lead: "PM Lead",
  pm_member: "PM Member",
};

/** "hod_fa" → "Hod Fa". Last resort for a role nobody has named yet. */
export function titleCaseRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useRoleLabels() {
  const { data: dbRoles = [] } = useRoles();

  const roleLabel = useMemo(() => {
    const byName = new Map(dbRoles.map((r) => [r.name, r.description]));
    return (role?: string | null): string => {
      if (!role) return "";
      const fromDb = byName.get(role);
      if (fromDb) return fromDb;
      return ROLE_LABEL_FALLBACK[role] ?? titleCaseRole(role);
    };
  }, [dbRoles]);

  return { roleLabel, dbRoles };
}
