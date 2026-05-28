import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bell, BellOff, CheckCheck, AlertTriangle, Clock, Users, Info, Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  task:    { icon: CheckCheck, color: "text-blue-600", bg: "bg-blue-50" },
  overdue: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  social:  { icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
  warning: { icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
  info:    { icon: Info, color: "text-slate-600", bg: "bg-slate-50" },
};

function NotifIcon({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <div className={`p-2 rounded-full ${cfg.bg} shrink-0`}>
      <Icon className={`w-4 h-4 ${cfg.color}`} />
    </div>
  );
}

export default function Inbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

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

  const unreadCount = notifications.filter((n) => !n.read).length;
  const displayed = unreadOnly ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-7 h-7 text-primary" />
            Inbox
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground">Your notifications and alerts</span>
            {unreadCount > 0 && (
              <Badge variant="destructive">{unreadCount} unread</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="unread" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            <Label htmlFor="unread" className="text-sm cursor-pointer">Unread only</Label>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BellOff className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            {unreadOnly ? "No unread notifications" : "Your inbox is empty"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadOnly ? "Switch off the filter to see all notifications" : "Notifications about tasks, tags, and team events appear here"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((notif, i) => (
            <NotificationCard
              key={`${notif.id}-${i}`}
              notification={notif}
              onMarkRead={(id) => {
                if (id > 0 && !notif.read) markReadMutation.mutate(id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead: (id: number) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors cursor-default ${
        notification.read ? "bg-card" : "bg-primary/5 border-primary/20"
      }`}
      onClick={() => onMarkRead(notification.id)}
    >
      <NotifIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`font-medium text-sm ${notification.read ? "text-foreground" : "text-foreground"}`}>
            {notification.title}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {!notification.read && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{notification.message}</p>
      </div>
    </div>
  );
}
