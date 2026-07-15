import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert, Plus, Pencil, Trash2 } from "lucide-react";

// CR033p2 — Risk Register, extracted from PmDashboard.tsx by CR040 so both the
// standalone Risk Register page and PM Dashboard's link-out card can consume
// the identical UI without it drifting apart.

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function apiWrite(path: string, token: string | null, opts: RequestInit) {
  return fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export type RiskLevel = "low" | "medium" | "high";
export type RiskStatus = "open" | "mitigating" | "closed" | "realized";
export type ScoreBand = "low" | "medium" | "high" | "critical";

export interface Risk {
  id: number;
  projectId: number;
  milestoneId: number | null;
  title: string;
  description: string | null;
  category: string;
  probability: RiskLevel;
  impact: RiskLevel;
  status: RiskStatus;
  mitigationPlan: string | null;
  ownerId: number | null;
  raisedBy: number | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const RISK_CATEGORY_LABELS: Record<string, string> = {
  schedule: "Schedule",
  scope: "Scope",
  resource: "Resource",
  technical: "Technical",
  external: "External",
  other: "Other",
};

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = { low: "Low", medium: "Medium", high: "High" };

const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Open",
  mitigating: "Mitigating",
  closed: "Closed",
  realized: "Realized",
};

const RISK_STATUS_CLASS: Record<RiskStatus, string> = {
  open: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900",
  mitigating: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900",
  closed: "bg-muted text-muted-foreground border-transparent",
  realized: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900",
};

// Classic 3x3 PMBOK probability x impact heat map.
export const SCORE_MATRIX: Record<RiskLevel, Record<RiskLevel, ScoreBand>> = {
  low: { low: "low", medium: "low", high: "medium" },
  medium: { low: "low", medium: "medium", high: "high" },
  high: { low: "medium", medium: "high", high: "critical" },
};

const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  low: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-400 dark:border-green-900",
  medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900",
  high: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-400 dark:border-orange-900",
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900",
};

const SCORE_BAND_LABEL: Record<ScoreBand, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export function riskScoreBand(probability: RiskLevel, impact: RiskLevel): ScoreBand {
  return SCORE_MATRIX[probability][impact];
}

// Mirrors the server rule in risks.ts: tierRank >= 2 (lead or above) may write.
export const CAN_WRITE_ROLES = ["admin", "qa_lead", "fa_lead", "dev_lead", "pm_lead", "qa_manager", "hod_qa", "hod_fa", "hod_dev", "hod_pm", "cto"];

const EMPTY_RISK_FORM = {
  title: "", description: "", category: "other", probability: "medium" as RiskLevel,
  impact: "medium" as RiskLevel, status: "open" as RiskStatus, mitigationPlan: "", milestoneId: "none",
};

