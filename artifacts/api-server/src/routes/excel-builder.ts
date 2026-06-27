import { readFileSync } from "fs";
import { join } from "path";
import { TEST_CASE_TEMPLATE_B64 } from "./test-case-template-data";
async function fetchQaDefectsForCapa(parentId: string): Promise<Array<{ id: number; subject: string; status: string; dueDate: string | null; closedOn: string | null }>> {
  const baseUrl = (process.env.REDMINE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.REDMINE_API_KEY ?? "";
  if (!baseUrl || !apiKey) return [];
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`${baseUrl}/issues.json?parent_id=${parentId}&status_id=*&limit=100`, {
      headers: { "X-Redmine-API-Key": apiKey, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const data: any = await r.json();
    const issues: any[] = data?.issues ?? [];
    return issues
      .filter(i => (i.tracker?.name ?? "").toLowerCase().includes("qa defect"))
      .map(i => ({
        id: i.id,
        subject: i.subject ?? "",
        status: i.status?.name ?? "",
        dueDate: i.due_date ?? null,
        closedOn: i.closed_on ?? null,
      }));
  } catch {
    return [];
  }
}

export async function runCapaAI(ticketId: string, testCases: any[], prefetchedDefects?: Array<{ id: number; subject: string; status: string; dueDate: string | null; closedOn: string | null }>): Promise<CapaAiItem[]> {
  try {
    const failures = testCases.filter(tc => ["failed", "blocked"].includes((tc.result ?? "").toLowerCase()));
    const qaDefects = prefetchedDefects && prefetchedDefects.length > 0
      ? prefetchedDefects
      : await fetchQaDefectsForCapa(ticketId);
    console.log(`[runCapaAI] ticket=${ticketId} total=${testCases.length} failures=${failures.length} qaDefects=${qaDefects.length} (source: ${prefetchedDefects?.length ? "prefetched" : "api"})`);
    if (failures.length === 0 && qaDefects.length === 0) return [];

    // Cap at 10 failures; shorten each entry
    const capped = failures.slice(0, 10);
    const tcList = capped.length > 0
      ? `Failed/Blocked TCs:\n` + capped.map(tc =>
          `[${tc.testCaseId ?? "?"}] ${(tc.caseName ?? "Unnamed").slice(0, 80)} | ${tc.moduleName ?? "?"} | ${tc.result}`
        ).join("\n")
      : "";

    const defectList = qaDefects.length > 0
      ? `\nQA Defects (all statuses):\n` + qaDefects.map(d =>
          `[#${d.id}] ${d.subject.slice(0, 80)} | Status: ${d.status} | Due: ${d.dueDate ?? "none"} | Closed: ${d.closedOn ?? "open"}`
        ).join("\n")
      : "";

    const systemPrompt = `You are a QA engineer writing a CAPA report. Analyse the failed test cases and QA defects provided.
Group related issues into max 5 CAPA items. For each item provide: analysisPoint (what area failed), rootCause, correctiveAction, preventiveAction, plannedDate (ISO date from defect due_date if available), actualClosureDate (ISO date from defect closed_on if available).
Return ONLY valid JSON: { "items": [{ "sl": 1, "analysisPoint": "...", "rootCause": "...", "correctiveAction": "...", "preventiveAction": "...", "plannedDate": "YYYY-MM-DD or null", "actualClosureDate": "YYYY-MM-DD or null" }] }
Keep each text field under 20 words.`;
    const userPrompt = `Ticket: #${ticketId}\n${tcList}${defectList}`;

    let content = "";
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({});
      const resp = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      content = resp.text ?? "";
      console.log(`[runCapaAI] Gemini response length=${content.length}`);
    } catch (geminiErr) {
      console.warn("[runCapaAI] Gemini failed, trying OpenRouter:", geminiErr);
      const key = process.env.OPENROUTER_API_KEY;
      if (key) {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "meta-llama/llama-3.2-3b-instruct:free", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], max_tokens: 2048, response_format: { type: "json_object" } }),
        });
        const d = await resp.json();
        content = d.choices?.[0]?.message?.content ?? "";
        console.log(`[runCapaAI] OpenRouter response length=${content.length}`);
      }
    }

    const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    console.log(`[runCapaAI] parsed items=${parsed?.items?.length ?? 0}`);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (err) {
    console.error("[runCapaAI] error:", err);
    return [];
  }
}

