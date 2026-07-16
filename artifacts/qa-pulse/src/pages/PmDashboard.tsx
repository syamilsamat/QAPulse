import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, Users, AlertTriangle, Clock, Archive, Quote, Sparkles, ChevronRight } from "lucide-react";
import { RisksCard, CAN_WRITE_ROLES as RISK_WRITE_ROLES } from "@/components/RiskRegisterCard";
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
  utilizationPct: number;
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

interface PhaseSegment {
  key: string;
  cycle: number;
  label: string;
  start: string;
  end: string | null;
  days: number;
  ongoing: boolean;
}

interface PhaseSummaryEntry {
  key: string;
  label: string;
  avgDays: number | null;
  ongoing: false;
}

interface TimelineBarSegment {
  key: string;
  label: string;
  days: number;
  ongoing: boolean;
}

interface PhaseTrendEntry {
  id: number;
  name: string;
  requirementsDays: number | null;
  gapDays: number | null;
  developDays: number | null;
  qaDays: number | null;
  uatDays: number | null;
  firstPassPct: number | null;
  stabilityPct: number | null;
}

interface RequirementPhaseEntry {
  id: number;
  title: string;
  status: string;
  parentId: number | null;
  timeline: PhaseSegment[];
}

interface TopBlocker {
  id: number;
  title: string;
  reviewStatus: "in_review" | "rejected";
  module: string | null;
  stuckDays: number;
}

