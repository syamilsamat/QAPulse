import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  testCasesTable,
  usersTable,
  projectsTable,
  requirementsTable,
  activityTable,
} from "@workspace/db";
import {
  CreateTestCaseBody,
  UpdateTestCaseBody,
  GetTestCaseParams,
  UpdateTestCaseParams,
  DeleteTestCaseParams,
  CloneTestCaseParams,
  ListTestCasesQueryParams,
  GenerateTestCasesWithAIBody,
} from "@workspace/api-zod";

function safeParseJSON(content: string, fallback: any) {
  try {
    const cleaned = content
      .replace(/```json\n?/gi, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("🔴 JSON Parse Error! Raw AI Output:", content);
    return fallback;
  }
}

// { openai } from "@workspace/integrations-openai-ai-server
import { GoogleGenAI } from "@google/genai";
// Initialize the Gemini client
const ai = new GoogleGenAI({});

const router: IRouter = Router();

async function formatTestCase(tc: typeof testCasesTable.$inferSelect) {
  let authorName = null;
  let projectName = null;
  let requirementTitle = null;

  if (tc.authorId) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, tc.authorId));
    authorName = user?.name ?? null;
  }
  if (tc.projectId) {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, tc.projectId));
    projectName = project?.name ?? null;
  }
  if (tc.requirementId) {
    const [req] = await db
      .select()
      .from(requirementsTable)
      .where(eq(requirementsTable.id, tc.requirementId));
    requirementTitle = req?.title ?? null;
  }

  return {
    id: tc.id,
    title: tc.title,
    objective: tc.objective,
    preconditions: tc.preconditions,
    testSteps: tc.testSteps,
    expectedResult: tc.expectedResult,
    type: tc.type,
    priority: tc.priority,
    tags: tc.tags,
    requirementId: tc.requirementId,
    requirementTitle,
    projectId: tc.projectId,
    projectName,
    linkedBug: tc.linkedBug,
    authorId: tc.authorId,
    authorName,
    aiAssisted: tc.aiAssisted,
    status: tc.status,
    createdAt: tc.createdAt.toISOString(),
    updatedAt: tc.updatedAt.toISOString(),
  };
}

router.post("/test-cases/ai-generate", async (req, res): Promise<void> => {
  const parsed = GenerateTestCasesWithAIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    requirementTitle,
    requirementDescription,
    module: featureModule,
    testCaseType,
    priority,
    tags,
    additionalNotes,
    requirementId,
    generatePositive,
    generateNegative,
    generateEdgeCases,
    useSimilarHistorical,
    useTemplateOnly,
  } = parsed.data;

  let historicalContext = "";
  let similarCount = 0;

  if (useSimilarHistorical !== false && requirementId) {
    const allTestCases = await db.select().from(testCasesTable).limit(5);
    if (allTestCases.length > 0) {
      historicalContext =
        "\n\nReference existing test cases for style:\n" +
        allTestCases
          .slice(0, 3)
          .map(
            (tc, i) =>
              `Example ${i + 1}: Title: ${tc.title}\nObjective: ${tc.objective || "N/A"}\nSteps: ${tc.testSteps || "N/A"}\nExpected: ${tc.expectedResult || "N/A"}`,
          )
          .join("\n\n");
      similarCount = Math.min(allTestCases.length, 3);
    }
  }

  const caseTypes = [];
  if (generatePositive !== false)
    caseTypes.push("positive test cases (happy path)");
  if (generateNegative) caseTypes.push("negative test cases (invalid inputs)");
  if (generateEdgeCases)
    caseTypes.push("extreme edge cases (boundary/security/race conditions)");

  const prompt = `You are a QA expert. Generate structured test cases for this requirement:
Requirement Title: ${requirementTitle}
${requirementDescription ? `Description: ${requirementDescription}` : ""}
${featureModule ? `Module: ${featureModule}` : ""}
${additionalNotes ? `Notes: ${additionalNotes}` : ""}

Generate ${caseTypes.join(", ")}. ${historicalContext}

Return ONLY a JSON array with this exact structure:
[
  { 
    "title": "string", 
    "objective": "string", 
    "preconditions": "string", 
    "testSteps": "1. step\\n2. step", 
    "expectedResult": "string", 
    "type": "manual" | "automation_candidate", 
    "priority": "low" | "medium" | "high" | "critical", 
    "tags": "string", 
    "automationCandidate": boolean 
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
      },
    });

    const testCases = safeParseJSON(response.text ?? "[]", []);

    res.json({
      testCases,
      similarTestCasesUsed: similarCount,
      templateUsed: useTemplateOnly ? "standard_template" : "hybrid",
    });
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: "Failed to generate test cases via Gemini" });
  }
});

