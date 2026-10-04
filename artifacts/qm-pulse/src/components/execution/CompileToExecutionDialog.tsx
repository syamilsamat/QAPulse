import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
import { ProgressDialog } from "@/components/ProgressDialog";
import { PackagePlus, FolderOpen, Plus, Search, Loader2, X } from "lucide-react";

type CompileStep = "mode" | "existing" | "new";

interface CompileNewForm {
  redmineTicketId: string;
  title: string;
  remarks: string;
  projectId: string;
  milestoneId: string;
  tracker: string;
  selectedModules: number[];
  /** qa (System Testing), sit or uat. */
  fileType: string;
}

const EMPTY_FORM: CompileNewForm = {
  redmineTicketId: "",
  title: "",
  remarks: "",
  projectId: "",
  milestoneId: "",
  tracker: "",
  selectedModules: [],
  fileType: "qa",
};

// CR097 — the requirements the compiled test cases belong to, each with the
// test cases it brings. Ticking a requirement off leaves its test cases out;
// "added" ones were searched for and bring their library test cases.
interface ReqGroup {
  key: string;
  requirementId: number | null;
  tcs: any[];
  added: boolean;
  on: boolean;
}

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
  const [groups, setGroups] = useState<ReqGroup[]>([]);
  const [allMilestones, setAllMilestones] = useState<{ id: number; name: string; projectId: number; projectName?: string | null }[]>([]);
  const [titleTouched, setTitleTouched] = useState(false);
  const [ticketTouched, setTicketTouched] = useState(false);
  const [milestoneTouched, setMilestoneTouched] = useState(false);
  const [addingReqId, setAddingReqId] = useState<number | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  const reqById = (id: number | null) => (id == null ? null : (requirements as any[]).find((r: any) => r.id === id) ?? null);
  const tickedGroups = groups.filter((g) => g.on);
  const tickedTcs = tickedGroups.flatMap((g) => g.tcs);
  const tickedReqIds = tickedGroups.map((g) => g.requirementId).filter((id): id is number => id != null);
  // Existing-file mode compiles exactly what was selected; a new file compiles what is ticked.
  const count = step === "new" ? tickedTcs.length : selectedTestCases.length;

  // Milestone, modules, tracker and ticket follow the ticked requirements
  // until the person edits them by hand.
  const applyGroups = (next: ReqGroup[], flags: { ticket: boolean; milestone: boolean; initial?: boolean }) => {
    setGroups(next);
    const on = next.filter((g) => g.on);
    const reqs = on.map((g) => reqById(g.requirementId)).filter(Boolean) as any[];
    const tcs = on.flatMap((g) => g.tcs);
    const moduleNames = [...new Set(tcs.map((tc: any) => tc.module).filter(Boolean))] as string[];
    const moduleIds = modules.filter((m: any) => moduleNames.includes(m.name)).map((m: any) => m.id);
    const distinctTrackers = [...new Set(tcs.map((tc: any) => tc.tracker).filter(Boolean))] as string[];
    const singleTicket = reqs.length === 1 && reqs[0].redmineTicketId ? String(reqs[0].redmineTicketId).replace(/\D/g, "") : "";
    const sharedStory = [...new Set(tcs.map((tc: any) => tc.redmineUserStory).filter(Boolean))] as string[];
    setForm((f) => ({
      ...f,
      selectedModules: moduleIds,
      tracker: distinctTrackers.length === 1 ? distinctTrackers[0] : (distinctTrackers[0] ?? reqs[0]?.tracker ?? ""),
      ...(flags.ticket ? {} : {
        redmineTicketId: singleTicket || (flags.initial && sharedStory.length === 1 ? sharedStory[0].replace(/\D/g, "") : ""),
      }),
      ...(flags.milestone || lockProjectAndMilestone || !reqs[0]?.milestoneId ? {} : { milestoneId: String(reqs[0].milestoneId) }),
    }));
  };

  // Prefill from the selection each time the dialog opens: the requirements
  // the test cases belong to (all ticked), then modules, tracker, ticket and
  // milestone from them.
  useEffect(() => {
    if (!open) return;
    const first = selectedTestCases[0];
    if (!first) return;

    const byReq = new Map<string, ReqGroup>();
    for (const tc of selectedTestCases) {
      const key = tc.requirementId != null ? String(tc.requirementId) : "none";
      if (!byReq.has(key)) byReq.set(key, { key, requirementId: tc.requirementId ?? null, tcs: [], added: false, on: true });
      byReq.get(key)!.tcs.push(tc);
    }
    setForm({
      ...EMPTY_FORM,
      projectId: defaultProjectId ? String(defaultProjectId) : first.projectId ? String(first.projectId) : "",
      milestoneId: defaultMilestoneId ? String(defaultMilestoneId) : "",
    });
    setTitleTouched(false);
    setTicketTouched(false);
    setMilestoneTouched(false);
    applyGroups([...byReq.values()], { ticket: false, milestone: !!defaultMilestoneId, initial: true });
    setStep("mode");
    setTargetTicketId(null);
    setExistingSearch("");
    setExistingFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Milestone names for the first field and for the title's starting value.
  useEffect(() => {
    if (!open) return;
    fetch(`${getApiUrl()}/milestones?projectId=all`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setAllMilestones(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, [open, token]);

  const chosenMilestone = allMilestones.find((m) => String(m.id) === form.milestoneId) ?? null;
  useEffect(() => {
    if (!titleTouched && chosenMilestone) setForm((f) => (f.title === chosenMilestone.name ? f : { ...f, title: chosenMilestone.name }));
  }, [chosenMilestone?.id, chosenMilestone?.name, titleTouched]);

  const handleChooseExisting = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/execution-files`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setExistingFiles(await res.json());
    } catch {}
    setStep("existing");
  };

  const toggleGroup = (key: string, on: boolean) =>
    applyGroups(groups.map((g) => (g.key === key ? { ...g, on } : g)), { ticket: ticketTouched, milestone: milestoneTouched });

  const removeGroup = (key: string) =>
    applyGroups(groups.filter((g) => g.key !== key), { ticket: ticketTouched, milestone: milestoneTouched });

  // Search-and-add: the requirement comes with the test cases linked to it in the library.
  const addRequirement = async (id: number) => {
    if (groups.some((g) => g.requirementId === id)) return;
    setAddingReqId(id);
    let tcs: any[] = [];
    try {
      const res = await fetch(`${getApiUrl()}/requirements/${id}/test-cases`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const rows = await res.json();
        // The library endpoint names the pre-conditions field differently from the list.
        tcs = (Array.isArray(rows) ? rows : []).map((tc: any) => ({ ...tc, preconditions: tc.preCondition ?? tc.preconditions, requirementId: id }));
      }
    } catch {}
    applyGroups(
      [...groups, { key: String(id), requirementId: id, tcs, added: true, on: true }],
      { ticket: ticketTouched, milestone: milestoneTouched },
    );
    setAddingReqId(null);
  };

  const handleConfirm = async (submitForReview = false) => {
    const sourceTcs = step === "new" ? tickedTcs : selectedTestCases;
    const newRows = sourceTcs.map((tc: any) => ({
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
      let createdId: number | null = null;
      if (step === "new") {
        const selectedModuleNames = form.selectedModules
          .map((id) => modules.find((m: any) => m.id === id)?.name)
          .filter(Boolean) as string[];
        const projectId = chosenMilestone?.projectId ?? (form.projectId ? Number(form.projectId) : undefined);
        const createRes = await fetch(`${getApiUrl()}/execution-files`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            // Blank is allowed — the server mints an internal "INT-nnnn"
            // reference for runs that have no Redmine ticket behind them.
            redmineTicketId: form.redmineTicketId.trim() || undefined,
            title: form.title || undefined,
            remarks: form.remarks || undefined,
            selectedModules: selectedModuleNames.length ? selectedModuleNames.join(",") : undefined,
            selectedModuleIds: form.selectedModules.length ? form.selectedModules : undefined,
            tracker: form.tracker || undefined,
            projectId,
            // The file is filed under the first ticked requirement; every row keeps its own.
            requirementId: tickedReqIds[0] ?? undefined,
            milestoneId: form.milestoneId ? Number(form.milestoneId) : undefined,
            fileType: form.fileType,
          }),
        });
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${createRes.status}`);
        }
        const created = await createRes.json();
        ticketId = created.redmineTicketId;
        createdId = created.id ?? null;
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
              // Keep selectedModuleIds in sync with the name string — a new
              // module name with no matching row in `modules` (a genuine typo,
              // or one not yet in the catalog) just doesn't get an id added;
              // the name still merges in as before.
              const existingModuleIds: number[] = Array.isArray(existingFile.selectedModuleIds) ? existingFile.selectedModuleIds : [];
              const newModuleIds = newModuleNames
                .map((name) => modules.find((m: any) => m.name === name)?.id)
                .filter((id): id is number => typeof id === "number");
              const mergedIds = [...new Set([...existingModuleIds, ...newModuleIds])];
              if (merged.length !== existingModules.length || mergedIds.length !== existingModuleIds.length) {
                await fetch(`${getApiUrl()}/execution-files/${existingFile.id}`, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify({ selectedModules: merged.join(","), selectedModuleIds: mergedIds }),
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

      // Submit to Review: the same action as the file menu. A failure leaves the draft in place.
      let submitError: string | null = null;
      if (submitForReview && createdId != null) {
        const subRes = await fetch(`${getApiUrl()}/execution-files/${createdId}/review`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "submit" }),
        });
        if (!subRes.ok) submitError = (await subRes.json().catch(() => ({}))).error ?? `Server error ${subRes.status}`;
      }
      if (submitError) {
        toast({ variant: "destructive", title: "Compiled as a draft, but not submitted", description: submitError });
      } else {
        toast({
          title: `${count} test case${count !== 1 ? "s" : ""} compiled into #${ticketId}`,
          description: step === "new" ? (submitForReview ? "Submitted for review." : "Saved as a draft.") : undefined,
        });
      }
      onOpenChange(false);
      onCompiled(String(ticketId));
    } catch (err: any) {
      toast({ variant: "destructive", title: "Compile failed", description: String(err?.message ?? err) });
    } finally {
      setIsCompiling(false);
    }
  };

  const hasRequirement = tickedReqIds.length > 0;
  const canCompileNew = !!form.milestoneId && hasRequirement && tickedTcs.length > 0;
  const newWhy = !form.milestoneId ? "Choose a milestone."
    : !hasRequirement ? "Tick at least one requirement."
    : tickedTcs.length === 0 ? "The ticked requirements have no test cases to add."
    : "";

  const projectName = projects.find((p: any) => String(p.id) === String(chosenMilestone?.projectId ?? form.projectId))?.name;
  const primaryReq = reqById(tickedReqIds[0] ?? null);
  const addOptions = (requirements as any[])
    .filter((r: any) => !groups.some((g) => g.requirementId === r.id))
    .map((r: any) => ({
      value: String(r.id),
      label: r.title,
      keywords: r.redmineTicketId ?? undefined,
      badge: form.milestoneId && r.milestoneId && String(r.milestoneId) !== form.milestoneId ? "Other milestone" : undefined,
    }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onOpenChange(false); setStep("mode"); setTargetTicketId(null); } }}>
      <DialogContent className="sm:max-w-[560px] w-[95vw] flex flex-col max-h-[90vh]">
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
                Compiling <strong>{selectedTestCases.length}</strong> test case{selectedTestCases.length !== 1 ? "s" : ""} into an execution file.
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
                  Selected: <span className="font-medium text-foreground">#{targetTicketId}</span>. The file keeps its review state.
                </p>
              )}
            </div>
          )}

          {step === "new" && (
            <div className="space-y-4">
              {/* Milestone first (required); locked when compiling from a pipeline */}
              {lockProjectAndMilestone ? (
                <div className="space-y-1">
                  <Label>Milestone</Label>
                  <p className="text-sm px-3 py-2 rounded-md bg-muted/50 border">
                    {chosenMilestone?.name ?? "—"}
                    <span className="text-xs text-muted-foreground ml-2">(from this pipeline)</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Milestone <span className="text-destructive">*</span></Label>
                  <SearchableSelect
                    value={form.milestoneId}
                    onValueChange={(v) => { setMilestoneTouched(true); setForm({ ...form, milestoneId: v }); }}
                    options={allMilestones.map((m) => ({ value: String(m.id), label: m.projectName ? `${m.name} (${m.projectName})` : m.name }))}
                    placeholder="Select milestone..."
                    searchPlaceholder="Search milestones..."
                  />
                  <p className="text-xs text-muted-foreground">Starts at the first ticked requirement's milestone.</p>
                </div>
              )}

              {/* Requirements the selected test cases belong to, all ticked */}
              <div className="space-y-2">
                <Label>
                  Requirements <span className="text-destructive">*</span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">from the selected test cases</span>
                </Label>
                <div className="border rounded-md p-1.5 space-y-0.5">
                  {groups.map((g) => {
                    const r = reqById(g.requirementId);
                    const otherMs = r && form.milestoneId && r.milestoneId && String(r.milestoneId) !== form.milestoneId;
                    return (
                      <label key={g.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                        <input type="checkbox" className="rounded border-gray-300" checked={g.on} onChange={(e) => toggleGroup(g.key, e.target.checked)} />
                        <span className="flex-1 min-w-0 truncate">
                          {r ? r.title : <em className="text-muted-foreground">No requirement</em>}
                          {r?.redmineTicketId && <span className="ml-1.5 text-xs text-muted-foreground">#{r.redmineTicketId}</span>}
                        </span>
                        {otherMs && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">another milestone</Badge>}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {g.tcs.length} test case{g.tcs.length !== 1 ? "s" : ""}{g.added ? (g.tcs.length ? " from the library" : ", link only") : ""}
                        </span>
                        {g.added && (
                          <button type="button" aria-label="Remove requirement" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.preventDefault(); removeGroup(g.key); }}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      value=""
                      onValueChange={(v) => addRequirement(Number(v))}
                      options={addOptions}
                      disabled={addingReqId != null}
                      placeholder="Add another requirement..."
                      searchPlaceholder="Search by title or Redmine ID..."
                    />
                  </div>
                  {addingReqId != null && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Untick a requirement to leave its test cases out. An added requirement brings the test cases linked to it in the library.
                  {primaryReq && tickedReqIds.length > 1 && ` The file is filed under "${primaryReq.title}"; every test case keeps its own requirement.`}
                </p>
              </div>

              <div className="space-y-1">
                <Label>Project <span className="text-xs text-muted-foreground font-normal">(read-only)</span></Label>
                <p className="text-sm px-3 py-2 rounded-md bg-muted/50 border min-h-[2.25rem]">
                  {projectName ?? <span className="text-muted-foreground">Filled from the milestone</span>}
                </p>
              </div>

              <div className="space-y-1">
                <Label>Module</Label>
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
                  <p className="text-xs text-muted-foreground">{form.selectedModules.length} module(s) selected, from the test cases. You can change them.</p>
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

              {/* A pipeline's Step 3 files are always System Testing, so the choice is only offered elsewhere. */}
              {!lockProjectAndMilestone && (
                <div className="space-y-1">
                  <Label>File type</Label>
                  <div className="flex gap-2">
                    {[{ v: "qa", label: "System Testing" }, { v: "sit", label: "SIT" }, { v: "uat", label: "UAT" }].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setForm({ ...form, fileType: opt.v })}
                        className={`flex-1 rounded border py-2 text-sm font-medium transition-colors ${form.fileType === opt.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => { setTitleTouched(true); setForm({ ...form, title: e.target.value }); }} />
                <p className="text-xs text-muted-foreground">Starts as the milestone name. You can change it.</p>
              </div>
              <div className="space-y-1">
                <Label>Redmine Ticket ID <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Input
                  placeholder="e.g. 38032"
                  value={form.redmineTicketId}
                  onChange={(e) => { setTicketTouched(true); setForm({ ...form, redmineTicketId: e.target.value.replace(/\D/g, "") }); }}
                />
                <p className="text-xs text-muted-foreground">
                  {form.redmineTicketId.trim()
                    ? "Filled from the requirement. You can clear or change it."
                    : tickedReqIds.length > 1
                      ? "Several requirements, so none is filled. Enter the ticket this file belongs to, or leave blank for an internal reference."
                      : "Left blank, the file gets an internal INT- reference."}
                </p>
              </div>
              <div className="space-y-1">
                <Label>Remarks</Label>
                <Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>
              <p className="rounded-md bg-primary/5 px-3 py-2 text-sm">
                {tickedTcs.length} test case{tickedTcs.length !== 1 ? "s" : ""} will be added to the new file.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-3 gap-2 sm:items-center">
          {step === "new" && newWhy && <span className="mr-auto text-xs text-muted-foreground">{newWhy}</span>}
          {step !== "mode" && (
            <Button variant="ghost" onClick={() => { setStep("mode"); setTargetTicketId(null); }} disabled={isCompiling}>
              Back
            </Button>
          )}
          <Button variant={step === "mode" ? "ghost" : "outline"} onClick={() => onOpenChange(false)} disabled={isCompiling}>
            Cancel
          </Button>
          {step === "existing" && (
            <Button onClick={() => handleConfirm(false)} disabled={!targetTicketId || isCompiling} className="gap-2">
              {isCompiling
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling...</>
                : <><PackagePlus className="w-4 h-4" /> Compile {count} test case{count !== 1 ? "s" : ""}</>
              }
            </Button>
          )}
          {step === "new" && (
            <>
              <Button variant="outline" onClick={() => handleConfirm(false)} disabled={!canCompileNew || isCompiling}>
                {isCompiling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as Draft"}
              </Button>
              <Button onClick={() => handleConfirm(true)} disabled={!canCompileNew || isCompiling}>
                Submit to Review
              </Button>
            </>
          )}
        </DialogFooter>
        <ProgressDialog
          open={isCompiling}
          title={step === "new" ? "Creating the execution file" : "Compiling test cases"}
          message={`Adding ${count} test case${count !== 1 ? "s" : ""}${step === "new" ? " to the new file" : " to the file"}.`}
          hint="This can take a few seconds"
        />
      </DialogContent>
    </Dialog>
  );
}
