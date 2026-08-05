import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// test_cases has no milestoneId column of its own — it's scoped to a
// milestone indirectly via requirementId. Re-syncing the same Redmine ticket
// into a different milestone creates a second requirement row for that
// ticket (a requirement can only ever belong to one milestone), so matching
// strictly on "this milestone's requirement ids" misses test cases still
// attached to the ticket's original requirement row under an older
// milestone. We widen the match to any requirement (in any milestone)
// sharing a redmineTicketId with one of this milestone's own requirements.
export function useMilestoneTestCases(milestoneId: number, projectId?: number) {
  const { token } = useAuth();

  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements", "milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/requirements?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  const { data: allProjectRequirements = [] } = useQuery({
    queryKey: ["requirements", "project", projectId],
    queryFn: async () => {
      const res = await api(`/requirements?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });

  const { data: projectTestCases = [], isLoading, refetch } = useQuery({
    queryKey: ["test-cases", "project", projectId],
    queryFn: async () => {
      const res = await api(`/test-cases?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });

  const requirementIds = useMemo(() => {
    const ticketIds = new Set(
      requirements.map((r: any) => r.redmineTicketId).filter(Boolean),
    );
    const ids = new Set<number>(requirements.map((r: any) => r.id));
    for (const r of allProjectRequirements as any[]) {
      if (r.redmineTicketId && ticketIds.has(r.redmineTicketId)) ids.add(r.id);
    }
    return ids;
  }, [requirements, allProjectRequirements]);

  const testCases = useMemo(
    () => projectTestCases.filter((tc: any) => tc.requirementId != null && requirementIds.has(tc.requirementId)),
    [projectTestCases, requirementIds],
  );

  return { requirements, testCases, isLoading, refetch };
}
