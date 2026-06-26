import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx-js-style";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  AlertCircle,
  Upload,
  FileSpreadsheet,
  X as XIcon,
  Settings2,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { SendVerdictModal, type Verdict } from "@/components/SendVerdictModal";
import { type ContactOption } from "@/components/ContactMultiSelect";
import { getApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchExecutionFiles,
  createExecutionFile,
  deleteExecutionFile,
  fetchModules,
  fetchProjects,
  fetchTrackers,
  saveTestCases,
  type ExecutionFile,
  type ExecutionModule,
  type ExecutionProject,
  type ExecutionTestCase,
  type TrackerOption,
} from "@/lib/execution-api";

// ─── Excel column mappings (same as progress page) ───────────────────────────
const COLUMN_MAPPINGS: Record<string, string[]> = {
  caseId: ["case id", "test case id", "tc id", "id"],
  userStory: ["redmine ticket id", "redmine user story", "user story", "story", "requirement", "requirement id"],
  tracker: ["tracker"],
  scenario: ["scenario", "tracker scenario"],
  preCondition: ["pre condition", "preconditions", "pre-conditions", "precondition"],
  caseName: ["case", "case name", "title"],
  testSteps: ["steps", "test steps", "testing steps"],
  testData: ["test data", "data"],
  expectedResult: ["expected result", "expected outcome", "expected results"],
  result: ["result", "status", "test result"],
  defectNumber: ["redmine defect ticket id", "redmine defect", "defect #", "defect id", "bug id", "redmine id", "redmine defect number"],
  qaPic: ["qa pic", "qa owner", "tester", "assigned qa"],
  comments: ["additional/comments/issues", "additional / comments / issues", "comments", "additional", "issues", "remarks"],
  moduleName: ["module name", "module", "feature"],
};

function normalizeHeader(v: any): string {
  return String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeResult(v: string): string {
  const low = v.toLowerCase().trim();
  if (low === "pass" || low === "passed") return "Passed";
  if (low === "fail" || low === "failed") return "Failed";
  if (low === "block" || low === "blocked") return "Blocked";
  if (low === "in progress" || low === "in-progress" || low === "in_progress") return "In Progress";
  return "Not Executed";
}

async function parseExcelToRows(file: File): Promise<ExecutionTestCase[]> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const rows: ExecutionTestCase[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];

    // Expand merged cells
    if (sheet["!merges"]) {
      (sheet["!merges"] as any[]).forEach((merge) => {
        const startCell = XLSX.utils.encode_cell({ c: merge.s.c, r: merge.s.r });
        const val = sheet[startCell] ? sheet[startCell].v : undefined;
        if (val !== undefined) {
          for (let R = merge.s.r; R <= merge.e.r; ++R) {
            for (let C = merge.s.c; C <= merge.e.c; ++C) {
              const ref = XLSX.utils.encode_cell({ c: C, r: R });
              if (!sheet[ref]) sheet[ref] = { t: "s", v: val };
              else sheet[ref].v = val;
            }
          }
        }
      });
    }

    const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, raw: false });
    if (!rawData.length) continue;

    let headerRow = -1;
    let colMap: Record<string, number> = {};
    let best = 0;

    for (let r = 0; r < Math.min(rawData.length, 30); r++) {
      const row = rawData[r];
      if (!Array.isArray(row)) continue;
      let count = 0;
      const map: Record<string, number> = {};
      row.forEach((cell, ci) => {
        const norm = normalizeHeader(cell);
        for (const [key, syns] of Object.entries(COLUMN_MAPPINGS)) {
          if (syns.includes(norm)) { map[key] = ci; count++; break; }
        }
      });
      if (count > best && map["caseId"] !== undefined && map["testSteps"] !== undefined) {
        best = count; colMap = map; headerRow = r;
      }
    }

    if (headerRow === -1) continue;

    let currentModule = "";
    for (let r = headerRow + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const ext: Record<string, string> = {};
      let hasData = false;
      for (const [key, ci] of Object.entries(colMap)) {
        const val = row[ci];
        if (val !== undefined && val !== null && String(val).trim()) {
          ext[key] = String(val).trim(); hasData = true;
        } else {
          ext[key] = "";
        }
      }
      if (!hasData) continue;

      // Module header row detection (all values identical)
      const vals = Object.values(ext).filter(v => v);
      if (vals.length > 1 && vals.every(v => v === vals[0])) {
        currentModule = vals[0];
        continue;
      }

      rows.push({
        id: `xl-${r}-${Math.random().toString(36).slice(2, 7)}`,
        moduleName: ext.moduleName || currentModule || "",
        caseId: ext.caseId || "",
        userStory: ext.userStory || "",
        tracker: ext.tracker || "",
        scenario: ext.scenario || "",
        preCondition: ext.preCondition || "",
        caseName: ext.caseName || "",
        testSteps: ext.testSteps || "",
        testData: ext.testData || "",
        expectedResult: ext.expectedResult || "",
        result: normalizeResult(ext.result || ""),
        defectNumber: ext.defectNumber || "",
        comments: ext.comments || "",
        qaPic: ext.qaPic || "",
      });
    }
  }
  return rows;
}

