import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Clock, Paperclip, Loader2, Link2, Pencil, Trash2 } from "lucide-react";

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

type DevTaskStatus = "not_started" | "in_progress" | "in_review" | "done";

interface DevTaskReview {
  id: number;
  status: "in_review" | "approved" | "rejected";
  prLink: string | null;
  note: string | null;
  submittedAt: string;
  reviewerId: number | null;
  reviewerName: string | null;
  evidence: { id: number; filename: string; mimeType: string; size: number }[];
}

interface DevTask {
  id: number;
  name: string;
  /** Free-text detail from the Dev Lead. Stored server-side in tasks.notes. */
  description: string | null;
  status: DevTaskStatus;
  assigneeIds: number[];
  assigneeNames: string[];
  review: DevTaskReview | null;
}

function StatusBadge({ status }: { status: DevTaskStatus }) {
  switch (status) {
    case "in_progress":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> In progress</Badge>;
    case "in_review":
      return <Badge className="gap-1 bg-amber-100 text-amber-800 border-amber-200"><Clock className="w-3 h-3" /> In review</Badge>;
    case "done":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Done</Badge>;
    default:
      return <Badge variant="outline">Not started</Badge>;
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export interface DevTasksPanelProps {
  reqId: number;
  requirementProjectId: number | null;
  requirementModule: string | null;
  isBlocked: boolean;
  /** True once the requirement has ≥1 dev task — the parent Development card
   *  uses this to hide the manual "Mark Ready for QA" button. */
  onTaskCountChange?: (count: number, doneCount: number) => void;
}

export function DevTasksPanel({ reqId, requirementProjectId, requirementModule, isBlocked }: DevTasksPanelProps) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isLeadTier = ((user as any)?.tierRank ?? 1) >= 2;
  const isDevLead = ((user as any)?.department === "dev" && isLeadTier) || ["admin", "cto"].includes(user?.role ?? "");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState<string>("");
  const [addLoading, setAddLoading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Two-step delete: removing a task silently changes whether the requirement
  // counts as "all dev tasks done", so it shouldn't be one stray click away.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [reviewOpenFor, setReviewOpenFor] = useState<number | null>(null);
  const [prLinkDraft, setPrLinkDraft] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [rejectOpenFor, setRejectOpenFor] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [decisionLoading, setDecisionLoading] = useState<number | null>(null);

  const tasksKey = ["dev-tasks", reqId];
  const { data: tasks = [], isLoading } = useQuery<DevTask[]>({
    queryKey: tasksKey,
    queryFn: async () => {
      const res = await api(`/requirements/${reqId}/dev-tasks`, token);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reqId,
  });

  const { data: devUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["users-dev"],
    // Needed by the add form and by the Dev Lead's edit form (reassignment).
    enabled: isDevLead,
    queryFn: async () => {
      const res = await api(`/users`, token);
      if (!res.ok) return [];
      const all: { id: number; name: string; role: string }[] = await res.json();
      return all.filter((u) => ["dev_member", "dev_lead", "hod_dev"].includes(u.role));
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: tasksKey });
    queryClient.invalidateQueries({ queryKey: ["requirement", reqId] });
    queryClient.invalidateQueries({ queryKey: ["requirement-history", reqId] });
  };

  const addTask = async () => {
    if (!newName.trim() || !newAssigneeId) {
      toast({ variant: "destructive", title: "Task name and assignee are required" });
      return;
    }
    setAddLoading(true);
    try {
      const res = await api(`/tasks`, token, {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          requirementId: reqId,
          projectId: requirementProjectId,
          assigneeIds: [Number(newAssigneeId)],
          status: "not_started",
          // Server-side column is `notes` — see the tasks schema comment.
          ...(newDescription.trim() ? { notes: newDescription.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Failed to create task" }); return; }
      toast({ title: "Dev task created" });
      setNewName(""); setNewDescription(""); setNewAssigneeId(""); setAddOpen(false);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to create task" });
    } finally {
      setAddLoading(false);
    }
  };

  const openEdit = (t: DevTask) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDescription(t.description ?? "");
    setEditAssigneeId(t.assigneeIds[0] != null ? String(t.assigneeIds[0]) : "");
  };

  const saveEdit = async (taskId: number) => {
    if (!editName.trim()) {
      toast({ variant: "destructive", title: "Task name is required" });
      return;
    }
    setEditLoading(true);
    try {
      const res = await api(`/tasks/${taskId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          notes: editDescription.trim() || null,
          // Only the lead may reassign, so only the lead sends the field —
          // the server refuses it from an assignee rather than ignoring it.
          ...(isDevLead && editAssigneeId ? { assigneeIds: [Number(editAssigneeId)] } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Failed to update task" }); return; }
      toast({ title: "Dev task updated" });
      setEditingId(null);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to update task" });
    } finally {
      setEditLoading(false);
    }
  };

  const deleteTask = async (taskId: number) => {
    setDeletingId(taskId);
    try {
      const res = await api(`/tasks/${taskId}`, token, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: data.error ?? "Failed to delete task" });
        return;
      }
      toast({ title: "Dev task deleted" });
      setEditingId(null);
      setConfirmDeleteId(null);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Failed to delete task" });
    } finally {
      setDeletingId(null);
    }
  };

  const openSubmitPanel = (taskId: number) => {
    setReviewOpenFor(taskId);
    setPrLinkDraft("");
    setEvidenceFile(null);
  };

  const submitForReview = async (taskId: number) => {
    setSubmitLoading(true);
    try {
      let evidence: { filename: string; mimeType: string; data: string } | undefined;
      if (evidenceFile) {
        if (evidenceFile.size > MAX_EVIDENCE_BYTES) {
          toast({ variant: "destructive", title: "Evidence file must be under 5MB" });
          setSubmitLoading(false);
          return;
        }
        evidence = { filename: evidenceFile.name, mimeType: evidenceFile.type, data: await fileToBase64(evidenceFile) };
      }
      const res = await api(`/tasks/${taskId}/submit-review`, token, {
        method: "POST",
        body: JSON.stringify({ prLink: prLinkDraft.trim() || undefined, evidence }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Submit failed" }); return; }
      toast({ title: "Submitted for review" });
      setReviewOpenFor(null);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Submit failed" });
    } finally {
      setSubmitLoading(false);
    }
  };

  const decide = async (taskId: number, decision: "approve" | "reject", note?: string) => {
    setDecisionLoading(taskId);
    try {
      const res = await api(`/tasks/${taskId}/review`, token, {
        method: "POST",
        body: JSON.stringify({ decision, note: note?.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Review failed" }); return; }
      toast({ title: decision === "approve" ? "Approved — task marked Done" : "Changes requested" });
      setRejectOpenFor(null);
      setRejectNote("");
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Review failed" });
    } finally {
      setDecisionLoading(null);
    }
  };

  // Evidence download needs the Bearer token, which a plain <a href> can't send
  // (this app authenticates via JWT-in-localStorage, not cookies) — same fix
  // RequirementDetail.tsx's downloadAttachment already uses for attachments:
  // fetch with the header, then open the blob instead of navigating directly.
  const viewEvidence = async (evidenceId: number, filename: string) => {
    try {
      const res = await api(`/requirements/dev-tasks/evidence/${evidenceId}/download`, token);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      toast({ variant: "destructive", title: `Failed to open ${filename}` });
    }
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-semibold">Dev Tasks</CardTitle>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Only a task&apos;s own assignee can submit it — a different dev has to approve before it counts as Done.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tasks.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{doneCount} of {tasks.length} done</span>
          )}
          {isDevLead && (
            <Button size="sm" variant="outline" disabled={isBlocked} onClick={() => setAddOpen((v) => !v)}>
              + Add task
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            No dev tasks yet — this requirement can&apos;t reach Ready for QA until {isDevLead ? "you add" : "the Dev Lead adds"} at least one.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const isAssignee = t.assigneeIds.includes(user?.id ?? -1);
              const canSubmit = isAssignee && (t.status === "not_started" || t.status === "in_progress");
              // The lead who broke the work down and the dev doing it both need
              // to be able to fix a name or fill in the description. Same rule
              // the server enforces on PATCH /tasks/:id.
              const canEditTask = isDevLead || isAssignee;
              const canReview = t.status === "in_review" && !isAssignee && ((user as any)?.department === "dev" || isLeadTier || ["admin", "cto"].includes(user?.role ?? ""));

              return (
                <div key={t.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.assigneeNames.join(", ") || "Unassigned"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={t.status} />
                      {canEditTask && editingId !== t.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={isBlocked}
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {t.description && editingId !== t.id && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.description}</p>
                  )}

                  {editingId === t.id && (
                    <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
                      <p className="text-xs font-medium">Edit task</p>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Task name"
                        className="h-8 text-xs"
                      />
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="text-xs min-h-[60px]"
                      />
                      {isDevLead ? (
                        <Select value={editAssigneeId} onValueChange={setEditAssigneeId}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assignee…" /></SelectTrigger>
                          <SelectContent>
                            {devUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Assigned to {t.assigneeNames.join(", ") || "nobody"} — only the Dev Lead can reassign.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" disabled={editLoading} onClick={() => saveEdit(t.id)}>
                          {editLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Save
                        </Button>
                        <Button size="sm" variant="ghost" disabled={editLoading} onClick={() => { setEditingId(null); setConfirmDeleteId(null); }}>Cancel</Button>
                        {isDevLead && (
                          confirmDeleteId === t.id ? (
                            <div className="ml-auto flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Delete this task?</span>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deletingId === t.id}
                                onClick={() => deleteTask(t.id)}
                              >
                                {deletingId === t.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Yes, delete
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>No</Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="ml-auto text-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteId(t.id)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {(t.review?.prLink || (t.review?.evidence?.length ?? 0) > 0) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {t.review?.prLink && (
                        <a href={t.review.prLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5">
                          <Link2 className="w-3 h-3" /> {t.review.prLink.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                      {t.review?.evidence.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => viewEvidence(e.id, e.filename)}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5"
                        >
                          <Paperclip className="w-3 h-3" /> {e.filename} · {fmtSize(e.size)}
                        </button>
                      ))}
                    </div>
                  )}

                  {t.status === "done" && t.review?.reviewerName && (
                    <p className="text-xs text-green-700">
                      ✓ Code review passed — reviewed by {t.review.reviewerName}
                      {t.review.note ? `: "${t.review.note}"` : ""}
                    </p>
                  )}

                  {/* Ungated by t.status — a rejection reverts the task to in_progress,
                      so this is the only place the assignee can still learn what to fix
                      once the "in review" screen it was said on is gone. */}
                  {t.review?.status === "rejected" && t.review.note && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ↩ {t.review.reviewerName ?? "A reviewer"} requested changes: "{t.review.note}"
                    </p>
                  )}

                  {canSubmit && reviewOpenFor !== t.id && (
                    <Button size="sm" variant="link" className="h-auto p-0 text-xs" disabled={isBlocked} onClick={() => openSubmitPanel(t.id)}>
                      Submit for review →
                    </Button>
                  )}
                  {!canSubmit && t.status !== "in_review" && t.status !== "done" && (
                    <p className="text-xs text-muted-foreground italic">
                      Only {t.assigneeNames[0] ?? "the assignee"} can submit this for review
                    </p>
                  )}

                  {reviewOpenFor === t.id && (
                    <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
                      <p className="text-xs font-medium">Submit for code review</p>
                      <p className="text-xs text-muted-foreground">A peer dev has to approve before this counts as Done. Both fields are optional — either one is enough.</p>
                      <Input
                        placeholder="PR / commit link (optional)"
                        value={prLinkDraft}
                        onChange={(e) => setPrLinkDraft(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
                        className="text-xs"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={submitLoading} onClick={() => submitForReview(t.id)}>
                          {submitLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Submit for review
                        </Button>
                        <Button size="sm" variant="ghost" disabled={submitLoading} onClick={() => setReviewOpenFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {t.status === "in_review" && canReview && rejectOpenFor !== t.id && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={decisionLoading === t.id} onClick={() => decide(t.id, "approve")}>
                        {decisionLoading === t.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40" disabled={decisionLoading === t.id} onClick={() => setRejectOpenFor(t.id)}>
                        Request changes
                      </Button>
                    </div>
                  )}
                  {t.status === "in_review" && !canReview && !isAssignee && (
                    <p className="text-xs text-muted-foreground italic">Awaiting peer code review.</p>
                  )}
                  {t.status === "in_review" && isAssignee && (
                    <p className="text-xs text-muted-foreground italic">Waiting for a peer to review — you can&apos;t approve your own work.</p>
                  )}

                  {rejectOpenFor === t.id && (
                    <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
                      <Textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="What needs fixing?"
                        className="text-xs min-h-[52px]"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" disabled={decisionLoading === t.id} onClick={() => decide(t.id, "reject", rejectNote)}>
                          Send back to dev
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectOpenFor(null); setRejectNote(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {addOpen && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <Input placeholder="Task name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-xs" />
            <Textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="text-xs min-h-[60px]"
            />
            <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assignee…" /></SelectTrigger>
              <SelectContent>
                {devUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" disabled={addLoading} onClick={addTask}>
                {addLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
