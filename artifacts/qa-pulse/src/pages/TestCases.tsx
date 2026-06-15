import { useState, useMemo, useEffect } from "react";
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
  type TestCaseInput,
  type AIGenerateInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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
  AlignLeft
} from "lucide-react";
import React from "react";
import { format } from "date-fns";
import ExcelJS from "exceljs";

const COL_WIDTHS = [ 15, 25, 35, 30, 35, 50, 20, 40, 25, 20, 20 ];

async function exportToExcel(testCases: any[], projectsMap: Record<number, string>) {
  const rows = testCases.map((tc) => ({
    "Case ID": `TC-${tc.id}`,
    "User Story": tc.redmineUserStory ?? "",
    "Tracker": tc.tracker ?? "",
    "Scenario": tc.scenario ?? "",
    "Pre Condition": tc.preconditions ?? "",
    "Case": tc.title ?? "",
    "Test Steps": tc.testSteps ?? "",
    "Test Data": tc.testData ?? "",
    "Expected Result": tc.expectedResult ?? "",
    "Result": "",
    "Redmine Defect": tc.redmineDefectId ?? "",
    "Additional/Comments/Issues": tc.comments ?? "",
    "QA PIC": tc.qaPic ?? tc.authorName ?? "",
  }));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Test Cases");

  const templateHeaders = [
    "Case ID", "User Story", "Tracker", "Scenario", "Pre Condition", "Case", 
    "Test Steps", "Test Data", "Expected Result", "Result", "Redmine Defect", 
    "Additional/Comments/Issues", "QA PIC"
  ];

  worksheet.columns = templateHeaders.map((header, i) => ({ header, key: header, width: COL_WIDTHS[i] ?? 20 }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };

  if (rows.length > 0) rows.forEach((row) => worksheet.addRow(row));

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `test-cases-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AIGenerateDialog({ open, onClose, requirements, projects, users, onSuccess }: any) {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState<Partial<AIGenerateInput & { projectId?: number; authorId?: number }>>({
    generatePositive: true, generateNegative: false, generateEdgeCases: false,
  });
  const [availableReqs, setAvailableReqs] = useState<any[]>([]);
  const [selectedReqIds, setSelectedReqIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<any[]>([]);
  const [step, setStep] = useState<"form" | "preview">("form");
  const generateMutation = useGenerateTestCasesWithAI();

  const handleGenerate = () => {
    if (!form.requirementTitle) return;

    // Combine checked Parent and Child descriptions into a single block for the AI prompt
    const selectedDesc = availableReqs
      .filter(r => selectedReqIds.has(r.id))
      .map(r => `${r.parentId ? 'Child' : 'Parent'} [${r.redmineTicketId ? '#' + r.redmineTicketId : 'ID:' + r.id}] ${r.title}:\n${r.description || 'No description'}`)
      .join("\n\n---\n\n");

    generateMutation.mutate({ data: { ...form, requirementDescription: selectedDesc } as AIGenerateInput }, {
      onSuccess: (data) => {
        setPreview(data.testCases ?? []);
        setStep("preview");
      },
    });
  };

  const toggleReqSelection = (id: number) => {
    setSelectedReqIds(prev => {
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
    setForm({ generatePositive: true, generateNegative: false, generateEdgeCases: false });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Test Case Generation
          </DialogTitle>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project (optional)</Label>
                <Select value={form.projectId ? String(form.projectId) : ""} onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select a project..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {projects.map((p: any) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Base Requirement (optional)</Label>
                <Select
                  value={form.requirementId ? String(form.requirementId) : ""}
                  onValueChange={(v) => {
                    const reqId = Number(v);
                    const req = requirements.find((r: any) => r.id === reqId);
                    if (req) {
                      const children = requirements.filter((r: any) => r.parentId === req.id);
                      const combined = [req, ...children];
                      setAvailableReqs(combined);
                      setSelectedReqIds(new Set(combined.map(c => c.id)));

                      setForm({
                        ...form,
                        requirementId: reqId,
                        requirementTitle: req.title,
                        module: req.module ?? "",
                      });
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a requirement..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {requirements.map((r: any) => (<SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {availableReqs.length > 0 && (
              <div className="space-y-2 bg-muted/20 p-3 rounded border">
                <Label className="text-xs text-muted-foreground uppercase font-bold">Requirement Scope Selection</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {availableReqs.map(r => (
                    <div key={r.id} className="flex items-start gap-2 bg-background p-2 border rounded shadow-sm">
                      <Checkbox checked={selectedReqIds.has(r.id)} onCheckedChange={() => toggleReqSelection(r.id)} id={`req-${r.id}`} className="mt-1" />
                      <label htmlFor={`req-${r.id}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${r.parentId ? 'bg-indigo-100 text-indigo-700' : 'bg-primary/10 text-primary'}`}>
                            {r.parentId ? 'Child' : 'Parent'}
                          </span>
                          <span className="text-sm font-semibold">{r.redmineTicketId ? `#${r.redmineTicketId} ` : ''}{r.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.description || "No description provided."}</p>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Test Case Scope / Title *</Label>
              <Input placeholder="e.g. User Login Validation" value={form.requirementTitle ?? ""} onChange={(e) => setForm({ ...form, requirementTitle: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Input placeholder="e.g. Auth" value={form.module ?? ""} onChange={(e) => setForm({ ...form, module: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Assign Author</Label>
                <Select value={form.authorId ? String(form.authorId) : ""} onValueChange={(v) => setForm({ ...form, authorId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Current User" /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {users.map((u: any) => (<SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Notes</Label>
              <Textarea placeholder="Any specific scenarios or edge cases to focus on..." value={form.additionalNotes ?? ""} onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })} rows={2} />
            </div>

            <div className="space-y-2 pt-2">
              <Label>Generation Targets</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2"><Checkbox checked={form.generatePositive ?? true} onCheckedChange={(v) => setForm({ ...form, generatePositive: !!v })} id="pos" /><label htmlFor="pos" className="text-sm">Positive Path</label></div>
                <div className="flex items-center gap-2"><Checkbox checked={form.generateNegative ?? false} onCheckedChange={(v) => setForm({ ...form, generateNegative: !!v })} id="neg" /><label htmlFor="neg" className="text-sm">Negative Scenarios</label></div>
                <div className="flex items-center gap-2"><Checkbox checked={form.generateEdgeCases ?? false} onCheckedChange={(v) => setForm({ ...form, generateEdgeCases: !!v })} id="edge" /><label htmlFor="edge" className="text-sm">Edge Cases</label></div>
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
                    <p className="font-medium text-sm">{tc.title}</p>
                    {tc.scenario && <p className="text-xs text-muted-foreground"><strong className="text-foreground">Scenario:</strong> {tc.scenario}</p>}
                    {tc.testSteps && <div className="text-xs bg-muted/50 rounded p-2 whitespace-pre-line font-mono mt-2">{tc.testSteps}</div>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
          <Button variant="outline" onClick={handleClose} className="w-full sm:w-auto">Cancel</Button>
          {step === "form" ? (
            <Button onClick={handleGenerate} disabled={!form.requirementTitle || generateMutation.isPending} className="gap-2 w-full sm:w-auto">
              {generateMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Sparkles className="w-4 h-4" />Generate</>}
            </Button>
          ) : (
            <Button onClick={() => { onSuccess(preview, form); handleClose(); }} className="gap-2 w-full sm:w-auto">
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
  const [filterProject, setFilterProject] = useState("all");
  const [filterAI, setFilterAI] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const [editingTC, setEditingTC] = useState<any | null>(null);
  const [form, setForm] = useState<Partial<any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const { data: testCases = [], isLoading } = useQuery({ queryKey: getListTestCasesQueryKey(), queryFn: () => listTestCases() });
  const { data: projects = [] } = useQuery({ queryKey: getListProjectsQueryKey(), queryFn: () => listProjects() });
  const { data: users = [] } = useQuery({ queryKey: getListUsersQueryKey(), queryFn: () => listUsers() });
  const { data: requirements = [] } = useQuery({ queryKey: getListRequirementsQueryKey(), queryFn: () => listRequirements() });

  const projectsMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const requirementsMap = useMemo(() => Object.fromEntries(requirements.map((r) => [r.id, r.title])), [requirements]);

  useEffect(() => { setCurrentPage(1); }, [search, filterProject, filterAI, sortBy]);

  const createMutation = useCreateTestCase({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() }); setDialogOpen(false); setForm({}); toast({ title: "Test case created" }); },
    },
  });

  const updateMutation = useUpdateTestCase({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() }); setDialogOpen(false); setEditingTC(null); toast({ title: "Test case updated" }); },
    },
  });

  const deleteMutation = useDeleteTestCase({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() }); } },
  });

  const cloneMutation = useCloneTestCase({
    mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() }); toast({ title: "Test case cloned" }); } },
  });

  const filtered = useMemo(() => {
    let result = testCases.filter((t) => {
      if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
      if (filterAI === "ai" && !t.aiAssisted) return false;
      if (filterAI === "manual" && t.aiAssisted) return false;
      if (search) {
        const query = search.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(query);
        const matchStory = t.redmineUserStory?.toLowerCase().includes(query);
        const matchTracker = t.tracker?.toLowerCase().includes(query);
        if (!matchTitle && !matchStory && !matchTracker) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return 0;
    });

    return result;
  }, [testCases, search, filterProject, filterAI, sortBy]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedTestCases = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const filteredIds = useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);
  const selectedInView = filtered.filter((t) => selectedIds.has(t.id));
  const allFilteredSelected = filtered.length > 0 && selectedInView.length === filtered.length;
  const someFilteredSelected = selectedInView.length > 0 && !allFilteredSelected;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); filteredIds.forEach((id) => next.add(id)); return next; });
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const toExport = selectedIds.size > 0 ? testCases.filter((t) => selectedIds.has(t.id)) : filtered;
    if (toExport.length === 0) return toast({ variant: "destructive", title: "No test cases to export" });
    exportToExcel(toExport, projectsMap, requirementsMap).then(() => toast({ title: "Export complete" }));
  };

  const handleBulkDelete = async () => {
    setIsDeletingBulk(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => deleteMutation.mutateAsync({ id })));
      toast({ title: `Deleted ${selectedIds.size} cases` });
      setSelectedIds(new Set());
      setIsBulkDeleteDialogOpen(false);
    } finally { setIsDeletingBulk(false); }
  };

  const openCreate = () => {
    setEditingTC(null);
    setForm({ status: "active" });
    setDialogOpen(true);
  };

  const openEdit = (tc: any) => {
    setEditingTC(tc);
    setForm({
      title: tc.title,
      redmineUserStory: tc.redmineUserStory,
      tracker: tc.tracker,
      scenario: tc.scenario,
      preconditions: tc.preconditions,
      testSteps: tc.testSteps,
      testData: tc.testData,
      expectedResult: tc.expectedResult,
      redmineDefectId: tc.redmineDefectId,
      comments: tc.comments,
      qaPic: tc.qaPic,
      requirementId: tc.requirementId ?? undefined,
      projectId: tc.projectId ?? undefined,
      authorId: tc.authorId ?? undefined,
      status: tc.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title?.trim() || !form.testSteps?.trim() || !form.expectedResult?.trim()) {
      toast({ variant: "destructive", title: "Title, Steps, and Expected Result are required" });
      return;
    }
    if (editingTC) updateMutation.mutate({ id: editingTC.id, data: form as any });
    else createMutation.mutate({ data: { ...form, aiAssisted: false } as any });
  };

  const handleAISuccess = (aiTestCases: any[], formData: any) => {
    const promises = aiTestCases.map((tc) =>
      createMutation.mutateAsync({
        data: {
          title: tc.title,
          redmineUserStory: tc.redmineUserStory,
          tracker: tc.tracker,
          scenario: tc.scenario,
          preconditions: tc.preconditions,
          testSteps: tc.testSteps,
          testData: tc.testData,
          expectedResult: tc.expectedResult,
          status: "active",
          aiAssisted: true,
          requirementId: formData?.requirementId,
          projectId: formData?.projectId,
          authorId: formData?.authorId || user?.id,
        } as any,
      }),
    );
    Promise.all(promises).then(() => {
      queryClient.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
      toast({ title: `${aiTestCases.length} AI cases saved` });
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TestTube className="w-7 h-7 text-primary" /> Test Cases
          </h1>
          <p className="text-muted-foreground mt-1">
            {testCases.length} test cases · {testCases.filter(t => t.aiAssisted).length} AI-assisted
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 w-full sm:w-auto">
            <FileSpreadsheet className="w-4 h-4" />
            {selectedIds.size > 0 ? `Export ${selectedIds.size}` : "Export"}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => setAiDialogOpen(true)} className="gap-2 flex-1 sm:flex-none">
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
            <span><strong>{selectedIds.size}</strong> test case{selectedIds.size !== 1 ? "s" : ""} selected</span>
          </div>
          <div className="sm:ml-auto flex w-full sm:w-auto items-center gap-2">
            <Button variant="destructive" size="sm" className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1" onClick={() => setIsBulkDeleteDialogOpen(true)}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
            <Button variant="ghost" size="sm" className="h-8 flex-1 sm:flex-none px-2 text-xs gap-1" onClick={() => setSelectedIds(new Set())}>
              <X className="w-3 h-3" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative w-full lg:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search case name, story, tracker..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-full" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 w-full lg:w-auto shrink-0">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-muted/30">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground hidden sm:block" />
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterAI} onValueChange={setFilterAI}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI Assisted</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center border-t border-dashed">
              <TestTube className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No test cases found</p>
            </div>
          ) : (
            <div className="flex flex-col">

              {/* DESKTOP VIEW - Horizontal Scrolling Table */}
              <div className="hidden lg:block overflow-x-auto w-full border-t">
                <Table className="w-full text-xs min-w-[2000px]">
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <th className="w-12 pl-4 py-3"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} /></th>
                      <th className="w-40 font-semibold text-left">Case (Title)</th>
                      <th className="w-32 font-semibold text-left">User Story</th>
                      <th className="w-24 font-semibold text-left">Tracker</th>
                      <th className="w-48 font-semibold text-left">Scenario</th>
                      <th className="w-64 font-semibold text-left">Test Steps</th>
                      <th className="w-32 font-semibold text-left">Test Data</th>
                      <th className="w-48 font-semibold text-left">Expected Result</th>
                      <th className="w-24 font-semibold text-left">Defect #</th>
                      <th className="w-24 font-semibold text-left">QA PIC</th>
                      <th className="w-32 font-semibold text-left">Comments</th>
                      <th className="w-16"></th>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTestCases.map((tc) => (
                      <TableRow key={tc.id} className="hover:bg-muted/40 align-top">
                        <TableCell className="pl-4 pt-3"><Checkbox checked={selectedIds.has(tc.id)} onCheckedChange={() => toggleSelect(tc.id)} /></TableCell>
                        <TableCell className="pt-3">
                          <p className="font-bold mb-1 line-clamp-2">{tc.title}</p>
                          {tc.aiAssisted && <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary">AI</Badge>}
                        </TableCell>
                        <TableCell className="pt-3 break-words text-muted-foreground">{tc.redmineUserStory}</TableCell>
                        <TableCell className="pt-3">{tc.tracker}</TableCell>
                        <TableCell className="pt-3 whitespace-pre-wrap">{tc.scenario}</TableCell>
                        <TableCell className="pt-3 whitespace-pre-wrap font-mono text-[10px]">{tc.testSteps}</TableCell>
                        <TableCell className="pt-3 whitespace-pre-wrap">{tc.testData}</TableCell>
                        <TableCell className="pt-3 whitespace-pre-wrap text-green-700 dark:text-green-400">{tc.expectedResult}</TableCell>
                        <TableCell className="pt-3">{tc.redmineDefectId}</TableCell>
                        <TableCell className="pt-3">{tc.qaPic}</TableCell>
                        <TableCell className="pt-3 break-words">{tc.comments}</TableCell>
                        <TableCell className="pt-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(tc)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => cloneMutation.mutate({ id: tc.id })}><Copy className="w-4 h-4 mr-2" />Clone</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate({ id: tc.id })}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* MOBILE VIEW - Responsive Cards */}
              <div className="lg:hidden p-4 space-y-4 bg-muted/5">
                {paginatedTestCases.map((tc) => (
                  <Card key={tc.id} className="relative overflow-hidden shadow-sm">
                    <div className="absolute top-3 right-2 flex gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(tc)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => cloneMutation.mutate({ id: tc.id })}><Copy className="w-4 h-4 mr-2" />Clone</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate({ id: tc.id })}><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardHeader className="p-3 pb-0 border-b bg-muted/10">
                      <div className="flex items-start gap-3 pr-8">
                        <Checkbox className="mt-1" checked={selectedIds.has(tc.id)} onCheckedChange={() => toggleSelect(tc.id)} />
                        <div>
                          <p className="font-bold text-sm leading-tight">{tc.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {tc.tracker && <Badge variant="outline" className="text-[10px]">{tc.tracker}</Badge>}
                            {tc.aiAssisted && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">AI Gen</Badge>}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-3 text-sm">
                      {tc.redmineUserStory && <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">User Story</span><p>{tc.redmineUserStory}</p></div>}
                      {tc.scenario && <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Scenario</span><p className="whitespace-pre-wrap">{tc.scenario}</p></div>}
                      {tc.testSteps && <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Test Steps</span><div className="bg-muted p-2 rounded text-xs font-mono whitespace-pre-wrap">{tc.testSteps}</div></div>}
                      {tc.expectedResult && <div><span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">Expected Result</span><p className="text-green-700 dark:text-green-400 whitespace-pre-wrap">{tc.expectedResult}</p></div>}

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
                        <div><span className="text-[10px] uppercase font-bold text-muted-foreground block">Defect #</span><p className="truncate">{tc.redmineDefectId || "—"}</p></div>
                        <div><span className="text-[10px] uppercase font-bold text-muted-foreground block">QA PIC</span><p className="truncate">{tc.qaPic || tc.authorName || "—"}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/10 border-t gap-3">
                <div className="text-xs text-muted-foreground text-center sm:text-left">
                  Showing <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> cases
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AIGenerateDialog open={aiDialogOpen} onClose={() => setAiDialogOpen(false)} requirements={requirements} projects={projects} users={users} onSuccess={handleAISuccess} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader><DialogTitle>{editingTC ? "Edit Test Case" : "New Test Case"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Case (Title) *</Label>
                <Input placeholder="Test case name" value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={form.projectId ? String(form.projectId) : ""} onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">{projects.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Requirement</Label>
                <Select value={form.requirementId ? String(form.requirementId) : ""} onValueChange={(v) => setForm({ ...form, requirementId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Link to..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">{requirements.map((r) => (<SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border p-3 rounded-lg bg-muted/10">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Redmine User Story</Label>
                <Input placeholder="e.g. As a user, I want to..." value={form.redmineUserStory ?? ""} onChange={(e) => setForm({ ...form, redmineUserStory: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <Input placeholder="e.g. Bug, Feature" value={form.tracker ?? ""} onChange={(e) => setForm({ ...form, tracker: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Scenario</Label>
                <Input placeholder="e.g. Login with invalid password" value={form.scenario ?? ""} onChange={(e) => setForm({ ...form, scenario: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Preconditions</Label>
              <Textarea placeholder="Setup required before running this test" value={form.preconditions ?? ""} onChange={(e) => setForm({ ...form, preconditions: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Test Steps *</Label>
              <Textarea placeholder="1. Step one&#10;2. Step two&#10;3. Step three" value={form.testSteps ?? ""} onChange={(e) => setForm({ ...form, testSteps: e.target.value })} rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Test Data</Label>
              <Textarea placeholder="Variables, credentials, or payloads needed..." value={form.testData ?? ""} onChange={(e) => setForm({ ...form, testData: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Result *</Label>
              <Textarea placeholder="What should happen after running the steps?" value={form.expectedResult ?? ""} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} rows={2} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Defect #</Label>
                <Input placeholder="e.g. 12345" value={form.redmineDefectId ?? ""} onChange={(e) => setForm({ ...form, redmineDefectId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>QA PIC</Label>
                <Input placeholder="e.g. John Doe" value={form.qaPic ?? ""} onChange={(e) => setForm({ ...form, qaPic: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Comments / Issues</Label>
                <Input placeholder="..." value={form.comments ?? ""} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title || !form.testSteps || createMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingTC ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full">
          <DialogHeader><DialogTitle>Delete {selectedIds.size} Test Cases?</DialogTitle></DialogHeader>
          <div className="py-2"><p className="text-sm text-muted-foreground">Are you sure you want to permanently delete the {selectedIds.size} selected test case{selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.</p></div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={isDeletingBulk} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeletingBulk} className="w-full sm:w-auto">
              {isDeletingBulk ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete Item(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}