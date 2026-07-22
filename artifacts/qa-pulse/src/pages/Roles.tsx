import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, Pencil, Trash2, Users, Lock, KeyRound, Building2, Table2, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Role {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  department: string | null;
  tierRank: number | null;
  userCount: number;
  createdAt: string;
}

const DEPARTMENTS = [
  { value: "qa",  label: "QA" },
  { value: "pm",  label: "PM" },
  { value: "fa",  label: "FA / BI" },
  { value: "dev", label: "Dev" },
];

const TIER_OPTIONS = [
  { value: "1", label: "1 — Member" },
  { value: "2", label: "2 — Lead" },
  { value: "4", label: "4 — HOD" },
  { value: "5", label: "5 — CTO" },
];

function deptLabel(d: string | null) {
  if (!d) return null;
  return DEPARTMENTS.find((x) => x.value === d)?.label ?? d.toUpperCase();
}

function tierLabel(t: number | null) {
  if (t == null) return null;
  return TIER_OPTIONS.find((x) => x.value === String(t))?.label ?? `Tier ${t}`;
}

// CR041 — was missing 6 of 17 real nav keys (milestones/pm-dashboard/
// audit-log/qa-analytics/defects/resources couldn't be toggled through this
// editor at all); fixed while building the access-matrix view below, which
// reads the same complete list from the backend rather than a second
// hardcoded copy of it.
const NAV_PERMISSION_ITEMS = [
  { key: "nav:requirements",   label: "Requirements" },
  { key: "nav:test-cases",     label: "Test Cases" },
  { key: "nav:traceability",   label: "Traceability" },
  { key: "nav:tasks",          label: "Tasks" },
  { key: "nav:ai-hub",         label: "AI Hub" },
  { key: "nav:report",         label: "Report" },
  { key: "nav:inbox",          label: "Inbox" },
  { key: "nav:team",           label: "Team" },
  { key: "nav:admin-search",   label: "Admin Search" },
  { key: "nav:team-hangouts",  label: "Team Hangouts" },
  { key: "nav:configurations", label: "Configuration" },
  { key: "nav:milestones",     label: "Milestones" },
  { key: "nav:pm-dashboard",   label: "PM Dashboard" },
  { key: "nav:audit-log",      label: "Audit Log" },
  { key: "nav:qa-analytics",   label: "QA Analytics" },
  { key: "nav:defects",        label: "Defects" },
  { key: "nav:resources",      label: "Resources" },
  { key: "nav:risk-register",  label: "Risk Register" },
];

const NAV_LABEL_BY_KEY: Record<string, string> = Object.fromEntries(
  NAV_PERMISSION_ITEMS.map((item) => [item.key, item.label]),
);

