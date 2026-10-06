import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RiskSuggestion = {
  id: number;
  title: string;
  current: string | null;
  suggested: string;
};

// AI proposes a risk priority per test case; nothing is saved until a QA user
// ticks the ones they agree with and applies them here.
export function RiskPrioritySuggestionsDialog({
  open,
  onOpenChange,
  suggestions,
  applying,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: RiskSuggestion[];
  applying: boolean;
  onApply: (picked: { id: number; priority: string }[]) => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // Pre-tick only the suggestions that would actually change something.
  useEffect(() => {
    if (open) setPicked(new Set(suggestions.filter((s) => s.current !== s.suggested).map((s) => s.id)));
  }, [open, suggestions]);

  const toggle = (id: number, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review AI risk priorities</DialogTitle>
          <DialogDescription>
            These are suggestions only. Tick the ones you agree with — nothing is saved until you apply.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto divide-y border rounded-md">
          {suggestions.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">The AI returned no usable suggestions.</p>
          )}
          {suggestions.map((s) => (
            <label key={s.id} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/50">
              <Checkbox
                className="mt-0.5"
                checked={picked.has(s.id)}
                onCheckedChange={(c) => toggle(s.id, c === true)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm break-words">{s.title}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <Badge variant="outline">{s.current ?? "Unset"}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant={s.current === s.suggested ? "outline" : "default"}>{s.suggested}</Badge>
                  {s.current === s.suggested && <span className="text-muted-foreground">no change</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>Cancel</Button>
          <Button
            disabled={applying || picked.size === 0}
            onClick={() => onApply(suggestions.filter((s) => picked.has(s.id)).map((s) => ({ id: s.id, priority: s.suggested })))}
          >
            {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Apply {picked.size} priorit{picked.size === 1 ? "y" : "ies"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
