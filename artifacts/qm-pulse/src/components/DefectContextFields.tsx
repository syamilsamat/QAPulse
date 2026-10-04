import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ModuleSelect } from "@/components/ModuleSelect";
import type { CtxKey, useDefectContext } from "@/lib/defect-context";

// CR105 — Project, Milestone, Module and Requirement for a defect, in that
// order, all optional. Nothing is blocked behind another field: every list is
// open from the start and choosing one narrows or fills the others.
export function DefectContextFields({
  dc, autoLabel = "auto",
}: {
  dc: ReturnType<typeof useDefectContext>;
  /** What the tag on a filled-in field says ("auto", or "from test case"). */
  autoLabel?: string;
}) {
  const { state, change, projects, milestones, requirements } = dc;
  const { ctx } = state;
  const tag = (k: CtxKey) => state.auto.includes(k)
    ? <span className="ml-1.5 rounded-full bg-green-100 px-2 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">{autoLabel}</span>
    : null;

  const milestoneChoices = milestones.filter((m) => ctx.projectId == null || m.projectId === ctx.projectId);
  const requirementChoices = requirements
    .filter((r) => ctx.projectId == null || r.projectId == null || r.projectId === ctx.projectId)
    .filter((r) => ctx.milestoneId == null || r.milestoneId === ctx.milestoneId);
  const none = { value: "", label: "None" };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Project{tag("projectId")}</Label>
          <SearchableSelect
            value={ctx.projectId ? String(ctx.projectId) : ""}
            onValueChange={(v) => change("projectId", v ? Number(v) : null)}
            options={[none, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
            placeholder="Optional"
            searchPlaceholder="Search projects..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>Milestone{tag("milestoneId")}</Label>
          <SearchableSelect
            value={ctx.milestoneId ? String(ctx.milestoneId) : ""}
            onValueChange={(v) => change("milestoneId", v ? Number(v) : null)}
            options={[none, ...milestoneChoices.map((m) => ({ value: String(m.id), label: ctx.projectId == null && m.projectName ? `${m.name} (${m.projectName})` : m.name }))]}
            placeholder="Optional"
            searchPlaceholder="Search milestones..."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Module{tag("module")}</Label>
          <ModuleSelect value={ctx.module} onChange={(v) => change("module", v)} projectId={ctx.projectId} />
        </div>
        <div className="space-y-1.5">
          <Label>Requirement{tag("requirementId")}</Label>
          <SearchableSelect
            value={ctx.requirementId ? String(ctx.requirementId) : ""}
            onValueChange={(v) => change("requirementId", v ? Number(v) : null)}
            options={[none, ...requirementChoices.map((r) => ({ value: String(r.id), label: r.title, keywords: r.redmineTicketId ?? undefined }))]}
            placeholder="Optional"
            searchPlaceholder="Search requirements..."
          />
        </div>
      </div>
      {state.note && <p className="text-xs text-muted-foreground" aria-live="polite">{state.note}</p>}
    </div>
  );
}
