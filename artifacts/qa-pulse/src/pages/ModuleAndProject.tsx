import { useState, useEffect, useMemo } from "react";
import { Columns3Cog } from 'lucide-react';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
  type ExecutionProject,
  fetchModules,
  addModule,
  deleteModule,
  updateModule,
  type ExecutionModule,
  syncTrackersFromRedmine,

} from "@/lib/execution-api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  Edit2,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Box,
  Layers,
  AlertTriangle,
  Bug,
  RefreshCw,
  Save,
  ChevronsUpDown,
  Users,
  UserPlus,
  Mail,
  BookOpen,
  Pencil,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

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

type ProjectFormState = {
  name: string;
  description: string;
  status: string;
};

interface ContactRow {
  id: number;
  fullName: string;
  email: string;
  source: string;
  isGroup: boolean;
  redmineId?: number | null;
}

interface DocRegEntry {
  id: number;
  projectName: string;
  moduleName: string;
  tracker: string;
  refNo: string;
}

export default function ModuleAndProject() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isLeadOrAdmin = user?.role === "admin" || user?.role === "qa_lead";
  const itemsPerPage = 10;
  const qc = useQueryClient();

  // =========================
  // DOCUMENT REGISTER STATE
  // =========================
  const [docRegEntries, setDocRegEntries] = useState<DocRegEntry[]>([]);
  const emptyDocReg = { projectName: "", moduleName: "", tracker: "", refNo: "" };
  const [docRegForm, setDocRegForm] = useState(emptyDocReg);
  const [editingDocRegId, setEditingDocRegId] = useState<number | null>(null);
  const [showDocRegForm, setShowDocRegForm] = useState(false);
  const [isSavingDocReg, setIsSavingDocReg] = useState(false);

  useEffect(() => {
    fetch(`${getApiUrl()}/document-register`)
      .then((r) => r.json())
      .then((data) => setDocRegEntries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSaveDocReg = async () => {
    if (!docRegForm.projectName || !docRegForm.moduleName || !docRegForm.refNo) return;
    setIsSavingDocReg(true);
    try {
      const url = editingDocRegId ? `${getApiUrl()}/document-register/${editingDocRegId}` : `${getApiUrl()}/document-register`;
      const method = editingDocRegId ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(docRegForm) });
      const saved = await r.json();
      if (!r.ok) throw new Error(saved?.error ?? `HTTP ${r.status}`);
      if (editingDocRegId) {
        setDocRegEntries((prev) => prev.map((e) => (e.id === editingDocRegId ? saved : e)));
      } else {
        setDocRegEntries((prev) => [...prev, saved]);
      }
      setDocRegForm(emptyDocReg);
      setEditingDocRegId(null);
      setShowDocRegForm(false);
      toast({ title: "Document register saved" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save entry", description: err?.message ?? String(err) });
    } finally {
      setIsSavingDocReg(false);
    }
  };

  const handleDeleteDocReg = async (id: number) => {
    await fetch(`${getApiUrl()}/document-register/${id}`, { method: "DELETE" }).catch(() => {});
    setDocRegEntries((prev) => prev.filter((e) => e.id !== id));
    toast({ title: "Entry deleted" });
  };

  const handleEditDocReg = (entry: DocRegEntry) => {
    setDocRegForm({ projectName: entry.projectName, moduleName: entry.moduleName, tracker: entry.tracker, refNo: entry.refNo });
    setEditingDocRegId(entry.id);
    setShowDocRegForm(true);
  };

  // =========================
  // REDMINE INTEGRATION STATE
  // =========================
  const [redmineProjects, setRedmineProjects] = useState<RedmineProject[]>([]);
  const [configForm, setConfigForm] = useState({ complexityFieldId: "", targetedStartDateFieldId: "", targetedCompletionDateFieldId: "" });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingTrackers, setIsSyncingTrackers] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

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

  const handleSyncTrackers = async () => {
    setIsSyncingTrackers(true);
    try {
      const synced = await syncTrackersFromRedmine();
      toast({ title: `Synced ${synced.length} trackers from Redmine` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Tracker sync failed", description: err.message });
    } finally {
      setIsSyncingTrackers(false);
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

  // =========================
  // PROJECT STATE
  // =========================
  const [projects, setProjects] = useState<ExecutionProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    name: "",
    description: "",
    status: "active",
  });
  const [projectSearch, setProjectSearch] = useState("");
  const [projectPage, setProjectPage] = useState(1);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [editingProject, setEditingProject] = useState<{
    id: number;
    name: string;
    description: string;
    status: string;
  } | null>(null);

  // Deletion State
  const [projectToDelete, setProjectToDelete] = useState<{ id: number; name: string } | null>(null);
  const [projectDeleting, setProjectDeleting] = useState(false);

  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const data = await fetchProjects();
      setProjects(data);
    } catch {
      toast({ variant: "destructive", title: "Failed to load projects" });
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!projectForm.name.trim()) return;
    try {
      setProjectSubmitting(true);
      await createProject({
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        status: projectForm.status,
      });
      await loadProjects();
      setProjectDialogOpen(false);
      setProjectForm({ name: "", description: "", status: "active" });
      toast({ title: "Project created" });
    } catch {
      toast({ variant: "destructive", title: "Failed to create project" });
    } finally {
      setProjectSubmitting(false);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !editingProject.name.trim()) return;
    try {
      const updated = await updateProject(editingProject.id, {
        name: editingProject.name.trim(),
        description: editingProject.description.trim(),
        status: editingProject.status,
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setEditingProject(null);
      toast({ title: "Project updated" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update project" });
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      setProjectDeleting(true);
      await deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      toast({ title: "Project deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete project" });
    } finally {
      setProjectDeleting(false);
      setProjectToDelete(null);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) =>
      `${p.name} ${p.description ?? ""} ${p.status ?? ""}`
        .toLowerCase()
        .includes(projectSearch.toLowerCase())
    );
  }, [projects, projectSearch]);

  const totalProjectPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;
  const paginatedProjects = showAllProjects
    ? filteredProjects
    : filteredProjects.slice(
        (projectPage - 1) * itemsPerPage,
        projectPage * itemsPerPage
      );

  // =========================
  // MODULE STATE
  // =========================
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [newModule, setNewModule] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [modulePage, setModulePage] = useState(1);
  const [showAllModules, setShowAllModules] = useState(false);
  const [editingModule, setEditingModule] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Deletion State
  const [moduleToDelete, setModuleToDelete] = useState<{ id: number; name: string } | null>(null);
  const [moduleDeleting, setModuleDeleting] = useState(false);

  useEffect(() => {
    fetchModules()
      .then((data) => setModules(data))
      .catch(() =>
        toast({ variant: "destructive", title: "Failed to load modules" })
      )
      .finally(() => setModulesLoading(false));
  }, [toast]);

  const handleAddModule = async () => {
    if (!newModule.trim()) return;
    try {
      const mod = await addModule(newModule.trim());
      setModules((prev) => [mod, ...prev]); 
      setNewModule("");
      toast({ title: "Module added" });
    } catch {
      toast({ variant: "destructive", title: "Failed to add module" });
    }
  };

  const handleUpdateModule = async () => {
    if (!editingModule || !editingModule.name.trim()) return;
    try {
      const updated = await updateModule(
        editingModule.id,
        editingModule.name.trim()
      );
      setModules((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      setEditingModule(null);
      toast({ title: "Module updated" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update module" });
    }
  };

  const confirmDeleteModule = async () => {
    if (!moduleToDelete) return;
    try {
      setModuleDeleting(true);
      await deleteModule(moduleToDelete.id);
      setModules((prev) => prev.filter((m) => m.id !== moduleToDelete.id));
      toast({ title: "Module deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete module" });
    } finally {
      setModuleDeleting(false);
      setModuleToDelete(null);
    }
  };

  const filteredModules = useMemo(() => {
    return modules.filter((m) =>
      m.name.toLowerCase().includes(moduleSearch.toLowerCase())
    );
  }, [modules, moduleSearch]);

  const totalModulePages = Math.ceil(filteredModules.length / itemsPerPage) || 1;
  const paginatedModules = showAllModules
    ? filteredModules
    : filteredModules.slice(
        (modulePage - 1) * itemsPerPage,
        modulePage * itemsPerPage
      );

  // =========================
  // CONTACTS STATE
  // =========================
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [contactForm, setContactForm] = useState({ fullName: "", email: "", isGroup: false });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ContactRow | null>(null);
  const [contactDeleting, setContactDeleting] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/contacts`);
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    } catch {
      toast({ variant: "destructive", title: "Failed to load contacts" });
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    if (isLeadOrAdmin) loadContacts();
  }, [isLeadOrAdmin]);

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    try {
      const res = await fetch(`${getApiUrl()}/contacts/sync-redmine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: user?.redmineApiKey ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      const descriptions: string[] = [];
      if (data.source === "api") descriptions.push("Used Redmine REST API (DB was unreachable)");
      if (data.nameOnly) descriptions.push("Non-admin key: names only synced — edit contacts to add emails");
      toast({ title: `Synced ${data.synced} contacts from Redmine`, description: descriptions.join(". ") || undefined });
      await loadContacts();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Redmine Sync Failed", description: err.message });
    } finally {
      setIsSyncingContacts(false);
    }
  };

  const handleSaveContact = async () => {
    const isNewManual = !editingContact;
    if (!contactForm.fullName.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    if (isNewManual && !contactForm.email.trim()) {
      toast({ variant: "destructive", title: "Email is required" });
      return;
    }
    setContactSubmitting(true);
    try {
      const url = editingContact
        ? `${getApiUrl()}/contacts/${editingContact.id}`
        : `${getApiUrl()}/contacts`;
      const res = await fetch(url, {
        method: editingContact ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast({ title: editingContact ? "Contact updated" : "Contact added" });
      setContactDialogOpen(false);
      setEditingContact(null);
      setContactForm({ fullName: "", email: "", isGroup: false });
      await loadContacts();
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setContactSubmitting(false);
    }
  };

  const confirmDeleteContact = async () => {
    if (!contactToDelete) return;
    setContactDeleting(true);
    try {
      await fetch(`${getApiUrl()}/contacts/${contactToDelete.id}`, { method: "DELETE" });
      toast({ title: "Contact deleted" });
      setContacts((prev) => prev.filter((c) => c.id !== contactToDelete.id));
    } catch {
      toast({ variant: "destructive", title: "Failed to delete contact" });
    } finally {
      setContactDeleting(false);
      setContactToDelete(null);
    }
  };

  // =========================
  // TEAM MEMBERS STATE
  // =========================
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("qa_member");
  const [memberTeam, setMemberTeam] = useState("");
  const [memberPw, setMemberPw] = useState("password123");

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

  // =========================
  // RENDER HELPERS
  // =========================
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-500";
      case "on_hold":
        return "bg-amber-500";
      case "inactive":
        return "bg-slate-400";
      default:
        return "bg-slate-300";
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Columns3Cog className="w-7 h-7 text-primary" />Configuration
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage system configuration, contacts, and project workspaces.
        </p>
      </div>

      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList>
          <TabsTrigger value="projects" className="gap-2">
            <Box className="w-4 h-4" /> Projects &amp; Modules
          </TabsTrigger>
          {isLeadOrAdmin && (
            <TabsTrigger value="redmine" className="gap-2">
              <Bug className="w-4 h-4" /> Redmine Integration
            </TabsTrigger>
          )}
          {isLeadOrAdmin && (
            <TabsTrigger value="contacts" className="gap-2">
              <Mail className="w-4 h-4" /> Contacts
            </TabsTrigger>
          )}
          {isLeadOrAdmin && (
            <TabsTrigger value="team" className="gap-2">
              <Users className="w-4 h-4" /> Team Members
            </TabsTrigger>
          )}
          <TabsTrigger value="doc-register" className="gap-2">
            <BookOpen className="w-4 h-4" /> Document Register
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* === PROJECTS SECTION === */}
        <Card className="flex flex-col h-[650px] shadow-none border-border/60 bg-background/50">
          <CardHeader className="border-b px-6 py-5">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg font-medium">
                <Box className="w-5 h-5 text-muted-foreground" />
                Projects
              </CardTitle>
              <Button
                onClick={() => setProjectDialogOpen(true)}
                size="sm"
                variant="outline"
                className="h-8 shadow-none"
              >
                <Plus className="w-4 h-4 mr-1.5" /> New Project
              </Button>
            </div>
          </CardHeader>

          <div className="px-6 py-4 border-b bg-muted/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <Input
                placeholder="Search projects..."
                className="pl-9 h-9 shadow-none border-border/50 bg-background"
                value={projectSearch}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setProjectPage(1);
                }}
              />
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto p-0">
            {projectsLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Loading projects...
              </div>
            ) : paginatedProjects.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No projects found.
              </div>
            ) : (
              <div className="flex flex-col">
                {paginatedProjects.map((p) => {
                  const isEditing = editingProject?.id === p.id;
                  const isGreyedOut = p.status === "inactive" || p.status === "on_hold";

                  return (
                    <div
                      key={p.id}
                      className={`group flex flex-col justify-center px-6 py-4 border-b last:border-0 hover:bg-muted/30 transition-all ${
                        isGreyedOut ? "opacity-50 hover:opacity-100" : ""
                      }`}
                    >
                      {isEditing ? (
                        <div className="space-y-3 w-full animate-in fade-in zoom-in-95 duration-200">
                          <Input
                            value={editingProject.name}
                            onChange={(e) =>
                              setEditingProject({ ...editingProject, name: e.target.value })
                            }
                            className="h-8 font-medium shadow-none"
                            placeholder="Project name"
                            autoFocus
                          />
                          <Textarea
                            value={editingProject.description}
                            onChange={(e) =>
                              setEditingProject({ ...editingProject, description: e.target.value })
                            }
                            className="text-sm shadow-none resize-none"
                            placeholder="Description (optional)"
                            rows={2}
                          />
                          <div className="flex items-center justify-between">
                            <SearchableSelect
                              value={editingProject.status}
                              onValueChange={(v) => setEditingProject({ ...editingProject, status: v })}
                              options={[
                                { value: "active", label: "Active" },
                                { value: "on_hold", label: "On Hold" },
                                { value: "inactive", label: "Inactive" },
                              ]}
                              searchPlaceholder="Search..."
                              className="w-[140px] h-8 text-xs"
                            />
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingProject(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={handleUpdateProject}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4 w-full">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-medium text-foreground truncate">
                                {p.name}
                              </h3>
                              <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-muted/50 border border-border/50">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${getStatusColor(p.status)}`}
                                />
                                <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                                  {p.status?.replace("_", " ")}
                                </span>
                              </div>
                            </div>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {p.description}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setEditingProject({
                                  id: p.id,
                                  name: p.name ?? "",
                                  description: p.description ?? "",
                                  status: p.status ?? "active",
                                })
                              }
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setProjectToDelete({ id: p.id, name: p.name })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>

          <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/10">
            <span className="text-xs text-muted-foreground">
              {showAllProjects
                ? `All ${filteredProjects.length} items`
                : `${filteredProjects.length === 0 ? 0 : (projectPage - 1) * itemsPerPage + 1}-${Math.min(projectPage * itemsPerPage, filteredProjects.length)} of ${filteredProjects.length}`}
            </span>
            <div className="flex items-center gap-1.5">
              {!showAllProjects && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={projectPage === 1}
                    onClick={() => setProjectPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={projectPage === totalProjectPages || filteredProjects.length === 0}
                    onClick={() => setProjectPage((p) => Math.min(totalProjectPages, p + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                variant="link"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground px-2 h-7"
                onClick={() => {
                  setShowAllProjects(!showAllProjects);
                  setProjectPage(1);
                }}
              >
                {showAllProjects ? "Paginate" : "View All"}
              </Button>
            </div>
          </div>
        </Card>

        {/* === MODULES SECTION === */}
        <Card className="flex flex-col h-[650px] shadow-none border-border/60 bg-background/50">
          <CardHeader className="border-b px-6 py-5">
            <CardTitle className="flex items-center gap-2 text-lg font-medium">
              <Layers className="w-5 h-5 text-muted-foreground" />
              Modules
            </CardTitle>
          </CardHeader>

          <div className="px-6 py-4 border-b bg-muted/10 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <Input
                placeholder="Search modules..."
                className="pl-9 h-9 shadow-none border-border/50 bg-background"
                value={moduleSearch}
                onChange={(e) => {
                  setModuleSearch(e.target.value);
                  setModulePage(1);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New module name..."
                className="h-9 shadow-none border-border/50"
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddModule()}
              />
              <Button
                onClick={handleAddModule}
                size="sm"
                variant="secondary"
                className="h-9 px-4 shrink-0 shadow-none"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add
              </Button>
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto p-0">
            {modulesLoading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Loading modules...
              </div>
            ) : paginatedModules.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No modules found.
              </div>
            ) : (
              <div className="flex flex-col">
                {paginatedModules.map((mod) => {
                  const isEditing = editingModule?.id === mod.id;

                  return (
                    <div
                      key={mod.id}
                      className="group flex items-center justify-between px-6 py-3.5 border-b last:border-0 hover:bg-muted/30 transition-colors min-h-[60px]"
                    >
                      {isEditing ? (
                        <div className="flex flex-1 items-center gap-2 animate-in fade-in duration-200">
                          <Input
                            className="h-8 w-full shadow-none"
                            value={editingModule.name}
                            onChange={(e) =>
                              setEditingModule({ ...editingModule, name: e.target.value })
                            }
                            onKeyDown={(e) => e.key === "Enter" && handleUpdateModule()}
                            autoFocus
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingModule(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={handleUpdateModule}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium text-foreground truncate">
                            {mod.name}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingModule({ id: mod.id, name: mod.name })}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setModuleToDelete({ id: mod.id, name: mod.name })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>

          <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/10">
            <span className="text-xs text-muted-foreground">
              {showAllModules
                ? `All ${filteredModules.length} items`
                : `${filteredModules.length === 0 ? 0 : (modulePage - 1) * itemsPerPage + 1}-${Math.min(modulePage * itemsPerPage, filteredModules.length)} of ${filteredModules.length}`}
            </span>
            <div className="flex items-center gap-1.5">
              {!showAllModules && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={modulePage === 1}
                    onClick={() => setModulePage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={modulePage === totalModulePages || filteredModules.length === 0}
                    onClick={() => setModulePage((p) => Math.min(totalModulePages, p + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button
                variant="link"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground px-2 h-7"
                onClick={() => {
                  setShowAllModules(!showAllModules);
                  setModulePage(1);
                }}
              >
                {showAllModules ? "Paginate" : "View All"}
              </Button>
            </div>
          </div>
        </Card>
        </div>
        </TabsContent>

        {/* === REDMINE INTEGRATION TAB === */}
        {isLeadOrAdmin && (
          <TabsContent value="redmine">
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
              <Button variant="outline" className="gap-2" onClick={handleSyncProjects} disabled={isSyncing}>
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Redmine Projects"}
              </Button>
              {redmineProjects.length > 0 && (
                <span className="text-xs text-muted-foreground">{redmineProjects.length} projects cached</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2" onClick={handleSyncContacts} disabled={isSyncingContacts}>
                <RefreshCw className={`w-4 h-4 ${isSyncingContacts ? "animate-spin" : ""}`} />
                {isSyncingContacts ? "Syncing..." : "Sync Redmine Contact"}
              </Button>
              <span className="text-xs text-muted-foreground">Requires a Redmine administrator API key</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2" onClick={handleSyncTrackers} disabled={isSyncingTrackers}>
                <RefreshCw className={`w-4 h-4 ${isSyncingTrackers ? "animate-spin" : ""}`} />
                {isSyncingTrackers ? "Syncing..." : "Sync Redmine Trackers"}
              </Button>
              <span className="text-xs text-muted-foreground">Populates the Tracker dropdown across all dialogs</span>
            </div>

            <Separator />
            <div className="space-y-3">
              <Label>Custom Field IDs</Label>
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Enter the numeric custom field IDs from your Redmine admin panel (Admin → Custom fields). These apply to all projects.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Complexity Field ID</Label>
                    <Input type="number" placeholder="e.g. 2" value={configForm.complexityFieldId} onChange={(e) => setConfigForm((f) => ({ ...f, complexityFieldId: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Targeted Start Date Field ID</Label>
                    <Input type="number" placeholder="e.g. 12" value={configForm.targetedStartDateFieldId} onChange={(e) => setConfigForm((f) => ({ ...f, targetedStartDateFieldId: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Targeted Completion Date Field ID</Label>
                    <Input type="number" placeholder="e.g. 13" value={configForm.targetedCompletionDateFieldId} onChange={(e) => setConfigForm((f) => ({ ...f, targetedCompletionDateFieldId: e.target.value }))} />
                  </div>
                </div>
                <Button size="sm" className="gap-2" onClick={handleSaveGlobalConfig} disabled={isSavingConfig}>
                  <Save className="w-3.5 h-3.5" />
                  {isSavingConfig ? "Saving..." : "Save Config"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>
        )}

        {/* === CONTACTS TAB === */}
        {isLeadOrAdmin && (
          <TabsContent value="contacts">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mail className="w-4 h-4" /> Contacts
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Manage email contacts for report distribution. Add manually or sync from the Redmine Integration tab.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-2" onClick={() => { setEditingContact(null); setContactForm({ fullName: "", email: "", isGroup: false }); setContactDialogOpen(true); }}>
                      <Plus className="w-4 h-4" /> Add Contact
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {contactsLoading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading contacts...</div>
                ) : contacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                    <Mail className="w-8 h-8 opacity-30" />
                    <p>No contacts yet. Sync from Redmine Integration tab or add manually.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    <div className="px-6 py-3 border-b">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name or email..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          className="pl-9 h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-6 py-3 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      <span>Name</span>
                      <span>Email</span>
                      <span>Source</span>
                      <span></span>
                    </div>
                    {contacts
                      .filter((c) => {
                        const q = contactSearch.toLowerCase();
                        return !q || c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
                      })
                      .map((contact) => (
                        <div key={contact.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 items-center px-6 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{contact.fullName}</span>
                            {contact.isGroup && <Badge variant="outline" className="text-[10px] py-0">Group</Badge>}
                          </div>
                          <span className={`text-sm truncate ${contact.email ? "text-muted-foreground" : "text-muted-foreground/40 italic"}`}>
                            {contact.email || "no email — click edit to add"}
                          </span>
                          <Badge variant={contact.source === "redmine" ? "secondary" : "outline"} className="text-[10px] py-0 shrink-0">
                            {contact.source === "redmine" ? "Redmine" : "Manual"}
                          </Badge>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingContact(contact); setContactForm({ fullName: contact.fullName, email: contact.email, isGroup: contact.isGroup }); setContactDialogOpen(true); }}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setContactToDelete(contact)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    {contacts.length > 0 && contactSearch && contacts.filter((c) => {
                      const q = contactSearch.toLowerCase();
                      return c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
                    }).length === 0 && (
                      <div className="py-8 text-center text-sm text-muted-foreground">No contacts match "{contactSearch}"</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* === TEAM MEMBERS TAB === */}
        {isLeadOrAdmin && (
          <TabsContent value="team">
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
                    <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    <Input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="jane@company.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <SearchableSelect
                      value={memberRole}
                      onValueChange={setMemberRole}
                      options={[
                        { value: "qa_member", label: "QA Member" },
                        { value: "qa_lead", label: "QA Lead" },
                        ...(user?.role === "admin" ? [{ value: "admin", label: "Admin" }] : []),
                      ]}
                      searchPlaceholder="Search role..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Team</Label>
                    <Input value={memberTeam} onChange={(e) => setMemberTeam(e.target.value)} placeholder="e.g. Mobile QA" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Temporary Password <span className="text-destructive">*</span></Label>
                  <Input value={memberPw} onChange={(e) => setMemberPw(e.target.value)} placeholder="Temporary password" />
                  <p className="text-xs text-muted-foreground">They'll be asked to change this on first login</p>
                </div>
                <Button onClick={handleCreateMember} disabled={createMutation.isPending} className="gap-2">
                  <UserPlus className="w-4 h-4" />
                  {createMutation.isPending ? "Creating..." : "Create Member"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="doc-register">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="w-4 h-4" /> Document Register
              </CardTitle>
              <CardDescription>Map Project + Module + Tracker to a Ref No for Excel generation (Doc Info sheet).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {docRegEntries.length > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Project</th>
                        <th className="text-left px-3 py-2 font-medium">Module</th>
                        <th className="text-left px-3 py-2 font-medium">Tracker</th>
                        <th className="text-left px-3 py-2 font-medium">Ref No</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {docRegEntries.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="px-3 py-2">{e.projectName}</td>
                          <td className="px-3 py-2">{e.moduleName}</td>
                          <td className="px-3 py-2">{e.tracker}</td>
                          <td className="px-3 py-2 font-mono text-xs">{e.refNo}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditDocReg(e)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDocReg(e.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {showDocRegForm ? (
                <div className="border rounded-md p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Project</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={docRegForm.projectName}
                        onChange={(e) => setDocRegForm((f) => ({ ...f, projectName: e.target.value }))}
                      >
                        <option value="">Select project...</option>
                        {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Module</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={docRegForm.moduleName}
                        onChange={(e) => setDocRegForm((f) => ({ ...f, moduleName: e.target.value }))}
                      >
                        <option value="">Select module...</option>
                        {modules.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tracker</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={docRegForm.tracker}
                        onChange={(e) => setDocRegForm((f) => ({ ...f, tracker: e.target.value }))}
                      >
                        <option value="">Select tracker...</option>
                        <option value="CR">CR</option>
                        <option value="SIT">SIT</option>
                        <option value="UAT">UAT</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ref No</Label>
                      <Input placeholder="e.g. BSB-QA-FWCMS-153-CRD-V1.0" value={docRegForm.refNo} onChange={(e) => setDocRegForm((f) => ({ ...f, refNo: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5" onClick={handleSaveDocReg} disabled={isSavingDocReg}>
                      <Check className="w-3.5 h-3.5" /> {isSavingDocReg ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setShowDocRegForm(false); setDocRegForm(emptyDocReg); setEditingDocRegId(null); }}>
                      <X className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowDocRegForm(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add Entry
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* === CONTACT ADD/EDIT DIALOG === */}
      <Dialog open={contactDialogOpen} onOpenChange={(v) => !v && setContactDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input value={contactForm.fullName} onChange={(e) => setContactForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>
                Email {!editingContact && <span className="text-destructive">*</span>}
                {editingContact?.source === "redmine" && <span className="text-xs text-muted-foreground ml-1">(optional for Redmine contacts)</span>}
              </Label>
              <Input type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isGroup"
                checked={contactForm.isGroup}
                onCheckedChange={(v) => setContactForm((f) => ({ ...f, isGroup: v === true }))}
              />
              <Label htmlFor="isGroup" className="cursor-pointer">Group / Distribution email</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setContactDialogOpen(false)} disabled={contactSubmitting}>Cancel</Button>
            <Button onClick={handleSaveContact} disabled={contactSubmitting}>
              {contactSubmitting ? "Saving..." : editingContact ? "Save Changes" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === CONTACT DELETE DIALOG === */}
      <Dialog open={!!contactToDelete} onOpenChange={(v) => !v && setContactToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle>Delete Contact</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{contactToDelete?.fullName}</span>? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setContactToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteContact} disabled={contactDeleting}>
              {contactDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === PROJECT CREATION DIALOG === */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md gap-6 border-border/60 shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Name</Label>
              <Input
                placeholder="e.g. Authentication V2"
                value={projectForm.name}
                className="shadow-none"
                onChange={(e) =>
                  setProjectForm({ ...projectForm, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Description</Label>
              <Textarea
                placeholder="Brief project details..."
                value={projectForm.description}
                className="resize-none shadow-none"
                onChange={(e) =>
                  setProjectForm({ ...projectForm, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Status</Label>
              <SearchableSelect
                value={projectForm.status}
                onValueChange={(v) => setProjectForm({ ...projectForm, status: v })}
                options={[
                  { value: "active", label: "Active" },
                  { value: "on_hold", label: "On Hold" },
                  { value: "inactive", label: "Inactive" },
                ]}
                searchPlaceholder="Search..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setProjectDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={projectSubmitting}
              className="w-full sm:w-auto shadow-none"
            >
              {projectSubmitting ? "Saving..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === PROJECT DELETE CONFIRMATION DIALOG === */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <DialogContent className="w-[95vw] sm:w-full max-w-sm gap-6 border-border/60 shadow-lg">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-medium">Delete Project</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{projectToDelete?.name}</span>? 
            This action cannot be undone and may remove associated data.
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="ghost"
              onClick={() => setProjectToDelete(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteProject}
              disabled={projectDeleting}
              className="w-full sm:w-auto shadow-none"
            >
              {projectDeleting ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === MODULE DELETE CONFIRMATION DIALOG === */}
      <Dialog open={!!moduleToDelete} onOpenChange={(open) => !open && setModuleToDelete(null)}>
        <DialogContent className="w-[95vw] sm:w-full max-w-sm gap-6 border-border/60 shadow-lg">
          <DialogHeader className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-medium">Delete Module</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Are you sure you want to delete the module <span className="font-semibold text-foreground">{moduleToDelete?.name}</span>? 
            This action cannot be undone.
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="ghost"
              onClick={() => setModuleToDelete(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteModule}
              disabled={moduleDeleting}
              className="w-full sm:w-auto shadow-none"
            >
              {moduleDeleting ? "Deleting..." : "Delete Module"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}