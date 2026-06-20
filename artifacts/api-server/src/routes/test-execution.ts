import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  executionFilesTable,
  executionModulesTable,
  executionTestCasesTable,
  executionSummariesTable,
} from "@workspace/db";

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
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch execution files" });
  }
});

// Returns aggregated execution progress per redmine ticket ID
router.get("/execution-progress", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(executionSummariesTable);
    const agg: Record<string, { total: number; notExecuted: number }> = {};
    for (const row of rows) {
      if (!agg[row.redmineTicketId]) agg[row.redmineTicketId] = { total: 0, notExecuted: 0 };
      agg[row.redmineTicketId].total += row.total;
      agg[row.redmineTicketId].notExecuted += row.notExecuted;
    }
    const result: Record<string, { total: number; executed: number; overallPct: number }> = {};
    for (const [ticketId, { total, notExecuted }] of Object.entries(agg)) {
      const executed = total - notExecuted;
      result[ticketId] = { total, executed, overallPct: total > 0 ? Math.round((executed / total) * 100) : 0 };
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to fetch execution progress" });
  }
});

router.post("/execution-files", async (req, res): Promise<void> => {
  try {
    const { redmineTicketId, title, qaPic, remarks, selectedModules } = req.body;
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
      })
      .returning();
    res.status(201).json({
      id: file.id,
      redmineTicketId: file.redmineTicketId,
      title: file.title,
      qaPic: file.qaPic,
      remarks: file.remarks,
      selectedModules: file.selectedModules,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  } catch {
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
    const { selectedModules } = req.body;
    const [updated] = await db
      .update(executionFilesTable)
      .set({ selectedModules: selectedModules || null })
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
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch {
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
          userStory: t.userStory,
          tracker: (t as any).tracker, // <-- Added Tracker payload
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
      const { testCases, lastUpdatedAt } = req.body;
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

      // CONCURRENCY CHECK: Compare timestamps
      if (
        lastUpdatedAt &&
        new Date(file.updatedAt).getTime() > new Date(lastUpdatedAt).getTime()
      ) {
        res.status(409).json({
          error: "Conflict",
          message:
            "Another user has updated this file since you opened it. Please refresh to see their changes.",
        });
        return;
      }

      // 1. Delete existing
      await db
        .delete(executionTestCasesTable)
        .where(eq(executionTestCasesTable.executionFileId, file.id));

      // 2. Insert new
      if (testCases.length > 0) {
        await db.insert(executionTestCasesTable).values(
          testCases.map((t: any, idx: number) => ({
            executionFileId: file.id,
            moduleName: t.moduleName || null,
            caseId: t.caseId || null,
            userStory: t.userStory || null,
            tracker: t.tracker || null, // <-- Saved to database
            scenario: t.scenario || null,
            preCondition: t.preCondition || null,
            caseName: t.caseName || null,
            testSteps: t.testSteps || null,
            testData: t.testData || null,
            expectedResult: t.expectedResult || null,
            result: t.result || null,
            actualResult: t.actualResult || null,
            defectNumber: t.defectNumber || null,
            defectScreenshots: t.defectScreenshots || null,
            comments: t.comments || null,
            qaPic: t.qaPic || null,
            rowOrder: t.rowOrder ?? idx,
          })),
        );
      }

      // 3. Update the file's updatedAt timestamp
      const [updatedFile] = await db
        .update(executionFilesTable)
        .set({ updatedAt: new Date() })
        .where(eq(executionFilesTable.id, file.id))
        .returning();

      // 4. Auto-aggregate by module and save to PMO (so Load button is not required)
      const moduleMap: Record<string, { module: string; total: number; passed: number; failed: number; blocked: number; inProg: number; notExec: number }> = {};
      for (const tc of testCases) {
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

      // 5. Trigger live update to dashboard
      broadcastUpdate(ticketId);

      res.json({
        success: true,
        count: testCases.length,
        newUpdatedAt: updatedFile.updatedAt,
      });
    } catch {
      res.status(500).json({ error: "Failed to save test cases" });
    }
  },
);

export default router;