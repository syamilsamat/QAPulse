import { ProgressDialog } from "@/components/ProgressDialog";
import { Link, useSearch } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useHighlightRow, highlightRowId } from "@/hooks/use-highlight";
import { useRoleLabels } from "@/hooks/use-role-labels";
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
  Search,
  Users,
  X,
  FileDown,
  Database,
  AlertTriangle,
} from "lucide-react";
import { DataPrepFilesSection, DATA_PREP_TEMPLATE } from "@/components/DataPrepFilesSection";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { format } from "date-fns";
import { MilestoneModulePicker, EMPTY_MODULE_SELECTION, selectionFromMilestone, isModuleSelectionValid, useProjectModules, type ModuleSelection } from "@/components/MilestoneModulePicker";

interface Milestone {
  id: number;
  projectId: number;
  projectName?: string | null;
  name: string;
  type: string;
  status: string;
  priority: string | null;
  targetDate: string | null;
  startDate: string | null;
  reqTargetDate: string | null;
  devTargetDate: string | null;
  qaTargetDate: string | null;
  sitTargetDate?: string | null;
  uatTargetDate: string | null;
  requiresSit?: boolean;
  requiresUat?: boolean;
  goLiveDate: string | null;
  environment: string | null;
  lessonsLearned: string | null;
  lessonsLearnedType: string | null;
  closedBy: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  modules?: { id: number; name: string }[];
  can?: { edit: boolean; staff: boolean; createRequirement: boolean };
  assigned?: boolean;
  requirementCount?: number;
  approvedCount?: number;
  executionFileCount?: number;
  uatFileCount?: number;
  dataPrepFileCount?: number;
  signoffType?: "full" | "conditional" | null;
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
  { value: "sit", label: "SIT" },
  { value: "uat", label: "UAT" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Data Prep milestones have no dev/QA-execution/UAT phase of their own, so
// "Verified" and "UAT" never apply — and "Active" reads as "In Progress" for
// a file-handoff task instead of a requirement-driven one.
const DATA_PREP_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "In Progress" },
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

function StatusBadge({ status, isDataPrep }: { status: string; isDataPrep?: boolean }) {
  switch (status) {
    case "completed":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    case "active":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> {isDataPrep ? "In Progress" : "Active"}</Badge>;
    case "verified":
      return <Badge className="gap-1 bg-teal-100 text-teal-700 border-teal-200"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>;
    case "sit":
      return <Badge className="gap-1 bg-indigo-100 text-indigo-700 border-indigo-200"><Clock className="w-3 h-3" /> SIT</Badge>;
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

  const activitySearch = useSearch();
  const linkedProject = new URLSearchParams(activitySearch).get("projectId");
  // "all" = nothing chosen yet; "everywhere" = every project the user can access (CR094).
  const [filterProject, setFilterProject] = useState<string>(linkedProject ?? "all");
  const [search, setSearch] = useState("");
  const projectChosen = filterProject !== "all" && filterProject !== "everywhere";
  useEffect(() => {
    if (linkedProject && /^[1-9]\d*$/.test(linkedProject)) setFilterProject(linkedProject);
  }, [linkedProject]);
  useHighlightRow(); // CR051 — focus a milestone card from a ?highlight= deep-link
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState({ name: "", type: "cr", status: "planned", priority: "none", targetDate: "", startDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", sitTargetDate: "", uatTargetDate: "", requiresSit: true, requiresUat: true, goLiveDate: "", environment: "none", lessonsLearned: "", lessonsLearnedType: "none", description: "" });
  const [moduleSel, setModuleSel] = useState<ModuleSelection>(EMPTY_MODULE_SELECTION);
  const { data: projectModules = [] } = useProjectModules(projectChosen ? filterProject : null, token);
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
      const res = await api(`/milestones?projectId=${filterProject === "everywhere" ? "all" : filterProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const visibleMilestones = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return milestones;
    return milestones.filter((m) => {
      const typeLabel = TYPE_OPTIONS.find((t) => t.value === m.type)?.label ?? m.type;
      const statusLabel = (m.type === "data_prep" ? DATA_PREP_STATUS_OPTIONS : STATUS_OPTIONS).find((x) => x.value === m.status)?.label ?? m.status;
      return [m.name, typeLabel, statusLabel, m.projectName ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [milestones, search]);

  // The milestone page links here with ?edit=<id>; open that milestone's form
  // once, if the person is allowed to edit it.
  const editParam = new URLSearchParams(activitySearch).get("edit");
  const [editHandled, setEditHandled] = useState(false);
  useEffect(() => {
    if (editHandled || !editParam || milestones.length === 0) return;
    const target = milestones.find((x) => String(x.id) === editParam);
    if (target?.can?.edit) openEdit(target);
    setEditHandled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, milestones, editHandled]);

  const canWrite = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"].includes(user?.role ?? "");
  // dev_lead gets Team access only (DEF-0012) — not create/edit-other-fields/delete,
  // which stays behind the full canWrite gate above and its backend counterpart.
  const canManageTeam = canWrite || user?.role === "dev_lead";
  const { roleLabel } = useRoleLabels();

  const [exportingLessons, setExportingLessons] = useState(false);
  const handleExportLessonsLearned = async () => {
    if (!projectChosen) return;
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
      const res = await api(`/milestones/${editing!.id}/assignable-users?forTeamStaffing=1`, token);
      return res.ok ? res.json() : [];
    },
    enabled: dialogOpen && !!editing && canManageTeam,
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

  // CR070 follow-up — staffing chosen at CREATE time, before the milestone
  // (and therefore a milestoneId to attach assignee rows to) exists. Held
  // locally and sent along with the POST body instead of hitting
  // /milestones/:id/assignees immediately like the edit-dialog Team section does.
  const [pendingAssignees, setPendingAssignees] = useState<{ id: number; name: string; role: string }[]>([]);
  const [pendingAssigneePick, setPendingAssigneePick] = useState("");
  const { data: newAssignableUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["milestone-assignable-new", filterProject],
    queryFn: async () => {
      const res = await api(`/milestones/assignable-users?projectId=${filterProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: dialogOpen && !editing && projectChosen,
  });
  const addPendingAssignee = (userId: string) => {
    setPendingAssigneePick("");
    const u = newAssignableUsers.find((x) => x.id === Number(userId));
    if (u && !pendingAssignees.some((a) => a.id === u.id)) setPendingAssignees((prev) => [...prev, u]);
  };
  const removePendingAssignee = (userId: number) => setPendingAssignees((prev) => prev.filter((a) => a.id !== userId));

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "cr", status: "planned", priority: "none", targetDate: "", startDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", sitTargetDate: "", uatTargetDate: "", requiresSit: true, requiresUat: true, goLiveDate: "", environment: "none", lessonsLearned: "", lessonsLearnedType: "none", description: "" });
    setPendingAssignees([]);
    setModuleSel(EMPTY_MODULE_SELECTION);
    setDialogOpen(true);
  };

  const openEdit = (m: Milestone) => {
    // Editing needs that milestone's project (module list, team), so leave the all-projects view.
    if (filterProject === "everywhere") setFilterProject(String(m.projectId));
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
      sitTargetDate: m.sitTargetDate ? m.sitTargetDate.slice(0, 10) : "",
      uatTargetDate: m.uatTargetDate ? m.uatTargetDate.slice(0, 10) : "",
      // An existing milestone keeps what it had: UAT counts as used when it has a UAT date, SIT starts off.
      requiresSit: !!m.requiresSit,
      requiresUat: !!m.requiresUat || !!m.uatTargetDate,
      goLiveDate: m.goLiveDate ? m.goLiveDate.slice(0, 10) : "",
      environment: m.environment ?? "none",
      lessonsLearned: m.lessonsLearned ?? "",
      lessonsLearnedType: m.lessonsLearnedType ?? "none",
      description: m.description ?? "",
    });
    setModuleSel(selectionFromMilestone(m.modules));
    setDialogOpen(true);
  };

  // CR070 — switching the type dropdown to Data Prep prefills the checklist
  // template (only if the PM hasn't already typed a description themselves).
  const handleTypeChange = (v: string) => {
    setForm((f) => {
      // "Verified"/"UAT" don't exist in the Data Prep status list — reset to
      // "Active" ("In Progress") rather than leaving the Select on a value
      // its own options no longer contain.
      const statusUnsupported = v === "data_prep" && (f.status === "verified" || f.status === "uat");
      return {
        ...f,
        type: v,
        status: statusUnsupported ? "active" : f.status,
        description: v === "data_prep" && !f.description.trim() ? DATA_PREP_TEMPLATE : f.description,
      };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    if (!projectChosen) { toast({ variant: "destructive", title: "Select a project first" }); return; }
    if (!isModuleSelectionValid(moduleSel, projectModules.length, form.type)) { toast({ variant: "destructive", title: "Select at least one module, or choose All modules" }); return; }
    setSaving(true);
    try {
      const body = {
        projectId: Number(filterProject),
        name: form.name.trim(),
        type: form.type,
        status: form.status,
        priority: form.priority === "none" ? null : form.priority,
        // DEF-0013 — targetDate is no longer a client-facing field; the
        // server derives it from goLiveDate.
        startDate: form.startDate || null,
        reqTargetDate: form.reqTargetDate || null,
        devTargetDate: form.devTargetDate || null,
        qaTargetDate: form.qaTargetDate || null,
        sitTargetDate: form.requiresSit ? form.sitTargetDate || null : null,
        uatTargetDate: form.requiresUat ? form.uatTargetDate || null : null,
        // CR106 — a new milestone sends both switches; an edit sends one only when it was changed.
        ...(editing
          ? {
              ...(form.requiresSit !== !!editing.requiresSit ? { requiresSit: form.requiresSit } : {}),
              ...(form.requiresUat !== !!editing.requiresUat ? { requiresUat: form.requiresUat } : {}),
            }
          : form.type === "data_prep" ? { requiresSit: false, requiresUat: false } : { requiresSit: form.requiresSit, requiresUat: form.requiresUat }),
        goLiveDate: form.goLiveDate || null,
        environment: form.environment === "none" ? null : form.environment,
        lessonsLearned: form.lessonsLearned.trim() || null,
        lessonsLearnedType: form.lessonsLearnedType === "none" ? null : form.lessonsLearnedType,
        description: form.description.trim() || null,
        moduleIds: form.type === "data_prep" ? [] : moduleSel.moduleIds,
        allModules: form.type === "data_prep" ? false : moduleSel.allModules,
        ...(editing ? {} : { assigneeUserIds: pendingAssignees.map((a) => a.id) }),
      };
      const res = editing
        ? await api(`/milestones/${editing.id}`, token, { method: "PATCH", body: JSON.stringify(body) })
        : await api("/milestones", token, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed"); }
      toast({ title: editing ? "Milestone updated" : "Milestone created" });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
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
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
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
          {projectChosen && (
            <>
            <Button variant="outline" onClick={handleExportLessonsLearned} disabled={exportingLessons} className="gap-2">
              <FileDown className="w-4 h-4" /> {exportingLessons ? "Exporting…" : "Export Lessons Learnt"}
            </Button>
            <ProgressDialog open={exportingLessons} title="Exporting lessons learnt" message="Building the lessons learnt file for this project." hint="Usually a few seconds" />
            </>
          )}
          {canWrite && projectChosen && (
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
          options={[{ value: "all", label: "Select a project…" }, { value: "everywhere", label: "All projects" }, ...projects.map(p => ({ value: String(p.id), label: p.name }))]}
          placeholder="Select project"
          searchPlaceholder="Search projects…"
          className="w-64"
        />
        {filterProject !== "all" && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, type or status…" className="pl-8" aria-label="Search milestones" />
          </div>
        )}
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

      {filterProject !== "all" && !isLoading && milestones.length > 0 && visibleMilestones.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No milestones match "{search}".</p>
        </div>
      )}

      {filterProject !== "all" && !isLoading && milestones.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{filterProject === "everywhere" ? "No milestones yet in the projects you can access." : "No milestones yet for this project."}</p>
          {canWrite && projectChosen && (
            <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Create first milestone
            </Button>
          )}
        </div>
      )}

      {visibleMilestones.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMilestones.map((m) => (
            <Card key={m.id} id={highlightRowId(m.id)} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">{m.name}</CardTitle>
                    {filterProject === "everywhere" && m.projectName && <p className="text-xs text-muted-foreground mt-0.5">{m.projectName}</p>}
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">
                      {TYPE_OPTIONS.find(t => t.value === m.type)?.label ?? m.type}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={m.status} isDataPrep={m.type === "data_prep"} />
                    {/* Frozen at QA Pipeline sign-off: 100% executed, not 100% passed. */}
                    {m.signoffType === "conditional" && (
                      <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                        <AlertTriangle className="w-3 h-3" /> Conditional Sign Off
                      </Badge>
                    )}
                    <PriorityBadge priority={m.priority} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {m.type !== "data_prep" && (
                  <div className="flex flex-wrap items-center gap-1">
                    {m.modules && m.modules.length > 0
                      ? m.modules.map((mod) => (
                          <Badge key={mod.id} variant="secondary" className="text-[10px]">{mod.name}</Badge>
                        ))
                      : <Badge variant="outline" className="text-[10px] text-muted-foreground">All modules</Badge>}
                  </div>
                )}
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
                <div className="flex gap-2 pt-1">
                  <Button asChild size="sm" variant="outline" className="flex-1 gap-1.5">
                    <Link href={`/milestones/${m.id}`}>Open</Link>
                  </Button>
                  {/* Only the milestone's author, a PM Lead (or admin/CTO) edit or delete it. */}
                  {m.can?.edit && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openEdit(m)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" aria-label={`Delete ${m.name}`} onClick={() => setDeleteId(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md w-[calc(100%-1.5rem)] sm:w-full max-h-[90dvh] flex flex-col p-0 gap-0">
          <DialogHeader className="shrink-0 border-b px-4 sm:px-6 py-4 pr-12 text-left">
            <DialogTitle>{editing ? "Edit Milestone" : "New Milestone"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 px-4 sm:px-6 py-4">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. CR015 — AI Test Generation"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    {(form.type === "data_prep" ? DATA_PREP_STATUS_OPTIONS : STATUS_OPTIONS).map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <MilestoneModulePicker projectId={filterProject} token={token} value={moduleSel} onChange={setModuleSel} type={form.type} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    <Label className="text-xs">System Testing done by</Label>
                    <Input type="date" value={form.qaTargetDate} onChange={(e) => setForm({ ...form, qaTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Checkbox checked={form.requiresSit} onCheckedChange={(c) => setForm({ ...form, requiresSit: !!c, ...(c ? {} : { sitTargetDate: "" }) })} />
                      Requires SIT
                    </label>
                    {form.requiresSit
                      ? <Input type="date" aria-label="SIT done by" value={form.sitTargetDate} onChange={(e) => setForm({ ...form, sitTargetDate: e.target.value })} />
                      : <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">SIT not required. Its date is cleared.</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Checkbox checked={form.requiresUat} onCheckedChange={(c) => setForm({ ...form, requiresUat: !!c, ...(c ? {} : { uatTargetDate: "" }) })} />
                      Requires UAT
                    </label>
                    {form.requiresUat
                      ? <Input type="date" aria-label="UAT done by" value={form.uatTargetDate} onChange={(e) => setForm({ ...form, uatTargetDate: e.target.value })} />
                      : <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">UAT not required. Its date is cleared.</p>}
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
                  className="font-mono text-xs resize-y"
                />
              </div>
            )}
            {!editing && canWrite && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {form.type === "data_prep" ? "QA assigned to prepare this data" : "Team"}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {pendingAssignees.map((a) => (
                    <Badge key={a.id} variant="outline" className="gap-1 pr-1">
                      {a.name}
                      <button type="button" onClick={() => removePendingAssignee(a.id)} className="hover:text-destructive" aria-label={`Remove ${a.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {pendingAssignees.length === 0 && <span className="text-xs text-muted-foreground">No one assigned yet.</span>}
                </div>
                <SearchableSelect
                  value={pendingAssigneePick}
                  onValueChange={addPendingAssignee}
                  options={newAssignableUsers
                    .filter((u) => !pendingAssignees.some((a) => a.id === u.id))
                    .map((u) => ({
                      value: String(u.id),
                      label: `${u.name} · ${roleLabel(u.role)}`,
                      keywords: u.role,
                    }))}
                  placeholder="Add project member…"
                  searchPlaceholder="Search by name or role…"
                  emptyText="No matching members."
                  className="h-8 text-xs"
                />
              </div>
            )}
            {editing && form.type === "data_prep" && <DataPrepFilesSection milestoneId={editing.id} token={token} canWrite={canWrite} userId={user?.id} />}
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
                <SearchableSelect
                  value={assigneePick}
                  onValueChange={addAssignee}
                  options={assignableUsers
                    .filter((u) => !assignees.some((a) => a.userId === u.id))
                    .map((u) => ({
                      value: String(u.id),
                      label: `${u.name} · ${roleLabel(u.role)}`,
                      keywords: u.role,
                    }))}
                  placeholder="Add project member…"
                  searchPlaceholder="Search by name or role…"
                  emptyText="No matching members."
                  className="h-8 text-xs"
                />
              </div>
            )}
            {form.status === "completed" && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Lessons Learned</Label>
                  <Select value={form.lessonsLearnedType} onValueChange={(v) => setForm({ ...form, lessonsLearnedType: v })}>
                    <SelectTrigger className="h-8 w-full sm:w-44 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
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
                  className="resize-y"
                />
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 sm:px-6 py-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm w-[calc(100%-1.5rem)] sm:w-full">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete Milestone?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete this milestone. Requirements and execution files linked to it will stay in the system, but will no longer show which milestone they belonged to.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={() => deleteId && handleDelete(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
