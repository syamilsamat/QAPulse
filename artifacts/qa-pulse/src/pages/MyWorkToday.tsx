import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Bug,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Users2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authHeaders, getApiUrl } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkScope = "mine" | "team" | "unassigned";
type WorkPriority = "urgent" | "high" | "normal";
type WorkSection = "urgent" | "action" | "waiting";

interface WorkItem {
  id: string;
  type: "task" | "requirement" | "test_case" | "execution" | "defect" | "risk";
  title: string;
  context: string;
  reason: string;
  priority: WorkPriority;
  section: WorkSection;
  actionLabel: string;
  actionUrl: string;
  projectName: string | null;
  milestoneName: string | null;
  ownerName: string | null;
  updatedAt: string;
}

interface MyWorkResponse {
  scope: WorkScope;
  canViewTeam: boolean;
  generatedAt: string;
  summary: { urgent: number; action: number; waiting: number; total: number };
  items: WorkItem[];
}

const TYPE_ICONS = {
  task: ListChecks,
  requirement: FileText,
  test_case: ClipboardCheck,
  execution: CheckCircle2,
  defect: Bug,
  risk: ShieldAlert,
};

const SECTION_COPY: Record<WorkSection, { title: string; empty: string }> = {
  urgent: { title: "Urgent", empty: "No urgent items. You are clear to focus on planned work." },
  action: { title: "Needs action", empty: "Nothing else needs your action right now." },
  waiting: { title: "Waiting on others", empty: "No items are currently waiting on someone else." },
};

function timeAgo(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function WorkItemCard({ item, onOpen }: { item: WorkItem; onOpen: (url: string) => void }) {
  const Icon = TYPE_ICONS[item.type] ?? CircleDot;
  const urgent = item.priority === "urgent";
  const high = item.priority === "high";

  return (
    <Card className="overflow-hidden shadow-sm transition-colors hover:border-primary/30">
      <CardContent className="p-0">
        <div className="flex min-h-[86px]">
          <div className={`w-1.5 shrink-0 ${urgent ? "bg-destructive" : high ? "bg-amber-500" : "bg-primary"}`} />
          <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex ${urgent ? "bg-destructive/10 text-destructive" : high ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="font-medium leading-snug text-foreground">{item.title}</p>
                <Badge variant={urgent ? "destructive" : "secondary"} className={high ? "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300" : ""}>
                  {urgent ? "Urgent" : high ? "High" : item.type.replace("_", " ")}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><FolderKanban className="h-3.5 w-3.5" />{item.context}</span>
                <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />{item.reason}</span>
                {item.ownerName && <span className="inline-flex items-center gap-1.5"><Users2 className="h-3.5 w-3.5" />{item.ownerName}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <span className="hidden text-xs text-muted-foreground xl:inline">Updated {timeAgo(item.updatedAt)}</span>
              <Button size="sm" onClick={() => onOpen(item.actionUrl)} className="gap-1.5">
                {item.actionLabel}<ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyWorkToday() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [scope, setScope] = useState<WorkScope>("mine");

  const query = useQuery<MyWorkResponse>({
    queryKey: ["my-work", scope],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/my-work?scope=${scope}`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to load your work queue");
      }
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const sections: WorkSection[] = ["urgent", "action", "waiting"];

  return (
    <div className="min-h-full bg-muted/20 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <ListChecks className="h-4 w-4" /> My Work Today
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Good morning, {firstName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {scope === "mine" ? "Your prioritized actions across QAPulse." : scope === "team" ? "Team actions, reviews and delivery exceptions." : "Work that needs an accountable owner."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {query.data?.generatedAt && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {timeAgo(query.data.generatedAt)}</span>}
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Urgent</p><p className="mt-1 text-3xl font-bold tabular-nums">{query.data?.summary.urgent ?? 0}</p></div><div className="rounded-xl bg-destructive/10 p-3 text-destructive"><AlertCircle className="h-5 w-5" /></div></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs action</p><p className="mt-1 text-3xl font-bold tabular-nums">{query.data?.summary.action ?? 0}</p></div><div className="rounded-xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400"><Clock3 className="h-5 w-5" /></div></CardContent></Card>
          <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waiting</p><p className="mt-1 text-3xl font-bold tabular-nums">{query.data?.summary.waiting ?? 0}</p></div><div className="rounded-xl bg-primary/10 p-3 text-primary"><Users2 className="h-5 w-5" /></div></CardContent></Card>
        </div>

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <Tabs value={scope} onValueChange={(value) => setScope(value as WorkScope)}>
            <TabsList>
              <TabsTrigger value="mine">My Work</TabsTrigger>
              {(query.data?.canViewTeam ?? true) && <TabsTrigger value="team">My Team</TabsTrigger>}
              {(query.data?.canViewTeam ?? true) && <TabsTrigger value="unassigned">Unassigned</TabsTrigger>}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">Priorities are based on severity, overdue dates and review age.</p>
        </div>

        {query.isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : query.isError ? (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Unable to load My Work Today</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Please try again."}</AlertDescription></Alert>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => {
              const sectionItems = query.data?.items.filter((item) => item.section === section) ?? [];
              if (sectionItems.length === 0 && section !== "urgent") return null;
              return (
                <section key={section}>
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{SECTION_COPY[section].title}</h2>
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{sectionItems.length}</Badge>
                  </div>
                  {sectionItems.length > 0 ? (
                    <div className="space-y-2">{sectionItems.map((item) => <WorkItemCard key={item.id} item={item} onOpen={setLocation} />)}</div>
                  ) : (
                    <Card className="border-dashed"><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{SECTION_COPY[section].empty}</CardContent></Card>
                  )}
                </section>
              );
            })}
            {(query.data?.summary.total ?? 0) === 0 && (
              <Card className="border-dashed"><CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center"><CheckCircle2 className="h-10 w-10 text-emerald-600" /><div><p className="font-medium">You are all caught up</p><p className="text-sm text-muted-foreground">No actionable work was found in your accessible projects.</p></div></CardContent></Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
