import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/api";

// CR105 — Project, Milestone, Module and Requirement on a defect fill each
// other in. Choosing one field fills the others it implies; a field the person
// set by hand is never overwritten by a later fill; any filled field can still
// be changed.

export type CtxKey = "projectId" | "milestoneId" | "requirementId" | "module";

export interface DefectCtx {
  projectId: number | null;
  milestoneId: number | null;
  requirementId: number | null;
  module: string;
}

export interface CtxMilestone { id: number; name: string; projectId: number; projectName?: string | null; status?: string | null }
export interface CtxRequirement { id: number; title: string; projectId?: number | null; milestoneId?: number | null; module?: string | null; redmineTicketId?: string | null }

export interface CtxState {
  ctx: DefectCtx;
  /** Keys that were filled automatically (shown with an "auto" tag). */
  auto: CtxKey[];
  /** Keys the person chose by hand. */
  touched: CtxKey[];
  /** One line saying what the last choice filled, for the person to read. */
  note: string;
}

export const EMPTY_CTX: DefectCtx = { projectId: null, milestoneId: null, requirementId: null, module: "" };
export const EMPTY_STATE: CtxState = { ctx: EMPTY_CTX, auto: [], touched: [], note: "" };

const without = (list: CtxKey[], key: CtxKey) => list.filter((k) => k !== key);

/** A requirement can list several modules; a defect holds one, so take the first. */
export function firstModule(module?: string | null): string {
  return String(module ?? "").split(",").map((m) => m.trim()).filter(Boolean)[0] ?? "";
}

export function changeCtx(
  state: CtxState,
  key: CtxKey,
  value: number | string | null,
  milestones: CtxMilestone[],
  requirements: CtxRequirement[],
): CtxState {
  const ctx: DefectCtx = { ...state.ctx, [key]: key === "module" ? String(value ?? "") : (value === "" ? null : value) } as DefectCtx;
  let auto = without(state.auto, key);
  let touched = state.touched.filter((k) => k !== key);
  const isEmpty = key === "module" ? !ctx.module : ctx[key] == null;
  if (!isEmpty) touched = [...touched, key];
  const filled: string[] = [];
  const fill = (k: CtxKey, v: number | string | null, label: string) => {
    if (touched.includes(k)) return;
    const current = ctx[k];
    if (v == null || v === "" || current === v) return;
    (ctx as any)[k] = v;
    if (!auto.includes(k)) auto = [...auto, k];
    filled.push(label);
  };
  const drop = (k: CtxKey) => {
    (ctx as any)[k] = k === "module" ? "" : null;
    auto = without(auto, k);
    touched = without(touched, k);
  };

  if (key === "projectId") {
    // The project narrows the other lists; drop what no longer belongs.
    const ms = ctx.milestoneId != null ? milestones.find((m) => m.id === ctx.milestoneId) : null;
    if (ms && ctx.projectId != null && ms.projectId !== ctx.projectId) drop("milestoneId");
    const rq = ctx.requirementId != null ? requirements.find((r) => r.id === ctx.requirementId) : null;
    if (rq && ctx.projectId != null && rq.projectId != null && rq.projectId !== ctx.projectId) drop("requirementId");
  } else if (key === "milestoneId" && ctx.milestoneId != null) {
    const ms = milestones.find((m) => m.id === ctx.milestoneId);
    if (ms) fill("projectId", ms.projectId, "project");
    const rq = ctx.requirementId != null ? requirements.find((r) => r.id === ctx.requirementId) : null;
    if (rq && rq.milestoneId !== ctx.milestoneId) drop("requirementId");
  } else if (key === "requirementId" && ctx.requirementId != null) {
    const rq = requirements.find((r) => r.id === ctx.requirementId);
    if (rq) {
      fill("milestoneId", rq.milestoneId ?? null, "milestone");
      fill("projectId", rq.projectId ?? null, "project");
      fill("module", firstModule(rq.module), "module");
    }
  }
  const label = { projectId: "Project", milestoneId: "Milestone", requirementId: "Requirement", module: "Module" }[key];
  const note = filled.length
    ? `${label} filled the ${filled.join(", ")}.`
    : key === "projectId" ? "Project narrows the milestone and requirement lists." : "";
  return { ctx, auto, touched, note };
}

/**
 * State and data for the four linked fields. `open` gates the fetches so a
 * closed dialog costs nothing.
 */
export function useDefectContext(open: boolean) {
  const { token } = useAuth();
  const [state, setState] = useState<CtxState>(EMPTY_STATE);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: projects = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["defect-ctx-projects"],
    enabled: open && !!token,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/projects`, { headers });
      return res.ok ? res.json() : [];
    },
  });
  const { data: milestones = [] } = useQuery<CtxMilestone[]>({
    queryKey: ["milestones", "all-accessible"],
    enabled: open && !!token,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/milestones?projectId=all`, { headers });
      return res.ok ? res.json() : [];
    },
  });
  const { data: requirements = [] } = useQuery<CtxRequirement[]>({
    queryKey: ["defect-ctx-requirements"],
    enabled: open && !!token,
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/requirements`, { headers });
      return res.ok ? res.json() : [];
    },
  });

  const change = useCallback(
    (key: CtxKey, value: number | string | null) => setState((s) => changeCtx(s, key, value, milestones, requirements)),
    [milestones, requirements],
  );
  /** Start from known values (the Fail popup): they count as filled-in, not hand-set. */
  const reset = useCallback((ctx: Partial<DefectCtx> = {}) => {
    const full = { ...EMPTY_CTX, ...ctx };
    const auto = (Object.keys(full) as CtxKey[]).filter((k) => (k === "module" ? !!full.module : full[k] != null));
    setState({ ctx: full, auto, touched: [], note: "" });
  }, []);

  return { state, change, reset, projects, milestones, requirements };
}
