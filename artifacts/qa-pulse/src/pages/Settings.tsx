import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateUser, useCreateUser, useChangePassword,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Settings as SettingsIcon, User, Shield, Bell, Upload, Lock, UserPlus, Eye, EyeOff,
} from "lucide-react";

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

  // Profile
  const [name, setName] = useState(user?.name ?? "");
  const [team, setTeam] = useState(user?.team ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarData, setAvatarData] = useState<string | null>(null);

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Create member (admin/lead)
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("qa_member");
  const [memberTeam, setMemberTeam] = useState("");
  const [memberPw, setMemberPw] = useState("password123");

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

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: `Team member ${memberName} created. They can log in with the temporary password.` });
        setMemberName(""); setMemberEmail(""); setMemberRole("qa_member"); setMemberTeam(""); setMemberPw("password123");
      },
      onError: () => toast({ variant: "destructive", title: "Failed to create team member" }),
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

  const handleCreateMember = () => {
    if (!memberName.trim() || !memberEmail.trim() || !memberPw.trim()) {
      toast({ variant: "destructive", title: "Name, email, and password are required" });
      return;
    }
    createMutation.mutate({
      data: {
        name: memberName.trim(),
        email: memberEmail.trim(),
        password: memberPw,
        role: memberRole as any,
        team: memberTeam.trim() || undefined,
      } as any,
    });
  };

  const canManageTeam = user?.role === "admin" || user?.role === "qa_lead";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-primary" /> Settings
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

          <Button
            onClick={handleSave}
            disabled={!name.trim() || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
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
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm new password</Label>
            <Input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
            />
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

      {/* Create Team Member — admin/lead only */}
      {canManageTeam && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4" /> Add Team Member
            </CardTitle>
            <CardDescription>
              Create a new account. They will be prompted to change their password on first login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="jane@company.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={memberRole} onValueChange={setMemberRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qa_member">QA Member</SelectItem>
                    <SelectItem value="qa_lead">QA Lead</SelectItem>
                    {user?.role === "admin" && <SelectItem value="admin">Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Input
                  value={memberTeam}
                  onChange={(e) => setMemberTeam(e.target.value)}
                  placeholder="e.g. Mobile QA"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password <span className="text-destructive">*</span></Label>
              <Input
                value={memberPw}
                onChange={(e) => setMemberPw(e.target.value)}
                placeholder="Temporary password"
              />
              <p className="text-xs text-muted-foreground">
                They'll be asked to change this on first login
              </p>
            </div>
            <Button
              onClick={handleCreateMember}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {createMutation.isPending ? "Creating..." : "Create Member"}
            </Button>
          </CardContent>
        </Card>
      )}

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
