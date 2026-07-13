import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Users2 } from "lucide-react";

interface MilestoneRef {
  id: number;
  name: string;
}

interface ResourceRow {
  userId: number;
  name: string;
  role: string;
  department: string | null;
  projectId: number;
  projectName: string;
  signal: "execution_pic" | "requirement_author" | "task" | null;
  activeMilestones: MilestoneRef[];
  hasNoActiveMilestone: boolean;
  closedMilestones: MilestoneRef[];
}

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const DEPT_LABEL: Record<string, string> = { qa: "QA", fa: "FA", dev: "Dev", pm: "PM" };
const DEPT_CLASS: Record<string, string> = {
  qa: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/60 dark:text-teal-400 dark:border-teal-900",
  dev: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-400 dark:border-indigo-900",
  fa: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:border-purple-900",
  pm: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900",
};
const SIGNAL_LABEL: Record<string, string> = {
  execution_pic: "via QA PIC",
  requirement_author: "via authored requirement",
  task: "via task",
};
const ACTIVE_CHIP_CLASS = "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/60 dark:text-green-400 dark:border-green-900";

function DeptBadge({ department }: { department: string | null }) {
  if (!department || !DEPT_LABEL[department]) return null;
  return <Badge variant="outline" className={`text-[10px] font-semibold ${DEPT_CLASS[department]}`}>{DEPT_LABEL[department]}</Badge>;
}

function PersonRow({ r }: { r: ResourceRow }) {
  const initials = r.name.split(" ").map(w => w[0]).join("").slice(0, 2);
  const multi = r.activeMilestones.length > 1;
  return (
    <div className={`flex items-start gap-3 py-2.5 border-t first:border-t-0 ${multi ? "bg-green-50/60 dark:bg-green-950/20 rounded-lg px-2 -mx-2" : ""}`}>
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0 mt-0.5">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{r.name}</span>
          <DeptBadge department={r.department} />
          <span className="text-xs text-muted-foreground">{r.role} &middot; {r.projectName}</span>
          {multi && <span className="text-xs font-medium text-green-600 dark:text-green-400">on {r.activeMilestones.length} milestones</span>}
        </div>
        {r.signal && <p className="text-[11px] text-muted-foreground mt-0.5">{SIGNAL_LABEL[r.signal]}</p>}
      </div>
      <div className="flex gap-1.5 flex-wrap justify-end max-w-[200px] shrink-0">
        {r.activeMilestones.map(m => (
          <Badge key={m.id} variant="outline" className={`text-[10px] ${ACTIVE_CHIP_CLASS}`}>{m.name}</Badge>
        ))}
      </div>
    </div>
  );
}

function ClosedRow({ r }: { r: ResourceRow }) {
  const initials = r.name.split(" ").map(w => w[0]).join("").slice(0, 2);
  return (
    <div className="flex items-center gap-3 py-2 border-t first:border-t-0">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
        {initials}
      </div>
      <span className="text-xs flex-1">{r.name} <span className="text-muted-foreground">&middot; {r.projectName}</span></span>
      <div className="flex gap-1.5 flex-wrap justify-end">
        {r.closedMilestones.map(m => (
          <Badge key={m.id} variant="outline" className="text-[10px] text-muted-foreground font-normal">{m.name}</Badge>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-baseline gap-2 mb-1">
          <p className="text-sm font-medium">{title}</p>
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function Resources() {
  const { token } = useAuth();
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery<ResourceRow[]>({
    queryKey: ["resource-view"],
    queryFn: async () => {
      const res = await api("/dashboard/resource-view", token);
      if (!res.ok) throw new Error("Failed to load resources");
      return res.json();
    },
  });

  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) map.set(r.projectId, r.projectName);
    return Array.from(map.entries()).map(([id, name]) => ({ value: String(id), label: name }));
  }, [rows]);

  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.department) set.add(r.department);
    return Array.from(set).map(d => ({ value: d, label: DEPT_LABEL[d] ?? d }));
  }, [rows]);

  const filtered = rows.filter(r =>
    (filterProject === "all" || String(r.projectId) === filterProject) &&
    (filterDept === "all" || r.department === filterDept),
  );

  const active = filtered.filter(r => r.activeMilestones.length > 0);
  const idle = filtered.filter(r => r.hasNoActiveMilestone);
  const withHistory = filtered.filter(r => r.closedMilestones.length > 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resources</h1>
          <p className="text-sm text-muted-foreground">Who's focused on what, right now.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {projectOptions.length > 1 && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectOptions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {deptOptions.length > 1 && (
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {deptOptions.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <Users2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No resources visible for your role yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <SectionCard title="Active" count={active.length}>
            {active.length > 0
              ? active.map(r => <PersonRow key={`${r.userId}-${r.projectId}`} r={r} />)
              : <p className="text-xs text-muted-foreground py-2">Nobody currently focused on an active milestone.</p>}
          </SectionCard>

          <SectionCard title="No active milestone" count={idle.length}>
            {idle.length > 0
              ? idle.map(r => <PersonRow key={`${r.userId}-${r.projectId}`} r={r} />)
              : <p className="text-xs text-muted-foreground py-2">Everyone visible here is currently on an active milestone.</p>}
          </SectionCard>

          <SectionCard title="Closed history" count={withHistory.length}>
            {withHistory.length > 0
              ? withHistory.map(r => <ClosedRow key={`${r.userId}-${r.projectId}`} r={r} />)
              : <p className="text-xs text-muted-foreground py-2">No closed-milestone history yet.</p>}
          </SectionCard>
        </>
      )}
    </div>
  );
}
