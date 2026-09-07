import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";

const TYPE_OPTIONS = [
  { value: "cr", label: "Change Request" },
  { value: "sprint", label: "Sprint" },
  { value: "phase", label: "Phase" },
  { value: "release", label: "Release" },
];

const ENVIRONMENT_OPTIONS = ["ENV1", "ENV2", "ENV3", "ENV4", "ENV5", "ENV6"];

const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "verified", label: "Verified" },
  { value: "uat", label: "UAT" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

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

export function Step1Milestone({ defaultProjectId }: { defaultProjectId?: string } = {}) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [form, setForm] = useState({
    name: "",
    type: "cr",
    status: "planned",
    priority: "none",
    environment: "none",
    targetDate: "",
    startDate: "",
    reqTargetDate: "",
    devTargetDate: "",
    qaTargetDate: "",
    uatTargetDate: "",
    goLiveDate: "",
    description: "",
    requiresUat: false,
  });
  const [saving, setSaving] = useState(false);

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });

  const canWrite = ["admin", "qa_member", "qa_lead", "qa_manager", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"].includes(user?.role ?? "");

  const handleCreate = async () => {
    if (!projectId) {
      toast({ variant: "destructive", title: "Project is required" });
      return;
    }
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Milestone name is required" });
      return;
    }

    setSaving(true);
    try {
      const res = await api("/milestones", token, {
        method: "POST",
        body: JSON.stringify({
          projectId: Number(projectId),
          name: form.name,
          type: form.type,
          status: form.status,
          priority: form.priority === "none" ? null : form.priority,
          environment: form.environment === "none" ? null : form.environment,
          targetDate: form.targetDate || null,
          startDate: form.startDate || null,
          reqTargetDate: form.reqTargetDate || null,
          devTargetDate: form.devTargetDate || null,
          qaTargetDate: form.qaTargetDate || null,
          uatTargetDate: form.uatTargetDate || null,
          goLiveDate: form.goLiveDate || null,
          description: form.description,
          requiresUat: form.requiresUat,
          pipelineEnabled: true,
          pipelineStep: 1, // Advance to step 1
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create milestone");
      }
      const data = await res.json();
      toast({ title: "Pipeline Milestone created!" });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      // Navigate to the newly created milestone pipeline
      setLocation(`/qa-pipeline/${data.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You do not have permission to create QA Pipeline milestones.
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 text-left">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Project</Label>
          <SearchableSelect
            options={projects.map(p => ({ label: p.name, value: String(p.id) }))}
            value={projectId}
            onValueChange={setProjectId}
            placeholder="Select project..."
          />
        </div>
        <div className="space-y-2">
          <Label>Milestone Name</Label>
          <Input 
            value={form.name} 
            onChange={e => setForm({ ...form, name: e.target.value })} 
            placeholder="e.g. Sprint 42 / Release v2.1"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target Date</Label>
            <Input
              type="date"
              value={form.targetDate}
              onChange={e => setForm({ ...form, targetDate: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Environment</Label>
          <Select value={form.environment} onValueChange={v => setForm({ ...form, environment: v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {ENVIRONMENT_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Phase Target Dates (optional)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Requirements by</Label>
              <Input type="date" value={form.reqTargetDate} onChange={e => setForm({ ...form, reqTargetDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dev done by</Label>
              <Input type="date" value={form.devTargetDate} onChange={e => setForm({ ...form, devTargetDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">QA done by</Label>
              <Input type="date" value={form.qaTargetDate} onChange={e => setForm({ ...form, qaTargetDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">UAT done by</Label>
              <Input type="date" value={form.uatTargetDate} onChange={e => setForm({ ...form, uatTargetDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Go-Live</Label>
              <Input type="date" value={form.goLiveDate} onChange={e => setForm({ ...form, goLiveDate: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="High level goals for this pipeline run..."
          />
        </div>

        <div className="flex flex-row items-center space-x-3 space-y-0 p-4 border rounded-lg bg-muted/50">
          <Checkbox 
            id="uatToggle"
            checked={form.requiresUat}
            onCheckedChange={(checked) => setForm({ ...form, requiresUat: !!checked })}
          />
          <div className="space-y-1 leading-none">
            <Label htmlFor="uatToggle">Requires UAT Sign-off?</Label>
            <p className="text-sm text-muted-foreground">
              If enabled, Step 7 (UAT Sign-off) will be required before the pipeline can be completed.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Milestone & Start Pipeline
        </Button>
      </div>
    </div>
  );
}
