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
import { getAuthContext, getRoleDepartment } from "../middleware/access";

const router: IRouter = Router();

// CR047 — every Redmine route requires an authenticated QM Pulse user. Without
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

/** Reads from Redmine with the caller's key, retrying once with the service
 *  key if their own is rejected.
 *
 *  A personal key set in Settings wins over the env default, and there is no
 *  fallback once one exists — so a member whose key is stale, revoked or
 *  scoped below the ticket they are syncing gets a hard "Authentication
 *  failed", while an admin (or anyone who never saved a key, and so uses the
 *  service key) succeeds on the same ticket. Sync is meant to work for
 *  everyone, so a rejected personal key degrades to the service key instead
 *  of failing the request.
 *
 *  Reads only. Writes keep using the caller's own key, so an issue created or
 *  updated in Redmine is still attributed to the person who did it and is
 *  still subject to their permissions. */
async function redmineRead(path: string, apiKey: string): Promise<Response> {
  const response = await redmineFetch(path, apiKey);
  const serviceKey = getDefaultApiKey();
  if ((response.status === 401 || response.status === 403) && serviceKey && apiKey !== serviceKey) {
    return redmineFetch(path, serviceKey);
  }
  return response;
}

// ─── Existing: single issue fetch (Verdict Report + callers elsewhere) ──────

