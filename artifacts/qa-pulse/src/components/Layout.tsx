import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout, listNotifications } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  FileText,
  TestTube,
  CheckSquare,
  Search,
  Settings,
  LogOut,
  Menu,
  Coffee,
  Bell,
  Sparkles,
  FileBarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/requirements",
    label: "Requirements",
    icon: FileText,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/test-cases",
    label: "Test Cases",
    icon: TestTube,
    roles: ["qa_member", "qa_lead", "admin"],
    subItems: [
      {
        href: "/test-cases/execution-details", // <-- UPDATE THIS LINE
        label: "Execution Details",
      },
    ],
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: CheckSquare,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/ai-features",
    label: "AI Hub",
    icon: Sparkles,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/pmo-report",
    label: "PMO Report",
    icon: FileBarChart2,
    roles: ["pmo", "qa_lead", "admin"],
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: Bell,
    roles: ["qa_member", "qa_lead", "admin"],
    showBadge: true,
  },
  { href: "/team", label: "Team", icon: Users, roles: ["qa_lead", "admin"] },
  {
    href: "/admin/search",
    label: "Admin Search",
    icon: Search,
    roles: ["admin"],
  },
  {
    href: "/team-hangouts",
    label: "Team Hangouts",
    icon: Coffee,
    roles: ["qa_member", "qa_lead", "admin"],
    showBadge: false,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["qa_member", "qa_lead", "admin"],
  },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout: localLogout } = useAuth();
  const [location] = useLocation();
  const logoutMutation = useLogout();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const { data: unreadNotifs = [] } = useQuery({
    queryKey: ["notifications-unread", user?.id],
    queryFn: () =>
      listNotifications({ userId: user?.id ?? 0, unreadOnly: true }),
    enabled: !!user?.id && user.role !== "pmo",
    refetchInterval: 30000,
  });
  const unreadCount = unreadNotifs.filter((n) => !n.read).length;

  const handleLogout = () => {
    setLogoutOpen(false);
    logoutMutation.mutate(undefined, {
      onSuccess: () => localLogout(),
      onError: () => localLogout(),
    });
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!user) return false;

    // PMO can ONLY see PMO Report
    if (user.role === "pmo") {
      return item.href === "/pmo-report";
    }

    return (item.roles as readonly string[]).includes(user.role);
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6 pb-4">
        <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight flex items-center gap-2">
          <TestTube className="w-5 h-5 text-primary" />
          QA Pulse
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isParentActive =
            location === item.href ||
            item.subItems?.some((sub) => location === sub.href);
          const badge = (item as any).showBadge ? unreadCount : 0;

          return (
            <div key={item.href} className="flex flex-col">
              <Link href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm ${
                    location === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      location === item.href ? "text-primary" : ""
                    }`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <Badge
                      variant="destructive"
                      className="h-5 min-w-5 px-1 text-[10px] font-bold"
                    >
                      {badge}
                    </Badge>
                  )}
                </div>
              </Link>

              {/* Render Sub Items if they exist */}
              {item.subItems && (
                <div className="ml-5 mt-1 flex flex-col space-y-0.5 border-l-2 border-muted/30 pl-2">
                  {item.subItems.map((sub) => (
                    <Link key={sub.href} href={sub.href}>
                      <div
                        className={`px-3 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${
                          location === sub.href
                            ? "bg-sidebar-accent text-primary font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {sub.label}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <Avatar className="w-9 h-9 border border-border shrink-0">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {user?.name?.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name}
            </p>
            <p className="text-xs text-muted-foreground capitalize truncate">
              {user?.role?.replace(/_/g, " ")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground gap-2 text-sm"
          onClick={() => setLogoutOpen(true)}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-64 shrink-0 flex-col">
          <SidebarContent />
        </div>

        {/* Mobile + Desktop main area */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Mobile header */}
            <header className="h-14 flex items-center px-4 md:hidden border-b bg-card shrink-0">
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <h1 className="ml-4 text-lg font-bold">QA Pulse</h1>
              {unreadCount > 0 && (
                <Link href="/inbox" className="ml-auto">
                  <Badge variant="destructive" className="cursor-pointer">
                    {unreadCount}
                  </Badge>
                </Link>
              )}
            </header>

            <main className="flex-1 overflow-auto p-4 md:p-8">
              <div className="max-w-7xl mx-auto">{children}</div>
            </main>
          </div>

          <SheetContent side="left" className="p-0 w-64">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of QA Pulse?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be redirected to the login page. Any unsaved changes will
              be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
