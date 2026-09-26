export interface ExecutionModule {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionProject {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  createdAt: string;
}

// CR075 — one row per phase (Requirements/Development/Testing/UAT), rolled
// up across every requirement this execution file's test cases link to.
export interface PhaseTimelineEntry {
  key: "requirements" | "development" | "qa" | "uat";
  label: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
}

export interface ExecutionFile {
  id: number;
  redmineTicketId: string;
  title?: string;
  qaPic?: string;
  remarks?: string;
  selectedModules?: string;
  selectedModuleIds?: number[] | null;
  tracker?: string | null;
  projectId?: number | null;
  requirementId?: number | null;
  milestoneId?: number | null;
  milestoneName?: string | null;
  milestonePriority?: string | null;
  milestoneStatus?: string | null;
  milestonePhaseBreakdown?: { requirement: number; development: number; testing: number; uat: number } | null;
  phaseTimeline?: PhaseTimelineEntry[] | null;
  linkedRequirementCount?: number;
  reviewStatus?: string | null;
  rejectionReason?: string | null;
  qaPicSetBy?: number | null;
  updatedAt: string;
}

export interface TrackerOption {
  id: number;
  redmineId: number;
  name: string;
}

export interface ExecutionTestCase {
  id?: number | string; // string for unsaved UI rows, number for DB rows
  moduleName: string;
  caseId?: string;
  testCaseId?: string;
  libraryTcId?: number | null;
  userStory: string;
  requirementId?: number | string | null;
  tracker?: string;
  scenario: string;
  preCondition: string;
  caseName: string;
  testSteps: string;
  testData: string;
  expectedResult: string;
  result: string;
  executedAt?: string | null;
  actualResult?: string;
  defectNumber: string;
  defectScreenshots?: string; // JSON array of { name, contentType, base64 }
  passEvidence?: ExecutionEvidence[];
  comments: string;
  qaPic: string;
  rowOrder?: number;
  rowType?: "testcase" | "group"; // "group" rows are section banners; label lives in caseName
  // CR023p4 — requirement-change re-review flow
  reviewAcknowledgedAt?: string | null;
  alertRevised?: boolean;
  // Per-row peer acceptance. A row added to an already-approved file lands
  // 'pending' and can't record a result until a peer accepts it.
  reviewState?: "pending" | "accepted" | "rejected";
  addedBy?: number | null;
  addedByName?: string | null;
  acceptedByName?: string | null;
  // The linked requirement's dev work is still open. An approved test case is
  // approved to be run later, not run now — the Result control stays locked
  // until dev hands the requirement over.
  requirementInDevelopment?: boolean;
  // Client-only, sent with the next save and stored on the history entry.
  // Set when a tester overwrites a result that was already recorded.
  resultChangeReason?: string;
}

/** One entry in a test case's execution trail. */
export interface ExecutionTcTrailEntry {
  kind: "result" | "lifecycle";
  at: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  label: string;
  reason: string | null;
}

export interface ExecutionTcTrail {
  testCaseId: string | null;
  caseName: string | null;
  currentResult: string | null;
  addedByName: string | null;
  entries: ExecutionTcTrailEntry[];
}

/** A row a reviewer sent back for rework — held off the execution sheet. */
export interface ReturnedExecutionTestCase {
  id: number;
  testCaseId: string | null;
  caseName: string | null;
  moduleName: string | null;
  libraryTcId: number | null;
  // DEF-0022 — the row's own content, editable by its author right from the
  // rework banner (the row is otherwise off the sheet's normal inline edit).
  testSteps: string | null;
  expectedResult: string | null;
  addedBy: number | null;
  addedByName: string | null;
  returnedByName: string | null;
  returnedAt: string | null;
  reviewComment: string | null;
}

export interface ExecutionEvidence {
  id: number;
  executionTestCaseId: number;
  /** Canonical stored name: <caseId>_<ticket>_<stamp>.<ext>. What downloads. */
  fileName: string;
  /** What the tester's machine called it. Null on uploads that predate renaming. */
  originalFileName?: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  createdAt: string;
}

const getRedmineKey = (): string | null => {
  const direct = localStorage.getItem("qa_pulse_redmine_key");
  if (direct) return direct;
  // Fallback: read from stored user object (covers sessions that pre-date the dedicated key entry)
  try {
    const stored = localStorage.getItem("qa_pulse_user");
    if (stored) {
      const u = JSON.parse(stored);
      if (u?.redmineApiKey) return u.redmineApiKey;
    }
  } catch {}
  return null;
};

const getHeaders = () => {
  // Check both storages: token lives in sessionStorage when "Remember Me" is off
  const token = localStorage.getItem("qa_pulse_token") ?? sessionStorage.getItem("qa_pulse_token");
  const redmineKey = getRedmineKey();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(redmineKey ? { "X-Redmine-User-Key": redmineKey } : {}),
  };
};

