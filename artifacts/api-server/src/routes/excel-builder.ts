import { readFileSync } from "fs";
import { join } from "path";
import { TEST_CASE_TEMPLATE_B64 } from "./test-case-template-data";

let XlsxPopulate: any = null;
try {
  XlsxPopulate = require("xlsx-populate");
} catch {}

let XlsxSheetJS: any = null;
try {
  XlsxSheetJS = require("xlsx");
} catch {}

// ── Template loading ──────────────────────────────────────────────────────────
// Tries to read the .xlsx from assets/ at startup so a server restart is enough
// to pick up an updated template. Falls back to the embedded base64 if the file
// is not found (e.g. first deploy before the asset is present on disk).
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

// Loaded once at server startup — restart to pick up a new template file.
const TEMPLATE_BUFFER = loadTemplate();

// ── Tracker code mapping ──────────────────────────────────────────────────────
export function trackerCode(issueType: string): string {
  const t = (issueType ?? "").toLowerCase();
  if (t.includes("change request")) return "CR";
  if (t.includes("user story"))     return "US";
  if (t.includes("prod"))           return "PD";  // Production Defect
  if (t.includes("qa defect"))      return "QD";
  if (t.includes("defect") || t.includes("bug")) return "QD";
  // Fallback: first letters of each word, max 4 chars
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

export interface ExcelBuildOptions {
  // When provided, fills Doc Info and renames "Test Step" → "#<redmineId>"
  redmineId?: string;
  issueType?: string;
  issueSubject?: string;
}

// ── SheetJS fallback (used when xlsx-populate is unavailable) ─────────────────
function buildTestCaseExcelFallback(
  testCases: TestCaseRow[],
  options: ExcelBuildOptions = {},
): Buffer | null {
  if (!XlsxSheetJS) return null;

  const { redmineId, issueType, issueSubject } = options;
  const wb = XlsxSheetJS.utils.book_new();
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  // Doc Info
  const docRows = [
    ["Project:", `${issueType ?? "Issue"} #${redmineId}${issueSubject ? ` : ${issueSubject}` : ""}`],
    ["Ref No:", `QA-${redmineId}`],
    ["Date:", dateStr],
  ];
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet(docRows), "Doc Info");

  // Test cases
  const headers = ["Case ID", "User Story", "Tracker", "Scenario", "Pre-Condition", "Case Name", "Test Steps", "Test Data", "Expected Result", "Result", "Defect No.", "Comments", "QA PIC"];
  const rows = testCases.map((tc) => [
    tc.caseId ?? "", tc.userStory ?? "", tc.tracker ?? "", tc.scenario ?? "",
    tc.preCondition ?? "", tc.caseName ?? "", tc.testSteps ?? "", tc.testData ?? "",
    tc.expectedResult ?? "", tc.result ?? "", tc.defectNumber ?? "", tc.comments ?? "", tc.qaPic ?? "",
  ]);
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([headers, ...rows]), redmineId ? `#${redmineId}` : "Test Step");

  // Supporting sheets (empty but present for CAPA/Pareto work)
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([["No.", "Date", "Reviewed By", "Description", "Version"]]), "Review Log");
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([["Module", "Test Cases", "Passed", "Failed", "Blocked", "Not Executed", "Remarks"]]), "Review & Rework Effort");
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([["Defect Category", "Count", "Percentage", "Cumulative %"]]), "Pareto Analysis");
  XlsxSheetJS.utils.book_append_sheet(wb, XlsxSheetJS.utils.aoa_to_sheet([["No.", "Issue Description", "Root Cause", "Corrective Action", "Preventive Action", "Status", "Due Date", "PIC"]]), "CAPA");

  return XlsxSheetJS.write(wb, { type: "buffer", bookType: "xlsx" });
}

// ── Builder ───────────────────────────────────────────────────────────────────
/**
 * Fills the test-case-template.xlsx with the given rows.
 * When redmineId is supplied, also fills Doc Info and renames the Test Step sheet.
 * All template formatting (fonts, borders, colours, logo) is preserved.
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

    const { redmineId, issueType, issueSubject } = options;

    // ── Doc Info (only when redmineId is provided) ──────────────────────────
    if (redmineId) {
      const docSheet = wb.sheet("Doc Info");
      if (docSheet) {
        const projectLabel = `${issueType ?? "Issue"} #${redmineId}${issueSubject ? ` : ${issueSubject}` : ""}`;
        const dateStr = new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        docSheet.cell("D5").value(projectLabel);
        docSheet.cell("G4").value(`Ref. No.: QA-${redmineId}`);
        docSheet.cell("B9").value(1);
        docSheet.cell("C9").value(dateStr);
        docSheet.cell("D9").value("QA Pulse");
        docSheet.cell("E9").value("Generated test case report");
        docSheet.cell("G9").value(dateStr);
      }
    }

    // ── Rename "Test Step" → "#<redmineId>" when an ID is given ────────────
    const testSheetName = redmineId ? `#${redmineId}` : "Test Step";
    const tsSheet = wb.sheet("Test Step");
    if (tsSheet && redmineId) {
      tsSheet.name(testSheetName);
    }

    // ── Fill data rows (header is row 1, data starts at row 2) ─────────────
    const tcSheet = wb.sheet(testSheetName);
    if (tcSheet && testCases.length > 0) {
      testCases.forEach((tc, i) => {
        const row = i + 2;
        if (tc.caseId)          tcSheet.cell(`A${row}`).value(String(tc.caseId));
        if (tc.userStory)       tcSheet.cell(`B${row}`).value(String(tc.userStory));
        if (tc.tracker)         tcSheet.cell(`C${row}`).value(String(tc.tracker));
        if (tc.scenario)        tcSheet.cell(`D${row}`).value(String(tc.scenario));
        if (tc.preCondition)    tcSheet.cell(`E${row}`).value(String(tc.preCondition));
        if (tc.caseName)        tcSheet.cell(`F${row}`).value(String(tc.caseName));
        if (tc.testSteps)       tcSheet.cell(`G${row}`).value(String(tc.testSteps));
        if (tc.testData)        tcSheet.cell(`H${row}`).value(String(tc.testData));
        if (tc.expectedResult)  tcSheet.cell(`I${row}`).value(String(tc.expectedResult));
        if (tc.result)          tcSheet.cell(`J${row}`).value(String(tc.result));
        if (tc.defectNumber)    tcSheet.cell(`K${row}`).value(String(tc.defectNumber));
        if (tc.comments)        tcSheet.cell(`L${row}`).value(String(tc.comments));
        if (tc.qaPic)           tcSheet.cell(`M${row}`).value(String(tc.qaPic));
      });
    }

    const out = await wb.outputAsync();
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } catch (err) {
    console.error("[buildTestCaseExcel] error:", err);
    return null;
  }
}
