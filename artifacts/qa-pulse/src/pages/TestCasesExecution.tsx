import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, FileSpreadsheet, Edit, Trash2, Settings, ListPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  fetchExecutionFiles, createExecutionFile, fetchModules, addModule, deleteModule, fetchUsers,
  type ExecutionFile, type ExecutionModule, type ExecutionUser 
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

  const [fileForm, setFileForm] = useState({ redmineTicketId: "", title: "", qaPic: "", remarks: "" });
  const [newModule, setNewModule] = useState("");

  // LOAD DATA ON MOUNT
  useEffect(() => {
    Promise.all([fetchExecutionFiles(), fetchModules(), fetchUsers()])
      .then(([filesData, modulesData, usersData]) => {
        setFiles(filesData);
        setModules(modulesData);
        setQaUsers(usersData);
      })
      .catch(() => toast({ variant: "destructive", title: "Failed to load data from server" }))
      .finally(() => setIsLoading(false));
  }, []);

  const handleCreateFile = async () => {
    if (!fileForm.redmineTicketId.trim()) return;
    try {
      const newFile = await createExecutionFile({
        redmineTicketId: fileForm.redmineTicketId.trim(),
        title: fileForm.title,
        qaPic: fileForm.qaPic,
        remarks: fileForm.remarks,
      });
      setFiles([newFile, ...files]);
      setNewFileOpen(false);
      setFileForm({ redmineTicketId: "", title: "", qaPic: "", remarks: "" });
      toast({ title: `File created successfully` });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to create file. Ticket ID might exist." });
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

  const handleRemoveModule = async (id: number) => {
    try {
      await deleteModule(id);
      setModules(modules.filter(m => m.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete module" });
    }
  };

  const filteredFiles = files.filter(f => 
    f.redmineTicketId.includes(search) || f.title?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-7 h-7 text-primary" /> Execution Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage test case files.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setModulesOpen(true)} className="gap-2"><Settings className="w-4 h-4" /> Manage Modules</Button>
          <Button onClick={() => setNewFileOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> New File</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Saved Execution Files</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search Ticket ID or Title..." className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>QA PIC</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-bold text-primary">{f.redmineTicketId}.xlsx</TableCell>
                  <TableCell>{f.title || "—"}</TableCell>
                  <TableCell>{f.qaPic || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(f.updatedAt), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)} className="text-blue-600 hover:text-blue-800">
                      <Edit className="w-4 h-4 mr-2" /> Open Spreadsheet
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* NEW FILE DIALOG */}
      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New Execution File</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Redmine Ticket ID <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. 38032" value={fileForm.redmineTicketId} onChange={(e) => setFileForm({...fileForm, redmineTicketId: e.target.value})} />
            </div>
            <div className="space-y-1"><Label>Title</Label><Input value={fileForm.title} onChange={(e) => setFileForm({...fileForm, title: e.target.value})} /></div>
            <div className="space-y-1">
              <Label>QA PIC</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={fileForm.qaPic}
                onChange={(e) => setFileForm({...fileForm, qaPic: e.target.value})}
              >
                <option value="">Select QA PIC...</option>
                {qaUsers.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setNewFileOpen(false)}>Cancel</Button><Button onClick={handleCreateFile}>Create File</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MANAGE MODULES DIALOG */}
      <Dialog open={modulesOpen} onOpenChange={setModulesOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Reusable Modules</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Input placeholder="New Module Name..." value={newModule} onChange={(e) => setNewModule(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddModule()} />
              <Button onClick={handleAddModule}><ListPlus className="w-4 h-4 mr-2"/> Add</Button>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1">
              {modules.map(mod => (
                <div key={mod.id} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded-md group">
                  <span className="text-sm font-medium">{mod.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveModule(mod.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}