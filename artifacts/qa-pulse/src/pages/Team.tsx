import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import {
  listUsers,
  getListUsersQueryKey,
  getUser,
  getGetUserQueryKey,
  getUserStats,
  getGetUserStatsQueryKey,
  useCreateUser,
  useUpdateUser,
  type User,
  type UserInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Users,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  TestTube,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = {
  qa_member: "QA Member",
  qa_lead: "QA Lead",
  admin: "Admin",
  pmo: "PMO",
};
const ROLE_COLORS: Record<string, string> = {
  qa_member:  "bg-slate-100 text-slate-700",
  qa_lead:    "bg-blue-100 text-blue-700",
  admin:      "bg-purple-100 text-purple-700",
  pmo:        "bg-emerald-100 text-emerald-700",
};

const COLOR_PALETTE = [
  "bg-rose-100 text-rose-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-lime-100 text-lime-700",
  "bg-green-100 text-green-700",
  "bg-teal-100 text-teal-700",
  "bg-cyan-100 text-cyan-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-pink-100 text-pink-700",
  "bg-violet-100 text-violet-700",
  "bg-red-100 text-red-700",
  "bg-yellow-100 text-yellow-700",
];

function hashRole(role: string): number {
  let h = 0;
  for (let i = 0; i < role.length; i++) {
    h = (Math.imul(31, h) + role.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function formatRoleLabel(role: string) {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function getRoleColor(role: string) {
  return ROLE_COLORS[role] ?? COLOR_PALETTE[hashRole(role) % COLOR_PALETTE.length];
}

export default function Team() {
  const { user: currentUser, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<UserInput>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

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
      onError: () =>
        toast({ variant: "destructive", title: "Failed to create user" }),
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
      onError: () =>
        toast({ variant: "destructive", title: "Failed to update user" }),
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`${getApiUrl()}/users/${id}/active`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setEditingUser(updated);
      toast({ title: updated.isActive ? "Member activated" : "Member deactivated" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${getApiUrl()}/users/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to delete member");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setDeleteConfirmOpen(false);
      setDeletingUser(null);
      setDialogOpen(false);
      setSelectedUserId(null);
      toast({ title: "Member deleted" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const filtered = users.filter((u) => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (
      search &&
      !u.name.toLowerCase().includes(search.toLowerCase()) &&
      !u.email.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm({ role: "qa_member" });
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      team: u.team ?? undefined,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.email) return;
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: form as any });
    } else {
      createMutation.mutate({
        data: { ...form, password: "password123" } as UserInput,
      });
    }
  };

  const selectedUser = selectedUserId
    ? users.find((u) => u.id === selectedUserId)
    : null;
  const isAdmin = currentUser?.role === "admin";

  const { data: dbRoles = [] } = useQuery<{ id: number; name: string; description: string | null }[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/roles`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const roleLabelMap: Record<string, string> = Object.fromEntries(
    dbRoles.map((r) => [r.name, r.description || formatRoleLabel(r.name)])
  );

  const roleOptions = (
    dbRoles.length > 0
      ? dbRoles.filter((r) => r.name !== "pmo")
      : [{ name: "qa_member", description: "QA Member" }, { name: "qa_lead", description: "QA Lead" }, { name: "admin", description: "Admin" }]
  ).map((r) => ({ value: r.name, label: r.description || formatRoleLabel(r.name) }));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" /> Team
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage team members and view performance
          </p>
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
          <Input
            className="pl-9"
            placeholder="Search team members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SearchableSelect
          value={filterRole}
          onValueChange={setFilterRole}
          options={[{ value: "all", label: "All Roles" }, ...roleOptions]}
          placeholder="Role"
          searchPlaceholder="Search role..."
          className="w-40"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((u) => {
            const isAnotherAdmin =
              u.role === "admin" && u.id !== currentUser?.id;
            const canEdit = isAdmin && !isAnotherAdmin;

            return (
              <Card
                key={u.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedUserId(u.id)}
              >
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
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(u);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {u.email}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleColor(u.role)}`}
                        >
                          {roleLabelMap[u.role] || formatRoleLabel(u.role)}
                        </span>
                        {u.isActive === false && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500">
                            Inactive
                          </span>
                        )}
                        {u.team && (
                          <span className="text-xs text-muted-foreground">
                            {u.team}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet
        open={selectedUserId !== null}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
      >
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
                    <SheetTitle className="text-xl">
                      {selectedUser.name}
                    </SheetTitle>
                    <p className="text-sm text-muted-foreground">
                      {selectedUser.email}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${getRoleColor(selectedUser.role)}`}
                    >
                      {roleLabelMap[selectedUser.role] || formatRoleLabel(selectedUser.role)}
                    </span>
                  </div>
                </div>
              </SheetHeader>

              {selectedUserStats && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {selectedUserStats.tasksCompleted}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Tasks Done
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600">
                          {selectedUserStats.tasksPending}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          In Progress
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                          {selectedUserStats.tasksBlocked}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Blocked
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold">
                          {selectedUserStats.testCasesCreated}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Test Cases
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        On-time rate
                      </span>
                      <span className="font-medium">
                        {selectedUserStats.onTimeRate}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${selectedUserStats.onTimeRate}%` }}
                      />
                    </div>
                  </div>

                  {(selectedUserStats.recentActivity?.length ?? 0) > 0 && (
                    <div>
                      <h3 className="font-medium mb-3">Recent Activity</h3>
                      <div className="space-y-2">
                        {selectedUserStats.recentActivity
                          ?.slice(0, 5)
                          .map((a: any) => (
                            <div
                              key={a.id}
                              className="text-sm p-2 rounded bg-muted/50"
                            >
                              <p className="text-foreground">{a.description}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {format(new Date(a.createdAt), "MMM d, h:mm a")}
                              </p>
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
            <DialogTitle>
              {editingUser ? "Edit Member" : "Add Team Member"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                placeholder="Jane Doe"
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="jane@company.com"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <SearchableSelect
                  value={form.role ?? "qa_member"}
                  onValueChange={(v) => setForm({ ...form, role: v as any })}
                  options={roleOptions}
                  searchPlaceholder="Search role..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input
                  placeholder="e.g. Mobile QA"
                  value={form.team ?? ""}
                  onChange={(e) => setForm({ ...form, team: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-row items-center gap-2">
            {editingUser && (
              <>
                <Button
                  variant={editingUser.isActive === false ? "default" : "outline"}
                  className={editingUser.isActive === false ? "mr-auto bg-green-600 hover:bg-green-700 text-white" : "mr-auto text-orange-600 border-orange-300 hover:bg-orange-50"}
                  disabled={toggleActiveMutation.isPending}
                  onClick={() => toggleActiveMutation.mutate({ id: editingUser.id, isActive: editingUser.isActive === false })}
                >
                  {toggleActiveMutation.isPending ? "Saving..." : editingUser.isActive === false ? "Activate" : "Set Inactive"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => { setDeletingUser(editingUser); setDeleteConfirmOpen(true); }}
                >
                  Delete
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !form.name ||
                !form.email ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingUser
                  ? "Save Changes"
                  : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deletingUser?.name}</strong> from QA Pulse. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deletingUser && deleteMutation.mutate(deletingUser.id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
