import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pipelineSettingsTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";

const router: IRouter = Router();

// GET /pipeline-settings
router.get("/pipeline-settings", async (req, res) => {
  try {
    const auth = getAuthContext(req);
    if (!auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const settings = await db.query.pipelineSettingsTable.findFirst();
    if (!settings) {
      return res.json({ qaFlowEnabled: false, bddEnabled: false });
    }
    return res.json(settings);
  } catch (error) {
    console.error("Error fetching pipeline settings:", error);
    res.status(500).json({ error: "Failed to fetch pipeline settings" });
  }
});

// PUT /pipeline-settings
router.put("/pipeline-settings", async (req, res) => {
  try {
    const auth = getAuthContext(req);
    if (!auth || auth.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update pipeline settings" });
    }

    const { qaFlowEnabled, bddEnabled } = req.body;

    // Upsert the single row. Each flag is only written when the caller
    // actually sent it, so updating one toggle can't silently reset another.
    const existing = await db.query.pipelineSettingsTable.findFirst();
    let updated;

    if (existing) {
      const patch: Partial<typeof pipelineSettingsTable.$inferInsert> = {
        updatedBy: auth.userId,
        updatedAt: new Date(),
      };
      if (qaFlowEnabled !== undefined) patch.qaFlowEnabled = Boolean(qaFlowEnabled);
      if (bddEnabled !== undefined) patch.bddEnabled = Boolean(bddEnabled);

      [updated] = await db
        .update(pipelineSettingsTable)
        .set(patch)
        .where(eq(pipelineSettingsTable.id, existing.id))
        .returning();
    } else {
      [updated] = await db
        .insert(pipelineSettingsTable)
        .values({
          qaFlowEnabled: Boolean(qaFlowEnabled),
          bddEnabled: Boolean(bddEnabled),
          updatedBy: auth.userId,
        })
        .returning();
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating pipeline settings:", error);
    res.status(500).json({ error: "Failed to update pipeline settings" });
  }
});

export default router;
