import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { MilestonePicker } from "@/components/MilestonePicker";
import { PackagePlus, FolderOpen, Plus, Search, Loader2 } from "lucide-react";

type CompileStep = "mode" | "existing" | "new";

interface CompileNewForm {
  redmineTicketId: string;
  title: string;
  remarks: string;
  requirementId: string;
  projectId: string;
  milestoneId: string;
  tracker: string;
  selectedModules: number[];
}

const EMPTY_FORM: CompileNewForm = {
  redmineTicketId: "",
  title: "",
  remarks: "",
  requirementId: "",
  projectId: "",
  milestoneId: "",
  tracker: "",
  selectedModules: [],
};

export function CompileToExecutionDialog({
  open,
  onOpenChange,
  selectedTestCases,
  projects,
  modules,
  trackers,
  requirements,
  token,
  defaultProjectId,
  defaultMilestoneId,
  lockProjectAndMilestone = false,
  onCompiled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already resolved by the caller, in the exact order the rows should be compiled. */
  selectedTestCases: any[];
  projects: any[];
  modules: any[];
  trackers: any[];
  requirements: any[];
  token: string | null;
  defaultProjectId?: number;
  defaultMilestoneId?: number;
  lockProjectAndMilestone?: boolean;
  onCompiled: (targetTicketId: string) => void;
}) {
  const { toast } = useToast();

  const [step, setStep] = useState<CompileStep>("mode");
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [existingSearch, setExistingSearch] = useState("");
  const [targetTicketId, setTargetTicketId] = useState<string | null>(null);
  const [form, setForm] = useState<CompileNewForm>(EMPTY_FORM);
  const [isCompiling, setIsCompiling] = useState(false);

  const count = selectedTestCases.length;

  // Prefill from the selection each time the dialog opens: shared module names,
  // shared Redmine ticket / tracker where the selection agrees, and the first
  // test case's requirement/project (with milestone resolved through it).
  useEffect(() => {
    if (!open) return;
    const first = selectedTestCases[0];
    if (!first) return;

    const distinctModuleNames = [...new Set(selectedTestCases.map((tc: any) => tc.module).filter(Boolean))] as string[];
    const matchedModuleIds = modules.filter((m: any) => distinctModuleNames.includes(m.name)).map((m: any) => m.id);
    const distinctRedmineIds = [...new Set(selectedTestCases.map((tc: any) => tc.redmineUserStory).filter(Boolean))] as string[];
    const distinctTrackers = [...new Set(selectedTestCases.map((tc: any) => tc.tracker).filter(Boolean))] as string[];
    const matchedRequirement = first.requirementId
      ? (requirements as any[]).find((r: any) => r.id === first.requirementId)
      : null;

    setForm({
      redmineTicketId: (distinctRedmineIds[0] ?? "").replace(/\D/g, ""),
      title: "",
      remarks: "",
      requirementId: first.requirementId ? String(first.requirementId) : "",
      projectId: defaultProjectId
        ? String(defaultProjectId)
        : first.projectId ? String(first.projectId) : "",
      milestoneId: defaultMilestoneId
        ? String(defaultMilestoneId)
        : matchedRequirement?.milestoneId ? String(matchedRequirement.milestoneId) : "",
      tracker: distinctTrackers.length === 1 ? distinctTrackers[0] : (first.tracker ?? ""),
      selectedModules: matchedModuleIds,
    });
    setStep("mode");
    setTargetTicketId(null);
    setExistingSearch("");
    setExistingFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleChooseExisting = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/execution-files`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setExistingFiles(await res.json());
    } catch {}
    setStep("existing");
  };

  const handleConfirm = async () => {
    const newRows = selectedTestCases.map((tc: any) => ({
      moduleName: tc.module ?? "",
      caseId: tc.caseId ?? "",
      caseName: tc.title,
      userStory: tc.redmineUserStory ?? "",
      tracker: tc.tracker ?? "",
      scenario: tc.scenario ?? "",
      preCondition: tc.preconditions ?? "",
      testSteps: tc.testSteps ?? "",
      testData: tc.testData ?? "",
      expectedResult: tc.expectedResult ?? "",
      comments: tc.comments ?? "",
      libraryTcId: tc.id,
      requirementId: tc.requirementId ?? null,
      result: "Not Executed",
    }));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    setIsCompiling(true);
    try {
      let ticketId = targetTicketId;
      if (step === "new") {
        const selectedModuleNames = form.selectedModules
          .map((id) => modules.find((m: any) => m.id === id)?.name)
          .filter(Boolean) as string[];
        const createRes = await fetch(`${getApiUrl()}/execution-files`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            redmineTicketId: form.redmineTicketId.trim(),
            title: form.title || undefined,
            remarks: form.remarks || undefined,
            selectedModules: selectedModuleNames.length ? selectedModuleNames.join(",") : undefined,
            tracker: form.tracker || undefined,
            projectId: form.projectId ? Number(form.projectId) : undefined,
            requirementId: form.requirementId ? Number(form.requirementId) : undefined,
            milestoneId: form.milestoneId ? Number(form.milestoneId) : undefined,
          }),
        });
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${createRes.status}`);
        }
        const created = await createRes.json();
        ticketId = created.redmineTicketId;
      }
      if (!ticketId) throw new Error("No target execution file");

      let existingTCs: any[] = [];
      if (step === "existing") {
        const getRes = await fetch(`${getApiUrl()}/execution-files/${ticketId}/test-cases`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (getRes.ok) existingTCs = (await getRes.json()).testCases ?? [];
        // Merge new module names into the existing file's selectedModules
        const newModuleNames = [...new Set(newRows.map((r: any) => r.moduleName).filter(Boolean))] as string[];
        if (newModuleNames.length > 0) {
          const fileRes = await fetch(`${getApiUrl()}/execution-files`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (fileRes.ok) {
            const allFiles = await fileRes.json();
            const existingFile = allFiles.find((f: any) => String(f.redmineTicketId) === String(ticketId));
            if (existingFile) {
              const existingModules = (existingFile.selectedModules || "").split(",").map((s: string) => s.trim()).filter(Boolean);
              const merged = [...new Set([...existingModules, ...newModuleNames])];
              if (merged.length !== existingModules.length) {
                await fetch(`${getApiUrl()}/execution-files/${existingFile.id}`, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify({ selectedModules: merged.join(",") }),
                }).catch(() => {});
              }
            }
          }
        }
      }

      const saveRes = await fetch(`${getApiUrl()}/execution-files/${ticketId}/test-cases`, {
        method: "POST",
        headers,
        body: JSON.stringify({ testCases: [...existingTCs, ...newRows] }),
      });
      if (!saveRes.ok) {
        const saveBody = await saveRes.json().catch(() => ({}));
        throw new Error(saveBody.error ?? `Server error ${saveRes.status}`);
      }
      toast({ title: `${count} test case${count !== 1 ? "s" : ""} compiled into #${ticketId}` });
      onOpenChange(false);
      onCompiled(String(ticketId));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Compile failed", description: String(err?.message ?? err) });
    } finally {
      setIsCompiling(false);
    }
  };

  const canCompileNew =
    !!form.redmineTicketId.trim() &&
    !!form.projectId &&
    !!form.milestoneId &&
    form.selectedModules.length > 0;

  const lockedProjectName = lockProjectAndMilestone
    ? projects.find((p: any) => String(p.id) === form.projectId)?.name
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onOpenChange(false); setStep("mode"); setTargetTicketId(null); } }}>
      <DialogContent className="sm:max-w-[520px] w-[95vw] flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-primary" />
            {step === "mode"
              ? "Compile to Execution File"
              : step === "existing"
                ? "Select Execution File"
                : "New Execution File"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-4">
          {step === "mode" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compiling <strong>{count}</strong> test case{count !== 1 ? "s" : ""} into an execution file.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleChooseExisting}
                  className="flex flex-col items-center gap-3 p-4 sm:p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                >
                  <FolderOpen className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-sm">Add to Existing</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Append into an existing execution file</p>
                  </div>
                </button>
                <button
                  onClick={() => setStep("new")}
                  className="flex flex-col items-center gap-3 p-4 sm:p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                >
                  <Plus className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-sm">Create New</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Create a new execution file for these TCs</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === "existing" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ticket ID or title..."
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                {existingFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No execution files found.</p>
                ) : (
                  existingFiles
                    .filter((f) => {
                      if (!existingSearch) return true;
                      const q = existingSearch.toLowerCase();
                      return f.redmineTicketId?.includes(q) || f.title?.toLowerCase().includes(q);
                    })
                    .map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setTargetTicketId(f.redmineTicketId)}
                        className={`w-full text-left px-4 py-3 border-b last:border-b-0 text-sm hover:bg-muted/50 transition-colors flex items-center gap-3 ${targetTicketId === f.redmineTicketId ? "bg-primary/10 font-medium" : ""}`}
                      >
                        <div className={`w-2 h-2 rounded-full shrink-0 ${targetTicketId === f.redmineTicketId ? "bg-primary" : "bg-transparent border border-border"}`} />
                        <div>
                          <span className="font-semibold text-primary">#{f.redmineTicketId}</span>
                          {f.title && <span className="ml-2 text-muted-foreground">{f.title}</span>}
                        </div>
                      </button>
                    ))
                )}
              </div>
              {targetTicketId && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">#{targetTicketId}</span>
                </p>
              )}
            </div>
          )}

          {step === "new" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. 38032"
                  value={form.redmineTicketId}
                  onChange={(e) => setForm({ ...form, redmineTicketId: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Requirement <span className="text-xs text-muted-foreground">(optional — auto-fills Project &amp; Module)</span></Label>
                <SearchableSelect
                  value={form.requirementId}
                  onValueChange={(v) => {
                    const req = requirements.find((r: any) => r.id === Number(v)) as any;
                    const matchedMod = req?.module ? modules.find((m: any) => m.name === req.module) : null;
                    setForm({
                      ...form,
                      requirementId: v,
                      projectId: lockProjectAndMilestone
                        ? form.projectId
                        : req?.projectId ? String(req.projectId) : form.projectId,
                      milestoneId: lockProjectAndMilestone
                        ? form.milestoneId
                        : req?.milestoneId ? String(req.milestoneId) : form.milestoneId,
                      tracker: req?.tracker ?? form.tracker,
                      selectedModules: matchedMod ? [matchedMod.id] : form.selectedModules,
                    });
                  }}
                  options={[
                    { value: "", label: "None" },
                    ...requirements.map((r: any) => ({ value: String(r.id), label: r.title, keywords: r.redmineTicketId })),
                  ]}
                  placeholder="Search requirement..."
                  searchPlaceholder="Search by title or Redmine ID..."
                />
              </div>

              {lockProjectAndMilestone ? (
                <div className="space-y-1">
                  <Label>Project</Label>
                  <p className="text-sm px-3 py-2 rounded-md bg-muted/50 border">
                    {lockedProjectName ?? "—"}
                    <span className="text-xs text-muted-foreground ml-2">(from this pipeline)</span>
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label>Project <span className="text-destructive">*</span></Label>
                    <SearchableSelect
                      value={form.projectId}
                      onValueChange={(v) => setForm({ ...form, projectId: v, milestoneId: "" })}
                      options={[
                        { value: "", label: "Select project..." },
                        ...projects.map((p: any) => ({ value: String(p.id), label: p.name })),
                      ]}
                      placeholder="Search project..."
                    />
                  </div>
                  {form.projectId && (
                    <MilestonePicker
                      projectId={form.projectId}
                      token={token}
                      value={form.milestoneId}
                      onChange={(v) => setForm({ ...form, milestoneId: v })}
                      required
                    />
                  )}
                </>
              )}

              <div className="space-y-1">
                <Label>Module <span className="text-destructive">*</span></Label>
                <div className="border rounded-md p-2 max-h-[150px] overflow-y-auto space-y-1">
                  {modules.length === 0
                    ? <p className="text-sm text-muted-foreground text-center py-2">No modules available.</p>
                    : modules.map((m: any) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={form.selectedModules.includes(m.id)}
                          onChange={(e) => setForm({
                            ...form,
                            selectedModules: e.target.checked
                              ? [...form.selectedModules, m.id]
                              : form.selectedModules.filter((id) => id !== m.id),
                          })}
                        />
                        {m.name}
                      </label>
                    ))
                  }
                </div>
                {form.selectedModules.length > 0 && (
                  <p className="text-xs text-muted-foreground">{form.selectedModules.length} module(s) selected</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Tracker</Label>
                <SearchableSelect
                  value={form.tracker}
                  onValueChange={(v) => setForm({ ...form, tracker: v })}
                  options={[
                    { value: "", label: "None" },
                    ...(trackers as any[]).map((t: any) => ({ value: t.name, label: t.name })),
                    ...(form.tracker && !(trackers as any[]).some((t: any) => t.name === form.tracker)
                      ? [{ value: form.tracker, label: form.tracker }]
                      : []),
                  ]}
                  placeholder="Select tracker..."
                  searchPlaceholder="Search tracker..."
                />
              </div>
              <div className="space-y-1">
                <Label>Remarks</Label>
                <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
              <div className="pt-1">
                <Button className="w-full gap-2" onClick={handleConfirm} disabled={!canCompileNew || isCompiling}>
                  {isCompiling
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating &amp; Compiling...</>
                    : <><PackagePlus className="w-4 h-4" /> Compile {count} test case{count !== 1 ? "s" : ""}</>
                  }
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3 gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (step === "mode") onOpenChange(false);
              else { setStep("mode"); setTargetTicketId(null); }
            }}
            disabled={isCompiling}
          >
            {step === "mode" ? "Cancel" : "Back"}
          </Button>
          {step === "existing" && (
            <Button onClick={handleConfirm} disabled={!targetTicketId || isCompiling} className="gap-2">
              {isCompiling
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling...</>
                : <><PackagePlus className="w-4 h-4" /> Compile {count} test case{count !== 1 ? "s" : ""}</>
              }
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