interface PhaseReport {
  milestone: {
    id: number;
    name: string;
    status: string;
    targetDate?: string | null;
    createdAt?: string;
    startDate?: string | null;
    reqTargetDate?: string | null;
    devTargetDate?: string | null;
    qaTargetDate?: string | null;
    uatTargetDate?: string | null;
  };
  phaseSummary: PhaseSummaryEntry[] | null;
  plannedPhaseDays: { requirements: number | null; develop: number | null; qa: number | null; uat: number | null } | null;
  kpis: {
    timeElapsedPct: number | null;
    workCompletedPct: number;
    spi: number | null;
    firstPassPct: number | null;
    stabilityPct: number | null;
  } | null;
  topBlockers: TopBlocker[];
  trend: {
    count: number;
    avgRequirementsDays: number | null;
    avgGapDays: number | null;
    avgDevelopDays: number | null;
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

function apiWrite(path: string, token: string | null, opts: RequestInit) {
  return fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

interface ClosedMilestone {
  id: number;
  name: string;
  type: string;
  targetDate: string | null;
  completedAt: string | null;
  closedBy: number | null;
  closedByName: string | null;
  lessonsLearned: string | null;
  requirementCount: number;
  phaseSummary: PhaseSummaryEntry[];
}

// CR040 — Risk Register extracted to components/RiskRegisterCard.tsx and its
// own standalone page (pages/RiskRegister.tsx), so qa_lead/fa_lead (who can't
// see this whole dashboard) can reach it without the rest of PM Dashboard.
const CAN_ASSESS_ROLES = ["pmo", "pm_lead", "hod_pm", "admin", "cto"];

// ── AI Risk Assessment (CR037) ──────────────────────────────────────────────
// Milestone-level, on-demand, stored history. Distinct from the Risk Register
// (human-logged risks) — this synthesizes register + timeline + defect +
// coverage + schedule signals into one predicted level via the AI pipeline.
interface RiskAssessment {
  id: number;
  milestoneId: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: { signal: string; detail: string; weight?: string }[];
  mitigation: string | null;
  model: string | null;
  createdAt: string;
}

const ASSESSMENT_LEVEL_LABEL: Record<RiskAssessment["riskLevel"], string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};
const ASSESSMENT_LEVEL_CLASS: Record<RiskAssessment["riskLevel"], string> = {
  low: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-400 dark:border-green-900",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-400 dark:border-yellow-900",
  high: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-400 dark:border-orange-900",
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900",
};

function MilestoneRiskCard({ milestoneId, token, canAssess }: {
  milestoneId: number;
  token: string | null;
  canAssess: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assessing, setAssessing] = useState(false);

  const { data: history = [], isLoading } = useQuery<RiskAssessment[]>({
    queryKey: ["milestone-risk-assessments", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}/risk-assessments`, token);
      return res.ok ? res.json() : [];
    },
  });

  const latest = history[0] ?? null;

  const handleAssess = async () => {
    setAssessing(true);
    try {
      const res = await apiWrite("/ai/milestone-risk", token, {
        method: "POST",
        body: JSON.stringify({ milestoneId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "AI assessment unavailable — try again shortly");
      }
      toast({ title: "Risk assessment complete" });
      queryClient.invalidateQueries({ queryKey: ["milestone-risk-assessments", milestoneId] });
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "AI assessment unavailable — try again shortly" });
    } finally {
      setAssessing(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <p className="text-sm font-medium">AI Risk Assessment</p>
            {latest && (
              <Badge variant="outline" className={`text-[10px] font-semibold ${ASSESSMENT_LEVEL_CLASS[latest.riskLevel]}`}>
                {ASSESSMENT_LEVEL_LABEL[latest.riskLevel]}
              </Badge>
            )}
          </div>
          {canAssess && (
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleAssess} disabled={assessing}>
              {assessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {assessing ? "Assessing…" : latest ? "Reassess" : "Assess now"}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="h-16 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : !latest ? (
          <p className="text-xs text-muted-foreground py-2">
            No assessment yet. {canAssess ? "Run one to get an AI read on this milestone's delivery risk." : "A PM can run one from this card."}
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              {latest.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-sm py-1.5 border-t first:border-t-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${f.weight === "primary" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground"}`}>
                    {f.weight === "primary" ? "Primary" : "Secondary"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs">{f.signal}</p>
                    <p className="text-xs text-muted-foreground">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {latest.mitigation && (
              <p className="text-xs text-muted-foreground italic border-t pt-2">Suggested next step: {latest.mitigation}</p>
            )}
            <div className="flex items-center justify-between border-t pt-2">
              <p className="text-[11px] text-muted-foreground">
                Last assessed {format(new Date(latest.createdAt), "d MMM yyyy, HH:mm")}
              </p>
              {history.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground mr-0.5">History:</span>
                  {history.slice(0, 6).map((a) => (
                    <span
                      key={a.id}
                      title={`${ASSESSMENT_LEVEL_LABEL[a.riskLevel]} — ${format(new Date(a.createdAt), "d MMM yyyy")}`}
                      className={`text-[9px] px-1 py-0.5 rounded border font-semibold ${ASSESSMENT_LEVEL_CLASS[a.riskLevel]}`}
                    >
                      {ASSESSMENT_LEVEL_LABEL[a.riskLevel][0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Closed Milestones (CR033p1) ────────────────────────────────────────────
function ClosedMilestonesCard({ projectId, token }: { projectId: number; token: string | null }) {
  const { data: closed = [], isLoading } = useQuery<ClosedMilestone[]>({
    queryKey: ["closed-milestones", projectId],
    queryFn: async () => {
      const res = await api(`/dashboard/closed-milestones?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
  });

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Archive className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-sm font-medium">Closed Milestones</p>
          {closed.length > 0 && <Badge variant="outline" className="text-[10px]">{closed.length}</Badge>}
        </div>

        {isLoading ? (
          <div className="h-16 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : closed.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No completed milestones yet for this project.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {closed.map((m) => (
              <div key={m.id} className="border-t first:border-t-0 pt-2.5 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{m.name}</p>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {m.completedAt ? format(new Date(m.completedAt), "d MMM yyyy") : "—"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.requirementCount} requirement{m.requirementCount !== 1 ? "s" : ""}
                  {m.closedByName && ` · Closed by ${m.closedByName}`}
                </p>
                {m.phaseSummary.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                    {m.phaseSummary.map((s) => (
                      <span key={s.key} className={`text-[11px] font-medium ${PHASE_TEXT_COLOR[s.key] ?? "text-muted-foreground"}`}>
                        {s.label}: {fmtDays(s.avgDays ?? 0)}d
                      </span>
                    ))}
                  </div>
                )}
                {m.lessonsLearned ? (
                  <div className="flex items-start gap-1.5 mt-1.5 text-xs text-muted-foreground bg-muted/40 rounded p-2">
                    <Quote className="w-3 h-3 shrink-0 mt-0.5 opacity-50" />
                    <span className="italic">{m.lessonsLearned}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground italic mt-1.5">No lessons learned captured.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
          <th className="text-right font-normal pb-1">Utilization</th>
          <th className="text-right font-normal pb-1">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {capacity.map((c) => (
          <tr key={c.userId} className="border-t">
            <td className="py-1.5">{c.name}</td>
            <td className="py-1.5 text-right">{c.openTaskCount}</td>
            <td className="py-1.5 text-right">{Math.round(c.estimatedHours)}</td>
            <td
              className={`py-1.5 text-right font-medium ${
                c.utilizationPct >= 100 ? "text-red-600" : c.utilizationPct >= 80 ? "text-amber-600" : "text-muted-foreground"
              }`}
              title="Assumes a flat 40h/week capacity per person"
            >
              {c.utilizationPct}%
            </td>
            <td className={`py-1.5 text-right ${c.overdueTaskCount > 0 ? "text-red-600" : ""}`}>{c.overdueTaskCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PHASE_COLOR: Record<string, string> = {
  requirements: "bg-purple-500",
  gap: "bg-amber-400",
  develop: "bg-indigo-500",
  qa: "bg-teal-500",
  uat: "bg-blue-500",
};
const PHASE_TEXT_COLOR: Record<string, string> = {
  requirements: "text-purple-700 dark:text-purple-400",
  gap: "text-amber-700 dark:text-amber-400",
  develop: "text-indigo-700 dark:text-indigo-400",
  qa: "text-teal-700 dark:text-teal-400",
  uat: "text-blue-700 dark:text-blue-400",
};

/**
 * Format a day count for display: at most one decimal place, and without
 * floating-point noise (e.g. 1.8000000000000007 → "1.8", 8 → "8").
 */
const fmtDays = (n: number) => (Math.round(n * 10) / 10).toString();

// ── Plan vs Actual Timeline Bar ───────────────────────────────────────────────
// Shows a faded "Plan" row above the colored "Actual" row, with variance chips.
function PlanActualTimelineBar({
  actualSegments,
  plannedPhaseDays,
  scaleDays,
  planMarkerDays,
  onClick,
}: {
  actualSegments: TimelineBarSegment[];
  plannedPhaseDays?: { requirements: number | null; develop: number | null; qa: number | null; uat: number | null } | null;
  // Shared day-to-width scale across a list of bars, so a planMarkerDays line
  // lands at the same x on every row instead of each bar self-normalizing.
  scaleDays?: number;
  planMarkerDays?: number;
  onClick?: () => void;
}) {
  if (actualSegments.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data yet — no requirements linked.</p>;
  }

  const planSegments: TimelineBarSegment[] = plannedPhaseDays
    ? ([
        plannedPhaseDays.requirements !== null && { key: "requirements", label: "Requirements", days: plannedPhaseDays.requirements, ongoing: false },
        plannedPhaseDays.develop !== null && { key: "develop", label: "Develop", days: plannedPhaseDays.develop, ongoing: false },
        plannedPhaseDays.qa !== null && { key: "qa", label: "QA", days: plannedPhaseDays.qa, ongoing: false },
        plannedPhaseDays.uat !== null && { key: "uat", label: "UAT", days: plannedPhaseDays.uat, ongoing: false },
      ].filter((s): s is TimelineBarSegment => Boolean(s)))
    : [];

  const hasPlan = planSegments.length > 0;
  const actualTotal = actualSegments.reduce((s, seg) => s + seg.days, 0) || 1;
  const planTotal = hasPlan ? planSegments.reduce((s, seg) => s + seg.days, 0) : 0;
  const totalDays = scaleDays ?? (Math.max(actualTotal, planTotal) || 1);

  return (
    <div className="space-y-2">
      {hasPlan && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-10 text-right shrink-0">Plan</span>
          <div className="flex h-5 rounded-md overflow-hidden flex-1 bg-muted/30">
            {planSegments.map((s, i) => (
              <div
                key={i}
                className={`${PHASE_COLOR[s.key]} flex items-center justify-center opacity-40`}
                style={{ width: `${(s.days / totalDays) * 100}%` }}
                title={`${s.label}: ${fmtDays(s.days)}d planned`}
              >
                {(s.days / totalDays) > 0.1 && <span className="text-[10px] text-white font-medium">{fmtDays(s.days)}d</span>}
              </div>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground w-16 text-right shrink-0 tabular-nums">{fmtDays(planTotal)}d planned</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        {hasPlan && <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-10 text-right shrink-0">Actual</span>}
        <div className={`relative ${hasPlan ? "flex-1" : "w-full"}`}>
          <div
            onClick={onClick}
            className={`flex h-7 rounded-md overflow-hidden ${onClick ? "cursor-pointer" : ""}`}
          >
            {actualSegments.map((s, i) => (
              <div
                key={i}
                className={`${PHASE_COLOR[s.key]} flex items-center justify-center ${s.ongoing ? "opacity-70" : ""}`}
                style={{ width: `${(s.days / totalDays) * 100}%` }}
                title={`${s.label}: ${fmtDays(s.days)}d${s.ongoing ? " (ongoing)" : ""}`}
              >
                {(s.days / totalDays) > 0.08 && <span className="text-[11px] text-white font-medium">{fmtDays(s.days)}d</span>}
              </div>
            ))}
          </div>
          {planMarkerDays !== undefined && (
            <div
              className="absolute top-0 bottom-0 w-0 border-l-[1.5px] border-dashed border-red-500 dark:border-red-400 pointer-events-none"
              style={{ left: `${Math.min((planMarkerDays / totalDays) * 100, 100)}%` }}
              title={`Plan: ${fmtDays(planMarkerDays)}d`}
            />
          )}
        </div>
        {hasPlan && <span className="text-[11px] text-muted-foreground w-16 text-right shrink-0 tabular-nums">{fmtDays(actualTotal)}d actual</span>}
      </div>
      {planMarkerDays !== undefined && actualTotal > planMarkerDays && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{fmtDays(actualTotal - planMarkerDays)}d past plan</p>
      )}

      {hasPlan && (
        <div className="flex flex-wrap gap-1.5 pl-[52px]">
          {planSegments.map(p => {
            const a = actualSegments.find(s => s.key === p.key);
            if (!a) return null;
            const diff = a.days - p.days;
            if (Math.abs(diff) < 1) return null;
            return (
              <span key={p.key} className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${diff > 0 ? "text-red-600 bg-red-50 dark:bg-red-950/60 dark:text-red-400" : "text-green-600 bg-green-50 dark:bg-green-950/60 dark:text-green-400"}`}>
                {p.label} {diff > 0 ? `+${fmtDays(diff)}d` : `${fmtDays(diff)}d`}
              </span>
            );
          })}
          {actualSegments.filter(a => !planSegments.find(p => p.key === a.key)).map(s => (
            <span key={s.key} className="text-[11px] font-medium px-1.5 py-0.5 rounded text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-400">
              {s.label} · unplanned
            </span>
          ))}
        </div>
      )}

      <div className={`flex flex-wrap gap-x-4 gap-y-1 ${hasPlan ? "pl-[52px]" : ""}`}>
        {actualSegments.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-2.5 h-2.5 rounded-sm ${PHASE_COLOR[s.key]}`} />
            {s.label} &middot; {fmtDays(s.days)}d{s.ongoing ? " (ongoing)" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function DualBar({ labelA, pctA, colorA, labelB, pctB, colorB }: {
  labelA: string; pctA: number; colorA: string;
  labelB: string; pctB: number; colorB: string;
}) {
  return (
    <div className="space-y-2 mt-2">
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{labelA}</span>
          <span className={`font-semibold tabular-nums ${colorA}`}>{pctA}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${colorA.replace("text-", "bg-")}`} style={{ width: `${Math.min(pctA, 100)}%` }} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{labelB}</span>
          <span className={`font-semibold tabular-nums ${colorB}`}>{pctB}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${colorB.replace("text-", "bg-")}`} style={{ width: `${Math.min(pctB, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function KpiCards({ kpis, trend }: { kpis: NonNullable<PhaseReport["kpis"]>; trend: PhaseReport["trend"] }) {
  const spiColor = kpis.spi === null ? "text-muted-foreground" : kpis.spi >= 1 ? "text-green-600 dark:text-green-400" : kpis.spi >= 0.8 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const spiLabel = kpis.spi === null ? "No target date set" : kpis.spi >= 1 ? "On or ahead of schedule" : kpis.spi >= 0.8 ? "Slightly behind — monitor closely" : "Critical — corrective action needed";

  const fpColor = kpis.firstPassPct === null ? "text-muted-foreground" : kpis.firstPassPct >= 80 ? "text-green-600 dark:text-green-400" : kpis.firstPassPct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  const stabColor = kpis.stabilityPct === null ? "text-muted-foreground" : kpis.stabilityPct <= 10 ? "text-green-600 dark:text-green-400" : kpis.stabilityPct <= 20 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const stabLabel = kpis.stabilityPct === null ? "—" : kpis.stabilityPct <= 10 ? "Stable" : kpis.stabilityPct <= 20 ? "At risk — scope creep" : "High churn — FA sign-off gate recommended";

  const trendAvgFP = trend && trend.milestones.length > 0
    ? (() => { const vals = trend.milestones.map(m => m.firstPassPct).filter((v): v is number => v !== null); return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null; })()
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Burn Rate */}
      {kpis.timeElapsedPct !== null && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Burn Rate</p>
              {(() => {
                const gap = kpis.timeElapsedPct! - kpis.workCompletedPct;
                const cls = gap > 20 ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900" : gap > 0 ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900" : "bg-green-100 text-green-600 border-green-200 dark:bg-green-950/60 dark:text-green-400 dark:border-green-900";
                return <Badge variant="outline" className={`text-[10px] font-semibold ${cls}`}>{gap > 0 ? `${gap}% gap` : "On track"}</Badge>;
              })()}
            </div>
            <DualBar
              labelA="Time elapsed" pctA={kpis.timeElapsedPct!}
              colorA={kpis.timeElapsedPct! > kpis.workCompletedPct + 15 ? "text-red-500" : "text-amber-500"}
              labelB="Work completed" pctB={kpis.workCompletedPct}
              colorB="text-indigo-500"
            />
          </CardContent>
        </Card>
      )}

      {/* SPI */}
      {kpis.spi !== null && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SPI</p>
              <span className={`text-xs font-medium ${spiColor}`}>{kpis.spi >= 1 ? "On track" : kpis.spi >= 0.8 ? "At risk" : "Critical"}</span>
            </div>
            <DualBar
              labelA="Planned (by today)" pctA={kpis.timeElapsedPct ?? 0}
              colorA="text-muted-foreground"
              labelB="Actual (completed)" pctB={kpis.workCompletedPct}
              colorB={kpis.spi >= 0.8 ? "text-green-500" : kpis.spi >= 0.6 ? "text-amber-500" : "text-red-500"}
            />
            <p className="text-xs tabular-nums pt-1">
              SPI = {kpis.workCompletedPct} ÷ {kpis.timeElapsedPct} = <span className={`font-semibold ${spiColor}`}>{kpis.spi}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{spiLabel}</p>
          </CardContent>
        </Card>
      )}

      {/* First-Pass Rate */}
      {kpis.firstPassPct !== null && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">First-Pass Rate</p>
            <p className={`text-3xl font-bold tabular-nums ${fpColor}`}>{kpis.firstPassPct}%</p>
            <p className="text-[11px] text-muted-foreground">Approved without rejection</p>
            {trendAvgFP !== null && (
              <div className="pt-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">This milestone</span>
                  <span className={`font-semibold tabular-nums ${fpColor}`}>{kpis.firstPassPct}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${fpColor.replace("text-", "bg-")}`} style={{ width: `${kpis.firstPassPct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Historical avg</span>
                  <span className="font-semibold tabular-nums text-muted-foreground">{trendAvgFP}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-muted-foreground/40" style={{ width: `${trendAvgFP}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stability */}
      {kpis.stabilityPct !== null && (
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Req Stability</p>
            <p className={`text-3xl font-bold tabular-nums ${stabColor}`}>{kpis.stabilityPct}%</p>
            <p className="text-[11px] text-muted-foreground">Revised after approval</p>
            <div className="pt-1 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">This milestone</span>
                <span className={`font-semibold tabular-nums ${stabColor}`}>{kpis.stabilityPct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${stabColor.replace("text-", "bg-")}`} style={{ width: `${kpis.stabilityPct}%` }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Threshold</span>
                <span className="font-semibold tabular-nums text-muted-foreground">10%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
                <div className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/50" style={{ left: "10%" }} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">{stabLabel}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Top Blockers ──────────────────────────────────────────────────────────────
function TopBlockersCard({ blockers }: { blockers: TopBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <p className="text-sm font-medium">Top Blockers</p>
          </div>
          <Badge variant="outline" className="text-[10px] text-red-600 bg-red-50 border-red-200 dark:bg-red-950/60 dark:border-red-900">{blockers.length} item{blockers.length !== 1 ? "s" : ""}</Badge>
        </div>
        <div className="space-y-2">
          {blockers.map(b => (
            <div key={b.id} className="flex items-start gap-2 text-sm py-1.5 border-t first:border-t-0">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${b.reviewStatus === "rejected" ? "bg-red-500" : "bg-amber-500"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{b.title}</p>
                <p className="text-xs text-muted-foreground">
                  {b.reviewStatus === "rejected" ? "Rejected" : "In review"}
                  {b.module && ` · ${b.module}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className={`text-xs font-semibold tabular-nums ${b.stuckDays > 7 ? "text-red-600 dark:text-red-400" : b.stuckDays > 3 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{b.stuckDays}d</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cross-Milestone Benchmark ─────────────────────────────────────────────────
function BenchmarkTable({ trend }: { trend: NonNullable<PhaseReport["trend"]> }) {
  if (trend.count === 0) {
    return <p className="text-xs text-muted-foreground">No completed milestones to benchmark against yet.</p>;
  }
  const maxTotal = Math.max(
    ...trend.milestones.map(m => (m.requirementsDays ?? 0) + (m.gapDays ?? 0) + (m.developDays ?? 0) + (m.qaDays ?? 0) + (m.uatDays ?? 0)),
    1,
  );

  return (
    <div className="space-y-4">
      {/* Phase composition bar chart */}
      <div className="flex items-end gap-3 h-20 mb-2 px-1">
        {trend.milestones.map((m) => {
          const total = (m.requirementsDays ?? 0) + (m.gapDays ?? 0) + (m.developDays ?? 0) + (m.qaDays ?? 0) + (m.uatDays ?? 0);
          const barHeight = Math.max((total / maxTotal) * 100, 4);
          return (
            <div key={m.id} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className="w-full rounded overflow-hidden flex flex-col-reverse" style={{ height: `${barHeight}%` }}>
                {m.requirementsDays !== null && <div className="bg-purple-500" style={{ height: `${(m.requirementsDays / total) * 100}%` }} />}
                {m.gapDays !== null && <div className="bg-amber-400" style={{ height: `${(m.gapDays / total) * 100}%` }} />}
                {m.developDays !== null && <div className="bg-indigo-500" style={{ height: `${(m.developDays / total) * 100}%` }} />}
                {m.qaDays !== null && <div className="bg-teal-500" style={{ height: `${(m.qaDays / total) * 100}%` }} />}
                {m.uatDays !== null && <div className="bg-blue-500" style={{ height: `${(m.uatDays / total) * 100}%` }} />}
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{m.name}</span>
            </div>
          );
        })}
      </div>

      {/* Tabular view with KPI columns */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left font-medium pb-2 pr-3">Milestone</th>
              <th className="text-right font-medium pb-2 px-2">Req</th>
              <th className="text-right font-medium pb-2 px-2">Dev</th>
              <th className="text-right font-medium pb-2 px-2">QA</th>
              <th className="text-right font-medium pb-2 px-2">1st-Pass</th>
              <th className="text-right font-medium pb-2 pl-2">Stability</th>
            </tr>
          </thead>
          <tbody>
            {trend.milestones.map(m => {
              const fpColor = m.firstPassPct === null ? "" : m.firstPassPct >= 80 ? "text-green-600 dark:text-green-400" : m.firstPassPct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
              const stabColor = m.stabilityPct === null ? "" : m.stabilityPct <= 10 ? "text-green-600 dark:text-green-400" : m.stabilityPct <= 20 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium max-w-[100px] truncate">{m.name}</td>
                  <td className="py-2 text-right px-2 tabular-nums">{m.requirementsDays !== null ? `${fmtDays(m.requirementsDays)}d` : "—"}</td>
                  <td className="py-2 text-right px-2 tabular-nums">{m.developDays !== null ? `${fmtDays(m.developDays)}d` : "—"}</td>
                  <td className="py-2 text-right px-2 tabular-nums">{m.qaDays !== null ? `${fmtDays(m.qaDays)}d` : "—"}</td>
                  <td className={`py-2 text-right px-2 tabular-nums font-semibold ${fpColor}`}>{m.firstPassPct !== null ? `${m.firstPassPct}%` : "—"}</td>
                  <td className={`py-2 text-right pl-2 tabular-nums font-semibold ${stabColor}`}>{m.stabilityPct !== null ? `${m.stabilityPct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t pt-2">
        {[
          { key: "requirements", label: "Req avg", val: trend.avgRequirementsDays },
          { key: "develop", label: "Dev avg", val: trend.avgDevelopDays },
          { key: "qa", label: "QA avg", val: trend.avgQaDays },
          { key: "uat", label: "UAT avg", val: trend.avgUatDays },
        ].filter(x => x.val !== null).map(x => (
          <div key={x.key}>
            <p className="text-[11px] text-muted-foreground">{x.label}</p>
            <p className={`text-sm font-medium ${PHASE_TEXT_COLOR[x.key]}`}>{fmtDays(x.val!)}d</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Based on the last {trend.count} completed milestone{trend.count !== 1 ? "s" : ""} in this project.</p>
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

// ── Calendar Gantt ─────────────────────────────────────────────────────────
// Reads the real start/end ISO timestamps already on each PhaseSegment
// (computed server-side from the activity log — see dashboard.ts's
// makeSegment) instead of the day-count TimelineBarSegment shape the
// duration bars use, so requirements are positioned on a real date axis.
const GANTT_PX_PER_DAY = 26;
const GANTT_LABEL_WIDTH = 200;

function diffDays(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

const GANTT_LEGEND: { key: string; label: string }[] = [
  { key: "requirements", label: "Requirements" },
  { key: "gap", label: "Gap" },
  { key: "develop", label: "Develop" },
  { key: "qa", label: "QA testing" },
  { key: "uat", label: "UAT" },
];

// Diagonal hatching over the phase color marks a segment as still running —
// a solid bar reads as finished work.
const GANTT_ONGOING_HATCH = "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 4px, transparent 4px 8px)";

function ganttStatusDot(status: string): string | null {
  if (status.startsWith("Rejected")) return "bg-red-500";
  if (status === "In review" || status === "Not yet approved") return "bg-amber-500";
  return null; // approved rows carry no dot — only exceptions get flagged
}

function RequirementGanttChart({
  requirements,
  milestone,
}: {
  requirements: RequirementPhaseEntry[];
  milestone: PhaseReport["milestone"];
}) {
  const withData = requirements.filter((r) => r.timeline.length > 0);
  if (withData.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough data yet — no requirements linked.</p>;
  }

  // Waterfall order: roots sorted by when their first phase started, each
  // followed by its children (indented) so the parent/child hierarchy reads
  // as a WBS. A child whose parent isn't on the chart renders as a root.
  const idsOnChart = new Set(withData.map((r) => r.id));
  const firstStart = (r: RequirementPhaseEntry) => new Date(r.timeline[0].start).getTime();
  const byStart = (a: RequirementPhaseEntry, b: RequirementPhaseEntry) => firstStart(a) - firstStart(b);
  const emitWithChildren = (r: RequirementPhaseEntry, depth: number): { r: RequirementPhaseEntry; depth: number }[] => [
    { r, depth },
    ...withData.filter((c) => c.parentId === r.id).sort(byStart).flatMap((c) => emitWithChildren(c, depth + 1)),
  ];
  const orderedRows = withData
    .filter((r) => r.parentId == null || !idsOnChart.has(r.parentId))
    .sort(byStart)
    .flatMap((r) => emitWithChildren(r, 0));

  const now = new Date();

  // Baseline: the milestone's phase target dates, rendered as a "Plan" row
  // so per-requirement bars can be read against the committed schedule.
  const planPhases = ([
    { key: "requirements", from: milestone.startDate, to: milestone.reqTargetDate },
    { key: "develop", from: milestone.reqTargetDate, to: milestone.devTargetDate },
    { key: "qa", from: milestone.devTargetDate, to: milestone.qaTargetDate },
    { key: "uat", from: milestone.qaTargetDate, to: milestone.uatTargetDate },
  ] as const)
    .filter((p) => p.from && p.to && new Date(p.to) > new Date(p.from))
    .map((p) => ({ key: p.key, start: new Date(p.from!), end: new Date(p.to!) }));

  const allDates: Date[] = [now];
  if (milestone.startDate) allDates.push(new Date(milestone.startDate));
  if (milestone.targetDate) allDates.push(new Date(milestone.targetDate));
  for (const p of planPhases) allDates.push(p.start, p.end);
  for (const r of withData) {
    for (const s of r.timeline) {
      allDates.push(new Date(s.start));
      allDates.push(s.end ? new Date(s.end) : now);
    }
  }
  const axisStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const axisEnd = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const totalDays = Math.max(diffDays(axisStart, axisEnd), 7);
  const trackWidth = Math.round(totalDays * GANTT_PX_PER_DAY);

  const ticks: { x: number; label: string }[] = [];
  for (let d = 0; d <= totalDays; d += 7) {
    const tickDate = new Date(axisStart.getTime() + d * 86_400_000);
    ticks.push({ x: d * GANTT_PX_PER_DAY, label: format(tickDate, "d MMM") });
  }

  const todayX = Math.min(Math.max(diffDays(axisStart, now) * GANTT_PX_PER_DAY, 0), trackWidth);
  const planEndX = milestone.targetDate
    ? Math.min(Math.max(diffDays(axisStart, new Date(milestone.targetDate)) * GANTT_PX_PER_DAY, 0), trackWidth)
    : null;

  const segmentBar = (key: string, ongoing: boolean, left: number, width: number, label: string, tooltip: string) => (
    <div
      className={`absolute top-1 h-5 rounded ${PHASE_COLOR[key]} ${ongoing ? "opacity-70" : ""} flex items-center overflow-hidden`}
      style={{ left, width, ...(ongoing ? { backgroundImage: GANTT_ONGOING_HATCH } : {}) }}
      title={tooltip}
    >
      {width >= 56 && <span className="text-[10px] text-white font-medium px-1.5 truncate">{label}</span>}
      {ongoing && <ChevronRight className="w-3 h-3 text-white/90 ml-auto mr-0.5 shrink-0" />}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded-md">
        <div className="relative" style={{ width: GANTT_LABEL_WIDTH + trackWidth }}>
          {/* Gridlines behind everything (painted first) */}
          {ticks.map((t, i) => (
            <div key={i} className="absolute top-0 bottom-0 border-l border-border/50 pointer-events-none" style={{ left: GANTT_LABEL_WIDTH + t.x }} />
          ))}

          {/* Header: marker chips on top, date ticks below */}
          <div className="flex border-b">
            <div className="sticky left-0 z-20 bg-card shrink-0" style={{ width: GANTT_LABEL_WIDTH }} />
            <div className="relative shrink-0" style={{ width: trackWidth, height: 42 }}>
              {ticks.map((t, i) => (
                <span key={i} className="absolute bottom-1 text-[10px] text-muted-foreground pl-1" style={{ left: t.x }}>{t.label}</span>
              ))}
              <span
                className="absolute top-1 -translate-x-1/2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-foreground text-background whitespace-nowrap"
                style={{ left: todayX }}
              >
                Today · {format(now, "d MMM")}
              </span>
              {planEndX !== null && (
                <span
                  className="absolute top-[22px] -translate-x-1/2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-destructive text-white whitespace-nowrap"
                  style={{ left: planEndX }}
                >
                  Due · {format(new Date(milestone.targetDate!), "d MMM")}
                </span>
              )}
            </div>
          </div>

          {/* Baseline row from the milestone's phase target dates */}
          {planPhases.length > 0 && (
            <div className="flex items-center border-b bg-muted/30">
              <div className="sticky left-0 z-20 bg-card shrink-0 px-2 py-1 text-[11px] italic text-muted-foreground" style={{ width: GANTT_LABEL_WIDTH }}>
                Plan
              </div>
              <div className="relative shrink-0" style={{ width: trackWidth, height: 20 }}>
                {planPhases.map((p) => {
                  const left = diffDays(axisStart, p.start) * GANTT_PX_PER_DAY;
                  const width = Math.max(diffDays(p.start, p.end) * GANTT_PX_PER_DAY, 4);
                  return (
                    <div
                      key={p.key}
                      className={`absolute top-1.5 h-2 rounded-sm ${PHASE_COLOR[p.key]} opacity-40`}
                      style={{ left, width }}
                      title={`Plan ${GANTT_LEGEND.find((l) => l.key === p.key)?.label}: ${format(p.start, "d MMM")} → ${format(p.end, "d MMM")}`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {orderedRows.map(({ r, depth }) => {
            const dot = ganttStatusDot(r.status);
            return (
              <div key={r.id} className="flex items-center border-b last:border-b-0">
                <div
                  className="sticky left-0 z-20 bg-card shrink-0 pr-2 py-1.5 text-xs font-medium flex items-center gap-1.5"
                  style={{ width: GANTT_LABEL_WIDTH, paddingLeft: 8 + depth * 14 }}
                  title={`${r.title} — ${r.status}`}
                >
                  {depth > 0 && <span className="text-muted-foreground shrink-0">└</span>}
                  {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
                  <span className="truncate">{r.title}</span>
                </div>
                <div className="relative shrink-0" style={{ width: trackWidth, height: 28 }}>
                  {r.timeline.map((s, i) => {
                    const segStart = new Date(s.start);
                    const segEnd = s.end ? new Date(s.end) : now;
                    const left = diffDays(axisStart, segStart) * GANTT_PX_PER_DAY;
                    const width = Math.max(diffDays(segStart, segEnd) * GANTT_PX_PER_DAY, 4);
                    return (
                      <span key={i}>
                        {segmentBar(
                          s.key, s.ongoing, left, width,
                          `${s.label} · ${fmtDays(s.days)}d`,
                          `${r.title} — ${s.label}: ${fmtDays(s.days)}d${s.ongoing ? " (ongoing)" : ""} · ${r.status}`,
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Today + plan-end marker lines */}
          <div className="absolute top-0 bottom-0 border-l border-foreground/40 pointer-events-none" style={{ left: GANTT_LABEL_WIDTH + todayX }} />
          {planEndX !== null && (
            <div className="absolute top-0 bottom-0 border-l border-dashed border-destructive/60 pointer-events-none" style={{ left: GANTT_LABEL_WIDTH + planEndX }} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {GANTT_LEGEND.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`w-2.5 h-2.5 rounded-sm ${PHASE_COLOR[l.key]}`} />
            {l.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/60" style={{ backgroundImage: GANTT_ONGOING_HATCH }} />
          Ongoing
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> In review
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Rejected
        </span>
      </div>
    </div>
  );
}

function RequirementTimelineList({
  requirements,
  plannedPhaseDays,
}: {
  requirements: RequirementPhaseEntry[];
  plannedPhaseDays?: { requirements: number | null; develop: number | null; qa: number | null; uat: number | null } | null;
}) {
  const planTotalDays = plannedPhaseDays
    ? [plannedPhaseDays.requirements, plannedPhaseDays.develop, plannedPhaseDays.qa, plannedPhaseDays.uat]
        .filter((d): d is number => d !== null)
        .reduce((a, b) => a + b, 0)
    : null;
  const hasPlanTotal = planTotalDays !== null && planTotalDays > 0;
  const scaleDays = Math.max(
    hasPlanTotal ? planTotalDays! : 0,
    ...requirements.map((r) => r.timeline.reduce((s, seg) => s + seg.days, 0)),
  ) || 1;

  return (
    <div className="space-y-3">
      {hasPlanTotal && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block w-0 h-3.5 border-l-[1.5px] border-dashed border-red-500 dark:border-red-400" />
          Plan &middot; {fmtDays(planTotalDays!)}d milestone total — same marker position on every row
        </div>
      )}
      {requirements.map((r) => (
        <div key={r.id}>
          <p className="text-xs font-medium mb-1">{r.title}</p>
          {r.timeline.length > 0
            ? <PlanActualTimelineBar actualSegments={r.timeline} scaleDays={scaleDays} planMarkerDays={hasPlanTotal ? planTotalDays! : undefined} />
            : <p className="text-xs text-muted-foreground">No data yet.</p>}
        </div>
      ))}
    </div>
  );
}

export default function PmDashboard() {
  const { token, user } = useAuth();
  const [, navigate] = useLocation();
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterMilestone, setFilterMilestone] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"status" | "timelines" | "gantt">("status");

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

  const actualSegments: TimelineBarSegment[] = phaseReport?.phaseSummary
    ? phaseReport.phaseSummary.map(s => ({ key: s.key, label: s.label, days: s.avgDays ?? 0, ongoing: false }))
    : [];

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
          <Select value={filterMilestone} onValueChange={(v) => { setFilterMilestone(v); setViewMode("status"); }} disabled={filterProject === "all"}>
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
        <>
          {/* ── Phase Timeline ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <p className="text-sm font-medium mb-0.5">Where did the time go — {phaseReport?.milestone.name ?? "…"}</p>
                  <p className="text-xs text-muted-foreground">Plan vs actual phase durations, averaged across requirements.</p>
                </div>
                {phaseReport && (phaseReport.milestone.startDate || phaseReport.milestone.reqTargetDate || phaseReport.milestone.devTargetDate || phaseReport.milestone.qaTargetDate || phaseReport.milestone.uatTargetDate || phaseReport.milestone.targetDate) && (() => {
                  const today = new Date();
                  const activeKeys = new Set(phaseReport.phaseSummary?.map(s => s.key) ?? []);
                  const pills = [
                    { key: "start", label: "Start", target: phaseReport.milestone.startDate },
                    { key: "requirements", label: "Req by", target: phaseReport.milestone.reqTargetDate },
                    { key: "develop", label: "Dev by", target: phaseReport.milestone.devTargetDate },
                    { key: "qa", label: "QA by", target: phaseReport.milestone.qaTargetDate },
                    { key: "uat", label: "UAT by", target: phaseReport.milestone.uatTargetDate },
                    { key: "end", label: "End", target: phaseReport.milestone.targetDate },
                  ]
                    .filter(p => p.target)
                    .map(p => {
                      const dt = new Date(p.target!);
                      const past = today > dt;
                      const done = p.key === "start" ? true
                        : p.key === "requirements" ? activeKeys.has("develop") || activeKeys.has("qa") || activeKeys.has("uat")
                        : p.key === "develop" ? activeKeys.has("qa") || activeKeys.has("uat")
                        : p.key === "qa" ? activeKeys.has("uat") || phaseReport.milestone.status === "completed"
                        : (p.key === "uat" || p.key === "end") ? phaseReport.milestone.status === "completed" : false;
                      return { ...p, dt, late: past && !done };
                    });

                  const overallStatus: "completed" | "overdue" | "on_track" =
                    phaseReport.milestone.status === "completed" ? "completed"
                    : pills.some(p => p.late) ? "overdue" : "on_track";
                  const statusStyle = {
                    completed: "border-border bg-muted text-muted-foreground",
                    overdue: "border-destructive/40 bg-destructive/10 text-destructive",
                    on_track: "border-green-600/30 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400",
                  }[overallStatus];
                  const statusLabel = { completed: "Completed", overdue: "Overdue", on_track: "On track" }[overallStatus];

                  return (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${statusStyle}`}>
                        {overallStatus === "overdue" && <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />}
                        {statusLabel}
                      </span>
                      {pills.map(p => (
                        <span key={p.key} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${p.late ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted text-muted-foreground"}`}>
                          {p.late && <span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />}
                          {p.label} {format(p.dt, "d MMM")}{p.late && <span className="font-medium"> · Late</span>}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {phaseLoading ? (
                <div className="h-16 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : phaseReport?.phaseSummary ? (
                <>
                  <PlanActualTimelineBar
                    actualSegments={actualSegments}
                    plannedPhaseDays={phaseReport.plannedPhaseDays}
                    onClick={() => setViewMode("timelines")}
                  />
                  {phaseReport.requirements.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1 mb-2">
                        {([
                          { key: "status", label: "Status list" },
                          { key: "timelines", label: "Timelines" },
                          { key: "gantt", label: "Gantt" },
                        ] as const).map((v) => (
                          <button
                            key={v.key}
                            type="button"
                            onClick={() => setViewMode(v.key)}
                            className={`text-xs px-2 py-1 rounded-md transition-colors ${viewMode === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                      {viewMode === "timelines" && <RequirementTimelineList requirements={phaseReport.requirements} plannedPhaseDays={phaseReport.plannedPhaseDays} />}
                      {viewMode === "gantt" && <RequirementGanttChart requirements={phaseReport.requirements} milestone={phaseReport.milestone} />}
                      {viewMode === "status" && <RequirementStatusTable requirements={phaseReport.requirements} />}
                    </div>
                  )}
                </>
              ) : phaseReport ? (
                <p className="text-sm text-muted-foreground">Not enough data yet — this milestone has no requirements linked.</p>
              ) : null}
            </CardContent>
          </Card>

          {/* ── KPI Row ────────────────────────────────────────────────────── */}
          {phaseReport?.kpis && (
            <KpiCards kpis={phaseReport.kpis} trend={phaseReport.trend} />
          )}

          {/* ── AI Risk Assessment (CR037) ────────────────────────────────── */}
          <MilestoneRiskCard milestoneId={Number(filterMilestone)} token={token} canAssess={CAN_ASSESS_ROLES.includes(user?.role ?? "")} />

          {/* ── Benchmark + Blockers ──────────────────────────────────────── */}
          {phaseReport && (phaseReport.trend || phaseReport.topBlockers.length > 0) && (
            <div className={`grid gap-4 ${phaseReport.topBlockers.length > 0 ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"}`}>
              {phaseReport.trend && phaseReport.trend.count > 0 && (
                <Card className={phaseReport.topBlockers.length > 0 ? "lg:col-span-2" : ""}>
                  <CardContent className="p-4 sm:p-5">
                    <p className="text-sm font-medium mb-4">Is this a pattern?</p>
                    <BenchmarkTable trend={phaseReport.trend} />
                  </CardContent>
                </Card>
              )}
              {phaseReport.topBlockers.length > 0 && (
                <TopBlockersCard blockers={phaseReport.topBlockers} />
              )}
            </div>
          )}
        </>
      )}

      {filterProject !== "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <RisksCard
            projectId={Number(filterProject)}
            token={token}
            milestones={milestonesForFilter}
            canWrite={RISK_WRITE_ROLES.includes(user?.role ?? "")}
          />
          <ClosedMilestonesCard projectId={Number(filterProject)} token={token} />
        </div>
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
