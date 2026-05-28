import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listTasks, getListTasksQueryKey,
  listProjects, getListProjectsQueryKey,
  listUsers, getListUsersQueryKey,
  listRequirements, getListRequirementsQueryKey,
  listTestCases, getListTestCasesQueryKey,
  useCreateTask, useUpdateTask, useDeleteTask,
  useReleaseTask, useAssignTask,
  type Task, type TaskInput
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, CheckSquare, AlertTriangle,
  UserCheck, LogOut, Users, Briefcase, X, ChevronDown, Check, CalendarDays
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
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
  const qaMembers = users.filter((u) => u.role === "qa_member" || u.role === "qa_lead");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4 text-primary" /> Team Workload
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {qaMembers.map((member) => {
            const memberTasks = tasks.filter((t) => t.assigneeId === member.id);
            const activeTasks = memberTasks.filter((t) => t.status !== "done");
            const doneTasks = memberTasks.filter((t) => t.status === "done");
            const overdueTasks = activeTasks.filter((t) => t.isOverdue);

            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {member.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{member.name.split(" ")[0]}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{member.role.replace("_", " ")}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-0.5">
                    <Briefcase className="w-2.5 h-2.5" /> {activeTasks.length} active
                  </Badge>
                  {overdueTasks.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                      {overdueTasks.length} overdue
                    </Badge>
                  )}
                  {doneTasks.length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-green-600 border-green-200">
                      {doneTasks.length} done
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] mt-auto"
                  onClick={() => onAssign(member.id)}
                >
                  <UserCheck className="w-3 h-3 mr-1" /> Assign Task
                </Button>
              </div>
            );
          })}
        </div>
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

  // Multi-select assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigneeComboOpen, setAssigneeComboOpen] = useState(false);
  const [projectComboOpen, setProjectComboOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<{
    testCaseIds: number[];
    assigneeId?: number;
    dueDate: string;
    projectId?: number;
  }>({ testCaseIds: [], dueDate: "" });
  const [tcSearch, setTcSearch] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });

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

  const { data: testCases = [] } = useQuery({
    queryKey: getListTestCasesQueryKey(),
    queryFn: () => listTestCases(),
    enabled: isAdminOrLead,
  });

  const createMutation = useCreateTask({
    mutation: {
      onSuccess: () => { invalidate(); setDialogOpen(false); setForm({}); toast({ title: "Task created" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to create task" }),
    },
  });

  // Separate mutation for bulk assignment — no dialog-closing side effects
  const bulkAssignMutation = useCreateTask({
    mutation: { onSuccess: () => {}, onError: () => {} },
  });

  const updateMutation = useUpdateTask({
    mutation: {
      onSuccess: () => { invalidate(); setDialogOpen(false); setEditingTask(null); toast({ title: "Task updated" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to update task" }),
    },
  });

  const deleteMutation = useDeleteTask({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Task deleted" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to delete task" }),
    },
  });

  const releaseMutation = useReleaseTask({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Task released — back in the pool" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to release task" }),
    },
  });

  const assignMutation = useAssignTask({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Task assigned" }); },
      onError: () => toast({ variant: "destructive", title: "Failed to assign task" }),
    },
  });

  const filtered = tasks.filter((t) => {
    if (!isAdminOrLead && t.assigneeId !== user?.id) return false;
    if (filterStatus === "overdue") {
      if (!t.isOverdue || t.status === "done") return false;
    } else if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && String(t.assigneeId) !== filterAssignee) return false;
    if (filterProject !== "all" && String(t.projectId) !== filterProject) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setEditingTask(null);
    setForm({ status: "new", type: "testing" });
    setDialogOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditingTask(t);
    setForm({
      name: t.name, type: t.type, status: t.status,
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

  const openAssignDialog = (userId?: number) => {
    setAssignForm({ testCaseIds: [], dueDate: "", assigneeId: userId });
    setTcSearch("");
    setAssignDialogOpen(true);
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

  const handleAssignTestCases = async () => {
    if (!assignForm.assigneeId) return;
    if (assignForm.testCaseIds.length === 0) return;

    setIsAssigning(true);
    try {
      const promises = assignForm.testCaseIds.map((tcId) => {
        const tc = testCases.find((t) => t.id === tcId);
        return bulkAssignMutation.mutateAsync({
          data: {
            name: `Test: ${tc?.title ?? `Test Case #${tcId}`}`,
            type: "testing",
            status: "in_progress",
            assigneeId: assignForm.assigneeId,
            testCaseId: tcId,
            projectId: tc?.projectId ?? assignForm.projectId,
            dueDate: assignForm.dueDate || undefined,
          } as TaskInput,
        });
      });
      await Promise.all(promises);
      invalidate();
      toast({ title: `${assignForm.testCaseIds.length} test case${assignForm.testCaseIds.length > 1 ? "s" : ""} assigned successfully` });
      setAssignDialogOpen(false);
      setAssignForm({ testCaseIds: [], dueDate: "" });
    } catch {
      toast({ variant: "destructive", title: "Some assignments failed" });
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleTestCaseSelection = (tcId: number) => {
    setAssignForm((prev) => ({
      ...prev,
      testCaseIds: prev.testCaseIds.includes(tcId)
        ? prev.testCaseIds.filter((id) => id !== tcId)
        : [...prev.testCaseIds, tcId],
    }));
  };

  const filteredTestCases = testCases.filter((tc) =>
    !tcSearch || tc.title.toLowerCase().includes(tcSearch.toLowerCase())
  );

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
          <p className="text-muted-foreground mt-1">Track and manage QA tasks</p>
        </div>
        <div className="flex gap-2">
          {isAdminOrLead && (
            <Button variant="outline" onClick={() => openAssignDialog()} className="gap-2">
              <UserCheck className="w-4 h-4" /> Assign Test Cases
            </Button>
          )}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Task
          </Button>
        </div>
      </div>

      {/* Workload panel — admin/lead only */}
      {isAdminOrLead && (
        <WorkloadPanel tasks={tasks} users={users} onAssign={openAssignDialog} />
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="overdue">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Overdue
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {isAdminOrLead && (
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {filterStatus === "overdue" && (
            <div className="flex items-center gap-2 mt-1 px-1">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive font-medium">
                Showing {filtered.length} overdue task{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                {filterStatus === "overdue" ? "No overdue tasks — great work!" : "No tasks found"}
              </p>
              {filterStatus !== "overdue" && (
                <Button variant="outline" className="mt-4" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add first task</Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} className={`hover:bg-muted/40 ${t.isOverdue && t.status !== "done" ? "bg-red-50/40" : ""}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium flex items-center gap-1.5">
                          {t.isOverdue && t.status !== "done" && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                          {t.name}
                        </p>
                        {t.projectName && <p className="text-xs text-muted-foreground">{t.projectName}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{t.type.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Select value={t.status} onValueChange={(v) => quickStatusChange(t, v)}>
                        <SelectTrigger className="h-7 text-xs border-0 p-0 focus:ring-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}>
                            {capitalize(t.status)}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
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
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                        t.isOverdue && t.status !== "done"
                          ? "bg-red-100 text-red-700"
                          : "text-muted-foreground"
                      }`}>
                        {t.dueDate ? format(new Date(t.dueDate), "MMM d") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {t.completionPercentage !== null && t.completionPercentage !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${t.completionPercentage}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{t.completionPercentage}%</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
                          {isAdminOrLead && t.assigneeId === null && (
                            <DropdownMenuItem onClick={() => openAssignDialog()}>
                              <UserCheck className="w-4 h-4 mr-2" />Assign to member
                            </DropdownMenuItem>
                          )}
                          {isAdminOrLead && t.assigneeId !== null && (
                            <DropdownMenuItem onClick={() => assignMutation.mutate({ id: t.id, data: { assigneeId: t.assigneeId! } })}>
                              <UserCheck className="w-4 h-4 mr-2" />Re-assign
                            </DropdownMenuItem>
                          )}
                          {canRelease(t) && t.assigneeId !== null && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-orange-600 focus:text-orange-600"
                                onClick={() => releaseMutation.mutate({ id: t.id })}
                              >
                                <LogOut className="w-4 h-4 mr-2" />Release task
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteMutation.mutate({ id: t.id })}>
                            <Trash2 className="w-4 h-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Task Name *</Label>
              <Input placeholder="Task name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type ?? "testing"} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
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
                <Select value={form.status ?? "new"} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
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
                <Label>Assignee</Label>
                <Select value={form.assigneeId ? String(form.assigneeId) : ""} onValueChange={(v) => setForm({ ...form, assigneeId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                  <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate ?? ""} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated Hours</Label>
                <Input type="number" min="0" step="0.5" value={form.estimatedHours ?? ""} onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Actual Hours</Label>
                <Input type="number" min="0" step="0.5" value={form.actualHours ?? ""} onChange={(e) => setForm({ ...form, actualHours: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Completion %</Label>
                <Input type="number" min="0" max="100" value={form.completionPercentage ?? ""} onChange={(e) => setForm({ ...form, completionPercentage: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Requirement</Label>
              <Select value={form.requirementId ? String(form.requirementId) : ""} onValueChange={(v) => setForm({ ...form, requirementId: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Link to requirement..." /></SelectTrigger>
                <SelectContent>{requirements.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes..." value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingTask ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-select Assign Test Cases Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(o) => { if (!o) { setAssignDialogOpen(false); setAssignForm({ testCaseIds: [], dueDate: "" }); setTcSearch(""); setAssigneeComboOpen(false); setProjectComboOpen(false); } }}>
        <DialogContent className="w-[min(92vw,64rem)] max-w-[64rem] max-h-[90vh] overflow-y-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="w-4 h-4 text-primary" /> Assign Test Cases
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* ── Assignee combobox (Popover+Command avoids Dialog focus-trap) ── */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Assign To <span className="text-destructive">*</span>
              </Label>
              <Popover open={assigneeComboOpen} onOpenChange={setAssigneeComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-9 px-3"
                  >
                    {assignForm.assigneeId
                      ? (() => {
                          const u = users.find((u) => u.id === assignForm.assigneeId);
                          return u ? (
                            <span className="flex items-center gap-2">
                              <Avatar className="w-5 h-5">
                                <AvatarFallback className="text-[10px]">{u.name.split(" ").map(n => n[0]).join("").slice(0,2)}</AvatarFallback>
                              </Avatar>
                              {u.name}
                              <span className="text-muted-foreground text-xs">({u.role.replace("_", " ")})</span>
                            </span>
                          ) : "Select member..."
                        })()
                      : <span className="text-muted-foreground">Select QA member...</span>
                    }
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search member..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>No member found.</CommandEmpty>
                      <CommandGroup>
                        {users
                          .filter((u) => u.role === "qa_member" || u.role === "qa_lead")
                          .map((u) => (
                            <CommandItem
                              key={u.id}
                              value={`${u.name} ${u.role}`}
                              onSelect={() => {
                                setAssignForm({ ...assignForm, assigneeId: u.id });
                                setAssigneeComboOpen(false);
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <Avatar className="w-6 h-6">
                                <AvatarFallback className="text-[10px]">{u.name.split(" ").map(n => n[0]).join("").slice(0,2)}</AvatarFallback>
                              </Avatar>
                              <span className="flex-1">{u.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">{u.role.replace("_", " ")}</span>
                              {assignForm.assigneeId === u.id && <Check className="w-4 h-4 text-primary" />}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* ── Test case multi-select list ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Test Cases <span className="text-destructive">*</span>
                </Label>
                {assignForm.testCaseIds.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-medium">
                    {assignForm.testCaseIds.length} selected
                  </Badge>
                )}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search test cases..."
                  value={tcSearch}
                  onChange={(e) => setTcSearch(e.target.value)}
                />
                {tcSearch && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setTcSearch("")}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* List */}
              <div className="border rounded-lg overflow-hidden bg-background">
                {/* Select all */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 bg-muted/50 border-b cursor-pointer hover:bg-muted/70 transition-colors select-none"
                  onClick={() => {
                    const allIds = filteredTestCases.map((t) => t.id);
                    const allSelected = allIds.every((id) => assignForm.testCaseIds.includes(id));
                    if (allSelected) {
                      setAssignForm((prev) => ({ ...prev, testCaseIds: prev.testCaseIds.filter((id) => !allIds.includes(id)) }));
                    } else {
                      setAssignForm((prev) => ({ ...prev, testCaseIds: [...new Set([...prev.testCaseIds, ...allIds])] }));
                    }
                  }}
                >
                  <Checkbox
                    checked={filteredTestCases.length > 0 && filteredTestCases.every((t) => assignForm.testCaseIds.includes(t.id))}
                    onCheckedChange={() => {}}
                    className="pointer-events-none"
                  />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Select all ({filteredTestCases.length})
                  </span>
                </div>

                {/* Scrollable rows */}
                <div className="max-h-56 overflow-y-auto divide-y">
                  {filteredTestCases.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No test cases found</p>
                  ) : filteredTestCases.map((tc) => {
                    const selected = assignForm.testCaseIds.includes(tc.id);
                    return (
                      <div
                        key={tc.id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors select-none ${selected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"}`}
                        onClick={() => toggleTestCaseSelection(tc.id)}
                      >
                        <Checkbox checked={selected} onCheckedChange={() => toggleTestCaseSelection(tc.id)} className="pointer-events-none shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug truncate">{tc.title}</p>
                          <p className="text-xs text-muted-foreground capitalize mt-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${
                              tc.priority === "critical" ? "bg-red-100 text-red-700" :
                              tc.priority === "high" ? "bg-orange-100 text-orange-700" :
                              tc.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{tc.priority}</span>
                            {tc.type.replace("_", " ")}
                            {tc.projectName ? ` · ${tc.projectName}` : ""}
                          </p>
                        </div>
                        {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected badges */}
              {assignForm.testCaseIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pt-1">
                  {assignForm.testCaseIds.map((id) => {
                    const tc = testCases.find((t) => t.id === id);
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 text-xs pl-2 pr-1 py-1">
                        <span className="truncate max-w-[140px]">{tc?.title ?? `TC #${id}`}</span>
                        <button
                          className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5 transition-colors"
                          onClick={() => toggleTestCaseSelection(id)}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Due date + project ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Due Date</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={assignForm.dueDate}
                    onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })}
                    className="h-9 pr-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Project Override</Label>
                <Popover open={projectComboOpen} onOpenChange={setProjectComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 px-3">
                      {assignForm.projectId
                        ? <span className="truncate">{projects.find(p => p.id === assignForm.projectId)?.name ?? "Select..."}</span>
                        : <span className="text-muted-foreground">From test case...</span>
                      }
                      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search project..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          {assignForm.projectId && (
                            <CommandItem
                              value="__clear__"
                              onSelect={() => { setAssignForm({ ...assignForm, projectId: undefined }); setProjectComboOpen(false); }}
                              className="text-muted-foreground italic cursor-pointer"
                            >
                              Clear override
                            </CommandItem>
                          )}
                          {projects.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.name}
                              onSelect={() => { setAssignForm({ ...assignForm, projectId: p.id }); setProjectComboOpen(false); }}
                              className="cursor-pointer"
                            >
                              {p.name}
                              {assignForm.projectId === p.id && <Check className="ml-auto w-4 h-4 text-primary" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAssignTestCases}
              disabled={assignForm.testCaseIds.length === 0 || !assignForm.assigneeId || isAssigning}
              className="min-w-[140px]"
            >
              {isAssigning
                ? <><span className="animate-spin mr-2">⟳</span>Assigning...</>
                : assignForm.testCaseIds.length > 0
                  ? `Assign ${assignForm.testCaseIds.length} Test Case${assignForm.testCaseIds.length !== 1 ? "s" : ""}`
                  : "Assign Test Cases"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
