import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications, getListNotificationsQueryKey,
  markNotificationRead, markAllNotificationsRead,
  type NotificationItem,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bell, BellOff, CheckCheck, AlertTriangle, Clock, Users, Info,
  CheckCircle2, XCircle, RefreshCcw, Bug, MessageSquare, Calendar,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { resolveNotifRoute } from "@/components/NotificationDropdown";

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  task:                  { icon: CheckCheck,    color: "text-blue-600",   bg: "bg-blue-50",   label: "Task" },
  overdue:               { icon: AlertTriangle, color: "text-red-600",    bg: "bg-red-50",    label: "Overdue" },
  social:                { icon: Users,         color: "text-purple-600", bg: "bg-purple-50", label: "Social" },
  warning:               { icon: Clock,         color: "text-orange-600", bg: "bg-orange-50", label: "Warning" },
  info:                  { icon: Info,          color: "text-slate-600",  bg: "bg-slate-50",  label: "Info" },
  review_request:        { icon: Clock,         color: "text-amber-600",  bg: "bg-amber-50",  label: "Review" },
  review_approved:       { icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50",  label: "Approved" },
  review_rejected:       { icon: XCircle,       color: "text-red-600",    bg: "bg-red-50",    label: "Rejected" },
  revision_required:     { icon: RefreshCcw,    color: "text-orange-600", bg: "bg-orange-50", label: "Revision" },
  defect_opened:         { icon: Bug,           color: "text-red-600",    bg: "bg-red-50",    label: "Defect" },
  defect_status_changed: { icon: Bug,           color: "text-amber-600",  bg: "bg-amber-50",  label: "Defect" },
  retest_needed:         { icon: RefreshCcw,    color: "text-orange-600", bg: "bg-orange-50", label: "Retest" },
  uat_milestone_ready:   { icon: Calendar,      color: "text-green-600",  bg: "bg-green-50",  label: "UAT" },
  milestone_created:     { icon: Calendar,      color: "text-indigo-600", bg: "bg-indigo-50", label: "Milestone" },
  returned_to_dev:       { icon: RefreshCcw,    color: "text-red-600",    bg: "bg-red-50",    label: "Returned" },
  defect_reopened:       { icon: Bug,           color: "text-red-600",    bg: "bg-red-50",    label: "Reopened" },
  comment_posted:        { icon: MessageSquare, color: "text-blue-600",   bg: "bg-blue-50",   label: "Comment" },
};

// Entity-type filter chips
const ENTITY_FILTERS: { label: string; entityTypes: string[] | null }[] = [
  { label: "All",          entityTypes: null },
  { label: "Requirements", entityTypes: ["requirement"] },
  { label: "Defects",      entityTypes: ["defect"] },
  { label: "Tasks",        entityTypes: ["task"] },
  { label: "Milestones",   entityTypes: ["milestone"] },
];

function NotifIcon({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <div className={`p-2 rounded-full ${cfg.bg} shrink-0`}>
      <Icon className={`w-4 h-4 ${cfg.color}`} />
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color} shrink-0`}>
      {cfg.label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Inbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string[] | null>(null);

  const params = { userId: user?.id ?? 0, unreadOnly };

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: getListNotificationsQueryKey(params),
    queryFn: () => listNotifications(params),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey(params) });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ userId: user?.id ?? 0, unreadOnly: !unreadOnly }) });
    qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: invalidateAll,
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead({ userId: user?.id ?? 0 }),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "All notifications marked as read" });
    },
  });

  const handleNavigate = (notif: NotificationItem) => {
    const route = resolveNotifRoute(notif.entityType ?? null, notif.entityId ?? null);
    if (!notif.read) markReadMutation.mutate(notif.id);
    if (route) setLocation(route);
  };

  // Apply filters
  const filtered = notifications.filter(n => {
    if (unreadOnly && n.read) return false;
    if (entityFilter !== null && !entityFilter.includes(n.entityType ?? "")) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-7 h-7 text-primary" />
            Inbox
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground">Your notifications and alerts</span>
            {unreadCount > 0 && <Badge variant="destructive">{unreadCount} unread</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="unread" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            <Label htmlFor="unread" className="text-sm cursor-pointer">Unread only</Label>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Entity-type filter chips */}
      <div className="flex flex-wrap gap-2">
        {ENTITY_FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => setEntityFilter(f.entityTypes)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              JSON.stringify(entityFilter) === JSON.stringify(f.entityTypes)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BellOff className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            {unreadOnly ? "No unread notifications" : "All caught up"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadOnly
              ? "Switch off the filter to see all notifications"
              : entityFilter !== null
              ? "No notifications in this category"
              : "Notifications about tasks, reviews, defects, and team events appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif, i) => (
            <NotificationRow
              key={`${notif.id}-${i}`}
              notification={notif}
              onMarkRead={id => { if (id > 0 && !notif.read) markReadMutation.mutate(id); }}
              onNavigate={() => handleNavigate(notif)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  onMarkRead,
  onNavigate,
}: {
  notification: NotificationItem;
  onMarkRead: (id: number) => void;
  onNavigate: () => void;
}) {
  const route = resolveNotifRoute(notification.entityType ?? null, notification.entityId ?? null);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors group ${
        notification.read ? "bg-card" : "bg-primary/5 border-primary/20"
      }`}
      onClick={() => onMarkRead(notification.id)}
    >
      <NotifIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium text-sm truncate">{notification.title}</p>
            <TypeBadge type={notification.type} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!notification.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{notification.message}</p>
      </div>
      {/* Explicit navigate button — separate from mark-read click target */}
      {route && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 p-1 rounded hover:bg-muted"
          title="Go to"
          onClick={e => { e.stopPropagation(); onNavigate(); }}
        >
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
