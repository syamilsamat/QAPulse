import { Router, type IRouter } from "express";
import express from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getAuthContext, scopeToUserProjects, canAccessProject, getModuleScope } from "../middleware/access";
import { buildTestCaseExcel } from "./excel-builder";
import {
  db,
  testCasesTable,
  usersTable,
  projectsTable,
  requirementsTable,
  executionTestCasesTable,
  executionFilesTable,
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
import { verifyToken, actorFromReq } from "./auth";
import { logActivity, diffChanges } from "./_audit";
import pLimit from "p-limit";

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

    // FIX: Setup a 12-second abort controller so a hanging API doesn't cause a frontend timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); 

    try {
      const body: any = {
        model: model,
        messages: messages,
        max_tokens: 8192,
        // Using response_format for models that support it
        response_format: { type: "json_object" },
      };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal, // Attach the abort signal
      });

      clearTimeout(timeoutId); // Clear timeout if response is received

      if (response.ok) {
        const data = await response.json() as any;
        if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
          console.log(`✅ Success with Fallback Node: ${model}`);
          return data.choices[0].message.content;
        }
      } else {
        // FIX: Log exactly why OpenRouter rejected the request (e.g. 429 Rate Limit)
        const errText = await response.text();
        console.warn(`⚠️ Node [${model}] returned HTTP ${response.status}: ${errText}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId); // Ensure timeout is cleared on error

      if (error.name === 'AbortError') {
        console.warn(`⚠️ Timeout error with Node [${model}]: Took longer than 12 seconds. Skipping.`);
      } else {
        console.warn(`⚠️ Network error with Node [${model}]:`, error.message);
      }
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
    module: tc.module,
    requirementId: tc.requirementId,
    requirementTitle,
    projectId: tc.projectId,
    projectName,
    authorId: tc.authorId,
    authorName,
    aiAssisted: tc.aiAssisted,
    status: tc.status,
    // CR023p4 — informational badge only here; the actionable "Revised"
    // control lives on the execution file page (per-instance ack)
    requirementRevisedAt: tc.requirementRevisedAt ? new Date(tc.requirementRevisedAt).toISOString() : null,
    createdAt: tc.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: tc.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

const tcGenResponseSchema: Schema = {
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
          type: { type: Type.STRING },
          priority: { type: Type.STRING },
        },
        required: ["title", "scenario", "testSteps", "expectedResult"],
      },
    },
  },
  required: ["testCases"],
};

async function generateForRequirement(
  req: { id: number; title: string; description?: string },
  opts: {
    caseTypes: string[];
    featureModule?: string;
    selectedTracker?: string;
    additionalNotes?: string;
    useTemplateOnly?: boolean;
  },
): Promise<{ testCases: any[]; error?: string }> {
  let existingContext = "";
  try {
    const existingCases = await db.select().from(testCasesTable).where(eq(testCasesTable.requirementId, req.id)).limit(30);
    if (existingCases.length > 0) {
      existingContext =
        "\n\nCRITICAL ANTI-DUPLICATION RULE: The following test cases ALREADY EXIST for this requirement. Focus entirely on completely NEW perspectives, edge cases, and paths not listed below:\n" +
        existingCases.map((tc: any) => `- Title: ${tc.title} | Scenario: ${tc.scenario || "N/A"}`).join("\n");
    }
  } catch {
    // non-fatal
  }

  const systemInstruction = `You are an expert QA engine. Generate a focused batch of 5 to 10 highly detailed test cases for the single requirement provided.
    CRITICAL: Output must align with the exact Execution Template structure (Scenario, Test Data, etc.).
    If a Tracker is provided in the input, set the "tracker" field to that exact value for ALL generated test cases.
    Return ONLY a valid JSON object with a "testCases" array.`;

  const userPrompt = `Requirement: [#${req.id}] ${req.title}\nDescription: ${req.description || "No description provided"}\n\nModule: ${opts.featureModule || "N/A"}\nTracker: ${opts.selectedTracker || "N/A"}\nFocus Scenarios: ${opts.caseTypes.join(", ")}\nNotes: ${opts.additionalNotes || "None"}${existingContext}`;

  let finalRawText = "";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: tcGenResponseSchema,
      },
    });
    finalRawText = response.text ?? '{"testCases": []}';
  } catch (error: any) {
    console.error(`❌ Gemini failed for req ${req.id}:`, error.message || error);
    try {
      finalRawText = await callFallbackAI(systemInstruction, userPrompt);
    } catch {
      return { testCases: [], error: "All generative AI streams exhausted." };
    }
  }

  const parsed = safeParseJSON(finalRawText, { testCases: [] });
  const testCases = (parsed.testCases ?? []).map((tc: any) => {
    if (Array.isArray(tc.testSteps)) tc.testSteps = tc.testSteps.join("\n");
    else if (typeof tc.testSteps === "string") tc.testSteps = tc.testSteps.replace(/(?!\A)(\d+\.)/g, "\n$1").trim();
    return tc;
  });
  return { testCases };
}

