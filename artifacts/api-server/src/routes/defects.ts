import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import {
  db,
  defectsTable,
  defectLinksTable,
  testCasesTable,
  requirementsTable,
  projectsTable,
  executionTestCasesTable,
  executionFilesTable,
} from "@workspace/db";
import { actorFromReq } from "./auth";
import { logActivity, diffChanges } from "./_audit";
import { resolveApiKeyFromToken } from "./requirements";
import {
  pushDefectToRedmine,
  refreshDefectStatuses,
  pullProductionDefects,
  fetchChildIssuesByTracker,
  severityFromPriority,
} from "./redmine-defect-bridge";

const router: IRouter = Router();

// Redmine statuses that mean "fix landed, QA should retest"
const RETEST_STATUS = /fixed|resolved|ready/i;
const CLOSED_STATUS = /closed|verified|rejected|cancelled/i;

// Append the Redmine id to the execution row's defect_number exactly as if the
// QA had typed it — keeps Pareto/CAPA/verdict Excel and link-out chips working.
async function backfillDefectNumber(executionTcId: number, redmineId: string) {
  const [row] = await db
    .select({ defectNumber: executionTestCasesTable.defectNumber })
    .from(executionTestCasesTable)
    .where(eq(executionTestCasesTable.id, executionTcId));
  if (!row) return;
  const existing = (row.defectNumber ?? "")
    .split(/[,;\s]+/)
    .map((s: any) => s.trim())
    .filter(Boolean);
  if (existing.includes(redmineId)) return;
  await db
    .update(executionTestCasesTable)
    .set({ defectNumber: [...existing, redmineId].join(", ") })
    .where(eq(executionTestCasesTable.id, executionTcId));
}

// ─── List ────────────────────────────────────────────────────────────────────