const PARETO_CATEGORIES = [
  "UI / UX",
  "Business Logic",
  "Data Validation",
  "Integration / API",
  "Performance",
  "Security",
  "Missing Functionality",
  "Configuration / Environment",
  "Others",
];

export async function runParetoAI(parentId: string, prefetchedDefects?: Array<{ id: number; subject: string }>): Promise<Array<{ name: string; count: number }>> {
  try {
    const defects = prefetchedDefects && prefetchedDefects.length > 0
      ? prefetchedDefects
      : await fetchQaDefectsForCapa(parentId);
    if (defects.length === 0) return [];

    const systemPrompt = `You are a QA analyst. Classify each defect subject into exactly one of these categories: ${PARETO_CATEGORIES.join(", ")}.
Return ONLY valid JSON: { "classifications": [{ "id": <number>, "category": "<category>" }] }`;
    const userPrompt = `Defects:\n` + defects.map(d => `[${d.id}] ${d.subject}`).join("\n");

    let content = "";
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genai = new GoogleGenAI({});
      const resp = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      content = resp.text ?? "";
      console.log(`[runParetoAI] Gemini response length=${content.length}`);
    } catch (geminiErr) {
      console.warn("[runParetoAI] Gemini failed, trying OpenRouter:", geminiErr);
      const key = process.env.OPENROUTER_API_KEY;
      if (key) {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "meta-llama/llama-3.2-3b-instruct:free",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            max_tokens: 2048,
            response_format: { type: "json_object" },
          }),
        });
        const d = await resp.json();
        content = d.choices?.[0]?.message?.content ?? "";
        console.log(`[runParetoAI] OpenRouter response length=${content.length}`);
      }
    }

    if (!content) return [];
    const cleaned = content.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const classifications: Array<{ id: number; category: string }> = parsed?.classifications ?? [];

    const map = new Map<string, number>();
    for (const c of classifications) {
      const cat = PARETO_CATEGORIES.includes(c.category) ? c.category : "Others";
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  } catch (err) {
    console.error("[runParetoAI] error:", err);
    return [];
  }
}

let XlsxPopulate: any = null;
try {
  XlsxPopulate = require("xlsx-populate");
} catch {}

let XlsxSheetJS: any = null;
try {
  XlsxSheetJS = require("xlsx");
} catch {}

// ── Template loading ──────────────────────────────────────────────────────────
function loadTemplate(): Buffer {
  const candidates = [
    join(process.cwd(), "artifacts/api-server/assets/test-case-template.xlsx"),
    join(process.cwd(), "assets/test-case-template.xlsx"),
  ];
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      console.log("[excel-builder] template loaded from file:", p);
      return buf;
    } catch {}
  }
  console.log("[excel-builder] template loaded from embedded base64 (fallback)");
  return Buffer.from(TEST_CASE_TEMPLATE_B64, "base64");
}

const TEMPLATE_BUFFER = loadTemplate();

