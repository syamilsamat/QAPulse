import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getAuthContext, scopeToUserProjects } from "../middleware/access";

// Same optional-load pattern as excel-builder.ts — styling (bold, fills,
// borders) needs xlsx-populate; the community SheetJS build can't write it.
let XlsxPopulate: any = null;
try {
  XlsxPopulate = require("xlsx-populate");
} catch {}

const router: IRouter = Router();

interface TcResult {
  result: string | null;
  defectNumber: string | null;
  executedAt: string | null;
}

interface TcNode {
  key: string;
  tcId: number;
  source: "library" | "execution";
  tcCaseId: string | null;
  etcCaseId: string | null;
  tcTitle: string | null;
  displayCaseId: string;
  results: TcResult[];
}

interface ReqNode {
  reqId: number;
  reqRedmineId: string | null;
  reqTitle: string;
  reqModule: string | null;
  projectId: number | null;
  projectName: string | null;
  reqStatus: string | null;
  parentId: number | null;
  milestoneId: number | null;
  milestoneName: string | null;
  milestoneTargetDate: string | null;
  milestoneStatus: string | null;
  testCases: TcNode[];
  children: ReqNode[];
  directTcCount: number;
  tcCount: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  coveragePct: number;
  overallStatus: string;
  inMilestone: boolean;
}

type Classification = "passed" | "failed" | "blocked" | "notRun";

function classify(result: string | null | undefined): Classification {
  const r = result?.toLowerCase() ?? "";
  if (r === "passed" || r === "pass") return "passed";
  if (r === "failed" || r === "fail") return "failed";
  if (r === "blocked") return "blocked";
  return "notRun";
}

// Aggregates a subtree into the node's rolled-up counts. Returns the map of
// distinct TC identity → latest classification so parents can merge it; a TC
// linked to both a parent and one of its children counts once.
function rollup(node: ReqNode): Map<string, Classification> {
  const agg = new Map<string, Classification>();
  for (const tc of node.testCases) {
    const latest = tc.results[tc.results.length - 1]?.result ?? null;
    if (!agg.has(tc.key)) agg.set(tc.key, classify(latest));
  }
  for (const child of node.children) {
    for (const [k, v] of rollup(child)) {
      if (!agg.has(k)) agg.set(k, v);
    }
  }

  let passed = 0, failed = 0, blocked = 0, notRun = 0;
  for (const v of agg.values()) {
    if (v === "passed") passed++;
    else if (v === "failed") failed++;
    else if (v === "blocked") blocked++;
    else notRun++;
  }

  const tcCount = agg.size;
  node.directTcCount = node.testCases.length;
  node.tcCount = tcCount;
  node.passed = passed;
  node.failed = failed;
  node.blocked = blocked;
  node.notRun = notRun;
  node.coveragePct = tcCount > 0 ? Math.round((passed / tcCount) * 100) : 0;

  if (tcCount === 0) node.overallStatus = "no-tcs";
  else if (failed > 0) node.overallStatus = "failing";
  else if (blocked > 0) node.overallStatus = "blocked";
  else if (notRun === tcCount) node.overallStatus = "not-run";
  else if (passed === tcCount) node.overallStatus = "passed";
  else node.overallStatus = "in-progress";

  return agg;
}

// ── RTM Excel export ────────────────────────────────────────────────────────
// An RTM is inherently a flat matrix (requirement → test case → result →
// defect), so this uses its own flat query rather than the tree the page
// renders. Join semantics match /traceability: the latest execution result
// per library test case, scoped to the milestone when one is given.
const RESULT_FILL: Record<string, string> = {
  passed: "C6EFCE",
  failed: "FFC7CE",
  blocked: "FFEB9C",
  "in progress": "DDEBF7",
};
// Raw DB values are lowercase/snake_case ("normal", "in_review"); an RTM is an
// audit artifact, so present them as labels.
const titleCase = (v: unknown): string => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const RESULT_FONT: Record<string, string> = {
  passed: "006100",
  failed: "9C0006",
  blocked: "9C6500",
  "in progress": "1F4E79",
};

