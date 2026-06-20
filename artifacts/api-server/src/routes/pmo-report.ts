import { Router, type IRouter } from "express";
import express from "express";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";

let nodemailer: any = null;
try {
  nodemailer = require("nodemailer");
} catch {}

let xlsx: any = null;
try {
  xlsx = require("xlsx");
} catch {}

let puppeteer: any = null;
try {
  puppeteer = require("puppeteer");
} catch {}

function findSystemChromium(): string | undefined {
  // Prefer env override, then search PATH (Nix/Replit installs chromium here)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    const p = execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null", { encoding: "utf8" }).trim();
    return p || undefined;
  } catch {
    return undefined;
  }
}

async function htmlToScreenshot(html: string): Promise<Buffer> {
  if (!puppeteer) throw new Error("puppeteer is not installed");
  const executablePath = findSystemChromium();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 940, height: 800 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
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

    const shape = buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status,
        projectName: main.project_name,
      },
      [],
      defects,
    );
    (shape as any).trackerName = main.tracker ?? "";
    return shape;
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

    const shape = buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status?.name ?? "",
        projectName: main.project?.name ?? "",
      },
      [],
      defects,
    );
    (shape as any).trackerName = main.tracker?.name ?? "";
    return shape;
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
      trackerName: (defectData as any).trackerName || (testData as any).trackerName || "",
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
  const tz = process.env.REPORT_TIMEZONE ?? "Asia/Kuala_Lumpur";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
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
      <tr class="def-row" style="border-bottom:1px solid #e5e7eb;">
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

  const moduleRows = modules.map((m, idx) => {
    const passRate = m.total > 0 ? Math.round((m.passed / m.total) * 100) : 0;
    const execRate = m.total > 0 ? Math.round(((m.total - m.notExecuted) / m.total) * 100) : 0;
    const barColor = passRate >= 80 ? "#22C55E" : passRate >= 50 ? "#F59E0B" : "#EF4444";
    const rowCls = idx % 2 === 0 ? "mod-row-even" : "mod-row-odd";
    return `
      <tr class="${rowCls}" style="border-bottom:1px solid #e5e7eb;">
        <td class="mod-name" style="padding:9px 10px;font-size:13px;color:#374151;">${m.module}</td>
        <td style="padding:9px 10px;font-size:13px;text-align:center;color:#374151;">${m.total}</td>
        <td style="padding:9px 10px;font-size:13px;text-align:center;color:#16A34A;font-weight:700;">${m.passed}</td>
        <td style="padding:9px 10px;font-size:13px;text-align:center;color:#DC2626;font-weight:700;">${m.failed}</td>
        <td style="padding:9px 10px;font-size:13px;text-align:center;color:#EA580C;font-weight:700;">${m.blocked}</td>
        <td style="padding:9px 10px;font-size:13px;text-align:center;color:#6B7280;">${m.notExecuted}</td>
        <td style="padding:9px 10px;">
          <div class="mod-track" style="background:#e5e7eb;border-radius:4px;height:12px;width:100%;min-width:80px;">
            <div style="background:${barColor};height:12px;border-radius:4px;width:${passRate}%;"></div>
          </div>
          <span class="muted-text" style="font-size:11px;color:#6b7280;">${passRate}% pass / ${execRate}% exec</span>
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
        <div class="gt-track" style="background:#e5e7eb;border-radius:4px;height:12px;width:100%;min-width:80px;">
          <div style="background:${gtBarColor};height:12px;border-radius:4px;width:${gtPassRate}%;"></div>
        </div>
        <span class="muted-text" style="font-size:11px;color:#6b7280;font-weight:600;">${gtPassRate}% pass / ${gtExecRate}% exec</span>
      </td>
    </tr>` : "";

  const openCount = Object.entries(defects.counts ?? {})
    .filter(([k]) => !["verified", "closed"].includes(k))
    .reduce((s, [, v]) => s + (v as number), 0);

  // --- CSS segment bars (email-safe, Gmail strips SVG) ---
  // Use vibrant spec colors so they pop on both light and dark backgrounds
  const execSegments = [
    { value: te.passed ?? 0,      color: "#22C55E", label: "Passed" },
    { value: te.failed ?? 0,      color: "#EF4444", label: "Failed" },
    { value: te.blocked ?? 0,     color: "#F97316", label: "Blocked" },
    { value: te.inProgress ?? 0,  color: "#3B82F6", label: "In Progress" },
    { value: te.notExecuted ?? 0, color: "#6B7280", label: "Not Executed" },
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
    if (total === 0) return `<table class="seg-bar" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr><td style="background:#e5e7eb;height:28px;border-radius:10px;"></td></tr></table>`;
    const cells = segs.filter(s => s.value > 0).map(s => {
      const w = Math.max(1, Math.round((s.value / total) * 100));
      return `<td width="${w}%" style="background:${s.color};height:28px;"></td>`;
    }).join("");
    return `<table class="seg-bar" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-radius:10px;overflow:hidden;"><tr>${cells}</tr></table>`;
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
    /* ═══════════════════════════════════════════════
       DARK MODE DESIGN SYSTEM
       Primary bg   : #0F172A   Card bg  : #1E293B
       Borders      : #334155   Dividers : #1E293B
       Title text   : #F9FAFB   Body     : #CBD5E1
       Muted        : #94A3B8
       Success      : #22C55E   Fail     : #EF4444
       Warning      : #F97316   Info     : #3B82F6
       ─────────────────────────────────────────────
       Applies in: Apple Mail, Outlook.com, Samsung Mail
       Gmail handled by [data-ogsc] block below.
    ═══════════════════════════════════════════════ */
    @media (prefers-color-scheme: dark) {
      /* ── Layout ── */
      body        { background-color: #0F172A !important; }
      .email-wrap { background-color: #111827 !important; box-shadow: 0 8px 48px rgba(0,0,0,0.9) !important; }

      /* ── Section wrappers ── */
      .sec-wrap       { background-color: #111827 !important; border-color: #334155 !important; }
      .section-border { border-color: #334155 !important; }

      /* ── Section headings ── */
      .sec-hd { color: #F9FAFB !important; }

      /* ── Summary card ── */
      .summary-card  { border-color: #3B82F6 !important; background-color: #1E293B !important; }
      .summary-title { color: #F9FAFB !important; font-weight: 800 !important; }
      .summary-sub   { color: #94A3B8 !important; }
      .summary-id    { color: #60A5FA !important; }

      /* ── Pass-rate KPI ── */
      .pr-num   { color: #22C55E !important; }
      .pr-label { color: #94A3B8 !important; }
      .pr-line  { color: #64748B !important; }

      /* ── Progress bars — main segment bar ── */
      .seg-bar { border-radius: 10px !important; overflow: hidden !important; }

      /* ── Progress bars — mini bars in table ── */
      .mod-track { background-color: #374151 !important; }
      .gt-track  { background-color: #374151 !important; }

      /* ── KPI tiles — Test Execution ── */
      .t-total { background-color: #1E293B !important; border: 1px solid #334155 !important; }
      .t-pass  { background-color: #052E16 !important; border: 1px solid #166534 !important; }
      .t-fail  { background-color: #450A0A !important; border: 1px solid #991B1B !important; }
      .t-block { background-color: #431407 !important; border: 1px solid #9A3412 !important; }
      .t-prog  { background-color: #0F2D5E !important; border: 1px solid #1D4ED8 !important; }
      .t-nexec { background-color: #1F2937 !important; border: 1px solid #374151 !important; }

      .t-total .kn { color: #A78BFA !important; }
      .t-pass  .kn { color: #22C55E !important; }
      .t-fail  .kn { color: #EF4444 !important; }
      .t-block .kn { color: #F97316 !important; }
      .t-prog  .kn { color: #3B82F6 !important; }
      .t-nexec .kn { color: #6B7280 !important; }
      .kl { color: #64748B !important; }

      /* ── Defect KPI headline ── */
      .defect-kpi-num { color: #EF4444 !important; }
      .defect-kpi-lbl { color: #94A3B8 !important; }

      /* ── KPI tiles — Defect Status ── */
      .d-total { background-color: #450A0A !important; border: 1px solid #991B1B !important; }
      .d-open  { background-color: #431407 !important; border: 1px solid #9A3412 !important; }
      .d-closd { background-color: #052E16 !important; border: 1px solid #166534 !important; }
      .d-rate  { background-color: #431407 !important; border: 1px solid #9A3412 !important; }

      .d-total .kn { color: #EF4444 !important; }
      .d-open  .kn { color: #F97316 !important; }
      .d-closd .kn { color: #22C55E !important; }
      .d-rate  .kn { color: #F97316 !important; }

      /* ── Module table ── */
      .table-head-row  { background-color: #1E293B !important; border-bottom-color: #334155 !important; }
      .table-head-cell { color: #94A3B8 !important; }
      .mod-row-even    { background-color: #1E293B !important; border-color: #334155 !important; }
      .mod-row-odd     { background-color: #0F172A !important; border-color: #334155 !important; }
      .mod-name        { color: #CBD5E1 !important; }

      /* ── Grand total ── */
      .gt-row   { background-color: #0F2D5E !important; border-top-color: #3B82F6 !important; }
      .gt-label { color: #60A5FA !important; }

      /* ── Footer ── */
      .footer-bar  { background-color: #0F172A !important; border-top-color: #334155 !important; }
      .footer-text { color: #4B5563 !important; }

      /* ── Generic ── */
      .content-text { color: #CBD5E1 !important; }
      .muted-text   { color: #94A3B8 !important; }

      /* ── AI Bug Prediction inner boxes ── */
      .ai-sum-box  { background-color: #1E293B !important; }
      .ai-sum-box div { color: #94A3B8 !important; }
      .ai-sum-box strong { color: #C4B5FD !important; }
      .risk-card   { background-color: #1E293B !important; border-color: #334155 !important; }
      .risk-card td { color: #CBD5E1 !important; }
      .risk-card span { color: #CBD5E1 !important; }
      .risk-card li { color: #94A3B8 !important; }
      .reco-box    { background-color: #1E3A5F !important; color: #93C5FD !important; }

      /* ── Release Readiness inner boxes ── */
      .rr-score-box { background-color: #0C2340 !important; }
      .rr-score-box div { color: #CBD5E1 !important; }
      .rr-date-box  { background-color: #1E293B !important; border-color: #334155 !important; }
      .rr-date-box span { color: #CBD5E1 !important; }

      /* ── Active Defects table rows ── */
      .def-row { border-color: #334155 !important; }
      .def-row td { color: #CBD5E1 !important; }
    }

    /* ═══════════════════════════════════════════════
       GMAIL DARK MODE OVERRIDE
       Gmail injects [data-ogsc] on <html> when
       auto-darkening. Mirror all rules here.
    ═══════════════════════════════════════════════ */
    [data-ogsc] body        { background-color: #0F172A !important; }
    [data-ogsc] .email-wrap { background-color: #111827 !important; }
    [data-ogsc] .sec-hd    { color: #F9FAFB !important; }
    [data-ogsc] .sec-wrap  { background-color: #111827 !important; border-color: #334155 !important; }
    [data-ogsc] .summary-card  { background-color: #1E293B !important; border-color: #3B82F6 !important; }
    [data-ogsc] .summary-title { color: #F9FAFB !important; }
    [data-ogsc] .summary-sub   { color: #94A3B8 !important; }
    [data-ogsc] .summary-id    { color: #60A5FA !important; }
    [data-ogsc] .pr-num   { color: #22C55E !important; }
    [data-ogsc] .pr-label { color: #94A3B8 !important; }
    [data-ogsc] .t-total { background-color: #1E293B !important; border-color: #334155 !important; }
    [data-ogsc] .t-pass  { background-color: #052E16 !important; border-color: #166534 !important; }
    [data-ogsc] .t-fail  { background-color: #450A0A !important; border-color: #991B1B !important; }
    [data-ogsc] .t-block { background-color: #431407 !important; border-color: #9A3412 !important; }
    [data-ogsc] .t-prog  { background-color: #0F2D5E !important; border-color: #1D4ED8 !important; }
    [data-ogsc] .t-nexec { background-color: #1F2937 !important; border-color: #374151 !important; }
    [data-ogsc] .t-total .kn { color: #A78BFA !important; }
    [data-ogsc] .t-pass  .kn { color: #22C55E !important; }
    [data-ogsc] .t-fail  .kn { color: #EF4444 !important; }
    [data-ogsc] .t-block .kn { color: #F97316 !important; }
    [data-ogsc] .t-prog  .kn { color: #3B82F6 !important; }
    [data-ogsc] .t-nexec .kn { color: #6B7280 !important; }
    [data-ogsc] .kl { color: #64748B !important; }
    [data-ogsc] .defect-kpi-num { color: #EF4444 !important; }
    [data-ogsc] .defect-kpi-lbl { color: #94A3B8 !important; }
    [data-ogsc] .d-total { background-color: #450A0A !important; }
    [data-ogsc] .d-open  { background-color: #431407 !important; }
    [data-ogsc] .d-closd { background-color: #052E16 !important; }
    [data-ogsc] .d-total .kn { color: #EF4444 !important; }
    [data-ogsc] .d-open  .kn { color: #F97316 !important; }
    [data-ogsc] .d-closd .kn { color: #22C55E !important; }
    [data-ogsc] .table-head-row { background-color: #1E293B !important; }
    [data-ogsc] .mod-row-even   { background-color: #1E293B !important; }
    [data-ogsc] .mod-row-odd    { background-color: #0F172A !important; }
    [data-ogsc] .mod-track { background-color: #374151 !important; }
    [data-ogsc] .gt-track  { background-color: #374151 !important; }
    [data-ogsc] .gt-row    { background-color: #0F2D5E !important; border-top-color: #3B82F6 !important; }
    [data-ogsc] .gt-label  { color: #60A5FA !important; }
    [data-ogsc] .footer-bar  { background-color: #0F172A !important; }
    [data-ogsc] .footer-text { color: #4B5563 !important; }
    [data-ogsc] .muted-text  { color: #94A3B8 !important; }
    [data-ogsc] .ai-sum-box  { background-color: #1E293B !important; }
    [data-ogsc] .ai-sum-box div { color: #94A3B8 !important; }
    [data-ogsc] .ai-sum-box strong { color: #C4B5FD !important; }
    [data-ogsc] .risk-card   { background-color: #1E293B !important; border-color: #334155 !important; }
    [data-ogsc] .risk-card td { color: #CBD5E1 !important; }
    [data-ogsc] .risk-card span { color: #CBD5E1 !important; }
    [data-ogsc] .risk-card li { color: #94A3B8 !important; }
    [data-ogsc] .reco-box    { background-color: #1E3A5F !important; color: #93C5FD !important; }
    [data-ogsc] .rr-score-box { background-color: #0C2340 !important; }
    [data-ogsc] .rr-score-box div { color: #CBD5E1 !important; }
    [data-ogsc] .rr-date-box  { background-color: #1E293B !important; border-color: #334155 !important; }
    [data-ogsc] .rr-date-box span { color: #CBD5E1 !important; }
    [data-ogsc] .def-row { border-color: #334155 !important; }
    [data-ogsc] .def-row td { color: #CBD5E1 !important; }
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
    <div class="sec-wrap" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;border-left:4px solid #8b5cf6;padding-left:12px;">AI Bug Prediction &amp; Risk Scoring</div>
      <div class="ai-sum-box" style="background:#f5f3ff;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <div style="font-size:13px;color:#374151;margin-bottom:8px;">${riskResult.summary ?? ""}</div>
        <div style="font-size:13px;color:#6b7280;">Overall Risk: <strong style="color:#7c3aed;">${riskResult.overallRisk ?? "N/A"}</strong></div>
      </div>
      ${(riskResult.modules ?? []).map((m: any) => {
        const level = m.riskLevel ?? m.risk ?? "";
        const score = m.riskScore ?? 0;
        const bg = level === "critical" ? "#fee2e2" : level === "high" ? "#ffedd5" : level === "medium" ? "#fef9c3" : "#dcfce7";
        const fg = level === "critical" ? "#b91c1c" : level === "high" ? "#c2410c" : level === "medium" ? "#92400e" : "#15803d";
        const barColor = (level === "high" || level === "critical") ? "#ef4444" : level === "medium" ? "#f59e0b" : "#22c55e";
        const reasons: string[] = m.reasons ?? [];
        const recommendation: string = m.recommendation ?? "";
        return `<div class="risk-card" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:10px;">
          <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:${(reasons.length > 0 || recommendation) ? "10px" : "0"};">
            <tr>
              <td style="font-size:13px;font-weight:600;color:#111827;">${m.name ?? m.module ?? ""}</td>
              <td style="text-align:right;white-space:nowrap;">
                <span style="font-size:12px;font-weight:700;color:#374151;margin-right:8px;">${score}</span>
                <table style="display:inline-table;border-collapse:collapse;width:80px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;vertical-align:middle;" cellspacing="0" cellpadding="0"><tr><td style="width:${score}%;background:${barColor};height:8px;"></td><td></td></tr></table>
                <span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:9999px;background:${bg};color:${fg};margin-left:8px;">${level}</span>
              </td>
            </tr>
          </table>
          ${reasons.length > 0 ? `<ul style="margin:0 0 6px 0;padding-left:18px;">${reasons.map((r: string) => `<li style="font-size:11px;color:#6b7280;margin-bottom:3px;">${r}</li>`).join("")}</ul>` : ""}
          ${recommendation ? `<div class="reco-box" style="font-size:11px;color:#1d4ed8;background:#eff6ff;border-radius:4px;padding:6px 10px;margin-top:4px;">${recommendation}</div>` : ""}
        </div>`;
      }).join("")}
    </div>` : ""}

    <!-- AI: Release Readiness (if calculated) -->
    ${readinessResult ? `
    <div class="sec-wrap" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px;border-left:4px solid #0ea5e9;padding-left:12px;">Release Readiness Score</div>
      <div class="rr-score-box" style="background:#f0f9ff;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px;">
        <div style="font-size:40px;font-weight:700;color:${readinessResult.readinessScore >= 80 ? "#15803d" : readinessResult.readinessScore >= 50 ? "#b45309" : "#b91c1c"};">${readinessResult.readinessScore}%</div>
        <div style="margin-top:8px;">
          <span style="font-size:13px;font-weight:500;padding:4px 14px;border-radius:9999px;background:${readinessResult.status === "ready" ? "#dcfce7" : readinessResult.status === "caution" ? "#fef9c3" : "#fee2e2"};color:${readinessResult.status === "ready" ? "#15803d" : readinessResult.status === "caution" ? "#92400e" : "#b91c1c"};">${readinessResult.status === "ready" ? "Release Ready" : readinessResult.status === "caution" ? "Caution" : (readinessResult.status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
        </div>
        ${(readinessResult.verdict ?? readinessResult.summary) ? `<div style="font-size:13px;color:#374151;margin-top:12px;text-align:center;">${readinessResult.verdict ?? readinessResult.summary}</div>` : ""}
        ${readinessResult.expectedReleaseDate ? `<div class="rr-date-box" style="margin-top:14px;background:#fff;border:1px solid #e0f2fe;border-radius:8px;padding:10px 16px;text-align:left;font-size:13px;"><span style="font-weight:600;color:#111827;">Expected Release: </span><span style="color:#374151;">${readinessResult.expectedReleaseDate}</span></div>` : ""}
      </div>
      ${((readinessResult.positives ?? []).length > 0 || (readinessResult.blockers ?? []).length > 0) ? `
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          ${(readinessResult.positives ?? []).length > 0 ? `
          <td style="vertical-align:top;padding-right:12px;width:50%;">
            <div style="font-size:13px;font-weight:600;color:#15803d;margin-bottom:8px;">Positive Signals</div>
            <ul style="margin:0;padding-left:18px;">
              ${(readinessResult.positives ?? []).map((p: string) => `<li style="font-size:12px;color:#374151;margin-bottom:4px;">${p}</li>`).join("")}
            </ul>
          </td>` : ""}
          ${(readinessResult.blockers ?? []).length > 0 ? `
          <td style="vertical-align:top;padding-left:12px;width:50%;">
            <div style="font-size:13px;font-weight:600;color:#b91c1c;margin-bottom:8px;">Blockers</div>
            <ul style="margin:0;padding-left:18px;">
              ${(readinessResult.blockers ?? []).map((b: string) => `<li style="font-size:12px;color:#374151;margin-bottom:4px;">${b}</li>`).join("")}
            </ul>
          </td>` : ""}
        </tr>
      </table>` : ""}
    </div>` : ""}

    <!-- Test Execution -->
    <div class="sec-wrap" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #2563eb;padding-left:12px;">Test Execution</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="vertical-align:middle;padding-right:28px;width:160px;">
            <div class="pr-num" style="font-size:44px;font-weight:800;color:#16A34A;line-height:1;">${te.passRate ?? 0}%</div>
            <div class="pr-label" style="font-size:12px;font-weight:600;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">Pass Rate</div>
            <div class="pr-label" style="font-size:11px;color:#9ca3af;margin-top:2px;">Total: <strong>${execTotal}</strong></div>
            ${(te.passRate ?? 0) === 100
              ? `<div style="margin-top:8px;display:inline-block;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;letter-spacing:0.03em;">✓ READY FOR RELEASE</div>`
              : (execTotal > 0 && (te.failed ?? 0) / execTotal > 0.1)
                ? `<div style="margin-top:8px;display:inline-block;background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;letter-spacing:0.03em;">⚠ HIGH RISK</div>`
                : ""}
          </td>
          <td style="vertical-align:middle;">${execLegend}</td>
        </tr>
      </table>
      ${execBar}
      <div class="pr-line" style="margin-top:10px;font-size:12px;color:#6b7280;">
        Pass Rate: <strong style="color:#16A34A;">${te.passRate ?? 0}%</strong>
        &nbsp;·&nbsp; Success Rate: <strong style="color:#1d4ed8;">${te.successRate ?? 0}%</strong>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
        ${[
          { label: "Total",        val: te.total ?? 0,       color: "#1e40af", bg: "#dbeafe", cls: "t-total" },
          { label: "Passed",       val: te.passed ?? 0,      color: "#15803d", bg: "#dcfce7", cls: "t-pass"  },
          { label: "Failed",       val: te.failed ?? 0,      color: "#b91c1c", bg: "#fee2e2", cls: "t-fail"  },
          { label: "Blocked",      val: te.blocked ?? 0,     color: "#c2410c", bg: "#ffedd5", cls: "t-block" },
          { label: "In Progress",  val: te.inProgress ?? 0,  color: "#1d4ed8", bg: "#dbeafe", cls: "t-prog"  },
          { label: "Not Executed", val: te.notExecuted ?? 0, color: "#374151", bg: "#f3f4f6", cls: "t-nexec" },
        ].map(c => `<div class="${c.cls}" style="background:${c.bg};border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div class="kn" style="font-size:22px;font-weight:700;color:${c.color};">${c.val}</div>
          <div class="kl" style="font-size:10px;color:#6b7280;margin-top:2px;">${c.label}</div>
        </div>`).join("")}
      </div>
    </div>

    <!-- Module Breakdown -->
    ${modules.length > 0 ? `
    <div class="sec-wrap" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #8b5cf6;padding-left:12px;">Module Breakdown</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr class="table-head-row" style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th class="table-head-cell" style="padding:10px;text-align:left;color:#6b7280;font-weight:600;">Module</th>
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
    <div class="sec-wrap" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #ef4444;padding-left:12px;">Defect Status</div>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="vertical-align:middle;padding-right:28px;width:160px;">
            <div class="defect-kpi-num" style="font-size:44px;font-weight:800;color:#DC2626;line-height:1;">${defectTotal}</div>
            <div class="defect-kpi-lbl" style="font-size:12px;font-weight:600;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">Total Defects</div>
            <div class="muted-text" style="font-size:11px;color:#9ca3af;margin-top:2px;">Open: <strong style="color:#EA580C;">${openCount}</strong></div>
            ${openCount === 0
              ? `<div style="margin-top:8px;display:inline-block;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;letter-spacing:0.03em;">✓ ALL CLEAR</div>`
              : (defectTotal > 0 && (defects.openRate ?? 0) > 50)
                ? `<div style="margin-top:8px;display:inline-block;background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;letter-spacing:0.03em;">⚠ HIGH OPEN RATE</div>`
                : ""}
          </td>
          <td style="vertical-align:middle;">${defectLegend || '<span style="font-size:12px;color:#9ca3af;">No defects</span>'}</td>
        </tr>
      </table>
      ${defectBar}
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
        <div class="d-total" style="background:#fee2e2;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div class="kn" style="font-size:22px;font-weight:700;color:#DC2626;">${defectTotal}</div>
          <div class="kl" style="font-size:10px;color:#6b7280;margin-top:2px;">Total</div>
        </div>
        <div class="d-open" style="background:#ffedd5;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div class="kn" style="font-size:22px;font-weight:700;color:#EA580C;">${openCount}</div>
          <div class="kl" style="font-size:10px;color:#6b7280;margin-top:2px;">Open</div>
        </div>
        <div class="d-closd" style="background:#dcfce7;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div class="kn" style="font-size:22px;font-weight:700;color:#16A34A;">${(defects.counts?.verified ?? 0) + (defects.counts?.closed ?? 0)}</div>
          <div class="kl" style="font-size:10px;color:#6b7280;margin-top:2px;">Closed/Verified</div>
        </div>
        <div class="d-rate" style="background:#fff7ed;border-radius:8px;padding:12px 16px;text-align:center;min-width:80px;">
          <div class="kn" style="font-size:22px;font-weight:700;color:#C2410C;">${defects.openRate ?? 0}%</div>
          <div class="kl" style="font-size:10px;color:#6b7280;margin-top:2px;">Open Rate</div>
        </div>
      </div>
    </div>

    <!-- Active Defects Table -->
    ${activeDefects.length > 0 ? `
    <div class="sec-wrap" style="padding:24px 32px 32px;border-bottom:none;">
      <div class="sec-hd" style="font-size:16px;font-weight:700;color:#111827;margin-bottom:16px;border-left:4px solid #f59e0b;padding-left:12px;">Active Defects (${activeDefects.length})</div>
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
  const { reportName, redmineId, reportData, senderName, riskResult, readinessResult, to, cc } = req.body;

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

  const formatRecipients = (arr: Array<{ fullName?: string; name?: string; email: string }> | undefined, fallback: string) => {
    if (!arr || arr.length === 0) return fallback;
    return arr.map((r) => `"${r.fullName ?? r.name ?? r.email}" <${r.email}>`).join(", ");
  };

  const emailTo = formatRecipients(to, process.env.PMO_EMAIL_TO ?? "qa.services@bestinet.com.my");
  const emailCc = formatRecipients(cc, process.env.PMO_EMAIL_CC ?? "");

  if (!nodemailer) {
    res.status(500).json({ error: "nodemailer is not installed. Run: pnpm install in artifacts/api-server" });
    return;
  }

  if (!puppeteer) {
    res.status(500).json({ error: "puppeteer is not installed. Run: pnpm install in artifacts/api-server" });
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

    // Render full report HTML then screenshot it
    const reportHtml = buildEmailHtml(
      reportName ?? `Ticket #${redmineId}`,
      redmineId ?? "",
      senderName ?? "QA Team",
      reportData,
      riskResult,
      readinessResult,
    );
    const screenshotBuffer = await htmlToScreenshot(reportHtml);

    // Simple email body that embeds the screenshot via CID
    const emailBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:940px;margin:0 auto;">
    <img src="cid:qapulse-report"
         alt="QA Pulse PMO Report"
         style="width:100%;display:block;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);">
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:12px;">
      Active defects are attached as an Excel spreadsheet &nbsp;·&nbsp; Generated by QA Pulse
    </p>
  </div>
</body>
</html>`;

    // Build attachments
    const attachments: any[] = [
      {
        filename: `QAPulse_Report_${redmineId ?? "report"}_${new Date().toISOString().slice(0, 10)}.png`,
        content: screenshotBuffer,
        cid: "qapulse-report",
        contentType: "image/png",
        contentDisposition: "inline",
      },
    ];

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
      html: emailBody,
      attachments,
    });

    res.json({ success: true, message: `Report sent to ${emailTo}` });
  } catch (err: any) {
    console.error("PMO email send error:", err);
    res.status(500).json({ error: err.message ?? "Failed to send email" });
  }
});

// ─── Send Verdict Email ───────────────────────────────────────────────────────

router.post("/pmo/send-verdict", express.json(), async (req, res) => {
  const { redmineId, issueType, issueSubject, verdict, reason, to, cc, senderName } = req.body;

  if (!to || !Array.isArray(to) || to.length === 0) {
    res.status(400).json({ error: "At least one TO recipient is required" });
    return;
  }
  if (!verdict || !["PASS", "CONDITIONAL SIGN OFF"].includes(verdict)) {
    res.status(400).json({ error: "verdict must be PASS or CONDITIONAL SIGN OFF" });
    return;
  }
  if (verdict === "CONDITIONAL SIGN OFF" && !reason?.trim()) {
    res.status(400).json({ error: "reason is required for CONDITIONAL SIGN OFF" });
    return;
  }

  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpSecure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? smtpUser;

  if (!nodemailer) {
    res.status(500).json({ error: "nodemailer is not installed" });
    return;
  }
  if (!smtpUser || !smtpPass) {
    res.status(500).json({ error: "Email not configured. Set SMTP_USER and SMTP_PASS environment variables." });
    return;
  }

  const formatRecipients = (arr: Array<{ fullName?: string; name?: string; email: string }>) =>
    arr.map((r) => `"${r.fullName ?? r.name ?? r.email}" <${r.email}>`).join(", ");

  const typeLabel = issueType || "Issue";
  const subject = issueSubject
    ? `[QA Verdict] ${typeLabel} #${redmineId} : ${issueSubject} — ${verdict}`
    : `[QA Verdict] #${redmineId} — ${verdict}`;

  const bodyText =
    verdict === "CONDITIONAL SIGN OFF"
      ? `Hi All,\n\nThe test verdict for ${typeLabel} #${redmineId} : ${issueSubject} is CONDITIONAL SIGN OFF due to ${reason.trim()}.\nPlease refer attached email for details.\n\nRefer attachment for the details.\n\nThank you.`
      : `Hi All,\n\nTest Verdict for ${typeLabel} #${redmineId} : ${issueSubject} is PASS.\nAll issues encountered during testing have been fixed & retest.\nAttached is the test case that we had covered during testing.\n\nThank you.`;

  const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">QA Pulse — Test Verdict</h2>
    <div style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px;background:${verdict === "PASS" ? "#dcfce7" : "#fee2e2"};color:${verdict === "PASS" ? "#166534" : "#991b1b"};">${verdict}</div>
    <pre style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap;margin:0;">${bodyText}</pre>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
      Sent by ${senderName ?? "QA Team"} via QA Pulse
    </div>
  </div>
</body>
</html>`;

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"QA Pulse" <${emailFrom}>`,
      to: formatRecipients(to),
      cc: cc?.length ? formatRecipients(cc) : undefined,
      subject,
      text: bodyText,
      html: htmlBody,
    });

    res.json({ success: true, message: `Verdict sent to ${formatRecipients(to)}` });
  } catch (err: any) {
    console.error("Verdict email send error:", err);
    res.status(500).json({ error: err.message ?? "Failed to send verdict email" });
  }
});

export default router;