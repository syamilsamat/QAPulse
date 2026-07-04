import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Pencil, Trash2, UserPlus, UserMinus, Link2, Unlink, ChevronsUpDown, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Team {
  id: number;
  name: string;
  department: string;
  memberCount: number;
  createdAt: string;
}

interface TeamDetail extends Team {
  members: Array<{ id: number; name: string; email: string; role: string; teamRole: string }>;
  projectIds: number[];
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Project {
  id: number;
  name: string;
}

const DEPARTMENTS = [
  { value: "qa", label: "QA" },
  { value: "pm", label: "PM" },
  { value: "fa", label: "FA / BI" },
  { value: "dev", label: "Dev" },
];

function deptLabel(d: string) {
  return DEPARTMENTS.find((x) => x.value === d)?.label ?? d.toUpperCase();
}

function api(path: string) {
  return `${getApiUrl()}${path}`;
}

function authHeaders(token: string | null) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export default function Teams() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);
  const [detailTeam, setDetailTeam] = useState<TeamDetail | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [assignProjectOpen, setAssignProjectOpen] = useState(false);

  const [form, setForm] = useState({ name: "", department: "" });
  const [memberForm, setMemberForm] = useState({ userIds: [] as number[], role: "member" });
  const [assignProjectId, setAssignProjectId] = useState("");

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: async () => {
      const r = await fetch(api("/teams"), { headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed to load teams");
      return r.json();
    },
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const r = await fetch(api("/users"), { headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed to load users");
      return r.json();
    },
  });

  const { data: allProjects = [] } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const r = await fetch(api("/projects"), { headers: authHeaders(token) });
      if (!r.ok) throw new Error("Failed to load projects");
      return r.json();
    },
  });

  async function loadTeamDetail(team: Team) {
    const r = await fetch(api(`/teams/${team.id}`), { headers: authHeaders(token) });
    if (r.ok) setDetailTeam(await r.json());
  }

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; department: string }) => {
      const r = await fetch(api("/teams"), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to create team");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setCreateOpen(false);
      setForm({ name: "", department: "" });
      toast({ title: "Team created" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; department: string }) => {
      const r = await fetch(api(`/teams/${data.id}`), {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ name: data.name, department: data.department }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to update team");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setEditTeam(null);
      toast({ title: "Team updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(api(`/teams/${id}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!r.ok) throw new Error("Failed to delete team");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setDeleteTeam(null);
      toast({ title: "Team deleted" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { teamId: number; userIds: number[]; role: string }) => {
      await Promise.all(data.userIds.map(async (userId) => {
        const r = await fetch(api(`/teams/${data.teamId}/members`), {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ userId, role: data.role }),
        });
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to add member");
      }));
    },
    onSuccess: async () => {
      setAddMemberOpen(false);
      setMemberPickerOpen(false);
      setMemberForm({ userIds: [], role: "member" });
      if (detailTeam) await loadTeamDetail(detailTeam);
      const count = memberForm.userIds.length;
      toast({ title: count === 1 ? "Member added" : `${count} members added` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (data: { teamId: number; userId: number }) => {
      const r = await fetch(api(`/teams/${data.teamId}/members/${data.userId}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!r.ok) throw new Error("Failed to remove member");
    },
    onSuccess: async () => {
      if (detailTeam) await loadTeamDetail(detailTeam);
      toast({ title: "Member removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const assignProjectMutation = useMutation({
    mutationFn: async (data: { projectId: number; teamId: number }) => {
      const r = await fetch(api(`/projects/${data.projectId}/teams`), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ teamId: data.teamId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to assign project");
    },
    onSuccess: async () => {
      setAssignProjectOpen(false);
      setAssignProjectId("");
      if (detailTeam) await loadTeamDetail(detailTeam);
      toast({ title: "Project assigned" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const unassignProjectMutation = useMutation({
    mutationFn: async (data: { projectId: number; teamId: number }) => {
      const r = await fetch(api(`/projects/${data.projectId}/teams/${data.teamId}`), {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!r.ok) throw new Error("Failed to unassign project");
    },
    onSuccess: async () => {
      if (detailTeam) await loadTeamDetail(detailTeam);
      toast({ title: "Project unassigned" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const availableUsers = allUsers.filter(
    (u) => !detailTeam?.members.find((m) => m.id === u.id)
  );

  const assignedProjectIds = new Set(detailTeam?.projectIds ?? []);
  const availableProjects = allProjects.filter((p) => !assignedProjectIds.has(p.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Teams</h2>
          <span className="text-sm text-muted-foreground">— assign users to projects by team</span>
        </div>
        <Button onClick={() => { setForm({ name: "", department: "" }); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Team
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading teams…</p>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No teams yet. Create one to start assigning users to projects.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => (
              <TableRow
                key={team.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => loadTeamDetail(team)}
              >
                <TableCell className="font-medium">{team.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{deptLabel(team.department)}</Badge>
                </TableCell>
                <TableCell>{team.memberCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setForm({ name: team.name, department: team.department }); setEditTeam(team); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTeam(team)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ── Team Detail Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!detailTeam} onOpenChange={(o) => { if (!o) setDetailTeam(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {detailTeam?.name}
              <Badge variant="outline" className="ml-2">{deptLabel(detailTeam?.department ?? "")}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Members */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Members ({detailTeam?.members.length ?? 0})</h3>
                <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)} disabled={availableUsers.length === 0}>
                  <UserPlus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
              {(detailTeam?.members.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>System Role</TableHead>
                      <TableHead>Team Role</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailTeam?.members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell><Badge variant="secondary">{m.role}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={m.teamRole === "lead" ? "default" : "outline"}>
                            {m.teamRole}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => removeMemberMutation.mutate({ teamId: detailTeam!.id, userId: m.id })}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Projects */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Assigned Projects ({detailTeam?.projectIds.length ?? 0})</h3>
                <Button size="sm" variant="outline" onClick={() => setAssignProjectOpen(true)} disabled={availableProjects.length === 0}>
                  <Link2 className="h-4 w-4 mr-1" /> Assign
                </Button>
              </div>
              {(detailTeam?.projectIds.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Not assigned to any projects.</p>
              ) : (
                <div className="space-y-2">
                  {detailTeam?.projectIds.map((pid) => {
                    const project = allProjects.find((p) => p.id === pid);
                    return (
                      <div key={pid} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-sm">{project?.name ?? `Project #${pid}`}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => unassignProjectMutation.mutate({ projectId: pid, teamId: detailTeam!.id })}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Member Dialog ────────────────────────────────────────────────── */}
      <Dialog open={addMemberOpen} onOpenChange={(o) => { if (!o) { setAddMemberOpen(false); setMemberPickerOpen(false); setMemberForm({ userIds: [], role: "member" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Members</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Users</Label>
              <Popover open={memberPickerOpen} onOpenChange={setMemberPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between min-h-10 h-auto"
                  >
                    <span className="flex flex-wrap gap-1 py-0.5">
                      {memberForm.userIds.length === 0 ? (
                        <span className="text-muted-foreground font-normal">Search and select users…</span>
                      ) : (
                        memberForm.userIds.map((uid) => {
                          const u = availableUsers.find((x) => x.id === uid);
                          return (
                            <span
                              key={uid}
                              className="inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-medium"
                            >
                              {u?.name ?? uid}
                              <button
                                type="button"
                                className="hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMemberForm((f) => ({ ...f, userIds: f.userIds.filter((id) => id !== uid) }));
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })
                      )}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name or role…" />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      <CommandGroup>
                        {availableUsers.map((u) => {
                          const selected = memberForm.userIds.includes(u.id);
                          return (
                            <CommandItem
                              key={u.id}
                              value={`${u.name} ${u.role}`}
                              onSelect={() => {
                                setMemberForm((f) => ({
                                  ...f,
                                  userIds: selected
                                    ? f.userIds.filter((id) => id !== u.id)
                                    : [...f.userIds, u.id],
                                }));
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                              <span>{u.name}</span>
                              <Badge variant="outline" className="ml-auto text-xs">{u.role}</Badge>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Team Role</Label>
              <Select value={memberForm.role} onValueChange={(v) => setMemberForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMemberOpen(false); setMemberForm({ userIds: [], role: "member" }); }}>Cancel</Button>
            <Button
              disabled={memberForm.userIds.length === 0 || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate({
                teamId: detailTeam!.id,
                userIds: memberForm.userIds,
                role: memberForm.role,
              })}
            >
              Add {memberForm.userIds.length > 0 ? `(${memberForm.userIds.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Project Dialog ─────────────────────────────────────────────── */}
      <Dialog open={assignProjectOpen} onOpenChange={setAssignProjectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Project</DialogTitle></DialogHeader>
          <div>
            <Label>Project</Label>
            <Select value={assignProjectId} onValueChange={setAssignProjectId}>
              <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
              <SelectContent>
                {availableProjects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignProjectOpen(false)}>Cancel</Button>
            <Button
              disabled={!assignProjectId || assignProjectMutation.isPending}
              onClick={() => assignProjectMutation.mutate({
                projectId: Number(assignProjectId),
                teamId: detailTeam!.id,
              })}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create / Edit Team Dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen || !!editTeam} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTeam(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTeam ? "Edit Team" : "New Team"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Team Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. QA Squad A"
              />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.department} onValueChange={(v) => setForm((f) => ({ ...f, department: v }))}>
                <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditTeam(null); }}>Cancel</Button>
            <Button
              disabled={!form.name || !form.department || createMutation.isPending || editMutation.isPending}
              onClick={() => {
                if (editTeam) {
                  editMutation.mutate({ id: editTeam.id, name: form.name, department: form.department });
                } else {
                  createMutation.mutate({ name: form.name, department: form.department });
                }
              }}
            >
              {editTeam ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTeam} onOpenChange={(o) => { if (!o) setDeleteTeam(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTeam?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the team and all its member and project assignments. Users are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTeam && deleteMutation.mutate(deleteTeam.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