// ─── Task / progress types ────────────────────────────────────────────────────
const TASK_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200" },
  uat: { label: "UAT", color: "bg-purple-100 text-purple-700 border-purple-200" },
  done: { label: "Done", color: "bg-green-100 text-green-700 border-green-200" },
  released_to_production: { label: "Released", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  blocked: { label: "Blocked", color: "bg-red-100 text-red-700 border-red-200" },
  on_hold: { label: "On Hold", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

type SortKey = "redmineTicketId" | "title" | "updatedAt" | "status";
type SortDir = "asc" | "desc";

type ProgressData = Record<string, {
  total: number; passed: number; failed: number;
  blocked: number; inProgress: number; notExecuted: number;
}>;

interface TaskInfo {
  id: number;
  redmineId: string;
  status: string;
  name: string;
  assigneeNames: string[];
  priority?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Low: "bg-green-100 text-green-700 border-green-200",
};

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

// ─── Main component ───────────────────────────────────────────────────────────
export default function TestCasesExecution() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<ExecutionFile[]>([]);
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [projects, setProjects] = useState<ExecutionProject[]>([]);
  const [requirements, setRequirements] = useState<{ id: number; title: string; projectId?: number | null; module?: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressData>({});
  const [tasks, setTasks] = useState<TaskInfo[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [users, setUsers] = useState<any[]>([]);
  const environments = [
    { id: 1, name: "Env 1" }, { id: 2, name: "Env 2" }, { id: 3, name: "Env 3" },
    { id: 4, name: "Env 4" }, { id: 5, name: "Env 5" }, { id: 6, name: "Env 6" },
    { id: 7, name: "Env 7" },
  ];

  const DEFAULT_QUICK_FORM = {
    name: "", redmineId: "", status: "new", priority: "Medium",
    projectId: "",
    assigneeIds: [] as number[], environmentIds: [] as number[],
    startDate: "", dueDate: "", actualStartDate: "", actualEndDate: "",
    estimatedHours: "", actualHours: "", completionPercentage: "", notes: "",
  };

  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskForm, setQuickTaskForm] = useState(DEFAULT_QUICK_FORM);
  const [quickTaskModules, setQuickTaskModules] = useState<number[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const toggleQuickTaskArrayItem = (key: "assigneeIds" | "environmentIds", id: number) => {
    setQuickTaskForm(prev => {
      const arr = prev[key] || [];
      return { ...prev, [key]: arr.includes(id) ? arr.filter(i => i !== id) : [...arr, id] };
    });
  };

  const [trackers, setTrackers] = useState<TrackerOption[]>([]);

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [fileForm, setFileForm] = useState({
    redmineTicketId: "",
    title: "",
    remarks: "",
    requirementId: "",
    projectId: "",
    tracker: "",
    selectedModules: [] as number[],
  });
  const [parsedExcelRows, setParsedExcelRows] = useState<ExecutionTestCase[] | null>(null);
  const [excelFileName, setExcelFileName] = useState("");
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Redmine ticket ID auto-lookup state
  const [ticketLookupLoading, setTicketLookupLoading] = useState(false);
  const [ticketLookupMsg, setTicketLookupMsg] = useState<{ type: "info" | "warn" | "error"; text: string } | null>(null);
  const ticketLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // TC copy dialog
  const [tcCopyDialog, setTcCopyDialog] = useState<{
    open: boolean;
    tcs: any[];
    pendingFileTicketId: string;
  }>({ open: false, tcs: [], pendingFileTicketId: "" });
  const [pendingCreatePayload, setPendingCreatePayload] = useState<any>(null);

  const [editFileOpen, setEditFileOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<ExecutionFile | null>(null);
  const editModulesInitRef = useRef(false);
  const [editFileForm, setEditFileForm] = useState({
    redmineTicketId: "",
    title: "",
    remarks: "",
    requirementId: "",
    projectId: "",
    tracker: "",
    selectedModules: [] as number[],
  });
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [verdictFile, setVerdictFile] = useState<ExecutionFile | null>(null);
  const [sendVerdictOpen, setSendVerdictOpen] = useState(false);
  const [isSendingVerdict, setIsSendingVerdict] = useState(false);

  const openEditFile = (f: ExecutionFile) => {
    editModulesInitRef.current = false;
    setEditingFile(f);
    setEditFileForm({
      redmineTicketId: f.redmineTicketId,
      title: tasks.find(t => t.redmineId === f.redmineTicketId)?.name || f.title || "",
      remarks: f.remarks || "",
      requirementId: f.requirementId ? String(f.requirementId) : "",
      projectId: f.projectId ? String(f.projectId) : "",
      tracker: f.tracker || "",
      selectedModules: [],
    });
    setEditFileOpen(true);
  };

  // Reactive module pre-selection — runs after dialog opens OR after modules finish loading
  useEffect(() => {
    if (!editFileOpen) { editModulesInitRef.current = false; return; }
    if (editModulesInitRef.current || modules.length === 0 || !editingFile) return;
    const storedNames = (editingFile.selectedModules || "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const ids = modules.filter(m => storedNames.includes(m.name.trim().toLowerCase())).map(m => m.id);
    setEditFileForm(prev => ({ ...prev, selectedModules: ids }));
    editModulesInitRef.current = true;
  }, [editFileOpen, modules, editingFile]);

  const handleSaveEditFile = async () => {
    if (!editingFile) return;
    if (!editFileForm.redmineTicketId.trim()) {
      toast({ variant: "destructive", title: "Redmine Ticket ID is required" });
      return;
    }
    setIsSavingFile(true);
    const selectedModuleNames = editFileForm.selectedModules
      .map(id => modules.find(m => m.id === id)?.name)
      .filter(Boolean)
      .join(",");
    try {
      const res = await fetch(`/api/execution-files/${editingFile.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
          redmineTicketId: editFileForm.redmineTicketId.trim(),
          title: editFileForm.title.trim() || null,
          remarks: editFileForm.remarks.trim() || null,
          projectId: editFileForm.projectId ? Number(editFileForm.projectId) : null,
          requirementId: editFileForm.requirementId ? Number(editFileForm.requirementId) : null,
          selectedModules: selectedModuleNames || null,
          tracker: editFileForm.tracker || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: err.error || "Failed to save" });
        return;
      }
      const updated = await res.json();
      setFiles(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));

      // Update linked task: name sync + re-link if Redmine No. changed
      const oldTicketId = editingFile.redmineTicketId;
      const newTicketId = updated.redmineTicketId;
      const linkedTask = tasks.find(t => t.redmineId === oldTicketId);
      if (linkedTask) {
        const taskPatch: Record<string, any> = {};
        if (oldTicketId !== newTicketId) taskPatch.redmineId = newTicketId;
        if (editFileForm.title.trim()) taskPatch.name = editFileForm.title.trim();
        if (Object.keys(taskPatch).length > 0) {
          await fetch(`/api/tasks/${linkedTask.id}`, {
            method: "PATCH",
            headers: getHeaders(),
            body: JSON.stringify(taskPatch),
          }).catch(() => {});
          setTasks(prev => prev.map(t => t.id === linkedTask.id ? { ...t, ...taskPatch } : t));
        }
      }

      toast({ title: "Execution file updated" });
      setEditFileOpen(false);
    } finally {
      setIsSavingFile(false);
    }
  };

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
      fetchProjects(),
      fetchTrackers(),
      fetch("/api/execution-progress", { headers: getHeaders() }).then(r => r.ok ? r.json() : {}),
      fetch("/api/tasks", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
      fetch("/api/requirements", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
      fetch("/api/users", { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([filesData, modulesData, projectsData, trackersData, progressData, tasksData, reqsData, usersData]) => {
        setFiles(filesData);
        setModules(modulesData);
        setProjects(projectsData || []);
        setTrackers(trackersData || []);
        setRequirements(reqsData || []);
        setProgress(progressData || {});
        setUsers(usersData || []);
        setTasks((tasksData || []).filter((t: any) => t.redmineId).map((t: any) => ({
          id: t.id,
          redmineId: String(t.redmineId),
          status: t.status,
          name: t.name,
          assigneeNames: t.assigneeNames || [],
          priority: t.priority || "",
        })));
      })
      .catch(() => toast({ variant: "destructive", title: "Failed to load data" }))
      .finally(() => setIsLoading(false));
  }, [toast]);

  const getTaskForFile = (f: ExecutionFile) =>
    tasks.find(t => t.redmineId === f.redmineTicketId);

  const isFullyExecuted = (prog: ProgressData[string] | undefined) =>
    !!prog && prog.total > 0 && prog.passed === prog.total;

  const getVerdict = (prog: ProgressData[string]): Verdict =>
    prog.failed === 0 && prog.blocked === 0 ? "PASS" : "CONDITIONAL SIGN OFF";

  const handleSendVerdict = async (to: ContactOption[], cc: ContactOption[], reason: string) => {
    if (!verdictFile) return;
    const prog = progress[verdictFile.redmineTicketId];
    const task = getTaskForFile(verdictFile);
    const project = projects.find(p => p.id === verdictFile.projectId);
    setIsSendingVerdict(true);
    try {
      const verdict = getVerdict(prog);
      const res = await fetch(`${getApiUrl()}/pmo/send-verdict`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          redmineId: verdictFile.redmineTicketId,
          issueType: "Issue",
          issueSubject: task?.name || verdictFile.title || "",
          projectName: project?.name || "",
          verdict,
          reason,
          to,
          cc,
          senderName: user?.name || "QA Team",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Failed to send verdict");
      toast({ title: "Verdict sent!", description: "Verdict email delivered to selected recipients." });
      setSendVerdictOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Send Failed", description: err.message });
    } finally {
      setIsSendingVerdict(false);
    }
  };

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
      false
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

  // ─── Requirement auto-fill ─────────────────────────────────────────────────
  const handleRequirementChange = (reqId: string) => {
    const req = requirements.find((r: any) => String(r.id) === reqId);
    const updatedForm = { ...fileForm, requirementId: reqId };

    if (req) {
      // Auto-fill project
      if (req.projectId) updatedForm.projectId = String(req.projectId);
      // Auto-fill module: find execution module matching the requirement's module name
      if (req.module) {
        const matchedMod = modules.find(m => m.name.toLowerCase() === req.module.toLowerCase());
        if (matchedMod && !updatedForm.selectedModules.includes(matchedMod.id)) {
          updatedForm.selectedModules = [matchedMod.id];
        }
      }
    }

    setFileForm(updatedForm);
  };

  // ─── Redmine ticket ID lookup ──────────────────────────────────────────────

  // Debounced auto-lookup when ticket ID changes
  useEffect(() => {
    const ticketId = fileForm.redmineTicketId.trim();
    if (ticketLookupTimer.current) clearTimeout(ticketLookupTimer.current);
    if (!ticketId) { setTicketLookupMsg(null); return; }

    ticketLookupTimer.current = setTimeout(async () => {
      // Duplicate check
      const duplicate = files.find(f => f.redmineTicketId === ticketId);
      if (duplicate) {
        setTicketLookupMsg({ type: "error", text: `Redmine ID #${ticketId} already exists in Test Case Files (${duplicate.title || "Untitled"}).` });
        return;
      }

      setTicketLookupLoading(true);
      try {
        const res = await fetch(`${getApiUrl()}/requirements/by-redmine/${ticketId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.found && data.requirement) {
          const req = data.requirement;
          const matchedMod = req.module
            ? modules.find((m: any) => m.name.trim().toLowerCase() === req.module.trim().toLowerCase())
            : null;
          setFileForm(prev => ({
            ...prev,
            requirementId: String(req.id),
            title: req.title || prev.title,
            projectId: req.projectId ? String(req.projectId) : prev.projectId,
            tracker: req.tracker || prev.tracker,
            selectedModules: matchedMod ? [matchedMod.id] : prev.selectedModules,
          }));
          setTicketLookupMsg({ type: "info", text: `Requirement found: "${req.title}" — fields auto-filled.` });
        } else {
          setTicketLookupMsg({ type: "warn", text: "No requirement found locally. On create, the ticket will be fetched from Redmine and saved as a requirement." });
        }
      } catch {
        // silently ignore
      } finally {
        setTicketLookupLoading(false);
      }
    }, 600);

    return () => { if (ticketLookupTimer.current) clearTimeout(ticketLookupTimer.current); };
  }, [fileForm.redmineTicketId, files, modules, token]);

  // ─── Excel upload ──────────────────────────────────────────────────────────
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsingExcel(true);
    try {
      const rows = await parseExcelToRows(file);
      setParsedExcelRows(rows);
      setExcelFileName(file.name);
      if (rows.length === 0) {
        toast({ variant: "destructive", title: "No rows found in Excel file. Check the column headers." });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to parse Excel file" });
      setParsedExcelRows(null);
      setExcelFileName("");
    } finally {
      setIsParsingExcel(false);
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const clearExcel = () => {
    setParsedExcelRows(null);
    setExcelFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Create file ───────────────────────────────────────────────────────────
  const resetFileForm = () => {
    setFileForm({ redmineTicketId: "", title: "", remarks: "", requirementId: "", projectId: "", tracker: "", selectedModules: [] });
    setTicketLookupMsg(null);
    clearExcel();
  };

  const doCreateFile = async (copyTcs: any[] | null) => {
    setIsCreating(true);
    try {
      const selectedModuleNames = fileForm.selectedModules
        .map(id => modules.find(m => m.id === id)?.name)
        .filter(Boolean).join(",");

      let resolvedRequirementId = fileForm.requirementId ? Number(fileForm.requirementId) : undefined;

      // If no requirement linked, fetch from Redmine and save
      if (!resolvedRequirementId && fileForm.redmineTicketId) {
        try {
          const importRes = await fetch(`${getApiUrl()}/requirements/import-redmine`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              ticketId: fileForm.redmineTicketId.trim(),
              module: selectedModuleNames || "",
              projectId: fileForm.projectId ? Number(fileForm.projectId) : undefined,
              trackerFilter: fileForm.tracker || undefined,
            }),
          });
          if (importRes.ok) {
            const importData = await importRes.json();
            if (importData.requirement?.id) {
              resolvedRequirementId = importData.requirement.id;
              // Update form so UI reflects the linked requirement
              setFileForm(f => ({ ...f, requirementId: String(importData.requirement.id) }));
            }
          }
        } catch {
          // Non-fatal — continue without requirement link
        }
      }

      const newFile = await createExecutionFile({
        redmineTicketId: fileForm.redmineTicketId.trim(),
        title: fileForm.title || undefined,
        remarks: fileForm.remarks || undefined,
        selectedModules: selectedModuleNames || undefined,
        tracker: fileForm.tracker || undefined,
        projectId: fileForm.projectId ? Number(fileForm.projectId) : undefined,
        requirementId: resolvedRequirementId,
      });

      setFiles([newFile, ...files]);
      setNewFileOpen(false);
      resetFileForm();
      setTicketLookupMsg(null);

      // Determine which TCs to save
      let rowsToSave: ExecutionTestCase[] | null = null;
      if (copyTcs && copyTcs.length > 0) {
        rowsToSave = copyTcs.map((tc: any, i: number) => ({
          moduleName: tc.module || "",
          caseId: tc.caseId || "",
          libraryTcId: tc.id,
          userStory: "",
          tracker: tc.tracker || "",
          scenario: tc.scenario || "",
          preCondition: tc.preCondition || "",
          caseName: tc.title || "",
          testSteps: tc.testSteps || "",
          testData: tc.testData || "",
          expectedResult: tc.expectedResult || "",
          result: "",
          defectNumber: "",
          comments: "",
          qaPic: "",
          rowOrder: i,
        }));
      } else if (parsedExcelRows && parsedExcelRows.length > 0) {
        rowsToSave = parsedExcelRows;
      }

      if (rowsToSave && rowsToSave.length > 0) {
        try {
          await saveTestCases(newFile.redmineTicketId, rowsToSave, []);
          toast({ title: `File created with ${rowsToSave.length} test case(s) imported` });
        } catch {
          toast({ variant: "destructive", title: "File created but test cases failed to import. Open the file to retry." });
        }
      } else {
        toast({ title: "Test Case File created" });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to create file. Ticket ID might already exist." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateFile = async () => {
    if (!fileForm.redmineTicketId.trim()) return;
    if (!fileForm.projectId) {
      toast({ variant: "destructive", title: "Project is required" });
      return;
    }
    if (fileForm.selectedModules.length === 0) {
      toast({ variant: "destructive", title: "At least one module must be selected" });
      return;
    }

    // If requirement already linked locally, check for existing TCs first
    if (fileForm.requirementId) {
      try {
        const res = await fetch(`${getApiUrl()}/requirements/${fileForm.requirementId}/test-cases`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const tcs = await res.json();
        if (Array.isArray(tcs) && tcs.length > 0) {
          setTcCopyDialog({ open: true, tcs, pendingFileTicketId: fileForm.redmineTicketId });
          return;
        }
      } catch {
        // ignore — proceed
      }
    }

    // No local requirement — doCreateFile will fetch from Redmine, then proceed
    await doCreateFile(null);
  };

  const handleCreateQuickTask = async () => {
    if (!quickTaskForm.name.trim() || !quickTaskForm.projectId || quickTaskModules.length === 0) {
      toast({ variant: "destructive", title: "Task name, project, and module are required" });
      return;
    }
    setIsCreatingTask(true);
    try {
      const token = localStorage.getItem("qa_pulse_token");
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: quickTaskForm.name.trim(),
          redmineId: quickTaskForm.redmineId || undefined,
          status: quickTaskForm.status,
          priority: quickTaskForm.priority,
          projectId: quickTaskForm.projectId ? Number(quickTaskForm.projectId) : undefined,
          moduleId: quickTaskModules[0],
          moduleIds: quickTaskModules.join(","),
          assigneeIds: quickTaskForm.assigneeIds.length ? quickTaskForm.assigneeIds : undefined,
          environmentIds: quickTaskForm.environmentIds.length ? quickTaskForm.environmentIds : undefined,
          startDate: quickTaskForm.startDate || undefined,
          dueDate: quickTaskForm.dueDate || undefined,
          actualStartDate: quickTaskForm.actualStartDate || undefined,
          actualEndDate: quickTaskForm.actualEndDate || undefined,
          estimatedHours: quickTaskForm.estimatedHours ? Number(quickTaskForm.estimatedHours) : undefined,
          actualHours: quickTaskForm.actualHours ? Number(quickTaskForm.actualHours) : undefined,
          completionPercentage: quickTaskForm.completionPercentage ? Number(quickTaskForm.completionPercentage) : undefined,
          notes: quickTaskForm.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const tasksData = await fetch("/api/tasks", { headers }).then(r => r.ok ? r.json() : []);
      setTasks((tasksData || []).filter((t: any) => t.redmineId).map((t: any) => ({
        id: t.id,
        redmineId: String(t.redmineId),
        status: t.status,
        name: t.name,
        assigneeNames: t.assigneeNames || [],
        priority: t.priority || "",
      })));
      toast({ title: "Task created successfully" });
      setQuickTaskOpen(false);
      setQuickTaskForm(DEFAULT_QUICK_FORM);
      setQuickTaskModules([]);
    } catch {
      toast({ variant: "destructive", title: "Failed to create task" });
    } finally {
      setIsCreatingTask(false);
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

  const canCreate = !!fileForm.redmineTicketId.trim() && !!fileForm.projectId && fileForm.selectedModules.length > 0 && ticketLookupMsg?.type !== "error";

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
              <Input placeholder="Search ticket, title..." className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
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
                <TableHead className="border-r border-border px-4 py-3">Assignee</TableHead>
                <TableHead className="border-r border-border px-4 py-3">Priority</TableHead>
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
                    <TableCell className="border-r border-border">{getTaskForFile(f)?.name || f.title || "—"}</TableCell>
                    <TableCell className="border-r border-border">{task?.assigneeNames?.join(", ") || "—"}</TableCell>
                    <TableCell className="border-r border-border">
                      {task?.priority ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[task.priority] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          {task.priority}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="border-r border-border py-2">
                      <MiniProgressBar data={prog} />
                    </TableCell>
                    <TableCell className="border-r border-border">
                      {statusInfo ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            setQuickTaskForm({ ...DEFAULT_QUICK_FORM, redmineId: f.redmineTicketId, name: f.title || "", projectId: f.projectId ? String(f.projectId) : "" });
                            const preSelectedIds = f.selectedModules
                              ? f.selectedModules.split(",").map((s: string) => s.trim().toLowerCase())
                                  .flatMap((name: string) => modules.filter(m => m.name.trim().toLowerCase() === name).map(m => m.id))
                              : [];
                            setQuickTaskModules(preSelectedIds);
                            setQuickTaskOpen(true);
                          }}
                        >
                          <AlertCircle className="w-3 h-3" /> No task
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="border-r border-border text-muted-foreground text-sm">
                      {format(new Date(f.updatedAt), "dd MMM yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {task && isFullyExecuted(prog) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Send Verdict Now"
                            className="text-green-600 hover:text-green-800 hover:bg-green-50"
                            onClick={e => {
                              e.stopPropagation();
                              setVerdictFile(f);
                              setSendVerdictOpen(true);
                            }}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" title="View Execution Summary"
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                          onClick={() => setLocation(`/test-cases/execution-details/${f.redmineTicketId}`)}>
                          <BarChart2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Edit File Info"
                          className="text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                          onClick={() => openEditFile(f)}>
                          <Settings2 className="w-4 h-4" />
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
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
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

      {/* New Task dialog */}
      <Dialog open={quickTaskOpen} onOpenChange={open => { setQuickTaskOpen(open); if (!open) { setQuickTaskForm(DEFAULT_QUICK_FORM); setQuickTaskModules([]); } }}>
        <DialogContent className="max-w-3xl w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* GROUP 1: Core Identifiers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Task Name *</Label>
                <Input placeholder="Task name" value={quickTaskForm.name} onChange={e => setQuickTaskForm({ ...quickTaskForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Redmine ID</Label>
                <Input placeholder="e.g. 29303" value={quickTaskForm.redmineId} onChange={e => setQuickTaskForm({ ...quickTaskForm, redmineId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <SearchableSelect value={quickTaskForm.status} onValueChange={v => setQuickTaskForm({ ...quickTaskForm, status: v })}
                  options={[
                    { value: "new", label: "New" },
                    { value: "pending", label: "Pending" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "blocked", label: "Blocked" },
                    { value: "uat", label: "UAT" },
                    { value: "sit", label: "SIT" },
                    { value: "done", label: "Done" },
                    { value: "released_to_production", label: "Released" },
                  ]}
                  searchPlaceholder="Search status..."
                />
              </div>
            </div>

            {/* GROUP 2: Classification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border p-4 rounded-lg bg-muted/5">
              <div className="space-y-1.5">
                <Label>Project <span className="text-destructive">*</span></Label>
                <SearchableSelect value={quickTaskForm.projectId} onValueChange={v => setQuickTaskForm({ ...quickTaskForm, projectId: v })}
                  options={projects.map(p => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select Project..."
                  searchPlaceholder="Search project..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <SearchableSelect value={quickTaskForm.priority} onValueChange={v => setQuickTaskForm({ ...quickTaskForm, priority: v })}
                  options={[
                    { value: "Critical", label: "Critical" },
                    { value: "High", label: "High" },
                    { value: "Medium", label: "Medium" },
                    { value: "Low", label: "Low" },
                  ]}
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Module <span className="text-destructive">*</span></Label>
                <div className="border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5">
                  {modules.map(m => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={quickTaskModules.includes(m.id)}
                        onCheckedChange={(checked) => setQuickTaskModules(prev => checked ? [...prev, m.id] : prev.filter(id => id !== m.id))}
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
                {quickTaskModules.length > 0 && <p className="text-xs text-muted-foreground">{quickTaskModules.length} selected</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Environment(s)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal overflow-hidden min-h-9 h-auto py-1.5 px-3">
                      {quickTaskForm.environmentIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {quickTaskForm.environmentIds.map(id => {
                            const env = environments.find(e => e.id === id);
                            return <Badge key={id} variant="secondary" className="font-normal text-xs py-0 h-5">{env?.name || `ID: ${id}`}</Badge>;
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select Environments...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search environments..." />
                      <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>No environment found.</CommandEmpty>
                        <CommandGroup>
                          {environments.map(env => (
                            <CommandItem key={env.id} onSelect={() => toggleQuickTaskArrayItem("environmentIds", env.id)} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={quickTaskForm.environmentIds.includes(env.id)} className="pointer-events-none" />
                              {env.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Assignee(s) (QA PIC)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal overflow-hidden min-h-9 h-auto py-1.5 px-3">
                      {quickTaskForm.assigneeIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {quickTaskForm.assigneeIds.map(id => {
                            const u = users.find((u: any) => u.id === id);
                            return <Badge key={id} variant="secondary" className="font-normal text-xs py-0 h-5">{u?.name || `ID: ${id}`}</Badge>;
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select QA PICs...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search QA..." />
                      <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>No QA found.</CommandEmpty>
                        <CommandGroup>
                          {users.filter((u: any) => u.role === "qa_member" || u.role === "qa_lead").map((u: any) => (
                            <CommandItem key={u.id} onSelect={() => toggleQuickTaskArrayItem("assigneeIds", u.id)} className="flex items-center gap-2 cursor-pointer">
                              <Checkbox checked={quickTaskForm.assigneeIds.includes(u.id)} className="pointer-events-none" />
                              <Avatar className="w-5 h-5">
                                <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{u.name.substring(0, 2)}</AvatarFallback>
                              </Avatar>
                              {u.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* GROUP 3: Scheduling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Planned Start Date</Label>
                <Input type="date" value={quickTaskForm.startDate} onChange={e => setQuickTaskForm({ ...quickTaskForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Planned End Date</Label>
                <Input type="date" value={quickTaskForm.dueDate} onChange={e => setQuickTaskForm({ ...quickTaskForm, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Actual Start Date</Label>
                <Input type="date" value={quickTaskForm.actualStartDate} onChange={e => setQuickTaskForm({ ...quickTaskForm, actualStartDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Actual End Date</Label>
                <Input type="date" value={quickTaskForm.actualEndDate} onChange={e => setQuickTaskForm({ ...quickTaskForm, actualEndDate: e.target.value })} />
              </div>
            </div>

            {/* GROUP 4: Metrics & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Est. Hours</Label>
                <Input type="number" step="0.5" min="0" value={quickTaskForm.estimatedHours} onChange={e => setQuickTaskForm({ ...quickTaskForm, estimatedHours: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Actual Hours</Label>
                <Input type="number" step="0.5" min="0" value={quickTaskForm.actualHours} onChange={e => setQuickTaskForm({ ...quickTaskForm, actualHours: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Completion %</Label>
                <Input type="number" min="0" max="100" value={quickTaskForm.completionPercentage} onChange={e => setQuickTaskForm({ ...quickTaskForm, completionPercentage: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Additional context..." rows={3} value={quickTaskForm.notes} onChange={e => setQuickTaskForm({ ...quickTaskForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setQuickTaskOpen(false)} disabled={isCreatingTask}>Cancel</Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleCreateQuickTask}
              disabled={!quickTaskForm.name.trim() || !quickTaskForm.projectId || quickTaskModules.length === 0 || isCreatingTask}
            >
              {isCreatingTask ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Test Case File dialog */}
      <Dialog open={newFileOpen} onOpenChange={(open) => { setNewFileOpen(open); if (!open) resetFileForm(); }}>
        <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>New Test Case File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Redmine Ticket ID */}
            <div className="space-y-1">
              <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  placeholder="e.g. 38032"
                  value={fileForm.redmineTicketId}
                  onChange={e => setFileForm({ ...fileForm, redmineTicketId: e.target.value.replace(/\D/g, "") })}
                />
                {ticketLookupLoading && (
                  <div className="absolute right-2 top-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              {ticketLookupMsg && (
                <p className={`text-xs mt-1 ${ticketLookupMsg.type === "info" ? "text-green-600" : ticketLookupMsg.type === "error" ? "text-red-600" : "text-yellow-600"}`}>
                  {ticketLookupMsg.text}
                </p>
              )}
            </div>

            {/* Requirement (optional) */}
            <div className="space-y-1">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional — auto-fills Project & Module)</span></Label>
              <SearchableSelect
                value={fileForm.requirementId}
                onValueChange={handleRequirementChange}
                options={[
                  { value: "", label: "None" },
                  ...requirements.map((r: any) => ({ value: String(r.id), label: r.title })),
                ]}
                placeholder="Search requirement..."
              />
            </div>

            {/* Project (mandatory) */}
            <div className="space-y-1">
              <Label>Project <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={fileForm.projectId}
                onValueChange={v => setFileForm({ ...fileForm, projectId: v })}
                options={[
                  { value: "", label: "Select project..." },
                  ...projects.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Search project..."
              />
            </div>

            {/* Module (mandatory, multi-select) */}
            <div className="space-y-1">
              <Label>Module <span className="text-destructive">*</span></Label>
              <div className="border rounded-md p-2 max-h-[150px] overflow-y-auto space-y-1">
                {modules.length === 0
                  ? <p className="text-sm text-muted-foreground text-center py-2">No modules available.</p>
                  : modules.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={fileForm.selectedModules.includes(m.id)}
                        onChange={e => setFileForm({
                          ...fileForm,
                          selectedModules: e.target.checked
                            ? [...fileForm.selectedModules, m.id]
                            : fileForm.selectedModules.filter(id => id !== m.id),
                        })}
                      />
                      {m.name}
                    </label>
                  ))
                }
              </div>
              {fileForm.selectedModules.length > 0 && (
                <p className="text-xs text-muted-foreground">{fileForm.selectedModules.length} module(s) selected</p>
              )}
            </div>

            {/* Tracker */}
            <div className="space-y-1">
              <Label>Tracker</Label>
              <SearchableSelect
                value={fileForm.tracker}
                onValueChange={v => setFileForm({ ...fileForm, tracker: v })}
                options={[
                  { value: "", label: "None" },
                  ...trackers.map(t => ({ value: t.name, label: t.name })),
                  ...(fileForm.tracker && !trackers.some(t => t.name === fileForm.tracker)
                    ? [{ value: fileForm.tracker, label: fileForm.tracker }]
                    : []),
                ]}
                placeholder="Select tracker..."
                searchPlaceholder="Search tracker..."
              />
            </div>

            {/* Remarks */}
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Input value={fileForm.remarks} onChange={e => setFileForm({ ...fileForm, remarks: e.target.value })} />
            </div>

            {/* Excel upload */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4 text-green-600" />
                Import from Excel <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              {excelFileName ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                  <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-800 truncate">{excelFileName}</p>
                    <p className="text-xs text-green-600">
                      {parsedExcelRows ? `${parsedExcelRows.length} test case(s) ready to import` : "Parsing..."}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-700 hover:text-red-600" onClick={clearExcel}>
                    <XIcon className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-md p-3 hover:bg-muted/30 transition-colors">
                  {isParsingExcel
                    ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    : <Upload className="w-4 h-4 text-muted-foreground" />
                  }
                  <span className="text-sm text-muted-foreground">
                    {isParsingExcel ? "Parsing file..." : "Click to upload .xlsx / .xls"}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={isParsingExcel}
                    onChange={handleExcelUpload}
                  />
                </label>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => { setNewFileOpen(false); resetFileForm(); }} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={!canCreate || isCreating || isParsingExcel}>
              {isCreating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</>
                : <><Plus className="w-4 h-4 mr-2" /> Create File</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit File Info dialog */}
      <Dialog open={editFileOpen} onOpenChange={setEditFileOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[520px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit File Info</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-1">
              <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. 38032"
                value={editFileForm.redmineTicketId}
                onChange={e => setEditFileForm(f => ({ ...f, redmineTicketId: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                placeholder="Execution file title"
                value={editFileForm.title}
                onChange={e => setEditFileForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <SearchableSelect
                value={editFileForm.requirementId}
                onValueChange={v => {
                  const req = requirements.find((r: any) => String(r.id) === v);
                  const updated = { ...editFileForm, requirementId: v };
                  if (req?.projectId) updated.projectId = String(req.projectId);
                  setEditFileForm(updated);
                }}
                options={[
                  { value: "", label: "None" },
                  ...requirements.map((r: any) => ({ value: String(r.id), label: r.title })),
                ]}
                placeholder="Search requirement..."
              />
            </div>
            <div className="space-y-1">
              <Label>Project</Label>
              <SearchableSelect
                value={editFileForm.projectId}
                onValueChange={v => setEditFileForm(f => ({ ...f, projectId: v }))}
                options={[
                  { value: "", label: "Select project..." },
                  ...projects.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Search project..."
              />
            </div>
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
                        checked={editFileForm.selectedModules.includes(m.id)}
                        onChange={e => setEditFileForm(f => ({
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
              {editFileForm.selectedModules.length > 0 && (
                <p className="text-xs text-muted-foreground">{editFileForm.selectedModules.length} module(s) selected</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Tracker</Label>
              <SearchableSelect
                value={editFileForm.tracker}
                onValueChange={v => setEditFileForm(f => ({ ...f, tracker: v }))}
                options={[
                  { value: "", label: "None" },
                  ...trackers.map(t => ({ value: t.name, label: t.name })),
                  ...(editFileForm.tracker && !trackers.some(t => t.name === editFileForm.tracker)
                    ? [{ value: editFileForm.tracker, label: editFileForm.tracker }]
                    : []),
                ]}
                placeholder="Select tracker..."
                searchPlaceholder="Search tracker..."
              />
            </div>
            <div className="space-y-1">
              <Label>Remarks</Label>
              <Input
                value={editFileForm.remarks}
                onChange={e => setEditFileForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setEditFileOpen(false)} disabled={isSavingFile}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditFile} disabled={!editFileForm.redmineTicketId.trim() || isSavingFile}>
              {isSavingFile ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TC Copy Dialog */}
      <Dialog open={tcCopyDialog.open} onOpenChange={open => !open && setTcCopyDialog(d => ({ ...d, open: false }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy Test Cases?</DialogTitle>
            <DialogDescription>
              {tcCopyDialog.tcs.length} test case(s) are linked to this requirement. Do you want to copy them into the new execution file?
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto border rounded-md divide-y text-sm">
            {tcCopyDialog.tcs.map((tc: any) => (
              <div key={tc.id} className="px-3 py-2 flex gap-2 items-start">
                <span className="font-mono text-xs text-muted-foreground shrink-0">{tc.caseId || `#${tc.id}`}</span>
                <span>{tc.title}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={async () => {
              setTcCopyDialog(d => ({ ...d, open: false }));
              await doCreateFile(null);
            }}>
              No, create empty
            </Button>
            <Button onClick={async () => {
              const tcs = tcCopyDialog.tcs;
              setTcCopyDialog(d => ({ ...d, open: false }));
              await doCreateFile(tcs);
            }}>
              Yes, copy {tcCopyDialog.tcs.length} TC(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {verdictFile && (
        <SendVerdictModal
          open={sendVerdictOpen}
          onClose={() => setSendVerdictOpen(false)}
          verdict="PASS"
          redmineId={verdictFile.redmineTicketId}
          issueType="Issue"
          issueSubject={getTaskForFile(verdictFile)?.name || verdictFile.title || ""}
          onSend={handleSendVerdict}
          isSending={isSendingVerdict}
        />
      )}
    </div>
  );
}
