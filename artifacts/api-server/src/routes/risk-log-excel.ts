/**
 * CR055 — Risk Register export to Bestinet's official "4.3 Risk Log" PMO
 * template (Ref. No. BSB-PMO-TEM–27–V1.1). Same architecture as
 * excel-builder.ts's test-case template: xlsx-populate edits the real
 * template file in place (preserving fonts/borders/conditional formatting),
 * falling back to SheetJS (values only, no formatting) if xlsx-populate is
 * unavailable.
 *
 * Column mapping is deliberately honest: QMPulse's risk model doesn't
 * collect every field the template has a slot for (no separate residual
 * post-treatment impact/likelihood assessment, no contingency plan, no
 * progress-update log). Those columns are left blank rather than
 * fabricated — see the per-field comments below for what's inferred vs.
 * what's genuinely absent. CR056 added the response-strategy enum
 * (Avoid/Transfer/Mitigate/Accept), which now maps to column K.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { RISK_LOG_TEMPLATE_B64 } from "./risk-log-template-data";

let XlsxPopulate: any = null;
try { XlsxPopulate = require("xlsx-populate"); } catch {}

let XlsxSheetJS: any = null;
try { XlsxSheetJS = require("xlsx"); } catch {}

function loadTemplate(): Buffer {
  const candidates = [
    join(process.cwd(), "artifacts/api-server/assets/risk-log-template.xlsx"),
    join(process.cwd(), "assets/risk-log-template.xlsx"),
  ];
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      console.log("[risk-log-excel] template loaded from file:", p);
      return buf;
    } catch {}
  }
  console.log("[risk-log-excel] template loaded from embedded base64 (fallback)");
  return Buffer.from(RISK_LOG_TEMPLATE_B64, "base64");
}

const TEMPLATE_BUFFER = loadTemplate();

export interface RiskLogRow {
  riskNumber: string;       // "R001", "R002", … — sequential within the export, not the DB id
  entryDate: string | null; // ISO date
  title: string;            // -> D: Risk Description (QMPulse's title already reads as a risk statement)
  description: string | null; // -> E: Risk Impact on Project
  category: string;         // -> F: Risk Area/Category (display label, not the raw enum)
  impact: "Low" | "Medium" | "High";     // -> G
  probability: "Low" | "Medium" | "High"; // -> H
  status: "open" | "mitigating" | "closed" | "realized";
  ownerName: string | null; // -> L: Risk owner
  responseStrategy: string | null; // -> K: Risk Response Strategy (Avoid/Transfer/Mitigate/Accept)
  mitigationPlan: string | null; // -> M: Describe Response Strategy
  mitigatedDate: string | null;  // -> P: Risk Mitigated date (from closedAt)
}

export interface RiskLogBuildOptions {
  projectName: string;
}

// Mirrors the template's own J-column IF() formula (see the source file's
// row 4) so the exported workbook recalculates live in Excel exactly like
// the original — not just a static snapshot of today's color.
function riskMapFormula(g: string, h: string, i: string): string {
  return (
    `IF(OR(AND(${i}<>"Closed",${g}="High",${h}="High"),AND(${i}<>"Closed",${g}="High",${h}="Medium"),AND(${i}<>"Closed",${g}="Medium",${h}="High")),"Red",` +
    `IF(OR(AND(${i}<>"Closed",${g}="High",${h}="Low"),AND(${i}<>"Closed",${g}="Medium",${h}="Medium"),AND(${i}<>"Closed",${g}="Low",${h}="High")),"Yellow",` +
    `IF(OR(AND(${i}<>"Closed",${g}="Medium",${h}="Low"),AND(${i}<>"Closed",${g}="Low",${h}="Low"),AND(${i}<>"Closed",${g}="Low",${h}="Medium")),"Green",` +
    `IF(${i}="Closed","Closed",""))))`
  );
}

// QMPulse's pre-treatment status is richer (open/mitigating/closed/realized)
// than the template's binary Open/Closed (per its own Read Me sheet) — only
// "closed" maps to Closed; everything still being tracked reads as Open.
function statusToTemplate(status: string): "Open" | "Closed" {
  return status === "closed" ? "Closed" : "Open";
}

function fmtDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function buildRiskLogExcel(
  rows: RiskLogRow[],
  options: RiskLogBuildOptions,
): Promise<Buffer | null> {
  if (!XlsxPopulate) {
    console.warn("[buildRiskLogExcel] xlsx-populate not available, using SheetJS fallback");
    return buildRiskLogExcelFallback(rows, options);
  }

  try {
    const wb = await XlsxPopulate.fromDataAsync(TEMPLATE_BUFFER);

    const docSheet = wb.sheet("Doc Info");
    docSheet.cell("D5").value(options.projectName);

    const rlSheet = wb.sheet("Risk Log");
    const FIRST_ROW = 4;
    const MAX_ROWS = 200; // matches the template's pre-styled/pre-CF row range

    rows.slice(0, MAX_ROWS).forEach((r, i) => {
      const row = FIRST_ROW + i;
      rlSheet.cell(`B${row}`).value(r.riskNumber);
      const entryDate = fmtDate(r.entryDate);
      if (entryDate) rlSheet.cell(`C${row}`).value(entryDate);
      rlSheet.cell(`D${row}`).value(r.title);
      if (r.description) rlSheet.cell(`E${row}`).value(r.description);
      rlSheet.cell(`F${row}`).value(r.category);
      rlSheet.cell(`G${row}`).value(r.impact);
      rlSheet.cell(`H${row}`).value(r.probability);
      const status = statusToTemplate(r.status);
      rlSheet.cell(`I${row}`).value(status);
      rlSheet.cell(`J${row}`).formula(riskMapFormula(`G${row}`, `H${row}`, `I${row}`));
      if (r.responseStrategy) rlSheet.cell(`K${row}`).value(r.responseStrategy);
      if (r.ownerName) rlSheet.cell(`L${row}`).value(r.ownerName);
      if (r.mitigationPlan) rlSheet.cell(`M${row}`).value(r.mitigationPlan);
      const mitigatedDate = fmtDate(r.mitigatedDate);
      if (mitigatedDate) rlSheet.cell(`P${row}`).value(mitigatedDate);
      // Q/R/S/T (post-treatment residual impact/likelihood/status/map),
      // N (contingency plan), O (progress update): QMPulse doesn't collect
      // a separate residual risk assessment or a contingency/progress-log
      // field — left blank rather than inferring values the data doesn't
      // actually support.
    });

    const out = await wb.outputAsync();
    return out as Buffer;
  } catch (err) {
    console.error("[buildRiskLogExcel] xlsx-populate failed, falling back to SheetJS:", err);
    return buildRiskLogExcelFallback(rows, options);
  }
}

// Values-only fallback (no template styling/conditional formatting) for
// environments where xlsx-populate can't run.
function buildRiskLogExcelFallback(rows: RiskLogRow[], options: RiskLogBuildOptions): Buffer | null {
  if (!XlsxSheetJS) {
    console.error("[buildRiskLogExcelFallback] SheetJS not available either — cannot build file");
    return null;
  }
  const header = [
    "Risk ID", "Risk Entry Date", "Risk Description", "Risk Impact on Project", "Risk Area/Category",
    "Risk Impact", "Risk Likelihood", "Risk Status", "Risk Response Strategy", "Risk Owner", "Describe Response Strategy", "Risk Mitigated Date",
  ];
  const data = rows.map((r) => [
    r.riskNumber, r.entryDate ?? "", r.title, r.description ?? "", r.category,
    r.impact, r.probability, statusToTemplate(r.status), r.responseStrategy ?? "", r.ownerName ?? "", r.mitigationPlan ?? "", r.mitigatedDate ?? "",
  ]);
  const ws = XlsxSheetJS.utils.aoa_to_sheet([[`Risk Log — ${options.projectName}`], [], header, ...data]);
  const wb = XlsxSheetJS.utils.book_new();
  XlsxSheetJS.utils.book_append_sheet(wb, ws, "Risk Log");
  return XlsxSheetJS.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
