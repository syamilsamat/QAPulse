export const DEVELOPMENT_TASK_EVENT_TYPES = [
  "task_created", "task_assigned", "task_updated", "task_status_changed", "task_submitted_for_review",
];

/** Audit events that start development on a linked requirement. */
export function isDevelopmentTaskStart(event: { type: string; newValue: string | null }): boolean {
  if (["task_created", "task_assigned", "task_submitted_for_review"].includes(event.type)) return true;
  if (!["task_updated", "task_status_changed"].includes(event.type)) return false;
  try {
    const value = JSON.parse(event.newValue ?? "null");
    return value?.status === "in_progress" || (Array.isArray(value?.assigneeIds) && value.assigneeIds.length > 0);
  } catch {
    return false;
  }
}
