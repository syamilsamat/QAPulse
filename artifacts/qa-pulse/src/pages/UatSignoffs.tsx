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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Wraps a text sign-off's content + metadata into a designed, Word-openable
// (.doc) HTML document — a formal acceptance record rather than raw plaintext.
function buildSignoffWordHtml(s: Signoff, content: string): string {
  const signedDate = format(new Date(s.createdAt), "dd MMMM yyyy");
  const generatedAt = format(new Date(), "dd MMM yyyy, HH:mm");
  const raw = (content ?? "").trim();
  const body = raw
    ? escapeHtml(raw).replace(/\n/g, "<br/>")
    : "<span style=\"color:#9ca3af;\">(No written evidence was recorded in the source file.)</span>";
  const sectionHead = (t: string) =>
    `<div style="font-size:13pt;font-weight:bold;color:#274AB3;border-bottom:2px solid #274AB3;padding-bottom:4px;margin:0 0 10px;">${t}</div>`;
  const metaRow = (label: string, value: string, striped: boolean) =>
    `<tr${striped ? ' style="background:#f3f6ff;"' : ""}><td width="34%" style="border:1px solid #e5e7eb;padding:8px;font-weight:bold;color:#374151;">${label}</td><td style="border:1px solid #e5e7eb;padding:8px;">${value}</td></tr>`;
  const noteBlock = s.note
    ? `${sectionHead("Notes")}<p style="margin:0 0 18px;">${escapeHtml(s.note)}</p>`
    : "";
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>UAT Acceptance Sign-off — ${escapeHtml(s.milestoneName)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page{size:A4;margin:2cm;} body{font-family:Calibri,Arial,sans-serif;color:#1f2937;font-size:11pt;line-height:1.5;}</style>
</head>
<body>
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
  <tr><td style="background:#274AB3;padding:22px 26px;">
    <div style="color:#a9c0ff;font-size:9pt;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">QMPulse &middot; Quality Management</div>
    <div style="color:#ffffff;font-size:22pt;font-weight:bold;margin-top:4px;">UAT Acceptance Sign-off</div>
    <div style="color:#d7e2ff;font-size:10.5pt;margin-top:2px;">Formal user-acceptance closing evidence</div>
  </td></tr>
  <tr><td style="height:4px;background:#14b8a6;line-height:4px;font-size:1px;">&nbsp;</td></tr>
</table>

<p style="margin:20px 0 16px;">This document certifies that User Acceptance Testing for the milestone identified below has been reviewed and <b>formally accepted</b>. All agreed acceptance criteria and test scenarios have been executed and signed off by the accountable business stakeholders, and this record is retained as the authoritative closing evidence for the associated go-live.</p>

<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:10.5pt;margin-bottom:22px;border:1px solid #e5e7eb;">
  ${metaRow("Project", escapeHtml(s.projectName), true)}
  ${metaRow("Milestone", escapeHtml(s.milestoneName), false)}
  ${metaRow("Document reference", escapeHtml(s.fileName), true)}
  ${metaRow("Signed / uploaded by", escapeHtml(s.uploaderName ?? "—"), false)}
  ${metaRow("Date of record", signedDate, true)}
</table>

${sectionHead("Acceptance statement")}
<p style="margin:0 0 18px;">The undersigned confirm that the deliverables associated with this milestone meet the documented business requirements and acceptance criteria. Any outstanding items, where present, have been agreed as non-blocking and are tracked separately. This sign-off authorises the milestone to proceed to release.</p>

${sectionHead("Recorded sign-off evidence")}
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
  <tr><td style="border:1px solid #e5e7eb;background:#fafafa;padding:14px;font-size:10.5pt;">${body}</td></tr>
</table>

${noteBlock}

${sectionHead("Authorisation")}
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:10.5pt;">
  <tr>
    <td width="55%" style="padding-top:30px;"><div style="border-top:1px solid #9ca3af;padding-top:4px;">Accepted by (name &amp; signature)</div></td>
    <td width="10%">&nbsp;</td>
    <td width="35%" style="padding-top:30px;"><div style="border-top:1px solid #9ca3af;padding-top:4px;">Date</div></td>
  </tr>
</table>
<p style="margin-top:10px;font-size:10.5pt;color:#374151;">On record: <b>${escapeHtml(s.uploaderName ?? "—")}</b> &middot; ${signedDate}</p>

<p style="margin-top:30px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8.5pt;color:#9ca3af;">Generated by QMPulse on ${generatedAt}. System-generated acceptance record — confidential to the project stakeholders.</p>
</body></html>`;
}

const UPLOAD_ROLES = ["admin", "qa_lead", "fa_lead", "hod_qa", "hod_fa", "hod_pm", "pm_lead", "pm_member", "cto"];

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

    // Text sign-offs are exported as a designed, Word-openable acceptance
    // document; anything already a proper file (PDF, Word, …) streams as-is.
    const isText = s.mimeType.startsWith("text/") || /\.txt$/i.test(s.fileName);
    let blob: Blob;
    let downloadName: string;
    if (isText) {
      const content = await res.text();
      blob = new Blob([buildSignoffWordHtml(s, content)], { type: "application/msword" });
      downloadName = `${s.fileName.replace(/\.[^.]+$/, "")}.doc`;
    } else {
      blob = await res.blob();
      downloadName = s.fileName;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
    if (isText) toast({ title: "Sign-off exported as Word (.doc)" });
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