export interface ExecutionUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const fetchUsers = async (): Promise<ExecutionUser[]> => {
  const res = await fetch("/api/users", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
};

// --- API Calls ---
export const fetchExecutionFiles = async (): Promise<ExecutionFile[]> => {
  const res = await fetch("/api/execution-files", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch files");
  return res.json();
};

export const fetchTrackers = async (): Promise<TrackerOption[]> => {
  const res = await fetch("/api/trackers", { headers: getHeaders() });
  if (!res.ok) return [];
  return res.json();
};

export interface RequirementOption {
  id: number;
  title: string;
  redmineTicketId?: string | null;
  projectId?: number | null;
  milestoneId?: number | null;
  parentId?: number | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
}

export const fetchRequirements = async (): Promise<RequirementOption[]> => {
  const res = await fetch("/api/requirements", { headers: getHeaders() });
  if (!res.ok) return [];
  return res.json();
};

// Resolves a requirement by Redmine ticket ID for Excel import — returns the
// existing requirement if already linked, otherwise fetches the issue from
// Redmine and creates one. Returns null if the ticket can't be resolved.
export const resolveRequirementByRedmine = async (
  ticketId: string,
  milestoneId?: number | null,
): Promise<RequirementOption | null> => {
  const res = await fetch("/api/requirements/resolve-redmine", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ ticketId, milestoneId: milestoneId ?? undefined }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.requirement ?? null;
};

export const syncTrackersFromRedmine = async (): Promise<TrackerOption[]> => {
  const res = await fetch("/api/trackers/sync", { method: "POST", headers: getHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.trackers ?? [];
};

export const fetchExecutionFile = async (
  id: number,
): Promise<ExecutionFile> => {
  const res = await fetch(`/api/execution-files/${id}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch file");
  return res.json();
};

export const createExecutionFile = async (
  data: Partial<ExecutionFile>,
): Promise<ExecutionFile> => {
  const res = await fetch("/api/execution-files", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create file");
  return res.json();
};

export const deleteExecutionFile = async (id: number): Promise<void> => {
  const res = await fetch(`/api/execution-files/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete file");
};

export const updateExecutionFile = async (
  id: number,
  data: Partial<ExecutionFile>,
): Promise<ExecutionFile> => {
  const res = await fetch(`/api/execution-files/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update file");
  return res.json();
};

// UPDATED: Now returns an object containing both the testCases array and the timestamp
export const fetchTestCases = async (
  ticketId: string,
): Promise<{
  testCases: ExecutionTestCase[];
  returnedTestCases?: ReturnedExecutionTestCase[];
  lastUpdatedAt: string | null;
  file: ExecutionFile | null;
}> => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch test cases");
  return res.json();
};

/**
 * Per-row peer acceptance for test cases added to an already-approved file.
 * `accept` clears the row for execution; `return` sends it back to whoever
 * added it with a comment and takes it off the sheet; `resubmit` is that
 * author putting it back up once fixed.
 */
export const reviewExecutionTestCase = async (
  rowId: number,
  action: "accept" | "return" | "resubmit",
  comment?: string,
) => {
  const res = await fetch(`/api/execution-test-cases/${rowId}/review`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ action, comment }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to ${action} test case`);
  }
  return res.json();
};

/**
 * DEF-0022 — fix a returned row's Test Steps / Expected Result from the
 * rework banner, ahead of resubmitting it. Author-only, only while the row is
 * actually in rework — enforced server-side.
 */
export const editReturnedTestCase = async (
  rowId: number,
  fields: { testSteps?: string; expectedResult?: string },
) => {
  const res = await fetch(`/api/execution-test-cases/${rowId}/content`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update test case");
  }
  return res.json();
};

/**
 * Full execution trail for one row: every result change (who, when, from -> to
 * and why) plus the row's acceptance lifecycle, newest first.
 */
export const fetchTestCaseTrail = async (
  ticketId: string,
  rowId: number,
): Promise<ExecutionTcTrail> => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases/${rowId}/history`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load test case history");
  }
  return res.json();
};

// UPDATED: Now accepts the lastUpdatedAt timestamp and handles 409 Conflict errors
export const saveTestCases = async (
  ticketId: string,
  testCases: ExecutionTestCase[],
  deletedIds: number[] = [],
  isFullSync = false,
) => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ testCases, deletedIds, isFullSync }),
  });

  if (!res.ok) throw new Error("Failed to save test cases");
  return res.json();
};

export const uploadExecutionEvidence = async (
  executionTestCaseId: number,
  file: File,
): Promise<ExecutionEvidence> => {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to read attachment"));
    reader.readAsDataURL(file);
  });
  const res = await fetch(`/api/execution-test-cases/${executionTestCaseId}/evidence`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to upload attachment");
  }
  return res.json();
};

export const deleteExecutionEvidence = async (
  executionTestCaseId: number,
  evidenceId: number,
): Promise<void> => {
  const res = await fetch(`/api/execution-test-cases/${executionTestCaseId}/evidence/${evidenceId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete attachment");
  }
};

export const executionEvidenceUrl = (executionTestCaseId: number, evidenceId: number, inline = false) =>
  `/api/execution-test-cases/${executionTestCaseId}/evidence/${evidenceId}/download${inline ? "?inline=1" : ""}`;

// --- Projects ---
export const fetchProjects = async (): Promise<ExecutionProject[]> => {
  const res = await fetch("/api/projects", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
};

export const createProject = async (
  data: Partial<ExecutionProject>,
): Promise<void> => {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create project");
};

export const updateProject = async (
  id: number,
  data: Partial<ExecutionProject>,
): Promise<ExecutionProject> => {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
};

export const deleteProject = async (id: number): Promise<void> => {
  const res = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete project");
};

// --- Modules ---
export const fetchModules = async (): Promise<ExecutionModule[]> => {
  const res = await fetch("/api/modules", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch modules");
  return res.json();
};

// Modules mapped to one project (project_modules), same association layer
// ModuleSelect uses for the defect dialogs. Narrower and more correct than
// the full catalog above wherever the caller already knows which project
// it's working in.
export const fetchProjectModules = async (projectId: number): Promise<ExecutionModule[]> => {
  const res = await fetch(`/api/projects/${projectId}/modules`, { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch project modules");
  return res.json();
};

export const addModule = async (name: string): Promise<ExecutionModule> => {
  const res = await fetch("/api/modules", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to add module");
  return res.json();
};

export const updateModule = async (
  id: number,
  name: string,
): Promise<ExecutionModule> => {
  const res = await fetch(`/api/modules/${id}`, {
    method: "PATCH", // Updated to match the new Express router
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to update module");
  return res.json();
};

export const deleteModule = async (id: number): Promise<void> => {
  const res = await fetch(`/api/modules/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete module");
};

// --- Redmine Defect helpers ---

export interface RedmineProjectItem {
  id: number;
  redmineId: number;
  name: string;
  identifier: string;
}

export interface RedmineProjectConfigItem {
  redmineProjectId: number;
  complexityFieldId: number | null;
  targetedStartDateFieldId: number | null;
  targetedCompletionDateFieldId: number | null;
  sourceFieldId: number | null;
}

export interface RedmineTracker {
  id: number;
  name: string;
}

export interface RedmineIssueMatch {
  id: number;
  subject: string;
  status: { name: string };
  project: { name: string };
}

export const fetchRedmineProjects = async (): Promise<RedmineProjectItem[]> => {
  const res = await fetch("/api/redmine/projects", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch Redmine projects");
  return res.json();
};

export const fetchRedmineProjectConfig = async (
  _projectId?: number,
): Promise<RedmineProjectConfigItem | null> => {
  const res = await fetch("/api/redmine/global-config", { headers: getHeaders() });
  if (!res.ok) return null;
  return res.json();
};

export const fetchRedmineTrackers = async (): Promise<RedmineTracker[]> => {
  const res = await fetch("/api/redmine/trackers", { headers: getHeaders() });
  if (!res.ok) throw new Error("Failed to fetch Redmine trackers");
  return res.json();
};

export interface RedmineIssueAncestry {
  id: number;
  /** Top of the parent chain — the id a defect's subject should name. */
  rootId: number;
  /** Leaf first, root last. */
  chain: number[];
  truncated: boolean;
}

/**
 * Resolves the top-most ancestor of a Redmine issue. Returns null rather than
 * throwing: a defect subject falling back to the linked ticket is a much
 * smaller problem than blocking the defect form on a Redmine hiccup.
 */
export const fetchRedmineIssueRoot = async (
  issueId: number | string,
): Promise<RedmineIssueAncestry | null> => {
  const res = await fetch(`/api/redmine/issues/${issueId}/root`, { headers: getHeaders() });
  if (!res.ok) return null;
  return res.json();
};

export const searchRedmineIssues = async (
  q: string,
  projectId: number,
): Promise<RedmineIssueMatch[]> => {
  const res = await fetch(
    `/api/redmine/search?q=${encodeURIComponent(q)}&project_id=${projectId}`,
    { headers: getHeaders() },
  );
  if (!res.ok) return [];
  return res.json();
};

export interface RedmineMember {
  id: number;
  name: string;
}

// Contacts are QM Pulse's own directory, synced from every active Redmine
// user (see /contacts/sync-redmine) rather than one project's memberships.
// Only those carrying a redmineId can be named as an assignee, since Redmine
// wants a user id — manually-added contacts have none.
export interface ContactAssignee {
  id: number;
  fullName: string;
  email: string;
  redmineId: number | null;
  isGroup: boolean;
}

export const fetchContactAssignees = async (): Promise<RedmineMember[]> => {
  const res = await fetch("/api/contacts", { headers: getHeaders() });
  if (!res.ok) return [];
  const contacts: ContactAssignee[] = await res.json();
  return contacts
    .filter((c) => !c.isGroup && c.redmineId != null)
    .map((c) => ({ id: c.redmineId as number, name: c.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const fetchRedmineProjectMembers = async (projectId: number): Promise<RedmineMember[]> => {
  const res = await fetch(`/api/redmine/projects/${projectId}/members`, { headers: getHeaders() });
  if (!res.ok) return [];
  return res.json();
};

export interface CreateDefectPayload {
  projectId: number;
  trackerId: number;
  subject: string;
  description: string;
  parentIssueId?: number | null;
  assigneeId?: number | null;
  complexityFieldId?: number | null;
  complexityValue?: string;
  targetedStartDateFieldId?: number | null;
  targetedStartDate?: string;
  targetedCompletionDateFieldId?: number | null;
  targetedCompletionDate?: string;
  // Value is derived server-side from the reporter's own department (qa/dev/
  // fa/pm) — only the target custom field ID is sent from here.
  sourceFieldId?: number | null;
  uploads?: { filename: string; contentType: string; base64: string }[];
}

export const createRedmineDefect = async (
  payload: CreateDefectPayload,
): Promise<{
  id: number;
  url: string;
  customFieldsDropped?: boolean;
  /** What Redmine said when it rejected the custom fields. Present only
   *  alongside customFieldsDropped — names the field that actually objected,
   *  which is the only clue that a field id is mapped to the wrong one. */
  customFieldErrors?: string[];
  /** Set when the requested parent issue couldn't be resolved in Redmine and
   *  the defect was filed without one, so the reporter can link it by hand. */
  parentDropped?: string;
}> => {
  const res = await fetch("/api/redmine/issues", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create defect" }));
    throw new Error(err.error ?? "Failed to create defect");
  }
  return res.json();
};

export const fetchQmpulseProjects = async (): Promise<{ id: number; name: string }[]> => {
  const res = await fetch("/api/projects", { headers: getHeaders() });
  if (!res.ok) return [];
  return res.json();
};

// CR019: record a Redmine-created defect in QM Pulse's defects table so the
// Defects page and retest tracking know about it. Best-effort — callers should
// not block the fail flow on this.
export const registerLocalDefect = async (payload: {
  redmineId: string;
  title: string;
  description?: string;
  stepsToReproduce?: string;
  projectId?: number | null;
  expectedResult?: string;
  actualResult?: string;
  severity?: string;
  module?: string;
  defectCategory?: string;
  executionTcId?: number | null;
  assigneeName?: string;
  tracker?: string;
}): Promise<void> => {
  await fetch("/api/defects/register", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
};
