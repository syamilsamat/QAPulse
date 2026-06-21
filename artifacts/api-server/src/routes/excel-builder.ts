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

export interface ExcelBuildOptions {
  // Doc Info + sheet rename
  redmineId?: string;
  issueType?: string;
  issueSubject?: string;
  // CR002: auto-populate Review Log, Review & Rework Effort, Pareto Analysis, CAPA
  senderName?: string;
  activeDefects?: DefectForExcel[];
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

  const { redmineId, issueType, issueSubject, senderName, activeDefects = [] } = options;
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
  const capaData = buildCapaRows(testCases, activeDefects).map((r) => [r.sl, r.analysisPoint, "", "", r.plannedDate, ""]);
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
    const { redmineId, issueType, issueSubject, senderName, activeDefects = [] } = options;
    const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    // ── Doc Info ───────────────────────────────────────────────────────────────
    if (redmineId) {
      const docSheet = wb.sheet("Doc Info");
      if (docSheet) {
        docSheet.cell("D5").value(`${issueType ?? "Issue"} #${redmineId}${issueSubject ? ` : ${issueSubject}` : ""}`);
        docSheet.cell("G4").value(`Ref. No.: QA-${redmineId}`);
        docSheet.cell("B9").value(1);
        docSheet.cell("C9").value(today);
        docSheet.cell("D9").value(senderName ?? "QA Pulse");
        docSheet.cell("E9").value("Generated test case report");
        docSheet.cell("G9").value(today);
      }
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

    // ── Review Log — skeleton first row ───────────────────────────────────────
    // Template headers (row 4): B=Sl# C=Review Cycle D=Version E=Posted Date
    //   F=Reviewer Name G=Size H=Document Name … (rest is manual)
    const rlSheet = wb.sheet("Review Log");
    if (rlSheet) {
      rlSheet.cell("B5").value(1);
      rlSheet.cell("C5").value("1st");
      rlSheet.cell("D5").value(1);
      rlSheet.cell("E5").value(today);
      if (senderName) rlSheet.cell("F5").value(senderName);
      rlSheet.cell("G5").value("Small");
      rlSheet.cell("H5").value(issueSubject || (redmineId ? `#${redmineId}` : ""));
    }

    // ── Review & Rework Effort — skeleton first row ────────────────────────────
    // Template headers (row 4): B=Sl# C=Review Cycle D=Document Name E=Review Time F=Rework Time G=Remarks
    const rrSheet = wb.sheet("Review & Rework Effort");
    if (rrSheet) {
      rrSheet.cell("B5").value(1);
      rrSheet.cell("C5").value("1st");
      rrSheet.cell("D5").value(issueSubject || (redmineId ? `#${redmineId}` : ""));
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
      if (activeDefects.length > 0) {
        const categories = buildParetoCategories(activeDefects).slice(0, 15);
        categories.forEach(({ name, count }, i) => {
          paSheet.cell(`C${33 + i}`).value(name);
          paSheet.cell(`D${33 + i}`).value(count);
        });
      }
    }

    // ── CAPA ───────────────────────────────────────────────────────────────────
    // Template headers (row 3): B=Sl# C=Analysis Points D=Corrective E=Preventive
    //   F=Planned Closure Date G=Actual Closure Date
    // Data starts at row 4. Pre-fill B, C, F — leave D, E, G for manual input.
    const capaSheet = wb.sheet("CAPA");
    if (capaSheet) {
      const capaRows = buildCapaRows(testCases, activeDefects);
      capaRows.forEach(({ sl, analysisPoint, plannedDate }, i) => {
        const row = 4 + i;
        capaSheet.cell(`B${row}`).value(sl);
        capaSheet.cell(`C${row}`).value(analysisPoint);
        if (plannedDate) capaSheet.cell(`F${row}`).value(plannedDate);
      });
    }

    const out = await wb.outputAsync();
    return Buffer.isBuffer(out) ? out : Buffer.from(out);
  } catch (err) {
    console.error("[buildTestCaseExcel] error:", err);
    return null;
  }
}
