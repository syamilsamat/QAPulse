import { Router, type IRouter } from "express";
import { eq, inArray, desc, ilike } from "drizzle-orm";
import {
  db,
  defectsTable,
  defectLinksTable,
  testCasesTable,
  requirementsTable,
  projectsTable,
  executionTestCasesTable,
  executionFilesTable,
  redmineStatusesTable,
  usersTable,
} from "@workspace/db";
import { actorFromReq } from "./auth";
import { getAuthContext, scopeToUserProjects, canAccessProject, getRoleTierRank, getModuleScope } from "../middleware/access";
import { logActivity, diffChanges } from "./_audit";
import { notifyUser } from "./_notify";
import { resolveApiKeyFromToken } from "./requirements";
import {
  pushDefectToRedmine,
  refreshDefectStatuses,
  pullTrackerIssues,
  fetchIssueTree,
  severityFromPriority,
  syncIssueStatuses,
  pushStatusToRedmine,
  pushAssigneeToRedmine,
  routeForTracker,
  defectCodePrefix,
} from "./redmine-defect-bridge";

const router: IRouter = Router();

// CR014 access control. Defects with no project are visible to any
// authenticated user (Redmine pulls can land without a project); scoping
// applies only to project-tagged defects.
function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return ctx;
}

async function canAccessDefectProject(
  ctx: { userId: number; role: string },
  projectId: number | null | undefined,
): Promise<boolean> {
  if (projectId == null) return true;
  return canAccessProject(ctx.userId, ctx.role, projectId);
}

// Redmine statuses that mean "fix landed, QA should retest"
const RETEST_STATUS = /fixed|resolved|ready/i;
const CLOSED_STATUS = /closed|verified|rejected|cancelled/i;

// CR027 — defect_opened: fan out to the project's qa_lead+ users so quality
// leads see new defects without needing to check the Defects page.
const QA_LEAD_ROLES = ["qa_lead", "hod_qa", "admin", "cto"];

// CR031 — who may raise a defect against an already-approved requirement.
const REQUIREMENT_DEFECT_RAISER_ROLES = [
  "dev_member", "dev_lead", "hod_dev",
  "qa_member", "qa_lead", "hod_qa",
  "admin", "cto",
];

async function notifyQaLeads(defect: typeof defectsTable.$inferSelect, actorId: number | null): Promise<void> {
  if (defect.projectId == null) return;
  const candidates = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable);
  const eligible = candidates.filter((u) => QA_LEAD_ROLES.includes(u.role));
  const projectId = defect.projectId;
  const recipients: number[] = [];
  for (const u of eligible) {
    if (await canAccessProject(u.id, u.role, projectId)) recipients.push(u.id);
  }
  await Promise.all(
    recipients.map((uid) =>
      notifyUser(
        uid,
        "New defect opened",
        `${defect.defectCode ?? `Defect #${defect.id}`} "${defect.title}" was opened.`,
        "defect_opened",
        "defect",
        defect.id,
        actorId,
      ).catch(() => {}),
    ),
  );
}

// The execution row (qaPic + result) behind a defect's "found_by" link, if any.
async function findLinkedExecutionTc(defectId: number): Promise<{ qaPic: string | null; result: string | null } | null> {
  const [link] = await db
    .select({ executionTcId: defectLinksTable.executionTcId })
    .from(defectLinksTable)
    .where(eq(defectLinksTable.defectId, defectId));
  if (!link?.executionTcId) return null;
  const [row] = await db
    .select({ qaPic: executionTestCasesTable.qaPic, result: executionTestCasesTable.result })
    .from(executionTestCasesTable)
    .where(eq(executionTestCasesTable.id, link.executionTcId));
  return row ?? null;
}

// qaPic is stored as a free-text name, not a user id — best-effort resolve
// against the users table (same convention used for Redmine-imported names
// elsewhere in this codebase).
async function resolveUserIdByName(name: string | null): Promise<number | null> {
  if (!name?.trim()) return null;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.name, name.trim()));
  return user?.id ?? null;
}

