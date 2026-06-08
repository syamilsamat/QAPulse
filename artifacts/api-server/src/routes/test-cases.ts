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
import { GoogleGenAI } from "@google/genai";

// Initialize primary Gemini client
const ai = new GoogleGenAI({});

const router: IRouter = Router();

/**
 * Bulletproof JSON Parser
 * Strips rogue markdown blocks and returns the fallback if parsing fails.
 */
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

/**
 * Fallback AI Call via OpenRouter (OpenAI / Meta Llama Free Models)
 */
async function callFallbackAI(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }

  console.log("🔄 Pivoting to Fallback AI via OpenRouter...");

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3-8b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter API failure: ${response.status} - ${errorBody}`,
    );
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? '{"testCases": []}';
}

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
    priority,
    tags,
    additionalNotes,
    requirementId,
    generatePositive,
    generateNegative,
    generateEdgeCases,
    useTemplateOnly,
  } = parsed.data;

  let historicalContext = "";
  let similarCount = 0;

  try {
    const allTestCases = await db.select().from(testCasesTable).limit(5);
    if (allTestCases.length > 0) {
      historicalContext =
        "\n\nReference existing test cases for style:\n" +
        allTestCases
          .slice(0, 2)
          .map(
            (tc, i) =>
              `Example ${i + 1}: Title: ${tc.title}\nObjective: ${tc.objective || "N/A"}\nSteps: ${tc.testSteps || "N/A"}\nExpected: ${tc.expectedResult || "N/A"}`,
          )
          .join("\n\n");
      similarCount = Math.min(allTestCases.length, 2);
    }
  } catch (dbErr) {
    console.warn(
      "Could not read historical test cases, skipping context injection.",
    );
  }

  const caseTypes = [];
  if (generatePositive !== false) caseTypes.push("positive path");
  if (generateNegative) caseTypes.push("negative validation");
  if (generateEdgeCases) caseTypes.push("extreme boundary condition");

  // Enhancements: Explicitly ask for 3-5 high-value test cases to prevent cutoff
  const systemInstruction = `You are an expert QA engine. Generate a focused batch of 3 to 5 highly detailed and target-specific test cases based on the requirements.
    Do NOT generate 10 cases. Keep it strictly between 3 and 5 total cases to avoid payload truncation.

    Return ONLY a valid JSON object matching this structure:
    { 
      "testCases": [{ 
        "title": "string", 
        "objective": "string", 
        "preconditions": "string", 
        "testSteps": "1. step\\n2. step", 
        "expectedResult": "string", 
        "type": "manual" | "automation_candidate", 
        "priority": "low" | "medium" | "high" | "critical", 
        "tags": "string", 
        "automationCandidate": boolean 
      }] 
    }`;

  const userPrompt = `Requirement Title: ${requirementTitle}
Description: ${requirementDescription || "N/A"}
Module: ${featureModule || "N/A"}
Focus Scenarios: ${caseTypes.join(", ")}
Notes: ${additionalNotes || "None"} ${historicalContext}`;

  const fallbackObject = { testCases: [] };
  let finalRawText = "";

  try {
    console.log("ℹ️ Attempting primary Generation via Gemini...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        maxOutputTokens: 4000, // Maximized token window
        responseMimeType: "application/json",
      },
    });
    finalRawText = response.text ?? '{"testCases": []}';
  } catch (error: any) {
    const isQuotaExceeded =
      error.status === 429 ||
      error.message?.includes("quota") ||
      error.message?.includes("Quota");
    const isServiceUnavailable =
      error.status === 503 ||
      error.message?.includes("temporary") ||
      error.message?.includes("high demand") ||
      error.message?.includes("UNAVAILABLE");

    if (isQuotaExceeded || isServiceUnavailable) {
      if (isServiceUnavailable) {
        console.warn(
          "⚠️ Primary Gemini API is experiencing high demand (503). Attempting immediate fallback...",
        );
      } else {
        console.warn(
          "⚠️ Primary Gemini API Quota Exceeded (429). Attempting fallback...",
        );
      }

      try {
        finalRawText = await callFallbackAI(systemInstruction, userPrompt);
      } catch (fallbackError) {
        console.error(
          "❌ Both Gemini and OpenRouter Fallback APIs failed:",
          fallbackError,
        );
        res.status(500).json({
          error: "All generative AI streams exhausted or down for the moment.",
        });
        return;
      }
    } else {
      console.error(
        "❌ Gemini failed with an unhandled error condition:",
        error,
      );
      res.status(500).json({
        error:
          "Generative infrastructure encountered an unrecoverable failure.",
      });
      return;
    }
  }

  const parsedPayload = safeParseJSON(finalRawText, fallbackObject);

  res.json({
    testCases: parsedPayload.testCases ?? [],
    similarTestCasesUsed: similarCount,
    templateUsed: useTemplateOnly ? "standard_template" : "hybrid",
  });
});

// ========================================================
// CRUD & Utility Endpoints
// ========================================================
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
    .values({ ...rest, title: `${original.title} (Copy)`, aiAssisted: false })
    .returning();
  res.status(201).json(await formatTestCase(cloned));
});

export default router;
