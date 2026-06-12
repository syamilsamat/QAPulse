import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  FileSpreadsheet,
  Edit,
  Trash2,
  Settings,
  ListPlus,
  Loader2,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  fetchExecutionFiles,
  createExecutionFile,
  deleteExecutionFile,
  updateExecutionFile,
  fetchModules,
  addModule,
  deleteModule,
  fetchUsers,
  updateModule,
  type ExecutionFile,
  type ExecutionModule,
  type ExecutionUser,
} from "@/lib/execution-api";

export default function TestCasesExecution() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<ExecutionFile[]>([]);
  const [modules, setModules] = useState<ExecutionModule[]>([]);
  const [qaUsers, setQaUsers] = useState<ExecutionUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);

  const [fileForm, setFileForm] = useState({
    redmineTicketId: "",
    title: "",
    qaPic: "",
    remarks: "",
    selectedModules: [] as number[],
  });
  const [newModule, setNewModule] = useState("");

  // Module Management State
  const [moduleSearch, setModuleSearch] = useState("");
  const [modulePage, setModulePage] = useState(1);
  const [editingModule, setEditingModule] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // LOAD DATA ON MOUNT
  useEffect(() => {
    Promise.all([fetchExecutionFiles(), fetchModules(), fetchUsers()])
      .then(([filesData, modulesData, usersData]) => {
        setFiles(filesData);
        setModules(modulesData);
        setQaUsers(usersData);
      })
      .catch(() =>
        toast({
          variant: "destructive",
          title: "Failed to load data from server",
        }),
      )
      .finally(() => setIsLoading(false));
  }, [toast]);

  const handleCreateFile = async () => {
    if (!fileForm.redmineTicketId.trim()) return;
    try {
      const selectedModuleNames = fileForm.selectedModules
        .map((id) => modules.find((m) => m.id === id)?.name)
        .filter(Boolean)
        .join(",");
      const newFile = await createExecutionFile({
        redmineTicketId: fileForm.redmineTicketId.trim(),
        title: fileForm.title,
        qaPic: fileForm.qaPic,
        remarks: fileForm.remarks,
        selectedModules: selectedModuleNames || undefined,
      });
      setFiles([newFile, ...files]);
      setNewFileOpen(false);
      setFileForm({ redmineTicketId: "", title: "", qaPic: "", remarks: "", selectedModules: [] });
      toast({ title: `File created successfully` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create file. Ticket ID might exist.",
      });
    }
  };

  const handleDeleteFile = async (id: number) => {
    try {
      await deleteExecutionFile(id);
      setFiles(files.filter((f) => f.id !== id));
      toast({ title: "Execution file deleted" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete file" });
    }
  };

  const handleAddModule = async () => {
    if (!newModule.trim()) return;
    try {
      const mod = await addModule(newModule.trim());
      setModules([...modules, mod]);
      setNewModule("");
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to add module" });
    }
  };

  const handleUpdateModule = async () => {
    if (!editingModule || !editingModule.name.trim()) return;
    try {
      const updated = await updateModule(
        editingModule.id,
        editingModule.name.trim(),
      );
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

      // Handle edge case where deleting the last item on a page leaves the page empty
      const remainingFiltered = modules.filter(
        (m) =>
          m.id !== id &&
          m.name.toLowerCase().includes(moduleSearch.toLowerCase()),
      );
      const newTotalPages =
        Math.ceil(remainingFiltered.length / itemsPerPage) || 1;
      if (modulePage > newTotalPages) {
        setModulePage(newTotalPages);
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete module" });
    }
  };

  const filteredFiles = files.filter(
    (f) =>
      f.redmineTicketId.includes(search) ||
      f.title?.toLowerCase().includes(search.toLowerCase()),
  );

  // Module Pagination & Filter Logic
  const itemsPerPage = 10;
  const filteredModules = modules.filter((m) =>
    m.name.toLowerCase().includes(moduleSearch.toLowerCase()),
  );
  const totalPages = Math.ceil(filteredModules.length / itemsPerPage) || 1;
  const paginatedModules = filteredModules.slice(
    (modulePage - 1) * itemsPerPage,
    modulePage * itemsPerPage,
  );

  if (isLoading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-primary" /> Execution
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">Manage test case files.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setModulesOpen(true)}
            className="gap-2"
          >
            <Settings className="w-4 h-4" /> Manage Modules
          </Button>
          <Button onClick={() => setNewFileOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New File
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <CardTitle className="text-lg">Saved Execution Files</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search Ticket ID or Title..."
                className="pl-8 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {/* UPDATED: Added border classes to create vertical lines between columns */}
          <Table className="border-collapse border border-border min-w-[800px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="border-r border-border">
                  Ticket ID
                </TableHead>
                <TableHead className="border-r border-border">Title</TableHead>
                <TableHead className="border-r border-border">QA PIC</TableHead>
                <TableHead className="border-r border-border">
                  Last Modified
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((f) => (
                <TableRow key={f.id} className="border-b border-border">
                  <TableCell className="border-r border-border font-bold text-primary">
                    {f.redmineTicketId}.xlsx
                  </TableCell>
                  <TableCell className="border-r border-border">
                    {f.title || "—"}
                  </TableCell>
                  <TableCell className="border-r border-border">
                    {f.qaPic || "—"}
                  </TableCell>
                  <TableCell className="border-r border-border text-muted-foreground">
                    {format(new Date(f.updatedAt), "dd MMM yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setLocation(
                            `/test-cases/execution/${f.redmineTicketId}`,
                          )
                        }
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="w-4 h-4 mr-2" /> Open Spreadsheet
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFile(f.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredFiles.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-6 text-muted-foreground"
                  >
                    No files found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* NEW FILE DIALOG */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Execution File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>
                Redmine Ticket ID <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. 38032"
                value={fileForm.redmineTicketId}
                onChange={(e) =>
                  setFileForm({ ...fileForm, redmineTicketId: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={fileForm.title}
                onChange={(e) =>
                  setFileForm({ ...fileForm, title: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>QA PIC</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={fileForm.qaPic}
                onChange={(e) =>
                  setFileForm({ ...fileForm, qaPic: e.target.value })
                }
              >
                <option value="">Select QA PIC...</option>
                {qaUsers.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Modules</Label>
              <div className="border rounded-md p-2 max-h-[160px] overflow-y-auto space-y-1">
                {modules.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No modules available.
                  </p>
                ) : (
                  modules.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={fileForm.selectedModules.includes(m.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFileForm({
                              ...fileForm,
                              selectedModules: [...fileForm.selectedModules, m.id],
                            });
                          } else {
                            setFileForm({
                              ...fileForm,
                              selectedModules: fileForm.selectedModules.filter(
                                (id) => id !== m.id,
                              ),
                            });
                          }
                        }}
                      />
                      {m.name}
                    </label>
                  ))
                )}
              </div>
              {fileForm.selectedModules.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {fileForm.selectedModules.length} module(s) selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="ghost"
              onClick={() => setNewFileOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile} className="w-full sm:w-auto">
              Create File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MANAGE MODULES DIALOG */}
      <Dialog
        open={modulesOpen}
        onOpenChange={(open) => {
          setModulesOpen(open);
          if (!open) {
            setEditingModule(null);
            setModuleSearch("");
            setModulePage(1);
          }
        }}
      >
        {/* UPDATED: Mobile friendly width and padding */}
        <DialogContent className="w-[95vw] sm:max-w-[500px] p-4 sm:p-6 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Reusable Modules</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 flex flex-col overflow-hidden">
            {/* Add New Module - Stacked on Mobile */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="New Module Name..."
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddModule()}
                className="w-full"
              />
              <Button
                onClick={handleAddModule}
                className="w-full sm:w-auto shrink-0"
              >
                <ListPlus className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>

            {/* Search Modules */}
            <div className="relative shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search modules..."
                className="pl-8 h-9 w-full"
                value={moduleSearch}
                onChange={(e) => {
                  setModuleSearch(e.target.value);
                  setModulePage(1);
                }}
              />
            </div>

            {/* Modules List */}
            <div className="border rounded-md p-2 flex flex-col overflow-y-auto flex-1 min-h-[300px]">
              <div className="flex-1 space-y-1">
                {paginatedModules.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    No modules found.
                  </div>
                ) : (
                  paginatedModules.map((mod, idx) => {
                    const displayNumber =
                      (modulePage - 1) * itemsPerPage + idx + 1;
                    const isEditing = editingModule?.id === mod.id;

                    return (
                      <div
                        key={mod.id}
                        className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-md group gap-2"
                      >
                        {/* Display Number & Name/Edit Input */}
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground w-5 sm:w-6 text-right shrink-0">
                              {displayNumber}.
                            </span>
                            <Input
                              className="h-8 w-full min-w-[120px]"
                              value={editingModule.name}
                              onChange={(e) =>
                                setEditingModule({
                                  ...editingModule,
                                  name: e.target.value,
                                })
                              }
                              onKeyDown={(e) =>
                                e.key === "Enter" && handleUpdateModule()
                              }
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center gap-2 overflow-hidden">
                            <span className="text-sm font-medium text-muted-foreground w-5 sm:w-6 text-right shrink-0">
                              {displayNumber}.
                            </span>
                            <span
                              className="text-sm font-medium truncate"
                              title={mod.name}
                            >
                              {mod.name}
                            </span>
                          </div>
                        )}

                        {/* Actions (Edit/Save/Delete/Cancel) */}
                        {/* UPDATED: opacity-100 on mobile, hover reveal on sm screens and up */}
                        <div className="flex items-center gap-1 shrink-0">
                          {isEditing ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                                onClick={handleUpdateModule}
                              >
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => setEditingModule(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                onClick={() =>
                                  setEditingModule({
                                    id: mod.id,
                                    name: mod.name,
                                  })
                                }
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemoveModule(mod.id)}
                              >
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

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t mt-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    Page {modulePage} of {totalPages}
                  </span>
                  <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 flex-1 sm:flex-none"
                      disabled={modulePage === 1}
                      onClick={() => setModulePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 flex-1 sm:flex-none"
                      disabled={modulePage === totalPages}
                      onClick={() =>
                        setModulePage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
