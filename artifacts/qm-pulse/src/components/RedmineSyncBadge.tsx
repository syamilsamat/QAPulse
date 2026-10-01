import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl, authHeaders } from "@/lib/api";

type SyncStatus = {
  enabled: boolean;
  intervalMinutes: number;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  consecutiveFailures: number;
  running: boolean;
};

// "Auto-synced with Redmine · 4 min ago". Turns amber when the data is older
// than two intervals or the last runs failed, so a stale page is obvious
// instead of silently trusted.
export function RedmineSyncBadge({ className = "" }: { className?: string }) {
  const { data } = useQuery<SyncStatus | null>({
    queryKey: ["redmine-sync-status"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/redmine-sync/status`, { headers: authHeaders() });
      return res.ok ? res.json() : null;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!data) return null;

  if (!data.enabled) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <RefreshCw className="w-3 h-3" /> Auto-sync with Redmine is off
      </span>
    );
  }

  const last = data.lastSuccessAt ? new Date(data.lastSuccessAt) : null;
  const staleMs = data.intervalMinutes * 2 * 60_000;
  const stale = !last || Date.now() - last.getTime() > staleMs || data.consecutiveFailures > 0;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${stale ? "text-amber-600" : "text-muted-foreground"} ${className}`}>
      <RefreshCw className={`w-3 h-3 ${data.running ? "animate-spin" : ""}`} />
      {data.running
        ? "Syncing with Redmine…"
        : last
          ? `Synced with Redmine ${formatDistanceToNow(last, { addSuffix: true })}${data.consecutiveFailures > 0 ? " · last attempt failed" : ""}`
          : "Not synced with Redmine yet"}
    </span>
  );
}