// ── Tracker code mapping ──────────────────────────────────────────────────────
export function trackerCode(issueType: string): string {
  const t = (issueType ?? "").toLowerCase();
  if (t.includes("change request")) return "CR";
  if (t.includes("user story"))     return "US";
  if (t.includes("prod"))           return "PD";
  if (t.includes("qa defect"))      return "QD";
  if (t.includes("defect") || t.includes("bug")) return "QD";
  return issueType.replace(/\s+/g, "").slice(0, 4).toUpperCase() || "TC";
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TestCaseRow {
  caseId?: string;
  userStory?: string;
  tracker?: string;
  scenario?: string;
  preCondition?: string;
  caseName?: string;
  testSteps?: string;
  testData?: string;
  expectedResult?: string;
  result?: string;
  defectNumber?: string;
  comments?: string;
  qaPic?: string;
}

export interface DefectForExcel {
  id: number;
  subject: string;
  status: string;
  category?: string;
  assignee?: string;
  dueDate?: string | null;
}

export interface AuditEntry {
  summary: string;
  updatedByName?: string | null;
  createdAt: string; // ISO date string
  tcCount?: number;
}

export interface CapaAiItem {
  sl: number;
  analysisPoint: string;
  rootCause?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  plannedDate?: string;
  actualClosureDate?: string;
}

export interface ExcelBuildOptions {
  // Doc Info + sheet rename
  redmineId?: string;
  issueType?: string;
  issueSubject?: string;
  // CR002: auto-populate Review Log, Review & Rework Effort, Pareto Analysis, CAPA
  senderName?: string;
  activeDefects?: DefectForExcel[];
  // CR003: audit trail for Doc Info change history rows
  auditEntries?: AuditEntry[];
  // CR006: AI-generated CAPA items
  capaItems?: CapaAiItem[];
  // All QA defects (all statuses) for Pareto AI — passed from send-verdict to avoid a second Redmine API call
  allDefects?: DefectForExcel[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtShortDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function buildParetoCategories(defects: DefectForExcel[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const d of defects) {
    const key = d.category?.trim() || d.status || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

function buildCapaRows(
  testCases: TestCaseRow[],
  defects: DefectForExcel[],
): Array<{ sl: number; analysisPoint: string; plannedDate: string }> {
  const failedWithDefects = testCases.filter(
    (tc) => (tc.result ?? "").toLowerCase() === "failed" && (tc.defectNumber ?? "").trim(),
  );

  if (failedWithDefects.length > 0) {
    return failedWithDefects.map((tc, i) => {
      const ids = (tc.defectNumber ?? "").split(",").map((s) => s.trim());
      const matched = defects.find((d) => ids.includes(String(d.id)));
      return { sl: i + 1, analysisPoint: tc.caseName || tc.defectNumber || "", plannedDate: fmtShortDate(matched?.dueDate) };
    });
  }

  // Fallback: use active defects directly
  return defects.map((d, i) => ({
    sl: i + 1,
    analysisPoint: d.subject,
    plannedDate: fmtShortDate(d.dueDate),
  }));
}

// ── SheetJS fallback ──────────────────────────────────────────────────────────
function buildTestCaseExcelFallback(
  testCases: TestCaseRow[],
  options: ExcelBuildOptions = {},
): Buffer | null {
  if (!XlsxSheetJS) return null;

  const { redmineId, issueType, issueSubject, senderName, activeDefects = [], capaItems } = options;
  const wb = XlsxSheetJS.utils.book_new();
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Doc Info
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([
    ["Project:", `${issueType ?? "Issue"} #${redmineId}${issueSubject ? ` : ${issueSubject}` : ""}`],
    ["Ref No:", `QA-${redmineId}`],
    ["Date:", today],
  ]), "Doc Info");

  // Test cases sheet
  const tcHeaders = ["Case ID", "User Story", "Tracker", "Scenario", "Pre-Condition", "Case Name", "Test Steps", "Test Data", "Expected Result", "Result", "Defect No.", "Comments", "QA PIC"];
  const tcRows = testCases.map((tc) => [
    tc.caseId ?? "", tc.userStory ?? "", tc.tracker ?? "", tc.scenario ?? "",
    tc.preCondition ?? "", tc.caseName ?? "", tc.testSteps ?? "", tc.testData ?? "",
    tc.expectedResult ?? "", tc.result ?? "", tc.defectNumber ?? "", tc.comments ?? "", tc.qaPic ?? "",
  ]);
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([tcHeaders, ...tcRows]), redmineId ? `#${redmineId}` : "Test Step");

  // Review Log — skeleton row
  const rlHeaders = ["Sl #", "Review Cycle", "Version No.", "Posted Date", "Reviewer Name", "Size of Work", "Document Name", "Section ID", "Comment", "Severity", "Action Required", "Comment Status", "Target Closure", "Actual Closure", "Remarks"];
  const rlRow = [1, "1st", 1, today, senderName ?? "", "Small", issueSubject || (redmineId ? `#${redmineId}` : ""), "", "", "", "", "", "", "", ""];
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([rlHeaders, rlRow]), "Review Log");

  // Review & Rework Effort — skeleton row
  const rrHeaders = ["Sl #", "Review Cycle", "Document Name", "Total Review Time (Hrs)", "Re-Work Effort (Hrs)", "Remarks"];
  const rrRow = [1, "1st", issueSubject || (redmineId ? `#${redmineId}` : ""), "", "", ""];
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([rrHeaders, rrRow]), "Review & Rework Effort");

  // Pareto Analysis — data-driven table (no formulas in fallback)
  const paretoCategories = buildParetoCategories(activeDefects);
  const paHeaders = ["#", "Causes", "Defects", "Cumulative %"];
  let cumulative = 0;
  const total = paretoCategories.reduce((s, r) => s + r.count, 0);
  const paRows = paretoCategories.map((r, i) => {
    cumulative += r.count;
    return [i + 1, r.name, r.count, total > 0 ? `${Math.round((cumulative / total) * 10000) / 100}%` : "0%"];
  });
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([paHeaders, ...paRows]), "Pareto Analysis");

  // CAPA
  const capaHeaders = ["Sl #", "Analysis Points Observed", "Corrective Action Identified", "Preventive Action Identified", "Planned Closure Date", "Actual Closure Date"];
  const baseCapaRows = buildCapaRows(testCases, activeDefects);
  const capaData = capaItems && capaItems.length > 0
    ? capaItems.map((ai, i) => [ai.sl ?? i + 1, ai.analysisPoint ?? "", ai.correctiveAction ?? "", ai.preventiveAction ?? "", ai.plannedDate ?? "", ai.actualClosureDate ?? ""])
    : baseCapaRows.map(r => [r.sl, r.analysisPoint, "", "", r.plannedDate, ""]);
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([capaHeaders, ...capaData]), "CAPA");

  return XlsxSheetJS.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ── Main builder (xlsx-populate with template) ────────────────────────────────
