import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, trackersTable, milestoneTypeTrackersTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";
import { logActivity } from "./_audit";
import { MAPPABLE_MILESTONE_TYPES, loadTypeTrackerMap } from "../lib/milestone-trackers";

const router: IRouter = Router();

// GET /milestone-type-trackers — each milestone type with its mapped tracker
// (null = not mapped). Any signed-in user: the requirement form reads it.
router.get("/milestone-type-trackers", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const map = await loadTypeTrackerMap();
    res.json(MAPPABLE_MILESTONE_TYPES.map((t) => ({ type: t.type, label: t.label, trackerName: map[t.type] ?? null })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load tracker mapping" });
  }
});

// PUT /milestone-type-trackers/:type — body { trackerName: string | null }.
// Administrators only; the tracker must be one synced from Redmine.
router.put("/milestone-type-trackers/:type", async (req, res): Promise<void> => {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (ctx.role !== "admin" && ctx.role !== "cto") {
    res.status(403).json({ error: "Only an administrator can change the tracker mapping" }); return;
  }
  const type = req.params.type;
  const known = MAPPABLE_MILESTONE_TYPES.find((t) => t.type === type);
  if (!known) { res.status(404).json({ error: "Unknown milestone type" }); return; }

  const trackerName = req.body?.trackerName;
  if (trackerName !== null && (typeof trackerName !== "string" || !trackerName.trim())) {
    res.status(400).json({ error: "trackerName must be a tracker name, or null to clear the mapping" }); return;
  }
  try {
    const before = (await loadTypeTrackerMap())[type] ?? null;
    if (trackerName === null) {
      await db.delete(milestoneTypeTrackersTable).where(eq(milestoneTypeTrackersTable.milestoneType, type));
    } else {
      const [t] = await db.select({ id: trackersTable.id }).from(trackersTable).where(eq(trackersTable.name, trackerName));
      if (!t) { res.status(400).json({ error: "That tracker is not in the synced Redmine tracker list" }); return; }
      await db.insert(milestoneTypeTrackersTable)
        .values({ milestoneType: type, trackerName, updatedBy: ctx.userId })
        .onConflictDoUpdate({ target: milestoneTypeTrackersTable.milestoneType, set: { trackerName, updatedBy: ctx.userId, updatedAt: new Date() } });
    }
    await logActivity({
      type: "milestone_tracker_mapping_updated",
      description: `${known.label} milestones now use tracker ${trackerName ?? "(none)"} (was ${before ?? "none"})`,
      userId: ctx.userId,
      entityType: "milestone_tracker_mapping",
      oldValue: { type, trackerName: before },
      newValue: { type, trackerName },
    });
    res.json({ type, label: known.label, trackerName });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to save tracker mapping" });
  }
});

export default router;
