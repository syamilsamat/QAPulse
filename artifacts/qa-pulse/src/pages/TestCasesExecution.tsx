import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { HoverPlay } from "@/components/icons/animated";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  BarChart2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  fetchExecutionFiles,
  createExecutionFile,
  deleteExecutionFile,
  fetchModules,
  fetchUsers,
  type ExecutionFile,
  type ExecutionModule,
  type ExecutionUser,
} from "@/lib/execution-api";

const TASK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200" },
  uat: { label: "UAT", color: "bg-purple-100 text-purple-700 border-purple-200" },
  done: { label: "Done", color: "bg-green-100 text-green-700 border-green-200" },
  released_to_production: { label: "Released", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  blocked: { label: "Blocked", color: "bg-red-100 text-red-700 border-red-200" },
  on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

type SortKey = "redmineTicketId" | "title" | "qaPic" | "updatedAt" | "status";
type SortDir = "asc" | "desc";

type ProgressData = Record<string, {
  total: number; passed: number; failed: number;
  blocked: number; inProgress: number; notExecuted: number;
}>;

interface TaskInfo {
  redmineId: string;
  status: string;
  name: string;
}

function MiniProgressBar({ data }: { data: ProgressData[string] | undefined }) {
  if (!data || data.total === 0) {
    return <span className="text-xs text-muted-foreground italic">No data</span>;
  }
  const { total, passed, failed, blocked, inProgress, notExecuted } = data;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex h-2 rounded-full overflow-hidden w-full bg-muted">
        {passed > 0 && <div className="bg-green-500" style={{ width: pct(passed) }} title={`Passed: ${passed}`} />}
        {failed > 0 && <div className="bg-red-500" style={{ width: pct(failed) }} title={`Failed: ${failed}`} />}
        {blocked > 0 && <div className="bg-orange-400" style={{ width: pct(blocked) }} title={`Blocked: ${blocked}`} />}
        {inProgress > 0 && <div className="bg-blue-400" style={{ width: pct(inProgress) }} title={`In Progress: ${inProgress}`} />}
        {notExecuted > 0 && <div className="bg-muted-foreground/20" style={{ width: pct(notExecuted) }} title={`Not Executed: ${notExecuted}`} />}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {passed > 0 && <span className="text-[10px] text-green-700 font-medium">{passed}P</span>}
        {failed > 0 && <span className="text-[10px] text-red-700 font-medium">{failed}F</span>}
        {blocked > 0 && <span className="text-[10px] text-orange-600 font-medium">{blocked}B</span>}
        {inProgress > 0 && <span className="text-[10px] text-blue-600 font-medium">{inProgress}IP</span>}
        {notExecuted > 0 && <span className="text-[10px] text-muted-foreground">{notExecuted}NE</span>}
        <span className="text-[10px] text-muted-foreground ml-auto">{total} total</span>
      </div>
    </div>
  );
}

