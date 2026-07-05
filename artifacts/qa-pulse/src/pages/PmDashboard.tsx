import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, Users } from "lucide-react";
import { format } from "date-fns";

interface MilestoneSummary {
  id: number;
  name: string;
  type: string;
  status: string;
  targetDate: string | null;
  requirementCount: number;
  approvedCount: number;
  approvedPct: number;
  qa: { tcCount: number; passed: number; failed: number; blocked: number; notRun: number; passPct: number };
  uat: { tcCount: number; passed: number; failed: number; blocked: number; notRun: number; passPct: number } | null;
  scheduleRisk: "on-track" | "at-risk" | "overdue" | "no-date" | "completed" | "cancelled";
}

interface CapacityEntry {
  userId: number;
  name: string;
  openTaskCount: number;
  estimatedHours: number;
  overdueTaskCount: number;
}

interface ProjectSummary {
  projectId: number;
  projectName: string;
  milestones: MilestoneSummary[];
  capacity: CapacityEntry[];
}

interface PmSummary {
  portfolio: {
    totalProjects: number;
    activeMilestones: number;
    milestonesAtRisk: number;
    milestonesOverdue: number;
  };
  projects: ProjectSummary[];
}

interface PhaseBoundary {
  start: string | null;
  end: string | null;
  days: number | null;
  ongoing: boolean;
}

interface PhaseBreakdown {
  requirements: PhaseBoundary;
  gapBeforeQa: PhaseBoundary;
  qa: PhaseBoundary;
  gapBeforeUat: PhaseBoundary | null;
  uat: PhaseBoundary | null;
}

interface PhaseTrendEntry {
  id: number;
  name: string;
  requirementsDays: number | null;
  gapDays: number | null;
  qaDays: number | null;
  uatDays: number | null;
}

interface RequirementPhaseEntry {
  id: number;
  title: string;
  status: string;
  phases: PhaseBreakdown | null;
}

interface PhaseReport {
  milestone: { id: number; name: string; status: string; targetDate?: string | null };
  phases: PhaseBreakdown | null;
  trend: {
    count: number;
    avgRequirementsDays: number | null;
    avgGapDays: number | null;
    avgQaDays: number | null;
    avgUatDays: number | null;
    milestones: PhaseTrendEntry[];
  } | null;
  requirements: RequirementPhaseEntry[];
}

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const RISK_LABEL: Record<MilestoneSummary["scheduleRisk"], string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  overdue: "Overdue",
  "no-date": "No date set",
  completed: "Completed",
  cancelled: "Cancelled",
};

function RiskBadge({ risk }: { risk: MilestoneSummary["scheduleRisk"] }) {
  const cls: Record<MilestoneSummary["scheduleRisk"], string> = {
    "on-track": "bg-green-100 text-green-700 border-green-200",
    "at-risk": "bg-amber-100 text-amber-700 border-amber-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
    "no-date": "bg-muted text-muted-foreground border-transparent",
    completed: "bg-muted text-muted-foreground border-transparent",
    cancelled: "bg-muted text-muted-foreground border-transparent",
  };
  return <Badge className={`text-xs font-normal ${cls[risk]}`} variant="outline">{RISK_LABEL[risk]}</Badge>;
}

