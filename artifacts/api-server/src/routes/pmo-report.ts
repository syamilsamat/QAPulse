import { Router, type IRouter } from "express";
import express from "express";
import { eq } from "drizzle-orm";

let nodemailer: any = null;
try {
  nodemailer = require("nodemailer");
} catch {}

let xlsx: any = null;
try {
  xlsx = require("xlsx");
} catch {}
import {
  db,
  requirementsTable,
  testCasesTable,
  tasksTable,
  usersTable,
  executionSummariesTable,
  executionFilesTable,
  executionTestCasesTable,
} from "@workspace/db";

let mysql2: any = null;
try {
  mysql2 = require("mysql2/promise");
} catch {}

const router: IRouter = Router();

// Endpoint to GET execution details by Ticket ID (from DB)
router.get("/pmo/execution-details", async (req, res) => {
  const { redmineId } = req.query;
  if (redmineId && typeof redmineId === "string") {
    try {
      const rows = await db
        .select()
        .from(executionSummariesTable)
        .where(eq(executionSummariesTable.redmineTicketId, redmineId));

      if (rows.length > 0) {
        const data = rows.map((r) => ({
          id: r.id.toString(),
          module: r.module,
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          blocked: r.blocked,
          inProg: r.inProgress,
          notExec: r.notExecuted,
        }));
        res.json(data);
        return;
      }

      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, redmineId));

      if (!file) {
        res.json([]);
        return;
      }

      const testCases = await db
        .select()
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      if (testCases.length === 0) {
        res.json([]);
        return;
      }

      const moduleMap: Record<string, any> = {};
      testCases.forEach((tc) => {
        if (!tc.moduleName && !tc.caseName && !tc.result) return;
        const modName = tc.moduleName || "Unassigned Module";

        if (!moduleMap[modName]) {
          moduleMap[modName] = {
            id: `agg-${modName}`,
            module: modName,
            total: 0,
            passed: 0,
            failed: 0,
            blocked: 0,
            inProg: 0,
            notExec: 0,
          };
        }
        const row = moduleMap[modName];
        row.total += 1;
        const res = (tc.result ?? "").trim().toLowerCase();
        if (res === "passed") row.passed += 1;
        else if (res === "failed") row.failed += 1;
        else if (res === "blocked") row.blocked += 1;
        else if (res === "in progress") row.inProg += 1;
        else row.notExec += 1;
      });

      res.json(Object.values(moduleMap));
    } catch (err) {
      console.error("Error fetching execution details:", err);
      res.status(500).json({ error: "Database error" });
    }
  } else {
    res.json([]);
  }
});

