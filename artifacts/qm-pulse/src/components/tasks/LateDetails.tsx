import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PIC_DEPARTMENTS, picNamesForRow, type TaskBoardRow } from "@/lib/task-board";

const DAY_MS = 24 * 60 * 60 * 1000;

function lateBy(row: TaskBoardRow): string {
  if (!row.dueDate) return "";
  const days = Math.floor((Date.now() - new Date(row.dueDate).getTime()) / DAY_MS);
  if (days < 1) return "Less than a day late";
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

/**
 * "N late" that explains itself: hover (mouse) previews the list, click or tap
 * pins it open — so it also works on a phone, where there is no hover. Each
 * late requirement shows what it is, where it belongs, how late it is, where
 * it is stuck and who is involved, most overdue first.
 */
export function LateDetails({
  rows,
  heading,
  projectNameById,
  stageLabelFor,
  children,
  className,
}: {
  /** Only the late rows to list. */
  rows: TaskBoardRow[];
  heading: string;
  projectNameById: Map<number, string>;
  stageLabelFor: (row: TaskBoardRow) => string;
  /** The visible trigger content, e.g. "⚠ 10 late". */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Hover only for a real mouse — touch and pen go through click instead, so a
  // tap doesn't open-then-immediately-close.
  const hoverOpen = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned) return;
    // Short grace period so moving from the trigger into the panel keeps it.
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  const sorted = [...rows].sort(
    (a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime(),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPinned(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
          aria-label={`${heading} — show details`}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onClick={(e) => {
            // Take over Radix's toggle: a click after a hover-open should pin
            // the panel, not close it.
            e.preventDefault();
            window.clearTimeout(closeTimer.current);
            if (pinned) {
              setPinned(false);
              setOpen(false);
            } else {
              setPinned(true);
              setOpen(true);
            }
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,28rem)] p-0"
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" aria-hidden />
            {heading}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Past the due date and not finished yet. Most overdue first.
            {!pinned && " Click to keep this open."}
          </p>
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y">
          {sorted.map((row) => {
            const project = row.projectId != null ? projectNameById.get(row.projectId) : undefined;
            const people = PIC_DEPARTMENTS.map((dept) => ({ dept, names: picNamesForRow(row, dept) }));
            return (
              <li key={row.requirementId} className="px-4 py-3 text-xs space-y-1">
                <Link
                  href={`/requirements/${row.requirementId}`}
                  className="text-sm font-medium text-foreground hover:underline inline-flex items-start gap-1 break-words"
                >
                  {row.title}
                  <ExternalLink className="w-3 h-3 mt-1 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
                <p className="text-muted-foreground break-words">
                  {project ?? "No project"} · {row.milestoneName}
                </p>
                <p className="text-destructive font-medium">
                  {lateBy(row)}
                  {row.dueDate && (
                    <span className="text-muted-foreground font-normal">
                      {" "}· was due {format(new Date(row.dueDate), "d MMM yyyy")}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Now: <span className="text-foreground">{stageLabelFor(row)}</span> · {Math.round(row.progress)}% done
                </p>
                <p className="text-muted-foreground break-words">
                  Who:{" "}
                  {people.map(({ dept, names }, i) => (
                    <span key={dept}>
                      {i > 0 && " · "}
                      {dept}:{" "}
                      {names.length > 0
                        ? <span className="text-foreground">{names.join(", ")}</span>
                        : <span className="italic">nobody</span>}
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
