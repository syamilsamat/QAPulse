import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  requirementsTable,
  testCasesTable,
  tasksTable,
  usersTable,
  activityTable,
} from "@workspace/db";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();
const ai = new GoogleGenAI({});

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
    res.json(safeParseJSON(content, fallback));
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
      completed: tasks.filter((t) => t.status === "released_to_production").length,
      blocked: tasks.filter((t) => t.status === "blocked").length,
      inProgress: tasks.filter((t) => t.status === "sit").length,
      newThisWeek: recentTasks.filter((t) => t.status === "uat").length,
      completedThisWeek: recentTasks.filter((t) => t.status === "released_to_production").length,
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
      stats: {},
      completionRate: 0,
      coverageRate: 0,
    };

    const systemPrompt = `You are a QA release manager. Assess release readiness objectively.
       Return exactly this JSON structure:
       { "readinessScore": 0-100, "status": "ready"|"caution"|"not_ready", "verdict": "string", "positives": ["string"], "blockers": ["string"], "recommendations": ["string"] }`;

    if (redmineData) {
      completionRate = redmineData.testExecution?.successRate || 0;
      coverageRate = 100; // Assuming 100% since we are viewing an active defect report

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

      // Extract the full defect history
      const openDefects = redmineData.activeDefects?.length || 0;
      const totalDefects = redmineData.defects?.total || 0;
      const resolvedDefects = totalDefects - openDefects;

      userPrompt = `Release Readiness Data (Redmine):\n- Test pass rate: ${redmineData.testExecution?.passRate}%\n- Test success rate (Pass + In Prog): ${completionRate}%\n- Blocked test cases: ${stats.blocked}\n- Failed test cases: ${redmineData.testExecution?.failed || 0}\n- Total defects found: ${totalDefects}\n- Resolved/Verified defects: ${resolvedDefects}\n- Active/Open defects: ${openDefects}\n- Total test cases: ${stats.totalTestCases}\n\nAssess release readiness and return ONLY JSON. Important: If 'Resolved/Verified defects' is high, treat this as a strong positive signal of system stabilization. If 'Active/Open defects' is 0, this increases readiness significantly, provided the test execution rate is acceptable.`;
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

      userPrompt = `Release Readiness Data:\n- Task completion rate: ${completionRate}%\n- Blocked tasks: ${stats.blocked}\n- Overdue tasks: ${stats.overdue}\n- Open requirements: ${stats.openReqs}\n- Test coverage rate: ${coverageRate}%\n- Total test cases: ${stats.totalTestCases}\n- Automation candidates: ${stats.automationCandidates}\n\nAssess release readiness and return ONLY JSON.`;
    }

    const content = await executeAiTask(systemPrompt, userPrompt);
    const parsedData = safeParseJSON(content, fallback);
    res.json({ ...parsedData, stats, completionRate, coverageRate });
  } catch (error) {
    console.error("Release Readiness Error:", error);
    res.json({
      readinessScore: 0,
      status: "not_ready",
      verdict: "System error occurred.",
      positives: [],
      blockers: [],
      recommendations: [],
      stats: {},
      completionRate: 0,
      coverageRate: 0,
    });
  }
});

// ==========================================
// 8. AI CHAT COPILOT
// ==========================================
router.post("/ai/chat", async (req, res): Promise<void> => {
  try {
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
- Tasks: ${allTasks.length} total, ${allTasks.filter((t) => t.status === "blocked").length} blocked, ${allTasks.filter((t) => t.status === "released_to_production").length} done
- Requirements: ${allReqs.length} total, ${allReqs.filter((r) => r.status !== "done").length} open
- Test Cases: ${allTCs.length} total, ${allTCs.filter((tc) => tc.aiAssisted).length} AI-assisted

You help QA teams with: regression planning, test case generation, defect analysis, coverage gaps, reporting, and QA best practices.
Be concise, practical, and data-driven.`;

    const contents = [
      ...conversationHistory.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    let replyText = "";
    try {
      console.log("ℹ️ Fetching Copilot response via primary channel...");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction: context, maxOutputTokens: 2000 },
      });
      replyText = response.text ?? "";
    } catch (chatError: any) {
      const isQuotaExceeded =
        chatError.status === 429 ||
        chatError.message?.includes("quota") ||
        chatError.message?.includes("Quota");
      const isServiceUnavailable =
        chatError.status === 503 ||
        chatError.status === 500 ||
        chatError.message?.includes("temporary") ||
        chatError.message?.includes("high demand") ||
        chatError.message?.includes("UNAVAILABLE") ||
        chatError.message?.includes("INTERNAL");

      if (isQuotaExceeded || isServiceUnavailable) {
        console.warn(
          "⚠️ Chat Copilot Gemini connection failed. Pivoting to OpenRouter cascade network...",
        );
        const userPrompt = `History:\n${conversationHistory.map((m: any) => `${m.role}: ${m.content}`).join("\n")}\n\nUser: ${message}`;
        const messages = [
          { role: "system", content: context },
          { role: "user", content: userPrompt },
        ];

        // Let the cascade handle the failure! (false = doesn't require JSON output)
        replyText = await runOpenRouterCascade(messages, false);
      } else {
        throw chatError;
      }
    }

    res.json({ reply: replyText });
  } catch (error) {
    console.error("AI Chat Error:", error);
    res.status(500).json({
      reply:
        "I'm having trouble connecting right now. Please try again in a moment.",
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

export default router;
