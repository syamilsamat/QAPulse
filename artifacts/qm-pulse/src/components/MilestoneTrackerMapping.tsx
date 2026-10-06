import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, RefreshCw, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, authHeaders } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { type: string; label: string; trackerName: string | null };
type Tracker = { id: number; name: string };

async function call(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

// Maps each milestone type to the Redmine tracker new requirements get under
// it. A mapped milestone locks the tracker on the requirement form; an
// unmapped one leaves it a free choice.
export function MilestoneTrackerMapping() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "cto";
  const [syncing, setSyncing] = useState(false);
  const [savingType, setSavingType] = useState<string | null>(null);

  const { data: rows = [] } = useQuery<Row[]>({
    queryKey: ["milestone-type-trackers"],
    queryFn: () => call("/milestone-type-trackers"),
  });
  const { data: trackers = [] } = useQuery<Tracker[]>({
    queryKey: ["trackers"],
    queryFn: () => call("/trackers"),
  });

  const save = async (type: string, trackerName: string | null) => {
    setSavingType(type);
    try {
      await call(`/milestone-type-trackers/${type}`, "PUT", { trackerName });
      toast({ title: "Mapping saved" });
      queryClient.invalidateQueries({ queryKey: ["milestone-type-trackers"] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSavingType(null);
    }
  };

  const syncTrackers = async () => {
    setSyncing(true);
    try {
      const r = await call("/trackers/sync", "POST");
      toast({ title: `Synced ${r.synced} trackers from Redmine` });
      queryClient.invalidateQueries({ queryKey: ["trackers"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Link2 className="w-5 h-5 text-blue-600" />
          Milestone type to Redmine tracker
        </CardTitle>
        <CardDescription>
          When someone creates a requirement under a milestone of a given type, the tracker is set from this list and cannot be changed on the form.
          Leave a type on "Not mapped" to let people choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.type} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3">
              <div className="font-medium text-sm">{r.label}</div>
              <div className="flex items-center gap-2 sm:w-64">
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60"
                  value={r.trackerName ?? ""}
                  disabled={!canEdit || savingType === r.type}
                  aria-label={`Tracker for ${r.label} milestones`}
                  onChange={(e) => save(r.type, e.target.value || null)}
                >
                  <option value="">Not mapped</option>
                  {trackers.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {r.trackerName && !trackers.some((t) => t.name === r.trackerName) && (
                    <option value={r.trackerName}>{r.trackerName}</option>
                  )}
                </select>
                {savingType === r.type && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={syncTrackers} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh tracker list from Redmine
          </Button>
          <span className="text-xs text-muted-foreground">
            {trackers.length === 0 ? "No trackers yet. Refresh to load them from Redmine." : `${trackers.length} Redmine trackers available.`}
          </span>
        </div>
        {!canEdit && <p className="text-xs text-muted-foreground">Only an administrator can change this mapping.</p>}
      </CardContent>
    </Card>
  );
}
