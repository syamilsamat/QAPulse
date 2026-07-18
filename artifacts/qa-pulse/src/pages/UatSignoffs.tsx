import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileCheck2, Download, Trash2, Upload, Loader2 } from "lucide-react";
import { format } from "date-fns";

// CR054p3 — UAT sign-off registry. Server scopes the list to the caller's
// projects (scopeToUserProjects), so "users only see their projects" holds
// even without the filter.

interface Signoff {
  id: number;
  projectId: number;
  projectName: string;
  milestoneId: number;
  milestoneName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
}

function api(path: string, token: string | null, opts?: RequestInit) {
  return fetch(`${getApiUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const UPLOAD_ROLES = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pmo", "cto"];

export default function UatSignoffs() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filterProject, setFilterProject] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [upProject, setUpProject] = useState<string>("");
  const [upMilestone, setUpMilestone] = useState<string>("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUpload = UPLOAD_ROLES.includes(user?.role ?? "");

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: signoffs = [], isLoading } = useQuery<Signoff[]>({
    queryKey: ["uat-signoffs", filterProject],
    queryFn: async () => {
      const qs = filterProject !== "all" ? `?projectId=${filterProject}` : "";
      const res = await api(`/uat-signoffs${qs}`, token);
      return res.ok ? res.json() : [];
    },
  });

  const { data: milestones = [] } = useQuery<{ id: number; name: string; status: string }[]>({
    queryKey: ["milestones", upProject],
    queryFn: async () => {
      const res = await api(`/milestones?projectId=${upProject}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: dialogOpen && !!upProject,
  });

  const openUpload = () => {
    setUpProject(filterProject !== "all" ? filterProject : "");
    setUpMilestone("");
    setNote("");
    setFile(null);
    setDialogOpen(true);
  };

  const handleUpload = async () => {
    if (!upMilestone || !file) { toast({ variant: "destructive", title: "Pick a milestone and a file" }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ variant: "destructive", title: "File too large (max 15 MB)" }); return; }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const res = await api("/uat-signoffs", token, {
        method: "POST",
        body: JSON.stringify({
          milestoneId: Number(upMilestone),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Upload failed"); }
      toast({ title: "Sign-off uploaded" });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["uat-signoffs"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (s: Signoff) => {
    const res = await api(`/uat-signoffs/${s.id}/download`, token);
    if (!res.ok) { toast({ variant: "destructive", title: "Download failed" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = s.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (s: Signoff) => {
    const res = await api(`/uat-signoffs/${s.id}`, token, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast({ variant: "destructive", title: d.error ?? "Delete failed" }); return; }
    toast({ title: "Sign-off deleted" });
    queryClient.invalidateQueries({ queryKey: ["uat-signoffs"] });
  };

  const canDelete = (s: Signoff) => ["admin", "cto"].includes(user?.role ?? "") || s.uploadedBy === user?.id;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-teal-500" />
            UAT Sign-offs
          </h1>
          <p className="text-sm text-muted-foreground">Signed acceptance documents per milestone — the closing evidence behind every go-live.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All my projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canUpload && (
            <Button onClick={openUpload} className="gap-2 shrink-0">
              <Upload className="w-4 h-4" /> Upload
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading sign-offs…
        </div>
      ) : signoffs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileCheck2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No UAT sign-offs {filterProject !== "all" ? "for this project yet" : "yet"}.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                <th className="text-left font-medium px-3 py-2">File</th>
                <th className="text-left font-medium px-3 py-2">Project</th>
                <th className="text-left font-medium px-3 py-2">Milestone</th>
                <th className="text-left font-medium px-3 py-2">Uploaded by</th>
                <th className="text-left font-medium px-3 py-2">Date</th>
                <th className="text-right font-medium px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {signoffs.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{s.fileName}</p>
                    <p className="text-xs text-muted-foreground">{fmtSize(s.sizeBytes)}{s.note ? ` · ${s.note}` : ""}</p>
                  </td>
                  <td className="px-3 py-2.5">{s.projectName}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline">{s.milestoneName}</Badge></td>
                  <td className="px-3 py-2.5">{s.uploaderName ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{format(new Date(s.createdAt), "dd MMM yyyy")}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => handleDownload(s)}>
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                    {canDelete(s) && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(s)} aria-label="Delete sign-off">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload UAT sign-off</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={upProject} onValueChange={(v) => { setUpProject(v); setUpMilestone(""); }}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Milestone</Label>
              <Select value={upMilestone} onValueChange={setUpMilestone} disabled={!upProject}>
                <SelectTrigger><SelectValue placeholder={upProject ? "Select milestone" : "Select a project first"} /></SelectTrigger>
                <SelectContent>
                  {milestones.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File (max 15 MB)</Label>
              <Input ref={fileInputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. Signed by business owner on 20 Jul" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
