import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProjects,
  getListProjectsQueryKey,
  useCreateProject,
} from "@workspace/api-client-react";
import {
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
} from "@/components/ui/dialog";
import {
  FolderPlus,
  Settings,
  Search,
  ListPlus,
  Edit,
  Trash2,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus // <--- ADDED MISSING IMPORT HERE
} from "lucide-react";

export default function ModuleAndProject() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- Project State ---
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", status: "active" });

  // Fetch Projects to display in the list
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: getListProjectsQueryKey(),
    queryFn: () => listProjects(),
  });

  const createProjectMutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setProjectDialogOpen(false);
        setProjectForm({ name: "", description: "", status: "active" });
        toast({ title: "Project created" });
      },
    },
  });

  const handleCreateProject = () => {
    if (!projectForm.name.trim()) {
      toast({ variant: "destructive", title: "Project name is required" });
      return;
    }
    createProjectMutation.mutate({ data: projectForm as any });
  };

  // --- Module State ---
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [newModule, setNewModule] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [modulePage, setModulePage] = useState(1);
  const [editingModule, setEditingModule] = useState<{ id: number; name: string; } | null>(null);

  useEffect(() => {
    fetchModules()
      .then((data) => setModules(data))
      .catch(() => toast({ variant: "destructive", title: "Failed to load modules" }))
      .finally(() => setModulesLoading(false));
  }, [toast]);

  const handleAddModule = async () => {
    if (!newModule.trim()) return;
    try {
      const mod = await addModule(newModule.trim());
      setModules([...modules, mod]);
      setNewModule("");
      toast({ title: "Module added successfully" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to add module" });
    }
  };

  const handleUpdateModule = async () => {
    if (!editingModule || !editingModule.name.trim()) return;
    try {
      const updated = await updateModule(editingModule.id, editingModule.name.trim());
      setModules(modules.map((m) => (m.id === updated.id ? updated : m)));
      setEditingModule(null);
      toast({ title: "Module updated successfully" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to update module" });
    }
  };

  const handleRemoveModule = async (id: number) => {
    try {
      await deleteModule(id);
      setModules(modules.filter((m) => m.id !== id));

      // Handle pagination boundary adjustment
      const remainingFiltered = modules.filter(
        (m) => m.id !== id && m.name.toLowerCase().includes(moduleSearch.toLowerCase())
      );
      const newTotalPages = Math.ceil(remainingFiltered.length / itemsPerPage) || 1;
      if (modulePage > newTotalPages) setModulePage(newTotalPages);

      toast({ title: "Module deleted" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete module" });
    }
  };

  // Module Pagination Logic
  const itemsPerPage = 10;
  const filteredModules = modules.filter((m) =>
    m.name.toLowerCase().includes(moduleSearch.toLowerCase())
  );
  const totalPages = Math.ceil(filteredModules.length / itemsPerPage) || 1;
  const paginatedModules = filteredModules.slice(
    (modulePage - 1) * itemsPerPage,
    modulePage * itemsPerPage
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="w-7 h-7 text-primary" /> System Configurations
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage system modules and project workspaces centrally.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === PROJECTS SECTION === */}
        <Card className="flex flex-col h-[600px] border-border shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-primary" /> Projects
                </CardTitle>
                <CardDescription className="mt-1">
                  Manage your team's project workspaces
                </CardDescription>
              </div>
              <Button onClick={() => setProjectDialogOpen(true)} size="sm" className="shrink-0">
                <Plus className="w-4 h-4 mr-1 hidden sm:block" /> New Project
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5">
            {projectsLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg bg-card">
                No projects found.
              </div>
            ) : (
              projects.map((p: any) => (
                <div key={p.id} className="p-4 border rounded-lg hover:border-primary/50 transition-colors bg-card shadow-sm">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-semibold">{p.name}</h3>
                      {p.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium shrink-0 ${p.status === 'active' ? 'bg-green-100 text-green-700' : p.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                      {p.status?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* === MODULES SECTION === */}
        <Card className="flex flex-col h-[600px] border-border shadow-sm">
          <CardHeader className="border-b bg-muted/20 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Manage Modules
            </CardTitle>
            <CardDescription className="mt-1">
              Create and manage reusable test case modules
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-4 overflow-hidden gap-4">
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Input
                placeholder="New Module Name..."
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddModule()}
                className="w-full"
              />
              <Button onClick={handleAddModule} className="w-full sm:w-auto shrink-0">
                <ListPlus className="w-4 h-4 mr-2" /> Add Module
              </Button>
            </div>

            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search modules..."
                className="pl-9"
                value={moduleSearch}
                onChange={(e) => {
                  setModuleSearch(e.target.value);
                  setModulePage(1);
                }}
              />
            </div>

            <div className="border rounded-lg p-2 flex flex-col overflow-y-auto flex-1 bg-card shadow-inner">
              <div className="flex-1 space-y-1">
                {modulesLoading ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">Loading modules...</div>
                ) : paginatedModules.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    No modules found.
                  </div>
                ) : (
                  paginatedModules.map((mod, idx) => {
                    const displayNumber = (modulePage - 1) * itemsPerPage + idx + 1;
                    const isEditing = editingModule?.id === mod.id;

                    return (
                      <div key={mod.id} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-md group gap-2 border border-transparent hover:border-border transition-colors">
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground w-5 sm:w-6 text-right shrink-0">{displayNumber}.</span>
                            <Input
                              className="h-8 w-full min-w-[120px]"
                              value={editingModule.name}
                              onChange={(e) => setEditingModule({ ...editingModule, name: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && handleUpdateModule()}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 overflow-hidden">
                            <span className="text-sm font-medium text-muted-foreground w-5 sm:w-6 text-right shrink-0">{displayNumber}.</span>
                            <span className="text-sm font-medium truncate" title={mod.name}>{mod.name}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1 shrink-0">
                          {isEditing ? (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100" onClick={handleUpdateModule}>
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setEditingModule(null)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={() => setEditingModule({ id: mod.id, name: mod.name })}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveModule(mod.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t mt-3 shrink-0">
                  <span className="text-xs text-muted-foreground">Page {modulePage} of {totalPages}</span>
                  <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <Button variant="outline" size="sm" className="h-8 px-3" disabled={modulePage === 1} onClick={() => setModulePage((p) => Math.max(1, p - 1))}>
                      <ChevronLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 px-3" disabled={modulePage === totalPages} onClick={() => setModulePage((p) => Math.min(totalPages, p + 1))}>
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === PROJECT CREATION DIALOG === */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" /> New Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Mobile App v2" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What is this project about?" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={projectForm.status} onValueChange={(v) => setProjectForm({ ...projectForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 sm:mt-0">
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleCreateProject} disabled={createProjectMutation.isPending} className="w-full sm:w-auto">
              {createProjectMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}