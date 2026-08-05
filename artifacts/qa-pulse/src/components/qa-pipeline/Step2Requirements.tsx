import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, AlertTriangle, FileDown, Wand2, Search, XCircle, AlertCircle, ChevronDown, ChevronUp, Check, Ban, CheckCheck, ExternalLink, CheckCircle2, Database,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

function api(path: string, token: string | null, opts?: RequestInit) {
  return fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

// Matches the "filtering out Tasks and QA Defects" copy below the sync input.
const EXCLUDED_STATUSES = ["Cancelled", "Verified", "Roadblock", "Closed"];
const EXCLUDED_TRACKERS = ["Task", "QA Defect"];

function SuggestionActions({
  status, busy, onAccept, onIgnore, onSolve,
}: {
  status: string;
  busy: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onSolve: () => void;
}) {
  if (status === "accepted") return <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">Accepted</Badge>;
  if (status === "ignored") return <Badge variant="outline" className="text-muted-foreground shrink-0">Ignored</Badge>;
  if (status === "solved") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 shrink-0">Solved</Badge>;
  return (
    <div className="flex flex-wrap gap-1 shrink-0">
      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" disabled={busy} onClick={onAccept}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Accept
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" disabled={busy} onClick={onSolve}>
        <CheckCheck className="w-3 h-3" /> Solved
      </Button>
      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1 text-muted-foreground" disabled={busy} onClick={onIgnore}>
        <Ban className="w-3 h-3" /> Ignore
      </Button>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${colors[level?.toLowerCase()] ?? colors.medium}`}>
      {level}
    </span>
  );
}

export function Step2Requirements({ milestoneId, projectId }: { milestoneId: number, projectId?: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [redmineId, setRedmineId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const [piiModalOpen, setPiiModalOpen] = useState(false);
  const [piiChecked, setPiiChecked] = useState(false);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [analysisResults, setAnalysisResults] = useState<Record<number, any>>({});
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [syncSummaryOpen, setSyncSummaryOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<{ id: number; title: string; redmineTicketId: string; isNew: boolean }[]>([]);

  // Per-suggestion triage (accept/ignore/solved), keyed by the persisted
  // requirement_ai_suggestions row id — overlays onto whatever status the
  // last /ai/analyze-requirement response reported.
  const [suggestionStatuses, setSuggestionStatuses] = useState<Record<number, string>>({});
  const [suggestionBusyId, setSuggestionBusyId] = useState<number | null>(null);

  // Environment Readiness Gate — has anyone prepared test data for this
  // project yet?
  //
  // Data-prep files (CR070) are uploaded against milestones of type
  // 'data_prep' — the upload UI only exists for that type — so they never hang
  // off a pipeline milestone (cr/sprint/phase/release). This gate therefore
  // scopes to the *project*, not to this milestone. `GET /milestones` already
  // rolls up dataPrepFileCount per milestone, so no extra endpoint is needed.
  const { data: projectMilestones = [], isLoading: loadingFiles } = useQuery<any[]>({
    queryKey: ["milestones", "project", projectId],
    queryFn: async () => {
      const res = await api(`/milestones?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });

  const dataPrepSources = useMemo(
    () => (projectMilestones as any[]).filter((m) => (m.dataPrepFileCount ?? 0) > 0),
    [projectMilestones],
  );
  const dataPrepFileCount = useMemo(
    () => dataPrepSources.reduce((sum, m) => sum + (m.dataPrepFileCount ?? 0), 0),
    [dataPrepSources],
  );

  // Fetch requirements linked to this milestone
  const { data: requirements = [], isLoading: loadingReqs } = useQuery<any[]>({
    queryKey: ["requirements", "milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/requirements?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  // Smart search (title or Redmine ID) + sort by when it was added.
  const filteredRequirements = useMemo(() => {
    let list = requirements;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r: any) =>
        r.title?.toLowerCase().includes(q) || String(r.redmineTicketId ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a: any, b: any) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? -diff : diff;
    });
  }, [requirements, search, sortOrder]);

  const allFilteredSelected = filteredRequirements.length > 0 && filteredRequirements.every((r: any) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredRequirements.forEach((r: any) => next.delete(r.id));
      else filteredRequirements.forEach((r: any) => next.add(r.id));
      return next;
    });
  };
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Recursively pulls a Redmine ticket + its sub-tickets, creating a
  // requirement per non-excluded ticket and linking it to this milestone.
  const processRedmineSync = async (
    ticketIdToSync: string,
    parentId: number | undefined,
    isRoot: boolean,
    added: { id: number; title: string; redmineTicketId: string; isNew: boolean }[],
  ): Promise<number | undefined> => {
    const resp = await fetch(`${getApiUrl()}/verdict-report/redmine/${encodeURIComponent(ticketIdToSync)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await resp.json();
    if (!data.connected || !data.issue) {
      if (isRoot) throw new Error(`Could not fetch Redmine issue #${ticketIdToSync}`);
      return undefined;
    }
    const issue = data.issue;
    const fetchedTicketId = String(issue.id);

    if (EXCLUDED_STATUSES.includes(issue.status?.name)) {
      if (isRoot) throw new Error(`Ticket #${ticketIdToSync} has status "${issue.status?.name}"`);
      return undefined;
    }

    let savedId: number | undefined;
    const isExcludedTracker = EXCLUDED_TRACKERS.includes(issue.tracker?.name);
    const existing = requirements.find((r: any) => String(r.redmineTicketId) === fetchedTicketId);

    if (!isExcludedTracker) {
      if (existing) {
        savedId = existing.id;
        added.push({ id: existing.id, title: existing.title, redmineTicketId: fetchedTicketId, isNew: false });
      } else {
        const priorityMap: Record<string, string> = { low: "low", normal: "normal", high: "high", urgent: "urgent" };
        const mappedPriority = priorityMap[issue.priority?.name?.toLowerCase()] || "normal";
        const res = await api("/requirements", token, {
          method: "POST",
          body: JSON.stringify({
            title: issue.subject,
            description: issue.description ?? "",
            priority: mappedPriority,
            redmineTicketId: fetchedTicketId,
            tracker: issue.tracker?.name ?? "Task",
            projectId,
            milestoneId,
            parentId,
            status: "draft",
          }),
        });
        if (res.ok) {
          const created = await res.json();
          savedId = created.id;
          added.push({ id: created.id, title: created.title, redmineTicketId: fetchedTicketId, isNew: true });
        }
      }
    }

    if (Array.isArray(issue.children)) {
      for (const child of issue.children) {
        await processRedmineSync(String(child.id), savedId ?? parentId, false, added);
      }
    }
    return savedId;
  };

  const handleSyncRequirements = async () => {
    if (!redmineId.trim()) {
      toast({ variant: "destructive", title: "Parent Redmine ID is required" });
      return;
    }
    setSyncing(true);
    const added: { id: number; title: string; redmineTicketId: string; isNew: boolean }[] = [];
    try {
      await processRedmineSync(redmineId.trim(), undefined, true, added);
      queryClient.invalidateQueries({ queryKey: ["requirements", "milestone", milestoneId] });
      setSyncSummary(added);
      setSyncSummaryOpen(true);
      setRedmineId("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleAIAnalyze = () => {
    if (selectedIds.size === 0) {
      toast({ variant: "destructive", title: "Select at least one requirement to analyze" });
      return;
    }
    setPiiModalOpen(true);
  };

  const confirmAIAnalyze = async () => {
    if (!piiChecked) {
      toast({ variant: "destructive", title: "Please confirm PII is scrubbed" });
      return;
    }
    setPiiModalOpen(false);
    setAnalyzing(true);
    const ids = Array.from(selectedIds);
    setAnalyzeProgress({ current: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i++) {
        const req = requirements.find((r: any) => r.id === ids[i]);
        if (req) {
          const res = await api("/ai/analyze-requirement", token, {
            method: "POST",
            body: JSON.stringify({
              requirementId: req.id,
              title: req.title,
              description: req.description ?? "",
              module: req.module ?? "",
            }),
          });
          if (res.ok) {
            const result = await res.json();
            setAnalysisResults((prev) => ({ ...prev, [req.id]: result }));
            setExpandedIds((prev) => new Set(prev).add(req.id));
            const statuses = result.suggestionStatus;
            if (statuses) {
              setSuggestionStatuses((prev) => {
                const next = { ...prev };
                for (const group of [statuses.missingItems, statuses.issues, statuses.questions]) {
                  for (const s of group ?? []) next[s.id] = s.status;
                }
                return next;
              });
            }
          }
        }
        setAnalyzeProgress({ current: i + 1, total: ids.length });
      }
      toast({ title: "AI Analysis Complete!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Analysis failed" });
    } finally {
      setAnalyzing(false);
    }
  };

  const criterionText = (label: string, text: string) => `${label}: ${text.trim()}`;

  const patchSuggestionStatus = async (suggestionId: number, status: string) => {
    const res = await api(`/ai/requirement-suggestions/${suggestionId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Failed to update suggestion");
    setSuggestionStatuses((prev) => ({ ...prev, [suggestionId]: status }));
  };

  // "Accept" on a Missing Item / Issue writes it into the requirement's
  // Acceptance Criteria (same mechanism as the full Requirement Detail
  // page), then marks the suggestion accepted so it won't resurface.
  const acceptIntoCriteria = async (reqId: number, suggestionId: number, label: string, text: string) => {
    setSuggestionBusyId(suggestionId);
    try {
      const req = requirements.find((r: any) => r.id === reqId);
      const current: string[] = Array.isArray(req?.acceptanceCriteria) ? req.acceptanceCriteria : [];
      const updated = [...current, criterionText(label, text)];
      const res = await api(`/requirements/${reqId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ acceptanceCriteria: JSON.stringify(updated) }),
      });
      if (!res.ok) throw new Error("Failed to add to acceptance criteria");
      await patchSuggestionStatus(suggestionId, "accepted");
      queryClient.invalidateQueries({ queryKey: ["requirements", "milestone", milestoneId] });
      toast({ title: "Added to acceptance criteria" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed to accept suggestion" });
    } finally {
      setSuggestionBusyId(null);
    }
  };

  // "Accept" on a Question posts it into the requirement's Discussion thread
  // instead — it's something the FA/leads need to answer, not a criterion.
  const acceptIntoDiscussion = async (reqId: number, suggestionId: number, question: string) => {
    setSuggestionBusyId(suggestionId);
    try {
      const res = await api(`/requirements/${reqId}/comments`, token, {
        method: "POST",
        body: JSON.stringify({ body: `Clarification needed: ${question.trim()}` }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      await patchSuggestionStatus(suggestionId, "accepted");
      toast({ title: "Posted to Discussion" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed to accept question" });
    } finally {
      setSuggestionBusyId(null);
    }
  };

  const markSuggestion = async (suggestionId: number, status: "ignored" | "solved") => {
    setSuggestionBusyId(suggestionId);
    try {
      await patchSuggestionStatus(suggestionId, status);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message ?? "Failed to update suggestion" });
    } finally {
      setSuggestionBusyId(null);
    }
  };

  const hasDataPrep = dataPrepFileCount > 0;
  const newCount = syncSummary.filter((s) => s.isNew).length;
  const existingCount = syncSummary.length - newCount;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 sm:space-y-8 text-left">
      {/* Environment Readiness Gate — an advisory check that prepared test
          data exists for this project before test cases get written. */}
      <Card className={`border-l-4 ${loadingFiles ? "border-l-muted" : hasDataPrep ? "border-l-green-500" : "border-l-amber-500"}`}>
        <CardContent className="p-4 sm:p-6 flex gap-3 sm:gap-4">
          <div className="mt-0.5 shrink-0">
            {loadingFiles ? (
              <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground animate-spin" />
            ) : hasDataPrep ? (
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="font-medium text-base sm:text-lg">Environment Readiness Gate</h3>
            {loadingFiles ? (
              <p className="text-sm text-muted-foreground">Checking this project for prepared test data…</p>
            ) : hasDataPrep ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Ready — {dataPrepFileCount} data prep file{dataPrepFileCount !== 1 ? "s" : ""} on record for this project.
                </p>
                <p className="text-xs text-muted-foreground">
                  From {dataPrepSources.map((m) => m.name).join(", ")}. Confirm the dataset is loaded into your test
                  environment before executing.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No prepared test data found for this project. You can still continue — this is a reminder, not a
                  blocker — but confirm your environment has the data these test cases will need.
                </p>
                <p className="text-xs text-muted-foreground">
                  Test data is tracked as a <strong>Data Prep</strong> milestone on the Milestones page, where QA
                  uploads the prepared dataset.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setLocation("/milestones")}
                >
                  <Database className="w-3.5 h-3.5 mr-1.5" /> Open Milestones
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sync Requirements */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="text-base sm:text-lg font-medium">1. Pull Requirements from Redmine</h3>
        {/* Stacked on phones — side by side the button's intrinsic width
            collapsed the input to nothing. */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <Label htmlFor="parentRedmineId" className="sr-only">Parent Redmine ID</Label>
            <Input
              id="parentRedmineId"
              inputMode="numeric"
              value={redmineId}
              onChange={e => setRedmineId(e.target.value)}
              placeholder="e.g. 12345 (Parent Epic/Feature ID)"
            />
          </div>
          <Button className="w-full sm:w-auto shrink-0" onClick={handleSyncRequirements} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Sync Requirements
          </Button>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          This will fetch the parent ticket and all sub-tickets recursively, filtering out "Tasks" and "QA Defects".
        </p>
      </div>

      {/* Requirements List & Analysis */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <h3 className="text-base sm:text-lg font-medium">2. Analyze Requirements</h3>
          <Button className="w-full sm:w-auto shrink-0" onClick={handleAIAnalyze} disabled={analyzing || selectedIds.size === 0} variant="secondary">
            {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            {analyzing ? `Analyzing ${analyzeProgress.current}/${analyzeProgress.total}…` : `Analyze Selected (${selectedIds.size})`}
          </Button>
        </div>

        {/* Smart search + sort */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by title or Redmine ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "newest" | "oldest")}>
            <SelectTrigger className="w-full sm:w-40 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Latest added</SelectItem>
              <SelectItem value="oldest">Oldest added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingReqs ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : requirements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No requirements synced yet.</div>
            ) : filteredRequirements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No requirements match your search.</div>
            ) : (
              <div>
                <div className="flex items-center gap-3 p-3 border-b bg-muted/30">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                  </span>
                </div>
                <div className="divide-y max-h-80 overflow-auto">
                  {filteredRequirements.map((req: any) => {
                    const result = analysisResults[req.id];
                    const isExpanded = expandedIds.has(req.id);
                    return (
                      <div key={req.id}>
                        {/* Title wraps rather than truncating — on a phone a
                            truncated requirement title is unreadable. */}
                        <div className="p-3 flex items-start gap-2.5 sm:gap-3 hover:bg-muted/50">
                          <Checkbox
                            className="mt-1 shrink-0"
                            checked={selectedIds.has(req.id)}
                            onCheckedChange={() => toggleSelect(req.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm sm:text-base break-words">{req.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Redmine #{req.redmineTicketId ?? "—"}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setLocation(`/requirements/${req.id}`)}
                              title="Open Requirement Details"
                              className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            {result && (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(req.id)}
                                className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1.5 rounded"
                              >
                                <span className="hidden sm:inline">Analyzed</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                        {result && isExpanded && (
                          <div className="px-3 pb-3 space-y-2 bg-muted/20">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs font-medium">Quality Score</span>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${result.score}%` }} />
                                </div>
                                <span className="text-xs font-bold text-primary">{result.score}/100</span>
                                <RiskBadge level={result.riskLevel} />
                              </div>
                            </div>
                            {result.summary && (
                              <p className="text-xs text-muted-foreground bg-background rounded p-2">{result.summary}</p>
                            )}
                            {result.missingItems?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Missing Items</p>
                                <ul className="space-y-1.5">
                                  {result.missingItems.map((item: string, i: number) => {
                                    const sid = result.suggestionStatus?.missingItems?.[i]?.id;
                                    return (
                                      <li key={i} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2 text-xs">
                                        <span className="flex items-start gap-1.5 flex-1 min-w-0 break-words">
                                          <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" /> {item}
                                        </span>
                                        {sid && (
                                          <SuggestionActions
                                            status={suggestionStatuses[sid] ?? "pending"}
                                            busy={suggestionBusyId === sid}
                                            onAccept={() => acceptIntoCriteria(req.id, sid, "Missing Items", item)}
                                            onSolve={() => markSuggestion(sid, "solved")}
                                            onIgnore={() => markSuggestion(sid, "ignored")}
                                          />
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            {result.issues?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Issues</p>
                                <ul className="space-y-1.5">
                                  {result.issues.map((issue: any, i: number) => {
                                    const sid = result.suggestionStatus?.issues?.[i]?.id;
                                    const text = issue.suggestion ?? issue.description;
                                    return (
                                      <li key={i} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2 text-xs">
                                        <span className="flex items-start gap-1.5 flex-1 min-w-0 break-words">
                                          <AlertCircle className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" /> {text}
                                        </span>
                                        {sid && (
                                          <SuggestionActions
                                            status={suggestionStatuses[sid] ?? "pending"}
                                            busy={suggestionBusyId === sid}
                                            onAccept={() => acceptIntoCriteria(req.id, sid, "Issue Suggestions", text)}
                                            onSolve={() => markSuggestion(sid, "solved")}
                                            onIgnore={() => markSuggestion(sid, "ignored")}
                                          />
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            {result.questions?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Questions to Clarify</p>
                                <ul className="space-y-1.5">
                                  {result.questions.map((q: string, i: number) => {
                                    const sid = result.suggestionStatus?.questions?.[i]?.id;
                                    return (
                                      <li key={i} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2 text-xs">
                                        <span className="flex items-start gap-1.5 flex-1 min-w-0 break-words">
                                          <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 shrink-0" /> {q}
                                        </span>
                                        {sid && (
                                          <SuggestionActions
                                            status={suggestionStatuses[sid] ?? "pending"}
                                            busy={suggestionBusyId === sid}
                                            onAccept={() => acceptIntoDiscussion(req.id, sid, q)}
                                            onSolve={() => markSuggestion(sid, "solved")}
                                            onIgnore={() => markSuggestion(sid, "ignored")}
                                          />
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* PII Modal */}
      <Dialog open={piiModalOpen} onOpenChange={setPiiModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              PII Compliance Check
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Before sending requirements and test data to the AI for analysis, you must confirm that no Personally Identifiable Information (PII) is included.
            </p>
            <div className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/50">
              <Checkbox
                id="pii-check"
                checked={piiChecked}
                onCheckedChange={(c) => setPiiChecked(!!c)}
              />
              <div className="space-y-1 leading-none mt-0.5">
                <Label htmlFor="pii-check" className="font-medium">
                  I confirm that all synced requirements and associated data have been scrubbed of sensitive PII (e.g. real names, IC numbers, contact details).
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPiiModalOpen(false)}>Cancel</Button>
            <Button onClick={confirmAIAnalyze} disabled={!piiChecked}>
              <Wand2 className="w-4 h-4 mr-2" /> Start Analysis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Summary Dialog */}
      <Dialog open={syncSummaryOpen} onOpenChange={setSyncSummaryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-primary" /> Requirements Synced
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {syncSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No requirements were added — the ticket may not exist, or it (and all its sub-tickets) were excluded by status/tracker filters.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {newCount} new, {existingCount} already linked — {syncSummary.length} total for this milestone.
                </p>
                <div className="divide-y border rounded-lg max-h-72 overflow-auto">
                  {syncSummary.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{s.title}</div>
                        <div className="text-xs text-muted-foreground">Redmine #{s.redmineTicketId}</div>
                      </div>
                      <Badge variant={s.isNew ? "default" : "outline"} className="shrink-0 text-[10px]">
                        {s.isNew ? "New" : "Already linked"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setSyncSummaryOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
