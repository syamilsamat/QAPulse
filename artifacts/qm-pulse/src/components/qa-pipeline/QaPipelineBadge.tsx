import { Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Marks a milestone that runs on the QA Pipeline. One look everywhere it is shown. */
export function QaPipelineBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4 text-[10px] font-normal gap-1 bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
        className,
      )}
      title="Runs on the QA Pipeline — QA-led, with no FA approval or dev handoff stage"
    >
      <Workflow className="w-2.5 h-2.5" /> QA Pipeline
    </Badge>
  );
}
