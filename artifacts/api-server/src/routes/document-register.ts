import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, documentRegisterTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";

const router = Router();

// CR049 — document register requires auth on every route (was fully open).
router.use((req, res, next) => {
  if (!getAuthContext(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
});

router.get("/document-register", async (_req, res) => {
  try {
    const rows = await db.select().from(documentRegisterTable).orderBy(documentRegisterTable.projectName);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/document-register", async (req, res): Promise<void> => {
  try {
    const { projectName, moduleName, tracker, refNo } = req.body;
    if (!projectName || !moduleName || !refNo) {
      res.status(400).json({ error: "projectName, moduleName and refNo are required" });
      return;
    }
    const [row] = await db.insert(documentRegisterTable).values({
      projectName,
      moduleName,
      tracker: tracker ?? "CR",
      refNo,
    }).returning();
    res.status(201).json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/document-register/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { projectName, moduleName, tracker, refNo } = req.body;
    const [row] = await db.update(documentRegisterTable)
      .set({ projectName, moduleName, tracker, refNo })
      .where(eq(documentRegisterTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/document-register/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(documentRegisterTable).where(eq(documentRegisterTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