router.post("/test-cases/ai-generate", async (req, res): Promise<void> => {
  const parsed = GenerateTestCasesWithAIBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    requirements,
    module: featureModule,
    additionalNotes,
    generatePositive,
    generateNegative,
    generateEdgeCases,
    useTemplateOnly,
    tracker: selectedTracker,
  } = parsed.data;

  const caseTypes: string[] = [];
  if (generatePositive !== false) caseTypes.push("positive path");
  if (generateNegative) caseTypes.push("negative validation");
  if (generateEdgeCases) caseTypes.push("extreme boundary condition");

  const limit = pLimit(3);
  const settled = await Promise.allSettled(
    requirements.map((r) =>
      limit(() => generateForRequirement(r, { caseTypes, featureModule, selectedTracker, additionalNotes, useTemplateOnly })),
    ),
  );

  const results = requirements.map((r, i) => {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      return { requirementId: r.id, requirementTitle: r.title, testCases: outcome.value.testCases, error: outcome.value.error };
    }
    return { requirementId: r.id, requirementTitle: r.title, testCases: [], error: String((outcome as any).reason) };
  });

  const totalSimilar = results.reduce((sum, r) => sum + r.testCases.length, 0);
  res.json({ results, similarTestCasesUsed: totalSimilar, templateUsed: useTemplateOnly ? "standard_template" : "hybrid" });
});

router.get("/test-cases", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  const parsed = ListTestCasesQueryParams.safeParse(req.query);
  let tcs = await db.select().from(testCasesTable).orderBy(testCasesTable.createdAt);

  if (parsed.success) {
    const { projectId, requirementId, authorId, aiAssisted, search } = parsed.data;
    if (projectId) {
      const ok = accessible === null || accessible.includes(projectId);
      if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
      tcs = tcs.filter((t) => t.projectId === projectId);
    } else if (accessible !== null) {
      tcs = tcs.filter((t) => t.projectId !== null && accessible.includes(t.projectId));
    }
    if (requirementId) tcs = tcs.filter((t) => t.requirementId === requirementId);
    if (authorId) tcs = tcs.filter((t) => t.authorId === authorId);
    if (aiAssisted !== undefined) tcs = tcs.filter((t) => t.aiAssisted === aiAssisted);
    if (search) tcs = tcs.filter((t) => t.title.toLowerCase().includes(search.toLowerCase()));
  } else if (accessible !== null) {
    tcs = tcs.filter((t) => t.projectId !== null && accessible.includes(t.projectId));
  }

  // CR035 — module-scope: a project-level grant with no module restriction
  // is untouched (checked once per distinct project, not per row).
  const tcProjectIds = [...new Set(tcs.map((t) => t.projectId).filter((id): id is number => id != null))];
  const moduleScopes = new Map(await Promise.all(tcProjectIds.map(async (pid) => [pid, await getModuleScope(ctx.userId, ctx.role, pid)] as const)));
  tcs = tcs.filter((t) => {
    const scope = t.projectId != null ? moduleScopes.get(t.projectId) : undefined;
    if (!scope || !scope.restricted) return true;
    return t.module != null && scope.moduleNames.includes(t.module);
  });

  const formatted = await Promise.all(tcs.map(formatTestCase));

  const tcIds = tcs.map((t) => t.id);
  const execCountMap: Record<number, number> = {};
  if (tcIds.length > 0) {
    const rows = await db
      .select({ libraryTcId: executionTestCasesTable.libraryTcId, cnt: sql<number>`count(*)::int` })
      .from(executionTestCasesTable)
      .where(inArray(executionTestCasesTable.libraryTcId, tcIds))
      .groupBy(executionTestCasesTable.libraryTcId);
    for (const row of rows) {
      if (row.libraryTcId != null) execCountMap[row.libraryTcId] = row.cnt;
    }
  }

  res.json(formatted.map((tc) => ({ ...tc, executionCount: execCountMap[tc.id] ?? 0 })));
});

router.post("/test-cases", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateTestCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const payload: any = { ...parsed.data };
  if (!payload.authorId) payload.authorId = ctx.userId;

  if (payload.projectId) {
    const ok = await canAccessProject(ctx.userId, ctx.role, payload.projectId);
    if (!ok) { res.status(403).json({ error: "Access denied to this project" }); return; }
  }

  const [tc] = await db.insert(testCasesTable).values(payload).returning();
  await logActivity({
    type: "test_case_created",
    description: `Test case "${tc.title}" was created${tc.aiAssisted ? " (AI-assisted)" : ""}`,
    userId: tc.authorId,
    entityId: tc.id,
    entityType: "test_case",
  });
  res.status(201).json(await formatTestCase(tc));
});

