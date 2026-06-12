// src/lib/execution-api.ts

export interface ExecutionModule {
  id: number;
  name: string;
}

export interface ExecutionFile {
  id: number;
  redmineTicketId: string;
  title?: string;
  qaPic?: string;
  remarks?: string;
  selectedModules?: string;
  updatedAt: string;
}

export interface ExecutionTestCase {
  id?: number | string; // string for unsaved UI rows, number for DB rows
  moduleName: string;
  caseId: string;
  userStory: string;
  scenario: string;
  preCondition: string;
  caseName: string;
  testSteps: string;
  testData: string;
  expectedResult: string;
  result: string;
  defectNumber: string;
  comments: string;
  qaPic: string;
}

const getHeaders = () => {
  return {
    "Content-Type": "application/json",
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
    // Pass the 409 status up to the component so it can show the concurrent edit warning
    if (res.status === 409) {
      const err = new Error("Concurrent edit detected");
      (err as any).response = res;
      throw err;
    }
    throw new Error("Failed to save test cases");
  }
  return res.json();
};

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
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to update module");
  return res.json();
};

export const deleteModule = async (id: number) => {
  const res = await fetch(`/api/modules/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete module");
  return res.json();
};
