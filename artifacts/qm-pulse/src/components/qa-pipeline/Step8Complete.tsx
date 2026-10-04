import { ProgressDialog } from "@/components/ProgressDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PartyPopper, Download, FileText, CheckCircle2, XCircle, ClipboardList, AlertTriangle } from "lucide-react";

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

  const checksLoading = loadingMilestone;

  // Each earlier step has to have actually produced something before the
  // milestone can be closed. The checklist is computed by the server
  // (computeDeployChecks in lib/pipeline-facts.ts) — the same one PATCH
  // /milestones/:id enforces — so what is shown here is exactly what the
  // deploy action will accept.
  const checks: { step: number; label: string; ok: boolean; detail: string }[] = milestone?.deployChecks ?? [];

  const outstanding = checks.filter((c) => !c.ok);
  const allComplete = checks.length > 0 && outstanding.length === 0;
  const isCompleted = milestone?.status === "completed";
  const hasRequirements = (milestone?.requirementCount ?? 0) > 0;
  // Conditional follows the recorded functional sign-off (frozen when it was
  // signed), not the live defect count — a conditional sign-off stays a
  // Conditional Sign Off through deployment even if defects are retested.
  const hasDefects = !!milestone?.signoffConditional;
  const retestedSince = hasDefects && milestone?.executionOutcome === "full";

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
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
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
        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mb-1 sm:mb-2 ${allComplete || isCompleted ? (hasDefects ? "bg-amber-100 dark:bg-amber-950/40" : "bg-green-100") : "bg-muted"}`}>
          {allComplete || isCompleted
            ? (hasDefects ? <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-amber-600" /> : <PartyPopper className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />)
            : <ClipboardList className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />}
        </div>
        <h3 className="text-2xl sm:text-3xl font-bold">
          {isCompleted
            ? (hasDefects ? "Milestone Deployed (Conditional Sign Off)" : "Milestone Deployed")
            : allComplete
              ? (hasDefects ? "Ready for Deployment (Conditional Sign Off)" : "Ready for Deployment")
              : "Not Ready for Deployment"}
        </h3>
        {hasDefects && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Conditional Sign Off — {milestone?.signoffFailedCount ?? milestone?.execFailedCount ?? 0} of{" "}
            {milestone?.signoffTotalCount ?? milestone?.execRowCount ?? 0} test case(s) failed / blocked at sign-off
          </span>
        )}
        <p className="text-sm sm:text-base text-muted-foreground max-w-md">
          {isCompleted ? (
            hasDefects ? (
              <>Milestone <strong>{milestone?.name}</strong> has been deployed under a Conditional Sign Off, with known defects, and the pipeline is closed.</>
            ) : (
              <>Milestone <strong>{milestone?.name}</strong> has been marked as deployed and the pipeline is closed.</>
            )
          ) : allComplete ? (
            hasDefects ? (
              <>All QA phases for milestone <strong>{milestone?.name}</strong> are complete under a Conditional Sign Off. Generate your final artifacts before closing the pipeline.</>
            ) : (
              <>All QA phases for milestone <strong>{milestone?.name}</strong> are complete. Generate your final artifacts before closing the pipeline.</>
            )
          ) : (
            <>
              {outstanding.length} earlier step{outstanding.length !== 1 ? "s" : ""} still need
              {outstanding.length === 1 ? "s" : ""} attention before <strong>{milestone?.name}</strong> can be
              marked as deployed.
            </>
          )}
        </p>
        {retestedSince && (
          <p className="text-xs text-muted-foreground max-w-md">
            The failed / blocked test cases have since been retested and now pass, but the sign-off was recorded as
            conditional and stays that way.
          </p>
        )}
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
            <ProgressDialog open={generatingRtm} title="Preparing the RTM" message="Building the requirements traceability Excel file." hint="Usually a few seconds" />
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
            <ProgressDialog open={generatingNotes} title="Drafting release notes" message="Asking the AI to draft release notes from this milestone." hint="Usually 10 to 30 seconds" />
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
          className={`${hasDefects ? "bg-amber-600 hover:bg-amber-700" : "bg-green-600 hover:bg-green-700"} text-white w-full sm:w-auto text-base sm:text-lg px-6 sm:px-8 h-auto py-4 sm:py-6 whitespace-normal`}
          onClick={handleComplete}
          disabled={completing || checksLoading || isCompleted || !allComplete}
        >
          {completing ? (
            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 animate-spin shrink-0" />
          ) : (
            hasDefects ? <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 mr-2 shrink-0" /> : <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 mr-2 shrink-0" />
          )}
          {isCompleted ? "Pipeline Completed" : (hasDefects ? "Mark Milestone as DEPLOYED (Conditional Sign Off)" : "Mark Milestone as DEPLOYED")}
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