// Execution files that contain this library TC (one entry per file, newest
// row wins when the TC appears in a file more than once).
router.get("/test-cases/:id/executions", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid test case id" });
    return;
  }
  const rows = await db
    .select({
      executionFileId: executionTestCasesTable.executionFileId,
      caseId: executionTestCasesTable.caseId,
      testCaseId: executionTestCasesTable.testCaseId,
      result: executionTestCasesTable.result,
      executedAt: executionTestCasesTable.executedAt,
      defectNumber: executionTestCasesTable.defectNumber,
      redmineTicketId: executionFilesTable.redmineTicketId,
      fileTitle: executionFilesTable.title,
      tracker: executionFilesTable.tracker,
    })
    .from(executionTestCasesTable)
    .innerJoin(
      executionFilesTable,
      eq(executionFilesTable.id, executionTestCasesTable.executionFileId)
    )
    .where(eq(executionTestCasesTable.libraryTcId, id))
    .orderBy(desc(executionTestCasesTable.id));

  const byFile = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byFile.has(row.executionFileId)) byFile.set(row.executionFileId, row);
  }

  res.json(
    Array.from(byFile.values()).map((r) => ({
      executionFileId: r.executionFileId,
      redmineTicketId: r.redmineTicketId,
      fileTitle: r.fileTitle,
      tracker: r.tracker,
      displayCaseId: r.testCaseId ?? r.caseId ?? null,
      result: r.result,
      defectNumber: r.defectNumber,
      executedAt: r.executedAt,
    }))
  );
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

  const [before] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  const [tc] = await db.update(testCasesTable).set(parsed.data).where(eq(testCasesTable.id, params.data.id)).returning();
  if (!tc) return res.status(404).json({ error: "Test case not found" }) as any;

  const diff = before ? diffChanges(before, parsed.data) : null;
  if (diff) {
    await logActivity({
      type: "test_case_updated",
      description: `Test case "${tc.title}" was updated`,
      userId: actorFromReq(req),
      entityId: tc.id,
      entityType: "test_case",
      ...diff,
    });
  }

  res.json(await formatTestCase(tc));
});

router.delete("/test-cases/:id", async (req, res): Promise<void> => {
  const params = DeleteTestCaseParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const [tc] = await db.delete(testCasesTable).where(eq(testCasesTable.id, params.data.id)).returning();
  if (!tc) return res.status(404).json({ error: "Test case not found" }) as any;

  await logActivity({
    type: "test_case_deleted",
    description: `Test case "${tc.title}" was deleted`,
    userId: actorFromReq(req),
    entityId: tc.id,
    entityType: "test_case",
    oldValue: {
      title: tc.title,
      caseId: tc.caseId,
      module: tc.module,
      projectId: tc.projectId,
      requirementId: tc.requirementId,
    },
  });

  res.sendStatus(204);
});

router.post("/test-cases/:id/clone", express.json(), async (req, res): Promise<void> => {
  const params = CloneTestCaseParams.safeParse(req.params);
  if (!params.success) return res.status(400).json({ error: params.error.message }) as any;

  const [original] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  if (!original) return res.status(404).json({ error: "Test case not found" }) as any;

  const { id, createdAt, updatedAt, ...rest } = original;
  const overrides: Record<string, any> = {};
  if (req.body?.projectId !== undefined) overrides.projectId = req.body.projectId;
  if (req.body?.module !== undefined) overrides.module = req.body.module;
  if (req.body?.requirementId !== undefined) overrides.requirementId = req.body.requirementId || null;
  // Set authorId to the user performing the clone, not the original author
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const jwt = verifyToken(authHeader.slice(7));
      overrides.authorId = jwt.id;
    } catch {}
  }

  const [cloned] = await db.insert(testCasesTable).values({ ...rest, ...overrides, title: `${original.title} (Copy)`, aiAssisted: false }).returning();

  await logActivity({
    type: "test_case_created",
    description: `Test case "${cloned.title}" was cloned from "${original.title}"`,
    userId: cloned.authorId,
    entityId: cloned.id,
    entityType: "test_case",
  });

  res.status(201).json(await formatTestCase(cloned));
});

// ─── Export test cases as Excel using the shared template ────────────────────

router.post("/test-cases/export", express.json(), async (req, res): Promise<void> => {
  const { testCases, senderName } = req.body;
  if (!Array.isArray(testCases) || testCases.length === 0) {
    res.status(400).json({ error: "testCases array is required" });
    return;
  }

  const rows = testCases.map((tc: any) => ({
    caseId:         tc.caseId ?? (tc.id ? `TC-${tc.id}` : ""),
    userStory:      tc.userStory ?? tc.redmineUserStory ?? "",
    tracker:        tc.tracker ?? "",
    scenario:       tc.scenario ?? "",
    preCondition:   tc.preCondition ?? tc.preconditions ?? "",
    caseName:       tc.caseName ?? tc.title ?? tc.case ?? "",
    testSteps:      tc.testSteps ?? "",
    testData:       tc.testData ?? "",
    expectedResult: tc.expectedResult ?? "",
    result:         tc.result ?? "",
    defectNumber:   tc.defectNumber ?? tc.redmineDefectId ?? "",
    comments:       tc.comments ?? "",
    qaPic:          tc.qaPic ?? tc.authorName ?? "",
  }));

  const buf = await buildTestCaseExcel(rows, { senderName: senderName || undefined });
  if (!buf) {
    res.status(500).json({ error: "Failed to generate Excel" });
    return;
  }

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="TC_Export_${date}.xlsx"`);
  res.send(buf);
});

export default router;