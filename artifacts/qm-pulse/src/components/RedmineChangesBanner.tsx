import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, authHeaders } from "@/lib/api";

type Change = {
  id: number;
  redmineTicketId: string;
  changes: Record<string, { from: string; to: string }>;
  detectedAt: string;
};

const FIELD_LABEL: Record<string, string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  tracker: "Tracker",
};

// Shown on a requirement that was edited in Redmine after it went into review
// or was approved. The sync never overwrites that text on its own; a person
// accepts the Redmine version or keeps the QM Pulse one.
export function RedmineChangesBanner({ requirementId, canResolve }: { requirementId: number; canResolve: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["redmine-changes", requirementId];

  const { data: pending = [] } = useQuery<Change[]>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/redmine-sync/changes?requirementId=${requirementId}`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
  });
  if (pending.length === 0) return null;

  const resolve = async (id: number, action: "accept" | "dismiss") => {
    const res = await fetch(`${getApiUrl()}/redmine-sync/changes/${id}/${action}`, { method: "POST", headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ variant: "destructive", title: body.error ?? "Could not update" }); return; }
    toast({ title: action === "accept" ? "Redmine changes applied" : "Redmine changes dismissed" });
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["requirement", String(requirementId)] });
    queryClient.invalidateQueries({ queryKey: ["requirement", requirementId] });
  };

  return (
    <div className="space-y-3">
      {pending.map((c) => (
        <div key={c.id} className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <GitCompareArrows className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Redmine #{c.redmineTicketId} differs from this requirement
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                QM Pulse has not applied it because this requirement is in review, approved, or was edited here more recently. Accept to take Redmine's version (linked test cases and tasks are flagged for re-review), or keep this one.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {Object.entries(c.changes).map(([field, ch]) => (
              <div key={field} className="rounded border bg-background p-2 text-xs space-y-1">
                <p className="font-medium">{FIELD_LABEL[field] ?? field}</p>
                <p className="text-muted-foreground whitespace-pre-wrap break-words"><span className="font-medium">Now:</span> {ch.from || "—"}</p>
                <p className="whitespace-pre-wrap break-words"><span className="font-medium">Redmine:</span> {ch.to || "—"}</p>
              </div>
            ))}
          </div>
          {canResolve ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => resolve(c.id, "accept")}>Accept Redmine's version</Button>
              <Button size="sm" variant="outline" onClick={() => resolve(c.id, "dismiss")}>Keep this version</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only the author, assignee or a lead can resolve this.</p>
          )}
        </div>
      ))}
    </div>
  );
}
