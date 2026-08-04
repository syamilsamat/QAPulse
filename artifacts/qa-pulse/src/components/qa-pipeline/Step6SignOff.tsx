import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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

export function Step6SignOff({ milestoneId, onNext, onSkipUat }: { milestoneId: number, onNext: () => void, onSkipUat: () => void }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOff, setSigningOff] = useState(false);

  const { data: milestone, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones`, token);
      if (!res.ok) return null;
      const data = await res.json();
      return data.find((m: any) => m.id === milestoneId);
    },
    enabled: !!milestoneId,
  });

  const handleSignOff = async () => {
    setSigningOff(true);
    try {
      const nextStep = milestone?.requiresUat ? 7 : 8;
      
      await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ 
          pipelineStep: nextStep,
          signedOffAt: new Date().toISOString(),
          signedOffBy: user?.id,
        })
      });
      
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      setConfirmOpen(false);
      toast({ title: "Functional Testing Signed Off!" });
      
      if (nextStep === 8) {
        onSkipUat();
      } else {
        onNext();
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to sign off" });
    } finally {
      setSigningOff(false);
    }
  };

  const canSignOff = ["admin", "qa_lead", "qa_manager", "hod_qa", "cto"].includes(user?.role ?? "");

  if (isLoading) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 text-center">
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
          <Signature className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-2xl font-bold">Functional Testing Sign Off</h3>
        <p className="text-muted-foreground max-w-md">
          By signing off, you confirm that all functional testing has been completed, test cases have been executed, and all critical defects are resolved.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 bg-muted/30">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium">
              Next Step: {milestone?.requiresUat ? "User Acceptance Testing (UAT)" : "Update Milestone (No UAT Required)"}
            </p>
            <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!canSignOff}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Sign Off Functional Testing
            </Button>
            {!canSignOff && (
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
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to sign off functional testing for milestone <strong>{milestone?.name}</strong>?
            </p>
            <p className="text-sm">
              This will officially close the functional testing phase and record your signature.
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
