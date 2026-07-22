import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MilestonePicker } from "@/components/MilestonePicker";
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
  Copy,
  Clock,
  MoreHorizontal,
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

// A milestone doesn't have one phase the way a requirement does — its
// requirements can each independently be at a different point — so this is a
// breakdown count ("2 Testing · 1 Development"), not a single status badge.
// Same bucket names/colors as Tasks.tsx's PHASE_CLASSES for consistency.
const PHASE_BREAKDOWN_ORDER: { key: "requirement" | "development" | "testing" | "uat"; label: string; color: string }[] = [
  { key: "requirement", label: "Requirement", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { key: "development", label: "Development", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "testing", label: "Testing", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { key: "uat", label: "UAT", color: "bg-violet-100 text-violet-700 border-violet-200" },
];

function MilestonePhaseBreakdown({ breakdown }: { breakdown: ExecutionFile["milestonePhaseBreakdown"] }) {
  if (!breakdown) return <span className="text-muted-foreground text-xs">—</span>;
  const parts = PHASE_BREAKDOWN_ORDER.filter((p) => breakdown[p.key] > 0);
  if (parts.length === 0) return <span className="text-muted-foreground text-xs italic">No requirements yet</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((p) => (
        <span key={p.key} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${p.color}`}>
          {breakdown[p.key]} {p.label}
        </span>
      ))}
    </div>
  );
}

function MiniProgressBar({ data }: { data: ProgressData[string] | undefined }) {
  if (!data || data.total === 0) {
    return <span className="text-xs text-muted-foreground italic">No data</span>;
  }
  const { total, passed, failed, blocked, inProgress, notExecuted } = data;
  const pct = (n: number) => Math.round((n / total) * 100);
  const executedPct = pct(passed + failed + blocked);
  // Headline figure is pass rate (passed/total), not "how much has run" —
  // the bar below still shows the full pass/fail/blocked/in-progress/not-run
  // breakdown, this is just what's most useful to scan at a glance.
  const passPct = pct(passed);
  const pctStr = (n: number) => `${pct(n)}%`;
  const pctColor = executedPct === 0
    ? "text-muted-foreground"
    : failed === 0 && blocked === 0 ? "text-green-600"
    : passPct > 0 ? "text-orange-600"
    : "text-red-600";
  return (
    <div className="space-y-1 min-w-[160px]">
      <div className="flex items-center gap-2">
        <div className="flex h-2 rounded-full overflow-hidden flex-1 bg-muted">
          {passed > 0 && <div className="bg-green-500" style={{ width: pctStr(passed) }} title={`Passed: ${passed}`} />}
          {failed > 0 && <div className="bg-red-500" style={{ width: pctStr(failed) }} title={`Failed: ${failed}`} />}
          {blocked > 0 && <div className="bg-orange-400" style={{ width: pctStr(blocked) }} title={`Blocked: ${blocked}`} />}
          {inProgress > 0 && <div className="bg-blue-400" style={{ width: pctStr(inProgress) }} title={`In Progress: ${inProgress}`} />}
          {notExecuted > 0 && <div className="bg-muted-foreground/20" style={{ width: pctStr(notExecuted) }} title={`Not Executed: ${notExecuted}`} />}
        </div>
        <span className={`text-xs font-bold w-9 text-right ${pctColor}`} title="Pass %">{passPct}%</span>
      </div>
      <div className="flex gap-2 flex-wrap text-[10px]">
        {passed > 0 && <span className="text-green-700 font-medium">{passed} Pass</span>}
        {failed > 0 && <span className="text-red-700 font-medium">{failed} Fail</span>}
        {blocked > 0 && <span className="text-orange-600 font-medium">{blocked} Block</span>}
        {inProgress > 0 && <span className="text-blue-600 font-medium">{inProgress} IP</span>}
        {notExecuted > 0 && <span className="text-muted-foreground">{notExecuted} NE</span>}
        <span className="text-muted-foreground ml-auto">{total} total</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TestCasesExecution() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, token } = useAuth();
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
    milestoneId: "",
    fileType: "qa",
  });
  const [parsedExcelRows, setParsedExcelRows] = useState<ExecutionTestCase[] | null>(null);
  const [excelFileName, setExcelFileName] = useState("");
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Redmine ticket ID auto-lookup state
  const [ticketLookupLoading, setTicketLookupLoading] = useState(false);
  const [ticketLookupMsg, setTicketLookupMsg] = useState<{ type: "info" | "warn" | "error"; text: string } | null>(null);
  const ticketLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modulesRef = useRef(modules);
  const tokenRef = useRef(token);
  useEffect(() => { modulesRef.current = modules; }, [modules]);
  useEffect(() => { tokenRef.current = token; }, [token]);
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
    milestoneId: "",
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
      milestoneId: f.milestoneId ? String(f.milestoneId) : "",
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
          milestoneId: editFileForm.milestoneId ? Number(editFileForm.milestoneId) : null,
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

  // Clone state
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneSourceFile, setCloneSourceFile] = useState<ExecutionFile | null>(null);
  const [cloneForm, setCloneForm] = useState({ newTicketId: "", newTitle: "", resetResults: true, copyQaPic: true, projectId: "", milestoneId: "", module: "", trackerFilter: "" });
  const [cloneTicketMsg, setCloneTicketMsg] = useState<{ type: "info" | "warn" | "error"; text: string } | null>(null);
  const [cloneTicketLoading, setCloneTicketLoading] = useState(false);
  const cloneTicketTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCloning, setIsCloning] = useState(false);

  // Quick result filter
  type ResultFilter = "all" | "completed" | "has_failures" | "in_progress" | "not_started";
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const getHeaders = () => {
    // The JWT lives in localStorage only when "Remember Me" was checked at
    // login — otherwise it's sessionStorage (see AuthContext). Missing this
    // fallback meant every fetch using this helper 401'd for any user who
    // didn't check that box, including the execution-progress/tasks/
    // requirements/users calls this page's initial load depends on.
    const token = localStorage.getItem("qa_pulse_token") ?? sessionStorage.getItem("qa_pulse_token");
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

  // Clone ticket ID lookup — same logic as New File dialog
  useEffect(() => {
    if (!cloneOpen) return;
    const ticketId = cloneForm.newTicketId.trim();
    if (!ticketId) { setCloneTicketMsg(null); return; }
    if (cloneTicketTimer.current) clearTimeout(cloneTicketTimer.current);

    const duplicate = files.find(f => f.redmineTicketId === ticketId);
    if (duplicate) {
      setCloneTicketMsg({ type: "error", text: `#${ticketId} already exists (${duplicate.title || "Untitled"})` });
      return;
    }

    cloneTicketTimer.current = setTimeout(async () => {
      setCloneTicketLoading(true);
      try {
        const r = await fetch(`${getApiUrl()}/requirements/by-redmine/${ticketId}`, { headers: getHeaders() });
        const d = await r.json();
        if (d.found && d.requirement) {
          const req = d.requirement;
          setCloneForm(f => ({
            ...f,
            newTitle: f.newTitle || req.title || "",
            projectId: req.projectId ? String(req.projectId) : f.projectId,
            milestoneId: req.projectId && String(req.projectId) !== f.projectId ? "" : f.milestoneId,
            module: req.module || f.module,
            trackerFilter: req.tracker || f.trackerFilter,
          }));
          setCloneTicketMsg({ type: "info", text: `Found: "${req.title}"` });
        } else {
          // Try Redmine directly for title + tracker only
          try {
            const rr = await fetch(`${getApiUrl()}/verdict-report/redmine/${ticketId}`, { headers: getHeaders() });
            if (rr.ok) {
              const rd = await rr.json();
              const subject = rd.issue?.subject || rd.subject || "";
              const tracker = rd.issue?.tracker?.name || rd.tracker?.name || "";
              setCloneForm(f => ({
                ...f,
                newTitle: f.newTitle || subject || "",
                trackerFilter: tracker || f.trackerFilter,
                // Project and Module intentionally NOT auto-filled from Redmine
              }));
              setCloneTicketMsg({ type: "warn", text: `Not in local requirements — fetched from Redmine. Select Project & Module below.` });
            } else {
              setCloneTicketMsg({ type: "warn", text: "Ticket not found. Fill title, Project, Module, and Tracker manually." });
            }
          } catch {
            setCloneTicketMsg({ type: "warn", text: "Not found locally — enter details manually or leave blank to reuse source." });
          }
        }
      } catch { setCloneTicketMsg(null); }
      finally { setCloneTicketLoading(false); }
    }, 600);
    return () => { if (cloneTicketTimer.current) clearTimeout(cloneTicketTimer.current); };
  }, [cloneForm.newTicketId, cloneOpen]);

  const handleClone = async () => {
    if (!cloneSourceFile || !cloneForm.newTicketId.trim()) return;
    setIsCloning(true);
    try {
      const r = await fetch(`/api/execution-files/${cloneSourceFile.redmineTicketId}/clone`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          newTicketId: cloneForm.newTicketId.trim(),
          newTitle: cloneForm.newTitle.trim() || undefined,
          resetResults: cloneForm.resetResults,
          copyQaPic: cloneForm.copyQaPic,
          module: cloneForm.module || undefined,
          projectId: cloneForm.projectId ? Number(cloneForm.projectId) : undefined,
          milestoneId: cloneForm.milestoneId ? Number(cloneForm.milestoneId) : null,
          trackerFilter: cloneForm.trackerFilter || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        toast({ variant: "destructive", title: err.error || "Clone failed" });
        return;
      }
      const newFile = await r.json();
      toast({ title: `Cloned successfully — ${newFile.tcCount} test cases copied` });
      setCloneOpen(false);
      setCloneSourceFile(null);
      setCloneForm({ newTicketId: "", newTitle: "", resetResults: true, copyQaPic: true, projectId: "", milestoneId: "", module: "", trackerFilter: "" });
      setCloneTicketMsg(null);
      const refreshed = await fetchExecutionFiles();
      setFiles(refreshed);
      setLocation(`/test-cases/execution/${newFile.redmineTicketId}`);
    } catch {
      toast({ variant: "destructive", title: "Clone failed" });
    } finally { setIsCloning(false); }
  };

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
      const res = await fetch(`${getApiUrl()}/verdict-report/send-verdict`, {
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

  const isStale = (f: ExecutionFile) => {
    const prog = progress[f.redmineTicketId];
    if (!prog || prog.total === 0) return false;
    const executed = prog.passed + prog.failed + prog.blocked + prog.inProgress;
    if (executed === prog.total) return false; // completed — not stale
    const daysSince = (Date.now() - new Date(f.updatedAt).getTime()) / 86400000;
    return daysSince > 3;
  };

  const filteredFiles = useMemo(() => {
    const q = search.toLowerCase();
    return files.filter(f => {
      if (!(f.redmineTicketId.includes(search) || f.title?.toLowerCase().includes(q))) return false;
      const prog = progress[f.redmineTicketId];
      if (resultFilter === "completed") {
        return !!prog && prog.total > 0 && (prog.passed + prog.failed + prog.blocked + prog.inProgress) === prog.total;
      }
      if (resultFilter === "has_failures") return !!prog && (prog.failed > 0 || prog.blocked > 0);
      if (resultFilter === "in_progress") {
        return !!prog && prog.total > 0 &&
          (prog.passed + prog.failed + prog.blocked + prog.inProgress) > 0 &&
          (prog.passed + prog.failed + prog.blocked + prog.inProgress) < prog.total;
      }
      if (resultFilter === "not_started") return !prog || prog.total === 0 || (prog.passed + prog.failed + prog.blocked + prog.inProgress) === 0;
      return true;
    });
  }, [files, search, progress, resultFilter]);

  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      let av: string, bv: string;
      if (sortKey === "status") {
        av = a.milestoneStatus ?? "";
        bv = b.milestoneStatus ?? "";
      } else {
        av = String((a as any)[sortKey] ?? "");
        bv = String((b as any)[sortKey] ?? "");
      }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filteredFiles, sortKey, sortDir]);

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
      if (!newFileOpen) return;
      // Duplicate check
      const duplicate = files.find(f => f.redmineTicketId === ticketId);
      if (duplicate) {
        setTicketLookupMsg({ type: "error", text: `Redmine ID #${ticketId} already exists in Test Case Files (${duplicate.title || "Untitled"}).` });
        return;
      }

      setTicketLookupLoading(true);
      try {
        const currentToken = tokenRef.current;
        const res = await fetch(`${getApiUrl()}/requirements/by-redmine/${ticketId}`, {
          headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        });
        const data = await res.json();
        if (data.found && data.requirement) {
          const req = data.requirement;
          const currentModules = modulesRef.current;
          const matchedMod = req.module
            ? currentModules.find((m: any) => m.name.trim().toLowerCase() === req.module.trim().toLowerCase())
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
  }, [fileForm.redmineTicketId, files, newFileOpen]);

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
    setFileForm({ redmineTicketId: "", title: "", remarks: "", requirementId: "", projectId: "", tracker: "", selectedModules: [], milestoneId: "", fileType: "qa" });
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
              milestoneId: fileForm.milestoneId ? Number(fileForm.milestoneId) : undefined,
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
        milestoneId: fileForm.milestoneId ? Number(fileForm.milestoneId) : undefined,
        fileType: fileForm.fileType || "qa",
      } as any);

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
    if (!fileForm.milestoneId) {
      toast({ variant: "destructive", title: "Milestone is required" });
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

  // Overall summary across all files — must be before early return (Rules of Hooks)
  const overallStats = useMemo(() => {
    let total = 0, passed = 0, failed = 0, blocked = 0, inProgress = 0;
    Object.values(progress).forEach(p => {
      total += p.total; passed += p.passed; failed += p.failed;
      blocked += p.blocked; inProgress += p.inProgress;
    });
    const executed = passed + failed + blocked;
    return { total, passed, failed, blocked, inProgress, executed, pct: total > 0 ? Math.round((executed / total) * 100) : 0 };
  }, [progress]);

  if (isLoading)
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  const thClass = "border-r border-border cursor-pointer select-none hover:bg-muted/70 transition-colors";
  const canCreate = !!fileForm.redmineTicketId.trim() && !!fileForm.projectId && !!fileForm.milestoneId && fileForm.selectedModules.length > 0 && ticketLookupMsg?.type !== "error";

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

      {/* Overall summary banner */}
      {overallStats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total TCs", value: overallStats.total, color: "text-foreground" },
            { label: "Passed", value: overallStats.passed, color: "text-green-600" },
            { label: "Failed", value: overallStats.failed, color: "text-red-600" },
            { label: "Blocked", value: overallStats.blocked, color: "text-orange-600" },
            { label: "Executed %", value: `${overallStats.pct}%`, color: overallStats.pct === 100 ? "text-green-600" : "text-primary" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-border rounded-lg px-4 py-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3">
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
            {/* Quick result filter */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "all", label: "All Files" },
                { key: "in_progress", label: "In Progress" },
                { key: "has_failures", label: "Has Failures" },
                { key: "completed", label: "Completed" },
                { key: "not_started", label: "Not Started" },
              ] as { key: ResultFilter; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setResultFilter(opt.key)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${resultFilter === opt.key ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:bg-muted border-border"}`}
                >
                  {opt.label}
                </button>
              ))}
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
                <TableHead className="border-r border-border px-4 py-3">Milestone Phase</TableHead>
                <TableHead className={thClass} onClick={() => handleSort("updatedAt")}>
                  <div className="flex items-center gap-1">Last Modified <SortIcon k="updatedAt" /></div>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiles.map(f => {
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
                    <TableCell className="border-r border-border">{f.qaPic || "—"}</TableCell>
                    <TableCell className="border-r border-border">
                      {f.milestonePriority ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[f.milestonePriority] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          {f.milestonePriority}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="border-r border-border py-2">
                      <MiniProgressBar data={prog} />
                    </TableCell>
                    <TableCell className="border-r border-border">
                      {f.milestoneId ? (
                        <MilestonePhaseBreakdown breakdown={f.milestonePhaseBreakdown} />
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline cursor-pointer"
                          onClick={e => { e.stopPropagation(); openEditFile(f); }}
                        >
                          <AlertCircle className="w-3 h-3" /> No milestone
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="border-r border-border text-muted-foreground text-sm">
                      <div className="flex items-center gap-1.5">
                        {format(new Date(f.updatedAt), "dd MMM yyyy, HH:mm")}
                        {isStale(f) && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium whitespace-nowrap">
                            <Clock className="w-2.5 h-2.5" /> Stale
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end items-center gap-1">
                        <Button variant="ghost" size="sm" title="Open Execution Sheet"
                          className="text-blue-600 hover:text-blue-800"
                          onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        {isFullyExecuted(prog) && (
                          <Button variant="ghost" size="sm" title="Send Verdict Now"
                            className="text-green-600 hover:text-green-800 hover:bg-green-50"
                            onClick={e => {
                              e.stopPropagation();
                              setVerdictFile(f);
                              setSendVerdictOpen(true);
                            }}>
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" title="View Execution Summary"
                          className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                          onClick={() => setLocation(`/test-cases/execution-details/${f.redmineTicketId}`)}>
                          <BarChart2 className="w-4 h-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" title="More actions"
                              className="text-muted-foreground hover:text-primary">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditFile(f)}
                              className="text-amber-600 focus:text-amber-700">
                              <Settings2 className="w-4 h-4 mr-2" /> Edit file info
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={e => {
                                e.stopPropagation();
                                setCloneSourceFile(f);
                                setCloneForm({ newTicketId: "", newTitle: "", resetResults: true, copyQaPic: true, projectId: f.projectId ? String(f.projectId) : "", milestoneId: f.milestoneId ? String(f.milestoneId) : "", module: "", trackerFilter: "" });
                                setCloneTicketMsg(null);
                                setCloneOpen(true);
                              }}
                              className="text-teal-600 focus:text-teal-700">
                              <Copy className="w-4 h-4 mr-2" /> Clone execution file
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => confirmDelete([f.id])}
                              className="text-red-600 focus:text-red-700">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                onValueChange={v => setFileForm({ ...fileForm, projectId: v, milestoneId: "" })}
                options={[
                  { value: "", label: "Select project..." },
                  ...projects.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Search project..."
              />
            </div>

            {/* File Type (QA vs UAT) */}
            <div className="space-y-1">
              <Label>File Type</Label>
              <div className="flex gap-2">
                {[{ v: "qa", label: "QA Testing" }, { v: "uat", label: "UAT" }].map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setFileForm({ ...fileForm, fileType: opt.v })}
                    className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${fileForm.fileType === opt.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Milestone (required) */}
            {fileForm.projectId && (
              <MilestonePicker
                projectId={fileForm.projectId}
                token={token}
                value={fileForm.milestoneId}
                onChange={v => setFileForm({ ...fileForm, milestoneId: v })}
                required
              />
            )}

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
                onValueChange={v => setEditFileForm(f => ({ ...f, projectId: v, milestoneId: v === f.projectId ? f.milestoneId : "" }))}
                options={[
                  { value: "", label: "Select project..." },
                  ...projects.map(p => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Search project..."
              />
            </div>
            {editFileForm.projectId && (
              <MilestonePicker
                projectId={editFileForm.projectId}
                token={token}
                value={editFileForm.milestoneId}
                onChange={v => setEditFileForm(f => ({ ...f, milestoneId: v }))}
              />
            )}
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

      {/* Clone Dialog */}
      <Dialog open={cloneOpen} onOpenChange={o => { if (!o) { setCloneOpen(false); setCloneSourceFile(null); setCloneTicketMsg(null); } }}>
        <DialogContent className="sm:max-w-[480px] w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Copy className="w-4 h-4" /> Clone Execution File</DialogTitle>
            {cloneSourceFile && (
              <DialogDescription className="text-xs pt-1">
                Cloning from <span className="font-semibold text-foreground">#{cloneSourceFile.redmineTicketId}</span>
                {cloneSourceFile.title ? ` — ${cloneSourceFile.title}` : ""}
                {progress[cloneSourceFile.redmineTicketId] && (
                  <span className="ml-1 text-muted-foreground">· {progress[cloneSourceFile.redmineTicketId].total} test cases</span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Ticket ID <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  placeholder="e.g. 38099"
                  value={cloneForm.newTicketId}
                  onChange={e => setCloneForm(f => ({ ...f, newTicketId: e.target.value }))}
                />
                {cloneTicketLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              {cloneTicketMsg && (
                <p className={`text-xs ${cloneTicketMsg.type === "error" ? "text-destructive" : cloneTicketMsg.type === "warn" ? "text-amber-600" : "text-muted-foreground"}`}>
                  {cloneTicketMsg.text}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>New Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input placeholder="Auto-filled from Redmine or source..." value={cloneForm.newTitle} onChange={e => setCloneForm(f => ({ ...f, newTitle: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={cloneForm.projectId}
                  onValueChange={v => setCloneForm(f => ({ ...f, projectId: v, milestoneId: v === f.projectId ? f.milestoneId : "" }))}
                  placeholder="Select project..."
                  options={projects.map(p => ({ value: String(p.id), label: p.name }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <SearchableSelect
                  value={cloneForm.trackerFilter}
                  onValueChange={v => setCloneForm(f => ({ ...f, trackerFilter: v }))}
                  placeholder="Any tracker"
                  options={[
                    { value: "", label: "Any tracker" },
                    ...trackers.map(t => ({ value: t.name, label: t.name })),
                    ...(cloneForm.trackerFilter && !trackers.some(t => t.name === cloneForm.trackerFilter)
                      ? [{ value: cloneForm.trackerFilter, label: cloneForm.trackerFilter }] : []),
                  ]}
                />
              </div>
            </div>
            {cloneForm.projectId && (
              <MilestonePicker
                projectId={cloneForm.projectId}
                token={token}
                value={cloneForm.milestoneId}
                onChange={v => setCloneForm(f => ({ ...f, milestoneId: v }))}
              />
            )}
            <div className="space-y-1.5">
              <Label>Module</Label>
              <SearchableSelect
                value={cloneForm.module}
                onValueChange={v => setCloneForm(f => ({ ...f, module: v }))}
                placeholder="Select module (optional)..."
                options={[
                  { value: "", label: "Same as source" },
                  ...modules.map(m => ({ value: m.name, label: m.name })),
                ]}
              />
            </div>
            <div className="space-y-2 pt-1 border-t">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={cloneForm.resetResults} onChange={e => setCloneForm(f => ({ ...f, resetResults: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium">Reset results</p>
                  <p className="text-xs text-muted-foreground">Clear Result, Executed At, Actual Result — start fresh</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded" checked={cloneForm.copyQaPic} onChange={e => setCloneForm(f => ({ ...f, copyQaPic: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium">Copy QA PIC assignments</p>
                  <p className="text-xs text-muted-foreground">Keep who's assigned to each test case</p>
                </div>
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCloneOpen(false)} disabled={isCloning}>Cancel</Button>
            <Button onClick={handleClone} disabled={!cloneForm.newTicketId.trim() || isCloning} className="gap-2">
              {isCloning ? <><Loader2 className="w-4 h-4 animate-spin" /> Cloning...</> : <><Copy className="w-4 h-4" /> Clone</>}
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
