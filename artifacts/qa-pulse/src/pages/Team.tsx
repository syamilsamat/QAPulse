import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUsers, getListUsersQueryKey,
  getUser, getGetUserQueryKey,
  getUserStats, getGetUserStatsQueryKey,
  useCreateUser, useUpdateUser,
  type User, type UserInput
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Search, CheckCircle2, Clock, AlertCircle, TestTube } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  qa_member: "QA Member",
  qa_lead: "QA Lead",
  admin: "Admin",
};
const ROLE_COLORS: Record<string, string> = {
  qa_member: "bg-slate-100 text-slate-700",
  qa_lead: "bg-blue-100 text-blue-700",
  admin: "bg-purple-100 text-purple-700",
};

export default function Team() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<UserInput>>({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  const { data: selectedUserStats } = useQuery({
    queryKey: getGetUserStatsQueryKey(selectedUserId ?? 0),
    queryFn: () => getUserStats(selectedUserId!),
    enabled: selectedUserId !== null,
  });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDialogOpen(false);
        setForm({});
        toast({ title: "User created" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to create user" }),
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDialogOpen(false);
        setEditingUser(null);
        toast({ title: "User updated" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to update user" }),
    },
  });

  const filtered = users.filter((u) => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm({ role: "qa_member" });
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({ name: u.name, email: u.email, role: u.role, team: u.team ?? undefined });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.email) return;
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: form as any });
    } else {
      createMutation.mutate({ data: { ...form, password: "password123" } as UserInput });
    }
  };

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" /> Team
          </h1>
          <p className="text-muted-foreground mt-1">Manage team members and view performance</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Member
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search team members..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="qa_member">QA Member</SelectItem>
            <SelectItem value="qa_lead">QA Lead</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((u) => (
            <Card key={u.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedUserId(u.id)}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="w-12 h-12 border">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                      {u.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold truncate">{u.name}</p>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0"
                          onClick={(e) => { e.stopPropagation(); openEdit(u); }}>
                          Edit
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      {u.team && <span className="text-xs text-muted-foreground">{u.team}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={selectedUserId !== null} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader className="pb-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16 border-2">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                      {selectedUser.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-xl">{selectedUser.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${ROLE_COLORS[selectedUser.role]}`}>
                      {ROLE_LABELS[selectedUser.role]}
                    </span>
                  </div>
                </div>
              </SheetHeader>

              {selectedUserStats && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <Card><CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{selectedUserStats.tasksCompleted}</div>
                      <div className="text-xs text-muted-foreground">Tasks Done</div>
                    </CardContent></Card>
                    <Card><CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{selectedUserStats.tasksPending}</div>
                      <div className="text-xs text-muted-foreground">In Progress</div>
                    </CardContent></Card>
                    <Card><CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-red-600">{selectedUserStats.tasksBlocked}</div>
                      <div className="text-xs text-muted-foreground">Blocked</div>
                    </CardContent></Card>
                    <Card><CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold">{selectedUserStats.testCasesCreated}</div>
                      <div className="text-xs text-muted-foreground">Test Cases</div>
                    </CardContent></Card>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">On-time rate</span>
                      <span className="font-medium">{selectedUserStats.onTimeRate}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${selectedUserStats.onTimeRate}%` }} />
                    </div>
                  </div>

                  {(selectedUserStats.recentActivity?.length ?? 0) > 0 && (
                    <div>
                      <h3 className="font-medium mb-3">Recent Activity</h3>
                      <div className="space-y-2">
                        {selectedUserStats.recentActivity?.slice(0, 5).map((a: any) => (
                          <div key={a.id} className="text-sm p-2 rounded bg-muted/50">
                            <p className="text-foreground">{a.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(a.createdAt), "MMM d, h:mm a")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Edit Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input placeholder="Jane Doe" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="jane@company.com" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role ?? "qa_member"} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qa_member">QA Member</SelectItem>
                    <SelectItem value="qa_lead">QA Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input placeholder="e.g. Mobile QA" value={form.team ?? ""} onChange={(e) => setForm({ ...form, team: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.email || createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingUser ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
