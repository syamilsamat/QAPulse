import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateUser, useChangePassword,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  CircleUser, User, Shield, Bell, Upload, Lock, Eye, EyeOff,
  RefreshCw, Bug, Save, BookOpen, Plus, Pencil, Trash2, Check, XIcon,
  LayoutList, Table2, PanelLeft,
} from "lucide-react";

interface DocRegEntry {
  id: number;
  projectName: string;
  moduleName: string;
  tracker: string;
  refNo: string;
}

interface RedmineProject {
  id: number;
  redmineId: number;
  name: string;
  identifier: string;
}

interface RedmineProjectConfig {
  id: number;
  redmineProjectId: number;
  complexityFieldId: number | null;
  targetedStartDateFieldId: number | null;
  targetedCompletionDateFieldId: number | null;
}

const ROLE_LABELS: Record<string, string> = {
  qa_member: "QA Member",
  qa_lead: "QA Lead",
  admin: "Admin",
};

export default function Settings() {
  const { user, login, token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Execution view preference
  const execViewKey = user ? `qa_pulse_exec_view_${user.id}` : null;
  const [execView, setExecView] = useState<"tree" | "spreadsheet" | "focus">(() => {
    if (!user) return "tree";
    return (localStorage.getItem(`qa_pulse_exec_view_${user.id}`) as "tree" | "spreadsheet" | "focus") ?? "tree";
  });
  const handleExecViewChange = (v: "tree" | "spreadsheet" | "focus") => {
    setExecView(v);
    if (execViewKey) localStorage.setItem(execViewKey, v);
  };

  // Profile
  const [name, setName] = useState(user?.name ?? "");
  const [team, setTeam] = useState(user?.team ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarData, setAvatarData] = useState<string | null>(null);

  // Redmine API Key (per user)
  const [redmineApiKey, setRedmineApiKey] = useState((user as any)?.redmineApiKey ?? "");
  const [showRedmineKey, setShowRedmineKey] = useState(false);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);


  // Redmine Integration (QA Lead / admin)
  const [redmineProjects, setRedmineProjects] = useState<RedmineProject[]>([]);
  const [configForm, setConfigForm] = useState({ complexityFieldId: "", targetedStartDateFieldId: "", targetedCompletionDateFieldId: "" });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Document Register
  const [docRegEntries, setDocRegEntries] = useState<DocRegEntry[]>([]);
  const emptyDocReg = { projectName: "", moduleName: "", tracker: "CR", refNo: "" };
  const [docRegForm, setDocRegForm] = useState(emptyDocReg);
  const [editingDocRegId, setEditingDocRegId] = useState<number | null>(null);
  const [showDocRegForm, setShowDocRegForm] = useState(false);
  const [isSavingDocReg, setIsSavingDocReg] = useState(false);

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: (updated) => {
        if (token) login(updated, token);
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "Profile updated successfully" });
        setAvatarData(null);
      },
      onError: () => toast({ variant: "destructive", title: "Failed to update profile" }),
    },
  });

  const changePasswordMutation = useChangePassword({
    mutation: {
      onSuccess: () => {
        toast({ title: "Password changed successfully" });
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      },
      onError: () => toast({ variant: "destructive", title: "Failed to change password. Check your current password." }),
    },
  });


  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Image too large", description: "Please choose an image under 2MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
      setAvatarData(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!user || !name.trim()) return;
    updateMutation.mutate({
      id: user.id,
      data: {
        name: name.trim(),
        team: team.trim() || undefined,
        avatarUrl: avatarData ?? user.avatarUrl ?? undefined,
      },
    });
  };

  const handleChangePassword = () => {
    if (!user) return;
    if (newPw.length < 6) {
      toast({ variant: "destructive", title: "New password must be at least 6 characters" });
      return;
    }
    if (newPw !== confirmPw) {
      toast({ variant: "destructive", title: "Passwords do not match" });
      return;
    }
    changePasswordMutation.mutate({
      data: { userId: user.id, currentPassword: currentPw, newPassword: newPw },
    });
  };

  const isLeadOrAdmin = user?.role === "admin" || user?.role === "qa_lead";

  useEffect(() => {
    if (!isLeadOrAdmin) return;
    fetch("/api/redmine/projects")
      .then((r) => r.json())
      .then((data: RedmineProject[]) => setRedmineProjects(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/redmine/global-config")
      .then((r) => r.json())
      .then((data: RedmineProjectConfig | null) => {
        if (!data) return;
        setConfigForm({
          complexityFieldId: data.complexityFieldId?.toString() ?? "",
          targetedStartDateFieldId: data.targetedStartDateFieldId?.toString() ?? "",
          targetedCompletionDateFieldId: data.targetedCompletionDateFieldId?.toString() ?? "",
        });
      })
      .catch(() => {});
  }, [isLeadOrAdmin]);

  useEffect(() => {
    fetch("/api/document-register")
      .then((r) => r.json())
      .then((data) => setDocRegEntries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSaveDocReg = async () => {
    if (!docRegForm.projectName || !docRegForm.moduleName || !docRegForm.refNo) return;
    setIsSavingDocReg(true);
    try {
      const url = editingDocRegId ? `/api/document-register/${editingDocRegId}` : "/api/document-register";
      const method = editingDocRegId ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(docRegForm) });
      const saved = await r.json();
      if (editingDocRegId) {
        setDocRegEntries((prev) => prev.map((e) => (e.id === editingDocRegId ? saved : e)));
      } else {
        setDocRegEntries((prev) => [...prev, saved]);
      }
      setDocRegForm(emptyDocReg);
      setEditingDocRegId(null);
      setShowDocRegForm(false);
      toast({ title: "Document register saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save entry" });
    } finally {
      setIsSavingDocReg(false);
    }
  };

  const handleDeleteDocReg = async (id: number) => {
    await fetch(`/api/document-register/${id}`, { method: "DELETE" }).catch(() => {});
    setDocRegEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleEditDocReg = (entry: DocRegEntry) => {
    setDocRegForm({ projectName: entry.projectName, moduleName: entry.moduleName, tracker: entry.tracker, refNo: entry.refNo });
    setEditingDocRegId(entry.id);
    setShowDocRegForm(true);
  };

  const [isSavingRedmineKey, setIsSavingRedmineKey] = useState(false);

  const handleSaveRedmineKey = async () => {
    if (!user) return;
    setIsSavingRedmineKey(true);
    try {
      const res = await fetch(`/api/users/${user.id}/redmine-key`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redmineApiKey: redmineApiKey.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      if (token) login(updated, token);
      setShowRedmineKey(true);
      toast({ title: "Redmine API key saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save Redmine API key" });
    } finally {
      setIsSavingRedmineKey(false);
    }
  };

  const handleSyncProjects = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/redmine/sync-projects", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      toast({ title: `Synced ${data.synced} Redmine projects` });
      const updated = await fetch("/api/redmine/projects").then((r) => r.json());
      setRedmineProjects(Array.isArray(updated) ? updated : []);
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveGlobalConfig = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/redmine/global-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexityFieldId: configForm.complexityFieldId ? Number(configForm.complexityFieldId) : null,
          targetedStartDateFieldId: configForm.targetedStartDateFieldId ? Number(configForm.targetedStartDateFieldId) : null,
          targetedCompletionDateFieldId: configForm.targetedCompletionDateFieldId ? Number(configForm.targetedCompletionDateFieldId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: "Custom field config saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CircleUser className="w-7 h-7 text-primary" /> Account
        </h1>
        <p className="text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" /> Profile
          </CardTitle>
          <CardDescription>Update your personal information and profile picture</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar upload */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <Avatar className="w-20 h-20 border-2 border-border">
                <AvatarImage src={avatarPreview ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                  {user?.name?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Upload className="w-5 h-5 text-white" />
              </button>
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.name}</p>
              <p className="text-sm text-muted-foreground mb-2">{user?.email}</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Change photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {avatarData && (
                <p className="text-xs text-primary mt-1">New photo selected — save to apply</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Max 2MB · JPG, PNG, GIF, WebP</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Mobile QA, Web QA" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Bug className="w-3.5 h-3.5" /> Redmine API Key
            </Label>
            <div className="relative">
              <Input
                type={showRedmineKey ? "text" : "password"}
                value={redmineApiKey}
                onChange={(e) => setRedmineApiKey(e.target.value)}
                placeholder="Leave blank to use system default"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowRedmineKey((v) => !v)}
              >
                {showRedmineKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used when creating or searching Redmine issues. Falls back to the system default key if empty.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!name.trim() || updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveRedmineKey}
              disabled={isSavingRedmineKey}
            >
              {isSavingRedmineKey ? "Saving..." : "Save Redmine Key"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4" /> Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Current password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>New password</Label>
            <div className="relative">
              <Input
                type={showNewPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 6 characters"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNewPw(v => !v)}
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <div className="relative">
              <Input
                type={showConfirmPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirmPw(v => !v)}
              >
                {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={!currentPw || !newPw || !confirmPw || changePasswordMutation.isPending}
            variant="secondary"
          >
            {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Role & Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="w-4 h-4" /> Role & Permissions
          </CardTitle>
          <CardDescription>Your current access level in QA Pulse</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Shield className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="font-medium">{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</p>
              <p className="text-xs text-muted-foreground">
                {user?.role === "admin" && "Full access to all features including user management and admin search"}
                {user?.role === "qa_lead" && "Can manage team members, requirements, test cases, and all tasks"}
                {user?.role === "qa_member" && "Can view requirements, create and manage test cases and assigned tasks"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Contact an admin to change your role</p>
        </CardContent>
      </Card>

      {/* Team Members section has moved to Configuration > Team Members tab */}

      {/* Redmine Integration moved to Project & Module Config page */}
      {false && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="w-4 h-4" /> Redmine Integration
            </CardTitle>
            <CardDescription>
              Sync Redmine projects and configure custom field IDs per project for defect creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleSyncProjects}
                disabled={isSyncing}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Redmine Projects"}
              </Button>
              {redmineProjects.length > 0 && (
                <span className="text-xs text-muted-foreground">{redmineProjects.length} projects cached</span>
              )}
            </div>

            <Separator />
            <div className="space-y-3">
              <Label>Custom Field IDs</Label>
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Enter the numeric custom field IDs from your Redmine admin panel
                  (Admin → Custom fields). These apply to all projects.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Complexity Field ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 2"
                      value={configForm.complexityFieldId}
                      onChange={(e) => setConfigForm((f) => ({ ...f, complexityFieldId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Targeted Start Date Field ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 12"
                      value={configForm.targetedStartDateFieldId}
                      onChange={(e) => setConfigForm((f) => ({ ...f, targetedStartDateFieldId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Targeted Completion Date Field ID</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 13"
                      value={configForm.targetedCompletionDateFieldId}
                      onChange={(e) => setConfigForm((f) => ({ ...f, targetedCompletionDateFieldId: e.target.value }))}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handleSaveGlobalConfig}
                  disabled={isSavingConfig}
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingConfig ? "Saving..." : "Save Config"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutList className="w-4 h-4" /> Preferences
          </CardTitle>
          <CardDescription>Personalise how QA Pulse looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Execution file view</Label>
            <p className="text-xs text-muted-foreground mb-3">Choose how test cases are displayed inside an execution file</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleExecViewChange("tree")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${execView === "tree" ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                <LayoutList className="w-4 h-4" />
                Tree view
              </button>
              <button
                onClick={() => handleExecViewChange("focus")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${execView === "focus" ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                <PanelLeft className="w-4 h-4" />
                Focus mode
              </button>
              <button
                onClick={() => handleExecViewChange("spreadsheet")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm transition-colors ${execView === "spreadsheet" ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                <Table2 className="w-4 h-4" />
                Spreadsheet view
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4" /> About QA Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>QA Pulse is an internal QA management and analytics platform designed to streamline your testing workflows.</p>
            <p className="text-xs mt-3">Version 1.0.0</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
