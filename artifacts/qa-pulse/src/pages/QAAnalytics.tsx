import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingUp, Download } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project { id: number; name: string; }
interface Milestone { id: number; name: string; projectId: number; }

interface QAAnalyticsData {
  executionTrend: { week: string; passed: number; failed: number; blocked: number; notRun: number }[];
  velocity: { week: string; executed: number }[];
  passByMilestone: { milestoneId: number; milestoneName: string; total: number; passed: number; pct: number }[];
  defectByModule: { module: string; critical: number; high: number; medium: number; low: number }[];
  defectTrend: { week: string; opened: number; closed: number }[];
  escapeFunnel: { milestoneId: number; milestoneName: string; sit: number; uat: number; production: number }[];
  coverage: { totalReqs: number; tcCoveredReqs: number; executedReqs: number; passedReqs: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function pct(num: number, den: number) {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function shortWeek(w: string) {
  // "2026-W27" → "W27"
  return w.split("-")[1] ?? w;
}

// ── Panel components ──────────────────────────────────────────────────────────

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyChart({ message = "No data for the selected period" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">{message}</div>
  );
}

// ── Coverage bar ──────────────────────────────────────────────────────────────

function CoverageFunnel({ coverage }: { coverage: QAAnalyticsData["coverage"] }) {
  const { totalReqs, tcCoveredReqs, executedReqs, passedReqs } = coverage;
  const layers = [
    { label: "Requirements", value: totalReqs, color: "bg-slate-200", textColor: "text-slate-700" },
    { label: "TC Coverage", value: tcCoveredReqs, color: "bg-blue-400", textColor: "text-white" },
    { label: "Executed", value: executedReqs, color: "bg-amber-400", textColor: "text-white" },
    { label: "Passed", value: passedReqs, color: "bg-green-500", textColor: "text-white" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {layers.map(l => (
          <div key={l.label} className="text-center">
            <div className={`text-2xl font-bold ${l.label === "Requirements" ? "text-foreground" : l.label === "TC Coverage" ? "text-blue-600" : l.label === "Executed" ? "text-amber-600" : "text-green-600"}`}>
              {l.value}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{l.label}</div>
            {l.label !== "Requirements" && (
              <div className="text-xs font-medium mt-0.5">
                {pct(l.value, totalReqs)}%
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Proportional funnel bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-slate-100">
        {totalReqs > 0 && (
          <>
            <div className="bg-green-500 transition-all" style={{ width: `${pct(passedReqs, totalReqs)}%` }} title={`Passed: ${passedReqs}`} />
            <div className="bg-amber-400 transition-all" style={{ width: `${pct(executedReqs - passedReqs, totalReqs)}%` }} title={`Executed (not yet passing): ${executedReqs - passedReqs}`} />
            <div className="bg-blue-400 transition-all" style={{ width: `${pct(tcCoveredReqs - executedReqs, totalReqs)}%` }} title={`Has TCs but not executed: ${tcCoveredReqs - executedReqs}`} />
          </>
        )}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Passed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> Executed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Has TCs</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" /> No TCs</span>
      </div>
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: object[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => (r as Record<string, unknown>)[k] ?? "").join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QAAnalytics() {
  const { token } = useAuth();

  const [projectId, setProjectId] = useState<string>("");
  const [milestoneId, setMilestoneId] = useState<string>("all");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api("/projects", token).then(r => r.json()),
    enabled: !!token,
  });

  // Milestones (scoped to project)
  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: ["milestones", projectId],
    queryFn: () => api(`/milestones?projectId=${projectId}`, token).then(r => r.json()),
    enabled: !!projectId,
  });

  // Analytics data
  const analyticsParams = useMemo(() => {
    if (!projectId) return null;
    const p = new URLSearchParams({ projectId });
    if (milestoneId !== "all") p.set("milestoneId", milestoneId);
    p.set("startDate", startDate);
    p.set("endDate", endDate);
    return p.toString();
  }, [projectId, milestoneId, startDate, endDate]);

  const { data, isLoading, isError } = useQuery<QAAnalyticsData>({
    queryKey: ["qa-analytics", analyticsParams],
    queryFn: () => api(`/dashboard/qa-analytics?${analyticsParams}`, token).then(r => {
      if (!r.ok) throw new Error("Failed to load analytics");
      return r.json();
    }),
    enabled: !!analyticsParams,
  });

  const hasData = !!data;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-indigo-500" />
            QA Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Trend visibility across milestones and sprints</p>
        </div>
        {hasData && (
          <Button variant="outline" size="sm" onClick={() => {
            if (!data) return;
            downloadCsv("execution-trend.csv", data.executionTrend);
            downloadCsv("defect-trend.csv", data.defectTrend);
            downloadCsv("defect-by-module.csv", data.defectByModule);
            downloadCsv("pass-by-milestone.csv", data.passByMilestone);
            downloadCsv("escape-funnel.csv", data.escapeFunnel);
          }}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1 min-w-48">
              <Label className="text-xs">Project</Label>
              <Select value={projectId} onValueChange={v => { setProjectId(v); setMilestoneId("all"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 min-w-48">
              <Label className="text-xs">Milestone</Label>
              <Select value={milestoneId} onValueChange={setMilestoneId} disabled={!projectId}>
                <SelectTrigger>
                  <SelectValue placeholder="All milestones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All milestones</SelectItem>
                  {milestones.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" disabled={milestoneId !== "all"} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" disabled={milestoneId !== "all"} />
            </div>

            {milestoneId !== "all" && (
              <Badge variant="outline" className="text-xs text-muted-foreground self-end mb-0.5">Date range disabled — using milestone scope</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading / empty states */}
      {!projectId && (
        <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-lg font-medium">Select a project to see analytics</p>
        </div>
      )}

      {projectId && isLoading && (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      )}

      {projectId && isError && (
        <div className="flex justify-center py-24 text-destructive text-sm">Failed to load analytics data</div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Panel 1 — Execution Trend (full width) */}
          <Panel title="Execution Trend" className="xl:col-span-2">
            {data.executionTrend.every(w => w.passed + w.failed + w.blocked + w.notRun === 0) ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.executionTrend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip formatter={(v, n) => [v, String(n).charAt(0).toUpperCase() + String(n).slice(1)]} labelFormatter={shortWeek} />
                  <Legend />
                  <Line type="monotone" dataKey="passed" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="blocked" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="notRun" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 2 — Velocity */}
          <Panel title="Execution Velocity (TCs / week)">
            {data.velocity.every(w => w.executed === 0) ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.velocity} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip labelFormatter={shortWeek} />
                  <Bar dataKey="executed" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 3 — Pass Rate by Milestone */}
          <Panel title="Pass Rate by Milestone">
            {data.passByMilestone.every(m => m.total === 0) ? (
              <EmptyChart message="No execution data across milestones" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.passByMilestone} layout="horizontal" margin={{ top: 8, right: 16, bottom: 0, left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="milestoneName" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={80} />
                  <Tooltip formatter={(v) => [`${v}%`, "Pass rate"]} />
                  <Bar dataKey="pct" fill="#22c55e" radius={[0, 3, 3, 0]}
                    label={{ position: "right", formatter: (v: number) => v > 0 ? `${v}%` : "", fontSize: 11, fill: "#6b7280" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 4 — Defect Density by Module */}
          <Panel title="Defect Density by Module (top 10)">
            {data.defectByModule.length === 0 ? (
              <EmptyChart message="No defects recorded" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.defectByModule} margin={{ top: 8, right: 8, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="module" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="critical" stackId="a" fill="#ef4444" />
                  <Bar dataKey="high" stackId="a" fill="#f97316" />
                  <Bar dataKey="medium" stackId="a" fill="#eab308" />
                  <Bar dataKey="low" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 5 — Defect Trend */}
          <Panel title="Defect Trend (opened vs closed)">
            {data.defectTrend.every(w => w.opened === 0 && w.closed === 0) ? (
              <EmptyChart message="No defects in this period" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.defectTrend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip labelFormatter={shortWeek} />
                  <Legend />
                  <Line type="monotone" dataKey="opened" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="closed" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 6 — Escape Funnel */}
          <Panel title="Defect Escape Funnel by Milestone">
            {data.escapeFunnel.every(m => m.sit + m.uat + m.production === 0) ? (
              <EmptyChart message="No defects with milestone linkage found" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.escapeFunnel} margin={{ top: 8, right: 8, bottom: 40, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="milestoneName" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sit" stackId="a" fill="#6366f1" name="SIT" />
                  <Bar dataKey="uat" stackId="a" fill="#f59e0b" name="UAT" />
                  <Bar dataKey="production" stackId="a" fill="#ef4444" name="Production" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Panel 7 — Coverage Snapshot (full width) */}
          <Panel title="Requirement Coverage Snapshot" className="xl:col-span-2">
            {data.coverage.totalReqs === 0 ? (
              <EmptyChart message="No requirements found for this scope" />
            ) : (
              <CoverageFunnel coverage={data.coverage} />
            )}
          </Panel>

        </div>
      )}
    </div>
  );
}