function labelForNavKey(key: string): string {
  return NAV_LABEL_BY_KEY[key] ?? key.replace(/^nav:/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// CR043 — static RACI overlay for the Access Matrix dialog. This is a
// governance judgment (who is Responsible/Accountable/Consulted/Informed per
// page), not data the system stores — deliberately hardcoded while the RACI
// itself is young; revisit as a table only if it becomes a living artifact
// that admins need to edit in-app. Roles absent from a key's entry (and
// custom roles like a hand-added devops) simply have no RACI stake there.
// Utility pages (inbox, team-hangouts, admin-search) carry no RACI at all.
type RaciLetter = "R" | "A" | "C" | "I";

const RACI_MAP: Record<string, Record<string, RaciLetter>> = {
  "nav:requirements":   { fa_member: "R", fa_lead: "A", qa_manager: "C", qa_lead: "C", qa_member: "C", dev_lead: "C", dev_member: "C", pm_lead: "C", hod_qa: "I", hod_fa: "I", hod_dev: "I", hod_pm: "I", cto: "I" },
  "nav:test-cases":     { qa_member: "R", qa_lead: "A", qa_manager: "C", fa_lead: "C", fa_member: "C", dev_lead: "C", dev_member: "C", hod_qa: "I", hod_fa: "I", hod_dev: "I", hod_pm: "I", pm_lead: "I", cto: "I" },
  "nav:traceability":   { qa_lead: "R", hod_qa: "A", qa_manager: "C", qa_member: "C", fa_lead: "C", pm_lead: "C", fa_member: "I", hod_fa: "I", hod_dev: "I", hod_pm: "I", cto: "I" },
  "nav:tasks":          { qa_member: "R", qa_lead: "A", qa_manager: "C", fa_lead: "C", pm_lead: "C", hod_qa: "I", hod_fa: "I", hod_pm: "I", cto: "I" },
  "nav:ai-hub":         { qa_member: "R", qa_lead: "A", qa_manager: "C", fa_lead: "C", hod_qa: "I", hod_fa: "I", cto: "I" },
  "nav:report":         { qa_lead: "R", hod_qa: "A", qa_manager: "C", qa_member: "C", fa_lead: "I", fa_member: "I", hod_fa: "I", dev_lead: "I", dev_member: "I", hod_dev: "I", pm_lead: "I", pm_member: "I", hod_pm: "I", cto: "I" },
  "nav:milestones":     { qa_lead: "R", pm_lead: "A", qa_manager: "C", qa_member: "C", fa_lead: "C", fa_member: "C", pm_member: "C", hod_qa: "I", hod_fa: "I", hod_pm: "I", cto: "I" },
  "nav:pm-dashboard":   { pm_lead: "R", hod_pm: "A", pm_member: "C", cto: "I" },
  "nav:risk-register":  { pm_lead: "R", hod_pm: "A", qa_lead: "C", fa_lead: "C", pm_member: "C", hod_qa: "I", hod_fa: "I", hod_dev: "I", cto: "I" },
  "nav:qa-analytics":   { qa_lead: "R", qa_manager: "A", hod_qa: "I", cto: "I" },
  "nav:defects":        { qa_member: "R", dev_member: "R", qa_lead: "A", qa_manager: "C", fa_lead: "C", fa_member: "C", dev_lead: "C", hod_qa: "I", hod_dev: "I", cto: "I" },
  "nav:resources":      { qa_lead: "R", fa_lead: "R", dev_lead: "R", hod_qa: "A", hod_fa: "A", hod_dev: "A", hod_pm: "A", qa_manager: "C", pm_lead: "C", cto: "I" },
  "nav:configurations": { qa_lead: "R", hod_qa: "A", qa_manager: "C", pm_lead: "C", hod_fa: "I", hod_pm: "I", cto: "I" },
  "nav:team":           { qa_lead: "R", fa_lead: "R", dev_lead: "R", pm_lead: "R", hod_qa: "A", hod_fa: "A", hod_dev: "A", hod_pm: "A", qa_manager: "C", cto: "I" },
  "nav:audit-log":      { admin: "R", cto: "I" },
};

const RACI_CELL_CLASS: Record<RaciLetter, string> = {
  R: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  A: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  C: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  I: "text-muted-foreground",
};

const RACI_LEGEND: { letter: RaciLetter; label: string }[] = [
  { letter: "R", label: "Responsible" },
  { letter: "A", label: "Accountable" },
  { letter: "C", label: "Consulted" },
  { letter: "I", label: "Informed" },
];

const QUERY_KEY = ["roles"];

export default function Roles() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixView, setMatrixView] = useState<"access" | "raci">("access");

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDept, setFormDept] = useState<string>("");
  const [formTier, setFormTier] = useState<string>("");

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load roles");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; department: string | null; tierRank: number | null }) => {
      const res = await fetch(`${getApiUrl()}/roles`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to create role");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setCreateOpen(false);
      toast({ title: "Role created", description: `"${formName}" has been added.` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; description: string; department: string | null; tierRank: number | null }) => {
      const res = await fetch(`${getApiUrl()}/roles/${data.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: data.name, description: data.description, department: data.department, tierRank: data.tierRank }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update role");
      return body;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditRole(null);
      toast({ title: "Role updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: permData, isLoading: permLoading } = useQuery<{ permissions: string[] }>({
    queryKey: ["role-permissions", permRole?.id],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles/${permRole!.id}/permissions`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load permissions");
      return res.json();
    },
    enabled: !!permRole,
  });

  interface MatrixRole { id: number; name: string; description: string | null; department: string | null; tierRank: number | null; isSystem: boolean; permissions: string[]; }
  const { data: matrixData, isLoading: matrixLoading } = useQuery<{ allKeys: string[]; roles: MatrixRole[] }>({
    queryKey: ["role-permissions-matrix"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles/permissions-matrix`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load access matrix");
      return res.json();
    },
    enabled: matrixOpen,
  });

  function matrixCell(role: MatrixRole, key: string) {
    const hasAccess = role.permissions.includes(key);
    if (matrixView === "access") {
      return hasAccess ? <Check className="w-4 h-4 text-primary inline" /> : null;
    }
    const letter = RACI_MAP[key]?.[role.name];
    if (!letter) return hasAccess ? <span className="text-muted-foreground">·</span> : null;
    if (letter === "I") return <span className={`text-xs ${RACI_CELL_CLASS.I}`}>I</span>;
    const gap = !hasAccess;
    return (
      <span
        className={`inline-flex items-center justify-center min-w-6 h-5 px-1 rounded text-xs font-semibold ${
          gap ? "bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500" : RACI_CELL_CLASS[letter]
        }`}
        title={gap ? `${letter} — but no access (gap)` : letter}
      >
        {letter}
        {gap ? "!" : ""}
      </span>
    );
  }

  // Sync fetched permissions into selectedPerms when dialog opens
  const [permRoleIdLoaded, setPermRoleIdLoaded] = useState<number | null>(null);
  if (permData && permRole && permRole.id !== permRoleIdLoaded) {
    setSelectedPerms(new Set(permData.permissions));
    setPermRoleIdLoaded(permRole.id);
  }

  const savePermsMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: number; permissions: string[] }) => {
      const res = await fetch(`${getApiUrl()}/roles/${id}/permissions`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ permissions }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save permissions");
      return body;
    },
    onSuccess: () => {
      setPermRole(null);
      setPermRoleIdLoaded(null);
      // Invalidate the sidebar permissions cache so it re-fetches
      qc.invalidateQueries({ queryKey: ["my-nav-permissions"] });
      toast({ title: "Permissions saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${getApiUrl()}/roles/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (res.status === 204) return;
      const body = await res.json();
      throw new Error(body.error ?? "Failed to delete role");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteRole(null);
      toast({ title: "Role deleted" });
    },
    onError: (e: Error) => {
      setDeleteRole(null);
      toast({ title: "Cannot delete role", description: e.message, variant: "destructive" });
    },
  });

  function openPerms(role: Role) {
    setPermRoleIdLoaded(null);
    setSelectedPerms(new Set());
    setPermRole(role);
  }

  function togglePerm(key: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openCreate() {
    setFormName("");
    setFormDesc("");
    setFormDept("");
    setFormTier("");
    setCreateOpen(true);
  }

  function openEdit(role: Role) {
    setFormName(role.name);
    setFormDesc(role.description ?? "");
    setFormDept(role.department ?? "");
    setFormTier(role.tierRank != null ? String(role.tierRank) : "");
    setEditRole(role);
  }

  function handleCreate() {
    if (!formName.trim()) return;
    createMutation.mutate({
      name: formName.trim(),
      description: formDesc.trim(),
      department: formDept || null,
      tierRank: formTier ? Number(formTier) : null,
    });
  }

  function handleUpdate() {
    if (!editRole || !formName.trim()) return;
    updateMutation.mutate({
      id: editRole.id,
      name: formName.trim(),
      description: formDesc.trim(),
      department: formDept || null,
      tierRank: formTier ? Number(formTier) : null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Roles</h1>
            <p className="text-sm text-muted-foreground">Define roles and control access across the system</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setMatrixOpen(true)} className="gap-2">
            <Table2 className="w-4 h-4" />
            View Access Matrix
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            New Role
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Roles</CardTitle>
          <CardDescription>{roles.length} role{roles.length !== 1 ? "s" : ""} defined</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading roles…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead className="w-24">Department</TableHead>
                  <TableHead className="w-28">Tier</TableHead>
                  <TableHead className="text-center w-20">Users</TableHead>
                  <TableHead className="text-center w-20">Type</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {role.isSystem && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        {role.description || <span className="italic text-muted-foreground">No description</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {deptLabel(role.department) ? (
                        <Badge variant="outline" className="text-xs">
                          <Building2 className="w-3 h-3 mr-1" />
                          {deptLabel(role.department)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {role.tierRank != null ? (
                        <span className="text-xs">{tierLabel(role.tierRank)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        {role.userCount}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {role.isSystem ? (
                        <Badge variant="secondary" className="text-xs">System</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Custom</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openPerms(role)}
                          title="Edit nav permissions"
                          disabled={role.isSystem && role.name === "admin"}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(role)}
                          title="Edit role"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRole(role)}
                          disabled={role.isSystem}
                          title={role.isSystem ? "System roles cannot be deleted" : "Delete role"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Add a new role to the system. You can assign users to it from the Team page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">Role Name <span className="text-destructive">*</span></Label>
              <Input
                id="create-name"
                placeholder="e.g. qa_analyst"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-desc">Display Name</Label>
              <Textarea
                id="create-desc"
                placeholder="e.g. QA Manager"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={formDept || "none"} onValueChange={(v) => setFormDept(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier Rank</Label>
                <Select value={formTier || "none"} onValueChange={(v) => setFormTier(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {TIER_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            {editRole?.isSystem && (
              <DialogDescription className="flex items-center gap-1.5 text-amber-600">
                <Lock className="w-3.5 h-3.5" />
                System role — name cannot be changed
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Role Name <span className="text-destructive">*</span></Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={editRole?.isSystem}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Display Name</Label>
              <Textarea
                id="edit-desc"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={formDept || "none"} onValueChange={(v) => setFormDept(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier Rank</Label>
                <Select value={formTier || "none"} onValueChange={(v) => setFormTier(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {TIER_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!formName.trim() || updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!permRole} onOpenChange={(o) => { if (!o) { setPermRole(null); setPermRoleIdLoaded(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Nav Permissions — {permRole?.name}
            </DialogTitle>
            <DialogDescription>
              Choose which navigation items this role can see and access.
              Dashboard and Account are always visible.
            </DialogDescription>
          </DialogHeader>

          {permLoading ? (
            <div className="py-6 text-sm text-muted-foreground text-center">Loading…</div>
          ) : (
            <div className="grid grid-cols-2 gap-2 py-2">
              {NAV_PERMISSION_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedPerms.has(item.key)}
                    onCheckedChange={() => togglePerm(item.key)}
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPermRole(null); setPermRoleIdLoaded(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => permRole && savePermsMutation.mutate({ id: permRole.id, permissions: [...selectedPerms] })}
              disabled={permLoading || savePermsMutation.isPending}
            >
              {savePermsMutation.isPending ? "Saving…" : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRole} onOpenChange={(o) => !o && setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role "{deleteRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRole && deleteRole.userCount > 0 ? (
                <span className="text-destructive font-medium">
                  {deleteRole.userCount} user{deleteRole.userCount === 1 ? " has" : "s have"} this role.
                  Switch their role first before deleting.
                </span>
              ) : (
                "This role has no users assigned. It will be permanently removed."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteRole && deleteMutation.mutate(deleteRole.id)}
              disabled={!!deleteRole && deleteRole.userCount > 0}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Access Matrix — read-only view of role_nav_permissions, grouped by department */}
      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="w-4 h-4" />
              Access Matrix
            </DialogTitle>
            <DialogDescription>
              Editing happens per-role — click a role's Permissions button to change it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1">
              <Button size="sm" variant={matrixView === "access" ? "default" : "outline"} onClick={() => setMatrixView("access")}>
                Access
              </Button>
              <Button size="sm" variant={matrixView === "raci" ? "default" : "outline"} onClick={() => setMatrixView("raci")}>
                RACI
              </Button>
            </div>
            {matrixView === "raci" && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {RACI_LEGEND.map(({ letter, label }) => (
                  <span key={letter} className="flex items-center gap-1">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-semibold ${RACI_CELL_CLASS[letter]}`}>{letter}</span>
                    {label}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500">R!</span>
                  RACI role but no access (gap)
                </span>
                <span>· = access, no RACI stake</span>
              </div>
            )}
          </div>

          {matrixLoading || !matrixData ? (
            <div className="py-6 text-sm text-muted-foreground text-center">Loading…</div>
          ) : (
            <div className="overflow-x-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background w-40">Role</TableHead>
                    {matrixData.allKeys.map((key) => (
                      <TableHead key={key} title={labelForNavKey(key)} className="text-center whitespace-nowrap px-2">
                        {labelForNavKey(key)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEPARTMENTS.map((dept) => {
                    const deptRoles = matrixData.roles
                      .filter((r) => r.department === dept.value)
                      .sort((a, b) => (b.tierRank ?? 0) - (a.tierRank ?? 0));
                    if (deptRoles.length === 0) return null;
                    return (
                      <Fragment key={dept.value}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={matrixData.allKeys.length + 1} className="text-xs font-semibold text-muted-foreground py-1.5">
                            {dept.label}
                          </TableCell>
                        </TableRow>
                        {deptRoles.map((role) => (
                          <TableRow key={role.id}>
                            <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">{role.description || role.name}</TableCell>
                            {matrixData.allKeys.map((key) => (
                              <TableCell key={key} className="text-center px-2">
                                {matrixCell(role, key)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                  {(() => {
                    const otherRoles = matrixData.roles
                      .filter((r) => !DEPARTMENTS.some((d) => d.value === r.department))
                      .sort((a, b) => (b.tierRank ?? 0) - (a.tierRank ?? 0));
                    if (otherRoles.length === 0) return null;
                    return (
                      <Fragment key="other">
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={matrixData.allKeys.length + 1} className="text-xs font-semibold text-muted-foreground py-1.5">
                            Other
                          </TableCell>
                        </TableRow>
                        {otherRoles.map((role) => (
                          <TableRow key={role.id}>
                            <TableCell className="sticky left-0 bg-background font-medium whitespace-nowrap">{role.description || role.name}</TableCell>
                            {matrixData.allKeys.map((key) => (
                              <TableCell key={key} className="text-center px-2">
                                {matrixCell(role, key)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
