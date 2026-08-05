import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Rocket, CheckCircle2, Circle, ArrowRight, Plus, Flag, Loader2, CalendarDays, Clock, XCircle, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Step1Milestone } from "@/components/qa-pipeline/Step1Milestone";
import { Step2Requirements } from "@/components/qa-pipeline/Step2Requirements";
import { Step3TestCases } from "@/components/qa-pipeline/Step3TestCases";
import { Step4Approval } from "@/components/qa-pipeline/Step4Approval";
import { Step5Execution } from "@/components/qa-pipeline/Step5Execution";
import { Step6SignOff } from "@/components/qa-pipeline/Step6SignOff";
import { Step7UAT } from "@/components/qa-pipeline/Step7UAT";
import { Step8Complete } from "@/components/qa-pipeline/Step8Complete";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    case "active":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> Active</Badge>;
    case "verified":
      return <Badge className="gap-1 bg-teal-100 text-teal-700 border-teal-200"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>;
    case "uat":
      return <Badge className="gap-1 bg-violet-100 text-violet-700 border-violet-200"><Clock className="w-3 h-3" /> UAT</Badge>;
    case "cancelled":
      return <Badge className="gap-1 bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3" /> Cancelled</Badge>;
    default:
      return <Badge variant="outline">Planned</Badge>;
  }
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  switch (priority) {
    case "Critical":
      return <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">Critical</Badge>;
    case "High":
      return <Badge className="gap-1 bg-orange-100 text-orange-700 border-orange-200">High</Badge>;
    case "Medium":
      return <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">Medium</Badge>;
    default:
      return <Badge variant="outline">Low</Badge>;
  }
}

// Placeholder Steps for the 8-step wizard
const PIPELINE_STEPS = [
  { id: 1, title: "Milestone & UAT", desc: "Create milestone & configure UAT" },
  { id: 2, title: "Sync Requirements", desc: "Pull from Redmine & AI analyze" },
  { id: 3, title: "Create Test Cases", desc: "Generate TCs with Risk-Based Testing" },
  { id: 4, title: "Approve Test Cases", desc: "QA Lead approval gate" },
  { id: 5, title: "Execute Testing", desc: "Run TCs & log defects" },
  { id: 6, title: "Sign Off Functional", desc: "Formal QA sign-off" },
  { id: 7, title: "UAT Sign-offs", desc: "Upload UAT packs (if required)" },
  { id: 8, title: "Update Milestone", desc: "Generate RTM & Release Notes" }
];

