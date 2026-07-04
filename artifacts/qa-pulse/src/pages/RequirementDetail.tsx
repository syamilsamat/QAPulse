import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  MessageSquare,
  ChevronRight,
  AlertTriangle,
  CheckSquare,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

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

function ReviewStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>;
    case "rejected":
      return <Badge className="gap-1 bg-red-100 text-red-700 border-red-200"><XCircle className="w-3 h-3" /> Rejected</Badge>;
    case "in_review":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> In Review</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

export default function RequirementDetail() {
  const [, params] = useRoute("/requirements/:id");
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reqId = params?.id ? parseInt(params.id) : null;

  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewAction, setReviewAction] = useState<"submit" | "approve" | "reject" | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const { data: req, isLoading } = useQuery<any>({
    queryKey: ["requirement", reqId],
    queryFn: async () => {
      const res = await api(`/requirements/${reqId}`, token);
      if (!res.ok) throw new Error("Failed to load requirement");
      return res.json();
    },
    enabled: !!reqId,
  });

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ["requirement-comments", reqId],
    queryFn: async () => {
      const res = await api(`/requirements/${reqId}/comments`, token);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reqId,
  });

  const { data: milestone } = useQuery<any>({
    queryKey: ["milestone", req?.milestoneId],
    queryFn: async () => {
      const res = await api(`/milestones/${req.milestoneId}`, token);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!req?.milestoneId,
  });

  const submitComment = async () => {
    if (!commentBody.trim() || !reqId) return;
    setSubmittingComment(true);
    try {
      const res = await api(`/requirements/${reqId}/comments`, token, {
        method: "POST",
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["requirement-comments", reqId] });
      toast({ title: "Comment posted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to post comment" });
    } finally {
      setSubmittingComment(false);
    }
  };

  const doReview = async (action: "submit" | "approve" | "reject") => {
    if (!reqId) return;
    setReviewLoading(true);
    try {
      const res = await api(`/requirements/${reqId}/review`, token, {
        method: "PATCH",
        body: JSON.stringify({ action, comment: reviewComment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Review action failed" }); return; }
      toast({ title: action === "submit" ? "Submitted for review" : action === "approve" ? "Requirement approved" : "Requirement rejected" });
      setReviewAction(null);
      setReviewComment("");
      queryClient.invalidateQueries({ queryKey: ["requirement", reqId] });
    } catch {
      toast({ variant: "destructive", title: "Review action failed" });
    } finally {
      setReviewLoading(false);
    }
  };

  const role = user?.role ?? "";
  const FA_ROLES = ["fa_lead", "fa_member", "hod_fa", "admin", "qa_lead", "hod_qa"];
  const canReview = FA_ROLES.includes(role);
  const isAuthor = req?.createdBy === user?.id;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
  );

  if (!req) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <AlertTriangle className="w-10 h-10 text-yellow-500" />
      <p className="text-muted-foreground">Requirement not found.</p>
      <Button variant="outline" onClick={() => navigate("/requirements")}>Back</Button>
    </div>
  );

  const ac: string[] = Array.isArray(req.acceptanceCriteria) ? req.acceptanceCriteria : [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <button onClick={() => navigate("/requirements")} className="hover:text-foreground transition-colors">Requirements</button>
        <ChevronRight className="w-4 h-4" />
        <span className="text-foreground font-medium truncate max-w-xs">{req.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/requirements")} className="mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{req.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {req.redmineTicketId && (
                <span className="text-xs font-mono text-muted-foreground">#{req.redmineTicketId}</span>
              )}
              <ReviewStatusBadge status={req.reviewStatus ?? "draft"} />
              {req.projectName && <Badge variant="outline">{req.projectName}</Badge>}
              {req.module && <Badge variant="outline">{req.module}</Badge>}
              {milestone && <Badge className="bg-violet-50 text-violet-700 border-violet-200">{milestone.name}</Badge>}
            </div>
          </div>
        </div>

        {/* Review actions */}
        {canReview && (
          <div className="flex gap-2 flex-wrap shrink-0">
            {req.reviewStatus === "draft" && (
              <Button size="sm" variant="outline" onClick={() => setReviewAction("submit")}>
                Submit for Review
              </Button>
            )}
            {req.reviewStatus === "in_review" && !isAuthor && (
              <>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setReviewAction("approve")}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setReviewAction("reject")}>
                  Reject
                </Button>
              </>
            )}
            {req.reviewStatus === "rejected" && isAuthor && (
              <Button size="sm" variant="outline" onClick={() => setReviewAction("submit")}>
                Re-submit
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Review action panel */}
      {reviewAction && (
        <Card className="border-2 border-dashed border-muted">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">
              {reviewAction === "submit" ? "Submit this requirement for FA review?" :
               reviewAction === "approve" ? "Approve this requirement?" :
               "Reject this requirement?"}
            </p>
            <Textarea
              placeholder="Add a comment (optional)…"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={reviewLoading} onClick={() => doReview(reviewAction)}>
                {reviewLoading ? "Processing…" : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setReviewAction(null); setReviewComment(""); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {req.description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{req.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Acceptance Criteria */}
          {ac.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" /> Acceptance Criteria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {ac.map((criterion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Square className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Discussion Thread */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Discussion
                {comments.length > 0 && (
                  <Badge variant="secondary" className="ml-1">{comments.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground">No comments yet. Start the discussion below.</p>
              )}
              {comments.map((c: any) => (
                <div key={c.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {c.authorName?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">{c.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.createdAt), "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="space-y-2">
                <Textarea
                  placeholder="Write a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  onClick={submitComment}
                  disabled={submittingComment || !commentBody.trim()}
                  className="gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingComment ? "Posting…" : "Post Comment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span className="font-medium capitalize">{req.priority ?? "Normal"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{req.status ?? "—"}</span>
              </div>
              {req.release && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Release</span>
                  <span className="font-medium">{req.release}</span>
                </div>
              )}
              {req.tracker && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracker</span>
                  <span className="font-medium">{req.tracker}</span>
                </div>
              )}
              {req.assigneeName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assignee</span>
                  <span className="font-medium">{req.assigneeName}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-xs">{format(new Date(req.createdAt), "dd MMM yyyy")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-xs">{format(new Date(req.updatedAt), "dd MMM yyyy")}</span>
              </div>
              {req.approvedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved</span>
                  <span className="text-xs text-green-600">{format(new Date(req.approvedAt), "dd MMM yyyy")}</span>
                </div>
              )}
              {req.rejectedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rejected</span>
                  <span className="text-xs text-red-600">{format(new Date(req.rejectedAt), "dd MMM yyyy")}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
