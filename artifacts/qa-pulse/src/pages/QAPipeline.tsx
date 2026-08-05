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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Rocket, CheckCircle2, Circle, ArrowRight, Plus, Flag, Loader2, CalendarDays, Clock, XCircle, ArrowLeft, Pencil, Trash2 } from "lucide-react";
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

const TYPE_OPTIONS = [
  { value: "cr", label: "Change Request" },
  { value: "sprint", label: "Sprint" },
  { value: "phase", label: "Phase" },
  { value: "release", label: "Release" },
];
const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "verified", label: "Verified" },
  { value: "uat", label: "UAT" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];
const ENVIRONMENT_OPTIONS = ["ENV1", "ENV2", "ENV3", "ENV4", "ENV5", "ENV6"];

// Same write-tier as Step1Milestone's create gate — kept in sync so anyone
// who can start a pipeline milestone can also edit/delete it from here.
const PIPELINE_WRITE_ROLES = ["admin", "qa_member", "qa_lead", "qa_manager", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"];

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
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const params = useParams();
  const milestoneId = params.milestoneId ? parseInt(params.milestoneId, 10) : null;
  const [currentStep, setCurrentStep] = useState(1);
  // Guards the resume-step effect below to only run once per milestone visit
  // — otherwise every milestone refetch (e.g. after a deliberate "Previous
  // Step" click) would keep snapping the user back to Step 2.
  const [resumedFor, setResumedFor] = useState<number | null>(null);

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
  const canWritePipelines = PIPELINE_WRITE_ROLES.includes(user?.role ?? "");

  const [editingMilestone, setEditingMilestone] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", type: "cr", status: "planned", priority: "none", environment: "none",
    targetDate: "", startDate: "", reqTargetDate: "", devTargetDate: "", qaTargetDate: "", uatTargetDate: "", goLiveDate: "",
    description: "", requiresUat: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteMilestoneId, setDeleteMilestoneId] = useState<number | null>(null);

  const openEditMilestone = (m: any) => {
    setEditingMilestone(m);
    setEditForm({
      name: m.name,
      type: m.type,
      status: m.status,
      priority: m.priority ?? "none",
      environment: m.environment ?? "none",
      targetDate: m.targetDate ? m.targetDate.slice(0, 10) : "",
      startDate: m.startDate ? m.startDate.slice(0, 10) : "",
      reqTargetDate: m.reqTargetDate ? m.reqTargetDate.slice(0, 10) : "",
      devTargetDate: m.devTargetDate ? m.devTargetDate.slice(0, 10) : "",
      qaTargetDate: m.qaTargetDate ? m.qaTargetDate.slice(0, 10) : "",
      uatTargetDate: m.uatTargetDate ? m.uatTargetDate.slice(0, 10) : "",
      goLiveDate: m.goLiveDate ? m.goLiveDate.slice(0, 10) : "",
      description: m.description ?? "",
      requiresUat: !!m.requiresUat,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMilestone) return;
    if (!editForm.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    setSavingEdit(true);
    try {
      const res = await fetch(`${getApiUrl()}/milestones/${editingMilestone.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          status: editForm.status,
          priority: editForm.priority === "none" ? null : editForm.priority,
          environment: editForm.environment === "none" ? null : editForm.environment,
          targetDate: editForm.targetDate || null,
          startDate: editForm.startDate || null,
          reqTargetDate: editForm.reqTargetDate || null,
          devTargetDate: editForm.devTargetDate || null,
          qaTargetDate: editForm.qaTargetDate || null,
          uatTargetDate: editForm.uatTargetDate || null,
          goLiveDate: editForm.goLiveDate || null,
          description: editForm.description.trim() || null,
          requiresUat: editForm.requiresUat,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Failed to update milestone"); }
      toast({ title: "Milestone updated" });
      setEditingMilestone(null);
      queryClient.invalidateQueries({ queryKey: ["milestones", pickerProjectId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMilestone = async (id: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/milestones/${id}`, {
        method: "DELETE",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Milestone deleted" });
      setDeleteMilestoneId(null);
      queryClient.invalidateQueries({ queryKey: ["milestones", pickerProjectId] });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete milestone" });
    }
  };

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
    if (!milestone || resumedFor === milestoneId) return;
    if (milestone.pipelineStep && milestone.pipelineStep > 1) {
      setCurrentStep(milestone.pipelineStep);
    } else if (milestone.requirementCount > 0) {
      // Requirements were already synced even though pipelineStep was never
      // explicitly advanced past Step 1 (syncing doesn't move the pipeline
      // position by itself — only "Next"/a sidebar click does). Resume on
      // Step 2 so the synced list is immediately visible instead of
      // re-showing the "Milestone Created" screen as if nothing happened.
      setCurrentStep(2);
    }
    setResumedFor(milestoneId);
  }, [milestone, milestoneId, resumedFor]);

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
          <Step2Requirements milestoneId={milestoneId} projectId={milestone?.projectId} />
        ) : (
          <div>Milestone required.</div>
        );
      case 3:
        return milestoneId ? (
          <Step3TestCases milestoneId={milestoneId} projectId={milestone?.projectId} />
        ) : (
          <div>Milestone required.</div>
        );
      case 4:
        return milestoneId ? (
          <Step4Approval milestoneId={milestoneId} />
        ) : (
          <div>Milestone required.</div>
        );
      case 5:
        return milestoneId ? (
          <Step5Execution milestoneId={milestoneId} />
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
          <Step7UAT milestoneId={milestoneId} />
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
                  {canWritePipelines && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openEditMilestone(m)}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteMilestoneId(m.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit dialog */}
        <Dialog open={!!editingMilestone} onOpenChange={(open) => !open && setEditingMilestone(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Pipeline Milestone</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                    <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Target Date</Label>
                  <Input type="date" value={editForm.targetDate} onChange={(e) => setEditForm({ ...editForm, targetDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Environment</Label>
                <Select value={editForm.environment} onValueChange={(v) => setEditForm({ ...editForm, environment: v })}>
                  <SelectTrigger><SelectValue placeholder="Select environment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {ENVIRONMENT_OPTIONS.map((env) => <SelectItem key={env} value={env}>{env}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Phase Target Dates (optional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Requirements by</Label>
                    <Input type="date" value={editForm.reqTargetDate} onChange={(e) => setEditForm({ ...editForm, reqTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Dev done by</Label>
                    <Input type="date" value={editForm.devTargetDate} onChange={(e) => setEditForm({ ...editForm, devTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">QA done by</Label>
                    <Input type="date" value={editForm.qaTargetDate} onChange={(e) => setEditForm({ ...editForm, qaTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">UAT done by</Label>
                    <Input type="date" value={editForm.uatTargetDate} onChange={(e) => setEditForm({ ...editForm, uatTargetDate: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Go-Live</Label>
                    <Input type="date" value={editForm.goLiveDate} onChange={(e) => setEditForm({ ...editForm, goLiveDate: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="flex flex-row items-center space-x-3 p-3 border rounded-lg bg-muted/50">
                <Checkbox
                  id="editUatToggle"
                  checked={editForm.requiresUat}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, requiresUat: !!checked })}
                />
                <Label htmlFor="editUatToggle" className="text-sm">Requires UAT Sign-off?</Label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditingMilestone(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={deleteMilestoneId !== null} onOpenChange={() => setDeleteMilestoneId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete Pipeline Milestone?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              This will permanently delete this milestone and its pipeline progress. Requirements and execution files linked to it will stay in the system, but will no longer show which milestone they belonged to.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteMilestoneId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteMilestoneId && handleDeleteMilestone(deleteMilestoneId)}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