// Endpoint to POST/SAVE execution details under a Ticket ID (to DB)
router.post("/pmo/execution-details", express.json(), async (req, res) => {
  const { redmineId, details } = req.body;
  if (!redmineId || !Array.isArray(details)) {
    res.status(400).json({ error: "Missing redmineId or details array" });
    return;
  }

  try {
    await db
      .delete(executionSummariesTable)
      .where(eq(executionSummariesTable.redmineTicketId, redmineId));

    for (const row of details) {
      await db.insert(executionSummariesTable).values({
        redmineTicketId: redmineId,
        module: row.module || "",
        total: row.total || 0,
        passed: row.passed || 0,
        failed: row.failed || 0,
        blocked: row.blocked || 0,
        inProgress: row.inProg || 0,
        notExecuted: row.notExec || 0,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving execution details:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ─── Status maps ────────────────────────────────
function mapDefectStatus(s: string): string {
  const v = (s ?? "").toLowerCase().trim();
  if (v === "new") return "new";
  if (["in progress", "inprogress"].includes(v)) return "in_progress";
  if (["for qa test", "forqatest"].includes(v)) return "for_qa_test";
  if (v.includes("reopen")) return "reopen";
  if (v === "done") return "done";
  if (v === "roadblock") return "roadblock";
  if (v === "verified") return "verified";
  if (["closed", "rejected"].includes(v)) return "closed";
  return "new";
}

const DEFECT_TRACKER_WORDS = ["defect", "bug"];
function isDefectTracker(name: string): boolean {
  const t = (name ?? "").toLowerCase();
  return DEFECT_TRACKER_WORDS.some((w) => t.includes(w));
}

// ─── Shared report builder ────────────────────────
function buildReportShape(
  issueId: string,
  main: { subject: string; status: string; projectName: string },
  testItems: Array<{ status: string; category?: string }>,
  defects: Array<any>,
) {
  const defectCounts: Record<string, number> = {
    new: 0,
    in_progress: 0,
    for_qa_test: 0,
    reopen: 0,
    done: 0,
    roadblock: 0,
    verified: 0,
    closed: 0,
  };
  for (const d of defects) {
    const s = mapDefectStatus(d.status);
    if (s in defectCounts) defectCounts[s]++;
  }

  const openDefects = defects.filter(
    (d) => !["verified", "closed"].includes(mapDefectStatus(d.status)),
  ).length;

  const activeDefects = defects
    .filter((d) => !["verified", "closed"].includes(mapDefectStatus(d.status)))
    .map((d) => ({
      id: d.id,
      name: d.subject,
      priority: d.priority,
      status: d.status,
      category: d.category,
      assignee: d.assignee,
      createdAt: d.createdOn,
      reopenedCount: d.reopenedCount || 0, // Ensure field exists
    }));

  return {
    redmineId: issueId,
    generatedAt: new Date().toISOString(),
    source: "redmine",
    issueSubject: main.subject,
    projectName: main.projectName,
    requirements: [],
    testExecution: {
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      inProgress: 0,
      notExecuted: 0,
      passRate: 0,
      successRate: 0,
    },
    moduleDetails: [],
    defects: {
      total: defects.length,
      openRate:
        defects.length > 0
          ? Math.round((openDefects / defects.length) * 10000) / 100
          : 0,
      counts: defectCounts,
    },
    activeDefects,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH 1 — Read from Saved Execution Details
// ═══════════════════════════════════════════════════════════════════════════════

async function reportFromLocalExecutionDetails(
  issueId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const savedRows = await db
      .select()
      .from(executionSummariesTable)
      .where(eq(executionSummariesTable.redmineTicketId, issueId));

    let details: any[] = [];

    if (savedRows.length > 0) {
      details = savedRows.map((r) => ({
        module: r.module,
        total: r.total,
        passed: r.passed,
        failed: r.failed,
        blocked: r.blocked,
        inProg: r.inProgress,
        notExec: r.notExecuted,
      }));
    } else {
      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, issueId));

      if (!file) return null;

      const testCases = await db
        .select()
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      if (testCases.length === 0) return null;

      const moduleMap: Record<string, any> = {};
      testCases.forEach((tc) => {
        if (!tc.moduleName && !tc.caseName && !tc.result) return;
        const modName = tc.moduleName || "Unassigned Module";

        if (!moduleMap[modName]) {
          moduleMap[modName] = {
            module: modName,
            total: 0,
            passed: 0,
            failed: 0,
            blocked: 0,
            inProg: 0,
            notExec: 0,
          };
        }
        const row = moduleMap[modName];
        row.total += 1;
        const res = (tc.result ?? "").trim().toLowerCase();
        if (res === "passed") row.passed += 1;
        else if (res === "failed") row.failed += 1;
        else if (res === "blocked") row.blocked += 1;
        else if (res === "in progress") row.inProg += 1;
        else row.notExec += 1;
      });
      details = Object.values(moduleMap);
    }

    if (details.length === 0) return null;

    let total = 0, passed = 0, failed = 0, blocked = 0, inProgress = 0, notExecuted = 0;
    const moduleDetails: any[] = [];

    for (const row of details) {
      total += row.total;
      passed += row.passed;
      failed += row.failed;
      blocked += row.blocked;
      inProgress += row.inProg;
      notExecuted += row.notExec;

      moduleDetails.push({
        module: row.module,
        total: row.total,
        passed: row.passed,
        failed: row.failed,
        blocked: row.blocked,
        inProgress: row.inProg,
        notExecuted: row.notExec,
        passCompletion:
          row.total > 0 ? Math.round((row.passed / row.total) * 1000) / 10 : 0,
        totalCompletion:
          row.total > 0
            ? Math.round(((row.total - row.notExec) / row.total) * 1000) / 10
            : 0,
      });
    }

    return {
      redmineId: issueId,
      generatedAt: new Date().toISOString(),
      source: "app_dashboard",
      issueSubject: `Ticket #${issueId} Progress`,
      projectName: "",
      requirements: [],
      testExecution: {
        total,
        passed,
        failed,
        blocked,
        inProgress,
        notExecuted,
        passRate: total > 0 ? Math.round((passed / total) * 1000) / 10 : 0,
        successRate:
          total > 0 ? Math.round(((passed + inProgress) / total) * 1000) / 10 : 0,
      },
      moduleDetails,
      defects: { total: 0, openRate: 0, counts: {} },
      activeDefects: [],
    };
  } catch (err) {
    console.error("Error in reportFromLocalExecutionDetails:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE FALLBACKS FOR DEFECTS
// ═══════════════════════════════════════════════════════════════════════════════

async function reportFromMySQL(issueId: string): Promise<Record<string, unknown> | null> {
  if (!mysql2) return null;
  const cfg = {
    host: process.env.REDMINE_DB_HOST ?? "10.10.4.130",
    port: parseInt(process.env.REDMINE_DB_PORT ?? "3306"),
    user: process.env.REDMINE_DB_USER ?? "bestqa",
    password: process.env.REDMINE_DB_PASSWORD ?? "",
    database: process.env.REDMINE_DB_NAME ?? "redmine",
    connectTimeout: 8000, 
  };

  let conn: any = null;
  try {
    conn = await mysql2.createConnection(cfg);
    const [mainRows] = (await conn.query(
      `SELECT i.id, i.subject, i.description,
         s.name AS status, t.name AS tracker,
         e.name AS priority, p.name AS project_name,
         CONCAT(u.firstname,' ',u.lastname) AS assignee
       FROM issues i
       LEFT JOIN issue_statuses s   ON s.id = i.status_id
       LEFT JOIN trackers t         ON t.id = i.tracker_id
       LEFT JOIN enumerations e     ON e.id = i.priority_id AND e.type='IssuePriority'
       LEFT JOIN projects p         ON p.id = i.project_id
       LEFT JOIN users u            ON u.id = i.assigned_to_id
       WHERE i.id = ?`,
      [issueId],
    )) as [any[], any];

    if (!mainRows.length) return null;
    const main = mainRows[0];

    const [childRows] = (await conn.query(
      `SELECT i.id, i.subject, i.created_on, i.status_id,
         s.name AS status, t.name AS tracker,
         e.name AS priority, c.name AS category,
         CONCAT(u.firstname,' ',u.lastname) AS assignee
       FROM issues i
       LEFT JOIN issue_statuses s    ON s.id = i.status_id
       LEFT JOIN trackers t          ON t.id = i.tracker_id
       LEFT JOIN enumerations e      ON e.id = i.priority_id AND e.type='IssuePriority'
       LEFT JOIN issue_categories c  ON c.id = i.category_id
       LEFT JOIN users u             ON u.id = i.assigned_to_id
       WHERE i.parent_id = ?
       ORDER BY t.id, i.id`,
      [issueId],
    )) as [any[], any];

    const [defectRows] = (await conn.query(
      `SELECT i.id, i.subject, i.created_on, i.status_id,
         s.name AS status, t.name AS tracker,
         e.name AS priority, c.name AS category,
         CONCAT(u.firstname,' ',u.lastname) AS assignee
       FROM issues i
       LEFT JOIN issue_statuses s    ON s.id = i.status_id
       LEFT JOIN trackers t          ON t.id = i.tracker_id
       LEFT JOIN enumerations e      ON e.id = i.priority_id AND e.type='IssuePriority'
       LEFT JOIN issue_categories c  ON c.id = i.category_id
       LEFT JOIN users u             ON u.id = i.assigned_to_id
       WHERE (t.name LIKE '%Defect%' OR t.name LIKE '%Bug%')
         AND i.subject LIKE CONCAT('%', ?, '%')
         AND i.status_id != 11
       ORDER BY i.created_on ASC`,
      [issueId],
    )) as [any[], any];

    const defectMap = new Map<number, any>();
    for (const d of defectRows as any[]) {
      defectMap.set(d.id, d);
    }
    for (const d of (childRows as any[]).filter((r) =>
      isDefectTracker(r.tracker ?? ""),
    )) {
      if (d.status_id !== 11) {
        defectMap.set(d.id, d);
      }
    }

    // --- REOPENED LOGIC (MySQL) ---
    const defectIds = Array.from(defectMap.keys());
    const reopenCounts: Record<number, number> = {};

    if (defectIds.length > 0) {
      const placeholders = defectIds.map(() => '?').join(',');

      const [reopenRows] = (await conn.query(
        `SELECT
            j.journalized_id AS issue_id,
            COUNT(*) AS reopen_count
        FROM journal_details jd
        JOIN journals j ON jd.journal_id = j.id
        WHERE jd.prop_key = 'status_id'
          AND jd.value = '8'
          AND j.journalized_id IN (${placeholders})
        GROUP BY j.journalized_id;`,
        defectIds
      )) as [any[], any];

      for (const row of reopenRows) {
        reopenCounts[row.issue_id] = Number(row.reopen_count);
      }
    }

    const defects = Array.from(defectMap.values()).map((d: any) => {
      const isReopenedNow = d.status?.toLowerCase().includes("reopen");
      let count = reopenCounts[d.id] || 0;

      // Smart Heuristic: If it's currently reopened but the query missed the journal, force it to 1
      if (isReopenedNow && count === 0) count = 1;

      return {
        id: d.id,
        subject: d.subject,
        status: d.status ?? "New",
        priority: d.priority ?? "Normal",
        category: d.category ?? "",
        assignee: d.assignee ?? "Unassigned",
        createdOn: d.created_on,
        reopenedCount: count 
      };
    });

    return buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status,
        projectName: main.project_name,
      },
      [],
      defects,
    );
  } catch (err: any) {
    console.error("MySQL report fetching error:", err);
    return null;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function reportFromRedmineAPI(issueId: string): Promise<Record<string, unknown> | null> {
  const baseUrl = (process.env.REDMINE_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.REDMINE_API_KEY ?? "";
  if (!baseUrl || !apiKey) return null;

  const h = { "X-Redmine-API-Key": apiKey, Accept: "application/json" };
  const timeout = 10000;

  const safeJson = async (url: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { headers: h, signal: ctrl.signal });
      return r.ok ? r.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const issueData = await safeJson(`${baseUrl}/issues/${issueId}.json`);
    if (!issueData?.issue) return null;
    const main = issueData.issue;

    const childData = await safeJson(
      `${baseUrl}/issues.json?parent_id=${issueId}&limit=100&status_id=*`,
    );
    const children: any[] = childData?.issues ?? [];

    const defectSearch = await safeJson(
      `${baseUrl}/issues.json?subject=~${issueId}&limit=100&status_id=*`,
    );
    const subjectMatches: any[] = defectSearch?.issues ?? [];

    const defectMap = new Map<number, any>();
    const toNormDefect = (i: any) => ({
      id: i.id,
      subject: i.subject,
      status: i.status?.name ?? "New",
      priority: i.priority?.name ?? "Normal",
      category: i.category?.name ?? "",
      assignee: i.assigned_to?.name ?? "Unassigned",
      createdOn: i.created_on,
      reopenedCount: 0 // Default, will update below
    });

    for (const i of subjectMatches) {
      if (isDefectTracker(i.tracker?.name ?? "") && i.status?.id !== 11)
        defectMap.set(i.id, toNormDefect(i));
    }
    for (const i of children) {
      if (isDefectTracker(i.tracker?.name ?? "") && i.status?.id !== 11)
        defectMap.set(i.id, toNormDefect(i));
    }

    const defects = Array.from(defectMap.values());

    // --- REOPENED LOGIC (API FALLBACK) ---
    // Fetch journals for each defect explicitly to calculate the true reopen count
    await Promise.all(
      defects.map(async (d: any) => {
        try {
          let count = 0;
          const detailedIssue = await safeJson(`${baseUrl}/issues/${d.id}.json?include=journals`);

          if (detailedIssue?.issue?.journals) {
            for (const j of detailedIssue.issue.journals) {
              if (j.details) {
                for (const det of j.details) {
                  // status_id = '8' is ReOpen
                  if (det.property === 'attr' && det.name === 'status_id' && det.new_value === '8') {
                    count++;
                  }
                }
              }
            }
          }

          // Smart heuristic: If it's currently reopened but history missed it somehow, set to 1
          if (count === 0 && d.status.toLowerCase().includes("reopen")) {
            count = 1;
          }

          d.reopenedCount = count;
        } catch {
          // If the detailed fetch fails, use basic fallback
          if (d.status.toLowerCase().includes("reopen")) d.reopenedCount = 1;
        }
      })
    );

    return buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status?.name ?? "",
        projectName: main.project?.name ?? "",
      },
      [],
      defects,
    );
  } catch (err: any) {
    return null;
  }
}

async function reportFromLocalDB(issueId: string): Promise<Record<string, unknown> | null> {
  const reqs = await db.select().from(requirementsTable);
  const matched = reqs.filter(
    (r) =>
      r.redmineTicketId === issueId ||
      r.redmineTicketId === `#${issueId}` ||
      r.title.toLowerCase().includes(issueId.toLowerCase()),
  );
  if (!matched.length) return null;

  const tasks = await db.select().from(tasksTable);
  const users = await db.select().from(usersTable);
  const reqIds = matched.map((r) => r.id);

  const defectTasks = tasks.filter(
    (t) =>
      t.requirementId &&
      reqIds.includes(t.requirementId) &&
      ["bug_fix", "defect", "bug"].includes(t.type),
  );
  const getName = (id: number | null) =>
    id ? (users.find((u) => u.id === id)?.name ?? "Unassigned") : "Unassigned";

  const defects = defectTasks.map((t) => ({
    id: t.id,
    subject: t.name,
    status: t.status,
    priority: "Normal",
    category: "Bug",
    assignee: getName(t.assigneeId),
    createdOn: t.createdAt.toISOString(),
    reopenedCount: t.status.toLowerCase().includes("reopen") ? 1 : 0
  }));

  return buildReportShape(
    issueId,
    { subject: matched[0].title, status: matched[0].status, projectName: "" },
    [],
    defects,
  );
}

// ─── Main route ───────────────────────────────────────────────────────────────

router.get("/pmo/report", async (req, res): Promise<void> => {
  const { redmineId } = req.query;
  if (!redmineId || typeof redmineId !== "string") {
    res.status(400).json({ error: "redmineId query parameter is required" });
    return;
  }
  const cleanId = redmineId.replace(/^#/, "").trim();

  const testData = await reportFromLocalExecutionDetails(cleanId);

  let defectData = await reportFromMySQL(cleanId);
  if (!defectData) {
    defectData = await reportFromRedmineAPI(cleanId);
  }
  if (!defectData) {
    defectData = await reportFromLocalDB(cleanId);
  }

  if (testData && defectData) {
    res.json({
      ...testData,
      defects: defectData.defects,
      activeDefects: defectData.activeDefects,
      issueSubject: defectData.issueSubject || testData.issueSubject,
      projectName: defectData.projectName || testData.projectName,
      source: "app_dashboard",
    });
    return;
  }

  if (testData) {
    res.json(testData);
    return;
  }
  if (defectData) {
    res.json(defectData);
    return;
  }

  res.status(503).json({
    error: `No data found for Redmine #${cleanId}.`,
    help: [
      `Go to "Test Cases > Execution Details" and ensure you have saved Excel data for Ticket #${cleanId}.`,
      `Defect fetching from DB also failed or returned empty.`,
    ],
  });
});

// ─── PMO Send Email ───────────────────────────────────────────────────────────

function generateDonutSvg(
  segments: { value: number; color: string; label: string }[],
  centerLabel: string,
  centerSub: string,
  size = 160,
): string {
  const total = segments.reduce((s, g) => s + g.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const innerR = outerR * 0.62;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  if (total === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#e5e7eb"/>
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="white"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#9ca3af">No data</text>
    </svg>`;
  }

  let startAngle = -90;
  const paths: string[] = [];

  for (const seg of segments) {
    if (seg.value <= 0) continue;
    const angle = (seg.value / total) * 360;
    const endAngle = startAngle + angle;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = cx + outerR * Math.cos(toRad(startAngle));
    const y1 = cy + outerR * Math.sin(toRad(startAngle));
    const x2 = cx + outerR * Math.cos(toRad(endAngle));
    const y2 = cy + outerR * Math.sin(toRad(endAngle));
    const x3 = cx + innerR * Math.cos(toRad(endAngle));
    const y3 = cy + innerR * Math.sin(toRad(endAngle));
    const x4 = cx + innerR * Math.cos(toRad(startAngle));
    const y4 = cy + innerR * Math.sin(toRad(startAngle));

    paths.push(
      `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} A${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(1)} ${y4.toFixed(1)}Z" fill="${seg.color}"/>`,
    );
    startAngle = endAngle;
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${paths.join("\n    ")}
    <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="white"/>
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#111827">${centerLabel}</text>
    <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#6b7280">${centerSub}</text>
  </svg>`;
}

function fmtDate(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function buildEmailHtml(
  reportName: string,
  redmineId: string,
  senderName: string,
  reportData: any,
  riskResult?: any,
  readinessResult?: any,
): string {
  const d = reportData;
  const te = d.testExecution ?? {};
  const defects = d.defects ?? {};
  const activeDefects: any[] = d.activeDefects ?? [];
  const modules: any[] = d.moduleDetails ?? [];
  const generatedAt = fmtDate(); // server time at email send — always current

  const STATUS_COLOR: Record<string, string> = {
    New: "#f59e0b", "In Progress": "#3b82f6", Resolved: "#22c55e",
    Closed: "#6b7280", Feedback: "#a855f7", Rejected: "#ef4444",
    Reopen: "#f97316", Done: "#22c55e", Verified: "#a855f7",
    Roadblock: "#ef4444", Cancelled: "#9ca3af",
  };
  const PRIORITY_COLOR: Record<string, string> = {
    Low: "#6b7280", Normal: "#3b82f6", High: "#f97316",
    Urgent: "#ef4444", Immediate: "#7f1d1d",
  };

  const defectRows = activeDefects.map((def) => {
    const sc = STATUS_COLOR[def.status] ?? "#6b7280";
    const pc = PRIORITY_COLOR[def.priority] ?? "#3b82f6";
    const reopenCount = def.reopenedCount ?? 0;
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;font-size:13px;color:#111827;">#${def.id}</td>
        <td style="padding:8px 10px;font-size:13px;color:#374151;max-width:300px;">${def.name}</td>
        <td style="padding:8px 10px;">
          <span style="background:${sc}22;color:${sc};border:1px solid ${sc}55;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:600;">${def.status}</span>
        </td>
        <td style="padding:8px 10px;">
          <span style="background:${pc}22;color:${pc};border:1px solid ${pc}55;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:600;">${def.priority}</span>
        </td>
        <td style="padding:8px 10px;font-size:12px;color:#6b7280;">${def.assignee ?? "Unassigned"}</td>
        <td style="padding:8px 10px;text-align:center;">
          ${reopenCount > 0
            ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:700;">${reopenCount}</span>`
            : `<span style="font-size:12px;color:#9ca3af;">—</span>`}
        </td>
      </tr>`;
  }).join("");

  const moduleRows = modules.map((m) => {
    const passRate = m.total > 0 ? Math.round((m.passed / m.total) * 100) : 0;
    const execRate = m.total > 0 ? Math.round(((m.total - m.notExecuted) / m.total) * 100) : 0;
    const barColor = passRate >= 80 ? "#22c55e" : passRate >= 50 ? "#f59e0b" : "#ef4444";
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 10px;font-size:13px;color:#374151;">${m.module}</td>
        <td style="padding:8px 10px;font-size:13px;text-align:center;">${m.total}</td>
        <td style="padding:8px 10px;font-size:13px;text-align:center;color:#22c55e;font-weight:600;">${m.passed}</td>
        <td style="padding:8px 10px;font-size:13px;text-align:center;color:#ef4444;">${m.failed}</td>
        <td style="padding:8px 10px;font-size:13px;text-align:center;color:#f97316;">${m.blocked}</td>
        <td style="padding:8px 10px;font-size:13px;text-align:center;color:#6b7280;">${m.notExecuted}</td>
        <td style="padding:8px 10px;">
          <div style="background:#e5e7eb;border-radius:4px;height:10px;width:100%;min-width:80px;">
            <div style="background:${barColor};height:10px;border-radius:4px;width:${passRate}%;"></div>
          </div>
          <span style="font-size:11px;color:#6b7280;">${passRate}% pass / ${execRate}% exec</span>
        </td>
      </tr>`;
  }).join("");

  // Grand total row for module breakdown
  const gt = modules.reduce(
    (a, m) => ({ total: a.total + m.total, passed: a.passed + m.passed, failed: a.failed + m.failed, blocked: a.blocked + m.blocked, notExecuted: a.notExecuted + m.notExecuted }),
    { total: 0, passed: 0, failed: 0, blocked: 0, notExecuted: 0 },
  );
  const gtPassRate = gt.total > 0 ? Math.round((gt.passed / gt.total) * 100) : 0;
  const gtExecRate = gt.total > 0 ? Math.round(((gt.total - gt.notExecuted) / gt.total) * 100) : 0;
  const gtBarColor = gtPassRate >= 80 ? "#22c55e" : gtPassRate >= 50 ? "#f59e0b" : "#ef4444";
  const grandTotalRow = modules.length > 0 ? `
    <tr class="gt-row" style="background:#eff6ff;border-top:2px solid #2563eb;">
      <td class="gt-label" style="padding:10px;font-size:13px;font-weight:700;color:#1e40af;">Grand Total</td>
      <td style="padding:10px;font-size:13px;font-weight:700;text-align:center;color:#111827;">${gt.total}</td>
      <td style="padding:10px;font-size:13px;font-weight:700;text-align:center;color:#15803d;">${gt.passed}</td>
      <td style="padding:10px;font-size:13px;font-weight:700;text-align:center;color:#b91c1c;">${gt.failed}</td>
      <td style="padding:10px;font-size:13px;font-weight:700;text-align:center;color:#c2410c;">${gt.blocked}</td>
      <td style="padding:10px;font-size:13px;font-weight:700;text-align:center;color:#374151;">${gt.notExecuted}</td>
      <td style="padding:10px;">
        <div style="background:#e5e7eb;border-radius:4px;height:10px;width:100%;min-width:80px;">
          <div style="background:${gtBarColor};height:10px;border-radius:4px;width:${gtPassRate}%;"></div>
        </div>
        <span style="font-size:11px;color:#6b7280;font-weight:600;">${gtPassRate}% pass / ${gtExecRate}% exec</span>
      </td>
    </tr>` : "";

  const openCount = Object.entries(defects.counts ?? {})
    .filter(([k]) => !["verified", "closed"].includes(k))
    .reduce((s, [, v]) => s + (v as number), 0);

  // --- CSS segment bars (email-safe, Gmail strips SVG) ---
  const execSegments = [
    { value: te.passed ?? 0,      color: "#4ade80", label: "Passed" },
    { value: te.failed ?? 0,      color: "#f87171", label: "Failed" },
    { value: te.blocked ?? 0,     color: "#fb923c", label: "Blocked" },
    { value: te.inProgress ?? 0,  color: "#60a5fa", label: "In Progress" },
    { value: te.notExecuted ?? 0, color: "#94a3b8", label: "Not Executed" },
  ];
  const execTotal = te.total ?? 0;

  const defectStatusColors: Record<string, string> = {
    new: "#facc15", in_progress: "#60a5fa", for_qa_test: "#3b82f6",
    reopen: "#fb923c", done: "#4ade80", roadblock: "#f87171",
    verified: "#a855f7", closed: "#9ca3af",
  };
  const defectSegments = Object.entries(defects.counts ?? {})
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => ({ value: v as number, color: defectStatusColors[k] ?? "#9ca3af", label: k.replace(/_/g, " ") }));
  const defectTotal = defects.total ?? 0;

  const makeBar = (segs: {value:number;color:string}[], total: number) => {
    if (total === 0) return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td style="background:#e5e7eb;height:20px;border-radius:10px;"></td></tr></table>`;
    const cells = segs.filter(s => s.value > 0).map(s => {
      const w = Math.max(1, Math.round((s.value / total) * 100));
      return `<td width="${w}%" style="background:${s.color};height:20px;"></td>`;
    }).join("");
    return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;"><tr>${cells}</tr></table>`;
  };

  const makeLegendTable = (segs: {value:number;color:string;label:string}[]) => {
    const rows = segs.map(s =>
      `<tr>
        <td style="padding:3px 8px 3px 0;vertical-align:middle;">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></div>
        </td>
        <td style="padding:3px 16px 3px 0;font-size:12px;color:#374151;white-space:nowrap;">${s.label}</td>
        <td style="padding:3px 0;font-size:12px;font-weight:700;color:#111827;text-align:right;">${s.value}</td>
      </tr>`).join("");
    return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>`;
  };

  const execBar     = makeBar(execSegments, execTotal);
  const defectBar   = makeBar(defectSegments, defectTotal);
  const execLegend  = makeLegendTable(execSegments);
  const defectLegend = makeLegendTable(defectSegments);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    @media (prefers-color-scheme: dark) {
      body { background-color: #0f172a !important; }
      .email-wrap { background-color: #1e293b !important; }
      .section-border { border-color: #334155 !important; }
      .summary-card { border-color: #334155 !important; background-color: #0f172a !important; }
      .summary-title { color: #f1f5f9 !important; }
      .summary-sub { color: #94a3b8 !important; }
      .summary-id { color: #93c5fd !important; }
      .section-heading { color: #f1f5f9 !important; }
      .content-text { color: #cbd5e1 !important; }
      .muted-text { color: #64748b !important; }
      .table-head-row { background-color: #0f172a !important; }
      .table-head-cell { color: #94a3b8 !important; }
      .table-row { border-color: #334155 !important; }
      .cell-text { color: #e2e8f0 !important; }
      .cell-muted { color: #94a3b8 !important; }
      .stat-card-blue { background-color: #1e3a5f !important; }
      .stat-card-green { background-color: #14532d !important; }
      .stat-card-red { background-color: #7f1d1d !important; }
      .stat-card-orange { background-color: #7c2d12 !important; }
      .stat-card-gray { background-color: #1e293b !important; border: 1px solid #334155 !important; }
      .stat-val-blue { color: #60a5fa !important; }
      .stat-val-green { color: #4ade80 !important; }
      .stat-val-red { color: #f87171 !important; }
      .stat-val-orange { color: #fb923c !important; }
      .stat-val-gray { color: #94a3b8 !important; }
      .footer-bar { background-color: #0f172a !important; border-color: #334155 !important; }
      .footer-text { color: #64748b !important; }
      .gt-row { background-color: #1e3a5f !important; }
      .gt-label { color: #93c5fd !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
  <div class="email-wrap" style="max-width:900px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header — uses bgcolor table attribute so gradient failure still shows dark bg -->
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td bgcolor="#1a3a6e" style="padding:28px 32px;background:linear-gradient(135deg,#1a3a6e 0%,#2563eb 100%);">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#93c5fd;margin-bottom:6px;">QA Pulse &nbsp;·&nbsp; PMO Report</div>
          <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">QA Pulse — Report Dashboard</div>
          <div style="font-size:13px;color:#bfdbfe;margin-top:4px;">Generated: ${generatedAt}</div>
          <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Sent by ${senderName}</div>
        </td>
      </tr>
    </table>

    <!-- Summary Card -->
    <div class="section-border" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="summary-card" style="border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;text-align:center;">
        <div class="summary-title" style="font-size:17px;font-weight:700;color:#111827;margin-bottom:6px;">Test Execution &amp; Defect Status Summary</div>
        <div class="summary-sub" style="font-size:12px;color:#6b7280;margin-bottom:10px;">as of ${generatedAt}</div>
        <div class="summary-id" style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">#${redmineId}${d.issueSubject ? ` — ${d.issueSubject}` : ""}</div>
        ${d.projectName ? `<div class="summary-sub" style="font-size:12px;color:#6b7280;margin-bottom:2px;">Project: ${d.projectName}</div>` : ""}
        <div class="muted-text" style="font-size:12px;color:#9ca3af;">Redmine #${redmineId}</div>
      </div>
    </div>

    <!-- AI: Bug Prediction (if calculated) -->
    ${riskResult ? `
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;border-left:4px solid #8b5cf6;padding-left:12px;">AI Bug Prediction &amp; Risk Scoring</div>
      <div style="background:#f5f3ff;border-radius:8px;padding:16px 20px;margin-bottom:12px;">
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">${riskResult.summary ?? ""}</div>
        <div style="font-size:13px;color:#6b7280;">Overall Risk: <strong style="color:#7c3aed;">${riskResult.overallRisk ?? "N/A"}</strong></div>
      </div>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        ${(riskResult.modules ?? []).map((m: any) => {
          const level = m.riskLevel ?? m.risk ?? "";
          const bg = level === "critical" ? "#fee2e2" : level === "high" ? "#ffedd5" : level === "medium" ? "#fef9c3" : "#dcfce7";
          const fg = level === "critical" ? "#b91c1c" : level === "high" ? "#c2410c" : level === "medium" ? "#92400e" : "#15803d";
          return `<tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:6px 8px;font-size:12px;color:#374151;">${m.name ?? m.module ?? ""}</td>
            <td style="padding:6px 8px;width:90px;">
              <span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:9999px;background:${bg};color:${fg};">${level}</span>
            </td>
            <td style="padding:6px 8px;font-size:11px;color:#6b7280;">${m.reason ?? m.summary ?? ""}</td>
          </tr>`;
        }).join("")}
      </table>
    </div>` : ""}

    <!-- AI: Release Readiness (if calculated) -->
    ${readinessResult ? `
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;border-left:4px solid #0ea5e9;padding-left:12px;">Release Readiness Score</div>
      <div style="background:#f0f9ff;border-radius:8px;padding:16px 20px;">
        <span style="font-size:28px;font-weight:700;color:${readinessResult.readinessScore >= 80 ? "#15803d" : readinessResult.readinessScore >= 50 ? "#b45309" : "#b91c1c"};">${readinessResult.readinessScore}%</span>
        <span style="font-size:13px;font-weight:500;margin-left:10px;padding:3px 12px;border-radius:9999px;background:${readinessResult.status === "ready" ? "#dcfce7" : readinessResult.status === "caution" ? "#fef9c3" : "#fee2e2"};color:${readinessResult.status === "ready" ? "#15803d" : readinessResult.status === "caution" ? "#92400e" : "#b91c1c"};">${(readinessResult.status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
        <div style="font-size:13px;color:#374151;margin-top:10px;">${readinessResult.summary ?? ""}</div>
      </div>
    </div>` : ""}

    <!-- Test Execution -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #2563eb;padding-left:12px;">Test Execution</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:14px;">
        <tr>
          <td style="vertical-align:middle;padding-right:24px;width:140px;">
            <div style="font-size:30px;font-weight:700;color:#15803d;">${te.passRate ?? 0}%</div>
            <div style="font-size:11px;color:#6b7280;">Pass Rate</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Total: <strong>${execTotal}</strong></div>
          </td>
          <td style="vertical-align:middle;">${execLegend}</td>
        </tr>
      </table>
      ${execBar}
      <div style="margin-top:8px;font-size:12px;color:#6b7280;">
        Pass Rate: <strong style="color:#15803d;">${te.passRate ?? 0}%</strong>
        &nbsp;·&nbsp; Success Rate: <strong style="color:#1d4ed8;">${te.successRate ?? 0}%</strong>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
        ${[
          { label: "Total", val: te.total ?? 0, color: "#1e40af", bg: "#dbeafe" },
          { label: "Passed", val: te.passed ?? 0, color: "#15803d", bg: "#dcfce7" },
          { label: "Failed", val: te.failed ?? 0, color: "#b91c1c", bg: "#fee2e2" },
          { label: "Blocked", val: te.blocked ?? 0, color: "#c2410c", bg: "#ffedd5" },
          { label: "In Progress", val: te.inProgress ?? 0, color: "#1d4ed8", bg: "#dbeafe" },
          { label: "Not Executed", val: te.notExecuted ?? 0, color: "#374151", bg: "#f3f4f6" },
        ].map(c => `<div style="background:${c.bg};border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div style="font-size:22px;font-weight:700;color:${c.color};">${c.val}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">${c.label}</div>
        </div>`).join("")}
      </div>
    </div>

    <!-- Module Breakdown -->
    ${modules.length > 0 ? `
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #8b5cf6;padding-left:12px;">Module Breakdown</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Module</th>
            <th style="padding:10px;text-align:center;color:#6b7280;font-weight:600;">Total</th>
            <th style="padding:10px;text-align:center;color:#22c55e;font-weight:600;">Pass</th>
            <th style="padding:10px;text-align:center;color:#ef4444;font-weight:600;">Fail</th>
            <th style="padding:10px;text-align:center;color:#f97316;font-weight:600;">Block</th>
            <th style="padding:10px;text-align:center;color:#6b7280;font-weight:600;">Not Exec</th>
            <th style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Progress</th>
          </tr>
        </thead>
        <tbody>${moduleRows}${grandTotalRow}</tbody>
      </table>
    </div>` : ""}

    <!-- Defect Status -->
    <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #ef4444;padding-left:12px;">Defect Status</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:14px;">
        <tr>
          <td style="vertical-align:middle;padding-right:24px;width:140px;">
            <div style="font-size:30px;font-weight:700;color:#b91c1c;">${defectTotal}</div>
            <div style="font-size:11px;color:#6b7280;">Total Defects</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">Open: <strong style="color:#c2410c;">${openCount}</strong></div>
          </td>
          <td style="vertical-align:middle;">${defectLegend || '<span style="font-size:12px;color:#9ca3af;">No defects</span>'}</td>
        </tr>
      </table>
      ${defectBar}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
        <div style="background:#fee2e2;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div style="font-size:22px;font-weight:700;color:#b91c1c;">${defectTotal}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">Total</div>
        </div>
        <div style="background:#ffedd5;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div style="font-size:22px;font-weight:700;color:#c2410c;">${openCount}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">Open</div>
        </div>
        <div style="background:#dcfce7;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div style="font-size:22px;font-weight:700;color:#15803d;">${(defects.counts?.verified ?? 0) + (defects.counts?.closed ?? 0)}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">Closed/Verified</div>
        </div>
        <div style="background:#fff7ed;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div style="font-size:22px;font-weight:700;color:#92400e;">${defects.openRate ?? 0}%</div>
          <div style="font-size:10px;color:#6b7280;margin-top:2px;">Open Rate</div>
        </div>
      </div>
    </div>

    <!-- Active Defects Table -->
    ${activeDefects.length > 0 ? `
    <div style="padding:24px 32px 32px;">
      <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #f59e0b;padding-left:12px;">Active Defects (${activeDefects.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr class="table-head-row" style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">ID</th>
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Subject</th>
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Status</th>
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Priority</th>
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Assignee</th>
            <th class="table-head-cell" style="padding:10px;text-align:center;color:#6b7280;font-weight:600;">Reopen</th>
          </tr>
        </thead>
        <tbody>${defectRows}</tbody>
      </table>
    </div>` : ""}

    <!-- Footer -->
    <div class="footer-bar" style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      <span class="footer-text">This report was automatically generated by QA Pulse &nbsp;·&nbsp; ${generatedAt}</span><br>
      <span class="footer-text">List of the Open Defect is attached to this email.</span>
    </div>
  </div>
</body>
</html>`;
}

router.post("/pmo/send-email", async (req, res) => {
  const { reportName, redmineId, reportData, senderName, riskResult, readinessResult } = req.body;

  if (!reportData) {
    res.status(400).json({ error: "Missing reportData" });
    return;
  }

  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpSecure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? smtpUser;
  const emailTo = process.env.PMO_EMAIL_TO ?? "qa.services@bestinet.com.my";
  const emailCc = process.env.PMO_EMAIL_CC ?? "syamil.samat@bestinet.com,raimi.rosman@bestinet.com.my";

  if (!nodemailer) {
    res.status(500).json({ error: "nodemailer is not installed. Run: pnpm install in artifacts/api-server" });
    return;
  }

  if (!smtpUser || !smtpPass) {
    res.status(500).json({
      error: "Email not configured. Set SMTP_USER and SMTP_PASS environment variables.",
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = `[QA Report] ${reportName ?? `Redmine #${redmineId}`}`;
    const htmlBody = buildEmailHtml(
      reportName ?? `Ticket #${redmineId}`,
      redmineId ?? "",
      senderName ?? "QA Team",
      reportData,
      riskResult,
      readinessResult,
    );

    // Build Excel attachment from open defects
    const attachments: any[] = [];
    const activeDefects: any[] = reportData.activeDefects ?? [];
    if (xlsx && activeDefects.length > 0) {
      const rows = activeDefects.map((def: any) => ({
        "ID": `#${def.id}`,
        "Subject": def.name ?? "",
        "Status": def.status ?? "",
        "Priority": def.priority ?? "",
        "Category": def.category ?? "",
        "Assignee": def.assignee ?? "Unassigned",
        "Created At": def.createdAt ? fmtDate(def.createdAt) : "",
        "Reopened Count": def.reopenedCount ?? 0,
      }));
      const ws = xlsx.utils.json_to_sheet(rows);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Open Defects");
      const xlsxBuffer: Buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
      attachments.push({
        filename: `Open_Defects_${redmineId ?? "report"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        content: xlsxBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }

    await transporter.sendMail({
      from: `"QA Pulse" <${emailFrom}>`,
      to: emailTo,
      cc: emailCc,
      subject,
      html: htmlBody,
      attachments,
    });

    res.json({ success: true, message: `Report sent to ${emailTo}` });
  } catch (err: any) {
    console.error("PMO email send error:", err);
    res.status(500).json({ error: err.message ?? "Failed to send email" });
  }
});

export default router;