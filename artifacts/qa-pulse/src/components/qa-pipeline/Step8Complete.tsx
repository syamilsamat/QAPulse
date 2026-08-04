import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PartyPopper, Download, FileText, CheckCircle2 } from "lucide-react";

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

  const { data: milestone } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones`, token);
      if (!res.ok) return null;
      const data = await res.json();
      return data.find((m: any) => m.id === milestoneId);
    },
    enabled: !!milestoneId,
  });

  const handleExportRTM = async () => {
    setGeneratingRtm(true);
    try {
      const res = await api(`/traceability/export?projectId=${milestone?.projectId}&milestoneId=${milestoneId}`, token);
      if (!res.ok) throw new Error("Failed to export RTM");
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RTM_${milestone?.name || 'Milestone'}.xlsx`;
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
        body: JSON.stringify({ milestoneId }),
      });
      if (!res.ok) throw new Error("Failed to generate release notes");
      
      // Assume the API returns { content: "markdown notes..." }
      const data = await res.json();
      
      // Download as text file for simplicity in this demo
      const blob = new Blob([data.content || "Draft Release Notes"], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ReleaseNotes_${milestone?.name || 'Milestone'}.md`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "Release Notes Generated!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setGeneratingNotes(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ 
          status: "completed",
          // The pipeline stays at step 8
        })
      });
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      toast({ title: "Pipeline Completed! Milestone Deployed." });
      onComplete();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to complete pipeline" });
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-center">
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
          <PartyPopper className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-3xl font-bold">Ready for Deployment</h3>
        <p className="text-muted-foreground max-w-md">
          All QA phases for milestone <strong>{milestone?.name}</strong> are complete. Generate your final artifacts before closing the pipeline.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 text-left">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Traceability Matrix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Auto-generate a full RTM mapping requirements to test cases and defects for compliance.
            </p>
            <Button variant="outline" className="w-full" onClick={handleExportRTM} disabled={generatingRtm}>
              {generatingRtm ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Export RTM Excel
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Release Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Let AI draft business-friendly release notes by analyzing closed requirements and defects.
            </p>
            <Button variant="secondary" className="w-full" onClick={handleGenerateReleaseNotes} disabled={generatingNotes}>
              {generatingNotes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              Draft Release Notes (AI)
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="pt-8">
        <Button 
          size="lg" 
          className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-lg px-8 py-6"
          onClick={handleComplete}
          disabled={completing || milestone?.status === "completed"}
        >
          {completing ? (
            <Loader2 className="w-6 h-6 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-6 h-6 mr-2" />
          )}
          {milestone?.status === "completed" ? "Pipeline Completed" : "Mark Milestone as DEPLOYED"}
        </Button>
      </div>
    </div>
  );
}
