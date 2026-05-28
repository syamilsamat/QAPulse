import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, requirementsTable, testCasesTable, tasksTable, usersTable, activityTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

async function callAI(systemPrompt: string, userPrompt: string, maxTokens = 2048): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}

router.post("/ai/analyze-requirement", async (req, res): Promise<void> => {
  const { requirementId, title, description, module: mod } = req.body;

  let reqTitle = title;
  let reqDescription = description;
  let reqModule = mod;

  if (requirementId) {
    const [req2] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, Number(requirementId)));
    if (req2) {
      reqTitle = req2.title;
      reqDescription = req2.description;
      reqModule = req2.module;
    }
  }

  if (!reqTitle) {
    res.status(400).json({ error: "title or requirementId is required" });
    return;
  }

  const content = await callAI(
    `You are a senior QA analyst. Analyze requirements for completeness, clarity, and testability. 
     Return a JSON object with: 
     { "score": 0-100, "issues": [{type, severity, description, suggestion}], 
       "missingItems": string[], "questions": string[], "riskLevel": "low"|"medium"|"high",
       "summary": string }`,
    `Requirement Title: ${reqTitle}
Description: ${reqDescription ?? "Not provided"}
Module: ${reqModule ?? "Not specified"}

Analyze this requirement and return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ score: 50, issues: [], missingItems: [], questions: [content], riskLevel: "medium", summary: content });
  }
});

router.post("/ai/edge-cases", async (req, res): Promise<void> => {
  const { title, description, module: mod } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const content = await callAI(
    `You are a senior QA engineer specializing in edge case testing. Generate comprehensive edge cases.
     Return JSON: { "edgeCases": [{ "category": string, "scenario": string, "testInput": string, "expectedBehavior": string, "risk": "low"|"medium"|"high" }] }`,
    `Feature: ${title}
Description: ${description ?? ""}
Module: ${mod ?? ""}

Generate edge cases covering: boundary values, invalid inputs, concurrency, timeouts, authorization, data integrity. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ edgeCases: [{ category: "General", scenario: content, testInput: "N/A", expectedBehavior: "N/A", risk: "medium" }] });
  }
});

router.post("/ai/duplicate-detection", async (req, res): Promise<void> => {
  const { title, steps, projectId } = req.body;

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  let existingCases = await db.select().from(testCasesTable).limit(50);
  if (projectId) existingCases = existingCases.filter(tc => tc.projectId === projectId);

  const existing = existingCases.slice(0, 20).map(tc => `ID:${tc.id} | ${tc.title} | ${tc.objective ?? ""}`).join("\n");

  const content = await callAI(
    `You are a QA test repository manager. Detect duplicate or similar test cases.
     Return JSON: { "duplicates": [{ "id": number, "title": string, "similarityScore": 0-100, "reason": string }], "recommendation": string }`,
    `New test case title: "${title}"
Steps: ${steps ?? "Not provided"}

Existing test cases:
${existing || "None yet"}

Identify duplicates or highly similar cases. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ duplicates: [], recommendation: "No duplicates found" });
  }
});

router.post("/ai/weekly-summary", async (req, res): Promise<void> => {
  const { projectId } = req.body;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  let tasks = await db.select().from(tasksTable);
  let testCases = await db.select().from(testCasesTable);

  if (projectId) {
    tasks = tasks.filter(t => t.projectId === Number(projectId));
    testCases = testCases.filter(tc => tc.projectId === Number(projectId));
  }

  const recentTasks = tasks.filter(t => new Date(t.updatedAt) >= oneWeekAgo);
  const recentTestCases = testCases.filter(tc => new Date(tc.createdAt) >= oneWeekAgo);

  const stats = {
    totalTasks: tasks.length,
    completed: tasks.filter(t => t.status === "done").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    newThisWeek: recentTasks.filter(t => t.status === "new").length,
    completedThisWeek: recentTasks.filter(t => t.status === "done").length,
    newTestCasesThisWeek: recentTestCases.length,
    aiAssistedTestCases: testCases.filter(tc => tc.aiAssisted).length,
  };

  const content = await callAI(
    `You are a QA manager generating weekly status reports. Be concise and actionable.
     Return JSON: { "headline": string, "summary": string, "highlights": string[], "risks": string[], "blockers": string[], "nextWeekFocus": string[], "releaseReadiness": "ready"|"caution"|"not_ready", "overallHealth": "green"|"yellow"|"red" }`,
    `Weekly QA Statistics:
- Total active tasks: ${stats.totalTasks}
- Completed tasks: ${stats.completed}
- Blocked tasks: ${stats.blocked}
- In progress tasks: ${stats.inProgress}
- New tasks this week: ${stats.newThisWeek}
- Tasks completed this week: ${stats.completedThisWeek}
- New test cases this week: ${stats.newTestCasesThisWeek}
- AI-assisted test cases total: ${stats.aiAssistedTestCases}

Generate a weekly summary report. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json({ ...JSON.parse(cleaned), stats });
  } catch {
    res.json({ headline: "Weekly Summary", summary: content, highlights: [], risks: [], blockers: [], nextWeekFocus: [], releaseReadiness: "caution", overallHealth: "yellow", stats });
  }
});

