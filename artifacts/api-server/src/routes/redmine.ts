import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  redmineProjectsTable,
  redmineProjectConfigsTable,
  redmineGlobalConfigTable,
  usersTable,
} from "@workspace/db";
import { getAuthUser } from "./auth";
import { getAuthContext } from "../middleware/access";

const router: IRouter = Router();

// CR047 — every Redmine route requires an authenticated QAPulse user. Without
// this, the env-key fallback in resolveApiKey() let an anonymous caller create
// Redmine issues and upload attachments under the server's service account.
router.use((req, res, next) => {
  if (!getAuthContext(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getBaseUrl() {
  return process.env.REDMINE_URL ?? "https://redmine.bestinet.my";
}

function getDefaultApiKey() {
  return process.env.REDMINE_API_KEY ?? "";
}

/** Resolves the effective API key for a request.
 *  Priority: X-Redmine-User-Key header > user's saved key in DB > env default.
 *  Falls back to the env default only if the user has no personal key set. */
async function resolveApiKey(req: any): Promise<string> {
  // 1. Explicit header sent by frontend (most reliable)
  const headerKey = req.headers["x-redmine-user-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();
  // 2. Look up from DB via JWT
  const authUser = await getAuthUser(req);
  if (authUser?.redmineApiKey?.trim()) return authUser.redmineApiKey.trim();
  // 3. Fall back to env default (only when user has no personal key)
  return getDefaultApiKey();
}

async function redmineFetch(
  path: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (apiKey) headers["X-Redmine-API-Key"] = apiKey;
  return fetch(`${getBaseUrl()}${path}`, { ...options, headers });
}

// ─── Existing: single issue fetch (PMO) ─────────────────────────────────────

router.get("/pmo/redmine/:issueId", async (req, res): Promise<void> => {
  const issueId = parseInt(req.params.issueId);
  if (isNaN(issueId)) {
    res.status(400).json({ error: "Invalid issue ID" });
    return;
  }
  try {
    const apiKey = await resolveApiKey(req);
    const response = await redmineFetch(
      `/issues/${issueId}.json?include=children,journals,attachments`,
      apiKey,
    );
    if (!response.ok) {
      if (response.status === 404) {
        res.status(404).json({ error: `Redmine issue #${issueId} not found`, connected: true });
        return;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed. Please check your Redmine API key.");
      }
      throw new Error(`Redmine API returned status: ${response.status}`);
    }
    const data = await response.json();
    const apiIssue = data.issue;
    res.json({
      connected: true,
      issue: {
        id: apiIssue.id,
        subject: apiIssue.subject,
        description: apiIssue.description,
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
        children: apiIssue.children,
      },
    });
  } catch (err: any) {
    res.status(503).json({ connected: false, error: `Failed to fetch from Redmine API: ${err.message}` });
  }
});

// ─── Existing: status check ──────────────────────────────────────────────────

router.get("/pmo/redmine-status", async (_req, res): Promise<void> => {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/issues.json?limit=1`);
    if (response.ok) {
      res.json({ connected: true, host: baseUrl });
    } else {
      res.json({ connected: false, error: `API responded with ${response.status}` });
    }
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

// ─── Projects: cached list ───────────────────────────────────────────────────

router.get("/redmine/projects", async (_req, res): Promise<void> => {
  try {
    const projects = await db
      .select()
      .from(redmineProjectsTable)
      .orderBy(redmineProjectsTable.name);
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch cached Redmine projects" });
  }
});

// ─── Projects: sync from Redmine ────────────────────────────────────────────

router.post("/redmine/sync-projects", async (req, res): Promise<void> => {
  try {
    const apiKey = await resolveApiKey(req);
    let allProjects: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await redmineFetch(
        `/projects.json?limit=${limit}&offset=${offset}`,
        apiKey,
      );
      if (!response.ok) {
        throw new Error(`Redmine API returned status: ${response.status}`);
      }
      const data = await response.json();
      allProjects = allProjects.concat(data.projects ?? []);
      if (allProjects.length >= data.total_count || (data.projects ?? []).length < limit) break;
      offset += limit;
    }

    for (const p of allProjects) {
      await db
        .insert(redmineProjectsTable)
        .values({
          redmineId: p.id,
          name: p.name,
          identifier: p.identifier,
          description: p.description ?? null,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: redmineProjectsTable.redmineId,
          set: {
            name: p.name,
            identifier: p.identifier,
            description: p.description ?? null,
            syncedAt: new Date(),
          },
        });
    }

    res.json({ synced: allProjects.length });
  } catch (err: any) {
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// ─── Project configs: get all ────────────────────────────────────────────────

router.get("/redmine/project-configs", async (_req, res): Promise<void> => {
  try {
    const configs = await db.select().from(redmineProjectConfigsTable);
    res.json(configs);
  } catch {
    res.status(500).json({ error: "Failed to fetch project configs" });
  }
});

// ─── Project configs: upsert for a project ──────────────────────────────────

router.post("/redmine/project-configs/:projectId", async (req, res): Promise<void> => {
  const redmineProjectId = parseInt(req.params.projectId);
  if (isNaN(redmineProjectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }
  const { complexityFieldId, targetedStartDateFieldId, targetedCompletionDateFieldId } = req.body;
  try {
    const [config] = await db
      .insert(redmineProjectConfigsTable)
      .values({
        redmineProjectId,
        complexityFieldId: complexityFieldId ?? null,
        targetedStartDateFieldId: targetedStartDateFieldId ?? null,
        targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: redmineProjectConfigsTable.redmineProjectId,
        set: {
          complexityFieldId: complexityFieldId ?? null,
          targetedStartDateFieldId: targetedStartDateFieldId ?? null,
          targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save config: ${err.message}` });
  }
});

// ─── Global custom field config (applies to all projects) ────────────────────

router.get("/redmine/global-config", async (_req, res): Promise<void> => {
  try {
    const [config] = await db.select().from(redmineGlobalConfigTable);
    res.json(config ?? null);
  } catch {
    res.status(500).json({ error: "Failed to fetch global config" });
  }
});

router.post("/redmine/global-config", async (req, res): Promise<void> => {
  const { complexityFieldId, targetedStartDateFieldId, targetedCompletionDateFieldId } = req.body;
  try {
    const [existing] = await db.select().from(redmineGlobalConfigTable);
    let config;
    if (existing) {
      [config] = await db
        .update(redmineGlobalConfigTable)
        .set({
          complexityFieldId: complexityFieldId ?? null,
          targetedStartDateFieldId: targetedStartDateFieldId ?? null,
          targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
          updatedAt: new Date(),
        })
        .returning();
    } else {
      [config] = await db
        .insert(redmineGlobalConfigTable)
        .values({
          complexityFieldId: complexityFieldId ?? null,
          targetedStartDateFieldId: targetedStartDateFieldId ?? null,
          targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
          updatedAt: new Date(),
        })
        .returning();
    }
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to save global config: ${err.message}` });
  }
});

// ─── Trackers: fetch from Redmine (finds "QA Defect" tracker ID) ─────────────

router.get("/redmine/trackers", async (req, res): Promise<void> => {
  try {
    const apiKey = await resolveApiKey(req);
    const response = await redmineFetch("/trackers.json", apiKey);
    if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
    const data = await response.json();
    res.json(data.trackers ?? []);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch trackers: ${err.message}` });
  }
});

