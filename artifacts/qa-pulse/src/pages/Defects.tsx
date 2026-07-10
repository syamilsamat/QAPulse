import { useState, useEffect, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bug,
  Plus,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  CloudUpload,
  CloudDownload,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  FlaskConical,
  Search,
  Upload,
  X,
  Link2,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  fetchRedmineProjectConfig,
  fetchRedmineProjectMembers,
  fetchRedmineTrackers,
  searchRedmineIssues,
  type RedmineProjectConfigItem,
  type RedmineMember,
  type RedmineTracker,
  type RedmineIssueMatch,
} from "@/lib/execution-api";
import { DefectCategoryField } from "@/components/DefectCategoryField";
import { defectCategoryLabel } from "@/lib/defect-categories";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DefectLink {
  id: number;
  linkType: string;
  executionTcId: number | null;
  displayCaseId: string | null;
  caseName: string | null;
  result: string | null;
  fileTicket: string | null;
  fileTitle: string | null;
  testCaseId: number | null;
  requirementId: number | null;
  requirementTitle: string | null;
  retestNeeded: boolean;
}

interface DefectRow {
  id: number;
  defectCode: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  module: string | null;
  projectId: number | null;
  projectName: string | null;
  assigneeName: string | null;
  assigneeId: number | null;
  redmineId: string | null;
  syncStatus: string;
  syncError: string | null;
  source: string;
  foundIn: string;
  tracker: string | null;
  category: string | null;
  defectCategory: string | null;
  redmineCreatedAt: string | null;
  escapeStatus: string;
  escapeClass: string | null;
  escapeNotes: string | null;
  statusSyncedAt: string | null;
  createdAt: string;
  links: DefectLink[];
  retestNeeded: boolean;
  hasRegressionTc: boolean;
}

interface Metrics {
  total: number;
  qaCount: number;
  prodCount: number;
  othersCount: number;
  reqCount: number;
  openQa: number;
  openProd: number;
  openOthers: number;
  openReq: number;
  otherTrackers: number;
  awaitingRetest: number;
  leakageRate: number;
  escapesAnalyzed: number;
  escapesClosed: number;
  regressionTcs: number;
}

const REDMINE_BASE = "https://redmine.bestinet.my";

// ─── Badges ──────────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 hover:bg-red-100",
    high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
    medium: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
    low: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  };
  return <Badge className={`${map[severity] ?? map.low} text-[10px] capitalize`}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-gray-100 text-gray-600 hover:bg-gray-100";
  if (/progress|assigned/.test(s)) cls = "bg-blue-100 text-blue-700 hover:bg-blue-100";
  else if (/fixed|resolved|ready/.test(s)) cls = "bg-amber-100 text-amber-700 hover:bg-amber-100";
  else if (/closed|verified/.test(s)) cls = "bg-green-100 text-green-700 hover:bg-green-100";
  else if (/rejected|cancelled/.test(s)) cls = "bg-gray-200 text-gray-500 hover:bg-gray-200";
  else if (/new|open/.test(s)) cls = "bg-red-100 text-red-700 hover:bg-red-100";
  return <Badge className={`${cls} text-[10px] whitespace-nowrap`}>{status}</Badge>;
}

function TcResultBadge({ result }: { result: string | null }) {
  const r = result?.toLowerCase() ?? "";
  if (r.startsWith("pass")) return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">Passed</Badge>;
  if (r.startsWith("fail")) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">Failed</Badge>;
  if (r === "blocked") return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">Blocked</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-[10px]">Not Run</Badge>;
}

// ─── Component ───────────────────────────────────────────────────────────────

const DEV_ROLES = new Set(["dev_member", "dev_lead", "hod_dev"]);

