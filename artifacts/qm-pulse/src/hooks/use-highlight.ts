import { useEffect } from "react";
import { useSearch } from "wouter";

// CR051 — consumes the `?highlight=<id>` param that notification deep-links
// emit (defects/tasks/milestones). Scrolls the matching row into view and
// flashes a ring. Rows opt in by rendering `id={highlightRowId(entityId)}`.
// Purely additive: no-op when the param is absent or no row matches.
export function highlightRowId(id: number | string): string {
  return `hl-row-${id}`;
}

export function useHighlightRow(deps: unknown[] = []): void {
  const search = useSearch();
  useEffect(() => {
    const id = new URLSearchParams(search).get("highlight");
    if (!id) return;
    // Wait a tick so the list has rendered before we look for the row.
    const t = setTimeout(() => {
      const el = document.getElementById(highlightRowId(id));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md", "transition");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
      }, 2400);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, ...deps]);
}
