import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayCircle, ShieldAlert, TrendingUp, FileText, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const EMPTY = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };

export function Step5Execution({ milestoneId }: { milestoneId: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [assessing, setAssessing] = useState(false);

  // Progress lives on execution files, not on this milestone directly. There's
  // no endpoint that aggregates by milestone, so we join client-side the same
  // way the Execution Dashboard itself does (progress[file.redmineTicketId]).
  const { data: allFiles = [], isLoading: loadingFiles, refetch: refetchFiles } = useQuery({
    queryKey: ["execution-files"],
    queryFn: async () => {
      const res = await api("/execution-files", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: progressMap = {}, isLoading: loadingProgress, refetch: refetchProgress } = useQuery<Record<string, typeof EMPTY>>({
    queryKey: ["execution-progress"],
    queryFn: async () => {
      const res = await api("/execution-progress", token);
      return res.ok ? res.json() : {};
    },
  });

  const files = useMemo(
    () => (allFiles as any[]).filter((f) => f.milestoneId === milestoneId),
    [allFiles, milestoneId],
  );

  const totals = useMemo(() => {
    return files.reduce((acc, f: any) => {
      const p = progressMap[f.redmineTicketId] ?? EMPTY;
      return {
        total: acc.total + p.total,
        passed: acc.passed + p.passed,
        failed: acc.failed + p.failed,
        blocked: acc.blocked + p.blocked,
        inProgress: acc.inProgress + p.inProgress,
        notExecuted: acc.notExecuted + p.notExecuted,
      };
    }, { ...EMPTY });
  }, [files, progressMap]);

  const isLoading = loadingFiles || loadingProgress;
  const executed = totals.passed + totals.failed + totals.blocked + totals.inProgress;
  const progressPercent = totals.total > 0 ? Math.round((executed / totals.total) * 100) : 0;

  // Release risk / defect leakage are AI-assessed from the real execution
  // results and persisted, so the numbers survive navigation and can be
  // re-run on demand. Previously both were hardcoded from a failed-count
  // threshold and never reflected anything the model actually reasoned about.
  const { data: assessment, isLoading: loadingAssessment } = useQuery<any>({
    queryKey: ["execution-risk", milestoneId],
    queryFn: async () => {
      const res = await api(`/ai/execution-risk/${milestoneId}`, token);
      return res.ok ? res.json() : null;
    },
    enabled: !!milestoneId,
  });

  const handleAssess = async () => {
    setAssessing(true);
    try {
      const res = await fetch(`${getApiUrl()}/ai/execution-risk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ milestoneId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "AI assessment unavailable — try again shortly");
      }
      toast({ title: "Release risk assessed" });
      queryClient.invalidateQueries({ queryKey: ["execution-risk", milestoneId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: String(err?.message ?? err) });
    } finally {
      setAssessing(false);
    }
  };

  const riskLabel = assessment?.releaseRisk
    ? String(assessment.releaseRisk).charAt(0).toUpperCase() + String(assessment.releaseRisk).slice(1)
    : null;
  const riskColor = assessment?.releaseRisk === "critical" || assessment?.releaseRisk === "high"
    ? "text-red-500"
    : assessment?.releaseRisk === "medium" ? "text-amber-500" : "text-green-500";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 text-left">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-semibold">Test Execution</h3>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Live progress from the Execution Dashboard, with AI risk analysis.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { refetchFiles(); refetchProgress(); }}>
            <RefreshCw className="w-4 h-4 mr-2 shrink-0" /> Refresh
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => setLocation(
              files.length === 1
                ? `/test-cases/execution/${files[0].redmineTicketId}`
                : "/test-cases/execution",
            )}
            disabled={files.length === 0}
          >
            <PlayCircle className="w-4 h-4 mr-2 shrink-0" />
            {files.length === 1 ? `Execute #${files[0].redmineTicketId}` : "Execution Dashboard"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : files.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center space-y-2">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No execution file compiled yet</p>
            <p className="text-sm text-muted-foreground">
              Go back to Step 3, select your test cases and compile them for execution.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Execution Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            {/* Number-over-label cells: the old single inline row wrapped
                mid-word ("0 Not / Executed") at phone widths. */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              {[
                { value: totals.passed, label: "Passed", color: "text-green-600" },
                { value: totals.failed, label: "Failed", color: "text-red-600" },
                { value: totals.blocked, label: "Blocked", color: "text-amber-600" },
                { value: totals.notExecuted, label: "Not Executed", color: "" },
                { value: totals.total, label: "Total", color: "" },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-muted/40 py-2 px-1">
                  <div className={`text-base sm:text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
              <p className="text-sm font-medium">AI Release Readiness</p>
              {assessment?.createdAt && (
                <span className="text-xs text-muted-foreground">
                  assessed {new Date(assessment.createdAt).toLocaleString()}
                </span>
              )}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 w-full sm:w-auto shrink-0" onClick={handleAssess} disabled={assessing}>
              {assessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {assessing ? "Assessing…" : assessment ? "Reassess" : "Assess with AI"}
            </Button>
          </div>

          {loadingAssessment ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : !assessment ? (
            <Card className="border-dashed">
              <CardContent className="pt-8 pb-8 text-center space-y-2">
                <Sparkles className="w-7 h-7 mx-auto text-muted-foreground" />
                <p className="font-medium">No AI assessment yet</p>
                <p className="text-sm text-muted-foreground">
                  Run one to get an AI read on release risk and defect leakage from this milestone's actual execution results.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Card className={assessment.releaseRisk === "critical" || assessment.releaseRisk === "high" ? "border-red-500" : ""}>
                  <CardContent className="p-4 sm:pt-6 flex gap-3 sm:gap-4">
                    <div className="mt-0.5 shrink-0">
                      <ShieldAlert className={`w-7 h-7 sm:w-8 sm:h-8 ${riskColor}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-base sm:text-lg">Release Risk Score</h3>
                      <span className={`text-lg sm:text-xl font-bold ${riskColor}`}>{riskLabel} Risk</span>
                      {assessment.riskRationale && (
                        <p className="text-sm text-muted-foreground mt-2 break-words">{assessment.riskRationale}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 sm:pt-6 flex gap-3 sm:gap-4">
                    <div className="mt-0.5 shrink-0">
                      <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-base sm:text-lg">Defect Leakage Prediction</h3>
                      <span className="text-lg sm:text-xl font-bold text-blue-600">{assessment.leakageProbability}%</span>
                      {assessment.leakageRationale && (
                        <p className="text-sm text-muted-foreground mt-2 break-words">{assessment.leakageRationale}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {(assessment.factors?.length > 0 || assessment.recommendation) && (
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    {assessment.factors?.length > 0 && (
                      <div className="space-y-2">
                        {assessment.factors.map((f: any, i: number) => (
                          <div key={i} className="flex gap-2 text-sm">
                            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${f.weight === "primary" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                            <span>
                              <span className="font-medium">{f.signal}</span>
                              {f.detail && <span className="text-muted-foreground"> — {f.detail}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {assessment.recommendation && (
                      <div className="pt-1 border-t text-sm">
                        <span className="font-medium">Recommended next: </span>
                        <span className="text-muted-foreground">{assessment.recommendation}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="divide-y max-h-72 overflow-y-auto overflow-x-hidden">
                {files.map((f: any) => {
                  const p = progressMap[f.redmineTicketId] ?? EMPTY;
                  const done = p.passed + p.failed + p.blocked + p.inProgress;
                  const pct = p.total > 0 ? Math.round((done / p.total) * 100) : 0;
                  return (
                    <div key={f.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 hover:bg-muted/50">
                      <div className="min-w-0 flex-1 flex items-start gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm sm:text-base break-words">{f.title || `Redmine #${f.redmineTicketId}`}</div>
                          <div className="text-xs text-muted-foreground break-words">
                            #{f.redmineTicketId} · {p.passed} passed · {p.failed} failed · {p.total} total
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pl-6 sm:pl-0">
                        <span className="text-sm font-medium tabular-nums">{pct}%</span>
                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)}>
                          Execute
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
