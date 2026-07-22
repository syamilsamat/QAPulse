import { Router, type IRouter } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  db,
  requirementsTable,
  testCasesTable,
  tasksTable,
  usersTable,
  activityTable,
  milestonesTable,
  risksTable,
  defectsTable,
  defectLinksTable,
  executionTestCasesTable,
  requirementCommentsTable,
  projectsTable,
  milestoneRiskAssessmentsTable,
  conversations,
  messages,
} from "@workspace/db";
import { GoogleGenAI } from "@google/genai";
import { logActivity } from "./_audit";
import { actorFromReq } from "./auth";
import { getAuthContext, canAccessProject, scopeToUserProjects } from "../middleware/access";
import { computeRequirementTimelines, summarizeTimelines, computeKpiMetrics, rollupExecutionByMilestone } from "./dashboard";

const router: IRouter = Router();
const ai = new GoogleGenAI({});

/**
 * Bulletproof JSON Parser with Auto-Salvage
 * Strips rogue markdown blocks and attempts to recover partially generated
 * arrays if the AI payload was truncated mid-generation.
 */
function safeParseJSON(content: string, fallback: any) {
  let cleaned = content
    .replace(/```json\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    // Attempt standard parse first
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("🔴 JSON Parse Error! Output was likely truncated. Attempting data salvage...");

    // SALVAGE OPERATION:
    // We look for the last fully completed object (ending in '}') and 
    // forcefully close the array and root object to rescue the valid data.
    const lastClosingBrace = cleaned.lastIndexOf("}");

    if (lastClosingBrace !== -1) {
      try {
        // Snip off the broken incomplete text at the end, and seal the JSON.
        const salvagedText = cleaned.substring(0, lastClosingBrace + 1) + "]}";
        const salvagedJSON = JSON.parse(salvagedText);

        // Verify that the salvage actually produced the arrays we expect in ai.ts
        if (
          salvagedJSON && 
          (Array.isArray(salvagedJSON.duplicates) || 
           Array.isArray(salvagedJSON.edgeCases) || 
           Array.isArray(salvagedJSON.gaps))
        ) {
          console.log(`✅ Salvage successful! Recovered truncated AI analysis.`);
          return salvagedJSON;
        }
      } catch (salvageError) {
        console.error("❌ Salvage operation failed. Returning fallback.");
      }
    }

    // If parsing still fails, return the empty fallback
    return fallback;
  }
}

/**
 * The Ultimate OpenRouter Cascade
 * Loops through multiple AI models until one succeeds.
 */
async function runOpenRouterCascade(
  messages: any[],
  requireJson: boolean = true,
): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY environment variable in Replit Secrets.",
    );
  }

  // The Cascade Order: Expanded to include your new models!
  const fallbackModels = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "liquid/lfm-2.5-1.2b-instruct-20260120",
    "openai/gpt-oss-120b",
    "qwen/qwen3-coder",
    "moonshotai/kimi-k2.6",
    "nousresearch/hermes-3-llama-3.1-405b",
    "nvidia/nemotron-3.5-content-safety-20260604",
    "sourceful/riverflow-v2.5-pro-20260605",
    "sourceful/riverflow-v2.5-fast-20260605",
    "z-ai/glm-4.5-air",
    "google/gemma-4-31b-it",
  ];

  for (const model of fallbackModels) {
    console.log(`🔄 Attempting Fallback Node: ${model}...`);
    try {
      const body: any = {
        model: model,
        messages: messages,
        max_tokens: 8192,
      };

      // Only force JSON mode if the specific endpoint requires it
      if (requireJson) {
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (
          data.choices &&
          data.choices.length > 0 &&
          data.choices[0].message?.content
        ) {
          console.log(`✅ Success with Fallback Node: ${model}`);
          return data.choices[0].message.content;
        }
      } else {
        const errorBody = await response.text();
        console.warn(
          `⚠️ Node [${model}] failed: ${response.status} - ${errorBody}`,
        );
      }
    } catch (error) {
      console.warn(
        `⚠️ Network error with Node [${model}]:`,
        (error as Error).message,
      );
    }
  }

  // If the loop finishes without returning, every AI is down.
  throw new Error(
    "❌ Crucial system failure: All primary and fallback AI nodes are completely exhausted. The world might be doomed.",
  );
}

/**
 * JSON OpenRouter Fallback Client Handler
 */
async function callFallbackAI(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  return await runOpenRouterCascade(messages, true);
}

/**
 * Core AI Router Executor with Intelligent Failover Logic
 */
async function executeAiTask(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 8192,
): Promise<string> {
  try {
    console.log("ℹ️ Attempting primary pipeline execution via Gemini...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    });
    return response.text ?? "";
  } catch (error: any) {
    const isQuotaExceeded =
      error.status === 429 ||
      error.message?.includes("quota") ||
      error.message?.includes("Quota");

    const isServiceUnavailable =
      error.status === 503 ||
      error.status === 500 ||
      error.message?.includes("temporary") ||
      error.message?.includes("high demand") ||
      error.message?.includes("UNAVAILABLE") ||
      error.message?.includes("INTERNAL");

    if (isQuotaExceeded || isServiceUnavailable) {
      console.warn(
        `⚠️ Gemini pipeline choked (Status: ${error.status || "Unknown"}). Engaging OpenRouter cascade network...`,
      );
      return await callFallbackAI(systemPrompt, userPrompt);
    } else {
      console.error(
        "❌ Aborting task execution. Gemini encountered unrecoverable layout mutation:",
        error,
      );
      throw error;
    }
  }
}

// ==========================================
// 1. ANALYZE REQUIREMENT
// ==========================================
router.post("/ai/analyze-requirement", async (req, res): Promise<void> => {
  const fallback = {
    score: 0,
    issues: [],
    missingItems: [],
    questions: ["Failed to process requirement."],
    riskLevel: "high",
    summary: "Analysis failed due to an unexpected error or API timeout.",
  };

  try {
    const { requirementId, title, description, module: mod } = req.body;

    let reqTitle = title;
    let reqDescription = description;
    let reqModule = mod;

    if (requirementId) {
      const [req2] = await db
        .select()
        .from(requirementsTable)
        .where(eq(requirementsTable.id, Number(requirementId)));
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

    const systemPrompt = `You are a senior QA analyst. Analyze requirements for completeness, clarity, and testability. Be highly concise.
       Limit your response to a maximum of 4 critical issues, 4 missing items, and 3 clarifying questions.
       Return exactly this JSON structure:
       { "score": 0-100, "issues": [{"type": "string", "severity": "string", "description": "string", "suggestion": "string"}], 
         "missingItems": ["string"], "questions": ["string"], "riskLevel": "low"|"medium"|"high"|"critical", "summary": "string" }`;

    const userPrompt = `Requirement Title: ${reqTitle}\nDescription: ${reqDescription ?? "Not provided"}\nModule: ${reqModule ?? "Not specified"}\n\nAnalyze this requirement and return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    const result = safeParseJSON(content, fallback);

    // CR023p2.4 — log each analyzer run to the requirement's History so past
    // results stay reviewable without re-running the AI.
    if (requirementId) {
      await logActivity({
        type: "requirement_ai_analysis",
        description: `AI Requirement Analyzer run on "${reqTitle}" — score ${result.score}/100, risk ${result.riskLevel}`,
        userId: actorFromReq(req),
        entityId: Number(requirementId),
        entityType: "requirement",
        newValue: {
          score: result.score,
          riskLevel: result.riskLevel,
          summary: result.summary,
          missingItems: result.missingItems,
          questions: result.questions,
        },
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Analyze Req Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 2. ENHANCED EDGE CASES
// ==========================================
router.post("/ai/edge-cases", async (req, res): Promise<void> => {
  const fallback = {
    edgeCases: [
      {
        category: "System Error",
        scenario: "Failed to generate edge cases.",
        testInput: "N/A",
        expectedBehavior: "N/A",
        risk: "high",
      },
    ],
  };

  try {
    const { title, description, module: mod } = req.body;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const systemPrompt = `You are an expert QA automation and break-it engineer specializing strictly in extreme edge cases.
       Do NOT generate happy paths, typical user errors, or simple negative test cases.
       Focus heavily on true edge cases: hard boundary limits, behavioral anomalies, data pollution, and race conditions.
       Limit your output to a maximum of 6 highly detailed edge cases.
       Return exactly this JSON structure:
       { "edgeCases": [{ "category": "string", "scenario": "string", "testInput": "string", "expectedBehavior": "string", "risk": "low"|"medium"|"high" }] }`;

    const userPrompt = `Feature: ${title}\nDescription: ${description ?? "No description provided."}\nModule: ${mod ?? "Unspecified"}\n\nGenerate realistic, complex edge cases and return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("Edge Case Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 3. ENHANCED DUPLICATE CHECK
// ==========================================
router.post("/ai/duplicate-detection", async (req, res): Promise<void> => {
  const fallback = {
    duplicates: [],
    recommendation: "Analysis failed. Could not verify duplicates.",
  };

  try {
    const { title, steps, projectId } = req.body;

    let dbQuery = db.select().from(testCasesTable);
    if (projectId) {
      dbQuery = dbQuery.where(
        eq(testCasesTable.projectId, Number(projectId)),
      ) as any;
    }
    const existingCases = await dbQuery.limit(50);

    if (existingCases.length === 0) {
      res.json({
        duplicates: [],
        recommendation: "No test cases found in the repository to analyze.",
      });
      return;
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (title) {
      const existingDataString = existingCases
        .map(
          (tc) =>
            `ID:${tc.id} | Title:${tc.title} | Objective:${tc.objective ?? "N/A"}`,
        )
        .join("\n");
      systemPrompt = `You are a QA Test Repository Manager. Compare the incoming new test case against the existing active test repository cases below. Calculate a similarity score (0 to 100).
       For any case with a high similarity score (above 70), provide a clear action directive: "delete", "merge", or "keep".
       If there are NO duplicates, return an empty array for "duplicates" and state "No duplicates found" in the recommendation.
       Limit returned duplicates array to top 5 matches to ensure concise JSON parsing.
       Return exactly this JSON structure:
       { "duplicates": [{ "id": 123, "title": "string", "similarityScore": 90, "action": "delete"|"merge"|"keep", "reason": "string" }], "recommendation": "string" }`;
      userPrompt = `New Test Case:\nTitle: "${title}"\nSteps: ${steps ?? "Not provided"}\n\nExisting Repository:\n${existingDataString || "None yet."}\n\nAnalyze similarities and return ONLY JSON.`;
    } else {
      const allDataString = existingCases
        .map(
          (tc) =>
            `ID:${tc.id} | Title:${tc.title} | Objective:${tc.objective ?? "N/A"}`,
        )
        .join("\n");
      systemPrompt = `You are a QA Test Repository Manager. Analyze the entire list of existing test cases below and identify any duplicates or highly overlapping scenarios among them.
       Compare them against each other. Calculate a similarity score (0 to 100) for overlaps.
       For any highly similar pairs/groups, suggest an action: "delete", "merge", or "keep".
       CRITICAL: If absolutely NO duplicates or overlaps exist in the list, you MUST return an empty array for "duplicates" and provide a recommendation confirming the repository is clean.
       Limit returned duplicates array to top 5 major overlaps to ensure concise JSON parsing.
       Return exactly this JSON structure:
       { "duplicates": [{ "id": 123, "title": "string", "similarityScore": 90, "action": "delete"|"merge"|"keep", "reason": "string" }], "recommendation": "string" }`;
      userPrompt = `Test Case Repository:\n${allDataString}\n\nFind duplicates within this list and return ONLY valid JSON.`;
    }

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("Duplicate Detection Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 4. WEEKLY SUMMARY
// ==========================================
router.post("/ai/weekly-summary", async (req, res): Promise<void> => {
  try {
    const { projectId } = req.body;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    let tasks = await db.select().from(tasksTable);
    let testCases = await db.select().from(testCasesTable);

    if (projectId) {
      tasks = tasks.filter((t) => t.projectId === Number(projectId));
      testCases = testCases.filter((tc) => tc.projectId === Number(projectId));
    }

    const recentTasks = tasks.filter(
      (t) => new Date(t.updatedAt) >= oneWeekAgo,
    );
    const recentTestCases = testCases.filter(
      (tc) => new Date(tc.createdAt) >= oneWeekAgo,
    );

    const stats = {
      totalTasks: tasks.length,
      completed: tasks.filter((t) => t.status === "released_to_production")
        .length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
      inProgress: tasks.filter((t) => t.status === "sit").length,
      newThisWeek: recentTasks.filter((t) => t.status === "uat").length,
      completedThisWeek: recentTasks.filter(
        (t) => t.status === "released_to_production",
      ).length,
      newTestCasesThisWeek: recentTestCases.length,
      aiAssistedTestCases: testCases.filter((tc) => tc.aiAssisted).length,
    };

    const fallback = {
      headline: "Weekly Summary Failed",
      summary: "Could not generate summary due to an error.",
      highlights: [],
      risks: [],
      blockers: [],
      nextWeekFocus: [],
      releaseReadiness: "not_ready",
      overallHealth: "red",
      stats,
    };

    const systemPrompt = `You are a QA manager generating weekly status reports. Be concise and actionable.
       Return exactly this JSON structure:
       { "headline": "string", "summary": "string", "highlights": ["string"], "risks": ["string"], "blockers": ["string"], "nextWeekFocus": ["string"], "releaseReadiness": "ready"|"caution"|"not_ready", "overallHealth": "green"|"yellow"|"red" }`;
    const userPrompt = `Weekly QA Statistics:\n- Total active tasks: ${stats.totalTasks}\n- Completed tasks: ${stats.completed}\n- Blocked tasks: ${stats.blocked}\n- In progress tasks: ${stats.inProgress}\n- New tasks this week: ${stats.newThisWeek}\n- Tasks completed this week: ${stats.completedThisWeek}\n- New test cases this week: ${stats.newTestCasesThisWeek}\n- AI-assisted test cases total: ${stats.aiAssistedTestCases}\n\nGenerate report. Return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    const parsedData = safeParseJSON(content, fallback);
    res.json({ ...parsedData, stats });
  } catch (error) {
    console.error("Weekly Summary Error:", error);
    res.json({
      headline: "Error",
      summary: "Failed to generate report.",
      highlights: [],
      risks: [],
      blockers: [],
      nextWeekFocus: [],
      releaseReadiness: "not_ready",
      overallHealth: "red",
      stats: {},
    });
  }
});

// ==========================================
// 5. COVERAGE GAP
// ==========================================
router.post("/ai/coverage-gap", async (req, res): Promise<void> => {
  try {
    const { requirementId, projectId } = req.body;

    let requirements = await db.select().from(requirementsTable);
    let testCases = await db.select().from(testCasesTable);

    if (requirementId) {
      requirements = requirements.filter((r) => r.id === Number(requirementId));
      testCases = testCases.filter(
        (tc) => tc.requirementId === Number(requirementId),
      );
    } else if (projectId) {
      requirements = requirements.filter(
        (r) => r.projectId === Number(projectId),
      );
      testCases = testCases.filter((tc) => tc.projectId === Number(projectId));
    }

    const covered = requirements.filter((r) =>
      testCases.some((tc) => tc.requirementId === r.id),
    ).length;
    const uncovered = requirements.filter(
      (r) => !testCases.some((tc) => tc.requirementId === r.id),
    );

    const reqSummary = requirements
      .slice(0, 15)
      .map((r) => {
        const linked = testCases.filter(
          (tc) => tc.requirementId === r.id,
        ).length;
        return `${r.title} (${linked} test cases, priority: ${r.priority})`;
      })
      .join("\n");

    const fallback = {
      coverageScore: 0,
      gaps: [],
      insights: [],
      summary: "Failed to generate coverage analysis.",
      stats: {
        total: requirements.length,
        covered,
        uncovered: uncovered.length,
      },
    };

    const systemPrompt = `You are a QA coverage analyst. Analyze test coverage gaps and provide recommendations.
       Limit response to top 5 gaps to ensure reliable output.
       Return exactly this JSON structure:
       { "coverageScore": 0-100, "gaps": [{ "requirementTitle": "string", "issue": "string", "recommendation": "string", "priority": "string" }], "insights": ["string"], "summary": "string" }`;

    const userPrompt = `Coverage Analysis:\n- Total requirements: ${requirements.length}\n- Requirements with test cases: ${covered}\n- Requirements without test cases: ${uncovered.length}\n- Total test cases: ${testCases.length}\n\nRequirements breakdown:\n${reqSummary}\n\nUncovered requirements: ${uncovered
      .slice(0, 10)
      .map((r) => r.title)
      .join(", ")}\n\nAnalyze gaps and return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    const parsedData = safeParseJSON(content, fallback);
    res.json({ ...parsedData, stats: fallback.stats });
  } catch (error) {
    console.error("Coverage Gap Error:", error);
    res.json({
      coverageScore: 0,
      gaps: [],
      insights: [],
      summary: "System error occurred.",
      stats: { total: 0, covered: 0, uncovered: 0 },
    });
  }
});

// ==========================================
// 6. RISK SCORE
// ==========================================
router.post("/ai/risk-score", async (req, res): Promise<void> => {
  const fallback = {
    modules: [],
    overallRisk: "high",
    summary: "Failed to generate risk score.",
  };

  try {
    const { projectId, redmineData } = req.body;
    let userPrompt = "";

    const systemPrompt = `You are a QA risk analyst. Score modules by risk level based on data.
       Return exactly this JSON structure:
       { "modules": [{ "name": "string", "riskScore": 0-100, "riskLevel": "low"|"medium"|"high"|"critical", "reasons": ["string"], "recommendation": "string" }], "overallRisk": "low"|"medium"|"high"|"critical", "summary": "string" }`;

    if (redmineData) {
      const moduleList = redmineData.moduleDetails
        .map(
          (m: any) =>
            `${m.module}: ${m.total} test cases, ${m.failed} failed, ${m.blocked} blocked, completion: ${m.totalCompletion}%`,
        )
        .join("\n");

      // Extract the full defect history
      const openDefects = redmineData.activeDefects?.length || 0;
      const totalDefects = redmineData.defects?.total || 0;
      const resolvedDefects = totalDefects - openDefects;

      userPrompt = `Redmine Ticket Risk Data:\n${moduleList || "No module data available"}\n\nTotal test cases: ${redmineData.testExecution?.total}\nFailed tests: ${redmineData.testExecution?.failed}\nBlocked tests: ${redmineData.testExecution?.blocked}\nTotal Defects Found: ${totalDefects}\nResolved/Verified Defects: ${resolvedDefects}\nActive/Open Defects: ${openDefects}\n\nGenerate risk scores and return ONLY JSON. Note: A high number of resolved defects is a positive sign of stabilization and lowers risk. Zero open defects is great, but only if test execution > 0%.`;
    } else {
      let tasks = await db.select().from(tasksTable);
      let requirements = await db.select().from(requirementsTable);
      let testCases = await db.select().from(testCasesTable);

      if (projectId) {
        tasks = tasks.filter((t) => t.projectId === Number(projectId));
        requirements = requirements.filter(
          (r) => r.projectId === Number(projectId),
        );
        testCases = testCases.filter(
          (tc) => tc.projectId === Number(projectId),
        );
      }

      const modules: Record<
        string,
        { tasks: number; blocked: number; critical: number; uncovered: boolean }
      > = {};
      requirements.forEach((r) => {
        const mod = r.module ?? "Unspecified";
        if (!modules[mod])
          modules[mod] = {
            tasks: 0,
            blocked: 0,
            critical: 0,
            uncovered: false,
          };
        modules[mod].tasks++;
        if (r.priority === "critical") modules[mod].critical++;
        const hasCoverage = testCases.some((tc) => tc.requirementId === r.id);
        if (!hasCoverage) modules[mod].uncovered = true;
      });

      tasks
        .filter((t) => t.status === "blocked")
        .forEach((t) => {
          const req = requirements.find((r) => r.id === t.requirementId);
          const mod = req?.module ?? "Unspecified";
          if (modules[mod]) modules[mod].blocked++;
        });

      const moduleList = Object.entries(modules)
        .map(
          ([name, m]) =>
            `${name}: ${m.tasks} reqs, ${m.blocked} blocked, ${m.critical} critical, coverage gap: ${m.uncovered}`,
        )
        .join("\n");

      userPrompt = `Module Risk Data:\n${moduleList || "No module data available"}\n\nTotal tasks: ${tasks.length}\nBlocked: ${tasks.filter((t) => t.status === "blocked").length}\nOverdue: ${tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "released_to_production").length}\n\nGenerate risk scores and return ONLY JSON.`;
    }

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("Risk Score Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 7. RELEASE READINESS
// ==========================================
router.post("/ai/release-readiness", async (req, res): Promise<void> => {
  try {
    const { projectId, redmineData } = req.body;
    let userPrompt = "";
    let completionRate = 0;
    let coverageRate = 0;
    let stats: any = {};

    const fallback = {
      readinessScore: 0,
      status: "not_ready",
      verdict: "System error occurred.",
      positives: [],
      blockers: [],
      recommendations: [],
      expectedReleaseDate: "Unknown", // Added fallback field
      stats: {},
      completionRate: 0,
      coverageRate: 0,
    };

    // Updated System Prompt to request expectedReleaseDate
    const systemPrompt = `You are a QA release manager. Assess release readiness objectively.
       Return exactly this JSON structure:
       { "readinessScore": 0-100, "status": "ready"|"caution"|"not_ready", "verdict": "string", "positives": ["string"], "blockers": ["string"], "recommendations": ["string"], "expectedReleaseDate": "string" }`;

    if (redmineData) {
      completionRate = redmineData.testExecution?.successRate || 0;
      coverageRate = 100;

      stats = {
        totalTasks: redmineData.testExecution?.total || 0,
        done: redmineData.testExecution?.passed || 0,
        blocked: redmineData.testExecution?.blocked || 0,
        overdue: 0,
        totalReqs: redmineData.requirements?.length || 0,
        openReqs:
          redmineData.requirements?.filter(
            (r: any) => r.status !== "Closed" && r.status !== "Done",
          ).length || 0,
        totalTestCases: redmineData.testExecution?.total || 0,
        automationCandidates: 0,
        coveredReqs: redmineData.requirements?.length || 0,
      };

      const openDefects = redmineData.activeDefects?.length || 0;
      const totalDefects = redmineData.defects?.total || 0;
      const resolvedDefects = totalDefects - openDefects;

      // NEW: Summarize the Module Test Execution Details for the AI
      const moduleSummary =
        redmineData.moduleDetails
          ?.map(
            (m: any) =>
              `- ${m.module}: Pass=${m.passCompletion}%, Blocked=${m.blocked}, Failed=${m.failed}, Not Exec=${m.notExecuted}`,
          )
          .join("\n") || "No module execution data.";

      // NEW: Feed the module summary into the User Prompt so the AI bases its date on it
      userPrompt = `Release Readiness Data (Redmine):\n- Test pass rate: ${redmineData.testExecution?.passRate}%\n- Test success rate: ${completionRate}%\n- Blocked test cases: ${stats.blocked}\n- Failed test cases: ${redmineData.testExecution?.failed || 0}\n- Active/Open defects: ${openDefects}\n\nTest Execution Details by Module:\n${moduleSummary}\n\nAssess release readiness and return ONLY JSON. Provide an 'expectedReleaseDate' (e.g., 'Ready for immediate release', 'Needs 2-3 days for retesting', etc.) based on the execution details by module and open defects.`;
    } else {
      let tasks = await db.select().from(tasksTable);
      let testCases = await db.select().from(testCasesTable);
      let requirements = await db.select().from(requirementsTable);

      if (projectId) {
        tasks = tasks.filter((t) => t.projectId === Number(projectId));
        testCases = testCases.filter(
          (tc) => tc.projectId === Number(projectId),
        );
        requirements = requirements.filter(
          (r) => r.projectId === Number(projectId),
        );
      }

      stats = {
        totalTasks: tasks.length,
        done: tasks.filter((t) => t.status === "released_to_production").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
        overdue: tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < new Date() &&
            t.status !== "released_to_production",
        ).length,
        totalReqs: requirements.length,
        openReqs: requirements.filter((r) => r.status !== "done").length,
        totalTestCases: testCases.length,
        automationCandidates: testCases.filter(
          (tc) => tc.type === "automation_candidate",
        ).length,
        coveredReqs: requirements.filter((r) =>
          testCases.some((tc) => tc.requirementId === r.id),
        ).length,
      };

      completionRate =
        stats.totalTasks > 0
          ? Math.round((stats.done / stats.totalTasks) * 100)
          : 0;
      coverageRate =
        stats.totalReqs > 0
          ? Math.round((stats.coveredReqs / stats.totalReqs) * 100)
          : 0;

      userPrompt = `Release Readiness Data:\n- Task completion rate: ${completionRate}%\n- Blocked tasks: ${stats.blocked}\n- Overdue tasks: ${stats.overdue}\n- Open requirements: ${stats.openReqs}\n- Test coverage rate: ${coverageRate}%\n- Total test cases: ${stats.totalTestCases}\n- Automation candidates: ${stats.automationCandidates}\n\nAssess release readiness based on this project snapshot and return ONLY JSON. Provide positive signals, blockers, and an 'expectedReleaseDate' (e.g. 'Ready immediately', 'Requires 1 week of testing', etc.) based on completion vs overdue status.`;
    }

    const content = await runOpenRouterCascade(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      true,
    );

    const parsedData = safeParseJSON(content, fallback);
    res.json({ ...parsedData, stats, completionRate, coverageRate });
  } catch (error: any) {
    console.error("Readiness error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to calculate readiness" });
  }
});

// ==========================================
// 12. QA COPILOT CHAT
// ==========================================
router.post("/ai/chat", async (req, res): Promise<void> => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "message is required" }) as any;
    }

    // 1. Format the conversation history into text to feed into executeAiTask
    let historyText = "";
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      historyText = "--- Conversation History ---\n";
      conversationHistory.forEach((msg: any) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        historyText += `${role}: ${msg.content}\n\n`;
      });
      historyText += "----------------------------\n\n";
    }

    // 2. Define the exact JSON structure we need returned so it works seamlessly with the UI
    const systemPrompt = `You are an expert QA Copilot assistant. You help QA engineers analyze requirements, write test cases, generate test data, and strategize testing efforts. Be concise, professional, and highly technical.

    You MUST return your response as a JSON object matching this exact schema:
    { "reply": "Your detailed markdown formatted response here" }`;

    const userPrompt = `${historyText}New User Message: ${message}\n\nPlease respond to the new user message considering the context above. Format your output strictly as JSON.`;

    // 3. Execute utilizing your fallback mechanisms
    const content = await executeAiTask(systemPrompt, userPrompt);

    // 4. Safely parse the result
    const fallback = { reply: "I'm sorry, I encountered an formatting error while generating my response. Please try again." };
    const parsedData = safeParseJSON(content, fallback);

    // 5. Send the reply property back to the frontend
    res.json({ reply: parsedData.reply || fallback.reply });

  } catch (error: any) {
    console.error("QA Copilot Chat Error:", error);
    res.status(500).json({ 
      error: error.message || "An error occurred while communicating with the AI." 
    });
  }
});


// ==========================================
// 9. TEST DATA SPECIALIST
// ==========================================
router.post("/ai/test-data", async (req, res): Promise<void> => {
  const fallback = {
    data: [],
    notes: ["Failed to generate test data. Please try again."],
  };

  try {
    const { dataType, count = 10, context: ctx, format = "json" } = req.body;

    if (!dataType) {
      res.status(400).json({ error: "dataType is required" });
      return;
    }

    const systemPrompt = `You are a QA test data specialist. Generate realistic, varied test data for QA testing purposes.
       Return exactly this JSON structure:
       { "data": [ ...array of generated items... ], "notes": ["string"] }`;
    const userPrompt = `Generate ${count} test data items for: ${dataType}\nContext: ${ctx ?? "General testing"}\nFormat: ${format}\nInclude: valid data, invalid data, edge cases, boundary values, special characters where appropriate.\n\nReturn ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("Test Data Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 10. REGRESSION SELECTION
// ==========================================
router.post("/ai/regression-selection", async (req, res): Promise<void> => {
  const fallback = {
    selected: [],
    skipped: [],
    summary: "Failed to run regression selection.",
    estimatedTime: "Unknown",
  };

  try {
    const { changedModules = [], projectId } = req.body;

    let testCases = await db.select().from(testCasesTable);

    if (projectId) {
      testCases = testCases.filter((tc) => tc.projectId === Number(projectId));
    }

    const tcSummary = testCases
      .slice(0, 30)
      .map(
        (tc) =>
          `ID:${tc.id} | ${tc.title} | type:${tc.type} | priority:${tc.priority}`,
      )
      .join("\n");

    const systemPrompt = `You are a QA regression specialist. Select the most important test cases for regression based on changed modules.
       Return exactly this JSON structure:
       { "selected": [{ "id": 123, "title": "string", "reason": "string", "priority": "must_run"|"should_run"|"optional" }], "skipped": [{ "id": 123, "title": "string", "reason": "string" }], "summary": "string", "estimatedTime": "string" }`;
    const userPrompt = `Changed modules: ${changedModules.join(", ") || "Not specified - general regression"}\n\nAvailable test cases:\n${tcSummary || "No test cases found"}\n\nSelect regression suite. Return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("Regression Selection Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// 11. NATURAL LANGUAGE SEARCH
// ==========================================
router.post("/ai/natural-language-search", async (req, res): Promise<void> => {
  const fallback = {
    results: [],
    interpretation: "Failed to process search query.",
  };

  try {
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

    const taskSummary = tasks
      .map((t) => `TASK|${t.id}|${t.name}|${t.status}|${t.type}`)
      .join("\n");
    const tcSummary = testCases
      .map((tc) => `TC|${tc.id}|${tc.title}|${tc.type}|${tc.priority}`)
      .join("\n");
    const reqSummary = requirements
      .map((r) => `REQ|${r.id}|${r.title}|${r.status}|${r.priority}`)
      .join("\n");

    const systemPrompt = `You are a search engine for QA data. Parse the user's natural language query and return matching items.
       Return exactly this JSON structure:
       { "results": [{ "type": "task"|"test_case"|"requirement", "id": 123, "title": "string", "relevance": "high"|"medium"|"low", "reason": "string" }], "interpretation": "string" }`;
    const userPrompt = `User query: "${query}"\n\nAvailable data:\n${taskSummary || "No tasks"}\n\n${tcSummary || "No test cases"}\n\n${reqSummary || "No requirements"} \n\nMatch items relevant to the query. Return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    console.error("NL Search Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// CAPA INTELLIGENCE
// ==========================================
router.post("/ai/capa-analysis", async (req, res): Promise<void> => {
  const fallback = { items: [], summary: "Analysis unavailable." };
  try {
    const { ticketId, testCases } = req.body as {
      ticketId: string;
      testCases: { testCaseId?: string; caseName?: string; moduleName?: string; result?: string; defectNumber?: string; actualResult?: string; comments?: string }[];
    };

    if (!Array.isArray(testCases) || testCases.length === 0) {
      res.status(400).json({ error: "testCases array is required" });
      return;
    }

    const failures = testCases.filter(tc =>
      ["failed", "blocked"].includes((tc.result ?? "").toLowerCase())
    );

    if (failures.length === 0) {
      res.json({ items: [], summary: "No failed or blocked test cases to analyse." });
      return;
    }

    const tcList = failures.map(tc =>
      `- [${tc.testCaseId ?? "?"}] ${tc.caseName ?? "Unnamed"} | Module: ${tc.moduleName ?? "?"} | Result: ${tc.result} | Defect: ${tc.defectNumber ?? "none"} | Actual: ${tc.actualResult ?? ""} | Notes: ${tc.comments ?? ""}`
    ).join("\n");

    const systemPrompt = `You are a senior QA engineer writing a CAPA (Corrective and Preventive Action) report.
Given a list of failed/blocked test cases from a software test cycle, identify patterns and produce CAPA items.
Return ONLY this JSON structure:
{
  "summary": "1-2 sentence overall summary of failure patterns",
  "items": [
    {
      "sl": 1,
      "analysisPoint": "What went wrong — brief defect description",
      "rootCause": "Underlying reason the defect occurred",
      "correctiveAction": "Immediate fix to address this specific defect",
      "preventiveAction": "Process or code change to prevent recurrence",
      "module": "affected module name"
    }
  ]
}
Rules:
- Group similar failures into one CAPA item where sensible (max 8 items)
- Be concise — each field max 2 sentences
- Focus on actionable corrective/preventive steps, not generic advice`;

    const userPrompt = `Ticket: #${ticketId ?? "N/A"}\n\nFailed/Blocked Test Cases:\n${tcList}\n\nGenerate CAPA analysis. Return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt, 4096);
    const parsed = safeParseJSON(content, fallback);
    res.json({
      summary: parsed?.summary ?? "",
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    });
  } catch (error) {
    console.error("CAPA Analysis Error:", error);
    res.json(fallback);
  }
});

// ==========================================
// NL SEARCH — TC LIBRARY
// ==========================================
router.post("/ai/search-tcs", async (req, res): Promise<void> => {
  try {
    const { query, testCases } = req.body as {
      query: string;
      testCases: { id: number; title: string; scenario?: string; module?: string; tracker?: string }[];
    };

    if (!query?.trim() || !Array.isArray(testCases) || testCases.length === 0) {
      res.status(400).json({ error: "query and testCases are required" });
      return;
    }

    const tcList = testCases
      .map((tc) => `${tc.id}|${tc.title}|${tc.scenario ?? ""}|${tc.module ?? ""}|${tc.tracker ?? ""}`)
      .join("\n");

    const systemPrompt = `You are a QA test case search engine. Given a natural language query and a list of test cases, return the IDs of matching test cases ranked by relevance.
Return ONLY this JSON structure (no explanation, no markdown):
{ "ids": [123, 456, 789] }
Rules:
- Include only test cases that are relevant to the query
- Rank by relevance (most relevant first)
- If nothing matches, return { "ids": [] }
- Each line in the test case list is: id|title|scenario|module|tracker`;

    const userPrompt = `Query: "${query.trim()}"\n\nTest cases:\n${tcList}\n\nReturn matching TC IDs as JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt, 1024);
    const parsed = safeParseJSON(content, { ids: [] });
    res.json({ ids: Array.isArray(parsed?.ids) ? parsed.ids.map(Number) : [] });
  } catch (error) {
    console.error("NL TC Search Error:", error);
    res.json({ ids: [] });
  }
});

// ==========================================
// CR037 — MILESTONE RISK PREDICTOR
// ==========================================
// Milestone-level sibling of /ai/risk-score (which scores one ticket's
// execution data for the Verdict Report). Pre-aggregates five signal groups
// server-side and hands the model numbers only — the AI synthesizes and
// articulates, it never does the arithmetic. On any AI failure the endpoint
// returns 502 rather than a fabricated risk level.

const MILESTONE_RISK_ROLES = ["pm_member", "pm_lead", "hod_pm", "admin", "cto"];
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const CLOSED_DEFECT_STATUSES = new Set(["closed", "verified", "rejected", "duplicate"]);

function fmtAssessment(a: typeof milestoneRiskAssessmentsTable.$inferSelect) {
  return {
    id: a.id,
    milestoneId: a.milestoneId,
    riskLevel: a.riskLevel,
    factors: safeParseJSON(a.factors, []),
    mitigation: a.mitigation ?? null,
    model: a.model ?? null,
    createdBy: a.createdBy ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

router.post("/ai/milestone-risk", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!MILESTONE_RISK_ROLES.includes(ctx.role)) { res.status(403).json({ error: "PM role required" }); return; }

  const milestoneId = Number(req.body?.milestoneId);
  if (!milestoneId) { res.status(400).json({ error: "milestoneId is required" }); return; }

  const [milestone] = await db.select().from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
  if (!milestone) { res.status(404).json({ error: "Milestone not found" }); return; }
  if (!(await canAccessProject(ctx.userId, ctx.role, milestone.projectId))) {
    res.status(403).json({ error: "Access denied to this project" }); return;
  }

  try {
    // ── Signal 1: phase timelines & rework churn (CR032 machinery) ──────────
    const timelines = await computeRequirementTimelines(milestoneId, milestone.completedAt);
    const reqIds = timelines.map((t) => t.id);
    const phaseSummary = summarizeTimelines(timelines);
    const reworkedReqs = timelines.filter((t) => t.timeline.filter((s) => s.key === "requirements").length > 1);
    const maxRequirementsCycles = timelines.reduce(
      (max, t) => Math.max(max, t.timeline.filter((s) => s.key === "requirements").length), 0,
    );

    // ── Signal 2: review KPIs + schedule drift ──────────────────────────────
    let firstPassPct: number | null = null;
    let stabilityPct: number | null = null;
    if (reqIds.length > 0) {
      const kpiEvents = await db
        .select({ entityId: activityTable.entityId, type: activityTable.type, createdAt: activityTable.createdAt })
        .from(activityTable)
        .where(and(
          eq(activityTable.entityType, "requirement"),
          inArray(activityTable.entityId, reqIds),
          inArray(activityTable.type, ["requirement_reject", "requirement_submit", "requirement_approve"]),
        ))
        .orderBy(activityTable.createdAt);
      ({ firstPassPct, stabilityPct } = computeKpiMetrics(reqIds, kpiEvents));
    }

    const qaRollup = (await rollupExecutionByMilestone([milestoneId], "qa")).get(milestoneId);
    const uatRollup = (await rollupExecutionByMilestone([milestoneId], "uat")).get(milestoneId);
    const approvedCount = timelines.filter((t) => t.status.startsWith("Approved")).length;
    const workCompletedPct = (qaRollup?.tcCount ?? 0) > 0
      ? qaRollup!.passPct
      : reqIds.length > 0 ? Math.round((approvedCount / reqIds.length) * 100) : 0;

    let timeElapsedPct: number | null = null;
    let daysToTarget: number | null = null;
    if (milestone.targetDate) {
      daysToTarget = Math.round((milestone.targetDate.getTime() - Date.now()) / 86_400_000);
      if (milestone.status !== "completed" && milestone.status !== "cancelled") {
        const totalMs = milestone.targetDate.getTime() - milestone.createdAt.getTime();
        if (totalMs > 0) {
          timeElapsedPct = Math.min(Math.round(((Date.now() - milestone.createdAt.getTime()) / totalMs) * 100), 120);
        }
      }
    }
    const spi = (timeElapsedPct !== null && timeElapsedPct > 0)
      ? Math.round((workCompletedPct / timeElapsedPct) * 100) / 100
      : null;

    // ── Signal 3: risk register (CR033) ─────────────────────────────────────
    const riskRows = await db.select().from(risksTable).where(
      and(eq(risksTable.projectId, milestone.projectId), inArray(risksTable.status, ["open", "mitigating"])),
    );
    const milestoneRisks = riskRows.filter((r) => r.milestoneId === milestoneId || r.milestoneId === null);
    const highRisks = milestoneRisks.filter((r) => r.probability === "high" && r.impact === "high");

    // ── Signal 4: defects (direct milestoneId link, CR029) ──────────────────
    const defectRows = await db
      .select({ status: defectsTable.status, severity: defectsTable.severity, source: defectsTable.source })
      .from(defectsTable)
      .where(eq(defectsTable.milestoneId, milestoneId));
    const openDefects = defectRows.filter((d) => !CLOSED_DEFECT_STATUSES.has((d.status ?? "").toLowerCase()));
    const criticalOpenDefects = openDefects.filter((d) => /critical|high/i.test(d.severity ?? ""));
    const productionDefects = defectRows.filter((d) => d.source === "production");

    // ── Signal 5: coverage ───────────────────────────────────────────────────
    let reqsWithoutTcs = 0;
    if (reqIds.length > 0) {
      const tcRows = await db
        .select({ requirementId: testCasesTable.requirementId })
        .from(testCasesTable)
        .where(inArray(testCasesTable.requirementId, reqIds));
      const covered = new Set(tcRows.map((r) => r.requirementId));
      reqsWithoutTcs = reqIds.filter((id) => !covered.has(id)).length;
    }

    const snapshot = {
      milestone: { name: milestone.name, status: milestone.status, targetDate: milestone.targetDate?.toISOString() ?? null, daysToTarget },
      requirements: {
        total: reqIds.length,
        approved: approvedCount,
        reworkedCount: reworkedReqs.length,
        maxRequirementsCycles,
        firstPassPct,
        stabilityPct,
      },
      phaseAvgDays: Object.fromEntries(phaseSummary.map((s) => [s.key, s.avgDays])),
      schedule: { timeElapsedPct, workCompletedPct, spi },
      riskRegister: {
        openOrMitigating: milestoneRisks.length,
        highProbabilityHighImpact: highRisks.length,
        titles: milestoneRisks.slice(0, 10).map((r) => `${r.title} (${r.probability}/${r.impact}, ${r.status})`),
      },
      defects: {
        total: defectRows.length,
        open: openDefects.length,
        criticalOrHighOpen: criticalOpenDefects.length,
        fromProduction: productionDefects.length,
      },
      coverage: {
        qaTcCount: qaRollup?.tcCount ?? 0,
        qaPassPct: qaRollup?.passPct ?? null,
        uatTcCount: uatRollup?.tcCount ?? 0,
        uatPassPct: uatRollup?.passPct ?? null,
        requirementsWithoutTestCases: reqsWithoutTcs,
      },
    };

    const systemPrompt = `You are a senior QA/PM risk analyst assessing a software delivery milestone.
You are given PRE-AGGREGATED metrics — do not recompute or second-guess the numbers, synthesize them.
Weigh: schedule pressure (SPI < 0.8 or timeElapsed far ahead of workCompleted is serious), requirements rework churn (repeat cycles are a leading indicator), open high-probability/high-impact register risks, open critical defects, and untested requirements.
Return exactly this JSON structure, nothing else:
{ "riskLevel": "low"|"medium"|"high"|"critical", "factors": [{ "signal": "string (short name)", "detail": "string (one sentence, cite the specific numbers)", "weight": "primary"|"secondary" }], "mitigation": "string (one or two concrete next actions for the PM)" }
Give at most 3 factors, most important first. Be direct and specific — no hedging boilerplate.`;

    const raw = await executeAiTask(systemPrompt, JSON.stringify(snapshot), 2048);
    const parsed = safeParseJSON(raw, null);
    if (!parsed || !RISK_LEVELS.includes(parsed.riskLevel) || !Array.isArray(parsed.factors)) {
      res.status(502).json({ error: "AI assessment unavailable — try again shortly" });
      return;
    }

    const [row] = await db.insert(milestoneRiskAssessmentsTable).values({
      milestoneId,
      projectId: milestone.projectId,
      riskLevel: parsed.riskLevel,
      factors: JSON.stringify(parsed.factors.slice(0, 3)),
      mitigation: typeof parsed.mitigation === "string" ? parsed.mitigation : null,
      dataSnapshot: JSON.stringify(snapshot),
      model: "gemini-2.5-flash+openrouter-cascade",
      createdBy: ctx.userId,
    }).returning();

    await logActivity({
      type: "milestone_risk_assessed",
      description: `Milestone "${milestone.name}" AI risk assessment: ${parsed.riskLevel}`,
      userId: ctx.userId,
      entityId: milestoneId,
      entityType: "milestone",
      newValue: { riskLevel: parsed.riskLevel },
    });

    res.status(201).json(fmtAssessment(row));
  } catch (error) {
    console.error("Milestone risk assessment failed:", error);
    res.status(502).json({ error: "AI assessment unavailable — try again shortly" });
  }
});

// ==========================================
// 13. REQUIREMENT Q&A CHAT (CR039)
// ==========================================
// No requirement picker — the user just asks a question and the backend
// auto-matches which requirement it's about via keyword search over
// title/description/acceptanceCriteria (not vector/RAG — one requirement's
// worth of data is small enough to fetch and inject directly). A
// conversation stays unresolved (conversations.entityId null) until exactly
// one requirement is the clear top match; two or more tied top matches
// return as candidates for the user to pick rather than guessing.

const REQUIREMENT_CHAT_STOPWORDS = new Set([
  "the", "is", "a", "an", "for", "what", "of", "and", "to", "in", "on",
  "with", "does", "do", "how", "this", "that", "are", "was", "were",
  "be", "it", "its", "can", "will", "should", "would", "there",
]);

function extractKeywords(message: string): string[] {
  return Array.from(new Set(
    message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !REQUIREMENT_CHAT_STOPWORDS.has(w)),
  ));
}

interface RequirementCandidate {
  id: number;
  title: string;
  projectId: number | null;
  projectName: string | null;
  score: number;
}

type MatchResult =
  | { outcome: "no_match" }
  | { outcome: "resolved"; requirement: RequirementCandidate }
  | { outcome: "ambiguous"; candidates: RequirementCandidate[]; totalMatches: number };

async function findMatchingRequirements(message: string, ctx: { userId: number; role: string }): Promise<MatchResult> {
  const keywords = extractKeywords(message);
  if (keywords.length === 0) return { outcome: "no_match" };

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
  let allReqs = await db.select().from(requirementsTable);
  if (accessible !== null) {
    allReqs = allReqs.filter((r) => r.projectId == null || accessible.includes(r.projectId));
  }

  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
  const projectNameById = new Map<number, string>(projects.map((p) => [p.id, p.name]));

  const scored: RequirementCandidate[] = [];
  for (const r of allReqs) {
    const title = (r.title ?? "").toLowerCase();
    const description = (r.description ?? "").toLowerCase();
    const ac = (r.acceptanceCriteria ?? "").toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (title.includes(kw)) score += 3;
      if (description.includes(kw)) score += 2;
      if (ac.includes(kw)) score += 2;
    }
    if (score > 0) {
      scored.push({
        id: r.id,
        title: r.title,
        projectId: r.projectId,
        projectName: r.projectId != null ? projectNameById.get(r.projectId) ?? null : null,
        score,
      });
    }
  }

  if (scored.length === 0) return { outcome: "no_match" };

  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0].score;
  const topGroup = scored.filter((c) => c.score === topScore);

  if (topGroup.length === 1) return { outcome: "resolved", requirement: topGroup[0] };
  return { outcome: "ambiguous", candidates: topGroup.slice(0, 5), totalMatches: topGroup.length };
}

async function buildRequirementGroundingBlock(
  requirementId: number,
): Promise<{ block: string; title: string; projectName: string | null } | null> {
  const [req] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, requirementId));
  if (!req) return null;

  let projectName: string | null = null;
  if (req.projectId != null) {
    const [proj] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, req.projectId));
    projectName = proj?.name ?? null;
  }

  const testCases = await db.select().from(testCasesTable).where(eq(testCasesTable.requirementId, requirementId));
  const executionRows = await db.select().from(executionTestCasesTable).where(eq(executionTestCasesTable.requirementId, requirementId));
  const defectLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.requirementId, requirementId));
  const defectIds = defectLinks.map((l) => l.defectId);
  const linkedDefects = defectIds.length
    ? await db.select().from(defectsTable).where(inArray(defectsTable.id, defectIds))
    : [];
  const comments = await db.select().from(requirementCommentsTable)
    .where(eq(requirementCommentsTable.requirementId, requirementId))
    .orderBy(requirementCommentsTable.createdAt);

  const userIds = [req.approvedBy, req.rejectedBy, req.devAssigneeId].filter((x): x is number => !!x);
  const users = userIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const nameOf = (id: number | null) => (id == null ? null : users.find((u) => u.id === id)?.name ?? `user #${id}`);

  const tcSummary = testCases.length
    ? testCases.map((tc) => `- ${tc.title} (status: ${tc.status})`).join("\n")
    : "None";
  const execSummary = executionRows.length
    ? executionRows.map((e) => `- ${e.caseName ?? e.testCaseId ?? "Untitled"}: ${e.result ?? "not executed"}`).join("\n")
    : "None";
  const defectSummary = linkedDefects.length
    ? linkedDefects.map((d) => {
        const link = defectLinks.find((l) => l.defectId === d.id);
        const tag = link?.linkType === "requirement" ? "[requirement-authoring defect]" : "[code/test defect]";
        return `- ${tag} ${d.defectCode ?? "DEF-?"}: ${d.title} (${d.status}, ${d.severity})`;
      }).join("\n")
    : "None";
  const commentSummary = comments.length
    ? comments.map((c) => `- ${c.body}`).join("\n")
    : "None";

  const block = `
Requirement: ${req.title}
Project: ${projectName ?? "Unknown"}
Module: ${req.module ?? "Unspecified"}
Description: ${req.description ?? "Not provided"}
Acceptance Criteria: ${req.acceptanceCriteria ?? "Not provided"}
Review Status: ${req.reviewStatus}${req.approvedBy ? ` (approved by ${nameOf(req.approvedBy)})` : ""}${req.rejectedBy ? ` (rejected by ${nameOf(req.rejectedBy)})` : ""}
Dev Status: ${req.devStatus ?? "Not started"}${req.devAssigneeId ? ` (assigned to ${nameOf(req.devAssigneeId)})` : ""}

Linked Test Cases:
${tcSummary}

Execution Results:
${execSummary}

Linked Defects:
${defectSummary}

Discussion Comments:
${commentSummary}
`.trim();

  return { block, title: req.title, projectName };
}

async function answerFromGrounding(
  groundingBlock: string,
  newMessage: string,
  history: { role: string; content: string }[],
): Promise<{ reply: string }> {
  let historyText = "";
  if (history.length > 0) {
    historyText = "--- Conversation History ---\n";
    history.forEach((m) => { historyText += `${m.role === "user" ? "User" : "Assistant"}: ${m.content}\n\n`; });
    historyText += "----------------------------\n\n";
  }

  const systemPrompt = `You are a QA assistant answering questions about ONE specific requirement, grounded strictly in the data provided below. Do not invent test cases, defects, or statuses that aren't in the data. If asked about something not covered by the data, say so plainly. Be concise, professional, and technical.
You MUST return your response as a JSON object matching this exact schema:
{ "reply": "Your detailed markdown formatted response here" }`;

  const userPrompt = `Requirement grounding data:\n${groundingBlock}\n\n${historyText}New User Message: ${newMessage}\n\nRespond to the new user message using only the grounding data and conversation history above. Format your output strictly as JSON.`;

  const content = await executeAiTask(systemPrompt, userPrompt);
  const fallback = { reply: "I'm sorry, I encountered a formatting error while generating my response. Please try again." };
  const parsed = safeParseJSON(content, fallback);
  return { reply: parsed.reply || fallback.reply };
}

router.post("/ai/requirement-chat", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { message, conversationId, resolvedRequirementId } = req.body ?? {};

    // ── Resolving a disambiguation choice (chip click, not free text) ──────
    if (resolvedRequirementId != null) {
      if (!conversationId) { res.status(400).json({ error: "conversationId is required" }); return; }
      const [convo] = await db.select().from(conversations).where(eq(conversations.id, Number(conversationId)));
      if (!convo || convo.userId !== ctx.userId) { res.status(404).json({ error: "Conversation not found" }); return; }
      if (convo.entityId != null) { res.status(409).json({ error: "Conversation already resolved" }); return; }

      const grounding = await buildRequirementGroundingBlock(Number(resolvedRequirementId));
      if (!grounding) { res.status(404).json({ error: "Requirement not found" }); return; }

      const priorMessages = await db.select().from(messages)
        .where(eq(messages.conversationId, convo.id)).orderBy(desc(messages.createdAt));
      const lastUserMsg = priorMessages.find((m) => m.role === "user");
      if (!lastUserMsg) { res.status(409).json({ error: "No question to answer for this conversation" }); return; }

      await db.update(conversations)
        .set({ entityType: "requirement", entityId: Number(resolvedRequirementId) })
        .where(eq(conversations.id, convo.id));

      const { reply } = await answerFromGrounding(grounding.block, lastUserMsg.content, []);
      await db.insert(messages).values({ conversationId: convo.id, role: "assistant", content: reply });

      res.json({
        status: "answered",
        conversationId: convo.id,
        reply,
        matchedRequirement: { id: Number(resolvedRequirementId), title: grounding.title, projectName: grounding.projectName },
      });
      return;
    }

    // ── Normal message ───────────────────────────────────────────────────
    if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

    let convo: typeof conversations.$inferSelect;
    if (conversationId) {
      const [existing] = await db.select().from(conversations).where(eq(conversations.id, Number(conversationId)));
      if (!existing || existing.userId !== ctx.userId) { res.status(404).json({ error: "Conversation not found" }); return; }
      convo = existing;
    } else {
      const [created] = await db.insert(conversations).values({
        title: message.trim().slice(0, 80),
        userId: ctx.userId,
        entityType: null,
        entityId: null,
      }).returning();
      convo = created;
    }

    await db.insert(messages).values({ conversationId: convo.id, role: "user", content: message.trim() });

    // Already resolved earlier in this conversation — sticky, skip matching.
    if (convo.entityId != null) {
      const grounding = await buildRequirementGroundingBlock(convo.entityId);
      if (!grounding) { res.status(404).json({ error: "Requirement not found" }); return; }
      const history = await db.select({ role: messages.role, content: messages.content })
        .from(messages).where(eq(messages.conversationId, convo.id)).orderBy(messages.createdAt);
      // history includes the message just inserted above as its last item —
      // drop it (it's passed separately as newMessage) and keep up to 10 prior.
      const { reply } = await answerFromGrounding(grounding.block, message.trim(), history.slice(-11, -1));
      await db.insert(messages).values({ conversationId: convo.id, role: "assistant", content: reply });
      res.json({
        status: "answered",
        conversationId: convo.id,
        reply,
        matchedRequirement: { id: convo.entityId, title: grounding.title, projectName: grounding.projectName },
      });
      return;
    }

    // Not yet resolved — run matching against this message.
    const match = await findMatchingRequirements(message.trim(), ctx);

    if (match.outcome === "no_match") {
      const reply = "I couldn't find a requirement matching that. Try mentioning the requirement's title or a specific detail from it.";
      await db.insert(messages).values({ conversationId: convo.id, role: "assistant", content: reply });
      res.json({ status: "no_match", conversationId: convo.id, reply });
      return;
    }

    if (match.outcome === "ambiguous") {
      const moreNote = match.totalMatches > match.candidates.length
        ? ` (and ${match.totalMatches - match.candidates.length} more — try adding more detail to narrow it down)`
        : "";
      const text = `I found requirements that might match${moreNote}:`;
      const content = JSON.stringify({ type: "disambiguation", text, candidates: match.candidates });
      await db.insert(messages).values({ conversationId: convo.id, role: "assistant", content });
      res.json({ status: "ambiguous", conversationId: convo.id, reply: text, candidates: match.candidates });
      return;
    }

    // resolved on the first try
    await db.update(conversations)
      .set({ entityType: "requirement", entityId: match.requirement.id })
      .where(eq(conversations.id, convo.id));
    const grounding = await buildRequirementGroundingBlock(match.requirement.id);
    if (!grounding) { res.status(404).json({ error: "Requirement not found" }); return; }
    const { reply } = await answerFromGrounding(grounding.block, message.trim(), []);
    await db.insert(messages).values({ conversationId: convo.id, role: "assistant", content: reply });
    res.json({
      status: "answered",
      conversationId: convo.id,
      reply,
      matchedRequirement: { id: match.requirement.id, title: match.requirement.title, projectName: match.requirement.projectName },
    });
  } catch (error: any) {
    console.error("Requirement Chat Error:", error);
    res.status(500).json({ error: error.message || "An error occurred while communicating with the AI." });
  }
});

