import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, ExternalLink, History, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { historyRequest, HistoryRequestError, type HistoryData, type HistoryEntry } from "@/lib/defect-history";

type Filter = "all" | "comments" | "changes" | "attachments";
function Event({ entry, isNew }: { entry: HistoryEntry; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entry.changes : entry.changes.slice(0, 1);
  return <article className="relative pl-11 pb-6 last:pb-0 before:absolute before:left-[15px] before:top-9 before:bottom-0 before:w-px before:bg-border last:before:hidden">
    <span aria-hidden="true" className="absolute left-0 top-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
      {entry.author.split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase()}
    </span>
    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium">{entry.author}</span>
      {isNew && <Badge variant="secondary" className="text-xs">New</Badge>}
      {entry.private && <span className="text-xs text-muted-foreground flex gap-1 items-center"><LockKeyhole className="w-3 h-3" />Private note</span>}
    </div>
    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
      <time dateTime={entry.createdAt} title={format(new Date(entry.createdAt), "dd MMM yyyy, HH:mm:ss xxx")}>{formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}</time>
      {" · "}Redmine update #{entry.id}
    </p>
    <div className="space-y-2">{visible.map((change, index) => <div key={index} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground min-w-28">{change.field}</span>
      {change.before !== null && <span className="text-muted-foreground whitespace-pre-wrap break-words max-w-full">{change.before}</span>}
      {change.before !== null && change.after !== null && <span aria-label="changed to">→</span>}
      {change.before === null && <span className="text-muted-foreground">{change.kind === "attachment" ? "Added" : "Set to"}</span>}
      {change.after === null ? <span>{change.kind === "attachment" ? "Removed" : "Cleared"}</span> : <span className="whitespace-pre-wrap break-words max-w-full">{change.after}</span>}
    </div>)}</div>
    {entry.changes.length > 1 && <Button variant="link" size="sm" className="h-auto p-0 text-xs mt-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      {expanded ? "Hide extra changes" : `Show ${entry.changes.length - 1} more change${entry.changes.length > 2 ? "s" : ""}`}
    </Button>}
    {entry.notes && <div className="rounded-md bg-muted/60 px-3 py-2.5 mt-3 text-sm whitespace-pre-wrap break-words">{entry.notes}</div>}
    {!entry.notes && !entry.changes.length && <p className="text-xs text-muted-foreground">Issue updated.</p>}
  </article>;
}

export function DefectHistory({ defectId, redmineId }: { defectId: number; redmineId: string | null }) {
  const { user, token } = useAuth();
  const client = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(20);
  const query = useQuery({
    queryKey: ["defect-history", user?.id, defectId, redmineId],
    enabled: !!token && !!redmineId, gcTime: 0, staleTime: 0,
    refetchOnMount: "always", refetchOnWindowFocus: false, retry: false,
    queryFn: ({ signal }) => historyRequest<HistoryData>(`/defects/${defectId}/history`, token!, { signal }),
  });
  const seen = useMutation({
    mutationFn: (snapshotId: string) => historyRequest(`/defects/${defectId}/history/seen`, token!, { method: "POST", body: JSON.stringify({ snapshotId }) }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["defect-history-summaries", user?.id] }); },
  });
  const snapshotId = query.data?.snapshotId;
  const stale = query.data?.stale;
  const markSeen = seen.mutate;
  useEffect(() => {
    if (snapshotId && !stale && !query.isError) markSeen(snapshotId);
  }, [snapshotId, stale, query.isError, markSeen]);

  if (!redmineId) return <p className="text-sm text-muted-foreground py-6">History becomes available after this defect is linked to Redmine.</p>;
  // Hide previous data on explicit denial. A transport failure may retain the
  // current user's already-loaded snapshot with a visible stale warning.
  const denied = query.error instanceof HistoryRequestError && [401, 403, 404, 409, 428].includes(query.error.status);
  const data = denied ? undefined : query.data;
  const error = query.error?.message ?? data?.error;
  const entries = data?.entries.filter(e => filter === "all" || (filter === "comments" ? !!e.notes.trim() : e.changes.some(c => c.kind === (filter === "attachments" ? "attachment" : "field")))) ?? [];
  const unread = new Set(data?.unreadIds ?? []);
  return <section aria-label="Redmine history" className="rounded-md border bg-background p-4 space-y-4">
    <div className="flex justify-between gap-3 items-center flex-wrap">
      <div className="flex items-center gap-2"><History className="w-4 h-4" /><h3 className="text-sm font-medium">History</h3>{data && <Badge variant="secondary">{data.entries.length}</Badge>}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {data && <span className="text-xs text-muted-foreground" title={format(new Date(data.syncedAt), "dd MMM yyyy, HH:mm:ss")}>Last synced {formatDistanceToNow(new Date(data.syncedAt), { addSuffix: true })}</span>}
        <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()} className="gap-1.5">
          {query.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh history
        </Button>
      </div>
    </div>
    {(error || data?.stale) && <div role="alert" className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm flex gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><div>{error ?? "Could not refresh history."}{data && <p className="mt-1">Showing the last synced version.</p>}</div>
    </div>}
    {query.isPending && <p role="status" className="text-sm text-muted-foreground py-4">Loading Redmine history…</p>}
    {data && <>
      <div className="flex flex-wrap gap-1" aria-label="History filters">
        {([["all", "All activity"], ["comments", "Comments"], ["changes", "Field changes"], ["attachments", "Attachments"]] as const).map(([value, label]) =>
          <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(20); }}>{label}</Button>)}
      </div>
      {seen.isError && <div className="text-xs text-muted-foreground">Could not save your viewed position. <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => snapshotId && seen.mutate(snapshotId)}>Retry</Button></div>}
      {!entries.length && <p className="text-sm text-muted-foreground py-6">{data.entries.length ? "No updates match this filter." : "No history updates in Redmine yet."}</p>}
      <div>{entries.slice(0, limit).map((entry, index) => <Fragment key={entry.id}>
        {index > 0 && unread.has(entries[index - 1].id) && !unread.has(entry.id) && <div className="ml-11 flex items-center gap-3 text-xs text-muted-foreground mb-4">Previously seen<span className="h-px flex-1 bg-border" /></div>}
        <Event entry={entry} isNew={unread.has(entry.id)} />
      </Fragment>)}</div>
      {entries.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit(n => n + 20)}>Show older updates ({entries.length - limit} remaining)</Button>}
      <div className="border-t pt-3 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground" aria-live="polite">{entries.length} update{entries.length === 1 ? "" : "s"} · Newest first · Read-only</span>
        <Button variant="outline" size="sm" asChild><a href={data.issueUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">Open in Redmine<ExternalLink className="h-3.5 w-3.5" /></a></Button>
      </div>
    </>}
  </section>;
}
