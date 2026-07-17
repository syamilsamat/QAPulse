import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { DefectCategoryField } from "@/components/DefectCategoryField";
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
  fetchRedmineProjectMembers,
  searchRedmineIssues,
  createRedmineDefect,
  registerLocalDefect,
  fetchQapulseProjects,
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
  stepName?: string;
  testCaseId?: string;
  expectedResult?: string;
  parentIssueId?: string | number | null;
  onSkip?: () => void;
  // CR019: DB id of the execution row that failed — links the local defect record
  executionTcId?: number | null;
}

export default function DefectCreationModal({
  open,
  onClose,
  onDefectCreated,
  testCaseName,
  stepName,
  testCaseId,
  expectedResult,
  parentIssueId,
  onSkip,
  executionTcId,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canSetCategory = ((user as any)?.tierRank ?? 1) >= 2;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scope, setScope] = useState<"step" | "testcase">("testcase");
  const [expectedResultValue, setExpectedResultValue] = useState(expectedResult ?? "");
  const [actualResult, setActualResult] = useState("");
  const [screenshots, setScreenshots] = useState<{ filename: string; contentType: string; base64: string }[]>([]);
  const [defectDescription, setDefectDescription] = useState("");

  // Redmine form fields
  const [projects, setProjects] = useState<RedmineProjectItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectConfig, setProjectConfig] = useState<RedmineProjectConfigItem | null>(null);
  const [trackers, setTrackers] = useState<RedmineTracker[]>([]);
  const [qaDefectTrackerId, setQaDefectTrackerId] = useState<number | null>(null);
  const [members, setMembers] = useState<RedmineMember[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [complexity, setComplexity] = useState("M");
  const [targetedStartDate, setTargetedStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [targetedCompletionDate, setTargetedCompletionDate] = useState("");

  // QMPulse fields
  const [severity, setSeverity] = useState("medium");
  const [foundIn, setFoundIn] = useState("SIT");
  const [defectModule, setDefectModule] = useState("");
  const [defectCategory, setDefectCategory] = useState("");
  const [qapulseProjectId, setQapulseProjectId] = useState<number | null>(null);
  const [qapulseProjects, setQapulseProjects] = useState<{ id: number; name: string }[]>([]);

  // Duplicate check
  const [duplicates, setDuplicates] = useState<RedmineIssueMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [linkedIssueId, setLinkedIssueId] = useState<number | null>(null);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load projects + trackers on open
  useEffect(() => {
    if (!open) return;
    setExpectedResultValue(expectedResult ?? "");
    fetchQapulseProjects().then(setQapulseProjects).catch(() => {});
    fetchRedmineProjects().then(setProjects).catch(() => {});
    fetchRedmineTrackers()
      .then((list) => {
        setTrackers(list);
        const qa = list.find((t) => t.name.toLowerCase().includes("qa defect") || t.name.toLowerCase().includes("defect"));
        setQaDefectTrackerId(qa?.id ?? list[0]?.id ?? null);
      })
      .catch(() => {});
  }, [open, expectedResult]);

  // Auto-generate subject from scope
  useEffect(() => {
    const prefix = parentIssueId ? `#${parentIssueId} - ` : "";
    if (scope === "step" && stepName) {
      setSubject(`${prefix}[${testCaseId ?? ""}] ${testCaseName} - ${stepName}`);
    } else {
      setSubject(`${prefix}[${testCaseId ?? ""}] ${testCaseName}`);
    }
  }, [scope, testCaseName, stepName, testCaseId, parentIssueId]);

  // Load project config + members when project changes
  useEffect(() => {
    if (!selectedProjectId) { setProjectConfig(null); setMembers([]); setSelectedAssigneeId(null); return; }
    fetchRedmineProjectConfig(selectedProjectId).then(setProjectConfig).catch(() => {});
    fetchRedmineProjectMembers(selectedProjectId).then(setMembers).catch(() => {});
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
    if (defectDescription.trim()) desc += `${defectDescription.trim()}\n\n`;
    if (expectedResultValue.trim()) desc += `**Expected Result:**\n${expectedResultValue.trim()}\n\n`;
    if (actualResult) desc += `**Actual Result:**\n${actualResult}\n\n`;
    if (testCaseId) desc += `**Test Case ID:** ${testCaseId}`;
    return desc.trim();
  };

  const handleLinkExisting = (issue: RedmineIssueMatch) => {
    setLinkedIssueId(issue.id);
    // CR019: record locally so the Defects page tracks it (best-effort)
    registerLocalDefect({
      redmineId: issue.id.toString(),
      title: issue.subject,
      actualResult,
      severity,
      module: defectModule.trim() || undefined,
      defectCategory: defectCategory || undefined,
      executionTcId: executionTcId ?? null,
    }).catch(() => {});
    onDefectCreated({
      redmineIssueId: issue.id.toString(),
      actualResult,
      screenshots: JSON.stringify(screenshots.map((s) => s.filename)),
    });
    onClose();
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
        uploads: screenshots,
      });

      toast({ title: `Defect #${result.id} created in Redmine` });
      // CR019: record locally so the Defects page tracks it (best-effort)
      registerLocalDefect({
        redmineId: result.id.toString(),
        title: subject.trim(),
        description: defectDescription.trim() || undefined,
        expectedResult: expectedResultValue.trim() || undefined,
        actualResult: actualResult.trim() || undefined,
        severity,
        module: defectModule.trim() || undefined,
        defectCategory: defectCategory || undefined,
        executionTcId: executionTcId ?? null,
        assigneeName: members.find((m) => m.id === selectedAssigneeId)?.name,
      }).catch(() => {});
      onDefectCreated({
        redmineIssueId: result.id.toString(),
        actualResult,
        screenshots: JSON.stringify(screenshots.map((s) => s.filename)),
      });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setExpectedResultValue(expectedResult ?? "");
    setActualResult("");
    setDefectDescription("");
    setScreenshots([]);
    setSelectedProjectId(null);
    setProjectConfig(null);
    setMembers([]);
    setSelectedAssigneeId(null);
    setComplexity("M");
    setTargetedCompletionDate("");
    setDuplicates([]);
    setLinkedIssueId(null);
    setSeverity("medium");
    setFoundIn("SIT");
    setDefectModule("");
    setDefectCategory("");
    setQapulseProjectId(null);
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
          {/* Scope toggle */}
          <div className="space-y-1.5">
            <Label>Defect Scope</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={scope === "testcase" ? "default" : "outline"}
                onClick={() => setScope("testcase")}
              >
                Entire Test Case
              </Button>
              <Button
                size="sm"
                variant={scope === "step" ? "default" : "outline"}
                onClick={() => setScope("step")}
                disabled={!stepName}
              >
                This Step Only
              </Button>
            </div>
          </div>

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
            <div className="flex flex-wrap gap-2">
              {screenshots.map((s, i) => (
                <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                  <span className="max-w-[120px] truncate">{s.filename}</span>
                  <button onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
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

          {/* QMPulse Fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">QMPulse</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["critical", "high", "medium", "low"].map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Found in</Label>
                <Select value={foundIn} onValueChange={setFoundIn}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SIT", "UAT", "Production"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Input value={defectModule} onChange={(e) => setDefectModule(e.target.value)} placeholder="e.g. Authentication" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>QMPulse Project</Label>
              <SearchableSelect
                value={qapulseProjectId?.toString() ?? ""}
                onValueChange={(v) => setQapulseProjectId(v ? Number(v) : null)}
                options={qapulseProjects.map((p) => ({ value: p.id.toString(), label: p.name }))}
                placeholder="Select project (optional)..."
                searchPlaceholder="Search project..."
              />
            </div>
            <DefectCategoryField value={defectCategory} onChange={setDefectCategory} canSet={canSetCategory} />
          </div>

          <Separator />

          {/* Redmine Fields */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Redmine Issue</p>

            <div className="space-y-1.5">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Redmine Project <span className="text-destructive">*</span>
                </Label>
                <SearchableSelect
                  value={selectedProjectId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedProjectId(Number(v))}
                  options={projects.map((p) => ({ value: p.redmineId.toString(), label: p.name }))}
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
                <Label>Tracker</Label>
                <Input
                  value={trackers.find((t) => t.id === qaDefectTrackerId)?.name ?? "QA Defect"}
                  disabled
                  className="bg-muted/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Assignee <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={selectedAssigneeId?.toString() ?? ""}
                onValueChange={(v) => setSelectedAssigneeId(v ? Number(v) : null)}
                options={members.map((m) => ({ value: m.id.toString(), label: m.name }))}
                placeholder={selectedProjectId ? "Select assignee..." : "Select a project first"}
                searchPlaceholder="Search member..."
                disabled={!selectedProjectId}
                emptyText={selectedProjectId ? "No members found." : "Select a project first."}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
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
                <Label>Targeted Start Date</Label>
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

            {!projectConfig && selectedProjectId && (
              <p className="text-xs text-amber-600">
                No custom field config for this project. Complexity and date fields won't be set.
                Configure in Settings → Redmine Integration.
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
              <><ExternalLink className="w-4 h-4" /> Create in Redmine</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
