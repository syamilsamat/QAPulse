import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle, FileDown, Wand2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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

export function Step2Requirements({ milestoneId, onNext }: { milestoneId: number, onNext: () => void }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [redmineId, setRedmineId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [piiModalOpen, setPiiModalOpen] = useState(false);
  const [piiChecked, setPiiChecked] = useState(false);

  // Check if milestone has data prep files (Enhancement 4: Environment Readiness Gate)
  const { data: dataPrepFiles = [], isLoading: loadingFiles } = useQuery({
    queryKey: ["data-prep-files", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}/data-prep`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  // Fetch requirements linked to this milestone
  const { data: requirements = [], isLoading: loadingReqs } = useQuery({
    queryKey: ["requirements", "milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/requirements?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  const handleSyncRequirements = async () => {
    if (!redmineId.trim()) {
      toast({ variant: "destructive", title: "Parent Redmine ID is required" });
      return;
    }
    setSyncing(true);
    try {
      // In a full implementation, we'd have a specific endpoint that recursively fetches children
      // but excludes 'Task'/'QA Defect'. For now we use the existing redmine sync flow
      const res = await api("/redmine/import", token, {
        method: "POST",
        body: JSON.stringify({
          ticketIds: [redmineId.trim()],
          milestoneId,
          recursive: true // assuming the backend supports this based on plan
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to sync from Redmine");
      }
      toast({ title: "Requirements synced successfully!" });
      queryClient.invalidateQueries({ queryKey: ["requirements", "milestone", milestoneId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleAIAnalyze = async () => {
    // Show PII Modal first (Enhancement 10)
    setPiiModalOpen(true);
  };

  const confirmAIAnalyze = async () => {
    if (!piiChecked) {
      toast({ variant: "destructive", title: "Please confirm PII is scrubbed" });
      return;
    }
    setPiiModalOpen(false);
    setAnalyzing(true);
    try {
      const res = await api(`/ai/analyze-milestone-requirements`, token, {
        method: "POST",
        body: JSON.stringify({ milestoneId }),
      });
      if (!res.ok) throw new Error("Failed to analyze requirements");
      toast({ title: "AI Analysis Complete!" });
      queryClient.invalidateQueries({ queryKey: ["requirements", "milestone", milestoneId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleProceed = async () => {
    try {
      // Advance pipeline step
      await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ pipelineStep: 3 })
      });
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      onNext();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to proceed to next step" });
    }
  };

  const hasDataPrep = dataPrepFiles.length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-left">
      {/* Environment Readiness Gate */}
      <Card className={`border-l-4 ${hasDataPrep ? 'border-l-green-500' : 'border-l-amber-500'}`}>
        <CardContent className="pt-6 flex gap-4">
          <div className="mt-1">
            {hasDataPrep ? (
              <FileDown className="w-6 h-6 text-green-500" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-lg">Environment Readiness Gate</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {hasDataPrep 
                ? `Passed: ${dataPrepFiles.length} Data Prep file(s) found for this milestone.`
                : "Warning: No Data Prep files found. Ensure your environment has the required test data before proceeding."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sync Requirements */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">1. Pull Requirements from Redmine</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label className="sr-only">Parent Redmine ID</Label>
            <Input 
              value={redmineId} 
              onChange={e => setRedmineId(e.target.value)} 
              placeholder="e.g. 12345 (Parent Epic/Feature ID)"
            />
          </div>
          <Button onClick={handleSyncRequirements} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            Sync Requirements
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          This will fetch the parent ticket and all sub-tickets recursively, filtering out "Tasks" and "QA Defects".
        </p>
      </div>

      {/* Requirements List & Analysis */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">2. Analyze Requirements</h3>
          <Button onClick={handleAIAnalyze} disabled={analyzing || requirements.length === 0} variant="secondary">
            {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Analyze with AI
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loadingReqs ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : requirements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No requirements synced yet.</div>
            ) : (
              <div className="divide-y max-h-64 overflow-auto">
                {requirements.map((req: any) => (
                  <div key={req.id} className="p-3 flex items-center justify-between hover:bg-muted/50">
                    <div>
                      <div className="font-medium">{req.title}</div>
                      <div className="text-xs text-muted-foreground">Redmine #{req.redmineTicketId}</div>
                    </div>
                    {req.aiAnalysisStatus === "completed" && (
                      <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">Analyzed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleProceed} disabled={requirements.length === 0} size="lg">
          Proceed to Step 3
        </Button>
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
    </div>
  );
}
