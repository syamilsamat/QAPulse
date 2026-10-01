import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, authHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Status = {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  running: boolean;
  keySource: "env" | "admin" | "none";
  allowedIntervals: number[];
};
type Run = {
  id: number;
  trigger: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  defectsRefreshed: number;
  defectsFailed: number;
  requirementsChecked: number;
  requirementsUpdated: number;
  requirementsFlagged: number;
  error: string | null;
};

const KEY_LABEL = {
  env: "REDMINE_API_KEY environment variable",
  admin: "an administrator's saved Redmine key",
  none: "none found",
} as const;

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") return <Badge variant="secondary" className="text-[10px]">OK</Badge>;
  if (status === "partial") return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">Partial</Badge>;
  if (status === "running") return <Badge variant="outline" className="text-[10px]">Running…</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
}

export default function RedmineSync() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);

  const { data: status } = useQuery<Status>({
    queryKey: ["redmine-sync-admin-status"],
    queryFn: () => send("/redmine-sync/status", "GET"),
    // Poll faster while a run is going so "Sync now" visibly finishes.
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 30_000),
  });
  const { data: runs = [] } = useQuery<Run[]>({
    queryKey: ["redmine-sync-runs"],
    queryFn: () => send("/redmine-sync/runs", "GET"),
    refetchInterval: status?.running ? 3_000 : 30_000,
  });

  if (user?.role !== "admin" && user?.role !== "cto") {
    return <p className="p-8 text-center text-muted-foreground">Only an administrator can manage Redmine sync.</p>;
  }
  if (!status) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["redmine-sync-admin-status"] });
    queryClient.invalidateQueries({ queryKey: ["redmine-sync-runs"] });
    queryClient.invalidateQueries({ queryKey: ["redmine-sync-status"] });
  };
  const saveSettings = async (body: Record<string, unknown>, ok: string) => {
    try {
      await send("/redmine-sync/settings", "PUT", body);
      toast({ title: ok });
      refresh();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };
  const syncNow = async () => {
    setStarting(true);
    try {
      await send("/redmine-sync/run", "POST");
      toast({ title: "Sync started" });
      setTimeout(refresh, 1_000);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setStarting(false);
    }
  };

  const failing = status.consecutiveFailures > 0 || status.keySource === "none";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <RefreshCw className="w-7 h-7 text-primary" /> Redmine Sync
        </h1>
        <p className="text-muted-foreground mt-1">
          QM Pulse checks Redmine on a schedule so defects and requirements don't go stale.
        </p>
      </div>

      {failing && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            {status.keySource === "none"
              ? "No Redmine service key was found, so scheduled sync cannot run. Set REDMINE_API_KEY, or save a Redmine API key on an administrator account."
              : `The last ${status.consecutiveFailures} run${status.consecutiveFailures > 1 ? "s" : ""} failed${status.lastError ? `: ${status.lastError}` : "."}`}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
          <CardDescription>Uses {KEY_LABEL[status.keySource]} to read Redmine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{status.enabled ? "Automatic sync is on" : "Automatic sync is off"}</p>
              <p className="text-xs text-muted-foreground">
                {status.lastSuccessAt
                  ? `Last successful sync ${formatDistanceToNow(new Date(status.lastSuccessAt), { addSuffix: true })}`
                  : "No successful sync yet"}
              </p>
            </div>
            <Switch checked={status.enabled} onCheckedChange={(enabled) => saveSettings({ enabled }, enabled ? "Sync turned on" : "Sync turned off")} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm" htmlFor="sync-interval">Check Redmine every</label>
            <select
              id="sync-interval"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={status.intervalMinutes}
              onChange={(e) => saveSettings({ intervalMinutes: Number(e.target.value) }, "Interval saved")}
            >
              {status.allowedIntervals.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
              ))}
            </select>
            <Button size="sm" onClick={syncNow} disabled={starting || status.running}>
              {(starting || status.running) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {status.running ? "Syncing…" : "Sync now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Defect status and assignee follow Redmine. Requirement title, description, priority and tracker follow Redmine too: drafts update
            automatically, while a requirement that is in review or approved is left alone and flagged on its page for someone to accept or dismiss.
            A full re-check of everything runs once a day.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Defects refreshed</TableHead>
                <TableHead>Requirements checked</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Flagged</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.trigger === "manual" ? "Manual" : r.mode === "full" ? "Full check" : "Scheduled"}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                    {r.error && <div className="text-xs text-muted-foreground mt-1 max-w-[260px]">{r.error}</div>}
                  </TableCell>
                  <TableCell>{r.defectsRefreshed}{r.defectsFailed > 0 ? ` (${r.defectsFailed} failed)` : ""}</TableCell>
                  <TableCell>{r.requirementsChecked}</TableCell>
                  <TableCell>{r.requirementsUpdated}</TableCell>
                  <TableCell>{r.requirementsFlagged}</TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground">No runs yet. The first one starts shortly after the server does.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
