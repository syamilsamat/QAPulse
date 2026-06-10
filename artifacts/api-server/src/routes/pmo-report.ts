import { Router, type IRouter } from "express";
import express from "express";
import {
  db,
  requirementsTable,
  testCasesTable,
  tasksTable,
  usersTable,
} from "@workspace/db";

let mysql2: any = null;
try {
  mysql2 = require("mysql2/promise");
} catch {}

const router: IRouter = Router();

// --- IN-MEMORY STORE FOR EXECUTION DETAILS ---
// Maps a Redmine Ticket ID to its array of test execution rows
const executionStore: Record<string, any[]> = {};

// Endpoint to GET execution details by Ticket ID
router.get("/pmo/execution-details", (req, res) => {
  const { redmineId } = req.query;
  if (redmineId && typeof redmineId === "string") {
    res.json(executionStore[redmineId] || []);
  } else {
    res.json([]);
  }
});

// Endpoint to POST/SAVE execution details under a Ticket ID
router.post("/pmo/execution-details", express.json(), (req, res) => {
  const { redmineId, details } = req.body;
  if (redmineId && Array.isArray(details)) {
    executionStore[redmineId] = details;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: "Missing redmineId or details array" });
  }
});

// ─── Status maps ────────────────────────────────
function mapTestStatus(s: string): string {
  const v = (s ?? "").toLowerCase().trim();
  if (["done", "closed", "resolved", "verified"].includes(v)) return "passed";
  if (["rejected", "fail", "failed"].includes(v)) return "failed";
  if (["blocked", "roadblock"].includes(v)) return "blocked";
  if (["in progress", "inprogress"].includes(v)) return "in_progress";
  return "not_executed";
}

function mapDefectStatus(s: string): string {
  const v = (s ?? "").toLowerCase().trim();
  if (v === "new") return "new";
  if (["in progress", "inprogress"].includes(v)) return "in_progress";
  if (["for qa test", "forqatest"].includes(v)) return "for_qa_test";
  if (v === "reopen") return "reopen";
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
// NEW PATH 4 — Read from Saved Execution Details
// ═══════════════════════════════════════════════════════════════════════════════

async function reportFromLocalExecutionDetails(
  issueId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const details = executionStore[issueId];
    if (!details || details.length === 0) return null;

    let total = 0,
      passed = 0,
      failed = 0,
      blocked = 0,
      inProgress = 0,
      notExecuted = 0;
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
          total > 0
            ? Math.round(((passed + inProgress) / total) * 1000) / 10
            : 0,
      },
      moduleDetails,
      defects: { total: 0, openRate: 0, counts: {} },
      activeDefects: [],
    };
  } catch (err) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE FALLBACKS FOR DEFECTS
// ═══════════════════════════════════════════════════════════════════════════════

async function reportFromMySQL(
  issueId: string,
): Promise<Record<string, unknown> | null> {
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

    const defects = Array.from(defectMap.values()).map((d: any) => ({
      id: d.id,
      subject: d.subject,
      status: d.status ?? "New",
      priority: d.priority ?? "Normal",
      category: d.category ?? "",
      assignee: d.assignee ?? "Unassigned",
      createdOn: d.created_on,
    }));

    return buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status,
        projectName: main.project_name,
      },
      [], // We ignore MySQL test items because we're using the frontend table
      defects,
    );
  } catch (err: any) {
    return null;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

async function reportFromRedmineAPI(
  issueId: string,
): Promise<Record<string, unknown> | null> {
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
    });

    for (const i of subjectMatches) {
      if (isDefectTracker(i.tracker?.name ?? "") && i.status?.id !== 11)
        defectMap.set(i.id, toNormDefect(i));
    }
    for (const i of children) {
      if (isDefectTracker(i.tracker?.name ?? "") && i.status?.id !== 11)
        defectMap.set(i.id, toNormDefect(i));
    }

    return buildReportShape(
      issueId,
      {
        subject: main.subject,
        status: main.status?.name ?? "",
        projectName: main.project?.name ?? "",
      },
      [], // Ignore API test items
      Array.from(defectMap.values()),
    );
  } catch (err: any) {
    return null;
  }
}

async function reportFromLocalDB(
  issueId: string,
): Promise<Record<string, unknown> | null> {
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

  // 1. Fetch from our new local React frontend table (for test execution metrics)
  const testData = await reportFromLocalExecutionDetails(cleanId);

  // 2. Fetch Defects from DBs
  let defectData = await reportFromMySQL(cleanId);
  if (!defectData) {
    defectData = await reportFromRedmineAPI(cleanId);
  }
  if (!defectData) {
    defectData = await reportFromLocalDB(cleanId);
  }

  // 3. Merge Excel Data + Defect Data Perfectly
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

  // If nothing is found, return error
  const host = process.env.REDMINE_DB_HOST ?? "10.10.4.130";
  const port = process.env.REDMINE_DB_PORT ?? "3306";
  const hasRestUrl = !!process.env.REDMINE_URL;
  res.status(503).json({
    error: `No data found for Redmine #${cleanId}.`,
    help: [
      `Go to "Test Cases > Execution Details" and ensure you have saved Excel data for Ticket #${cleanId}.`,
      `Defect fetching from DB also failed or returned empty.`,
    ],
  });
});

export default router;
