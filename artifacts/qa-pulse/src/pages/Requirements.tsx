import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  GripVertical,
  X as XIcon,
  ExternalLink as DetailIcon,
  Clock,
  CheckCircle2,
  XCircle as XCircleIcon,
  Paperclip,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

// Left-stripe convention: a colored row accent replaces the old pill badge —
// the stripe is the primary signal, the Priority column keeps a plain text
// label for accessibility (color alone isn't a sufficient indicator).
const PRIORITY_STRIPE: Record<string, string> = {
  low: "border-l-slate-300 dark:border-l-slate-600",
  normal: "border-l-blue-400 dark:border-l-blue-500",
  high: "border-l-orange-400 dark:border-l-orange-500",
  urgent: "border-l-red-500 dark:border-l-red-500",
};
const PRIORITY_TEXT: Record<string, string> = {
  low: "text-slate-600 dark:text-slate-400",
  normal: "text-blue-600 dark:text-blue-400",
  high: "text-orange-600 dark:text-orange-400",
  urgent: "text-red-600 dark:text-red-400",
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
  const searchString = useSearch();

  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterMilestone, setFilterMilestone] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [viewMode, setViewMode] = useState<"comfy" | "compact">(() => {
    try { return (localStorage.getItem("req_view_mode") as "comfy" | "compact") ?? "comfy"; } catch { return "comfy"; }
  });

  const [expandedReqs, setExpandedReqs] = useState<Set<number>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState<Partial<RequirementInput> & { parentRedmineTicketId?: string; milestoneId?: number | null }>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", status: "active" });

  // Redmine Import States
  const [redmineDialogOpen, setRedmineDialogOpen] = useState(false);
  const [redmineInput, setRedmineInput] = useState("");
  const [redmineSelectedProject, setRedmineSelectedProject] = useState<string>("");
  const [redmineSelectedMilestone, setRedmineSelectedMilestone] = useState<string>("");
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

  // CR031 — open requirement-defect count per requirement, for the list badge
  const { data: reqDefectCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["requirement-defect-counts"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/defects?source=requirement&view=open`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return {};
      const all: any[] = await res.json();
      const counts: Record<number, number> = {};
      for (const d of all) {
        for (const l of d.links ?? []) {
          if (l.linkType === "requirement" && l.requirementId != null) {
            counts[l.requirementId] = (counts[l.requirementId] ?? 0) + 1;
          }
        }
      }
      return counts;
    },
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

  const { data: trackers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["trackers"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/trackers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  const formProjectId = form.projectId;
  const { data: milestonesForProject = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", formProjectId],
    queryFn: async () => {
      if (!formProjectId) return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${formProjectId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: !!formProjectId && dialogOpen,
  });

  // Milestone options for the "Import from Redmine" dialog — scoped to the
  // selected import Project, mandatory so every imported requirement (and
  // its children, which inherit it) is tagged with a milestone from the start.
  const { data: milestonesForRedmineImport = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", redmineSelectedProject],
    queryFn: async () => {
      if (!redmineSelectedProject) return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${redmineSelectedProject}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: !!redmineSelectedProject && redmineDialogOpen,
  });

  // Milestone filter options — scoped to the selected Project filter, same
  // dependency the create/edit form's Milestone picker already has (the
  // /milestones endpoint requires a projectId).
  const { data: milestonesForFilter = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", filterProject],
    queryFn: async () => {
      if (filterProject === "all") return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${filterProject}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: filterProject !== "all",
  });

  // ?projectId=&milestoneId= deep link (e.g. from the PM Dashboard's
  // milestone tiles) — pre-fill both filters on first load.
  const hasAppliedDeepLink = useRef(false);
  useEffect(() => {
    if (hasAppliedDeepLink.current) return;
    const params = new URLSearchParams(searchString);
    const projectIdParam = params.get("projectId");
    const milestoneIdParam = params.get("milestoneId");
    if (!projectIdParam && !milestoneIdParam) return;
    hasAppliedDeepLink.current = true;
    if (projectIdParam) setFilterProject(projectIdParam);
    if (milestoneIdParam) setFilterMilestone(milestoneIdParam);
  }, [searchString]);

  // ?edit=<id> deep link (from RequirementDetail's Edit button) — auto-opens
  // the edit dialog once the requirement is loaded. Waits for requirements
  // to load since openEdit needs the full row, not just the id.
  const hasAppliedEditDeepLink = useRef(false);
  useEffect(() => {
    if (hasAppliedEditDeepLink.current || requirements.length === 0) return;
    const params = new URLSearchParams(searchString);
    const editIdParam = params.get("edit");
    if (!editIdParam) return;
    const target = requirements.find((r: any) => String(r.id) === editIdParam);
    if (!target) return;
    hasAppliedEditDeepLink.current = true;
    openEdit(target);
  }, [searchString, requirements]);

  const FA_REVIEW_ROLES = ["fa_lead", "fa_member", "hod_fa", "admin", "qa_lead", "hod_qa"];
  const canReview = FA_REVIEW_ROLES.includes(user?.role ?? "");

  // Edit permission mirrors the backend check in PATCH /requirements/:id:
  // author/assignee always can; a Redmine-imported requirement can also be
  // edited by any FA-tier reviewer, since its "author" is often just a
  // Redmine-resolved fallback rather than a real accountable QAPulse user.
  const canEditReq = (r: any) =>
    ["admin", "cto"].includes(user?.role ?? "") ||
    r.createdBy === user?.id ||
    r.assigneeId === user?.id ||
    (!!r.redmineTicketId && canReview);

  const { data: reviewQueue } = useQuery<{ waitingOnMe: any[]; awaitingMyRevision: any[] }>({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/requirements/review-queue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : { waitingOnMe: [], awaitingMyRevision: [] };
    },
    enabled: canReview,
    refetchInterval: 60000,
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
  }, [search, filterPriority, filterProject, filterModule, filterMilestone, sortBy]);

  const createMutation = useCreateRequirement();
  const updateMutation = useUpdateRequirement();

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
      if (filterMilestone !== "all" && String(r.milestoneId) !== filterMilestone) return false;
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
  }, [requirements, search, filterPriority, filterProject, filterModule, filterMilestone, sortBy]);

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
    setAcceptanceCriteria([]);
    setNewCriterion("");
    setReqFormModules([]);
    setErrors({});
    setPendingFiles([]);
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
      milestoneId: r.milestoneId ?? null,
    });
    setAcceptanceCriteria(Array.isArray(r.acceptanceCriteria) ? r.acceptanceCriteria : []);
    setNewCriterion("");
    setReqFormModules(r.module ? r.module.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setPendingFiles([]);
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
      status: "draft",
      milestoneId: parentReq.milestoneId ?? null,
      tracker: parentReq.tracker ?? undefined,
    });
    setAcceptanceCriteria([]);
    setNewCriterion("");
    setReqFormModules(parentReq.module ? parentReq.module.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
    setErrors({});
    setPendingFiles([]);
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title?.trim()) errs.title = "Title is required";
    if (!form.priority) errs.priority = "Priority is required";
    if (!form.projectId) errs.projectId = "Project is required";
    if (reqFormModules.length === 0) errs.module = "At least one module is required";
    if (!form.milestoneId) errs.milestoneId = "Milestone is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const uploadAttachment = (requirementId: number, file: File): Promise<void> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const res = await fetch(`${getApiUrl()}/requirements/${requirementId}/attachments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", data: base64 }),
          });
          if (res.ok) resolve();
          else reject(new Error("Upload failed"));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
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

    const { parentRedmineTicketId, milestoneId, ...restForm } = form;
    const payload = {
      ...restForm,
      parentId: finalParentId,
      module: reqFormModules.join(",") || undefined,
      milestoneId: milestoneId ?? undefined,
      acceptanceCriteria: acceptanceCriteria.length > 0 ? JSON.stringify(acceptanceCriteria) : undefined,
    };

    try {
      let savedId: number | undefined;
      if (editingReq) {
        await updateMutation.mutateAsync({ id: editingReq.id, data: payload as any });
        savedId = editingReq.id;
      } else {
        const created: any = await createMutation.mutateAsync({ data: payload as RequirementInput });
        savedId = created?.id;
      }

      if (savedId && pendingFiles.length > 0) {
        setUploadingFiles(true);
        const results = await Promise.allSettled(pendingFiles.map(f => uploadAttachment(savedId!, f)));
        setUploadingFiles(false);
        const failed = results.filter(r => r.status === "rejected").length;
        if (failed > 0) toast({ variant: "destructive", title: `${failed} file(s) failed to upload` });
      }

      queryClient.invalidateQueries({ queryKey: getListRequirementsQueryKey() });
      setDialogOpen(false);
      setForm({});
      setErrors({});
      setEditingReq(null);
      setPendingFiles([]);
      toast({ title: editingReq ? "Requirement updated" : "Requirement created" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save requirement" });
    }
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
  // Tracker badge — distinguishes CR vs User Story vs others at a glance
  const trackerBadge = (tracker?: string | null) => {
    if (!tracker) return null;
    const t = tracker.toLowerCase();
    const cls = t.includes("change request") || t === "cr"
      ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800"
      : t.includes("story")
        ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800"
        : "bg-muted text-muted-foreground border-border";
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>
        {tracker}
      </span>
    );
  };

  // CR030 — dev handoff status, only rendered once a requirement has been
  // handed to dev (devStatus is null until then)
  const devStatusBadge = (devStatus?: string | null) => {
    if (!devStatus) return null;
    const cls: Record<string, string> = {
      assigned: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
      in_progress: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
      ready_for_qa: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
    };
    const label: Record<string, string> = {
      assigned: "Dev: Assigned",
      in_progress: "Dev: In Progress",
      ready_for_qa: "Dev: Ready for QA",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${cls[devStatus] ?? "bg-muted text-muted-foreground border-border"}`}>
        {label[devStatus] ?? devStatus}
      </span>
    );
  };

  // CR063 — blocked flag (FA/PM), reason shown on hover
  const blockedBadge = (isBlocked?: boolean, blockedReason?: string | null) => {
    if (!isBlocked) return null;
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
        title={blockedReason ?? undefined}
      >
        Blocked
      </span>
    );
  };

  // CR031 — open requirement-defect count badge
  const reqDefectBadge = (requirementId: number) => {
    const count = reqDefectCounts[requirementId] ?? 0;
    if (count === 0) return null;
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
        {count} open defect{count !== 1 ? "s" : ""}
      </span>
    );
  };

  const processRedmineSync = async (ticketIdToSync: string, targetModule: string, targetProjectId?: number, parentId?: number, trackerFilter?: string, milestoneId?: number, isRoot: boolean = true) => {
    const resp = await fetch(`${getApiUrl()}/verdict-report/redmine/${encodeURIComponent(ticketIdToSync)}`, {
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
      // Only touch milestoneId when explicitly provided — a resync of an
      // already-imported ticket (handleSingleSync) passes undefined so it
      // doesn't clobber a milestone the user may have customized per-requirement.
      if (milestoneId !== undefined) (mappedData as any).milestoneId = milestoneId;

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

      // Sync attachments (fire-and-forget — don't block import on download failures)
      if (savedReqId && Array.isArray(data.issue.attachments) && data.issue.attachments.length > 0) {
        fetch(`${getApiUrl()}/requirements/${savedReqId}/sync-redmine-attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ attachments: data.issue.attachments }),
        }).catch(() => {});
      }

      // Recursively handle children — filters applied inside each recursive call
      if (data.issue.children && Array.isArray(data.issue.children)) {
        for (const child of data.issue.children) {
          await processRedmineSync(String(child.id), targetModule, targetProjectId, savedReqId, trackerFilter, milestoneId, false);
        }
      }
    } else {
      throw new Error(`Could not fetch Redmine issue #${ticketIdToSync}`);
    }
  };

  const handleImportFromRedmine = async () => {
    const clean = redmineInput.trim().replace(/^#/, "").replace(/.*\/issues\//, "");
    if (!clean || redmineSelectedModules.length === 0 || !redmineSelectedProject || !redmineSelectedMilestone) return;

    setRedmineLoading(true);
    try {
      await processRedmineSync(clean, redmineSelectedModules.join(","), Number(redmineSelectedProject), undefined, redmineSelectedTracker || undefined, Number(redmineSelectedMilestone));
      toast({ title: "Import Successful", description: "Successfully imported ticket and subtasks." });
      setRedmineDialogOpen(false);
      setRedmineInput("");
      setRedmineSelectedModules([]);
      setRedmineSelectedProject("");
      setRedmineSelectedTracker("");
      setRedmineSelectedMilestone("");
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
      await processRedmineSync(String(req.redmineTicketId), req.module, req.projectId, req.parentId, req.tracker || undefined, undefined, true);
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

      {/* Review Queue — shown to FA roles */}
      {canReview && reviewQueue && (reviewQueue.waitingOnMe.length > 0 || reviewQueue.awaitingMyRevision.length > 0) && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-700 dark:text-blue-400">Review Queue</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {reviewQueue.waitingOnMe.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Waiting on my review ({reviewQueue.waitingOnMe.length})</p>
                <div className="space-y-1">
                  {reviewQueue.waitingOnMe.slice(0, 5).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-sm bg-white dark:bg-background rounded px-2 py-1 border border-blue-100 dark:border-blue-900">
                      <button className="hover:underline text-left flex-1 truncate" onClick={() => navigate(`/requirements/${r.id}`)}>
                        {r.title}
                      </button>
                      {r.stale && <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 ml-2" aria-label="Stale — waiting 3+ days" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {reviewQueue.awaitingMyRevision.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Awaiting my revision ({reviewQueue.awaitingMyRevision.length})</p>
                <div className="space-y-1">
                  {reviewQueue.awaitingMyRevision.slice(0, 5).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-sm bg-white dark:bg-background rounded px-2 py-1 border border-red-100 dark:border-red-900">
                      <button className="hover:underline text-left flex-1 truncate" onClick={() => navigate(`/requirements/${r.id}`)}>
                        {r.title}
                      </button>
                      <XCircleIcon className="w-3.5 h-3.5 text-red-500 shrink-0 ml-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
                onValueChange={(v) => { setFilterProject(v); setFilterMilestone("all"); }}
                options={[
                  { value: "all", label: "All Projects" },
                  ...projects.map((p) => ({ value: String(p.id), label: p.name })),
                ]}
                placeholder="Project"
                searchPlaceholder="Search project..."
                className="flex-1 min-w-[120px]"
              />
              <SearchableSelect
                value={filterMilestone}
                onValueChange={setFilterMilestone}
                options={[
                  { value: "all", label: "All Milestones" },
                  ...milestonesForFilter.map((m) => ({ value: String(m.id), label: m.name })),
                ]}
                placeholder={filterProject !== "all" ? "Milestone" : "Select a project first"}
                searchPlaceholder="Search milestones..."
                className="flex-1 min-w-[130px]"
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
              <div className="flex items-center gap-1 shrink-0">
                {[
                  { value: "all", label: "All" },
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                  { value: "urgent", label: "Urgent" },
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setFilterPriority(p.value)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${filterPriority === p.value ? "bg-primary/10 text-primary border-primary/30 font-medium" : "text-muted-foreground border-border hover:bg-muted"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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
                      {viewMode === "comfy" && <TableHead>Milestone</TableHead>}
                      {viewMode === "comfy" && <TableHead>Priority</TableHead>}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequirements.map((r: any) => {
                      const cellPy = viewMode === "compact" ? "py-1.5" : "py-3";
                      return (
                      <TableRow key={r.id} className={`hover:bg-muted/40 border-l-4 ${PRIORITY_STRIPE[r.priority] ?? "border-l-transparent"} ${selectedReqs.includes(r.id) ? "bg-primary/5" : ""}`}>
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
                                <span className="font-medium cursor-pointer hover:text-primary hover:underline transition-colors" onClick={(e) => { e.stopPropagation(); navigate(`/requirements/${r.id}`); }}>{r.title}</span>
                                {r.redmineTicketId && (
                                  <span className="text-xs text-muted-foreground">#{r.redmineTicketId}</span>
                                )}
                                {trackerBadge(r.tracker)}
                                {devStatusBadge(r.devStatus)}
                                {blockedBadge(r.isBlocked, r.blockedReason)}
                                {reqDefectBadge(r.id)}
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
                                <p className="font-medium line-clamp-2 cursor-pointer hover:text-primary hover:underline transition-colors" onClick={(e) => { e.stopPropagation(); navigate(`/requirements/${r.id}`); }}>{r.title}</p>
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
                                  {trackerBadge(r.tracker)}
                                {devStatusBadge(r.devStatus)}
                                {blockedBadge(r.isBlocked, r.blockedReason)}
                                {reqDefectBadge(r.id)}
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
                          <TableCell className={`text-sm text-muted-foreground whitespace-nowrap ${cellPy}`}>
                            {r.milestoneName ?? "—"}
                          </TableCell>
                        )}
                        {viewMode === "comfy" && (
                          <TableCell className={cellPy}>
                            <span className={`text-xs font-medium whitespace-nowrap ${PRIORITY_TEXT[r.priority] ?? "text-muted-foreground"}`}>
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
                              <DropdownMenuItem onClick={() => navigate(`/requirements/${r.id}`)}>
                                <DetailIcon className="w-4 h-4 mr-2" /> View Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openCreateChild(r)}>
                                <Plus className="w-4 h-4 mr-2" /> Add Child
                              </DropdownMenuItem>
                              {r.redmineTicketId && (
                                <DropdownMenuItem onClick={() => handleSingleSync(r)}>
                                  <Download className="w-4 h-4 mr-2" /> Sync from Redmine
                                </DropdownMenuItem>
                              )}
                              {canEditReq(r) && (
                                <DropdownMenuItem onClick={() => openEdit(r)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                              )}
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
        <DialogContent className="sm:max-w-[75vw] max-h-[90vh] overflow-y-auto w-[95vw] p-8">
          <DialogHeader>
            <DialogTitle>
              {editingReq
                ? "Edit Requirement"
                : form.parentId
                  ? "New Child Requirement"
                  : "New Requirement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-3">
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
              <Textarea placeholder="Describe the requirement..." value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Project <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) => setForm({ ...form, projectId: Number(v), milestoneId: null })}
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select project"
                  searchPlaceholder="Search project..."
                  className={errors.projectId ? "border-destructive" : ""}
                />
                {errors.projectId && <p className="text-xs text-destructive">{errors.projectId}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Module <span className="text-destructive">*</span></Label>
                <div className={`border rounded-md p-2 max-h-28 overflow-y-auto space-y-0.5 ${errors.module ? "border-destructive" : ""}`}>
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
                {errors.module
                  ? <p className="text-xs text-destructive">{errors.module}</p>
                  : reqFormModules.length > 0 && <p className="text-xs text-muted-foreground">{reqFormModules.length} selected</p>
                }
              </div>
              <div className="space-y-1.5">
                <Label>Tracker</Label>
                <SearchableSelect
                  value={form.tracker ?? ""}
                  onValueChange={(v) => setForm({ ...form, tracker: v })}
                  options={[
                    { value: "", label: "None" },
                    ...trackers.map((t) => ({ value: t.name, label: t.name })),
                    ...(form.tracker && !trackers.some((t) => t.name === form.tracker)
                      ? [{ value: form.tracker, label: form.tracker }]
                      : []),
                  ]}
                  placeholder="Select tracker..."
                  searchPlaceholder="Search tracker..."
                />
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
              {form.release && (
                <div className="space-y-1.5">
                  <Label>Release (legacy)</Label>
                  <Input value={form.release} disabled className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Deprecated — Milestone is now the field of record. Kept read-only so existing data isn't lost.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Parent Redmine ID (Optional)</Label>
                <Input placeholder="e.g. 12345" value={form.parentRedmineTicketId ?? ""} onChange={(e) => setForm({ ...form, parentRedmineTicketId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Milestone <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.milestoneId ? String(form.milestoneId) : ""}
                  onValueChange={(v) => setForm({ ...form, milestoneId: v ? Number(v) : null })}
                  options={[
                    { value: "", label: form.projectId ? "Select milestone…" : "Select a project first" },
                    ...milestonesForProject.map(m => ({ value: String(m.id), label: m.name })),
                  ]}
                  placeholder="Select milestone…"
                  searchPlaceholder="Search milestones…"
                  className={errors.milestoneId ? "border-destructive" : ""}
                />
                {errors.milestoneId && <p className="text-xs text-destructive">{errors.milestoneId}</p>}
                {form.projectId && milestonesForProject.length === 0 && (
                  <p className="text-xs text-muted-foreground">No milestones for this project — <a href="/milestones" className="underline text-primary">create one first</a>.</p>
                )}
              </div>
            </div>

            {/* Acceptance Criteria */}
            <div className="space-y-2">
              <Label>Acceptance Criteria</Label>
              <div className="space-y-1.5">
                {acceptanceCriteria.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm bg-muted/50 rounded px-2 py-1">{c}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => setAcceptanceCriteria(prev => { const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; })}
                        className="text-xs text-muted-foreground hover:text-foreground px-1 disabled:opacity-30"
                      >↑</button>
                      <button
                        type="button"
                        disabled={i === acceptanceCriteria.length - 1}
                        onClick={() => setAcceptanceCriteria(prev => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; })}
                        className="text-xs text-muted-foreground hover:text-foreground px-1 disabled:opacity-30"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => setAcceptanceCriteria(prev => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive"
                      ><XIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add acceptance criterion…"
                    value={newCriterion}
                    onChange={(e) => setNewCriterion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCriterion.trim()) {
                        e.preventDefault();
                        setAcceptanceCriteria(prev => [...prev, newCriterion.trim()]);
                        setNewCriterion("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { if (newCriterion.trim()) { setAcceptanceCriteria(prev => [...prev, newCriterion.trim()]); setNewCriterion(""); } }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Attachments</Label>
              <label className="flex flex-col items-center gap-1.5 cursor-pointer border-2 border-dashed rounded-lg p-3 text-sm text-muted-foreground hover:border-primary/50 hover:bg-muted/20 transition-colors">
                <Paperclip className="w-4 h-4" />
                <span>Click to attach files</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    setPendingFiles(prev => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
              </label>
              {pendingFiles.length > 0 && (
                <ul className="space-y-1">
                  {pendingFiles.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                      <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>
                        <XIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {editingReq && (
                <p className="text-xs text-muted-foreground">Existing attachments can be viewed and managed from the requirement detail page.</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending || uploadingFiles} className="w-full sm:w-auto">
              {uploadingFiles ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading files…</> :
               createMutation.isPending || updateMutation.isPending ? "Saving..." :
               editingReq ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={redmineDialogOpen} onOpenChange={(open) => { setRedmineDialogOpen(open); if (!open) { setRedmineInput(""); setRedmineSelectedModules([]); setRedmineSelectedProject(""); setRedmineSelectedTracker(""); setRedmineSelectedMilestone(""); } }}>
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
                onValueChange={(v) => { setRedmineSelectedProject(v); setRedmineSelectedMilestone(""); }}
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                placeholder="Select project"
                searchPlaceholder="Search project..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Milestone <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={redmineSelectedMilestone}
                onValueChange={setRedmineSelectedMilestone}
                options={milestonesForRedmineImport.map((m) => ({ value: String(m.id), label: m.name }))}
                placeholder={redmineSelectedProject ? "Select milestone" : "Select a project first"}
                searchPlaceholder="Search milestones..."
              />
              {redmineSelectedProject && milestonesForRedmineImport.length === 0 && (
                <p className="text-xs text-muted-foreground">No milestones for this project — <a href="/milestones" className="underline text-primary">create one first</a>.</p>
              )}
              <p className="text-xs text-muted-foreground">Applied to the root ticket and every subtask being imported.</p>
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
                options={trackers.map((t) => ({ value: t.name, label: t.name }))}

                placeholder="All trackers"
                searchPlaceholder="Search tracker..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => { setRedmineDialogOpen(false); setRedmineInput(""); setRedmineSelectedModules([]); setRedmineSelectedProject(""); setRedmineSelectedTracker(""); setRedmineSelectedMilestone(""); }} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleImportFromRedmine} disabled={redmineLoading || !redmineInput.trim() || redmineSelectedModules.length === 0 || !redmineSelectedProject || !redmineSelectedMilestone} className="w-full sm:w-auto">
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