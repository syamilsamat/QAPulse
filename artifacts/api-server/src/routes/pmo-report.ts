import { Router, type IRouter } from "express";
import express from "express";
import { eq } from "drizzle-orm";
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

export default router;