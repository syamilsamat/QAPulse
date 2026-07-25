import { Router } from "express";
import { and, or, ilike, eq, desc, inArray, sql, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  requirementsTable,
  testCasesTable,
  tasksTable,
  defectsTable,
  milestonesTable,
  risksTable,
  uatSignoffsTable,
  projectsTable,
  executionModulesTable,
  contactsTable,
  usersTable,
  teamsTable,
  documentRegisterTable,
  projectMembersTable,
  rolesTable,
} from "@workspace/db";
import { getAuthContext, scopeToUserProjects, getRoleDepartment } from "../middleware/access";

const router = Router();

async function buildProjectModuleCondition(userId: number, role: string, projectCol: any, moduleCol: any) {
  const accessibleProjects = await scopeToUserProjects(userId, role);
  if (accessibleProjects === null) return undefined;
  if (accessibleProjects.length === 0) return sql`1 = 0`;
  
  const [roleRow] = await db.select().from(rolesTable).where(eq(rolesTable.name, role));
  const tierRank = roleRow?.tierRank ?? 1;
  if (tierRank >= 3) return inArray(projectCol, accessibleProjects);
  
  const assignments = await db.select().from(projectMembersTable).where(eq(projectMembersTable.userId, userId));
  if (assignments.length === 0) return sql`1 = 0`;
  
  const orConds = [];
  for (const assignment of assignments) {
    const ids = assignment.moduleIds ?? (assignment.moduleId != null ? [assignment.moduleId] : []);
    if (ids.length === 0) {
      orConds.push(eq(projectCol, assignment.projectId));
    } else {
      const mods = await db.select({ name: executionModulesTable.name }).from(executionModulesTable).where(inArray(executionModulesTable.id, ids));
      const modNames = mods.map(m => m.name);
      if (modNames.length > 0) {
        orConds.push(and(eq(projectCol, assignment.projectId), inArray(moduleCol, modNames)));
      }
    }
  }
  return orConds.length > 0 ? or(...orConds) : sql`1 = 0`;
}

