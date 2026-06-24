import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { HoverList } from "@/components/icons/animated";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  fetchModules,
  fetchProjects,
  type ExecutionModule,
  type ExecutionProject,
} from "@/lib/execution-api";

type ExecutionRow = {
  module: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  inProg: number;
  notExec: number;
};

const getHeaders = () => {
  const token = localStorage.getItem("qa_pulse_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{pct}%</span>
    </div>
  );
}

function StatusPill({ value, total, label, color }: { value: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`text-center px-2 py-1 rounded-md text-xs font-semibold ${value > 0 ? color : "text-muted-foreground"}`}>
      {value > 0 ? value : "—"}
    </div>
  );
}

export default function TestExecutionSummary() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [matchWithParam, params] = useRoute("/test-cases/execution-details/:ticketId");
  const ticketId = matchWithParam ? params?.ticketId : null;

  const [data, setData] = useState<ExecutionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState(ticketId || "");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [taskInfo, setTaskInfo] = useState<{ status: string; name: string } | null>(null);
  const [fileInfo, setFileInfo] = useState<{
    id: number;
    title: string | null;
    remarks: string | null;
    projectId: number | null;
    requirementId: number | null;
    selectedModules: string | null;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    redmineTicketId: "",
    remarks: "",
    projectId: "",
    requirementId: "",
    selectedModules: [] as number[],
  });
  const [editSaving, setEditSaving] = useState(false);
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [projects, setProjects] = useState<ExecutionProject[]>([]);
  const [requirements, setRequirements] = useState<{ id: number; title: string; projectId?: number | null }[]>([]);

  const TASK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    new: { label: "New", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
    uat: { label: "UAT", color: "bg-purple-100 text-purple-700" },
    done: { label: "Done", color: "bg-green-100 text-green-700" },
    released_to_production: { label: "Released", color: "bg-emerald-100 text-emerald-700" },
    blocked: { label: "Blocked", color: "bg-red-100 text-red-700" },
    on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-700" },
  };

  const loadSummary = async (tid: string) => {
    if (!tid.trim()) return;
    setIsLoading(true);
    try {
      const [summariesRes, tasksRes, filesRes] = await Promise.all([
        fetch(`/api/execution-files/${tid}/summaries`, { headers: getHeaders() }),
        fetch("/api/tasks", { headers: getHeaders() }),
        fetch("/api/execution-files", { headers: getHeaders() }),
      ]);

      // Load summaries from executionSummariesTable
      let rows: ExecutionRow[] = [];
      if (summariesRes.ok) {
        const raw = await summariesRes.json();
        rows = (raw || []).map((r: any) => ({
          module: r.module,
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          blocked: r.blocked,
          inProg: r.inProgress,
          notExec: r.notExecuted,
        }));
      } else {
        // Fallback: aggregate from raw test cases
        const tcRes = await fetch(`/api/execution-files/${tid}/test-cases`, { headers: getHeaders() });
        if (tcRes.ok) {
          const { testCases } = await tcRes.json();
          const moduleMap: Record<string, ExecutionRow> = {};
          for (const tc of testCases || []) {
            if (!tc.moduleName && !tc.caseName && !tc.result) continue;
            const mod = tc.moduleName || "Unassigned Module";
            if (!moduleMap[mod]) moduleMap[mod] = { module: mod, total: 0, passed: 0, failed: 0, blocked: 0, inProg: 0, notExec: 0 };
            const row = moduleMap[mod];
            row.total++;
            const res = (tc.result?.trim() || "").toLowerCase();
            if (res === "passed") row.passed++;
            else if (res === "failed") row.failed++;
            else if (res === "blocked") row.blocked++;
            else if (res === "in progress") row.inProg++;
            else row.notExec++;
          }
          rows = Object.values(moduleMap);
        }
      }

      setData(rows);
      setCurrentTicketId(tid);
      setHasLoaded(true);

      // Match task status
      if (tasksRes.ok) {
        const allTasks = await tasksRes.json();
        const matched = allTasks.find((t: any) => String(t.redmineId) === tid);
        setTaskInfo(matched ? { status: matched.status, name: matched.name } : null);
      }

      // Load execution file metadata (for edit dialog)
      if (filesRes.ok) {
        const allFiles = await filesRes.json();
        const matched = allFiles.find((f: any) => String(f.redmineTicketId) === tid);
        if (matched) setFileInfo({
          id: matched.id,
          title: matched.title,
          remarks: matched.remarks,
          projectId: matched.projectId ?? null,
          requirementId: matched.requirementId ?? null,
          selectedModules: matched.selectedModules ?? null,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to load execution summary" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!fileInfo) return;
    if (!editForm.redmineTicketId.trim()) {
      toast({ variant: "destructive", title: "Redmine No. is required" });
      return;
    }
    setEditSaving(true);
    const selectedModuleNames = editForm.selectedModules
      .map(id => modules.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(",");
    try {
      const res = await fetch(`/api/execution-files/${fileInfo.id}`, {
        method: "PATCH",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim() || null,
          redmineTicketId: editForm.redmineTicketId.trim(),
          remarks: editForm.remarks.trim() || null,
          projectId: editForm.projectId ? Number(editForm.projectId) : null,
          requirementId: editForm.requirementId ? Number(editForm.requirementId) : null,
          selectedModules: selectedModuleNames || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: err.error || "Failed to save changes" });
        return;
      }
      const updated = await res.json();
      setEditOpen(false);
      toast({ title: "Execution file updated" });
      const newTicketId = updated.redmineTicketId;
      if (newTicketId !== currentTicketId) {
        setLocation(`/test-cases/execution-details/${newTicketId}`);
      } else {
        loadSummary(currentTicketId);
      }
    } finally {
      setEditSaving(false);
    }
  };

  // Load reference data for the edit dialog
  useEffect(() => {
    Promise.all([
      fetchModules(),
      fetchProjects(),
      fetch("/api/requirements", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ]).then(([mods, projs, reqs]) => {
      setModules(mods || []);
      setProjects(projs || []);
      setRequirements(reqs || []);
    }).catch(() => {});
  }, []);

  // Auto-load if ticket ID comes from URL
  useEffect(() => {
    if (ticketId) loadSummary(ticketId);
  }, [ticketId]);

  // SSE live updates
  useEffect(() => {
    const eventSource = new EventSource("/api/execution-events");
    eventSource.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "UPDATED" && msg.ticketId === currentTicketId && currentTicketId) {
        loadSummary(currentTicketId);
      }
    };
    return () => eventSource.close();
  }, [currentTicketId]);

  const totals = data.reduce(
    (acc, r) => ({
      total: acc.total + r.total, passed: acc.passed + r.passed, failed: acc.failed + r.failed,
      blocked: acc.blocked + r.blocked, inProg: acc.inProg + r.inProg, notExec: acc.notExec + r.notExec,
    }),
    { total: 0, passed: 0, failed: 0, blocked: 0, inProg: 0, notExec: 0 }
  );

  const taskStatusInfo = taskInfo ? (TASK_STATUS_LABELS[taskInfo.status] ?? { label: taskInfo.status, color: "bg-slate-100 text-slate-700" }) : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/test-cases/execution")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <HoverList className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0 group" />
              Execution Summary
              {currentTicketId && <span className="text-muted-foreground font-normal text-xl">— Ticket #{currentTicketId}</span>}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Aggregated test execution progress by module.</p>
          </div>
        </div>

        {currentTicketId && (
          <div className="flex items-center gap-3 flex-wrap">
            {taskStatusInfo && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${taskStatusInfo.color}`}>
                Task: {taskStatusInfo.label}
              </span>
            )}
            {!taskInfo && hasLoaded && (
              <span className="flex items-center gap-1 text-sm text-amber-600">
                <AlertCircle className="w-4 h-4" /> No linked task found
              </span>
            )}
            {fileInfo && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const storedNames = fileInfo.selectedModules
                    ? fileInfo.selectedModules.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
                    : [];
                  const preSelectedIds = modules
                    .filter(m => storedNames.includes(m.name.trim().toLowerCase()))
                    .map(m => m.id);
                  setEditForm({
                    title: fileInfo.title || "",
                    redmineTicketId: currentTicketId,
                    remarks: fileInfo.remarks || "",
                    projectId: fileInfo.projectId ? String(fileInfo.projectId) : "",
                    requirementId: fileInfo.requirementId ? String(fileInfo.requirementId) : "",
                    selectedModules: preSelectedIds,
                  });
                  setEditOpen(true);
                }}
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => loadSummary(currentTicketId)} disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Overall totals bar */}
      {hasLoaded && data.length > 0 && (
        <Card className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
            {[
              { label: "Total", value: totals.total, color: "text-foreground" },
              { label: "Passed", value: totals.passed, color: "text-green-600" },
              { label: "Failed", value: totals.failed, color: "text-red-600" },
              { label: "Blocked", value: totals.blocked, color: "text-orange-600" },
              { label: "In Progress", value: totals.inProg, color: "text-blue-600" },
              { label: "Not Executed", value: totals.notExec, color: "text-muted-foreground" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5">
            <ProgressBar value={totals.passed} total={totals.total} color="bg-green-500" />
            <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Pass Rate: {totals.total > 0 ? Math.round((totals.passed / totals.total) * 100) : 0}%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" /> Executed: {totals.total > 0 ? Math.round(((totals.total - totals.notExec) / totals.total) * 100) : 0}%</span>
            </div>
          </div>
        </Card>
      )}

      {/* Module breakdown table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Module Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="w-full text-sm min-w-[700px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold w-[200px]">Module</TableHead>
                <TableHead className="font-semibold text-center w-[70px]">Total</TableHead>
                <TableHead className="font-semibold text-center w-[80px] text-green-700">Passed</TableHead>
                <TableHead className="font-semibold text-center w-[80px] text-red-700">Failed</TableHead>
                <TableHead className="font-semibold text-center w-[80px] text-orange-600">Blocked</TableHead>
                <TableHead className="font-semibold text-center w-[90px] text-blue-600">In Prog.</TableHead>
                <TableHead className="font-semibold text-center w-[90px] text-muted-foreground">Not Exec.</TableHead>
                <TableHead className="font-semibold w-[160px]">Pass %</TableHead>
                <TableHead className="font-semibold w-[160px]">Executed %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasLoaded ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {ticketId ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Loading summary for Ticket #{ticketId}...</span>
                      </div>
                    ) : "Navigate here from the Execution Dashboard to view a ticket summary."}
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    No execution data found for Ticket #{currentTicketId}.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {data.map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="font-medium uppercase text-sm">{row.module}</TableCell>
                      <TableCell className="text-center font-semibold">{row.total}</TableCell>
                      <TableCell className="text-center">
                        <StatusPill value={row.passed} total={row.total} label="Passed" color="bg-green-100 text-green-700" />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusPill value={row.failed} total={row.total} label="Failed" color="bg-red-100 text-red-700" />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusPill value={row.blocked} total={row.total} label="Blocked" color="bg-orange-100 text-orange-700" />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusPill value={row.inProg} total={row.total} label="In Progress" color="bg-blue-100 text-blue-700" />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusPill value={row.notExec} total={row.total} label="Not Exec" color="bg-slate-100 text-slate-600" />
                      </TableCell>
                      <TableCell><ProgressBar value={row.passed} total={row.total} color="bg-green-500" /></TableCell>
                      <TableCell><ProgressBar value={row.total - row.notExec} total={row.total} color="bg-slate-400" /></TableCell>
                    </TableRow>
                  ))}
                  {/* Grand total row */}
                  <TableRow className="bg-muted/50 border-t-2 border-border">
                    <TableCell className="font-extrabold uppercase text-sm tracking-wide text-foreground">Grand Total</TableCell>
                    <TableCell className="text-center font-extrabold text-base">{totals.total}</TableCell>
                    <TableCell className="text-center text-green-700 font-extrabold text-base">{totals.passed}</TableCell>
                    <TableCell className="text-center text-red-700 font-extrabold text-base">{totals.failed}</TableCell>
                    <TableCell className="text-center text-orange-600 font-extrabold text-base">{totals.blocked}</TableCell>
                    <TableCell className="text-center text-blue-600 font-extrabold text-base">{totals.inProg}</TableCell>
                    <TableCell className="text-center text-muted-foreground font-extrabold text-base">{totals.notExec}</TableCell>
                    <TableCell><ProgressBar value={totals.passed} total={totals.total} color="bg-green-500" /></TableCell>
                    <TableCell><ProgressBar value={totals.total - totals.notExec} total={totals.total} color="bg-slate-400" /></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Execution File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Redmine Ticket ID */}
            <div className="space-y-1">
              <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
              <Input
                value={editForm.redmineTicketId}
                onChange={e => setEditForm(f => ({ ...f, redmineTicketId: e.target.value.replace(/\D/g, "") }))}
                placeholder="e.g. 38032"
              />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Execution file title"
              />
            </div>

            {/* Requirement */}
            <div className="space-y-1">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <SearchableSelect
                value={editForm.requirementId}
                onValueChange={v => {
                  const req = requirements.find(r => String(r.id) === v);
                  const updated = { ...editForm, requirementId: v };
                  if (req?.projectId) updated.projectId = String(req.projectId);
                  setEditForm(updated);
                }}
                options={[
                  { value: "", label: "None" },
                  ...requirements.map(r => ({ value: String(r.id), label: r.title })),
                ]}
                placeholder="Search requirement..."
              />
            </div>

            {/* Project */}
            <div className="space-y-1">
              <Label>Project</Label>
              <SearchableSelect
                value={editForm.projectId}
                onValueChange={v => setEditForm(f => ({ ...f, projectId: v }))}
                options={[
                  { value: "", label: "Select project..." },
                  ...projects.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Search project..."
              />
            </div>

            {/* Module (multiselect) */}
            <div className="space-y-1">
              <Label>Module</Label>
              <div className="border rounded-md p-2 max-h-[150px] overflow-y-auto space-y-1">
                {modules.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-2">No modules available.</p>
                  : modules.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={editForm.selectedModules.includes(m.id)}
                        onChange={e => setEditForm(f => ({
                          ...f,
                          selectedModules: e.target.checked
                            ? [...f.selectedModules, m.id]
                            : f.selectedModules.filter(id => id !== m.id),
                        }))}
                      />
                      {m.name}
                    </label>
                  ))
                }
              </div>
              {editForm.selectedModules.length > 0 && (
                <p className="text-xs text-muted-foreground">{editForm.selectedModules.length} module(s) selected</p>
              )}
            </div>

            {/* Remarks */}
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Textarea
                value={editForm.remarks}
                onChange={e => setEditForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Optional notes"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} className="gap-2">
              {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