/**
 * CR002: auto-populates all 6 sheets from the test-case-template.xlsx:
 *   Doc Info         — project label, ref no, date (existing)
 *   #<redmineId>     — test case rows (existing)
 *   Review Log       — skeleton row: Sl#, cycle, version, date, reviewer, doc name
 *   Review & Rework  — skeleton row: Sl#, cycle, doc name
 *   Pareto Analysis  — writes C33:C47 (causes) + D33:D47 (counts); formulas handle the rest
 *   CAPA             — one row per failed TC with defect; pre-fills analysis point + planned date
 *
 * Falls back to SheetJS if xlsx-populate is unavailable.
 */
export async function buildTestCaseExcel(
  testCases: TestCaseRow[],
  options: ExcelBuildOptions = {},
): Promise<Buffer | null> {
  if (!XlsxPopulate) {
    console.warn("[buildTestCaseExcel] xlsx-populate not available, using SheetJS fallback");
    return buildTestCaseExcelFallback(testCases, options);
  }

  try {
    const wb = await XlsxPopulate.fromDataAsync(TEMPLATE_BUFFER);
    const { redmineId, issueType, issueSubject, senderName, activeDefects = [], auditEntries, capaItems, allDefects } = options;
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    // ── Doc Info ───────────────────────────────────────────────────────────────
    // Rows 9+ are the audit history (Sl#, Date, Updated By, Summary, Reviewed By, Reviewed Date).
    // If auditEntries provided, fill them oldest-first. Otherwise write a single placeholder row.
    const docSheet = wb.sheet("Doc Info");
    if (docSheet) {
      if (redmineId) {
        docSheet.cell("D5").value(`${issueType ?? "Issue"} #${redmineId}${issueSubject ? ` : ${issueSubject}` : ""}`);
        docSheet.cell("G4").value(`Ref. No.: QA-${redmineId}`);
      }
      const entries: AuditEntry[] = auditEntries && auditEntries.length > 0
        ? auditEntries
        : [{ summary: "Generated test case report", updatedByName: senderName ?? null, createdAt: new Date().toISOString() }];
      entries.forEach(({ summary, updatedByName, createdAt }, i) => {
        const row = 9 + i;
        docSheet.cell(`B${row}`).value(i + 1);
        docSheet.cell(`C${row}`).value(fmtShortDate(createdAt));
        docSheet.cell(`D${row}`).value(updatedByName ?? "");
        docSheet.cell(`E${row}`).value(summary);
        // F = Reviewed by, G = Reviewed date — left blank for manual fill
      });
    }

    // ── Test Step sheet ────────────────────────────────────────────────────────
    const testSheetName = redmineId ? `#${redmineId}` : "Test Step";
    const tsSheet = wb.sheet("Test Step");
    if (tsSheet && redmineId) tsSheet.name(testSheetName);

    const tcSheet = wb.sheet(testSheetName);
    if (tcSheet && testCases.length > 0) {
      testCases.forEach((tc, i) => {
        const row = i + 2;
        if (tc.caseId)         tcSheet.cell(`A${row}`).value(String(tc.caseId));
        if (tc.userStory)      tcSheet.cell(`B${row}`).value(String(tc.userStory));
        if (tc.tracker)        tcSheet.cell(`C${row}`).value(String(tc.tracker));
        if (tc.scenario)       tcSheet.cell(`D${row}`).value(String(tc.scenario));
        if (tc.preCondition)   tcSheet.cell(`E${row}`).value(String(tc.preCondition));
        if (tc.caseName)       tcSheet.cell(`F${row}`).value(String(tc.caseName));
        if (tc.testSteps)      tcSheet.cell(`G${row}`).value(String(tc.testSteps));
        if (tc.testData)       tcSheet.cell(`H${row}`).value(String(tc.testData));
        if (tc.expectedResult) tcSheet.cell(`I${row}`).value(String(tc.expectedResult));
        if (tc.result)         tcSheet.cell(`J${row}`).value(String(tc.result));
        if (tc.defectNumber)   tcSheet.cell(`K${row}`).value(String(tc.defectNumber));
        if (tc.comments)       tcSheet.cell(`L${row}`).value(String(tc.comments));
        if (tc.qaPic)          tcSheet.cell(`M${row}`).value(String(tc.qaPic));
      });
    }

    // ── Review Log — one row per audit entry (same list as Doc Info) ──────────
    // Template headers (row 4): B=Sl# C=Review Cycle D=Version No. E=Posted Date
    //   F=Reviewer Name G=Size of Work H=Document Name … (rest is manual)
    const rlSheet = wb.sheet("Review Log");
    if (rlSheet) {
      const rlEntries: AuditEntry[] = auditEntries && auditEntries.length > 0
        ? auditEntries
        : [{ summary: "Generated test case report", updatedByName: senderName ?? null, createdAt: new Date().toISOString(), tcCount: 0 }];
      const docName = issueSubject || (redmineId ? `#${redmineId}` : "");
      rlEntries.forEach(({ updatedByName, createdAt, tcCount = 0 }, i) => {
        const row = 5 + i;
        rlSheet.cell(`B${row}`).value(i + 1);
        rlSheet.cell(`C${row}`).value(ordinal(i + 1));
        rlSheet.cell(`D${row}`).value(i + 1);
        rlSheet.cell(`E${row}`).value(fmtShortDate(createdAt));
        rlSheet.cell(`F${row}`).value(updatedByName ?? "");
        rlSheet.cell(`G${row}`).value(tcCount > 0 ? tcCount : "—");
        rlSheet.cell(`H${row}`).value(docName);
      });
    }

    // ── Review & Rework Effort — one row per audit entry ──────────────────────
    // Template headers (row 4): B=Sl# C=Review Cycle D=Document Name E=Review Time F=Rework Time G=Remarks
    // E, F, G left blank — QA Pulse does not track time
    const rrSheet = wb.sheet("Review & Rework Effort");
    if (rrSheet) {
      const rrEntries: AuditEntry[] = auditEntries && auditEntries.length > 0
        ? auditEntries
        : [{ summary: "Generated test case report", updatedByName: senderName ?? null, createdAt: new Date().toISOString(), tcCount: 0 }];
      const docName = issueSubject || (redmineId ? `#${redmineId}` : "");
      rrEntries.forEach((_entry, i) => {
        const row = 5 + i;
        rrSheet.cell(`B${row}`).value(i + 1);
        rrSheet.cell(`C${row}`).value(ordinal(i + 1));
        rrSheet.cell(`D${row}`).value(docName);
      });
    }

    // ── Pareto Analysis ────────────────────────────────────────────────────────
    // Template data range: C33:C47 = cause names, D33:D47 = counts (max 15 rows).
    // All cumulative %, vital few/many, and summary text use pre-built formulas —
    // we only write C and D; everything else auto-calculates.
    // Always clear the 15 sample rows so "Glue/Binding/Button" placeholder data
    // never appears in generated files, regardless of whether defects exist.
    const paSheet = wb.sheet("Pareto Analysis");
    if (paSheet) {
      for (let i = 0; i < 15; i++) {
        paSheet.cell(`C${33 + i}`).value("");
        paSheet.cell(`D${33 + i}`).value(null);
      }
      // AI categorisation: use pre-fetched allDefects (all statuses) passed from send-verdict,
      // or fall back to a fresh Redmine fetch via runParetoAI.
      let paretoCategories: Array<{ name: string; count: number }> = [];
      if (redmineId) {
        paretoCategories = await runParetoAI(redmineId, allDefects);
        console.log(`[buildTestCaseExcel] Pareto AI categories=${paretoCategories.length} (source: ${allDefects?.length ? "prefetched" : "api"})`);
      }
      // Fallback to Redmine category/status grouping if AI returned nothing
      if (paretoCategories.length === 0 && activeDefects.length > 0) {
        paretoCategories = buildParetoCategories(activeDefects);
        console.log(`[buildTestCaseExcel] Pareto fallback categories=${paretoCategories.length}`);
      }
      paretoCategories.slice(0, 15).forEach(({ name, count }, i) => {
        paSheet.cell(`C${33 + i}`).value(name);
        paSheet.cell(`D${33 + i}`).value(count);
      });
    }

    // ── CAPA ───────────────────────────────────────────────────────────────────
    // Template headers (row 3): B=Sl# C=Analysis Points D=Corrective E=Preventive
    //   F=Planned Closure Date G=Actual Closure Date
    // Data starts at row 4. Pre-fill B, C, F — leave D, E, G for manual input.
    const capaSheet = wb.sheet("CAPA");
    if (capaSheet) {
      const capaRows = buildCapaRows(testCases, activeDefects);
      console.log(`[excel-builder] CAPA rows=${capaRows.length} capaItems=${capaItems?.length ?? 0}`);
      if (capaItems && capaItems.length > 0) {
        // AI mode: use AI items directly — each item is one CAPA row
        capaItems.forEach((ai, i) => {
          const row = 4 + i;
          capaSheet.cell(`B${row}`).value(ai.sl ?? i + 1);
          capaSheet.cell(`C${row}`).value(ai.analysisPoint ?? "");
          if (ai.correctiveAction) capaSheet.cell(`D${row}`).value(ai.correctiveAction);
          if (ai.preventiveAction) capaSheet.cell(`E${row}`).value(ai.preventiveAction);
          if (ai.plannedDate) capaSheet.cell(`F${row}`).value(ai.plannedDate);
          if (ai.actualClosureDate) capaSheet.cell(`G${row}`).value(ai.actualClosureDate);
        });
      } else {
        // Fallback: existing logic without AI
        capaRows.forEach(({ sl, analysisPoint, plannedDate }, i) => {
          const row = 4 + i;
          capaSheet.cell(`B${row}`).value(sl);
          capaSheet.cell(`C${row}`).value(analysisPoint);
          if (plannedDate) capaSheet.cell(`F${row}`).value(plannedDate);
        });
      }
    }

    const out = await wb.outputAsync();
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } catch (err) {
    console.error("[buildTestCaseExcel] error:", err);
    return null;
  }
}