function RiskDialog({
  open, onOpenChange, editing, projectId, milestones, token, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Risk | null;
  projectId: number;
  milestones: { id: number; name: string }[];
  token: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(() =>
    editing
      ? {
          title: editing.title, description: editing.description ?? "", category: editing.category,
          probability: editing.probability, impact: editing.impact, status: editing.status,
          mitigationPlan: editing.mitigationPlan ?? "", milestoneId: editing.milestoneId ? String(editing.milestoneId) : "none",
        }
      : EMPTY_RISK_FORM,
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ variant: "destructive", title: "Title is required" }); return; }
    setSaving(true);
    try {
      const body = {
        projectId,
        milestoneId: form.milestoneId === "none" ? null : Number(form.milestoneId),
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        probability: form.probability,
        impact: form.impact,
        status: form.status,
        mitigationPlan: form.mitigationPlan.trim() || null,
      };
      const res = editing
        ? await apiWrite(`/risks/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) })
        : await apiWrite("/risks", token, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      toast({ title: editing ? "Risk updated" : "Risk raised" });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Failed to save risk" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Risk" : "Raise a Risk"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Vendor API deprecation" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="What's the risk, and what triggers it?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RISK_CATEGORY_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Milestone tag</Label>
              <Select value={form.milestoneId} onValueChange={(v) => setForm({ ...form, milestoneId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General (project-wide)</SelectItem>
                  {milestones.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Probability</Label>
              <Select value={form.probability} onValueChange={(v) => setForm({ ...form, probability: v as RiskLevel })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high"] as const).map((v) => <SelectItem key={v} value={v}>{RISK_LEVEL_LABELS[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impact</Label>
              <Select value={form.impact} onValueChange={(v) => setForm({ ...form, impact: v as RiskLevel })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high"] as const).map((v) => <SelectItem key={v} value={v}>{RISK_LEVEL_LABELS[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RiskStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["open", "mitigating", "closed", "realized"] as const).map((v) => <SelectItem key={v} value={v}>{RISK_STATUS_LABELS[v]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Score:</span>
            <Badge variant="outline" className={`text-[10px] font-semibold ${SCORE_BAND_CLASS[riskScoreBand(form.probability, form.impact)]}`}>
              {SCORE_BAND_LABEL[riskScoreBand(form.probability, form.impact)]}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <Label>Mitigation plan</Label>
            <Textarea placeholder="What are we doing about it?" value={form.mitigationPlan} onChange={(e) => setForm({ ...form, mitigationPlan: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Raise Risk"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RisksCard({ projectId, token, milestones, canWrite }: {
  projectId: number;
  token: string | null;
  milestones: { id: number; name: string }[];
  canWrite: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Risk | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: risks = [], isLoading } = useQuery<Risk[]>({
    queryKey: ["risks", projectId],
    queryFn: async () => {
      const res = await api(`/risks?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
  });

  const milestoneName = (id: number | null) => id ? (milestones.find(m => m.id === id)?.name ?? `Milestone #${id}`) : "General";

  const sorted = [...risks].sort((a, b) => {
    const scoreRank: Record<ScoreBand, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    const openRank: Record<RiskStatus, number> = { open: 2, mitigating: 1, realized: 1, closed: 0 };
    const diff = openRank[b.status] - openRank[a.status];
    if (diff !== 0) return diff;
    return scoreRank[riskScoreBand(b.probability, b.impact)] - scoreRank[riskScoreBand(a.probability, a.impact)];
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["risks", projectId] });

  const handleDelete = async (id: number) => {
    try {
      const res = await apiWrite(`/risks/${id}`, token, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Risk deleted" });
      setDeleteId(null);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete risk" });
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <p className="text-sm font-medium">Risk Register</p>
            {risks.length > 0 && <Badge variant="outline" className="text-[10px]">{risks.length}</Badge>}
          </div>
          {canWrite && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-3 h-3" /> Raise Risk
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="h-16 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No risks logged for this project yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sorted.map((r) => {
              const band = riskScoreBand(r.probability, r.impact);
              return (
                <div key={r.id} className="flex items-start gap-2 text-sm py-1.5 border-t first:border-t-0">
                  <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 mt-0.5 ${SCORE_BAND_CLASS[band]}`}>{SCORE_BAND_LABEL[band]}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {RISK_CATEGORY_LABELS[r.category] ?? r.category} · P:{RISK_LEVEL_LABELS[r.probability]} I:{RISK_LEVEL_LABELS[r.impact]} · {milestoneName(r.milestoneId)}
                    </p>
                    {r.mitigationPlan && <p className="text-xs text-muted-foreground italic mt-0.5 truncate">Mitigation: {r.mitigationPlan}</p>}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${RISK_STATUS_CLASS[r.status]}`}>{RISK_STATUS_LABELS[r.status]}</Badge>
                  {canWrite && (
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => { setEditing(r); setDialogOpen(true); }} className="text-muted-foreground hover:text-foreground p-0.5">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button type="button" onClick={() => setDeleteId(r.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <RiskDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          projectId={projectId}
          milestones={milestones}
          token={token}
          onSaved={refresh}
        />
      )}

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete Risk?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will permanently remove this risk from the register.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
