import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Plus, Rocket, UserMinus } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRoleLabels } from "@/hooks/use-role-labels";
import { getApiUrl, authHeaders } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { QaPipelineBadge } from "@/components/qa-pipeline/QaPipelineBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequirementDialog, type DialogTarget } from "@/components/RequirementDialog";

type Milestone = {
  id: number;
  projectId: number;
  name: string;
  type: string;
  status: string;
  priority: string | null;
  environment: string | null;
  description: string | null;
  startDate: string | null;
  reqTargetDate: string | null;
  devTargetDate: string | null;
  qaTargetDate: string | null;
  sitTargetDate?: string | null;
  uatTargetDate: string | null;
  goLiveDate: string | null;
  pipelineEnabled: boolean;
  modules: { id: number; name: string }[];
  tracker: string | null;
  createdByName: string | null;
  assigned: boolean;
  can: { edit: boolean; staff: boolean; createRequirement: boolean };
  requirementCount: number;
  approvedCount: number;
};
type Member = { id: number; userId: number; name: string; role: string };
type Candidate = { id: number; name: string; role: string };
type Req = {
  id: number; title: string; tracker: string | null; module: string | null; reviewStatus: string; redmineTicketId: string | null;
  authorName: string | null; lastEditedByName: string | null; draftOwnerName: string | null;
};
type Activity = { id: number; description: string; userName: string | null; createdAt: string };

const TYPE_LABEL: Record<string, string> = { cr: "Change Request", phase: "Phase", sprint: "Sprint", release: "Release", data_prep: "Data Prep" };
const STATUS_LABEL: Record<string, string> = { planned: "Planned", active: "Active", verified: "Verified", sit: "SIT", uat: "UAT", completed: "Completed", cancelled: "Cancelled" };
const REVIEW_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", approved: "Approved", rejected: "Returned" };
const REVIEW_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
const QA_ROLES = ["qa_member", "qa_lead", "qa_manager", "hod_qa", "admin", "cto"];

