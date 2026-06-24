import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRequirements,
  getListRequirementsQueryKey,
  listProjects,
  getListProjectsQueryKey,
  listUsers,
  getListUsersQueryKey,
  useCreateRequirement,
  useUpdateRequirement,
  useDeleteRequirement,
  useCreateProject,
  type Requirement,
  type RequirementInput,
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

import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  FileText,
  FolderPlus,
  Download,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  TestTube,
  LayoutList,
  List,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

// 1. Build the Tree Structure
function buildTree(reqs: any[]) {
  const map = new Map();
  const roots: any[] = [];

  reqs.forEach((req) => {
    map.set(req.id, { ...req, children: [] });
  });

  reqs.forEach((req) => {
    if (req.parentId && map.has(req.parentId)) {
      map.get(req.parentId).children.push(map.get(req.id));
    } else {
      roots.push(map.get(req.id));
    }
  });
  return roots;
}

// 2. Flatten ONLY the nodes that the user has expanded
function flattenVisibleNodes(nodes: any[], expandedSet: Set<number>, depth = 0) {
  let flat: any[] = [];
  for (const node of nodes) {
    flat.push({ ...node, depth });
    if (expandedSet.has(node.id) && node.children && node.children.length > 0) {
      flat = flat.concat(flattenVisibleNodes(node.children, expandedSet, depth + 1));
    }
  }
  return flat;
}