export default function QAPipeline() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams();
  const milestoneId = params.milestoneId ? parseInt(params.milestoneId, 10) : null;
  const [currentStep, setCurrentStep] = useState(1);

  // Milestone picker — shown whenever no specific milestone is selected, so
  // QA can see which pipeline runs already exist (same project-scoped list +
  // card layout as the Milestones page) instead of only ever landing on a
  // blank "create new" form.
  const [pickerProjectId, setPickerProjectId] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/projects`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      return res.ok ? res.json() : [];
    },
    enabled: !milestoneId,
  });

  const { data: projectMilestones = [], isLoading: loadingPipelines } = useQuery<any[]>({
    queryKey: ["milestones", pickerProjectId],
    queryFn: async () => {
      if (pickerProjectId === "all") return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${pickerProjectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      return res.ok ? res.json() : [];
    },
    enabled: !milestoneId && pickerProjectId !== "all",
  });
  const pipelineMilestones = projectMilestones.filter((m) => m.pipelineEnabled);

  const { data: milestone, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      if (!milestoneId) return null;
      const res = await fetch(`${getApiUrl()}/milestones/${milestoneId}`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to fetch milestone");
      return res.json();
    },
    enabled: !!milestoneId,
  });

  useEffect(() => {
    if (milestone && milestone.pipelineStep) {
      setCurrentStep(milestone.pipelineStep);
    }
  }, [milestone]);

  // Free-roam navigation: any step is reachable directly (no forced
  // sequential order), so multiple QA members can split work across steps
  // (e.g. one syncing requirements while another already drafts test cases).
  // Still persists pipelineStep so the position survives a reload.
  const goToStep = (step: number) => {
    setCurrentStep(step);
    if (!milestoneId) return;
    fetch(`${getApiUrl()}/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ pipelineStep: step }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] }))
      .catch(() => {});
  };

  const renderActiveStep = () => {
    if (isLoading) {
      return <div className="p-12 text-center text-muted-foreground">Loading milestone data...</div>;
    }
    
    switch (currentStep) {
      case 1:
        return milestoneId ? (
          <div className="p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Milestone Created!</h2>
            <p className="text-muted-foreground">
              Milestone <strong>{milestone?.name}</strong> is configured for the QA Pipeline.
              Proceed to Step 2 to sync requirements.
            </p>
          </div>
        ) : (
          <Step1Milestone />
        );
      case 2:
        return milestoneId ? (
          <Step2Requirements milestoneId={milestoneId} onNext={() => setCurrentStep(3)} />
        ) : (
          <div>Milestone required.</div>
        );
      case 3:
        return milestoneId ? (
          <Step3TestCases milestoneId={milestoneId} onNext={() => setCurrentStep(4)} />
        ) : (
          <div>Milestone required.</div>
        );
      case 4:
        return milestoneId ? (
          <Step4Approval milestoneId={milestoneId} onNext={() => setCurrentStep(5)} />
        ) : (
          <div>Milestone required.</div>
        );
      case 5:
        return milestoneId ? (
          <Step5Execution milestoneId={milestoneId} onNext={() => setCurrentStep(6)} />
        ) : (
          <div>Milestone required.</div>
        );
      case 6:
        return milestoneId ? (
          <Step6SignOff 
            milestoneId={milestoneId} 
            onNext={() => setCurrentStep(7)} 
            onSkipUat={() => setCurrentStep(8)}
          />
        ) : (
          <div>Milestone required.</div>
        );
      case 7:
        return milestoneId ? (
          <Step7UAT milestoneId={milestoneId} onNext={() => setCurrentStep(8)} />
        ) : (
          <div>Milestone required.</div>
        );
      case 8:
        return milestoneId ? (
          <Step8Complete milestoneId={milestoneId} onComplete={() => {}} />
        ) : (
          <div>Milestone required.</div>
        );
      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <Rocket className="w-24 h-24 text-muted-foreground/20 mb-6" />
            <h2 className="text-2xl font-semibold mb-2">Work in Progress</h2>
            <p className="text-muted-foreground max-w-md">
              This panel will contain the interactive UI for Step {currentStep}.
            </p>
          </div>
        );
    }
  };

  // No milestone selected yet — show a Milestones-page-style picker (project
  // selector + card grid of existing pipeline runs) instead of always
  // landing on a blank create form, so QA can see what's already in flight.
  if (!milestoneId) {
    return (
      <div className="container mx-auto p-6 max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Rocket className="w-8 h-8 text-blue-600" />
              QA Deployment Pipeline
            </h1>
            <p className="text-muted-foreground mt-2">
              Guided end-to-end workflow from requirements to production deployment.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SearchableSelect
            value={pickerProjectId}
            onValueChange={(v) => { setPickerProjectId(v); setShowCreateForm(false); }}
            options={[{ value: "all", label: "Select a project…" }, ...projects.map(p => ({ value: String(p.id), label: p.name }))]}
            placeholder="Select project"
            searchPlaceholder="Search projects…"
            className="w-64"
          />
          {pickerProjectId !== "all" && (
            <Button variant={showCreateForm ? "outline" : "default"} className="gap-2" onClick={() => setShowCreateForm((v) => !v)}>
              {showCreateForm ? (<><ArrowLeft className="w-4 h-4" /> Back to Pipelines</>) : (<><Plus className="w-4 h-4" /> Start New Pipeline</>)}
            </Button>
          )}
        </div>

        {pickerProjectId === "all" && (
          <div className="text-center py-16 text-muted-foreground">
            <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Select a project to view its QA Pipeline milestones.</p>
          </div>
        )}

        {pickerProjectId !== "all" && showCreateForm && (
          <Card>
            <CardContent className="pt-6">
              <Step1Milestone defaultProjectId={pickerProjectId} />
            </CardContent>
          </Card>
        )}

        {pickerProjectId !== "all" && !showCreateForm && loadingPipelines && (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading pipelines…
          </div>
        )}

        {pickerProjectId !== "all" && !showCreateForm && !loadingPipelines && pipelineMilestones.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Rocket className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No QA Pipeline milestones yet for this project.</p>
            <Button onClick={() => setShowCreateForm(true)} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Start first pipeline
            </Button>
          </div>
        )}

        {pickerProjectId !== "all" && !showCreateForm && pipelineMilestones.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pipelineMilestones.map((m) => (
              <Card key={m.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold">{m.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Step {m.pipelineStep ?? 1} of 8</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={m.status} />
                      <PriorityBadge priority={m.priority} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(m.targetDate || m.environment) && (
                    <div className="flex items-center justify-between gap-2">
                      {m.targetDate ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <CalendarDays className="w-3.5 h-3.5" />
                          <span>Target: {format(new Date(m.targetDate), "dd MMM yyyy")}</span>
                        </div>
                      ) : <span />}
                      {m.environment && (
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">{m.environment}</Badge>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-muted/50 p-2 text-center">
                      <p className="text-lg font-bold">{m.requirementCount ?? 0}</p>
                      <p className="text-muted-foreground">Requirements</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2 text-center">
                      <p className="text-lg font-bold text-green-600">{m.approvedCount ?? 0}</p>
                      <p className="text-muted-foreground">Approved</p>
                    </div>
                  </div>
                  <Button size="sm" className="w-full gap-1.5" onClick={() => setLocation(`/qa-pipeline/${m.id}`)}>
                    Open Pipeline <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="w-8 h-8 text-blue-600" />
            QA Deployment Pipeline
          </h1>
          <p className="text-muted-foreground mt-2">
            Guided end-to-end workflow from requirements to production deployment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Stepper Sidebar */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {PIPELINE_STEPS.map((step) => {
              const isActive = step.id === currentStep;
              const isPast = step.id < currentStep;
              return (
                <div
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${isActive ? "bg-primary/10" : "opacity-70"}`}
                >
                  <div className="mt-0.5">
                    {isPast ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : isActive ? (
                      <Circle className="w-5 h-5 fill-primary text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className={`font-medium text-sm ${isActive ? "text-primary" : ""}`}>{step.id}. {step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Active Step Panel */}
        <Card className="md:col-span-3 min-h-[500px] flex flex-col">
          <CardHeader>
            <CardTitle>Step {currentStep}: {PIPELINE_STEPS[currentStep - 1].title}</CardTitle>
            <CardDescription>{PIPELINE_STEPS[currentStep - 1].desc}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {renderActiveStep()}
          </CardContent>
          <div className="p-6 border-t flex justify-end gap-3 mt-auto">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => goToStep(currentStep - 1)}>
                Previous Step
              </Button>
            )}
            {currentStep < 8 && milestoneId && (
              <Button onClick={() => goToStep(currentStep + 1)}>
                Next Step <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {currentStep === 8 && (
              <Button className="bg-green-600 hover:bg-green-700">
                Complete Pipeline <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
