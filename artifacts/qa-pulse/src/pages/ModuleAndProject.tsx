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
} from "@/lib/execution-api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
} from "lucide-react";

type ProjectFormState = {
  name: string;
  description: string;
  status: string;
};

export default function ModuleAndProject() {
  const { toast } = useToast();
  const itemsPerPage = 10;

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
          <Columns3Cog className="w-7 h-7 text-primary" />Project & Module Config
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage system modules and project workspaces centrally.
        </p>
      </div>

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