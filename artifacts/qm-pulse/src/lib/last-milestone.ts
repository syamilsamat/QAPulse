// CR098 — the milestone a person last chose in a creation dialog, kept in this
// browser so the next dialog starts there. Storage can be blocked, so every
// access is guarded and the dialogs work without it.
const KEY = "qm_pulse_last_milestone";

export function getLastMilestoneId(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function rememberMilestone(id: number | string | null | undefined): void {
  try {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) localStorage.setItem(KEY, String(n));
  } catch { /* storage unavailable */ }
}

/** A finished or cancelled milestone is not offered as a starting point. */
export function isOpenMilestone(status: string | null | undefined): boolean {
  return status !== "completed" && status !== "cancelled";
}

/**
 * Where a creation dialog should start: the page's milestone filter (honored
 * whatever its status, since the person is already working there), otherwise
 * the last open milestone used, otherwise nothing.
 */
export function startingMilestoneId(
  milestones: { id: number; status?: string | null }[],
  pageMilestoneId?: number | string | null,
): number | null {
  const fromPage = Number(pageMilestoneId);
  if (Number.isInteger(fromPage) && fromPage > 0 && milestones.some((m) => m.id === fromPage)) return fromPage;
  const last = getLastMilestoneId();
  return last != null && milestones.some((m) => m.id === last && isOpenMilestone(m.status)) ? last : null;
}
