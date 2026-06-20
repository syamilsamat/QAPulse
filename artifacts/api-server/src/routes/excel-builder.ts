import { TEST_CASE_TEMPLATE_B64 } from "./test-case-template-data";

let XlsxPopulate: any = null;
try {
  XlsxPopulate = require("xlsx-populate");
} catch {}

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

/**
 * Fills the test-case-template.xlsx with the given rows.
 * When redmineId is supplied, also fills Doc Info and renames the Test Step sheet.
 * All template formatting (fonts, borders, colours, logo) is preserved.
 */
export async function buildTestCaseExcel(
  testCases: TestCaseRow[],
  options: ExcelBuildOptions = {},
): Promise<Buffer | null> {
  if (!XlsxPopulate) {
    console.error("[buildTestCaseExcel] xlsx-populate not available");
    return null;
  }

  try {
    const tplBuf = Buffer.from(TEST_CASE_TEMPLATE_B64, "base64");
    const wb = await XlsxPopulate.fromDataAsync(tplBuf);

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
