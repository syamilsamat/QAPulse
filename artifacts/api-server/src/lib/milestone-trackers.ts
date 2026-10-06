import { db, milestoneTypeTrackersTable } from "@workspace/db";

// Milestone types that carry requirements. 'data_prep' is left out on purpose:
// a Data Prep milestone has no requirements, so there is nothing to map.
export const MAPPABLE_MILESTONE_TYPES = [
  { type: "cr", label: "Change Request" },
  { type: "phase", label: "Phase" },
  { type: "sprint", label: "Sprint" },
  { type: "release", label: "Release" },
] as const;

export async function loadTypeTrackerMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(milestoneTypeTrackersTable);
  return Object.fromEntries(rows.map((r) => [r.milestoneType, r.trackerName]));
}