export default function TestCasesExecution() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<ExecutionFile[]>([]);
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData>({});
  const [tasks, setTasks] = useState<TaskInfo[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [fileForm, setFileForm] = useState({
    redmineTicketId: "",
    title: "",
    qaPic: "",
    remarks: "",
    selectedModules: [] as number[],
  });

  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [filesToDelete, setFilesToDelete] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const getHeaders = () => {
    const token = localStorage.getItem("qa_pulse_token");
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  useEffect(() => {
    Promise.all([
      fetchExecutionFiles(),
      fetchModules(),
      fetchUsers(),
      fetch("/api/execution-progress", { headers: getHeaders() }).then(r => r.ok ? r.json() : {}),
      fetch("/api/tasks", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([filesData, modulesData, usersData, progressData, tasksData]) => {
        setFiles(filesData);
        setModules(modulesData);
        setQaUsers(usersData);
        setProgress(progressData || {});
        setTasks((tasksData || []).filter((t: any) => t.redmineId).map((t: any) => ({
          redmineId: String(t.redmineId),
          status: t.status,
          name: t.name,
        })));
      })
      .catch(() => toast({ variant: "destructive", title: "Failed to load data" }))
      .finally(() => setIsLoading(false));
  }, [toast]);

  const getTaskForFile = (f: ExecutionFile) =>
    tasks.find(t => t.redmineId === f.redmineTicketId);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const filteredFiles = useMemo(() => {
    const q = search.toLowerCase();
    return files.filter(f =>
      f.redmineTicketId.includes(search) ||
      f.title?.toLowerCase().includes(q) ||
      f.qaPic?.toLowerCase().includes(q)
    );
  }, [files, search]);

  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      let av: string, bv: string;
      if (sortKey === "status") {
        av = getTaskForFile(a)?.status ?? "";
        bv = getTaskForFile(b)?.status ?? "";
      } else {
        av = String((a as any)[sortKey] ?? "");
        bv = String((b as any)[sortKey] ?? "");
      }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filteredFiles, sortKey, sortDir, tasks]);

  const handleCreateFile = async () => {
    if (!fileForm.redmineTicketId.trim()) return;
    try {
      const selectedModuleNames = fileForm.selectedModules
        .map(id => modules.find(m => m.id === id)?.name)
        .filter(Boolean).join(",");
      const newFile = await createExecutionFile({
        redmineTicketId: fileForm.redmineTicketId.trim(),
        title: fileForm.title,
        qaPic: fileForm.qaPic,
        remarks: fileForm.remarks,
        selectedModules: selectedModuleNames || undefined,
      });
      setFiles([newFile, ...files]);
      setNewFileOpen(false);
      setFileForm({ redmineTicketId: "", title: "", qaPic: "", remarks: "", selectedModules: [] });
      toast({ title: "Test Case File created" });
    } catch {
      toast({ variant: "destructive", title: "Failed to create file. Ticket ID might already exist." });
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedFiles(checked ? filteredFiles.map(f => f.id) : []);
  };

  const handleSelectFile = (id: number, checked: boolean) => {
    setSelectedFiles(prev => checked ? [...prev, id] : prev.filter(fid => fid !== id));
  };

  const confirmDelete = (ids: number[]) => { setFilesToDelete(ids); setDeleteConfirmOpen(true); };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(filesToDelete.map(id => deleteExecutionFile(id)));
      setFiles(files.filter(f => !filesToDelete.includes(f.id)));
      setSelectedFiles(selectedFiles.filter(id => !filesToDelete.includes(id)));
      toast({ title: `Deleted ${filesToDelete.length} file(s)` });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete one or more files" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setFilesToDelete([]);
    }
  };

  if (isLoading)
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  const thClass = "border-r border-border cursor-pointer select-none hover:bg-muted/70 transition-colors";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HoverPlay className="w-7 h-7 text-primary group" /> Execution Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Manage test case files and track execution progress.</p>
        </div>
        <Button onClick={() => setNewFileOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Test Case File
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-4">
              Test Case Files
              {selectedFiles.length > 0 && (
                <Button variant="destructive" size="sm" className="h-8" onClick={() => confirmDelete(selectedFiles)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Selected ({selectedFiles.length})
                </Button>
              )}
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search ticket, title, QA PIC..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="border-collapse border border-border min-w-[900px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[50px] border-r border-border text-center">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                    checked={filteredFiles.length > 0 && selectedFiles.length === filteredFiles.length}
                    onChange={e => handleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("redmineTicketId")}>
                  <div className="flex items-center gap-1">Ticket ID <SortIcon k="redmineTicketId" /></div>
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("title")}>
                  <div className="flex items-center gap-1">Title <SortIcon k="title" /></div>
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("qaPic")}>
                  <div className="flex items-center gap-1">QA PIC <SortIcon k="qaPic" /></div>
                </TableHead>
                <TableHead className="border-r border-border">Execution Progress</TableHead>
                <TableHead className={thClass} onClick={() => handleSort("status")}>
                  <div className="flex items-center gap-1">Task Status <SortIcon k="status" /></div>
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("updatedAt")}>
                  <div className="flex items-center gap-1">Last Modified <SortIcon k="updatedAt" /></div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiles.map(f => {
                const task = getTaskForFile(f);
                const statusInfo = task ? (TASK_STATUS_LABELS[task.status] ?? { label: task.status, color: "bg-slate-100 text-slate-700" }) : null;
                const prog = progress[f.redmineTicketId];
                return (
                  <TableRow key={f.id} className="border-b border-border hover:bg-muted/20 cursor-pointer" onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)}>
                    <TableCell className="border-r border-border text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                        checked={selectedFiles.includes(f.id)}
                        onChange={e => handleSelectFile(f.id, e.target.checked)} />
                    </TableCell>
                    <TableCell className="border-r border-border font-bold text-primary">#{f.redmineTicketId}</TableCell>
                    <TableCell className="border-r border-border">{f.title || "—"}</TableCell>
                    <TableCell className="border-r border-border">{f.qaPic || "—"}</TableCell>
                    <TableCell className="border-r border-border py-2">
                      <MiniProgressBar data={prog} />
                    </TableCell>
                    <TableCell className="border-r border-border">
                      {statusInfo ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="w-3 h-3" /> No task
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="border-r border-border text-muted-foreground text-sm">
                      {format(new Date(f.updatedAt), "dd MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="View Execution Summary"
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                          onClick={() => setLocation(`/test-cases/execution-details/${f.redmineTicketId}`)}>
                          <BarChart2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Open Execution Sheet"
                          className="text-blue-600 hover:text-blue-800"
                          onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm"
                          onClick={() => confirmDelete([f.id])}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedFiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    {search ? "No files match your search." : "No test case files yet. Create one to get started."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete confirm */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Delete {filesToDelete.length > 1 ? `these ${filesToDelete.length} files` : "this file"}? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={executeDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Test Case File dialog */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>New Test Case File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 38032"
                value={fileForm.redmineTicketId}
                onChange={e => setFileForm({ ...fileForm, redmineTicketId: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={fileForm.title} onChange={e => setFileForm({ ...fileForm, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>QA PIC</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={fileForm.qaPic} onChange={e => setFileForm({ ...fileForm, qaPic: e.target.value })}>
                <option value="">Select QA PIC...</option>
                {qaUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Modules</Label>
              <div className="border rounded-md p-2 max-h-[160px] overflow-y-auto space-y-1">
                {modules.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-2">No modules available.</p>
                  : modules.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input type="checkbox" className="rounded border-gray-300"
                        checked={fileForm.selectedModules.includes(m.id)}
                        onChange={e => setFileForm({
                          ...fileForm,
                          selectedModules: e.target.checked
                            ? [...fileForm.selectedModules, m.id]
                            : fileForm.selectedModules.filter(id => id !== m.id),
                        })} />
                      {m.name}
                    </label>
                  ))
                }
              </div>
              {fileForm.selectedModules.length > 0 && (
                <p className="text-xs text-muted-foreground">{fileForm.selectedModules.length} module(s) selected</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setNewFileOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFile} disabled={!fileForm.redmineTicketId.trim()}>
              <Plus className="w-4 h-4 mr-2" /> Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
