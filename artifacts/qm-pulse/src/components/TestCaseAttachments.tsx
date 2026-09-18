import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Attachment = { id: number; fileName: string; mimeType: string; sizeBytes: number; uploadedByName: string | null; createdAt: string; canDelete: boolean };
type Listing = { canUpload: boolean; attachments: Attachment[] };
const previewTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

export function TestCaseAttachments({ testCaseId, readOnly = false }: { testCaseId: number; readOnly?: boolean }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ file: Attachment; url: string; text?: string } | null>(null);
  const key = ["test-case-attachments", testCaseId, user?.id];
  const base = `${getApiUrl()}/test-cases/${testCaseId}/attachments`;
  const headers = { Authorization: `Bearer ${token}` };
  async function request(url: string, init?: RequestInit) {
    const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
    if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error || "Attachment request failed"); }
    return res;
  }
  const listing = useQuery<Listing>({ queryKey: key, enabled: !!token, queryFn: async () => (await request(base)).json(), staleTime: 0, refetchOnWindowFocus: true });
  useEffect(() => { setPreview(null); }, [testCaseId]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  function report(error: unknown) { toast({ variant: "destructive", title: "Attachment action failed", description: error instanceof Error ? error.message : "Please try again" }); }
  async function upload(files: File[]) {
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: choose a non-empty file up to 20 MB.`);
        const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Unable to read file")); reader.readAsDataURL(file); });
        await request(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataBase64 }) });
        uploaded++;
      }
    } catch (error) { report(error); }
    finally { if (uploaded) { toast({ title: `${uploaded} library attachment${uploaded === 1 ? "" : "s"} uploaded` }); await client.invalidateQueries({ queryKey: key }); } setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function open(file: Attachment, inline: boolean) {
    try {
      const res = await request(`${base}/${file.id}/download${inline ? "?inline=1" : ""}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (inline) setPreview({ file, url, text: file.mimeType === "text/plain" ? await blob.text() : undefined });
      else { const a = document.createElement("a"); a.href = url; a.download = file.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (error) { report(error); }
  }
  async function remove(file: Attachment) {
    if (!window.confirm(`Delete "${file.fileName}" from this library record and all linked compiled views? Execution evidence will not be affected.`)) return;
    setBusy(true);
    try { await request(`${base}/${file.id}`, { method: "DELETE" }); if (preview?.file.id === file.id) setPreview(null); await client.invalidateQueries({ queryKey: key }); }
    catch (error) { report(error); } finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border p-4" onClick={e => e.stopPropagation()}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Library attachments{listing.data ? ` (${listing.data.attachments.length})` : ""}</h3><p className="text-xs text-muted-foreground">Reference files shared across executions · Up to 20 MB per file</p></div>
      {!readOnly && listing.data?.canUpload && <><input ref={input} type="file" multiple hidden aria-label="Upload library attachments" onChange={e => void upload(Array.from(e.target.files || []))} /><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Saving…" : "Upload files"}</Button></>}
      <Button type="button" size="sm" variant="ghost" disabled={listing.isFetching} onClick={() => void listing.refetch()}>Refresh</Button>
    </div>
    {listing.isLoading && <p className="text-xs text-muted-foreground">Loading attachments…</p>}
    {listing.isError && <p role="alert" className="text-xs text-destructive">{listing.error.message}</p>}
    {listing.data?.attachments.length === 0 && <p className="text-xs text-muted-foreground">No library attachments.</p>}
    {listing.data?.attachments.map(file => <div key={file.id} className="flex flex-wrap items-center gap-2 border-t pt-2"><div className="flex-1 min-w-0"><p className="text-sm break-words">{file.fileName}</p><p className="text-xs text-muted-foreground">{Math.max(1, Math.ceil(file.sizeBytes / 1024))} KB · {file.uploadedByName || "Former user"} · {new Date(file.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-1">
      {previewTypes.has(file.mimeType) && <Button type="button" size="sm" variant="ghost" onClick={() => void open(file, true)}>Preview</Button>}
      <Button type="button" size="sm" variant="ghost" onClick={() => void open(file, false)}>Download</Button>
      {!readOnly && file.canDelete && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(file)}>Delete</Button>}
    </div></div>)}
    {readOnly && <p className="text-xs text-muted-foreground">Live library references. Manage files in the Test Case Library.</p>}
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle className="break-all">{preview?.file.fileName}</DialogTitle></DialogHeader>{preview && (preview.file.mimeType.startsWith("image/") ? <img src={preview.url} alt={preview.file.fileName} className="max-h-[70vh] object-contain mx-auto" /> : preview.file.mimeType === "text/plain" ? <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words text-sm">{preview.text}</pre> : <iframe src={preview.url} title={preview.file.fileName} className="w-full h-[65vh] border-0" />)}</DialogContent></Dialog>
  </section>;
}

// Lazy list for dense compiled tables; fetching starts when opened.
export function CompiledLibraryAttachments({ testCaseId }: { testCaseId: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!testCaseId) return null;
  return <div onClick={e => e.stopPropagation()}><Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Library attachments</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Library reference files</DialogTitle></DialogHeader>{open && <TestCaseAttachments testCaseId={testCaseId} readOnly />}</DialogContent></Dialog></div>;
}
