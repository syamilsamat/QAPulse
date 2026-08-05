import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, TestTube, Wand2, PackagePlus, X, CheckCircle2 } from "lucide-react";
import { useMilestoneTestCases } from "./useMilestoneTestCases";
import { CompileToExecutionDialog } from "@/components/execution/CompileToExecutionDialog";

// Risk-Based Testing order — highest risk first, so the compiled execution
// file's row order (which the server derives from array index) runs
// Critical → Low. Untagged test cases sort last.
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const rankOf = (p?: string | null) => PRIORITY_RANK[p ?? ""] ?? 99;

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [compileOpen, setCompileOpen] = useState(false);

  const { requirements, testCases, coveredRequirementCount, isLoading: loadingTCs } = useMilestoneTestCases(milestoneId, projectId);

  const sortedTestCases = useMemo(
    () => [...(testCases as any[])].sort((a, b) => rankOf(a.priority) - rankOf(b.priority)),
    [testCases],
  );

  // Needed by the shared compile dialog (same queries the Test Cases page runs).
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await api("/projects", token);
      return res.ok ? res.json() : [];
    },
  });
  const { data: modules = [] } = useQuery({
    queryKey: ["modules"],
    queryFn: async () => {
      const res = await api("/modules", token);
      return res.ok ? res.json() : [];
    },
  });
  const { data: trackers = [] } = useQuery({
    queryKey: ["trackers"],
    queryFn: async () => {
      const res = await api("/trackers", token);
      return res.ok ? res.json() : [];
    },
    staleTime: 300_000,
  });

  // Which test cases are already compiled into one of this milestone's
  // execution files. Execution rows keep a `libraryTcId` back-reference, so
  // that's the join — without this, the same test case could be compiled
  // repeatedly and show up as duplicate rows during execution.
  const { data: allFiles = [] } = useQuery({
    queryKey: ["execution-files"],
    queryFn: async () => {
      const res = await api("/execution-files", token);
      return res.ok ? res.json() : [];
    },
  });
  const milestoneTicketIds = useMemo(
    () => (allFiles as any[]).filter((f) => f.milestoneId === milestoneId).map((f) => String(f.redmineTicketId)),
    [allFiles, milestoneId],
  );
  const { data: compiledIdList } = useQuery({
    queryKey: ["compiled-library-tc-ids", milestoneId, milestoneTicketIds.join(",")],
    queryFn: async () => {
      const perFile = await Promise.all(
        milestoneTicketIds.map(async (ticketId) => {
          const res = await api(`/execution-files/${ticketId}/test-cases`, token);
          if (!res.ok) return [] as number[];
          const body = await res.json();
          return ((body.testCases ?? []) as any[])
            .map((t) => t.libraryTcId)
            .filter((v): v is number => v != null);
        }),
      );
      return perFile.flat();
    },
    enabled: milestoneTicketIds.length > 0,
  });
  const compiledIds = useMemo(() => new Set<number>(compiledIdList ?? []), [compiledIdList]);

  const compilableTestCases = useMemo(
    () => sortedTestCases.filter((tc: any) => !compiledIds.has(tc.id)),
    [sortedTestCases, compiledIds],
  );
  const allSelected = compilableTestCases.length > 0 && selectedIds.size === compilableTestCases.length;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(compilableTestCases.map((tc: any) => tc.id)));
  };

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

  // Coverage = share of this milestone's requirements that have at least one
  // test case. The previous version read `tc.links`, a field the /test-cases
  // API never returns, so this was permanently stuck at 0%.
  const coveragePercent = requirements.length > 0
    ? Math.round((coveredRequirementCount / requirements.length) * 100)
    : 0;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Test Case Generation &amp; Coverage</h3>
          <p className="text-muted-foreground mt-1">
            Create test cases based on synced requirements, apply Risk-Based Testing (RBT) priority, then compile them for execution.
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

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span><strong>{selectedIds.size}</strong> test case{selectedIds.size !== 1 ? "s" : ""} selected</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => setCompileOpen(true)}>
              <PackagePlus className="w-3.5 h-3.5 mr-1" /> Compile for Execution
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loadingTCs ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : sortedTestCases.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No test cases found. Click "Manage Test Cases" to create some.</div>
          ) : (
            <>
              <div className="p-3 border-b flex items-center gap-3 bg-muted/30">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={compilableTestCases.length === 0}
                />
                <span className="text-sm text-muted-foreground">
                  {compilableTestCases.length === 0
                    ? `All ${sortedTestCases.length} test case(s) already compiled`
                    : `Select all not yet compiled (${compilableTestCases.length}) — ordered by risk priority`}
                </span>
              </div>
              <div className="divide-y max-h-64 overflow-auto">
                {sortedTestCases.map((tc: any) => {
                  const isCompiled = compiledIds.has(tc.id);
                  return (
                    <div
                      key={tc.id}
                      className={`p-3 flex items-center justify-between gap-3 ${isCompiled ? "opacity-60" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Checkbox
                          checked={selectedIds.has(tc.id)}
                          onCheckedChange={() => toggleSelect(tc.id)}
                          disabled={isCompiled}
                        />
                        <span className="text-sm text-muted-foreground shrink-0">TC-{tc.id}</span>
                        <span className="font-medium truncate">{tc.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCompiled && (
                          <span className="text-xs px-2 py-1 rounded font-medium bg-green-100 text-green-700 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Compiled
                          </span>
                        )}
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
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CompileToExecutionDialog
        open={compileOpen}
        onOpenChange={setCompileOpen}
        selectedTestCases={sortedTestCases.filter((tc: any) => selectedIds.has(tc.id))}
        projects={projects as any[]}
        modules={modules as any[]}
        trackers={trackers as any[]}
        requirements={requirements as any[]}
        token={token}
        defaultProjectId={projectId}
        defaultMilestoneId={milestoneId}
        lockProjectAndMilestone
        onCompiled={(ticketId) => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["execution-files"] });
          queryClient.invalidateQueries({ queryKey: ["compiled-library-tc-ids"] });
          setLocation(`/test-cases/execution/${ticketId}`);
        }}
      />
    </div>
  );
}
