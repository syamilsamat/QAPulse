import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useRoleLabels } from "@/hooks/use-role-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Signature } from "lucide-react";
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
      const nextStep = milestone?.requiresUat ? 7 : 8;

      const res = await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          pipelineStep: nextStep,
          signedOffAt: new Date().toISOString(),
          signedOffBy: user?.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to sign off");
      }

      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
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

  if (isLoading) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  if (isSignedOff) {
    const signedAt = new Date(milestone.signedOffAt);
    const signerName = milestone.signedOffByName ?? "a QA authority";
    const signerRole = milestone.signedOffByRole ? roleLabel(milestone.signedOffByRole) : null;

    return (
      <div className="w-full max-w-2xl mx-auto space-y-6 text-center">
        <div className="flex flex-col items-center justify-center py-6 sm:p-8 space-y-3 sm:space-y-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-100 dark:bg-green-950/40 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-green-600" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold">Functional Testing Signed Off</h3>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            {signerName} formally confirmed that functional testing is complete for{" "}
            <span className="font-medium text-foreground">{milestone.name}</span> — test cases were executed and
            critical defects resolved.
          </p>
        </div>

        <Card>
          <CardContent className="p-4 sm:pt-6 sm:pb-6 text-left">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-4">Sign-off record</p>
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
              <div>
                <dt className="text-muted-foreground">What happens next</dt>
                <dd className="font-medium mt-0.5">
                  {milestone.requiresUat ? "User Acceptance Testing (UAT)" : "Update Milestone — no UAT required"}
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
          By signing off, you confirm that all functional testing has been completed, test cases have been executed, and all critical defects are resolved.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:pt-6 sm:pb-6 bg-muted/30">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium">
              Next Step: {milestone?.requiresUat ? "User Acceptance Testing (UAT)" : "Update Milestone (No UAT Required)"}
            </p>
            <Button size="lg" className="w-full sm:w-auto whitespace-normal h-auto py-3" onClick={() => setConfirmOpen(true)} disabled={!canSignOff || locked}>
              <CheckCircle2 className="w-4 h-4 mr-2 shrink-0" />
              Sign Off Functional Testing
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
            <DialogTitle>Confirm Sign Off</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-left">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to sign off functional testing for milestone <strong>{milestone?.name}</strong>?
            </p>
            <p className="text-sm">
              This closes the functional testing phase and records your name and the current date and time against
              this milestone as the formal approver.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSignOff} disabled={signingOff}>
              {signingOff && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Sign Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
