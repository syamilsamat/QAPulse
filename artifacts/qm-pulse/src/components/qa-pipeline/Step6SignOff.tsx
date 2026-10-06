import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useRoleLabels } from "@/hooks/use-role-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Signature, AlertTriangle, Clock } from "lucide-react";
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

export function Step6SignOff({ milestoneId, onNext, onSkipUat, locked = false }: { milestoneId: number, onNext: () => void, onSkipUat: () => void, locked?: boolean }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roleLabel } = useRoleLabels();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOff, setSigningOff] = useState(false);

  // GET /milestones requires a projectId and 400s without one — the previous
  // version fetched the whole list unscoped and only ever worked by sharing
  // this query key with the parent page's cache.
  const { data: milestone, isLoading } = useQuery<any>({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}`, token);
      return res.ok ? res.json() : null;
    },
    enabled: !!milestoneId,
  });

  const handleSignOff = async () => {
    setSigningOff(true);
    try {
      const nextStep = milestone?.requiresSit || milestone?.requiresUat ? 7 : 8;

      // The server records the signer (the logged-in user), the time, and
      // whether this is a Full or Conditional sign-off from its own counts.
      const res = await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          pipelineStep: nextStep,
          signedOffAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to sign off");
      }

      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      setConfirmOpen(false);
      toast({ title: "Functional testing signed off" });

      if (nextStep === 8) onSkipUat();
      else onNext();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to sign off", description: String(err?.message ?? err) });
    } finally {
      setSigningOff(false);
    }
  };

  const canSignOff = ["admin", "qa_lead", "qa_manager", "hod_qa", "cto"].includes(user?.role ?? "");
  const isSignedOff = !!milestone?.signedOffAt;

  // Sign-off needs 100% of test cases executed. It is a Full sign-off when
  // 100% passed, a Conditional Sign Off when some failed/blocked. Computed
  // by the server (executionOutcome), which enforces the same rule.
  const outcome: string | undefined = milestone?.executionOutcome;
  const readyToSign = outcome === "full" || outcome === "conditional";
  // What a sign-off made right now would be recorded as.
  const isConditional = outcome === "conditional";
  const notExecutedCount = (milestone?.execRowCount ?? 0) - (milestone?.execExecutedCount ?? 0);

  if (isLoading) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  if (isSignedOff) {
    const signedAt = new Date(milestone.signedOffAt);
    const signerName = milestone.signedOffByName ?? "a QA authority";
    const signerRole = milestone.signedOffByRole ? roleLabel(milestone.signedOffByRole) : null;
    // What was signed is frozen at sign-off time (shadows the "would be"
    // value above). Sign-offs recorded before the snapshot existed fall back
    // to the live counts.
    const isConditional = !!milestone.signoffConditional;
    const defectsAtSignoff = milestone.signoffFailedCount ?? milestone.execFailedCount ?? 0;
    const totalAtSignoff = milestone.signoffTotalCount ?? milestone.execRowCount ?? 0;
    const retestedSince = isConditional && outcome === "full";

    return (
      <div className="w-full max-w-2xl mx-auto space-y-6 text-center">
        <div className="flex flex-col items-center justify-center py-6 sm:p-8 space-y-3 sm:space-y-4">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 ${isConditional ? "bg-amber-100 dark:bg-amber-950/40" : "bg-green-100 dark:bg-green-950/40"} rounded-full flex items-center justify-center`}>
            {isConditional
              ? <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-amber-600" />
              : <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-green-600" />
            }
          </div>
          <h3 className="text-xl sm:text-2xl font-bold">
            {isConditional ? "Conditional Sign Off" : "Functional Testing Signed Off"}
          </h3>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            {isConditional ? (
              <>
                {signerName} signed off functional testing for{" "}
                <span className="font-medium text-foreground">{milestone.name}</span> with all test cases executed and
                {" "}<span className="font-semibold text-amber-600">{defectsAtSignoff} failed / blocked</span> at the time
                of sign-off. This milestone proceeds with a conditional sign-off.
              </>
            ) : (
              <>
                {signerName} formally confirmed that functional testing is complete for{" "}
                <span className="font-medium text-foreground">{milestone.name}</span> — all test cases were executed and
                passed.
              </>
            )}
          </p>
        </div>

        {retestedSince && (
          <div className="flex items-start gap-2.5 rounded-lg border p-3 text-left text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <span>
              The failed / blocked test cases have since been retested and now pass. The sign-off record stays
              conditional, because that is what was signed.
            </span>
          </div>
        )}

        <Card className={isConditional ? "border-amber-400" : ""}>
          <CardContent className="p-4 sm:pt-6 sm:pb-6 text-left">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4">
              {isConditional ? "Conditional sign-off record" : "Sign-off record"}
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Signed off by</dt>
                <dd className="font-medium mt-0.5">
                  {signerName}
                  {signerRole && <span className="text-muted-foreground font-normal"> · {signerRole}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Signed off on</dt>
                <dd className="font-medium mt-0.5">
                  {signedAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                  <span className="text-muted-foreground font-normal">
                    {" "}at {signedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Milestone</dt>
                <dd className="font-medium mt-0.5">{milestone.name}</dd>
              </div>
              {isConditional && (
                <div>
                  <dt className="text-muted-foreground">Defects at sign-off</dt>
                  <dd className="font-medium mt-0.5 text-amber-600">
                    {defectsAtSignoff} of {totalAtSignoff} test case(s) failed / blocked
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Sign-off type</dt>
                <dd className="font-medium mt-0.5">
                  {isConditional ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" /> Conditional
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Full sign-off
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">What happens next</dt>
                <dd className="font-medium mt-0.5">
                  {milestone.requiresSit && milestone.requiresUat ? "SIT and User Acceptance Testing (UAT)" : milestone.requiresSit ? "System Integration Testing (SIT)" : milestone.requiresUat ? "User Acceptance Testing (UAT)" : "Update Milestone — no SIT or UAT required"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* No "Continue to…" button here — the wizard footer's "Next Step"
            already advances, and two buttons doing the same thing is noise.
            Signing off still auto-advances via handleSignOff. */}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 sm:space-y-8 text-center">
      <div className="flex flex-col items-center justify-center py-6 sm:p-8 space-y-3 sm:space-y-4">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center">
          <Signature className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold">Functional Testing Sign Off</h3>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md">
          By signing off, you confirm that all functional testing has been completed and every test case has been executed.
        </p>
      </div>

      {!readyToSign && (
        <Card className="border-muted-foreground/30 border-dashed">
          <CardContent className="p-4 sm:pt-5 sm:pb-5">
            <div className="flex items-start gap-3 text-left">
              <Clock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Not ready for sign-off</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {outcome === "incomplete"
                    ? <>{notExecutedCount} of {milestone?.execRowCount ?? 0} test case(s) have not been executed yet. Every test case must be run (Passed, Failed or Blocked) before functional testing can be signed off — see Step 5.</>
                    : outcome === "none"
                      ? <>No test cases have been compiled for execution yet. Compile and execute them in Steps 3–5 first.</>
                      // No outcome at all means the API server predates this
                      // check (it needs a restart/redeploy), not that nothing
                      // was executed — don't claim the latter.
                      : <>Couldn't read the execution result from the server. Refresh the page; if this persists, the API server needs restarting to pick up the latest version.</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isConditional && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 sm:pt-5 sm:pb-5">
            <div className="flex items-start gap-3 text-left">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Conditional Sign Off</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All {milestone?.execRowCount ?? 0} test case(s) have been executed, but{" "}
                  <span className="font-semibold text-amber-600">{milestone?.execFailedCount ?? 0} failed / blocked</span>. Signing off now
                  will record this as a <strong>Conditional Sign Off</strong>, indicating the release proceeds with known defects.
                  It stays conditional even if those test cases are retested later.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 sm:pt-6 sm:pb-6 bg-muted/30">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium">
              Next Step: {milestone?.requiresSit && milestone?.requiresUat ? "SIT and User Acceptance Testing (UAT)" : milestone?.requiresSit ? "System Integration Testing (SIT)" : milestone?.requiresUat ? "User Acceptance Testing (UAT)" : "Update Milestone (No SIT or UAT Required)"}
            </p>
            <Button size="lg" className={`w-full sm:w-auto whitespace-normal h-auto py-3 ${isConditional ? "bg-amber-600 hover:bg-amber-700" : ""}`} onClick={() => setConfirmOpen(true)} disabled={!canSignOff || locked || !readyToSign}>
              {isConditional ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />}
              {isConditional ? "Conditional Sign Off" : "Sign Off Functional Testing"}
            </Button>
            {locked ? (
              <p className="text-xs text-muted-foreground mt-2">
                This pipeline is completed and closed — sign-off can no longer be recorded.
              </p>
            ) : !canSignOff && (
              <p className="text-xs text-muted-foreground mt-2">
                Only QA Leads, QA Managers, or HODs can provide functional sign-off.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isConditional ? "Confirm Conditional Sign Off" : "Confirm Sign Off"}</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-left">
            {isConditional && (
              <div className="flex items-start gap-2.5 mb-4 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  This is a <strong>conditional sign-off</strong> — there are {milestone?.execFailedCount ?? 0} failed/blocked
                  test case(s). The release will proceed with known defects.
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to {isConditional ? "conditionally " : ""}sign off functional testing for milestone <strong>{milestone?.name}</strong>?
            </p>
            <p className="text-sm">
              This closes the functional testing phase and records your name and the current date and time against
              this milestone as the formal approver.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className={isConditional ? "bg-amber-600 hover:bg-amber-700" : ""} onClick={handleSignOff} disabled={signingOff}>
              {signingOff && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isConditional ? "Confirm Conditional Sign Off" : "Confirm Sign Off"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
