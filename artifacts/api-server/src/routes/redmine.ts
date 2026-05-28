import { Router, type IRouter } from "express";

let mysql: typeof import("mysql2/promise") | null = null;
try {
  mysql = require("mysql2/promise");
} catch {
  console.warn("mysql2 not available");
}

const router: IRouter = Router();

function getDbConfig() {
  return {
    host:     process.env.REDMINE_DB_HOST     ?? "10.10.4.130",
    port:     parseInt(process.env.REDMINE_DB_PORT ?? "3306"),
    user:     process.env.REDMINE_DB_USER     ?? "bestqa",
    password: process.env.REDMINE_DB_PASSWORD ?? "",
    database: process.env.REDMINE_DB_NAME     ?? "redmine",
    connectTimeout: 8000,
  };
}

async function getConnection() {
  if (!mysql) throw new Error("mysql2 driver not installed");
  return mysql.createConnection(getDbConfig());
}

router.get("/pmo/redmine/:issueId", async (req, res): Promise<void> => {
  const issueId = parseInt(req.params.issueId);
  if (isNaN(issueId)) {
    res.status(400).json({ error: "Invalid issue ID" });
    return;
  }

  let conn: import("mysql2/promise").Connection | null = null;
  try {
    conn = await getConnection();

    const [issueRows] = await conn.query<any[]>(
      `SELECT 
        i.id, i.subject, i.description, i.done_ratio, i.estimated_hours,
        i.created_on, i.updated_on, i.due_date, i.start_date,
        i.status_id, i.priority_id, i.tracker_id,
        s.name AS status,
        t.name AS tracker,
        e.name AS priority,
        p.identifier AS project_key,
        p.name AS project_name,
        CONCAT(u.firstname, ' ', u.lastname) AS assignee,
        CONCAT(a.firstname, ' ', a.lastname) AS author
       FROM issues i
       LEFT JOIN issue_statuses s  ON s.id = i.status_id
       LEFT JOIN trackers t        ON t.id = i.tracker_id
       LEFT JOIN enumerations e    ON e.id = i.priority_id AND e.type = 'IssuePriority'
       LEFT JOIN projects p        ON p.id = i.project_id
       LEFT JOIN users u           ON u.id = i.assigned_to_id
       LEFT JOIN users a           ON a.id = i.author_id
       WHERE i.id = ?`,
      [issueId]
    );

    if (!issueRows.length) {
      res.status(404).json({ error: `Redmine issue #${issueId} not found`, connected: true });
      return;
    }

    const parent = issueRows[0];

    const [childRows] = await conn.query<any[]>(
      `SELECT 
        i.id, i.subject, i.done_ratio, i.estimated_hours,
        i.created_on, i.updated_on, i.due_date,
        s.name AS status,
        t.name AS tracker,
        e.name AS priority,
        CONCAT(u.firstname, ' ', u.lastname) AS assignee
       FROM issues i
       LEFT JOIN issue_statuses s  ON s.id = i.status_id
       LEFT JOIN trackers t        ON t.id = i.tracker_id
       LEFT JOIN enumerations e    ON e.id = i.priority_id AND e.type = 'IssuePriority'
       LEFT JOIN users u           ON u.id = i.assigned_to_id
       WHERE i.parent_id = ?
       ORDER BY i.id`,
      [issueId]
    );

    const [journalRows] = await conn.query<any[]>(
      `SELECT 
        j.id, j.notes, j.created_on,
        CONCAT(u.firstname, ' ', u.lastname) AS author
       FROM journals j
       LEFT JOIN users u ON u.id = j.user_id
       WHERE j.journalized_id = ? AND j.journalized_type = 'Issue' AND j.notes != ''
       ORDER BY j.created_on DESC
       LIMIT 10`,
      [issueId]
    );

    const statusSummary: Record<string, number> = {};
    for (const child of childRows as any[]) {
      const s = (child.status ?? "Unknown").toString();
      statusSummary[s] = (statusSummary[s] ?? 0) + 1;
    }

    res.json({
      connected: true,
      issue: {
        id: parent.id,
        subject: parent.subject,
        description: parent.description,
        status: parent.status,
        tracker: parent.tracker,
        priority: parent.priority,
        assignee: parent.assignee,
        author: parent.author,
        projectName: parent.project_name,
        doneRatio: parent.done_ratio,
        estimatedHours: parent.estimated_hours,
        startDate: parent.start_date,
        dueDate: parent.due_date,
        createdOn: parent.created_on,
        updatedOn: parent.updated_on,
      },
      children: (childRows as any[]).map((c: any) => ({
        id: c.id,
        subject: c.subject,
        status: c.status,
        tracker: c.tracker,
        priority: c.priority,
        assignee: c.assignee,
        doneRatio: c.done_ratio,
        dueDate: c.due_date,
        createdOn: c.created_on,
      })),
      statusSummary,
      journals: (journalRows as any[]).map((j: any) => ({
        id: j.id,
        notes: j.notes,
        author: j.author,
        createdOn: j.created_on,
      })),
    });
  } catch (err: any) {
    const isConnErr = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND" || err.code === "EHOSTUNREACH";
    res.status(isConnErr ? 503 : 500).json({
      connected: false,
      error: isConnErr
        ? "Cannot reach Redmine database. Ensure the server is accessible from this environment."
        : err.message,
    });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

router.get("/pmo/redmine-status", async (_req, res): Promise<void> => {
  let conn: import("mysql2/promise").Connection | null = null;
  try {
    conn = await getConnection();
    await conn.query("SELECT 1");
    res.json({ connected: true, host: process.env.REDMINE_DB_HOST ?? "10.10.4.130" });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

export default router;
