import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Wand2, BookOpen, FileText, Eye } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

export function Step7UAT({ milestoneId }: { milestoneId: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [gherkinInput, setGherkinInput] = useState("");
  const [generatingBDD, setGeneratingBDD] = useState(false);

  // The BDD panel is opt-in system-wide (Configuration → Global Settings),
  // since not every team writes Gherkin scenarios.
  const { data: pipelineSettings } = useQuery<{ bddEnabled?: boolean }>({
    queryKey: ["pipeline-settings"],
    queryFn: async () => {
      const res = await api("/pipeline-settings", token);
      return res.ok ? res.json() : {};
    },
  });
  const bddEnabled = pipelineSettings?.bddEnabled ?? false;

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

  const hasUatFiles = uatFiles.length > 0;

  // Open the document for review in a new tab. Fetched as a blob rather than
  // linked directly because the endpoint needs the bearer token — PDFs and
  // images render inline, other types fall back to the browser's download.
  const handleReview = async (f: any) => {
    try {
      const res = await api(`/uat-signoffs/${f.id}/download?inline=1`, token);
      if (!res.ok) throw new Error("Could not open document");
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      // Give the new tab time to load before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast({ variant: "destructive", title: String(err?.message ?? err) });
    }
  };

  return (
    <div className={`w-full max-w-4xl mx-auto space-y-8 ${bddEnabled ? "text-left" : "text-center"}`}>
      <div>
        <h3 className="text-xl font-semibold">
          {bddEnabled ? "UAT Sign-off & BDD Scenarios" : "UAT Sign-off"}
        </h3>
        <p className="text-muted-foreground mt-1">
          {bddEnabled
            ? "Upload official UAT sign-off documents and optionally convert BDD (Gherkin) scenarios into regression test cases."
            : "Upload the official UAT sign-off documents for this milestone."}
        </p>
      </div>

      <div className={bddEnabled ? "grid grid-cols-2 gap-6" : "max-w-md mx-auto text-left"}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-500" />
              UAT Sign-off Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="py-4 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-muted-foreground" /></div>
            ) : !hasUatFiles ? (
              <p className="text-sm text-muted-foreground">
                No UAT sign-off documents uploaded for this milestone yet.
              </p>
            ) : (
              <div className="border rounded-md divide-y max-h-56 overflow-auto">
                {(uatFiles as any[]).map((f) => (
                  <div key={f.id} className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{f.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.uploaderName ?? "Unknown"} · {new Date(f.createdAt).toLocaleDateString()}
                          {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => handleReview(f)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={() => setLocation(`/uat-signoffs?milestoneId=${milestoneId}`)}>
              <Upload className="w-4 h-4 mr-2" />
              Upload UAT Documents
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Supports PDF, Word, JPEG and PNG (max 15 MB).
            </p>
          </CardContent>
        </Card>

        {bddEnabled && (
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
        )}
      </div>
    </div>
  );
}
