import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  defectsTable,
  executionFilesTable,
  executionTestCasesTable,
  milestonesTable,
  projectsTable,
  requirementsTable,
  risksTable,
  rolesTable,
  tasksTable,
  testCasesTable,
  usersTable,
} from "@workspace/db";
import {
  getAuthContext,
  getModuleScope,
  getRoleDepartment,
  getRoleTierRank,
  scopeToUserProjects,
} from "../middleware/access";

const router: IRouter = Router();

type WorkScope = "mine" | "team" | "unassigned";
type WorkPriority = "urgent" | "high" | "normal";
type WorkSection = "urgent" | "action" | "waiting";

interface WorkItem {
  id: string;
  type: "task" | "requirement" | "test_case" | "execution" | "defect" | "risk";
  title: string;
  context: string;
  reason: string;
  priority: WorkPriority;
  section: WorkSection;
  actionLabel: string;
  actionUrl: string;
  projectId: number | null;
  projectName: string | null;
  milestoneName: string | null;
  ownerName: string | null;
  updatedAt: string;
}

const CLOSED_TASK_STATUSES = new Set(["done", "released_to_production", "closed", "cancelled"]);
const CLOSED_DEFECT_STATUS = /closed|verified|rejected|cancelled|resolved|fixed/i;
const DAY_MS = 86_400_000;

function ageDays(value: Date): number {
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / DAY_MS));
}

