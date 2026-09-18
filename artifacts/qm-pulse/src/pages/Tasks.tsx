import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { highlightRowId } from "@/hooks/use-highlight";
import * as XLSX from "xlsx-js-style";
import { listProjects, getListProjectsQueryKey, listUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { getApiUrl, authHeaders } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare, Search, Download, Loader2, Users, AlertTriangle, CalendarClock, Plus, ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle } from "lucide-react";

// CR060 — Tasks is a read-only, auto-populated rollup of requirements within
// their milestones (no manual creation). CR073 removed GET
// /dashboard/task-board's per-department row filtering — every viewer with
// project access sees every row. The API still returns one row per
// requirement; this page's own list is one row per milestone (no
// requirement-level drill-down) — see groupedByMilestone below.
interface PhaseTimelineEntry {
  key: "requirements" | "development" | "qa" | "uat";
  label: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

type DepartmentPICs = Record<"FA" | "Dev" | "QA", string[]>;
const PIC_DEPARTMENTS = ["FA", "Dev", "QA"] as const;

interface TaskBoardRow {
  requirementId: number;
  title: string;
  parentId: number | null;
  projectId: number | null;
  milestoneId: number;
  milestoneName: string;
  milestonePriority: string | null;
  milestoneStatus: string;
  phase: "requirements" | "gap" | "develop" | "qa" | "uat";
  phaseLabel: string;
  statusLabel: string;
  assignee: string | null;
  picByDepartment?: DepartmentPICs;
  progress: number;
  dueDate: string | null;
  goLiveDate: string | null;
  devAssigneeId: number | null;
  executionFileId: number | null;
  phaseTimeline: PhaseTimelineEntry[];
  devTaskCounts: { done: number; total: number } | null;
}

interface Member {
  id: number;
  name: string;
}

const PRIORITY_CLASSES: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-slate-100 text-slate-700 border-slate-200",
};

const PHASE_CLASSES: Record<string, string> = {
  requirements: "bg-slate-100 text-slate-700 border-slate-200",
  gap: "bg-slate-100 text-slate-700 border-slate-200",
  develop: "bg-blue-100 text-blue-700 border-blue-200",
  qa: "bg-purple-100 text-purple-700 border-purple-200",
  uat: "bg-violet-100 text-violet-700 border-violet-200",
};

const PHASE_FILTER_OPTIONS = [
  { value: "all", label: "All Phases" },
  { value: "requirements", label: "Requirements" },
  { value: "gap", label: "Gap" },
  { value: "develop", label: "Development" },
  { value: "qa", label: "Testing" },
  { value: "uat", label: "UAT" },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: "all", label: "All Priorities" },
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" },
];

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-muted-foreground text-xs">—</span>;
  return <Badge variant="outline" className={PRIORITY_CLASSES[priority] ?? ""}>{priority}</Badge>;
}

function PhaseBadge({ phase, label }: { phase: string; label: string }) {
  return <Badge variant="outline" className={PHASE_CLASSES[phase] ?? ""}>{label}</Badge>;
}

// Same status set and colors as Milestones.tsx's own StatusBadge (kept as a
// local copy — that one isn't exported), so a milestone reads the same way
// on both pages.
function MilestoneStatusBadge({ status }: { status: string }) {
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

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}


// CR068 — event log per requirement (Blocker/Server down/Automation
// unavailable/custom). Open to any user with access to the requirement, not
// gated to lead-tier like AssignPopover — this is informational logging, not
// a workflow action.
// CR074 — an event now anchors to a requirement OR a milestone. `scope` is
// the server's read of which: "requirement" (requirementId set), "milestone"
// (whole milestone) or "requirements" (a chosen subset, named in
// requirementIds/requirementTitles).
interface RequirementEvent {
  id: number;
  requirementId: number | null;
  milestoneId: number | null;
  requirementIds: number[] | null;
  scope: "requirement" | "milestone" | "requirements";
  requirementTitles?: string[];
  type: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdByName: string | null;
  updatedByName: string | null;
}

