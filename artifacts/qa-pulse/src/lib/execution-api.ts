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

export const fetchTestCases = async (
  ticketId: string,
): Promise<ExecutionTestCase[]> => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch test cases");
  return res.json();
};

export const saveTestCases = async (
  ticketId: string,
  testCases: ExecutionTestCase[],
) => {
  const res = await fetch(`/api/execution-files/${ticketId}/test-cases`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ testCases }),
  });
  if (!res.ok) throw new Error("Failed to save test cases");
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

export const deleteModule = async (id: number) => {
  const res = await fetch(`/api/modules/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete module");
  return res.json();
};
