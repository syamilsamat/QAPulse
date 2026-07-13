import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FileBarChart2, ShieldAlert, TrendingUp, Printer, Loader2,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";

async function callAi(token: string | null, endpoint: string, body: object) {
  const res = await fetch(`${getApiUrl()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
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

export default function ReportDashboard() {
  const { token } = useAuth();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);

  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [readinessResult, setReadinessResult] = useState<any>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const runRisk = async () => {
    setRiskLoading(true);
    try {
      const result = await callAi(token, "/ai/risk-score", {});
      setRiskResult(result);
      setGeneratedAt(new Date());
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Error", description: err.message });
    } finally {
      setRiskLoading(false);
    }
  };

  const runReadiness = async () => {
    setReadinessLoading(true);
    try {
      const result = await callAi(token, "/ai/release-readiness", {});
      setReadinessResult(result);
      setGeneratedAt(new Date());
    } catch (err: any) {
      toast({ variant: "destructive", title: "AI Error", description: err.message });
    } finally {
      setReadinessLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const hasData = riskResult || readinessResult;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; }
        }
      `}</style>

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileBarChart2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Report Dashboard</h1>
              <p className="text-sm text-muted-foreground">AI-powered risk assessment and release readiness</p>
            </div>
          </div>
          {hasData && (
            <Button variant="outline" onClick={handlePrint} className="gap-2 no-print">
              <Printer className="w-4 h-4" />
              Download / Print Report
            </Button>
          )}
        </div>

        {generatedAt && (
          <p className="text-xs text-muted-foreground no-print">
            Last generated: {format(generatedAt, "dd/MM/yyyy HH:mm")}
          </p>
        )}

        <div ref={reportRef} className="print-page space-y-6">
          {hasData && (
            <div className="hidden print:block text-center mb-6">
              <h1 className="text-2xl font-bold">QMPulse — Report Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Generated: {generatedAt ? format(generatedAt, "dd/MM/yyyy HH:mm") : ""}
              </p>
            </div>
          )}

          {/* Risk Score Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-primary" />
                    AI Bug Prediction & Risk Scoring
                  </CardTitle>
                  <CardDescription>
                    Score modules by risk based on defect density, blocked tasks, and coverage gaps.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={riskLoading}
                  onClick={runRisk}
                  className="no-print"
                >
                  {riskLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Scoring…</>
                  ) : (
                    <><ShieldAlert className="w-3.5 h-3.5 mr-1.5" />Calculate Risk</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!riskResult && !riskLoading && (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  Click <strong>Calculate Risk</strong> to generate the risk score report.
                </div>
              )}
              {riskLoading && (
                <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analysing project risk…
                </div>
              )}
              {riskResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">Overall Project Risk:</span>
                    <RiskBadge level={riskResult.overallRisk} />
                  </div>
                  <p className="text-sm text-muted-foreground">{riskResult.summary}</p>
                  {riskResult.modules?.map((m: any, i: number) => (
                    <div key={i} className="p-3 rounded-lg border space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold">{m.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${m.riskScore}%`,
                                backgroundColor:
                                  m.riskLevel === "high" || m.riskLevel === "critical"
                                    ? "#ef4444"
                                    : m.riskLevel === "medium"
                                    ? "#f59e0b"
                                    : "#22c55e",
                              }}
                            />
                          </div>
                          <span className="text-sm font-bold">{m.riskScore}</span>
                          <RiskBadge level={m.riskLevel} />
                        </div>
                      </div>
                      {m.reasons?.length > 0 && (
                        <ul className="space-y-1">
                          {m.reasons.map((r: string, j: number) => (
                            <li key={j} className="text-xs text-muted-foreground flex gap-2">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                      {m.recommendation && (
                        <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">{m.recommendation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Release Readiness Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Release Readiness Score
                  </CardTitle>
                  <CardDescription>
                    AI-calculated release readiness based on task completion, defects, coverage, and open risks.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  disabled={readinessLoading}
                  onClick={runReadiness}
                  className="no-print"
                >
                  {readinessLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Calculating…</>
                  ) : (
                    <><TrendingUp className="w-3.5 h-3.5 mr-1.5" />Calculate Readiness</>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!readinessResult && !readinessLoading && (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  Click <strong>Calculate Readiness</strong> to generate the readiness report.
                </div>
              )}
              {readinessLoading && (
                <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculating release readiness…
                </div>
              )}
              {readinessResult && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 p-6 rounded-xl border bg-muted/30">
                    <div
                      className={`text-5xl font-bold ${
                        readinessResult.readinessScore >= 80
                          ? "text-green-600"
                          : readinessResult.readinessScore >= 50
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {readinessResult.readinessScore}%
                    </div>
                    <Badge
                      className={
                        readinessResult.status === "ready"
                          ? "bg-green-100 text-green-800"
                          : readinessResult.status === "caution"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {readinessResult.status === "ready"
                        ? "🟢 Release Ready"
                        : readinessResult.status === "caution"
                        ? "🟡 Caution"
                        : "🔴 Not Ready"}
                    </Badge>
                    <p className="text-sm text-muted-foreground text-center">{readinessResult.verdict}</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {readinessResult.positives?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-green-700 mb-2">✅ Positive Signals</p>
                        <ul className="space-y-1">
                          {readinessResult.positives.map((p: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {readinessResult.blockers?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-red-700 mb-2">🚫 Blockers</p>
                        <ul className="space-y-1">
                          {readinessResult.blockers.map((b: string, i: number) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
