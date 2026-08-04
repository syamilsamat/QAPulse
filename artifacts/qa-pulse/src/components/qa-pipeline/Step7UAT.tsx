import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, Upload, Wand2, BookOpen } from "lucide-react";

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

export function Step7UAT({ milestoneId, onNext }: { milestoneId: number, onNext: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [advancing, setAdvancing] = useState(false);
  const [gherkinInput, setGherkinInput] = useState("");
  const [generatingBDD, setGeneratingBDD] = useState(false);

  const { data: uatFiles = [], isLoading } = useQuery({
    queryKey: ["uat-signoffs", milestoneId],
    queryFn: async () => {
      const res = await api(`/uat-signoffs?milestoneId=${milestoneId}`, token);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!milestoneId,
  });

  const handleGenerateBDD = async () => {
    if (!gherkinInput.trim()) {
      toast({ variant: "destructive", title: "Gherkin input is required" });
      return;
    }
    setGeneratingBDD(true);
    try {
      const res = await api(`/ai/generate-bdd-test-cases`, token, {
        method: "POST",
        body: JSON.stringify({ milestoneId, gherkin: gherkinInput }),
      });
      if (!res.ok) throw new Error("Failed to generate test cases from BDD");
      toast({ title: "Test Cases Generated!" });
      setGherkinInput("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setGeneratingBDD(false);
    }
  };

  const handleAdvance = async () => {
    setAdvancing(true);
    try {
      await api(`/milestones/${milestoneId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ pipelineStep: 8 })
      });
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      onNext();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to advance" });
    } finally {
      setAdvancing(false);
    }
  };

  const hasUatFiles = uatFiles.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">UAT Sign-off & BDD Scenarios</h3>
          <p className="text-muted-foreground mt-1">
            Upload official UAT sign-off documents and optionally convert BDD (Gherkin) scenarios into regression test cases.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-500" />
              UAT Sign-off Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {hasUatFiles 
                ? `${uatFiles.length} UAT file(s) uploaded.`
                : "No UAT files uploaded yet."}
            </div>
            <Button variant="outline" className="w-full" onClick={() => window.open(`/uat-signoffs?milestoneId=${milestoneId}`, '_blank')}>
              Manage UAT Documents
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-500" />
              UAT BDD to Test Cases
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Gherkin Scenarios (Given/When/Then)</Label>
              <Textarea 
                placeholder="Feature: User Login&#10;  Scenario: Successful login&#10;    Given the user is on the login page&#10;    When they enter valid credentials&#10;    Then they should be redirected to the dashboard"
                className="h-32 text-sm font-mono"
                value={gherkinInput}
                onChange={(e) => setGherkinInput(e.target.value)}
              />
            </div>
            <Button variant="secondary" className="w-full" onClick={handleGenerateBDD} disabled={generatingBDD || !gherkinInput.trim()}>
              {generatingBDD ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Generate AI Test Cases
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleAdvance} disabled={advancing} size="lg">
          {advancing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Proceed to Final Step (Step 8) <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
