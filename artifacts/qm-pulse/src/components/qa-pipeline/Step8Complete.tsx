import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PartyPopper, Download, FileText, CheckCircle2, XCircle, ClipboardList } from "lucide-react";

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

const EMPTY_PROGRESS = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };

export function Step8Complete({ milestoneId, onComplete }: { milestoneId: number, onComplete: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [completing, setCompleting] = useState(false);
  const [generatingRtm, setGeneratingRtm] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);

  // GET /milestones requires projectId and 400s without it — the previous
  // version fetched the list unscoped and only worked by sharing this query
  // key with the parent page's cache.
  const { data: milestone, isLoading: loadingMilestone } = useQuery<any>({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}`, token);
      return res.ok ? res.json() : null;
    },
    enabled: !!milestoneId,
  });

  const { data: allFiles = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["execution-files"],
    queryFn: async () => {
      const res = await api("/execution-files", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: progressMap = {}, isLoading: loadingProgress } = useQuery<Record<string, typeof EMPTY_PROGRESS>>({
    queryKey: ["execution-progress"],
    queryFn: async () => {
      const res = await api("/execution-progress", token);
      return res.ok ? res.json() : {};
    },
  });

  // Step 7 uploads sign-off *documents* into uat_signoffs. The milestone's
  // `uatFileCount` is a different thing entirely — UAT execution files
  // (fileType 'uat' in execution_files) — so it can't be used as this gate.
  const { data: uatSignoffs = [], isLoading: loadingUat } = useQuery({
    queryKey: ["uat-signoffs", "milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/uat-signoffs?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  const files = useMemo(
    () => (allFiles as any[]).filter((f) => f.milestoneId === milestoneId),
    [allFiles, milestoneId],
  );

  const execTotals = useMemo(() => {
    return files.reduce((acc, f: any) => {
      const p = progressMap[f.redmineTicketId] ?? EMPTY_PROGRESS;
      return {
        total: acc.total + p.total,
        executed: acc.executed + p.passed + p.failed + p.blocked + p.inProgress,
        notExecuted: acc.notExecuted + p.notExecuted,
      };
    }, { total: 0, executed: 0, notExecuted: 0 });
  }, [files, progressMap]);

  const checksLoading = loadingMilestone || loadingFiles || loadingProgress || loadingUat;

  // Each earlier step has to have actually produced something before the
  // milestone can be closed — otherwise a pipeline could be marked DEPLOYED
  // with no requirements, no test cases and no sign-off on record.
  const checks = useMemo(() => {
    if (!milestone) return [];
    const approvedFiles = files.filter((f: any) => f.reviewStatus === "approved");
    const list = [
      {
        step: 2,
        label: "Requirements synced",
        ok: (milestone.requirementCount ?? 0) > 0,
        detail: (milestone.requirementCount ?? 0) > 0
          ? `${milestone.requirementCount} requirement(s) linked`
          : "No requirements linked to this milestone",
      },
      {
        step: 3,
        label: "Test cases compiled for execution",
        ok: files.length > 0,
        detail: files.length > 0
          ? `${files.length} execution file(s) compiled`
          : "No test cases compiled into an execution file",
      },
      {
        step: 4,
        label: "Test cases approved",
        ok: files.length > 0 && approvedFiles.length === files.length,
        detail: files.length === 0
          ? "Nothing to approve yet"
          : approvedFiles.length === files.length
            ? "All execution files approved"
            : `${files.length - approvedFiles.length} of ${files.length} file(s) still awaiting approval`,
      },
      {
        step: 5,
        label: "Test execution finished",
        ok: execTotals.total > 0 && execTotals.notExecuted === 0,
        detail: execTotals.total === 0
          ? "No test cases to execute yet"
          : execTotals.notExecuted === 0
            ? `All ${execTotals.total} test case(s) executed`
            : `${execTotals.notExecuted} of ${execTotals.total} test case(s) not executed`,
      },
      {
        step: 6,
        label: "Functional testing signed off",
        ok: !!milestone.signedOffAt,
        detail: milestone.signedOffAt
          ? `Signed off by ${milestone.signedOffByName ?? "a QA authority"}`
          : "Awaiting formal QA sign-off",
      },
    ];
    // UAT is only a gate when the milestone was configured to require it.
    if (milestone.requiresUat) {
      const uatCount = (uatSignoffs as any[]).length;
      list.push({
        step: 7,
        label: "UAT sign-off document uploaded",
        ok: uatCount > 0,
        detail: uatCount > 0
          ? `${uatCount} UAT document(s) on record`
          : "No UAT sign-off document uploaded",
      });
    }
    return list;
  }, [milestone, files, execTotals, uatSignoffs]);

  const outstanding = checks.filter((c) => !c.ok);
  const allComplete = checks.length > 0 && outstanding.length === 0;
  const isCompleted = milestone?.status === "completed";
  const hasRequirements = (milestone?.requirementCount ?? 0) > 0;

  const handleExportRTM = async () => {
    setGeneratingRtm(true);
    try {
      const res = await api(`/traceability/export?projectId=${milestone?.projectId}&milestoneId=${milestoneId}`, token);
      if (!res.ok) throw new Error("Failed to export RTM");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RTM_${milestone?.name || "Milestone"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Requirements Traceability Matrix Exported" });
    } catch (err) {
      toast({ variant: "destructive", title: "RTM export failed" });
    } finally {
      setGeneratingRtm(false);
    }
  };

  const handleGenerateReleaseNotes = async () => {
    setGeneratingNotes(true);
    try {
      const res = await api(`/ai/generate-release-notes`, token, {
        method: "POST",
        body: JSON.stringify({ milestoneId, format: "pdf" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate release notes");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ReleaseNotes_${milestone?.name || "Milestone"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Release notes ready", description: "Downloaded as a formatted PDF." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Release notes failed", description: String(err?.message ?? err) });
    } finally {
      setGeneratingNotes(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to complete pipeline");
      }
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      toast({ title: "Pipeline completed — milestone deployed" });
      onComplete();
    } catch (err: any) {
      toast({ variant: "destructive", title: String(err?.message ?? err) });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 sm:space-y-8 text-center">
      <div className="flex flex-col items-center justify-center py-6 sm:p-8 space-y-3 sm:space-y-4">
        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-1 sm:mb-2 ${allComplete || isCompleted ? "bg-green-100" : "bg-muted"}`}>
          {allComplete || isCompleted
            ? <PartyPopper className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
            : <ClipboardList className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />}
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold">
          {isCompleted ? "Milestone Deployed" : allComplete ? "Ready for Deployment" : "Not Ready for Deployment"}
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md">
          {isCompleted ? (
            <>Milestone <strong>{milestone?.name}</strong> has been marked as deployed and the pipeline is closed.</>
          ) : allComplete ? (
            <>All QA phases for milestone <strong>{milestone?.name}</strong> are complete. Generate your final artifacts before closing the pipeline.</>
          ) : (
            <>
              {outstanding.length} earlier step{outstanding.length !== 1 ? "s" : ""} still need
              {outstanding.length === 1 ? "s" : ""} attention before <strong>{milestone?.name}</strong> can be
              marked as deployed.
            </>
          )}
        </p>
      </div>

      {checksLoading ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : !isCompleted && (
        <Card className={allComplete ? "border-green-500" : "border-amber-300"}>
          <CardContent className="p-4 sm:pt-6 sm:pb-6 text-left">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4">Pipeline readiness</p>
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.step} className="flex items-start gap-2.5 sm:gap-3 text-sm">
                  {c.ok
                    ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    : <XCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <span className={c.ok ? "" : "font-medium"}>
                      Step {c.step} — {c.label}
                    </span>
                    <p className="text-xs text-muted-foreground break-words">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-left">
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Traceability Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4">
            <p className="text-sm text-muted-foreground">
              Your audit trail in one spreadsheet — every requirement mapped to its test cases, execution
              results and linked defects, with gaps in coverage flagged. Formatted and print-ready for
              compliance reviews.
            </p>
            <Button variant="outline" className="w-full" onClick={handleExportRTM} disabled={generatingRtm || !hasRequirements}>
              {generatingRtm ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              {generatingRtm ? "Preparing Excel…" : "Download RTM (Excel)"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {hasRequirements
                ? "Excel workbook (.xlsx) — one row per requirement/test case pair."
                : "Needs requirements — sync them in step 2 first."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Release Notes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 space-y-3 sm:space-y-4">
            <p className="text-sm text-muted-foreground">
              AI turns this milestone's delivered requirements and resolved defects into a polished,
              business-ready document — what's new, what's fixed, and what users need to know.
            </p>
            <Button variant="outline" className="w-full" onClick={handleGenerateReleaseNotes} disabled={generatingNotes || !hasRequirements}>
              {generatingNotes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              {generatingNotes ? "Drafting…" : "Draft Release Notes (AI)"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {hasRequirements
                ? "Downloads as a formatted PDF. Review before sharing externally."
                : "Needs requirements — sync them in step 2 first."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4 sm:pt-8 space-y-3">
        <Button
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 h-auto py-4 sm:py-6 whitespace-normal"
          onClick={handleComplete}
          disabled={completing || checksLoading || isCompleted || !allComplete}
        >
          {completing ? (
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 shrink-0" />
          )}
          {isCompleted ? "Pipeline Completed" : "Mark Milestone as DEPLOYED"}
        </Button>
        {!isCompleted && !allComplete && !checksLoading && (
          <p className="text-sm text-muted-foreground">
            Complete the outstanding steps above to enable deployment.
          </p>
        )}
      </div>
    </div>
  );
}
