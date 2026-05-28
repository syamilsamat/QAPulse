import { Router, type IRouter } from "express";
import { db, requirementsTable, testCasesTable, tasksTable, usersTable } from "@workspace/db";

let mysql2: any = null;
try { mysql2 = require("mysql2/promise"); } catch { /* mysql2 optional */ }

const router: IRouter = Router();

// ─── Status maps (mirrors reportGenerator.js) ────────────────────────────────

function mapTestStatus(s: string): string {
  const v = (s ?? "").toLowerCase().trim();
  if (["done", "closed", "resolved", "verified"].includes(v)) return "passed";
  if (["rejected", "fail", "failed"].includes(v))             return "failed";
  if (["blocked", "roadblock"].includes(v))                   return "blocked";
  if (["in progress", "inprogress"].includes(v))              return "in_progress";
  return "not_executed";   // "New", "For QA Test", etc. = pending
}

function mapDefectStatus(s: string): string {
  const v = (s ?? "").toLowerCase().trim();
  if (v === "new")                               return "new";
  if (["in progress", "inprogress"].includes(v)) return "in_progress";
  if (["for qa test", "forqatest"].includes(v))  return "for_qa_test";
  if (v === "reopen")                            return "reopen";
  if (v === "done")                              return "done";
  if (v === "roadblock")                         return "roadblock";
  if (v === "verified")                          return "verified";
  if (["closed", "rejected"].includes(v))        return "closed";
  return "new";
}

const DEFECT_TRACKER_WORDS = ["defect", "bug"];
function isDefectTracker(name: string): boolean {
  const t = (name ?? "").toLowerCase();
  return DEFECT_TRACKER_WORDS.some(w => t.includes(w));
}

// ─── Shared report builder (accepts normalised items) ────────────────────────

