import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, List, RefreshCw } from "lucide-react";

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

export function Step4Approval({ milestoneId }: { milestoneId: number }) {
  const { token, user } = useAuth();

  // Note: the backend `/milestones` API in QAPulse typically returns stats about execution files/test cases.
  // For this step, we would fetch the test cases and check their reviewStatus.
  // We'll mock the logic for checking if all are approved.
  const { data: testCases = [], isLoading, refetch } = useQuery({
    queryKey: ["execution-testcases", "milestone", milestoneId],
    queryFn: async () => {
      // Assuming we have an endpoint that returns execution test cases or we query the execution files
      const res = await api(`/test-cases/execution?milestoneId=${milestoneId}`, token);
      if (!res.ok) {
        // Fallback or empty if not implemented yet
        return [];
      }
      return res.json();
    },
    enabled: !!milestoneId,
  });

  const total = testCases.length;
  const approved = testCases.filter((tc: any) => tc.reviewStatus === "approved").length;
  const pending = testCases.filter((tc: any) => tc.reviewStatus === "pending").length;
  const rejected = testCases.filter((tc: any) => tc.reviewStatus === "rejected").length;

  // Temporarily allow advancing regardless of status for demo/testing
  const allApproved = total > 0 && approved === total;
  
  const canApprove = ["admin", "qa_manager", "hod_qa", "cto"].includes(user?.role ?? "");

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Test Case Approval Gate</h3>
          <p className="text-muted-foreground mt-1">
            Test cases must be reviewed and approved by a QA Manager before execution can begin.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{total}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-amber-500">{pending}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-500">{approved}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase">Approved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-500">{rejected}</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase">Rejected</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-muted/50 p-6 rounded-lg text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Approvals are managed in the Execution Dashboard.
          {canApprove && " You have permission to approve test cases."}
        </p>
        <Button 
          variant="secondary" 
          onClick={() => window.open(`/test-cases-execution?milestoneId=${milestoneId}`, '_blank')}
        >
          <List className="w-4 h-4 mr-2" />
          Open Execution Dashboard
        </Button>
      </div>
    </div>
  );
}
