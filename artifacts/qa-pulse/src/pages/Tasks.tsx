import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  type Task,
  type TaskInput,
} from "@workspace/api-client-react";
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
  Check,
  CalendarRange,
  Clock,
  ExternalLink,
  Loader2,
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

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "";
}

function WorkloadPanel({
  tasks,
  users,
  onAssign,
}: {
  tasks: Task[];
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
              const memberTasks = tasks.filter(
                (t) => t.assigneeId === member.id,
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

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<Partial<TaskInput>>({});

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Task Assignment Dialog State (Bulk assignment from workload panel)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigneeComboOpen, setAssigneeComboOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<{
    taskIds: number[];
    assigneeId?: number;
  }>({ taskIds: [] });
  const [taskSearch, setTaskSearch] = useState("");

  // Single Assignment Dialog State (From individual task dropdown)
  const [singleAssignOpen, setSingleAssignOpen] = useState(false);
  const [taskToAssign, setTaskToAssign] = useState<Task | null>(null);
  const [singleAssignSearch, setSingleAssignSearch] = useState("");

  // Event dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventTask, setEventTask] = useState<Task | null>(null);
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

  useEffect(() => {
    setCurrentPage(1);
    setSelectedTasks([]);
  }, [search, filterStatus, filterAssignee, filterProject]);

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

  const filtered = tasks.filter((t) => {
    if (!isAdminOrLead && t.assigneeId !== user?.id) return false;

    // Status filters
    if (filterStatus === "overdue") {
      if (!t.isOverdue || t.status === "released_to_production") return false;
    } else if (filterStatus !== "all" && t.status !== filterStatus) {
      return false;
    }

    // Assignee / Project filters
    if (filterAssignee !== "all" && String(t.assigneeId) !== filterAssignee) return false;
    if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;

    // Search filter (Task Name OR Redmine ID)
    if (search) {
      const searchLower = search.toLowerCase();
      const matchName = t.name.toLowerCase().includes(searchLower);
      const matchRedmineId = t.redmineId ? String(t.redmineId).toLowerCase().includes(searchLower) : false;

      if (!matchName && !matchRedmineId) {
        return false;
      }
    }

    return true;
  });

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
        tasksToDelete.map((id) => deleteMutation.mutateAsync({ id }))
      );
      setSelectedTasks((prev) => prev.filter((id) => !tasksToDelete.includes(id)));
      toast({ title: `Successfully deleted ${tasksToDelete.length} task(s)` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete one or more tasks" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setTasksToDelete([]);
    }
  };

  const openCreate = () => {
    setEditingTask(null);
    setForm({ status: "uat", type: "testing" });
    setDialogOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditingTask(t);
    setForm({
      name: t.name,
      type: t.type,
      status: t.status,
      redmineId: t.redmineId ?? undefined,
      requirementId: t.requirementId ?? undefined,
      projectId: t.projectId ?? undefined,
      assigneeId: t.assigneeId ?? undefined,
      startDate: t.startDate ?? undefined,
      dueDate: t.dueDate ?? undefined,
      estimatedHours: t.estimatedHours ?? undefined,
      actualHours: t.actualHours ?? undefined,
      completionPercentage: t.completionPercentage ?? undefined,
      notes: t.notes ?? undefined,
    });
    setDialogOpen(true);
  };

  const openEventDialog = async (t: Task) => {
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

  const openSingleAssignDialog = (task: Task) => {
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
      const promises = assignForm.taskIds.map((taskId) =>
        assignMutation.mutateAsync({
          id: taskId,
          data: { assigneeId: assignForm.assigneeId! },
        })
      );
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
      (t) =>
        t.status !== "released_to_production" &&
        (!taskSearch || t.name.toLowerCase().includes(taskSearch.toLowerCase()))
    );
  }, [tasks, taskSearch]);

  const quickStatusChange = (task: Task, newStatus: string) => {
    updateMutation.mutate({ id: task.id, data: { status: newStatus as any } });
  };

  const canRelease = (t: Task) => {
    if (isAdminOrLead) return true;
    return t.assigneeId === user?.id;
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
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={openCreate} className="gap-2 w-full sm:w-auto">
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
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-3">
            {selectedTasks.length > 0 && (
              <Button 
                variant="destructive" 
                className="shrink-0 w-full md:w-auto"
                onClick={() => confirmDelete(selectedTasks)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedTasks.length})
              </Button>
            )}

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 w-full"
                placeholder="Search tasks or Redmine ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-full sm:w-40">
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
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="uat">UAT</SelectItem>
                  <SelectItem value="sit">SIT</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="released_to_production">
                    Released to Production
                  </SelectItem>
                  <SelectItem value="overdue">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />{" "}
                      Overdue
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {isAdminOrLead && (
                <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Assignee" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">All Assignees</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
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
                    <TableRow>
                      <TableHead className="w-12 text-center">
                        <Checkbox
                          checked={filtered.length > 0 && selectedTasks.length === filtered.length}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                          aria-label="Select all tasks"
                        />
                      </TableHead>
                      <TableHead className="min-w-[200px]">Task</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                      <TableHead className="whitespace-nowrap min-w-[120px]">
                        Status
                      </TableHead>
                      <TableHead className="whitespace-nowrap min-w-[140px]">
                        Assignee
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
                    {paginatedTasks.map((t) => (
                      <TableRow
                        key={t.id}
                        className={`hover:bg-muted/40 ${t.isOverdue && t.status !== "released_to_production" ? "bg-red-50/40" : ""}`}
                      >
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedTasks.includes(t.id)}
                            onCheckedChange={(checked) => handleSelectTask(t.id, !!checked)}
                            aria-label={`Select task ${t.name}`}
                          />
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
                                <ExternalLink className="w-3 h-3" />#{t.redmineId}
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap capitalize text-sm text-muted-foreground">
                          {t.type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Select
                            value={t.status}
                            onValueChange={(v) => quickStatusChange(t, v)}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 p-0 focus:ring-0">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}
                              >
                                {capitalize(t.status)}
                              </span>
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">
                                In Progress
                              </SelectItem>
                              <SelectItem value="blocked">Blocked</SelectItem>
                              <SelectItem value="uat">UAT</SelectItem>
                              <SelectItem value="sit">SIT</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="released_to_production">
                                Released to Production
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {t.assigneeName ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="w-6 h-6">
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                  {t.assigneeName.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{t.assigneeName}</span>
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
                          {t.completionPercentage !== null &&
                          t.completionPercentage !== undefined ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden w-16">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{
                                    width: `${t.completionPercentage}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">
                                {t.completionPercentage}%
                              </span>
                            </div>
                          ) : (
                            "—"
                          )}
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
                                  {t.assigneeId ? "Re-assign member" : "Assign to member"}
                                </DropdownMenuItem>
                              )}

                              {canRelease(t) && t.assigneeId !== null && (
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
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t">
                <div className="text-xs text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium">
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                  </span>{" "}
                  of <span className="font-medium">{filtered.length}</span>{" "}
                  tasks
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
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
              Are you sure you want to delete {tasksToDelete.length > 1 ? `these ${tasksToDelete.length} tasks` : "this task"}? This action cannot be undone.
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

      {/* --- CREATE / EDIT DIALOG --- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg w-[96vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Task Name *</Label>
              <Input
                placeholder="Task name"
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type ?? "testing"}
                  onValueChange={(v) => setForm({ ...form, type: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="bug_verification">Bug Verification</SelectItem>
                    <SelectItem value="test_case_creation">Test Case Creation</SelectItem>
                    <SelectItem value="regression">Regression</SelectItem>
                    <SelectItem value="automation">Automation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status ?? "uat"}
                  onValueChange={(v) => setForm({ ...form, status: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="sit">SIT</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="released_to_production">Released to Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select
                  value={form.projectId ? String(form.projectId) : ""}
                  onValueChange={(v) =>
                    setForm({ ...form, projectId: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
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
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.startDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.dueDate ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Estimated Hours</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
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
                  min="0"
                  step="0.5"
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
              <Label>Redmine ID</Label>
              <Input
                placeholder="Link to Execution Dashboard (e.g. 29303)"
                value={form.redmineId ?? ""}
                onChange={(e) =>
                  setForm({ ...form, redmineId: e.target.value })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={!form.name || createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingTask
                  ? "Save Changes"
                  : "Create"}
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
                <Select
                  value={eventForm.severity}
                  onValueChange={(v) =>
                    setEventForm({ ...eventForm, severity: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEventDialogOpen(false)}>
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
          <div className="flex-1 overflow-y-auto mt-4 space-y-1 pr-1">
            {users
              .filter((u) => u.role === "qa_member" || u.role === "qa_lead")
              .filter(
                (u) =>
                  !singleAssignSearch ||
                  u.name.toLowerCase().includes(singleAssignSearch.toLowerCase())
              )
              .map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                    taskToAssign?.assigneeId === u.id
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    if (taskToAssign) {
                      assignMutation.mutate({
                        id: taskToAssign.id,
                        data: { assigneeId: u.id },
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
                  {taskToAssign?.assigneeId === u.id && (
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
                    <CommandList>
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
                        taskIds: [
                          ...new Set([...prev.taskIds, ...allIds]),
                        ],
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

                <div className="max-h-56 overflow-y-auto divide-y">
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
                            onCheckedChange={() =>
                              toggleTaskSelection(task.id)
                            }
                            className="pointer-events-none shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug truncate">
                              {task.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.assigneeName ? `Currently: ${task.assigneeName} • ` : "Unassigned • "}
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