router.get("/defects", async (req, res): Promise<void> => {
  try {
    const { source, severity, projectId, search, escapeStatus, view } = req.query as Record<string, string>;

    let defects = await db.select().from(defectsTable).orderBy(desc(defectsTable.id));
    if (source) defects = defects.filter((d: any) => d.source === source);
    if (severity) defects = defects.filter((d: any) => d.severity === severity);
    if (projectId) defects = defects.filter((d: any) => d.projectId === Number(projectId));
    if (escapeStatus) defects = defects.filter((d: any) => d.escapeStatus === escapeStatus);
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      defects = defects.filter(
        (d: any) =>
          d.title.toLowerCase().includes(q) ||
          (d.defectCode ?? "").toLowerCase().includes(q) ||
          (d.redmineId ?? "").includes(q),
      );
    }

    const ids = defects.map((d: any) => d.id);
    const links = ids.length
      ? await db.select().from(defectLinksTable).where(inArray(defectLinksTable.defectId, ids))
      : [];

    const execIds = links.map((l: any) => l.executionTcId).filter((v: any): v is number => v != null);
    const execRows = execIds.length
      ? await db
          .select({
            id: executionTestCasesTable.id,
            caseId: executionTestCasesTable.caseId,
            testCaseId: executionTestCasesTable.testCaseId,
            caseName: executionTestCasesTable.caseName,
            result: executionTestCasesTable.result,
            fileId: executionFilesTable.id,
            fileTicket: executionFilesTable.redmineTicketId,
            fileTitle: executionFilesTable.title,
          })
          .from(executionTestCasesTable)
          .leftJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
          .where(inArray(executionTestCasesTable.id, execIds))
      : [];
    const execById = new Map<number, any>(execRows.map((r: any) => [r.id, r]));

    const tcIds = links.map((l: any) => l.testCaseId).filter((v: any): v is number => v != null);
    const tcRows = tcIds.length
      ? await db
          .select({ id: testCasesTable.id, caseId: testCasesTable.caseId, title: testCasesTable.title })
          .from(testCasesTable)
          .where(inArray(testCasesTable.id, tcIds))
      : [];
    const tcById = new Map<number, any>(tcRows.map((r: any) => [r.id, r]));

    const reqIds = links.map((l: any) => l.requirementId).filter((v: any): v is number => v != null);
    const reqRows = reqIds.length
      ? await db
          .select({ id: requirementsTable.id, title: requirementsTable.title, redmineTicketId: requirementsTable.redmineTicketId })
          .from(requirementsTable)
          .where(inArray(requirementsTable.id, reqIds))
      : [];
    const reqById = new Map<number, any>(reqRows.map((r: any) => [r.id, r]));

    const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
    const projectById = new Map<number, any>(projects.map((p: any) => [p.id, p.name]));

    let result = defects.map((d: any) => {
      const dLinks = links
        .filter((l: any) => l.defectId === d.id)
        .map((l: any) => {
          const exec = l.executionTcId != null ? execById.get(l.executionTcId) : undefined;
          const tc = l.testCaseId != null ? tcById.get(l.testCaseId) : undefined;
          const reqRow = l.requirementId != null ? reqById.get(l.requirementId) : undefined;
          const failed = /fail/i.test(exec?.result ?? "");
          return {
            id: l.id,
            linkType: l.linkType,
            executionTcId: l.executionTcId,
            displayCaseId: exec ? exec.testCaseId ?? exec.caseId ?? `#${exec.id}` : tc?.caseId ?? null,
            caseName: exec?.caseName ?? tc?.title ?? null,
            result: exec?.result ?? null,
            fileTicket: exec?.fileTicket ?? null,
            fileTitle: exec?.fileTitle ?? null,
            testCaseId: l.testCaseId,
            requirementId: l.requirementId,
            requirementTitle: reqRow?.title ?? null,
            retestNeeded:
              failed && RETEST_STATUS.test(d.status) && !CLOSED_STATUS.test(d.status),
          };
        });

      return {
        ...d,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        statusSyncedAt: d.statusSyncedAt ? d.statusSyncedAt.toISOString() : null,
        projectName: d.projectId ? projectById.get(d.projectId) ?? null : null,
        links: dLinks,
        retestNeeded: dLinks.some((l: any) => l.retestNeeded),
        hasRegressionTc: dLinks.some((l: any) => l.linkType === "regression_tc"),
      };
    });

    if (view === "blocking") {
      result = result.filter(
        (d: any) => !CLOSED_STATUS.test(d.status) && d.links.some((l: any) => /fail|block/i.test(l.result ?? "")),
      );
    } else if (view === "retest") {
      result = result.filter((d: any) => d.retestNeeded);
    } else if (view === "open") {
      result = result.filter((d: any) => !CLOSED_STATUS.test(d.status));
    }

    res.json(result);
  } catch (err: any) {
    console.error("[GET /defects]", err);
    res.status(500).json({ error: err?.message ?? "Failed to fetch defects" });
  }
});

// ─── Metrics (incl. CR020 leakage rate) ──────────────────────────────────────

