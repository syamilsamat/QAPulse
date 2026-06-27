import { Router, type IRouter } from "express";
import { eq, and, sql, inArray, notInArray } from "drizzle-orm";
import {
  db,
  executionFilesTable,
  executionModulesTable,
  executionTestCasesTable,
  executionTcHistoryTable,
  executionSummariesTable,
  executionFileAuditTable,
  trackersTable,
  usersTable,
} from "@workspace/db";
import { verifyToken } from "./auth";
import { buildTestCaseExcel, trackerCode, runCapaAI } from "./excel-builder";
import { fetchActiveDefectsForIssue } from "./pmo-report";

const router: IRouter = Router();

// --- 1. SETUP SERVER-SENT EVENTS (SSE) CLIENTS ---
const clients = new Set<any>();

router.get("/execution-events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

const broadcastUpdate = (ticketId: string) => {
  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify({ ticketId, type: "UPDATED" })}\n\n`);
  });
};

/* ────────────────────────────────
   MODULES
   ──────────────────────────────── */

router.get("/modules", async (_req, res): Promise<void> => {
  try {
    const modules = await db.select().from(executionModulesTable);
    res.json(
      modules.map((m) => ({
        id: m.id,
        name: m.name,
        createdAt: m.createdAt,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch modules" });
  }
});

router.post("/modules", async (req, res): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const [mod] = await db
      .insert(executionModulesTable)
      .values({ name: name.trim() })
      .returning();
    res
      .status(201)
      .json({ id: mod.id, name: mod.name, createdAt: mod.createdAt });
  } catch {
    res.status(500).json({ error: "Failed to add module" });
  }
});

router.delete("/modules/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(executionModulesTable)
      .where(eq(executionModulesTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete module" });
  }
});

router.patch("/modules/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const [updatedModule] = await db
      .update(executionModulesTable)
      .set({ name: name.trim() })
      .where(eq(executionModulesTable.id, id))
      .returning();

    if (!updatedModule) {
      res.status(404).json({ error: "Module not found" });
      return;
    }

    res.json({
      id: updatedModule.id,
      name: updatedModule.name,
      createdAt: updatedModule.createdAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to update module" });
  }
});

/* ────────────────────────────────
   EXECUTION FILES
   ──────────────────────────────── */

router.get("/execution-files", async (_req, res): Promise<void> => {
  try {
    const files = await db.select().from(executionFilesTable);
    res.json(
      files.map((f) => ({
        id: f.id,
        redmineTicketId: f.redmineTicketId,
        title: f.title,
        qaPic: f.qaPic,
        remarks: f.remarks,
        selectedModules: f.selectedModules,
        tracker: f.tracker,
        projectId: f.projectId,
        requirementId: f.requirementId,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch execution files" });
  }
});

// Returns aggregated execution progress per redmine ticket ID (full breakdown)
router.get("/execution-progress", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(executionSummariesTable);
    const agg: Record<string, { total: number; passed: number; failed: number; blocked: number; inProgress: number; notExecuted: number }> = {};
    for (const row of rows) {
      if (!agg[row.redmineTicketId]) agg[row.redmineTicketId] = { total: 0, passed: 0, failed: 0, blocked: 0, inProgress: 0, notExecuted: 0 };
      agg[row.redmineTicketId].total += row.total;
      agg[row.redmineTicketId].passed += row.passed;
      agg[row.redmineTicketId].failed += row.failed;
      agg[row.redmineTicketId].blocked += row.blocked;
      agg[row.redmineTicketId].inProgress += row.inProgress;
      agg[row.redmineTicketId].notExecuted += row.notExecuted;
    }
    res.json(agg);
  } catch {
    res.status(500).json({ error: "Failed to fetch execution progress" });
  }
});

// ─── Trackers (synced from Redmine) ──────────────────────────────────────────

router.get("/trackers", async (_req, res): Promise<void> => {
  try {
    const trackers = await db.select().from(trackersTable).orderBy(trackersTable.name);
    res.json(trackers);
  } catch {
    res.status(500).json({ error: "Failed to fetch trackers" });
  }
});

router.post("/trackers/sync", async (req, res): Promise<void> => {
  try {
    const apiKey = (req.headers["x-redmine-user-key"] as string | undefined) || process.env.REDMINE_API_KEY || "";
    const redmineUrl = process.env.REDMINE_URL || "https://redmine.bestinet.my";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["X-Redmine-API-Key"] = apiKey;

    const response = await fetch(`${redmineUrl}/trackers.json`, { headers });
    if (!response.ok) throw new Error(`Redmine returned ${response.status}`);
    const data = await response.json();
    const redmineTrackers: { id: number; name: string }[] = data.trackers ?? [];

    for (const t of redmineTrackers) {
      await db
        .insert(trackersTable)
        .values({ redmineId: t.id, name: t.name })
        .onConflictDoUpdate({ target: trackersTable.redmineId, set: { name: t.name } });
    }

    const stored = await db.select().from(trackersTable).orderBy(trackersTable.name);
    res.json({ synced: redmineTrackers.length, trackers: stored });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to sync trackers: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

router.post("/execution-files", async (req, res): Promise<void> => {
  try {
    const { redmineTicketId, title, qaPic, remarks, selectedModules, tracker, projectId, requirementId } = req.body;
    if (!redmineTicketId || !redmineTicketId.trim()) {
      res.status(400).json({ error: "Redmine Ticket ID is required" });
      return;
    }
    const [file] = await db
      .insert(executionFilesTable)
      .values({
        redmineTicketId: redmineTicketId.trim(),
        title: title || null,
        qaPic: qaPic || null,
        remarks: remarks || null,
        selectedModules: selectedModules || null,
        tracker: tracker || null,
        projectId: projectId ? Number(projectId) : null,
        requirementId: requirementId ? Number(requirementId) : null,
      })
      .returning();
    // Audit: log execution file creation
    let creatorName: string | null = null;
    const createAuth = req.headers.authorization;
    if (createAuth?.startsWith("Bearer ")) {
      try {
        const userId = verifyToken(createAuth.slice(7)).id;
        const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
        if (u) creatorName = u.name;
      } catch {}
    }
    await db.insert(executionFileAuditTable).values({
      executionFileId: file.id,
      updatedByName: creatorName,
      summary: "Draft Test Case file for execution",
      tcCount: 0,
    }).catch(() => {});

    res.status(201).json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      tracker: file.tracker,
      projectId: file.projectId,
      requirementId: file.requirementId,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch (err: any) {
    // PostgreSQL unique_violation code 23505
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      res.status(409).json({ error: `An execution file for ticket #${req.body.redmineTicketId} already exists` });
      return;
    }
    console.error("[execution-files POST]", err);
    res.status(500).json({ error: "Failed to create execution file" });
  }
});