export default function Requirements() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [viewMode, setViewMode] = useState<"comfy" | "compact">(() => {
    try { return (localStorage.getItem("req_view_mode") as "comfy" | "compact") ?? "comfy"; } catch { return "comfy"; }
  });

  const [expandedReqs, setExpandedReqs] = useState<Set<number>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState<Partial<RequirementInput> & { parentRedmineTicketId?: string }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", status: "active" });

  // Redmine Import States
  const [redmineDialogOpen, setRedmineDialogOpen] = useState(false);
  const [redmineInput, setRedmineInput] = useState("");
  const [redmineSelectedProject, setRedmineSelectedProject] = useState<string>("");
  const [reqFormModules, setReqFormModules] = useState<string[]>([]);
  const [redmineSelectedModules, setRedmineSelectedModules] = useState<string[]>([]);
  const [redmineSelectedTracker, setRedmineSelectedTracker] = useState<string>("");
  const [redmineLoading, setRedmineLoading] = useState(false);

  const [selectedReqs, setSelectedReqs] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reqsToDelete, setReqsToDelete] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: getListProjectsQueryKey(),
    queryFn: () => listProjects(),
  });

  const { data: executionModules = [] } = useQuery({
    queryKey: ["executionModules"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/modules`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: redmineTrackers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["redmineTrackers"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/redmine/trackers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    try { localStorage.setItem("req_view_mode", viewMode); } catch {}
  }, [viewMode]);

  const moduleOptions = useMemo(() => {
    const seen = new Set<string>();
    const mods: string[] = [];
    for (const r of requirements as any[]) {
      if (r.module && !seen.has(r.module)) { seen.add(r.module); mods.push(r.module); }
    }
    return mods.sort();
  }, [requirements]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedReqs([]);
  }, [search, filterPriority, filterProject, filterModule, sortBy]);

  const createMutation = useCreateRequirement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRequirementsQueryKey() });
        setDialogOpen(false);
        setForm({});
        setErrors({});
        toast({ title: "Requirement created" });
      },
    },
  });

  const updateMutation = useUpdateRequirement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListRequirementsQueryKey() });
        setDialogOpen(false);
        setEditingReq(null);
        setErrors({});
        toast({ title: "Requirement updated", description: "Changes saved (and cascaded to subtasks if applicable)." });
      },
    },
  });

  const deleteMutation = useDeleteRequirement({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListRequirementsQueryKey() }),
    },
  });

  const createProjectMutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setProjectDialogOpen(false);
        setProjectForm({ name: "", description: "", status: "active" });
        toast({ title: "Project created" });
      },
    },
  });

  const filtered = useMemo(() => {
    const passesBaseFilters = (r: any) => {
      if (filterPriority !== "all" && r.priority !== filterPriority) return false;
      if (filterProject !== "all" && String(r.projectId) !== filterProject) return false;
      if (filterModule !== "all" && (r.module ?? "") !== filterModule) return false;
      return true;
    };

    let result: any[];

    if (!search) {
      result = requirements.filter(passesBaseFilters);
    } else {
      const searchLower = search.toLowerCase();
      const cleanTicketSearch = searchLower.replace(/^#/, "");

      // Directly matched IDs
      const directIds = new Set<number>();
      for (const r of requirements) {
        if (!passesBaseFilters(r)) continue;
        const matchesTitle  = r.title ? r.title.toLowerCase().includes(searchLower) : false;
        const matchesTicket = r.redmineTicketId ? String(r.redmineTicketId).includes(cleanTicketSearch) : false;
        const matchesModule = r.module ? r.module.toLowerCase().includes(searchLower) : false;
        if (matchesTitle || matchesTicket || matchesModule) directIds.add(r.id);
      }

      // Recursively collect all descendants of matched nodes
      const toInclude = new Set<number>(directIds);
      const addDescendants = (parentId: number) => {
        for (const r of requirements) {
          if (r.parentId === parentId && !toInclude.has(r.id)) {
            toInclude.add(r.id);
            addDescendants(r.id);
          }
        }
      };
      for (const id of directIds) addDescendants(id);

      result = requirements.filter((r) => toInclude.has(r.id) && passesBaseFilters(r));
    }

    result.sort((a: any, b: any) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === "priority") {
        const pMap: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
        return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
      }
      if (sortBy === "module") return (a.module ?? "").localeCompare(b.module ?? "");
      return 0;
    });

    return result;
  }, [requirements, search, filterPriority, filterProject, filterModule, sortBy]);

  // Auto-expand all parents of descendant results when searching
  useEffect(() => {
    if (search) {
      const parentIds = new Set<number>(
        filtered.map((r: any) => r.parentId).filter(Boolean) as number[]
      );
      setExpandedReqs(parentIds);
    }
  }, [search, filtered]);

  const visibleRequirements = useMemo(() => {
    const roots = buildTree(filtered);
    return flattenVisibleNodes(roots, expandedReqs);
  }, [filtered, expandedReqs]);

  const totalPages = Math.ceil(visibleRequirements.length / ITEMS_PER_PAGE);
  const paginatedRequirements = visibleRequirements.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedReqs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllExpand = () => {
    const hasChildrenIds = filtered.filter(r => filtered.some(child => child.parentId === r.id)).map(r => r.id);
    if (expandedReqs.size === hasChildrenIds.length && hasChildrenIds.length > 0) {
      setExpandedReqs(new Set());
    } else {
      setExpandedReqs(new Set(hasChildrenIds));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedReqs(filtered.map((r) => r.id));
    else setSelectedReqs([]);
  };

  const handleSelectReq = (id: number, checked: boolean) => {
    if (checked) setSelectedReqs((prev) => [...prev, id]);
    else setSelectedReqs((prev) => prev.filter((reqId) => reqId !== id));
  };

  const confirmDelete = (ids: number[]) => {
    setReqsToDelete(ids);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(reqsToDelete.map((id) => deleteMutation.mutateAsync({ id })));
      setSelectedReqs((prev) => prev.filter((id) => !reqsToDelete.includes(id)));
      toast({ title: `Successfully deleted ${reqsToDelete.length} requirement(s)` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setReqsToDelete([]);
    }
  };

  const openCreate = () => {
    setEditingReq(null);
    setForm({ priority: "normal", status: "draft" });
    setReqFormModules([]);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    setEditingReq(r);
    setErrors({});

    const parentReq = r.parentId ? requirements.find((req: any) => req.id === r.parentId) : null;

    setForm({
      title: r.title,
      description: r.description ?? undefined,
      tracker: r.tracker ?? undefined,
      parentId: r.parentId ?? undefined,
      parentRedmineTicketId: parentReq?.redmineTicketId ?? undefined,
      projectId: r.projectId ?? undefined,
      priority: r.priority,
      release: r.release ?? undefined,
      assigneeId: r.assigneeId ?? undefined,
      redmineTicketId: r.redmineTicketId ?? undefined,
      status: r.status,
    });
    setReqFormModules(r.module ? r.module.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setDialogOpen(true);
  };

  const openCreateChild = (parentReq: any) => {
    setEditingReq(null);
    setForm({
      parentId: parentReq.id,
      parentRedmineTicketId: parentReq.redmineTicketId ?? undefined,
      projectId: parentReq.projectId ?? undefined,
      release: parentReq.release ?? undefined,
      priority: "normal",
      status: "draft"
    });
    setReqFormModules(parentReq.module ? parentReq.module.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title?.trim()) errs.title = "Title is required";
    if (!form.priority) errs.priority = "Priority is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast({ variant: "destructive", title: "Please fill in all required fields" });
      return;
    }

    let finalParentId = form.parentId;

    if (form.parentRedmineTicketId?.trim()) {
      const parentReq = requirements.find((r: any) => String(r.redmineTicketId) === form.parentRedmineTicketId?.trim());

      if (!parentReq) {
        toast({ 
          variant: "destructive", 
          title: "Parent not exist", 
          description: "Please create redmine as parent." 
        });
        return;
      }
      finalParentId = parentReq.id;
    } else if (form.parentRedmineTicketId === "") {
      finalParentId = undefined;
    }

    const { parentRedmineTicketId, ...restForm } = form;
    const payload = { ...restForm, parentId: finalParentId, module: reqFormModules.join(",") || undefined };

    if (editingReq) updateMutation.mutate({ id: editingReq.id, data: payload as any });
    else createMutation.mutate({ data: payload as RequirementInput });
  };

  const handleCreateProject = () => {
    if (!projectForm.name.trim()) {
      toast({ variant: "destructive", title: "Project name is required" });
      return;
    }
    createProjectMutation.mutate({ data: projectForm as any });
  };

  const EXCLUDED_STATUSES = ["Cancelled", "Verified", "Roadblock", "Closed"];

  // isRoot: true for the user-initiated call; false for all recursive child calls
  const processRedmineSync = async (ticketIdToSync: string, targetModule: string, targetProjectId?: number, parentId?: number, trackerFilter?: string, isRoot: boolean = true) => {
    const resp = await fetch(`${getApiUrl()}/pmo/redmine/${encodeURIComponent(ticketIdToSync)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await resp.json();

    if (data.connected && data.issue) {
      const fetchedTicketId = String(data.issue.id);

      // Status filter — applies to all tickets including root
      if (EXCLUDED_STATUSES.includes(data.issue.status?.name)) {
        if (isRoot) throw new Error(`NO_RESULT:Ticket #${ticketIdToSync} has status "${data.issue.status?.name}"`);
        return;
      }
      // Tracker filter — applies to all tickets including root
      if (trackerFilter && data.issue.tracker?.name && data.issue.tracker?.name !== trackerFilter) {
        if (isRoot) throw new Error(`NO_RESULT:Ticket #${ticketIdToSync} has tracker "${data.issue.tracker?.name}", expected "${trackerFilter}"`);
        return;
      }

      const existingReq = requirements.find((r) => String(r.redmineTicketId) === fetchedTicketId);

      const priorityMap: Record<string, string> = { low: "low", normal: "normal", high: "high", urgent: "urgent" };
      const mappedPriority = priorityMap[data.issue.priority?.name?.toLowerCase()] || "normal";

      const mappedData: Partial<RequirementInput> = {
        title: data.issue.subject,
        description: data.issue.description ?? "",
        priority: mappedPriority as any,
        redmineTicketId: fetchedTicketId,
        tracker: data.issue.tracker?.name ?? "Task",
        module: targetModule,
        projectId: targetProjectId,
        parentId: parentId,
      };

      let savedReqId = existingReq?.id;

      if (existingReq) {
        mappedData.status = existingReq.status;
        mappedData.release = existingReq.release ?? undefined;
        mappedData.assigneeId = existingReq.assigneeId ?? undefined;

        await updateMutation.mutateAsync({ id: existingReq.id, data: mappedData as any });
      } else {
        mappedData.status = "draft";
        const res = await createMutation.mutateAsync({ data: mappedData as RequirementInput });
        savedReqId = (res as any).id;
      }

      // Recursively handle children — filters applied inside each recursive call
      if (data.issue.children && Array.isArray(data.issue.children)) {
        for (const child of data.issue.children) {
          await processRedmineSync(String(child.id), targetModule, targetProjectId, savedReqId, trackerFilter, false);
        }
      }
    } else {
      throw new Error(`Could not fetch Redmine issue #${ticketIdToSync}`);
    }
  };

  const handleImportFromRedmine = async () => {
    const clean = redmineInput.trim().replace(/^#/, "").replace(/.*\/issues\//, "");
    if (!clean || redmineSelectedModules.length === 0 || !redmineSelectedProject) return;

    setRedmineLoading(true);
    try {
      await processRedmineSync(clean, redmineSelectedModules.join(","), Number(redmineSelectedProject), undefined, redmineSelectedTracker || undefined);
      toast({ title: "Import Successful", description: "Successfully imported ticket and subtasks." });
      setRedmineDialogOpen(false);
      setRedmineInput("");
      setRedmineSelectedModules([]);
      setRedmineSelectedProject("");
      setRedmineSelectedTracker("");
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.startsWith("NO_RESULT:")) {
        toast({ variant: "destructive", title: "No results found", description: msg.replace("NO_RESULT:", "").trim() });
      } else {
        toast({ variant: "destructive", title: "Failed to connect to Redmine" });
      }
    } finally {
      setRedmineLoading(false);
    }
  };

  const handleSingleSync = async (req: any) => {
    if (!req.redmineTicketId || !req.module) {
      toast({ variant: "destructive", title: "Missing Redmine ID or Module." });
      return;
    }

    toast({ 
      title: "Syncing...", 
      description: `Fetching updates for #${req.redmineTicketId} and its subtasks.`,
    });

    try {
      await processRedmineSync(String(req.redmineTicketId), req.module, req.projectId, req.parentId, req.tracker || undefined, true);
      toast({ title: "Sync Complete", description: `Updated #${req.redmineTicketId} successfully.` });
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.startsWith("NO_RESULT:")) {
        toast({ variant: "destructive", title: "No results found", description: msg.replace("NO_RESULT:", "").trim() });
      } else {
        toast({ variant: "destructive", title: "Sync Failed" });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary" /> Requirements
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and track project requirements
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Button variant="outline" onClick={() => setProjectDialogOpen(true)} className="gap-2 w-full sm:w-auto">
            <FolderPlus className="w-4 h-4" /> New Project
          </Button>
          <Button variant="outline" onClick={() => setRedmineDialogOpen(true)} className="gap-2 w-full sm:w-auto">
            <Download className="w-4 h-4" /> From Redmine
          </Button>
          <Button onClick={openCreate} className="gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" /> New Requirement
          </Button>
        </div>
      </div>

      {selectedReqs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span>
              <strong>{selectedReqs.length}</strong> requirement{selectedReqs.length !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="sm:ml-auto flex w-full sm:w-auto items-center gap-2">
            <Button variant="destructive" size="sm" className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1" onClick={() => confirmDelete(selectedReqs)}>
              <Trash2 className="w-3 h-3" /> Delete Selected
            </Button>
            <Button variant="ghost" size="sm" className="h-8 flex-1 sm:flex-none px-2 text-xs gap-1" onClick={() => setSelectedReqs([])}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 w-full"
                placeholder="Search by title, ID, or module..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 w-full items-center">
              <SearchableSelect
                value={sortBy}
                onValueChange={setSortBy}
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "oldest", label: "Oldest First" },
                  { value: "updated", label: "Recently Updated" },
                  { value: "priority", label: "Highest Priority" },
                  { value: "module", label: "By Module" },
                ]}
                placeholder="Sort By"
                searchPlaceholder="Search..."
                className="flex-1 min-w-[130px] bg-muted/30"
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
                  ...moduleOptions.map((m) => ({ value: m, label: m })),
                ]}
                placeholder="Module"
                searchPlaceholder="Search module..."
                className="flex-1 min-w-[120px]"
              />
              <SearchableSelect
                value={filterPriority}
                onValueChange={setFilterPriority}
                options={[
                  { value: "all", label: "All Priority" },
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ]}
                placeholder="Priority"
                searchPlaceholder="Search..."
                className="flex-1 min-w-[110px]"
              />
              <div className="flex border rounded-md overflow-hidden shrink-0">
                <Button
                  variant={viewMode === "comfy" ? "default" : "ghost"}
                  size="sm"
                  className="h-9 px-2.5 rounded-none border-0 text-xs"
                  onClick={() => setViewMode("comfy")}
                  title="Comfy view"
                >
                  <LayoutList className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant={viewMode === "compact" ? "default" : "ghost"}
                  size="sm"
                  className="h-9 px-2.5 rounded-none border-0 border-l text-xs"
                  onClick={() => setViewMode("compact")}
                  title="Compact view"
                >
                  <List className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : visibleRequirements.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No requirements found</p>
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add first requirement
              </Button>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="overflow-x-auto w-full">
                <Table className={viewMode === "compact" ? "min-w-[400px]" : "min-w-[800px]"}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={filtered.length > 0 && selectedReqs.length === filtered.length}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                          aria-label="Select all requirements"
                        />
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleAllExpand}
                            title="Expand/Collapse All"
                            className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors"
                          >
                            <ChevronsUpDown className="w-4 h-4" />
                          </button>
                          Title
                        </div>
                      </TableHead>
                      {viewMode === "comfy" && <TableHead>Project</TableHead>}
                      {viewMode === "comfy" && <TableHead>Module</TableHead>}
                      {viewMode === "comfy" && <TableHead>Priority</TableHead>}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequirements.map((r: any) => {
                      const cellPy = viewMode === "compact" ? "py-1.5" : "py-3";
                      return (
                      <TableRow key={r.id} className={`hover:bg-muted/40 ${selectedReqs.includes(r.id) ? "bg-primary/5" : ""}`}>
                        <TableCell className={`text-center ${cellPy}`}>
                          <Checkbox
                            checked={selectedReqs.includes(r.id)}
                            onCheckedChange={(checked) => handleSelectReq(r.id, !!checked)}
                            aria-label={`Select requirement ${r.title}`}
                          />
                        </TableCell>
                        <TableCell className={cellPy} style={{ paddingLeft: `${(r.depth || 0) * 1.5 + 1}rem` }}>
                          <div className="flex items-center gap-2">
                            {r.children && r.children.length > 0 ? (
                              <button
                                onClick={(e) => toggleExpand(r.id, e)}
                                className="p-0.5 hover:bg-muted rounded text-muted-foreground shrink-0 transition-colors"
                              >
                                {expandedReqs.has(r.id) ? (
                                  <ChevronDown className="w-4 h-4 text-primary" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-5 shrink-0" />
                            )}
                            {viewMode === "compact" ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{r.title}</span>
                                {r.redmineTicketId && (
                                  <span className="text-xs text-muted-foreground">#{r.redmineTicketId}</span>
                                )}
                                {(r.tcCount ?? 0) > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/test-cases?requirementId=${r.id}`); }}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 flex items-center gap-1 transition-colors"
                                  >
                                    <TestTube className="w-2.5 h-2.5" />
                                    {r.tcCount} TC{r.tcCount !== 1 ? "s" : ""}
                                  </button>
                                )}
                                {((r.execPass ?? 0) > 0 || (r.execFail ?? 0) > 0) && (
                                  <span className="text-[10px] flex items-center gap-1.5">
                                    {(r.execPass ?? 0) > 0 && <span className="text-green-600 dark:text-green-400 font-medium">✓{r.execPass}</span>}
                                    {(r.execFail ?? 0) > 0 && <span className="text-red-600 dark:text-red-400 font-medium">✗{r.execFail}</span>}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div>
                                <p className="font-medium line-clamp-2">{r.title}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {r.redmineTicketId && (
                                    <a
                                      href={`https://redmine.bestinet.my/issues/${r.redmineTicketId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 w-fit"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-3 h-3" />#{r.redmineTicketId}
                                    </a>
                                  )}
                                  {(r.tcCount ?? 0) > 0 && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate(`/test-cases?requirementId=${r.id}`); }}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 flex items-center gap-1 transition-colors"
                                    >
                                      <TestTube className="w-2.5 h-2.5" />
                                      {r.tcCount} TC{r.tcCount !== 1 ? "s" : ""}
                                    </button>
                                  )}
                                  {((r.execPass ?? 0) > 0 || (r.execFail ?? 0) > 0) && (
                                    <span className="text-[10px] flex items-center gap-1.5">
                                      {(r.execPass ?? 0) > 0 && <span className="text-green-600 dark:text-green-400 font-medium">✓{r.execPass}</span>}
                                      {(r.execFail ?? 0) > 0 && <span className="text-red-600 dark:text-red-400 font-medium">✗{r.execFail}</span>}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {viewMode === "comfy" && (
                          <TableCell className={`text-sm text-muted-foreground whitespace-nowrap ${cellPy}`}>
                            {r.projectName ?? "—"}
                          </TableCell>
                        )}
                        {viewMode === "comfy" && (
                          <TableCell className={`text-sm text-muted-foreground whitespace-nowrap ${cellPy}`}>
                            {r.module ?? "—"}
                          </TableCell>
                        )}
                        {viewMode === "comfy" && (
                          <TableCell className={cellPy}>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PRIORITY_COLORS[r.priority]}`}>
                              {capitalize(r.priority)}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className={cellPy}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openCreateChild(r)}>
                                <Plus className="w-4 h-4 mr-2" /> Add Child
                              </DropdownMenuItem>
                              {r.redmineTicketId && (
                                <DropdownMenuItem onClick={() => handleSingleSync(r)}>
                                  <Download className="w-4 h-4 mr-2" /> Sync from Redmine
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEdit(r)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => confirmDelete([r.id])}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/10 border-t gap-3">
                <div className="text-xs text-muted-foreground text-center sm:text-left w-full sm:w-auto">
                  Showing <span className="font-medium">{visibleRequirements.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{" "}
                  <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, visibleRequirements.length)}</span> of{" "}
                  <span className="font-medium">{visibleRequirements.length}</span> visible requirements
                </div>
                <div className="flex gap-2 w-full sm:w-auto justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs flex-1 sm:flex-none"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs flex-1 sm:flex-none"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || totalPages === 0}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOGS */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete {reqsToDelete.length > 1 ? `these ${reqsToDelete.length} requirements` : "this requirement"}? This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button variant="destructive" onClick={executeDelete} disabled={isDeleting} className="w-full sm:w-auto">
              {isDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : "Confirm Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {editingReq 
                ? "Edit Requirement" 
                : form.parentId 
                  ? "New Child Requirement" 
                  : "New Requirement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Requirement title"
                  value={form.title ?? ""}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={errors.title ? "border-destructive" : ""}
                />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Redmine Ticket ID</Label>
                <Input placeholder="e.g. 12345" value={form.redmineTicketId ?? ""} onChange={(e) => setForm({ ...form, redmineTicketId: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Describe the requirement..." value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <SearchableSelect
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select project"
                  searchPlaceholder="Search project..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <div className="border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5">
                  {(executionModules as any[]).map((m: any) => (
                    <label key={m.id ?? m.name} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox
                        checked={reqFormModules.includes(m.name)}
                        onCheckedChange={(checked) => setReqFormModules(prev => checked ? [...prev, m.name] : prev.filter(n => n !== m.name))}
                      />
                      <span className="text-sm">{m.name}</span>
                    </label>
                  ))}
                </div>
                {reqFormModules.length > 0 && <p className="text-xs text-muted-foreground">{reqFormModules.length} selected</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <Input placeholder="e.g. Feature, Bug, Enhancement" value={form.tracker ?? ""} onChange={(e) => setForm({ ...form, tracker: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.priority ?? "normal"}
                  onValueChange={(v) => setForm({ ...form, priority: v as any })}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High" },
                    { value: "urgent", label: "Urgent" },
                  ]}
                  searchPlaceholder="Search..."
                  className={errors.priority ? "border-destructive" : ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Release</Label>
                <Input placeholder="e.g. v3.0" value={form.release ?? ""} onChange={(e) => setForm({ ...form, release: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Parent Redmine ID (Optional)</Label>
                <Input placeholder="e.g. 12345" value={form.parentRedmineTicketId ?? ""} onChange={(e) => setForm({ ...form, parentRedmineTicketId: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="w-full sm:w-auto">
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingReq ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redmineDialogOpen} onOpenChange={(open) => { setRedmineDialogOpen(open); if (!open) { setRedmineInput(""); setRedmineSelectedModules([]); setRedmineSelectedProject(""); setRedmineSelectedTracker(""); } }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" /> Import from Redmine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Enter a Redmine ticket ID or URL and select a target module to import its details as a new requirement.
            </p>
            <div className="space-y-1.5">
              <Label>Redmine Ticket ID or URL <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 34555" value={redmineInput} onChange={(e) => setRedmineInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleImportFromRedmine()} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Project <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={redmineSelectedProject}
                onValueChange={setRedmineSelectedProject}
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                placeholder="Select project"
                searchPlaceholder="Search project..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Module <span className="text-destructive">*</span></Label>
              <div className="border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5">
                {(executionModules as any[]).map((m: any) => (
                  <label key={m.id ?? m.name} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <Checkbox
                      checked={redmineSelectedModules.includes(m.name)}
                      onCheckedChange={(checked) => setRedmineSelectedModules(prev => checked ? [...prev, m.name] : prev.filter(n => n !== m.name))}
                    />
                    <span className="text-sm">{m.name}</span>
                  </label>
                ))}
              </div>
              {redmineSelectedModules.length > 0 && <p className="text-xs text-muted-foreground">{redmineSelectedModules.length} selected</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Tracker Filter <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <SearchableSelect
                value={redmineSelectedTracker}
                onValueChange={setRedmineSelectedTracker}
                options={redmineTrackers.map((t) => ({ value: t.name, label: t.name }))}
                placeholder="All trackers"
                searchPlaceholder="Search tracker..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => { setRedmineDialogOpen(false); setRedmineInput(""); setRedmineSelectedModule(""); setRedmineSelectedProject(""); setRedmineSelectedTracker(""); }} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleImportFromRedmine} disabled={redmineLoading || !redmineInput.trim() || redmineSelectedModules.length === 0 || !redmineSelectedProject} className="w-full sm:w-auto">
              {redmineLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Fetching…</> : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" /> New Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Mobile App v2" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What is this project about?" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <SearchableSelect
                value={projectForm.status}
                onValueChange={(v) => setProjectForm({ ...projectForm, status: v })}
                options={[
                  { value: "active", label: "Active" },
                  { value: "on_hold", label: "On Hold" },
                  { value: "completed", label: "Completed" },
                ]}
                searchPlaceholder="Search..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleCreateProject} disabled={createProjectMutation.isPending} className="w-full sm:w-auto">
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}