router.get("/defects/metrics", async (req, res): Promise<void> => {
  try {
    const { projectId } = req.query as Record<string, string>;
    let defects = await db.select().from(defectsTable);
    if (projectId) defects = defects.filter((d: any) => d.projectId === Number(projectId));

    const links = await db.select().from(defectLinksTable);
    const regressionDefectIds = new Set(links.filter((l: any) => l.linkType === "regression_tc").map((l: any) => l.defectId));

    const qa = defects.filter((d: any) => d.source === "qa");
    const prod = defects.filter((d: any) => d.source === "production");
    const open = (list: typeof defects) => list.filter((d: any) => !CLOSED_STATUS.test(d.status)).length;
    const retest = defects.filter((d: any) => RETEST_STATUS.test(d.status) && !CLOSED_STATUS.test(d.status)).length;
    const total = defects.length;

    res.json({
      total,
      qaCount: qa.length,
      prodCount: prod.length,
      openQa: open(qa),
      openProd: open(prod),
      awaitingRetest: retest,
      leakageRate: total > 0 ? Math.round((prod.length / total) * 100) : 0,
      escapesAnalyzed: prod.filter((d: any) => d.escapeStatus !== "pending").length,
      escapesClosed: prod.filter((d: any) => d.escapeStatus === "closed").length,
      regressionTcs: prod.filter((d: any) => regressionDefectIds.has(d.id)).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to compute metrics" });
  }
});

// ─── Create (write-through to Redmine) ───────────────────────────────────────

router.post("/defects", async (req, res): Promise<void> => {
  try {
    const {
      title, description, stepsToReproduce, expectedResult, actualResult,
      severity, module, projectId, foundIn, executionTcId, requirementId,
      sourceIssueId, redmineProjectId, trackerName,
    } = req.body ?? {};

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const actorId = actorFromReq(req);
    const [defect] = await db
      .insert(defectsTable)
      .values({
        title: title.trim(),
        description: description ?? null,
        stepsToReproduce: stepsToReproduce ?? null,
        expectedResult: expectedResult ?? null,
        actualResult: actualResult ?? null,
        severity: severity ?? "medium",
        module: module ?? null,
        projectId: projectId ?? null,
        reporterId: actorId,
        source: "qa",
        foundIn: foundIn ?? "SIT",
        syncStatus: "pending",
      })
      .returning();

    const defectCode = `DEF-${String(defect.id).padStart(4, "0")}`;
    await db.update(defectsTable).set({ defectCode }).where(eq(defectsTable.id, defect.id));
    defect.defectCode = defectCode;

    if (executionTcId != null) {
      // also capture the library TC / requirement behind the execution row
      const [execRow] = await db
        .select({ libraryTcId: executionTestCasesTable.libraryTcId, requirementId: executionTestCasesTable.requirementId })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.id, Number(executionTcId)));
      await db.insert(defectLinksTable).values({
        defectId: defect.id,
        executionTcId: Number(executionTcId),
        testCaseId: execRow?.libraryTcId ?? null,
        requirementId: execRow?.requirementId ?? null,
        linkType: "found_by",
      });
    } else if (requirementId != null) {
      await db.insert(defectLinksTable).values({
        defectId: defect.id,
        requirementId: Number(requirementId),
        linkType: "requirement",
      });
    }

    // Write-through push — never blocks defect creation (pending-sync fallback)
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const push = await pushDefectToRedmine(defect, apiKey, {
      redmineProjectId: redmineProjectId ?? null,
      sourceIssueId: sourceIssueId ?? null,
      trackerName,
    });

    if (push.ok && push.redmineId) {
      await db
        .update(defectsTable)
        .set({ redmineId: push.redmineId, syncStatus: "synced", syncError: null, statusSyncedAt: new Date() })
        .where(eq(defectsTable.id, defect.id));
      defect.redmineId = push.redmineId;
      defect.syncStatus = "synced";
      if (executionTcId != null) await backfillDefectNumber(Number(executionTcId), push.redmineId);
    } else {
      await db
        .update(defectsTable)
        .set({ syncStatus: "pending", syncError: push.error ?? null })
        .where(eq(defectsTable.id, defect.id));
      defect.syncError = push.error ?? null;
    }

    await logActivity({
      type: "defect_created",
      description: `Defect ${defectCode} "${defect.title}" was created${push.ok ? ` (Redmine #${push.redmineId})` : " (Redmine sync pending)"}`,
      userId: actorId,
      entityId: defect.id,
      entityType: "defect",
      newValue: { title: defect.title, severity: defect.severity, foundIn: defect.foundIn, redmineId: push.redmineId ?? null },
    });

    res.status(201).json({ ...defect, syncOk: push.ok, syncError: push.ok ? null : push.error });
  } catch (err: any) {
    console.error("[POST /defects]", err);
    res.status(500).json({ error: err?.message ?? "Failed to create defect" });
  }
});

// ─── Register a defect that was already created in Redmine ──────────────────
// The execution fail modal creates the Redmine issue itself (pre-CR019 flow,
// with assignee/custom fields/screenshots) — this records it locally so the
// Defects page and retest tracking know about it. Upserts by redmineId.

router.post("/defects/register", async (req, res): Promise<void> => {
  try {
    const { redmineId, title, description, expectedResult, actualResult, severity, module, executionTcId } = req.body ?? {};
    if (!redmineId || !title) {
      res.status(400).json({ error: "redmineId and title are required" });
      return;
    }

    const actorId = actorFromReq(req);

    // derive project + environment from the execution row's file
    let projectId: number | null = null;
    let foundIn = "SIT";
    let execMeta: { libraryTcId: number | null; requirementId: number | null } | null = null;
    if (executionTcId != null) {
      const [row] = await db
        .select({
          libraryTcId: executionTestCasesTable.libraryTcId,
          requirementId: executionTestCasesTable.requirementId,
          fileProjectId: executionFilesTable.projectId,
          fileTracker: executionFilesTable.tracker,
        })
        .from(executionTestCasesTable)
        .leftJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
        .where(eq(executionTestCasesTable.id, Number(executionTcId)));
      if (row) {
        projectId = row.fileProjectId ?? null;
        if (/uat/i.test(row.fileTracker ?? "")) foundIn = "UAT";
        execMeta = { libraryTcId: row.libraryTcId, requirementId: row.requirementId };
      }
    }

    const [existing] = await db.select().from(defectsTable).where(eq(defectsTable.redmineId, String(redmineId)));
    let defect = existing;
    if (!existing) {
      const [created] = await db
        .insert(defectsTable)
        .values({
          title: String(title),
          description: description ?? null,
          expectedResult: expectedResult ?? null,
          actualResult: actualResult ?? null,
          severity: severity ?? "medium",
          module: module ?? null,
          projectId,
          reporterId: actorId,
          redmineId: String(redmineId),
          syncStatus: "synced",
          source: "qa",
          foundIn,
          statusSyncedAt: null,
        })
        .returning();
      const defectCode = `DEF-${String(created.id).padStart(4, "0")}`;
      await db.update(defectsTable).set({ defectCode }).where(eq(defectsTable.id, created.id));
      created.defectCode = defectCode;
      defect = created;
      await logActivity({
        type: "defect_created",
        description: `Defect ${defectCode} "${created.title}" registered (Redmine #${redmineId})`,
        userId: actorId,
        entityId: created.id,
        entityType: "defect",
        newValue: { title: created.title, redmineId: String(redmineId), foundIn },
      });
    }

    if (executionTcId != null && defect) {
      const dLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.defectId, defect.id));
      if (!dLinks.some((l: any) => l.executionTcId === Number(executionTcId))) {
        await db.insert(defectLinksTable).values({
          defectId: defect.id,
          executionTcId: Number(executionTcId),
          testCaseId: execMeta?.libraryTcId ?? null,
          requirementId: execMeta?.requirementId ?? null,
          linkType: "found_by",
        });
      }
    }

    res.status(existing ? 200 : 201).json(defect);
  } catch (err: any) {
    console.error("[POST /defects/register]", err);
    res.status(500).json({ error: err?.message ?? "Failed to register defect" });
  }
});