router.get("/verdict-report/redmine/:issueId", async (req, res): Promise<void> => {
  const issueId = parseInt(req.params.issueId);
  if (isNaN(issueId)) {
    res.status(400).json({ error: "Invalid issue ID" });
    return;
  }
  try {
    const apiKey = await resolveApiKey(req);
    const response = await redmineRead(
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
    const data: any = await response.json();
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

router.get("/verdict-report/redmine-status", async (_req, res): Promise<void> => {
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
      const response = await redmineRead(
        `/projects.json?limit=${limit}&offset=${offset}`,
        apiKey,
      );
      if (!response.ok) {
        throw new Error(`Redmine API returned status: ${response.status}`);
      }
      const data: any = await response.json();
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
  const { complexityFieldId, targetedStartDateFieldId, targetedCompletionDateFieldId, sourceFieldId } = req.body;
  try {
    const [config] = await db
      .insert(redmineProjectConfigsTable)
      .values({
        redmineProjectId,
        complexityFieldId: complexityFieldId ?? null,
        targetedStartDateFieldId: targetedStartDateFieldId ?? null,
        targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
        sourceFieldId: sourceFieldId ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: redmineProjectConfigsTable.redmineProjectId,
        set: {
          complexityFieldId: complexityFieldId ?? null,
          targetedStartDateFieldId: targetedStartDateFieldId ?? null,
          targetedCompletionDateFieldId: targetedCompletionDateFieldId ?? null,
          sourceFieldId: sourceFieldId ?? null,
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
  const { complexityFieldId, targetedStartDateFieldId, targetedCompletionDateFieldId, sourceFieldId } = req.body;
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
          sourceFieldId: sourceFieldId ?? null,
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
          sourceFieldId: sourceFieldId ?? null,
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
    const response = await redmineRead("/trackers.json", apiKey);
    if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
    const data: any = await response.json();
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

    // Memberships paginate like every other Redmine collection. This used to
    // request a single limit=100 page and ignore total_count, so any project
    // with more than 100 members silently lost everyone past the first page —
    // they just never appeared in the defect assignee dropdown. Same loop the
    // /sync-projects route above already uses.
    const memberships: any[] = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const response = await redmineRead(
        `/projects/${projectId}/memberships.json?limit=${limit}&offset=${offset}`,
        apiKey,
      );
      if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
      const data: any = await response.json();
      const batch: any[] = data.memberships ?? [];
      memberships.push(...batch);
      if (memberships.length >= (data.total_count ?? 0) || batch.length < limit) break;
      offset += limit;
    }

    // A membership's principal is either a user or a group; only users can be
    // named here. Dedup by id defensively — one person can hold more than one
    // membership row on a project.
    const byId = new Map<number, { id: number; name: string }>();
    for (const m of memberships) {
      if (m.user && !byId.has(m.user.id)) byId.set(m.user.id, { id: m.user.id, name: m.user.name });
    }
    const members = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch members: ${err.message}` });
  }
});

// ─── Search: duplicate check ─────────────────────────────────────────────────

// A defect's subject has to carry the top of the requirement tree, not the
// ticket it hangs off. QA links a failing test case to the leaf User Story
// (e.g. #40046), but that leaf can sit several levels under the ticket the
// run is actually reported against (#40046 -> #40044 -> #40054), and a
// subject reading "#40046 - ..." names a ticket nobody tracks the run by.
// Walk to the root and let the caller title the defect with that.
router.get("/redmine/issues/:issueId/root", async (req, res): Promise<void> => {
  const issueId = parseInt(req.params.issueId);
  if (isNaN(issueId)) {
    res.status(400).json({ error: "Invalid issue ID" });
    return;
  }
  try {
    const apiKey = await resolveApiKey(req);
    // Redmine cannot return an ancestor chain in one call, so this walks it a
    // level at a time. The depth cap and seen-set are belt and braces: a
    // corrupted parent cycle would otherwise loop until the request times out.
    const MAX_DEPTH = 10;
    const chain: number[] = [issueId];
    const seen = new Set<number>([issueId]);
    let currentId = issueId;
    let truncated = false;

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const response = await redmineRead(`/issues/${currentId}.json`, apiKey);
      if (!response.ok) {
        // An unreadable ancestor (deleted, or in a project this key cannot
        // see) stops the walk rather than failing it — the deepest ticket we
        // did resolve is still a better subject than the leaf.
        if (depth === 0 && response.status === 404) {
          res.status(404).json({ error: `Redmine issue #${issueId} not found` });
          return;
        }
        break;
      }
      const parentId = ((await response.json()) as any)?.issue?.parent?.id;
      if (!parentId || seen.has(parentId)) break;
      seen.add(parentId);
      chain.push(parentId);
      currentId = parentId;
      if (depth === MAX_DEPTH - 1) truncated = true;
    }

    res.json({ id: issueId, rootId: currentId, chain, truncated });
  } catch (err: any) {
    res.status(503).json({ error: `Failed to fetch from Redmine API: ${err.message}` });
  }
});

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
    const response = await redmineRead(url, apiKey);
    if (!response.ok) throw new Error(`Redmine API returned status: ${response.status}`);
    const data: any = await response.json();
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
    sourceFieldId,
    uploads,
  } = req.body;

  if (!projectId || !subject) {
    res.status(400).json({ error: "projectId and subject are required" });
    return;
  }

  try {
    const apiKey = await resolveApiKey(req);
    // Source is always the reporter's own department (qa/dev/fa/pm) — never
    // client-supplied, same trust boundary as defectCategory's tier gate.
    // Redmine's Source custom field is a fixed list whose values are the
    // uppercase department code (QA/DEV/FA/PM), not the lowercase role
    // department string QM Pulse stores internally.
    const ctx = getAuthContext(req);
    const department = ctx ? await getRoleDepartment(ctx.role) : null;
    const sourceValue = department ? department.toUpperCase() : null;

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
        const uploadData: any = await uploadRes.json();
        uploadTokens.push({ token: uploadData.upload.token, filename, content_type: contentType });
      }
    }

    // Build custom fields array. `setting` is the name of the QM Pulse config
    // slot each id came from, kept so a rejection can name the setting to fix
    // rather than the Redmine field that happened to receive the value.
    const customFields: { id: number; value: string; setting: string }[] = [];
    if (complexityFieldId && complexityValue) {
      customFields.push({ id: Number(complexityFieldId), value: complexityValue, setting: "Complexity Field ID" });
    }
    if (targetedStartDateFieldId && targetedStartDate) {
      customFields.push({ id: Number(targetedStartDateFieldId), value: targetedStartDate, setting: "Targeted Start Date Field ID" });
    }
    if (targetedCompletionDateFieldId && targetedCompletionDate) {
      customFields.push({ id: Number(targetedCompletionDateFieldId), value: targetedCompletionDate, setting: "Targeted Completion Date Field ID" });
    }
    if (sourceFieldId && sourceValue) {
      customFields.push({ id: Number(sourceFieldId), value: sourceValue, setting: "Source Field ID" });
    }
    // Redmine takes {id, value} only — `setting` is ours and must not be sent.
    const toRedmine = (fields: typeof customFields) => fields.map(({ id, value }) => ({ id, value }));

    // A parent Redmine cannot resolve fails the whole create with "Parent task
    // is invalid", and callers do not always supply a real issue id. The
    // execution sheet falls back to the execution file's own reference when
    // none of the file's requirements carries a Redmine ticket — and that
    // reference is a QM Pulse identifier, not a Redmine issue. Check it first
    // and file the defect unparented rather than losing the whole report; the
    // response says so, so the UI can tell the reporter to link it by hand.
    let parentDropped: string | null = null;
    let effectiveParentId: number | null = parentIssueId ? Number(parentIssueId) : null;
    if (effectiveParentId == null || Number.isNaN(effectiveParentId)) {
      effectiveParentId = null;
    } else {
      const parentRes = await redmineRead(`/issues/${effectiveParentId}.json`, apiKey);
      if (!parentRes.ok) {
        parentDropped = `#${effectiveParentId} could not be used as the parent task (Redmine returned ${parentRes.status}), so the issue was created without one.`;
        effectiveParentId = null;
      }
    }

    const baseIssue: any = {
      project_id: projectId,
      tracker_id: trackerId,
      subject,
      description: description ?? "",
      ...(effectiveParentId != null && { parent_issue_id: effectiveParentId }),
      ...(assigneeId && { assigned_to_id: Number(assigneeId) }),
      ...(uploadTokens.length > 0 && { uploads: uploadTokens }),
    };

    const postIssue = (issue: any) =>
      redmineFetch("/issues.json", apiKey, { method: "POST", body: JSON.stringify({ issue }) });

    // Redmine answers validation failures with {"errors":[...]}. Assignees come
    // from the whole contact directory rather than the project's own members,
    // so "Assignee is invalid" (the user is not an allowed assignee on that
    // project) is a normal outcome a QA needs to read and act on — not a raw
    // JSON blob in a toast.
    const readErrors = async (r: Response): Promise<string[]> => {
      const body = await r.text();
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) return parsed.errors.map(String);
      } catch { /* not JSON — fall back to the raw body */ }
      return [body];
    };

    // Maps the custom field ids this Redmine actually has to their names, so a
    // validation error naming a field can be traced back to the id we sent.
    // /custom_fields.json is admin-only, so fall back to reading the fields off
    // any one issue in the project — an ordinary issue's JSON carries the same
    // id+name pairs and needs no special permission.
    const loadCustomFieldNames = async (): Promise<Map<number, string>> => {
      const names = new Map<number, string>();
      const collect = (fields: any) => {
        if (!Array.isArray(fields)) return;
        for (const f of fields) {
          if (typeof f?.id === "number" && typeof f?.name === "string") names.set(f.id, f.name);
        }
      };
      try {
        const res = await redmineRead("/custom_fields.json", apiKey);
        if (res.ok) collect(((await res.json()) as any)?.custom_fields);
      } catch { /* admin-only — fall through */ }
      if (names.size === 0) {
        try {
          const res = await redmineRead(`/issues.json?project_id=${encodeURIComponent(String(projectId))}&limit=1&status_id=*`, apiKey);
          if (res.ok) collect(((await res.json()) as any)?.issues?.[0]?.custom_fields);
        } catch { /* best effort — diagnosis is optional, creating the issue is not */ }
      }
      return names;
    };

    let response = await postIssue({
      ...baseIssue,
      ...(customFields.length > 0 && { custom_fields: toRedmine(customFields) }),
    });

    let customFieldsDropped = false;
    let misconfiguredFields: string[] = [];
    let firstErrors: string[] = [];
    if (!response.ok) {
      firstErrors = await readErrors(response);
      // Complexity/date/source custom fields are configured globally, but not
      // every Redmine project actually has all of them enabled — Redmine then
      // rejects the whole issue rather than ignoring the fields it doesn't
      // recognize. Retry without them so the defect still gets created; only
      // the metadata that project doesn't support is lost.
      //
      // 422 is Redmine's validation failure, and the retry changes nothing but
      // the custom fields — so it can only succeed when the custom fields were
      // the blocker. That makes it safe on any validation error rather than
      // only ones naming a field we recognise, which matters because a field id
      // mapped to the WRONG Redmine field fails under that field's name: a
      // Complexity id pointing at a date field comes back as "Actual Start Date
      // is not a valid date", a name no hint list could have anticipated.
      //
      // The reported error stays the first attempt's either way, so a real
      // cause like an invalid parent is never hidden behind the complaints of
      // the weaker payload (the retry strips fields the tracker requires, so
      // its errors describe what we removed, not what the reporter got wrong).
      if (customFields.length > 0 && response.status === 422) {
        // Work out which id Redmine was actually complaining about. A field id
        // pointing at the wrong Redmine field fails under THAT field's name
        // ("Actual Start Date is not a valid date" for an id that should have
        // been Source), so matching the error text against the real names is
        // the only way to tell which QM Pulse setting is wrong.
        const fieldNames = await loadCustomFieldNames();
        const blamed = customFields.filter((f) => {
          const name = fieldNames.get(f.id);
          return !!name && firstErrors.some((m) => m.toLowerCase().includes(name.toLowerCase()));
        });

        if (blamed.length > 0 && blamed.length < customFields.length) {
          // Drop only the offending field. Dropping all of them would fail
          // again whenever the tracker requires the others — which is exactly
          // the case that was leaving reporters with no way to file at all.
          const keep = customFields.filter((f) => !blamed.includes(f));
          response = await postIssue({ ...baseIssue, custom_fields: toRedmine(keep) });
          if (response.ok) {
            customFieldsDropped = true;
            misconfiguredFields = blamed.map((f) =>
              `"${f.setting}" is set to ${f.id}, which is Redmine's "${fieldNames.get(f.id)}" field`,
            );
          }
        }

        // Nothing identified (or the targeted retry failed anyway) — fall back
        // to the blunt retry without any custom fields.
        if (!response.ok) {
          response = await postIssue(baseIssue);
          customFieldsDropped = response.ok;
          if (response.ok && blamed.length > 0) {
            misconfiguredFields = blamed.map((f) =>
              `"${f.setting}" is set to ${f.id}, which is Redmine's "${fieldNames.get(f.id)}" field`,
            );
          }
        }
      }
    }

    if (!response.ok) {
      // Always the FIRST attempt's errors: the retry deliberately sends a
      // weaker payload, so its complaints describe what we removed, not what
      // the reporter got wrong.
      throw new Error(`Redmine returned ${response.status}: ${firstErrors.join("; ")}`);

    }

    const data: any = await response.json();
    res.status(201).json({
      id: data.issue.id,
      url: `${getBaseUrl()}/issues/${data.issue.id}`,
      customFieldsDropped,
      // What Redmine actually objected to. Worth carrying through on a success:
      // the defect got filed, but a field id mapping to the wrong Redmine field
      // is invisible otherwise — the reporter only ever sees metadata quietly
      // going missing, with no clue which id to correct.
      ...(customFieldsDropped && firstErrors.length > 0 ? { customFieldErrors: firstErrors } : {}),
      ...(misconfiguredFields.length > 0 ? { misconfiguredFields } : {}),
      ...(parentDropped ? { parentDropped } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to create issue: ${err.message}` });
  }
});

export default router;
