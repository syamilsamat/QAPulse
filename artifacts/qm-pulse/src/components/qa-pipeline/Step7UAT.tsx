import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { stripFileExtension } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Wand2, BookOpen, FileText, Eye, CircleSlash } from "lucide-react";

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

export function Step7UAT({ milestoneId, locked = false }: { milestoneId: number, locked?: boolean }) {
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

  // Shares the ["milestone", id] key with Steps 6 and 8, so this is a cache
  // hit rather than another request.
  const { data: milestone, isLoading: loadingMilestone } = useQuery<any>({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${milestoneId}`, token);
      return res.ok ? res.json() : null;
    },
    enabled: !!milestoneId,
  });

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
  // This milestone was configured without a UAT sign-off phase (Step 1's
  // "Requires UAT Sign-off?"), so the whole step is not applicable.
  const uatNotRequired = !!milestone && !milestone.requiresUat;

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

  if (loadingMilestone) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }

  // UAT isn't part of this milestone — present the step as deliberately
  // skipped rather than as an empty upload form the user might think is
  // broken. Any documents already uploaded stay visible (read-only) so
  // turning the flag off later can't hide evidence that's on record.
  if (uatNotRequired) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6 text-center">
        <div className="flex flex-col items-center justify-center py-6 sm:py-8 space-y-3 sm:space-y-4 opacity-70">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted flex items-center justify-center">
            <CircleSlash className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold text-muted-foreground">UAT Sign-off Not Required</h3>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md">
            <span className="font-medium text-foreground">{milestone?.name}</span> was set up without a UAT phase, so
            there's nothing to upload or sign off here. This step is complete by definition — continue to Step 8 to
            close out the milestone.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-4 sm:p-6 text-left space-y-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Need UAT after all?</p>
            <p className="text-sm text-muted-foreground">
              Turn on <span className="font-medium text-foreground">Requires UAT Sign-off?</span> in this milestone's
              settings and this step will open up for document upload. Step 8 will then also expect a signed document
              before the milestone can be marked as deployed.
            </p>
          </CardContent>
        </Card>

        {hasUatFiles && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Documents already on record ({uatFiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground text-left mb-3">
                Uploaded while UAT was still required. Kept for the audit trail — review only.
              </p>
              <div className="border rounded-md divide-y max-h-56 overflow-y-auto overflow-x-hidden text-left">
                {(uatFiles as any[]).map((f) => (
                  <div key={f.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-all" title={f.fileName}>{stripFileExtension(f.fileName)}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.uploaderName ?? "Unknown"} · {new Date(f.createdAt).toLocaleDateString()}
                          {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0 self-start sm:self-auto -ml-1 sm:ml-0" onClick={() => handleReview(f)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Review
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full max-w-4xl mx-auto space-y-6 sm:space-y-8 ${bddEnabled ? "text-left" : "text-center"}`}>
      <div>
        <h3 className="text-lg sm:text-xl font-semibold">
          {bddEnabled ? "UAT Sign-off & BDD Scenarios" : "UAT Sign-off"}
        </h3>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {bddEnabled
            ? "Upload official UAT sign-off documents and optionally convert BDD (Gherkin) scenarios into regression test cases."
            : "Upload the official UAT sign-off documents for this milestone."}
        </p>
      </div>

      <div className={bddEnabled ? "grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6" : "max-w-md mx-auto text-left"}>
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
              <div className="border rounded-md divide-y max-h-56 overflow-y-auto overflow-x-hidden">
                {(uatFiles as any[]).map((f) => (
                  <div key={f.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-all" title={f.fileName}>{stripFileExtension(f.fileName)}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.uploaderName ?? "Unknown"} · {new Date(f.createdAt).toLocaleDateString()}
                          {f.sizeBytes ? ` · ${formatBytes(f.sizeBytes)}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0 self-start sm:self-auto -ml-1 sm:ml-0" onClick={() => handleReview(f)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Review
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation(`/uat-signoffs?milestoneId=${milestoneId}`)}
              disabled={locked}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload UAT Documents
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {locked
                ? "Uploads are closed — this pipeline is completed."
                : "Supports PDF, Word, JPEG and PNG (max 15 MB)."}
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
                  disabled={locked}
                />
              </div>
              <Button variant="secondary" className="w-full" onClick={handleGenerateBDD} disabled={generatingBDD || !gherkinInput.trim() || locked}>
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
