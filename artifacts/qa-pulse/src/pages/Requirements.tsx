import { useState, useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { format } from "date-fns";
import { getApiUrl } from "@/lib/api";

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  in_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  deprecated: "bg-red-100 text-red-600",
};

export default function Requirements() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filtering, Search & Sorting State
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState<Partial<RequirementInput>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // New project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active",
  });

  // Redmine import dialog
  const [redmineDialogOpen, setRedmineDialogOpen] = useState(false);
  const [redmineInput, setRedmineInput] = useState("");
  const [redmineLoading, setRedmineLoading] = useState(false);

  // Selection and Delete Confirmation State
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

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  // Reset page layout and selections safely when active query filters drop items
  useEffect(() => {
    setCurrentPage(1);
    setSelectedReqs([]);
  }, [search, filterStatus, filterPriority, filterProject, sortBy]);

  const createMutation = useCreateRequirement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListRequirementsQueryKey(),
        });
        setDialogOpen(false);
        setForm({});
        setErrors({});
        toast({ title: "Requirement created" });
      },
      onError: () =>
        toast({
          variant: "destructive",
          title: "Failed to create requirement",
        }),
    },
  });

  const updateMutation = useUpdateRequirement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListRequirementsQueryKey(),
        });
        setDialogOpen(false);
        setEditingReq(null);
        setErrors({});
        toast({ title: "Requirement updated" });
      },
      onError: () =>
        toast({
          variant: "destructive",
          title: "Failed to update requirement",
        }),
    },
  });

  const deleteMutation = useDeleteRequirement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListRequirementsQueryKey(),
        });
      },
      onError: () =>
        toast({
          variant: "destructive",
          title: "Failed to delete requirement",
        }),
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
      onError: () =>
        toast({ variant: "destructive", title: "Failed to create project" }),
    },
  });

  const filtered = useMemo(() => {
    // 1. Filter the dataset
    let result = requirements.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterPriority !== "all" && r.priority !== filterPriority) return false;
      if (filterProject !== "all" && String(r.projectId) !== filterProject) return false;

      // Expanded Search Logic
      if (search) {
        const searchLower = search.toLowerCase();
        const cleanTicketSearch = searchLower.replace(/^#/, "");

        const matchesTitle = r.title
          ? r.title.toLowerCase().includes(searchLower)
          : false;

        const matchesTicket = r.redmineTicketId
          ? String(r.redmineTicketId).toLowerCase().includes(cleanTicketSearch)
          : false;

        const matchesAssignee = r.assigneeName
          ? r.assigneeName.toLowerCase().includes(searchLower)
          : false;

        const matchesRelease = r.release
          ? r.release.toLowerCase().includes(searchLower)
          : false;

        if (!matchesTitle && !matchesTicket && !matchesAssignee && !matchesRelease) {
          return false;
        }
      }
      return true;
    });

    // 2. Sort the dataset
    result.sort((a: any, b: any) => {
      if (sortBy === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "updated") {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === "priority") {
        const pMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
        const pA = pMap[a.priority] || 0;
        const pB = pMap[b.priority] || 0;
        return pB - pA; // High to Low
      }
      return 0;
    });

    return result;
  }, [requirements, search, filterStatus, filterPriority, filterProject, sortBy]);

  // Apply array subset segmentation limits for pagination parameters
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedRequirements = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // Selection & Deletion Logic
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReqs(filtered.map((r) => r.id));
    } else {
      setSelectedReqs([]);
    }
  };

  const handleSelectReq = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedReqs((prev) => [...prev, id]);
    } else {
      setSelectedReqs((prev) => prev.filter((reqId) => reqId !== id));
    }
  };

  const confirmDelete = (ids: number[]) => {
    setReqsToDelete(ids);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(
        reqsToDelete.map((id) => deleteMutation.mutateAsync({ id }))
      );
      setSelectedReqs((prev) => prev.filter((id) => !reqsToDelete.includes(id)));
      toast({ title: `Successfully deleted ${reqsToDelete.length} requirement(s)` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete one or more requirements" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setReqsToDelete([]);
    }
  };

  const openCreate = () => {
    setEditingReq(null);
    setForm({ priority: "medium", status: "draft" });
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (r: Requirement) => {
    setEditingReq(r);
    setErrors({});
    setForm({
      title: r.title,
      description: r.description ?? undefined,
      module: r.module ?? undefined,
      projectId: r.projectId ?? undefined,
      priority: r.priority,
      release: r.release ?? undefined,
      assigneeId: r.assigneeId ?? undefined,
      redmineTicketId: r.redmineTicketId ?? undefined,
      status: r.status,
    });
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title?.trim()) errs.title = "Title is required";
    if (!form.priority) errs.priority = "Priority is required";
    if (!form.status) errs.status = "Status is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast({
        variant: "destructive",
        title: "Please fill in all required fields",
      });
      return;
    }
    if (editingReq) {
      updateMutation.mutate({ id: editingReq.id, data: form as any });
    } else {
      createMutation.mutate({ data: form as RequirementInput });
    }
  };

  const handleCreateProject = () => {
    if (!projectForm.name.trim()) {
      toast({ variant: "destructive", title: "Project name is required" });
      return;
    }
    createProjectMutation.mutate({ data: projectForm as any });
  };

  const handleImportFromRedmine = async () => {
    const clean = redmineInput
      .trim()
      .replace(/^#/, "")
      .replace(/.*\/issues\//, "");
    if (!clean) return;

    setRedmineLoading(true);
    try {
      const resp = await fetch(
        `${getApiUrl()}/pmo/redmine/${encodeURIComponent(clean)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const data = await resp.json();

      if (data.connected && data.issue) {
        const fetchedTicketId = String(data.issue.id);

        const existingReq = requirements.find(
          (r) =>
            r.redmineTicketId && String(r.redmineTicketId) === fetchedTicketId,
        );

        const mappedData: Partial<RequirementInput> = {
          title: data.issue.subject,
          description: data.issue.description ?? "",
          priority:
            data.issue.priority?.toLowerCase() === "urgent" ||
            data.issue.priority?.toLowerCase() === "immediate"
              ? "critical"
              : data.issue.priority?.toLowerCase() === "high"
                ? "high"
                : data.issue.priority?.toLowerCase() === "low"
                  ? "low"
                  : "medium",
          redmineTicketId: fetchedTicketId,
        };

        if (existingReq) {
          mappedData.status = existingReq.status;
          mappedData.projectId = existingReq.projectId ?? undefined;
          mappedData.module = existingReq.module ?? undefined;
          mappedData.release = existingReq.release ?? undefined;
          mappedData.assigneeId = existingReq.assigneeId ?? undefined;

          updateMutation.mutate({
            id: existingReq.id,
            data: mappedData as any,
          });
          toast({
            title: "Requirement Overwritten",
            description: `Successfully updated Redmine #${fetchedTicketId}`,
          });
        } else {
          mappedData.status = "draft";
          createMutation.mutate({ data: mappedData as RequirementInput });
          toast({
            title: "Requirement Imported",
            description: `Successfully created Redmine #${fetchedTicketId}`,
          });
        }

        setRedmineDialogOpen(false);
        setRedmineInput("");
      } else {
        toast({
          variant: "destructive",
          title: "Could not fetch Redmine issue",
          description: data.error ?? "Not found or offline",
        });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to connect to Redmine" });
    } finally {
      setRedmineLoading(false);
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
          <Button
            variant="outline"
            onClick={() => setProjectDialogOpen(true)}
            className="gap-2 w-full sm:w-auto"
          >
            <FolderPlus className="w-4 h-4" /> New Project
          </Button>
          <Button
            variant="outline"
            onClick={() => setRedmineDialogOpen(true)}
            className="gap-2 w-full sm:w-auto"
          >
            <Download className="w-4 h-4" /> From Redmine
          </Button>
          <Button onClick={openCreate} className="gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" /> New Requirement
          </Button>
        </div>
      </div>

      {/* Selection banner */}
      {selectedReqs.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span>
              <strong>{selectedReqs.length}</strong> requirement
              {selectedReqs.length !== 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="sm:ml-auto flex w-full sm:w-auto items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-3 text-xs gap-1"
              onClick={() => confirmDelete(selectedReqs)}
            >
              <Trash2 className="w-3 h-3" /> Delete Selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 flex-1 sm:flex-none px-2 text-xs gap-1"
              onClick={() => setSelectedReqs([])}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative w-full lg:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 w-full"
                placeholder="Search by title, ID, assignee, or release..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {/* Extended Grid Layout for the Filters + Sort Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto shrink-0">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-muted/30">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground hidden sm:block" />
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="updated">Recently Updated</SelectItem>
                  <SelectItem value="priority">Highest Priority</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
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
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={filtered.length > 0 && selectedReqs.length === filtered.length}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                          aria-label="Select all requirements"
                        />
                      </TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Release</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRequirements.map((r) => (
                      <TableRow key={r.id} className={`hover:bg-muted/40 ${selectedReqs.includes(r.id) ? "bg-primary/5" : ""}`}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedReqs.includes(r.id)}
                            onCheckedChange={(checked) => handleSelectReq(r.id, !!checked)}
                            aria-label={`Select requirement ${r.title}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium line-clamp-2">{r.title}</p>
                            {r.module && (
                              <p className="text-xs text-muted-foreground">
                                {r.module}
                              </p>
                            )}
                            {r.redmineTicketId && (
                              <a
                                href={`https://redmine.bestinet.my/issues/${r.redmineTicketId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-0.5 w-fit"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />#
                                {r.redmineTicketId}
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.projectName ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${PRIORITY_COLORS[r.priority]}`}
                          >
                            {capitalize(r.priority)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[r.status]}`}
                          >
                            {capitalize(r.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.assigneeName ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.release ?? "—"}
                        </TableCell>
                        <TableCell>
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
                              <DropdownMenuItem onClick={() => openEdit(r)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => confirmDelete([r.id])}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/10 border-t gap-3">
                <div className="text-xs text-muted-foreground text-center sm:text-left w-full sm:w-auto">
                  Showing{" "}
                  <span className="font-medium">
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                  </span>{" "}
                  of <span className="font-medium">{filtered.length}</span>{" "}
                  requirements
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
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete {reqsToDelete.length > 1 ? `these ${reqsToDelete.length} requirements` : "this requirement"}? This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={executeDelete} 
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Confirm Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Requirement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {editingReq ? "Edit Requirement" : "New Requirement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="Requirement title"
                value={form.title ?? ""}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={errors.title ? "border-destructive" : ""}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe the requirement..."
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) =>
                    setForm({ ...form, projectId: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Priority <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.priority ?? "medium"}
                  onValueChange={(v) =>
                    setForm({ ...form, priority: v as any })
                  }
                >
                  <SelectTrigger
                    className={errors.priority ? "border-destructive" : ""}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Status <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.status ?? "draft"}
                  onValueChange={(v) => setForm({ ...form, status: v as any })}
                >
                  <SelectTrigger
                    className={errors.status ? "border-destructive" : ""}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="deprecated">Deprecated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select
                  value={form.assigneeId ? String(form.assigneeId) : ""}
                  onValueChange={(v) =>
                    setForm({ ...form, assigneeId: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <Input
                  placeholder="e.g. Auth, Payments"
                  value={form.module ?? ""}
                  onChange={(e) => setForm({ ...form, module: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Release</Label>
                <Input
                  placeholder="e.g. v3.0"
                  value={form.release ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, release: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Redmine Ticket ID</Label>
              <Input
                placeholder="e.g. 12345"
                value={form.redmineTicketId ?? ""}
                onChange={(e) =>
                  setForm({ ...form, redmineTicketId: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="w-full sm:w-auto"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingReq
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redmine Import Dialog */}
      <Dialog open={redmineDialogOpen} onOpenChange={setRedmineDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" /> Import from Redmine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Enter a Redmine ticket ID or URL to import its details as a new
              requirement.
            </p>
            <div className="space-y-1.5">
              <Label>Redmine Ticket ID or URL</Label>
              <Input
                placeholder="e.g. 34555 or https://redmine.example.com/issues/34555"
                value={redmineInput}
                onChange={(e) => setRedmineInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleImportFromRedmine()
                }
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button
              variant="outline"
              onClick={() => {
                setRedmineDialogOpen(false);
                setRedmineInput("");
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportFromRedmine}
              disabled={redmineLoading || !redmineInput.trim()}
              className="w-full sm:w-auto"
            >
              {redmineLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Fetching…
                </>
              ) : (
                "Import"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" /> New Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Mobile App v2"
                value={projectForm.name}
                onChange={(e) =>
                  setProjectForm({ ...projectForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="What is this project about?"
                value={projectForm.description}
                onChange={(e) =>
                  setProjectForm({
                    ...projectForm,
                    description: e.target.value,
                  })
                }
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={projectForm.status}
                onValueChange={(v) =>
                  setProjectForm({ ...projectForm, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button
              variant="outline"
              onClick={() => setProjectDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={createProjectMutation.isPending}
              className="w-full sm:w-auto"
            >
              {createProjectMutation.isPending
                ? "Creating..."
                : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}