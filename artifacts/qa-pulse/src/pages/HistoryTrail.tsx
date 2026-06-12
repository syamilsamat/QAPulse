import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Search, CalendarRange, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { Task } from "@workspace/api-client-react";

interface TaskEvent {
  id: number;
  taskId: number;
  title: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  severity: string;
  createdBy: number | null;
  createdAt: string;
}

export default function HistoryTrail() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdminOrLead = user?.role === "admin" || user?.role === "qa_lead";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskEvents, setTaskEvents] = useState<TaskEvent[]>([]);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tasksRes, eventsRes] = await Promise.all([
          fetch("/api/tasks"),
          fetch("/api/tasks/events/all"),
        ]);
        const tasksData = tasksRes.ok ? await tasksRes.json() : [];
        const eventsData = eventsRes.ok ? await eventsRes.json() : [];

        // Role-based filtering
        const visibleTasks = isAdminOrLead
          ? tasksData
          : tasksData.filter((t: Task) => t.assigneeId === user?.id);

        setTasks(visibleTasks);
        setEvents(eventsData);
      } catch {
        toast({ variant: "destructive", title: "Failed to load data" });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [user?.id, user?.role, isAdminOrLead, toast]);

  const filtered = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssignee !== "all" && String(t.assigneeId) !== filterAssignee) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches =
        t.name.toLowerCase().includes(q) ||
        (t.redmineId && t.redmineId.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q));
      if (!matches) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedTasks = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const getTaskEvents = (taskId: number) =>
    events.filter((e) => e.taskId === taskId);

  const openEvents = async (task: Task) => {
    setSelectedTask(task);
    setEventDialogOpen(true);
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/events`);
      if (res.ok) setTaskEvents(await res.json());
    } catch {
      setTaskEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const uniqueAssignees = Array.from(
    new Map(tasks.filter((t) => t.assigneeId).map((t) => [t.assigneeId, t.assigneeName])).entries(),
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-7 h-7 text-primary" /> History Trail
          </h1>
          <p className="text-muted-foreground mt-1">
            Track task events and activity history
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by task name, redmine ID, or team member..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="uat">UAT</SelectItem>
                <SelectItem value="sit">SIT</SelectItem>
                <SelectItem value="released_to_production">Released to Production</SelectItem>
              </SelectContent>
            </Select>
            {isAdminOrLead && (
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Members</SelectItem>
                  {uniqueAssignees.map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">No tasks found</p>
            </div>
          ) : (
            <div className="flex flex-col w-full">
              <div className="overflow-x-auto w-full pb-2">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Task</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Assignee</TableHead>
                      <TableHead className="whitespace-nowrap">Redmine ID</TableHead>
                      <TableHead className="whitespace-nowrap">Events</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTasks.map((t) => {
                      const evCount = getTaskEvents(t.id).length;
                      const hasHighSeverity = getTaskEvents(t.id).some(
                        (e) => e.severity === "high",
                      );
                      return (
                        <TableRow
                          key={t.id}
                          className="hover:bg-muted/40 cursor-pointer"
                          onClick={() => openEvents(t)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{t.name}</p>
                              {t.projectName && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {t.projectName}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.status === "uat"
                                  ? "bg-purple-100 text-purple-700"
                                  : t.status === "sit"
                                    ? "bg-blue-100 text-blue-700"
                                    : t.status === "released_to_production"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {t.status
                                ? t.status.charAt(0).toUpperCase() +
                                  t.status.slice(1).replace(/_/g, " ")
                                : ""}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.assigneeName ? (
                              <span className="text-sm">{t.assigneeName}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">
                                Unassigned
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.redmineId ? (
                              <span className="text-sm font-medium text-primary">
                                #{t.redmineId}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={evCount > 0 ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {evCount}
                              </Badge>
                              {hasHighSeverity && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-8 text-xs">
                              <CalendarRange className="w-3.5 h-3.5 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-muted/10 border-t">
                <div className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of{" "}
                  {filtered.length} tasks
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
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

      <Dialog open={eventDialogOpen} onOpenChange={(o) => !o && setEventDialogOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-primary" />
              Events for {selectedTask?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {eventsLoading ? (
              <div className="text-sm text-muted-foreground py-2">Loading events...</div>
            ) : taskEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">No events recorded</div>
            ) : (
              taskEvents.map((ev) => (
                <div key={ev.id} className="border rounded-md p-3 text-sm">
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
                    <p className="text-muted-foreground text-xs mt-1">{ev.description}</p>
                  )}
                  {(ev.startDate || ev.endDate) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      {ev.startDate && format(new Date(ev.startDate), "MMM d")}
                      {ev.startDate && ev.endDate && " - "}
                      {ev.endDate && format(new Date(ev.endDate), "MMM d")}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Added {format(new Date(ev.createdAt), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
