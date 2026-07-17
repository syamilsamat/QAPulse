import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications, getListNotificationsQueryKey,
  markNotificationRead, markAllNotificationsRead,
  type NotificationItem,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Bell, CheckCheck, AlertTriangle, Clock, Users, Info, ArrowRight,
  CheckCircle2, XCircle, RefreshCcw, Bug, MessageSquare, Calendar,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Type config — expanded for CR027 taxonomy ─────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  task:                 { icon: CheckCheck,    color: "text-blue-600",   bg: "bg-blue-50" },
  overdue:              { icon: AlertTriangle,  color: "text-red-600",    bg: "bg-red-50" },
  social:               { icon: Users,          color: "text-purple-600", bg: "bg-purple-50" },
  warning:              { icon: Clock,          color: "text-orange-600", bg: "bg-orange-50" },
  info:                 { icon: Info,           color: "text-slate-600",  bg: "bg-slate-50" },
  review_request:       { icon: Clock,          color: "text-amber-600",  bg: "bg-amber-50" },
  review_approved:      { icon: CheckCircle2,   color: "text-green-600",  bg: "bg-green-50" },
  review_rejected:      { icon: XCircle,        color: "text-red-600",    bg: "bg-red-50" },
  revision_required:    { icon: RefreshCcw,     color: "text-orange-600", bg: "bg-orange-50" },
  defect_opened:        { icon: Bug,            color: "text-red-600",    bg: "bg-red-50" },
  defect_status_changed:{ icon: Bug,            color: "text-amber-600",  bg: "bg-amber-50" },
  retest_needed:        { icon: RefreshCcw,     color: "text-orange-600", bg: "bg-orange-50" },
  uat_milestone_ready:  { icon: Calendar,       color: "text-green-600",  bg: "bg-green-50" },
  milestone_created:    { icon: Calendar,       color: "text-indigo-600", bg: "bg-indigo-50" },
  returned_to_dev:      { icon: RefreshCcw,     color: "text-red-600",    bg: "bg-red-50" },
  comment_posted:       { icon: MessageSquare,  color: "text-blue-600",   bg: "bg-blue-50" },
};

// ── Deep-link router — entityType → URL ──────────────────────────────────────

export function resolveNotifRoute(entityType: string | null, entityId: number | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "requirement":    return `/requirements/${entityId}`;
    case "execution_file": return `/test-execution/${entityId}`;
    case "defect":         return `/defects?highlight=${entityId}`;
    case "task":           return `/tasks?highlight=${entityId}`;
    case "milestone":      return `/milestones?highlight=${entityId}`;
    case "test_case":      return `/test-cases?tc=${entityId}`;
    case "audit_log":      return `/audit-log?entityId=${entityId}`;
    default:               return null;
  }
}

// ── Mini icon ─────────────────────────────────────────────────────────────────

function NotifIcon({ type, size = "sm" }: { type: string; size?: "sm" | "xs" }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  const Icon = cfg.icon;
  const pad = size === "xs" ? "p-1" : "p-1.5";
  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <div className={`${pad} rounded-full ${cfg.bg} shrink-0`}>
      <Icon className={`${iconSize} ${cfg.color}`} />
    </div>
  );
}

// ── Dropdown row ──────────────────────────────────────────────────────────────

function DropdownRow({
  notification,
  onNavigate,
}: {
  notification: NotificationItem;
  onNavigate: (route: string) => void;
}) {
  const route = resolveNotifRoute(notification.entityType ?? null, notification.entityId ?? null);

  return (
    <div className={cn(
      "flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-colors group",
      notification.read ? "hover:bg-muted/60" : "bg-primary/5 hover:bg-primary/10",
    )}>
      <NotifIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight truncate">{notification.title}</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>
      {route && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          onClick={() => onNavigate(route)}
          title="Go to"
        >
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );
}

// ── Main dropdown ─────────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  /** Whether the sidebar is collapsed (icon-only mode) */
  collapsed?: boolean;
  unreadCount: number;
}

export function NotificationDropdown({ collapsed = false, unreadCount }: NotificationDropdownProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const params = { userId: user?.id ?? 0, unreadOnly: false };

  const { data: notifications = [] } = useQuery({
    queryKey: getListNotificationsQueryKey(params),
    queryFn: () => listNotifications(params),
    enabled: !!user?.id,
  });

  const recentUnread = notifications.filter(n => !n.read).slice(0, 5);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey(params) });
    qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead({ userId: user?.id ?? 0 }),
    onSuccess: invalidate,
  });

  const handleNavigate = (notif: NotificationItem, route: string) => {
    if (!notif.read) markReadMutation.mutate(notif.id);
    setOpen(false);
    setLocation(route);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          title={collapsed ? "Inbox" : undefined}
          className={`flex items-center gap-3 py-2 rounded-md cursor-pointer transition-colors text-sm group text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground ${collapsed ? "justify-center px-2" : "px-3"}`}
        >
          <div className="relative shrink-0">
            <Bell className={`${collapsed ? "w-5 h-5" : "w-4 h-4"} transition-transform origin-top group-hover:rotate-12 group-hover:text-yellow-500`} />
            {collapsed && unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
            )}
          </div>
          {!collapsed && <span className="flex-1">Inbox</span>}
          {!collapsed && unreadCount > 0 && (
            <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] font-bold">
              {unreadCount}
            </Badge>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>

        {/* Recent unread list */}
        <div className="px-1.5 py-1.5 max-h-80 overflow-y-auto">
          {recentUnread.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
              All caught up
            </div>
          ) : (
            recentUnread.map(n => (
              <DropdownRow
                key={n.id}
                notification={n}
                onNavigate={route => handleNavigate(n, route)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-3 py-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground w-full"
            onClick={() => { setOpen(false); setLocation("/inbox"); }}
          >
            See all in Inbox
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
