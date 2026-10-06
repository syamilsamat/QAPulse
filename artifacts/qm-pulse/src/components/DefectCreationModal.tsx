import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { AttachmentFileList } from "@/components/AttachmentFileList";
import { Label } from "@/components/ui/label";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { numberTestSteps } from "@/lib/test-steps";
import { useAuth } from "@/contexts/AuthContext";
import { DefectCategoryField } from "@/components/DefectCategoryField";
import { DefectContextFields } from "@/components/DefectContextFields";
import { useDefectContext, firstModule } from "@/lib/defect-context";
import { useAssignableContacts, assigneeOptions } from "@/lib/use-assignable-contacts";
import { FOUND_IN_OPTIONS, foundInForFileType } from "@/lib/defect-found-in";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, Upload, X, ExternalLink, AlertCircle, Link2,
} from "lucide-react";
import {
  fetchRedmineProjects,
  fetchRedmineProjectConfig,
  fetchRedmineTrackers,
  searchRedmineIssues,
  fetchRedmineIssueRoot,
  createRedmineDefect,
  registerLocalDefect,
  type RedmineProjectItem,
  type RedmineProjectConfigItem,
  type RedmineTracker,
  type RedmineIssueMatch,
  type RedmineMember,
} from "@/lib/execution-api";

const COMPLEXITY_OPTIONS = ["S", "M", "L", "XL"];

export interface DefectCreationResult {
  redmineIssueId: string;
  actualResult: string;
  screenshots: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDefectCreated: (result: DefectCreationResult) => void;
  testCaseName: string;
  testSteps?: string;
  moduleName?: string;
  projectId?: number | null;
  testCaseId?: string;
  expectedResult?: string;
  parentIssueId?: string | number | null;
  onSkip?: () => void;
  // CR019: DB id of the execution row that failed — links the local defect record
  executionTcId?: number | null;
  // CR105: what the failed test case already knows, so the QM Pulse fields start filled in
  requirementId?: number | null;
  milestoneId?: number | null;
  /** QA, SIT or UAT: decides the starting "Found in". */
  fileType?: string | null;
}

