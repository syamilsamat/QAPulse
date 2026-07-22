import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useHighlightRow, highlightRowId } from "@/hooks/use-highlight";
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
  Users,
  X,
  FileDown,
  Download,
  Database,
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
  priority: string | null;
  targetDate: string | null;
  startDate: string | null;
  reqTargetDate: string | null;
  devTargetDate: string | null;
  qaTargetDate: string | null;
  uatTargetDate: string | null;
  goLiveDate: string | null;
  environment: string | null;
  lessonsLearned: string | null;
  lessonsLearnedType: string | null;
  closedBy: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  requirementCount?: number;
  approvedCount?: number;
  executionFileCount?: number;
  uatFileCount?: number;
  dataPrepFileCount?: number;
}

interface DataPrepFile {
  id: number;
  projectId: number;
  milestoneId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
}

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// CR070 — prefilled when a milestone is switched to "Data Prep" so QA knows
// exactly what to hand over, without the PM having to type it from scratch.
const DATA_PREP_TEMPLATE = `Data source / system:
Fields & format required:
Number of records needed:
Target environment:
Special conditions (edge cases, boundary values):
Deadline for handover to QA:`;

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
  // CR069 — work with no requirement/dev/UAT phase of its own (e.g. QA
  // data preparation) — the PM Dashboard shows its progress from task
  // completion instead of the requirement-driven phase breakdown.
  { value: "data_prep", label: "Data Prep" },
];

const ENVIRONMENT_OPTIONS = ["ENV1", "ENV2", "ENV3", "ENV4", "ENV5", "ENV6"];

