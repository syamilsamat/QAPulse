import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ModuleRow = { id: number; name: string };

/**
 * Module picker for the defect dialogs.
 *
 * Module used to be a free-text Input, so the same area was filed as
 * "Authentication", "auth" and "Login" depending on who typed it — and every
 * module-scoped view (CR035 scoping, the execution grid, defect analytics)
 * keys on that string. This offers the modules already in the system instead.
 *
 * Scope follows the project: once a QM Pulse project is chosen only that
 * project's modules are offered (GET /projects/:id/modules), which is the same
 * association layer the execution sheet uses. With no project chosen the full
 * catalog is offered rather than nothing, so a defect that genuinely has no
 * project can still be classified.
 *
 * A value that is not in the catalog — anything pulled from a Redmine category,
 * or typed before this was a picker — is kept and shown as its own option, so
 * opening an old defect in the edit dialog can never silently blank its module.
 */
export function ModuleSelect({
  value,
  onChange,
  projectId,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  projectId?: number | null;
  disabled?: boolean;
}) {
  const { token } = useAuth();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: modules = [], isLoading } = useQuery<ModuleRow[]>({
    queryKey: ["defect-modules", projectId ?? "all"],
    enabled: !!token,
    queryFn: async () => {
      const url = projectId
        ? `${getApiUrl()}/projects/${projectId}/modules`
        : `${getApiUrl()}/modules`;
      const res = await fetch(url, { headers });
      return res.ok ? res.json() : [];
    },
  });

  const names = modules.map((m) => m.name).filter(Boolean);
  const options = [...new Set(names)].sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: `${value} (not in the module list)` });
  }

  // A project with no modules mapped yet would otherwise present an empty
  // dropdown with no explanation of what to do about it.
  const emptyText = projectId
    ? "No modules mapped to this project yet — add them under Module & Project."
    : "No modules in the system yet.";

  return (
    <SearchableSelect
      value={value}
      onValueChange={onChange}
      options={options}
      disabled={disabled || isLoading}
      placeholder={isLoading ? "Loading modules..." : "Select module..."}
      searchPlaceholder="Search modules..."
      emptyText={emptyText}
    />
  );
}
