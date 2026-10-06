import * as React from "react";
import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A value the person can see but not change (filled in from a milestone,
 * requirement or role). One look in every dialog: label, a small hint saying
 * where the value comes from, and a grey box that is read as read-only by
 * assistive tech. Pass a string or any node as `value` (badges for several
 * modules); leave it empty to show the `placeholder` instead.
 */
export function ReadOnlyField({
  label,
  hint,
  value,
  placeholder,
  className,
}: {
  label: React.ReactNode;
  /** Where the value comes from or why it can't be changed, e.g. "from the milestone". */
  hint?: string;
  value?: React.ReactNode;
  /** Shown, muted, when there is no value yet. */
  placeholder?: string;
  className?: string;
}) {
  const labelId = React.useId();
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      <Label id={labelId}>
        {label}
        {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({hint})</span>}
      </Label>
      <div
        role="textbox"
        aria-readonly="true"
        aria-labelledby={labelId}
        className="flex min-h-9 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 break-words">
          {empty ? <span className="text-muted-foreground">{placeholder ?? "—"}</span> : value}
        </div>
        <Lock aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}
