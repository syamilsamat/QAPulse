import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_SCREENSHOT_FILE_BYTES, readFileAsDataUrl } from "@/components/ReportIssueTrigger";
import { Wrench, Loader2, ImageIcon, Pencil } from "lucide-react";

// CR079 — bugs/ideas/questions reported about QM Pulse itself (via the
// ReportIssueTrigger widget on every page), visible to every signed-in user.
// Admins triage (status); the person who reported an issue can edit it.
// Distinct from /defects, which tracks bugs in the client projects QM Pulse tests.

interface PlatformIssue {
  id: number;
  title: string;
  description: string | null;
  type: "bug" | "idea" | "question";
  severity: "blocking" | "major" | "minor";
  status: "open" | "in_progress" | "fixed" | "wont_fix" | "duplicate";
  reporterId: number | null;
  reporterName: string | null;
  pagePath: string | null;
  browserInfo: string | null;
  hasScreenshot: boolean;
  // Only present when a single issue is fetched, not in the list.
  screenshotUrl: string | null;
  promotedCr: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<PlatformIssue["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  wont_fix: "Won't fix",
  duplicate: "Duplicate",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "fixed", label: "Fixed" },
  { value: "wont_fix", label: "Won't fix" },
  { value: "duplicate", label: "Duplicate" },
];

const SEVERITY_STYLES: Record<PlatformIssue["severity"], string> = {
  blocking: "border-l-4 border-l-red-500",
  major: "border-l-4 border-l-amber-500",
  minor: "border-l-4 border-l-slate-300",
};

const SEVERITY_TEXT: Record<PlatformIssue["severity"], string> = {
  blocking: "text-red-600",
  major: "text-amber-600",
  minor: "text-muted-foreground",
};

const SEVERITY_LABELS: Record<PlatformIssue["severity"], string> = {
  blocking: "Blocking",
  major: "Major",
  minor: "Minor",
};

