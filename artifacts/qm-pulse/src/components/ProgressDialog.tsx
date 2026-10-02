import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// CR093 — one shared "something is happening" dialog for long-running actions.
// Say what the system is doing in plain words, show how long it has been
// running, and let the user cancel (the caller aborts its request in onCancel).
// Pass `step`/`total` only when the work is a real loop; otherwise it shows an
// honest indeterminate bar instead of invented steps.
export function ProgressDialog({
  open, title, message, hint, step, total, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  hint?: string;
  step?: number;
  total?: number;
  onCancel?: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!open) { setSeconds(0); return; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const determinate = step != null && total != null && total > 0;
  return (
    <Dialog open={open} onOpenChange={() => { /* closes only when the work ends or is cancelled */ }}>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { e.preventDefault(); onCancel?.(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {determinate
          ? <Progress value={Math.min(100, Math.round((step! / total!) * 100))} />
          : <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{determinate ? `${step} of ${total}` : hint ?? ""}</span>
          <span>{seconds}s</span>
        </div>
        {onCancel && <div className="flex justify-end"><Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button></div>}
      </DialogContent>
    </Dialog>
  );
}
