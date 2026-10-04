import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, Sparkles } from "lucide-react";
import { getApiUrl, authHeaders } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { rephraseSuggestion } from "@/lib/rephrase-suggestion";
import { ProgressDialog } from "@/components/ProgressDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// CR092 — "Analyze with AI" for the text typed into a requirement form: score,
// issues, missing items and questions, with Accept to add a point to the
// description. The analysis is a preview and is never saved. Used by the
// milestone page dialog and the Requirements page form.
export function RequirementAiAnalyze({
  title, description, module, requirementId, resetKey, onAddToDescription,
}: {
  title: string;
  description: string;
  module: string;
  /** The saved requirement being edited, if any (lets the rewording see its context). */
  requirementId: number | null;
  /** Changes whenever a different requirement (or a new one) is opened, which clears the result. */
  resetKey: string | number;
  /** Appends the accepted point (already reworded into prose) to the description. */
  onAddToDescription: (prose: string) => void;
}) {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [abort, setAbort] = useState<AbortController | null>(null);
  const [acceptedTexts, setAcceptedTexts] = useState<Set<string>>(new Set());
  const [acceptingText, setAcceptingText] = useState<string | null>(null);

  useEffect(() => {
    setAnalysis(null); setAcceptedTexts(new Set()); setAcceptingText(null);
  }, [resetKey]);

  const canAnalyze = title.trim().length > 0 && description.trim().length >= 20;

  async function analyze() {
    const ctl = new AbortController();
    setAbort(ctl); setAnalyzing(true);
    try {
      const res = await fetch(`${getApiUrl()}/ai/analyze-requirement`, {
        method: "POST", signal: ctl.signal,
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: title.trim(), description, module }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ variant: "destructive", title: data?.error ?? "AI analysis failed" }); return; }
      setAnalysis(data); setAcceptedTexts(new Set());
    } catch (e: any) {
      if (e?.name !== "AbortError") toast({ variant: "destructive", title: "AI analysis failed" });
    } finally {
      setAnalyzing(false); setAbort(null);
    }
  }

  // Reword the point into prose and add it to the description being edited;
  // it is saved only with the form's own save.
  async function accept(text: string) {
    setAcceptingText(text);
    try {
      const { text: prose, rephrased } = await rephraseSuggestion(requirementId, text);
      onAddToDescription(prose);
      setAcceptedTexts((prev) => new Set(prev).add(text));
      toast({ title: rephrased ? "Added to description (reworded by AI)" : "Added to description" });
    } finally {
      setAcceptingText(null);
    }
  }

  const row = (key: number, text: string, secondary?: string) => (
    <li key={key} className="flex items-start justify-between gap-3">
      <span className="min-w-0">{text}{secondary && <span className="block text-xs text-muted-foreground">{secondary}</span>}</span>
      {acceptedTexts.has(text)
        ? <span className="text-xs text-green-600 flex items-center gap-1 shrink-0 whitespace-nowrap mt-0.5"><CheckCircle2 className="w-3.5 h-3.5" /> Accepted</span>
        : <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 shrink-0" disabled={acceptingText === text} onClick={() => accept(text)}>
            {acceptingText === text ? <><Loader2 className="w-3 h-3 animate-spin" /> Adding…</> : <><Plus className="w-3 h-3" /> Accept</>}
          </Button>}
    </li>
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canAnalyze || analyzing} onClick={analyze}>
          <Sparkles className="w-4 h-4 mr-1.5" /> {analysis ? "Analyze again" : "Analyze with AI"}
        </Button>
        {!canAnalyze && <span className="text-xs text-muted-foreground">Needs a title and at least 20 characters of description.</span>}
      </div>
      {analysis && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={Number(analysis.score) >= 60 ? "secondary" : "destructive"}>Score {analysis.score ?? "?"}/100</Badge>
            {analysis.riskLevel && <Badge variant="outline">Risk {analysis.riskLevel}</Badge>}
          </div>
          {analysis.summary && <p>{analysis.summary}</p>}
          {Number(analysis.score) < 60 && <p className="text-xs text-amber-700 dark:text-amber-300">The score is low. You can still save or submit, but consider fixing the points below first.</p>}
          {(analysis.missingItems ?? []).length > 0 && <div><b>Missing items</b><ul className="mt-1 space-y-1.5">{analysis.missingItems.map((m: string, n: number) => row(n, m))}</ul></div>}
          {(analysis.issues ?? []).filter((i: any) => i.suggestion).length > 0 && <div><b>Issue suggestions</b><ul className="mt-1 space-y-1.5">{analysis.issues.filter((i: any) => i.suggestion).map((i: any, n: number) => row(n, i.suggestion, i.description))}</ul></div>}
          {(analysis.questions ?? []).length > 0 && <div><b>Questions</b><ul className="list-disc pl-5">{analysis.questions.map((q: string, n: number) => <li key={n}>{q}</li>)}</ul></div>}
          <p className="text-xs text-muted-foreground">Accept adds the point to the Description above. The analysis itself is a preview and is not saved. Questions can be asked in Discussion once the requirement is saved.</p>
        </div>
      )}
      <ProgressDialog
        open={analyzing}
        title="Analyzing requirement"
        message="Asking the AI to check this requirement for gaps and unclear points."
        hint="Usually 10 to 30 seconds"
        onCancel={() => abort?.abort()}
      />
    </>
  );
}