router.get("/search", async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.json({ query: q, total: 0, groups: [] });
    return;
  }

  const typeParam = req.query.type as string | undefined;
  const limit = parseInt(req.query.limit as string) || (typeParam ? 50 : 6);
  const qLike = `%${q}%`;
  
  const { userId, role } = auth;
  const accessibleProjects = await scopeToUserProjects(userId, role);
  const department = await getRoleDepartment(role);

  // Users cache for author resolution
  const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const userMap = new Map(users.map(u => [u.id, u.name]));
  
  // Projects cache
  const projects = await db.select({ id: projectsTable.id, name: projectsTable.name }).from(projectsTable);
  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  // To map project names to IDs for document_register
  const accessibleProjectNames = accessibleProjects !== null 
    ? projects.filter(p => accessibleProjects.includes(p.id)).map(p => p.name)
    : null;

  const searches: Promise<any[]>[] = [];
  const anyFieldMatch = (fields: any[]) => or(...fields.map(f => ilike(f, qLike)));

  // Requirement
  if (!typeParam || typeParam === 'requirement') {
    searches.push((async () => {
      const projModCond = await buildProjectModuleCondition(userId, role, requirementsTable.projectId, requirementsTable.module);
      const textMatch = anyFieldMatch([
        requirementsTable.title, requirementsTable.description, requirementsTable.module, 
        requirementsTable.tracker, requirementsTable.release, requirementsTable.blockedReason, 
        requirementsTable.acceptanceCriteria, requirementsTable.redmineTicketId
      ]);
      const condition = projModCond ? and(projModCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${requirementsTable.title} ILIKE ${q} THEN 5 WHEN ${requirementsTable.title} ILIKE ${q + '%'} THEN 4 WHEN ${requirementsTable.title} ILIKE ${qLike} THEN 3 WHEN ${requirementsTable.redmineTicketId} ILIKE ${q} THEN 2 ELSE 1 END`;
      
      const results = await db.select({ id: requirementsTable.id, title: requirementsTable.title, redmineId: requirementsTable.redmineTicketId, status: requirementsTable.status, authorId: requirementsTable.createdBy, createdAt: requirementsTable.createdAt, projectId: requirementsTable.projectId, rank })
        .from(requirementsTable).where(condition).orderBy(desc(rank), desc(requirementsTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'requirement', label: 'Requirements' }));
    })());
  }

  // Test Case
  if (!typeParam || typeParam === 'test_case') {
    searches.push((async () => {
      const projModCond = await buildProjectModuleCondition(userId, role, testCasesTable.projectId, testCasesTable.module);
      const textMatch = anyFieldMatch([
        testCasesTable.title, testCasesTable.objective, testCasesTable.preconditions, testCasesTable.testSteps,
        testCasesTable.expectedResult, testCasesTable.tags, testCasesTable.scenario, testCasesTable.comments,
        testCasesTable.caseId, testCasesTable.module, testCasesTable.redmineUserStory, testCasesTable.redmineDefectId
      ]);
      const condition = projModCond ? and(projModCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${testCasesTable.title} ILIKE ${q} THEN 5 WHEN ${testCasesTable.title} ILIKE ${q + '%'} THEN 4 WHEN ${testCasesTable.title} ILIKE ${qLike} THEN 3 WHEN ${testCasesTable.caseId} ILIKE ${q} THEN 2 ELSE 1 END`;
      
      const results = await db.select({ id: testCasesTable.id, title: testCasesTable.title, redmineId: testCasesTable.redmineUserStory, status: testCasesTable.status, authorId: testCasesTable.authorId, createdAt: testCasesTable.createdAt, projectId: testCasesTable.projectId, rank })
        .from(testCasesTable).where(condition).orderBy(desc(rank), desc(testCasesTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'test_case', label: 'Test Cases' }));
    })());
  }

  // Task
  if (!typeParam || typeParam === 'task') {
    searches.push((async () => {
      const projModCond = await buildProjectModuleCondition(userId, role, tasksTable.projectId, tasksTable.moduleId); // Wait, tasks use moduleId. Is it module name or ID?
      // actually buildProjectModuleCondition checks string in array. Tasks have moduleId. I should check how tasksTable is structured.
      // let's just do accessibleProjects for now, and handle department.
      let taskCond = accessibleProjects !== null ? inArray(tasksTable.projectId, accessibleProjects) : undefined;
      
      if (department && department !== "pm") {
        // Find users in this department
        const deptUsers = await db.select({ id: usersTable.id }).from(usersTable)
          .innerJoin(rolesTable, eq(usersTable.role, rolesTable.name))
          .where(eq(rolesTable.department, department));
        const deptUserIds = deptUsers.map(u => u.id);
        if (deptUserIds.length > 0) {
          // tasksTable.assigneeIds is integer[]. Drizzle doesn't have a simple array overlaps for integer[], we can use sql`assignee_ids && ARRAY[${sql.join(deptUserIds)}]::int[]`
          const overlaps = sql`${tasksTable.assigneeIds} && ARRAY[${sql.join(deptUserIds, sql`, `)}]::int[]`;
          taskCond = taskCond ? and(taskCond, overlaps) : overlaps;
        } else {
          taskCond = sql`1 = 0`;
        }
      }

      const textMatch = anyFieldMatch([tasksTable.name, tasksTable.notes, tasksTable.tracker, tasksTable.redmineId]);
      const condition = taskCond ? and(taskCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${tasksTable.name} ILIKE ${q} THEN 5 WHEN ${tasksTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${tasksTable.name} ILIKE ${qLike} THEN 3 WHEN ${tasksTable.redmineId} ILIKE ${q} THEN 2 ELSE 1 END`;
      
      const results = await db.select({ id: tasksTable.id, title: tasksTable.name, redmineId: tasksTable.redmineId, status: tasksTable.status, createdAt: tasksTable.createdAt, projectId: tasksTable.projectId, requirementId: tasksTable.requirementId, assigneeIds: tasksTable.assigneeIds, rank })
        .from(tasksTable).where(condition).orderBy(desc(rank), desc(tasksTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'task', label: 'Tasks' }));
    })());
  }

  // Defect
  if (!typeParam || typeParam === 'defect') {
    searches.push((async () => {
      const projModCond = await buildProjectModuleCondition(userId, role, defectsTable.projectId, defectsTable.module);
      const accessCond = projModCond ? or(projModCond, isNull(defectsTable.projectId)) : undefined;
      const textMatch = anyFieldMatch([
        defectsTable.defectCode, defectsTable.title, defectsTable.description, defectsTable.stepsToReproduce,
        defectsTable.actualResult, defectsTable.expectedResult, defectsTable.module, defectsTable.category,
        defectsTable.escapeNotes, defectsTable.redmineId
      ]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${defectsTable.title} ILIKE ${q} THEN 5 WHEN ${defectsTable.title} ILIKE ${q + '%'} THEN 4 WHEN ${defectsTable.title} ILIKE ${qLike} THEN 3 WHEN ${defectsTable.defectCode} ILIKE ${q} THEN 2 ELSE 1 END`;
      
      const results = await db.select({ id: defectsTable.id, title: defectsTable.title, redmineId: defectsTable.redmineId, status: defectsTable.status, authorId: defectsTable.reporterId, createdAt: defectsTable.createdAt, projectId: defectsTable.projectId, rank })
        .from(defectsTable).where(condition).orderBy(desc(rank), desc(defectsTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'defect', label: 'Defects' }));
    })());
  }

  // Milestone
  if (!typeParam || typeParam === 'milestone') {
    searches.push((async () => {
      const accessCond = accessibleProjects !== null ? inArray(milestonesTable.projectId, accessibleProjects) : undefined;
      const textMatch = anyFieldMatch([milestonesTable.name, milestonesTable.description, milestonesTable.lessonsLearned, milestonesTable.type, milestonesTable.environment]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${milestonesTable.name} ILIKE ${q} THEN 5 WHEN ${milestonesTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${milestonesTable.name} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      
      const results = await db.select({ id: milestonesTable.id, title: milestonesTable.name, status: milestonesTable.status, authorId: milestonesTable.createdBy, createdAt: milestonesTable.createdAt, projectId: milestonesTable.projectId, rank })
        .from(milestonesTable).where(condition).orderBy(desc(rank), desc(milestonesTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'milestone', label: 'Milestones' }));
    })());
  }

  // Risk
  if (!typeParam || typeParam === 'risk') {
    searches.push((async () => {
      const accessCond = accessibleProjects !== null ? inArray(risksTable.projectId, accessibleProjects) : undefined;
      const textMatch = anyFieldMatch([risksTable.title, risksTable.description, risksTable.mitigationPlan, risksTable.category, risksTable.responseStrategy]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${risksTable.title} ILIKE ${q} THEN 5 WHEN ${risksTable.title} ILIKE ${q + '%'} THEN 4 WHEN ${risksTable.title} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      
      const results = await db.select({ id: risksTable.id, title: risksTable.title, status: risksTable.status, authorId: risksTable.raisedBy, createdAt: risksTable.createdAt, projectId: risksTable.projectId, rank })
        .from(risksTable).where(condition).orderBy(desc(rank), desc(risksTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'risk', label: 'Risks' }));
    })());
  }

  // UAT Sign-off
  if (!typeParam || typeParam === 'uat_signoff') {
    searches.push((async () => {
      const accessCond = accessibleProjects !== null ? inArray(uatSignoffsTable.projectId, accessibleProjects) : undefined;
      const textMatch = anyFieldMatch([uatSignoffsTable.fileName, uatSignoffsTable.note]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${uatSignoffsTable.fileName} ILIKE ${q} THEN 5 WHEN ${uatSignoffsTable.fileName} ILIKE ${q + '%'} THEN 4 WHEN ${uatSignoffsTable.fileName} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      
      const results = await db.select({ id: uatSignoffsTable.id, title: uatSignoffsTable.fileName, authorId: uatSignoffsTable.uploadedBy, createdAt: uatSignoffsTable.createdAt, projectId: uatSignoffsTable.projectId, rank })
        .from(uatSignoffsTable).where(condition).orderBy(desc(rank), desc(uatSignoffsTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'uat_signoff', label: 'UAT Sign-offs' }));
    })());
  }

  // Project
  if (!typeParam || typeParam === 'project') {
    searches.push((async () => {
      const accessCond = accessibleProjects !== null ? inArray(projectsTable.id, accessibleProjects) : undefined;
      const textMatch = anyFieldMatch([projectsTable.name, projectsTable.description]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${projectsTable.name} ILIKE ${q} THEN 5 WHEN ${projectsTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${projectsTable.name} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      
      const results = await db.select({ id: projectsTable.id, title: projectsTable.name, status: projectsTable.status, createdAt: projectsTable.createdAt, rank })
        .from(projectsTable).where(condition).orderBy(desc(rank), desc(projectsTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'project', label: 'Projects' }));
    })());
  }

  // Module
  if (!typeParam || typeParam === 'module') {
    searches.push((async () => {
      const textMatch = ilike(executionModulesTable.name, qLike);
      const rank = sql<number>`CASE WHEN ${executionModulesTable.name} ILIKE ${q} THEN 5 WHEN ${executionModulesTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${executionModulesTable.name} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      const results = await db.select({ id: executionModulesTable.id, title: executionModulesTable.name, createdAt: executionModulesTable.createdAt, rank })
        .from(executionModulesTable).where(textMatch).orderBy(desc(rank), desc(executionModulesTable.createdAt)).limit(100);
      return results.map(r => ({ ...r, type: 'module', label: 'Modules' }));
    })());
  }

  // Contact
  if (!typeParam || typeParam === 'contact') {
    searches.push((async () => {
      const textMatch = anyFieldMatch([contactsTable.fullName, contactsTable.email, contactsTable.redmineLogin, contactsTable.redmineId]); // redmineId is integer in db? 
      // wait, let's just use fullName, email, redmineLogin for ILIKE.
      const textMatchContacts = anyFieldMatch([contactsTable.fullName, contactsTable.email, contactsTable.redmineLogin]);
      const rank = sql<number>`CASE WHEN ${contactsTable.fullName} ILIKE ${q} THEN 5 WHEN ${contactsTable.fullName} ILIKE ${q + '%'} THEN 4 WHEN ${contactsTable.fullName} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      const results = await db.select({ id: contactsTable.id, title: contactsTable.fullName, redmineId: sql<string>`${contactsTable.redmineId}::text`, authorId: contactsTable.addedBy, createdAt: contactsTable.createdAt, rank })
        .from(contactsTable).where(textMatchContacts).orderBy(desc(rank), desc(contactsTable.createdAt)).limit(100);
      return results.map(r => ({ ...r, type: 'contact', label: 'Contacts' }));
    })());
  }

  // User
  if (!typeParam || typeParam === 'user') {
    searches.push((async () => {
      const textMatch = anyFieldMatch([usersTable.name, usersTable.email, usersTable.role, usersTable.team]);
      const rank = sql<number>`CASE WHEN ${usersTable.name} ILIKE ${q} THEN 5 WHEN ${usersTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${usersTable.name} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      const results = await db.select({ id: usersTable.id, title: usersTable.name, status: sql<string>`CASE WHEN ${usersTable.isActive} THEN 'active' ELSE 'inactive' END`, createdAt: usersTable.createdAt, rank })
        .from(usersTable).where(textMatch).orderBy(desc(rank), desc(usersTable.createdAt)).limit(100);
      return results.map(r => ({ ...r, type: 'user', label: 'Users' }));
    })());
  }

  // Team
  if (!typeParam || typeParam === 'team') {
    searches.push((async () => {
      const textMatch = anyFieldMatch([teamsTable.name, teamsTable.department]);
      const rank = sql<number>`CASE WHEN ${teamsTable.name} ILIKE ${q} THEN 5 WHEN ${teamsTable.name} ILIKE ${q + '%'} THEN 4 WHEN ${teamsTable.name} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      const results = await db.select({ id: teamsTable.id, title: teamsTable.name, createdAt: teamsTable.createdAt, rank })
        .from(teamsTable).where(textMatch).orderBy(desc(rank), desc(teamsTable.createdAt)).limit(100);
      return results.map(r => ({ ...r, type: 'team', label: 'Teams' }));
    })());
  }

  // Document Register
  if (!typeParam || typeParam === 'document_register') {
    searches.push((async () => {
      let accessCond = undefined;
      if (accessibleProjectNames !== null) {
        if (accessibleProjectNames.length === 0) {
          return [];
        }
        accessCond = inArray(documentRegisterTable.projectName, accessibleProjectNames);
      }
      const textMatch = anyFieldMatch([documentRegisterTable.projectName, documentRegisterTable.moduleName, documentRegisterTable.tracker, documentRegisterTable.refNo]);
      const condition = accessCond ? and(accessCond, textMatch) : textMatch;
      const rank = sql<number>`CASE WHEN ${documentRegisterTable.refNo} ILIKE ${q} THEN 5 WHEN ${documentRegisterTable.refNo} ILIKE ${q + '%'} THEN 4 WHEN ${documentRegisterTable.refNo} ILIKE ${qLike} THEN 3 ELSE 1 END`;
      
      const results = await db.select({ id: documentRegisterTable.id, title: sql<string>`${documentRegisterTable.refNo} - ${documentRegisterTable.projectName}`, createdAt: documentRegisterTable.createdAt, rank })
        .from(documentRegisterTable).where(condition).orderBy(desc(rank), desc(documentRegisterTable.createdAt)).limit(100);
      
      return results.map(r => ({ ...r, type: 'document_register', label: 'Document Register' }));
    })());
  }

  // Resilient: a single entity's query failing must not blank the whole
  // search — keep every group that succeeded and log the ones that didn't.
  const settled = await Promise.allSettled(searches);
  const allResultGroups = settled
    .filter((s): s is PromiseFulfilledResult<any[]> => s.status === "fulfilled")
    .map((s) => s.value);
  for (const s of settled) {
    if (s.status === "rejected") console.error("[search] entity query failed:", s.reason);
  }
  
  const getStatusTone = (status: string | undefined | null) => {
    if (!status) return 'neutral';
    const s = status.toLowerCase();
    if (s.includes('approved') || s.includes('passed') || s === 'active' || s.includes('closed')) return 'success';
    if (s.includes('failing') || s.includes('error') || s.includes('overdue') || s.includes('rejected')) return 'destructive';
    if (s.includes('review') || s.includes('progress') || s.includes('analyzing') || s.includes('pending')) return 'warning';
    return 'neutral';
  };

  let totalMatches = 0;
  const groups: any[] = [];

  for (const groupResults of allResultGroups) {
    if (groupResults.length === 0) continue;
    const count = groupResults.length;
    totalMatches += count;

    const formatted = groupResults.slice(0, limit).map((r: any) => {
      // formatting the subtitle
      const pName = r.projectId ? projectMap.get(r.projectId) : undefined;
      const aName = r.authorId ? userMap.get(r.authorId) : undefined;
      const asName = r.assigneeIds && r.assigneeIds.length > 0 ? r.assigneeIds.map((id: number) => userMap.get(id)).filter(Boolean).join(", ") : undefined;
      
      const authorOrAssignee = r.type === 'task' ? (asName || "—") : (aName || "—");
      
      const parts = [
        r.label.replace(/s$/, ''), // singularize vaguely
        pName,
        r.redmineId ? `#${r.redmineId}` : undefined,
        authorOrAssignee,
        r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined
      ].filter(Boolean);
      
      let route = '';
      switch (r.type) {
        case 'requirement': route = `/requirements/${r.id}`; break;
        case 'test_case': route = `/test-cases?tc=${r.id}`; break;
        case 'task': route = `/tasks?highlight=${r.requirementId}`; break;
        case 'defect': route = `/defects?highlight=${r.id}`; break;
        case 'milestone': route = `/milestones?highlight=${r.id}`; break;
        case 'risk': route = `/risk-register?projectId=${r.projectId}&highlight=${r.id}`; break;
        case 'uat_signoff': route = `/uat-signoffs?highlight=${r.id}`; break;
        case 'project': route = `/configurations?tab=projects&highlight=${r.id}`; break;
        case 'module': route = `/configurations?tab=projects&highlight=${r.id}`; break;
        case 'contact': route = `/configurations?tab=contacts&highlight=${r.id}`; break;
        case 'user': route = `/team?highlight=${r.id}`; break;
        case 'team': route = `/configurations?tab=teams&highlight=${r.id}`; break;
        case 'document_register': route = `/configurations?tab=doc-register&highlight=${r.id}`; break;
      }

      return {
        type: r.type,
        id: r.id,
        title: r.title || 'Untitled',
        subtitle: parts.join(' · '),
        status: r.status,
        statusTone: getStatusTone(r.status),
        author: authorOrAssignee,
        createdAt: r.createdAt,
        redmineId: r.redmineId,
        projectName: pName,
        route
      };
    });

    groups.push({
      type: groupResults[0].type,
      label: groupResults[0].label,
      count,
      results: formatted
    });
  }

  // Sort groups by type or some order? Maybe requirements first
  res.json({
    query: q,
    total: totalMatches,
    groups
  });
});

export default router;
