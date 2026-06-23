import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, Pencil, Trash2, Users, Lock, KeyRound } from "lucide-react";
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
  userCount: number;
  createdAt: string;
}

const NAV_PERMISSION_ITEMS = [
  { key: "nav:requirements",   label: "Requirements" },
  { key: "nav:test-cases",     label: "Test Cases" },
  { key: "nav:tasks",          label: "Tasks" },
  { key: "nav:ai-hub",         label: "AI Hub" },
  { key: "nav:report",         label: "Report" },
  { key: "nav:inbox",          label: "Inbox" },
  { key: "nav:team",           label: "Team" },
  { key: "nav:admin-search",   label: "Admin Search" },
  { key: "nav:team-hangouts",  label: "Team Hangouts" },
  { key: "nav:configurations", label: "Configuration" },
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

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

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
    mutationFn: async (data: { name: string; description: string }) => {
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
    mutationFn: async (data: { id: number; name: string; description: string }) => {
      const res = await fetch(`${getApiUrl()}/roles/${data.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ name: data.name, description: data.description }),
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
    setCreateOpen(true);
  }

  function openEdit(role: Role) {
    setFormName(role.name);
    setFormDesc(role.description ?? "");
    setEditRole(role);
  }

  function handleCreate() {
    if (!formName.trim()) return;
    createMutation.mutate({ name: formName.trim(), description: formDesc.trim() });
  }

  function handleUpdate() {
    if (!editRole || !formName.trim()) return;
    updateMutation.mutate({ id: editRole.id, name: formName.trim(), description: formDesc.trim() });
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
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          New Role
        </Button>
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
                  <TableHead>Role Name</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead className="text-center w-28">Users</TableHead>
                  <TableHead className="text-center w-24">Type</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {role.isSystem && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        {role.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {role.description ?? <span className="italic">No description</span>}
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
    </div>
  );
}