router.get("/ai/requirement-chat/conversations", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const convos = await db.select().from(conversations)
    .where(eq(conversations.userId, ctx.userId))
    .orderBy(desc(conversations.createdAt));

  const reqIds = convos.map((c) => c.entityId).filter((id): id is number => id != null);
  const reqRows = reqIds.length
    ? await db.select({ id: requirementsTable.id, title: requirementsTable.title, projectId: requirementsTable.projectId })
        .from(requirementsTable).where(inArray(requirementsTable.id, reqIds))
    : [];
  const projectIds = reqRows.map((r) => r.projectId).filter((id): id is number => id != null);
  const projRows = projectIds.length
    ? await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable).where(inArray(projectsTable.id, projectIds))
    : [];
  const projNameById = new Map(projRows.map((p) => [p.id, p.name]));
  const reqById = new Map(reqRows.map((r) => [r.id, r]));

  const result = await Promise.all(convos.map(async (c) => {
    const [lastMsg] = await db.select({ content: messages.content })
      .from(messages).where(eq(messages.conversationId, c.id))
      .orderBy(desc(messages.createdAt)).limit(1);
    const reqRow = c.entityId != null ? reqById.get(c.entityId) : undefined;
    let snippet: string | null = null;
    if (lastMsg?.content) {
      try {
        const parsed = JSON.parse(lastMsg.content);
        snippet = parsed?.type === "disambiguation" ? parsed.text : lastMsg.content.slice(0, 120);
      } catch {
        snippet = lastMsg.content.slice(0, 120);
      }
    }
    return {
      id: c.id,
      title: c.title,
      resolvedRequirement: reqRow
        ? { id: reqRow.id, title: reqRow.title, projectName: reqRow.projectId != null ? projNameById.get(reqRow.projectId) ?? null : null }
        : null,
      lastMessageSnippet: snippet,
      createdAt: c.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

router.get("/ai/requirement-chat/conversations/:id/messages", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const convoId = Number(req.params.id);
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, convoId));
  if (!convo || convo.userId !== ctx.userId) { res.status(404).json({ error: "Conversation not found" }); return; }

  const rows = await db.select().from(messages).where(eq(messages.conversationId, convoId)).orderBy(messages.createdAt);
  res.json(rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })));
});

export default router;
