// Shared shape of a /dashboard/task-board row, plus the PIC helpers that read
// it. Extracted from pages/Tasks.tsx so the board and its Visualization tab
// derive people and departments the same way — if the two disagreed, the charts
// would quietly contradict the table right next to them.

export interface PhaseTimelineEntry {
  key: "requirements" | "development" | "qa" | "uat";
  label: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export type DepartmentPICs = Record<"FA" | "Dev" | "QA", string[]>;
export const PIC_DEPARTMENTS = ["FA", "Dev", "QA"] as const;
export type PicDepartment = (typeof PIC_DEPARTMENTS)[number];

export interface TaskBoardRow {
  requirementId: number;
  title: string;
  parentId: number | null;
  projectId: number | null;
  milestoneId: number;
  milestoneName: string;
  milestonePriority: string | null;
  parentRedmineIds?: string[];
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  milestoneStatus: string;
  // Milestones running on the QA Pipeline don't go through FA approval or dev
  // handoff, so their FA/Dev PICs are legitimately empty and their phase comes
  // from the pipeline's gates. Flagged so the board can say so.
  pipelineEnabled?: boolean;
  phase: "requirements" | "gap" | "develop" | "qa" | "uat";
  phaseLabel: string;
  statusLabel: string;
  assignee: string | null;
  picByDepartment?: DepartmentPICs;
  progress: number;
  dueDate: string | null;
  goLiveDate: string | null;
  devAssigneeId: number | null;
  executionFileId: number | null;
  phaseTimeline: PhaseTimelineEntry[];
  devTaskCounts: { done: number; total: number } | null;
}

export function picNamesForRow(row: TaskBoardRow, department: PicDepartment): string[] {
  // Keep the page compatible while an older API instance finishes deploying.
  const legacy = row.assignee?.split(" · ").find((part) => part.startsWith(department + ": "));
  const assigned = row.picByDepartment?.[department] ?? legacy?.slice(department.length + 2).split(",") ?? [];
  return assigned.map((value) => value.trim()).filter((name) => name && name !== "—");
}

export function collectPICs(rows: TaskBoardRow[]): DepartmentPICs {
  const result: DepartmentPICs = { FA: [], Dev: [], QA: [] };
  for (const department of PIC_DEPARTMENTS) {
    const names = new Map<string, string>();
    for (const row of rows) {
      for (const name of picNamesForRow(row, department)) {
        names.set(name.toLowerCase(), name);
      }
    }
    result[department] = [...names.values()].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

// Maps a viewer's own department (lowercase, as stored on the user/role) to
// the PIC-column key their rows are tracked under.
export const DEPARTMENT_TO_PIC: Record<string, PicDepartment> = { qa: "QA", fa: "FA", dev: "Dev" };

/** Past its due date and still short of 100%. */
export function isRowOverdue(row: TaskBoardRow): boolean {
  if (row.progress >= 100 || !row.dueDate) return false;
  return new Date(row.dueDate).getTime() < Date.now();
}
