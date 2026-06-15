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
    host: process.env.REDMINE_DB_HOST ?? "10.10.4.130",
    port: parseInt(process.env.REDMINE_DB_PORT ?? "3306"),
    user: process.env.REDMINE_DB_USER ?? "bestqa",
    password: process.env.REDMINE_DB_PASSWORD ?? "",
    database: process.env.REDMINE_DB_NAME ?? "redmine",
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

  try {
    // Determine the base URL and API key from environment variables
    const baseUrl = process.env.REDMINE_URL ?? "https://redmine.bestinet.my";
    const apiKey = process.env.REDMINE_API_KEY ?? "";

    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Attach the API key if it is provided
    if (apiKey) {
      headers["X-Redmine-API-Key"] = apiKey;
    }

    // Fetch from Redmine's REST API, including children and journal records if needed
    const response = await fetch(
      `${baseUrl}/issues/${issueId}.json?include=children,journals`,
      {
        headers,
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({
          error: `Redmine issue #${issueId} not found`,
          connected: true,
        });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Authentication failed. Please check your REDMINE_API_KEY.",
        );
      }
      throw new Error(`Redmine API returned status: ${response.status}`);
    }

    const data = await response.json();
    const apiIssue = data.issue;

    // Map the REST API JSON structure to the format your frontend expects
    res.json({
      connected: true,
      issue: {
        id: apiIssue.id,
        subject: apiIssue.subject,
        description: apiIssue.description,

        // Keep these as objects because the frontend calls data.issue.status?.name
        status: apiIssue.status,
        tracker: apiIssue.tracker,
        priority: apiIssue.priority,
        assignee: apiIssue.assigned_to,
        author: apiIssue.author,

        projectName: apiIssue.project?.name,
        doneRatio: apiIssue.done_ratio,
        estimatedHours: apiIssue.estimated_hours,
        startDate: apiIssue.start_date,
        dueDate: apiIssue.due_date,
        createdOn: apiIssue.created_on,
        updatedOn: apiIssue.updated_on,

        // CRITICAL FIX: Pass the children array through to the frontend
        children: apiIssue.children 
      },
    });
  } catch (err: any) {
    res.status(503).json({
      connected: false,
      error: `Failed to fetch from Redmine API: ${err.message}`,
    });
  }
});

// You can also update the status check route to ping the API instead of the DB
router.get("/pmo/redmine-status", async (_req, res): Promise<void> => {
  try {
    const baseUrl = process.env.REDMINE_URL ?? "https://redmine.bestinet.my";
    const response = await fetch(`${baseUrl}/issues.json?limit=1`);
    if (response.ok) {
      res.json({ connected: true, host: baseUrl });
    } else {
      res.json({
        connected: false,
        error: `API responded with ${response.status}`,
      });
    }
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

export default router;