function buildReportShape(
  issueId: string,
  main: { subject: string; status: string; projectName: string },
  testItems: Array<{ status: string; category?: string }>,
  defects: Array<{ id: number; subject: string; status: string; priority: string; category: string; assignee: string; createdOn: string }>
) {
  const modules: Record<string, {
    total: number; passed: number; failed: number;
    blocked: number; inProgress: number; notExecuted: number;
  }> = {};

  for (const item of testItems) {
    const mod = item.category || main.projectName || "General";
    if (!modules[mod]) modules[mod] = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };
    modules[mod].total++;
    const bucket = mapTestStatus(item.status);
    if      (bucket === "passed")      modules[mod].passed++;
    else if (bucket === "failed")      modules[mod].failed++;
    else if (bucket === "blocked")     modules[mod].blocked++;
    else if (bucket === "in_progress") modules[mod].inProgress++;
    else                               modules[mod].notExecuted++;
  }

  const tp  = Object.values(modules).reduce((a, m) => a + m.passed,      0);
  const tf  = Object.values(modules).reduce((a, m) => a + m.failed,      0);
  const tb  = Object.values(modules).reduce((a, m) => a + m.blocked,     0);
  const tip = Object.values(modules).reduce((a, m) => a + m.inProgress,  0);
  const tne = Object.values(modules).reduce((a, m) => a + m.notExecuted, 0);
  const total = testItems.length;

  const moduleDetails = Object.entries(modules).map(([mod, m]) => ({
    module: mod, ...m,
    passCompletion:  m.total > 0 ? Math.round((m.passed / m.total) * 1000) / 10 : 0,
    totalCompletion: m.total > 0 ? Math.round(((m.total - m.notExecuted) / m.total) * 1000) / 10 : 0,
  }));

  const defectCounts: Record<string, number> = {
    new: 0, in_progress: 0, for_qa_test: 0, reopen: 0,
    done: 0, roadblock: 0, verified: 0, closed: 0,
  };
  for (const d of defects) {
    const s = mapDefectStatus(d.status);
    if (s in defectCounts) defectCounts[s]++;
  }

  const openDefects = defects.filter(d => !["done", "verified", "closed"].includes(mapDefectStatus(d.status))).length;

  const activeDefects = defects
    .filter(d => !["done", "verified", "closed"].includes(mapDefectStatus(d.status)))
    .map(d => ({
      id: d.id, name: d.subject, priority: d.priority, status: d.status,
      category: d.category, assignee: d.assignee, createdAt: d.createdOn,
    }));

  return {
    redmineId:    issueId,
    generatedAt:  new Date().toISOString(),
    source:       "redmine",
    issueSubject: main.subject,
    projectName:  main.projectName,
    requirements: [{ id: parseInt(issueId), title: main.subject, module: main.projectName, status: main.status, priority: "High" }],
    testExecution: {
      total, passed: tp, failed: tf, blocked: tb, inProgress: tip, notExecuted: tne,
      passRate:    total > 0 ? Math.round((tp / total) * 1000) / 10 : 0,
      successRate: total > 0 ? Math.round(((tp + tip) / total) * 1000) / 10 : 0,
    },
    moduleDetails,
    defects: {
      total:    defects.length,
      openRate: defects.length > 0 ? Math.round((openDefects / defects.length) * 100) : 0,
      counts:   defectCounts,
    },
    activeDefects,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH 1 — Direct MySQL (works when app runs on internal network)
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

    const [mainRows] = await conn.query(
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
       WHERE i.id = ?`, [issueId]
    ) as [any[], any];

    if (!mainRows.length) return null;
    const main = mainRows[0];

    const [childRows] = await conn.query(
      `SELECT i.id, i.subject, i.created_on,
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
       ORDER BY t.id, i.id`, [issueId]
    ) as [any[], any];

    // Defects: subject-match pattern (same as reportGenerator.js fetchDefectsFromDatabase)
    const [defectRows] = await conn.query(
      `SELECT i.id, i.subject, i.created_on,
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
       ORDER BY i.created_on ASC`, [issueId]
    ) as [any[], any];

    // Merge defects (deduplicate child-defects + subject-matched defects)
    const defectMap = new Map<number, any>();
    for (const d of defectRows as any[]) defectMap.set(d.id, d);
    for (const d of (childRows as any[]).filter(r => isDefectTracker(r.tracker ?? "")))
      defectMap.set(d.id, d);

    const testItems = (childRows as any[])
      .filter(r => !isDefectTracker(r.tracker ?? ""))
      .map((r: any) => ({ status: r.status ?? "", category: r.category ?? "" }));

    const defects = Array.from(defectMap.values()).map((d: any) => ({
      id: d.id, subject: d.subject, status: d.status ?? "New",
      priority: d.priority ?? "Normal", category: d.category ?? "",
      assignee: d.assignee ?? "Unassigned", createdOn: d.created_on,
    }));

    return buildReportShape(
      issueId,
      { subject: main.subject, status: main.status, projectName: main.project_name },
      testItems,
      defects
    );
  } catch (err: any) {
    console.error("[pmo-report] MySQL error:", err?.code, err?.message);
    return null;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH 2 — Redmine REST API (works when REDMINE_URL + REDMINE_API_KEY are set)
//           Useful when Redmine has a public / VPN-accessible HTTP URL
// ═══════════════════════════════════════════════════════════════════════════════

async function reportFromRedmineAPI(issueId: string): Promise<Record<string, unknown> | null> {
  const baseUrl  = (process.env.REDMINE_URL ?? "").replace(/\/$/, "");
  const apiKey   = process.env.REDMINE_API_KEY ?? "";
  if (!baseUrl || !apiKey) return null;

  const h = { "X-Redmine-API-Key": apiKey, "Accept": "application/json" };
  const timeout = 10000;

  const safeJson = async (url: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { headers: h, signal: ctrl.signal });
      return r.ok ? r.json() : null;
    } catch { return null; } finally { clearTimeout(timer); }
  };

  try {
    // 1. Main issue
    const issueData = await safeJson(`${baseUrl}/issues/${issueId}.json`);
    if (!issueData?.issue) return null;
    const main = issueData.issue;

    // 2. Children (full details)
    const childData = await safeJson(`${baseUrl}/issues.json?parent_id=${issueId}&limit=100&status_id=*`);
    const children: any[] = childData?.issues ?? [];

    // 3. Subject-based defect search (mirrors reportGenerator.js approach)
    const defectSearch = await safeJson(`${baseUrl}/issues.json?subject=~${issueId}&limit=100&status_id=*`);
    const subjectMatches: any[] = defectSearch?.issues ?? [];

    // Build normalised defect list
    const defectMap = new Map<number, any>();
    const toNormDefect = (i: any) => ({
      id: i.id, subject: i.subject,
      status:   i.status?.name ?? "New",
      priority: i.priority?.name ?? "Normal",
      category: i.category?.name ?? "",
      assignee: i.assigned_to?.name ?? "Unassigned",
      createdOn: i.created_on,
    });

    for (const i of subjectMatches)  if (isDefectTracker(i.tracker?.name ?? "")) defectMap.set(i.id, toNormDefect(i));
    for (const i of children)        if (isDefectTracker(i.tracker?.name ?? "")) defectMap.set(i.id, toNormDefect(i));

    const testItems = children
      .filter(c => !isDefectTracker(c.tracker?.name ?? ""))
      .map(c => ({ status: c.status?.name ?? "", category: c.category?.name ?? "" }));

    return buildReportShape(
      issueId,
      {
        subject:     main.subject,
        status:      main.status?.name ?? "",
        projectName: main.project?.name ?? "",
      },
      testItems,
      Array.from(defectMap.values())
    );
  } catch (err: any) {
    console.error("[pmo-report] REST API error:", err?.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATH 3 — Local PostgreSQL fallback (demo data / dev)
// ═══════════════════════════════════════════════════════════════════════════════

function localStatus(s: string): string {
  const v = (s ?? "").toLowerCase();
  if (["done", "passed", "closed"].includes(v)) return "passed";
  if (["failed", "fail"].includes(v))           return "failed";
  if (["blocked", "roadblock"].includes(v))     return "blocked";
  if (["in_progress", "in progress"].includes(v)) return "in_progress";
  return "not_executed";
}

async function reportFromLocalDB(issueId: string): Promise<Record<string, unknown> | null> {
  const requirements = await db.select().from(requirementsTable);
  const matched = requirements.filter(r =>
    r.redmineTicketId === issueId ||
    r.redmineTicketId === `#${issueId}` ||
    r.title.toLowerCase().includes(issueId.toLowerCase())
  );
  if (!matched.length) return null;

  const allTC    = await db.select().from(testCasesTable);
  const allTasks = await db.select().from(tasksTable);
  const allUsers = await db.select().from(usersTable);
  const reqIds   = matched.map(r => r.id);

  const linkedTC    = allTC.filter(tc => tc.requirementId && reqIds.includes(tc.requirementId));
  const defectTasks = allTasks.filter(t =>
    t.requirementId && reqIds.includes(t.requirementId) &&
    ["bug_fix", "defect", "bug"].includes(t.type)
  );
  const getName = (id: number | null) =>
    id ? (allUsers.find(u => u.id === id)?.name ?? "Unassigned") : "Unassigned";

  const testItems = linkedTC.map(tc => ({
    status: tc.status,
    category: allTC.find(t => t.id === tc.id) ? (matched.find(r => r.id === tc.requirementId)?.module ?? "") : "",
  }));

  const defects = defectTasks.map(t => ({
    id: t.id, subject: t.name, status: t.status,
    priority: "Normal", category: "Bug",
    assignee: getName(t.assigneeId), createdOn: t.createdAt.toISOString(),
  }));

  const report = buildReportShape(
    issueId,
    { subject: matched[0].title, status: matched[0].status, projectName: "" },
    testItems,
    defects
  ) as Record<string, unknown>;

  report.source = "local";
  return report;
}

