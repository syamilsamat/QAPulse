import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Link as LinkIcon, Loader2, Lock, Paperclip } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, authHeaders } from "@/lib/api";
import { mergeThreeWay, type Content, type MergeResult, type ScalarKey } from "@/lib/three-way-merge";
import { contentFromApi, describeDiff, diffKeys, PRIORITIES, priorityLabel } from "@/lib/requirement-diff";
import { useProjectModules } from "@/components/MilestoneModulePicker";
import { RequirementAiAnalyze } from "@/components/RequirementAiAnalyze";
import { ReviewRemarkDialog } from "@/components/execution/ReviewRemarkDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type MilestoneContext = {
  id: number;
  name: string;
  projectId: number;
  projectName: string;
  modules: { id: number; name: string }[];
  tracker: string | null;
  /** Milestone priority (Low / Medium / High / Critical) used to default a new requirement's priority. */
  priority: string | null;
};

export type DialogTarget = { kind: "view"; id: number } | { kind: "create" };

type ApiRequirement = {
  id: number;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  priority: string;
  reviewStatus: string;
  module: string | null;
  tracker: string | null;
  version: number;
  createdBy: number | null;
  authorName: string | null;
  lastEditedBy: number | null;
  lastEditedByName: string | null;
  draftOwnerId: number | null;
  draftOwnerName: string | null;
};
type Attachment = { id: number; filename: string; linkUrl: string | null; size: number };
type LogEntry = {
  id: number;
  action: string;
  actorName: string | null;
  remark: string | null;
  summary: string[];
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
};
type Conflict = {
  theirs: Content;
  version: number;
  lastEditedByName: string | null;
  merge: MergeResult;
  choice: Record<ScalarKey, "mine" | "theirs">;
};

const STATUS_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", approved: "Approved", rejected: "Returned" };
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
const ACTION_LABEL: Record<string, string> = {
  create: "Created the first draft", edit: "Edited", submit: "Submitted for review", approve: "Approved",
  return: "Returned", discard: "Discarded the draft", takeover: "Took over the draft",
};
const FIELD_LABEL: Record<string, string> = { title: "Title", description: "Description", priority: "Priority", acceptanceCriteria: "Acceptance criteria" };
// Milestone priority → requirement priority, for the default on a new one.
const PRIORITY_FROM_MILESTONE: Record<string, string> = { Low: "low", Medium: "normal", High: "high", Critical: "urgent" };

async function call<T = any>(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as T };
}
async function load<T>(path: string): Promise<T> {
  const r = await call<T>(path);
  if (!r.ok) throw new Error((r.data as any)?.error ?? "Request failed");
  return r.data;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });

function formatText(c: Content) {
  return `Title: ${c.title}\nPriority: ${priorityLabel(c.priority)}\n\nDescription:\n${c.description}\n\nAcceptance criteria:\n${c.acceptanceCriteria.map((x) => `- ${x}`).join("\n")}`;
}

