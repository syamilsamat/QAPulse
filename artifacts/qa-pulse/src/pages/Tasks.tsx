import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckSquare, Search, Download, Loader2, UserCheck, Users, AlertTriangle, CalendarClock, Plus } from "lucide-react";

// CR060 — Tasks is now a read-only, auto-populated rollup of requirements
// within their milestones (no manual creation). One row per requirement that
// has a milestone. CR073 removed GET /dashboard/task-board's per-department
// row filtering — every viewer with project access now sees every row, with
// the full FA/Dev/QA name breakdown (previously PM/admin/cto-only).
interface PhaseTimelineEntry {
  key: "requirements" | "development" | "qa" | "uat";
  label: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

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
  progress: number;
  dueDate: string | null;
  goLiveDate: string | null;
  devAssigneeId: number | null;
  executionFileId: number | null;
  phaseTimeline: PhaseTimelineEntry[];
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

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

// Expanded per-row detail — planned (PM-set milestone target dates) vs actual
// (derived from activity-log phase transitions) for all 4 phases, not just
// the row's current one, so a PM can see the whole history at a glance.
function PhaseTimelinePanel({ timeline }: { timeline: PhaseTimelineEntry[] }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8">Phase</TableHead>
            <TableHead className="h-8">Planned Start</TableHead>
            <TableHead className="h-8">Planned End</TableHead>
            <TableHead className="h-8">Actual Start</TableHead>
            <TableHead className="h-8">Actual End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timeline.map((p) => (
            <TableRow key={p.key} className="hover:bg-transparent">
              <TableCell className="py-1.5 font-medium">{p.label}</TableCell>
              <TableCell className="py-1.5">{fmtDate(p.plannedStart)}</TableCell>
              <TableCell className="py-1.5">{fmtDate(p.plannedEnd)}</TableCell>
              <TableCell className="py-1.5">{fmtDate(p.actualStart)}</TableCell>
              <TableCell className="py-1.5">
                {p.actualStart && !p.actualEnd ? (
                  <span className="text-muted-foreground text-xs">In progress</span>
                ) : (
                  fmtDate(p.actualEnd)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// CR068 — event log per requirement (Blocker/Server down/Automation
// unavailable/custom). Open to any user with access to the requirement, not
// gated to lead-tier like AssignPopover — this is informational logging, not
// a workflow action.
interface RequirementEvent {
  id: number;
  requirementId: number;
  type: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  createdByName: string | null;
  updatedByName: string | null;
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
}

const emptyEventForm = (): EventFormState => ({ type: EVENT_TYPE_PRESETS[0], customType: "", description: "", startDate: todayStr(), endDate: "" });
const resolveEventType = (f: EventFormState) => (f.type === "Other" ? f.customType.trim() : f.type);

function RequirementEventsDialog({ requirementId, requirementTitle }: { requirementId: number; requirementTitle: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<RequirementEvent[]>([]);
  const [form, setForm] = useState<EventFormState>(emptyEventForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EventFormState>(emptyEventForm());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/requirements/${requirementId}/events`, { headers: authHeaders() });
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
      const res = await fetch(`${getApiUrl()}/requirements/${requirementId}/events`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, description: form.description || undefined, startDate: form.startDate, endDate: form.endDate || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to log event");
      toast({ title: "Event logged" });
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
    });
  };

  const handleSaveEdit = async (eventId: number) => {
    const type = resolveEventType(editForm);
    if (!type) { toast({ variant: "destructive", title: "Type is required" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/requirements/events/${eventId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ type, description: editForm.description || null, startDate: editForm.startDate, endDate: editForm.endDate || null }),
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Log / view events">
          <AlertTriangle className={`w-3.5 h-3.5 ${hasOpenEvent ? "text-destructive" : ""}`} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Events — {requirementTitle}</DialogTitle>
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

function exportTaskBoardToExcel(rows: TaskBoardRow[]) {
  const data = rows.map((r) => ({
    Milestone: r.milestoneName,
    Priority: r.milestonePriority ?? "",
    Requirement: r.title,
    Phase: r.phaseLabel,
    Status: r.statusLabel,
    Assignee: r.assignee ?? "",
    "Due Date": r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "",
    "Progress %": r.progress,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const headers = ["Milestone", "Priority", "Requirement", "Phase", "Status", "Assignee", "Due Date", "Progress %"];
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
function AssignPopover({
  row,
  devMembers,
  qaMembers,
  onAssigned,
}: {
  row: TaskBoardRow;
  devMembers: Member[];
  qaMembers: Member[];
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const targetsDev = row.phase === "develop";
  const targetsQa = (row.phase === "qa" || row.phase === "uat") && row.executionFileId != null;
  if (!targetsDev && !targetsQa) return null;
  const members = targetsDev ? devMembers : qaMembers;

  const handlePick = async (member: Member) => {
    setSaving(true);
    try {
      const res = targetsDev
        ? await fetch(`${getApiUrl()}/requirements/${row.requirementId}/dev`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ action: "assign", devAssigneeId: member.id }),
          })
        : await fetch(`${getApiUrl()}/execution-files/${row.executionFileId}`, {
            method: "PATCH",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ qaPic: member.name }),
          });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Assign failed");
      toast({ title: `Assigned to ${member.name}` });
      setOpen(false);
      onAssigned();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={saving} title="Assign">
          <UserCheck className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search member..." />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {members.map((m) => (
                <CommandItem key={m.id} onSelect={() => handlePick(m)}>{m.name}</CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Department-generic workload: viewer's own department's members (qa sees
// qa, fa sees fa, dev sees dev), open-row counts derived from the already
// department-scoped `rows` — pm/admin (seesEverything) skip this entirely,
// since "everyone's workload at once" isn't a single department's view.
function WorkloadPanel({ rows, members, department }: { rows: TaskBoardRow[]; members: Member[]; department: string | null }) {
  if (!department || members.length === 0) return null;
  const counts = members.map((m) => ({
    ...m,
    openCount: rows.filter((r) => r.assignee === m.name && r.progress < 100).length,
  }));
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Workload
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {counts.map((m) => (
            <div key={m.id} className="border rounded-md p-3 text-sm">
              <p className="font-medium truncate">{m.name}</p>
              <p className="text-muted-foreground text-xs mt-1">{m.openCount} open</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const department = (user as any)?.department ?? null;
  const tierRank = (user as any)?.tierRank ?? 1;
  const seesEverything = tierRank >= 5 || department === "pm";
  const canAssign = tierRank >= 2; // Lead-tier+ — server enforces the real gate on each PATCH

  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("all");
  const [filterMilestone, setFilterMilestone] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const { data: rows = [], isLoading, refetch } = useQuery<TaskBoardRow[]>({
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
  const devMembers = useMemo(() => membersOf("dev"), [users, departmentByRole]);
  const qaMembers = useMemo(() => membersOf("qa"), [users, departmentByRole]);
  const ownDeptMembers = useMemo(() => (department ? membersOf(department) : []), [users, departmentByRole, department]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["task-board"] });
    refetch();
  };

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
              placeholder="Search requirement, milestone, assignee..."
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="w-10" />
                  {canAssign && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canAssign ? 9 : 8} className="text-center text-muted-foreground py-10">
                      No tasks match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((r) => {
                    const isExpanded = expandedIds.has(r.requirementId);
                    const toggleExpanded = () =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.requirementId)) next.delete(r.requirementId);
                        else next.add(r.requirementId);
                        return next;
                      });
                    return (
                      <Fragment key={r.requirementId}>
                        <TableRow>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              onClick={toggleExpanded}
                              className="hover:underline text-left"
                              title="Show planned vs actual phase dates"
                            >
                              {r.milestoneName}
                            </button>
                          </TableCell>
                          <TableCell><PriorityBadge priority={r.milestonePriority} /></TableCell>
                          <TableCell className="max-w-[280px] truncate" title={r.title}>{r.title}</TableCell>
                          <TableCell><PhaseBadge phase={r.phase} label={r.phaseLabel} /></TableCell>
                          <TableCell>
                            {r.assignee ?? <span className="text-muted-foreground text-xs">Unassigned</span>}
                          </TableCell>
                          <TableCell>
                            {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <Progress value={r.progress} className="w-20" />
                              <span className="text-xs text-muted-foreground">{r.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RequirementEventsDialog requirementId={r.requirementId} requirementTitle={r.title} />
                          </TableCell>
                          {canAssign && (
                            <TableCell>
                              <AssignPopover row={r} devMembers={devMembers} qaMembers={qaMembers} onAssigned={invalidate} />
                            </TableCell>
                          )}
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={canAssign ? 9 : 8} className="bg-muted/10 py-3">
                              <PhaseTimelinePanel timeline={r.phaseTimeline} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({filtered.length} tasks)
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
