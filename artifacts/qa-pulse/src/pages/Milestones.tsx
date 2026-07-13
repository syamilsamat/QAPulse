import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Flag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";

interface Milestone {
  id: number;
  projectId: number;
  name: string;
  type: string;
  status: string;
  targetDate: string | null;
  reqTargetDate: string | null;
  devTargetDate: string | null;
  qaTargetDate: string | null;
  lessonsLearned: string | null;
  closedBy: number | null;
  createdAt: string;
  updatedAt: string;
  requirementCount?: number;
  approvedCount?: number;
  executionFileCount?: number;
  uatFileCount?: number;
}

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

const TYPE_OPTIONS = [
  { value: "cr", label: "Change Request" },
  { value: "sprint", label: "Sprint" },
  { value: "phase", label: "Phase" },
  { value: "release", label: "Release" },
];

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    case "active":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> Active</Badge>;
    case "cancelled":
      return <Badge className="gap-1 bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3" /> Cancelled</Badge>;
    default:
      return <Badge variant="outline">Planned</Badge>;
  }
}

export default function Milestones() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterProject, setFilterProject] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState({ name: "", type: "cr", status: "planned", targetDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", lessonsLearned: "" });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: milestones = [], isLoading } = useQuery<Milestone[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      if (filterProject === "all" || !filterProject) return [];
      const res = await api(`/milestones?projectId=${filterProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const canWrite = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "cto"].includes(user?.role ?? "");

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "cr", status: "planned", targetDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", lessonsLearned: "" });
    setDialogOpen(true);
  };

  const openEdit = (m: Milestone) => {
    setEditing(m);
    setForm({
      name: m.name,
      type: m.type,
      status: m.status,
      targetDate: m.targetDate ? m.targetDate.slice(0, 10) : "",
      reqTargetDate: m.reqTargetDate ? m.reqTargetDate.slice(0, 10) : "",
      devTargetDate: m.devTargetDate ? m.devTargetDate.slice(0, 10) : "",
      qaTargetDate: m.qaTargetDate ? m.qaTargetDate.slice(0, 10) : "",
      lessonsLearned: m.lessonsLearned ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    if (!filterProject || filterProject === "all") { toast({ variant: "destructive", title: "Select a project first" }); return; }
    setSaving(true);
    try {
      const body = {
        projectId: Number(filterProject),
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        targetDate: form.targetDate || null,
        reqTargetDate: form.reqTargetDate || null,
        devTargetDate: form.devTargetDate || null,
        qaTargetDate: form.qaTargetDate || null,
        lessonsLearned: form.lessonsLearned.trim() || null,
      };
      const res = editing
        ? await api(`/milestones/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) })
        : await api("/milestones", token, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      toast({ title: editing ? "Milestone updated" : "Milestone created" });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["milestones", filterProject] });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Failed to save milestone" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api(`/milestones/${id}`, token, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Milestone deleted" });
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["milestones", filterProject] });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete milestone" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Milestones</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage project milestones, CRs, and sprints</p>
        </div>
        {canWrite && filterProject !== "all" && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Milestone
          </Button>
        )}
      </div>

      {/* Project filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchableSelect
          value={filterProject}
          onValueChange={setFilterProject}
          options={[{ value: "all", label: "Select a project…" }, ...projects.map(p => ({ value: String(p.id), label: p.name }))]}
          placeholder="Select project"
          searchPlaceholder="Search projects…"
          className="w-64"
        />
      </div>

      {filterProject === "all" && (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Select a project to view its milestones.</p>
        </div>
      )}

      {filterProject !== "all" && isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading milestones…
        </div>
      )}

      {filterProject !== "all" && !isLoading && milestones.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No milestones yet for this project.</p>
          {canWrite && (
            <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Create first milestone
            </Button>
          )}
        </div>
      )}

      {milestones.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {milestones.map((m) => (
            <Card key={m.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">{m.name}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {TYPE_OPTIONS.find(t => t.value === m.type)?.label ?? m.type}
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {m.targetDate && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5" />
                    <span>Target: {format(new Date(m.targetDate), "dd MMM yyyy")}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/50 p-2 text-center">
                    <p className="text-lg font-bold">{m.requirementCount ?? 0}</p>
                    <p className="text-muted-foreground">Requirements</p>
                  </div>
                  <div className="rounded bg-muted/50 p-2 text-center">
                    <p className="text-lg font-bold text-green-600">{m.approvedCount ?? 0}</p>
                    <p className="text-muted-foreground">Approved</p>
                  </div>
                </div>
                {canWrite && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openEdit(m)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Milestone" : "New Milestone"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. CR015 — AI Test Generation"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Target Date</Label>
              <Input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Phase Target Dates (optional)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Requirements by</Label>
                  <Input type="date" value={form.reqTargetDate} onChange={(e) => setForm({ ...form, reqTargetDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dev done by</Label>
                  <Input type="date" value={form.devTargetDate} onChange={(e) => setForm({ ...form, devTargetDate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">QA done by</Label>
                  <Input type="date" value={form.qaTargetDate} onChange={(e) => setForm({ ...form, qaTargetDate: e.target.value })} />
                </div>
              </div>
            </div>
            {form.status === "completed" && (
              <div className="space-y-1.5">
                <Label>Lessons Learned</Label>
                <Textarea
                  placeholder="What went well, what to improve next time…"
                  value={form.lessonsLearned}
                  onChange={(e) => setForm({ ...form, lessonsLearned: e.target.value })}
                  rows={4}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Milestone?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete this milestone. Requirements and execution files will keep their milestone_id reference but the milestone will no longer exist.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
