import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
import {
  FileBarChart2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Bug,
  TrendingUp,
  LogOut,
  Database,
  GitBranch,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wifi,
  WifiOff,
  Menu,
  X,
  ShieldAlert,
  Download,
  Mail,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// --- API Helpers ---
async function callAi(token: string | null, endpoint: string, body: object) {
  const res = await fetch(`${getApiUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- Components ---
function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level?.toLowerCase()] ?? colors.medium}`}
    >
      {level}
    </span>
  );
}

// --- Interfaces & Constants ---
interface PmoReportData {
  redmineId: string;
  generatedAt: string;
  source?: "redmine" | "local";
  issueSubject?: string;
  projectName?: string;
  requirements: Array<{
    id: number;
    title: string;
    module: string | null;
    status: string;
    priority: string;
  }>;
  testExecution: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    inProgress: number;
    notExecuted: number;
    passRate: number;
    successRate: number;
  };
  moduleDetails: Array<{
    module: string;
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    inProgress: number;
    notExecuted: number;
    passCompletion: number;
    totalCompletion: number;
  }>;
  defects: { total: number; openRate: number; counts: Record<string, number> };
  activeDefects: Array<{
    id: number;
    name: string;
    priority: string;
    status: string;
    category: string;
    assignee: string;
    createdAt: string;
    reopenedCount?: number;
  }>;
}

interface RedmineData {
  connected: boolean;
  error?: string;
  issue?: {
    id: number;
    subject: string;
    description: string;
    status: string;
    tracker: string;
    priority: string;
    assignee: string;
    author: string;
    projectName: string;
    doneRatio: number;
    estimatedHours: number | null;
    startDate: string | null;
    dueDate: string | null;
    createdOn: string;
    updatedOn: string;
  };
  children?: Array<{
    id: number;
    subject: string;
    status: string;
    tracker: string;
    priority: string;
    assignee: string;
    doneRatio: number;
    dueDate: string | null;
    createdOn: string;
  }>;
  statusSummary?: Record<string, number>;
  journals?: Array<{
    id: number;
    notes: string;
    author: string;
    createdOn: string;
  }>;
}

const EXEC_COLOR_MAP: Record<string, string> = {
  Passed: "#4ade80",
  Failed: "#f87171",
  Blocked: "#fb923c",
  "Not Executed": "#94a3b8",
  "In Progress": "#60a5fa",
  "For Qa Test": "#3b82f6",
};

const DEFECT_STATUS_HEX: Record<string, string> = {
  New: "#facc15",
  Resolved: "#4ade80",
  Closed: "#9ca3af",
  Feedback: "#c084fc",
  Rejected: "#f87171",
  "In Progress": "#60a5fa",
  "For QA Test": "#275BF5",
  Reopen: "#fb923c",
  Done: "#4ade80",
  Verified: "#c084fc",
  Roadblock: "#f87171",
  Cancelled: "#DFDFDF",
};

const DEFECT_FALLBACK_COLORS = [
  "#f9d77e",
  "#1abc9c",
  "#3498db",
  "#f4a688",
  "#27ae60",
  "#c7a2d6",
  "#a8d5ba",
  "#bdc3c7",
];

const STATUS_COLOR: Record<string, string> = {
  New: "bg-yellow-100 text-yellow-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Resolved: "bg-green-100 text-green-800",
  Closed: "bg-gray-100 text-gray-600",
  Feedback: "bg-purple-100 text-purple-800",
  Rejected: "bg-red-100 text-red-800",
};

const PRIORITY_COLOR: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Normal: "bg-blue-100 text-blue-700",
  High: "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
  Immediate: "bg-red-200 text-red-900",
};

