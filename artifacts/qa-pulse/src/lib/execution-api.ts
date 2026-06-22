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

export interface ExecutionFile {
  id: number;
  redmineTicketId: string;
  title?: string;
  qaPic?: string;
  remarks?: string;
  selectedModules?: string;
  projectId?: number | null;
  requirementId?: number | null;
  updatedAt: string;
}

export interface ExecutionTestCase {
  id?: number | string; // string for unsaved UI rows, number for DB rows
  moduleName: string;
  caseId?: string;
  testCaseId?: string;
  libraryTcId?: number | null;
  userStory: string;
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
  comments: string;
  qaPic: string;
  rowOrder?: number;
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
  const token = localStorage.getItem("qa_pulse_token");
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
  lastUpdatedAt: string | null;
}> => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch test cases");
  return res.json();
};

// UPDATED: Now accepts the lastUpdatedAt timestamp and handles 409 Conflict errors
export const saveTestCases = async (
  ticketId: string,
  testCases: ExecutionTestCase[],
  lastUpdatedAt: string | null,
) => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ testCases, lastUpdatedAt }),
  });

  if (!res.ok) {
    if (res.status === 409) {
      const err = new Error("Concurrent edit detected");
      (err as any).response = res;
      throw err;
    }
    throw new Error("Failed to save test cases");
  }
  return res.json();
};

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
  uploads?: { filename: string; contentType: string; base64: string }[];
}

export const createRedmineDefect = async (
  payload: CreateDefectPayload,
): Promise<{ id: number; url: string }> => {
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