// ─── Project members ─────────────────────────────────────────────────────────

router.get("/redmine/projects/:projectId/members", async (req, res): Promise<void> => {
  const { projectId } = req.params;
  try {
    const apiKey = await resolveApiKey(req);
    const response = await redmineFetch(`/projects/${projectId}/memberships.json?limit=100`, apiKey);
    if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
    const data = await response.json();
    const members = (data.memberships ?? [])
      .filter((m: any) => m.user)
      .map((m: any) => ({ id: m.user.id, name: m.user.name }));
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch members: ${err.message}` });
  }
});

// ─── Search: duplicate check ─────────────────────────────────────────────────

router.get("/redmine/search", async (req, res): Promise<void> => {
  const { q, project_id } = req.query as { q?: string; project_id?: string };
  if (!q?.trim()) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }
  try {
    const apiKey = await resolveApiKey(req);
    let url = `/issues.json?subject=~${encodeURIComponent(q)}&status_id=open&limit=5`;
    if (project_id) url += `&project_id=${encodeURIComponent(project_id)}`;
    const response = await redmineFetch(url, apiKey);
    if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
    const data = await response.json();
    res.json(data.issues ?? []);
  } catch (err: any) {
    res.status(500).json({ error: `Search failed: ${err.message}` });
  }
});

// ─── Create issue ────────────────────────────────────────────────────────────

router.post("/redmine/issues", async (req, res): Promise<void> => {
  const {
    projectId,
    trackerId,
    subject,
    description,
    parentIssueId,
    assigneeId,
    complexityFieldId,
    complexityValue,
    targetedStartDateFieldId,
    targetedStartDate,
    targetedCompletionDateFieldId,
    targetedCompletionDate,
    uploads,
  } = req.body;

  if (!projectId || !subject) {
    res.status(400).json({ error: "projectId and subject are required" });
    return;
  }

  try {
    const apiKey = await resolveApiKey(req);

    // Upload attachments first if any
    const uploadTokens: { token: string; filename: string; content_type: string }[] = [];
    if (Array.isArray(uploads) && uploads.length > 0) {
      for (const file of uploads) {
        const { filename, contentType, base64 } = file;
        const binary = Buffer.from(base64, "base64");
        const uploadRes = await fetch(
          `${getBaseUrl()}/uploads.json?filename=${encodeURIComponent(filename)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Redmine-API-Key": apiKey,
            },
            body: binary,
          },
        );
        if (!uploadRes.ok) throw new Error(`File upload failed: ${uploadRes.status}`);
        const uploadData = await uploadRes.json();
        uploadTokens.push({ token: uploadData.upload.token, filename, content_type: contentType });
      }
    }

    // Build custom fields array
    const customFields: { id: number; value: string }[] = [];
    if (complexityFieldId && complexityValue) {
      customFields.push({ id: Number(complexityFieldId), value: complexityValue });
    }
    if (targetedStartDateFieldId && targetedStartDate) {
      customFields.push({ id: Number(targetedStartDateFieldId), value: targetedStartDate });
    }
    if (targetedCompletionDateFieldId && targetedCompletionDate) {
      customFields.push({ id: Number(targetedCompletionDateFieldId), value: targetedCompletionDate });
    }

    const issuePayload: any = {
      issue: {
        project_id: projectId,
        tracker_id: trackerId,
        subject,
        description: description ?? "",
        ...(parentIssueId && { parent_issue_id: Number(parentIssueId) }),
        ...(assigneeId && { assigned_to_id: Number(assigneeId) }),
        ...(customFields.length > 0 && { custom_fields: customFields }),
        ...(uploadTokens.length > 0 && { uploads: uploadTokens }),
      },
    };

    const response = await redmineFetch("/issues.json", apiKey, {
      method: "POST",
      body: JSON.stringify(issuePayload),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Redmine returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    res.status(201).json({ id: data.issue.id, url: `${getBaseUrl()}/issues/${data.issue.id}` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to create issue: ${err.message}` });
  }
});

export default router;
