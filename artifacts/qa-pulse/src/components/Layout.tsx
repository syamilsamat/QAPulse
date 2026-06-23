import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLogout, listNotifications } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Columns3Cog } from 'lucide-react';

import {
  HoverPulse,
  HoverDashboard,
  HoverUsers,
  HoverDocument,
  HoverFlask,
  HoverCheckSquare,
  HoverSearch,
  HoverSettings,
  HoverAccount,
  HoverLogOut,
  HoverMenu,
  HoverCoffee,
  HoverBell,
  HoverSparkles,
  HoverChart,
  HoverList,
  HoverPlay,
  HoverHistory,
  AnimatedQALogo,
} from "@/components/icons/animated";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// 1. Replaced MessageSquare with Bot
import { Brain, Bot, Send, Loader2, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";

const API_BASE = () => getApiUrl();
async function callAiEndpoint(
  token: string | null,
  endpoint: string,
  body: object,
) {
  const res = await fetch(`${API_BASE()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- Global QA Copilot Component ---
function GlobalQACopilot() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.id && typeof window !== "undefined") {
      const saved = localStorage.getItem(`qa-copilot-history-${user.id}`);
      if (saved) {
        try {
          setChatMessages(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse chat history");
        }
      } else {
        setChatMessages([]);
      }
      setHistoryLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (historyLoaded && user?.id && typeof window !== "undefined") {
      if (chatMessages.length > 0) {
        localStorage.setItem(
          `qa-copilot-history-${user.id}`,
          JSON.stringify(chatMessages),
        );
      } else {
        localStorage.removeItem(`qa-copilot-history-${user.id}`);
      }
    }
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, historyLoaded, user?.id]);

  const startNewChat = () => {
    setChatMessages([]);
    if (user?.id) {
      localStorage.removeItem(`qa-copilot-history-${user.id}`);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const res = await callAiEndpoint(token, "/ai/chat", {
        message: userMsg,
        conversationHistory: chatMessages.slice(-10),
      });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply },
      ]);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Chat Error",
        description: err.message,
      });
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen ? (
        <Card className="w-[350px] sm:w-[400px] h-[550px] flex flex-col shadow-2xl border-primary/20 mb-4 animate-in slide-in-from-bottom-5">
          <CardHeader className="p-3 border-b flex flex-row items-center justify-between bg-muted/40 shrink-0">
            <div className="flex items-center gap-2">
              {/* 2. Updated header avatar icon and background color */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#274AB3" }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">
                  QA Copilot
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  Always here to help
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={startNewChat}
                  title="New Chat"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3 min-h-0 p-3">
            <ScrollArea className="flex-1 pr-3 -mr-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-10 text-muted-foreground space-y-3">
                  <Bot className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-sm">
                    Start a conversation with your QA Copilot
                  </p>
                  <div className="flex flex-col gap-2 justify-center text-xs mt-4">
                    {[
                      "Generate regression checklist",
                      "Find missing test coverage",
                      "Summarize blocked tasks",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setChatInput(s)}
                        className="px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "assistant" && (
                      <div
                        className="w-6 h-6 mt-1 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "#274AB3" }}
                      >
                        <Bot className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div
                      className="w-6 h-6 mt-1 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "#274AB3" }}
                    >
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2 shrink-0 pt-2 border-t">
              <Input
                placeholder="Ask about your QA data..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendChat()
                }
                disabled={chatLoading}
                className="text-sm"
              />
              <Button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* 3. Updated main trigger button with specific hex code and text-white */
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-14 h-14 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 text-white border-none hover:opacity-90"
          style={{ backgroundColor: "#274AB3" }}
        >
          <Bot className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
  subItems?: { href: string; label: string; icon: React.ElementType }[];
  showBadge?: boolean;
}

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
    roles: ["qa_member", "pmo", "qa_lead", "admin"],
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
    href: "/configurations",
    label: "Configuration",
    icon: Columns3Cog,
    roles: ["qa_lead", "admin"],
  },
  {
    href: "/settings",
    label: "Account",
    icon: HoverAccount,
    roles: ["qa_member", "qa_lead", "admin"],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout: localLogout } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

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
      onSuccess: () => {
        localLogout();
        setLocation("/");
      },
      onError: () => {
        localLogout();
        setLocation("/");
      },
    });
  };

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!user) return false;
    if (user.role === "pmo") return item.href === "/pmo-report";
    return (item.roles as readonly string[]).includes(user.role);
  });

  const SidebarContent = ({ forMobile = false }: { forMobile?: boolean }) => {
    const show = collapsed && !forMobile;
    return (
      <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className={show ? "py-5 flex justify-center" : "px-6 py-6 pb-4"}>
          {show ? (
            <AnimatedQALogo className="w-7 h-7" />
          ) : (
            <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight flex items-center gap-3">
              <AnimatedQALogo className="w-6 h-6" />
              QA Pulse
            </h1>
          )}
        </div>

        {/* Nav */}
        <nav className={`flex-1 ${show ? "px-2" : "px-3"} space-y-1 overflow-y-auto`}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const badge = item.showBadge ? unreadCount : 0;

            return (
              <div key={item.href} className="flex flex-col">
                <Link href={item.href}>
                  <div
                    title={show ? item.label : undefined}
                    className={`flex items-center gap-3 py-2 rounded-md cursor-pointer transition-colors text-sm group ${
                      location === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    } ${show ? "justify-center px-2" : "px-3"}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="relative shrink-0">
                      <Icon
                        className={`${show ? "w-5 h-5" : "w-4 h-4"} transition-transform group-hover:scale-110 ${location === item.href ? "text-primary" : ""}`}
                      />
                      {show && badge > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
                      )}
                    </div>
                    {!show && <span className="flex-1">{item.label}</span>}
                    {!show && badge > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px] font-bold">
                        {badge}
                      </Badge>
                    )}
                  </div>
                </Link>
                {item.subItems && !show && (
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
                              className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110 ${location === sub.href ? "text-primary" : "text-muted-foreground"}`}
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

        {/* Collapse / expand toggle — hidden in mobile sheet */}
        {!forMobile && (
          <div className={`px-3 py-2 flex ${show ? "justify-center" : "justify-end"}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {show ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </Button>
          </div>
        )}

        {/* User profile */}
        <div className="p-3 border-t border-sidebar-border">
          {show ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <Avatar className="w-9 h-9 border border-border shrink-0" title={user?.name ?? undefined}>
                <AvatarImage src={user?.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {user?.name?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground group"
                onClick={() => setLogoutOpen(true)}
                title="Sign out"
              >
                <HoverLogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-2 py-2 mb-1">
                <Avatar className="w-9 h-9 border border-border shrink-0">
                  <AvatarImage src={user?.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {user?.name?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
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
                <HoverLogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex h-screen bg-background overflow-hidden relative">
        <div className={`hidden md:flex shrink-0 flex-col transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`}>
          <SidebarContent />
        </div>

        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <header className="h-14 flex items-center px-4 md:hidden border-b bg-card shrink-0">
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="group">
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
            <SidebarContent forMobile />
          </SheetContent>
        </Sheet>

        {/* Inject the global Copilot here */}
        <GlobalQACopilot />
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