function Sidebar({
  onLogout,
  isOpen,
  setIsOpen,
}: {
  onLogout: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "PM";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col h-screen w-60 bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 md:hidden h-8 w-8 text-sidebar-foreground/60"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileBarChart2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sidebar-foreground text-sm leading-tight">
                QA Pulse
              </p>
              <p className="text-xs text-sidebar-foreground/50 leading-tight">
                PMO Portal
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <div className="px-3 py-2 rounded-lg bg-primary/10 flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Report Dashboard
            </span>
          </div>
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/30">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.name ?? "PMO Manager"}
              </p>
              <p className="text-xs text-sidebar-foreground/50 truncate">
                {user?.email ?? ""}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setLogoutOpen(true)}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onLogout}>Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center rounded-xl p-2 sm:p-3 ${color} w-full`}
    >
      <span className="text-lg sm:text-xl font-bold leading-none">{value}</span>
      <span className="text-[10px] sm:text-xs font-medium mt-1 text-center opacity-80 leading-tight">
        {label}
      </span>
    </div>
  );
}

function RedmineSection({
  issueId,
  token,
}: {
  issueId: string;
  token: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  const { data, isLoading, error } = useQuery<RedmineData>({
    queryKey: ["redmine-issue", issueId],
    queryFn: async () => {
      const resp = await fetch(`${getApiUrl()}/pmo/redmine/${issueId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return resp.json();
    },
    enabled: !!issueId,
    retry: false,
    staleTime: 60000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" /> Redmine Issue Data
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <Badge
                variant="outline"
                className={`text-xs gap-1 ${data.connected ? "text-green-700 border-green-300" : "text-red-600 border-red-300"}`}
              >
                {data.connected ? (
                  <>
                    <Wifi className="w-3 h-3" /> Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" /> Offline
                  </>
                )}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
              <Clock className="w-4 h-4 animate-spin" /> Connecting to Redmine
              database…
            </div>
          )}

          {(error || (data && !data.connected)) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm">
              <p className="font-medium text-amber-800 flex items-center gap-2">
                <WifiOff className="w-4 h-4" /> Redmine database unreachable
              </p>
              <p className="text-amber-700 mt-1 text-xs">
                {data?.error ??
                  (error as Error)?.message ??
                  "Connection failed"}
              </p>
              <p className="text-amber-600 mt-2 text-xs">
                The Redmine database at{" "}
                <code className="bg-amber-100 px-1 rounded">
                  10.10.4.130:3306
                </code>{" "}
                is only accessible from within your internal network. This
                feature works when QA Pulse is deployed on-premises.
              </p>
            </div>
          )}

          {data?.connected && data.issue && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      #{data.issue.id} — {data.issue.subject}
                    </p>
                    {data.issue.projectName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Project: {data.issue.projectName}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge
                      className={`text-xs ${STATUS_COLOR[data.issue.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {data.issue.status}
                    </Badge>
                    <Badge
                      className={`text-xs ${PRIORITY_COLOR[data.issue.priority] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {data.issue.priority}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Tracker</p>
                    <p className="font-medium">{data.issue.tracker}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Assignee</p>
                    <p className="font-medium">{data.issue.assignee || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Done</p>
                    <p className="font-medium">{data.issue.doneRatio ?? 0}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p className="font-medium">
                      {data.issue.dueDate
                        ? format(new Date(data.issue.dueDate), "dd/MM/yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>
                {data.issue.description && (
                  <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-3">
                    {data.issue.description}
                  </p>
                )}
              </div>

              {data.statusSummary &&
                Object.keys(data.statusSummary).length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" /> Sub-issue Status
                      Summary ({data.children?.length ?? 0} items)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(data.statusSummary).map(
                        ([status, count]) => (
                          <div
                            key={status}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {status}: <span className="font-bold">{count}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {data.children && data.children.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Sub-issues / Child Tasks
                  </p>

                  <div className="hidden md:block overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-muted-foreground">
                          <th className="text-left py-2 px-3 font-medium">#</th>
                          <th className="text-left py-2 px-3 font-medium">
                            Subject
                          </th>
                          <th className="text-center py-2 px-2 font-medium">
                            Tracker
                          </th>
                          <th className="text-center py-2 px-2 font-medium">
                            Status
                          </th>
                          <th className="text-center py-2 px-2 font-medium">
                            Priority
                          </th>
                          <th className="text-left py-2 px-2 font-medium">
                            Assignee
                          </th>
                          <th className="text-center py-2 px-2 font-medium">
                            Done%
                          </th>
                          <th className="text-center py-2 px-2 font-medium">
                            Due
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.children.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b hover:bg-muted/20 transition-colors"
                          >
                            <td className="py-2 px-3 text-muted-foreground">
                              #{c.id}
                            </td>
                            <td className="py-2 px-3 max-w-[200px] truncate">
                              {c.subject}
                            </td>
                            <td className="text-center py-2 px-2 text-muted-foreground">
                              {c.tracker}
                            </td>
                            <td className="text-center py-2 px-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="text-center py-2 px-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[c.priority] ?? "bg-gray-100 text-gray-600"}`}
                              >
                                {c.priority}
                              </span>
                            </td>
                            <td className="py-2 px-2">{c.assignee || "—"}</td>
                            <td className="text-center py-2 px-2 font-medium">
                              {c.doneRatio ?? 0}%
                            </td>
                            <td className="text-center py-2 px-2 text-muted-foreground">
                              {c.dueDate
                                ? format(new Date(c.dueDate), "dd/MM/yy")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:hidden">
                    {data.children.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 border rounded-lg bg-card text-sm space-y-2 shadow-sm"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">
                            #{c.id}
                          </span>
                          <div className="flex flex-wrap gap-1 justify-end">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLOR[c.status] ?? "bg-gray-100"}`}
                            >
                              {c.status}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${PRIORITY_COLOR[c.priority] ?? "bg-gray-100"}`}
                            >
                              {c.priority}
                            </span>
                          </div>
                        </div>
                        <p className="font-medium leading-snug">{c.subject}</p>
                        <div className="flex justify-between items-center text-xs text-muted-foreground border-t pt-2 mt-1">
                          <span className="truncate pr-2">
                            {c.assignee || "Unassigned"}
                          </span>
                          <span className="shrink-0">
                            Done:{" "}
                            <span className="font-medium text-foreground">
                              {c.doneRatio ?? 0}%
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.journals && data.journals.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Recent Notes / Updates
                  </p>
                  <div className="space-y-2">
                    {data.journals.map((j) => (
                      <div
                        key={j.id}
                        className="rounded-lg border bg-muted/10 p-3 text-xs"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">{j.author}</span>
                          <span className="text-muted-foreground">
                            {format(new Date(j.createdOn), "dd/MM/yyyy HH:mm")}
                          </span>
                        </div>
                        <p className="text-muted-foreground line-clamp-3 whitespace-pre-line">
                          {j.notes}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {data?.connected && !data.issue && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Issue #{issueId} not found in Redmine database.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function PmoReport() {
  const { token, logout, user } = useAuth();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState("");
  const [redmineId, setRedmineId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeDefectsPage, setActiveDefectsPage] = useState(1);
  const [showAllDefects, setShowAllDefects] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // AI Dashboard State
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [readinessResult, setReadinessResult] = useState<any>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const { data, isLoading, error } = useQuery<PmoReportData>({
    queryKey: ["pmo-report", redmineId],
    queryFn: async () => {
      const resp = await fetch(
        `${getApiUrl()}/pmo/report?redmineId=${encodeURIComponent(redmineId!)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const e = new Error(body.error ?? "Failed to load report");
        (e as any).help = body.help ?? [];
        throw e;
      }

      const reportData = await resp.json();

      try {
        const execResp = await fetch(
          `${getApiUrl()}/pmo/execution-details?redmineId=${encodeURIComponent(redmineId!)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );

        if (execResp.ok) {
          const execDetails = await execResp.json();
          if (Array.isArray(execDetails) && execDetails.length > 0) {
            let total = 0,
              passed = 0,
              failed = 0,
              blocked = 0,
              inProgress = 0,
              notExecuted = 0;

            const moduleDetails = execDetails.map((row: any) => {
              total += row.total || 0;
              passed += row.passed || 0;
              failed += row.failed || 0;
              blocked += row.blocked || 0;
              inProgress += row.inProg || 0;
              notExecuted += row.notExec || 0;

              return {
                module: row.module,
                total: row.total || 0,
                passed: row.passed || 0,
                failed: row.failed || 0,
                blocked: row.blocked || 0,
                inProgress: row.inProg || 0,
                notExecuted: row.notExec || 0,
                passCompletion:
                  row.total > 0
                    ? Math.round((row.passed / row.total) * 1000) / 10
                    : 0,
                totalCompletion:
                  row.total > 0
                    ? Math.round(
                        ((row.total - row.notExec) / row.total) * 1000,
                      ) / 10
                    : 0,
              };
            });

            reportData.testExecution = {
              total,
              passed,
              failed,
              blocked,
              inProgress,
              notExecuted,
              passRate:
                total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
              successRate:
                total > 0
                  ? Math.round(((passed + inProgress) / total) * 1000) / 10
                  : 0,
            };
            reportData.moduleDetails = moduleDetails;
          }
        }
      } catch (e) {
        console.error("Failed to patch execution data", e);
      }

      return reportData;
    },
    enabled: !!redmineId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const handleSearch = () => {
    const clean = input.trim().replace(/^#/, "");
    if (!clean) return;
    setRedmineId(clean);

    setRiskResult(null);
    setReadinessResult(null);
    setGeneratedAt(null);
  };

  const runRisk = async () => {
    setRiskLoading(true);
    try {
      const result = await callAi(token, "/ai/risk-score", {
        redmineData: data,
      });
      setRiskResult(result);
      setGeneratedAt(new Date());
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "AI Error",
        description: err.message,
      });
    } finally {
      setRiskLoading(false);
    }
  };

  const runReadiness = async () => {
    setReadinessLoading(true);
    try {
      const result = await callAi(token, "/ai/release-readiness", {
        redmineData: data,
      });
      setReadinessResult(result);
      setGeneratedAt(new Date());
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "AI Error",
        description: err.message,
      });
    } finally {
      setReadinessLoading(false);
    }
  };

  const getFormattedDateString = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
  };

  /** 
  const generateReportImage = async (): Promise<string | null> => {
    if (!reportRef.current) return null;
    setIsExporting(true);

    try {
      // toPng handles modern CSS variables like oklch natively
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2, // Ensures high quality (equivalent to scale: 2)
      });
      return dataUrl;
    } catch (error) {
      console.error("Failed to generate image:", error);
      return null;
    } finally {
      setIsExporting(false);
    }
  };
  */

  const generateReportPDF = async (): Promise<Blob | null> => {
    if (!reportRef.current) return null;
    setIsExporting(true);

    try {
      // 1. Capture the DOM as a high-quality image
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });

      // 2. Create an A4 PDF
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: "a4",
      });

      // 3. Calculate scaling to fit the image inside the A4 width
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      const pageHeight = pdf.internal.pageSize.getHeight();

      // 4. Render image to PDF, splitting across multiple pages if necessary
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(dataUrl, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      // Return the PDF as a Blob (safer for large files than Data URLs)
      return pdf.output("blob");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  /** 
  const handleDownloadReport = async () => {
    const dataUrl = await generateReportImage();
    if (!dataUrl) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Could not generate the report image.",
      });
      return;
    }

    const reportName = data?.issueSubject
      ? data.issueSubject.replace(/[^a-z0-9]/gi, "_")
      : `Ticket_${redmineId}`;
    const fileName = `Report_${reportName}_${getFormattedDateString()}.png`;

    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  };
  */
  const handleDownloadReport = async () => {
    const pdfBlob = await generateReportPDF();
    if (!pdfBlob) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Could not generate the report PDF.",
      });
      return;
    }

    const reportName = data?.issueSubject
      ? data.issueSubject.replace(/[^a-z0-9]/gi, "_")
      : `Ticket_${redmineId}`;
    const fileName = `Report_${reportName}_${getFormattedDateString()}.pdf`;

    // Create a temporary URL for the Blob and trigger download
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = url;
    link.click();

    // Clean up memory
    URL.revokeObjectURL(url);
  };

  /** const handleSendReport = async () => {
    // 1. Generate the report image
    const dataUrl = await generateReportImage();
    if (!dataUrl) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Could not generate the report image.",
      });
      return;
    }

    // 2. Setup variables for the template and file name
    const reportName = data?.issueSubject || `Ticket #${redmineId}`;
    const fileName = `Report_${reportName.replace(/[^a-z0-9]/gi, "_")}_${getFormattedDateString()}.png`;
    const genDate = new Date().toLocaleDateString();
    const userName = user?.name || "System User";

    // 3. Download the image first (since mailto: cannot attach files automatically)
    const link = document.createElement("a");
    link.download = fileName;
    link.href = dataUrl;
    link.click();

    // 4. Construct the exact email template requested
    const subjectText = `[Report]- ${reportName}`;
    const bodyText = `Dear PMO,

  Please find the attached report for your review.

  Report Details:
  • Report Name: ${reportName}
  • Generated Date: ${genDate}

  [Note to sender: The report image has been downloaded to your computer as "${fileName}" in your Download folder. Please attach it to this email manually and kindly delete this Note to sender line before sending email.]`;

    // 5. Open the user's default email client
    window.location.href = `mailto:?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
  }; */
  const handleSendReport = async () => {
    const pdfBlob = await generateReportPDF();
    if (!pdfBlob) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Could not generate the report PDF.",
      });
      return;
    }

    const reportName = data?.issueSubject || `Ticket #${redmineId}`;
    const fileName = `Report_${reportName.replace(/[^a-z0-9]/gi, "_")}_${getFormattedDateString()}.pdf`;
    const genDate = new Date().toLocaleDateString();
    const userName = user?.name || "System User";

    // Download the file to the user's machine first
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    // 4. Construct the exact email template requested
    const subjectText = `[Report]- ${reportName}`;
    const bodyText = `Dear PMO,

    Please find the attached report for your review.

    Report Details:
    • Report Name: ${reportName}
    • Generated Date: ${genDate}

    [Note to sender: The report image has been downloaded to your computer as "${fileName}" in your Download folder. Please attach it to this email manually and kindly delete this Note to sender line before sending email.]`;

    // Open the user's default email client
    window.location.href = `mailto:?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
  };

  const execData = data
    ? [
        {
          name: `Passed`,
          value: data.testExecution.passed,
          color: EXEC_COLOR_MAP["Passed"],
        },
        {
          name: `Failed`,
          value: data.testExecution.failed,
          color: EXEC_COLOR_MAP["Failed"],
        },
        {
          name: `Blocked`,
          value: data.testExecution.blocked,
          color: EXEC_COLOR_MAP["Blocked"],
        },
        {
          name: `Not Executed`,
          value: data.testExecution.notExecuted,
          color: EXEC_COLOR_MAP["Not Executed"],
        },
        {
          name: `In Progress`,
          value: data.testExecution.inProgress,
          color: EXEC_COLOR_MAP["In Progress"],
        },
      ].filter((d) => d.value > 0)
    : [];

  const defectData = data
    ? Object.entries(data.defects.counts)
        .filter(([, v]) => v > 0)
        .map(([k, v], index) => {
          const formattedName = k
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          return {
            name: formattedName,
            value: v,
            color:
              DEFECT_STATUS_HEX[formattedName] ||
              DEFECT_FALLBACK_COLORS[index % DEFECT_FALLBACK_COLORS.length],
          };
        })
    : [];

  const isStandalonePMO = user?.role === "pmo";

  return (
    <>
      <div
        className={
          isStandalonePMO
            ? "flex h-screen overflow-hidden bg-background"
            : "flex bg-background"
        }
      >
        {user?.role === "pmo" && (
          <Sidebar
            onLogout={logout}
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
          />
        )}

        <main
          className={
            isStandalonePMO
              ? "flex-1 overflow-y-auto bg-muted/20"
              : "flex-1 bg-muted/20"
          }
        >
          {user?.role === "pmo" && (
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card md:hidden sticky top-0 z-30">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 -ml-1"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-5 h-5" />
                </Button>
                <span className="font-bold text-sm tracking-tight text-sidebar-foreground">
                  QA Pulse PMO
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Portal
              </Badge>
            </div>
          )}

          <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 hidden sm:block">
                  <FileBarChart2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">PMO Report Portal</h1>
                  <p className="text-xs text-muted-foreground">
                    Enter a Redmine ticket number to view the QA status report
                  </p>
                </div>
              </div>
              {data && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDownloadReport}
                    disabled={isExporting}
                    className="gap-2"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Report
                  </Button>
                  <Button
                    onClick={handleSendReport}
                    disabled={isExporting}
                    className="gap-2"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Send Report
                  </Button>
                </div>
              )}
            </div>

            <Card className="no-print">
              <CardContent className="pt-5 pb-5">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                      #
                    </span>
                    <Input
                      className="pl-7"
                      placeholder="Enter Redmine number (e.g. 34555)"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                  </div>
                  <Button
                    onClick={handleSearch}
                    disabled={isLoading || !input.trim()}
                  >
                    <Search className="w-4 h-4 mr-2" />
                    {isLoading ? "Loading…" : "View Report"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {error &&
              (() => {
                const msg = (error as Error).message;
                const helpLines: string[] = (error as any).help ?? [];
                return (
                  <Card className="border-amber-300 bg-amber-50 no-print">
                    <CardContent className="pt-5 space-y-2">
                      <p className="text-amber-900 text-sm font-semibold flex items-center gap-2">
                        <WifiOff className="w-4 h-4 shrink-0" /> {msg}
                      </p>
                      {helpLines.length > 0 && (
                        <ul className="space-y-1.5 mt-2">
                          {helpLines.map((line, i) => (
                            <li
                              key={i}
                              className="text-xs text-amber-800 flex gap-2"
                            >
                              <span className="shrink-0 mt-0.5">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

            {data && (
              <div
                ref={reportRef}
                className="bg-background rounded-xl p-4 sm:p-6 shadow-sm border space-y-6"
              >
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold">
                    QA Pulse — Report Dashboard
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Generated:{" "}
                    {generatedAt
                      ? format(generatedAt, "dd/MM/yyyy HH:mm")
                      : format(new Date(), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>

                <div className="text-center border rounded-xl p-4 bg-card shadow-sm">
                  <h2 className="text-lg font-bold text-primary">
                    Test Execution & Defect Status Summary
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    as of{" "}
                    {format(new Date(data.generatedAt), "dd/MM/yyyy [HH:mm]")}
                  </p>
                  {data.issueSubject && (
                    <p className="text-sm font-medium text-foreground mt-1 max-w-lg mx-auto">
                      #{data.redmineId} — {data.issueSubject}
                    </p>
                  )}
                  {data.projectName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Project: {data.projectName}
                    </p>
                  )}
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Redmine #{data.redmineId}
                    </span>
                    {data.source === "redmine" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                        Live from Redmine DB
                      </span>
                    )}
                    {data.source === "local" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                        Local data
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Risk Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-2">
                        <div>
                          <CardTitle className="text-base flex items-start sm:items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5 sm:mt-0" />
                            <span className="leading-tight">
                              AI Bug Prediction & Risk Scoring
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 sm:mt-0">
                            Score modules by risk based on defect density,
                            blocked tasks, and coverage gaps.
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          disabled={riskLoading}
                          onClick={runRisk}
                          className="no-print w-full sm:w-auto shrink-0"
                          data-html2canvas-ignore="true"
                        >
                          {riskLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Scoring…
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                              Calculate Risk
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!riskResult && !riskLoading && (
                        <div className="py-10 text-center text-muted-foreground text-sm px-4">
                          <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          Click <strong>Calculate Risk</strong> to generate the
                          risk score report.
                        </div>
                      )}
                      {riskLoading && (
                        <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm px-4">
                          <Loader2 className="w-4 h-4 animate-spin" /> Analysing
                          project risk…
                        </div>
                      )}
                      {riskResult && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-muted/50">
                            <span className="text-sm font-medium">
                              Overall Project Risk:
                            </span>
                            <RiskBadge level={riskResult.overallRisk} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {riskResult.summary}
                          </p>
                          {riskResult.modules?.map((m: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg border space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                <span className="font-semibold break-words">
                                  {m.name}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${m.riskScore}%`,
                                        backgroundColor:
                                          m.riskLevel === "high" ||
                                          m.riskLevel === "critical"
                                            ? "#ef4444"
                                            : m.riskLevel === "medium"
                                              ? "#f59e0b"
                                              : "#22c55e",
                                      }}
                                    />
                                  </div>
                                  <span className="text-sm font-bold">
                                    {m.riskScore}
                                  </span>
                                  <RiskBadge level={m.riskLevel} />
                                </div>
                              </div>
                              {m.reasons?.length > 0 && (
                                <ul className="space-y-1">
                                  {m.reasons.map((r: string, j: number) => (
                                    <li
                                      key={j}
                                      className="text-xs text-muted-foreground flex gap-2 items-start"
                                    >
                                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                                      <span>{r}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {m.recommendation && (
                                <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5 mt-2">
                                  {m.recommendation}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Readiness Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-2">
                        <div>
                          <CardTitle className="text-base flex items-start sm:items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-primary shrink-0 mt-0.5 sm:mt-0" />
                            <span className="leading-tight">
                              Release Readiness Score
                            </span>
                          </CardTitle>
                          <CardDescription className="mt-1 sm:mt-0">
                            AI-calculated release readiness based on task
                            completion, defects, coverage, and open risks.
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          disabled={readinessLoading}
                          onClick={runReadiness}
                          className="no-print w-full sm:w-auto shrink-0"
                          data-html2canvas-ignore="true"
                        >
                          {readinessLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Calculating…
                            </>
                          ) : (
                            <>
                              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                              Calculate Readiness
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!readinessResult && !readinessLoading && (
                        <div className="py-10 text-center text-muted-foreground text-sm px-4">
                          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          Click <strong>Calculate Readiness</strong> to generate
                          the readiness report.
                        </div>
                      )}
                      {readinessLoading && (
                        <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm px-4">
                          <Loader2 className="w-4 h-4 animate-spin" />{" "}
                          Calculating release readiness…
                        </div>
                      )}
                      {readinessResult && (
                        <div className="space-y-4">
                          <div className="flex flex-col items-center gap-3 p-6 rounded-xl border bg-muted/30">
                            <div
                              className={`text-5xl font-bold ${
                                readinessResult.readinessScore >= 80
                                  ? "text-green-600"
                                  : readinessResult.readinessScore >= 50
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }`}
                            >
                              {readinessResult.readinessScore}%
                            </div>
                            <Badge
                              className={
                                readinessResult.status === "ready"
                                  ? "bg-green-100 text-green-800"
                                  : readinessResult.status === "caution"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                              }
                            >
                              {readinessResult.status === "ready"
                                ? "🟢 Release Ready"
                                : readinessResult.status === "caution"
                                  ? "🟡 Caution"
                                  : "🔴 Not Ready"}
                            </Badge>
                            <p className="text-sm text-muted-foreground text-center">
                              {readinessResult.verdict}
                            </p>

                            {readinessResult.expectedReleaseDate && (
                              <div className="mt-3 w-full bg-background border border-border rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start gap-1 sm:gap-4 shadow-sm text-sm text-left">
                                <div className="flex items-start gap-2 shrink-0">
                                  <Clock className="w-4 h-4 mt-0.5 text-muted-foreground" />
                                  <span className="font-semibold text-foreground leading-snug whitespace-nowrap">
                                    Expected <br className="hidden sm:block" />{" "}
                                    Release:
                                  </span>
                                </div>
                                <div className="flex-1 text-foreground leading-relaxed pt-1 sm:pt-0">
                                  {readinessResult.expectedReleaseDate}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4">
                            {readinessResult.positives?.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-green-700 mb-2">
                                  ✅ Positive Signals
                                </p>
                                <ul className="space-y-1">
                                  {readinessResult.positives.map(
                                    (p: string, i: number) => (
                                      <li
                                        key={i}
                                        className="text-xs text-muted-foreground flex gap-2 items-start"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
                                        <span>{p}</span>
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            )}
                            {readinessResult.blockers?.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-red-700 mb-2">
                                  🚫 Blockers
                                </p>
                                <ul className="space-y-1">
                                  {readinessResult.blockers.map(
                                    (b: string, i: number) => (
                                      <li
                                        key={i}
                                        className="text-xs text-muted-foreground flex gap-2 items-start"
                                      >
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                                        <span>{b}</span>
                                      </li>
                                    ),
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" /> Test
                      Execution Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.testExecution.total === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No test cases linked to this ticket.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">
                              Total Test Cases
                            </p>
                            <p className="text-xl sm:text-2xl font-bold">
                              {data.testExecution.total}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">
                              Pass Rate
                            </p>
                            <p className="text-xl sm:text-2xl font-bold text-green-600">
                              {data.testExecution.passRate}%
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">
                              Success Rate
                            </p>
                            <p className="text-xl sm:text-2xl font-bold text-blue-600">
                              {data.testExecution.successRate}%
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                          <div className="w-full" style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  isAnimationActive={false}
                                  data={execData}
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  dataKey="value"
                                  label={false}
                                >
                                  {execData.map((entry, i) => (
                                    <Cell
                                      key={`cell-${i}`}
                                      fill={entry.color}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: number) => [`${v} test cases`]}
                                />
                                <Legend
                                  iconSize={10}
                                  iconType="circle"
                                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="flex flex-col gap-2 w-full">
                            <div className="grid grid-cols-3 gap-2">
                              <StatBox
                                label="PASSED"
                                value={data.testExecution.passed}
                                color="bg-green-100 text-green-800"
                              />
                              <StatBox
                                label="FAILED"
                                value={data.testExecution.failed}
                                color="bg-red-100 text-red-800"
                              />
                              <StatBox
                                label="BLOCKED"
                                value={data.testExecution.blocked}
                                color="bg-orange-100 text-orange-800"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <StatBox
                                label="IN PROGRESS"
                                value={data.testExecution.inProgress}
                                color="bg-blue-100 text-blue-800"
                              />
                              <StatBox
                                label="NOT EXECUTED"
                                value={data.testExecution.notExecuted}
                                color="bg-gray-100 text-gray-700"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {data.moduleDetails.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" /> Test
                        Execution Details by Module
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm min-w-[600px]">
                            <thead>
                              <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                                <th className="text-left py-2 px-3 font-medium">
                                  Module
                                </th>
                                <th className="text-center py-2 px-2 font-medium">
                                  Total
                                </th>
                                <th className="text-center py-2 px-2 font-medium text-green-700">
                                  Passed
                                </th>
                                <th className="text-center py-2 px-2 font-medium text-red-700">
                                  Failed
                                </th>
                                <th className="text-center py-2 px-2 font-medium text-orange-700">
                                  Blocked
                                </th>
                                <th className="text-center py-2 px-2 font-medium text-blue-700">
                                  In Prog.
                                </th>
                                <th className="text-center py-2 px-2 font-medium text-gray-600">
                                  Not Exec.
                                </th>
                                <th className="text-center py-2 px-2 font-medium">
                                  Pass%
                                </th>
                                <th className="text-center py-2 px-2 font-medium">
                                  Total%
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.moduleDetails.map((m, i) => (
                                <tr
                                  key={i}
                                  className="border-b hover:bg-muted/20 transition-colors"
                                >
                                  <td className="py-2 px-3 font-medium">
                                    {m.module}
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    {m.total}
                                  </td>
                                  <td className="text-center py-2 px-2 text-green-700">
                                    {m.passed}
                                  </td>
                                  <td className="text-center py-2 px-2 text-red-700">
                                    {m.failed}
                                  </td>
                                  <td className="text-center py-2 px-2 text-orange-700">
                                    {m.blocked}
                                  </td>
                                  <td className="text-center py-2 px-2 text-blue-700">
                                    {m.inProgress}
                                  </td>
                                  <td className="text-center py-2 px-2 text-gray-600">
                                    {m.notExecuted}
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    <span
                                      className={`font-semibold ${m.passCompletion >= 80 ? "text-green-700" : m.passCompletion >= 50 ? "text-yellow-700" : "text-red-700"}`}
                                    >
                                      {m.passCompletion}%
                                    </span>
                                  </td>
                                  <td className="text-center py-2 px-2 font-medium">
                                    {m.totalCompletion}%
                                  </td>
                                </tr>
                              ))}
                              <tr className="font-bold bg-muted/40 border-t-2">
                                <td className="py-2 px-3">Grand Total</td>
                                <td className="text-center py-2 px-2">
                                  {data.testExecution.total}
                                </td>
                                <td className="text-center py-2 px-2 text-green-700">
                                  {data.testExecution.passed}
                                </td>
                                <td className="text-center py-2 px-2 text-red-700">
                                  {data.testExecution.failed}
                                </td>
                                <td className="text-center py-2 px-2 text-orange-700">
                                  {data.testExecution.blocked}
                                </td>
                                <td className="text-center py-2 px-2 text-blue-700">
                                  {data.testExecution.inProgress}
                                </td>
                                <td className="text-center py-2 px-2">
                                  {data.testExecution.notExecuted}
                                </td>
                                <td className="text-center py-2 px-2 text-green-700">
                                  {data.testExecution.passRate}%
                                </td>
                                <td className="text-center py-2 px-2">
                                  {data.testExecution.successRate}%
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:hidden">
                          {data.moduleDetails.map((m, i) => (
                            <div
                              key={i}
                              className="p-4 border rounded-xl bg-card shadow-sm space-y-3"
                            >
                              <div className="flex justify-between items-center border-b pb-2">
                                <span className="font-bold text-base">
                                  {m.module}
                                </span>
                                <Badge variant="secondary">
                                  Total: {m.total}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Passed:
                                  </span>
                                  <span className="font-semibold text-green-700">
                                    {m.passed}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Failed:
                                  </span>
                                  <span className="font-semibold text-red-700">
                                    {m.failed}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Blocked:
                                  </span>
                                  <span className="font-semibold text-orange-700">
                                    {m.blocked}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    In Prog:
                                  </span>
                                  <span className="font-semibold text-blue-700">
                                    {m.inProgress}
                                  </span>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-2 border-t text-xs font-medium">
                                <span className="text-muted-foreground">
                                  Not Exec: {m.notExecuted}
                                </span>
                                <div className="flex gap-3">
                                  <span
                                    className={
                                      m.passCompletion >= 80
                                        ? "text-green-700"
                                        : m.passCompletion >= 50
                                          ? "text-yellow-700"
                                          : "text-red-700"
                                    }
                                  >
                                    Pass: {m.passCompletion}%
                                  </span>
                                  <span>Total: {m.totalCompletion}%</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bug className="w-4 h-4 text-primary" /> Defect Status
                      Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.defects.total === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No defects found for this ticket.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">
                              Total Defects
                            </p>
                            <p className="text-xl sm:text-2xl font-bold">
                              {data.defects.total}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg border text-center">
                            <p className="text-xs text-muted-foreground">
                              Open Rate
                            </p>
                            <p
                              className={`text-xl sm:text-2xl font-bold ${data.defects.openRate > 50 ? "text-red-600" : data.defects.openRate > 20 ? "text-yellow-600" : "text-green-600"}`}
                            >
                              {data.defects.openRate}%
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                          <div className="w-full" style={{ height: 260 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  isAnimationActive={false}
                                  data={defectData}
                                  cx="50%"
                                  cy="45%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  dataKey="value"
                                  label={false}
                                >
                                  {defectData.map((entry, i) => (
                                    <Cell
                                      key={`cell-${i}`}
                                      fill={entry.color}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: number) => [`${v} defects`]}
                                />
                                <Legend
                                  iconSize={10}
                                  iconType="circle"
                                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-2 gap-2">
                            {Object.entries(data.defects.counts).map(
                              ([status, count]) => {
                                const formattedName = status
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase());

                                const chartItem = defectData.find(
                                  (d) => d.name === formattedName,
                                );

                                const cardColor = chartItem
                                  ? chartItem.color
                                  : "#cbd5e1";

                                return (
                                  <div
                                    key={status}
                                    className="border rounded-xl p-2.5 bg-muted/10 flex flex-col items-center justify-center relative overflow-hidden"
                                    style={{
                                      borderBottom: `3px solid ${cardColor}`,
                                    }}
                                  >
                                    <span
                                      className="text-base font-bold"
                                      style={{
                                        color:
                                          count > 0 ? cardColor : "inherit",
                                      }}
                                    >
                                      {count}
                                    </span>
                                    <span className="text-[10px] font-medium text-muted-foreground text-center truncate w-full uppercase mt-0.5">
                                      {formattedName}
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {data.activeDefects.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-primary" />{" "}
                        Active Defects ({data.activeDefects.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 sm:px-6">
                      <div className="space-y-4">
                        <div className="hidden md:block overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm min-w-[700px]">
                            <thead>
                              <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                                <th className="text-left py-2 px-3 font-medium">
                                  #
                                </th>
                                <th className="text-left py-2 px-3 font-medium">
                                  Defect Subject
                                </th>
                                <th className="text-center py-2 px-2 font-medium">
                                  Priority
                                </th>
                                <th className="text-center py-2 px-2 font-medium">
                                  Status
                                </th>
                                <th className="text-left py-2 px-2 font-medium">
                                  Category
                                </th>
                                <th className="text-left py-2 px-2 font-medium">
                                  Assignee
                                </th>
                                <th className="text-center py-2 px-3 font-medium">
                                  Created On
                                </th>
                                <th className="text-center py-2 px-3 font-medium">
                                  Reopened
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(showAllDefects
                                ? data.activeDefects
                                : data.activeDefects.slice(
                                    (activeDefectsPage - 1) * 10,
                                    activeDefectsPage * 10,
                                  )
                              ).map((d) => (
                                <tr
                                  key={d.id}
                                  className="border-b hover:bg-muted/20 transition-colors"
                                >
                                  <td className="py-2 px-3 text-muted-foreground">
                                    #{d.id}
                                  </td>
                                  <td
                                    className="py-2 px-3 font-medium max-w-[220px] truncate"
                                    title={d.name}
                                  >
                                    {d.name}
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[d.priority] ?? "bg-gray-100 text-gray-700"}`}
                                    >
                                      {d.priority}
                                    </span>
                                  </td>
                                  <td className="text-center py-2 px-2">
                                    {(() => {
                                      const formattedStatus = d.status
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (c) =>
                                          c.toUpperCase(),
                                        );
                                      const color =
                                        DEFECT_STATUS_HEX[formattedStatus] ||
                                        "#9ca3af";

                                      return (
                                        <span
                                          className="px-2 py-1 rounded text-xs font-medium border whitespace-nowrap"
                                          style={{
                                            color: color,
                                            borderColor: color,
                                            backgroundColor: `${color}1A`,
                                          }}
                                        >
                                          {d.status}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="py-2 px-2 text-muted-foreground">
                                    {d.category || "—"}
                                  </td>
                                  <td className="py-2 px-2 font-medium">
                                    {d.assignee}
                                  </td>
                                  <td className="text-center py-2 px-3 text-muted-foreground text-xs">
                                    {format(
                                      new Date(d.createdAt),
                                      "dd/MM/yyyy",
                                    )}
                                  </td>
                                  <td className="text-center py-2 px-3">
                                    {d.reopenedCount && d.reopenedCount > 0 ? (
                                      <span className="bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full text-xs">
                                        {d.reopenedCount}x
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-xs font-medium bg-muted px-2 py-0.5 rounded-full">
                                        0
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:hidden px-4 sm:px-0">
                          {(showAllDefects
                            ? data.activeDefects
                            : data.activeDefects.slice(
                                (activeDefectsPage - 1) * 10,
                                activeDefectsPage * 10,
                              )
                          ).map((d) => {
                            const formattedStatus = d.status
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase());
                            const color =
                              DEFECT_STATUS_HEX[formattedStatus] || "#9ca3af";

                            return (
                              <div
                                key={d.id}
                                className="p-3 border rounded-xl bg-card shadow-sm space-y-2"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-mono text-xs font-semibold text-muted-foreground shrink-0">
                                    #{d.id}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                    style={{
                                      color: color,
                                      backgroundColor: `${color}1A`,
                                      border: `1px solid ${color}40`,
                                    }}
                                  >
                                    {d.status}
                                  </span>
                                </div>

                                <p className="font-medium text-sm leading-tight">
                                  {d.name}
                                </p>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t mt-2">
                                  <div className="flex gap-2 items-center">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_COLOR[d.priority] ?? "bg-gray-100 text-gray-700"}`}
                                    >
                                      {d.priority}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                                      {d.category || "No Category"}
                                    </span>
                                    {d.reopenedCount && d.reopenedCount > 0 ? (
                                      <span className="bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                        Reopened: {d.reopenedCount}x
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs font-medium">
                                      {d.assignee}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(
                                        new Date(d.createdAt),
                                        "dd MMM yy",
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {data.activeDefects.length > 10 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-muted/10 border-t md:rounded-b-lg">
                            <div className="text-xs text-muted-foreground text-center sm:text-left">
                              {showAllDefects ? (
                                <>
                                  Showing all{" "}
                                  <span className="font-medium">
                                    {data.activeDefects.length}
                                  </span>{" "}
                                  defects
                                </>
                              ) : (
                                <>
                                  Showing{" "}
                                  <span className="font-medium">
                                    {(activeDefectsPage - 1) * 10 + 1}
                                  </span>{" "}
                                  to{" "}
                                  <span className="font-medium">
                                    {Math.min(
                                      activeDefectsPage * 10,
                                      data.activeDefects.length,
                                    )}
                                  </span>{" "}
                                  of{" "}
                                  <span className="font-medium">
                                    {data.activeDefects.length}
                                  </span>{" "}
                                  defects
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 flex-wrap justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() =>
                                  setShowAllDefects(!showAllDefects)
                                }
                                data-html2canvas-ignore="true"
                              >
                                {showAllDefects ? "Show Less" : "See All"}
                              </Button>

                              {!showAllDefects && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() =>
                                      setActiveDefectsPage((p) =>
                                        Math.max(1, p - 1),
                                      )
                                    }
                                    disabled={activeDefectsPage === 1}
                                    data-html2canvas-ignore="true"
                                  >
                                    Previous
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() =>
                                      setActiveDefectsPage((p) =>
                                        Math.min(
                                          Math.ceil(
                                            data.activeDefects.length / 10,
                                          ),
                                          p + 1,
                                        ),
                                      )
                                    }
                                    disabled={
                                      activeDefectsPage >=
                                      Math.ceil(data.activeDefects.length / 10)
                                    }
                                    data-html2canvas-ignore="true"
                                  >
                                    Next
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
