import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import {
  listTasks,
  getListTasksQueryKey,
  listProjects,
  getListProjectsQueryKey,
  listUsers,
  getListUsersQueryKey,
  listRequirements,
  getListRequirementsQueryKey,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useReleaseTask,
  useAssignTask,
  type TaskInput,
} from "@workspace/api-client-react";
import { fetchModules } from "@/lib/execution-api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckSquare,
  AlertTriangle,
  UserCheck,
  LogOut,
  Users,
  Briefcase,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  CalendarRange,
  Clock,
  ExternalLink,
  Loader2,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  uat: "bg-purple-100 text-purple-700",
  sit: "bg-blue-100 text-blue-700",
  released_to_production: "bg-green-100 text-green-700",
  new: "bg-slate-100 text-slate-700",
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-blue-100 text-blue-700 border-blue-200",
  Low: "bg-slate-100 text-slate-700 border-slate-200",
};

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

// --- Detail Item Component for Expanded Rows ---
function DetailItem({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ fontFamily: '"Inter", sans-serif' }}>
      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
        {label}
      </span>
      <p className="text-sm font-normal whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// --- Excel Export Function ---
async function exportTasksToExcel(tasks: any[], allEvents: any[] = []) {
  const rows = tasks.map((t) => {
    // Match events for this specific task
    const taskEvents = allEvents.filter((e: any) => e.taskId === t.id);
    let eventDetails = "No events";

    if (taskEvents.length > 0) {
      eventDetails = taskEvents
        .map(
          (e: any) =>
            `• [${capitalize(e.severity)}] ${e.title}${e.description ? " - " + e.description : ""} (${e.startDate ? format(new Date(e.startDate), "dd MMM") : "N/A"} to ${e.endDate ? format(new Date(e.endDate), "dd MMM") : "N/A"})`,
        )
        .join("\n");
    }

    return {
      "Task Name": t.name ?? "",
      "Redmine ID": t.redmineId ?? "",
      Status: t.status ? capitalize(t.status) : "",
      Project: t.projectName ?? "",
      Priority: t.priority ?? "",
      Module: t.moduleName ?? "",
      Environments: t.environmentNames?.join(", ") ?? "",
      Assignees: t.assigneeNames?.join(", ") ?? "",
      "Planned Start Date": t.startDate ?? "",
      "Planned End Date": t.dueDate ?? "",
      "Actual Start Date": t.actualStartDate ?? "",
      "Actual End Date": t.actualEndDate ?? "",
      "Estimated Hours": t.estimatedHours ?? "",
      "Actual Hours": t.actualHours ?? "",
      "Completion %": t.completionPercentage ?? "",
      "Event Details": eventDetails, // NEW FIELD
      Notes: t.notes ?? "",
    };
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Tasks");

  const headers = Object.keys(rows[0] || {});
  worksheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: header === "Event Details" || header === "Task Name" ? 35 : 20,
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };

  if (rows.length > 0) {
    rows.forEach((row) => {
      const addedRow = worksheet.addRow(row);
      // Enable text wrapping for multiline event details
      addedRow.alignment = { vertical: "top", wrapText: true };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Workload Panel Component ---
function WorkloadPanel({
  tasks,
  users,
  onAssign,
}: {
  tasks: any[];
  users: Array<{ id: number; name: string; role: string }>;
  onAssign: (userId: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const qaMembers = users.filter(
    (u) => u.role === "qa_member" || u.role === "qa_lead",
  );

  const filteredMembers = qaMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredMembers.length / ITEMS_PER_PAGE);
  const paginatedMembers = filteredMembers.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base shrink-0">
          <Users className="w-4 h-4 text-primary" /> Team Workload
        </CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search member..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-full bg-muted/30 focus:bg-background"
          />
        </div>
      </CardHeader>
      <CardContent>
        {paginatedMembers.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-6">
            No team members found matching "{search}"
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {paginatedMembers.map((member) => {
              const memberTasks = tasks.filter((t) =>
                t.assigneeIds?.includes(member.id),
              );
              const activeTasks = memberTasks.filter(
                (t) => t.status !== "released_to_production",
              );
              const doneTasks = memberTasks.filter(
                (t) => t.status === "released_to_production",
              );
              const overdueTasks = activeTasks.filter((t) => t.isOverdue);

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                        {member.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm sm:text-xs font-semibold truncate">
                        {member.name.split(" ")[0]}
                      </p>
                      <p className="text-[11px] sm:text-[10px] text-muted-foreground capitalize truncate">
                        {member.role.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-5 px-1.5 gap-0.5"
                    >
                      <Briefcase className="w-2.5 h-2.5" /> {activeTasks.length}{" "}
                      active
                    </Badge>
                    {overdueTasks.length > 0 && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] h-5 px-1.5"
                      >
                        {overdueTasks.length} overdue
                      </Badge>
                    )}
                    {doneTasks.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 text-green-600 border-green-200"
                      >
                        {doneTasks.length} done
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs mt-auto w-full"
                    onClick={() => onAssign(member.id)}
                  >
                    <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Assign Tasks
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-medium">
                {(page - 1) * ITEMS_PER_PAGE + 1}
              </span>{" "}
              to{" "}
              <span className="font-medium">
                {Math.min(page * ITEMS_PER_PAGE, filteredMembers.length)}
              </span>{" "}
              of <span className="font-medium">{filteredMembers.length}</span>
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdminOrLead = user?.role === "admin" || user?.role === "qa_lead";

  // Search & Filter States
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [form, setForm] = useState<Partial<any>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Task Assignment Dialog State
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigneeComboOpen, setAssigneeComboOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<{
    taskIds: number[];
    assigneeId?: number;
  }>({ taskIds: [] });
  const [taskSearch, setTaskSearch] = useState("");

  // Single Assignment Dialog State
  const [singleAssignOpen, setSingleAssignOpen] = useState(false);
  const [taskToAssign, setTaskToAssign] = useState<any | null>(null);
  const [singleAssignSearch, setSingleAssignSearch] = useState("");

  // Event dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventTask, setEventTask] = useState<any | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    severity: "medium",
  });
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tasksToDelete, setTasksToDelete] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: getListTasksQueryKey(),
    queryFn: () => listTasks(),
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
    queryFn: () => fetchModules(),
  });

  const { data: executionProgress = {} } = useQuery<Record<string, { total: number; executed: number; overallPct: number }>>({
    queryKey: ["execution-progress"],
    queryFn: async () => {
      const res = await fetch("/api/execution-progress");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: environments = [] } = useQuery({
    queryKey: ["environments"],
    queryFn: async () => [
      { id: 1, name: "Env 1" },
      { id: 2, name: "Env 2" },
      { id: 3, name: "Env 3" },
      { id: 4, name: "Env 4" },
      { id: 5, name: "Env 5" },
      { id: 6, name: "Env 6" },
      { id: 7, name: "Env 7" },
    ],
  });

  // Automatically reset layout pages back to index 1 upon modifying table filters/sort
  useEffect(() => {
    setCurrentPage(1);
    setSelectedTasks([]);
    setExpandedId(null);
  }, [
    search,
    filterStatus,
    filterPriority,
    filterAssignee,
    filterModule,
    filterProject,
    sortBy,
  ]);

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setForm({});
        toast({ title: "Task created" });
      },
      onError: () =>
        toast({ variant: "destructive", title: "Failed to create task" }),
    },
  });

  const updateMutation = useUpdateTask({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
        setEditingTask(null);
        toast({ title: "Task updated" });
      },
      onError: () =>
        toast({ variant: "destructive", title: "Failed to update task" }),
    },
  });

  const deleteMutation = useDeleteTask({
    mutation: {
      onSuccess: () => {
        invalidate();
      },
      onError: () =>
        toast({ variant: "destructive", title: "Failed to delete task" }),
    },
  });

  const releaseMutation = useReleaseTask({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Task released — back in the pool" });
      },
      onError: () =>
        toast({ variant: "destructive", title: "Failed to release task" }),
    },
  });

  const assignMutation = useAssignTask({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Task assigned successfully" });
      },
      onError: () =>
        toast({ variant: "destructive", title: "Failed to assign task" }),
    },
  });

  const filtered = useMemo(() => {
    // 1. Filter the dataset
    let result = tasks.filter((t: any) => {
      if (!isAdminOrLead && !t.assigneeIds?.includes(user?.id)) return false;

      // Status filters
      if (filterStatus === "overdue") {
        if (!t.isOverdue || t.status === "released_to_production") return false;
      } else if (filterStatus !== "all" && t.status !== filterStatus) {
        return false;
      }

      // Dropdown filters
      if (filterPriority !== "all" && t.priority !== filterPriority)
        return false;
      if (
        filterAssignee !== "all" &&
        !t.assigneeIds?.includes(Number(filterAssignee))
      )
        return false;
      if (filterProject !== "all" && String(t.projectId) !== filterProject)
        return false;
      if (filterModule !== "all" && String(t.moduleId) !== filterModule)
        return false;

      // Global Search
      if (search) {
        const query = search.toLowerCase();
        const matchName = t.name?.toLowerCase().includes(query);
        const matchRedmineId = t.redmineId
          ? String(t.redmineId).toLowerCase().includes(query)
          : false;
        const matchNotes = t.notes?.toLowerCase().includes(query);
        const matchModule = t.moduleName?.toLowerCase().includes(query);
        const matchAssignee = t.assigneeNames?.some((n: string) =>
          n.toLowerCase().includes(query),
        );

        if (
          !matchName &&
          !matchRedmineId &&
          !matchNotes &&
          !matchModule &&
          !matchAssignee
        ) {
          return false;
        }
      }
      return true;
    });

    // 2. Sort the dataset
    result.sort((a: any, b: any) => {
      if (sortBy === "newest") {
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      }
      if (sortBy === "oldest") {
        return (
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime()
        );
      }
      if (sortBy === "updated") {
        return (
          new Date(b.updatedAt || 0).getTime() -
          new Date(a.updatedAt || 0).getTime()
        );
      }
      if (sortBy === "due_date") {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return dateA - dateB;
      }
      return 0;
    });

    return result;
  }, [
    tasks,
    search,
    filterStatus,
    filterPriority,
    filterAssignee,
    filterProject,
    filterModule,
    sortBy,
    user,
    isAdminOrLead,
  ]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedTasks = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTasks(filtered.map((t) => t.id));
    } else {
      setSelectedTasks([]);
    }
  };

  const handleSelectTask = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedTasks((prev) => [...prev, id]);
    } else {
      setSelectedTasks((prev) => prev.filter((taskId) => taskId !== id));
    }
  };

  const confirmDelete = (ids: number[]) => {
    setTasksToDelete(ids);
    setDeleteConfirmOpen(true);
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await Promise.all(
        tasksToDelete.map((id) => deleteMutation.mutateAsync({ id })),
      );
      setSelectedTasks((prev) =>
        prev.filter((id) => !tasksToDelete.includes(id)),
      );
      toast({ title: `Successfully deleted ${tasksToDelete.length} task(s)` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to delete one or more tasks",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setTasksToDelete([]);
    }
  };

  const handleExport = async () => {
    const toExport =
      selectedTasks.length > 0
        ? tasks.filter((t: any) => selectedTasks.includes(t.id))
        : filtered;

    if (toExport.length === 0) {
      return toast({ variant: "destructive", title: "No tasks to export" });
    }

    toast({ title: "Preparing export..." });

    // Fetch all events prior to compiling the export array
    let allEvents: any[] = [];
    try {
      const res = await fetch("/api/tasks/events/all");
      if (res.ok) {
        allEvents = await res.json();
      }
    } catch (error) {
      console.error("Failed to fetch events for export", error);
    }

    exportTasksToExcel(toExport, allEvents).then(() => {
      toast({ title: "Export complete" });
    });
  };

  const openCreate = () => {
    setEditingTask(null);
    setForm({
      status: "new",
      priority: "Medium",
      assigneeIds: [],
      environmentIds: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingTask(t);
    setForm({
      name: t.name,
      priority: t.priority,
      status: t.status,
      redmineId: t.redmineId ?? undefined,
      requirementId: t.requirementId ?? undefined,
      projectId: t.projectId ?? undefined,
      moduleId: t.moduleId ?? undefined,
      assigneeIds: t.assigneeIds ?? [],
      environmentIds: t.environmentIds ?? [],
      startDate: t.startDate ?? undefined,
      dueDate: t.dueDate ?? undefined,
      actualStartDate: t.actualStartDate ?? undefined,
      actualEndDate: t.actualEndDate ?? undefined,
      estimatedHours: t.estimatedHours ?? undefined,
      actualHours: t.actualHours ?? undefined,
      completionPercentage: t.completionPercentage ?? undefined,
      notes: t.notes ?? undefined,
    });
    setDialogOpen(true);
  };

  const openEventDialog = async (t: any) => {
    setEventTask(t);
    setEventForm({
      title: "",
      description: "",
      startDate: "",
      endDate: "",
      severity: "medium",
    });
    setEventDialogOpen(true);
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${t.id}/events`);
      if (res.ok) setEvents(await res.json());
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!eventTask || !eventForm.title.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${eventTask.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventForm.title.trim(),
          description: eventForm.description || undefined,
          startDate: eventForm.startDate || undefined,
          endDate: eventForm.endDate || undefined,
          severity: eventForm.severity,
          createdBy: user?.id,
        }),
      });
      if (res.ok) {
        const newEvent = await res.json();
        setEvents((prev) => [newEvent, ...prev]);
        setEventForm({
          title: "",
          description: "",
          startDate: "",
          endDate: "",
          severity: "medium",
        });
        toast({ title: "Event added" });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to add event" });
    }
  };

  const openAssignDialog = (userId?: number) => {
    setAssignForm({ taskIds: [], assigneeId: userId });
    setTaskSearch("");
    setAssignDialogOpen(true);
  };

  const openSingleAssignDialog = (task: any) => {
    setTaskToAssign(task);
    setSingleAssignSearch("");
    setSingleAssignOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, data: form as any });
    } else {
      createMutation.mutate({ data: form as TaskInput });
    }
  };

  const [isAssigning, setIsAssigning] = useState(false);

  const handleAssignTasks = async () => {
    if (!assignForm.assigneeId || assignForm.taskIds.length === 0) return;

    setIsAssigning(true);
    try {
      const promises = assignForm.taskIds.map((taskId) => {
        const task = tasks.find((t: any) => t.id === taskId);
        const updatedAssignees = [
          ...new Set([...(task?.assigneeIds || []), assignForm.assigneeId]),
        ];
        return assignMutation.mutateAsync({
          id: taskId,
          data: { assigneeIds: updatedAssignees },
        });
      });
      await Promise.all(promises);
      invalidate();
      toast({
        title: `${assignForm.taskIds.length} task${assignForm.taskIds.length > 1 ? "s" : ""} assigned successfully`,
      });
      setAssignDialogOpen(false);
      setAssignForm({ taskIds: [] });
    } catch {
      toast({ variant: "destructive", title: "Some assignments failed" });
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleTaskSelection = (taskId: number) => {
    setAssignForm((prev) => ({
      ...prev,
      taskIds: prev.taskIds.includes(taskId)
        ? prev.taskIds.filter((id) => id !== taskId)
        : [...prev.taskIds, taskId],
    }));
  };

  const assignableTasks = useMemo(() => {
    return tasks.filter(
      (t: any) =>
        t.status !== "released_to_production" &&
        (!taskSearch ||
          (t.name || "").toLowerCase().includes(taskSearch.toLowerCase())),
    );
  }, [tasks, taskSearch]);

  const quickStatusChange = (task: any, newStatus: string) => {
    updateMutation.mutate({ id: task.id, data: { status: newStatus as any } });
  };

  const canRelease = (t: any) => {
    if (isAdminOrLead) return true;
    return t.assigneeIds?.includes(user?.id);
  };

  // Helper arrays toggling
  const toggleArrayItem = (
    key: "assigneeIds" | "environmentIds",
    id: number,
  ) => {
    setForm((prev) => {
      const arr = prev[key] || [];
      return {
        ...prev,
        [key]: arr.includes(id)
          ? arr.filter((itemId) => itemId !== id)
          : [...arr, id],
      };
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-primary" /> Tasks
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage QA tasks
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4" />
            {selectedTasks.length > 0
              ? `Export ${selectedTasks.length}`
              : "Export"}
          </Button>
          <Button onClick={openCreate} className="gap-2 flex-1 sm:flex-none">
            <Plus className="w-4 h-4" /> New Task
          </Button>
        </div>
      </div>

      {isAdminOrLead && (
        <WorkloadPanel
          tasks={tasks}
          users={users}
          onAssign={openAssignDialog}
        />
      )}

      <Card>
        <CardHeader className="pb-4 space-y-3">
          {/* Row 1: search + optional bulk-delete */}
          <div className="flex gap-3">
            {selectedTasks.length > 0 && (
              <Button
                variant="destructive"
                className="shrink-0"
                onClick={() => confirmDelete(selectedTasks)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedTasks.length})
              </Button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 w-full"
                placeholder="Search tasks, Redmine ID, modules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: filters — wrap naturally so nothing overflows */}
          <div className="flex flex-wrap gap-2">
            <SearchableSelect
              value={sortBy}
              onValueChange={setSortBy}
              options={[
                { value: "newest", label: "Newest First" },
                { value: "oldest", label: "Oldest First" },
                { value: "updated", label: "Recently Updated" },
                { value: "due_date", label: "Due Date" },
              ]}
              placeholder="Sort By"
              searchPlaceholder="Search..."
              className="flex-1 min-w-[130px] bg-muted/30"
            />

            <SearchableSelect
              value={filterPriority}
              onValueChange={setFilterPriority}
              options={[
                { value: "all", label: "All Priorities" },
                { value: "Critical", label: "Critical" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" },
              ]}
              placeholder="Priority"
              searchPlaceholder="Search..."
              className="flex-1 min-w-[120px]"
            />

            <SearchableSelect
              value={filterModule}
              onValueChange={setFilterModule}
              options={[
                { value: "all", label: "All Modules" },
                ...modules.map((m: any) => ({ value: String(m.id), label: m.name })),
              ]}
              placeholder="Module"
              searchPlaceholder="Search module..."
              className="flex-1 min-w-[120px]"
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
              className="flex-1 min-w-[130px]"
            />

            <SearchableSelect
              value={filterStatus}
              onValueChange={setFilterStatus}
              options={[
                { value: "all", label: "All Status" },
                { value: "new", label: "New" },
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In Progress" },
                { value: "blocked", label: "Blocked" },
                { value: "uat", label: "UAT" },
                { value: "sit", label: "SIT" },
                { value: "done", label: "Done" },
                { value: "released_to_production", label: "Released" },
                { value: "overdue", label: "Overdue" },
              ]}
              placeholder="Status"
              searchPlaceholder="Search status..."
              className="flex-1 min-w-[120px]"
            />

            {isAdminOrLead && (
              <SearchableSelect
                value={filterAssignee}
                onValueChange={setFilterAssignee}
                options={[
                  { value: "all", label: "All Assignees" },
                  ...users.map((u) => ({ value: String(u.id), label: u.name })),
                ]}
                placeholder="Assignee"
                searchPlaceholder="Search assignee..."
                className="flex-1 min-w-[130px]"
              />
            )}
          </div>
          {filterStatus === "overdue" && (
            <div className="flex items-center gap-2 mt-1 px-1">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">
                Showing {filtered.length} overdue task
                {filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                {filterStatus === "overdue"
                  ? "No overdue tasks — great work!"
                  : "No tasks found"}
              </p>
              {filterStatus !== "overdue" && (
                <Button variant="outline" className="mt-4" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add first task
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col w-full">
              <div className="overflow-x-auto w-full pb-2">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={
                            filtered.length > 0 &&
                            selectedTasks.length === filtered.length
                          }
                          onCheckedChange={(checked) =>
                            handleSelectAll(!!checked)
                          }
                          aria-label="Select all tasks"
                        />
                      </TableHead>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="min-w-[200px]">Task</TableHead>
                      <TableHead className="whitespace-nowrap">
                        Priority
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[120px]">
                        Status
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[140px]">
                        Assignee(s)
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[100px]">
                        Due Date
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[120px]">
                        Progress
                      </TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTasks.map((t: any) => (
                      <React.Fragment key={t.id}>
                        <TableRow
                          className={`hover:bg-muted/40 cursor-pointer ${selectedTasks.includes(t.id) ? "bg-primary/5" : ""} ${expandedId === t.id ? "bg-muted/20" : ""} ${t.isOverdue && t.status !== "released_to_production" ? "bg-red-50/40" : ""}`}
                          onClick={() =>
                            setExpandedId(expandedId === t.id ? null : t.id)
                          }
                        >
                          <TableCell
                            className="text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selectedTasks.includes(t.id)}
                              onCheckedChange={(checked) =>
                                handleSelectTask(t.id, !!checked)
                              }
                              aria-label={`Select task ${t.name}`}
                            />
                          </TableCell>
                          <TableCell className="py-3 pl-0 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 p-0 hover:bg-transparent"
                            >
                              {expandedId === t.id ? (
                                <ChevronDown className="w-4 h-4 text-primary" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium flex items-center gap-1.5">
                                {t.isOverdue &&
                                  t.status !== "released_to_production" && (
                                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                  )}
                                {t.name}
                              </p>
                              {t.projectName && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {t.projectName}
                                </p>
                              )}
                              {t.redmineId && (
                                <a
                                  href={`https://redmine.bestinet.my/issues/${t.redmineId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mt-0.5 w-fit"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />#
                                  {t.redmineId}
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.Medium}`}
                            >
                              {t.priority || "Medium"}
                            </span>
                          </TableCell>
                          <TableCell
                            className="whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <SearchableSelect
                              value={t.status}
                              onValueChange={(v) => quickStatusChange(t, v)}
                              options={[
                                { value: "new", label: "New" },
                                { value: "pending", label: "Pending" },
                                { value: "in_progress", label: "In Progress" },
                                { value: "blocked", label: "Blocked" },
                                { value: "uat", label: "UAT" },
                                { value: "sit", label: "SIT" },
                                { value: "done", label: "Done" },
                                { value: "released_to_production", label: "Released" },
                              ]}
                              searchPlaceholder="Search status..."
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.assigneeNames && t.assigneeNames.length > 0 ? (
                              <div className="flex -space-x-2">
                                {t.assigneeNames.map(
                                  (name: string, i: number) => (
                                    <Avatar
                                      key={i}
                                      className="w-7 h-7 border-2 border-background"
                                      title={name}
                                    >
                                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                        {name.substring(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                  ),
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">
                                Unassigned
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span
                              className={`text-sm font-medium px-2 py-0.5 rounded ${
                                t.isOverdue &&
                                t.status !== "released_to_production"
                                  ? "bg-red-100 text-red-700"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {t.dueDate
                                ? format(new Date(t.dueDate), "MMM d")
                                : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {(() => {
                              const execProg = t.redmineId ? executionProgress[t.redmineId] : null;
                              const pct = execProg ? execProg.overallPct : (t.completionPercentage ?? null);
                              if (pct === null || pct === undefined) return "—";
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden w-16">
                                    <div
                                      className="h-full bg-primary rounded-full transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-8">
                                    {pct}%
                                  </span>
                                  {execProg && (
                                    <span className="text-xs text-muted-foreground">
                                      {execProg.executed}/{execProg.total}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
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
                                <DropdownMenuItem onClick={() => openEdit(t)}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Update
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openEventDialog(t)}
                                >
                                  <CalendarRange className="w-4 h-4 mr-2" />
                                  Event
                                </DropdownMenuItem>

                                {isAdminOrLead && (
                                  <DropdownMenuItem
                                    onClick={() => openSingleAssignDialog(t)}
                                  >
                                    <UserCheck className="w-4 h-4 mr-2" />
                                    Assign member(s)
                                  </DropdownMenuItem>
                                )}

                                {canRelease(t) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-orange-600 focus:text-orange-600"
                                      onClick={() =>
                                        releaseMutation.mutate({ id: t.id })
                                      }
                                    >
                                      <LogOut className="w-4 h-4 mr-2" />
                                      Release task
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => confirmDelete([t.id])}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {/* EXPANDED DETAILS GRID */}
                        {expandedId === t.id && (
                          <TableRow className="bg-muted/5 hover:bg-muted/5 border-b shadow-inner">
                            <TableCell colSpan={9} className="p-0">
                              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6 border-l-4 border-primary/40 ml-2">
                                <div className="space-y-4">
                                  <DetailItem
                                    label="Redmine ID"
                                    value={t.redmineId}
                                  />
                                  <DetailItem
                                    label="Priority"
                                    value={t.priority}
                                  />
                                  <DetailItem
                                    label="Module"
                                    value={t.moduleName}
                                  />
                                  <DetailItem
                                    label="Environments"
                                    value={t.environmentNames?.join(", ")}
                                  />
                                </div>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-2">
                                    <DetailItem
                                      label="Planned Start"
                                      value={t.startDate}
                                    />
                                    <DetailItem
                                      label="Planned End"
                                      value={t.dueDate}
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <DetailItem
                                      label="Actual Start"
                                      value={t.actualStartDate}
                                    />
                                    <DetailItem
                                      label="Actual End"
                                      value={t.actualEndDate}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-2">
                                    <DetailItem
                                      label="Est. Hours"
                                      value={t.estimatedHours}
                                    />
                                    <DetailItem
                                      label="Act. Hours"
                                      value={t.actualHours}
                                    />
                                  </div>
                                  <DetailItem
                                    label="Completion"
                                    value={(() => {
                                      const execProg = t.redmineId ? executionProgress[t.redmineId] : null;
                                      if (execProg) return `${execProg.overallPct}% (${execProg.executed}/${execProg.total} executed)`;
                                      return t.completionPercentage != null ? `${t.completionPercentage}%` : null;
                                    })()}
                                  />
                                  <DetailItem label="Notes" value={t.notes} />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-muted/10 border-t gap-3">
                <div className="text-xs text-muted-foreground text-center sm:text-left w-full sm:w-auto">
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
                  tasks
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

      {/* --- CREATE / EDIT DIALOG (REORGANIZED) --- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* GROUP 1: Core Identifiers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Task Name *</Label>
                <Input
                  placeholder="Task name"
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Redmine ID</Label>
                <Input
                  placeholder="e.g. 29303"
                  value={form.redmineId ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, redmineId: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <SearchableSelect
                  value={form.status ?? "new"}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                  options={[
                    { value: "new", label: "New" },
                    { value: "pending", label: "Pending" },
                    { value: "in_progress", label: "In Progress" },
                    { value: "blocked", label: "Blocked" },
                    { value: "uat", label: "UAT" },
                    { value: "sit", label: "SIT" },
                    { value: "done", label: "Done" },
                    { value: "released_to_production", label: "Released" },
                  ]}
                  searchPlaceholder="Search status..."
                />
              </div>
            </div>

            {/* GROUP 2: Classification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border p-4 rounded-lg bg-muted/5">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <SearchableSelect
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) => setForm({ ...form, projectId: Number(v) })}
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  placeholder="Select Project..."
                  searchPlaceholder="Search project..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <SearchableSelect
                  value={form.priority ?? "Medium"}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                  options={[
                    { value: "Critical", label: "Critical" },
                    { value: "High", label: "High" },
                    { value: "Medium", label: "Medium" },
                    { value: "Low", label: "Low" },
                  ]}
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Module</Label>
                <SearchableSelect
                  value={form.moduleId ? String(form.moduleId) : ""}
                  onValueChange={(v) => setForm({ ...form, moduleId: Number(v) })}
                  options={modules.map((m: any) => ({ value: String(m.id), label: m.name }))}
                  placeholder="Select Module"
                  searchPlaceholder="Search module..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Environment(s)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal overflow-hidden min-h-9 h-auto py-1.5 px-3"
                    >
                      {form.environmentIds?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {form.environmentIds.map((id: number) => {
                            const env = environments.find(
                              (e: any) => e.id === id,
                            );
                            return (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="font-normal text-xs py-0 h-5"
                              >
                                {env?.name || `ID: ${id}`}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Select Environments...
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search environments..." />
                      <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>No environment found.</CommandEmpty>
                        <CommandGroup>
                          {environments.map((env: any) => (
                            <CommandItem
                              key={env.id}
                              onSelect={() =>
                                toggleArrayItem("environmentIds", env.id)
                              }
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={form.environmentIds?.includes(env.id)}
                                className="pointer-events-none"
                              />
                              {env.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Assignee(s) (QA PIC)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal overflow-hidden min-h-9 h-auto py-1.5 px-3"
                    >
                      {form.assigneeIds?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {form.assigneeIds.map((id: number) => {
                            const u = users.find((user) => user.id === id);
                            return (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="font-normal text-xs py-0 h-5"
                              >
                                {u?.name || `ID: ${id}`}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Select QA PICs...
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search QA..." />
                      <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                        <CommandEmpty>No QA found.</CommandEmpty>
                        <CommandGroup>
                          {users
                            .filter(
                              (u) =>
                                u.role === "qa_member" || u.role === "qa_lead",
                            )
                            .map((u) => (
                              <CommandItem
                                key={u.id}
                                onSelect={() =>
                                  toggleArrayItem("assigneeIds", u.id)
                                }
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Checkbox
                                  checked={form.assigneeIds?.includes(u.id)}
                                  className="pointer-events-none"
                                />
                                <Avatar className="w-5 h-5">
                                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                    {u.name.substring(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                {u.name}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* GROUP 3: Scheduling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Planned Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Planned End Date</Label>
                <Input
                  type="date"
                  value={form.dueDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Actual Start Date</Label>
                <Input
                  type="date"
                  value={form.actualStartDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, actualStartDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Actual End Date</Label>
                <Input
                  type="date"
                  value={form.actualEndDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, actualEndDate: e.target.value })
                  }
                />
              </div>
            </div>

            {/* GROUP 4: Metrics & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
              <div className="space-y-1.5">
                <Label>Est. Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.estimatedHours ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, estimatedHours: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Actual Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.actualHours ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, actualHours: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Completion %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.completionPercentage ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      completionPercentage: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional context..."
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={
                !form.name ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingTask
                  ? "Save Changes"
                  : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- BULK DELETE CONFIRM DIALOG --- */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px] w-[96vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              {tasksToDelete.length > 1
                ? `these ${tasksToDelete.length} tasks`
                : "this task"}
              ? This action cannot be undone.
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

      {/* --- EVENT DIALOG --- */}
      <Dialog
        open={eventDialogOpen}
        onOpenChange={(o) => {
          if (!o) setEventDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-primary" />
              Task Events
              {eventTask && (
                <span className="text-muted-foreground text-sm font-normal">
                  — {eventTask.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Existing Events</h4>
              {eventsLoading ? (
                <div className="text-sm text-muted-foreground py-2">
                  Loading events...
                </div>
              ) : events.length === 0 ? (
                <div className="text-sm text-muted-foreground py-2">
                  No events yet
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                  {events.map((ev) => (
                    <div key={ev.id} className="border rounded-md p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{ev.title}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            ev.severity === "high"
                              ? "bg-red-100 text-red-700"
                              : ev.severity === "medium"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {ev.severity}
                        </span>
                      </div>
                      {ev.description && (
                        <p className="text-muted-foreground text-xs mt-1">
                          {ev.description}
                        </p>
                      )}
                      {(ev.startDate || ev.endDate) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="w-3 h-3" />
                          {ev.startDate &&
                            format(new Date(ev.startDate), "MMM d")}
                          {ev.startDate && ev.endDate && " - "}
                          {ev.endDate && format(new Date(ev.endDate), "MMM d")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium">Add New Event</h4>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input
                  placeholder="Event title"
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  placeholder="Event description..."
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm({ ...eventForm, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={eventForm.startDate}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, startDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={eventForm.endDate}
                    onChange={(e) =>
                      setEventForm({ ...eventForm, endDate: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <SearchableSelect
                  value={eventForm.severity}
                  onValueChange={(v) => setEventForm({ ...eventForm, severity: v })}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                  searchPlaceholder="Search..."
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setEventDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleCreateEvent}
              disabled={!eventForm.title.trim()}
            >
              Add Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- SINGLE ASSIGNMENT DIALOG --- */}
      <Dialog open={singleAssignOpen} onOpenChange={setSingleAssignOpen}>
        <DialogContent className="sm:max-w-[400px] w-[96vw] max-h-[80vh] flex flex-col p-4">
          <DialogHeader>
            <DialogTitle>Assign Member</DialogTitle>
          </DialogHeader>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              className="pl-8 h-9"
              value={singleAssignSearch}
              onChange={(e) => setSingleAssignSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto mt-4 space-y-1 pr-1 max-h-[300px]">
            {users
              .filter((u) => u.role === "qa_member" || u.role === "qa_lead")
              .filter(
                (u) =>
                  !singleAssignSearch ||
                  u.name
                    .toLowerCase()
                    .includes(singleAssignSearch.toLowerCase()),
              )
              .map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                    taskToAssign?.assigneeIds?.includes(u.id)
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    if (taskToAssign) {
                      const updatedAssignees = [
                        ...new Set([...(taskToAssign.assigneeIds || []), u.id]),
                      ];
                      assignMutation.mutate({
                        id: taskToAssign.id,
                        data: { assigneeIds: updatedAssignees },
                      });
                      setSingleAssignOpen(false);
                    }
                  }}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {u.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground capitalize truncate">
                      {u.role.replace(/_/g, " ")}
                    </p>
                  </div>
                  {taskToAssign?.assigneeIds?.includes(u.id) && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* --- BULK ASSIGNMENT DIALOG --- */}
      <Dialog
        open={assignDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAssignDialogOpen(false);
            setAssignForm({ taskIds: [] });
            setTaskSearch("");
            setAssigneeComboOpen(false);
          }
        }}
      >
        <DialogContent className="w-[min(96vw,64rem)] max-w-[64rem] max-h-[90vh] overflow-y-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="w-4 h-4 text-primary" /> Assign Tasks
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Assign To <span className="text-destructive">*</span>
              </Label>
              <Popover
                open={assigneeComboOpen}
                onOpenChange={setAssigneeComboOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-9 px-3"
                  >
                    {assignForm.assigneeId ? (
                      (() => {
                        const u = users.find(
                          (u) => u.id === assignForm.assigneeId,
                        );
                        return u ? (
                          <span className="flex items-center gap-2">
                            <Avatar className="w-5 h-5">
                              <AvatarFallback className="text-[10px]">
                                {u.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            {u.name}
                            <span className="text-muted-foreground text-xs">
                              ({u.role.replace(/_/g, " ")})
                            </span>
                          </span>
                        ) : (
                          "Select member..."
                        );
                      })()
                    ) : (
                      <span className="text-muted-foreground">
                        Select QA member...
                      </span>
                    )}
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Search member..."
                      className="h-9"
                    />
                    <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
                      <CommandEmpty>No member found.</CommandEmpty>
                      <CommandGroup>
                        {users
                          .filter(
                            (u) =>
                              u.role === "qa_member" || u.role === "qa_lead",
                          )
                          .map((u) => (
                            <CommandItem
                              key={u.id}
                              value={`${u.name} ${u.role}`}
                              onSelect={() => {
                                setAssignForm({
                                  ...assignForm,
                                  assigneeId: u.id,
                                });
                                setAssigneeComboOpen(false);
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Avatar className="w-6 h-6">
                                <AvatarFallback className="text-[10px]">
                                  {u.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1">{u.name}</span>
                              <span className="text-xs text-muted-foreground capitalize hidden sm:inline">
                                {u.role.replace(/_/g, " ")}
                              </span>
                              {assignForm.assigneeId === u.id && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Select Tasks <span className="text-destructive">*</span>
                </Label>
                {assignForm.taskIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-medium">
                    {assignForm.taskIds.length} selected
                  </Badge>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search existing tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
                {taskSearch && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setTaskSearch("")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden bg-background">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 bg-muted/50 border-b cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  onClick={() => {
                    const allIds = assignableTasks.map((t) => t.id);
                    const allSelected = allIds.every((id) =>
                      assignForm.taskIds.includes(id),
                    );
                    if (allSelected) {
                      setAssignForm((prev) => ({
                        ...prev,
                        taskIds: prev.taskIds.filter(
                          (id) => !allIds.includes(id),
                        ),
                      }));
                    } else {
                      setAssignForm((prev) => ({
                        ...prev,
                        taskIds: [...new Set([...prev.taskIds, ...allIds])],
                      }));
                    }
                  }}
                >
                  <Checkbox
                    checked={
                      assignableTasks.length > 0 &&
                      assignableTasks.every((t) =>
                        assignForm.taskIds.includes(t.id),
                      )
                    }
                    onCheckedChange={() => {}}
                    className="pointer-events-none"
                  />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Select all ({assignableTasks.length})
                  </span>
                </div>

                <div className="min-h-[100px] max-h-60 overflow-y-auto divide-y">
                  {assignableTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No active tasks found
                    </p>
                  ) : (
                    assignableTasks.map((task) => {
                      const selected = assignForm.taskIds.includes(task.id);
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none ${selected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"}`}
                          onClick={() => toggleTaskSelection(task.id)}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleTaskSelection(task.id)}
                            className="pointer-events-none shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug truncate">
                              {task.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.assigneeNames?.length
                                ? `Currently: ${task.assigneeNames.join(", ")} • `
                                : "Unassigned • "}
                              {task.projectName ?? "No Project"}
                            </p>
                          </div>
                          {selected && (
                            <Check className="w-4 h-4 text-primary shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {assignForm.taskIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pt-1">
                  {assignForm.taskIds.map((id) => {
                    const t = tasks.find((task) => task.id === id);
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1 text-xs pl-2 pr-1 py-1"
                      >
                        <span className="truncate max-w-[140px]">
                          {t?.name ?? `Task #${id}`}
                        </span>
                        <button
                          className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5 transition-colors"
                          onClick={() => toggleTaskSelection(id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignTasks}
              disabled={
                assignForm.taskIds.length === 0 ||
                !assignForm.assigneeId ||
                isAssigning
              }
              className="w-full sm:w-auto min-w-[140px]"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assigning...
                </>
              ) : assignForm.taskIds.length > 0 ? (
                `Assign ${assignForm.taskIds.length} Task${assignForm.taskIds.length !== 1 ? "s" : ""}`
              ) : (
                "Assign Tasks"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
