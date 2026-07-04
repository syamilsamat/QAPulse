import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TcResult {
  result: string | null;
  defectNumber: string | null;
  executedAt: string | null;
}

interface TraceabilityTC {
  key: string;
  tcId: number;
  source: "library" | "execution";
  tcCaseId: string | null;
  etcCaseId: string | null;
  displayCaseId: string;
  tcTitle: string | null;
  results: TcResult[];
}

interface TraceabilityRow {
  reqId: number;
  reqRedmineId: string | null;
  reqTitle: string;
  reqModule: string | null;
  projectId: number | null;
  projectName: string | null;
  reqStatus: string | null;
  parentId: number | null;
  milestoneId: number | null;
  directTcCount: number;
  tcCount: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  coveragePct: number;
  overallStatus: string;
  testCases: TraceabilityTC[];
  children: TraceabilityRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return (
        <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
          <CheckCircle2 className="w-3 h-3" /> Passed
        </Badge>
      );
    case "failing":
      return (
        <Badge className="gap-1 bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
          <XCircle className="w-3 h-3" /> Failing
        </Badge>
      );
    case "blocked":
      return (
        <Badge className="gap-1 bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">
          <MinusCircle className="w-3 h-3" /> Blocked
        </Badge>
      );
    case "in-progress":
      return (
        <Badge className="gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
          <Clock className="w-3 h-3" /> In Progress
        </Badge>
      );
    case "not-run":
      return (
        <Badge className="gap-1 bg-gray-100 text-gray-600 hover:bg-gray-100 border-gray-200">
          — Not Run
        </Badge>
      );
    case "no-tcs":
      return (
        <Badge className="gap-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200">
          <AlertTriangle className="w-3 h-3" /> No TCs
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function TcResultBadge({ result }: { result: string | null }) {
  const r = result?.toLowerCase() ?? "";
  if (r === "passed" || r === "pass")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">Passed</Badge>;
  if (r === "failed" || r === "fail")
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs">Failed</Badge>;
  if (r === "blocked")
    return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs">Blocked</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-xs">Not Run</Badge>;
}

function collectModules(rows: TraceabilityRow[], acc: Set<string>) {
  for (const row of rows) {
    if (row.reqModule) acc.add(row.reqModule);
    collectModules(row.children, acc);
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TraceabilityMatrix() {
  const { token } = useAuth();
  const [expandedReqs, setExpandedReqs] = useState<Set<number>>(new Set());
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMilestone, setFilterMilestone] = useState<string>("all");

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/projects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.json();
    },
  });

  const { data: milestones = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      if (filterProject === "all") return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${filterProject}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const queryParams = new URLSearchParams();
  if (filterProject !== "all") queryParams.set("projectId", filterProject);
  if (filterModule !== "all") queryParams.set("module", filterModule);
  if (filterStatus !== "all") queryParams.set("status", filterStatus);
  if (filterMilestone !== "all") queryParams.set("milestoneId", filterMilestone);

  const { data: rows = [], isLoading } = useQuery<TraceabilityRow[]>({
    queryKey: ["traceability", filterProject, filterModule, filterStatus, filterMilestone],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/traceability?${queryParams.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch traceability data");
      return res.json();
    },
  });

  // Derive unique modules from current data (all levels of the tree)
  const moduleSet = new Set<string>();
  collectModules(rows, moduleSet);
  const modules = Array.from(moduleSet);

  // Group rows by project
  const groupedByProject = rows.reduce<{ projectId: number | null; projectName: string | null; rows: TraceabilityRow[] }[]>(
    (acc, row) => {
      const existing = acc.find(g => g.projectId === row.projectId);
      if (existing) { existing.rows.push(row); }
      else { acc.push({ projectId: row.projectId, projectName: row.projectName, rows: [row] }); }
      return acc;
    }, []
  );

  const [collapsedProjects, setCollapsedProjects] = useState<Set<number | null>>(new Set());
  const toggleProject = (projectId: number | null) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  };

  const toggleExpand = (reqId: number) => {
    setExpandedReqs((prev) => {
      const next = new Set(prev);
      next.has(reqId) ? next.delete(reqId) : next.add(reqId);
      return next;
    });
  };

