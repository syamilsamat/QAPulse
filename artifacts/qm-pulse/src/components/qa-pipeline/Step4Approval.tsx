import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, FileText, ListChecks, List, RefreshCw, Loader2 } from "lucide-react";

function api(path: string, token: string | null) {
  return fetch(`${getApiUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// The actual review happens on the Execution Dashboard (each compiled
// execution file has its own approve/reject flow, with segregation of duties
// — see PATCH /execution-files/:id/review). This step is a read-only mirror
// of that status for this milestone's file(s), not a second approval action.
export function Step4Approval({ milestoneId, locked = false }: { milestoneId: number, locked?: boolean }) {
  const { token } = useAuth();
  const [, setLocation] = useLocation();

  const { data: allFiles = [], isLoading, refetch } = useQuery({
    queryKey: ["execution-files"],
    queryFn: async () => {
      const res = await api("/execution-files", token);
      return res.ok ? res.json() : [];
    },
  });

  const files = useMemo(
    () => (allFiles as any[]).filter((f) => f.milestoneId === milestoneId),
    [allFiles, milestoneId],
  );

  // Deep-link straight into the file's own execution page when this milestone
  // has exactly one — the generic list would make QA hunt for it again. With
  // several files there's no single right target, so fall back to the list
  // (the per-file rows below link to each one directly).
  const openExecutionDashboard = () => {
    if (files.length === 1) setLocation(`/test-cases/execution/${files[0].redmineTicketId}`);
    else setLocation("/test-cases/execution");
  };

  const total = files.length;
  const approved = files.filter((f: any) => f.reviewStatus === "approved").length;
  const rejected = files.filter((f: any) => f.reviewStatus === "rejected").length;
  const pending = total - approved - rejected; // draft or in_review
  const allApproved = total > 0 && approved === total;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 sm:space-y-8 text-left">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-semibold">Test Case Approval Gate</h3>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Execution files must be reviewed and approved on the Execution Dashboard before testing can begin.
          </p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto shrink-0" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center space-y-2">
            <ListChecks className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No execution file compiled yet</p>
            <p className="text-sm text-muted-foreground">
              Go to Step 3 and compile your test cases into an execution file before they can be reviewed here.
            </p>
          </CardContent>
        </Card>
      ) : allApproved ? (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <div>
              <p className="font-semibold text-lg text-green-700 dark:text-green-400">
                All Test Cases Approved!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Your test cases have been approved — you may proceed with execution.
              </p>
            </div>
            <Button className="w-full sm:w-auto" onClick={openExecutionDashboard} disabled={locked}>
              <List className="w-4 h-4 mr-2 shrink-0" />
              {files.length === 1 ? `Execute #${files[0].redmineTicketId}` : "Open Execution Dashboard"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className={rejected > 0 ? "border-red-300" : "border-amber-300"}>
          <CardContent className="pt-6 pb-6 text-center space-y-2">
            {rejected > 0 ? (
              <>
                <XCircle className="w-8 h-8 mx-auto text-red-500" />
                <p className="font-medium text-red-600">
                  {rejected} execution file{rejected > 1 ? "s" : ""} rejected
                </p>
                <p className="text-sm text-muted-foreground">
                  Revise the rejected file{rejected > 1 ? "s" : ""} on the Execution Dashboard and resubmit for review.
                </p>
              </>
            ) : (
              <>
                <Clock className="w-8 h-8 mx-auto text-amber-500" />
                <p className="font-medium text-amber-600">Awaiting review</p>
                <p className="text-sm text-muted-foreground">
                  {pending} of {total} execution file{total > 1 ? "s" : ""} still need approval on the Execution Dashboard before execution can begin.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {total > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y max-h-80 overflow-y-auto overflow-x-hidden">
              {files.map((f: any) => (
                <div key={f.id} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1 flex items-start gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm sm:text-base break-words">{f.title || `Redmine #${f.redmineTicketId}`}</div>
                      <div className="text-xs text-muted-foreground">Redmine #{f.redmineTicketId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                    {f.reviewStatus === "approved" ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                      </Badge>
                    ) : f.reviewStatus === "rejected" ? (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                        <XCircle className="w-3 h-3 mr-1" /> Rejected
                      </Badge>
                    ) : f.reviewStatus === "in_review" ? (
                      <Badge variant="outline" className="text-amber-600">
                        <Clock className="w-3 h-3 mr-1" /> In Review
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <Clock className="w-3 h-3 mr-1" /> Draft
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation(`/test-cases/execution/${f.redmineTicketId}`)}
                      disabled={locked}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
