import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getApiUrl } from "@/lib/api";
import {
  FileBarChart2, Search, CheckCircle2, XCircle, Clock,
  AlertTriangle, MinusCircle, Bug, TrendingUp, Shield,
} from "lucide-react";
import { format } from "date-fns";

interface PmoReportData {
  redmineId: string;
  generatedAt: string;
  requirements: Array<{ id: number; title: string; module: string | null; status: string; priority: string }>;
  testExecution: {
    total: number; passed: number; failed: number; blocked: number;
    inProgress: number; notExecuted: number; passRate: number; successRate: number;
  };
  moduleDetails: Array<{
    module: string; total: number; passed: number; failed: number;
    blocked: number; inProgress: number; notExecuted: number;
    passCompletion: number; totalCompletion: number;
  }>;
  defects: {
    total: number; openRate: number;
    counts: Record<string, number>;
  };
  activeDefects: Array<{
    id: number; name: string; priority: string; status: string;
    category: string; assignee: string; createdAt: string;
  }>;
}

const EXEC_COLORS = ["#4ade80", "#f87171", "#fb923c", "#94a3b8", "#60a5fa"];
const DEFECT_COLORS = ["#f87171", "#60a5fa", "#a78bfa", "#fb923c", "#4ade80", "#f472b6", "#34d399", "#94a3b8"];

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl p-4 ${color} min-w-[110px]`}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs font-medium mt-1 text-center opacity-80">{label}</span>
    </div>
  );
}

export default function PmoReport() {
  const { token } = useAuth();
  const [input, setInput] = useState("");
  const [redmineId, setRedmineId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<PmoReportData>({
    queryKey: ["pmo-report", redmineId],
    queryFn: async () => {
      const url = `${getApiUrl()}/pmo/report?redmineId=${encodeURIComponent(redmineId!)}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load report");
      }
      return resp.json();
    },
    enabled: !!redmineId,
    retry: false,
  });

  const handleSearch = () => {
    if (!input.trim()) return;
    setRedmineId(input.trim());
  };

  const execData = data
    ? [
        { name: `Passed (${data.testExecution.passRate}%)`, value: data.testExecution.passed },
        { name: `Failed (${data.testExecution.failed > 0 ? ((data.testExecution.failed / data.testExecution.total) * 100).toFixed(1) : 0}%)`, value: data.testExecution.failed },
        { name: `Blocked`, value: data.testExecution.blocked },
        { name: `Not Executed`, value: data.testExecution.notExecuted },
        { name: `In Progress`, value: data.testExecution.inProgress },
      ].filter(d => d.value > 0)
    : [];

  const defectData = data
    ? Object.entries(data.defects.counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          value: v,
        }))
    : [];

  return (
    <div className="min-h-screen bg-muted/20 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileBarChart2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">PMO Report Portal</h1>
            <p className="text-sm text-muted-foreground">Enter a Redmine ticket number to view QA status report</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">#</span>
                <Input
                  className="pl-7"
                  placeholder="Enter Redmine number (e.g. 34555)"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={isLoading || !input.trim()}>
                <Search className="w-4 h-4 mr-2" />
                {isLoading ? "Loading..." : "View Report"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm font-medium">{(error as Error).message}</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="space-y-6">
            <div className="text-center border rounded-xl p-4 bg-card">
              <h2 className="text-xl font-bold text-primary">
                Test Execution & Defect Status Summary as of {format(new Date(data.generatedAt), "dd/MM/yyyy [HH:mm]")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Redmine #{data.redmineId} · {data.requirements.length} requirement(s) · Report Generated: {format(new Date(data.generatedAt), "dd/MM/yyyy HH:mm")}
              </p>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> Test Execution Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.testExecution.total === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No test cases linked to this ticket.</p>
                ) : (
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-full md:w-64 h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={execData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={false}>
                            {execData.map((_, i) => <Cell key={i} fill={EXEC_COLORS[i % EXEC_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v} cases`]} />
                          <Legend iconSize={10} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Total Test Cases</p>
                          <p className="text-2xl font-bold">{data.testExecution.total}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Pass Rate</p>
                          <p className="text-2xl font-bold text-green-600">{data.testExecution.passRate}%</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Success Rate</p>
                          <p className="text-2xl font-bold text-blue-600">{data.testExecution.successRate}%</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <StatBox label="PASSED" value={data.testExecution.passed} color="bg-green-100 text-green-800" />
                        <StatBox label="FAILED" value={data.testExecution.failed} color="bg-red-100 text-red-800" />
                        <StatBox label="BLOCKED" value={data.testExecution.blocked} color="bg-orange-100 text-orange-800" />
                        <StatBox label="NOT EXECUTED" value={data.testExecution.notExecuted} color="bg-gray-100 text-gray-700" />
                        <StatBox label="IN PROGRESS" value={data.testExecution.inProgress} color="bg-blue-100 text-blue-800" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {data.moduleDetails.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> Test Execution Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Module</th>
                        <th className="text-center py-2 px-2 font-medium">Total</th>
                        <th className="text-center py-2 px-2 font-medium text-green-700">Passed</th>
                        <th className="text-center py-2 px-2 font-medium text-red-700">Failed</th>
                        <th className="text-center py-2 px-2 font-medium text-orange-700">Blocked</th>
                        <th className="text-center py-2 px-2 font-medium text-blue-700">In Progress</th>
                        <th className="text-center py-2 px-2 font-medium text-gray-600">Not Exec.</th>
                        <th className="text-center py-2 px-2 font-medium">Pass %</th>
                        <th className="text-center py-2 px-2 font-medium">Total %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.moduleDetails.map((m, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium">{m.module}</td>
                          <td className="text-center py-2 px-2">{m.total}</td>
                          <td className="text-center py-2 px-2 text-green-700">{m.passed}</td>
                          <td className="text-center py-2 px-2 text-red-700">{m.failed}</td>
                          <td className="text-center py-2 px-2 text-orange-700">{m.blocked}</td>
                          <td className="text-center py-2 px-2 text-blue-700">{m.inProgress}</td>
                          <td className="text-center py-2 px-2 text-gray-600">{m.notExecuted}</td>
                          <td className="text-center py-2 px-2">
                            <span className={`font-medium ${m.passCompletion >= 80 ? "text-green-700" : m.passCompletion >= 50 ? "text-yellow-700" : "text-red-700"}`}>
                              {m.passCompletion}%
                            </span>
                          </td>
                          <td className="text-center py-2 px-2">
                            <span className="font-medium">{m.totalCompletion}%</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="font-bold bg-muted/40">
                        <td className="py-2 pr-4">Grand Total</td>
                        <td className="text-center py-2 px-2">{data.testExecution.total}</td>
                        <td className="text-center py-2 px-2 text-green-700">{data.testExecution.passed}</td>
                        <td className="text-center py-2 px-2 text-red-700">{data.testExecution.failed}</td>
                        <td className="text-center py-2 px-2 text-orange-700">{data.testExecution.blocked}</td>
                        <td className="text-center py-2 px-2 text-blue-700">{data.testExecution.inProgress}</td>
                        <td className="text-center py-2 px-2">{data.testExecution.notExecuted}</td>
                        <td className="text-center py-2 px-2 text-green-700">{data.testExecution.passRate}%</td>
                        <td className="text-center py-2 px-2">{data.testExecution.successRate}%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bug className="w-4 h-4 text-primary" /> Defect Status Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.defects.total === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No defects found for this ticket.</p>
                ) : (
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="w-full md:w-64 h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={defectData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={false}>
                            {defectData.map((_, i) => <Cell key={i} fill={DEFECT_COLORS[i % DEFECT_COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v} defects`]} />
                          <Legend iconSize={10} iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Total Defects</p>
                          <p className="text-2xl font-bold">{data.defects.total}</p>
                        </div>
                        <div className="p-3 rounded-lg border text-center">
                          <p className="text-xs text-muted-foreground">Open Rate</p>
                          <p className={`text-2xl font-bold ${data.defects.openRate > 50 ? "text-red-600" : data.defects.openRate > 20 ? "text-yellow-600" : "text-green-600"}`}>
                            {data.defects.openRate}%
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {Object.entries(data.defects.counts).map(([k, v]) => (
                          <div key={k} className="text-center px-3 py-2 rounded-lg bg-muted/50 border min-w-[80px]">
                            <p className="text-lg font-bold">{v}</p>
                            <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {data.activeDefects.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" /> Defect Details (Active Defects Only)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">#</th>
                        <th className="text-left py-2 pr-4 font-medium">Subject</th>
                        <th className="text-center py-2 px-2 font-medium">Priority</th>
                        <th className="text-center py-2 px-2 font-medium">Status</th>
                        <th className="text-center py-2 px-2 font-medium">Category</th>
                        <th className="text-left py-2 px-2 font-medium">Assignee</th>
                        <th className="text-center py-2 px-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activeDefects.map((d) => (
                        <tr key={d.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 text-muted-foreground">#{d.id}</td>
                          <td className="py-2 pr-4">{d.name}</td>
                          <td className="text-center py-2 px-2">
                            <Badge variant="outline" className="text-xs">{d.priority}</Badge>
                          </td>
                          <td className="text-center py-2 px-2">
                            <Badge className="text-xs capitalize">{d.status.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="text-center py-2 px-2 text-muted-foreground text-xs">{d.category}</td>
                          <td className="py-2 px-2 text-sm">{d.assignee}</td>
                          <td className="text-center py-2 px-2 text-xs text-muted-foreground">
                            {format(new Date(d.createdAt), "dd/MM/yyyy HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            <p className="text-center text-xs text-muted-foreground pb-4">
              This is an automated report generated by QA Pulse · Please do not reply to this report
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
