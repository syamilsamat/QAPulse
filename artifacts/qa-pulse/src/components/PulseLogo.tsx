import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const MARK: Record<Size, string> = {
  sm: "w-8 h-8",
  md: "w-9 h-9",
  lg: "w-14 h-14",
};
const ICON: Record<Size, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-8 h-8",
};
const WORD: Record<Size, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
};

/**
 * Shared QMPulse brand mark — the teal→sky gradient tile with the pulse icon,
 * optionally followed by the "QMPulse" wordmark. Hovering the logo fires a
 * radar-ping "pulse" ring and scales the icon. Used in the landing nav and on
 * the login screen so the two stay identical.
 */
export function PulseLogo({
  size = "md",
  showWord = true,
  wordClassName,
  className,
}: {
  size?: Size;
  showWord?: boolean;
  wordClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("group inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-sky-500 shadow-lg shadow-teal-500/25",
          MARK[size],
        )}
      >
        {/* radar ping on hover — the "pulse" effect */}
        <span className="pointer-events-none absolute inset-0 rounded-xl bg-teal-400/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-ping" />
        <Activity
          className={cn(
            "relative z-10 text-[#04070f] transition-transform duration-300 group-hover:scale-110",
            ICON[size],
          )}
          strokeWidth={2.5}
        />
      </span>
      {showWord && (
        <span className={cn("font-semibold tracking-tight", WORD[size], wordClassName)}>
          QM<span className="text-teal-300">Pulse</span>
        </span>
      )}
    </span>
  );
}

export default PulseLogo;
