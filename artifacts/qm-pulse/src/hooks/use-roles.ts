import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";

export interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  department: string | null;
  tierRank: number | null;
  isSystem?: boolean;
  userCount?: number;
}

/**
 * The one shared GET /roles query. Every caller used to build its own
 * ["roles"] query that turned a failed request into [] — and because they
 * share the cache key, a single early 401 (fired before the token was ready)
 * left every consumer with an empty list for the whole 5 minute stale window.
 * This waits for the token and throws on a non-OK response, so a failure is
 * retried instead of cached as "no roles".
 */
export function useRoles(options: { enabled?: boolean } = {}) {
  const { token } = useAuth();

  return useQuery<RoleRow[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load roles (${res.status})`);
      return res.json();
    },
    enabled: !!token && (options.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}