// ─── Retry a pending/errored Redmine push ────────────────────────────────────

router.post("/defects/:id/retry-sync", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const push = await pushDefectToRedmine(defect, apiKey, {
      redmineProjectId: req.body?.redmineProjectId ?? null,
      sourceIssueId: req.body?.sourceIssueId ?? null,
    });
    if (push.ok && push.redmineId) {
      await db
        .update(defectsTable)
        .set({ redmineId: push.redmineId, syncStatus: "synced", syncError: null, statusSyncedAt: new Date() })
        .where(eq(defectsTable.id, id));
      const dLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.defectId, id));
      for (const l of dLinks) {
        if (l.executionTcId != null) await backfillDefectNumber(l.executionTcId, push.redmineId);
      }
      res.json({ ok: true, redmineId: push.redmineId });
    } else {
      await db.update(defectsTable).set({ syncStatus: "error", syncError: push.error ?? null }).where(eq(defectsTable.id, id));
      res.status(502).json({ ok: false, error: push.error });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Retry failed" });
  }
});

// ─── Refresh cached Redmine statuses (one-way read) ──────────────────────────

router.post("/defects/refresh-status", async (req, res): Promise<void> => {
  try {
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const result = await refreshDefectStatuses(apiKey);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Refresh failed" });
  }
});

// ─── CR020: pull production incidents from Redmine ───────────────────────────