function isOverdue(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

router.get("/my-work", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requestedScope = String(req.query.scope ?? "mine");
  if (!(["mine", "team", "unassigned"] as string[]).includes(requestedScope)) {
    res.status(400).json({ error: "scope must be mine, team, or unassigned" });
    return;
  }
  const scope = requestedScope as WorkScope;

  const [tierRank, department, accessibleProjects, currentUsers] = await Promise.all([
    getRoleTierRank(ctx.role),
    getRoleDepartment(ctx.role),
    scopeToUserProjects(ctx.userId, ctx.role),
    db.select().from(usersTable).where(eq(usersTable.id, ctx.userId)),
  ]);
  const currentUser = currentUsers[0];
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }
  if (scope !== "mine" && tierRank < 2) {
    res.status(403).json({ error: "Team and unassigned scopes require a lead role" });
    return;
  }

  let teamUsers = [currentUser];
  if (scope === "team" && tierRank >= 2) {
    const allUsers = await db.select().from(usersTable);
    if (department) {
      const roleRows = await db.select().from(rolesTable);
      const departmentsByRole = new Map(roleRows.map((role) => [role.name, role.department]));
      teamUsers = allUsers.filter((user) => departmentsByRole.get(user.role) === department);
    } else {
      teamUsers = allUsers;
    }
  }
  const targetUsers = scope === "mine" ? [currentUser] : teamUsers;
  const targetUserIds = new Set(targetUsers.map((user) => user.id));
  const targetUserNames = new Set(targetUsers.map((user) => user.name.trim().toLowerCase()));

  const [projects, milestones, requirements, testCases, executionFiles, executionRows, defects, tasks, risks] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(milestonesTable),
    db.select().from(requirementsTable),
    db.select().from(testCasesTable),
    db.select().from(executionFilesTable),
    db.select().from(executionTestCasesTable),
    db.select().from(defectsTable),
    db.select().from(tasksTable),
    db.select().from(risksTable),
  ]);

  const canSeeProject = (projectId: number | null) =>
    projectId == null || accessibleProjects === null || accessibleProjects.includes(projectId);
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
  const milestoneNameById = new Map(milestones.map((milestone) => [milestone.id, milestone.name]));
  const userNameById = new Map((await db.select().from(usersTable)).map((user) => [user.id, user.name]));

  const visibleProjectIds = [...new Set([
    ...requirements.map((row) => row.projectId),
    ...testCases.map((row) => row.projectId),
    ...executionFiles.map((row) => row.projectId),
    ...defects.map((row) => row.projectId),
    ...tasks.map((row) => row.projectId),
    ...risks.map((row) => row.projectId),
  ].filter((id): id is number => id != null && canSeeProject(id)))];
  const moduleScopes = new Map(await Promise.all(
    visibleProjectIds.map(async (projectId) => [projectId, await getModuleScope(ctx.userId, ctx.role, projectId)] as const),
  ));
  const canSeeModule = (projectId: number | null, moduleName: string | null) => {
    if (projectId == null) return true;
    const moduleScope = moduleScopes.get(projectId);
    return !moduleScope?.restricted || (moduleName != null && moduleScope.moduleNames.includes(moduleName));
  };

  const contextFor = (projectId: number | null, milestoneId: number | null) =>
    [projectId ? projectNameById.get(projectId) : null, milestoneId ? milestoneNameById.get(milestoneId) : null]
      .filter(Boolean).join(" · ") || "No project assigned";
  const items: WorkItem[] = [];
  const push = (item: WorkItem) => items.push(item);
  const isTargetId = (id: number | null | undefined) => id != null && targetUserIds.has(id);
  const isTargetName = (name: string | null | undefined) => !!name && targetUserNames.has(name.trim().toLowerCase());

  for (const task of tasks) {
    if (!canSeeProject(task.projectId) || CLOSED_TASK_STATUSES.has(task.status.toLowerCase())) continue;
    const assigned = task.assigneeIds ?? [];
    if (scope === "unassigned" ? assigned.length > 0 : !assigned.some((id) => targetUserIds.has(id))) continue;
    const overdue = isOverdue(task.dueDate);
    const ownerName = assigned.map((id) => userNameById.get(id)).filter(Boolean).join(", ") || null;
    push({
      id: `task:${task.id}`, type: "task", title: task.name,
      context: contextFor(task.projectId, task.milestoneId),
      reason: overdue ? `Overdue since ${task.dueDate}` : task.blockedByTaskId ? "Blocked by another task" : `Status: ${task.status.replace(/_/g, " ")}`,
      priority: overdue ? "urgent" : task.blockedByTaskId ? "high" : "normal",
      section: overdue ? "urgent" : "action", actionLabel: "Open task", actionUrl: task.requirementId ? `/tasks?highlight=${task.requirementId}` : "/tasks",
      projectId: task.projectId ?? null, projectName: task.projectId ? projectNameById.get(task.projectId) ?? null : null,
      milestoneName: task.milestoneId ? milestoneNameById.get(task.milestoneId) ?? null : null,
      ownerName, updatedAt: task.updatedAt.toISOString(),
    });
  }

  for (const requirement of requirements) {
    if (!canSeeProject(requirement.projectId) || !canSeeModule(requirement.projectId, requirement.module)) continue;
    const context = contextFor(requirement.projectId, requirement.milestoneId);
    const ownerName = requirement.assigneeId ? userNameById.get(requirement.assigneeId) ?? null : null;
    const requirementOwners = new Set([
      requirement.createdBy,
      requirement.assigneeId,
      requirement.devAssigneeId,
      ...(requirement.pipelineFaIds ?? []),
      ...(requirement.pipelineDevIds ?? []),
      ...(requirement.pipelineQaIds ?? []),
    ].filter((id): id is number => id != null));
    if (requirement.isBlocked && (scope === "unassigned" ? requirementOwners.size === 0 : [...requirementOwners].some((id) => targetUserIds.has(id)))) {
      push({ id: `requirement-blocked:${requirement.id}`, type: "requirement", title: `Blocked: ${requirement.title}`, context,
        reason: requirement.blockedReason || "Waiting for the blocker to be resolved", priority: "urgent", section: "waiting",
        actionLabel: "View blocker", actionUrl: `/requirements/${requirement.id}`,
        projectId: requirement.projectId, projectName: requirement.projectId ? projectNameById.get(requirement.projectId) ?? null : null,
        milestoneName: requirement.milestoneId ? milestoneNameById.get(requirement.milestoneId) ?? null : null,
        ownerName, updatedAt: requirement.updatedAt.toISOString() });
    }
    if (requirement.reviewStatus === "rejected" && (scope === "unassigned" ? requirement.createdBy == null : isTargetId(requirement.createdBy))) {
      push({ id: `requirement-revision:${requirement.id}`, type: "requirement", title: `Revise: ${requirement.title}`, context,
        reason: `Returned for revision ${ageDays(requirement.updatedAt)} day(s) ago`, priority: ageDays(requirement.updatedAt) >= 3 ? "urgent" : "high",
        section: "action", actionLabel: "Resolve comments", actionUrl: `/requirements/${requirement.id}`,
        projectId: requirement.projectId, projectName: requirement.projectId ? projectNameById.get(requirement.projectId) ?? null : null,
        milestoneName: requirement.milestoneId ? milestoneNameById.get(requirement.milestoneId) ?? null : null,
        ownerName: requirement.createdBy ? userNameById.get(requirement.createdBy) ?? null : null, updatedAt: requirement.updatedAt.toISOString() });
    }
    if (department === "fa" && tierRank >= 2 && requirement.reviewStatus === "in_review" && requirement.createdBy !== ctx.userId && scope !== "unassigned") {
      push({ id: `requirement-review:${requirement.id}`, type: "requirement", title: `Review requirement: ${requirement.title}`, context,
        reason: `Waiting for review ${ageDays(requirement.updatedAt)} day(s)`, priority: ageDays(requirement.updatedAt) >= 3 ? "urgent" : "high",
        section: ageDays(requirement.updatedAt) >= 3 ? "urgent" : "action", actionLabel: "Review now", actionUrl: `/requirements/${requirement.id}`,
        projectId: requirement.projectId, projectName: requirement.projectId ? projectNameById.get(requirement.projectId) ?? null : null,
        milestoneName: requirement.milestoneId ? milestoneNameById.get(requirement.milestoneId) ?? null : null,
        ownerName, updatedAt: requirement.updatedAt.toISOString() });
    }
    const devOpen = requirement.devStatus !== "ready_for_qa";
    if (devOpen && (scope === "unassigned" ? requirement.reviewStatus === "approved" && requirement.devAssigneeId == null : isTargetId(requirement.devAssigneeId))) {
      push({ id: `dev-work:${requirement.id}`, type: "requirement", title: `Development: ${requirement.title}`, context,
        reason: requirement.devAssigneeId == null ? "Approved requirement needs a developer" : `Status: ${(requirement.devStatus ?? "assigned").replace(/_/g, " ")}`,
        priority: requirement.isBlocked ? "urgent" : requirement.devAssigneeId == null ? "high" : "normal",
        section: requirement.isBlocked ? "urgent" : "action", actionLabel: requirement.devAssigneeId == null ? "Assign developer" : "Open requirement", actionUrl: `/requirements/${requirement.id}`,
        projectId: requirement.projectId, projectName: requirement.projectId ? projectNameById.get(requirement.projectId) ?? null : null,
        milestoneName: requirement.milestoneId ? milestoneNameById.get(requirement.milestoneId) ?? null : null,
        ownerName: requirement.devAssigneeId ? userNameById.get(requirement.devAssigneeId) ?? null : null, updatedAt: requirement.updatedAt.toISOString() });
    }
  }

  if (department === "qa" || department == null) {
    for (const testCase of testCases) {
      if (!canSeeProject(testCase.projectId) || !canSeeModule(testCase.projectId, testCase.module)) continue;
      const isReview = testCase.reviewStatus === "in_review" && tierRank >= 2 && testCase.authorId !== ctx.userId && scope !== "unassigned";
      const isRevision = testCase.reviewStatus === "rejected" && (scope === "unassigned" ? testCase.authorId == null : isTargetId(testCase.authorId));
      if (!isReview && !isRevision) continue;
      push({ id: `test-case:${testCase.id}`, type: "test_case", title: `${isReview ? "Review" : "Revise"} test case: ${testCase.title}`,
        context: contextFor(testCase.projectId, null), reason: `${isReview ? "Waiting for peer review" : "Returned for revision"} · ${ageDays(testCase.updatedAt)} day(s)`,
        priority: ageDays(testCase.updatedAt) >= 3 ? "urgent" : "high", section: ageDays(testCase.updatedAt) >= 3 ? "urgent" : "action",
        actionLabel: isReview ? "Review test case" : "Open test case", actionUrl: `/test-cases?highlight=${testCase.id}`,
        projectId: testCase.projectId, projectName: testCase.projectId ? projectNameById.get(testCase.projectId) ?? null : null, milestoneName: null,
        ownerName: testCase.authorId ? userNameById.get(testCase.authorId) ?? null : null, updatedAt: testCase.updatedAt.toISOString() });
    }
  }

  const rowsByFile = new Map<number, typeof executionRows>();
  for (const row of executionRows) {
    if (!rowsByFile.has(row.executionFileId)) rowsByFile.set(row.executionFileId, []);
    rowsByFile.get(row.executionFileId)!.push(row);
  }
  for (const file of executionFiles) {
    if (!canSeeProject(file.projectId)) continue;
    const fileRows = rowsByFile.get(file.id) ?? [];
    const visibleRows = fileRows.filter((row) => canSeeModule(file.projectId, row.moduleName));
    if (fileRows.length > 0 && visibleRows.length === 0) continue;
    const pendingCount = visibleRows.filter((row) => row.rowType !== "group" && (!row.result || row.result.toLowerCase() === "not executed")).length;
    const assigned = isTargetName(file.qaPic) || visibleRows.some((row) => isTargetName(row.qaPic));
    const unassigned = !file.qaPic && visibleRows.some((row) => !row.qaPic);
    const isReview = (department === "qa" || department == null) && tierRank >= 2 && file.reviewStatus === "in_review" && file.qaPicSetBy !== ctx.userId && file.qaPic?.trim().toLowerCase() !== currentUser.name.trim().toLowerCase() && scope !== "unassigned";
    const isRevision = file.reviewStatus === "rejected" && (scope === "unassigned" ? file.qaPicSetBy == null : isTargetId(file.qaPicSetBy));
    const isExecution = file.reviewStatus === "approved" && pendingCount > 0 && (scope === "unassigned" ? unassigned : assigned);
    if (!isReview && !isRevision && !isExecution) continue;
    const title = isReview ? `Approve execution: ${file.title ?? file.redmineTicketId}` : isRevision ? `Correct rejected execution: ${file.title ?? file.redmineTicketId}` : `Continue execution: ${file.title ?? file.redmineTicketId}`;
    const stale = ageDays(file.updatedAt) >= 3;
    push({ id: `execution:${file.id}`, type: "execution", title, context: contextFor(file.projectId, file.milestoneId),
      reason: isExecution ? `${pendingCount} test case(s) not executed` : `${isReview ? "Waiting for approval" : "Returned for correction"} · ${ageDays(file.updatedAt)} day(s)`,
      priority: stale || isRevision ? "urgent" : isReview ? "high" : "normal", section: stale || isRevision ? "urgent" : "action",
      actionLabel: isReview ? "Review now" : "Open execution", actionUrl: `/test-cases/execution/${file.redmineTicketId}`,
      projectId: file.projectId, projectName: file.projectId ? projectNameById.get(file.projectId) ?? null : null,
      milestoneName: file.milestoneId ? milestoneNameById.get(file.milestoneId) ?? null : null,
      ownerName: file.qaPic, updatedAt: file.updatedAt.toISOString() });
  }

  for (const defect of defects) {
    if (!canSeeProject(defect.projectId) || !canSeeModule(defect.projectId, defect.module) || CLOSED_DEFECT_STATUS.test(defect.status)) continue;
    if (scope === "unassigned" ? defect.assigneeId != null || !!defect.assigneeName : !(isTargetId(defect.assigneeId) || isTargetName(defect.assigneeName))) continue;
    const critical = ["critical", "high"].includes(defect.severity.toLowerCase());
    push({ id: `defect:${defect.id}`, type: "defect", title: `${defect.defectCode ?? `Defect #${defect.id}`}: ${defect.title}`,
      context: contextFor(defect.projectId, defect.milestoneId), reason: `${defect.severity} severity · status: ${defect.status}`,
      priority: critical ? "urgent" : "normal", section: critical ? "urgent" : "action", actionLabel: defect.assigneeId == null && !defect.assigneeName ? "Assign owner" : "Open defect", actionUrl: `/defects?tab=${defect.source === "production" ? "production" : defect.source === "requirement" ? "requirement" : "qa"}&highlight=${defect.id}`,
      projectId: defect.projectId, projectName: defect.projectId ? projectNameById.get(defect.projectId) ?? null : null,
      milestoneName: defect.milestoneId ? milestoneNameById.get(defect.milestoneId) ?? null : null,
      ownerName: defect.assigneeId ? userNameById.get(defect.assigneeId) ?? null : defect.assigneeName, updatedAt: defect.updatedAt.toISOString() });
  }

  if (department === "pm" || department == null) {
    for (const risk of risks) {
      if (!canSeeProject(risk.projectId) || risk.status === "closed") continue;
      if (scope === "unassigned" ? risk.ownerId != null : !isTargetId(risk.ownerId)) continue;
      const critical = risk.probability === "high" && risk.impact === "high";
      push({ id: `risk:${risk.id}`, type: "risk", title: risk.title, context: contextFor(risk.projectId, risk.milestoneId),
        reason: `${risk.probability} probability · ${risk.impact} impact${risk.mitigationPlan ? "" : " · mitigation missing"}`,
        priority: critical ? "urgent" : "high", section: critical ? "urgent" : "action", actionLabel: risk.ownerId == null ? "Assign owner" : "Open risk", actionUrl: `/risk-register?projectId=${risk.projectId}&highlight=${risk.id}`,
        projectId: risk.projectId, projectName: projectNameById.get(risk.projectId) ?? null,
        milestoneName: risk.milestoneId ? milestoneNameById.get(risk.milestoneId) ?? null : null,
        ownerName: risk.ownerId ? userNameById.get(risk.ownerId) ?? null : null, updatedAt: risk.updatedAt.toISOString() });
    }
    for (const milestone of milestones) {
      if (!canSeeProject(milestone.projectId) || milestone.status !== "active" || !isOverdue(milestone.targetDate)) continue;
      push({ id: `milestone:${milestone.id}`, type: "requirement", title: `Milestone overdue: ${milestone.name}`,
        context: contextFor(milestone.projectId, milestone.id), reason: `Target date ${milestone.targetDate?.toISOString().slice(0, 10)}`,
        priority: "urgent", section: "urgent", actionLabel: "Open milestone", actionUrl: `/milestones?highlight=${milestone.id}`,
        projectId: milestone.projectId, projectName: projectNameById.get(milestone.projectId) ?? null,
        milestoneName: milestone.name, ownerName: milestone.createdBy ? userNameById.get(milestone.createdBy) ?? null : null, updatedAt: milestone.updatedAt.toISOString() });
    }
  }

  const priorityOrder: Record<WorkPriority, number> = { urgent: 0, high: 1, normal: 2 };
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 75);

  res.json({
    scope,
    canViewTeam: tierRank >= 2,
    generatedAt: new Date().toISOString(),
    summary: {
      urgent: deduped.filter((item) => item.priority === "urgent").length,
      action: deduped.filter((item) => item.section === "action").length,
      waiting: deduped.filter((item) => item.section === "waiting").length,
      total: deduped.length,
    },
    items: deduped,
  });
});

export default router;
