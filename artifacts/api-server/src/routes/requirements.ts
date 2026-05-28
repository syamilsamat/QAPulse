import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, requirementsTable, usersTable, projectsTable, activityTable } from "@workspace/db";
import {
  CreateRequirementBody,
  UpdateRequirementBody,
  GetRequirementParams,
  UpdateRequirementParams,
  DeleteRequirementParams,
  ListRequirementsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function formatRequirement(req: typeof requirementsTable.$inferSelect) {
  let assigneeName = null;
  let projectName = null;

  if (req.assigneeId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.assigneeId));
    assigneeName = user?.name ?? null;
  }
  if (req.projectId) {
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, req.projectId));
    projectName = project?.name ?? null;
  }

  return {
    id: req.id,
    title: req.title,
    description: req.description,
    module: req.module,
    projectId: req.projectId,
    projectName,
    priority: req.priority,
    release: req.release,
    assigneeId: req.assigneeId,
    assigneeName,
    redmineTicketId: req.redmineTicketId,
    status: req.status,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
  };
}

router.get("/requirements", async (req, res): Promise<void> => {
  const parsed = ListRequirementsQueryParams.safeParse(req.query);
  let reqs = await db.select().from(requirementsTable).orderBy(requirementsTable.createdAt);

  if (parsed.success) {
    const { projectId, assigneeId, status, priority, module, release, search } = parsed.data;
    if (projectId) reqs = reqs.filter(r => r.projectId === projectId);
    if (assigneeId) reqs = reqs.filter(r => r.assigneeId === assigneeId);
    if (status) reqs = reqs.filter(r => r.status === status);
    if (priority) reqs = reqs.filter(r => r.priority === priority);
    if (module) reqs = reqs.filter(r => r.module === module);
    if (release) reqs = reqs.filter(r => r.release === release);
    if (search) reqs = reqs.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));
  }

  const formatted = await Promise.all(reqs.map(formatRequirement));
  res.json(formatted);
});

router.post("/requirements", async (req, res): Promise<void> => {
  const parsed = CreateRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [requirement] = await db.insert(requirementsTable).values(parsed.data).returning();

  await db.insert(activityTable).values({
    type: "requirement_created",
    description: `Requirement "${requirement.title}" was created`,
    entityId: requirement.id,
    entityType: "requirement",
  });

  res.status(201).json(await formatRequirement(requirement));
});

router.get("/requirements/:id", async (req, res): Promise<void> => {
  const params = GetRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [requirement] = await db.select().from(requirementsTable).where(eq(requirementsTable.id, params.data.id));
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  res.json(await formatRequirement(requirement));
});

router.patch("/requirements/:id", async (req, res): Promise<void> => {
  const params = UpdateRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRequirementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [requirement] = await db.update(requirementsTable).set(parsed.data).where(eq(requirementsTable.id, params.data.id)).returning();
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  res.json(await formatRequirement(requirement));
});

router.delete("/requirements/:id", async (req, res): Promise<void> => {
  const params = DeleteRequirementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [requirement] = await db.delete(requirementsTable).where(eq(requirementsTable.id, params.data.id)).returning();
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
