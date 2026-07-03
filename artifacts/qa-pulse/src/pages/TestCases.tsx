import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTestCases,
  getListTestCasesQueryKey,
  listProjects,
  getListProjectsQueryKey,
  listUsers,
  getListUsersQueryKey,
  listRequirements,
  getListRequirementsQueryKey,
  useCreateTestCase,
  useUpdateTestCase,
  useDeleteTestCase,
  useCloneTestCase,
  useGenerateTestCasesWithAI,
  type AIGenerateInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge"; 
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  TestTube,
  Sparkles,
  Loader2,
  FileSpreadsheet,
  X,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  LayoutList,
  PackagePlus,
  FolderOpen,
  List,
} from "lucide-react";
import React from "react";
import { format } from "date-fns";
import { getApiUrl } from "@/lib/api";

async function exportToExcel(testCases: any[], senderName?: string) {
  const res = await fetch(`${getApiUrl()}/test-cases/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testCases, senderName }),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `test-cases-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AIGenerateDialog({
  open,
  onClose,
  requirements,
  projects,
  modules,
  users,
  trackers,
  onSuccess,
}: any) {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState<
    Partial<AIGenerateInput & { projectId?: number; authorId?: number; tracker?: string }>
  >({
    generatePositive: true,
    generateNegative: false,
    generateEdgeCases: false,
    tracker: "",
  });
  const [aiFormModules, setAiFormModules] = useState<string[]>([]);
  const [availableReqs, setAvailableReqs] = useState<any[]>([]);
  const [selectedReqIds, setSelectedReqIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState<"form" | "preview">("form");
  const generateMutation = useGenerateTestCasesWithAI();

  const handleGenerate = () => {
    if (!form.requirementTitle) return;

    // Combine checked Parent and Child descriptions into a single block with explicit delimiters
    const selectedDesc = availableReqs
      .filter((r) => selectedReqIds.has(r.id))
      .map(
        (r) =>
          `[${r.depth === 0 ? "PARENT" : "CHILD"} REQUIREMENT: ${r.redmineTicketId ? "#" + r.redmineTicketId : "ID:" + r.id} - ${r.title}]\n${r.description || "No description"}`,
      )
      .join("\n\n---\n\n");

    generateMutation.mutate(
      {
        data: {
          ...form,
          requirementDescription: selectedDesc,
        } as AIGenerateInput,
      },
      {
        onSuccess: (data) => {
          setPreview(data.testCases ?? []);
          setStep("preview");
        },
      },
    );
  };

  const toggleReqSelection = (id: number) => {
    setSelectedReqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = () => {
    setStep("form");
    setPreview([]);
    setAvailableReqs([]);
    setSelectedReqIds(new Set());
    setAiFormModules([]);
    setForm({
      generatePositive: true,
      generateNegative: false,
      generateEdgeCases: false,
      tracker: "",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-8xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Test Case
            Generation
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base Requirement (optional)</Label>
                <SearchableSelect
                  value={form.requirementId ? String(form.requirementId) : ""}
                  onValueChange={(v) => {
                    const reqId = Number(v);
                    const req = requirements.find((r: any) => r.id === reqId);
                    if (req) {
                      const getAllDescendants = (parentId: number, allReqs: any[], depth = 1): any[] => {
                        const children = allReqs.filter((r: any) => r.parentId === parentId);
                        let desc: any[] = [];
                        for (const child of children) {
                          desc.push({ ...child, depth });
                          desc = desc.concat(getAllDescendants(child.id, allReqs, depth + 1));
                        }
                        return desc;
                      };
                      const descendants = getAllDescendants(req.id, requirements);
                      const combined = [{ ...req, depth: 0 }, ...descendants];
                      setAvailableReqs(combined);
                      setSelectedReqIds(new Set(combined.map((c) => c.id)));
                      setForm({
                        ...form,
                        requirementId: reqId,
                        requirementTitle: req.title,
                        projectId: req.projectId ?? form.projectId,
                        tracker: req.tracker ?? form.tracker,
                      });
                      if (req.module) {
                        setAiFormModules(req.module.split(",").map((s: string) => s.trim()).filter(Boolean));
                      }
                    }
                  }}
                  options={requirements.map((r: any) => ({ value: String(r.id), label: r.title }))}
                  placeholder="Select a requirement..."
                  searchPlaceholder="Search requirement..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Project <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}
                  options={projects.map((p: any) => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select a project..."
                  searchPlaceholder="Search project..."
                />
              </div>
            </div>

            {availableReqs.length > 0 && (
              <div className="space-y-2 bg-muted/10 p-3 rounded-lg border w-full">

                {/* --- UPDATED HEADER WITH SELECT ALL / DESELECT ALL --- */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 mb-1 border-b border-border/40">
                  <Label className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                    Requirement Scope Hierarchy
                  </Label>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => setSelectedReqIds(new Set(availableReqs.map(r => r.id)))}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setSelectedReqIds(new Set())}
                    >
                      Deselect All
                    </Button>
                    <div className="w-px h-3 bg-border mx-1 hidden sm:block"></div>
                    <Badge variant="secondary" className="text-[10px] bg-background shrink-0">
                      {selectedReqIds.size} / {availableReqs.length} Selected
                    </Badge>
                  </div>
                </div>
                {/* --------------------------------------------------- */}

                <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden pr-2 w-full">
                  {availableReqs.map((r) => {
                    const depth = r.depth || 0;
                    // Indent base size per depth level
                    const indentRem = depth * 1.5; 

                    return (
                      <div
                        key={r.id}
                        className="relative w-full"
                        style={{ paddingLeft: `${indentRem}rem` }}
                      >
                        {/* Visual Tree Connector Line */}
                        {depth > 0 && (
                          <div
                            className="absolute border-l-2 border-b-2 border-muted-foreground/20 rounded-bl-md"
                            style={{
                              left: `${indentRem - 0.75}rem`,
                              top: '-0.5rem',
                              bottom: '50%',
                              width: '0.5rem',
                            }}
                          />
                        )}

                        <div
                          className={`flex items-start gap-3 p-3 border rounded-lg shadow-sm transition-all w-full min-w-0 hover:shadow-md ${
                            selectedReqIds.has(r.id)
                              ? "bg-primary/5 border-primary/30"
                              : "bg-background border-border/50"
                          }`}
                        >
                          <Checkbox
                            checked={selectedReqIds.has(r.id)}
                            onCheckedChange={() => toggleReqSelection(r.id)}
                            id={`req-${r.id}`}
                            className="mt-1 min-w-[18px] min-h-[18px] shrink-0 transition-transform active:scale-95"
                          />

                          <label
                            htmlFor={`req-${r.id}`}
                            className="flex-1 cursor-pointer min-w-0 flex flex-col gap-1.5"
                          >
                            {/* Tags & Redmine ID Header */}
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0 uppercase font-bold tracking-wider shrink-0 border-0 ${
                                  depth === 0
                                    ? "bg-primary/10 text-primary"
                                    : depth === 1
                                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                }`}
                              >
                                {depth === 0
                                  ? "Parent"
                                  : depth === 1
                                    ? "Child"
                                    : `Sub-child ${depth}`}
                              </Badge>
                              {r.redmineTicketId && (
                                <span className="text-xs font-semibold text-muted-foreground shrink-0 break-words">
                                  #{r.redmineTicketId}
                                </span>
                              )}
                            </div>

                            {/* Title Block */}
                            <div className="text-sm font-semibold break-words whitespace-normal leading-snug min-w-0 text-foreground">
                              {r.title}
                            </div>

                            {/* Description Block */}
                            <div className="text-[11px] sm:text-xs text-muted-foreground break-words whitespace-normal line-clamp-3 leading-relaxed min-w-0 mt-0.5">
                              {r.description ? (
                                <span className="opacity-90">{r.description}</span>
                              ) : (
                                <span className="italic opacity-50">No description provided.</span>
                              )}
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Test Case Scope / Title *</Label>
              <Input
                placeholder="e.g. User Login Validation"
                value={form.requirementTitle ?? ""}
                onChange={(e) =>
                  setForm({ ...form, requirementTitle: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Module <span className="text-destructive">*</span></Label>
                <div className="border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5">
                  {(modules ?? []).map((m: any) => (
                    <label key={m.id ?? m.name} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={aiFormModules.includes(m.name)}
                        onCheckedChange={(checked) => setAiFormModules(prev => checked ? [...prev, m.name] : prev.filter(n => n !== m.name))}
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
                {aiFormModules.length > 0 && <p className="text-xs text-muted-foreground">{aiFormModules.length} selected</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Assign Author</Label>
                <SearchableSelect
                  value={form.authorId ? String(form.authorId) : ""}
                  onValueChange={(v) => setForm({ ...form, authorId: Number(v) })}
                  options={users.map((u: any) => ({ value: String(u.id), label: u.name }))}
                  placeholder="Current User"
                  searchPlaceholder="Search user..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tracker</Label>
              <SearchableSelect
                value={form.tracker ?? ""}
                onValueChange={(v) => setForm({ ...form, tracker: v })}
                options={[
                  { value: "", label: "None" },
                  ...(trackers ?? []).map((t: any) => ({ value: t.name, label: t.name })),
                  ...(form.tracker && !(trackers ?? []).some((t: any) => t.name === form.tracker)
                    ? [{ value: form.tracker, label: form.tracker }]
                    : []),
                ]}
                placeholder="Select tracker..."
                searchPlaceholder="Search tracker..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any specific scenarios or edge cases to focus on..."
                value={form.additionalNotes ?? ""}
                onChange={(e) =>
                  setForm({ ...form, additionalNotes: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="space-y-2 pt-2">
              <Label>Generation Targets</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.generatePositive ?? true}
                    onCheckedChange={(v) =>
                      setForm({ ...form, generatePositive: !!v })
                    }
                    id="pos"
                  />
                  <label htmlFor="pos" className="text-sm">
                    Positive Path
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.generateNegative ?? false}
                    onCheckedChange={(v) =>
                      setForm({ ...form, generateNegative: !!v })
                    }
                    id="neg"
                  />
                  <label htmlFor="neg" className="text-sm">
                    Negative Scenarios
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.generateEdgeCases ?? false}
                    onCheckedChange={(v) =>
                      setForm({ ...form, generateEdgeCases: !!v })
                    }
                    id="edge"
                  />
                  <label htmlFor="edge" className="text-sm">
                    Edge Cases
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {preview.length} test case{preview.length !== 1 ? "s" : ""}{" "}
                generated
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("form")}
              >
                Back
              </Button>
            </div>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {preview.map((tc, i) => (
                <Card key={i} className="border">
                  <CardContent className="p-4 space-y-2">
                    <p className="font-medium text-sm">{tc.title}</p>
                    {tc.scenario && (
                      <p className="text-xs text-muted-foreground">
                        <strong className="text-foreground">Scenario:</strong>{" "}
                        {tc.scenario}
                      </p>
                    )}
                    {tc.testSteps && (
                      <div className="text-xs bg-muted/50 rounded p-2 whitespace-pre-line font-mono mt-2">
                        {tc.testSteps}
                      </div>
                    )}

                    {/* NEW: Expected Result with Green Text */}
                    {tc.expectedResult && (
                      <div className="text-xs mt-2">
                        <strong className="text-foreground">Expected Result:</strong>{" "}
                        <span className="text-green-700 dark:text-green-400 font-medium whitespace-pre-line">
                          {tc.expectedResult}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          {step === "form" ? (
            <Button
              onClick={handleGenerate}
              disabled={!form.requirementTitle || !form.projectId || aiFormModules.length === 0 || generateMutation.isPending}
              className="gap-2 w-full sm:w-auto"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => {
                onSuccess(preview, { ...form, module: aiFormModules.join(",") });
                handleClose();
              }}
              className="gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Save All ({preview.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Reusable Detail Item Component for Expanded Rows
function DetailItem({
  label,
  value,
  isCode,
  highlight,
}: {
  label: string;
  value?: string;
  isCode?: boolean;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    // Force Inter font family for the entire component
    <div style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* TITLE: Bold */}
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
        {label}
      </span>

      {/* DETAILS: Regular weight, no monospaced fonts */}
      {isCode ? (
        <div className="bg-background border rounded p-2 text-xs font-normal whitespace-pre-wrap max-h-48 overflow-y-auto">
          {value}
        </div>
      ) : (
        <p
          className={`text-sm font-normal whitespace-pre-wrap ${
            highlight ? "text-green-700 dark:text-green-400" : ""
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function ExecutionRunsDialog({ tc, onClose }: { tc: any | null; onClose: () => void }) {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const { data: runs = [], isLoading } = useQuery<any[]>({
    queryKey: ["tc-executions", tc?.id],
    enabled: !!tc,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/test-cases/${tc.id}/executions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch execution files");
      return res.json();
    },
  });

  const resultBadge = (result: string | null) => {
    const r = result?.toLowerCase() ?? "";
    if (r.startsWith("pass"))
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs shrink-0">Passed</Badge>;
    if (r.startsWith("fail"))
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-xs shrink-0">Failed</Badge>;
    if (r === "blocked")
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs shrink-0">Blocked</Badge>;
    return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100 text-xs shrink-0">Not Run</Badge>;
  };

  return (
    <Dialog open={!!tc} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            Execution files — {tc?.title}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            This test case is not in any execution file.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {runs.map((run) => (
              <button
                key={run.executionFileId}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                onClick={() => {
                  onClose();
                  setLocation(`/test-cases/execution-details/${run.redmineTicketId}`);
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      #{run.redmineTicketId}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {run.fileTitle ?? "Untitled execution file"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    {run.displayCaseId && <span className="font-mono">{run.displayCaseId}</span>}
                    {run.executedAt && <span>{format(new Date(run.executedAt), "dd MMM yyyy")}</span>}
                    {run.defectNumber && (
                      <span className="text-red-600 font-mono">Defect: {run.defectNumber}</span>
                    )}
                  </div>
                </div>
                {resultBadge(run.result)}
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TestCases() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchString = useSearch();

  const [search, setSearch] = useState("");
  const [nlMode, setNlMode] = useState(false);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlResultIds, setNlResultIds] = useState<number[] | null>(null);
  const nlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterProject, setFilterProject] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [filterAI, setFilterAI] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [runsDialogTc, setRunsDialogTc] = useState<any | null>(null);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [tcToClone, setTcToClone] = useState<any | null>(null);
  const [cloneForm, setCloneForm] = useState<{ requirementId?: number; projectId?: number; module?: string }>({});
  const [isCloning, setIsCloning] = useState(false);

  const [bulkCloneDialogOpen, setBulkCloneDialogOpen] = useState(false);
  const [bulkCloneForm, setBulkCloneForm] = useState<{ requirementId?: number; projectId?: number; module?: string }>({});
  const [isBulkCloning, setIsBulkCloning] = useState(false);

  const [editingTC, setEditingTC] = useState<any | null>(null);
  const [form, setForm] = useState<Partial<any>>({});
  const [formModules, setFormModules] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [compileOpen, setCompileOpen] = useState(false);
  const [compileStep, setCompileStep] = useState<"mode" | "existing" | "new">("mode");
  const [compileExistingFiles, setCompileExistingFiles] = useState<any[]>([]);
  const [compileExistingSearch, setCompileExistingSearch] = useState("");
  const [compileTargetTicketId, setCompileTargetTicketId] = useState<string | null>(null);
  const [compileNewForm, setCompileNewForm] = useState<{
    redmineTicketId: string;
    title: string;
    remarks: string;
    requirementId: string;
    projectId: string;
    tracker: string;
    selectedModules: number[];
  }>({ redmineTicketId: "", title: "", remarks: "", requirementId: "", projectId: "", tracker: "", selectedModules: [] });
  const [isCompiling, setIsCompiling] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [filterRequirement, setFilterRequirement] = useState(() => {
    const params = new URLSearchParams(searchString);
    return params.get("requirementId") ?? "all";
  });
  const [groupByModule, setGroupByModule] = useState(false);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"comfy" | "compact">(() => {
    try { return (localStorage.getItem("tc_view_mode") as "comfy" | "compact") ?? "comfy"; } catch { return "comfy"; }
  });

  const { data: testCases = [], isLoading } = useQuery({
    queryKey: getListTestCasesQueryKey(),
    queryFn: () => listTestCases(),
    staleTime: 0,
    refetchOnMount: true,
  });
  const { data: projects = [] } = useQuery({
    queryKey: getListProjectsQueryKey(),
    queryFn: () => listProjects(),
  });
  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });
  const { data: requirements = [] } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const { data: modules = [] } = useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/modules`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: trackers = [] } = useQuery({
    queryKey: ["trackers"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/trackers`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300_000,
  });

  const projectsMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterProject, filterModule, filterAI, filterRequirement, sortBy, groupByModule]);

  const isNlQuery = useCallback((q: string) => {
    if (q.length < 15) return false;
    const words = q.trim().split(/\s+/);
    if (words.length < 3) return false;
    const nlStarters = ["find", "show", "list", "test", "verify", "check", "search", "get", "what", "which", "all", "any"];
    if (nlStarters.some(w => words[0].toLowerCase() === w)) return true;
    return words.length >= 4;
  }, []);

  useEffect(() => {
    if (nlDebounceRef.current) clearTimeout(nlDebounceRef.current);
    if (!search.trim() || !isNlQuery(search)) {
      setNlMode(false);
      setNlResultIds(null);
      setNlLoading(false);
      return;
    }
    setNlMode(true);
    setNlLoading(true);
    nlDebounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("qa_pulse_token");
        const payload = {
          query: search,
          testCases: (testCases as any[]).map(tc => ({
            id: tc.id,
            title: tc.title,
            scenario: tc.scenario,
            module: tc.module,
            tracker: tc.tracker,
          })),
        };
        const res = await fetch("/api/ai/search-tcs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setNlResultIds(Array.isArray(data.ids) ? data.ids : null);
        } else {
          setNlResultIds(null);
        }
      } catch {
        setNlResultIds(null);
      } finally {
        setNlLoading(false);
      }
    }, 700);
  }, [search, testCases, isNlQuery]);

  useEffect(() => {
    try { localStorage.setItem("tc_view_mode", viewMode); } catch {}
  }, [viewMode]);

  const createMutation = useCreateTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        setDialogOpen(false);
        setForm({});
        toast({ title: "Test case created" });
      },
    },
  });

  const updateMutation = useUpdateTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        setDialogOpen(false);
        setEditingTC(null);
        toast({ title: "Test case updated" });
      },
    },
  });

  const deleteMutation = useDeleteTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
      },
    },
  });

  const cloneMutation = useCloneTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        toast({ title: "Test case cloned" });
      },
    },
  });

  const filtered = useMemo(() => {
    // NL mode: filter by AI-returned IDs, preserve AI ranking order
    if (nlMode && nlResultIds !== null && !nlLoading) {
      const idSet = new Set(nlResultIds);
      const base = (testCases as any[]).filter((t: any) => {
        if (!idSet.has(t.id)) return false;
        if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
        if (filterModule !== "all" && (t.module ?? "") !== filterModule) return false;
        if (filterRequirement !== "all" && String(t.requirementId) !== filterRequirement) return false;
        if (filterAI === "ai" && !t.aiAssisted) return false;
        if (filterAI === "manual" && t.aiAssisted) return false;
        return true;
      });
      // Sort by AI ranking
      return base.sort((a: any, b: any) => nlResultIds.indexOf(a.id) - nlResultIds.indexOf(b.id));
    }

    let result = testCases.filter((t: any) => {
      if (filterProject !== "all" && String(t.projectId) !== filterProject)
        return false;
      if (filterModule !== "all" && (t.module ?? "") !== filterModule)
        return false;
      if (filterRequirement !== "all" && String(t.requirementId) !== filterRequirement)
        return false;
      if (filterAI === "ai" && !t.aiAssisted) return false;
      if (filterAI === "manual" && t.aiAssisted) return false;
      if (search && !nlMode) {
        const query = search.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(query);
        const matchStory = t.redmineUserStory?.toLowerCase().includes(query);
        const matchTracker = t.tracker?.toLowerCase().includes(query);
        const matchTags = t.tags?.toLowerCase().includes(query);
        const matchAuthor =
          t.qaPic?.toLowerCase().includes(query) ||
          t.authorName?.toLowerCase().includes(query);

        if (
          !matchTitle &&
          !matchStory &&
          !matchTracker &&
          !matchTags &&
          !matchAuthor
        )
          return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "newest")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      if (sortBy === "oldest")
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      if (sortBy === "updated")
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      if (sortBy === "requirement")
        return ((a as any).requirementId ?? Infinity) - ((b as any).requirementId ?? Infinity);
      return 0;
    });

    return result;
  }, [testCases, search, filterProject, filterModule, filterRequirement, filterAI, sortBy, nlMode, nlResultIds, nlLoading]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedTestCases = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const filteredIds = useMemo(
    () => new Set(filtered.map((t) => t.id)),
    [filtered],
  );
  const selectedInView = filtered.filter((t) => selectedIds.has(t.id));
  const allFilteredSelected =
    filtered.length > 0 && selectedInView.length === filtered.length;
  const someFilteredSelected =
    selectedInView.length > 0 && !allFilteredSelected;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModuleCollapse = (moduleName: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleName)) next.delete(moduleName);
      else next.add(moduleName);
      return next;
    });
  };

  const groupedByModule = useMemo(() => {
    if (!groupByModule) return null;
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach((tc: any) => {
      const key = (tc.module as string) || "— No Module —";
      if (!groups[key]) groups[key] = [];
      groups[key].push(tc);
    });
    return groups;
  }, [filtered, groupByModule]);

  const handleExport = () => {
    const toExport =
      selectedIds.size > 0
        ? testCases.filter((t) => selectedIds.has(t.id))
        : filtered;
    if (toExport.length === 0)
      return toast({
        variant: "destructive",
        title: "No test cases to export",
      });
    exportToExcel(toExport, user?.name).then(() => toast({ title: "Export complete" }));
  };

  const handleBulkDelete = async () => {
    setIsDeletingBulk(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => deleteMutation.mutateAsync({ id })),
      );
      toast({ title: `Deleted ${selectedIds.size} cases` });
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const openCreate = () => {
    setEditingTC(null);
    setForm({ status: "active" });
    setFormModules([]);
    setDialogOpen(true);
  };

  const openEdit = (tc: any) => {
    setEditingTC(tc);
    setForm({
      title: tc.title,
      redmineUserStory: tc.redmineUserStory ?? undefined,
      tracker: tc.tracker ?? undefined,
      scenario: tc.scenario ?? undefined,
      preconditions: tc.preconditions ?? undefined,
      testSteps: tc.testSteps ?? undefined,
      testData: tc.testData ?? undefined,
      expectedResult: tc.expectedResult ?? undefined,
      redmineDefectId: tc.redmineDefectId ?? undefined,
      comments: tc.comments ?? undefined,
      qaPic: tc.qaPic ?? undefined,
      tags: tc.tags ?? undefined,
      requirementId: tc.requirementId ?? undefined,
      projectId: tc.projectId ?? undefined,
      module: tc.module ?? undefined,
      authorId: tc.authorId ?? undefined,
      status: tc.status,
    });
    setFormModules(tc.module ? tc.module.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setDialogOpen(true);
  };

  const openCloneDialog = (tc: any) => {
    setTcToClone(tc);
    setCloneForm({
      requirementId: tc.requirementId ?? undefined,
      projectId:     tc.projectId     ?? undefined,
      module:        tc.module        ?? undefined,
    });
    setCloneDialogOpen(true);
  };

  const handleConfirmClone = async () => {
    if (!tcToClone || !cloneForm.projectId || !cloneForm.module) return;
    setIsCloning(true);
    try {
      const token = localStorage.getItem("qa_pulse_token");
      const res = await fetch(`${getApiUrl()}/test-cases/${tcToClone.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          projectId: cloneForm.projectId,
          module: cloneForm.module,
          requirementId: cloneForm.requirementId || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
      toast({ title: "Test case cloned" });
      setCloneDialogOpen(false);
      setTcToClone(null);
    } catch {
      toast({ variant: "destructive", title: "Failed to clone test case" });
    } finally {
      setIsCloning(false);
    }
  };

  const handleBulkClone = async () => {
    if (!bulkCloneForm.projectId || !bulkCloneForm.module) return;
    setIsBulkCloning(true);
    const ids = Array.from(selectedIds);
    let successCount = 0;
    try {
      const token = localStorage.getItem("qa_pulse_token");
      await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`${getApiUrl()}/test-cases/${id}/clone`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
              projectId: bulkCloneForm.projectId,
              module: bulkCloneForm.module,
              requirementId: bulkCloneForm.requirementId || undefined,
            }),
          });
          if (res.ok) successCount++;
        }),
      );
      queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
      toast({ title: `${successCount} test case${successCount !== 1 ? "s" : ""} cloned` });
      setBulkCloneDialogOpen(false);
      setBulkCloneForm({});
      setSelectedIds(new Set());
    } catch {
      toast({ variant: "destructive", title: "Some test cases failed to clone" });
    } finally {
      setIsBulkCloning(false);
    }
  };

  const openCompileDialog = () => {
    const selectedTCs = testCases.filter((tc: any) => selectedIds.has(tc.id));
    if (selectedTCs.length === 0) return;
    const firstTC = selectedTCs[0];
    const distinctModuleNames = [...new Set(selectedTCs.map((tc: any) => tc.module).filter(Boolean))] as string[];
    const matchedModuleIds = modules
      .filter((m: any) => distinctModuleNames.includes(m.name))
      .map((m: any) => m.id);
    // Pre-populate redmine ticket ID from selected TCs — use shared value if all agree, else first TC
    const distinctRedmineIds = [...new Set(selectedTCs.map((tc: any) => tc.redmineUserStory).filter(Boolean))] as string[];
    const prefilledTicketId = (distinctRedmineIds[0] ?? "").replace(/\D/g, "");
    const distinctTrackers = [...new Set(selectedTCs.map((tc: any) => tc.tracker).filter(Boolean))] as string[];
    const prefilledTracker = distinctTrackers.length === 1 ? distinctTrackers[0] : (firstTC.tracker ?? "");
    setCompileNewForm({
      redmineTicketId: prefilledTicketId,
      title: "",
      remarks: "",
      requirementId: firstTC.requirementId ? String(firstTC.requirementId) : "",
      projectId: firstTC.projectId ? String(firstTC.projectId) : "",
      tracker: prefilledTracker,
      selectedModules: matchedModuleIds,
    });
    setCompileStep("mode");
    setCompileTargetTicketId(null);
    setCompileExistingSearch("");
    setCompileExistingFiles([]);
    setCompileOpen(true);
  };

  const handleCompileChooseExisting = async () => {
    try {
      const token = localStorage.getItem("qa_pulse_token");
      const res = await fetch(`${getApiUrl()}/execution-files`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setCompileExistingFiles(await res.json());
    } catch {}
    setCompileStep("existing");
  };

  const handleCompileConfirm = async () => {
    const selectedTCs = testCases.filter((tc: any) => selectedIds.has(tc.id));
    const newRows = selectedTCs.map((tc: any) => ({
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
      result: "Not Executed",
    }));
    const token = localStorage.getItem("qa_pulse_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    setIsCompiling(true);
    try {
      let targetTicketId = compileTargetTicketId;
      if (compileStep === "new") {
        const selectedModuleNames = compileNewForm.selectedModules
          .map((id) => modules.find((m: any) => m.id === id)?.name)
          .filter(Boolean) as string[];
        const createRes = await fetch(`${getApiUrl()}/execution-files`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            redmineTicketId: compileNewForm.redmineTicketId.trim(),
            title: compileNewForm.title || undefined,
            remarks: compileNewForm.remarks || undefined,
            selectedModules: selectedModuleNames.length ? selectedModuleNames.join(",") : undefined,
            tracker: compileNewForm.tracker || undefined,
            projectId: compileNewForm.projectId ? Number(compileNewForm.projectId) : undefined,
            requirementId: compileNewForm.requirementId ? Number(compileNewForm.requirementId) : undefined,
          }),
        });
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${createRes.status}`);
        }
        const created = await createRes.json();
        targetTicketId = created.redmineTicketId;
      }
      if (!targetTicketId) throw new Error("No target execution file");
      let existingTCs: any[] = [];
      if (compileStep === "existing") {
        const getRes = await fetch(`${getApiUrl()}/execution-files/${targetTicketId}/test-cases`, {
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
            const existingFile = allFiles.find((f: any) => String(f.redmineTicketId) === String(targetTicketId));
            if (existingFile) {
              const existingModules = (existingFile.selectedModules || "").split(",").map((s: string) => s.trim()).filter(Boolean);
              const merged = [...new Set([...existingModules, ...newModuleNames])];
              if (merged.length !== existingModules.length) {
                const existingFileObj = allFiles.find((f: any) => String(f.redmineTicketId) === String(targetTicketId));
                if (existingFileObj) {
                  await fetch(`${getApiUrl()}/execution-files/${existingFileObj.id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ selectedModules: merged.join(",") }),
                  }).catch(() => {});
                }
              }
            }
          }
        }
      }
      const saveRes = await fetch(`${getApiUrl()}/execution-files/${targetTicketId}/test-cases`, {
        method: "POST",
        headers,
        body: JSON.stringify({ testCases: [...existingTCs, ...newRows] }),
      });
      if (!saveRes.ok) {
        const saveBody = await saveRes.json().catch(() => ({}));
        throw new Error(saveBody.error ?? `Server error ${saveRes.status}`);
      }
      toast({ title: `${selectedTCs.length} test case${selectedTCs.length !== 1 ? "s" : ""} compiled into #${targetTicketId}` });
      setCompileOpen(false);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ variant: "destructive", title: "Compile failed", description: String(err?.message ?? err) });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSubmit = () => {
    if (
      !form.title?.trim() ||
      !form.testSteps?.trim() ||
      !form.expectedResult?.trim() ||
      !form.projectId ||
      formModules.length === 0
    ) {
      toast({
        variant: "destructive",
        title: "Case Name, Project, Module, Steps, and Expected Result are required",
      });
      return;
    }
    const submitData = { ...form, module: formModules.join(",") };
    if (editingTC)
      updateMutation.mutate({ id: editingTC.id, data: submitData as any });
    else createMutation.mutate({ data: { ...submitData, aiAssisted: false, authorId: user?.id } as any });
  };

  const handleAISuccess = async (aiTestCases: any[], formData: any) => {
    const token = localStorage.getItem("qa_pulse_token");
    const saves = aiTestCases.map((tc) =>
      fetch(`${getApiUrl()}/test-cases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: tc.title,
          redmineUserStory: tc.redmineUserStory,
          tracker: formData?.tracker || tc.tracker,
          scenario: tc.scenario,
          preconditions: tc.preconditions,
          testSteps: tc.testSteps,
          testData: tc.testData,
          expectedResult: tc.expectedResult,
          tags: tc.tags,
          type: tc.type || "manual",
          priority: tc.priority || "medium",
          status: "active",
          aiAssisted: true,
          requirementId: formData?.requirementId,
          projectId: formData?.projectId,
          module: formData?.module,
          authorId: formData?.authorId || user?.id,
        }),
      }),
    );
    await Promise.all(saves);
    await queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
    toast({ title: `${aiTestCases.length} AI test cases saved` });
  };

  const tcTableRow = (tc: any) => {
    const cellPy = viewMode === "compact" ? "py-1.5" : "py-3";
    return (
      <React.Fragment key={tc.id}>
        <TableRow
          className={`hover:bg-muted/40 cursor-pointer border-b transition-colors ${selectedIds.has(tc.id) ? "bg-primary/5" : ""} ${expandedId === tc.id ? "bg-muted/20" : ""}`}
          onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
        >
          <TableCell className={`pl-4 ${cellPy}`} onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selectedIds.has(tc.id)} onCheckedChange={() => toggleSelect(tc.id)} />
          </TableCell>
          <TableCell className={cellPy}>
            <Button variant="ghost" size="icon" className="w-6 h-6 p-0 hover:bg-transparent">
              {expandedId === tc.id ? (
                <ChevronDown className="w-4 h-4 text-primary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          </TableCell>
          <TableCell className={cellPy}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium line-clamp-1">{tc.title}</span>
              {tc.aiAssisted && (
                <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary uppercase shrink-0">
                  <Sparkles className="w-2 h-2 text-primary" />
                  AI
                </Badge>
              )}
              {(tc.executionCount ?? 0) > 0 && (
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 shrink-0 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                  onClick={(e) => { e.stopPropagation(); setRunsDialogTc(tc); }}
                >
                  In {tc.executionCount} run{tc.executionCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </TableCell>
          {viewMode === "comfy" && (
            <TableCell className={`${cellPy} text-muted-foreground truncate`}>
              {tc.aiAssisted ? (tc.authorName ? `AI · ${tc.authorName}` : "AI") : tc.authorName || "—"}
            </TableCell>
          )}
          {viewMode === "comfy" && (
            <TableCell className={cellPy}>
              {tc.tags ? (
                <div className="flex flex-wrap gap-1">
                  {tc.tags.split(",").slice(0, 2).map((tag: string) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              ) : "—"}
            </TableCell>
          )}
          <TableCell className={`${cellPy} text-right`} onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEdit(tc)}>
                  <Pencil className="w-4 h-4 mr-2" />Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openCloneDialog(tc)}>
                  <Copy className="w-4 h-4 mr-2" />Clone
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate({ id: tc.id })}>
                  <Trash2 className="w-4 h-4 mr-2" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>

        {expandedId === tc.id && (
          <TableRow className="bg-muted/10 hover:bg-muted/10 border-b shadow-inner">
            <TableCell colSpan={viewMode === "comfy" ? 6 : 4} className="p-0">
              <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-5">
                  <DetailItem label="Redmine Ticket ID" value={tc.redmineUserStory} />
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Tracker" value={tc.tracker} />
                    <DetailItem label="Redmine Defect #" value={tc.redmineDefectId} />
                  </div>
                  <DetailItem label="Scenario" value={tc.scenario} />
                  <DetailItem label="Preconditions" value={tc.preconditions} />
                  <DetailItem label="Test Data" value={tc.testData} />
                </div>
                <div className="space-y-5">
                  <DetailItem label="Test Steps" value={tc.testSteps} isCode />
                  <DetailItem label="Expected Result" value={tc.expectedResult} highlight />
                  <DetailItem label="Additional / Comments / Issues" value={tc.comments} />
                </div>
              </div>
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TestTube className="w-7 h-7 text-primary" /> Test Cases
          </h1>
          <p className="text-muted-foreground mt-1">
            {testCases.length} test cases ·{" "}
            {testCases.filter((t) => t.aiAssisted).length} AI-assisted
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {selectedIds.size > 0 ? `Export ${selectedIds.size}` : "Export"}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => setAiDialogOpen(true)}
              className="gap-2 flex-1 sm:flex-none"
            >
              <Sparkles className="w-4 h-4 text-primary" /> AI Generate
            </Button>
            <Button onClick={openCreate} className="gap-2 flex-1 sm:flex-none">
              <Plus className="w-4 h-4" /> New Case
            </Button>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span>
              <strong>{selectedIds.size}</strong> test case
              {selectedIds.size !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="sm:ml-auto flex w-full sm:w-auto items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1"
              onClick={() => {
                setBulkCloneForm({});
                setBulkCloneDialogOpen(true);
              }}
            >
              <Copy className="w-3 h-3" /> Clone
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950"
              onClick={openCompileDialog}
            >
              <PackagePlus className="w-3 h-3" /> Compile
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-2 text-xs gap-1"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3 h-3" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
              {nlLoading
                ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500 animate-spin" />
                : nlMode
                  ? <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500" />
                  : <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              }
              <Input
                placeholder="Search by name, or ask in plain English..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`pl-9 w-full ${nlMode ? "border-purple-400 ring-1 ring-purple-300" : ""}`}
              />
              {search && (
                <button onClick={() => { setSearch(""); setNlMode(false); setNlResultIds(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {nlMode && (
              <div className="flex items-center gap-2 -mt-1">
                {nlLoading
                  ? <span className="text-xs text-purple-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> AI searching...</span>
                  : nlResultIds !== null
                    ? <span className="text-xs text-purple-600 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI found {nlResultIds.length} result{nlResultIds.length !== 1 ? "s" : ""}</span>
                    : <span className="text-xs text-muted-foreground">AI search active</span>
                }
              </div>
            )}
            <div className="flex flex-wrap gap-2 w-full items-center">
              <SearchableSelect
                value={sortBy}
                onValueChange={setSortBy}
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "updated", label: "Recently Updated" },
                  { value: "requirement", label: "By Requirement" },
                ]}
                placeholder="Sort By"
                searchPlaceholder="Search..."
                className="flex-1 min-w-[120px] bg-muted/30"
              />
              <SearchableSelect
                value={filterProject}
                onValueChange={setFilterProject}
                options={[
                  { value: "all", label: "All Projects" },
                  ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Project"
                searchPlaceholder="Search project..."
                className="flex-1 min-w-[120px]"
              />
              <SearchableSelect
                value={filterModule}
                onValueChange={setFilterModule}
                options={[
                  { value: "all", label: "All Modules" },
                  ...modules.map((m: any) => ({ value: m.name, label: m.name })),
                ]}
                placeholder="Module"
                searchPlaceholder="Search module..."
                className="flex-1 min-w-[120px]"
              />
              <SearchableSelect
                value={filterAI}
                onValueChange={setFilterAI}
                options={[
                  { value: "all", label: "All Sources" },
                  { value: "ai", label: "AI Assisted" },
                  { value: "manual", label: "Manual" },
                ]}
                placeholder="Source"
                searchPlaceholder="Search..."
                className="flex-1 min-w-[110px]"
              />
              <SearchableSelect
                value={filterRequirement}
                onValueChange={setFilterRequirement}
                options={[
                  { value: "all", label: "All Requirements" },
                  ...requirements.map((r: any) => ({ value: String(r.id), label: r.title })),
                ]}
                placeholder="Requirement"
                searchPlaceholder="Search requirement..."
                className="flex-1 min-w-[140px]"
              />
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={groupByModule ? "default" : "outline"}
                  size="sm"
                  className="h-9 px-2.5 gap-1.5 text-xs"
                  onClick={() => setGroupByModule((v) => !v)}
                  title="Group by Module"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Group
                </Button>
                <div className="flex border rounded-md overflow-hidden ml-1">
                  <Button
                    variant={viewMode === "comfy" ? "default" : "ghost"}
                    size="sm"
                    className="h-9 px-2.5 rounded-none border-0 text-xs gap-1.5"
                    onClick={() => setViewMode("comfy")}
                    title="Comfy view"
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === "compact" ? "default" : "ghost"}
                    size="sm"
                    className="h-9 px-2.5 rounded-none border-0 border-l text-xs gap-1.5"
                    onClick={() => setViewMode("compact")}
                    title="Compact view"
                  >
                    <List className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center border-t border-dashed">
              <TestTube className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No test cases found</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* DESKTOP VIEW - Expandable List */}
              <div className="hidden lg:block overflow-x-auto w-full border-t">
                {groupByModule && groupedByModule ? (
                  Object.entries(groupedByModule)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([moduleName, moduleTCs]) => {
                      const isCollapsed = collapsedModules.has(moduleName);
                      return (
                        <div key={moduleName}>
                          <div
                            className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b cursor-pointer hover:bg-muted/50 transition-colors select-none"
                            onClick={() => toggleModuleCollapse(moduleName)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-sm">{moduleName}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 ml-1">{moduleTCs.length}</Badge>
                          </div>
                          {!isCollapsed && (
                            <Table className="w-full text-sm">
                              <TableBody>
                                {moduleTCs.map((tc: any) => tcTableRow(tc))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      );
                    })
                ) : (
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-b">
                        <th className="w-12 pl-4 py-3">
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={toggleSelectAll}
                          />
                        </th>
                        <th className="w-8"></th>
                        <th className="font-semibold text-muted-foreground text-left">
                          Title
                        </th>
                        {viewMode === "comfy" && (
                          <th className="w-40 font-semibold text-muted-foreground text-left">
                            Author
                          </th>
                        )}
                        {viewMode === "comfy" && (
                          <th className="w-48 font-semibold text-muted-foreground text-left">
                            Tags
                          </th>
                        )}
                        <th className="w-16"></th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTestCases.map((tc) => tcTableRow(tc))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* MOBILE VIEW - Responsive Cards */}
              <div className="lg:hidden p-4 space-y-4 bg-muted/5">
                {paginatedTestCases.map((tc) => (
                  <Card
                    key={tc.id}
                    className={`relative overflow-hidden shadow-sm transition-colors ${expandedId === tc.id ? "border-primary/50 ring-1 ring-primary/20" : ""}`}
                  >
                    <div className="absolute top-3 right-2 flex gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(tc)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCloneDialog(tc)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate({ id: tc.id })}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardHeader
                      className="p-3 pb-3 cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === tc.id ? null : tc.id)
                      }
                    >
                      <div className="flex items-start gap-3 pr-8">
                        <Checkbox
                          className="mt-1"
                          checked={selectedIds.has(tc.id)}
                          onCheckedChange={() => toggleSelect(tc.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <p className="font-bold text-sm leading-tight">
                              {tc.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <LayoutList className="w-3 h-3" />{" "}
                              {tc.aiAssisted
                                ? tc.authorName ? `AI · ${tc.authorName}` : "AI"
                                : tc.authorName || "—"}
                            </span>
                            {tc.aiAssisted && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] h-4 bg-primary/10 text-primary"
                              >
                                AI
                              </Badge>
                            )}
                            {(tc.executionCount ?? 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[9px] h-4 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                                onClick={(e) => { e.stopPropagation(); setRunsDialogTc(tc); }}
                              >
                                In {tc.executionCount} run{tc.executionCount !== 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {expandedId === tc.id && (
                      <CardContent className="p-3 pt-0 space-y-4 text-sm bg-muted/10 border-t mt-2">
                        <div className="pt-3 space-y-4">
                          <DetailItem
                            label="Redmine Ticket ID"
                            value={tc.redmineUserStory}
                          />
                          <DetailItem label="Scenario" value={tc.scenario} />
                          <DetailItem
                            label="Preconditions"
                            value={tc.preconditions}
                          />
                          <DetailItem
                            label="Test Steps"
                            value={tc.testSteps}
                            isCode
                          />
                          <DetailItem label="Test Data" value={tc.testData} />
                          <DetailItem
                            label="Expected Result"
                            value={tc.expectedResult}
                            highlight
                          />

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
                            <DetailItem label="Tracker" value={tc.tracker} />
                            <DetailItem
                              label="Defect #"
                              value={tc.redmineDefectId}
                            />
                          </div>
                          <DetailItem label="Comments" value={tc.comments} />
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>

              {/* Pagination Footer */}
              {groupByModule ? (
                <div className="px-4 py-3 bg-muted/10 border-t text-xs text-muted-foreground">
                  <span className="font-medium">{filtered.length}</span> case{filtered.length !== 1 ? "s" : ""} across{" "}
                  <span className="font-medium">{groupedByModule ? Object.keys(groupedByModule).length : 0}</span> module{groupedByModule && Object.keys(groupedByModule).length !== 1 ? "s" : ""}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/10 border-t gap-3">
                  <div className="text-xs text-muted-foreground text-center sm:text-left">
                    Showing{" "}
                    <span className="font-medium">
                      {filtered.length === 0
                        ? 0
                        : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium">
                      {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                    </span>{" "}
                    of <span className="font-medium">{filtered.length}</span>{" "}
                    cases
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage >= totalPages || totalPages === 0}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- CLONE DIALOG --- */}
      <Dialog open={cloneDialogOpen} onOpenChange={(o) => { if (!o) { setCloneDialogOpen(false); setTcToClone(null); } }}>
        <DialogContent className="sm:max-w-[440px] w-[95vw] flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-primary" /> Clone Test Case
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <p className="text-sm text-muted-foreground line-clamp-2">
              Cloning: <span className="font-medium text-foreground">{tcToClone?.title}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <SearchableSelect
                value={cloneForm.requirementId ? String(cloneForm.requirementId) : ""}
                onValueChange={(v) => {
                  const req = requirements.find((r: any) => r.id === Number(v));
                  setCloneForm({
                    ...cloneForm,
                    requirementId: Number(v),
                    projectId: req?.projectId ?? cloneForm.projectId,
                    module: req?.module ?? cloneForm.module,
                  });
                }}
                options={requirements.map((r: any) => ({ value: String(r.id), label: r.title }))}
                placeholder="Select requirement..."
                searchPlaceholder="Search requirement..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={cloneForm.projectId ? String(cloneForm.projectId) : ""}
                onValueChange={(v) => setCloneForm({ ...cloneForm, projectId: Number(v) })}
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                placeholder="Select project..."
                searchPlaceholder="Search project..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Module <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={cloneForm.module ?? ""}
                onValueChange={(v) => setCloneForm({ ...cloneForm, module: v })}
                options={modules.map((m: any) => ({ value: m.name, label: m.name }))}
                placeholder="Select module..."
                searchPlaceholder="Search module..."
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 flex-row justify-end gap-2">
            <Button variant="outline" className="w-auto" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-auto gap-2"
              onClick={handleConfirmClone}
              disabled={!cloneForm.projectId || !cloneForm.module || isCloning}
            >
              {isCloning ? <><Loader2 className="w-4 h-4 animate-spin" /> Cloning...</> : <><Copy className="w-4 h-4" /> Clone</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Clone Dialog */}
      <Dialog open={bulkCloneDialogOpen} onOpenChange={(o) => { if (!o) { setBulkCloneDialogOpen(false); setBulkCloneForm({}); } }}>
        <DialogContent className="sm:max-w-[440px] w-[95vw] flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-primary" /> Clone Test Cases
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Cloning <span className="font-medium text-foreground">{selectedIds.size}</span> selected test case{selectedIds.size !== 1 ? "s" : ""} to:
            </p>
            <div className="space-y-1.5">
              <Label>Requirement <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <SearchableSelect
                value={bulkCloneForm.requirementId ? String(bulkCloneForm.requirementId) : ""}
                onValueChange={(v) => {
                  const req = requirements.find((r: any) => r.id === Number(v));
                  setBulkCloneForm({
                    ...bulkCloneForm,
                    requirementId: Number(v),
                    projectId: req?.projectId ?? bulkCloneForm.projectId,
                    module: req?.module ?? bulkCloneForm.module,
                  });
                }}
                options={requirements.map((r: any) => ({ value: String(r.id), label: r.title }))}
                placeholder="Select requirement..."
                searchPlaceholder="Search requirement..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={bulkCloneForm.projectId ? String(bulkCloneForm.projectId) : ""}
                onValueChange={(v) => setBulkCloneForm({ ...bulkCloneForm, projectId: Number(v) })}
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                placeholder="Select project..."
                searchPlaceholder="Search project..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Module <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={bulkCloneForm.module ?? ""}
                onValueChange={(v) => setBulkCloneForm({ ...bulkCloneForm, module: v })}
                options={modules.map((m: any) => ({ value: m.name, label: m.name }))}
                placeholder="Select module..."
                searchPlaceholder="Search module..."
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4 flex-row justify-end gap-2">
            <Button variant="outline" className="w-auto" onClick={() => setBulkCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-auto gap-2"
              onClick={handleBulkClone}
              disabled={!bulkCloneForm.projectId || !bulkCloneForm.module || isBulkCloning}
            >
              {isBulkCloning ? <><Loader2 className="w-4 h-4 animate-spin" /> Cloning...</> : <><Copy className="w-4 h-4" /> Clone {selectedIds.size}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExecutionRunsDialog tc={runsDialogTc} onClose={() => setRunsDialogTc(null)} />

      <AIGenerateDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        requirements={requirements}
        projects={projects}
        modules={modules}
        users={users}
        trackers={trackers}
        onSuccess={handleAISuccess}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {editingTC ? "Edit Test Case" : "New Test Case"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Case (Title) *</Label>
                <Input
                  placeholder="Test case name"
                  value={form.title ?? ""}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Requirement</Label>
                <SearchableSelect
                  value={form.requirementId ? String(form.requirementId) : ""}
                  onValueChange={(v) => {
                    const reqId = Number(v);
                    const req = requirements.find((r: any) => r.id === reqId);
                    setForm({
                      ...form,
                      requirementId: reqId,
                      projectId: req?.projectId ?? form.projectId,
                    });
                    if (req?.module) {
                      setFormModules(req.module.split(",").map((s: string) => s.trim()).filter(Boolean));
                    }
                  }}
                  options={requirements.map((r: any) => ({ value: String(r.id), label: r.title }))}
                  placeholder="Link to requirement..."
                  searchPlaceholder="Search requirement..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Project <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select project..."
                  searchPlaceholder="Search project..."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Module <span className="text-destructive">*</span></Label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-0.5">
                  {(modules as any[]).map((m: any) => (
                    <label key={m.id ?? m.name} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={formModules.includes(m.name)}
                        onCheckedChange={(checked) => setFormModules(prev => checked ? [...prev, m.name] : prev.filter(n => n !== m.name))}
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
                {formModules.length > 0 && <p className="text-xs text-muted-foreground">{formModules.length} selected</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border p-3 rounded-lg bg-muted/10">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Redmine Ticket ID</Label>
                <Input
                  placeholder="34454"
                  value={form.redmineUserStory ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, redmineUserStory: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <SearchableSelect
                  value={form.tracker ?? ""}
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
              <div className="space-y-1.5">
                <Label>Scenario</Label>
                <Input
                  placeholder="e.g. Login with invalid password"
                  value={form.scenario ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, scenario: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Preconditions</Label>
              <Textarea
                placeholder="Setup required before running this test"
                value={form.preconditions ?? ""}
                onChange={(e) =>
                  setForm({ ...form, preconditions: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Test Steps *</Label>
              <Textarea
                placeholder="1. Step one&#10;2. Step two&#10;3. Step three"
                value={form.testSteps ?? ""}
                onChange={(e) =>
                  setForm({ ...form, testSteps: e.target.value })
                }
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Test Data</Label>
              <Textarea
                placeholder="Variables, credentials, or payloads needed..."
                value={form.testData ?? ""}
                onChange={(e) => setForm({ ...form, testData: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Result *</Label>
              <Textarea
                placeholder="What should happen after running the steps?"
                value={form.expectedResult ?? ""}
                onChange={(e) =>
                  setForm({ ...form, expectedResult: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Redmine Defect #</Label>
                <Input
                  placeholder="34233"
                  value={form.redmineDefectId ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, redmineDefectId: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comments / Issues</Label>
                <Input
                  placeholder="..."
                  value={form.comments ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, comments: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                placeholder="e.g. smoke, ui, regression"
                value={form.tags ?? ""}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !form.title ||
                !form.testSteps ||
                createMutation.isPending ||
                updateMutation.isPending
              }
              className="w-full sm:w-auto"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingTC
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Compile to Execution File Dialog ── */}
      <Dialog open={compileOpen} onOpenChange={(o) => { if (!o) { setCompileOpen(false); setCompileStep("mode"); setCompileTargetTicketId(null); } }}>
        <DialogContent className="sm:max-w-[520px] w-[95vw] flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-4 h-4 text-primary" />
              {compileStep === "mode"
                ? "Compile to Execution File"
                : compileStep === "existing"
                  ? "Select Execution File"
                  : "New Execution File"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-2 pr-1 space-y-4">

            {/* Step: choose mode */}
            {compileStep === "mode" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Compiling <strong>{selectedIds.size}</strong> test case{selectedIds.size !== 1 ? "s" : ""} into an execution file.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleCompileChooseExisting}
                    className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                  >
                    <FolderOpen className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="font-semibold text-sm">Add to Existing</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Append into an existing execution file</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setCompileStep("new")}
                    className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
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

            {/* Step: select existing file */}
            {compileStep === "existing" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ticket ID or title..."
                    value={compileExistingSearch}
                    onChange={(e) => setCompileExistingSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                  {compileExistingFiles.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No execution files found.</p>
                  ) : (
                    compileExistingFiles
                      .filter((f) => {
                        if (!compileExistingSearch) return true;
                        const q = compileExistingSearch.toLowerCase();
                        return f.redmineTicketId?.includes(q) || f.title?.toLowerCase().includes(q);
                      })
                      .map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setCompileTargetTicketId(f.redmineTicketId)}
                          className={`w-full text-left px-4 py-3 border-b last:border-b-0 text-sm hover:bg-muted/50 transition-colors flex items-center gap-3 ${compileTargetTicketId === f.redmineTicketId ? "bg-primary/10 font-medium" : ""}`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${compileTargetTicketId === f.redmineTicketId ? "bg-primary" : "bg-transparent border border-border"}`} />
                          <div>
                            <span className="font-semibold text-primary">#{f.redmineTicketId}</span>
                            {f.title && <span className="ml-2 text-muted-foreground">{f.title}</span>}
                          </div>
                        </button>
                      ))
                  )}
                </div>
                {compileTargetTicketId && (
                  <p className="text-xs text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">#{compileTargetTicketId}</span>
                  </p>
                )}
              </div>
            )}

            {/* Step: create new execution file */}
            {compileStep === "new" && (() => {
              const canCompileNew =
                !!compileNewForm.redmineTicketId.trim() &&
                !!compileNewForm.projectId &&
                compileNewForm.selectedModules.length > 0;
              return (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="e.g. 38032"
                      value={compileNewForm.redmineTicketId}
                      onChange={(e) => setCompileNewForm({ ...compileNewForm, redmineTicketId: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input
                      value={compileNewForm.title}
                      onChange={(e) => setCompileNewForm({ ...compileNewForm, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Requirement <span className="text-xs text-muted-foreground">(optional — auto-fills Project & Module)</span></Label>
                    <SearchableSelect
                      value={compileNewForm.requirementId}
                      onValueChange={(v) => {
                        const req = requirements.find((r: any) => r.id === Number(v));
                        const matchedMod = req?.module ? modules.find((m: any) => m.name === req.module) : null;
                        setCompileNewForm({
                          ...compileNewForm,
                          requirementId: v,
                          projectId: req?.projectId ? String(req.projectId) : compileNewForm.projectId,
                          tracker: req?.tracker ?? compileNewForm.tracker,
                          selectedModules: matchedMod ? [matchedMod.id] : compileNewForm.selectedModules,
                        });
                      }}
                      options={[
                        { value: "", label: "None" },
                        ...requirements.map((r: any) => ({ value: String(r.id), label: r.title })),
                      ]}
                      placeholder="Search requirement..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Project <span className="text-destructive">*</span></Label>
                    <SearchableSelect
                      value={compileNewForm.projectId}
                      onValueChange={(v) => setCompileNewForm({ ...compileNewForm, projectId: v })}
                      options={[
                        { value: "", label: "Select project..." },
                        ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                      ]}
                      placeholder="Search project..."
                    />
                  </div>
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
                              checked={compileNewForm.selectedModules.includes(m.id)}
                              onChange={(e) => setCompileNewForm({
                                ...compileNewForm,
                                selectedModules: e.target.checked
                                  ? [...compileNewForm.selectedModules, m.id]
                                  : compileNewForm.selectedModules.filter((id) => id !== m.id),
                              })}
                            />
                            {m.name}
                          </label>
                        ))
                      }
                    </div>
                    {compileNewForm.selectedModules.length > 0 && (
                      <p className="text-xs text-muted-foreground">{compileNewForm.selectedModules.length} module(s) selected</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Tracker</Label>
                    <SearchableSelect
                      value={compileNewForm.tracker}
                      onValueChange={(v) => setCompileNewForm({ ...compileNewForm, tracker: v })}
                      options={[
                        { value: "", label: "None" },
                        ...(trackers as any[]).map((t: any) => ({ value: t.name, label: t.name })),
                        ...(compileNewForm.tracker && !(trackers as any[]).some((t: any) => t.name === compileNewForm.tracker)
                          ? [{ value: compileNewForm.tracker, label: compileNewForm.tracker }]
                          : []),
                      ]}
                      placeholder="Select tracker..."
                      searchPlaceholder="Search tracker..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Remarks</Label>
                    <Input
                      value={compileNewForm.remarks}
                      onChange={(e) => setCompileNewForm({ ...compileNewForm, remarks: e.target.value })}
                    />
                  </div>
                  <div className="pt-1">
                    <Button
                      className="w-full gap-2"
                      onClick={handleCompileConfirm}
                      disabled={!canCompileNew || isCompiling}
                    >
                      {isCompiling
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating & Compiling...</>
                        : <><PackagePlus className="w-4 h-4" /> Compile {selectedIds.size} test case{selectedIds.size !== 1 ? "s" : ""}</>
                      }
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="shrink-0 border-t pt-3 gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (compileStep === "mode") { setCompileOpen(false); }
                else { setCompileStep("mode"); setCompileTargetTicketId(null); }
              }}
              disabled={isCompiling}
            >
              {compileStep === "mode" ? "Cancel" : "Back"}
            </Button>
            {compileStep === "existing" && (
              <Button
                onClick={handleCompileConfirm}
                disabled={!compileTargetTicketId || isCompiling}
                className="gap-2"
              >
                {isCompiling
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling...</>
                  : <><PackagePlus className="w-4 h-4" /> Compile {selectedIds.size} test case{selectedIds.size !== 1 ? "s" : ""}</>
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={setIsBulkDeleteDialogOpen}
      >
        <DialogContent className="w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} Test Cases?</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete the {selectedIds.size}{" "}
              selected test case{selectedIds.size !== 1 ? "s" : ""}? This action
              cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button
              variant="outline"
              onClick={() => setIsBulkDeleteDialogOpen(false)}
              disabled={isDeletingBulk}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isDeletingBulk}
              className="w-full sm:w-auto"
            >
              {isDeletingBulk ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}{" "}
              Delete Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}