function readinessBarColor(risk: MilestoneSummary["scheduleRisk"]) {
  if (risk === "overdue") return "bg-red-500";
  if (risk === "at-risk") return "bg-amber-500";
  if (risk === "completed" || risk === "cancelled") return "bg-muted-foreground/40";
  return "bg-green-500";
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: "warning" | "danger" }) {
  const toneClass = tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "";
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <p className={`text-sm mb-1 ${tone ? toneClass : "text-muted-foreground"}`}>{label}</p>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MilestoneTile({ m, projectId }: { m: MilestoneSummary; projectId: number }) {
  const [, navigate] = useLocation();
  const readinessPct = m.qa.tcCount > 0 ? m.qa.passPct : m.approvedPct;
  const dueLabel = m.targetDate
    ? m.scheduleRisk === "overdue"
      ? `Was due ${format(new Date(m.targetDate), "d MMM")}`
      : `Due ${format(new Date(m.targetDate), "d MMM")}`
    : "Not scheduled";

  return (
    <button
      type="button"
      onClick={() => navigate(`/requirements?projectId=${projectId}&milestoneId=${m.id}`)}
      className="border rounded-lg p-3 space-y-2 text-left w-full hover:border-primary/50 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{m.name}</span>
        <RiskBadge risk={m.scheduleRisk} />
      </div>
      <p className="text-xs text-muted-foreground capitalize">{m.type} &middot; {dueLabel}</p>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${readinessBarColor(m.scheduleRisk)}`} style={{ width: `${readinessPct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {m.requirementCount > 0
          ? `${m.approvedCount}/${m.requirementCount} reqs approved`
          : "No requirements linked yet"}
        {m.qa.tcCount > 0 && ` · ${m.qa.passPct}% QA coverage`}
        {m.uat && ` · ${m.uat.passPct}% UAT`}
      </p>
    </button>
  );
}

function CapacityTable({ capacity }: { capacity: CapacityEntry[] }) {
  if (capacity.length === 0) {
    return <p className="text-xs text-muted-foreground">No open tasks assigned in this project.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="text-left font-normal pb-1">Person</th>
          <th className="text-right font-normal pb-1">Open tasks</th>
          <th className="text-right font-normal pb-1">Est. hours</th>
          <th className="text-right font-normal pb-1">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {capacity.map((c) => (
          <tr key={c.userId} className="border-t">
            <td className="py-1.5">{c.name}</td>
            <td className="py-1.5 text-right">{c.openTaskCount}</td>
            <td className="py-1.5 text-right">{Math.round(c.estimatedHours)}</td>
            <td className={`py-1.5 text-right ${c.overdueTaskCount > 0 ? "text-red-600" : ""}`}>{c.overdueTaskCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Requirements = purple, both gap phases = amber ("nobody owns this time,
// someone should look into it"), QA and UAT are separate testing lanes with
// separate owners so they get distinct (not alarming) colors — QA's bar
// being short is the point, not something to visually flag as bad.
const PHASE_COLOR: Record<string, string> = {
  requirements: "bg-purple-500",
  gap: "bg-amber-400",
  qa: "bg-teal-500",
  uat: "bg-blue-500",
};
const PHASE_TEXT_COLOR: Record<string, string> = {
  requirements: "text-purple-700 dark:text-purple-400",
  gap: "text-amber-700 dark:text-amber-400",
  qa: "text-teal-700 dark:text-teal-400",
  uat: "text-blue-700 dark:text-blue-400",
};

interface PhaseSegment {
  key: string;
  label: string;
  days: number;
  ongoing: boolean;
}

function phasesToSegments(phases: PhaseBreakdown): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  if (phases.requirements.days !== null) segments.push({ key: "requirements", label: "Requirements", days: phases.requirements.days, ongoing: phases.requirements.ongoing });
  if (phases.gapBeforeQa.days !== null) segments.push({ key: "gap", label: "Gap before QA", days: phases.gapBeforeQa.days, ongoing: phases.gapBeforeQa.ongoing });
  if (phases.qa.days !== null) segments.push({ key: "qa", label: "QA testing", days: phases.qa.days, ongoing: phases.qa.ongoing });
  if (phases.gapBeforeUat && phases.gapBeforeUat.days !== null && phases.gapBeforeUat.days > 0) {
    segments.push({ key: "gap", label: "Gap before UAT", days: phases.gapBeforeUat.days, ongoing: phases.gapBeforeUat.ongoing });
  }
  if (phases.uat && phases.uat.days !== null) segments.push({ key: "uat", label: "UAT", days: phases.uat.days, ongoing: phases.uat.ongoing });
  return segments;
}

function PhaseTimelineBar({ phases, compact = false, onClick }: { phases: PhaseBreakdown; compact?: boolean; onClick?: () => void }) {
  const segments = phasesToSegments(phases);
  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data yet — no requirements linked.</p>;
  }
  const total = segments.reduce((sum, s) => sum + s.days, 0) || 1;

  return (
    <div>
      <div
        onClick={onClick}
        className={`flex ${compact ? "h-5" : "h-7"} rounded-md overflow-hidden ${compact ? "mb-0" : "mb-2"} ${onClick ? "cursor-pointer" : ""}`}
      >
        {segments.map((s, i) => (
          <div
            key={i}
            className={`${PHASE_COLOR[s.key]} flex items-center justify-center ${s.ongoing ? "opacity-70" : ""}`}
            style={{ width: `${(s.days / total) * 100}%` }}
            title={`${s.label}: ${s.days}d${s.ongoing ? " (ongoing)" : ""}`}
          >
            {(s.days / total) > 0.08 && <span className={`${compact ? "text-[10px]" : "text-[11px]"} text-white font-medium`}>{s.days}d</span>}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2.5 h-2.5 rounded-sm ${PHASE_COLOR[s.key]}`} />
              {s.label} &middot; {s.days}d{s.ongoing ? " (ongoing)" : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PhaseTrendStrip({ trend }: { trend: NonNullable<PhaseReport["trend"]> }) {
  if (trend.count === 0) {
    return <p className="text-xs text-muted-foreground">No completed milestones yet for this project — trend needs at least one.</p>;
  }
  const maxTotal = Math.max(
    ...trend.milestones.map((m) => (m.requirementsDays ?? 0) + (m.gapDays ?? 0) + (m.qaDays ?? 0) + (m.uatDays ?? 0)),
    1,
  );

  return (
    <div>
      <div className="flex items-end gap-3 h-24 mb-2 px-1">
        {trend.milestones.map((m) => {
          const total = (m.requirementsDays ?? 0) + (m.gapDays ?? 0) + (m.qaDays ?? 0) + (m.uatDays ?? 0);
          const barHeight = Math.max((total / maxTotal) * 100, 4);
          return (
            <div key={m.id} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className="w-full rounded overflow-hidden flex flex-col-reverse" style={{ height: `${barHeight}%` }}>
                {m.requirementsDays !== null && <div className="bg-purple-500" style={{ height: `${(m.requirementsDays / total) * 100}%` }} />}
                {m.gapDays !== null && <div className="bg-amber-400" style={{ height: `${(m.gapDays / total) * 100}%` }} />}
                {m.qaDays !== null && <div className="bg-teal-500" style={{ height: `${(m.qaDays / total) * 100}%` }} />}
                {m.uatDays !== null && <div className="bg-blue-500" style={{ height: `${(m.uatDays / total) * 100}%` }} />}
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{m.name}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-2">
        <div>
          <p className="text-[11px] text-muted-foreground">Requirements avg</p>
          <p className={`text-sm font-medium ${PHASE_TEXT_COLOR.requirements}`}>{trend.avgRequirementsDays ?? "—"}d</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Gap avg</p>
          <p className={`text-sm font-medium ${PHASE_TEXT_COLOR.gap}`}>{trend.avgGapDays ?? "—"}d</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">QA avg</p>
          <p className={`text-sm font-medium ${PHASE_TEXT_COLOR.qa}`}>{trend.avgQaDays ?? "—"}d</p>
        </div>
        {trend.avgUatDays !== null && (
          <div>
            <p className="text-[11px] text-muted-foreground">UAT avg</p>
            <p className={`text-sm font-medium ${PHASE_TEXT_COLOR.uat}`}>{trend.avgUatDays}d</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Based on the last {trend.count} completed milestone{trend.count !== 1 ? "s" : ""} in this project.</p>
    </div>
  );
}

function RequirementStatusBadge({ status }: { status: string }) {
  const cls = status.startsWith("Approved · in QA") || status.startsWith("Approved · in UAT")
    ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400"
    : status.startsWith("Approved")
    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return <Badge className={`text-[11px] font-normal ${cls}`} variant="outline">{status}</Badge>;
}

function RequirementStatusTable({ requirements }: { requirements: RequirementPhaseEntry[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="text-left font-normal pb-1">Requirement</th>
          <th className="text-left font-normal pb-1">Status</th>
        </tr>
      </thead>
      <tbody>
        {requirements.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="py-1.5 pr-3">{r.title}</td>
            <td className="py-1.5"><RequirementStatusBadge status={r.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RequirementTimelineList({ requirements }: { requirements: RequirementPhaseEntry[] }) {
  return (
    <div className="space-y-3">
      {requirements.map((r) => (
        <div key={r.id}>
          <p className="text-xs font-medium mb-1">{r.title}</p>
          {r.phases ? <PhaseTimelineBar phases={r.phases} compact /> : <p className="text-xs text-muted-foreground">No data yet.</p>}
        </div>
      ))}
    </div>
  );
}

export default function PmDashboard() {
  const { token } = useAuth();
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterMilestone, setFilterMilestone] = useState<string>("all");
  const [showTimelines, setShowTimelines] = useState(false);

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: milestonesForFilter = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      if (filterProject === "all") return [];
      const res = await api(`/milestones?projectId=${filterProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const { data, isLoading } = useQuery<PmSummary>({
    queryKey: ["pm-summary", filterProject],
    queryFn: async () => {
      const qs = filterProject !== "all" ? `?projectId=${filterProject}` : "";
      const res = await api(`/dashboard/pm-summary${qs}`, token);
      if (!res.ok) throw new Error("Failed to load PM summary");
      return res.json();
    },
  });

  const { data: phaseReport, isLoading: phaseLoading } = useQuery<PhaseReport>({
    queryKey: ["milestone-phase-breakdown", filterMilestone],
    queryFn: async () => {
      const res = await api(`/dashboard/milestone-phase-breakdown?milestoneId=${filterMilestone}`, token);
      if (!res.ok) throw new Error("Failed to load phase breakdown");
      return res.json();
    },
    enabled: filterMilestone !== "all",
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PM Dashboard</h1>
          <p className="text-sm text-muted-foreground">Milestone health and team capacity across your projects.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={filterProject} onValueChange={(v) => { setFilterProject(v); setFilterMilestone("all"); }}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMilestone} onValueChange={(v) => { setFilterMilestone(v); setShowTimelines(false); }} disabled={filterProject === "all"}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={filterProject === "all" ? "Select a project first" : "Where did the time go?"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Select a milestone…</SelectItem>
              {milestonesForFilter.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filterMilestone !== "all" && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-5">
            <div>
              <p className="text-sm font-medium mb-0.5">Where did the time go — {phaseReport?.milestone.name ?? "…"}</p>
              <p className="text-xs text-muted-foreground">Requirements review, an unattributed gap before testing, QA, and UAT — each measured from real activity, not guessed.</p>
            </div>
            {phaseLoading ? (
              <div className="h-16 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : phaseReport?.phases ? (
              <>
                <PhaseTimelineBar phases={phaseReport.phases} onClick={() => setShowTimelines((v) => !v)} />
                {phaseReport.requirements.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowTimelines((v) => !v)}
                      className="text-xs text-primary hover:underline mb-2"
                    >
                      {showTimelines ? "← Back to status list" : `${phaseReport.requirements.length} requirements — click bar for per-requirement timeline →`}
                    </button>
                    {showTimelines
                      ? <RequirementTimelineList requirements={phaseReport.requirements} />
                      : <RequirementStatusTable requirements={phaseReport.requirements} />}
                  </div>
                )}
                {phaseReport.trend && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium mb-2">Is this a pattern?</p>
                    <PhaseTrendStrip trend={phaseReport.trend} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not enough data yet — this milestone has no requirements linked.</p>
            )}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Projects" value={data.portfolio.totalProjects} />
          <MetricCard label="Active milestones" value={data.portfolio.activeMilestones} />
          <MetricCard label="At risk" value={data.portfolio.milestonesAtRisk} tone="warning" />
          <MetricCard label="Overdue" value={data.portfolio.milestonesOverdue} tone="danger" />
        </div>
      )}

      {!data || data.projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No projects with milestones to show yet.
          </CardContent>
        </Card>
      ) : (
        data.projects.map((project) => (
          <Card key={project.projectId}>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{project.projectName}</span>
              </div>

              {project.milestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones yet for this project.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {project.milestones.map((m) => (
                    <MilestoneTile key={m.id} m={m} projectId={project.projectId} />
                  ))}
                </div>
              )}

              <div className="border-t pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Capacity</span>
                </div>
                <CapacityTable capacity={project.capacity} />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
