import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
import {
  FileBarChart2, Search, CheckCircle2, AlertTriangle, Bug,
  TrendingUp, LogOut, User, Database, GitBranch, Clock,
  ChevronDown, ChevronUp, ExternalLink, Wifi, WifiOff,
} from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PmoReportData {
  redmineId: string;
  generatedAt: string;
  source?: "redmine" | "local";
  issueSubject?: string;
  projectName?: string;
  requirements: Array<{ id: number; title: string; module: string | null; status: string; priority: string }>;
  testExecution: {
    total: number; passed: number; failed: number; blocked: number;
    inProgress: number; notExecuted: number; passRate: number; successRate: number;
  };
  moduleDetails: Array<{
    module: string; total: number; passed: number; failed: number;
    blocked: number; inProgress: number; notExecuted: number;
    passCompletion: number; totalCompletion: number;
  }>;
  defects: { total: number; openRate: number; counts: Record<string, number> };
  activeDefects: Array<{
    id: number; name: string; priority: string; status: string;
    category: string; assignee: string; createdAt: string;
  }>;
}

interface RedmineData {
  connected: boolean;
  error?: string;
  issue?: {
    id: number; subject: string; description: string; status: string;
    tracker: string; priority: string; assignee: string; author: string;
    projectName: string; doneRatio: number; estimatedHours: number | null;
    startDate: string | null; dueDate: string | null;
    createdOn: string; updatedOn: string;
  };
  children?: Array<{
    id: number; subject: string; status: string; tracker: string;
    priority: string; assignee: string; doneRatio: number; dueDate: string | null; createdOn: string;
  }>;
  statusSummary?: Record<string, number>;
  journals?: Array<{ id: number; notes: string; author: string; createdOn: string }>;
}

const EXEC_COLORS  = ["#4ade80", "#f87171", "#fb923c", "#94a3b8", "#60a5fa"];
const DEFECT_COLORS = ["#f9d77e", "#1abc9c", "#3498db", "#f4a688", "#27ae60", "#c7a2d6", "#a8d5ba", "#bdc3c7"];

const STATUS_COLOR: Record<string, string> = {
  "New":       "bg-yellow-100 text-yellow-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "Resolved":  "bg-green-100 text-green-800",
  "Closed":    "bg-gray-100 text-gray-600",
  "Feedback":  "bg-purple-100 text-purple-800",
  "Rejected":  "bg-red-100 text-red-800",
};

const PRIORITY_COLOR: Record<string, string> = {
  "Low":      "bg-gray-100 text-gray-600",
  "Normal":   "bg-blue-100 text-blue-700",
  "High":     "bg-orange-100 text-orange-700",
  "Urgent":   "bg-red-100 text-red-700",
  "Immediate":"bg-red-200 text-red-900",
};

