import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTestCases, getListTestCasesQueryKey,
  listProjects, getListProjectsQueryKey,
  listUsers, getListUsersQueryKey,
  listRequirements, getListRequirementsQueryKey,
  useCreateTestCase, useUpdateTestCase, useDeleteTestCase, useCloneTestCase, useGenerateTestCasesWithAI,
  type TestCase, type TestCaseInput, type AIGenerateInput
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, Copy,
  TestTube, Sparkles, Loader2, ChevronDown, FileSpreadsheet, X
} from "lucide-react";
import React from "react";
import { format } from "date-fns";
import ExcelJS from "exceljs";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const TYPE_COLORS: Record<string, string> = {
  manual: "bg-slate-100 text-slate-700",
  automation_candidate: "bg-emerald-100 text-emerald-700",
};

const COL_WIDTHS = [4, 6, 40, 22, 10, 10, 12, 20, 30, 18, 20, 40, 30, 50, 40, 18];

async function exportToExcel(testCases: TestCase[], projectsMap: Record<number, string>, requirementsMap: Record<number, string>) {
  const rows = testCases.map((tc, idx) => ({
    "#": idx + 1,
    "ID": tc.id,
    "Title": tc.title,
    "Type": tc.type === "automation_candidate" ? "Automation Candidate" : "Manual",
    "Priority": tc.priority.charAt(0).toUpperCase() + tc.priority.slice(1),
    "Status": tc.status.charAt(0).toUpperCase() + tc.status.slice(1),
    "AI Assisted": tc.aiAssisted ? "Yes" : "No",
    "Project": tc.projectId ? (projectsMap[tc.projectId] ?? "") : "",
    "Requirement": tc.requirementId ? (requirementsMap[tc.requirementId] ?? "") : "",
    "Author": tc.authorName ?? "",
    "Tags": tc.tags ?? "",
    "Objective": tc.objective ?? "",
    "Preconditions": tc.preconditions ?? "",
    "Test Steps": tc.testSteps ?? "",
    "Expected Result": tc.expectedResult ?? "",
    "Created At": format(new Date(tc.createdAt), "yyyy-MM-dd HH:mm"),
  }));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Test Cases");

  if (rows.length > 0) {
    worksheet.columns = Object.keys(rows[0]).map((key, i) => ({
      header: key,
      key,
      width: COL_WIDTHS[i] ?? 15,
    }));
    rows.forEach((row) => worksheet.addRow(row));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `test-cases-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AIGenerateDialog({
  open, onClose, requirements, projects, onSuccess
}: {
  open: boolean;
  onClose: () => void;
  requirements: any[];
  projects: any[];
  onSuccess: (testCases: any[]) => void;
}) {
  const [form, setForm] = useState<Partial<AIGenerateInput>>({
    generatePositive: true,
    generateNegative: false,
    generateEdgeCases: false,
  });
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState<"form" | "preview">("form");
  const generateMutation = useGenerateTestCasesWithAI();

  const handleGenerate = () => {
    if (!form.requirementTitle) return;
    generateMutation.mutate(
      { data: form as AIGenerateInput },
      {
        onSuccess: (data) => {
          setPreview(data.testCases ?? []);
          setStep("preview");
        },
      }
    );
  };

  const handleClose = () => {
    setStep("form");
    setPreview([]);
    setForm({ generatePositive: true, generateNegative: false, generateEdgeCases: false });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Test Case Generation
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Requirement (optional)</Label>
              <Select
                value={form.requirementId ? String(form.requirementId) : ""}
                onValueChange={(v) => {
                  const req = requirements.find((r) => r.id === Number(v));
                  setForm({
                    ...form,
                    requirementId: Number(v),
                    requirementTitle: req?.title ?? "",
                    requirementDescription: req?.description ?? "",
                    module: req?.module ?? "",
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a requirement..." /></SelectTrigger>
                <SelectContent>
                  {requirements.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Requirement Title *</Label>
              <Input
                placeholder="e.g. User Login with Email and Password"
                value={form.requirementTitle ?? ""}
                onChange={(e) => setForm({ ...form, requirementTitle: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe what needs to be tested..."
                value={form.requirementDescription ?? ""}
                onChange={(e) => setForm({ ...form, requirementDescription: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Input placeholder="e.g. Auth" value={form.module ?? ""} onChange={(e) => setForm({ ...form, module: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority ?? ""} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any specific scenarios or edge cases to focus on..."
                value={form.additionalNotes ?? ""}
                onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Generate</Label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.generatePositive ?? true} onCheckedChange={(v) => setForm({ ...form, generatePositive: !!v })} id="pos" />
                  <label htmlFor="pos" className="text-sm">Positive cases</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.generateNegative ?? false} onCheckedChange={(v) => setForm({ ...form, generateNegative: !!v })} id="neg" />
                  <label htmlFor="neg" className="text-sm">Negative cases</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.generateEdgeCases ?? false} onCheckedChange={(v) => setForm({ ...form, generateEdgeCases: !!v })} id="edge" />
                  <label htmlFor="edge" className="text-sm">Edge cases</label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{preview.length} test case{preview.length !== 1 ? "s" : ""} generated</p>
              <Button variant="outline" size="sm" onClick={() => setStep("form")}>Back</Button>
            </div>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {preview.map((tc, i) => (
                <Card key={i} className="border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{tc.title}</p>
                      <div className="flex gap-1.5 shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[tc.priority] ?? "bg-slate-100 text-slate-700"}`}>
                          {tc.priority}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[tc.type] ?? "bg-slate-100 text-slate-700"}`}>
                          {tc.type?.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    {tc.objective && <p className="text-xs text-muted-foreground">{tc.objective}</p>}
                    {tc.testSteps && (
                      <div className="text-xs bg-muted/50 rounded p-2 whitespace-pre-line">{tc.testSteps}</div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {step === "form" ? (
            <Button
              onClick={handleGenerate}
              disabled={!form.requirementTitle || generateMutation.isPending}
              className="gap-2"
            >
              {generateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Sparkles className="w-4 h-4" />Generate</>}
            </Button>
          ) : (
            <Button onClick={() => { onSuccess(preview); handleClose(); }} className="gap-2">
              <Plus className="w-4 h-4" />Save All ({preview.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TestCases() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterAI, setFilterAI] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [editingTC, setEditingTC] = useState<TestCase | null>(null);
  const [form, setForm] = useState<Partial<TestCaseInput>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: testCases = [], isLoading } = useQuery({
    queryKey: getListTestCasesQueryKey(),
    queryFn: () => listTestCases(),
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

  const projectsMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects]
  );
  const requirementsMap = useMemo(
    () => Object.fromEntries(requirements.map((r) => [r.id, r.title])),
    [requirements]
  );

  const createMutation = useCreateTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        setDialogOpen(false);
        setForm({});
        toast({ title: "Test case created" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to create test case" }),
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
      onError: () => toast({ variant: "destructive", title: "Failed to update test case" }),
    },
  });

  const deleteMutation = useDeleteTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        toast({ title: "Test case deleted" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to delete" }),
    },
  });

  const cloneMutation = useCloneTestCase({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        toast({ title: "Test case cloned" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to clone" }),
    },
  });

  const filtered = testCases.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
    if (filterAI === "ai" && !t.aiAssisted) return false;
    if (filterAI === "manual" && t.aiAssisted) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredIds = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const selectedInView = filtered.filter((t) => selectedIds.has(t.id));
  const allFilteredSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const someFilteredSelected = selectedInView.length > 0 && !allFilteredSelected;

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

  const handleExport = () => {
    const toExport = selectedIds.size > 0
      ? testCases.filter((t) => selectedIds.has(t.id))
      : filtered;
    if (toExport.length === 0) {
      toast({ variant: "destructive", title: "No test cases to export" });
      return;
    }
    exportToExcel(toExport, projectsMap, requirementsMap).then(() => {
      toast({ title: `Exported ${toExport.length} test case${toExport.length !== 1 ? "s" : ""} to Excel` });
    }).catch(() => {
      toast({ variant: "destructive", title: "Export failed", description: "Could not generate the Excel file." });
    });
  };

  const openCreate = () => {
    setEditingTC(null);
    setForm({ type: "manual", priority: "medium", status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (tc: TestCase) => {
    setEditingTC(tc);
    setForm({
      title: tc.title,
      objective: tc.objective ?? undefined,
      preconditions: tc.preconditions ?? undefined,
      testSteps: tc.testSteps ?? undefined,
      expectedResult: tc.expectedResult ?? undefined,
      type: tc.type,
      priority: tc.priority,
      tags: tc.tags ?? undefined,
      requirementId: tc.requirementId ?? undefined,
      projectId: tc.projectId ?? undefined,
      authorId: tc.authorId ?? undefined,
      status: tc.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title?.trim()) {
      toast({ variant: "destructive", title: "Title is required" });
      return;
    }
    if (!form.objective?.trim()) {
      toast({ variant: "destructive", title: "Objective is required" });
      return;
    }
    if (!form.testSteps?.trim()) {
      toast({ variant: "destructive", title: "Test Steps are required" });
      return;
    }
    if (!form.expectedResult?.trim()) {
      toast({ variant: "destructive", title: "Expected Result is required" });
      return;
    }
    if (editingTC) {
      updateMutation.mutate({ id: editingTC.id, data: form as any });
    } else {
      createMutation.mutate({ data: { ...form, aiAssisted: false } as TestCaseInput });
    }
  };

  const handleAISuccess = (aiTestCases: any[]) => {
    const promises = aiTestCases.map((tc) =>
      createMutation.mutateAsync({
        data: {
          title: tc.title,
          objective: tc.objective,
          preconditions: tc.preconditions,
          testSteps: tc.testSteps,
          expectedResult: tc.expectedResult,
          type: tc.type ?? "manual",
          priority: tc.priority ?? "medium",
          tags: tc.tags,
          status: "active",
          aiAssisted: true,
        } as TestCaseInput,
      })
    );
    Promise.all(promises)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
        toast({ title: `${aiTestCases.length} AI test cases saved` });
      })
      .catch(() => toast({ variant: "destructive", title: "Some test cases failed to save" }));
  };

  const aiCount = testCases.filter((t) => t.aiAssisted).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TestTube className="w-7 h-7 text-primary" /> Test Cases
          </h1>
          <p className="text-muted-foreground mt-1">
            {testCases.length} test cases · {aiCount} AI-assisted
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {selectedIds.size > 0 ? `Export ${selectedIds.size} selected` : "Export to Excel"}
          </Button>
          <Button variant="outline" onClick={() => setAiDialogOpen(true)} className="gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Generate
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Test Case
          </Button>
        </div>
      </div>

      {/* Selection banner */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span>
            <strong>{selectedIds.size}</strong> test case{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs gap-1"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-3 h-3" /> Clear selection
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search test cases..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="automation_candidate">Automation</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAI} onValueChange={setFilterAI}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="ai">AI Assisted</SelectItem>
                <SelectItem value="manual">Manual Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <TestTube className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No test cases found</p>
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="outline" onClick={() => setAiDialogOpen(true)}><Sparkles className="w-4 h-4 mr-2" />AI Generate</Button>
                <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create Manually</Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allFilteredSelected}
                      data-state={someFilteredSelected ? "indeterminate" : allFilteredSelected ? "checked" : "unchecked"}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tc) => (
                  <React.Fragment key={tc.id}>
                    <TableRow
                      className={`hover:bg-muted/40 cursor-pointer ${selectedIds.has(tc.id) ? "bg-primary/5" : ""}`}
                      onClick={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(tc.id)}
                          onCheckedChange={() => toggleSelect(tc.id)}
                          aria-label={`Select ${tc.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandedId === tc.id ? "rotate-180" : ""}`} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tc.title}</span>
                          {tc.aiAssisted && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                              <Sparkles className="w-3 h-3" />AI
                            </span>
                          )}
                        </div>
                        {tc.requirementTitle && <p className="text-xs text-muted-foreground">{tc.requirementTitle}</p>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[tc.type]}`}>
                          {tc.type === "automation_candidate" ? "Automation" : "Manual"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[tc.priority]}`}>
                          {tc.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{tc.authorName ?? "—"}</TableCell>
                      <TableCell>
                        {tc.tags && (
                          <div className="flex flex-wrap gap-1">
                            {tc.tags.split(",").slice(0, 2).map((tag) => (
                              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag.trim()}</span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(tc)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => cloneMutation.mutate({ id: tc.id })}><Copy className="w-4 h-4 mr-2" />Clone</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedIds(new Set([tc.id])); handleExport(); }}>
                              <FileSpreadsheet className="w-4 h-4 mr-2" />Export this
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
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={8} className="px-8 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            {tc.objective && (
                              <div>
                                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Objective</p>
                                <p>{tc.objective}</p>
                              </div>
                            )}
                            {tc.preconditions && (
                              <div>
                                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Preconditions</p>
                                <p>{tc.preconditions}</p>
                              </div>
                            )}
                            {tc.testSteps && (
                              <div className="md:col-span-2">
                                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Test Steps</p>
                                <div className="bg-card border rounded p-3 whitespace-pre-line font-mono text-xs">{tc.testSteps}</div>
                              </div>
                            )}
                            {tc.expectedResult && (
                              <div className="md:col-span-2">
                                <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-1">Expected Result</p>
                                <p className="text-green-700 dark:text-green-400">{tc.expectedResult}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AIGenerateDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        requirements={requirements}
        projects={projects}
        onSuccess={handleAISuccess}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTC ? "Edit Test Case" : "New Test Case"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="Test case title" value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type ?? "manual"} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automation_candidate">Automation Candidate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority ?? "medium"} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={form.projectId ? String(form.projectId) : ""} onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Requirement</Label>
                <Select value={form.requirementId ? String(form.requirementId) : ""} onValueChange={(v) => setForm({ ...form, requirementId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Link to..." /></SelectTrigger>
                  <SelectContent>{requirements.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Objective</Label>
              <Textarea placeholder="What does this test verify?" value={form.objective ?? ""} onChange={(e) => setForm({ ...form, objective: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Preconditions</Label>
              <Textarea placeholder="Setup required before running this test" value={form.preconditions ?? ""} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Test Steps</Label>
              <Textarea placeholder="1. Step one&#10;2. Step two&#10;3. Step three" value={form.testSteps ?? ""} onChange={(e) => setForm({ ...form, testSteps: e.target.value })} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Result</Label>
              <Textarea placeholder="What should happen after running the steps?" value={form.expectedResult ?? ""} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input placeholder="e.g. smoke, regression, ui" value={form.tags ?? ""} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingTC ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
