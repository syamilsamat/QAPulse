import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getApiUrl, authHeaders } from "@/lib/api";

type ReviewLogEntry = {
  id: number;
  action: "submit" | "approve" | "reject" | "accept" | "return" | "resubmit";
  scope: "file" | "row";
  rowLabel: string | null;
  actorName: string | null;
  remark: string | null;
  createdAt: string;
};

const ACTION_LABEL: Record<ReviewLogEntry["action"], { text: string; cls: string }> = {
  submit: { text: "Submitted", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  approve: { text: "Approved", cls: "bg-green-100 text-green-700 border-green-200" },
  accept: { text: "Accepted", cls: "bg-green-100 text-green-700 border-green-200" },
  reject: { text: "Returned", cls: "bg-red-100 text-red-700 border-red-200" },
  return: { text: "Returned", cls: "bg-red-100 text-red-700 border-red-200" },
  resubmit: { text: "Resubmitted", cls: "bg-blue-100 text-blue-700 border-blue-200" },
};

// Newest-first list of every review decision on an execution file with the
// reviewer's remark. Renders nothing until there is at least one entry.
// `refreshKey` lets the parent force a reload after it performs an action.
export function ReviewHistory({ fileId, refreshKey }: { fileId: number | null | undefined; refreshKey?: unknown }) {
  const [open, setOpen] = useState(false);
  const { data: entries = [] } = useQuery<ReviewLogEntry[]>({
    queryKey: ["execution-review-log", fileId, refreshKey],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/execution-files/${fileId}/review-log`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
    enabled: !!fileId,
  });

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left hover:bg-muted/50 rounded-lg"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <History className="w-4 h-4 text-muted-foreground" />
        Review history
        <span className="text-xs text-muted-foreground font-normal">({entries.length})</span>
      </button>
      {open && (
        <ul className="divide-y border-t max-h-72 overflow-y-auto">
          {entries.map((e) => {
            const a = ACTION_LABEL[e.action] ?? { text: e.action, cls: "" };
            return (
              <li key={e.id} className="px-3 py-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className={`text-[10px] ${a.cls}`}>{a.text}</Badge>
                  {e.scope === "row" && e.rowLabel && (
                    <span className="font-mono text-muted-foreground">{e.rowLabel}</span>
                  )}
                  <span className="text-muted-foreground">
                    {e.actorName ?? "Unknown"} · {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
                {e.remark && <p className="text-sm whitespace-pre-wrap">{e.remark}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