router.post("/defects/pull-production", async (req, res): Promise<void> => {
  try {
    const trackerName = req.body?.trackerName;
    if (!trackerName || typeof trackerName !== "string") {
      res.status(400).json({ error: "trackerName is required" });
      return;
    }
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const result = await pullProductionDefects(apiKey, trackerName);
    if (result.error) {
      res.status(502).json(result);
      return;
    }
    await logActivity({
      type: "defects_pulled",
      description: `Production defects pulled from Redmine tracker "${trackerName}": ${result.imported} new, ${result.updated} updated`,
      userId: actorFromReq(req),
      entityType: "defect",
      newValue: { trackerName, ...result },
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Pull failed" });
  }
});

// ─── Sync from Redmine: children of a requirement's ticket, routed by tracker ─
// Tracker routing: QA Defect → qa defect list · Prod Defect → production list ·
// User Story → requirements · anything else → qa defect list, real tracker kept.

function routeForTracker(trackerName: string): "qa" | "production" | "requirement" {
  const n = trackerName.toLowerCase();
  if (n.includes("prod")) return "production";
  if (n.includes("user story") || n.includes("story")) return "requirement";
  return "qa";
}

router.post("/defects/sync-from-redmine", async (req, res): Promise<void> => {
  try {
    const { projectId, module, requirementId, trackerName } = req.body ?? {};
    if (!requirementId || !trackerName) {
      res.status(400).json({ error: "requirementId and trackerName are required" });
      return;
    }

    const [requirement] = await db
      .select()
      .from(requirementsTable)
      .where(eq(requirementsTable.id, Number(requirementId)));
    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }
    if (!requirement.redmineTicketId) {
      res.status(400).json({ error: "Selected requirement has no Redmine ticket id" });
      return;
    }

    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const { issues, error } = await fetchChildIssuesByTracker(apiKey, requirement.redmineTicketId, String(trackerName));
    if (error) {
      res.status(502).json({ error });
      return;
    }

    const route = routeForTracker(String(trackerName));
    const actorId = actorFromReq(req);
    let created = 0;
    let updated = 0;

    for (const issue of issues) {
      const rid = String(issue.id);

      if (route === "requirement") {
        const [existing] = await db
          .select()
          .from(requirementsTable)
          .where(eq(requirementsTable.redmineTicketId, rid));
        if (existing) {
          await db
            .update(requirementsTable)
            .set({
              title: issue.subject ?? existing.title,
              module: module ?? existing.module,
              projectId: projectId ?? existing.projectId,
              parentId: requirement.id,
            })
            .where(eq(requirementsTable.id, existing.id));
          updated++;
        } else {
          await db.insert(requirementsTable).values({
            title: issue.subject ?? "Untitled",
            description: issue.description ?? null,
            module: module ?? requirement.module,
            projectId: projectId ?? requirement.projectId,
            parentId: requirement.id,
            redmineTicketId: rid,
            tracker: String(trackerName),
            status: "open",
          });
          created++;
        }
        continue;
      }

      // defect routes (qa / production / other-tracker-as-qa)
      const cached = {
        status: issue.status?.name ?? "Unknown",
        assigneeName: issue.assigned_to?.name ?? null,
        statusSyncedAt: new Date(),
      };
      const [existing] = await db.select().from(defectsTable).where(eq(defectsTable.redmineId, rid));
      let defectId: number;
      if (existing) {
        await db
          .update(defectsTable)
          .set({
            ...cached,
            title: issue.subject ?? existing.title,
            module: module ?? existing.module,
            projectId: projectId ?? existing.projectId,
            tracker: String(trackerName),
          })
          .where(eq(defectsTable.id, existing.id));
        defectId = existing.id;
        updated++;
      } else {
        const [row] = await db
          .insert(defectsTable)
          .values({
            title: issue.subject ?? "Untitled",
            description: issue.description ?? null,
            severity: severityFromPriority(issue.priority?.name),
            module: module ?? null,
            projectId: projectId ?? null,
            reporterId: actorId,
            redmineId: rid,
            syncStatus: "synced",
            source: route === "production" ? "production" : "qa",
            foundIn: route === "production" ? "Production" : "SIT",
            tracker: String(trackerName),
            ...cached,
          })
          .returning();
        const prefix = route === "production" ? "DEF-P" : "DEF-";
        await db
          .update(defectsTable)
          .set({ defectCode: `${prefix}${String(row.id).padStart(4, "0")}` })
          .where(eq(defectsTable.id, row.id));
        defectId = row.id;
        created++;
      }

      // stamp the requirement link (dedupe)
      const dLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.defectId, defectId));
      if (!dLinks.some((l: any) => l.requirementId === requirement.id)) {
        await db.insert(defectLinksTable).values({
          defectId,
          requirementId: requirement.id,
          linkType: "requirement",
        });
      }
    }

    await logActivity({
      type: "defects_synced",
      description: `Synced ${issues.length} "${trackerName}" issue(s) under requirement "${requirement.title}" (#${requirement.redmineTicketId}): ${created} new, ${updated} updated`,
      userId: actorId,
      entityId: requirement.id,
      entityType: route === "requirement" ? "requirement" : "defect",
      newValue: { trackerName, route, created, updated, parentRedmineId: requirement.redmineTicketId },
    });

    res.json({ route, total: issues.length, created, updated });
  } catch (err: any) {
    console.error("[POST /defects/sync-from-redmine]", err);
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
});