// ─── Main route ───────────────────────────────────────────────────────────────

router.get("/pmo/report", async (req, res): Promise<void> => {
  const { redmineId } = req.query;
  if (!redmineId || typeof redmineId !== "string") {
    res.status(400).json({ error: "redmineId query parameter is required" });
    return;
  }

  const cleanId = redmineId.replace(/^#/, "").trim();

  // 1. Direct MySQL (fastest, works on-premises)
  const fromMySQL = await reportFromMySQL(cleanId);
  if (fromMySQL) { res.json(fromMySQL); return; }

  // 2. Redmine REST API (works with public/VPN-accessible Redmine URL + API key)
  const fromAPI = await reportFromRedmineAPI(cleanId);
  if (fromAPI) { res.json(fromAPI); return; }

  // 3. Local demo data (Replit dev environment)
  const fromLocal = await reportFromLocalDB(cleanId);
  if (fromLocal) { res.json(fromLocal); return; }

  // All paths failed — return a helpful diagnostic error
  const host = process.env.REDMINE_DB_HOST ?? "10.10.4.130";
  const port = process.env.REDMINE_DB_PORT ?? "3306";
  const hasRestUrl = !!process.env.REDMINE_URL;
  res.status(503).json({
    error: `Could not load data for Redmine #${cleanId}.`,
    help: [
      `MySQL at ${host}:${port} is unreachable from this environment (Replit cloud servers cannot reach internal IPs).`,
      hasRestUrl
        ? `Redmine REST API at ${process.env.REDMINE_URL} also failed — check REDMINE_API_KEY and connectivity.`
        : `To enable REST API mode: add REDMINE_URL (e.g. http://10.10.4.130/redmine) and REDMINE_API_KEY to Replit Secrets.`,
      `For full functionality, deploy QA Pulse on your internal server where it can reach ${host}:${port} directly.`,
    ],
  });
});

export default router;
