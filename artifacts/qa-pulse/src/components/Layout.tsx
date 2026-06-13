import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout, listNotifications } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

// 1. Import your downloaded animated icons from itshover.com here
import {
  HoverPulse,
  HoverDashboard,
  HoverUsers,
  HoverDocument,
  HoverFlask,
  HoverCheckSquare,
  HoverSearch,
  HoverSettings,
  HoverLogOut,
  HoverMenu,
  HoverCoffee,
  HoverBell,
  HoverSparkles,
  HoverChart,
  HoverList, // Submenu: Execution Details
  HoverPlay, // Submenu: Execution Dashboard
  HoverHistory, // Submenu: History Trail
  AnimatedQALogo,
} from "@/components/icons/animated";

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

// 2. Updated interface to include subItem icons
interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  subItems?: { href: string; label: string; icon: React.ElementType }[];
  showBadge?: boolean;
}

// 3. Map the animated icons to the menu and submenus
const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: HoverDashboard,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/requirements",
    label: "Requirements",
    icon: HoverDocument,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/test-cases",
    label: "Test Cases",
    icon: HoverFlask,
    roles: ["qa_member", "qa_lead", "admin"],
    subItems: [
      {
        href: "/test-cases/execution-details",
        label: "Execution Details",
        icon: HoverList,
      },
      {
        href: "/test-cases/execution",
        label: "Execution Dashboard",
        icon: HoverPlay,
      },
    ],
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: HoverCheckSquare,
    roles: ["qa_member", "qa_lead", "admin"],
    subItems: [
      { href: "/history-trail", label: "History Trail", icon: HoverHistory },
    ],
  },
  {
    href: "/ai-features",
    label: "AI Hub",
    icon: HoverSparkles,
    roles: ["qa_member", "qa_lead", "admin"],
  },
  {
    href: "/pmo-report",
    label: "PMO Report",
    icon: HoverChart,
    roles: ["pmo", "qa_lead", "admin"],
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: HoverBell,
    roles: ["qa_member", "qa_lead", "admin"],
    showBadge: true,
  },
  {
    href: "/team",
    label: "Team",
    icon: HoverUsers,
    roles: ["qa_lead", "admin"],
  },
  {
    href: "/admin/search",
    label: "Admin Search",
    icon: HoverSearch,
    roles: ["admin"],
  },
  {
    href: "/team-hangouts",
    label: "Team Hangouts",
    icon: HoverCoffee,
    roles: ["qa_member", "qa_lead", "admin"],
    showBadge: false,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: HoverSettings,
    roles: ["qa_member", "qa_lead", "admin"],
  },
];

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
    if (user.role === "pmo") {
      return item.href === "/pmo-report";
    }
    return (item.roles as readonly string[]).includes(user.role);
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="px-6 py-6 pb-4">
        <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight flex items-center gap-3">
          {/* Replaced the static div and HoverPulse with the new AnimatedQALogo */}
          <AnimatedQALogo className="w-6 h-6"/>
          QA Pulse
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isParentActive =
            location === item.href ||
            item.subItems?.some((sub) => location === sub.href);
          const badge = item.showBadge ? unreadCount : 0;

          return (
            <div key={item.href} className="flex flex-col">
              <Link href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm group ${
                    location === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
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

              {/* Render Sub Items with their new Animated Icons */}
              {item.subItems && (
                <div className="ml-5 mt-1 flex flex-col space-y-0.5 border-l-2 border-muted/30 pl-2">
                  {item.subItems.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <Link key={sub.href} href={sub.href}>
                        <div
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors text-xs group ${
                            location === sub.href
                              ? "bg-sidebar-accent text-primary font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
                          }`}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <SubIcon
                            className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${
                              location === sub.href
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                          {sub.label}
                        </div>
                      </Link>
                    );
                  })}
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
          className="w-full justify-start text-muted-foreground hover:text-foreground gap-2 text-sm group"
          onClick={() => setLogoutOpen(true)}
        >
          {/* Replaced LogOut with Animated Icon */}
          <HoverLogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-screen bg-background overflow-hidden">
        <div className="hidden md:flex w-64 shrink-0 flex-col">
          <SidebarContent />
        </div>

        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="h-14 flex items-center px-4 md:hidden border-b bg-card shrink-0">
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="group">
                  {/* Replaced standard Menu with Animated Menu */}
                  <HoverMenu className="w-5 h-5 transition-transform group-hover:scale-110" />
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
