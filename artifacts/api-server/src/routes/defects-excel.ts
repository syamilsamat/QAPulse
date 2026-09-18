/**
 * Defect Log export — the workbook behind the Defects page's "Export selected".
 *
 * Unlike the Risk Log and test-case exports there is no official PMO template
 * for defects, so this builds a workbook from blank rather than filling one in.
 * Everything a reader needs to trust the sheet is therefore written here: a
 * title block saying what was exported and by whom, a frozen and filtered
 * header row, real cell borders, banded rows, and colour on the two columns
 * people actually scan — Severity and Status.
 *
 * xlsx-populate does the styling; the SheetJS community build writes values
 * only, no fills or borders, so it is the fallback rather than the default. A
 * fallback export is plain, never wrong.
 */
let XlsxPopulate: any = null;
try { XlsxPopulate = require("xlsx-populate"); } catch {}

let XlsxSheetJS: any = null;
try { XlsxSheetJS = require("xlsx"); } catch {}

export interface DefectExportRow {
  defectCode: string | null;
  redmineId: string | null;
  title: string;
  severity: string | null;
  status: string | null;
  source: string | null;
  tracker: string | null;
  foundIn: string | null;
  module: string | null;
  projectName: string | null;
  milestoneName: string | null;
  defectCategory: string | null;
  assigneeName: string | null;
  reporterName: string | null;
  description: string | null;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  rootCause: string | null;
  resolutionSummary: string | null;
  linkedTestCases: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DefectExportOptions {
  /** Named in the title block, so a shared file explains its own scope. */
  exportedByName?: string | null;
  scopeLabel?: string | null;
}

// ── Palette ───────────────────────────────────────────────────────────────────
// Deliberately muted: this is a document to read, not a dashboard. The two
// coloured columns carry meaning; everything else stays greyscale. Colour is
// never the only signal — the same word is in the cell, so the sheet survives
// being printed in black and white or read by someone colour-blind.
const HEADER_FILL = "1F3864";
const HEADER_TEXT = "FFFFFF";
const TITLE_TEXT = "1F3864";
const BAND_FILL = "F2F5FA";
const GRID_COLOR = "BFBFBF";

const SEVERITY_STYLE: Record<string, { fill: string; font: string }> = {
  critical: { fill: "C00000", font: "FFFFFF" },
  high: { fill: "ED7D31", font: "FFFFFF" },
  medium: { fill: "FFD966", font: "3F3000" },
  low: { fill: "C6E0B4", font: "1E3A14" },
};

// Keyed on how a status reads, not on an enum: status text is cached from
// Redmine and every tracker words its workflow differently, so matching on
// meaning is the only thing that survives a tracker renaming its states.
function statusStyle(status: string | null): { fill: string; font: string } | null {
  const s = (status ?? "").toLowerCase();
  if (!s) return null;
  if (/closed|verified|done|complete/.test(s)) return { fill: "C6E0B4", font: "1E3A14" };
  if (/fixed|resolved|ready/.test(s)) return { fill: "BDD7EE", font: "14304A" };
  if (/reopen|reject/.test(s)) return { fill: "F8CBAD", font: "5A2200" };
  if (/progress|assigned|analy|test/.test(s)) return { fill: "FFE699", font: "3F3000" };
  if (/new|open/.test(s)) return { fill: "E7E6E6", font: "333333" };
  return null;
}

// ── Columns ───────────────────────────────────────────────────────────────────
// Headers read the way someone would say them out loud, not the way the
// database spells them. `wrap` marks the free-text columns that need room.
interface ColumnSpec {
  header: string;
  width: number;
  wrap?: boolean;
  value: (r: DefectExportRow) => string;
}

const titleCase = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

function raisedFrom(r: DefectExportRow): string {
  const s = (r.source ?? "").toLowerCase();
  if (s === "qa") return r.tracker || "QA Defect";
  if (s === "production") return r.tracker || "Production Defect";
  if (s === "requirement") return "Requirement Defect";
  if (s === "other") return r.tracker || "Other Tracker";
  return r.tracker || (s ? titleCase(s) : "");
}

function defectType(value: string | null): string {
  if (!value) return "";
  const words = value.split("_").map(titleCase).join(" ");
  return words === "Ui Ux" ? "UI / UX" : words;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const COLUMNS: ColumnSpec[] = [
  { header: "Defect ID", width: 13, value: (r) => r.defectCode ?? "" },
  { header: "Redmine Issue", width: 14, value: (r) => (r.redmineId ? `#${r.redmineId}` : "Not in Redmine") },
  { header: "Summary", width: 52, wrap: true, value: (r) => r.title ?? "" },
  { header: "Severity", width: 11, value: (r) => (r.severity ? titleCase(r.severity) : "") },
  { header: "Status", width: 16, value: (r) => r.status ?? "" },
  { header: "Raised From", width: 18, value: raisedFrom },
  { header: "Found In", width: 11, value: (r) => r.foundIn ?? "" },
  { header: "Defect Type", width: 18, value: (r) => defectType(r.defectCategory) },
  { header: "Project", width: 22, value: (r) => r.projectName ?? "" },
  { header: "Module", width: 20, value: (r) => r.module ?? "" },
  { header: "Milestone", width: 22, value: (r) => r.milestoneName ?? "" },
  { header: "Assigned To", width: 22, value: (r) => r.assigneeName ?? "Unassigned" },
  { header: "Raised By", width: 22, value: (r) => r.reporterName ?? "" },
  { header: "Linked Test Cases", width: 26, wrap: true, value: (r) => r.linkedTestCases ?? "" },
  { header: "Description", width: 48, wrap: true, value: (r) => r.description ?? "" },
  { header: "Steps to Reproduce", width: 48, wrap: true, value: (r) => r.stepsToReproduce ?? "" },
  { header: "Expected Result", width: 40, wrap: true, value: (r) => r.expectedResult ?? "" },
  { header: "Actual Result", width: 40, wrap: true, value: (r) => r.actualResult ?? "" },
  { header: "Root Cause", width: 36, wrap: true, value: (r) => r.rootCause ?? "" },
  { header: "Resolution Summary", width: 36, wrap: true, value: (r) => r.resolutionSummary ?? "" },
  { header: "Date Raised", width: 14, value: (r) => fmtDate(r.createdAt) },
  { header: "Last Updated", width: 14, value: (r) => fmtDate(r.updatedAt) },
];

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const HEADER_ROW = 4;
const FIRST_DATA_ROW = HEADER_ROW + 1;
const SEVERITY_COL = columnLetter(COLUMNS.findIndex((c) => c.header === "Severity"));
const STATUS_COL = columnLetter(COLUMNS.findIndex((c) => c.header === "Status"));

export async function buildDefectLogExcel(
  rows: DefectExportRow[],
  options: DefectExportOptions = {},
): Promise<Buffer | null> {
  if (!XlsxPopulate) return buildDefectLogExcelFallback(rows, options);
  try {
    const wb = await XlsxPopulate.fromBlankAsync();
    const sheet = wb.sheet(0).name("Defect Log");
    const lastCol = columnLetter(COLUMNS.length - 1);
    const lastRow = FIRST_DATA_ROW + Math.max(rows.length, 1) - 1;
    const thin = { style: "thin", color: GRID_COLOR };

    // ── Title block ──────────────────────────────────────────────────────────
    sheet.cell("A1").value("Defect Log");
    sheet.range(`A1:${lastCol}1`).merged(true).style({
      bold: true, fontSize: 16, fontColor: TITLE_TEXT, verticalAlignment: "center",
    });
    sheet.row(1).height(26);

    const exportedOn = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const subtitle = [
      options.scopeLabel || `${rows.length} defect${rows.length === 1 ? "" : "s"}`,
      `Exported ${exportedOn}`,
      options.exportedByName ? `by ${options.exportedByName}` : null,
    ].filter(Boolean).join("  ·  ");
    sheet.cell("A2").value(subtitle);
    sheet.range(`A2:${lastCol}2`).merged(true).style({ fontSize: 10, fontColor: "595959" });

    // ── Header row ───────────────────────────────────────────────────────────
    COLUMNS.forEach((col, i) => {
      sheet.cell(`${columnLetter(i)}${HEADER_ROW}`).value(col.header);
      sheet.column(columnLetter(i)).width(col.width);
    });
    sheet.range(`A${HEADER_ROW}:${lastCol}${HEADER_ROW}`).style({
      bold: true,
      fontColor: HEADER_TEXT,
      fill: HEADER_FILL,
      horizontalAlignment: "center",
      verticalAlignment: "center",
      wrapText: true,
      border: thin,
    });
    sheet.row(HEADER_ROW).height(30);

    // ── Data ─────────────────────────────────────────────────────────────────
    rows.forEach((row, rowIndex) => {
      const rowNo = FIRST_DATA_ROW + rowIndex;
      const banded = rowIndex % 2 === 1;
      COLUMNS.forEach((col, i) => {
        const cell = sheet.cell(`${columnLetter(i)}${rowNo}`);
        cell.value(col.value(row));
        cell.style({
          border: thin,
          verticalAlignment: "top",
          wrapText: !!col.wrap,
          fontSize: 10,
          ...(banded ? { fill: BAND_FILL } : {}),
        });
      });

      const sev = SEVERITY_STYLE[(row.severity ?? "").toLowerCase()];
      if (sev) {
        sheet.cell(`${SEVERITY_COL}${rowNo}`).style({
          fill: sev.fill, fontColor: sev.font, bold: true,
          horizontalAlignment: "center", verticalAlignment: "center",
          border: thin, fontSize: 10,
        });
      }
      const stat = statusStyle(row.status);
      if (stat) {
        sheet.cell(`${STATUS_COL}${rowNo}`).style({
          fill: stat.fill, fontColor: stat.font,
          horizontalAlignment: "center", verticalAlignment: "center",
          border: thin, fontSize: 10,
        });
      }
    });

    if (rows.length === 0) {
      sheet.cell(`A${FIRST_DATA_ROW}`).value("No defects were selected for this export.");
      sheet.range(`A${FIRST_DATA_ROW}:${lastCol}${FIRST_DATA_ROW}`).merged(true)
        .style({ italic: true, fontColor: "808080", border: thin });
    }

    // Filter and freeze, so a long log stays navigable: the headers and the
    // three identifying columns stay put while scrolling, and every column is
    // filterable the moment the file opens.
    sheet.autoFilter(sheet.range(`A${HEADER_ROW}:${lastCol}${lastRow}`));
    sheet.freezePanes(3, HEADER_ROW);

    return await wb.outputAsync();
  } catch (err) {
    console.error("[defects-excel] xlsx-populate build failed, falling back:", err);
    return buildDefectLogExcelFallback(rows, options);
  }
}

// ── SheetJS fallback: correct values, no styling ──────────────────────────────
function buildDefectLogExcelFallback(
  rows: DefectExportRow[],
  options: DefectExportOptions = {},
): Buffer | null {
  if (!XlsxSheetJS) return null;
  const subtitle = [
    options.scopeLabel || `${rows.length} defects`,
    `Exported ${new Date().toLocaleString("en-GB")}`,
    options.exportedByName ? `by ${options.exportedByName}` : null,
  ].filter(Boolean).join("  ·  ");
  const aoa: any[][] = [
    ["Defect Log"],
    [subtitle],
    [],
    COLUMNS.map((c) => c.header),
    ...rows.map((r) => COLUMNS.map((c) => c.value(r))),
  ];
  const ws = XlsxSheetJS.utils.aoa_to_sheet(aoa);
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
  const wb = XlsxSheetJS.utils.book_new();
  XlsxSheetJS.utils.book_append_sheet(wb, ws, "Defect Log");
  return XlsxSheetJS.write(wb, { type: "buffer", bookType: "xlsx" });
}
