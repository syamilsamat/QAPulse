/**
 * Lessons Learnt export — Bestinet's official "5.1 Lesson Learned" PMO
 * template (Ref. No. BSB-PMO-TEM–24–V1.0). Same architecture as the Risk
 * Log export (risk-log-excel.ts): xlsx-populate edits the real template
 * file in place (preserving fonts/borders/dropdown validations), falling
 * back to SheetJS (values only) if xlsx-populate is unavailable.
 *
 * Column mapping is honest about a real shape mismatch: the template
 * expects one row per discrete lesson, individually classified by Phase
 * (a fixed PM-phase list) and Type (What went wrong / What went right /
 * Best Practice). QMPulse captures lessons learned as a single free-text
 * field per milestone at Closing (CR033p1) — one blob that can genuinely
 * mix all three types in one paragraph (see the source template's own
 * sample data, which did exactly this). Type now writes the PM's own
 * classification (milestones.lessonsLearnedType, added as a fast-follow)
 * when they picked one; ships blank otherwise, with the column's dropdown
 * validation still intact so it can be classified by hand later. Phase is
 * filled honestly as "Project Closure": that's literally always when
 * QMPulse captures this field, never invented per-row detail. Comments
 * carries the milestone name, since one export can span several
 * milestones and the reader needs to know which is which.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { LESSONS_LEARNED_TEMPLATE_B64 } from "./lessons-learned-template-data";

let XlsxPopulate: any = null;
try { XlsxPopulate = require("xlsx-populate"); } catch {}

let XlsxSheetJS: any = null;
try { XlsxSheetJS = require("xlsx"); } catch {}

function loadTemplate(): Buffer {
  const candidates = [
    join(process.cwd(), "artifacts/api-server/assets/lessons-learned-template.xlsx"),
    join(process.cwd(), "assets/lessons-learned-template.xlsx"),
  ];
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      console.log("[lessons-learned-excel] template loaded from file:", p);
      return buf;
    } catch {}
  }
  console.log("[lessons-learned-excel] template loaded from embedded base64 (fallback)");
  return Buffer.from(LESSONS_LEARNED_TEMPLATE_B64, "base64");
}

const TEMPLATE_BUFFER = loadTemplate();

export interface LessonLogRow {
  milestoneName: string;   // -> G: Comments (which milestone this row is about)
  description: string;     // -> E: Description (the lessonsLearned text, verbatim)
  submittedDate: string | null; // -> F: Date Submitted (milestone.completedAt)
  // -> D: Lessons Learnt Type. Null when the PM hasn't classified it — the
  // column's dropdown validation stays intact either way for manual entry.
  lessonType: string | null;
}

export interface LessonLogHistoryRow {
  date: string | null;
  updatedByName: string | null; // milestone.closedBy's name
  summary: string;
}

export interface LessonLogBuildOptions {
  projectName: string;
  history?: LessonLogHistoryRow[];
}

function fmtDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function buildLessonsLearnedExcel(
  rows: LessonLogRow[],
  options: LessonLogBuildOptions,
): Promise<Buffer | null> {
  if (!XlsxPopulate) {
    console.warn("[buildLessonsLearnedExcel] xlsx-populate not available, using SheetJS fallback");
    return buildFallback(rows, options);
  }

  try {
    const wb = await XlsxPopulate.fromDataAsync(TEMPLATE_BUFFER);

    const docSheet = wb.sheet("Doc Info");
    docSheet.cell("D5").value(options.projectName);

    const DI_HIST_FIRST = 9;
    const DI_HIST_MAX_ROWS = 60;
    (options.history ?? []).slice(0, DI_HIST_MAX_ROWS).forEach((h, i) => {
      const row = DI_HIST_FIRST + i;
      docSheet.cell(`B${row}`).value(i + 1);
      const d = fmtDate(h.date);
      if (d) docSheet.cell(`C${row}`).value(d);
      if (h.updatedByName) docSheet.cell(`D${row}`).value(h.updatedByName);
      docSheet.cell(`E${row}`).value(h.summary);
    });

    const llSheet = wb.sheet("Lessons Learnt");
    const FIRST_ROW = 4;
    const MAX_ROWS = 60; // matches the template's pre-styled/pre-validation row range

    rows.slice(0, MAX_ROWS).forEach((r, i) => {
      const row = FIRST_ROW + i;
      llSheet.cell(`B${row}`).value(i + 1);
      llSheet.cell(`C${row}`).value("Project Closure");
      // D (Type): real value if the PM classified it; otherwise blank —
      // the column's dropdown validation stays available either way.
      if (r.lessonType) llSheet.cell(`D${row}`).value(r.lessonType);
      llSheet.cell(`E${row}`).value(r.description);
      const submitted = fmtDate(r.submittedDate);
      if (submitted) llSheet.cell(`F${row}`).value(submitted);
      llSheet.cell(`G${row}`).value(r.milestoneName);
    });

    const out = await wb.outputAsync();
    return out as Buffer;
  } catch (err) {
    console.error("[buildLessonsLearnedExcel] xlsx-populate failed, falling back to SheetJS:", err);
    return buildFallback(rows, options);
  }
}

function buildFallback(rows: LessonLogRow[], options: LessonLogBuildOptions): Buffer | null {
  if (!XlsxSheetJS) {
    console.error("[buildLessonsLearnedExcel fallback] SheetJS not available either — cannot build file");
    return null;
  }
  const header = ["Sl#", "Phase", "Lessons Learnt Type", "Description", "Date Submitted", "Comments"];
  const data = rows.map((r, i) => [i + 1, "Project Closure", r.lessonType ?? "", r.description, r.submittedDate ?? "", r.milestoneName]);
  const ws = XlsxSheetJS.utils.aoa_to_sheet([[`Lessons Learnt — ${options.projectName}`], [], header, ...data]);
  const wb = XlsxSheetJS.utils.book_new();
  XlsxSheetJS.utils.book_append_sheet(wb, ws, "Lessons Learnt");

  const historyHeader = ["Sl #", "Date", "Updated By", "Update Summary"];
  const historyRows = (options.history ?? []).map((h, i) => [i + 1, h.date ?? "", h.updatedByName ?? "", h.summary]);
  const docWs = XlsxSheetJS.utils.aoa_to_sheet([
    ["Project Name", options.projectName], [], historyHeader, ...historyRows,
  ]);
  XlsxSheetJS.utils.book_append_sheet(wb, docWs, "Doc Info");

  return XlsxSheetJS.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
