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
      return res.json({ qaFlowEnabled: false });
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
    if (!auth || auth.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update pipeline settings" });
    }

    const { qaFlowEnabled } = req.body;
    
    // Upsert the single row
    const existing = await db.query.pipelineSettingsTable.findFirst();
    let updated;
    
    if (existing) {
      [updated] = await db
        .update(pipelineSettingsTable)
        .set({ 
          qaFlowEnabled: Boolean(qaFlowEnabled),
          updatedBy: auth.user.id,
          updatedAt: new Date()
        })
        .where(eq(pipelineSettingsTable.id, existing.id))
        .returning();
    } else {
      [updated] = await db
        .insert(pipelineSettingsTable)
        .values({
          qaFlowEnabled: Boolean(qaFlowEnabled),
          updatedBy: auth.user.id,
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
