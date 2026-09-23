import { Component, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Every route past login (App.tsx) is loaded via React.lazy(), and Suspense
// only covers the *loading* state — a rejected dynamic import() (e.g. a
// chunk hash that no longer exists on the server after a redeploy) throws
// during render with nothing to catch it, unmounting the whole tree into a
// silent blank page. This boundary catches that, and for the stale-chunk
// case specifically, reloads once to pick up the fresh build instead of
// leaving the user stuck.
const RELOAD_FLAG_KEY = "qa_pulse_chunk_reload_attempted";

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

function hasAlreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
  } catch {
    // ignore — worst case we just show the manual fallback instead of auto-reloading
  }
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && !hasAlreadyReloaded()) {
      markReloaded();
      window.location.reload();
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Auto-reload already fired in componentDidCatch — show a spinner
    // instead of the error screen while that reload happens.
    if (isChunkLoadError(error) && hasAlreadyReloaded()) {
      return (
        <div className="h-screen w-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 text-center px-4">
        <p className="text-lg font-medium">Something went wrong.</p>
        <p className="text-sm text-muted-foreground max-w-md">
          {isChunkLoadError(error)
            ? "A new version of the app was deployed. Please reload the page."
            : "An unexpected error occurred. Please reload the page."}
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
