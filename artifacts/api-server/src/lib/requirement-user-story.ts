import { inArray } from "drizzle-orm";
import { db, requirementsTable } from "@workspace/db";

// The Excel's "Redmine User Story" column must show the same ticket the
// execution dashboard shows for a row: its linked requirement's Redmine
// ticket (the "REQUIREMENT · linked" panel). The builder only knew the row's
// own userStory text and the execution file's ticket, so a row linked to
// #41108 inside file #40826 exported as 40826.
//
// Precedence: linked requirement's ticket → the row's own userStory → (the
// builder's) execution file ticket. A linked requirement with no Redmine
// ticket keeps whatever the row already had.
export async function withRequirementUserStories<
  T extends { requirementId?: number | null; userStory?: string | null; rowType?: string | null },
>(rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.map((r) => r.requirementId).filter((id): id is number => typeof id === "number"))];
  if (ids.length === 0) return rows;
  const reqs = await db
    .select({ id: requirementsTable.id, redmineTicketId: requirementsTable.redmineTicketId })
    .from(requirementsTable)
    .where(inArray(requirementsTable.id, ids));
  const ticketById = new Map(
    reqs
      .filter((r) => r.redmineTicketId != null && String(r.redmineTicketId).trim() !== "")
      .map((r) => [r.id, String(r.redmineTicketId).trim().replace(/^#/, "")]),
  );
  return rows.map((row) => {
    // Group rows are section banners, not test cases.
    if (row.rowType === "group" || row.requirementId == null) return row;
    const ticket = ticketById.get(row.requirementId);
    return ticket ? { ...row, userStory: ticket } : row;
  });
}
