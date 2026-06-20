import {
  Activity,
  LayoutDashboard,
  Users,
  FileText,
  TestTube,
  CheckSquare,
  Search,
  Settings,
  CircleUser,
  LogOut,
  Menu,
  Coffee,
  Bell,
  Sparkles,
  FileBarChart2,
  List,
  Play,
  History,
  type LucideProps,
} from "lucide-react";

import { cn } from "@/lib/utils";

// --- Main Navigation Icons ---

export function HoverPulse({ className, ...props }: LucideProps) {
  return (
    <Activity
      className={cn(
        "transition-all duration-300 group-hover:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export function HoverDashboard({ className, ...props }: LucideProps) {
  return (
    <LayoutDashboard
      className={cn(
        "transition-all duration-300 group-hover:-translate-y-1 group-hover:text-blue-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverUsers({ className, ...props }: LucideProps) {
  return (
    <Users
      className={cn(
        "transition-all duration-300 group-hover:scale-110 group-hover:text-indigo-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverDocument({ className, ...props }: LucideProps) {
  return (
    <FileText
      className={cn(
        "transition-all duration-300 group-hover:-rotate-6 group-hover:scale-105 group-hover:text-orange-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverFlask({ className, ...props }: LucideProps) {
  return (
    <TestTube
      className={cn(
        "transition-all duration-300 group-hover:rotate-12 group-hover:scale-110 origin-bottom-left group-hover:text-teal-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverCheckSquare({ className, ...props }: LucideProps) {
  return (
    <CheckSquare
      className={cn(
        "transition-all duration-300 group-hover:scale-110 group-hover:text-emerald-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverSearch({ className, ...props }: LucideProps) {
  return (
    <Search
      className={cn(
        "transition-all duration-300 group-hover:translate-x-1 group-hover:scale-110 group-hover:text-violet-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverSettings({ className, ...props }: LucideProps) {
  return (
    <Settings
      className={cn(
        "transition-all duration-500 group-hover:rotate-90 group-hover:text-slate-500 dark:group-hover:text-slate-400",
        className,
      )}
      {...props}
    />
  );
}

export function HoverAccount({ className, ...props }: LucideProps) {
  return (
    <CircleUser
      className={cn(
        "transition-all duration-300 group-hover:scale-110 group-hover:text-blue-500 dark:group-hover:text-blue-400",
        className,
      )}
      {...props}
    />
  );
}

export function HoverLogOut({ className, ...props }: LucideProps) {
  return (
    <LogOut
      className={cn(
        "transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-red-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverMenu({ className, ...props }: LucideProps) {
  return (
    <Menu
      className={cn(
        "transition-all duration-300 group-hover:scale-110 group-hover:text-zinc-500 dark:group-hover:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

export function HoverCoffee({ className, ...props }: LucideProps) {
  return (
    <Coffee
      className={cn(
        "transition-all duration-300 group-hover:-rotate-12 group-hover:translate-y-[-2px] group-hover:text-amber-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverBell({ className, ...props }: LucideProps) {
  return (
    <Bell
      className={cn(
        "transition-all duration-300 origin-top group-hover:rotate-12 group-hover:text-yellow-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverSparkles({ className, ...props }: LucideProps) {
  return (
    <Sparkles
      className={cn(
        "transition-all duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:text-fuchsia-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverChart({ className, ...props }: LucideProps) {
  return (
    <FileBarChart2
      className={cn(
        "transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-105 group-hover:text-pink-500",
        className,
      )}
      {...props}
    />
  );
}

// --- Submenu Icons ---

export function HoverList({ className, ...props }: LucideProps) {
  return (
    <List
      className={cn(
        "transition-all duration-300 group-hover:translate-x-1 group-hover:text-cyan-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverPlay({ className, ...props }: LucideProps) {
  return (
    <Play
      className={cn(
        "transition-all duration-300 group-hover:scale-110 group-hover:text-lime-500",
        className,
      )}
      {...props}
    />
  );
}

export function HoverHistory({ className, ...props }: LucideProps) {
  return (
    <History
      className={cn(
        "transition-all duration-500 group-hover:-rotate-45 group-hover:text-purple-500",
        className,
      )}
      {...props}
    />
  );
}

// --- Brand Logo Icon ---

export function AnimatedQALogo({ className }: { className?: string }) {
  return (
    <div className="relative flex items-center justify-center p-1.5 rounded-lg group bg-gradient-to-br from-black via-slate-900 to-blue-600">

      {/* Soft pulse background */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-slate-950/40 via-slate-900/40 to-blue-500/30 animate-pulse" />

      {/* Radar ping on hover */}
      <div className="absolute inset-0 rounded-lg bg-blue-500/30 opacity-0 group-hover:opacity-100 group-hover:animate-ping" />

      {/* Activity icon */}
      <Activity
        className={cn(
          "relative z-10 text-white transition-all duration-500 group-hover:scale-110 group-hover:text-blue-200",
          className
        )}
        strokeWidth={2.5}
      />
    </div>
  );
}
