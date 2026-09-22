import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody, GetProjectParams, UpdateProjectParams } from "@workspace/api-zod";
import { getAuthContext, scopeToUserProjects, canAccessProject } from "../middleware/access";

const router: IRouter = Router();

function fmt(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/projects", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accessible = await scopeToUserProjects(ctx.userId, ctx.role);

  if (accessible === null) {
    const projects = await db.select().from(projectsTable).orderBy(projectsTable.name);
    res.json(projects.map(fmt));
    return;
  }

  if (accessible.length === 0) { res.json([]); return; }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(inArray(projectsTable.id, accessible))
    .orderBy(projectsTable.name);
  res.json(projects.map(fmt));
});

router.post("/projects", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (ctx.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }

  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [project] = await db.insert(projectsTable).values(parsed.data).returning();
  res.status(201).json(fmt(project));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, params.data.id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const ok = await canAccessProject(ctx.userId, ctx.role, project.id);
  if (!ok) { res.status(404).json({ error: "Project not found" }); return; }

  res.json(fmt(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (ctx.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [project] = await db.update(projectsTable).set(parsed.data).where(eq(projectsTable.id, params.data.id)).returning();
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  res.json(fmt(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (ctx.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }

  try {
    await db.delete(projectsTable).where(eq(projectsTable.id, params.data.id));
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

export default router;