// The department a role belongs to, for grouping the team. Custom roles that
// fit none of these land under "Other".
function deptOf(role: string): "FA" | "Dev" | "QA" | "PM" | "Other" {
  if (role.includes("qa")) return "QA";
  if (role.includes("fa")) return "FA";
  if (role.includes("dev")) return "Dev";
  if (role.includes("pm")) return "PM";
  return "Other";
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

const fmtDate = (v: string | null) => (v ? format(new Date(v), "dd MMM yyyy") : "Not set");

// A milestone's own page: the plan, its requirements, its team and what has
// happened on it. Everyone with access to the project can open it; what they
// can do on it (edit, staff, create a requirement) comes from the server.
export default function MilestoneDetail() {
  const [, params] = useRoute("/milestones/:id");
  const id = params?.id ? Number(params.id) : NaN;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { roleLabel } = useRoleLabels();
  const [pick, setPick] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogTarget | null>(null);

  const { data: m, isLoading, error } = useQuery<Milestone>({
    queryKey: ["milestone-detail", id],
    queryFn: () => get(`/milestones/${id}`),
    enabled: Number.isFinite(id),
  });
  const { data: project } = useQuery<{ id: number; name: string }>({
    queryKey: ["project", m?.projectId],
    queryFn: () => get(`/projects/${m!.projectId}`),
    enabled: !!m,
  });
  const { data: reqs = [] } = useQuery<Req[]>({
    queryKey: ["milestone-reqs", id],
    queryFn: () => get(`/requirements?milestoneId=${id}`),
    enabled: !!m,
  });
  const { data: team = [] } = useQuery<Member[]>({
    queryKey: ["milestone-team", id],
    queryFn: () => get(`/milestones/${id}/assignees`),
    enabled: !!m,
  });
  const { data: activity = [] } = useQuery<Activity[]>({
    queryKey: ["milestone-activity", id],
    queryFn: () => get(`/milestones/${id}/activity`),
    enabled: !!m,
  });
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["milestone-candidates", id],
    queryFn: () => get(`/milestones/${id}/assignable-users?forTeamStaffing=1`),
    enabled: !!m && m.can.staff,
  });

  if (!Number.isFinite(id)) return <p className="p-8 text-center text-muted-foreground">That milestone link isn't valid.</p>;
  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error || !m) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-muted-foreground">{(error as Error)?.message ?? "Milestone not found"}</p>
        <Button asChild variant="outline"><Link href="/milestones">Back to Milestones</Link></Button>
      </div>
    );
  }

  const refreshTeam = () => {
    queryClient.invalidateQueries({ queryKey: ["milestone-team", id] });
    queryClient.invalidateQueries({ queryKey: ["milestone-candidates", id] });
    queryClient.invalidateQueries({ queryKey: ["milestone-activity", id] });
  };
  const addMember = async (userId: number, dept: string) => {
    const res = await fetch(`${getApiUrl()}/milestones/${id}/assignees`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ variant: "destructive", title: body.error ?? "Could not add this person" }); return; }
    toast({ title: "Added to the team and notified" });
    setPick((p) => ({ ...p, [dept]: "" }));
    refreshTeam();
  };
  const removeMember = async (userId: number) => {
    const res = await fetch(`${getApiUrl()}/milestones/${id}/assignees/${userId}`, { method: "DELETE", headers: authHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ variant: "destructive", title: body.error ?? "Could not remove this person" }); return; }
    toast({ title: "Removed from the team" });
    refreshTeam();
  };

  const phases: [string, string | null][] = [
    ["Start", m.startDate], ["Requirements by", m.reqTargetDate], ["Dev done by", m.devTargetDate],
    ["System Testing done by", m.qaTargetDate], ...(m.sitTargetDate ? [["SIT done by", m.sitTargetDate] as [string, string | null]] : []), ["UAT done by", m.uatTargetDate], ["Go-live", m.goLiveDate],
  ];
  const depts = ["FA", "Dev", "QA", "PM", "Other"] as const;
  const readOnly = !m.can.edit;
  const showQaPipeline = m.pipelineEnabled && QA_ROLES.includes(user?.role ?? "");

  return (
    <div className="space-y-5 animate-in fade-in duration-500 max-w-5xl">
      <Link href={`/milestones?projectId=${m.projectId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Milestones
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">{project?.name ?? "Project"}{m.createdByName ? ` · created by ${m.createdByName}` : ""}</p>
          <h1 className="text-2xl font-bold tracking-tight break-words">{m.name}</h1>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{STATUS_LABEL[m.status] ?? m.status}</Badge>
            <Badge variant="secondary">{TYPE_LABEL[m.type] ?? m.type}</Badge>
            {m.pipelineEnabled && <QaPipelineBadge className="h-5 text-xs" />}
            {m.priority && <Badge variant="outline">Priority {m.priority}</Badge>}
            {m.environment && <Badge variant="outline" className="font-mono">{m.environment}</Badge>}
            {readOnly && <Badge variant="outline" className="text-muted-foreground">Read-only</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m.can.createRequirement && (
            <Button onClick={() => setDialog({ kind: "create" })}><Plus className="w-4 h-4 mr-2" /> Create requirement</Button>
          )}
          {m.can.edit && (
            <Button asChild variant="outline">
              <Link href={`/milestones?projectId=${m.projectId}&edit=${m.id}`}><Pencil className="w-4 h-4 mr-2" /> Edit milestone</Link>
            </Button>
          )}
          {showQaPipeline && (
            <Button asChild variant="outline">
              <Link href={`/qa-pipeline/${m.id}`}><Rocket className="w-4 h-4 mr-2" /> Open QA Pipeline</Link>
            </Button>
          )}
        </div>
      </div>

      {m.assigned && (
        <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm">
          You are on this milestone's team. You will get its status changes, date changes and new requirements as notifications, and it shows in My Work.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {phases.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className={`text-sm font-medium ${value ? "" : "text-muted-foreground"}`}>{fmtDate(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-lg border px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Modules</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {m.modules.length > 0 ? m.modules.map((x) => <Badge key={x.id} variant="secondary">{x.name}</Badge>) : <Badge variant="outline">All modules</Badge>}
          </div>
        </div>
        <div className="rounded-lg border px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Requirement tracker</p>
          <p className="text-sm font-medium mt-1">{m.tracker ?? "Chosen per requirement"}</p>
        </div>
      </div>
      {m.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.description}</p>}

      <Tabs defaultValue="reqs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reqs">Requirements ({reqs.length})</TabsTrigger>
          <TabsTrigger value="team">Team ({team.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="reqs">
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              {reqs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No requirements yet.{m.can.createRequirement ? " Use Create requirement above to add the first." : ""}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Requirement</TableHead><TableHead>Tracker</TableHead><TableHead>Module</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {reqs.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setDialog({ kind: "view", id: r.id })}>
                        <TableCell className="font-medium whitespace-normal">
                          <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); setDialog({ kind: "view", id: r.id }); }}>{r.title}</button>
                          {r.redmineTicketId && <span className="ml-2 text-xs text-muted-foreground font-mono">#{r.redmineTicketId}</span>}
                          <p className="text-xs font-normal text-muted-foreground">
                            Author {r.authorName ?? "unknown"}
                            {r.lastEditedByName && r.lastEditedByName !== r.authorName ? ` · last edited by ${r.lastEditedByName}` : ""}
                            {r.reviewStatus !== "approved" && r.draftOwnerName ? ` · owned by ${r.draftOwnerName}` : ""}
                          </p>
                        </TableCell>
                        <TableCell>{r.tracker ?? "—"}</TableCell>
                        <TableCell>{r.module ?? "—"}</TableCell>
                        <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${REVIEW_CLASS[r.reviewStatus] ?? "bg-muted"}`}>{REVIEW_LABEL[r.reviewStatus] ?? r.reviewStatus}</span></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!m.can.createRequirement && reqs.length > 0 && (
                <p className="text-xs text-muted-foreground pt-3">Only FA Leads, and FA Members on this milestone's team, can create requirements here.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {depts.map((dept) => {
              const members = team.filter((t) => deptOf(t.role) === dept);
              const options = candidates.filter((c) => deptOf(c.role) === dept && !team.some((t) => t.userId === c.id));
              if (members.length === 0 && options.length === 0 && dept === "Other") return null;
              return (
                <Card key={dept}>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{dept}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {members.length === 0 && <p className="text-xs text-muted-foreground">Nobody yet.</p>}
                    {members.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0">{t.name} <span className="text-xs text-muted-foreground">{roleLabel(t.role)}</span></span>
                        {m.can.staff && (
                          <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" aria-label={`Remove ${t.name}`} onClick={() => removeMember(t.userId)}>
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {m.can.staff && options.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        <select
                          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                          value={pick[dept] ?? ""}
                          aria-label={`Add a ${dept} person`}
                          onChange={(e) => setPick((p) => ({ ...p, [dept]: e.target.value }))}
                        >
                          <option value="">Add a person…</option>
                          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Button size="sm" disabled={!pick[dept]} onClick={() => addMember(Number(pick[dept]), dept)}>Add</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground pt-3">
            {m.can.staff
              ? "People must already have access to the project. A department lead can add only their own department; the milestone's PM can add any."
              : "Only a lead, or the milestone's PM, can change the team."}
          </p>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-4">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nothing has happened on this milestone yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((a) => (
                    <li key={a.id} className="border-l-2 border-primary/60 pl-3">
                      <p className="text-sm">{a.description}</p>
                      <p className="text-xs text-muted-foreground">{a.userName ? `${a.userName} · ` : ""}{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RequirementDialog
        target={dialog}
        milestone={{
          id: m.id, name: m.name, projectId: m.projectId, projectName: project?.name ?? "",
          modules: m.modules, tracker: m.tracker, priority: m.priority,
        }}
        canAuthor={m.can.createRequirement}
        onClose={() => setDialog(null)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["milestone-reqs", id] });
          queryClient.invalidateQueries({ queryKey: ["milestone-detail", id] });
          queryClient.invalidateQueries({ queryKey: ["milestone-activity", id] });
        }}
      />
    </div>
  );
}