// Matches the "Lessons Learnt Type" dropdown in Bestinet's export template exactly.
const LESSON_TYPE_OPTIONS = [
  { value: "what_went_wrong", label: "What went wrong" },
  { value: "what_went_right", label: "What went right" },
  { value: "best_practice", label: "Best Practice" },
];

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "verified", label: "Verified" },
  { value: "uat", label: "UAT" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  switch (priority) {
    case "Critical":
      return <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">Critical</Badge>;
    case "High":
      return <Badge className="gap-1 bg-orange-100 text-orange-700 border-orange-200">High</Badge>;
    case "Medium":
      return <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">Medium</Badge>;
    default:
      return <Badge variant="outline">Low</Badge>;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    case "active":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> Active</Badge>;
    case "verified":
      return <Badge className="gap-1 bg-teal-100 text-teal-700 border-teal-200"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>;
    case "uat":
      return <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200"><Clock className="w-3 h-3" /> UAT</Badge>;
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
  useHighlightRow(); // CR051 — focus a milestone card from a ?highlight= deep-link
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState({ name: "", type: "cr", status: "planned", priority: "none", targetDate: "", startDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", uatTargetDate: "", goLiveDate: "", environment: "none", lessonsLearned: "", lessonsLearnedType: "none", description: "" });
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

  const canWrite = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"].includes(user?.role ?? "");

  const [exportingLessons, setExportingLessons] = useState(false);
  const handleExportLessonsLearned = async () => {
    if (!filterProject || filterProject === "all") return;
    setExportingLessons(true);
    try {
      const res = await api(`/milestones/lessons-learned/export?projectId=${filterProject}`, token);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? "LessonsLearnt.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "Failed to export lessons learned" });
    } finally {
      setExportingLessons(false);
    }
  };

  // CR054p2 — milestone staffing (edit dialog only; the milestone must exist)
  const [assigneePick, setAssigneePick] = useState("");
  const { data: assignees = [] } = useQuery<{ id: number; userId: number; name: string; role: string }[]>({
    queryKey: ["milestone-assignees", editing?.id],
    queryFn: async () => {
      const res = await api(`/milestones/${editing!.id}/assignees`, token);
      return res.ok ? res.json() : [];
    },
    enabled: dialogOpen && !!editing,
  });
  const { data: assignableUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["milestone-assignable", editing?.id],
    queryFn: async () => {
      const res = await api(`/milestones/${editing!.id}/assignable-users`, token);
      return res.ok ? res.json() : [];
    },
    enabled: dialogOpen && !!editing && canWrite,
  });
  const refreshAssignees = () => queryClient.invalidateQueries({ queryKey: ["milestone-assignees", editing?.id] });
  const addAssignee = async (userId: string) => {
    setAssigneePick("");
    if (!editing) return;
    const res = await api(`/milestones/${editing.id}/assignees`, token, { method: "POST", body: JSON.stringify({ userId: Number(userId) }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: d.error ?? "Failed to assign member" });
      return;
    }
    refreshAssignees();
  };
  const removeAssignee = async (userId: number) => {
    if (!editing) return;
    const res = await api(`/milestones/${editing.id}/assignees/${userId}`, token, { method: "DELETE" });
    if (res.ok) refreshAssignees();
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "cr", status: "planned", priority: "none", targetDate: "", startDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", uatTargetDate: "", goLiveDate: "", environment: "none", lessonsLearned: "", lessonsLearnedType: "none", description: "" });
    setDialogOpen(true);
  };

  const openEdit = (m: Milestone) => {
    setEditing(m);
    setForm({
      name: m.name,
      type: m.type,
      status: m.status,
      priority: m.priority ?? "none",
      targetDate: m.targetDate ? m.targetDate.slice(0, 10) : "",
      startDate: m.startDate ? m.startDate.slice(0, 10) : "",
      reqTargetDate: m.reqTargetDate ? m.reqTargetDate.slice(0, 10) : "",
      devTargetDate: m.devTargetDate ? m.devTargetDate.slice(0, 10) : "",
      qaTargetDate: m.qaTargetDate ? m.qaTargetDate.slice(0, 10) : "",
      uatTargetDate: m.uatTargetDate ? m.uatTargetDate.slice(0, 10) : "",
      goLiveDate: m.goLiveDate ? m.goLiveDate.slice(0, 10) : "",
      environment: m.environment ?? "none",
      lessonsLearned: m.lessonsLearned ?? "",
      lessonsLearnedType: m.lessonsLearnedType ?? "none",
      description: m.description ?? "",
    });
    setDialogOpen(true);
  };

  // CR070 — switching the type dropdown to Data Prep prefills the checklist
  // template (only if the PM hasn't already typed a description themselves).
  const handleTypeChange = (v: string) => {
    setForm((f) => ({
      ...f,
      type: v,
      description: v === "data_prep" && !f.description.trim() ? DATA_PREP_TEMPLATE : f.description,
    }));
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
        priority: form.priority === "none" ? null : form.priority,
        targetDate: form.targetDate || null,
        startDate: form.startDate || null,
        reqTargetDate: form.reqTargetDate || null,
        devTargetDate: form.devTargetDate || null,
        qaTargetDate: form.qaTargetDate || null,
        uatTargetDate: form.uatTargetDate || null,
        goLiveDate: form.goLiveDate || null,
        environment: form.environment === "none" ? null : form.environment,
        lessonsLearned: form.lessonsLearned.trim() || null,
        lessonsLearnedType: form.lessonsLearnedType === "none" ? null : form.lessonsLearnedType,
        description: form.description.trim() || null,
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
        <div className="flex gap-2">
          {filterProject !== "all" && (
            <Button variant="outline" onClick={handleExportLessonsLearned} disabled={exportingLessons} className="gap-2">
              <FileDown className="w-4 h-4" /> {exportingLessons ? "Exporting…" : "Export Lessons Learnt"}
            </Button>
          )}
          {canWrite && filterProject !== "all" && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" /> New Milestone
            </Button>
          )}
        </div>
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
            <Card key={m.id} id={highlightRowId(m.id)} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">{m.name}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {TYPE_OPTIONS.find(t => t.value === m.type)?.label ?? m.type}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={m.status} />
                    <PriorityBadge priority={m.priority} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {(m.targetDate || m.environment) && (
                  <div className="flex items-center justify-between gap-2">
                    {m.targetDate ? (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>Target: {format(new Date(m.targetDate), "dd MMM yyyy")}</span>
                      </div>
                    ) : <span />}
                    {m.environment && (
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{m.environment}</Badge>
                    )}
                  </div>
                )}
                {m.type === "data_prep" ? (
                  <div className="rounded bg-muted/50 p-2 text-center text-xs flex items-center justify-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-bold">{m.dataPrepFileCount ?? 0}</span>
                    <span className="text-muted-foreground">file{m.dataPrepFileCount === 1 ? "" : "s"} uploaded</span>
                  </div>
                ) : (
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
                )}
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
                <Select value={form.type} onValueChange={handleTypeChange}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {ENVIRONMENT_OPTIONS.map((env) => (
                      <SelectItem key={env} value={env}>{env}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type !== "data_prep" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Phase Target Dates (optional)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                  </div>
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
                  <div className="space-y-1">
                    <Label className="text-xs">UAT done by</Label>
                    <Input type="date" value={form.uatTargetDate} onChange={(e) => setForm({ ...form, uatTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Go-Live</Label>
                    <Input type="date" value={form.goLiveDate} onChange={(e) => setForm({ ...form, goLiveDate: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
            {form.type === "data_prep" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> What QA needs to prepare
                </Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={6}
                  className="font-mono text-xs"
                />
              </div>
            )}
            {editing && form.type === "data_prep" && <DataPrepFilesSection milestone={editing} token={token} canWrite={canWrite} userId={user?.id} />}
            {editing && canWrite && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {form.type === "data_prep" ? "QA assigned to prepare this data" : "Team"}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {assignees.map((a) => (
                    <Badge key={a.userId} variant="outline" className="gap-1 pr-1">
                      {a.name}
                      <button type="button" onClick={() => removeAssignee(a.userId)} className="hover:text-destructive" aria-label={`Remove ${a.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {assignees.length === 0 && <span className="text-xs text-muted-foreground">No one assigned yet.</span>}
                </div>
                <Select value={assigneePick} onValueChange={addAssignee}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Add project member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.filter((u) => !assignees.some((a) => a.userId === u.id)).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name} · {u.role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.status === "completed" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label>Lessons Learned</Label>
                  <Select value={form.lessonsLearnedType} onValueChange={(v) => setForm({ ...form, lessonsLearnedType: v })}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not classified</SelectItem>
                      {LESSON_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

// CR070 — data-prep file handoff: QA uploads the prepared dataset, PM
// downloads it to email the client. Lives inside the edit dialog since it
// needs the milestone to already exist (same constraint as the Team section).
function DataPrepFilesSection({ milestone, token, canWrite, userId }: { milestone: Milestone; token: string | null; canWrite: boolean; userId: number | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery<DataPrepFile[]>({
    queryKey: ["data-prep-files", milestone.id],
    queryFn: async () => {
      const res = await api(`/data-prep-files?milestoneId=${milestone.id}`, token);
      return res.ok ? res.json() : [];
    },
  });

  const handlePick = async (file: File | null) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast({ variant: "destructive", title: "File too large (max 15 MB)" }); return; }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const res = await api("/data-prep-files", token, {
        method: "POST",
        body: JSON.stringify({ milestoneId: milestone.id, fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64 }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Upload failed"); }
      toast({ title: "File uploaded" });
      queryClient.invalidateQueries({ queryKey: ["data-prep-files", milestone.id] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (f: DataPrepFile) => {
    const res = await api(`/data-prep-files/${f.id}/download`, token);
    if (!res.ok) { toast({ variant: "destructive", title: "Download failed" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (f: DataPrepFile) => {
    const res = await api(`/data-prep-files/${f.id}`, token, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast({ variant: "destructive", title: d.error ?? "Delete failed" }); return; }
    toast({ title: "File deleted" });
    queryClient.invalidateQueries({ queryKey: ["data-prep-files", milestone.id] });
    queryClient.invalidateQueries({ queryKey: ["milestones"] });
  };

  const canDelete = (f: DataPrepFile) => canWrite && (f.uploadedBy === userId || f.uploadedBy == null);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5" /> Data File
      </Label>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No file uploaded yet — QA uploads the prepared dataset here.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.fileName}</p>
                <p className="text-muted-foreground">{fmtSize(f.sizeBytes)} · {f.uploaderName ?? "—"} · {format(new Date(f.createdAt), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => handleDownload(f)}>
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
                {canDelete(f) && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(f)} aria-label="Delete file">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="pt-1">
          <Input ref={fileInputRef} type="file" disabled={uploading} onChange={(e) => handlePick(e.target.files?.[0] ?? null)} className="h-8 text-xs file:text-xs" />
          {uploading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</p>}
        </div>
      )}
    </div>
  );
}
