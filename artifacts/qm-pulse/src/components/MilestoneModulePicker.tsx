import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiUrl } from "@/lib/api";

export type ModuleSelection = { moduleIds: number[]; allModules: boolean };

export const EMPTY_MODULE_SELECTION: ModuleSelection = { moduleIds: [], allModules: false };

// An existing milestone with no modules covers the whole project.
export function selectionFromMilestone(modules: { id: number }[] | undefined): ModuleSelection {
  return modules && modules.length > 0
    ? { moduleIds: modules.map((m) => m.id), allModules: false }
    : { moduleIds: [], allModules: true };
}

export function useProjectModules(projectId: string | number | null | undefined, token: string | null) {
  return useQuery<{ id: number; name: string }[]>({
    queryKey: ["project-modules", String(projectId ?? "")],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/projects/${projectId}/modules`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId && projectId !== "all",
  });
}

// Mirrors the server rule: required unless the type is data_prep or the
// project has no modules associated to choose from.
export function isModuleSelectionValid(
  selection: ModuleSelection,
  projectModuleCount: number,
  type: string,
): boolean {
  if (type === "data_prep" || projectModuleCount === 0) return true;
  return selection.allModules || selection.moduleIds.length > 0;
}

export function MilestoneModulePicker({
  projectId,
  token,
  value,
  onChange,
  type,
}: {
  projectId: string;
  token: string | null;
  value: ModuleSelection;
  onChange: (v: ModuleSelection) => void;
  type: string;
}) {
  const { data: modules = [], isLoading } = useProjectModules(projectId, token);

  if (type === "data_prep" || !projectId || projectId === "all") return null;
  if (isLoading) return null;
  if (modules.length === 0) {
    return (
      <div className="space-y-1">
        <Label>Modules</Label>
        <p className="text-xs text-muted-foreground">No modules are set up for this project, so this milestone covers the whole project.</p>
      </div>
    );
  }

  const toggleAll = (checked: boolean) =>
    onChange(checked ? { moduleIds: [], allModules: true } : { moduleIds: [], allModules: false });
  const toggleModule = (id: number, checked: boolean) =>
    onChange({
      allModules: false,
      moduleIds: checked ? [...value.moduleIds, id] : value.moduleIds.filter((m) => m !== id),
    });

  return (
    <div className="space-y-1.5">
      <Label>Modules <span className="text-destructive">*</span></Label>
      <div className="border rounded-md p-2 max-h-44 overflow-y-auto space-y-0.5">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 font-medium">
          <Checkbox checked={value.allModules} onCheckedChange={(c) => toggleAll(c === true)} />
          <span className="text-sm">All modules (whole project)</span>
        </label>
        {modules.map((m) => (
          <label key={m.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
            <Checkbox
              checked={value.allModules || value.moduleIds.includes(m.id)}
              disabled={value.allModules}
              onCheckedChange={(c) => toggleModule(m.id, c === true)}
            />
            <span className="text-sm">{m.name}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.allModules
          ? "Covers every module in the project."
          : value.moduleIds.length > 0
            ? `${value.moduleIds.length} selected — requirement and test case pickers are limited to these.`
            : "Select at least one module, or choose All modules."}
      </p>
    </div>
  );
}