router.post("/ai/coverage-gap", async (req, res): Promise<void> => {
  const { requirementId, projectId } = req.body;

  let requirements = await db.select().from(requirementsTable);
  let testCases = await db.select().from(testCasesTable);

  if (requirementId) {
    requirements = requirements.filter(r => r.id === Number(requirementId));
    testCases = testCases.filter(tc => tc.requirementId === Number(requirementId));
  } else if (projectId) {
    requirements = requirements.filter(r => r.projectId === Number(projectId));
    testCases = testCases.filter(tc => tc.projectId === Number(projectId));
  }

  const covered = requirements.filter(r => testCases.some(tc => tc.requirementId === r.id)).length;
  const uncovered = requirements.filter(r => !testCases.some(tc => tc.requirementId === r.id));

  const reqSummary = requirements.slice(0, 15).map(r => {
    const linked = testCases.filter(tc => tc.requirementId === r.id).length;
    return `${r.title} (${linked} test cases, priority: ${r.priority})`;
  }).join("\n");

  const content = await callAI(
    `You are a QA coverage analyst. Analyze test coverage gaps and provide recommendations.
     Return JSON: { "coverageScore": 0-100, "gaps": [{ "requirementTitle": string, "issue": string, "recommendation": string, "priority": string }], "insights": string[], "summary": string }`,
    `Coverage Analysis:
- Total requirements: ${requirements.length}
- Requirements with test cases: ${covered}
- Requirements without test cases: ${uncovered.length}
- Total test cases: ${testCases.length}

Requirements breakdown:
${reqSummary}

Uncovered requirements: ${uncovered.slice(0, 10).map(r => r.title).join(", ")}

Analyze coverage gaps. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json({ ...JSON.parse(cleaned), stats: { total: requirements.length, covered, uncovered: uncovered.length } });
  } catch {
    res.json({ coverageScore: covered > 0 ? Math.round((covered / requirements.length) * 100) : 0, gaps: [], insights: [], summary: content, stats: { total: requirements.length, covered, uncovered: uncovered.length } });
  }
});

router.post("/ai/risk-score", async (req, res): Promise<void> => {
  const { projectId } = req.body;

  let tasks = await db.select().from(tasksTable);
  let requirements = await db.select().from(requirementsTable);
  let testCases = await db.select().from(testCasesTable);

  if (projectId) {
    tasks = tasks.filter(t => t.projectId === Number(projectId));
    requirements = requirements.filter(r => r.projectId === Number(projectId));
    testCases = testCases.filter(tc => tc.projectId === Number(projectId));
  }

  const modules: Record<string, { tasks: number; blocked: number; critical: number; uncovered: boolean }> = {};
  requirements.forEach(r => {
    const mod = r.module ?? "Unspecified";
    if (!modules[mod]) modules[mod] = { tasks: 0, blocked: 0, critical: 0, uncovered: false };
    modules[mod].tasks++;
    if (r.priority === "critical") modules[mod].critical++;
    const hasCoverage = testCases.some(tc => tc.requirementId === r.id);
    if (!hasCoverage) modules[mod].uncovered = true;
  });

  tasks.filter(t => t.status === "blocked").forEach(t => {
    const req = requirements.find(r => r.id === t.requirementId);
    const mod = req?.module ?? "Unspecified";
    if (modules[mod]) modules[mod].blocked++;
  });

  const moduleList = Object.entries(modules).map(([name, m]) =>
    `${name}: ${m.tasks} reqs, ${m.blocked} blocked, ${m.critical} critical, coverage gap: ${m.uncovered}`
  ).join("\n");

  const content = await callAI(
    `You are a QA risk analyst. Score modules by risk level based on data.
     Return JSON: { "modules": [{ "name": string, "riskScore": 0-100, "riskLevel": "low"|"medium"|"high"|"critical", "reasons": string[], "recommendation": string }], "overallRisk": "low"|"medium"|"high"|"critical", "summary": string }`,
    `Module Risk Data:
${moduleList || "No module data available"}

Total tasks: ${tasks.length}
Blocked: ${tasks.filter(t => t.status === "blocked").length}
Overdue: ${tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length}

Generate risk scores per module. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ modules: [], overallRisk: "medium", summary: content });
  }
});