// QAPulse-native defect category taxonomy — fixed set, independent of
// whatever a given Redmine project's own "category" field happens to hold.
const DEFECT_CATEGORIES = [
  "functional", "ui_ux", "usability", "performance", "security",
  "data", "compatibility", "integration", "configuration", "localization",
] as const;

// Only Lead-tier and above may set a defect's category.
async function canSetDefectCategory(role: string): Promise<boolean> {
  return (await getRoleTierRank(role)) >= 2;
}

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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { source, severity, projectId, search, escapeStatus, view } = req.query as Record<string, string>;

    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    if (projectId && accessible !== null && !accessible.includes(Number(projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    let defects = await db.select().from(defectsTable).orderBy(desc(defectsTable.id));
    if (accessible !== null) {
      defects = defects.filter((d: any) => d.projectId == null || accessible.includes(d.projectId));
    }
    if (source) defects = defects.filter((d: any) => d.source === source);
    if (severity) defects = defects.filter((d: any) => d.severity === severity);
    if (projectId) defects = defects.filter((d: any) => d.projectId === Number(projectId));
    if (escapeStatus) defects = defects.filter((d: any) => d.escapeStatus === escapeStatus);

    // CR035 — module-scope, checked once per distinct project rather than per row.
    const defectProjectIds = [...new Set(defects.map((d: any) => d.projectId).filter((id: any): id is number => id != null))];
    const defectModuleScopes = new Map(await Promise.all(defectProjectIds.map(async (pid) => [pid, await getModuleScope(ctx.userId, ctx.role, pid)] as const)));
    defects = defects.filter((d: any) => {
      const scope = d.projectId != null ? defectModuleScopes.get(d.projectId) : undefined;
      if (!scope || !scope.restricted) return true;
      return d.module != null && scope.moduleNames.includes(d.module);
    });
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
    } else if (view === "mine") {
      // CR030 — "My Defects": native assignment only (Redmine-only cached
      // assignee names aren't matched back to a QAPulse user id).
      result = result.filter((d: any) => d.assigneeId === ctx.userId);
    }

    res.json(result);
  } catch (err: any) {
    console.error("[GET /defects]", err);
    res.status(500).json({ error: err?.message ?? "Failed to fetch defects" });
  }
});

// ─── Metrics (incl. CR020 leakage rate) ──────────────────────────────────────