router.get("/traceability/export", async (req, res): Promise<void> => {
  try {
    const ctx = getAuthContext(req);
    if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!XlsxPopulate) {
      res.status(500).json({ error: "Excel generator unavailable on the server" });
      return;
    }

    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const milestoneIdNum = req.query.milestoneId ? Number(req.query.milestoneId) : null;
    if (projectId != null && Number.isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }
    if (milestoneIdNum != null && Number.isNaN(milestoneIdNum)) { res.status(400).json({ error: "Invalid milestoneId" }); return; }
    if (projectId && accessible !== null && !accessible.includes(projectId)) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (projectId) { conditions.push(`r.project_id = $${p++}`); params.push(projectId); }
    else if (accessible !== null) { conditions.push(`r.project_id = ANY($${p++})`); params.push(accessible); }
    if (milestoneIdNum) { conditions.push(`r.milestone_id = $${p++}`); params.push(milestoneIdNum); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const milestoneParamIdx = p; // for the LATERAL scope below
    params.push(milestoneIdNum);

    const { rows } = await pool.query(
      `
      SELECT
        r.redmine_ticket_id                       AS req_redmine_id,
        r.title                                   AS req_title,
        r.module                                  AS req_module,
        r.priority                                AS req_priority,
        r.review_status                           AS req_review_status,
        p.name                                    AS project_name,
        m.name                                    AS milestone_name,
        tc.case_id                                AS tc_case_id,
        tc.title                                  AS tc_title,
        tc.priority                               AS tc_priority,
        latest_etc.etc_case_id,
        latest_etc.result,
        latest_etc.defect_number,
        latest_etc.executed_at
      FROM requirements r
      LEFT JOIN projects p   ON p.id = r.project_id
      LEFT JOIN milestones m ON m.id = r.milestone_id
      -- Re-syncing the same Redmine ticket into another milestone creates a
      -- second requirement row, while the test cases stay attached to the row
      -- they were written against. Matching on r.id alone therefore reports
      -- "no test case linked" for the newer milestone, so coverage is widened
      -- across sibling rows sharing the ticket within the same project.
      LEFT JOIN test_cases tc
        ON tc.requirement_id = r.id
        OR (
          r.redmine_ticket_id IS NOT NULL
          AND tc.requirement_id IN (
            SELECT sib.id FROM requirements sib
            WHERE sib.redmine_ticket_id = r.redmine_ticket_id
              AND sib.project_id = r.project_id
          )
        )
      LEFT JOIN LATERAL (
        SELECT COALESCE(e.test_case_id, e.case_id) AS etc_case_id,
               e.result, e.defect_number, e.executed_at
        FROM execution_test_cases e
        JOIN execution_files ef ON ef.id = e.execution_file_id
        WHERE e.library_tc_id = tc.id
          AND ($${milestoneParamIdx}::int IS NULL OR ef.milestone_id = $${milestoneParamIdx}::int)
        ORDER BY e.id DESC
        LIMIT 1
      ) latest_etc ON true
      ${where}
      ORDER BY r.id, tc.id
      `,
      params
    );

    const projectName = rows.find((r) => r.project_name)?.project_name ?? "All projects";
    const milestoneName = rows.find((r) => r.milestone_name)?.milestone_name ?? null;

    const wb = await XlsxPopulate.fromBlankAsync();
    const sheet = wb.sheet(0);
    sheet.name("RTM");

    const HEADERS = [
      "Redmine ID", "Requirement", "Module", "Req. Priority", "Req. Status",
      "Test Case ID", "Test Case", "TC Priority", "Execution ID", "Result",
      "Defect No.", "Executed On",
    ];
    const WIDTHS = [13, 46, 18, 13, 14, 16, 46, 12, 16, 13, 13, 14];
    const lastCol = String.fromCharCode(64 + HEADERS.length); // "L"

    // ── Title block ──────────────────────────────────────────────────────────
    sheet.range(`A1:${lastCol}1`).merged(true);
    sheet.cell("A1").value("Requirements Traceability Matrix").style({
      bold: true, fontSize: 16, fontColor: "FFFFFF", fill: "1F4E79",
      horizontalAlignment: "center", verticalAlignment: "center",
    });
    sheet.row(1).height(28);

    sheet.range(`A2:${lastCol}2`).merged(true);
    sheet.cell("A2").value(
      [
        `Project: ${projectName}`,
        milestoneName ? `Milestone: ${milestoneName}` : null,
        `Generated: ${new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      ].filter(Boolean).join("     |     ")
    ).style({ italic: true, fontSize: 10, fontColor: "444444", horizontalAlignment: "center" });
    sheet.row(2).height(18);

    // ── Header row ───────────────────────────────────────────────────────────
    const HEADER_ROW = 4;
    HEADERS.forEach((h, i) => {
      sheet.row(HEADER_ROW).cell(i + 1).value(h).style({
        bold: true, fontColor: "FFFFFF", fill: "2E75B6",
        horizontalAlignment: "center", verticalAlignment: "center",
        wrapText: true, border: true,
      });
      sheet.column(i + 1).width(WIDTHS[i]);
    });
    sheet.row(HEADER_ROW).height(30);

    // ── Data rows ────────────────────────────────────────────────────────────
    let rowNum = HEADER_ROW + 1;
    let covered = 0;
    for (const r of rows) {
      const hasTc = !!(r.tc_case_id || r.tc_title);
      if (hasTc) covered++;
      const resultRaw = String(r.result ?? (hasTc ? "Not Executed" : "")).trim();
      const resultKey = resultRaw.toLowerCase();

      const values = [
        r.req_redmine_id ? `#${r.req_redmine_id}` : "",
        r.req_title ?? "",
        r.req_module ?? "",
        titleCase(r.req_priority),
        titleCase(r.req_review_status),
        r.tc_case_id ?? "",
        r.tc_title ?? (hasTc ? "" : "⚠ No test case linked"),
        titleCase(r.tc_priority),
        r.etc_case_id ?? "",
        titleCase(resultRaw),
        r.defect_number ?? "",
        r.executed_at ? new Date(r.executed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "",
      ];

      values.forEach((v, i) => {
        const cell = sheet.row(rowNum).cell(i + 1);
        cell.value(v);
        const style: Record<string, any> = {
          border: true,
          verticalAlignment: "top",
          wrapText: i === 1 || i === 6, // requirement + test case text
          fontSize: 10,
        };
        // Banded rows keep a long matrix readable on screen and in print.
        if (rowNum % 2 === 1) style.fill = "F2F7FB";
        if (!hasTc && i === 6) { style.fontColor = "9C0006"; style.italic = true; }
        if (i === 9 && RESULT_FILL[resultKey]) {
          style.fill = RESULT_FILL[resultKey];
          style.fontColor = RESULT_FONT[resultKey];
          style.bold = true;
          style.horizontalAlignment = "center";
        }
        cell.style(style);
      });
      rowNum++;
    }

    if (rows.length === 0) {
      sheet.range(`A${rowNum}:${lastCol}${rowNum}`).merged(true);
      sheet.cell(`A${rowNum}`).value("No requirements found for this selection.").style({
        italic: true, fontColor: "9C0006", horizontalAlignment: "center", border: true,
      });
      rowNum++;
    }

    // ── Summary footer ───────────────────────────────────────────────────────
    const summaryRow = rowNum + 1;
    sheet.cell(`A${summaryRow}`).value("Summary").style({ bold: true, fontSize: 11 });
    const passed = rows.filter((r) => String(r.result ?? "").toLowerCase() === "passed").length;
    const failed = rows.filter((r) => String(r.result ?? "").toLowerCase() === "failed").length;
    sheet.cell(`B${summaryRow}`).value(
      `${rows.length} row(s)  ·  ${covered} with a linked test case  ·  ${passed} passed  ·  ${failed} failed`
    ).style({ fontSize: 10, fontColor: "444444" });

    // Keep headers visible while scrolling, and print with gridlines on every
    // page so a printed RTM stays readable as an audit artifact.
    sheet.freezePanes(0, HEADER_ROW);
    try {
      sheet.printGridLines(true);
      sheet.printOptions("horizontalCentered", true);
    } catch { /* older xlsx-populate builds lack these setters */ }

    const buf = await wb.outputAsync("nodebuffer");
    const safeName = (milestoneName ?? projectName ?? "RTM").replace(/[^\w-]+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="RTM_${safeName}.xlsx"`);
    res.send(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  } catch (err: any) {
    console.error("[GET /traceability/export]", err);
    res.status(500).json({ error: err?.message ?? "Failed to export RTM" });
  }
});

// ── BSB-template RTM export ─────────────────────────────────────────────────
// A client-supplied sign-off template (BSB-PS-TEM–30–V1.0) with a fixed
// column layout that doesn't match /traceability/export's own shape. Five of
// its columns (SRS section, Design section, User Manual, Unit Test, Build
// Number) have no corresponding data anywhere in this schema — QM Pulse only
// tracks QA/system-level test cases, not dev unit tests or doc section refs
// — so those stay blank for manual entry, same as the template's own
// "Ref. No." doc-control code. Change Request (CR No.) piggybacks on the
// existing parentId link: a requirement created to amend another one is
// shown as its own row with only the CR column filled, mirroring how BSB's
// own sample data lists a CR as a standalone row rather than repeating the
// original BRS number. Release Number only has a real source when the
// requirement's own milestone is itself a 'release'-type milestone —
// milestones don't nest (a 'phase' milestone has no link back to the
// 'release' milestone that contains it), so a phase-scoped export (the
// common case) leaves it blank rather than guessing.
router.get("/traceability/export-bsb", async (req, res): Promise<void> => {
  try {
    const ctx = getAuthContext(req);
    if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!XlsxPopulate) {
      res.status(500).json({ error: "Excel generator unavailable on the server" });
      return;
    }

    const projectId = Number(req.query.projectId);
    const milestoneId = Number(req.query.milestoneId);
    if (!projectId || Number.isNaN(projectId)) { res.status(400).json({ error: "projectId is required" }); return; }
    if (!milestoneId || Number.isNaN(milestoneId)) { res.status(400).json({ error: "milestoneId is required" }); return; }

    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    if (accessible !== null && !accessible.includes(projectId)) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    const { rows: scopeRows } = await pool.query(
      `SELECT m.id, m.name AS milestone_name, m.type AS milestone_type, p.name AS project_name
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.id = $1 AND m.project_id = $2`,
      [milestoneId, projectId],
    );
    if (scopeRows.length === 0) { res.status(404).json({ error: "Milestone not found in this project" }); return; }
    const { milestone_name: milestoneName, milestone_type: milestoneType, project_name: projectName } = scopeRows[0];
    const releaseNumber = milestoneType === "release" ? milestoneName : "";

    const { rows } = await pool.query(
      `
      SELECT
        r.id                       AS req_id,
        r.redmine_ticket_id        AS req_redmine_id,
        r.module                   AS req_module,
        r.parent_id                AS parent_id,
        tc.case_id                 AS tc_case_id,
        latest_etc.etc_case_id
      FROM requirements r
      LEFT JOIN test_cases tc ON tc.requirement_id = r.id
      LEFT JOIN LATERAL (
        SELECT COALESCE(e.test_case_id, e.case_id) AS etc_case_id
        FROM execution_test_cases e
        JOIN execution_files ef ON ef.id = e.execution_file_id
        WHERE e.library_tc_id = tc.id
        ORDER BY e.id DESC
        LIMIT 1
      ) latest_etc ON true
      WHERE r.project_id = $1 AND r.milestone_id = $2
      ORDER BY r.id, tc.id
      `,
      [projectId, milestoneId],
    );

    // One row per requirement — collapse the per-test-case join rows above
    // into a single comma-joined, de-duplicated case-ID list per requirement.
    const byReq = new Map<number, { redmineId: string | null; module: string | null; parentId: number | null; caseIds: Set<string> }>();
    for (const r of rows) {
      let entry = byReq.get(r.req_id);
      if (!entry) {
        entry = { redmineId: r.req_redmine_id ?? null, module: r.req_module ?? null, parentId: r.parent_id ?? null, caseIds: new Set() };
        byReq.set(r.req_id, entry);
      }
      const caseId = r.etc_case_id ?? r.tc_case_id;
      if (caseId) entry.caseIds.add(caseId);
    }

    const wb = await XlsxPopulate.fromBlankAsync();

    // Single sheet, not two: xlsx-populate@1.21.0's addSheet() (the version
    // pinned for this whole workspace) omits the second sheet's required
    // Content_Types override, producing genuinely invalid OOXML — confirmed
    // by unzipping the output and inspecting the XML directly. Nothing else
    // in this codebase calls addSheet today, so this isn't a regression,
    // just a latent bug this export would otherwise be the first to
    // trigger. A stacked single-sheet layout gets the same information
    // across without depending on that code path.
    const sheet = wb.sheet(0);
    sheet.name("RTM");

    // ── Doc Info header block ───────────────────────────────────────────────
    sheet.range("B1:F1").merged(true);
    sheet.cell("B1").value("Requirements").style({ bold: true, fontSize: 11 });
    sheet.range("B2:F2").merged(true);
    sheet.cell("B2").value("Requirement Traceability Matrix").style({ bold: true, fontSize: 14 });
    sheet.cell("H1").value("Ref. No.: BSB-PS-TEM–30–V1.0").style({ italic: true, fontSize: 9 });
    sheet.range("B3:C3").merged(true);
    sheet.cell("B3").value("Project Name").style({ bold: true });
    sheet.range("D3:F3").merged(true);
    // BSB's own template fills this field with the phase/workstream name
    // ("FWe Approval"), not the top-level system name ("eQuota") — that
    // only ever appears in their file-naming convention, never inside the
    // sheet. milestoneName is the QM Pulse equivalent of what they actually
    // put here; projectName has no slot in this template at all.
    sheet.cell("D3").value(milestoneName ?? "");
    // Document Information's revision-history table is left out entirely —
    // QM Pulse has no single combined change log to source it from (see
    // comment above the route), and an empty table with no rows would just
    // be dead weight in a generated file.

    // ── Traceability Matrix ──────────────────────────────────────────────────
    const TITLE_ROW = 5;
    const HEADER_ROW = 6;
    sheet.range(`B${TITLE_ROW}:K${TITLE_ROW}`).merged(true);
    sheet.cell(`B${TITLE_ROW}`).value("Requirement Traceability Matrix").style({
      bold: true, fontSize: 14, fontColor: "FFFFFF", fill: "1F4E79",
      horizontalAlignment: "center", verticalAlignment: "center",
    });
    sheet.row(TITLE_ROW).height(24);

    const HEADERS = [
      "BRS (Req ID, No.)", " Change Request \n(CR No.)", "SRS \n(Section Number)",
      "Software Design \n(Section Number)", "Source Code (Module Name) ", "User Manual",
      "Unit Test \n(Test Case Number)", "System/\nIntegration Test \n(Test Case Number)",
      "Build Number", "Release Number",
    ];
    HEADERS.forEach((h, i) => {
      sheet.row(HEADER_ROW).cell(i + 2).value(h).style({
        bold: true, fontColor: "FFFFFF", fill: "2E75B6",
        horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, border: true,
      });
    });
    sheet.row(HEADER_ROW).height(34);
    [12, 14, 16, 16, 20, 14, 16, 24, 12, 14].forEach((w, i) => sheet.column(i + 2).width(w));

    let rowNum = HEADER_ROW + 1;
    for (const entry of byReq.values()) {
      const isChangeRequest = entry.parentId != null;
      const values = [
        isChangeRequest ? "" : entry.redmineId ?? "",  // B — BRS
        isChangeRequest ? entry.redmineId ?? "" : "",  // C — CR No.
        "",                                            // D — SRS section (no source)
        "",                                            // E — Design section (no source)
        entry.module ?? "",                            // F — Module
        "",                                            // G — User Manual (no source)
        "",                                            // H — Unit Test (no source)
        [...entry.caseIds].sort().join(", "),           // I — System/Integration Test
        "",                                            // J — Build Number (no source)
        releaseNumber,                                  // K — Release Number
      ];
      values.forEach((v, i) => {
        sheet.row(rowNum).cell(i + 2).value(v).style({ border: true, verticalAlignment: "top", wrapText: i === 7, fontSize: 10 });
      });
      rowNum++;
    }

    sheet.freezePanes(0, HEADER_ROW);

    const buf = await wb.outputAsync("nodebuffer");
    const safeName = (milestoneName ?? projectName ?? "RTM").replace(/[^\w-]+/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="RTM_BSB_${safeName}.xlsx"`);
    res.send(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  } catch (err: any) {
    console.error("[GET /traceability/export-bsb]", err);
    res.status(500).json({ error: err?.message ?? "Failed to export BSB-template RTM" });
  }
});

router.get("/traceability", async (req, res): Promise<void> => {
  try {
    const ctx = getAuthContext(req);
    if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

    const { projectId, module, status, milestoneId } = req.query;
    const milestoneIdNum = milestoneId ? Number(milestoneId) : null;

    if (projectId && accessible !== null && !accessible.includes(Number(projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    const reqConditions: string[] = [];
    const reqParams: any[] = [];
    let p = 1;
    if (projectId) { reqConditions.push(`r.project_id = $${p++}`); reqParams.push(Number(projectId)); }
    else if (accessible !== null) { reqConditions.push(`r.project_id = ANY($${p++})`); reqParams.push(accessible); }
    if (milestoneIdNum) { reqConditions.push(`r.milestone_id = $${p++}`); reqParams.push(milestoneIdNum); }
    const reqWhere = reqConditions.length > 0 ? `WHERE ${reqConditions.join(" AND ")}` : "";

    const { rows: reqRows } = await pool.query(
      `
      SELECT
        r.id                AS req_id,
        r.redmine_ticket_id AS req_redmine_id,
        r.title             AS req_title,
        r.module            AS req_module,
        r.project_id        AS project_id,
        p.name              AS project_name,
        r.status            AS req_status,
        r.parent_id         AS parent_id,
        r.milestone_id      AS milestone_id,
        m.name              AS milestone_name,
        m.target_date       AS milestone_target_date,
        m.status            AS milestone_status
      FROM requirements r
      LEFT JOIN projects p ON p.id = r.project_id
      LEFT JOIN milestones m ON m.id = r.milestone_id
      ${reqWhere}
      ORDER BY r.id
      `,
      reqParams
    );

    const nodes = new Map<number, ReqNode>();
    for (const row of reqRows) {
      nodes.set(row.req_id, {
        reqId: row.req_id,
        reqRedmineId: row.req_redmine_id ?? null,
        reqTitle: row.req_title,
        reqModule: row.req_module,
        projectId: row.project_id,
        projectName: row.project_name ?? null,
        reqStatus: row.req_status,
        parentId: row.parent_id ?? null,
        milestoneId: row.milestone_id ?? null,
        milestoneName: row.milestone_name ?? null,
        milestoneTargetDate: row.milestone_target_date ? new Date(row.milestone_target_date).toISOString() : null,
        milestoneStatus: row.milestone_status ?? null,
        testCases: [],
        children: [],
        directTcCount: 0,
        tcCount: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        notRun: 0,
        coveragePct: 0,
        overallStatus: "no-tcs",
        inMilestone: true,
      });
    }

    const reqIds = Array.from(nodes.keys());

    // Re-syncing a Redmine ticket into another milestone creates a second
    // requirement row, but its test cases stay attached to the row they were
    // written against — so looking them up by the in-scope row's id alone
    // reports zero coverage. Widen the *lookup* (never the tree itself) to
    // sibling rows sharing the ticket within the same project, and map every
    // sibling id back to the node(s) it should credit. With no duplicate rows
    // this resolves to exactly `reqIds`, leaving behaviour unchanged.
    const nodesByLookupId = new Map<number, ReqNode[]>();
    for (const [id, node] of nodes) nodesByLookupId.set(id, [node]);
    if (reqIds.length > 0) {
      const { rows: siblingRows } = await pool.query(
        `
        SELECT r.id AS req_id, sib.id AS sibling_id
        FROM requirements r
        JOIN requirements sib
          ON sib.redmine_ticket_id = r.redmine_ticket_id
         AND sib.project_id = r.project_id
        WHERE r.id = ANY($1::int[])
          AND r.redmine_ticket_id IS NOT NULL
          AND sib.id <> r.id
        `,
        [reqIds]
      );
      for (const row of siblingRows) {
        const node = nodes.get(row.req_id);
        if (!node) continue;
        const bucket = nodesByLookupId.get(row.sibling_id);
        if (!bucket) nodesByLookupId.set(row.sibling_id, [node]);
        else if (!bucket.includes(node)) bucket.push(node);
      }
    }
    const lookupReqIds = Array.from(nodesByLookupId.keys());

    if (reqIds.length > 0) {
      // Library TCs linked to any requirement in the set, with their latest
      // execution result (if the TC was ever pulled into an execution file).
      const { rows: libRows } = await pool.query(
        `
        SELECT
          tc.id             AS tc_id,
          tc.requirement_id AS requirement_id,
          tc.case_id        AS tc_case_id,
          tc.title          AS tc_title,
          latest_etc.etc_case_id,
          latest_etc.result,
          latest_etc.defect_number,
          latest_etc.executed_at
        FROM test_cases tc
        LEFT JOIN LATERAL (
          SELECT COALESCE(e.test_case_id, e.case_id) AS etc_case_id,
                 e.result, e.defect_number, e.executed_at
          FROM execution_test_cases e
          JOIN execution_files ef ON ef.id = e.execution_file_id
          WHERE e.library_tc_id = tc.id
            AND ($2::int IS NULL OR ef.milestone_id = $2::int)
          ORDER BY e.id DESC
          LIMIT 1
        ) latest_etc ON true
        WHERE tc.requirement_id = ANY($1)
        ORDER BY tc.id
        `,
        [lookupReqIds, milestoneIdNum]
      );

      for (const row of libRows) {
        const results: TcResult[] =
          row.result !== null || row.etc_case_id !== null || row.executed_at !== null || row.defect_number !== null
            ? [{
                result: row.result,
                defectNumber: row.defect_number,
                executedAt: row.executed_at ? new Date(row.executed_at).toISOString() : null,
              }]
            : [];
        for (const node of nodesByLookupId.get(row.requirement_id) ?? []) {
          node.testCases.push({
            key: `lib:${row.tc_id}`,
            tcId: row.tc_id,
            source: "library",
            tcCaseId: row.tc_case_id,
            etcCaseId: row.etc_case_id ?? null,
            tcTitle: row.tc_title,
            displayCaseId: row.etc_case_id ?? row.tc_case_id ?? `#${row.tc_id}`,
            results,
          });
        }
      }

      // Execution-file rows linked directly to a requirement (same dedupe
      // identity convention as the requirements page: a row that points back
      // to a library TC collapses onto that TC).
      const { rows: execRows } = await pool.query(
        `
        SELECT
          e.id             AS etc_id,
          e.requirement_id AS requirement_id,
          e.library_tc_id  AS library_tc_id,
          COALESCE(e.test_case_id, e.case_id) AS etc_case_id,
          e.case_name      AS case_name,
          e.result, e.defect_number, e.executed_at
        FROM execution_test_cases e
        JOIN execution_files ef ON ef.id = e.execution_file_id
        WHERE e.requirement_id = ANY($1)
          AND ($2::int IS NULL OR ef.milestone_id = $2::int)
        ORDER BY e.id
        `,
        [lookupReqIds, milestoneIdNum]
      );

      for (const row of execRows) {
        const key = row.library_tc_id != null ? `lib:${row.library_tc_id}` : `exec:${row.etc_id}`;
        const result: TcResult = {
          result: row.result,
          defectNumber: row.defect_number,
          executedAt: row.executed_at ? new Date(row.executed_at).toISOString() : null,
        };
        for (const node of nodesByLookupId.get(row.requirement_id) ?? []) {
          const existing = node.testCases.find((t) => t.key === key);
          if (existing) {
            // Same TC seen again (library link or an earlier execution file):
            // keep the newer execution result as the latest.
            existing.results = [result];
            existing.etcCaseId = row.etc_case_id ?? existing.etcCaseId;
            existing.displayCaseId = existing.etcCaseId ?? existing.tcCaseId ?? existing.displayCaseId;
            continue;
          }
          node.testCases.push({
            key,
            tcId: row.etc_id,
            source: "execution",
            tcCaseId: null,
            etcCaseId: row.etc_case_id ?? null,
            tcTitle: row.case_name ?? null,
            displayCaseId: row.etc_case_id ?? `#${row.etc_id}`,
            results: [result],
          });
        }
      }
    }

    // CR017 target #3 — when a milestone filter is active, walk up parent_id
    // chains for the matched requirements and pull in any out-of-milestone
    // ancestors purely as grayed context rows (no test cases fetched for
    // them), so a matched child doesn't lose its place in the tree and the
    // rollup stays scoped to only the in-sprint descendants already fetched
    // above.
    if (milestoneIdNum && reqIds.length > 0) {
      const { rows: ancestorIdRows } = await pool.query(
        `
        WITH RECURSIVE ancestors AS (
          SELECT r.id, r.parent_id FROM requirements r WHERE r.id = ANY($1::int[])
          UNION
          SELECT r.id, r.parent_id FROM requirements r JOIN ancestors a ON r.id = a.parent_id
        )
        SELECT id FROM ancestors
        `,
        [reqIds]
      );
      const extraIds = ancestorIdRows.map((r: any) => r.id).filter((id: number) => !nodes.has(id));

      if (extraIds.length > 0) {
        const extraConditions = [`r.id = ANY($1::int[])`];
        const extraParams: any[] = [extraIds];
        if (accessible !== null) { extraConditions.push(`r.project_id = ANY($2::int[])`); extraParams.push(accessible); }

        const { rows: ancestorRows } = await pool.query(
          `
          SELECT
            r.id                AS req_id,
            r.redmine_ticket_id AS req_redmine_id,
            r.title             AS req_title,
            r.module            AS req_module,
            r.project_id        AS project_id,
            p.name              AS project_name,
            r.status            AS req_status,
            r.parent_id         AS parent_id,
            r.milestone_id      AS milestone_id,
            m.name              AS milestone_name,
            m.target_date       AS milestone_target_date,
            m.status            AS milestone_status
          FROM requirements r
          LEFT JOIN projects p ON p.id = r.project_id
          LEFT JOIN milestones m ON m.id = r.milestone_id
          WHERE ${extraConditions.join(" AND ")}
          `,
          extraParams
        );

        for (const row of ancestorRows) {
          nodes.set(row.req_id, {
            reqId: row.req_id,
            reqRedmineId: row.req_redmine_id ?? null,
            reqTitle: row.req_title,
            reqModule: row.req_module,
            projectId: row.project_id,
            projectName: row.project_name ?? null,
            reqStatus: row.req_status,
            parentId: row.parent_id ?? null,
            milestoneId: row.milestone_id ?? null,
            milestoneName: row.milestone_name ?? null,
            milestoneTargetDate: row.milestone_target_date ? new Date(row.milestone_target_date).toISOString() : null,
            milestoneStatus: row.milestone_status ?? null,
            testCases: [],
            children: [],
            directTcCount: 0,
            tcCount: 0,
            passed: 0,
            failed: 0,
            blocked: 0,
            notRun: 0,
            coveragePct: 0,
            overallStatus: "no-tcs",
            inMilestone: false,
          });
        }
      }
    }

    // Assemble tree. A node whose parent is missing from the fetched set
    // (e.g. filtered out) is treated as a root so it stays visible.
    const roots: ReqNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId != null && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    for (const root of roots) rollup(root);

    // Module filter: keep a tree when the root or any descendant matches.
    const matchesModule = (node: ReqNode): boolean =>
      node.reqModule === module || node.children.some(matchesModule);
    let filtered = module ? roots.filter(matchesModule) : roots;

    if (status && status !== "all") {
      filtered = filtered.filter((r) => r.overallStatus === status);
    }

    res.json(filtered);
  } catch (err: any) {
    console.error("[GET /traceability]", err);
    res.status(500).json({ error: err?.message ?? "Failed to fetch traceability data" });
  }
});

export default router;
