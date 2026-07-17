import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRequirements, getListRequirementsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  History as HistoryIcon,
  Send,
  MessageSquare,
  ChevronRight,
  AlertTriangle,
  CheckSquare,
  Square,
  Paperclip,
  Download,
  Trash2,
  Loader2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level?.toLowerCase()] ?? colors.medium}`}>
      {level}
    </span>
  );
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

// CR030 — dev handoff status
function DevStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "assigned":
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Assigned</Badge>;
    case "in_progress":
      return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Clock className="w-3 h-3" /> In Progress</Badge>;
    case "ready_for_qa":
      return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3" /> Ready for QA</Badge>;
    default:
      return <Badge variant="outline">Not started</Badge>;
  }
}

export default function RequirementDetail() {
  const [, params] = useRoute("/requirements/:id");
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reqId = params?.id ? parseInt(params.id) : null;
  // CR030 — dev handoff: Lead-tier+ can assign a developer
  const isLeadTier = ((user as any)?.tierRank ?? 1) >= 2;

  const [commentBody, setCommentBody] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewAction, setReviewAction] = useState<"submit" | "approve" | "reject" | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  // CR046 — QA returning a ready_for_qa requirement back to dev
  const [returnMode, setReturnMode] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  // CR031 — requirement defect raise/reassign
  const [raiseDefectOpen, setRaiseDefectOpen] = useState(false);
  const [defectTitle, setDefectTitle] = useState("");
  const [defectDescription, setDefectDescription] = useState("");
  const [defectSeverity, setDefectSeverity] = useState("medium");
  const [defectLoading, setDefectLoading] = useState(false);

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

  // Shared cache with the Requirements list page — reused here to walk the
  // parentId ancestry chain and list this requirement's children.
  const { data: allRequirements = [] } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const reqMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const r of allRequirements as any[]) map.set(r.id, r);
    return map;
  }, [allRequirements]);

  const ancestors = useMemo(() => {
    const chain: any[] = [];
    const seen = new Set<number>();
    let current = req;
    while (current?.parentId && reqMap.has(current.parentId) && !seen.has(current.parentId)) {
      const parent = reqMap.get(current.parentId);
      chain.unshift(parent);
      seen.add(current.parentId);
      current = parent;
    }
    return chain;
  }, [req, reqMap]);

  const children = useMemo(
    () => (allRequirements as any[]).filter((r) => r.parentId === req?.id),
    [allRequirements, req],
  );

  const { data: history = [] } = useQuery<any[]>({
    queryKey: ["requirement-history", reqId],
    queryFn: async () => {
      const res = await api(`/requirements/${reqId}/history`, token);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reqId,
  });

  const { data: devUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["users-dev"],
    enabled: isLeadTier,
    queryFn: async () => {
      const res = await api(`/users`, token);
      if (!res.ok) return [];
      const all: { id: number; name: string; role: string }[] = await res.json();
      return all.filter((u) => ["dev_member", "dev_lead", "hod_dev"].includes(u.role));
    },
  });

  // CR031 — requirement defects raised against this requirement
  const { data: reqDefects = [], refetch: refetchReqDefects } = useQuery<any[]>({
    queryKey: ["requirement-defects", reqId],
    enabled: !!reqId,
    queryFn: async () => {
      const res = await api(`/defects?source=requirement`, token);
      if (!res.ok) return [];
      const all: any[] = await res.json();
      return all.filter((d) =>
        d.links?.some((l: any) => l.linkType === "requirement" && l.requirementId === reqId),
      );
    },
  });

  // CR031 — dev+QA users a requirement defect can be handed off to
  const { data: handoffUsers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["users-handoff"],
    queryFn: async () => {
      const res = await api(`/users`, token);
      if (!res.ok) return [];
      const all: { id: number; name: string; role: string }[] = await res.json();
      return all.filter((u) =>
        ["dev_member", "dev_lead", "hod_dev", "qa_member", "qa_lead", "hod_qa"].includes(u.role),
      );
    },
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery<any[]>({
    queryKey: ["requirement-attachments", reqId],
    queryFn: async () => {
      const res = await api(`/requirements/${reqId}/attachments`, token);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!reqId,
  });

  const uploadAttachment = (file: File): Promise<void> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const res = await api(`/requirements/${reqId}/attachments`, token, {
            method: "POST",
            body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", data: base64 }),
          });
          if (res.ok) { await refetchAttachments(); resolve(); }
          else reject(new Error("Upload failed"));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    setUploadingFiles(true);
    try {
      const results = await Promise.allSettled(files.map(f => uploadAttachment(f)));
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed > 0) toast({ variant: "destructive", title: `${failed} file(s) failed to upload` });
      else toast({ title: `${files.length} file(s) attached` });
    } finally {
      setUploadingFiles(false);
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    try {
      const res = await api(`/requirements/attachments/${attachmentId}`, token, { method: "DELETE" });
      if (res.ok) { await refetchAttachments(); toast({ title: "Attachment deleted" }); }
      else toast({ variant: "destructive", title: "Failed to delete attachment" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete attachment" });
    }
  };

  const downloadAttachment = (attachmentId: number, filename: string) => {
    const url = `${getApiUrl()}/requirements/attachments/${attachmentId}/download`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(url, { headers }).then(res => res.blob()).then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.click();
      URL.revokeObjectURL(objectUrl);
    }).catch(() => toast({ variant: "destructive", title: "Download failed" }));
  };

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

  const doDevAction = async (action: "assign" | "start" | "ready_for_qa" | "return_to_dev", devAssigneeId?: number, reason?: string) => {
    if (!reqId) return;
    setDevLoading(true);
    try {
      const res = await api(`/requirements/${reqId}/dev`, token, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          ...(devAssigneeId != null ? { devAssigneeId } : {}),
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Action failed" }); return; }
      toast({
        title: action === "assign" ? "Assigned for development"
          : action === "start" ? "Marked in progress"
          : action === "return_to_dev" ? "Returned to development"
          : "Marked ready for QA",
      });
      setReturnMode(false);
      setReturnReason("");
      queryClient.invalidateQueries({ queryKey: ["requirement", reqId] });
    } catch {
      toast({ variant: "destructive", title: "Action failed" });
    } finally {
      setDevLoading(false);
    }
  };

  // CR031 — raise a requirement defect (auto-routes to the requirement author)
  const raiseDefect = async () => {
    if (!reqId || !defectTitle.trim()) return;
    setDefectLoading(true);
    try {
      const res = await api(`/defects`, token, {
        method: "POST",
        body: JSON.stringify({
          source: "requirement",
          requirementId: reqId,
          title: defectTitle.trim(),
          description: defectDescription.trim() || undefined,
          severity: defectSeverity,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Failed to raise defect" }); return; }
      toast({ title: `${data.defectCode ?? "Defect"} raised against this requirement` });
      setRaiseDefectOpen(false);
      setDefectTitle("");
      setDefectDescription("");
      setDefectSeverity("medium");
      refetchReqDefects();
    } catch {
      toast({ variant: "destructive", title: "Failed to raise defect" });
    } finally {
      setDefectLoading(false);
    }
  };

  // CR031 — the current assignee hands the defect off to dev or QA
  const reassignDefect = async (defectId: number, assigneeId: number) => {
    setDefectLoading(true);
    try {
      const res = await api(`/defects/${defectId}/assign`, token, {
        method: "PATCH",
        body: JSON.stringify({ assigneeId }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: data.error ?? "Reassignment failed" }); return; }
      toast({ title: "Defect reassigned" });
      refetchReqDefects();
    } catch {
      toast({ variant: "destructive", title: "Reassignment failed" });
    } finally {
      setDefectLoading(false);
    }
  };

  const runAiAnalysis = async () => {
    if (!reqId || !req) return;
    setAiLoading(true);
    try {
      const res = await api(`/ai/analyze-requirement`, token, {
        method: "POST",
        body: JSON.stringify({
          requirementId: reqId,
          title: req.title,
          description: req.description ?? "",
          module: req.module ?? "",
        }),
      });
      const data = await res.json();
      setAiResult(data);
      queryClient.invalidateQueries({ queryKey: ["requirement-history", reqId] });
    } catch {
      toast({ variant: "destructive", title: "AI analysis failed" });
    } finally {
      setAiLoading(false);
    }
  };

  const role = user?.role ?? "";
  const FA_ROLES = ["fa_lead", "fa_member", "hod_fa", "admin", "qa_lead", "hod_qa"];
  const canReview = FA_ROLES.includes(role);
  const isAuthor = req?.createdBy === user?.id;

  // Edit permission mirrors PATCH /requirements/:id on the backend:
  // author/assignee always can; a Redmine-imported requirement can also be
  // edited by any FA-tier reviewer, since its "author" is often just a
  // Redmine-resolved fallback rather than a real accountable QAPulse user.
  const canEditReq =
    ["admin", "cto"].includes(role) ||
    isAuthor ||
    req?.assigneeId === user?.id ||
    (!!req?.redmineTicketId && canReview);

  // CR031 — who may raise a requirement defect (must mirror
  // REQUIREMENT_DEFECT_RAISER_ROLES in artifacts/api-server/src/routes/defects.ts)
  const REQUIREMENT_DEFECT_RAISER_ROLES = [
    "dev_member", "dev_lead", "hod_dev",
    "qa_member", "qa_lead", "hod_qa",
    "admin", "cto",
  ];
  const canRaiseDefect = REQUIREMENT_DEFECT_RAISER_ROLES.includes(role) && req?.reviewStatus === "approved";
  const openReqDefects = reqDefects.filter((d) => !/closed|verified|rejected|cancelled/i.test(d.status));

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
      {/* Breadcrumb — traces the actual parentId ancestry, root first */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <button onClick={() => navigate("/requirements")} className="hover:text-foreground transition-colors">Requirements</button>
        {ancestors.map((a) => (
          <div key={a.id} className="flex items-center gap-1">
            <ChevronRight className="w-4 h-4 shrink-0" />
            <button
              onClick={() => navigate(`/requirements/${a.id}`)}
              className="hover:text-foreground transition-colors truncate max-w-[10rem]"
            >
              {a.title}
            </button>
          </div>
        ))}
        <ChevronRight className="w-4 h-4 shrink-0" />
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

        {/* Review actions + AI Analyzer (available to author and approver alike) */}
        <div className="flex gap-2 flex-wrap shrink-0">
          {canEditReq && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/requirements?edit=${req.id}`)}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" disabled={aiLoading} onClick={runAiAnalysis}>
            <Brain className="w-3.5 h-3.5" />
            {aiLoading ? "Analyzing…" : "Analyze with AI"}
          </Button>
          {canReview && (
            <>
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
            </>
          )}
        </div>
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

          {/* AI Requirement Analyzer — inline expansion, directly below Description */}
          {aiResult && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> AI Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Quality Score</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${aiResult.score}%` }} />
                    </div>
                    <span className="font-bold text-primary">{aiResult.score}/100</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Risk Level:</span>
                  <RiskBadge level={aiResult.riskLevel} />
                </div>
                {aiResult.summary && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{aiResult.summary}</p>
                )}
                {aiResult.missingItems?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Missing Items</p>
                    <ul className="space-y-1">
                      {aiResult.missingItems.map((item: string, i: number) => (
                        <li key={i} className="text-sm flex gap-2">
                          <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiResult.questions?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Questions to Clarify</p>
                    <ul className="space-y-1">
                      {aiResult.questions.map((q: string, i: number) => (
                        <li key={i} className="text-sm flex gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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

          {/* Attachments */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Paperclip className="w-4 h-4" /> Attachments
                  {attachments.length > 0 && <span className="text-xs font-normal text-muted-foreground">({attachments.length})</span>}
                </CardTitle>
                <label className={`cursor-pointer ${uploadingFiles ? "pointer-events-none opacity-60" : ""}`}>
                  {uploadingFiles
                    ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    : <span className="text-xs text-primary hover:underline flex items-center gap-1"><Paperclip className="w-3 h-3" />Attach file</span>
                  }
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} disabled={uploadingFiles} />
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attachments yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((a: any) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm group">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{a.filename}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{a.size ? `${(a.size / 1024).toFixed(0)} KB` : ""}</span>
                      {a.redmineAttachmentId && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 shrink-0">Redmine</span>
                      )}
                      <button
                        title="Download"
                        onClick={() => downloadAttachment(a.id, a.filename)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deleteAttachment(a.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Child Requirements */}
          {children.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Child Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {children.map((c: any) => (
                    <li key={c.id}>
                      <button
                        onClick={() => navigate(`/requirements/${c.id}`)}
                        className="text-sm text-primary hover:underline text-left"
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* History — chronological activity journal (creation, review actions, AI runs) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <HistoryIcon className="w-4 h-4" /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {history.map((h: any) => (
                    <li key={h.id} className="flex gap-3">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm">{h.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.actorName ?? "System"} · {format(new Date(h.createdAt), "dd MMM yyyy, HH:mm")}
                        </p>
                        {h.type === "requirement_ai_analysis" && h.newValue && (
                          <div className="mt-1 text-xs bg-muted/50 rounded p-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Score: {h.newValue.score}/100</span>
                              <RiskBadge level={h.newValue.riskLevel} />
                            </div>
                            {h.newValue.summary && <p>{h.newValue.summary}</p>}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

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
                  <span className="text-muted-foreground">Release (legacy)</span>
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
                <span className="text-muted-foreground">Test Cases</span>
                <span className="font-medium">{req.tcCount ?? 0}</span>
              </div>
              {(req.execPass > 0 || req.execFail > 0) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Executions</span>
                  <span className="font-medium">
                    <span className="text-green-600">{req.execPass ?? 0} pass</span>
                    {" / "}
                    <span className="text-red-600">{req.execFail ?? 0} fail</span>
                  </span>
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

          {/* Development — dev handoff workflow (CR030) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Development</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {req.reviewStatus !== "approved" ? (
                <p className="text-xs text-muted-foreground">Awaiting FA approval before dev handoff.</p>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <DevStatusBadge status={req.devStatus} />
                  </div>

                  {isLeadTier ? (
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted-foreground">Assignee</span>
                      <Select
                        value={req.devAssigneeId ? String(req.devAssigneeId) : ""}
                        onValueChange={(v) => doDevAction("assign", Number(v))}
                        disabled={devLoading}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign a developer…" /></SelectTrigger>
                        <SelectContent>
                          {devUsers.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    req.devAssigneeName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Assignee</span>
                        <span className="font-medium">{req.devAssigneeName}</span>
                      </div>
                    )
                  )}

                  {req.devAssigneeId && (isLeadTier || req.devAssigneeId === user?.id) && req.devStatus !== "ready_for_qa" && (
                    <div className="flex gap-2">
                      {req.devStatus === "assigned" && (
                        <Button size="sm" variant="outline" disabled={devLoading} onClick={() => doDevAction("start")}>
                          Start Work
                        </Button>
                      )}
                      {(req.devStatus === "assigned" || req.devStatus === "in_progress") && (
                        <Button size="sm" disabled={devLoading} onClick={() => doDevAction("ready_for_qa")}>
                          Mark Ready for QA
                        </Button>
                      )}
                    </div>
                  )}

                  {req.readyForQaAt && (
                    <p className="text-xs text-green-600">Ready for QA since {format(new Date(req.readyForQaAt), "dd MMM yyyy")}</p>
                  )}

                  {/* CR046 — QA can push a not-actually-done requirement back to dev */}
                  {req.devStatus === "ready_for_qa" &&
                    (["qa_member", "qa_lead", "hod_qa", "admin", "cto"].includes(user?.role ?? "") || isLeadTier) && (
                    returnMode ? (
                      <div className="space-y-2 pt-1">
                        <Textarea
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder="What's missing or broken? (sent to the developer)"
                          className="text-xs min-h-[60px]"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={devLoading} onClick={() => doDevAction("return_to_dev", undefined, returnReason)}>
                            Confirm Return
                          </Button>
                          <Button size="sm" variant="ghost" disabled={devLoading} onClick={() => { setReturnMode(false); setReturnReason(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" disabled={devLoading} onClick={() => setReturnMode(true)}>
                        Return to Dev
                      </Button>
                    )
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Requirement Defect — flag a problem with this requirement after approval (CR031) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                Requirement Defect
                {openReqDefects.length > 0 && (
                  <Badge variant="outline" className="text-[10px]">{openReqDefects.length} open</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {req.reviewStatus !== "approved" ? (
                <p className="text-xs text-muted-foreground">Available once this requirement is approved.</p>
              ) : (
                <>
                  {reqDefects.length === 0 && !raiseDefectOpen && (
                    <p className="text-xs text-muted-foreground">No defects raised against this requirement.</p>
                  )}

                  {reqDefects.map((d) => (
                    <div key={d.id} className="rounded-md border px-3 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{d.defectCode ?? `DEF-${d.id}`}</span>
                        <Badge variant="outline" className="text-[10px]">{d.status}</Badge>
                      </div>
                      <p className="text-xs">{d.title}</p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Assignee</span>
                        <span className="font-medium">{d.assigneeName ?? "Unassigned"}</span>
                      </div>
                      {d.assigneeId === user?.id && (
                        <Select
                          value=""
                          onValueChange={(v) => reassignDefect(d.id, Number(v))}
                          disabled={defectLoading}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Hand off to…" /></SelectTrigger>
                          <SelectContent>
                            {handoffUsers.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}

                  {canRaiseDefect && (
                    raiseDefectOpen ? (
                      <div className="space-y-2 rounded-md border px-3 py-2">
                        <input
                          className="w-full text-xs border rounded px-2 py-1.5"
                          placeholder="What's wrong with this requirement?"
                          value={defectTitle}
                          onChange={(e) => setDefectTitle(e.target.value)}
                        />
                        <Textarea
                          className="text-xs min-h-16"
                          placeholder="Details (optional)"
                          value={defectDescription}
                          onChange={(e) => setDefectDescription(e.target.value)}
                        />
                        <Select value={defectSeverity} onValueChange={setDefectSeverity}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["critical", "high", "medium", "low"].map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" disabled={defectLoading} onClick={() => setRaiseDefectOpen(false)}>
                            Cancel
                          </Button>
                          <Button size="sm" disabled={defectLoading || !defectTitle.trim()} onClick={raiseDefect}>
                            Raise Defect
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRaiseDefectOpen(true)}>
                        Raise Requirement Defect
                      </Button>
                    )
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