  // ─── Summary counts ───────────────────────────────────────────────────────
  const summary = {
    total: rows.length,
    passed: rows.filter((r) => r.overallStatus === "passed").length,
    failing: rows.filter((r) => r.overallStatus === "failing").length,
    noTcs: rows.filter((r) => r.overallStatus === "no-tcs").length,
  };

  // ─── Excel export ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const sheetData: any[][] = [
      [
        "Project", "Redmine ID", "Requirement", "Module", "Test Case ID", "TC Title",
        "Result", "Defect #", "Executed At",
      ],
    ];

    const pushReqRows = (req: TraceabilityRow, depth: number) => {
      const title = depth > 0 ? `${"    ".repeat(depth)}↳ ${req.reqTitle}` : req.reqTitle;

      if (req.children.length > 0) {
        sheetData.push([
          "", req.reqRedmineId ?? req.reqId, title, req.reqModule ?? "", "", "",
          `${req.passed}/${req.tcCount} passed (rolled up)`, "", "",
        ]);
      }

      if (req.testCases.length === 0 && req.children.length === 0) {
        sheetData.push(["", req.reqRedmineId ?? req.reqId, title, req.reqModule ?? "", "", "", "No TCs", "", ""]);
      } else {
        for (const tc of req.testCases) {
          const latest = tc.results[tc.results.length - 1];
          sheetData.push([
            "",
            req.reqRedmineId ?? req.reqId,
            title,
            req.reqModule ?? "",
            tc.displayCaseId,
            tc.tcTitle ?? "",
            latest?.result ?? "Not Run",
            latest?.defectNumber ?? "",
            latest?.executedAt ? format(new Date(latest.executedAt), "yyyy-MM-dd HH:mm") : "",
          ]);
        }
      }

      for (const child of req.children) pushReqRows(child, depth + 1);
    };

    for (const group of groupedByProject) {
      // Project group header row
      sheetData.push([group.projectName ?? "No Project", "", "", "", "", "", "", "", ""]);
      for (const req of group.rows) pushReqRows(req, 0);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Style header row
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "274AB3" } },
      alignment: { horizontal: "center" },
    };
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    }

    // Color result cells
    const resultCol = 6; // column G (0-indexed) — after adding Project column
    for (let r = 1; r <= sheetData.length - 1; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c: resultCol });
      if (!ws[cellRef]) continue;
      const val = (ws[cellRef].v ?? "").toString().toLowerCase();
      let rgb = "D1D5DB"; // gray = not run
      if (val === "passed" || val === "pass") rgb = "BBF7D0";
      else if (val === "failed" || val === "fail") rgb = "FECACA";
      else if (val === "blocked") rgb = "FED7AA";
      ws[cellRef].s = { fill: { fgColor: { rgb } } };
    }

    ws["!cols"] = [
      { wch: 25 }, { wch: 12 }, { wch: 40 }, { wch: 20 }, { wch: 16 }, { wch: 40 },
      { wch: 12 }, { wch: 14 }, { wch: 20 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Traceability Matrix");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Traceability_Matrix_${format(new Date(), "yyyyMMdd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Recursive requirement rows ───────────────────────────────────────────
  const renderReqRows = (req: TraceabilityRow, depth: number): JSX.Element => {
    const expandable = req.testCases.length > 0 || req.children.length > 0;
    const expanded = expandedReqs.has(req.reqId);
    const rolledFromChildren = req.tcCount - req.directTcCount;

    return (
      <Fragment key={req.reqId}>
        <TableRow
          className="cursor-pointer hover:bg-muted/50"
          onClick={() => expandable && toggleExpand(req.reqId)}
        >
          <TableCell>
            {expandable ? (
              expanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )
            ) : null}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2" style={{ paddingLeft: depth * 24 }}>
              {depth > 0 && (
                <CornerDownRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs text-muted-foreground font-mono">#{req.reqRedmineId ?? req.reqId}</span>
              <span className={depth === 0 ? "font-medium text-sm" : "text-sm"}>{req.reqTitle}</span>
              {req.overallStatus === "no-tcs" && (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
              )}
            </div>
            {req.children.length > 0 && (
              <div
                className="text-xs text-muted-foreground mt-0.5"
                style={{ paddingLeft: depth * 24 + (depth > 0 ? 22 : 0) }}
              >
                {req.directTcCount} direct · {rolledFromChildren} rolled up from {req.children.length}{" "}
                {req.children.length === 1 ? "child" : "children"}
              </div>
            )}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">{req.reqModule ?? "—"}</TableCell>
          <TableCell className="text-center font-medium">{req.tcCount}</TableCell>
          <TableCell className="text-center text-green-600 font-medium">{req.passed}</TableCell>
          <TableCell className="text-center text-red-600 font-medium">{req.failed}</TableCell>
          <TableCell className="text-center text-orange-600 font-medium">{req.blocked}</TableCell>
          <TableCell className="text-center text-gray-500 font-medium">{req.notRun}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Progress value={req.coveragePct} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">
                {req.coveragePct}%
              </span>
            </div>
          </TableCell>
          <TableCell>
            <StatusBadge status={req.overallStatus} />
          </TableCell>
        </TableRow>

        {/* Expanded TC rows (direct links on this requirement) */}
        {expanded &&
          req.testCases.map((tc) => {
            const latest = tc.results[tc.results.length - 1];
            return (
              <TableRow key={tc.key} className="bg-muted/20">
                <TableCell />
                <TableCell colSpan={2} style={{ paddingLeft: 32 + depth * 24 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {tc.displayCaseId}
                    </span>
                    <span className="text-sm">{tc.tcTitle ?? "Untitled TC"}</span>
                  </div>
                </TableCell>
                <TableCell />
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  {latest?.defectNumber && (
                    <span className="text-xs font-mono text-red-600">
                      Defect: {latest.defectNumber}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {latest?.executedAt
                    ? format(new Date(latest.executedAt), "dd MMM yyyy")
                    : "—"}
                </TableCell>
                <TableCell>
                  <TcResultBadge result={latest?.result ?? null} />
                </TableCell>
              </TableRow>
            );
          })}

        {/* Expanded child requirements */}
        {expanded && req.children.map((child) => renderReqRows(child, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Traceability Matrix</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Requirements → Test Cases → Execution Results
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2" disabled={rows.length === 0}>
          <Download className="w-4 h-4" />
          Export Excel
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Fully Passed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-green-600">{summary.passed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Failing
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-red-600">{summary.failing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              No TCs Mapped
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-yellow-600">{summary.noTcs}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="passed">Passed</SelectItem>
            <SelectItem value="failing">Failing</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="not-run">Not Run</SelectItem>
            <SelectItem value="no-tcs">No TCs</SelectItem>
          </SelectContent>
        </Select>

        {filterProject !== "all" && milestones.length > 0 && (
          <Select value={filterMilestone} onValueChange={(v) => setFilterMilestone(v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All Milestones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Milestones</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filterMilestone !== "all" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900 rounded-md px-3 py-2">
          <span className="text-violet-600 dark:text-violet-400 font-medium">Milestone scope active</span>
          <span>— execution results scoped to this milestone only. Requirements without TCs in this milestone may show "Not Run".</span>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-sm">No requirements found matching the selected filters.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Requirement</TableHead>
                <TableHead>Module</TableHead>
                <TableHead className="text-center">TCs</TableHead>
                <TableHead className="text-center">Pass</TableHead>
                <TableHead className="text-center">Fail</TableHead>
                <TableHead className="text-center">Blocked</TableHead>
                <TableHead className="text-center">Not Run</TableHead>
                <TableHead className="w-40">Coverage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedByProject.map((group) => (
                <Fragment key={group.projectId ?? "no-project"}>
                  {/* Project group header */}
                  <TableRow
                    className="bg-muted/40 cursor-pointer hover:bg-muted/60"
                    onClick={() => toggleProject(group.projectId)}
                  >
                    <TableCell colSpan={10}>
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {collapsedProjects.has(group.projectId)
                          ? <ChevronRight className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                        {group.projectName ?? "No Project"}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          ({group.rows.length} requirement{group.rows.length !== 1 ? "s" : ""})
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Requirement rows (roots; children render on expand) */}
                  {!collapsedProjects.has(group.projectId) &&
                    group.rows.map((req) => renderReqRows(req, 0))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