function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "PM";

  return (
    <>
      <aside className="w-60 shrink-0 flex flex-col h-screen bg-sidebar border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileBarChart2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sidebar-foreground text-sm leading-tight">QA Pulse</p>
              <p className="text-xs text-sidebar-foreground/50 leading-tight">PMO Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <div className="px-3 py-2 rounded-lg bg-primary/10 flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Report Dashboard</span>
          </div>
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/30">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? "PMO Manager"}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email ?? ""}</p>
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
            <AlertDialogDescription>You will be returned to the login page.</AlertDialogDescription>
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

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-3 ${color} min-w-[90px]`}>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs font-medium mt-0.5 text-center opacity-80 leading-tight">{label}</span>
    </div>
  );
}

function RedmineSection({ issueId, token }: { issueId: string; token: string | null }) {
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
              <Badge variant="outline" className={`text-xs gap-1 ${data.connected ? "text-green-700 border-green-300" : "text-red-600 border-red-300"}`}>
                {data.connected
                  ? <><Wifi className="w-3 h-3" /> Connected</>
                  : <><WifiOff className="w-3 h-3" /> Offline</>
                }
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
              <Clock className="w-4 h-4 animate-spin" /> Connecting to Redmine database…
            </div>
          )}

          {(error || (data && !data.connected)) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm">
              <p className="font-medium text-amber-800 flex items-center gap-2">
                <WifiOff className="w-4 h-4" /> Redmine database unreachable
              </p>
              <p className="text-amber-700 mt-1 text-xs">
                {data?.error ?? (error as Error)?.message ?? "Connection failed"}
              </p>
              <p className="text-amber-600 mt-2 text-xs">
                The Redmine database at <code className="bg-amber-100 px-1 rounded">10.10.4.130:3306</code> is only accessible from within your internal network. This feature works when QA Pulse is deployed on-premises.
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
                      <p className="text-xs text-muted-foreground mt-0.5">Project: {data.issue.projectName}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge className={`text-xs ${STATUS_COLOR[data.issue.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {data.issue.status}
                    </Badge>
                    <Badge className={`text-xs ${PRIORITY_COLOR[data.issue.priority] ?? "bg-gray-100 text-gray-700"}`}>
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
                      {data.issue.dueDate ? format(new Date(data.issue.dueDate), "dd/MM/yyyy") : "—"}
                    </p>
                  </div>
                </div>
                {data.issue.description && (
                  <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-3">
                    {data.issue.description}
                  </p>
                )}
              </div>

              {data.statusSummary && Object.keys(data.statusSummary).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5" /> Sub-issue Status Summary ({data.children?.length ?? 0} items)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.statusSummary).map(([status, count]) => (
                      <div key={status} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"}`}>
                        {status}: <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.children && data.children.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Sub-issues / Child Tasks</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-muted-foreground">
                          <th className="text-left py-2 px-3 font-medium">#</th>
                          <th className="text-left py-2 px-3 font-medium">Subject</th>
                          <th className="text-center py-2 px-2 font-medium">Tracker</th>
                          <th className="text-center py-2 px-2 font-medium">Status</th>
                          <th className="text-center py-2 px-2 font-medium">Priority</th>
                          <th className="text-left py-2 px-2 font-medium">Assignee</th>
                          <th className="text-center py-2 px-2 font-medium">Done%</th>
                          <th className="text-center py-2 px-2 font-medium">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.children.map((c) => (
                          <tr key={c.id} className="border-b hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-3 text-muted-foreground">#{c.id}</td>
                            <td className="py-2 px-3 max-w-[200px] truncate">{c.subject}</td>
                            <td className="text-center py-2 px-2 text-muted-foreground">{c.tracker}</td>
                            <td className="text-center py-2 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="text-center py-2 px-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLOR[c.priority] ?? "bg-gray-100 text-gray-600"}`}>
                                {c.priority}
                              </span>
                            </td>
                            <td className="py-2 px-2">{c.assignee || "—"}</td>
                            <td className="text-center py-2 px-2 font-medium">{c.doneRatio ?? 0}%</td>
                            <td className="text-center py-2 px-2 text-muted-foreground">
                              {c.dueDate ? format(new Date(c.dueDate), "dd/MM/yy") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.journals && data.journals.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Recent Notes / Updates</p>
                  <div className="space-y-2">
                    {data.journals.map((j) => (
                      <div key={j.id} className="rounded-lg border bg-muted/10 p-3 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium">{j.author}</span>
                          <span className="text-muted-foreground">{format(new Date(j.createdOn), "dd/MM/yyyy HH:mm")}</span>
                        </div>
                        <p className="text-muted-foreground line-clamp-3 whitespace-pre-line">{j.notes}</p>
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
  const { token, logout } = useAuth();
  const [input, setInput] = useState("");
  const [redmineId, setRedmineId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PmoReportData>({
    queryKey: ["pmo-report", redmineId],
    queryFn: async () => {
      const resp = await fetch(`${getApiUrl()}/pmo/report?redmineId=${encodeURIComponent(redmineId!)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const e = new Error(body.error ?? "Failed to load report");
        (e as any).help = body.help ?? [];
        throw e;
      }
      return resp.json();
    },
    enabled: !!redmineId,
    retry: false,
  });

  const handleSearch = () => {
    const clean = input.trim().replace(/^#/, "");
    if (!clean) return;
    setRedmineId(clean);
  };

  const execData = data
    ? [
        { name: `Passed`,       value: data.testExecution.passed },
        { name: `Failed`,       value: data.testExecution.failed },
        { name: `Blocked`,      value: data.testExecution.blocked },
        { name: `Not Executed`, value: data.testExecution.notExecuted },
        { name: `In Progress`,  value: data.testExecution.inProgress },
      ].filter(d => d.value > 0)
    : [];

  const defectData = data
    ? Object.entries(data.defects.counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          value: v,
        }))
    : [];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar onLogout={logout} />

      <main className="flex-1 overflow-y-auto bg-muted/20">
        <div className="max-w-5xl mx-auto p-6 space-y-6">

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileBarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">PMO Report Portal</h1>
              <p className="text-xs text-muted-foreground">Enter a Redmine ticket number to view the QA status report</p>
            </div>
          </div>

          <Card>
            <CardContent className="pt-5 pb-5">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">#</span>
                  <Input
                    className="pl-7"
                    placeholder="Enter Redmine number (e.g. 34555)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <Button onClick={handleSearch} disabled={isLoading || !input.trim()}>
                  <Search className="w-4 h-4 mr-2" />
                  {isLoading ? "Loading…" : "View Report"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {error && (() => {
            const msg = (error as Error).message;
            const helpLines: string[] = (error as any).help ?? [];
            return (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="pt-5 space-y-2">
                  <p className="text-amber-900 text-sm font-semibold flex items-center gap-2">
                    <WifiOff className="w-4 h-4 shrink-0" /> {msg}
                  </p>
                  {helpLines.length > 0 && (
                    <ul className="space-y-1.5 mt-2">
                      {helpLines.map((line, i) => (
                        <li key={i} className="text-xs text-amber-800 flex gap-2">
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
            <div className="space-y-6">
              <div className="text-center border rounded-xl p-4 bg-card shadow-sm">
                <h2 className="text-lg font-bold text-primary">
                  Test Execution & Defect Status Summary
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  as of {format(new Date(data.generatedAt), "dd/MM/yyyy [HH:mm]")}
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

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Test Execution Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.testExecution.total === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No test cases linked to this ticket.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Total Test Cases</p>
                          <p className="text-2xl font-bold">{data.testExecution.total}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Pass Rate</p>
                          <p className="text-2xl font-bold text-green-600">{data.testExecution.passRate}%</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Success Rate</p>
                          <p className="text-2xl font-bold text-blue-600">{data.testExecution.successRate}%</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="w-full" style={{ height: 260 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={execData}
                                cx="50%" cy="45%"
                                innerRadius={60} outerRadius={90}
                                dataKey="value"
                                label={false}
                              >
                                {execData.map((_, i) => <Cell key={i} fill={EXEC_COLORS[i % EXEC_COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v: number) => [`${v} test cases`]} />
                              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <StatBox label="PASSED"       value={data.testExecution.passed}      color="bg-green-100 text-green-800" />
                          <StatBox label="FAILED"       value={data.testExecution.failed}      color="bg-red-100 text-red-800" />
                          <StatBox label="BLOCKED"      value={data.testExecution.blocked}     color="bg-orange-100 text-orange-800" />
                          <StatBox label="NOT EXECUTED" value={data.testExecution.notExecuted} color="bg-gray-100 text-gray-700" />
                          <StatBox label="IN PROGRESS"  value={data.testExecution.inProgress}  color="bg-blue-100 text-blue-800" />
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
                      <CheckCircle2 className="w-4 h-4 text-primary" /> Test Execution Details by Module
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                            <th className="text-left py-2 px-3 font-medium">Module</th>
                            <th className="text-center py-2 px-2 font-medium">Total</th>
                            <th className="text-center py-2 px-2 font-medium text-green-700">Passed</th>
                            <th className="text-center py-2 px-2 font-medium text-red-700">Failed</th>
                            <th className="text-center py-2 px-2 font-medium text-orange-700">Blocked</th>
                            <th className="text-center py-2 px-2 font-medium text-blue-700">In Prog.</th>
                            <th className="text-center py-2 px-2 font-medium text-gray-600">Not Exec.</th>
                            <th className="text-center py-2 px-2 font-medium">Pass%</th>
                            <th className="text-center py-2 px-2 font-medium">Total%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.moduleDetails.map((m, i) => (
                            <tr key={i} className="border-b hover:bg-muted/20 transition-colors">
                              <td className="py-2 px-3 font-medium">{m.module}</td>
                              <td className="text-center py-2 px-2">{m.total}</td>
                              <td className="text-center py-2 px-2 text-green-700">{m.passed}</td>
                              <td className="text-center py-2 px-2 text-red-700">{m.failed}</td>
                              <td className="text-center py-2 px-2 text-orange-700">{m.blocked}</td>
                              <td className="text-center py-2 px-2 text-blue-700">{m.inProgress}</td>
                              <td className="text-center py-2 px-2 text-gray-600">{m.notExecuted}</td>
                              <td className="text-center py-2 px-2">
                                <span className={`font-semibold ${m.passCompletion >= 80 ? "text-green-700" : m.passCompletion >= 50 ? "text-yellow-700" : "text-red-700"}`}>
                                  {m.passCompletion}%
                                </span>
                              </td>
                              <td className="text-center py-2 px-2 font-medium">{m.totalCompletion}%</td>
                            </tr>
                          ))}
                          <tr className="font-bold bg-muted/40 border-t-2">
                            <td className="py-2 px-3">Grand Total</td>
                            <td className="text-center py-2 px-2">{data.testExecution.total}</td>
                            <td className="text-center py-2 px-2 text-green-700">{data.testExecution.passed}</td>
                            <td className="text-center py-2 px-2 text-red-700">{data.testExecution.failed}</td>
                            <td className="text-center py-2 px-2 text-orange-700">{data.testExecution.blocked}</td>
                            <td className="text-center py-2 px-2 text-blue-700">{data.testExecution.inProgress}</td>
                            <td className="text-center py-2 px-2">{data.testExecution.notExecuted}</td>
                            <td className="text-center py-2 px-2 text-green-700">{data.testExecution.passRate}%</td>
                            <td className="text-center py-2 px-2">{data.testExecution.successRate}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Bug className="w-4 h-4 text-primary" /> Defect Status Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.defects.total === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No defects found for this ticket.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Total Defects</p>
                          <p className="text-2xl font-bold">{data.defects.total}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Open Rate</p>
                          <p className={`text-2xl font-bold ${data.defects.openRate > 50 ? "text-red-600" : data.defects.openRate > 20 ? "text-yellow-600" : "text-green-600"}`}>
                            {data.defects.openRate}%
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <div className="w-full" style={{ height: 260 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={defectData}
                                cx="50%" cy="45%"
                                innerRadius={60} outerRadius={90}
                                dataKey="value"
                                label={false}
                              >
                                {defectData.map((_, i) => <Cell key={i} fill={DEFECT_COLORS[i % DEFECT_COLORS.length]} />)}
                              </Pie>
                              <Tooltip formatter={(v: number) => [`${v} defects`]} />
                              <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {Object.entries(data.defects.counts).filter(([, v]) => v > 0).map(([k, v]) => (
                            <div key={k} className="text-center px-2 py-2 rounded-lg bg-muted/50 border">
                              <p className="text-lg font-bold">{v}</p>
                              <p className="text-xs text-muted-foreground capitalize leading-tight">{k.replace(/_/g, " ")}</p>
                            </div>
                          ))}
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
                      <AlertTriangle className="w-4 h-4 text-orange-500" /> Active Defect Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b text-xs text-muted-foreground bg-muted/30">
                            <th className="text-left py-2 px-3 font-medium">#</th>
                            <th className="text-left py-2 px-3 font-medium">Subject</th>
                            <th className="text-center py-2 px-2 font-medium">Priority</th>
                            <th className="text-center py-2 px-2 font-medium">Status</th>
                            <th className="text-left py-2 px-2 font-medium">Assignee</th>
                            <th className="text-center py-2 px-2 font-medium">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.activeDefects.map((d) => (
                            <tr key={d.id} className="border-b hover:bg-muted/20 transition-colors">
                              <td className="py-2 px-3 text-muted-foreground">#{d.id}</td>
                              <td className="py-2 px-3">{d.name}</td>
                              <td className="text-center py-2 px-2">
                                <Badge variant="outline" className="text-xs">{d.priority}</Badge>
                              </td>
                              <td className="text-center py-2 px-2">
                                <Badge className="text-xs capitalize">{d.status.replace(/_/g, " ")}</Badge>
                              </td>
                              <td className="py-2 px-2 text-sm">{d.assignee}</td>
                              <td className="text-center py-2 px-2 text-xs text-muted-foreground">
                                {format(new Date(d.createdAt), "dd/MM/yyyy")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <p className="text-center text-xs text-muted-foreground pb-4">
                Generated by QA Pulse · Report for Redmine #{data.redmineId}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
