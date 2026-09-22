import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wrench, Loader2, ImageIcon } from "lucide-react";

// CR079 — admin triage view for bugs/ideas/questions reported about QM Pulse
// itself (via the ReportIssueTrigger widget on every page). Distinct from
// /defects, which tracks bugs in the client projects QM Pulse tests.

interface PlatformIssue {
  id: number;
  title: string;
  description: string | null;
  type: "bug" | "idea" | "question";
  severity: "blocking" | "major" | "minor";
  status: "open" | "in_progress" | "fixed" | "wont_fix" | "duplicate";
  reporterId: number | null;
  reporterName: string | null;
  pagePath: string | null;
  browserInfo: string | null;
  screenshotUrl: string | null;
  promotedCr: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<PlatformIssue["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "fixed", label: "Fixed" },
  { value: "wont_fix", label: "Won't fix" },
  { value: "duplicate", label: "Duplicate" },
];

const SEVERITY_STYLES: Record<PlatformIssue["severity"], string> = {
  blocking: "border-l-4 border-l-red-500",
  major: "border-l-4 border-l-amber-500",
  minor: "border-l-4 border-l-slate-300",
};

const SEVERITY_TEXT: Record<PlatformIssue["severity"], string> = {
  blocking: "text-red-600",
  major: "text-amber-600",
  minor: "text-muted-foreground",
};

const TYPE_LABELS: Record<PlatformIssue["type"], string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
};

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export default function PlatformIssues() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const { data: issues = [], isLoading } = useQuery<PlatformIssue[]>({
    queryKey: ["platform-issues"],
    queryFn: async () => {
      const res = await api("/platform-issues", token);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = statusFilter === "all" ? issues : issues.filter((i) => i.status === statusFilter);
  const counts = STATUS_FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.value] = f.value === "all" ? issues.length : issues.filter((i) => i.status === f.value).length;
    return acc;
  }, {});

  const changeStatus = async (issue: PlatformIssue, status: PlatformIssue["status"]) => {
    setUpdatingId(issue.id);
    try {
      const res = await fetch(`${getApiUrl()}/platform-issues/${issue.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
      await qc.invalidateQueries({ queryKey: ["platform-issues"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't update status", description: err.message });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-5 h-5 text-slate-500" />
          Platform Issues
        </h1>
        <p className="text-sm text-muted-foreground">
          Bugs, ideas, and questions reported about QM Pulse itself — filed via the report button on any page.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={statusFilter === f.value ? "default" : "outline"}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label} · {counts[f.value] ?? 0}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          {statusFilter === "all" ? "No platform issues reported yet." : `No ${STATUS_LABELS[statusFilter as PlatformIssue["status"]]?.toLowerCase() ?? statusFilter} issues.`}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => (
            <div
              key={issue.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-card p-3 pl-4 ${SEVERITY_STYLES[issue.severity]}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{issue.title}</span>
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[issue.type]}</Badge>
                  <span className={`text-xs font-medium ${SEVERITY_TEXT[issue.severity]}`}>
                    {issue.severity[0].toUpperCase() + issue.severity.slice(1)}
                  </span>
                  {issue.screenshotUrl && (
                    <a href={issue.screenshotUrl} target="_blank" rel="noreferrer" title="View screenshot">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  )}
                </div>
                {issue.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{issue.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {issue.reporterName ?? "Unknown reporter"} · {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}
                  {issue.pagePath ? ` · ${issue.pagePath}` : ""}
                </p>
              </div>

              <Select
                value={issue.status}
                onValueChange={(v) => changeStatus(issue, v as PlatformIssue["status"])}
                disabled={updatingId === issue.id}
              >
                <SelectTrigger className="w-full sm:w-40 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