// Events are logged and read from the milestone only — the "applies to"
// picker below is what narrows one to specific requirements, so a separate
// per-requirement button would just be a second way to do the same thing.
// The anchor carries its requirement list so that picker needs no extra
// fetch: the Tasks board already has every row for the group.
interface EventAnchor {
  milestoneId: number;
  title: string;
  requirements: { id: number; title: string }[];
}

const EVENT_TYPE_PRESETS = ["Blocker", "Server down", "Automation unavailable", "Other"];

const EVENT_TYPE_CLASSES: Record<string, string> = {
  Blocker: "bg-red-100 text-red-700 border-red-200",
  "Server down": "bg-orange-100 text-orange-700 border-orange-200",
  "Automation unavailable": "bg-amber-100 text-amber-700 border-amber-200",
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface EventFormState {
  type: string;
  customType: string;
  description: string;
  startDate: string;
  endDate: string;
  // Milestone events only. Empty = the whole milestone, which is the default
  // and the reason this dialog exists — one entry instead of N.
  requirementIds: number[];
}

const emptyEventForm = (): EventFormState => ({ type: EVENT_TYPE_PRESETS[0], customType: "", description: "", startDate: todayStr(), endDate: "", requirementIds: [] });
const resolveEventType = (f: EventFormState) => (f.type === "Other" ? f.customType.trim() : f.type);

// What an event covers, one line. Legacy per-requirement events (logged
// before CR074, or through the API directly) still show up in the rollup, so
// this labels those too rather than leaving them ambiguous.
function EventScopeLine({ event }: { event: RequirementEvent }) {
  if (event.scope === "milestone") {
    return <p className="text-[11px] text-muted-foreground italic">Whole milestone</p>;
  }
  if (event.scope === "requirements") {
    const titles = event.requirementTitles ?? [];
    const count = event.requirementIds?.length ?? titles.length;
    return (
      <p className="text-[11px] text-muted-foreground italic truncate" title={titles.join(", ")}>
        {count} requirement{count !== 1 ? "s" : ""}
        {titles.length > 0 ? ` — ${titles.join(", ")}` : ""}
      </p>
    );
  }
  return <p className="text-[11px] text-muted-foreground italic">Logged on a single requirement</p>;
}

function EventsDialog({ anchor }: { anchor: EventAnchor }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<RequirementEvent[]>([]);
  const [form, setForm] = useState<EventFormState>(emptyEventForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EventFormState>(emptyEventForm());

  // Reads roll up the milestone; edits and close-outs always go through
  // /requirements/events/:id, which resolves access from the event's own anchor.
  const collectionUrl = `${getApiUrl()}/milestones/${anchor.milestoneId}/events`;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(collectionUrl, { headers: authHeaders() });
      setEvents(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setForm(emptyEventForm());
      setEditingId(null);
      load();
    }
  };

  const handleAdd = async () => {
    const type = resolveEventType(form);
    if (!type) { toast({ variant: "destructive", title: "Type is required" }); return; }
    if (!form.startDate) { toast({ variant: "destructive", title: "Start date is required" }); return; }
    setSaving(true);
    try {
      const res = await fetch(collectionUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type,
          description: form.description || undefined,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          // Empty means "the whole milestone", which the server normalises to null.
          requirementIds: form.requirementIds,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to log event");
      toast({
        title: form.requirementIds.length === 0
          ? "Event logged for the whole milestone"
          : "Event logged",
      });
      setForm(emptyEventForm());
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (ev: RequirementEvent) => {
    setEditingId(ev.id);
    const isPreset = EVENT_TYPE_PRESETS.slice(0, -1).includes(ev.type);
    setEditForm({
      type: isPreset ? ev.type : "Other",
      customType: isPreset ? "" : ev.type,
      description: ev.description ?? "",
      startDate: ev.startDate.slice(0, 10),
      endDate: ev.endDate ? ev.endDate.slice(0, 10) : "",
      requirementIds: ev.requirementIds ?? [],
    });
  };

  const editingEventIsMilestone = events.find((e) => e.id === editingId)?.milestoneId != null;

  const handleSaveEdit = async (eventId: number) => {
    const type = resolveEventType(editForm);
    if (!type) { toast({ variant: "destructive", title: "Type is required" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/requirements/events/${eventId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          type,
          description: editForm.description || null,
          startDate: editForm.startDate,
          endDate: editForm.endDate || null,
          // Re-scoping is only accepted on milestone-anchored events.
          ...(editingEventIsMilestone ? { requirementIds: editForm.requirementIds } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to update event");
      toast({ title: "Event updated" });
      setEditingId(null);
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleEndNow = async (ev: RequirementEvent) => {
    setSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/requirements/events/${ev.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ endDate: todayStr() }),
      });
      if (!res.ok) throw new Error("Failed to close out event");
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  const hasOpenEvent = events.some((e) => !e.endDate);
  const toggleFormRequirement = (id: number) =>
    setForm((f) => ({
      ...f,
      requirementIds: f.requirementIds.includes(id)
        ? f.requirementIds.filter((v) => v !== id)
        : [...f.requirementIds, id],
    }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          title="Log / view events for this milestone"
          // The group row itself toggles expand/collapse — don't do both.
          onClick={(e) => e.stopPropagation()}
        >
          <AlertTriangle className={`w-3 h-3 ${hasOpenEvent ? "text-destructive" : ""}`} />
          Events
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Events — {anchor.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {loading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">No events logged yet.</div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="border rounded-md p-3 text-sm space-y-2">
                {editingId === ev.id ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="border rounded-md h-9 px-2 text-sm bg-background"
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      >
                        {EVENT_TYPE_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {editForm.type === "Other" && (
                        <Input placeholder="Custom type" value={editForm.customType} onChange={(e) => setEditForm({ ...editForm, customType: e.target.value })} />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Start Date</Label>
                        <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">End Date (optional)</Label>
                        <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} />
                      </div>
                    </div>
                    <Textarea placeholder="Description (optional)" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => handleSaveEdit(ev.id)} disabled={saving}>Save</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={EVENT_TYPE_CLASSES[ev.type] ?? "bg-slate-100 text-slate-700 border-slate-200"}>{ev.type}</Badge>
                      {!ev.endDate && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleEndNow(ev)} disabled={saving}>End now</Button>
                      )}
                    </div>
                    <EventScopeLine event={ev} />
                    {ev.description && <p className="text-muted-foreground text-xs">{ev.description}</p>}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="w-3 h-3" />
                      {new Date(ev.startDate).toLocaleDateString()}
                      {" – "}
                      {ev.endDate ? new Date(ev.endDate).toLocaleDateString() : <span className="italic">ongoing</span>}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Logged by {ev.createdByName ?? "—"}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => startEdit(ev)}>Edit</Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Log new event</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {EVENT_TYPE_PRESETS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {form.type === "Other" && (
              <Input placeholder="Custom type" value={form.customType} onChange={(e) => setForm({ ...form, customType: e.target.value })} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">End Date (optional)</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <Textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          {anchor.requirements.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  Applies to{" "}
                  <span className="font-normal text-muted-foreground">
                    {form.requirementIds.length === 0
                      ? `all ${anchor.requirements.length} requirements`
                      : `${form.requirementIds.length} of ${anchor.requirements.length} requirements`}
                  </span>
                </Label>
                {form.requirementIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setForm((f) => ({ ...f, requirementIds: [] }))}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {/* Leave every box unticked to cover the whole milestone — that's
                  the common case, so it's the default rather than a step. */}
              <div className="max-h-36 overflow-y-auto rounded-md border divide-y">
                {anchor.requirements.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={form.requirementIds.includes(r.id)}
                      onChange={() => toggleFormRequirement(r.id)}
                    />
                    <span className="truncate" title={r.title}>{r.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Add Event
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function collectPICs(rows: TaskBoardRow[]): DepartmentPICs {
  const result: DepartmentPICs = { FA: [], Dev: [], QA: [] };
  for (const department of PIC_DEPARTMENTS) {
    const names = new Map<string, string>();
    for (const row of rows) {
      // Keep the page compatible while an older API instance finishes deploying.
      const legacy = row.assignee?.split(" · ").find((part) => part.startsWith(department + ": "));
      const assigned = row.picByDepartment?.[department] ?? legacy?.slice(department.length + 2).split(",") ?? [];
      for (const value of assigned) {
        const name = value.trim();
        if (name && name !== "—") names.set(name.toLowerCase(), name);
      }
    }
    result[department] = [...names.values()].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

function exportTaskBoardToExcel(rows: TaskBoardRow[]) {
  const data = rows.map((r) => ({
    Milestone: r.milestoneName,
    Priority: r.milestonePriority ?? "",
    Requirement: r.title,
    Phase: r.phaseLabel,
    Status: r.statusLabel,
    PIC: PIC_DEPARTMENTS.map((department) => `${department}: ${collectPICs([r])[department].join(", ") || "—"}`).join("\n"),
    "Due Date": r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "",
    "Progress %": r.progress,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const headers = ["Milestone", "Priority", "Requirement", "Phase", "Status", "PIC", "Due Date", "Progress %"];
  headers.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) {
      ws[ref].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F4E78" } },
      };
    }
  });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 16) }));
  ws["!cols"]![5] = { wch: 42 };
  data.forEach((_, index) => {
    const cell = ws[XLSX.utils.encode_cell({ r: index + 1, c: 5 })];
    if (cell) cell.s = { alignment: { wrapText: true, vertical: "top" } };
  });
  ws["!rows"] = [{ hpt: 20 }, ...data.map(() => ({ hpt: 60 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, `Tasks_export_${stamp}.xlsx`);
}

// Lead can assign a member relevant to the row's own phase (Dev for
// "develop", QA for "qa"/"uat") — not the viewer's own department, since a PM
// viewing everything needs to assign into whichever department the row is
// currently sitting in. FA ownership (requirements/gap phase) isn't
// reassignable here — it's authorship, not a handoff.
// Department-generic workload: viewer's own department's members (qa sees
// qa, fa sees fa, dev sees dev), open-row counts derived from the already
// department-scoped `rows` — pm/admin (seesEverything) skip this entirely,
// since "everyone's workload at once" isn't a single department's view.
function WorkloadPanel({ rows, members, department }: { rows: TaskBoardRow[]; members: Member[]; department: string | null }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 5;

  const counts = useMemo(() => {
    return members.map((m) => ({
      ...m,
      openCount: rows.filter((r) => r.assignee === m.name && r.progress < 100).length,
    }));
  }, [members, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? counts.filter((m) => m.name.toLowerCase().includes(q)) : counts;
  }, [counts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  if (!department || members.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Workload
        </CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search team member..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        {pageItems.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground border rounded-md border-dashed">
            No members found
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {pageItems.map((m) => (
              <div key={m.id} className="border rounded-md p-3 text-sm">
                <p className="font-medium truncate" title={m.name}>{m.name}</p>
                <p className="text-muted-foreground text-xs mt-1">{m.openCount} open</p>
              </div>
            ))}
          </div>
        )}
        
        {filtered.length > PER_PAGE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-4 pt-4 border-t">
            <span>
              {filtered.length} member{filtered.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 gap-1" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <span className="px-2 tabular-nums font-medium">{safePage}/{totalPages}</span>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 gap-1" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();

  const department = (user as any)?.department ?? null;
  const tierRank = (user as any)?.tierRank ?? 1;
  const seesEverything = tierRank >= 5 || department === "pm";

  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterMilestone, setFilterMilestone] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const { data: rows = [], isLoading } = useQuery<TaskBoardRow[]>({
    queryKey: ["task-board"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/dashboard/task-board`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: getListProjectsQueryKey(),
    queryFn: () => listProjects(),
  });

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  const { data: roles = [] } = useQuery<{ name: string; department: string | null }[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
  });

  const { data: filterMilestones = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject, "task-board-filter"],
    queryFn: async () => {
      if (filterProject === "all") return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${filterProject}`, { headers: authHeaders() });
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const departmentByRole = useMemo(() => new Map(roles.map((r) => [r.name, r.department])), [roles]);
  const membersOf = (dept: string): Member[] =>
    (users as any[])
      .filter((u) => departmentByRole.get(u.role) === dept)
      .map((u) => ({ id: u.id, name: u.name }));
  const ownDeptMembers = useMemo(() => (department ? membersOf(department) : []), [users, departmentByRole, department]);

  const projectNameById = useMemo(() => new Map((projects as any[]).map((p) => [p.id, p.name])), [projects]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterProject !== "all" && String(r.projectId) !== filterProject) return false;
      if (filterMilestone !== "all" && String(r.milestoneId) !== filterMilestone) return false;
      if (filterPhase !== "all" && r.phase !== filterPhase) return false;
      if (filterPriority !== "all" && r.milestonePriority !== filterPriority) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.title.toLowerCase().includes(q) &&
          !r.milestoneName.toLowerCase().includes(q) &&
          !(r.assignee ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filterProject, filterMilestone, filterPhase, filterPriority, search]);

  // One row per milestone (not per requirement — see the group's own
  // avgProgress/phaseCounts, which is all a milestone-level list needs).
  // projectId/milestoneStatus/goLiveDate are the same across every row in a
  // milestone's group, so the first row's copy is as good as any.
  const groupedByMilestone = useMemo(() => {
    const groups = new Map<number, {
      milestoneId: number; milestoneName: string; milestonePriority: string | null;
      milestoneStatus: string; projectId: number | null; goLiveDate: string | null;
      rows: TaskBoardRow[];
    }>();
    for (const r of filtered) {
      let g = groups.get(r.milestoneId);
      if (!g) {
        g = {
          milestoneId: r.milestoneId, milestoneName: r.milestoneName, milestonePriority: r.milestonePriority,
          milestoneStatus: r.milestoneStatus, projectId: r.projectId, goLiveDate: r.goLiveDate,
          rows: [],
        };
        groups.set(r.milestoneId, g);
      }
      g.rows.push(r);
    }
    return Array.from(groups.values())
      .map((g) => {
        const avgProgress = Math.round(g.rows.reduce((sum, r) => sum + r.progress, 0) / g.rows.length);
        const phaseCounts: Record<string, number> = {};
        for (const r of g.rows) phaseCounts[r.phase] = (phaseCounts[r.phase] ?? 0) + 1;
        return { ...g, avgProgress, phaseCounts, pics: collectPICs(g.rows) };
      })
      .sort((a, b) => a.milestoneName.localeCompare(b.milestoneName));
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(groupedByMilestone.length / ITEMS_PER_PAGE));
  const paginatedMilestones = groupedByMilestone.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Deep-link from the dashboard's blocked/overdue & pending popovers:
  // ?highlight=<requirementId> — the page no longer has a row for that
  // requirement, so this resolves it to its containing milestone and jumps
  // to (and flashes) that milestone's row instead.
  const searchString = useSearch();
  const highlightReqId = useMemo(() => {
    const raw = new URLSearchParams(searchString).get("highlight");
    return raw ? Number(raw) : null;
  }, [searchString]);
  const jumpedForRef = useRef<number | null>(null);
  useEffect(() => {
    if (highlightReqId == null || rows.length === 0) return;
    if (jumpedForRef.current === highlightReqId) return;
    const targetMilestoneId = filtered.find((r) => r.requirementId === highlightReqId)?.milestoneId;
    if (targetMilestoneId == null) return;
    const idx = groupedByMilestone.findIndex((g) => g.milestoneId === targetMilestoneId);
    if (idx === -1) return;
    jumpedForRef.current = highlightReqId;
    setCurrentPage(Math.floor(idx / ITEMS_PER_PAGE) + 1);
    const t = setTimeout(() => {
      const el = document.getElementById(highlightRowId(targetMilestoneId));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md", "transition");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2400);
    }, 200);
    return () => clearTimeout(t);
  }, [highlightReqId, filtered, groupedByMilestone, rows.length]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export" });
      return;
    }
    exportTaskBoardToExcel(filtered);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-primary" /> Tasks
          </h1>
          <p className="text-muted-foreground mt-1">
            Auto-populated from your milestones — all departments
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="w-4 h-4" /> Export
        </Button>
      </div>

      <WorkloadPanel rows={rows} members={ownDeptMembers} department={seesEverything ? null : department} />

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search milestone, requirement or PIC..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <SearchableSelect
              value={filterProject}
              onValueChange={(v) => { setFilterProject(v); setFilterMilestone("all"); setCurrentPage(1); }}
              options={[{ value: "all", label: "All Projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
              placeholder="Project"
              searchPlaceholder="Search project..."
              className="flex-1 min-w-[140px]"
            />
            {filterProject !== "all" && (
              <SearchableSelect
                value={filterMilestone}
                onValueChange={(v) => { setFilterMilestone(v); setCurrentPage(1); }}
                options={[{ value: "all", label: "All Milestones" }, ...filterMilestones.map((m) => ({ value: String(m.id), label: m.name }))]}
                placeholder="Milestone"
                searchPlaceholder="Search milestone..."
                className="flex-1 min-w-[140px]"
              />
            )}
            <SearchableSelect
              value={filterPhase}
              onValueChange={(v) => { setFilterPhase(v); setCurrentPage(1); }}
              options={PHASE_FILTER_OPTIONS}
              placeholder="Phase"
              searchPlaceholder="Search phase..."
              className="flex-1 min-w-[130px]"
            />
            <SearchableSelect
              value={filterPriority}
              onValueChange={(v) => { setFilterPriority(v); setCurrentPage(1); }}
              options={PRIORITY_FILTER_OPTIONS}
              placeholder="Priority"
              searchPlaceholder="Search priority..."
              className="flex-1 min-w-[130px]"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[16%]">Milestone</TableHead>
                  <TableHead className="w-[9%]">Project</TableHead>
                  <TableHead className="w-[8%]">Priority</TableHead>
                  <TableHead className="w-[23%]">PIC</TableHead>
                  <TableHead className="w-[10%]">Status</TableHead>
                  <TableHead className="w-[9%]">Requirements</TableHead>
                  <TableHead className="w-[13%]">Phases</TableHead>
                  <TableHead className="w-[10%]">Progress</TableHead>
                  <TableHead className="w-[8%]">Go-Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMilestones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      No milestones match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMilestones.map((g) => (
                    <TableRow key={g.milestoneId} id={highlightRowId(g.milestoneId)}>
                      <TableCell className="font-medium truncate" title={g.milestoneName}>{g.milestoneName}</TableCell>
                      <TableCell className="truncate text-sm text-muted-foreground">
                        {g.projectId != null ? projectNameById.get(g.projectId) ?? "—" : "—"}
                      </TableCell>
                      <TableCell><PriorityBadge priority={g.milestonePriority} /></TableCell>
                      <TableCell className="align-top text-xs">
                        <div className="space-y-1">
                          {PIC_DEPARTMENTS.map((department) => (
                            <div key={department} className="flex gap-2">
                              <span className="w-7 shrink-0 font-semibold">{department}:</span>
                              <span className="min-w-0 break-words text-muted-foreground">{g.pics[department].join(", ") || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><MilestoneStatusBadge status={g.milestoneStatus} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] h-4">{g.rows.length}</Badge>
                          <EventsDialog
                            anchor={{
                              milestoneId: g.milestoneId,
                              title: g.milestoneName,
                              requirements: g.rows.map((r) => ({ id: r.requirementId, title: r.title })),
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {PHASE_FILTER_OPTIONS.slice(1).map((p) =>
                            g.phaseCounts[p.value] ? (
                              <Badge key={p.value} variant="outline" className={`text-[10px] h-4 ${PHASE_CLASSES[p.value] ?? ""}`}>
                                {g.phaseCounts[p.value]} {p.label}
                              </Badge>
                            ) : null,
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={g.avgProgress} className="w-16 shrink-0" />
                          <span className="text-xs text-muted-foreground">{g.avgProgress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(g.goLiveDate)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({groupedByMilestone.length} milestones)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