export default function DefectCreationModal({
  open,
  onClose,
  onDefectCreated,
  testCaseName,
  testSteps,
  moduleName,
  projectId,
  testCaseId,
  expectedResult,
  parentIssueId,
  onSkip,
  executionTcId,
  requirementId,
  milestoneId,
  fileType,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  // Display-only mirror of the server's getRoleDepartment() — the actual
  // value sent to Redmine is always derived from the reporter's role there,
  // never from this. admin/cto have no department and send nothing.
  const reporterDepartment = user?.role?.startsWith("hod_")
    ? user.role.slice(4)
    : ["qa", "dev", "fa", "pm"].find((d) => user?.role?.startsWith(`${d}_`)) ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The last subject this component generated. Anything else in the field is
  // the user's own wording and must survive the ancestry lookup landing.
  const autoSubjectRef = useRef("");
  const subjectFor = (issueId: string | number | null | undefined) =>
    `${issueId ? `#${issueId} - ` : ""}[${testCaseId ?? ""}] ${testCaseName}`;

  const [expectedResultValue, setExpectedResultValue] = useState(expectedResult ?? "");
  const [stepsToReproduce, setStepsToReproduce] = useState(numberTestSteps(testSteps));
  const [actualResult, setActualResult] = useState("");
  const [screenshots, setScreenshots] = useState<{ filename: string; contentType: string; base64: string; description?: string }[]>([]);
  const [defectDescription, setDefectDescription] = useState("");

  // Redmine form fields
  const [projects, setProjects] = useState<RedmineProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectConfig, setProjectConfig] = useState<RedmineProjectConfigItem | null>(null);
  const [trackers, setTrackers] = useState<RedmineTracker[]>([]);
  const [qaDefectTrackerId, setQaDefectTrackerId] = useState<number | null>(null);
  const { members, loadError, loading, reload } = useAssignableContacts(open);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [complexity, setComplexity] = useState("M");
  const [targetedStartDate, setTargetedStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [targetedCompletionDate, setTargetedCompletionDate] = useState("");

  // QM Pulse fields
  const [severity, setSeverity] = useState("medium");
  const [foundIn, setFoundIn] = useState(foundInForFileType(fileType));
  // CR105 — project, milestone, module and requirement fill each other in.
  const dc = useDefectContext(open);
  const startingContext = () => ({ projectId: projectId ?? null, milestoneId: milestoneId ?? null, requirementId: requirementId ?? null, module: firstModule(moduleName) });
  const [defectCategory, setDefectCategory] = useState("");

  // Duplicate check
  const [duplicates, setDuplicates] = useState<RedmineIssueMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [linkedIssueId, setLinkedIssueId] = useState<number | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  // CR115 — after a defect is created, ask whether to keep going instead of closing.
  const [createdPrompt, setCreatedPrompt] = useState<{ id: number } | null>(null);

  // Load projects + trackers on open
  useEffect(() => {
    if (!open) return;
    setExpectedResultValue(expectedResult ?? "");
    setStepsToReproduce(numberTestSteps(testSteps));
    dc.reset(startingContext());
    setFoundIn(foundInForFileType(fileType));
    setDefectDescription("");
    setActualResult("");
    setScreenshots([]);
    // Default the subject to the test case's own name — the user can still
    // edit it manually below.
    //
    // The prefix names the TOP of the Redmine tree, not the ticket this test
    // case links to. QA links cases to the leaf User Story (#40046), but that
    // leaf hangs under the ticket the run is reported against
    // (#40046 -> #40044 -> #40054), so titling the defect "#40046 - ..." named
    // a ticket nobody tracks the run by. The leaf is used until the walk
    // comes back, so the field is never empty while Redmine is answering, and
    // the defect still nests under the leaf — only the title changes.
    const fallback = subjectFor(parentIssueId);
    autoSubjectRef.current = fallback;
    setSubject(fallback);
    let cancelled = false;
    if (parentIssueId) {
      fetchRedmineIssueRoot(parentIssueId)
        .then((ancestry) => {
          if (cancelled || !ancestry || ancestry.rootId === Number(parentIssueId)) return;
          const resolved = subjectFor(ancestry.rootId);
          // Only replace a subject the user has not typed over themselves.
          setSubject((current) => (current === autoSubjectRef.current ? resolved : current));
          autoSubjectRef.current = resolved;
        })
        .catch(() => {});
    }
    fetchRedmineProjects().then(setProjects).catch(() => {});
    fetchRedmineTrackers()
      .then((list) => {
        setTrackers(list);
        const qa = list.find((t) => t.name.toLowerCase().includes("qa defect") || t.name.toLowerCase().includes("defect"));
        setQaDefectTrackerId(qa?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, expectedResult, testCaseName, testCaseId, parentIssueId, testSteps, moduleName, projectId]);

  // Load project config when project changes. The assignee list deliberately
  // does NOT reload here: it used to come from the selected project's Redmine
  // memberships, which silently excluded anyone whose membership sits on a
  // sub-project (an issue filed under "FWCMS » Tech Refresh » eVDR Operator
  // Portal" is not a membership of "FWCMS") or is granted through a group.
  // It now lists the full contact directory, which is the set QA actually
  // picks from.
  useEffect(() => {
    if (!selectedProjectId) { setProjectConfig(null); return; }
    fetchRedmineProjectConfig(selectedProjectId).then(setProjectConfig).catch(() => {});
  }, [selectedProjectId]);

  // Auto-search duplicates when project + subject are ready
  useEffect(() => {
    if (!selectedProjectId || !subject.trim()) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchRedmineIssues(subject, selectedProjectId);
        setDuplicates(results);
      } catch {
        setDuplicates([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedProjectId, subject]);

  // Custom fields this form collects that have no Redmine field id configured.
  // Source is excluded: it is only rendered when its field id exists.
  const unmappedCustomFields = [
    !projectConfig?.complexityFieldId ? "Complexity" : null,
    !projectConfig?.targetedStartDateFieldId ? "Targeted Start Date" : null,
    !projectConfig?.targetedCompletionDateFieldId ? "Targeted Completion Date" : null,
  ].filter((label): label is string => label !== null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: "destructive", title: `${file.name} exceeds 5MB limit` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        setScreenshots((prev) => [
          ...prev,
          { filename: file.name, contentType: file.type, base64 },
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const buildDescription = () => {
    let desc = "";
    // No "Description:" heading here — Redmine renders one above the field,
    // and repeating it showed the word twice on every defect.
    if (defectDescription.trim()) desc += `${defectDescription.trim()}\n\n`;
    // Numbered the same way the execution sheet numbers them, so a developer
    // reading the ticket and a tester reading the sheet mean the same thing by
    // "step 2". numberTestSteps strips whatever numbering the author typed
    // before applying its own, so this never doubles up.
    const numberedSteps = numberTestSteps(stepsToReproduce);
    if (numberedSteps) desc += `**Steps to Reproduce:**\n${numberedSteps}\n\n`;
    if (expectedResultValue.trim()) desc += `**Expected Result:**\n${expectedResultValue.trim()}\n\n`;
    if (actualResult.trim()) desc += `**Actual Result:**\n${actualResult.trim()}\n\n`;
    if (testCaseId) desc += `**Test Case ID:** ${testCaseId}`;
    return desc.trim();
  };

  const handleLinkExisting = (issue: RedmineIssueMatch) => {
    setLinkedIssueId(issue.id);
    // CR019: record locally so the Defects page tracks it (best-effort)
    registerLocalDefect({
      redmineId: issue.id.toString(),
      title: issue.subject,
      description: defectDescription.trim() || undefined,
      stepsToReproduce: stepsToReproduce.trim() || undefined,
      expectedResult: expectedResultValue.trim() || undefined,
      projectId: dc.state.ctx.projectId,
      milestoneId: dc.state.ctx.milestoneId,
      requirementId: dc.state.ctx.requirementId,
      foundIn,
      actualResult,
      severity,
      module: dc.state.ctx.module.trim() || undefined,
      defectCategory: defectCategory || undefined,
      executionTcId: executionTcId ?? null,
    }).catch(() => {});
    onDefectCreated({
      redmineIssueId: issue.id.toString(),
      actualResult,
      screenshots: JSON.stringify(screenshots.map((s) => s.filename)),
    });
    handleClose();
  };

  const handleSubmit = async () => {
    if (!defectDescription.trim()) {
      toast({ variant: "destructive", title: "Description is required" });
      return;
    }
    if (!expectedResultValue.trim()) {
      toast({ variant: "destructive", title: "Expected Result is required" });
      return;
    }
    if (!actualResult.trim()) {
      toast({ variant: "destructive", title: "Actual Result is required" });
      return;
    }
    if (!subject.trim()) {
      toast({ variant: "destructive", title: "Subject is required" });
      return;
    }
    if (!selectedProjectId) {
      toast({ variant: "destructive", title: "Please select a Redmine project" });
      return;
    }
    if (!selectedAssigneeId) {
      toast({ variant: "destructive", title: "Assignee is required" });
      return;
    }
    if (!targetedStartDate) {
      toast({ variant: "destructive", title: "Targeted Start Date is required" });
      return;
    }
    if (!targetedCompletionDate) {
      toast({ variant: "destructive", title: "Targeted Completion Date is required" });
      return;
    }
    if (!qaDefectTrackerId) {
      toast({ variant: "destructive", title: "No tracker found. Check Redmine connection." });
      return;
    }

    setIsSubmitting(true);
    try {
      const parentId = parentIssueId ? Number(parentIssueId) : null;
      const result = await createRedmineDefect({
        projectId: selectedProjectId,
        trackerId: qaDefectTrackerId,
        subject: subject.trim(),
        description: buildDescription(),
        parentIssueId: parentId && !isNaN(parentId) ? parentId : null,
        assigneeId: selectedAssigneeId,
        complexityFieldId: projectConfig?.complexityFieldId,
        complexityValue: complexity,
        targetedStartDateFieldId: projectConfig?.targetedStartDateFieldId,
        targetedStartDate,
        targetedCompletionDateFieldId: projectConfig?.targetedCompletionDateFieldId,
        targetedCompletionDate: targetedCompletionDate || undefined,
        sourceFieldId: projectConfig?.sourceFieldId,
        uploads: screenshots,
      });

      toast({
        title: `Defect #${result.id} created in Redmine`,
        description: [
          // Either the project doesn't have those fields enabled, or a field id
          // in the project's Redmine config points at a different field than
          // it should. Redmine's own words separate the two, so pass them on
          // rather than guessing on the reporter's behalf.
          result.customFieldsDropped
            ? [
                "The defect was filed, but some fields couldn't be saved with it.",
                // When the server pinned it to a specific setting, say which —
                // "Redmine rejected a field" sends people hunting; a setting
                // name and the id it holds is a one-line fix.
                result.misconfiguredFields?.length
                  ? `${result.misconfiguredFields.join("; ")}. Fix it in Configuration → Redmine Integration.`
                  : result.customFieldErrors?.length
                    ? `Redmine said: ${result.customFieldErrors.join("; ")}. Check the custom field IDs in Configuration → Redmine Integration.`
                    : "Check the custom field IDs in Configuration → Redmine Integration.",
              ].filter(Boolean).join(" ")
            : null,
          // The defect exists but hangs off nothing, so whoever triages it needs
          // to know to parent it by hand rather than assume the link is there.
          result.parentDropped ?? null,
        ].filter(Boolean).join(" ") || undefined,
      });
      // CR019: record locally so the Defects page tracks it (best-effort)
      registerLocalDefect({
        redmineId: result.id.toString(),
        title: subject.trim(),
        description: defectDescription.trim() || undefined,
        stepsToReproduce: stepsToReproduce.trim() || undefined,
        projectId: dc.state.ctx.projectId,
        milestoneId: dc.state.ctx.milestoneId,
        requirementId: dc.state.ctx.requirementId,
        foundIn,
        expectedResult: expectedResultValue.trim() || undefined,
        actualResult: actualResult.trim() || undefined,
        severity,
        module: dc.state.ctx.module.trim() || undefined,
        defectCategory: defectCategory || undefined,
        executionTcId: executionTcId ?? null,
        assigneeName: members.find((m) => m.id === selectedAssigneeId)?.name,
        assigneeUserId: members.find((m) => m.id === selectedAssigneeId)?.userId ?? undefined,
        tracker: trackers.find((t) => t.id === qaDefectTrackerId)?.name,
      }).catch(() => {});
      onDefectCreated({
        redmineIssueId: result.id.toString(),
        actualResult,
        screenshots: JSON.stringify(screenshots.map((s) => s.filename)),
      });
      setCreatedPrompt({ id: result.id });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // "Create another": the next defect keeps the project, assignee, tracker, dates,
  // severity and QM Pulse context; what belongs to the last defect is cleared.
  const startAnother = () => {
    setCreatedPrompt(null);
    setDefectDescription("");
    setActualResult("");
    setScreenshots([]);
    autoSubjectRef.current = "\u0000cleared";
    setSubject("");
    setDuplicates([]);
    setLinkedIssueId(null);
  };

  const finishCreating = () => {
    setCreatedPrompt(null);
    handleClose();
  };

  const handleClose = () => {
    setExpectedResultValue(expectedResult ?? "");
    setStepsToReproduce(numberTestSteps(testSteps));
    setActualResult("");
    setDefectDescription("");
    setScreenshots([]);
    setSelectedProjectId(null);
    setProjectConfig(null);
    setSelectedAssigneeId(null);
    setComplexity("M");
    setTargetedCompletionDate("");
    setDuplicates([]);
    setLinkedIssueId(null);
    setSeverity("medium");
    setFoundIn(foundInForFileType(fileType));
    setDefectCategory("");
    dc.reset(startingContext());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[75vw] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Create Defect
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description */}
          <div className="space-y-1.5">
            <Label>
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Describe the defect you encountered..."
              value={defectDescription}
              onChange={(e) => setDefectDescription(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defect-steps-to-reproduce">Steps to Reproduce</Label>
            <Textarea
              id="defect-steps-to-reproduce"
              placeholder="Enter the steps to reproduce the defect..."
              value={stepsToReproduce}
              onChange={(e) => setStepsToReproduce(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          {/* Expected Result */}
          <div className="space-y-1.5">
            <Label>Expected Result <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Describe the expected behaviour..."
              value={expectedResultValue}
              onChange={(e) => setExpectedResultValue(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          {/* Actual Result */}
          <div className="space-y-1.5">
            <Label>
              Actual Result <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Describe what actually happened..."
              value={actualResult}
              onChange={(e) => setActualResult(e.target.value)}
              className="min-h-[70px]"
            />
          </div>

          {/* Screenshots */}
          <div className="space-y-1.5">
            <Label>Screenshots</Label>
            <AttachmentFileList files={screenshots} onChange={setScreenshots} />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3" /> Add Screenshot
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <Separator />

          {/* QM Pulse Fields: Project, Milestone, Module, Requirement, then Severity, Found in, Category. All optional. */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QM Pulse <span className="font-normal normal-case tracking-normal">(all optional)</span></p>
            <DefectContextFields dc={dc} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical", "high", "medium", "low"].map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Found in</Label>
                <Select value={foundIn} onValueChange={setFoundIn}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FOUND_IN_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Starts at the phase of this execution file. You can change it.</p>
              </div>
            </div>
            <DefectCategoryField value={defectCategory} onChange={setDefectCategory} />
          </div>

          <Separator />

          {/* Redmine Fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Redmine Issue</p>

            {projectConfig?.sourceFieldId && (
              <ReadOnlyField
                label="Source"
                hint="from your role"
                value={reporterDepartment ? reporterDepartment.toUpperCase() : undefined}
                placeholder="Not set for your role"
              />
            )}

            <div className="space-y-1.5">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Redmine Project <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={selectedProjectId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedProjectId(Number(v))}
                  // Redmine allows several projects to share a display name
                  // (FWCMS has a few), which made them indistinguishable here
                  // and made the list look duplicated. The identifier is the
                  // unique one, so show it and let the search match on it —
                  // that also keeps each item's cmdk value distinct.
                  options={projects.map((p) => ({
                    value: p.redmineId.toString(),
                    label: p.name,
                    badge: p.identifier,
                    keywords: `${p.identifier} ${p.redmineId}`,
                  }))}
                  placeholder="Select project..."
                  searchPlaceholder="Search project..."
                />
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No projects cached — sync from Settings first.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Tracker <span className="text-destructive">*</span></Label>
                <Select
                  value={qaDefectTrackerId?.toString() ?? ""}
                  onValueChange={(v) => setQaDefectTrackerId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tracker..." />
                  </SelectTrigger>
                  <SelectContent>
                    {trackers.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assignee <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={selectedAssigneeId?.toString() ?? ""}
                onValueChange={(v) => setSelectedAssigneeId(v ? Number(v) : null)}
                options={assigneeOptions(members)}
                placeholder="Select assignee..."
                searchPlaceholder="Search assignee..."
                emptyText="No contacts found."
              />
              {loadError ? (
                <p className="text-xs text-destructive">
                  {loadError}.{" "}
                  <button type="button" className="underline" onClick={reload}>Retry</button>
                </p>
              ) : !loading && members.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No contacts synced yet. Run Sync in Configuration → Contacts.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Complexity</Label>
                <SearchableSelect
                  value={complexity}
                  onValueChange={setComplexity}
                  options={COMPLEXITY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1.5">
                {/* Required by QA's own flow, not just by Redmine: both
                    Targeted dates are filled on every QA defect. Actual
                    Start/Completion Date are dev-side and stay empty here. */}
                <Label>Targeted Start Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={targetedStartDate}
                  onChange={(e) => setTargetedStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Targeted Completion Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={targetedCompletionDate}
                  onChange={(e) => setTargetedCompletionDate(e.target.value)}
                />
              </div>
            </div>

            {/* Checked per field, not just "is there a config row". A config
                that exists but leaves a field id blank sends nothing for that
                field, and Redmine rejects the whole issue with "<field> cannot
                be blank" — which reads as if the form were empty when it is
                visibly filled in. Say which ones up front. */}
            {selectedProjectId && unmappedCustomFields.length > 0 && (
              <p className="text-xs text-amber-600">
                {unmappedCustomFields.join(", ")} {unmappedCustomFields.length === 1 ? "has" : "have"} no
                Redmine field mapping, so {unmappedCustomFields.length === 1 ? "it won't be" : "they won't be"} sent.
                If the tracker requires {unmappedCustomFields.length === 1 ? "it" : "them"}, Redmine will reject
                this issue — map {unmappedCustomFields.length === 1 ? "it" : "them"} in Configuration → Redmine Integration.
              </p>
            )}
          </div>

          {/* Duplicate Check */}
          {selectedProjectId && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Search className="w-3.5 h-3.5" />
                  Similar Open Issues
                  {isSearching && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>

                {duplicates.length === 0 && !isSearching && (
                  <p className="text-xs text-muted-foreground">No similar open issues found.</p>
                )}

                {duplicates.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-center justify-between p-2 border rounded-md text-xs gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-primary mr-2">#{issue.id}</span>
                      <span className="truncate">{issue.subject}</span>
                      <span className="ml-2 text-muted-foreground">
                        [{issue.status?.name}] {issue.project?.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 h-6 text-xs shrink-0"
                      onClick={() => handleLinkExisting(issue)}
                    >
                      <Link2 className="w-3 h-3" /> Link
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {onSkip && (
            <Button variant="outline" onClick={onSkip} disabled={isSubmitting}>
              Skip for now
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
            ) : (
              <><ExternalLink className="w-4 h-4" /> Create</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!createdPrompt} onOpenChange={(v) => { if (!v) finishCreating(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Defect #{createdPrompt?.id} created</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to keep creating defects? The next one keeps the project, assignee, tracker, dates and severity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={finishCreating}>Close</Button>
            <Button onClick={startAnother}>Create another</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