// ─── CR020: escape review fields ─────────────────────────────────────────────

router.patch("/defects/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [before] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    const patch: Record<string, any> = {};
    for (const key of ["escapeStatus", "escapeClass", "escapeNotes", "severity", "module", "projectId"]) {
      if (key in (req.body ?? {})) patch[key] = req.body[key];
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const [updated] = await db.update(defectsTable).set(patch).where(eq(defectsTable.id, id)).returning();

    const diff = diffChanges(before, patch);
    if (diff) {
      await logActivity({
        type: "defect_updated",
        description: `Defect ${updated.defectCode ?? `#${id}`} was updated`,
        userId: actorFromReq(req),
        entityId: id,
        entityType: "defect",
        ...diff,
      });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Update failed" });
  }
});

// ─── CR020: create a regression TC from a defect ─────────────────────────────

router.post("/defects/:id/regression-tc", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }

    const actorId = actorFromReq(req);
    // linked requirement (if any) so the regression TC lands in traceability
    const dLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.defectId, id));
    const linkedReqId = dLinks.find((l: any) => l.requirementId != null)?.requirementId ?? null;

    const [tc] = await db
      .insert(testCasesTable)
      .values({
        title: req.body?.title?.trim() || `Regression: ${defect.title}`,
        scenario: `Regression coverage for ${defect.defectCode ?? `defect #${id}`}${defect.redmineId ? ` (RM #${defect.redmineId})` : ""}`,
        preconditions: req.body?.preconditions ?? null,
        testSteps: defect.stepsToReproduce ?? defect.description ?? null,
        expectedResult: defect.expectedResult ?? null,
        module: req.body?.module ?? defect.module ?? null,
        projectId: req.body?.projectId ?? defect.projectId ?? null,
        requirementId: linkedReqId,
        authorId: actorId,
        tags: "regression,escape",
      })
      .returning();

    await db.insert(defectLinksTable).values({
      defectId: id,
      testCaseId: tc.id,
      requirementId: linkedReqId,
      linkType: "regression_tc",
    });

    // regression TC created = analysis progressed; close handled manually/on retest
    if (defect.source === "production" && defect.escapeStatus === "pending") {
      await db.update(defectsTable).set({ escapeStatus: "analyzing" }).where(eq(defectsTable.id, id));
    }

    await logActivity({
      type: "test_case_created",
      description: `Regression TC "${tc.title}" created from defect ${defect.defectCode ?? `#${id}`}`,
      userId: actorId,
      entityId: tc.id,
      entityType: "test_case",
      newValue: { defectId: id, defectCode: defect.defectCode ?? null },
    });

    res.status(201).json(tc);
  } catch (err: any) {
    console.error("[POST /defects/:id/regression-tc]", err);
    res.status(500).json({ error: err?.message ?? "Failed to create regression TC" });
  }
});

export default router;
