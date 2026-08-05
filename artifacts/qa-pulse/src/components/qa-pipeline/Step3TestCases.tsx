import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TestTube, Wand2 } from "lucide-react";

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

export function Step3TestCases({ milestoneId, projectId }: { milestoneId: number, projectId?: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [tagging, setTagging] = useState(false);

  const { data: requirements = [] } = useQuery({
    queryKey: ["requirements", "milestone", milestoneId],
    queryFn: async () => {
      const res = await api(`/requirements?milestoneId=${milestoneId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!milestoneId,
  });

  // Re-syncing a Redmine ticket into a new milestone creates a fresh
  // requirement row for that milestone (a requirement only ever belongs to
  // one milestone) rather than reusing whatever requirement row the ticket
  // was already synced to elsewhere. So a ticket already tested under an
  // older milestone ends up with two requirement rows sharing the same
  // redmineTicketId, and the test cases from before stay attached to the old
  // row. To surface those here too, we widen the match from "this
  // milestone's requirement ids" to "any requirement (any milestone) whose
  // redmineTicketId matches one of this milestone's requirements".
  const { data: allProjectRequirements = [] } = useQuery({
    queryKey: ["requirements", "project", projectId],
    queryFn: async () => {
      const res = await api(`/requirements?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });

  // test_cases has no milestoneId column of its own — it's scoped to a
  // milestone indirectly via requirementId. Fetching by projectId (a
  // supported server-side filter) and narrowing to this milestone's
  // requirement set client-side mirrors exactly how TestCases.tsx itself
  // scopes test cases to a milestone.
  const { data: projectTestCases = [], isLoading: loadingTCs } = useQuery({
    queryKey: ["test-cases", "project", projectId],
    queryFn: async () => {
      const res = await api(`/test-cases?projectId=${projectId}`, token);
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });
  const requirementIds = useMemo(() => {
    const ticketIds = new Set(
      requirements.map((r: any) => r.redmineTicketId).filter(Boolean),
    );
    const ids = new Set<number>(requirements.map((r: any) => r.id));
    for (const r of allProjectRequirements as any[]) {
      if (r.redmineTicketId && ticketIds.has(r.redmineTicketId)) ids.add(r.id);
    }
    return ids;
  }, [requirements, allProjectRequirements]);
  const testCases = useMemo(
    () => projectTestCases.filter((tc: any) => tc.requirementId != null && requirementIds.has(tc.requirementId)),
    [projectTestCases, requirementIds],
  );

  const handleRiskBasedTagging = async () => {
    setTagging(true);
    try {
      const res = await api(`/ai/tag-risk-priority`, token, {
        method: "POST",
        body: JSON.stringify({ milestoneId }),
      });
      if (!res.ok) throw new Error("Failed to tag risk priority");
      toast({ title: "Risk Priorities Assigned!" });
      queryClient.invalidateQueries({ queryKey: ["test-cases", "project", projectId] });
    } catch (err: any) {
      toast({ variant: "destructive", title: err.message });
    } finally {
      setTagging(false);
    }
  };

  // Calculate coverage
  const coveredReqIds = new Set(
    testCases.flatMap((tc: any) => tc.links?.filter((l: any) => l.linkType === "requirement").map((l: any) => l.requirementId) || [])
  );
  
  const coveragePercent = requirements.length > 0 
    ? Math.round((coveredReqIds.size / requirements.length) * 100) 
    : 0;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Test Case Generation & Coverage</h3>
          <p className="text-muted-foreground mt-1">
            Create test cases based on synced requirements and apply Risk-Based Testing (RBT) priority.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-primary">{coveragePercent}%</div>
            <div className="text-sm text-muted-foreground mt-1">Requirement Coverage</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-4xl font-bold text-primary">{testCases.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Total Test Cases</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button
          className="flex-1"
          onClick={() => setLocation(`/test-cases?milestoneId=${milestoneId}&projectId=${projectId ?? ""}`)}
        >
          <TestTube className="w-4 h-4 mr-2" />
          Manage Test Cases
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          onClick={handleRiskBasedTagging}
          disabled={tagging || testCases.length === 0}
        >
          {tagging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
          Apply Risk-Based Priority (AI)
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadingTCs ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : testCases.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No test cases found. Click "Manage Test Cases" to create some.</div>
          ) : (
            <div className="divide-y max-h-64 overflow-auto">
              {testCases.map((tc: any) => (
                <div key={tc.id} className="p-3 flex items-center justify-between hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">TC-{tc.id}</span>
                    <span className="font-medium">{tc.title}</span>
                  </div>
                  {tc.priority && (
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      tc.priority === 'Critical' ? 'bg-red-100 text-red-700' :
                      tc.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                      tc.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {tc.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
