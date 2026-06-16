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

function safeParseJSON(content: string, fallback: any) {
  let cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("🔴 JSON Parse Error! Attempting salvage...");
    const lastClosingBrace = cleaned.lastIndexOf("}");
    if (lastClosingBrace !== -1) {
      try {
        const salvagedJSON = JSON.parse(cleaned.substring(0, lastClosingBrace + 1) + "]}");
        if (salvagedJSON) return salvagedJSON;
      } catch (e) {}
    }
    return fallback;
  }
}

async function runOpenRouterCascade(messages: any[], requireJson: boolean = true): Promise<string> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) throw new Error("Missing OPENROUTER_API_KEY environment variable.");

  const fallbackModels = [
    "meta-llama/llama-3.2-3b-instruct:free",
    "liquid/lfm-2.5-1.2b-instruct-20260120",
    "openai/gpt-oss-120b",
    "qwen/qwen3-coder",
    "google/gemma-4-31b-it",
  ];

  for (const model of fallbackModels) {
    try {
      const body: any = { model: model, messages: messages, max_tokens: 8192 };
      if (requireJson) body.response_format = { type: "json_object" };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices.length > 0 && data.choices[0].message?.content) {
          return data.choices[0].message.content;
        }
      }
    } catch (error) {}
  }
  throw new Error("All AI nodes exhausted.");
}

async function callFallbackAI(systemPrompt: string, userPrompt: string): Promise<string> {
  return await runOpenRouterCascade([{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], true);
}

async function executeAiTask(systemPrompt: string, userPrompt: string, maxTokens = 8192): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: { systemInstruction: systemPrompt, maxOutputTokens: maxTokens, responseMimeType: "application/json" },
    });
    return response.text ?? "";
  } catch (error: any) {
    return await callFallbackAI(systemPrompt, userPrompt);
  }
}

// ==========================================
// 11. NATURAL LANGUAGE SEARCH (Updated for Field Removal)
// ==========================================
router.post("/ai/natural-language-search", async (req, res): Promise<void> => {
  const fallback = { results: [], interpretation: "Failed to process search query." };

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" }) as any;

    const [tasks, testCases, requirements] = await Promise.all([
      db.select().from(tasksTable).limit(100),
      db.select().from(testCasesTable).limit(100),
      db.select().from(requirementsTable).limit(100),
    ]);

    const taskSummary = tasks.map((t) => `TASK|${t.id}|${t.name}|${t.status}`).join("\n");
    // Removed Priority and Type from indexing here
    const tcSummary = testCases.map((tc) => `TC|${tc.id}|${tc.title}`).join("\n");
    const reqSummary = requirements.map((r) => `REQ|${r.id}|${r.title}|${r.status}|${r.priority}`).join("\n");

    const systemPrompt = `You are a search engine for QA data. Parse the user's natural language query and return matching items.
       Return exactly this JSON structure:
       { "results": [{ "type": "task"|"test_case"|"requirement", "id": 123, "title": "string", "relevance": "high"|"medium"|"low", "reason": "string" }], "interpretation": "string" }`;
    const userPrompt = `User query: "${query}"\n\nAvailable data:\n${taskSummary || "No tasks"}\n\n${tcSummary || "No test cases"}\n\n${reqSummary || "No requirements"} \n\nMatch items relevant to the query. Return ONLY JSON.`;

    const content = await executeAiTask(systemPrompt, userPrompt);
    res.json(safeParseJSON(content, fallback));
  } catch (error) {
    res.json(fallback);
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

export default router;