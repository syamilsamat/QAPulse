import { useState, useMemo, useRef } from "react";
import {
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useGetRecentActivity, getGetRecentActivityQueryKey,
  useGetWeeklyTrend, getGetWeeklyTrendQueryKey,
  listUsers, getListUsersQueryKey,
  listCalendarEvents, getListCalendarEventsQueryKey,
  useCreateCalendarEvent, useUpdateCalendarEvent, useDeleteCalendarEvent,
  type User, type CalendarEvent,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Activity, AlertCircle, Clock, LayoutDashboard, TestTube, Search, X,
  ChevronDown, Users, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Pencil,
  AlertTriangle
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { 
  BarChart, 
  Bar, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { createPortal } from "react-dom";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths,
  isSameMonth, isToday, parseISO,
} from "date-fns";


const ROLE_LABELS: Record<string, string> = {
  qa_member: "QA Member",
  qa_lead: "QA Lead",
  admin: "Admin",
};

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  uat:      { bg: "bg-indigo-100",  text: "text-indigo-700",  border: "border-indigo-200",  dot: "bg-indigo-500" },
  meeting:  { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500" },
  deadline: { bg: "bg-red-100",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500" },
  release:  { bg: "bg-green-100",   text: "text-green-700",   border: "border-green-200",   dot: "bg-green-500" },
  other:    { bg: "bg-slate-100",   text: "text-slate-700",   border: "border-slate-200",   dot: "bg-slate-400" },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Format the date label safely
    let formattedLabel = label;
    try {
      const d = new Date(label);
      if (!isNaN(d.getTime())) {
        formattedLabel = `Week of ${format(d, "MMM d, yyyy")}`;
      }
    } catch {
      // Keep original label if parsing fails
    }

    return (
      <div className="bg-card border border-border rounded-lg shadow-xl p-3 min-w-[150px]">
        <p className="text-sm font-semibold mb-2 border-b pb-1">{formattedLabel}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm shrink-0 shadow-sm"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground capitalize">
                  {entry.name}
                </span>
              </div>
              <span className="font-medium text-foreground">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

function getEventColors(type: string) {
  return EVENT_TYPE_COLORS[type] ?? EVENT_TYPE_COLORS.other;
}

// ─── Member Picker ────────────────────────────────────────────────────────────

function MemberPicker({
  users, selected, onSelect,
}: {
  users: User[];
  selected: User | null;
  onSelect: (u: User | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => users.filter(
      (u) =>
        u.name.toLowerCase().includes(query.toLowerCase()) ||
        u.email.toLowerCase().includes(query.toLowerCase()) ||
        (u.team ?? "").toLowerCase().includes(query.toLowerCase())
    ),
    [users, query]
  );

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <Avatar className="w-5 h-5 shrink-0">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {selected.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{selected.name}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                View member dashboard
              </span>
            )}
            <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search members..." value={query}
                onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
            ) : (
              filtered.map((u) => (
                <button key={u.id}
                  className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 text-left transition-colors ${selected?.id === u.id ? "bg-muted" : ""}`}
                  onClick={() => { onSelect(selected?.id === u.id ? null : u); setOpen(false); setQuery(""); }}
                >
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {u.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[u.role] ?? u.role}{u.team ? ` · ${u.team}` : ""}
                    </p>
                  </div>
                  {selected?.id === u.id && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected && (
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => onSelect(null)} title="Clear">
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

// ─── Team Calendar ────────────────────────────────────────────────────────────

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function TeamCalendar({ users }: { users: User[] }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    eventType: "meeting",
    taggedUserIds: [] as number[],
    color: "",
  });

  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();

  const eventsKey = getListCalendarEventsQueryKey({ month, year });
  const { data: events = [], isLoading: isLoadingEvents } = useQuery({
    queryKey: eventsKey,
    queryFn: () => listCalendarEvents({ month, year }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: eventsKey });

  const createMutation = useCreateCalendarEvent({
    mutation: {
      onSuccess: () => { invalidate(); setCreateOpen(false); },
    },
  });

  const updateMutation = useUpdateCalendarEvent({
    mutation: {
      onSuccess: () => { invalidate(); setViewOpen(false); setSelectedEvent(null); },
    },
  });

  const deleteMutation = useDeleteCalendarEvent({
    mutation: {
      onSuccess: () => { invalidate(); setViewOpen(false); setSelectedEvent(null); },
    },
  });

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Start grid on Monday (getDay: 0=Sun..6=Sat → convert to Mon-first)
  const firstDayOffset = useMemo(() => {
    const d = getDay(startOfMonth(currentMonth));
    return d === 0 ? 6 : d - 1;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const openCreate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEventForm({ title: "", description: "", date: dateStr, eventType: "meeting", taggedUserIds: [], color: "" });
    setCreateOpen(true);
  };

  const openView = (e: CalendarEvent) => {
    setSelectedEvent(e);
    setEditMode(false);
    setViewOpen(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setSelectedEvent(e);
    setEventForm({
      title: e.title,
      description: e.description ?? "",
      date: e.date,
      eventType: e.eventType,
      taggedUserIds: e.taggedUserIds ?? [],
      color: e.color ?? "",
    });
    setEditMode(true);
    setViewOpen(true);
  };

  const handleCreate = () => {
    if (!eventForm.title || !eventForm.date) return;
    createMutation.mutate({
      data: {
        ...eventForm,
        createdBy: user?.id,
      },
    });
  };

  const handleUpdate = () => {
    if (!selectedEvent || !eventForm.title) return;
    updateMutation.mutate({
      id: selectedEvent.id,
      data: eventForm,
    });
  };

  const toggleTaggedUser = (uid: number) => {
    setEventForm((prev) => ({
      ...prev,
      taggedUserIds: prev.taggedUserIds.includes(uid)
        ? prev.taggedUserIds.filter((id) => id !== uid)
        : [...prev.taggedUserIds, uid],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" /> Team Calendar
            </CardTitle>
            <CardDescription className="mt-0.5">Shared UAT dates, meetings, and deadlines</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold w-28 text-center">{format(currentMonth, "MMMM yyyy")}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-1">
          {Object.entries(EVENT_TYPE_COLORS).map(([type, c]) => (
            <span key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isLoadingEvents ? (
          <Skeleton className="h-[400px] w-full" />
        ) : (
          <>
            {/* Grid header */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Grid cells */}
            <div className="grid grid-cols-7 border-l border-t">
              {/* Empty cells for offset */}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="border-b border-r min-h-[90px] bg-muted/20" />
              ))}

              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDate[dateStr] ?? [];
                const today = isToday(day);
                const inMonth = isSameMonth(day, currentMonth);

                return (
                  <div
                    key={dateStr}
                    className={`border-b border-r min-h-[90px] p-1 cursor-pointer hover:bg-muted/30 transition-colors group relative ${
                      !inMonth ? "bg-muted/10 opacity-60" : ""
                    }`}
                    onClick={() => openCreate(dateStr)}
                  >
                    <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      today ? "bg-primary text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => {
                        const c = getEventColors(e.eventType);
                        return (
                          <div
                            key={e.id}
                            className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium ${c.bg} ${c.text} cursor-pointer hover:opacity-80`}
                            title={e.title}
                            onClick={(ev) => { ev.stopPropagation(); openView(e); }}
                          >
                            {e.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                    {/* + hover indicator */}
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      {/* Create Event Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" /> Add Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="Event title" value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input type="date" value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={eventForm.eventType} onValueChange={(v) => setEventForm({ ...eventForm, eventType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Optional details..." rows={2} value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tag Team Members</Label>
              <div className="flex flex-wrap gap-2">
                {users.map((u) => {
                  const tagged = eventForm.taggedUserIds.includes(u.id);
                  return (
                    <button key={u.id} type="button"
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-colors ${
                        tagged ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                      onClick={() => toggleTaggedUser(u.id)}
                    >
                      <Avatar className="w-4 h-4">
                        <AvatarFallback className="text-[8px]">{u.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {u.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!eventForm.title || !eventForm.date || createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Edit Event Dialog */}
      <Dialog open={viewOpen} onOpenChange={(o) => { if (!o) { setViewOpen(false); setSelectedEvent(null); setEditMode(false); } }}>
        <DialogContent className="max-w-md">
          {selectedEvent && !editMode ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${getEventColors(selectedEvent.eventType).dot}`} />
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getEventColors(selectedEvent.eventType).bg} ${getEventColors(selectedEvent.eventType).text}`}>
                    {selectedEvent.eventType.toUpperCase()}
                  </span>
                  <span>{format(parseISO(selectedEvent.date), "MMMM d, yyyy")}</span>
                </div>
                {selectedEvent.description && (
                  <p className="text-sm text-foreground bg-muted/40 rounded-md p-3">{selectedEvent.description}</p>
                )}
                {selectedEvent.taggedUserNames && selectedEvent.taggedUserNames.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Tagged Members</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedEvent.taggedUserNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full text-xs">
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-[8px]">{name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedEvent.createdByName && (
                  <p className="text-xs text-muted-foreground">Added by {selectedEvent.createdByName}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate({ id: selectedEvent.id })}
                  disabled={deleteMutation.isPending}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />{deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(selectedEvent)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                </Button>
                <Button size="sm" onClick={() => setViewOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : selectedEvent && editMode ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Title *</Label>
                  <Input value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Date *</Label>
                    <Input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={eventForm.eventType} onValueChange={(v) => setEventForm({ ...eventForm, eventType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uat">UAT</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="deadline">Deadline</SelectItem>
                        <SelectItem value="release">Release</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea rows={2} value={eventForm.description}
                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tag Team Members</Label>
                  <div className="flex flex-wrap gap-2">
                    {users.map((u) => {
                      const tagged = eventForm.taggedUserIds.includes(u.id);
                      return (
                        <button key={u.id} type="button"
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs transition-colors ${
                            tagged ? "bg-primary/10 border-primary/30 text-primary" : "bg-card border-border text-muted-foreground hover:border-muted-foreground"
                          }`}
                          onClick={() => toggleTaggedUser(u.id)}
                        >
                          <Avatar className="w-4 h-4">
                            <AvatarFallback className="text-[8px]">{u.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {u.name.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={!eventForm.title || updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

type HoverItem = { id: number; name: string; status: string; dueDate?: string | null; isOverdue?: boolean };

function MetricCard({
  title, value, icon, description, alert, hoverItems,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  description?: string;
  alert?: boolean;
  hoverItems?: HoverItem[];
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const closeTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openPopover = () => {
    clearCloseTimer();
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 6, left: rect.left });
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
    }, 120);
  };

  return (
    <div
      ref={cardRef}
      className="relative pb-1"
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
    >
      <Card className={`cursor-default ${alert && value > 0 ? "border-destructive/40" : ""}`}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${alert && value > 0 ? "text-destructive" : ""}`}>{value}</div>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          <p className="text-xs text-muted-foreground/60 mt-1 min-h-4">
            {hoverItems && hoverItems.length > 0 ? "Hover to see details" : "\u00a0"}
          </p>
        </CardContent>
      </Card>

      {/* Hover popover */}
      {hoverItems && hoverItems.length > 0 && open && createPortal(
        <div
          className="fixed z-[9999] w-80 bg-card border rounded-lg shadow-xl p-0 overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-destructive/5 border-b">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-xs font-semibold text-destructive">
              {hoverItems.length} blocked / overdue task{hoverItems.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y">
            {hoverItems.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                  item.status === "blocked" ? "bg-red-500" : "bg-orange-500"
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate leading-snug">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      item.status === "blocked"
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {item.status === "blocked" ? "Blocked" : "Overdue"}
                    </span>
                    {item.dueDate && (
                      <span className="text-[10px] text-muted-foreground">
                        Due {format(new Date(item.dueDate), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const canViewMembers = user?.role === "qa_lead" || user?.role === "admin";
  const [selectedMember, setSelectedMember] = useState<User | null>(null);

  const viewingUserId = selectedMember?.id;

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  const summaryParams = viewingUserId ? { userId: viewingUserId } : {};
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary(summaryParams, {
    query: { queryKey: getGetDashboardSummaryQueryKey(summaryParams) },
  });

  const activityParams = viewingUserId ? { userId: viewingUserId, limit: 5 } : { limit: 5 };
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity(activityParams, {
    query: { queryKey: getGetRecentActivityQueryKey(activityParams) },
  });

  const trendUserId = viewingUserId ?? (user?.role === "qa_member" ? user?.id : undefined);
  const trendParams = trendUserId ? { weeks: 8, userId: trendUserId } : { weeks: 8 };
  const { data: weeklyTrend, isLoading: isLoadingTrend } = useGetWeeklyTrend(trendParams, {
    query: { queryKey: getGetWeeklyTrendQueryKey(trendParams) },
  });

  if (isLoadingSummary) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between"><Skeleton className="h-9 w-48" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const headerName = selectedMember
    ? selectedMember.name.split(" ")[0]
    : user?.name?.split(" ")[0] || "User";

  const headerSub = selectedMember
    ? `Viewing ${selectedMember.name}'s personal dashboard`
    : "Here's what's happening with your projects today.";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {selectedMember ? (
              <span className="flex items-center gap-3">
                <Avatar className="w-9 h-9 border">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {selectedMember.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {selectedMember.name}
              </span>
            ) : (
              `Welcome, ${headerName}`
            )}
          </h1>
          <p className="text-muted-foreground mt-1">{headerSub}</p>
        </div>

        {canViewMembers && (
          <MemberPicker
            users={users.filter((u) => u.id !== user?.id)}
            selected={selectedMember}
            onSelect={setSelectedMember}
          />
        )}
      </div>

      {/* Member context banner */}
      {selectedMember && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>
            Showing stats for <strong>{selectedMember.name}</strong>
            {selectedMember.team ? ` · ${selectedMember.team}` : ""}
            {" "}— <span className="text-muted-foreground">{ROLE_LABELS[selectedMember.role]}</span>
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedMember(null)}>
            <X className="w-3 h-3 mr-1" /> Back to global
          </Button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        <MetricCard title="Total Tasks" value={summary?.totalTasks || 0}
          icon={<LayoutDashboard className="w-4 h-4 text-primary" />}
          description={`${summary?.completedTasks || 0} completed`} />
        <MetricCard title="Pending Tasks" value={summary?.pendingTasks || 0}
          icon={<Clock className="w-4 h-4 text-blue-500" />} description="Awaiting action" />
        <MetricCard title="Blocked / Overdue" value={(summary?.blockedTasks || 0) + (summary?.overdueTasks || 0)}
          icon={<AlertCircle className="w-4 h-4 text-destructive" />}
          description={`${summary?.blockedTasks || 0} blocked · ${summary?.overdueTasks || 0} overdue`}
          alert={((summary?.blockedTasks || 0) + (summary?.overdueTasks || 0)) > 0}
          hoverItems={(summary as any)?.blockedOrOverdueTasks ?? []} />
        <MetricCard title="Test Cases" value={summary?.totalTestCases || 0}
          icon={<TestTube className="w-4 h-4 text-emerald-500" />}
          description={`${summary?.aiAssistedTestCases || 0} AI-assisted`} />
      </div>

      {/* Charts + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 flex flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>Weekly Task Progression</CardTitle>
            <CardDescription>
              {selectedMember
                ? `Task status breakdown for ${selectedMember.name}`
                : "Overall team task status breakdown"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            {isLoadingTrend ? (
              <Skeleton className="h-[350px] w-full" />
            ) : weeklyTrend && weeklyTrend.length > 0 ? (
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={weeklyTrend} 
                    // 1. Increased bottom and left margins to make room for the axis labels
                    margin={{ top: 10, right: 10, bottom: 20, left: 0 }} 
                  >
                    {/* 2. Changed vertical={false} to vertical={true} for a full grid */}
                    <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="var(--border)" />

                    <XAxis
                      dataKey="week"
                      tickFormatter={(v) => {
                        try {
                          const d = new Date(v);
                          return isNaN(d.getTime()) ? v : format(d, "MMM d");
                        } catch { return v; }
                      }}
                      stroke="var(--muted-foreground)"
                      fontSize={12}
                      tickMargin={10}
                      // 3. Added label for the X-axis
                      label={{ 
                        value: "Weeks", 
                        position: "insideBottom", 
                        offset: -15, 
                        fill: "var(--muted-foreground)", 
                        fontSize: 12,
                        fontWeight: 500
                      }}
                    />

                    <YAxis 
                      stroke="var(--muted-foreground)" 
                      fontSize={12} 
                      allowDecimals={false} 
                      tickFormatter={(val) => (val === 0 ? "" : val)} 
                      // 4. Added label for the Y-axis (rotated)
                      label={{ 
                        value: "Number of Tasks", 
                        angle: -90, 
                        position: "insideLeft", 
                        offset: 15, 
                        fill: "var(--muted-foreground)", 
                        fontSize: 12,
                        fontWeight: 500,
                        style: { textAnchor: 'middle' }
                      }}
                    />

                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.2 }} />

                    <Legend 
                      iconType="circle"
                      wrapperStyle={{ 
                        fontSize: '12px', 
                        paddingTop: '25px', // Increased slightly to clear the X-axis label
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: '8px'
                      }} 
                    />

                    {/* Swapped to a bright, vibrant Cyan (Tailwind cyan-400) */}
                    <Bar dataKey="new" stackId="a" fill="#22d3ee" name="New" /> 

                    {/* Swapped to a vivid, punchy Yellow (Tailwind yellow-400) */}
                    <Bar dataKey="pending" stackId="a" fill="#facc15" name="Pending" />
                    <Bar dataKey="in_progress" stackId="a" fill="#27A3F5" name="In Progress" /> 
                    <Bar dataKey="blocked" stackId="a" fill="#E00404" name="Blocked" /> 
                    <Bar dataKey="sit" stackId="a" fill="#93c5fd" name="SIT" /> 
                    <Bar dataKey="uat" stackId="a" fill="#A038F2" name="UAT" /> 
                    <Bar dataKey="done" stackId="a" fill="#86efac" name="Done" /> 
                    <Bar dataKey="released_to_production" stackId="a" fill="#22c55e" name="Released" /> 
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                No trend data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              {selectedMember ? `${selectedMember.name}'s activity` : "Latest updates across projects"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-2 flex-1"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-1/2" /></div>
                  </div>
                ))}
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        {!selectedMember && activity.userName && (
                          <span className="font-medium">{activity.userName} </span>
                        )}
                        <span className="text-muted-foreground">{activity.description}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {selectedMember ? `No activity for ${selectedMember.name}` : "No recent activity"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Calendar */}
      <TeamCalendar users={users} />
    </div>
  );
}
