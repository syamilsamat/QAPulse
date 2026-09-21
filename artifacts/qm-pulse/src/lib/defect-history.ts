import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "./api";
export interface HistoryEntry {
  id: number; author: string; createdAt: string; private: boolean; notes: string;
  changes: Array<{ kind: "field" | "attachment"; field: string; before: string | null; after: string | null }>;
}
export interface HistoryData {
  entries: HistoryEntry[]; unreadIds: number[]; syncedAt: string; snapshotId: string;
  issueUpdatedAt: string; issueUrl: string; stale: boolean; error?: string;
}
export class HistoryRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function historyRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers,
  } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new HistoryRequestError(res.status, data?.error ?? "Could not load Redmine history. Please try again.");
  return data;
}
export function useDefectHistorySummaries(defects: Array<{ id: number; redmineId: string | null }>, userId: number | undefined, token: string | null) {
  const ids = defects.filter(d => d.redmineId).map(d => d.id).sort((a, b) => a - b);
  return useQuery({
    queryKey: ["defect-history-summaries", userId, ids],
    enabled: !!token && !!userId && ids.length > 0,
    staleTime: 60_000, gcTime: 0, retry: false,
    queryFn: async ({ signal }) => {
      const summaries: Record<number, { hasUpdates: boolean; checkedAt: string }> = {};
      // Bounded requests avoid exceeding Redmine's maximum issue-list page size.
      for (let i = 0; i < ids.length; i += 90) {
        const data = await historyRequest<{ items: Array<{ defectId: number; hasUpdates: boolean; checkedAt: string }> }>("/defects/history/summaries", token!, {
          method: "POST", body: JSON.stringify({ ids: ids.slice(i, i + 90) }), signal,
        });
        for (const item of data.items) summaries[item.defectId] = item;
      }
      return summaries;
    },
  });
}
