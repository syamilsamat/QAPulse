import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Users, X, Loader2 } from "lucide-react";
import { DataPrepFilesSection } from "@/components/DataPrepFilesSection";

function api(path: string, token: string | null, opts?: RequestInit) {
  return fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

const DATA_PREP_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// CR070 follow-up — the QA Pipeline's data-prep branch: assign QA, upload the
// dataset, and move status through to Completed, all on one panel since the
// flow has no requirement/dev/UAT phases of its own to spread across steps.
export function StepDataPrepWork({ milestoneId, locked }: { milestoneId: number; locked: boolean }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assigneePick, setAssigneePick] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const canWrite = !locked && ["admin", "qa_member", "qa_lead", "qa_manager", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"].includes(user?.role ?? "");

  const { data: milestone, isLoading: loadingMilestone } = useQuery<any>({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}`, token);
      return res.ok ? res.json() : null;
    },
    enabled: !!milestoneId,
  });

  const { data: assignees = [], isLoading: loadingAssignees } = useQuery<{ id: number; userId: number; name: string; role: string }[]>({
    queryKey: ["milestone-assignees", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}/assignees`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  const { data: assignableUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["milestone-assignable", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}/assignable-users?forTeamStaffing=1`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId && canWrite,
  });

  const refreshAssignees = () => queryClient.invalidateQueries({ queryKey: ["milestone-assignees", milestoneId] });

  const addAssignee = async (userId: string) => {
    setAssigneePick("");
    const res = await api(`/milestones/${milestoneId}/assignees`, token, { method: "POST", body: JSON.stringify({ userId: Number(userId) }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: d.error ?? "Failed to assign member" });
      return;
    }
    refreshAssignees();
  };

  const removeAssignee = async (userId: number) => {
    const res = await api(`/milestones/${milestoneId}/assignees/${userId}`, token, { method: "DELETE" });
    if (res.ok) refreshAssignees();
  };

  const handleStatusChange = async (status: string) => {
    setSavingStatus(true);
    try {
      const res = await api(`/milestones/${milestoneId}`, token, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to update status");
      }
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      toast({ title: "Status updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Failed to update status" });
    } finally {
      setSavingStatus(false);
    }
  };

  if (loadingMilestone) {
    return <div className="p-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>;
  }

  const fileCount = milestone?.dataPrepFileCount ?? 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 text-left">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> QA assigned to prepare this data
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {loadingAssignees ? (
            <span className="text-xs text-muted-foreground">Loading…</span>
          ) : assignees.length === 0 ? (
            <span className="text-xs text-muted-foreground">No one assigned yet.</span>
          ) : (
            assignees.map((a) => (
              <Badge key={a.userId} variant="outline" className="gap-1 pr-1">
                {a.name}
                {canWrite && (
                  <button type="button" onClick={() => removeAssignee(a.userId)} className="hover:text-destructive" aria-label={`Remove ${a.name}`}>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            ))
          )}
        </div>
        {canWrite && (
          <SearchableSelect
            value={assigneePick}
            onValueChange={addAssignee}
            options={assignableUsers
              .filter((u) => !assignees.some((a) => a.userId === u.id))
              .map((u) => ({ value: String(u.id), label: u.name, keywords: u.role }))}
            placeholder="Add QA member…"
            searchPlaceholder="Search by name or role…"
            emptyText="No matching members."
            className="h-8 text-xs"
          />
        )}
      </div>

      <DataPrepFilesSection milestoneId={milestoneId} token={token} canWrite={canWrite} userId={user?.id} />

      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={milestone?.status ?? "planned"} onValueChange={handleStatusChange} disabled={!canWrite || savingStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATA_PREP_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value} disabled={s.value === "completed" && fileCount === 0}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fileCount === 0 && (
          <p className="text-xs text-muted-foreground">Upload the prepared data file before this can be marked Completed.</p>
        )}
      </div>
    </div>
  );
}
