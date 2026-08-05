import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rocket, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Step1Milestone } from "@/components/qa-pipeline/Step1Milestone";
import { Step2Requirements } from "@/components/qa-pipeline/Step2Requirements";
import { Step3TestCases } from "@/components/qa-pipeline/Step3TestCases";
import { Step4Approval } from "@/components/qa-pipeline/Step4Approval";
import { Step5Execution } from "@/components/qa-pipeline/Step5Execution";
import { Step6SignOff } from "@/components/qa-pipeline/Step6SignOff";
import { Step7UAT } from "@/components/qa-pipeline/Step7UAT";
import { Step8Complete } from "@/components/qa-pipeline/Step8Complete";

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
  const params = useParams();
  const milestoneId = params.milestoneId ? parseInt(params.milestoneId, 10) : null;
  const [currentStep, setCurrentStep] = useState(1);

  const { data: milestone, isLoading } = useQuery({
    queryKey: ["milestone", milestoneId],
    queryFn: async () => {
      if (!milestoneId) return null;
      const res = await fetch(`${getApiUrl()}/milestones`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error("Failed to fetch milestones");
      const milestones = await res.json();
      return milestones.find((m: any) => m.id === milestoneId) || null;
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