router.post("/ai/release-readiness", async (req, res): Promise<void> => {
  const { projectId } = req.body;

  let tasks = await db.select().from(tasksTable);
  let testCases = await db.select().from(testCasesTable);
  let requirements = await db.select().from(requirementsTable);

  if (projectId) {
    tasks = tasks.filter(t => t.projectId === Number(projectId));
    testCases = testCases.filter(tc => tc.projectId === Number(projectId));
    requirements = requirements.filter(r => r.projectId === Number(projectId));
  }

  const stats = {
    totalTasks: tasks.length,
    done: tasks.filter(t => t.status === "done").length,
    blocked: tasks.filter(t => t.status === "blocked").length,
    overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done").length,
    totalReqs: requirements.length,
    openReqs: requirements.filter(r => r.status !== "done").length,
    totalTestCases: testCases.length,
    automationCandidates: testCases.filter(tc => tc.type === "automation_candidate").length,
    coveredReqs: requirements.filter(r => testCases.some(tc => tc.requirementId === r.id)).length,
  };

  const completionRate = stats.totalTasks > 0 ? Math.round((stats.done / stats.totalTasks) * 100) : 0;
  const coverageRate = stats.totalReqs > 0 ? Math.round((stats.coveredReqs / stats.totalReqs) * 100) : 0;

  const content = await callAI(
    `You are a QA release manager. Assess release readiness objectively.
     Return JSON: { "readinessScore": 0-100, "status": "ready"|"caution"|"not_ready", "verdict": string, "positives": string[], "blockers": string[], "recommendations": string[] }`,
    `Release Readiness Data:
- Task completion rate: ${completionRate}%
- Blocked tasks: ${stats.blocked}
- Overdue tasks: ${stats.overdue}
- Open requirements: ${stats.openReqs}
- Test coverage rate: ${coverageRate}%
- Total test cases: ${stats.totalTestCases}
- Automation candidates: ${stats.automationCandidates}

Assess if this project is ready for release. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json({ ...JSON.parse(cleaned), stats, completionRate, coverageRate });
  } catch {
    res.json({ readinessScore: completionRate, status: "caution", verdict: content, positives: [], blockers: [], recommendations: [], stats, completionRate, coverageRate });
  }
});

router.post("/ai/chat", async (req, res): Promise<void> => {
  const { message, conversationHistory = [] } = req.body;

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const allTasks = await db.select().from(tasksTable).limit(20);
  const allReqs = await db.select().from(requirementsTable).limit(20);
  const allTCs = await db.select().from(testCasesTable).limit(20);

  const context = `You are QA Pulse AI Copilot, a specialized QA assistant embedded in a QA management platform.
Current system data snapshot:
- Tasks: ${allTasks.length} total, ${allTasks.filter(t => t.status === "blocked").length} blocked, ${allTasks.filter(t => t.status === "done").length} done
- Requirements: ${allReqs.length} total, ${allReqs.filter(r => r.status !== "done").length} open
- Test Cases: ${allTCs.length} total, ${allTCs.filter(tc => tc.aiAssisted).length} AI-assisted

You help QA teams with: regression planning, test case generation, defect analysis, coverage gaps, reporting, and QA best practices.
Be concise, practical, and data-driven.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: context },
    ...conversationHistory.slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    max_completion_tokens: 1024,
    messages,
  });

  res.json({ reply: response.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again." });
});