router.patch("/execution-files/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const { selectedModules, title, redmineTicketId, remarks, tracker, projectId, requirementId } = req.body;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (selectedModules !== undefined) patch.selectedModules = selectedModules || null;
    if (title !== undefined) patch.title = title || null;
    if (redmineTicketId !== undefined) patch.redmineTicketId = String(redmineTicketId).trim();
    if (remarks !== undefined) patch.remarks = remarks || null;
    if (tracker !== undefined) patch.tracker = tracker || null;
    if (projectId !== undefined) patch.projectId = projectId ? Number(projectId) : null;
    if (requirementId !== undefined) patch.requirementId = requirementId ? Number(requirementId) : null;

    const [updated] = await db
      .update(executionFilesTable)
      .set(patch)
      .where(eq(executionFilesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({
      id: updated.id,
      redmineTicketId: updated.redmineTicketId,
      title: updated.title,
      qaPic: updated.qaPic,
      remarks: updated.remarks,
      selectedModules: updated.selectedModules,
      tracker: updated.tracker,
      projectId: updated.projectId,
      requirementId: updated.requirementId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      res.status(409).json({ error: "An execution file with that Redmine ticket ID already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to update execution file" });
  }
});

router.get("/execution-files/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [file] = await db
      .select()
      .from(executionFilesTable)
      .where(eq(executionFilesTable.id, id));
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      projectId: file.projectId,
      requirementId: file.requirementId,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch execution file" });
  }
});