router.get("/defects/metrics", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { projectId } = req.query as Record<string, string>;
    const accessible = await scopeToUserProjects(ctx.userId, ctx.role);
    if (projectId && accessible !== null && !accessible.includes(Number(projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    let defects = await db.select().from(defectsTable);
    if (accessible !== null) {
      defects = defects.filter((d: any) => d.projectId == null || accessible.includes(d.projectId));
    }
    if (projectId) defects = defects.filter((d: any) => d.projectId === Number(projectId));

    const links = await db.select().from(defectLinksTable);
    const regressionDefectIds = new Set(links.filter((l: any) => l.linkType === "regression_tc").map((l: any) => l.defectId));

    const qa = defects.filter((d: any) => d.source === "qa");
    const prod = defects.filter((d: any) => d.source === "production");
    const others = defects.filter((d: any) => d.source === "other");
    const reqDefects = defects.filter((d: any) => d.source === "requirement");
    const open = (list: typeof defects) => list.filter((d: any) => !CLOSED_STATUS.test(d.status)).length;
    const retest = defects.filter((d: any) => RETEST_STATUS.test(d.status) && !CLOSED_STATUS.test(d.status)).length;
    const total = defects.length;

    res.json({
      total,
      qaCount: qa.length,
      prodCount: prod.length,
      othersCount: others.length,
      reqCount: reqDefects.length,
      openQa: open(qa),
      openProd: open(prod),
      openOthers: open(others),
      openReq: open(reqDefects),
      otherTrackers: new Set(others.map((d: any) => d.tracker).filter(Boolean)).size,
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
      sourceIssueId, redmineProjectId, trackerName, defectCategory,
      assigneeId, complexity, targetedStartDate, targetedCompletionDate,
      source, milestoneId,
    } = req.body ?? {};

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (defectCategory != null && !DEFECT_CATEGORIES.includes(defectCategory)) {
      res.status(400).json({ error: "Invalid defectCategory" });
      return;
    }
    const isRequirementDefect = source === "requirement";
    if (source != null && !["qa", "requirement"].includes(source)) {
      res.status(400).json({ error: "source must be 'qa' or 'requirement'" });
      return;
    }

    const ctx = requireAuth(req, res);
    if (!ctx) return;

    // CR031 — a requirement defect auto-routes to the requirement's own
    // author; everything else about the flow (severity, description) is
    // caller-supplied same as a normal defect.
    let requirementRow: typeof requirementsTable.$inferSelect | undefined;
    if (isRequirementDefect) {
      if (!REQUIREMENT_DEFECT_RAISER_ROLES.includes(ctx.role)) {
        res.status(403).json({ error: "Not authorized to raise a requirement defect" });
        return;
      }
      if (requirementId == null) {
        res.status(400).json({ error: "requirementId is required for a requirement defect" });
        return;
      }
      [requirementRow] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, Number(requirementId)));
      if (!requirementRow) {
        res.status(404).json({ error: "Requirement not found" });
        return;
      }
      if (((requirementRow as any).reviewStatus ?? "draft") !== "approved") {
        res.status(400).json({ error: "Requirement defects can only be raised against an approved requirement" });
        return;
      }
    }

    const effectiveProjectId = projectId ?? requirementRow?.projectId ?? null;
    if (effectiveProjectId != null && !(await canAccessProject(ctx.userId, ctx.role, Number(effectiveProjectId)))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    // Category is Lead-tier+ only — a lower-tier caller's value is silently
    // dropped rather than failing the whole defect creation over it. Doesn't
    // apply to requirement defects at all (product taxonomy, not authoring).
    const categoryAllowed = !isRequirementDefect && defectCategory != null && (await canSetDefectCategory(ctx.role));

    // Resolve the link target *before* inserting the defect, so milestoneId
    // can be set directly on defectsTable at creation time — explicit param
    // wins, then the linked requirement's own milestone, then the linked
    // execution file's milestone. Direct storage instead of relying solely
    // on the defect_links -> execution chain is what makes milestone-scoped
    // analytics (e.g. the CR026 escape funnel) work regardless of how the
    // defect came to exist.
    let effectiveMilestoneId: number | null = milestoneId ? Number(milestoneId) : null;
    let execRow: { libraryTcId: number | null; requirementId: number | null; executionFileMilestoneId: number | null } | undefined;
    let linkedRequirementMilestoneId: number | null = null;
    if (!isRequirementDefect && executionTcId != null) {
      [execRow] = await db
        .select({
          libraryTcId: executionTestCasesTable.libraryTcId,
          requirementId: executionTestCasesTable.requirementId,
          executionFileMilestoneId: executionFilesTable.milestoneId,
        })
        .from(executionTestCasesTable)
        .leftJoin(executionFilesTable, eq(executionFilesTable.id, executionTestCasesTable.executionFileId))
        .where(eq(executionTestCasesTable.id, Number(executionTcId)));
      if (effectiveMilestoneId == null) effectiveMilestoneId = execRow?.executionFileMilestoneId ?? null;
    } else if (!isRequirementDefect && requirementId != null) {
      const [linkedReq] = await db.select({ milestoneId: requirementsTable.milestoneId }).from(requirementsTable).where(eq(requirementsTable.id, Number(requirementId)));
      linkedRequirementMilestoneId = linkedReq?.milestoneId ?? null;
      if (effectiveMilestoneId == null) effectiveMilestoneId = linkedRequirementMilestoneId;
    }
    if (isRequirementDefect && effectiveMilestoneId == null) {
      effectiveMilestoneId = requirementRow?.milestoneId ?? null;
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
        projectId: effectiveProjectId,
        milestoneId: effectiveMilestoneId,
        reporterId: actorId,
        source: isRequirementDefect ? "requirement" : "qa",
        foundIn: foundIn ?? (isRequirementDefect ? "Development" : "SIT"),
        defectCategory: categoryAllowed ? defectCategory : null,
        syncStatus: isRequirementDefect ? "not_applicable" : "pending",
        assigneeId: isRequirementDefect ? requirementRow!.createdBy : null,
        assigneeName: isRequirementDefect ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, requirementRow!.createdBy!)))[0]?.name ?? null : null,
        assigneeAssignedAt: isRequirementDefect ? new Date() : null,
      })
      .returning();

    const defectCode = `DEF-${String(defect.id).padStart(4, "0")}`;
    await db.update(defectsTable).set({ defectCode }).where(eq(defectsTable.id, defect.id));
    defect.defectCode = defectCode;

    if (executionTcId != null) {
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

    // Requirement defects are QAPulse-native only — no Redmine tracker
    // equivalent, so skip the write-through entirely (consistent with the
    // standing principle that Redmine integrations stay thin/disposable).
    if (isRequirementDefect) {
      await logActivity({
        type: "defect_created",
        description: `Requirement defect ${defectCode} "${defect.title}" raised against "${requirementRow!.title}" — routed to ${defect.assigneeName ?? "the requirement author"}`,
        userId: actorId,
        entityId: defect.id,
        entityType: "defect",
        newValue: { title: defect.title, severity: defect.severity, foundIn: defect.foundIn, requirementId: Number(requirementId) },
      });

      if (defect.assigneeId) {
        await notifyUser(
          defect.assigneeId,
          "Requirement defect assigned to you",
          `${defectCode} "${defect.title}" was raised against your requirement "${requirementRow!.title}".`,
          "defect_opened",
          "defect",
          defect.id,
          actorId,
        ).catch(() => {});
      }

      res.status(201).json({ ...defect, syncOk: true, syncError: null });
      return;
    }

    // Write-through push — never blocks defect creation (pending-sync fallback)
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const push = await pushDefectToRedmine(defect, apiKey, {
      redmineProjectId: redmineProjectId ?? null,
      sourceIssueId: sourceIssueId ?? null,
      trackerName,
      assigneeId: assigneeId ?? null,
      complexity: complexity ?? null,
      targetedStartDate: targetedStartDate ?? null,
      targetedCompletionDate: targetedCompletionDate ?? null,
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

    await notifyQaLeads(defect, actorId);

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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { redmineId, title, description, expectedResult, actualResult, severity, module, executionTcId, defectCategory } = req.body ?? {};
    if (!redmineId || !title) {
      res.status(400).json({ error: "redmineId and title are required" });
      return;
    }
    if (defectCategory != null && !DEFECT_CATEGORIES.includes(defectCategory)) {
      res.status(400).json({ error: "Invalid defectCategory" });
      return;
    }

    const actorId = actorFromReq(req);
    const categoryAllowed = defectCategory != null && (await canSetDefectCategory(ctx.role));

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

    if (!(await canAccessDefectProject(ctx, projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
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
          defectCategory: categoryAllowed ? defectCategory : null,
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
      await notifyQaLeads(created, actorId);
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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = Number(req.params.id);
    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    if (!(await canAccessDefectProject(ctx, defect.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
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

// ─── Redmine status list (synced locally, auto-populates when empty) ─────────

router.get("/defects/statuses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    let statuses = await db.select().from(redmineStatusesTable);
    if (statuses.length === 0) {
      const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
      await syncIssueStatuses(apiKey);
      statuses = await db.select().from(redmineStatusesTable);
    }
    res.json(statuses.map((s: any) => ({ redmineId: s.redmineId, name: s.name, isClosed: !!s.isClosed })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load statuses" });
  }
});

router.post("/defects/sync-statuses", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  try {
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const result = await syncIssueStatuses(apiKey);
    if (result.error) {
      res.status(502).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Status sync failed" });
  }
});

// ─── Status edit (write-through: Redmine first, local cache on success) ──────

router.patch("/defects/:id/status", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = Number(req.params.id);
    const statusRedmineId = Number(req.body?.statusRedmineId);
    if (!Number.isInteger(statusRedmineId)) {
      res.status(400).json({ error: "statusRedmineId is required" });
      return;
    }
    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    if (!(await canAccessDefectProject(ctx, defect.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const [statusRow] = await db
      .select()
      .from(redmineStatusesTable)
      .where(eq(redmineStatusesTable.redmineId, statusRedmineId));
    if (!statusRow) {
      res.status(400).json({ error: "Unknown status — sync statuses first" });
      return;
    }

    // Write-through: Redmine is still the record. Only defects without a
    // Redmine id (pending sync) may change status locally.
    if (defect.redmineId) {
      const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
      const push = await pushStatusToRedmine(defect.redmineId, statusRedmineId, apiKey);
      if (!push.ok) {
        res.status(502).json({ error: push.error ?? "Redmine rejected the status change" });
        return;
      }
    }

    const oldStatus = defect.status;
    const [updated] = await db
      .update(defectsTable)
      .set({ status: statusRow.name, statusSyncedAt: new Date() })
      .where(eq(defectsTable.id, id))
      .returning();

    const actorId = actorFromReq(req);
    await logActivity({
      type: "defect_status_changed",
      description: `Defect ${defect.defectCode ?? `#${id}`} status changed from ${oldStatus} to ${statusRow.name}${defect.redmineId ? ` (synced to Redmine #${defect.redmineId})` : " (local only — not yet in Redmine)"}`,
      userId: actorId,
      entityId: id,
      entityType: "defect",
      oldValue: { status: oldStatus },
      newValue: { status: statusRow.name },
    });

    // CR027 — defect_status_changed to the reporter + the linked TC's last
    // executor, and retest_needed to that same executor when the new status
    // reads as "fixed" but the execution row is still sitting on Failed.
    const linkedExec = await findLinkedExecutionTc(id);
    const executorId = linkedExec ? await resolveUserIdByName(linkedExec.qaPic) : null;

    const statusRecipients = new Set<number>();
    if (defect.reporterId) statusRecipients.add(defect.reporterId);
    if (executorId) statusRecipients.add(executorId);
    await Promise.all(
      [...statusRecipients].map((uid) =>
        notifyUser(
          uid,
          "Defect status changed",
          `${defect.defectCode ?? `Defect #${id}`} moved from ${oldStatus} to ${statusRow.name}.`,
          "defect_status_changed",
          "defect",
          id,
          actorId,
        ).catch(() => {}),
      ),
    );

    if (executorId && RETEST_STATUS.test(statusRow.name) && linkedExec?.result && /fail/i.test(linkedExec.result)) {
      await notifyUser(
        executorId,
        "Retest needed",
        `${defect.defectCode ?? `Defect #${id}`} is now ${statusRow.name} — the linked test case is still marked Failed and needs a retest.`,
        "retest_needed",
        "defect",
        id,
        actorId,
      ).catch(() => {});
    }

    res.json(updated);
  } catch (err: any) {
    console.error("[PATCH /defects/:id/status]", err);
    res.status(500).json({ error: err?.message ?? "Status update failed" });
  }
});

// ─── CR030: native dev assignment (Lead-tier+ gate) ──────────────────────────
// assigneeId is the source of truth going forward; assigneeName stays in sync
// so existing display code (and the Redmine-cache fallback) keeps working.

router.patch("/defects/:id/assign", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = Number(req.params.id);
    const rawAssigneeId = req.body?.assigneeId;
    const assigneeId = rawAssigneeId == null ? null : Number(rawAssigneeId);
    if (assigneeId != null && !Number.isInteger(assigneeId)) {
      res.status(400).json({ error: "assigneeId must be an integer or null" });
      return;
    }

    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }

    // CR031 — a requirement defect's current assignee can hand it off to dev
    // or QA without a Lead gate (it was auto-routed to them, not discretionarily
    // assigned; mirrors CR030's precedent of letting the dev assignee self-drive
    // start/ready_for_qa). Everyone else falls back to the normal Lead-tier gate.
    const isSelfHandoff = defect.source === "requirement" && defect.assigneeId === ctx.userId;
    if (!isSelfHandoff && (await getRoleTierRank(ctx.role)) < 2) {
      res.status(403).json({ error: "Lead-tier role required to assign a defect" });
      return;
    }

    if (!(await canAccessDefectProject(ctx, defect.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }

    let assigneeName: string | null = null;
    if (assigneeId != null) {
      const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, assigneeId));
      if (!user) {
        res.status(400).json({ error: "Assignee not found" });
        return;
      }
      assigneeName = user.name;
    }

    const now = new Date();
    const [updated] = await db
      .update(defectsTable)
      .set({ assigneeId, assigneeName, assigneeAssignedAt: assigneeId != null ? now : null })
      .where(eq(defectsTable.id, id))
      .returning();

    // Best-effort write-through — a defect already in Redmine gets its
    // assignment pushed there too; failure never blocks the native assignment.
    let syncOk: boolean | null = null;
    let syncError: string | null = null;
    if (assigneeId != null && defect.redmineId) {
      const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
      const push = await pushAssigneeToRedmine(defect.redmineId, assigneeId, apiKey);
      syncOk = push.ok;
      syncError = push.ok ? null : push.error ?? null;
    }

    await logActivity({
      type: "defect_assigned",
      description: `Defect ${defect.defectCode ?? `#${id}`} ${assigneeId != null ? `assigned to ${assigneeName}` : "unassigned"}`,
      userId: ctx.userId,
      entityId: id,
      entityType: "defect",
      oldValue: { assigneeId: defect.assigneeId ?? null },
      newValue: { assigneeId, assigneeName },
    });

    if (assigneeId != null) {
      await notifyUser(
        assigneeId,
        "Defect assigned",
        `${defect.defectCode ?? `Defect #${id}`} "${defect.title}" has been assigned to you.`,
        "defect_assigned",
        "defect",
        id,
        ctx.userId,
      ).catch(() => {});
    }

    res.json({ ...updated, syncOk, syncError });
  } catch (err: any) {
    console.error("[PATCH /defects/:id/assign]", err);
    res.status(500).json({ error: err?.message ?? "Assignment failed" });
  }
});

// ─── Refresh cached Redmine statuses (one-way read) ──────────────────────────

router.post("/defects/refresh-status", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
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
  if (!requireAuth(req, res)) return;
  try {
    const trackerName = req.body?.trackerName;
    if (!trackerName || typeof trackerName !== "string") {
      res.status(400).json({ error: "trackerName is required" });
      return;
    }
    const milestoneId = req.body?.milestoneId ? Number(req.body.milestoneId) : null;
    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const result = await pullTrackerIssues(apiKey, trackerName, milestoneId);
    if (result.error) {
      res.status(502).json(result);
      return;
    }
    await logActivity({
      type: "defects_pulled",
      description: `Pulled Redmine tracker "${trackerName}": ${result.imported} new (${result.qaDefects} QA, ${result.prodDefects} prod, ${result.others} others, ${result.requirements} requirements), ${result.ignored} already in QMPulse (ignored)`,
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
// Routing (shared routeForTracker in the bridge): QA Defect → QA tab ·
// Prod Defect → Production tab · User Story → requirements · else → Others tab.

router.post("/defects/sync-from-redmine", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const { projectId, module, requirementId, trackerName } = req.body ?? {};
    if (!requirementId) {
      res.status(400).json({ error: "requirementId is required" });
      return;
    }
    // trackerName optional: "all" (or empty) syncs every tracker, each issue
    // routed by its OWN tracker; a specific name imports only that tracker
    // (the tree is still walked so deep matches under other trackers land too)
    const trackerFilter =
      trackerName && String(trackerName).toLowerCase() !== "all" ? String(trackerName).toLowerCase() : null;

    const [requirement] = await db
      .select()
      .from(requirementsTable)
      .where(eq(requirementsTable.id, Number(requirementId)));
    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }
    if (!(await canAccessDefectProject(ctx, projectId ?? requirement.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    if (!requirement.redmineTicketId) {
      res.status(400).json({ error: "Selected requirement has no Redmine ticket id" });
      return;
    }

    const apiKey = await resolveApiKeyFromToken(req.headers.authorization);
    const { issues, error } = await fetchIssueTree(apiKey, requirement.redmineTicketId);
    if (error) {
      res.status(502).json({ error });
      return;
    }

    const actorId = actorFromReq(req);
    const syncDate = new Date();
    let created = 0;
    let ignored = 0; // already in QAPulse → left untouched (insert-only sync)
    let skipped = 0;
    const counts = { requirements: 0, qaDefects: 0, prodDefects: 0, others: 0 };

    // Hierarchy anchors: for each Redmine id, the QAPulse requirement to hang
    // children off. Root = the selected requirement. Defects and skipped
    // issues pass their parent's anchor through, so grandchildren still link.
    const anchorByRedmineId = new Map<string, number>();
    anchorByRedmineId.set(String(requirement.redmineTicketId), requirement.id);

    for (const { issue, parentRedmineId } of issues) {
      const rid = String(issue.id);
      const issueTracker: string = issue.tracker?.name ?? "";
      const route = routeForTracker(issueTracker);
      const anchorReqId = anchorByRedmineId.get(parentRedmineId) ?? requirement.id;
      const redmineCreatedAt = issue.created_on ? new Date(issue.created_on) : null;

      if (trackerFilter && issueTracker.toLowerCase() !== trackerFilter) {
        // not imported, but children still anchor to this issue's anchor
        anchorByRedmineId.set(rid, anchorReqId);
        skipped++;
        continue;
      }

      if (route === "requirement") {
        const [existing] = await db
          .select()
          .from(requirementsTable)
          .where(eq(requirementsTable.redmineTicketId, rid));
        let reqId: number;
        if (existing) {
          // already in QAPulse → ignore untouched; still anchor children to it
          reqId = existing.id;
          ignored++;
        } else {
          const [row] = await db
            .insert(requirementsTable)
            .values({
              title: issue.subject ?? "Untitled",
              description: issue.description ?? null,
              module: module ?? requirement.module,
              projectId: projectId ?? requirement.projectId,
              milestoneId: requirement.milestoneId ?? null,
              parentId: anchorReqId,
              redmineTicketId: rid,
              tracker: issueTracker || null,
              status: "open",
              redmineCreatedAt,
            })
            .returning();
          reqId = row.id;
          created++;
          counts.requirements++;
        }
        anchorByRedmineId.set(rid, reqId); // children of a story anchor to the story
        continue;
      }

      // defect routes (qa / production / other-tracker-as-qa)
      const cached = {
        status: issue.status?.name ?? "Unknown",
        assigneeName: issue.assigned_to?.name ?? null,
        statusSyncedAt: syncDate,
      };
      const [existing] = await db.select().from(defectsTable).where(eq(defectsTable.redmineId, rid));
      if (existing) {
        // already in QAPulse → ignore untouched; children still anchor through
        anchorByRedmineId.set(rid, anchorReqId);
        ignored++;
        continue;
      }
      let defectId: number;
      {
        const [row] = await db
          .insert(defectsTable)
          .values({
            title: issue.subject ?? "Untitled",
            description: issue.description ?? null,
            severity: severityFromPriority(issue.priority?.name),
            module: module ?? issue.category?.name ?? null,
            projectId: projectId ?? null,
            milestoneId: requirement.milestoneId ?? null,
            reporterId: actorId,
            redmineId: rid,
            syncStatus: "synced",
            source: route, // qa | production | other
            foundIn: route === "production" ? "Production" : "SIT",
            tracker: issueTracker || null,
            category: issue.category?.name ?? null,
            redmineCreatedAt,
            ...cached,
          })
          .returning();
        await db
          .update(defectsTable)
          .set({ defectCode: `${defectCodePrefix(route)}${String(row.id).padStart(4, "0")}` })
          .where(eq(defectsTable.id, row.id));
        defectId = row.id;
        created++;
      }
      if (route === "production") counts.prodDefects++;
      else if (route === "other") counts.others++;
      else counts.qaDefects++;

      // link to the nearest ancestor requirement (dedupe)
      const dLinks = await db.select().from(defectLinksTable).where(eq(defectLinksTable.defectId, defectId));
      if (!dLinks.some((l: any) => l.requirementId === anchorReqId)) {
        await db.insert(defectLinksTable).values({
          defectId,
          requirementId: anchorReqId,
          linkType: "requirement",
        });
      }
      anchorByRedmineId.set(rid, anchorReqId); // children of a defect keep its anchor
    }

    await logActivity({
      type: "defects_synced",
      description: `Synced subtree of "${requirement.title}" (#${requirement.redmineTicketId}): ${created} new, ${ignored} already in QMPulse (ignored) — ${counts.requirements} requirements, ${counts.qaDefects} QA defects, ${counts.prodDefects} prod defects, ${counts.others} others${skipped ? `, ${skipped} skipped by tracker filter` : ""}`,
      userId: actorId,
      entityId: requirement.id,
      entityType: "defect",
      newValue: { trackerFilter, created, ignored, skipped, ...counts, parentRedmineId: requirement.redmineTicketId },
    });

    res.json({ total: issues.length, created, ignored, skipped, ...counts });
  } catch (err: any) {
    console.error("[POST /defects/sync-from-redmine]", err);
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
});

// ─── CR020: escape review fields ─────────────────────────────────────────────

router.patch("/defects/:id", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = Number(req.params.id);
    const [before] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!before) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    if (!(await canAccessDefectProject(ctx, before.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
      return;
    }
    const patch: Record<string, any> = {};
    for (const key of ["escapeStatus", "escapeClass", "escapeNotes", "severity", "module", "projectId", "source", "defectCategory"]) {
      if (key in (req.body ?? {})) patch[key] = req.body[key];
    }
    if ("defectCategory" in patch) {
      if (patch.defectCategory != null && !DEFECT_CATEGORIES.includes(patch.defectCategory)) {
        res.status(400).json({ error: "Invalid defectCategory" });
        return;
      }
      if (!(await canSetDefectCategory(ctx.role))) delete patch.defectCategory;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    if (patch.projectId != null && !(await canAccessProject(ctx.userId, ctx.role, Number(patch.projectId)))) {
      res.status(403).json({ error: "Access denied to the target project" });
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
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  try {
    const id = Number(req.params.id);
    const [defect] = await db.select().from(defectsTable).where(eq(defectsTable.id, id));
    if (!defect) {
      res.status(404).json({ error: "Defect not found" });
      return;
    }
    if (!(await canAccessDefectProject(ctx, defect.projectId))) {
      res.status(403).json({ error: "Access denied to this project" });
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
