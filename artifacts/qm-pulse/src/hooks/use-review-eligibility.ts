import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";

/**
 * Who may peer-review an artifact — the client mirror of the API's
 * lib/review-eligibility.ts. Keep the two in sync; the API is authoritative
 * and will still 403, this only decides whether to render the buttons.
 *
 * Review is peer-to-peer: every role in the owning department may review that
 * department's work, member tier included — it is not reserved for leads/HODs.
 * Segregation of duties is separate and still applies at every call site: the
 * author of a record never reviews their own, whatever their role.
 */
export type ReviewDomain = "qa" | "fa";

/** Departmentless roles that sit above the org chart — eligible everywhere. */
const UNRESTRICTED_ROLES = ["admin", "cto"];

/** tier_rank at or above which a role counts as leadership. */
const LEAD_TIER = 2;

/** Offline fallback for a role row missing department/tier_rank. */
const FALLBACK: Record<ReviewDomain, string[]> = {
  qa: ["qa_member", "qa_lead", "qa_manager", "hod_qa"],
  fa: ["fa_member", "fa_lead", "hod_fa", "qa_lead", "qa_manager", "hod_qa"],
};

/** Offline fallback for approving/rejecting an execution file. */
const FILE_APPROVAL_FALLBACK = ["qa_lead", "qa_manager", "hod_qa"];

interface RoleRow {
  name: string;
  department?: string | null;
  tierRank?: number | null;
}

function eligible(domain: ReviewDomain, row: RoleRow): boolean {
  if (UNRESTRICTED_ROLES.includes(row.name)) return true;
  if (row.department === domain) return true;
  // QA leadership keeps its standing oversight of FA requirements — it is the
  // downstream consumer of them.
  if (domain === "fa" && row.department === "qa" && (row.tierRank ?? 1) >= LEAD_TIER) return true;
  return FALLBACK[domain].includes(row.name);
}

export function useReviewEligibility() {
  const { user, token } = useAuth();

  // Same query key and shape as useRoleLabels, so the two share one fetch.
  const { data: dbRoles = [] } = useQuery<RoleRow[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const role = user?.role ?? "";

  return useMemo(() => {
    const row = dbRoles.find((r) => r.name === role);
    const canReview = (domain: ReviewDomain): boolean => {
      if (!role) return false;
      if (UNRESTRICTED_ROLES.includes(role)) return true;
      // Roles not loaded yet (or a role the table doesn't know): fall back to
      // the static list rather than hiding the buttons from a real reviewer.
      if (!row) return FALLBACK[domain].includes(role);
      return eligible(domain, row);
    };
    // Approving/rejecting an execution file (test case sign-off) is narrower
    // than general QA review — reserved for QA Lead and above, unlike
    // submitting a file or accepting/returning an individual row, which stay
    // open to every QA role via canReviewQa.
    const canApproveExecutionFile = (() => {
      if (!role) return false;
      if (UNRESTRICTED_ROLES.includes(role)) return true;
      if (!row) return FILE_APPROVAL_FALLBACK.includes(role);
      return row.department === "qa" && (row.tierRank ?? 1) >= LEAD_TIER;
    })();
    return {
      canReviewQa: canReview("qa"),
      canReviewFa: canReview("fa"),
      canApproveExecutionFile,
      canReview,
    };
  }, [dbRoles, role]);
}
