import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listRequirements,
  getListRequirementsQueryKey,
  useUpdateRequirement,
  useDeleteRequirement,
  listTestCases,
  getListTestCasesQueryKey,
  listTasks,
  getListTasksQueryKey,
  listUsers,
  getListUsersQueryKey,
} from "@workspace/api-client-react";

// Contexts & Utils
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";
import { format } from "date-fns";

// UI Components
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Icons
import {
  Search,
  FileText,
  TestTube,
  CheckSquare,
  Users,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Key,
} from "lucide-react";

type EntityType = "requirement" | "test_case" | "task" | "user";

type SearchResult = {
  type: EntityType;
  id: number;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  meta?: string;
  originalData: Record<string, any>; // Keeps reference for editing
};

export default function AdminSearch() {
  const [query, setQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token, user: currentUser } = useAuth();

  // Dialog States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  // Queries
  const { data: requirements = [] } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const { data: testCases = [] } = useQuery({
    queryKey: getListTestCasesQueryKey(),
    queryFn: () => listTestCases(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: getListTasksQueryKey(),
    queryFn: () => listTasks(),
  });

  const { data: users = [] } = useQuery({
    queryKey: getListUsersQueryKey(),
    queryFn: () => listUsers(),
  });

  // Helper for generic fetch mutations
  const apiFetch = async (endpoint: string, method: string, data?: any) => {
    const res = await fetch(`${getApiUrl()}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      let errorMessage = `Failed to ${method} data`;

      if (Array.isArray(errData)) {
        errorMessage = errData
          .map((e) => `${e.path?.join(".") || "Field"}: ${e.message}`)
          .join(", ");
      } else if (errData?.error) {
        errorMessage = errData.error;
      } else if (errData?.message) {
        errorMessage = errData.message;
      }

      throw new Error(errorMessage);
    }

    if (res.status === 204) return null;
    return res.json();
  };

  const handleSuccess = (queryKey: string[], message: string) => {
    queryClient.invalidateQueries({ queryKey });
    setDeleteDialogOpen(false);
    setEditDialogOpen(false);
    setResetDialogOpen(false);
    setSelectedItem(null);
    toast({ title: message });
  };

  const handleError = (error: any) => {
    toast({
      variant: "destructive",
      title: "Action failed",
      description: error?.message || "An unexpected error occurred",
    });
  };

  // --- MUTATIONS ---

  // 1. Requirements
  const reqUpdate = useUpdateRequirement({
    mutation: {
      onSuccess: () =>
        handleSuccess(getListRequirementsQueryKey(), "Requirement updated"),
      onError: handleError,
    },
  });

  const reqDelete = useDeleteRequirement({
    mutation: {
      onSuccess: () =>
        handleSuccess(getListRequirementsQueryKey(), "Requirement deleted"),
      onError: handleError,
    },
  });

  // 2. Test Cases
  const tcUpdate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/test-cases/${id}`, "PATCH", data),
    onSuccess: () =>
      handleSuccess(getListTestCasesQueryKey(), "Test case updated"),
    onError: handleError,
  });
  const tcDelete = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/test-cases/${id}`, "DELETE"),
    onSuccess: () =>
      handleSuccess(getListTestCasesQueryKey(), "Test case deleted"),
    onError: handleError,
  });

  // 3. Tasks
  const taskUpdate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/tasks/${id}`, "PATCH", data),
    onSuccess: () => handleSuccess(getListTasksQueryKey(), "Task updated"),
    onError: handleError,
  });
  const taskDelete = useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch(`/tasks/${id}`, "DELETE"),
    onSuccess: () => handleSuccess(getListTasksQueryKey(), "Task deleted"),
    onError: handleError,
  });

  // 4. Users
  const userUpdate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/users/${id}`, "PATCH", data),
    onSuccess: () => handleSuccess(getListUsersQueryKey(), "User updated"),
    onError: handleError,
  });
  const userDelete = useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch(`/users/${id}`, "DELETE"),
    onSuccess: () => handleSuccess(getListUsersQueryKey(), "User deleted"),
    onError: handleError,
  });
  const userResetPassword = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiFetch(`/users/${id}`, "PATCH", { password: "password123" }), // Adjust endpoint if your backend uses a dedicated route like `/users/${id}/reset-password`
    onSuccess: () =>
      handleSuccess(getListUsersQueryKey(), "Password reset to password123"),
    onError: handleError,
  });

  const isPending =
    reqUpdate.isPending ||
    reqDelete.isPending ||
    tcUpdate.isPending ||
    tcDelete.isPending ||
    taskUpdate.isPending ||
    taskDelete.isPending ||
    userUpdate.isPending ||
    userDelete.isPending ||
    userResetPassword.isPending;

  // --- ACTION HANDLERS ---

  const openEdit = (item: SearchResult) => {
    setSelectedItem(item);
    setEditForm({ ...item.originalData });
    setEditDialogOpen(true);
  };

  const openDelete = (item: SearchResult) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  const openResetPassword = (item: SearchResult) => {
    setSelectedItem(item);
    setResetDialogOpen(true);
  };

  const executeDelete = () => {
    if (!selectedItem) return;
    const { id, type } = selectedItem;

    if (type === "requirement") reqDelete.mutate({ id });
    if (type === "test_case") tcDelete.mutate({ id });
    if (type === "task") taskDelete.mutate({ id });
    if (type === "user") userDelete.mutate({ id });
  };

  const executeResetPassword = () => {
    if (!selectedItem || selectedItem.type !== "user") return;
    userResetPassword.mutate({ id: selectedItem.id });
  };

  const executeUpdate = () => {
    if (!selectedItem) return;
    const { id, type } = selectedItem;

    const payload: Record<string, any> = {};

    if (type === "user") {
      if (editForm.name) payload.name = editForm.name;
      if (editForm.email) payload.email = editForm.email;
    } else if (type === "task") {
      if (editForm.name) payload.name = editForm.name;
      if (editForm.notes) payload.notes = editForm.notes;
    } else if (type === "test_case") {
      if (editForm.title) payload.title = editForm.title;
      if (editForm.objective) payload.objective = editForm.objective;
    } else if (type === "requirement") {
      if (editForm.title) payload.title = editForm.title;
      if (editForm.description) payload.description = editForm.description;
    }

    if (type === "requirement") reqUpdate.mutate({ id, data: payload as any });
    if (type === "test_case") tcUpdate.mutate({ id, data: payload });
    if (type === "task") taskUpdate.mutate({ id, data: payload });
    if (type === "user") userUpdate.mutate({ id, data: payload });
  };

  // --- SEARCH LOGIC ---

  const results: SearchResult[] = [];

  if (query.trim().length >= 2) {
    const q = query.toLowerCase();

    requirements
      .filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.module ?? "").toLowerCase().includes(q)
      )
      .forEach((r) =>
        results.push({
          type: "requirement",
          id: r.id,
          title: r.title,
          subtitle: r.projectName ?? undefined,
          badge: r.status?.replace("_", " "),
          badgeColor: "bg-slate-100 text-slate-700",
          meta: r.priority,
          originalData: r,
        })
      );

    testCases
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.objective ?? "").toLowerCase().includes(q)
      )
      .forEach((t) =>
        results.push({
          type: "test_case",
          id: t.id,
          title: t.title,
          subtitle: t.projectName ?? undefined,
          badge: t.type?.replace("_", " "),
          badgeColor: "bg-blue-100 text-blue-700",
          meta: t.priority,
          originalData: t,
        })
      );

    tasks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.notes ?? "").toLowerCase().includes(q)
      )
      .forEach((t) =>
        results.push({
          type: "task",
          id: t.id,
          title: t.name,
          subtitle: t.assigneeName ?? undefined,
          badge: t.status?.replace("_", " "),
          badgeColor: "bg-green-100 text-green-700",
          meta: t.dueDate
            ? `Due ${format(new Date(t.dueDate), "MMM d")}`
            : undefined,
          originalData: t,
        })
      );

    users
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.team ?? "").toLowerCase().includes(q)
      )
      .forEach((u) =>
        results.push({
          type: "user",
          id: u.id,
          title: u.name,
          subtitle: u.email,
          badge: u.role?.replace("_", " "),
          badgeColor: "bg-purple-100 text-purple-700",
          meta: u.team ?? undefined,
          originalData: u,
        })
      );
  }

  const typeIcons: Record<string, React.ReactNode> = {
    requirement: <FileText className="w-4 h-4 text-blue-500" />,
    test_case: <TestTube className="w-4 h-4 text-emerald-500" />,
    task: <CheckSquare className="w-4 h-4 text-orange-500" />,
    user: <Users className="w-4 h-4 text-purple-500" />,
  };

  const typeLabels: Record<string, string> = {
    requirement: "Requirement",
    test_case: "Test Case",
    task: "Task",
    user: "User",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Search className="w-7 h-7 text-primary" /> Admin Search
        </h1>
        <p className="text-muted-foreground mt-1">
          Search, update, and manage all records directly
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          className="pl-12 h-12 text-base"
          placeholder="Search everything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {query.length > 0 && query.length < 2 && (
        <p className="text-sm text-muted-foreground text-center">
          Type at least 2 characters to search
        </p>
      )}

      {query.length >= 2 && (
        <>
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">
                No results for "{query}"
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {results.length} result{results.length !== 1 ? "s" : ""} for "
                {query}"
              </p>
              {results.map((r, i) => {
                // Prevent an admin from editing or deleting another admin
                const isAnotherAdmin = 
                  r.type === "user" && 
                  r.originalData.role === "admin" && 
                  r.id !== currentUser?.id;

                return (
                  <Card
                    key={`${r.type}-${r.id}-${i}`}
                    className="hover:shadow-sm transition-shadow"
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-md bg-muted flex-shrink-0">
                        {typeIcons[r.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {typeLabels[r.type]}
                          </span>
                          {r.badge && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.badgeColor}`}
                            >
                              {r.badge}
                            </span>
                          )}
                        </div>
                        <p className="font-medium mt-0.5 truncate">{r.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {r.subtitle && (
                            <span className="text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          )}
                          {r.meta && (
                            <span className="text-xs text-muted-foreground">
                              · {r.meta}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Menu */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          #{r.id}
                        </span>
                        {!isAnotherAdmin && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(r)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              {r.type === "user" && (
                                <DropdownMenuItem onClick={() => openResetPassword(r)}>
                                  <Key className="w-4 h-4 mr-2" /> Reset Password
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => openDelete(r)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Default Dashboard Metrics */}
      {!query && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <Card className="text-center">
            <CardContent className="p-5">
              <FileText className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <div className="text-2xl font-bold">{requirements.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Requirements
              </div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <TestTube className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
              <div className="text-2xl font-bold">{testCases.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Test Cases
              </div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <CheckSquare className="w-8 h-8 mx-auto mb-2 text-orange-500" />
              <div className="text-2xl font-bold">{tasks.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Tasks</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-5">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <div className="text-2xl font-bold">{users.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Users</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this{" "}
              {selectedItem?.type?.replace("_", " ")}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the password for{" "}
              <span className="font-semibold text-foreground">
                {selectedItem?.title}
              </span>
              ? Their password will be permanently changed to{" "}
              <span className="font-mono bg-muted px-1 rounded">
                password123
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={executeResetPassword} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generic Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Edit {selectedItem?.type?.replace("_", " ")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {selectedItem?.type === "user"
                  ? "Name"
                  : selectedItem?.type === "task"
                  ? "Task Name"
                  : "Title"}
              </Label>
              <Input
                value={editForm.title || editForm.name || ""}
                onChange={(e) => {
                  const key =
                    selectedItem?.type === "task" ||
                    selectedItem?.type === "user"
                      ? "name"
                      : "title";
                  setEditForm({ ...editForm, [key]: e.target.value });
                }}
              />
            </div>

            {selectedItem?.type !== "user" && (
              <div className="space-y-2">
                <Label>Description / Notes</Label>
                <Input
                  value={
                    editForm.description ||
                    editForm.notes ||
                    editForm.objective ||
                    ""
                  }
                  onChange={(e) => {
                    const key =
                      selectedItem?.type === "task"
                        ? "notes"
                        : selectedItem?.type === "test_case"
                        ? "objective"
                        : "description";
                    setEditForm({ ...editForm, [key]: e.target.value });
                  }}
                />
              </div>
            )}

            {selectedItem?.type === "user" && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={executeUpdate} disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}