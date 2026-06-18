import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { HoverSparkles } from "@/components/icons/animated";
import {
  listRequirements,
  getListRequirementsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import {
  Brain,
  Zap,
  BarChart3,
  FileSearch,
  TestTube,
  Layers,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Upload,
} from "lucide-react";

const API_BASE = () => getApiUrl();

async function callAiEndpoint(
  token: string | null,
  endpoint: string,
  body: object,
) {
  const res = await fetch(`${API_BASE()}${endpoint}`, {
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

function LoadingSpinner() {
  return <Loader2 className="w-4 h-4 animate-spin" />;
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800 border-green-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[level?.toLowerCase()] ?? colors.medium}`}
    >
      {level}
    </span>
  );
}

export default function AiFeatures() {
  const { token } = useAuth();
  const { toast } = useToast();
  const coverageFileRef = useRef<HTMLInputElement>(null);

  const { data: requirements = [] } = useQuery({
    queryKey: getListRequirementsQueryKey(),
    queryFn: () => listRequirements(),
  });

  const [selectedReqAnalyzeId, setSelectedReqAnalyzeId] = useState<string>("");
  const [reqAnalyzeResult, setReqAnalyzeResult] = useState<any>(null);
  const [reqAnalyzeLoading, setReqAnalyzeLoading] = useState(false);

  const [selectedEdgeCaseId, setSelectedEdgeCaseId] = useState<string>("");
  const [edgeCaseResult, setEdgeCaseResult] = useState<any>(null);
  const [edgeCaseLoading, setEdgeCaseLoading] = useState(false);

  const [dupResult, setDupResult] = useState<any>(null);
  const [dupLoading, setDupLoading] = useState(false);

  const [coverageReqId, setCoverageReqId] = useState<string>("all");
  const [coverageFileName, setCoverageFileName] = useState<string>("");

  const [weeklySummaryResult, setWeeklySummaryResult] = useState<any>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);

  const [coverageResult, setCoverageResult] = useState<any>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);

  const [testDataForm, setTestDataForm] = useState({
    dataType: "",
    count: "10",
    context: "",
  });
  const [testDataResult, setTestDataResult] = useState<any>(null);
  const [testDataLoading, setTestDataLoading] = useState(false);

  const run = async <T,>(
    setLoading: (v: boolean) => void,
    setResult: (v: T) => void,
    fn: () => Promise<T>,
  ) => {
    setLoading(true);
    try {
      const result = await fn();
      setResult(result);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "AI Error",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HoverSparkles className="w-8 h-8 text-primary shrink-0 group" />

        <div>
          <h1 className="text-2xl font-bold">AI Intelligence Hub</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered QA intelligence — analyze, detect, predict, and generate
          </p>
        </div>
      </div>

      <Tabs defaultValue="analyze" className="space-y-4">
        <ScrollArea className="w-full">
          <TabsList className="grid grid-cols-2 sm:flex sm:w-max gap-1 h-auto p-1 bg-muted">
            <TabsTrigger
              value="analyze"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <Brain className="w-3.5 h-3.5" />
              Req Analyzer
            </TabsTrigger>
            <TabsTrigger
              value="edge"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <Zap className="w-3.5 h-3.5" />
              Edge Cases
            </TabsTrigger>
            <TabsTrigger
              value="duplicate"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <Layers className="w-3.5 h-3.5" />
              Duplicate Check
            </TabsTrigger>
            <TabsTrigger
              value="coverage"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <FileSearch className="w-3.5 h-3.5" />
              Coverage Gap
            </TabsTrigger>
            <TabsTrigger
              value="weekly"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Weekly Summary
            </TabsTrigger>
            <TabsTrigger
              value="testdata"
              className="gap-1.5 justify-start sm:justify-center py-2"
            >
              <TestTube className="w-3.5 h-3.5" />
              Test Data
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="analyze">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                AI Requirement Analyzer
              </CardTitle>
              <CardDescription>
                Analyze requirements for missing acceptance criteria, ambiguous
                wording, and QA risks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Select Requirement *
                    </label>
                    <SearchableSelect
                      value={selectedReqAnalyzeId}
                      onValueChange={setSelectedReqAnalyzeId}
                      options={requirements.map((r) => ({ value: String(r.id), label: r.title }))}
                      placeholder="Choose a requirement…"
                      searchPlaceholder="Search requirement..."
                    />
                  </div>
                  {selectedReqAnalyzeId &&
                    (() => {
                      const r = requirements.find(
                        (x) => String(x.id) === selectedReqAnalyzeId,
                      );
                      return r ? (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
                          {r.module && (
                            <p>
                              <span className="font-medium">Module:</span>{" "}
                              {r.module}
                            </p>
                          )}
                          {r.description && (
                            <p className="line-clamp-3">{r.description}</p>
                          )}
                        </div>
                      ) : null;
                    })()}
                  <Button
                    className="w-full"
                    disabled={reqAnalyzeLoading || !selectedReqAnalyzeId}
                    onClick={() => {
                      const r = requirements.find(
                        (x) => String(x.id) === selectedReqAnalyzeId,
                      );
                      if (!r) return;
                      run(setReqAnalyzeLoading, setReqAnalyzeResult, () =>
                        callAiEndpoint(token, "/ai/analyze-requirement", {
                          requirementId: r.id,
                          title: r.title,
                          description: r.description ?? "",
                          module: r.module ?? "",
                        }),
                      );
                    }}
                  >
                    {reqAnalyzeLoading ? (
                      <>
                        <LoadingSpinner /> Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Analyze Requirement
                      </>
                    )}
                  </Button>
                </div>
                {reqAnalyzeResult && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Quality Score</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${reqAnalyzeResult.score}%` }}
                          />
                        </div>
                        <span className="font-bold text-primary">
                          {reqAnalyzeResult.score}/100
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Risk Level:</span>
                      <RiskBadge level={reqAnalyzeResult.riskLevel} />
                    </div>
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      {reqAnalyzeResult.summary}
                    </p>
                    {reqAnalyzeResult.missingItems?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Missing Items
                        </p>
                        <ul className="space-y-1">
                          {reqAnalyzeResult.missingItems.map(
                            (item: string, i: number) => (
                              <li key={i} className="text-sm flex gap-2">
                                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                                {item}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                    {reqAnalyzeResult.questions?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                          Questions to Clarify
                        </p>
                        <ul className="space-y-1">
                          {reqAnalyzeResult.questions.map(
                            (q: string, i: number) => (
                              <li key={i} className="text-sm flex gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 shrink-0" />
                                {q}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edge">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                AI Edge Case Generator
              </CardTitle>
              <CardDescription>
                Generate boundary, concurrency, authorization, and failure-mode
                test scenarios beyond happy-path testing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Select Requirement *
                    </label>
                    <SearchableSelect
                      value={selectedEdgeCaseId}
                      onValueChange={setSelectedEdgeCaseId}
                      options={requirements.map((r) => ({ value: String(r.id), label: r.title }))}
                      placeholder="Choose a requirement…"
                      searchPlaceholder="Search requirement..."
                    />
                  </div>
                  {selectedEdgeCaseId &&
                    (() => {
                      const r = requirements.find(
                        (x) => String(x.id) === selectedEdgeCaseId,
                      );
                      return r?.description ? (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 line-clamp-3">
                          {r.description}
                        </div>
                      ) : null;
                    })()}
                  <Button
                    className="w-full"
                    disabled={edgeCaseLoading || !selectedEdgeCaseId}
                    onClick={() => {
                      const r = requirements.find(
                        (x) => String(x.id) === selectedEdgeCaseId,
                      );
                      if (!r) return;
                      run(setEdgeCaseLoading, setEdgeCaseResult, () =>
                        callAiEndpoint(token, "/ai/edge-cases", {
                          title: r.title,
                          description: r.description ?? "",
                        }),
                      );
                    }}
                  >
                    {edgeCaseLoading ? (
                      <>
                        <LoadingSpinner /> Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate Edge Cases
                      </>
                    )}
                  </Button>
                </div>
                {edgeCaseResult?.edgeCases?.length > 0 && (
                  <ScrollArea className="h-64 pr-2">
                    <div className="space-y-2">
                      {edgeCaseResult.edgeCases.map((ec: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border text-sm space-y-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{ec.scenario}</span>
                            <RiskBadge level={ec.risk} />
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Category: {ec.category}
                          </p>
                          {ec.testInput && (
                            <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                              Input: {ec.testInput}
                            </p>
                          )}
                          {ec.expectedBehavior && (
                            <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                              Expected: {ec.expectedBehavior}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicate">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Duplicate Test Case Detection
              </CardTitle>
              <CardDescription>
                Scan all existing test cases for duplicates and overlapping
                coverage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Click the button below to automatically scan all test cases
                    in your project for potential duplicates and overlapping
                    scenarios.
                  </p>
                  <Button
                    className="w-full"
                    disabled={dupLoading}
                    onClick={() =>
                      run(setDupLoading, setDupResult, () =>
                        callAiEndpoint(token, "/ai/duplicate-detection", {}),
                      )
                    }
                  >
                    {dupLoading ? (
                      <>
                        <LoadingSpinner /> Checking...
                      </>
                    ) : (
                      <>
                        <Layers className="w-4 h-4 mr-2" />
                        Check for Duplicates
                      </>
                    )}
                  </Button>
                </div>
                {dupResult && (
                  <div className="space-y-3">
                    <div
                      className={`p-3 rounded-lg text-sm font-medium ${dupResult.duplicates?.length > 0 ? "bg-orange-50 text-orange-800 border border-orange-200" : "bg-green-50 text-green-800 border border-green-200"}`}
                    >
                      {dupResult.duplicates?.length > 0 ? (
                        <>
                          <AlertTriangle className="w-4 h-4 inline mr-2" />
                          {dupResult.duplicates.length} potential duplicate(s)
                          found
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 inline mr-2" />
                          No duplicates detected
                        </>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {dupResult.recommendation}
                    </p>
                    {dupResult.duplicates?.map((d: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg border text-sm space-y-1"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-medium">
                            TC-{d.id}: {d.title}
                          </span>
                          <Badge variant="outline">
                            {d.similarityScore}% similar
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Badge
                            variant={
                              d.action === "delete"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-[10px] uppercase"
                          >
                            {d.action}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {d.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-primary" />
                Coverage Gap Analysis
              </CardTitle>
              <CardDescription>
                Identify requirements with missing or insufficient test coverage
                across the project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4 mb-2">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Filter by Requirement (optional)
                    </label>
                    <SearchableSelect
                      value={coverageReqId}
                      onValueChange={setCoverageReqId}
                      options={[
                        { value: "all", label: "All requirements" },
                        ...requirements.map((r) => ({ value: String(r.id), label: r.title })),
                      ]}
                      placeholder="All requirements"
                      searchPlaceholder="Search requirement..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Upload Spec Document (optional)
                    </label>
                    <div
                      className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => coverageFileRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">
                        {coverageFileName || "Choose XLSX or PDF file…"}
                      </span>
                    </div>
                    <input
                      ref={coverageFileRef}
                      type="file"
                      accept=".xlsx,.pdf,.xls"
                      className="hidden"
                      onChange={(e) =>
                        setCoverageFileName(e.target.files?.[0]?.name ?? "")
                      }
                    />
                    {coverageFileName && (
                      <p className="text-xs text-primary mt-1">
                        {coverageFileName} selected
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  disabled={coverageLoading}
                  onClick={() =>
                    run(setCoverageLoading, setCoverageResult, () =>
                      callAiEndpoint(token, "/ai/coverage-gap", {
                        requirementId:
                          coverageReqId && coverageReqId !== "all"
                            ? Number(coverageReqId)
                            : undefined,
                        fileName: coverageFileName || undefined,
                      }),
                    )
                  }
                >
                  {coverageLoading ? (
                    <>
                      <LoadingSpinner /> Analyzing...
                    </>
                  ) : (
                    <>
                      <FileSearch className="w-4 h-4 mr-2" />
                      Analyze Coverage Gaps
                    </>
                  )}
                </Button>
              </div>
              {coverageResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-primary">
                        {coverageResult.coverageScore}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Coverage Score
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {coverageResult.stats?.covered ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Covered</p>
                    </div>
                    <div className="p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-red-600">
                        {coverageResult.stats?.uncovered ?? 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Uncovered</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    {coverageResult.summary}
                  </p>
                  {coverageResult.gaps?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Coverage Gaps</p>
                      {coverageResult.gaps.map((g: any, i: number) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg border text-sm space-y-1"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-medium">
                              {g.requirementTitle}
                            </span>
                            <RiskBadge level={g.priority} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {g.issue}
                          </p>
                          <p className="text-xs text-blue-700">
                            {g.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                AI Weekly Summary Generator
              </CardTitle>
              <CardDescription>
                Auto-generate a professional weekly QA status summary with
                highlights, risks, and recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                disabled={weeklySummaryLoading}
                onClick={() =>
                  run(setWeeklySummaryLoading, setWeeklySummaryResult, () =>
                    callAiEndpoint(token, "/ai/weekly-summary", {}),
                  )
                }
              >
                {weeklySummaryLoading ? (
                  <>
                    <LoadingSpinner /> Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate Weekly Summary
                  </>
                )}
              </Button>
              {weeklySummaryResult && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg">
                        {weeklySummaryResult.headline}
                      </h3>
                      <Badge
                        className={
                          weeklySummaryResult.overallHealth === "green"
                            ? "bg-green-100 text-green-800"
                            : weeklySummaryResult.overallHealth === "yellow"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }
                      >
                        {weeklySummaryResult.overallHealth === "green"
                          ? "🟢 Healthy"
                          : weeklySummaryResult.overallHealth === "yellow"
                            ? "🟡 Caution"
                            : "🔴 Attention Needed"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {weeklySummaryResult.summary}
                    </p>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3 text-sm">
                    {weeklySummaryResult.highlights?.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-semibold text-green-700">
                          ✅ Highlights
                        </p>
                        {weeklySummaryResult.highlights.map(
                          (h: string, i: number) => (
                            <p
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              {h}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                    {weeklySummaryResult.risks?.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-semibold text-orange-700">
                          ⚠️ Risks
                        </p>
                        {weeklySummaryResult.risks.map(
                          (r: string, i: number) => (
                            <p
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              {r}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                    {weeklySummaryResult.nextWeekFocus?.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-semibold text-blue-700">
                          🎯 Next Week Focus
                        </p>
                        {weeklySummaryResult.nextWeekFocus.map(
                          (f: string, i: number) => (
                            <p
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              {f}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testdata">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TestTube className="w-4 h-4 text-primary" />
                AI Test Data Generator
              </CardTitle>
              <CardDescription>
                Generate realistic valid/invalid test data, edge-case payloads,
                and API request bodies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Data Type *
                    </label>
                    <Input
                      placeholder="e.g. Malaysian IC numbers, email addresses, phone numbers"
                      value={testDataForm.dataType}
                      onChange={(e) =>
                        setTestDataForm((f) => ({
                          ...f,
                          dataType: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Count
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={testDataForm.count}
                      onChange={(e) =>
                        setTestDataForm((f) => ({
                          ...f,
                          count: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Context
                    </label>
                    <Textarea
                      rows={3}
                      placeholder="What are these for?"
                      value={testDataForm.context}
                      onChange={(e) =>
                        setTestDataForm((f) => ({
                          ...f,
                          context: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={testDataLoading || !testDataForm.dataType}
                    onClick={() =>
                      run(setTestDataLoading, setTestDataResult, () =>
                        callAiEndpoint(token, "/ai/test-data", testDataForm),
                      )
                    }
                  >
                    {testDataLoading ? (
                      <>
                        <LoadingSpinner /> Generating...
                      </>
                    ) : (
                      <>
                        <TestTube className="w-4 h-4 mr-2" />
                        Generate Test Data
                      </>
                    )}
                  </Button>
                </div>
                {testDataResult && (
                  <div className="space-y-2">
                    {testDataResult.notes?.length > 0 && (
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        {testDataResult.notes.join(" | ")}
                      </p>
                    )}
                    <ScrollArea className="h-52 rounded-lg border bg-muted/30">
                      <pre className="text-xs p-3 whitespace-pre-wrap">
                        {JSON.stringify(testDataResult.data, null, 2)}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}