router.post("/ai/test-data", async (req, res): Promise<void> => {
  const { dataType, count = 10, context: ctx, format = "json" } = req.body;

  if (!dataType) {
    res.status(400).json({ error: "dataType is required" });
    return;
  }

  const content = await callAI(
    `You are a QA test data specialist. Generate realistic, varied test data for QA testing purposes.
     Return JSON: { "data": array_of_items, "notes": string[] }`,
    `Generate ${count} test data items for: ${dataType}
Context: ${ctx ?? "General testing"}
Format: ${format}
Include: valid data, invalid data, edge cases, boundary values, special characters where appropriate. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ data: [], notes: [content] });
  }
});

router.post("/ai/regression-selection", async (req, res): Promise<void> => {
  const { changedModules = [], projectId } = req.body;

  let testCases = await db.select().from(testCasesTable);
  let requirements = await db.select().from(requirementsTable);

  if (projectId) {
    testCases = testCases.filter(tc => tc.projectId === Number(projectId));
    requirements = requirements.filter(r => r.projectId === Number(projectId));
  }

  const tcSummary = testCases.slice(0, 30).map(tc => `ID:${tc.id} | ${tc.title} | type:${tc.type} | priority:${tc.priority}`).join("\n");

  const content = await callAI(
    `You are a QA regression specialist. Select the most important test cases for regression based on changed modules.
     Return JSON: { "selected": [{ "id": number, "title": string, "reason": string, "priority": "must_run"|"should_run"|"optional" }], "skipped": [{ "id": number, "title": string, "reason": string }], "summary": string, "estimatedTime": string }`,
    `Changed modules: ${changedModules.join(", ") || "Not specified - general regression"}

Available test cases:
${tcSummary || "No test cases found"}

Select regression suite. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ selected: [], skipped: [], summary: content, estimatedTime: "Unknown" });
  }
});

router.post("/ai/natural-language-search", async (req, res): Promise<void> => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const [tasks, testCases, requirements] = await Promise.all([
    db.select().from(tasksTable).limit(100),
    db.select().from(testCasesTable).limit(100),
    db.select().from(requirementsTable).limit(100),
  ]);

  const taskSummary = tasks.map(t => `TASK|${t.id}|${t.name}|${t.status}|${t.type}`).join("\n");
  const tcSummary = testCases.map(tc => `TC|${tc.id}|${tc.title}|${tc.type}|${tc.priority}`).join("\n");
  const reqSummary = requirements.map(r => `REQ|${r.id}|${r.title}|${r.status}|${r.priority}`).join("\n");

  const content = await callAI(
    `You are a search engine for QA data. Parse the user's natural language query and return matching items.
     Return JSON: { "results": [{ "type": "task"|"test_case"|"requirement", "id": number, "title": string, "relevance": "high"|"medium"|"low", "reason": string }], "interpretation": string }`,
    `User query: "${query}"

Available data:
${taskSummary || "No tasks"}

${tcSummary || "No test cases"}

${reqSummary || "No requirements"}

Match items relevant to the query. Return JSON only.`
  );

  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    res.json(JSON.parse(cleaned));
  } catch {
    res.json({ results: [], interpretation: content });
  }
});

export default router;