const TYPE_LABELS: Record<PlatformIssue["type"], string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
};

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export default function PlatformIssues() {
  const { token, user } = useAuth();
  const canTriage = user?.role === "admin";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  // Deep link from a status-change notification: /platform-issues?highlight=<id>
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("highlight"));
    if (Number.isInteger(id) && id > 0) setOpenId(id);
  }, []);

  const { data: issues = [], isLoading } = useQuery<PlatformIssue[]>({
    queryKey: ["platform-issues"],
    queryFn: async () => {
      const res = await api("/platform-issues", token);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = statusFilter === "all" ? issues : issues.filter((i) => i.status === statusFilter);
  const counts = STATUS_FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.value] = f.value === "all" ? issues.length : issues.filter((i) => i.status === f.value).length;
    return acc;
  }, {});

  const changeStatus = async (issue: PlatformIssue, status: PlatformIssue["status"]) => {
    setUpdatingId(issue.id);
    try {
      const res = await fetch(`${getApiUrl()}/platform-issues/${issue.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
      await qc.invalidateQueries({ queryKey: ["platform-issues"] });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't update status", description: err.message });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-5 h-5 text-slate-500" />
          Platform Issues
        </h1>
        <p className="text-sm text-muted-foreground">
          Bugs, ideas, and questions reported about QM Pulse itself — filed via the report button on any page.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={statusFilter === f.value ? "default" : "outline"}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label} · {counts[f.value] ?? 0}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          {statusFilter === "all" ? "No platform issues reported yet." : `No ${STATUS_LABELS[statusFilter as PlatformIssue["status"]]?.toLowerCase() ?? statusFilter} issues.`}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => (
            <div
              key={issue.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border bg-card p-3 pl-4 ${SEVERITY_STYLES[issue.severity]}`}
            >
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOpenId(issue.id)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{issue.title}</span>
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[issue.type]}</Badge>
                  <span className={`text-xs font-medium ${SEVERITY_TEXT[issue.severity]}`}>
                    {SEVERITY_LABELS[issue.severity]}
                  </span>
                  {issue.hasScreenshot && <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" aria-label="Has a screenshot" />}
                </div>
                {issue.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{issue.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {issue.reporterName ?? "Unknown reporter"} · {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}
                  {issue.pagePath ? ` · ${issue.pagePath}` : ""}
                </p>
              </button>

              {canTriage ? (
                <Select
                  value={issue.status}
                  onValueChange={(v) => changeStatus(issue, v as PlatformIssue["status"])}
                  disabled={updatingId === issue.id}
                >
                  <SelectTrigger className="w-full sm:w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="shrink-0 self-start sm:self-center">{STATUS_LABELS[issue.status]}</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {openId != null && (
        <IssueDialog
          key={openId}
          issueId={openId}
          token={token}
          canTriage={canTriage}
          currentUserId={user?.id}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

type ScreenshotEdit =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "new"; dataUrl: string };

function IssueDialog({
  issueId,
  token,
  canTriage,
  currentUserId,
  onClose,
}: {
  issueId: number;
  token: string | null;
  canTriage: boolean;
  currentUserId: number | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "bug" as PlatformIssue["type"], severity: "minor" as PlatformIssue["severity"] });
  const [shot, setShot] = useState<ScreenshotEdit>({ kind: "keep" });

  const { data: issue, isLoading, isError } = useQuery<PlatformIssue>({
    queryKey: ["platform-issue", issueId],
    queryFn: async () => {
      const res = await api(`/platform-issues/${issueId}`, token);
      if (!res.ok) throw new Error("Couldn't load this issue");
      return res.json();
    },
  });

  const canEdit = !!issue && (canTriage || (issue.reporterId != null && issue.reporterId === currentUserId));

  const startEdit = () => {
    if (!issue) return;
    setForm({ title: issue.title, description: issue.description ?? "", type: issue.type, severity: issue.severity });
    setShot({ kind: "keep" });
    setEditing(true);
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SCREENSHOT_FILE_BYTES) {
      toast({ variant: "destructive", title: "Screenshot too large", description: "Keep it under 5MB." });
      e.target.value = "";
      return;
    }
    setShot({ kind: "new", dataUrl: await readFileAsDataUrl(file) });
  };

  const save = async () => {
    if (!issue) return;
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "Title cannot be empty" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        severity: form.severity,
      };
      if (shot.kind === "new") body.screenshotUrl = shot.dataUrl;
      if (shot.kind === "remove") body.screenshotUrl = null;
      const res = await fetch(`${getApiUrl()}/platform-issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform-issues"] }),
        qc.invalidateQueries({ queryKey: ["platform-issue", issue.id] }),
      ]);
      toast({ title: "Issue updated" });
      setEditing(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't save changes", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const shownShot = shot.kind === "new" ? shot.dataUrl : shot.kind === "remove" ? null : issue?.screenshotUrl ?? null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !issue ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Couldn't load this issue.</p>
        ) : editing ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">Edit issue #{issue.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PlatformIssue["type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as PlatformIssue["severity"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SEVERITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Screenshot</Label>
                {shownShot && <img src={shownShot} alt="Attached screenshot" className="max-h-48 rounded border object-contain" />}
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={pickFile} className="text-sm" />
                  {shownShot && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setShot({ kind: "remove" })}>Remove</Button>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Save"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-base pr-6">{issue.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[issue.type]}</Badge>
                <span className={`text-xs font-medium ${SEVERITY_TEXT[issue.severity]}`}>{SEVERITY_LABELS[issue.severity]}</span>
                <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[issue.status]}</Badge>
                {issue.promotedCr && <Badge variant="outline" className="text-[10px]">{issue.promotedCr}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                #{issue.id} · {issue.reporterName ?? "Unknown reporter"} · {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}
                {issue.pagePath ? ` · ${issue.pagePath}` : ""}
              </p>
              {issue.description ? (
                <p className="text-sm whitespace-pre-wrap break-words">{issue.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
              {issue.screenshotUrl && (
                <img src={issue.screenshotUrl} alt="Attached screenshot" className="max-w-full rounded border" />
              )}
            </div>
            {canEdit && (
              <DialogFooter>
                <Button variant="outline" onClick={startEdit} className="gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
