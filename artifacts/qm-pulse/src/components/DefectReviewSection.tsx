import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, Paperclip, Loader2, Link2 } from "lucide-react";

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

interface DefectReview {
  id: number;
  status: "in_review" | "approved" | "rejected";
  prLink: string | null;
  note: string | null;
  reviewerId: number | null;
  reviewerName: string | null;
  evidence: { id: number; filename: string; mimeType: string; size: number }[];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export interface DefectReviewSectionProps {
  defectId: number;
  assigneeId: number | null;
}

/**
 * The code-review gate on a QA-sourced defect's Resolved/Fixed status push
 * (defects.ts's GATE_RESOLVED_STATES check) needs somewhere to actually be
 * satisfied from — this is that UI, the defect counterpart to
 * DevTasksPanel's task-level submit/approve/reject flow, driving the same
 * /defects/:id/submit-review and /defects/:id/review endpoints.
 */
export function DefectReviewSection({ defectId, assigneeId }: DefectReviewSectionProps) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isLeadTier = ((user as any)?.tierRank ?? 1) >= 2;
  const isAssignee = assigneeId != null && assigneeId === user?.id;

  const reviewKey = ["defect-review", defectId];
  const { data: review, isLoading } = useQuery<DefectReview | null>({
    queryKey: reviewKey,
    queryFn: async () => {
      const res = await api(`/defects/${defectId}/review`, token);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!defectId && assigneeId != null,
  });

  const [submitOpen, setSubmitOpen] = useState(false);
  const [prLinkDraft, setPrLinkDraft] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);

  if (assigneeId == null) return null; // gate never applies without a native assignee

  const refresh = () => queryClient.invalidateQueries({ queryKey: reviewKey });

  const submit = async () => {
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
      const res = await api(`/defects/${defectId}/submit-review`, token, {
        method: "POST",
        body: JSON.stringify({ prLink: prLinkDraft.trim() || undefined, evidence }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Submit failed" }); return; }
      toast({ title: "Submitted for review" });
      setSubmitOpen(false);
      setPrLinkDraft("");
      setEvidenceFile(null);
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Submit failed" });
    } finally {
      setSubmitLoading(false);
    }
  };

  const decide = async (decision: "approve" | "reject", note?: string) => {
    setDecisionLoading(true);
    try {
      const res = await api(`/defects/${defectId}/review`, token, {
        method: "POST",
        body: JSON.stringify({ decision, note: note?.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Review failed" }); return; }
      toast({ title: decision === "approve" ? "Code review approved" : "Changes requested" });
      setRejectOpen(false);
      setRejectNote("");
      refresh();
    } catch {
      toast({ variant: "destructive", title: "Review failed" });
    } finally {
      setDecisionLoading(false);
    }
  };

  const canReview = review?.status === "in_review" && !isAssignee && ((user as any)?.department === "dev" || isLeadTier || ["admin", "cto"].includes(user?.role ?? ""));
  const canSubmit = isAssignee && (!review || review.status === "rejected");

  if (isLoading) return null;

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Code Review</span>
        {review?.status === "approved" && (
          <span className="text-xs text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved — Resolved/Fixed unlocked</span>
        )}
        {review?.status === "in_review" && (
          <span className="text-xs text-amber-700 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> In review</span>
        )}
        {!review && <span className="text-xs text-muted-foreground">Not submitted yet</span>}
      </div>

      {(review?.prLink || (review?.evidence?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {review?.prLink && (
            <a href={review.prLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5">
              <Link2 className="w-3 h-3" /> {review.prLink.replace(/^https?:\/\//, "")}
            </a>
          )}
          {review?.evidence.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5">
              <Paperclip className="w-3 h-3" /> {e.filename} · {fmtSize(e.size)}
            </span>
          ))}
        </div>
      )}

      {review?.status === "approved" && review.note && (
        <p className="text-xs text-green-700">Reviewer note: "{review.note}"</p>
      )}
      {review?.status === "rejected" && review.note && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ↩ {review.reviewerName ?? "A reviewer"} requested changes: "{review.note}"
        </p>
      )}

      {canSubmit && !submitOpen && (
        <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setSubmitOpen(true)}>
          Submit for review →
        </Button>
      )}
      {!canSubmit && !isAssignee && review?.status !== "in_review" && review?.status !== "approved" && (
        <p className="text-xs text-muted-foreground italic">Only the assignee can submit this for review.</p>
      )}

      {submitOpen && (
        <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
          <p className="text-xs text-muted-foreground">Both fields optional — either one is enough.</p>
          <Input placeholder="PR / commit link (optional)" value={prLinkDraft} onChange={(e) => setPrLinkDraft(e.target.value)} className="h-8 text-xs" />
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" disabled={submitLoading} onClick={submit}>
              {submitLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Submit for review
            </Button>
            <Button size="sm" variant="ghost" disabled={submitLoading} onClick={() => setSubmitOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {review?.status === "in_review" && canReview && !rejectOpen && (
        <div className="flex gap-2">
          <Button size="sm" disabled={decisionLoading} onClick={() => decide("approve")}>
            {decisionLoading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Approve
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/40" disabled={decisionLoading} onClick={() => setRejectOpen(true)}>
            Request changes
          </Button>
        </div>
      )}
      {review?.status === "in_review" && !canReview && isAssignee && (
        <p className="text-xs text-muted-foreground italic">Waiting for a peer to review — you can't approve your own work.</p>
      )}
      {review?.status === "in_review" && !canReview && !isAssignee && (
        <p className="text-xs text-muted-foreground italic">Awaiting peer code review.</p>
      )}

      {rejectOpen && (
        <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/30">
          <Textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="What needs fixing?" className="text-xs min-h-[52px]" />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={decisionLoading} onClick={() => decide("reject", rejectNote)}>Send back to dev</Button>
            <Button size="sm" variant="ghost" onClick={() => { setRejectOpen(false); setRejectNote(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
