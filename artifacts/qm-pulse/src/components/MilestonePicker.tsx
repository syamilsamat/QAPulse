import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getApiUrl } from "@/lib/api";

export function MilestonePicker({
  projectId,
  token,
  value,
  onChange,
  required = false,
}: {
  projectId: string;
  token: string | null;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const { data: milestones = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["milestones", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`${getApiUrl()}/milestones?projectId=${projectId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? res.json() : [];
    },
    enabled: !!projectId,
  });

  if (milestones.length === 0) {
    return required ? (
      <div className="space-y-1">
        <Label>Milestone <span className="text-destructive">*</span></Label>
        <p className="text-xs text-muted-foreground">No milestones exist for this project yet — create one on the Milestones page first.</p>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-1">
      <Label>Milestone {required ? <span className="text-destructive">*</span> : <span className="text-xs text-muted-foreground">(optional)</span>}</Label>
      <SearchableSelect
        value={value}
        onValueChange={onChange}
        options={[
          ...(required ? [] : [{ value: "", label: "None" }]),
          ...milestones.map(m => ({ value: String(m.id), label: m.name })),
        ]}
        placeholder="Select milestone…"
        searchPlaceholder="Search milestones…"
      />
    </div>
  );
}
