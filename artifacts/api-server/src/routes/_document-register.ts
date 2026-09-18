import { eq } from "drizzle-orm";
import { db, documentRegisterTable, projectsTable } from "@workspace/db";
import { selectDocumentReference } from "./_document-reference";

export async function resolveDocumentReference({ projectId, projectName, selectedModules, tracker }: {
  projectId?: number | null; projectName?: string; selectedModules?: string | null; tracker: string;
}): Promise<string | undefined> {
  let name = projectName ?? "";
  if (projectId != null) {
    const [project] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, projectId));
    name = project?.name ?? "";
  }
  const entries = await db.select().from(documentRegisterTable);
  return selectDocumentReference(entries, name, selectedModules ?? "", tracker);
}