router.get("/test-cases", async (req, res): Promise<void> => {
  const parsed = ListTestCasesQueryParams.safeParse(req.query);
  let tcs = await db
    .select()
    .from(testCasesTable)
    .orderBy(testCasesTable.createdAt);

  if (parsed.success) {
    const {
      projectId,
      requirementId,
      authorId,
      type,
      priority,
      aiAssisted,
      search,
    } = parsed.data;
    if (projectId) tcs = tcs.filter((t) => t.projectId === projectId);
    if (requirementId)
      tcs = tcs.filter((t) => t.requirementId === requirementId);
    if (authorId) tcs = tcs.filter((t) => t.authorId === authorId);
    if (type) tcs = tcs.filter((t) => t.type === type);
    if (priority) tcs = tcs.filter((t) => t.priority === priority);
    if (aiAssisted !== undefined)
      tcs = tcs.filter((t) => t.aiAssisted === aiAssisted);
    if (search)
      tcs = tcs.filter((t) =>
        t.title.toLowerCase().includes(search.toLowerCase()),
      );
  }

  const formatted = await Promise.all(tcs.map(formatTestCase));
  res.json(formatted);
});

router.post("/test-cases", async (req, res): Promise<void> => {
  const parsed = CreateTestCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tc] = await db.insert(testCasesTable).values(parsed.data).returning();

  await db.insert(activityTable).values({
    type: "test_case_created",
    description: `Test case "${tc.title}" was created${tc.aiAssisted ? " (AI-assisted)" : ""}`,
    userId: tc.authorId,
    entityId: tc.id,
    entityType: "test_case",
  });

  res.status(201).json(await formatTestCase(tc));
});

router.get("/test-cases/:id", async (req, res): Promise<void> => {
  const params = GetTestCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tc] = await db
    .select()
    .from(testCasesTable)
    .where(eq(testCasesTable.id, params.data.id));
  if (!tc) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }

  res.json(await formatTestCase(tc));
});

router.patch("/test-cases/:id", async (req, res): Promise<void> => {
  const params = UpdateTestCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTestCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [tc] = await db
    .update(testCasesTable)
    .set(parsed.data)
    .where(eq(testCasesTable.id, params.data.id))
    .returning();
  if (!tc) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }

  res.json(await formatTestCase(tc));
});

router.delete("/test-cases/:id", async (req, res): Promise<void> => {
  const params = DeleteTestCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tc] = await db
    .delete(testCasesTable)
    .where(eq(testCasesTable.id, params.data.id))
    .returning();
  if (!tc) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/test-cases/:id/clone", async (req, res): Promise<void> => {
  const params = CloneTestCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [original] = await db
    .select()
    .from(testCasesTable)
    .where(eq(testCasesTable.id, params.data.id));
  if (!original) {
    res.status(404).json({ error: "Test case not found" });
    return;
  }

  const { id, createdAt, updatedAt, ...rest } = original;
  const [cloned] = await db
    .insert(testCasesTable)
    .values({
      ...rest,
      title: `${original.title} (Copy)`,
      aiAssisted: false,
    })
    .returning();

  res.status(201).json(await formatTestCase(cloned));
});

export default router;