export default function Defects() {
  const { token, user } = useAuth();
  const canAssign = ((user as any)?.tierRank ?? 1) >= 2;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<"qa" | "production" | "other" | "requirement">("qa");
  const [view, setView] = useState<string>("open");
  const [filterProject, setFilterProject] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [pullTracker, setPullTracker] = useState<string>(() => localStorage.getItem("qa_pulse_prod_tracker") ?? "");
  const [pullMilestone, setPullMilestone] = useState<string>("");
  const [newOpen, setNewOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => (await fetch(`${getApiUrl()}/projects`, { headers: authHeaders })).json(),
  });

  // Milestone for the pull-tracker bar — a pulled tracker occasionally
  // includes a User Story / Change Request issue, which becomes a
  // requirement; this is where it inherits a milestone from since a flat
  // tracker-wide pull has no single anchor requirement to inherit from.
  const { data: milestonesForPull = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${filterProject}`, { headers: authHeaders });
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  const { data: devUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["users-dev"],
    enabled: canAssign,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/users`, { headers: authHeaders });
      if (!res.ok) return [];
      const all: { id: number; name: string; role: string }[] = await res.json();
      return all.filter((u) => DEV_ROLES.has(u.role));
    },
  });

  // CR031 — dev+QA users a requirement defect can be handed off to
  const { data: handoffUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["users-handoff"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/users`, { headers: authHeaders });
      if (!res.ok) return [];
      const all: { id: number; name: string; role: string }[] = await res.json();
      return all.filter((u) =>
        DEV_ROLES.has(u.role) || ["qa_member", "qa_lead", "hod_qa"].includes(u.role),
      );
    },
  });

  const { data: trackers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["redmine-trackers"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/redmine/trackers`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: statuses = [] } = useQuery<{ redmineId: number; name: string; isClosed: boolean }[]>({
    queryKey: ["defect-statuses"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/defects/statuses`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const listParams = new URLSearchParams();
  listParams.set("source", tab);
  if (view !== "all") listParams.set("view", view);
  if (filterProject !== "all") listParams.set("projectId", filterProject);
  if (filterSeverity !== "all") listParams.set("severity", filterSeverity);
  if (search.trim()) listParams.set("search", search.trim());

  const { data: defects = [], isLoading } = useQuery<DefectRow[]>({
    queryKey: ["defects", tab, view, filterProject, filterSeverity, search],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/defects?${listParams.toString()}`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to fetch defects");
      return res.json();
    },
  });

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ["defects-metrics", filterProject],
    queryFn: async () => {
      const qs = filterProject !== "all" ? `?projectId=${filterProject}` : "";
      const res = await fetch(`${getApiUrl()}/defects/metrics${qs}`, { headers: authHeaders });
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["defects"] });
    queryClient.invalidateQueries({ queryKey: ["defects-metrics"] });
  };

  const lastSynced = defects
    .map((d) => d.statusSyncedAt)
    .filter(Boolean)
    .sort()
    .pop();

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${getApiUrl()}/defects/refresh-status`, { method: "POST", headers: authHeaders });
      const data = await res.json();
      toast({ title: `Status refreshed for ${data.refreshed ?? 0} defect(s)` });
      invalidate();
    } catch {
      toast({ variant: "destructive", title: "Status refresh failed" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePull = async () => {
    if (!pullTracker) {
      toast({ variant: "destructive", title: "Pick the Redmine tracker used for production incidents" });
      return;
    }
    setIsPulling(true);
    try {
      const res = await fetch(`${getApiUrl()}/defects/pull-production`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ trackerName: pullTracker, milestoneId: pullMilestone ? Number(pullMilestone) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pull failed");
      localStorage.setItem("qa_pulse_prod_tracker", pullTracker);
      const destParts = [
        data.qaDefects ? `${data.qaDefects} QA` : null,
        data.prodDefects ? `${data.prodDefects} prod` : null,
        data.others ? `${data.others} others` : null,
        data.requirements ? `${data.requirements} requirement(s)` : null,
      ].filter(Boolean);
      toast({
        title: `Pulled from Redmine: ${data.imported} new, ${data.ignored} already in QAPulse (ignored)`,
        description: destParts.length ? destParts.join(" · ") : undefined,
      });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsPulling(false);
    }
  };

  const handleRetrySync = async (d: DefectRow) => {
    try {
      const res = await fetch(`${getApiUrl()}/defects/${d.id}/retry-sync`, { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast({ title: `Synced — Redmine #${data.redmineId}` });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const handleAssign = async (d: DefectRow, assigneeId: number | null) => {
    try {
      const res = await fetch(`${getApiUrl()}/defects/${d.id}/assign`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Assignment failed");
      toast({
        title: assigneeId ? "Defect assigned" : "Defect unassigned",
        description: data.syncOk === false ? `Not synced to Redmine: ${data.syncError}` : undefined,
      });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const handleStatusChange = async (d: DefectRow, statusRedmineId: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/defects/${d.id}/status`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ statusRedmineId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Status update failed");
      toast({
        title: d.redmineId
          ? `Status updated — synced to Redmine #${d.redmineId}`
          : "Status updated locally (defect not yet in Redmine)",
      });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const handleEscapePatch = async (d: DefectRow, patch: Record<string, any>) => {
    try {
      const res = await fetch(`${getApiUrl()}/defects/${d.id}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const handleRegressionTc = async (d: DefectRow) => {
    try {
      const res = await fetch(`${getApiUrl()}/defects/${d.id}/regression-tc`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: "{}",
      });
      const tc = await res.json();
      if (!res.ok) throw new Error(tc.error ?? "Failed to create regression TC");
      toast({ title: `Regression TC "${tc.title}" added to the library` });
      invalidate();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    }
  };

  const cards =
    tab === "qa"
      ? [
          { label: "QA defects", value: metrics?.qaCount ?? 0, cls: "" },
          { label: "Open", value: metrics?.openQa ?? 0, cls: "text-red-600" },
          { label: "Awaiting retest", value: metrics?.awaitingRetest ?? 0, cls: "text-amber-600" },
          { label: "Leakage rate", value: `${metrics?.leakageRate ?? 0}%`, cls: "text-blue-600" },
        ]
      : tab === "production"
        ? [
            { label: "Prod defects", value: metrics?.prodCount ?? 0, cls: "" },
            { label: "Leakage rate", value: `${metrics?.leakageRate ?? 0}%`, cls: "text-red-600" },
            { label: "Escapes analyzed", value: `${metrics?.escapesAnalyzed ?? 0} / ${metrics?.prodCount ?? 0}`, cls: "text-amber-600" },
            { label: "Regression TCs added", value: metrics?.regressionTcs ?? 0, cls: "text-green-600" },
          ]
        : tab === "other"
          ? [
              { label: "Other issues", value: metrics?.othersCount ?? 0, cls: "" },
              { label: "Open", value: metrics?.openOthers ?? 0, cls: "text-red-600" },
              { label: "Awaiting retest", value: metrics?.awaitingRetest ?? 0, cls: "text-amber-600" },
              { label: "Distinct trackers", value: metrics?.otherTrackers ?? 0, cls: "text-blue-600" },
            ]
          : [
              { label: "Requirement defects", value: metrics?.reqCount ?? 0, cls: "" },
              { label: "Open", value: metrics?.openReq ?? 0, cls: "text-red-600" },
            ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bug className="w-6 h-6 text-red-500" />
            Defects
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Status synced from Redmine
            {lastSynced ? ` · ${formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}` : " · never"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSyncOpen(true)} className="gap-2">
            <CloudDownload className="w-4 h-4" /> Sync from Redmine
          </Button>
          <Button variant="outline" onClick={handleRefreshStatus} disabled={isRefreshing} className="gap-2">
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh status
          </Button>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New defect
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === "qa" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => { setTab("qa"); setExpanded(new Set()); }}
        >
          QA defects
        </button>
        <button
          className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === "production" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => { setTab("production"); setView("all"); setExpanded(new Set()); }}
        >
          Production
        </button>
        <button
          className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === "other" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => { setTab("other"); setView("all"); setExpanded(new Set()); }}
        >
          Others
        </button>
        <button
          className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === "requirement" ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => { setTab("requirement"); setView("all"); setExpanded(new Set()); }}
        >
          Requirement defects
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className={`text-2xl font-bold ${c.cls}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(tab === "qa"
          ? [
              { v: "open", label: "All open" },
              { v: "blocking", label: "Blocking TCs" },
              { v: "retest", label: "Awaiting retest" },
              { v: "mine", label: "My Defects" },
              { v: "all", label: "All" },
            ]
          : [
              { v: "all", label: "All" },
              { v: "open", label: "Open" },
              { v: "retest", label: "Awaiting retest" },
              { v: "mine", label: "My Defects" },
            ]
        ).map((o) => (
          <button
            key={o.v}
            onClick={() => setView(o.v)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${view === o.v ? "bg-primary/10 text-primary border-primary/30 font-medium" : "text-muted-foreground border-border hover:bg-muted"}`}
          >
            {o.label}
          </button>
        ))}
        <div className="flex-1" />
        <Select value={filterProject} onValueChange={(v) => { setFilterProject(v); setPullMilestone(""); }}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            {["critical", "high", "medium", "low"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search defects" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 w-44 text-xs" />
        </div>
      </div>

      {/* Pull sync bar — each pulled issue routes by its own tracker */}
      {(tab === "production" || tab === "other") && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2">
          <CloudUpload className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Pull issues from Redmine tracker:</span>
          <Select value={pullTracker} onValueChange={setPullTracker}>
            <SelectTrigger className="w-44 h-7 text-xs"><SelectValue placeholder="Select tracker..." /></SelectTrigger>
            <SelectContent>
              {trackers.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Milestone (for any requirements pulled):</span>
          <Select value={pullMilestone} onValueChange={setPullMilestone} disabled={filterProject === "all"}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder={filterProject === "all" ? "Pick a project filter first" : "None"} />
            </SelectTrigger>
            <SelectContent>
              {milestonesForPull.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handlePull} disabled={isPulling}>
            {isPulling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Pull now
          </Button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : defects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-sm">
            {tab === "production"
              ? "No production defects yet — pick the incident tracker above and pull from Redmine."
              : tab === "other"
                ? "No other-tracker issues yet — pull a tracker above or use Sync from Redmine."
                : tab === "requirement"
                  ? "No requirement defects raised yet — these come from the \"Raise Requirement Defect\" button on a requirement's detail page."
                  : "No defects match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {defects.map((d) => (
            <Fragment key={d.id}>
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40" onClick={() => toggleExpand(d.id)}>
                {expanded.has(d.id) ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold">{d.defectCode ?? `DEF-${d.id}`}</span>
                    {d.redmineId ? (
                      <a
                        href={`${REDMINE_BASE}/issues/${d.redmineId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 text-muted-foreground hover:text-primary hover:border-primary/50"
                      >
                        RM #{d.redmineId} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : d.source === "requirement" ? (
                      <Badge variant="outline" className="text-[10px]" title="Requirement defects are QAPulse-native — no Redmine tracker equivalent">
                        QAPulse-native
                      </Badge>
                    ) : (
                      <Badge
                        className="bg-amber-100 text-amber-700 hover:bg-amber-200 text-[10px] cursor-pointer gap-1"
                        onClick={(e) => { e.stopPropagation(); handleRetrySync(d); }}
                        title={d.syncError ?? "Waiting to sync — click to retry"}
                      >
                        <CloudUpload className="w-2.5 h-2.5" /> Syncing to Redmine — retry
                      </Badge>
                    )}
                    <span className="font-medium text-sm truncate">{d.title}</span>
                    {d.retestNeeded && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] gap-1">
                        <RotateCw className="w-2.5 h-2.5" /> Retest needed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[
                      d.module,
                      d.category && d.category !== d.module ? d.category : null,
                      defectCategoryLabel(d.defectCategory),
                      d.projectName,
                      d.tracker,
                      `found in ${d.foundIn}`,
                      format(new Date(d.redmineCreatedAt ?? d.createdAt), "dd MMM yyyy"),
                      `${d.links.length} linked TC${d.links.length !== 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <SeverityBadge severity={d.severity} />
                <StatusBadge status={d.status} />
                <span className="text-xs text-muted-foreground w-24 truncate hidden sm:block" title={d.assigneeId ? "Assigned in QAPulse" : d.assigneeName ? "Redmine-only (unassigned in QAPulse)" : undefined}>
                  {d.assigneeName ?? "Unassigned"}
                </span>
              </div>

              {expanded.has(d.id) && (
                <div className="bg-muted/20 px-4 py-3 space-y-3">
                  {/* Status edit — write-through to Redmine */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <Select
                      value={String(statuses.find((s) => s.name.toLowerCase() === d.status.toLowerCase())?.redmineId ?? "")}
                      onValueChange={(v) => handleStatusChange(d, Number(v))}
                    >
                      <SelectTrigger className="w-44 h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                        <SelectValue placeholder={d.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.redmineId} value={String(s.redmineId)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-muted-foreground">
                      {d.redmineId ? `saving pushes the change to Redmine #${d.redmineId}` : "local only until synced to Redmine"}
                    </span>
                  </div>

                  {/* Dev assignment — Lead-tier+ only (CR030), plus a CR031 self-handoff
                      exception: a requirement defect's current assignee can hand it off
                      to dev or QA without a Lead gate. */}
                  {(() => {
                    const isSelfHandoff = d.source === "requirement" && d.assigneeId === user?.id;
                    const canEditAssignee = canAssign || isSelfHandoff;
                    const assignOptions = d.source === "requirement" ? handoffUsers : devUsers;
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Assignee:</span>
                        {canEditAssignee ? (
                          <Select
                            value={d.assigneeId ? String(d.assigneeId) : "unassigned"}
                            onValueChange={(v) => handleAssign(d, v === "unassigned" ? null : Number(v))}
                          >
                            <SelectTrigger className="w-44 h-7 text-xs" onClick={(e) => e.stopPropagation()}>
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                              {!isSelfHandoff && <SelectItem value="unassigned">Unassigned</SelectItem>}
                              {assignOptions.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs">{d.assigneeName ?? "Unassigned"}</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Linked TCs */}
                  {d.links.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No linked test cases.</p>
                  ) : (
                    <div className="space-y-1">
                      {d.links.map((l) => (
                        <div
                          key={l.id}
                          className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${l.fileTicket ? "cursor-pointer hover:bg-muted/60" : ""}`}
                          onClick={() => {
                            if (l.fileTicket) {
                              const tcQ = l.displayCaseId ? `?tc=${encodeURIComponent(l.displayCaseId)}` : "";
                              setLocation(`/test-cases/execution/${l.fileTicket}${tcQ}`);
                            }
                          }}
                        >
                          {l.linkType === "regression_tc" ? (
                            <FlaskConical className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <span className="font-mono text-muted-foreground">{l.displayCaseId ?? (l.requirementTitle ? `REQ #${l.requirementId}` : "—")}</span>
                          <span className="flex-1 min-w-0 truncate">
                            {l.caseName ?? l.requirementTitle ?? ""}
                            {l.fileTicket && <span className="text-muted-foreground"> · {l.fileTitle ?? `#${l.fileTicket}`}</span>}
                            {l.linkType === "regression_tc" && <span className="text-green-600"> · regression TC</span>}
                          </span>
                          {l.retestNeeded && (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] gap-1">
                              <RotateCw className="w-2.5 h-2.5" /> Retest
                            </Badge>
                          )}
                          {l.executionTcId != null && <TcResultBadge result={l.result} />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CR020: escape analysis for production defects */}
                  {d.source === "production" && (
                    <div className="rounded-md border bg-background px-3 py-2.5 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        Escape analysis — why did testing miss this?
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={d.escapeStatus} onValueChange={(v) => handleEscapePatch(d, { escapeStatus: v })}>
                          <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending review</SelectItem>
                            <SelectItem value="analyzing">Analyzing</SelectItem>
                            <SelectItem value="closed">Closed loop</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={d.escapeClass ?? ""} onValueChange={(v) => handleEscapePatch(d, { escapeClass: v })}>
                          <SelectTrigger className="w-52 h-7 text-xs"><SelectValue placeholder="Root cause..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="coverage_gap">Coverage gap — no TC covered it</SelectItem>
                            <SelectItem value="selection_gap">Selection gap — TC existed, not run</SelectItem>
                            <SelectItem value="passed_wrongly">TC ran but passed wrongly</SelectItem>
                          </SelectContent>
                        </Select>
                        {!d.hasRegressionTc ? (
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); handleRegressionTc(d); }}>
                            <Plus className="w-3 h-3" /> Create regression TC
                          </Button>
                        ) : (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Regression TC added
                          </span>
                        )}
                      </div>
                      <Input
                        placeholder="Escape notes (what should have caught this?)"
                        defaultValue={d.escapeNotes ?? ""}
                        className="h-7 text-xs"
                        onBlur={(e) => {
                          if (e.target.value !== (d.escapeNotes ?? "")) handleEscapePatch(d, { escapeNotes: e.target.value });
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          ))}
        </div>
      )}

      <NewDefectDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        projects={projects}
        onCreated={() => { setNewOpen(false); invalidate(); }}
      />

      <SyncRedmineDialog
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        projects={projects}
        trackers={trackers}
        onSynced={() => {
          setSyncOpen(false);
          queryClient.invalidateQueries();
        }}
      />
    </div>
  );
}

// ─── Sync from Redmine dialog ────────────────────────────────────────────────
// Pulls the child issues of a requirement's Redmine ticket, one tracker at a
// time. Routing: QA Defect → QA list · Prod Defect → Production list ·
// User Story → Requirements · other trackers → QA list (real tracker kept).

function SyncRedmineDialog({
  open,
  onClose,
  projects,
  trackers,
  onSynced,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: number; name: string }[];
  trackers: { id: number; name: string }[];
  onSynced: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [projectId, setProjectId] = useState<string>("");
  const [module, setModule] = useState<string>("");
  const [requirementId, setRequirementId] = useState<string>("");
  const [trackerName, setTrackerName] = useState<string>("all");
  const [isSyncing, setIsSyncing] = useState(false);

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: modules = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["execution-modules"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/modules`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: requirements = [] } = useQuery<any[]>({
    queryKey: ["sync-requirements", projectId],
    enabled: open,
    queryFn: async () => {
      const qs = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`${getApiUrl()}/requirements${qs}`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const reqOptions = requirements
    .filter((r) => r.redmineTicketId)
    .map((r) => ({ value: String(r.id), label: `#${r.redmineTicketId} — ${r.title}` }));

  const handleSync = async () => {
    if (!requirementId) {
      toast({ variant: "destructive", title: "Select the requirement (Redmine ticket) to sync under" });
      return;
    }
    setIsSyncing(true);
    try {
      const res = await fetch(`${getApiUrl()}/defects/sync-from-redmine`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId ? Number(projectId) : null,
          module: module || null,
          requirementId: Number(requirementId),
          trackerName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const parts = [
        data.requirements ? `${data.requirements} requirement(s)` : null,
        data.qaDefects ? `${data.qaDefects} QA defect(s)` : null,
        data.prodDefects ? `${data.prodDefects} prod defect(s)` : null,
        data.others ? `${data.others} other(s)` : null,
        data.ignored ? `${data.ignored} already in QAPulse (ignored)` : null,
        data.skipped ? `${data.skipped} skipped by tracker filter` : null,
      ].filter(Boolean);
      toast({
        title: `Synced ${data.total} issue(s) — ${data.created} new`,
        description: parts.length ? parts.join(" · ") : "Nothing matched.",
      });
      onSynced();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <CloudDownload className="w-4 h-4" /> Sync from Redmine
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Module</Label>
              <SearchableSelect
                value={module}
                onValueChange={setModule}
                options={modules.map((m) => ({ value: m.name, label: m.name }))}
                placeholder="Select module..."
                searchPlaceholder="Search module..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Requirement (Redmine ticket) <span className="text-destructive">*</span></Label>
            <SearchableSelect
              value={requirementId}
              onValueChange={setRequirementId}
              options={reqOptions}
              placeholder="Select #redmineId — title..."
              searchPlaceholder="Search requirement..."
              emptyText={projectId ? "No requirements with a Redmine ticket in this project." : "No requirements with a Redmine ticket."}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tracker</Label>
            <Select value={trackerName} onValueChange={setTrackerName}>
              <SelectTrigger><SelectValue placeholder="All trackers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trackers</SelectItem>
                {trackers.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {trackerName === "all"
                ? "Syncs the whole subtree — every child and grandchild is routed by its own tracker: User Story / Change Request → Requirements, Prod Defect → Production, QA Defect → QA list, others → Others tab."
                : /prod/i.test(trackerName)
                  ? "Only Prod Defect issues in the subtree — saved as production defects."
                  : /story|change request|^cr$/i.test(trackerName)
                    ? "Only these issues in the subtree — saved as requirements under their parent."
                    : /defect|bug/i.test(trackerName)
                      ? "Only these issues in the subtree — saved as QA defects."
                      : `Only "${trackerName}" issues — saved with that tracker, listed in the Others tab.`}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSyncing}>Cancel</Button>
          <Button onClick={handleSync} disabled={isSyncing} className="gap-2">
            {isSyncing ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</> : <><CloudDownload className="w-4 h-4" /> Sync</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual "New defect" dialog (secondary path; fail modal is primary) ──────

const COMPLEXITY_OPTIONS = ["S", "M", "L", "XL"];

function NewDefectDialog({
  open,
  onClose,
  projects,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  projects: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const { token, user } = useAuth();
  const canSetCategory = ((user as any)?.tierRank ?? 1) >= 2;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QAPulse fields
  const [form, setForm] = useState<Record<string, any>>({ severity: "medium", foundIn: "SIT" });

  // Redmine fields
  const [redmineProjects, setRedmineProjects] = useState<{ redmineId: number; name: string }[]>([]);
  const [trackers, setTrackers] = useState<RedmineTracker[]>([]);
  const [qaDefectTrackerId, setQaDefectTrackerId] = useState<number | null>(null);
  const [members, setMembers] = useState<RedmineMember[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
  const [projectConfig, setProjectConfig] = useState<RedmineProjectConfigItem | null>(null);
  const [complexity, setComplexity] = useState("M");
  const [targetedStartDate, setTargetedStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [targetedCompletionDate, setTargetedCompletionDate] = useState("");
  const [screenshots, setScreenshots] = useState<{ filename: string; contentType: string; base64: string }[]>([]);

  // Duplicate check
  const [duplicates, setDuplicates] = useState<RedmineIssueMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  // Load Redmine projects + trackers on open
  useEffect(() => {
    if (!open) return;
    fetch(`${getApiUrl()}/redmine/projects`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.ok ? r.json() : []).then(setRedmineProjects).catch(() => {});
    fetchRedmineTrackers()
      .then((list) => {
        setTrackers(list);
        const qa = list.find((t) => t.name.toLowerCase().includes("qa defect") || t.name.toLowerCase().includes("defect"));
        setQaDefectTrackerId(qa?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {});
  }, [open, token]);

  // Load members + project config when Redmine project changes
  useEffect(() => {
    const pid = form.redmineProjectId;
    if (!pid) { setMembers([]); setSelectedAssigneeId(null); setProjectConfig(null); return; }
    fetchRedmineProjectMembers(pid).then(setMembers).catch(() => {});
    fetchRedmineProjectConfig(pid).then(setProjectConfig).catch(() => {});
  }, [form.redmineProjectId]);

  // Auto duplicate check
  useEffect(() => {
    if (!form.redmineProjectId || !form.title?.trim()) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try { setDuplicates(await searchRedmineIssues(form.title, form.redmineProjectId)); }
      catch { setDuplicates([]); }
      finally { setIsSearching(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.redmineProjectId, form.title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) { toast({ variant: "destructive", title: `${file.name} exceeds 5MB` }); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        setScreenshots((prev) => [...prev, { filename: file.name, contentType: file.type, base64 }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleClose = () => {
    setForm({ severity: "medium", foundIn: "SIT" });
    setSelectedAssigneeId(null);
    setComplexity("M");
    setTargetedStartDate(new Date().toISOString().slice(0, 10));
    setTargetedCompletionDate("");
    setScreenshots([]);
    setDuplicates([]);
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.title?.trim()) { toast({ variant: "destructive", title: "Title is required" }); return; }
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/defects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          ...form,
          assigneeId: selectedAssigneeId,
          complexity,
          targetedStartDate: targetedStartDate || undefined,
          targetedCompletionDate: targetedCompletionDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create defect");
      toast({
        title: data.syncOk
          ? `${data.defectCode} created — Redmine #${data.redmineId}`
          : `${data.defectCode} created locally — Redmine sync pending`,
        description: data.syncOk ? undefined : data.syncError ?? undefined,
      });
      handleClose();
      onCreated();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[75vw] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">New Defect</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Expected / Actual */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Expected Result</Label>
              <Textarea rows={2} value={form.expectedResult ?? ""} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Actual Result</Label>
              <Textarea rows={2} value={form.actualResult ?? ""} onChange={(e) => setForm({ ...form, actualResult: e.target.value })} />
            </div>
          </div>

          {/* Screenshots */}
          <div className="space-y-1.5">
            <Label>Screenshots</Label>
            <div className="flex flex-wrap gap-2">
              {screenshots.map((s, i) => (
                <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                  <span className="max-w-[120px] truncate">{s.filename}</span>
                  <button onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3 h-3" /> Add Screenshot
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
          </div>

          <Separator />

          {/* QAPulse section */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QAPulse</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical", "high", "medium", "low"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Found in</Label>
                <Select value={form.foundIn} onValueChange={(v) => setForm({ ...form, foundIn: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SIT", "UAT", "Production"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Input value={form.module ?? ""} onChange={(e) => setForm({ ...form, module: e.target.value })} placeholder="e.g. Authentication" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>QAPulse Project</Label>
              <Select value={form.projectId ? String(form.projectId) : ""} onValueChange={(v) => setForm({ ...form, projectId: v ? Number(v) : undefined })}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DefectCategoryField
              value={form.defectCategory ?? ""}
              onChange={(v) => setForm({ ...form, defectCategory: v })}
              canSet={canSetCategory}
            />
          </div>

          <Separator />

          {/* Redmine section */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Redmine Issue</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Redmine Project</Label>
                <Select value={form.redmineProjectId ? String(form.redmineProjectId) : ""} onValueChange={(v) => setForm({ ...form, redmineProjectId: v ? Number(v) : undefined })}>
                  <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                  <SelectContent>
                    {redmineProjects.map((p) => <SelectItem key={p.redmineId} value={String(p.redmineId)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <Input value={trackers.find((t) => t.id === qaDefectTrackerId)?.name ?? "QA Defect"} disabled className="bg-muted/50" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <SearchableSelect
                value={selectedAssigneeId?.toString() ?? ""}
                onValueChange={(v) => setSelectedAssigneeId(v ? Number(v) : null)}
                options={members.map((m) => ({ value: m.id.toString(), label: m.name }))}
                placeholder={form.redmineProjectId ? "Select assignee..." : "Select a Redmine project first"}
                searchPlaceholder="Search member..."
                disabled={!form.redmineProjectId}
                emptyText={form.redmineProjectId ? "No members found." : "Select a project first."}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Complexity</Label>
                <SearchableSelect
                  value={complexity}
                  onValueChange={setComplexity}
                  options={COMPLEXITY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Targeted Start Date</Label>
                <Input type="date" value={targetedStartDate} onChange={(e) => setTargetedStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Targeted Completion Date</Label>
                <Input type="date" value={targetedCompletionDate} onChange={(e) => setTargetedCompletionDate(e.target.value)} />
              </div>
            </div>

            {!projectConfig && form.redmineProjectId && (
              <p className="text-xs text-amber-600">
                No custom field config for this project. Complexity and dates won't be set. Configure in Settings → Redmine Integration.
              </p>
            )}
          </div>

          {/* Duplicate check */}
          {form.redmineProjectId && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Search className="w-3.5 h-3.5" />
                  Similar Open Issues
                  {isSearching && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                {duplicates.length === 0 && !isSearching && (
                  <p className="text-xs text-muted-foreground">No similar open issues found.</p>
                )}
                {duplicates.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between p-2 border rounded-md text-xs gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-primary mr-2">#{issue.id}</span>
                      <span className="truncate">{issue.subject}</span>
                      <span className="ml-2 text-muted-foreground">[{issue.status?.name}] {issue.project?.name}</span>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 h-6 text-xs shrink-0">
                      <Link2 className="w-3 h-3" /> Link
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving} className="gap-2">
            {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : <><ExternalLink className="w-4 h-4" /> Create and push to Redmine</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