router.delete("/execution-files/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(executionFilesTable)
      .where(eq(executionFilesTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete execution file" });
  }
});

/* ────────────────────────────────
   EXECUTION SUMMARIES (by Redmine ticket ID)
   ──────────────────────────────── */

router.get("/execution-files/:ticketId/summaries", async (req, res): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const rows = await db.select().from(executionSummariesTable)
      .where(eq(executionSummariesTable.redmineTicketId, ticketId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch summaries" });
  }
});

/* ────────────────────────────────
   TEST CASES (by Redmine ticket ID)
   ──────────────────────────────── */

router.get(
  "/execution-files/:ticketId/test-cases",
  async (req, res): Promise<void> => {
    try {
      const ticketId = req.params.ticketId;
      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, ticketId));

      if (!file) {
        res.json({ testCases: [], lastUpdatedAt: null });
        return;
      }

      const testCases = await db
        .select()
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      res.json({
        lastUpdatedAt: file.updatedAt,
        testCases: testCases.map((t) => ({
          id: t.id,
          moduleName: t.moduleName,
          caseId: t.caseId,
          testCaseId: t.testCaseId,
          libraryTcId: t.libraryTcId,
          userStory: t.userStory,
          tracker: (t as any).tracker,
          scenario: t.scenario,
          preCondition: t.preCondition,
          caseName: t.caseName,
          testSteps: t.testSteps,
          testData: t.testData,
          expectedResult: t.expectedResult,
          result: t.result,
          actualResult: t.actualResult,
          defectNumber: t.defectNumber,
          defectScreenshots: t.defectScreenshots,
          comments: t.comments,
          qaPic: t.qaPic,
          rowOrder: t.rowOrder,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch test cases" });
    }
  },
);

router.post(
  "/execution-files/:ticketId/test-cases",
  async (req, res): Promise<void> => {
    try {
      const ticketId = req.params.ticketId;
      // testCases: rows to upsert (dirty rows for auto-save, all rows for full sync)
      // deletedIds: numeric DB row IDs to explicitly delete
      // isFullSync: if true, also delete DB rows whose IDs are not in testCases
      const { testCases, deletedIds = [], isFullSync = false } = req.body;
      if (!Array.isArray(testCases)) {
        res.status(400).json({ error: "testCases array required" });
        return;
      }

      const [file] = await db
        .select()
        .from(executionFilesTable)
        .where(eq(executionFilesTable.redmineTicketId, ticketId));

      if (!file) {
        res.status(404).json({ error: "Execution file not found" });
        return;
      }

      // 0. Capture current rows for history diff + audit + upsert decisions
      const existingRows = await db
        .select({
          id: executionTestCasesTable.id,
          testCaseId: executionTestCasesTable.testCaseId,
          result: executionTestCasesTable.result,
          executedAt: executionTestCasesTable.executedAt,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      type ExistingState = { result: string | null; executedAt: Date | null };
      const existingMap = new Map<string, ExistingState>(
        existingRows
          .filter((r) => r.testCaseId)
          .map((r) => [r.testCaseId!, { result: r.result ?? null, executedAt: r.executedAt ?? null }]),
      );
      const existingDbIdSet = new Set(existingRows.map((r) => r.id));
      const oldTcIdSet = new Set(existingRows.map((r) => r.testCaseId).filter(Boolean) as string[]);

      // Extract changedBy from JWT if present
      let changedBy: number | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          changedBy = verifyToken(authHeader.slice(7)).id;
        } catch {}
      }

      // 1. Delete explicitly removed rows (only those belonging to this file)
      const safeDeleteIds = (deletedIds as any[])
        .map((id: any) => Number(id))
        .filter((id: number) => !isNaN(id) && existingDbIdSet.has(id));

      let removedTCCount = 0;
      if (safeDeleteIds.length > 0) {
        removedTCCount = existingRows.filter((r) => safeDeleteIds.includes(r.id) && r.testCaseId).length;
        await db.delete(executionTestCasesTable).where(
          and(
            eq(executionTestCasesTable.executionFileId, file.id),
            inArray(executionTestCasesTable.id, safeDeleteIds),
          ),
        );
      }

      // 1b. Full-sync: also delete DB rows not present in the incoming testCases array
      if (isFullSync && testCases.length > 0) {
        const incomingDbIds = testCases
          .map((t: any) => (typeof t.id === "number" ? t.id : null))
          .filter((id: number | null): id is number => id !== null && existingDbIdSet.has(id));
        const orphanIds = existingRows
          .map((r) => r.id)
          .filter((id) => !incomingDbIds.includes(id) && !safeDeleteIds.includes(id));
        if (orphanIds.length > 0) {
          removedTCCount += existingRows.filter((r) => orphanIds.includes(r.id) && r.testCaseId).length;
          await db.delete(executionTestCasesTable).where(
            and(
              eq(executionTestCasesTable.executionFileId, file.id),
              inArray(executionTestCasesTable.id, orphanIds),
            ),
          );
        }
      }

      // 2. Auto-assign TC IDs — find the highest existing sequence number
      let nextSeq = 1;
      for (const r of existingRows) {
        const match = r.testCaseId ? /TC-\d+-(\d+)/.exec(r.testCaseId) : null;
        if (match) {
          const n = parseInt(match[1], 10);
          if (n >= nextSeq) nextSeq = n + 1;
        }
      }
      for (const t of testCases) {
        const match = t.testCaseId ? /TC-\d+-(\d+)/.exec(t.testCaseId) : null;
        if (match) {
          const n = parseInt(match[1], 10);
          if (n >= nextSeq) nextSeq = n + 1;
        }
      }

      // 3. Upsert incoming rows — UPDATE if DB id exists, INSERT if new
      const insertedRows: any[] = [];
      const processedCases: any[] = [];
      const now = new Date();

      for (let idx = 0; idx < testCases.length; idx++) {
        const t = testCases[idx];
        const dbId = typeof t.id === "number" && existingDbIdSet.has(t.id) ? t.id : null;

        let tcId: string = t.testCaseId || "";
        if (!tcId) {
          tcId = `TC-${ticketId}-${String(nextSeq).padStart(3, "0")}`;
          nextSeq++;
        }

        const existing = existingMap.get(tcId);
        const newResult = (t.result?.trim() || null) as string | null;
        const computedExecutedAt =
          newResult && existing?.result !== newResult
            ? now
            : (existing?.executedAt ?? (t.executedAt ? new Date(t.executedAt) : null));

        const rowData = {
          executionFileId: file.id,
          moduleName: t.moduleName || null,
          caseId: t.caseId || null,
          testCaseId: tcId,
          libraryTcId: t.libraryTcId ? Number(t.libraryTcId) : null,
          userStory: t.userStory || null,
          tracker: t.tracker || null,
          scenario: t.scenario || null,
          preCondition: t.preCondition || null,
          caseName: t.caseName || null,
          testSteps: t.testSteps || null,
          testData: t.testData || null,
          expectedResult: t.expectedResult || null,
          result: newResult,
          executedAt: computedExecutedAt,
          actualResult: t.actualResult || null,
          defectNumber: t.defectNumber || null,
          defectScreenshots: t.defectScreenshots || null,
          comments: t.comments || null,
          qaPic: t.qaPic || null,
          rowOrder: t.rowOrder ?? idx,
        };

        if (dbId !== null) {
          const [updated] = await db
            .update(executionTestCasesTable)
            .set(rowData)
            .where(
              and(
                eq(executionTestCasesTable.id, dbId),
                eq(executionTestCasesTable.executionFileId, file.id),
              ),
            )
            .returning();
          if (updated) processedCases.push({ ...t, testCaseId: tcId });
        } else {
          const [inserted] = await db
            .insert(executionTestCasesTable)
            .values(rowData)
            .returning();
          if (inserted) {
            insertedRows.push({ ...inserted, _tempId: t._tempId });
            processedCases.push({ ...t, testCaseId: tcId });
          }
        }
      }

      // 3a. Write status change history for incoming rows
      const historyRows = processedCases
        .filter((t: any) => t.testCaseId)
        .flatMap((t: any) => {
          const existing = existingMap.get(t.testCaseId);
          const oldResult = existing?.result ?? null;
          const newResult = (t.result?.trim() || null) as string | null;
          if (oldResult === newResult || (!oldResult && !newResult)) return [];
          return [{
            executionFileId: file.id,
            testCaseId: t.testCaseId,
            changedBy,
            fromStatus: oldResult,
            toStatus: newResult,
            changedAt: now,
          }];
        });
      if (historyRows.length > 0) {
        await db.insert(executionTcHistoryTable).values(historyRows);
      }

      // 3b. Audit log — record TC add/remove, merging same-user same-day entries
      const addedTCCount = processedCases.filter(
        (t: any) => t.testCaseId && !oldTcIdSet.has(t.testCaseId),
      ).length;
      if (addedTCCount > 0 || removedTCCount > 0) {
        let changedByName: string | null = null;
        if (changedBy) {
          try {
            const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, changedBy));
            if (u) changedByName = u.name;
          } catch {}
        }
        const allFileRows = await db
          .select({ id: executionTestCasesTable.id })
          .from(executionTestCasesTable)
          .where(eq(executionTestCasesTable.executionFileId, file.id));
        const currentTcCount = allFileRows.length;

        const existingAudit = changedByName
          ? await db
              .select()
              .from(executionFileAuditTable)
              .where(
                and(
                  eq(executionFileAuditTable.executionFileId, file.id),
                  eq(executionFileAuditTable.updatedByName, changedByName),
                  sql`DATE(${executionFileAuditTable.createdAt}) = CURRENT_DATE`,
                ),
              )
              .limit(1)
              .catch(() => [] as any[])
          : [];
        if (existingAudit.length > 0) {
          const prev = existingAudit[0].summary as string;
          if (prev === "Draft Test Case file for execution") {
            await db.update(executionFileAuditTable)
              .set({ tcCount: currentTcCount })
              .where(eq(executionFileAuditTable.id, existingAudit[0].id))
              .catch(() => {});
          } else {
            const prevAdded = parseInt(/(\d+) test cases? added/.exec(prev)?.[1] ?? "0");
            const prevRemoved = parseInt(/(\d+) test cases? removed/.exec(prev)?.[1] ?? "0");
            const totalAdded = prevAdded + addedTCCount;
            const totalRemoved = prevRemoved + removedTCCount;
            const parts: string[] = [];
            if (totalAdded > 0) parts.push(`${totalAdded} test case${totalAdded !== 1 ? "s" : ""} added`);
            if (totalRemoved > 0) parts.push(`${totalRemoved} test case${totalRemoved !== 1 ? "s" : ""} removed`);
            await db.update(executionFileAuditTable)
              .set({ summary: parts.join(", "), tcCount: currentTcCount })
              .where(eq(executionFileAuditTable.id, existingAudit[0].id))
              .catch(() => {});
          }
        } else {
          const parts: string[] = [];
          if (addedTCCount > 0) parts.push(`${addedTCCount} test case${addedTCCount !== 1 ? "s" : ""} added`);
          if (removedTCCount > 0) parts.push(`${removedTCCount} test case${removedTCCount !== 1 ? "s" : ""} removed`);
          await db.insert(executionFileAuditTable).values({
            executionFileId: file.id,
            updatedByName: changedByName,
            summary: parts.join(", "),
            tcCount: currentTcCount,
          }).catch(() => {});
        }
      }

      // 4. Update file's updatedAt
      const [updatedFile] = await db
        .update(executionFilesTable)
        .set({ updatedAt: new Date() })
        .where(eq(executionFilesTable.id, file.id))
        .returning();

      // 5. Recompute summary from ALL rows in this file (not just incoming)
      const allTcRows = await db
        .select({
          moduleName: executionTestCasesTable.moduleName,
          caseName: executionTestCasesTable.caseName,
          result: executionTestCasesTable.result,
        })
        .from(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      const moduleMap: Record<string, { module: string; total: number; passed: number; failed: number; blocked: number; inProg: number; notExec: number }> = {};
      for (const tc of allTcRows) {
        if (!tc.moduleName && !tc.caseName && !tc.result) continue;
        const modName = tc.moduleName || "Unassigned Module";
        if (!moduleMap[modName]) {
          moduleMap[modName] = { module: modName, total: 0, passed: 0, failed: 0, blocked: 0, inProg: 0, notExec: 0 };
        }
        const row = moduleMap[modName];
        row.total += 1;
        const result = (tc.result?.trim() || "").toLowerCase();
        if (result === "passed") row.passed += 1;
        else if (result === "failed") row.failed += 1;
        else if (result === "blocked") row.blocked += 1;
        else if (result === "in progress") row.inProg += 1;
        else row.notExec += 1;
      }
      const aggregated = Object.values(moduleMap);
      if (aggregated.length > 0) {
        await db.delete(executionSummariesTable).where(eq(executionSummariesTable.redmineTicketId, ticketId));
        await db.insert(executionSummariesTable).values(
          aggregated.map((row) => ({
            redmineTicketId: ticketId,
            module: row.module,
            total: row.total,
            passed: row.passed,
            failed: row.failed,
            blocked: row.blocked,
            inProgress: row.inProg,
            notExecuted: row.notExec,
          })),
        );
      }

      // 6. Trigger live update to dashboard
      broadcastUpdate(ticketId);

      res.json({
        success: true,
        count: allTcRows.length,
        newUpdatedAt: updatedFile.updatedAt,
        // Only newly inserted rows are returned — the client needs their real DB IDs
        testCases: insertedRows.map((t) => ({
          id: t.id,
          testCaseId: t.testCaseId,
          libraryTcId: t.libraryTcId,
          rowOrder: t.rowOrder,
          _tempId: t._tempId,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to save test cases" });
    }
  },
);

/* ────────────────────────────────
   DOWNLOAD — template-based Excel (same as Send Verdict)
   ──────────────────────────────── */

router.get("/execution-files/:ticketId/download-excel", async (req, res): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { issueType, issueSubject, senderName, projectName } = req.query as Record<string, string>;

    const [file] = await db
      .select()
      .from(executionFilesTable)
      .where(eq(executionFilesTable.redmineTicketId, ticketId));

    const testCases = file
      ? await db
          .select()
          .from(executionTestCasesTable)
          .where(eq(executionTestCasesTable.executionFileId, file.id))
          .orderBy(executionTestCasesTable.rowOrder)
      : [];

    // CR002: fetch active defects for Pareto Analysis + CAPA auto-population
    const activeDefects = await fetchActiveDefectsForIssue(ticketId);

    // CR003: fetch audit entries for Doc Info
    const auditRows = file
      ? await db
          .select()
          .from(executionFileAuditTable)
          .where(eq(executionFileAuditTable.executionFileId, file.id))
          .orderBy(executionFileAuditTable.createdAt)
          .catch(() => [] as any[])
      : [];

    const typeLabel = issueType || "Issue";

    // CR006: AI-generated CAPA items
    const capaItems = await runCapaAI(ticketId, testCases);

    const buffer = await buildTestCaseExcel(testCases, {
      redmineId: ticketId,
      issueType: typeLabel,
      issueSubject: issueSubject || file?.title || "",
      senderName: senderName || undefined,
      activeDefects,
      capaItems: capaItems.length > 0 ? capaItems : undefined,
      auditEntries: auditRows.map((a: any) => ({
        summary: a.summary,
        updatedByName: a.updatedByName ?? null,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
        tcCount: a.tcCount ?? 0,
      })),
    });

    if (!buffer) {
      res.status(500).json({ error: "Failed to build Excel file. Template may be unavailable." });
      return;
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const tracker = (issueType || typeLabel).replace(/[^a-zA-Z0-9]/g, "");
    const proj = (projectName || "").replace(/[^a-zA-Z0-9]/g, "");
    const filename = proj
      ? `${date}.${proj}_${tracker}_${ticketId}.xlsx`
      : `${date}.${tracker}_${ticketId}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch {
    res.status(500).json({ error: "Failed to download execution file" });
  }
});

export default router;