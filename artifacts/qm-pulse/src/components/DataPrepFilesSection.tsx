import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Trash2, Loader2, Database } from "lucide-react";
import { format } from "date-fns";

// CR070 — prefilled when a milestone is switched to "Data Prep" so QA knows
// exactly what to hand over, without the PM having to type it from scratch.
export const DATA_PREP_TEMPLATE = `Data source / system:
Fields & format required:
Number of records needed:
Target environment:
Special conditions (edge cases, boundary values):
Deadline for handover to QA:`;

interface DataPrepFile {
  id: number;
  projectId: number;
  milestoneId: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  note: string | null;
  uploadedBy: number | null;
  uploaderName: string | null;
  createdAt: string;
}

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

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

// CR070 — data-prep file handoff: QA uploads the prepared dataset, PM
// downloads it to email the client. Shared between the plain Milestones page
// edit dialog and the QA Pipeline's data-prep step — both just need a
// milestoneId, not the full page-local Milestone shape.
export function DataPrepFilesSection({ milestoneId, token, canWrite, userId }: { milestoneId: number; token: string | null; canWrite: boolean; userId: number | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files = [], isLoading } = useQuery<DataPrepFile[]>({
    queryKey: ["data-prep-files", milestoneId],
    queryFn: async () => {
      const res = await api(`/data-prep-files?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
  });

  const handlePick = async (file: File | null) => {
    if (!file) return;
    if (file.size === 0) { toast({ variant: "destructive", title: "File is empty" }); return; }
    if (file.size > 15 * 1024 * 1024) { toast({ variant: "destructive", title: "File too large (max 15 MB)" }); return; }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const res = await api("/data-prep-files", token, {
        method: "POST",
        body: JSON.stringify({ milestoneId, fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64 }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Upload failed"); }
      toast({ title: "File uploaded" });
      queryClient.invalidateQueries({ queryKey: ["data-prep-files", milestoneId] });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message ?? "Upload failed" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (f: DataPrepFile) => {
    const res = await api(`/data-prep-files/${f.id}/download`, token);
    if (!res.ok) { toast({ variant: "destructive", title: "Download failed" }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (f: DataPrepFile) => {
    const res = await api(`/data-prep-files/${f.id}`, token, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast({ variant: "destructive", title: d.error ?? "Delete failed" }); return; }
    toast({ title: "File deleted" });
    queryClient.invalidateQueries({ queryKey: ["data-prep-files", milestoneId] });
    queryClient.invalidateQueries({ queryKey: ["milestones"] });
    queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
  };

  const canDelete = (f: DataPrepFile) => canWrite && (f.uploadedBy === userId || f.uploadedBy == null);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5" /> Data File
      </Label>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No file uploaded yet — QA uploads the prepared dataset here.</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">{f.fileName}</p>
                <p className="text-muted-foreground">{fmtSize(f.sizeBytes)} · {f.uploaderName ?? "—"} · {format(new Date(f.createdAt), "dd MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => handleDownload(f)}>
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
                {canDelete(f) && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(f)} aria-label="Delete file">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="pt-1">
          <Input ref={fileInputRef} type="file" disabled={uploading} onChange={(e) => handlePick(e.target.files?.[0] ?? null)} className="h-8 text-xs file:text-xs" />
          {uploading && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</p>}
        </div>
      )}
    </div>
  );
}
