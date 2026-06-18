import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSocialEvents, getListSocialEventsQueryKey,
  listUsers, getListUsersQueryKey,
  useCreateSocialEvent, useUpdateSocialEvent, useDeleteSocialEvent,
  type SocialEvent,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Coffee, Utensils, Cake, MapPin, Sparkles, Plus, MoreHorizontal, Pencil, Trash2, Users, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  lunch:    { label: "Team Lunch",    icon: Coffee,    color: "text-orange-600", bg: "bg-orange-100" },
  dinner:   { label: "Team Dinner",  icon: Utensils,  color: "text-indigo-600", bg: "bg-indigo-100" },
  birthday: { label: "Birthday",     icon: Cake,      color: "text-pink-600",   bg: "bg-pink-100" },
  outing:   { label: "Team Outing",  icon: MapPin,    color: "text-green-600",  bg: "bg-green-100" },
  other:    { label: "Team Event",   icon: Sparkles,  color: "text-purple-600", bg: "bg-purple-100" },
};

export default function TeamHangouts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SocialEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialEvent | null>(null);
  const [form, setForm] = useState<{
    title: string; description: string; eventDate: string;
    eventType: string; taggedUserIds: number[];
  }>({ title: "", description: "", eventDate: "", eventType: "lunch", taggedUserIds: [] });

  const { data: events = [], isLoading } = useQuery({
    queryKey: getListSocialEventsQueryKey(),
    queryFn: () => listSocialEvents(),
  });

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  const createMutation = useCreateSocialEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSocialEventsQueryKey() });
        closeDialog();
        toast({ title: "Team hangout created! Calendar and inbox updated." });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to create event" }),
    },
  });

  const updateMutation = useUpdateSocialEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSocialEventsQueryKey() });
        closeDialog();
        toast({ title: "Event updated" });
      },
    },
  });

  const deleteMutation = useDeleteSocialEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSocialEventsQueryKey() });
        setDeleteTarget(null);
        toast({ title: "Event deleted" });
      },
    },
  });

  const openCreate = () => {
    setEditingEvent(null);
    setForm({ title: "", description: "", eventDate: "", eventType: "lunch", taggedUserIds: [] });
    setDialogOpen(true);
  };

  const openEdit = (ev: SocialEvent) => {
    setEditingEvent(ev);
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      eventDate: ev.eventDate,
      eventType: ev.eventType,
      taggedUserIds: ev.taggedUserIds ?? [],
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
  };

  const toggleUser = (id: number) => {
    setForm((f) => ({
      ...f,
      taggedUserIds: f.taggedUserIds.includes(id)
        ? f.taggedUserIds.filter((x) => x !== id)
        : [...f.taggedUserIds, id],
    }));
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.eventDate || !form.eventType) {
      toast({ variant: "destructive", title: "Title, date, and event type are required" });
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      eventDate: form.eventDate,
      eventType: form.eventType,
      taggedUserIds: form.taggedUserIds,
      createdBy: user?.id,
    };
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createMutation.mutate({ data: payload as any });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const sortedEvents = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const upcoming = sortedEvents.filter((e) => e.eventDate >= new Date().toISOString().slice(0, 10));
  const past = sortedEvents.filter((e) => e.eventDate < new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Coffee className="w-7 h-7 text-primary" />
            Team Hangouts
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan lunches, dinners, outings and celebrations with your team
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Plan an Event
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Coffee className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No hangouts planned yet</p>
          <p className="text-sm text-muted-foreground mt-1">Plan your first team event — it will show up on the calendar too!</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" /> Upcoming
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((ev) => (
                  <EventCard key={ev.id} event={ev} currentUserId={user?.id} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground flex items-center gap-2">
                <CalendarDays className="w-5 h-5" /> Past Events
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-70">
                {past.map((ev) => (
                  <EventCard key={ev.id} event={ev} currentUserId={user?.id} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Plan a Team Hangout"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Event Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Friday team lunch at Italian place"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Event Type <span className="text-destructive">*</span></Label>
                <SearchableSelect
                  value={form.eventType}
                  onValueChange={(v) => setForm((f) => ({ ...f, eventType: v }))}
                  options={Object.entries(EVENT_TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                  searchPlaceholder="Search..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Where, what time, any special details..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tag Team Members</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 cursor-pointer px-1 py-1 rounded hover:bg-muted/50">
                    <Checkbox
                      checked={form.taggedUserIds.includes(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
                    />
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {u.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{u.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{u.team ?? ""}</span>
                  </label>
                ))}
              </div>
              {form.taggedUserIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {form.taggedUserIds.length} member{form.taggedUserIds.length > 1 ? "s" : ""} tagged — they'll get an inbox notification
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving..." : editingEvent ? "Update Event" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EventCard({
  event, currentUserId, onEdit, onDelete,
}: {
  event: SocialEvent;
  currentUserId?: number;
  onEdit: (e: SocialEvent) => void;
  onDelete: (e: SocialEvent) => void;
}) {
  const cfg = EVENT_TYPE_CONFIG[event.eventType] ?? EVENT_TYPE_CONFIG.other;
  const Icon = cfg.icon;
  const isCreator = event.createdBy === currentUserId;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={`p-2 rounded-lg ${cfg.bg}`}>
            <Icon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          {isCreator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(event)}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(event)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="mt-2">
          <Badge variant="secondary" className={`text-xs ${cfg.color} mb-1`}>{cfg.label}</Badge>
          <CardTitle className="text-base leading-tight">{event.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-4 h-4 shrink-0" />
          {format(new Date(event.eventDate + "T00:00:00"), "EEEE, MMMM d, yyyy")}
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        )}
        {event.taggedUserIds && event.taggedUserIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex flex-wrap gap-1">
              {(event.taggedUserNames ?? []).slice(0, 3).map((name, i) => (
                <Badge key={i} variant="outline" className="text-xs py-0">{name}</Badge>
              ))}
              {(event.taggedUserIds.length) > 3 && (
                <Badge variant="outline" className="text-xs py-0">+{event.taggedUserIds.length - 3}</Badge>
              )}
            </div>
          </div>
        )}
        {event.createdByName && (
          <p className="text-xs text-muted-foreground">Planned by {event.createdByName}</p>
        )}
      </CardContent>
    </Card>
  );
}
