import { useState } from "react";
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

function MilestoneTile({ m }: { m: MilestoneSummary }) {
  const readinessPct = m.qa.tcCount > 0 ? m.qa.passPct : m.approvedPct;
  const dueLabel = m.targetDate
    ? m.scheduleRisk === "overdue"
      ? `Was due ${format(new Date(m.targetDate), "d MMM")}`
      : `Due ${format(new Date(m.targetDate), "d MMM")}`
    : "Not scheduled";

  return (
    <div className="border rounded-lg p-3 space-y-2">
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
    </div>
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

export default function PmDashboard() {
  const { token } = useAuth();
  const [filterProject, setFilterProject] = useState<string>("all");

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
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
        <Select value={filterProject} onValueChange={setFilterProject}>
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
      </div>

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
                    <MilestoneTile key={m.id} m={m} />
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