// One dialog for a requirement on the milestone page: read it, create one,
// edit it (save as draft / submit for review), review it, and see who wrote and
// changed it. Editing never leaves the milestone page (CR104).
export function RequirementDialog({
  target, milestone, canAuthor, onClose, onChanged,
}: {
  target: DialogTarget | null;
  milestone: MilestoneContext;
  canAuthor: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const id = target?.kind === "view" ? target.id : null;
  const creating = target?.kind === "create";
  const me = user?.id ?? -1;
  const role = user?.role ?? "";
  const isAdmin = role === "admin" || role === "cto";

  const { data: req, isLoading } = useQuery<ApiRequirement>({
    queryKey: ["req-dialog", id],
    queryFn: () => load(`/requirements/${id}`),
    enabled: id != null,
  });
  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey: ["req-dialog-attachments", id],
    queryFn: () => load(`/requirements/${id}/attachments`),
    enabled: id != null,
  });
  const { data: log } = useQuery<{ entries: LogEntry[]; authorName: string | null; draftOwnerName: string | null }>({
    queryKey: ["req-dialog-log", id],
    queryFn: () => load(`/requirements/${id}/revision-log`),
    enabled: id != null,
  });
  const status = req?.reviewStatus ?? "draft";
  const { data: approvedVersion } = useQuery<Content | null>({
    queryKey: ["req-dialog-approved", id, req?.version],
    queryFn: () => load(`/requirements/${id}/approved-version`),
    enabled: id != null && !!req && status !== "approved",
  });
  const { data: projectModules = [] } = useProjectModules(creating ? milestone.projectId : null, token);

  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState<{ content: Content; version: number } | null>(null);
  const [draft, setDraft] = useState<Content>({ title: "", description: "", acceptanceCriteria: [], priority: "normal" });
  const [newCrit, setNewCrit] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [removedAtt, setRemovedAtt] = useState<number[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [remarkFor, setRemarkFor] = useState<"approve" | "return" | null>(null);
  const [showApproved, setShowApproved] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Reset whenever a different requirement (or create) is opened.
  useEffect(() => {
    setEditing(creating);
    setBase(null); setConflict(null); setLockedBy(null); setRemarkFor(null); setShowApproved(false);
    setRemovedAtt([]); setFiles([]); setLinks([]); setLinkUrl(""); setNewCrit(""); setTriedSave(false);
    setConfirmDiscard(false); setExpanded(new Set());
    if (creating) {
      setDraft({ title: "", description: "", acceptanceCriteria: [], priority: PRIORITY_FROM_MILESTONE[milestone.priority ?? ""] ?? "normal" });
      setModules(milestone.modules.length === 1 ? [milestone.modules[0].name] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind, id]);

  const moduleChoices = useMemo(
    () => (milestone.modules.length > 0 ? milestone.modules.map((m) => m.name) : projectModules.map((m) => m.name)),
    [milestone.modules, projectModules],
  );
  const moduleLocked = creating && milestone.modules.length === 1;

  const saved: Content | null = req ? contentFromApi(req) : null;
  const owner = req ? (req.draftOwnerId ?? (status === "draft" ? req.createdBy : null)) : null;
  const ownerName = req?.draftOwnerName ?? (status === "draft" ? req?.authorName : null) ?? null;
  const lockedForMe = !!req && status !== "approved" && owner != null && owner !== me && !isAdmin;
  const canEdit = canAuthor && !!req && !lockedForMe;
  const isLead = role === "fa_lead" || isAdmin;
  const iWroteOrEdited = !!req && (req.createdBy === me || req.lastEditedBy === me);
  const canReviewIt = !!req && status === "in_review" && (role.includes("fa") || isAdmin) && !iWroteOrEdited;

  const attachmentNotes = [
    ...files.map((f) => `+${f.name}`),
    ...links.map((l) => `+${l.label || l.url}`),
    ...attachments.filter((a) => removedAtt.includes(a.id)).map((a) => `-${a.filename}`),
  ];
  const baseContent = base?.content ?? saved ?? draft;
  const changedKeys = creating ? [] : diffKeys(baseContent, draft);
  const changeLines = creating ? [] : describeDiff(baseContent, draft);
  const hasChanges = creating ? draft.title.trim().length > 0 : changedKeys.length > 0 || attachmentNotes.length > 0;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["req-dialog", id] });
    queryClient.invalidateQueries({ queryKey: ["req-dialog-attachments", id] });
    queryClient.invalidateQueries({ queryKey: ["req-dialog-log", id] });
    queryClient.invalidateQueries({ queryKey: ["req-dialog-approved", id] });
    onChanged();
  };

  const startEdit = () => {
    if (!req || !saved) return;
    setBase({ content: saved, version: req.version });
    setDraft({ ...saved, acceptanceCriteria: [...saved.acceptanceCriteria] });
    setRemovedAtt([]); setFiles([]); setLinks([]); setLinkUrl(""); setNewCrit(""); setTriedSave(false);
    setConflict(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    if (creating) { onClose(); return; }
    setEditing(false); setConflict(null); setBase(null);
  };

  const uploadAttachments = async (requirementId: number) => {
    const results = await Promise.allSettled([
      ...files.map(async (f) => {
        const r = await call(`/requirements/${requirementId}/attachments`, "POST", { filename: f.name, mimeType: f.type || "application/octet-stream", data: await fileToBase64(f) });
        if (!r.ok) throw new Error("upload");
      }),
      ...links.map(async (l) => {
        const r = await call(`/requirements/${requirementId}/attachments`, "POST", { linkUrl: l.url, filename: l.label || undefined });
        if (!r.ok) throw new Error("link");
      }),
      ...removedAtt.map(async (aid) => {
        const r = await call(`/requirements/attachments/${aid}`, "DELETE");
        if (!r.ok) throw new Error("delete");
      }),
    ]);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast({ variant: "destructive", title: `${failed} attachment change(s) did not save` });
  };

  async function save(action: "save_draft" | "submit", baseOverride?: { content: Content; version: number }, draftOverride?: Content) {
    setTriedSave(true);
    const d = draftOverride ?? draft;
    if (!d.title.trim()) return;
    setBusy(true);
    try {
      if (creating) {
        const created = await call<{ id: number; moduleWarning?: string | null; error?: string }>("/requirements", "POST", {
          title: d.title.trim(),
          description: d.description,
          priority: d.priority,
          acceptanceCriteria: d.acceptanceCriteria.length ? JSON.stringify(d.acceptanceCriteria) : undefined,
          projectId: milestone.projectId,
          milestoneId: milestone.id,
          module: modules.join(",") || undefined,
          status: "draft",
        });
        if (!created.ok) { toast({ variant: "destructive", title: created.data.error ?? "Could not create the requirement" }); return; }
        const newId = created.data.id;
        if (action === "submit") {
          const sub = await call(`/requirements/${newId}/review`, "PATCH", { action: "submit" });
          if (!sub.ok) toast({ variant: "destructive", title: (sub.data as any)?.error ?? "Saved as a draft, but it could not be submitted" });
        }
        await uploadAttachments(newId);
        if (created.data.moduleWarning) toast({ title: "Saved, but check the module", description: created.data.moduleWarning });
        toast({ title: action === "submit" ? "Created and submitted for review" : "Saved as draft" });
        onChanged();
        onClose();
        return;
      }

      const b = baseOverride ?? base;
      if (!b || !id) return;
      const changes: Record<string, unknown> = {};
      for (const k of diffKeys(b.content, d)) changes[k] = (d as any)[k];
      const r = await call<any>(`/requirements/${id}/revision`, "POST", {
        baseVersion: b.version, changes, action,
        attachmentNotes: attachmentNotes,
      });
      if (r.ok) {
        await uploadAttachments(id);
        toast({ title: action === "submit" ? "Submitted for review. A different FA must approve it." : "Saved as draft. It needs approval again." });
        setEditing(false); setBase(null); setConflict(null);
        refreshAll();
        return;
      }
      if (r.status === 409 && r.data.code === "locked") {
        setLockedBy(r.data.ownerName ?? "someone else");
        setEditing(false);
        toast({ variant: "destructive", title: r.data.error ?? "This requirement is locked" });
        refreshAll();
        return;
      }
      if (r.status === 409 && r.data.code === "stale") {
        const theirs: Content = { ...r.data.content, acceptanceCriteria: r.data.content.acceptanceCriteria ?? [] };
        const merge = mergeThreeWay(b.content, d, theirs);
        const choice = { title: "mine", description: "mine", priority: "mine" } as Conflict["choice"];
        setConflict({ theirs, version: r.data.version, lastEditedByName: r.data.lastEditedByName ?? null, merge, choice });
        return;
      }
      if (r.status === 409 && r.data.code === "no_changes") { toast({ title: "Nothing has changed yet" }); return; }
      toast({ variant: "destructive", title: r.data?.error ?? "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  const applyMerge = (action: "save_draft" | "submit") => {
    if (!conflict) return;
    const finalContent: Content = { ...conflict.merge.merged, acceptanceCriteria: [...conflict.merge.merged.acceptanceCriteria] };
    for (const k of conflict.merge.conflicts) {
      finalContent[k] = conflict.choice[k] === "theirs" ? conflict.theirs[k] : draft[k];
    }
    const newBase = { content: conflict.theirs, version: conflict.version };
    setBase(newBase);
    setDraft(finalContent);
    setConflict(null);
    void save(action, newBase, finalContent);
  };

  const copyMine = async () => {
    try {
      await navigator.clipboard.writeText(formatText(draft));
      toast({ title: "Your changes were copied" });
    } catch {
      toast({ variant: "destructive", title: "Could not copy. Select the text in the form instead." });
    }
  };

  const review = async (action: "approve" | "reject" | "submit", remark?: string) => {
    if (!id) return;
    setBusy(true);
    try {
      const r = await call<any>(`/requirements/${id}/review`, "PATCH", { action, comment: remark });
      if (!r.ok) { toast({ variant: "destructive", title: r.data?.error ?? "That did not work" }); return; }
      toast({ title: action === "approve" ? "Approved" : action === "reject" ? "Returned to the owner" : "Submitted for review" });
      refreshAll();
    } finally {
      setBusy(false);
      setRemarkFor(null);
    }
  };

  const takeOver = async () => {
    if (!id) return;
    const r = await call<any>(`/requirements/${id}/takeover`, "POST", {});
    toast(r.ok ? { title: "You now own this draft" } : { variant: "destructive", title: r.data?.error ?? "Could not take over" });
    if (r.ok) { setLockedBy(null); refreshAll(); }
  };
  const discardDraft = async () => {
    if (!id) return;
    const r = await call<any>(`/requirements/${id}/discard-draft`, "POST", {});
    toast(r.ok ? { title: "Draft discarded. The approved version is back." } : { variant: "destructive", title: r.data?.error ?? "Could not discard" });
    setConfirmDiscard(false);
    if (r.ok) refreshAll();
  };

  const addLink = () => {
    const raw = linkUrl.trim();
    if (!raw) return;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const u = new URL(withScheme);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      setLinks((p) => [...p, { url: u.toString(), label: "" }]);
      setLinkUrl("");
    } catch {
      toast({ variant: "destructive", title: "Enter a valid http(s) link" });
    }
  };

  const open = target != null;
  const title = creating ? "New requirement" : editing ? "Edit requirement" : req?.title ?? "Requirement";

  const contextBlock = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm">
      <span><b>Project</b> {milestone.projectName}</span>
      <span><b>Milestone</b> {milestone.name}</span>
      {!creating && req?.module && <span><b>Module</b> {req.module}</span>}
      <span><b>Tracker</b> {(creating ? milestone.tracker : req?.tracker) ?? "not set"}</span>
    </div>
  );

  const form = (
    <div className="space-y-4">
      {contextBlock}
      {creating && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">Module <span className="text-destructive">*</span>{moduleLocked && <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> locked</Badge>}</Label>
          {moduleLocked ? (
            <p className="text-sm font-medium">{milestone.modules[0].name} <span className="text-xs text-muted-foreground font-normal">only module in this milestone</span></p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {moduleChoices.map((n) => {
                const on = modules.includes(n);
                return (
                  <button key={n} type="button" aria-pressed={on}
                    onClick={() => setModules((p) => (on ? p.filter((x) => x !== n) : [...p, n]))}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>{n}</button>
                );
              })}
              {moduleChoices.length === 0 && <span className="text-xs text-muted-foreground">No modules are set up for this project.</span>}
            </div>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="rd-title">Title <span className="text-destructive">*</span></Label>
        <Input id="rd-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={triedSave && !draft.title.trim() ? "border-destructive" : ""} autoComplete="off" />
        {triedSave && !draft.title.trim() && <p className="text-xs text-destructive">Title is required</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rd-desc">Description</Label>
        <Textarea id="rd-desc" rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Describe the requirement…" />
        <RequirementAiAnalyze
          title={draft.title}
          description={draft.description}
          module={modules.join(", ")}
          requirementId={id}
          resetKey={`${target?.kind}-${id}`}
          onAddToDescription={(prose) => setDraft((d) => ({ ...d, description: d.description.trim() ? `${d.description.trim()}\n\n${prose}` : prose }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Acceptance criteria</Label>
        <ul className="space-y-1.5">
          {draft.acceptanceCriteria.map((c, i) => (
            <li key={`${c}-${i}`} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-sm">
              <span className="flex-1 min-w-0 break-words">{c}</span>
              <button type="button" aria-label="Remove criterion" className="text-muted-foreground hover:text-destructive px-1"
                onClick={() => setDraft({ ...draft, acceptanceCriteria: draft.acceptanceCriteria.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={newCrit} placeholder="Add acceptance criterion…" autoComplete="off" onChange={(e) => setNewCrit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newCrit.trim()) { e.preventDefault(); setDraft({ ...draft, acceptanceCriteria: [...draft.acceptanceCriteria, newCrit.trim()] }); setNewCrit(""); } }} />
          <Button type="button" variant="outline" disabled={!newCrit.trim()} onClick={() => { setDraft({ ...draft, acceptanceCriteria: [...draft.acceptanceCriteria, newCrit.trim()] }); setNewCrit(""); }}>+</Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rd-pri">Priority</Label>
        <select id="rd-pri" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
        </select>
        {creating && <p className="text-xs text-muted-foreground">Starts from the milestone's priority ({milestone.priority ?? "none"}). You can change it.</p>}
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Attachments and links</Label>
        <ul className="space-y-1">
          {attachments.map((a) => {
            const removed = removedAtt.includes(a.id);
            return (
              <li key={a.id} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${removed ? "bg-destructive/5 line-through text-muted-foreground" : "bg-muted/50"}`}>
                {a.linkUrl ? <LinkIcon className="w-3 h-3 shrink-0" /> : <Paperclip className="w-3 h-3 shrink-0" />}
                <span className="flex-1 min-w-0 truncate">{a.filename}</span>
                <button type="button" className="text-xs underline" onClick={() => setRemovedAtt((p) => (removed ? p.filter((x) => x !== a.id) : [...p, a.id]))}>{removed ? "Undo" : "Remove"}</button>
              </li>
            );
          })}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded bg-primary/10 px-2 py-1 text-sm">
              <Paperclip className="w-3 h-3 shrink-0" /><span className="flex-1 min-w-0 truncate">{f.name}</span><span className="text-xs text-muted-foreground">new</span>
              <button type="button" aria-label="Remove file" className="px-1" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
          {links.map((l, i) => (
            <li key={`${l.url}-${i}`} className="flex items-center gap-2 rounded bg-primary/10 px-2 py-1 text-sm">
              <LinkIcon className="w-3 h-3 shrink-0" /><span className="flex-1 min-w-0 truncate">{l.url}</span><span className="text-xs text-muted-foreground">new</span>
              <button type="button" aria-label="Remove link" className="px-1" onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            Attach file
            <input type="file" multiple className="hidden" onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).filter((f) => { if (f.size > 10 * 1024 * 1024) { toast({ variant: "destructive", title: `${f.name} exceeds 10 MB` }); return false; } return true; });
              setFiles((p) => [...p, ...picked]); e.target.value = "";
            }} />
          </label>
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste a link (https://…)" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
          <Button type="button" variant="outline" disabled={!linkUrl.trim()} onClick={addLink}>Add link</Button>
        </div>
      </div>
    </div>
  );

  const conflictView = conflict && (
    <div className="space-y-4">
      <div className="rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-3 py-2 text-sm">
        <b>{conflict.lastEditedByName ?? "Someone"} changed this while you were editing.</b> Your changes were not saved. Nothing you typed is lost.
      </div>
      {conflict.merge.autoApplied.length > 0 && (
        <p className="text-sm">Applied on top of the latest version without any clash: {conflict.merge.autoApplied.map((k) => FIELD_LABEL[k] ?? k).join(", ")}.</p>
      )}
      {conflict.merge.conflicts.length === 0 && <p className="text-sm">There is no clash. Your changes can be re-applied on the latest version.</p>}
      {conflict.merge.conflicts.map((k) => (
        <fieldset key={k} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{FIELD_LABEL[k]}: you both changed this</legend>
          {(["mine", "theirs"] as const).map((who) => (
            <label key={who} className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="radio" name={`c-${k}`} checked={conflict.choice[k] === who} onChange={() => setConflict({ ...conflict, choice: { ...conflict.choice, [k]: who } })} className="mt-1" />
              <span className="min-w-0"><b>{who === "mine" ? "Mine" : `${conflict.lastEditedByName ?? "Theirs"}`}</b>
                <span className="block whitespace-pre-wrap break-words text-muted-foreground">{who === "mine" ? (k === "priority" ? priorityLabel(draft[k]) : draft[k]) : (k === "priority" ? priorityLabel(conflict.theirs[k]) : conflict.theirs[k])}</span></span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );

  const viewBody = req && saved && (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[status] ?? "bg-muted"}`}>{STATUS_LABEL[status] ?? status}</span>
        <Badge variant="outline">Priority {priorityLabel(req.priority)}</Badge>
      </div>
      {status !== "approved" && (ownerName || lockedBy) && (
        <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${lockedForMe ? "bg-slate-100 dark:bg-slate-900" : "bg-primary/10"}`}>
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {lockedForMe
              ? <>Locked: <b>{lockedBy ?? ownerName}</b> owns this {status === "in_review" ? "revision, which is in review" : "draft"}. Only they can edit it.</>
              : <>You own this {status === "in_review" ? "revision, which is in review" : "draft"}.</>}
            {lockedForMe && isLead && <> <button type="button" className="underline" onClick={takeOver}>Take over this draft</button></>}
          </span>
        </div>
      )}
      {contextBlock}
      <section className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
        <p className="whitespace-pre-wrap break-words text-sm">{saved.description || <span className="text-muted-foreground">No description.</span>}</p></section>
      <section className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acceptance criteria</h4>
        {saved.acceptanceCriteria.length ? <ul className="list-disc pl-5 text-sm space-y-0.5">{saved.acceptanceCriteria.map((c, i) => <li key={i} className="break-words">{c}</li>)}</ul> : <p className="text-sm text-muted-foreground">None.</p>}</section>
      <section className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</h4>
        {attachments.length ? <div className="flex flex-wrap gap-1.5">{attachments.map((a) => <Badge key={a.id} variant="secondary" className="gap-1">{a.linkUrl ? <LinkIcon className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}{a.filename}</Badge>)}</div> : <p className="text-sm text-muted-foreground">None.</p>}</section>
      <p className="text-xs text-muted-foreground">
        <Link href={`/requirements/${req.id}`} className="underline">Open full page</Link> for comments, defects, dev tasks and downloads.
      </p>

      {status !== "approved" && approvedVersion && (
        <div className="space-y-2">
          <button type="button" className="text-sm underline" onClick={() => setShowApproved((v) => !v)}>{showApproved ? "Hide" : "View"} the approved version</button>
          {showApproved && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <p className="font-medium break-words">{approvedVersion.title}</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{approvedVersion.description || "No description."}</p>
              {approvedVersion.acceptanceCriteria.length > 0 && <ul className="list-disc pl-5">{approvedVersion.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}</ul>}
              <p className="text-xs text-muted-foreground">Priority {priorityLabel(approvedVersion.priority)}. This is what developers and testers should build against until the revision is approved.</p>
            </div>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Authorship</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/60 px-3 py-2"><p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Author (first draft)</p><p className="text-sm">{req.authorName ?? "Unknown"}</p></div>
          <div className="rounded-md bg-muted/60 px-3 py-2"><p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Last edited by</p><p className="text-sm">{req.lastEditedByName ?? req.authorName ?? "Unknown"}</p></div>
        </div>
        <ul className="space-y-2">
          {(log?.entries ?? []).map((e) => {
            const open = expanded.has(e.id);
            const hasDetail = !!e.changes && Object.keys(e.changes).length > 0;
            return (
              <li key={e.id} className="border-l-2 border-primary/50 pl-3 text-sm">
                <p><b>{e.actorName ?? "Someone"}</b> · {ACTION_LABEL[e.action] ?? e.action}{e.summary.length ? `: ${e.summary.join("; ")}` : ""}
                  <span className="text-xs text-muted-foreground"> · {new Date(e.createdAt).toLocaleString()}</span></p>
                {e.remark && <p className="text-muted-foreground break-words">"{e.remark}"</p>}
                {hasDetail && (
                  <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs underline" onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}>
                    {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{open ? "Hide details" : "Show details"}
                  </button>
                )}
                {open && hasDetail && (
                  <div className="mt-1 space-y-1.5">
                    {Object.entries(e.changes!).map(([k, v]) => (
                      <div key={k} className="rounded bg-muted/60 p-2 text-xs space-y-1">
                        <p className="font-semibold">{FIELD_LABEL[k] ?? k}</p>
                        <p className="whitespace-pre-wrap break-words"><span className="text-muted-foreground">Before: </span>{Array.isArray(v.from) ? (v.from as string[]).join(" | ") || "none" : String(v.from || "empty")}</p>
                        <p className="whitespace-pre-wrap break-words"><span className="text-muted-foreground">After: </span>{Array.isArray(v.to) ? (v.to as string[]).join(" | ") || "none" : String(v.to || "empty")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );

  let footer: React.ReactNode;
  if (conflict) {
    footer = (
      <>
        <Button variant="outline" onClick={copyMine}>Copy my changes</Button>
        <Button variant="outline" onClick={() => { setConflict(null); cancelEdit(); }}>Discard mine</Button>
        <Button variant="outline" disabled={busy} onClick={() => applyMerge("save_draft")}>Apply and save as draft</Button>
        <Button disabled={busy} onClick={() => applyMerge("submit")}>Apply and submit for review</Button>
      </>
    );
  } else if (editing) {
    footer = (
      <>
        {!creating && (
          <span className="mr-auto text-xs text-muted-foreground self-center">
            {changeLines.length || attachmentNotes.length ? `${changeLines.length + (attachmentNotes.length ? 1 : 0)} change(s)` : "No changes yet"}
          </span>
        )}
        <Button variant="outline" onClick={cancelEdit} disabled={busy}>Cancel</Button>
        <Button variant="outline" disabled={!hasChanges || busy} onClick={() => save("save_draft")}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save as draft"}</Button>
        <Button disabled={!hasChanges || busy} onClick={() => save("submit")}>Submit for review</Button>
      </>
    );
  } else {
    footer = (
      <>
        {lockedForMe && !isLead && <span className="mr-auto text-xs text-muted-foreground self-center">Only {ownerName ?? "the owner"} can edit this now.</span>}
        {!lockedForMe && !canReviewIt && status === "in_review" && iWroteOrEdited && <span className="mr-auto text-xs text-muted-foreground self-center">You wrote or last edited this, so someone else must approve it.</span>}
        <Button variant="outline" onClick={onClose}>Close</Button>
        {canReviewIt && <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => setRemarkFor("return")}>Return</Button>}
        {canReviewIt && <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => setRemarkFor("approve")}>Approve</Button>}
        {canAuthor && !!req && status !== "approved" && owner === me && approvedVersion && (
          confirmDiscard
            ? <Button variant="destructive" disabled={busy} onClick={discardDraft}>Confirm: discard my draft</Button>
            : <Button variant="outline" disabled={busy} onClick={() => setConfirmDiscard(true)}>Discard draft</Button>
        )}
        {canEdit && <Button variant="outline" onClick={startEdit}>Edit</Button>}
        {canEdit && owner === me && (status === "draft" || status === "rejected") && <Button disabled={busy} onClick={() => review("submit")}>Submit for review</Button>}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="break-words pr-6">{title}</DialogTitle></DialogHeader>
          {id != null && isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          {conflict ? conflictView : editing ? (
            <>
              {!creating && (status === "approved" || status === "in_review") && (
                <div className="mb-4 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-3 py-2 text-sm">
                  This requirement is <b>{STATUS_LABEL[status]}</b>. Saving moves it back to <b>Draft</b>{status === "approved" ? " and it needs approval again" : " and takes it out of review"}. You will own the draft.
                </div>
              )}
              {form}
              {!creating && (
                <div className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-sm">
                  <b>{changeLines.length || attachmentNotes.length ? "What changed" : "No changes yet"}</b>
                  {(changeLines.length > 0 || attachmentNotes.length > 0) ? (
                    <ul className="list-disc pl-5 text-xs mt-1">
                      {changeLines.map((l) => <li key={l}>{l}</li>)}
                      {attachmentNotes.length > 0 && <li>Attachments: {attachmentNotes.join(", ")}</li>}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground mt-1">Change something to enable Save as draft and Submit for review.</p>}
                </div>
              )}
            </>
          ) : viewBody}
          <DialogFooter className="sticky bottom-0 bg-background gap-2 pt-2 sm:gap-0">{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
      <ReviewRemarkDialog
        open={remarkFor !== null}
        onOpenChange={(o) => { if (!o) setRemarkFor(null); }}
        title={remarkFor === "return" ? "Return this requirement" : "Approve this requirement"}
        description={remarkFor === "return" ? "Say what needs to change. The owner sees this in the log." : "Add a note for the owner if there is anything they should know."}
        label={remarkFor === "return" ? "What needs to change" : "Remark"}
        confirmLabel={remarkFor === "return" ? "Return" : "Approve"}
        required={remarkFor === "return"}
        busy={busy}
        onConfirm={(remark) => review(remarkFor === "return" ? "reject" : "approve", remark || undefined)}
      />
    </>
  );
}
