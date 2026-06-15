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
import { GoogleGenAI, Type, type Schema } from "@google/genai";

// Initialize primary Gemini client
const ai = new GoogleGenAI({});

const router: IRouter = Router();

function safeParseJSON(content: string, fallback: any) {
  let cleaned = content
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("🔴 JSON Parse Error! Output was likely truncated. Attempting data salvage...");
    const lastClosingBrace = cleaned.lastIndexOf("}");

    if (lastClosingBrace !== -1) {
      try {
        const salvagedText = cleaned.substring(0, lastClosingBrace + 1) + "]}";
        const salvagedJSON = JSON.parse(salvagedText);

        if (salvagedJSON && Array.isArray(salvagedJSON.testCases)) {
          console.log(`✅ Salvage successful! Recovered ${salvagedJSON.testCases.length} test cases.`);
          return salvagedJSON;
        }
      } catch (salvageError) {
        console.error("❌ Salvage operation failed. Returning fallback.");
      }
    }
    return fallback;
  }
}

async function callFallbackAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) throw new Error("Missing OPENROUTER_API_KEY environment variable.");

  console.log("🔄 Pivoting to Fallback AI Cascade via OpenRouter...");
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const fallbackModels = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "liquid/lfm-2.5-1.2b-instruct-20260120",
    "openai/gpt-oss-120b",
    "qwen/qwen3-coder",
    "moonshotai/kimi-k2.6",
    "google/gemma-4-31b-it",
  ];

  for (const model of fallbackModels) {
    console.log(`🔄 Attempting Fallback Node: ${model}...`);
    try {
      const body: any = {
        model: model,
        messages: messages,
        max_tokens: 8192,
        response_format: { type: "json_object" },
      };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
          console.log(`✅ Success with Fallback Node: ${model}`);
          return data.choices[0].message.content;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Network error with Node [${model}]:`, (error as Error).message);
    }
  }
  throw new Error("❌ Crucial system failure: All primary and fallback AI nodes are completely exhausted.");
}

async function formatTestCase(tc: any) {
  let authorName = null;
  let projectName = null;
  let requirementTitle = null;

  if (tc.authorId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tc.authorId));
    authorName = user?.name ?? null;
  }
  if (tc.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, tc.projectId));
    projectName = project?.name ?? null;
  }
  if (tc.requirementId) {
    const [req] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, tc.requirementId));
    requirementTitle = req?.title ?? null;
  }

  return {
    id: tc.id,
    title: tc.title, 
    redmineUserStory: tc.redmineUserStory,
    tracker: tc.tracker,
    scenario: tc.scenario,
    preconditions: tc.preconditions,
    testSteps: tc.testSteps,
    testData: tc.testData,
    expectedResult: tc.expectedResult,
    redmineDefectId: tc.redmineDefectId,
    comments: tc.comments,
    qaPic: tc.qaPic,
    tags: tc.tags,
    requirementId: tc.requirementId,
    requirementTitle,
    projectId: tc.projectId,
    projectName,
    authorId: tc.authorId,
    authorName,
    aiAssisted: tc.aiAssisted,
    status: tc.status,
    createdAt: tc.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: tc.updatedAt?.toISOString() || new Date().toISOString(),
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
    tags,
    additionalNotes,
    requirementId,
    generatePositive,
    generateNegative,
    generateEdgeCases,
    useTemplateOnly,
  } = parsed.data;

  let existingContext = "";
  let similarCount = 0;
  try {
    let query: any = db.select({ title: testCasesTable.title, scenario: (testCasesTable as any).scenario }).from(testCasesTable);
    if (requirementId) query = query.where(eq(testCasesTable.requirementId, requirementId));

    const existingCases = await query.limit(30);
    similarCount = existingCases.length;

    if (existingCases.length > 0) {
      existingContext = "\n\nCRITICAL ANTI-DUPLICATION RULE: The following test cases ALREADY EXIST for this requirement. Focus entirely on completely NEW perspectives, edge cases, and paths not listed below:\n" +
        existingCases.map((tc: any) => `- Title: ${tc.title} | Scenario: ${tc.scenario || "N/A"}`).join("\n");
    }
  } catch (dbErr) {
    console.warn("Could not read historical test cases.", dbErr);
  }

  const caseTypes = [];
  if (generatePositive !== false) caseTypes.push("positive path");
  if (generateNegative) caseTypes.push("negative validation");
  if (generateEdgeCases) caseTypes.push("extreme boundary condition");

  const systemInstruction = `You are an expert QA engine. Generate a focused batch of 8 to 12 highly detailed test cases based on the requirements.
    CRITICAL: Output must align with the exact Execution Template structure (Scenario, Test Data, etc.).
    Return ONLY a valid JSON object matching this structure:
    { 
      "testCases": [{ 
        "title": "string (The Case Name)", 
        "redmineUserStory": "string (Extract from context if available)",
        "tracker": "string",
        "scenario": "string (Detailed scenario description)",
        "preconditions": "string", 
        "testSteps": ["1. First step", "2. Second step"], 
        "testData": "string",
        "expectedResult": "string", 
        "tags": "string"
      }] 
    }`;

  const userPrompt = `Requirement Hierarchy & Descriptions:\n${requirementDescription || "N/A"}\n\nModule: ${featureModule || "N/A"}\nFocus Scenarios: ${caseTypes.join(", ")}\nNotes: ${additionalNotes || "None"} ${existingContext}`;

  const fallbackObject = { testCases: [] };
  let finalRawText = "";

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      testCases: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            redmineUserStory: { type: Type.STRING },
            tracker: { type: Type.STRING },
            scenario: { type: Type.STRING },
            preconditions: { type: Type.STRING },
            testSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            testData: { type: Type.STRING },
            expectedResult: { type: Type.STRING },
            tags: { type: Type.STRING },
          },
          required: ["title", "scenario", "testSteps", "expectedResult"],
        },
      },
    },
    required: ["testCases"],
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });
    finalRawText = response.text ?? '{"testCases": []}';
  } catch (error: any) {
    console.warn("Primary API failed. Attempting fallback...");
    try {
      finalRawText = await callFallbackAI(systemInstruction, userPrompt);
    } catch (fallbackError) {
      res.status(500).json({ error: "All generative AI streams exhausted." });
      return;
    }
  }

  const parsedPayload = safeParseJSON(finalRawText, fallbackObject);
  const formattedTestCases = (parsedPayload.testCases ?? []).map((tc: any) => {
    if (Array.isArray(tc.testSteps)) tc.testSteps = tc.testSteps.join("\n");
    else if (typeof tc.testSteps === "string") tc.testSteps = tc.testSteps.replace(/(?!\A)(\d+\.)/g, "\n$1").trim();
    return tc;
  });

  res.json({ testCases: formattedTestCases, similarTestCasesUsed: similarCount, templateUsed: useTemplateOnly ? "standard_template" : "hybrid" });
});

router.get("/test-cases", async (req, res): Promise<void> => {
  const parsed = ListTestCasesQueryParams.safeParse(req.query);
  let tcs = await db.select().from(testCasesTable).orderBy(testCasesTable.createdAt);

  if (parsed.success) {
    const { projectId, requirementId, authorId, aiAssisted, search } = parsed.data;
    if (projectId) tcs = tcs.filter((t) => t.projectId === projectId);
    if (requirementId) tcs = tcs.filter((t) => t.requirementId === requirementId);
    if (authorId) tcs = tcs.filter((t) => t.authorId === authorId);
    if (aiAssisted !== undefined) tcs = tcs.filter((t) => t.aiAssisted === aiAssisted);
    if (search) tcs = tcs.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
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
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const [tc] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  if (!tc) return res.status(404).json({ error: "Test case not found" }) as any;
  res.json(await formatTestCase(tc));
});

router.patch("/test-cases/:id", async (req, res): Promise<void> => {
  const params = UpdateTestCaseParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const parsed = UpdateTestCaseBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message }) as any;

  const [tc] = await db.update(testCasesTable).set(parsed.data).where(eq(testCasesTable.id, params.data.id)).returning();
  if (!tc) return res.status(404).json({ error: "Test case not found" }) as any;
  res.json(await formatTestCase(tc));
});

router.delete("/test-cases/:id", async (req, res): Promise<void> => {
  const params = DeleteTestCaseParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const [tc] = await db.delete(testCasesTable).where(eq(testCasesTable.id, params.data.id)).returning();
  if (!tc) return res.status(404).json({ error: "Test case not found" }) as any;
  res.sendStatus(204);
});

router.post("/test-cases/:id/clone", async (req, res): Promise<void> => {
  const params = CloneTestCaseParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const [original] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  if (!original) return res.status(404).json({ error: "Test case not found" }) as any;

  const { id, createdAt, updatedAt, ...rest } = original;
  const [cloned] = await db.insert(testCasesTable).values({ ...rest, title: `${original.title} (Copy)`, aiAssisted: false }).returning();
  res.status(201).json(await formatTestCase(cloned));
});

export default router;