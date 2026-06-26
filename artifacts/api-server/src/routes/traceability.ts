import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/traceability", async (req, res): Promise<void> => {
  try {
    const { projectId, module, status } = req.query;

    let whereClause = "WHERE r.parent_id IS NULL";
    const params: any[] = [];
    let idx = 1;

    if (projectId) {
      whereClause += ` AND r.project_id = $${idx++}`;
      params.push(Number(projectId));
    }
    if (module) {
      whereClause += ` AND r.module = $${idx++}`;
      params.push(module);
    }

    const { rows } = await pool.query(
      `
      SELECT
        r.id                  AS req_id,
        r.redmine_ticket_id   AS req_redmine_id,
        r.title               AS req_title,
        r.module              AS req_module,
        r.project_id          AS project_id,
        p.name                AS project_name,
        r.status              AS req_status,
        tc.id                 AS tc_id,
        tc.case_id            AS tc_case_id,
        etc.test_case_id      AS etc_case_id,
        tc.title              AS tc_title,
        etc.result      AS result,
        etc.defect_number AS defect_number,
        etc.executed_at   AS executed_at
      FROM requirements r
      LEFT JOIN projects p         ON p.id = r.project_id
      LEFT JOIN test_cases tc      ON tc.requirement_id = r.id
      LEFT JOIN execution_test_cases etc ON etc.library_tc_id = tc.id
      ${whereClause}
      ORDER BY r.id, tc.id
      `,
      params
    );

    // Group flat rows into requirements → test cases
    const reqMap = new Map<
      number,
      {
        reqId: number;
        reqRedmineId: string | null;
        reqTitle: string;
        reqModule: string | null;
        projectId: number | null;
        projectName: string | null;
        reqStatus: string | null;
        testCases: {
          tcId: number;
          tcCaseId: string | null;
          etcCaseId: string | null;
          tcTitle: string | null;
          results: { result: string | null; defectNumber: string | null; executedAt: string | null }[];
        }[];
      }
    >();

    for (const row of rows) {
      if (!reqMap.has(row.req_id)) {
        reqMap.set(row.req_id, {
          reqId: row.req_id,
          reqRedmineId: row.req_redmine_id ?? null,
          reqTitle: row.req_title,
          reqModule: row.req_module,
          projectId: row.project_id,
          projectName: row.project_name ?? null,
          reqStatus: row.req_status,
          testCases: [],
        });
      }
      const req = reqMap.get(row.req_id)!;

      if (!row.tc_id) continue;

      let tc = req.testCases.find((t) => t.tcId === row.tc_id);
      if (!tc) {
        tc = { tcId: row.tc_id, tcCaseId: row.tc_case_id, etcCaseId: row.etc_case_id ?? null, tcTitle: row.tc_title, results: [] };
        req.testCases.push(tc);
      }

      if (row.result !== undefined) {
        tc.results.push({
          result: row.result,
          defectNumber: row.defect_number,
          executedAt: row.executed_at ? new Date(row.executed_at).toISOString() : null,
        });
      }
    }

    // Compute summary per requirement
    const result = Array.from(reqMap.values()).map((req) => {
      const tcCount = req.testCases.length;
      let passed = 0, failed = 0, blocked = 0, notRun = 0;

      for (const tc of req.testCases) {
        const latestResult = tc.results[tc.results.length - 1]?.result?.toLowerCase() ?? null;
        if (!latestResult || latestResult === "not executed" || latestResult === "not run") notRun++;
        else if (latestResult === "passed" || latestResult === "pass") passed++;
        else if (latestResult === "failed" || latestResult === "fail") failed++;
        else if (latestResult === "blocked") blocked++;
        else notRun++;
      }

      const coveragePct = tcCount > 0 ? Math.round((passed / tcCount) * 100) : 0;

      let overallStatus: string;
      if (tcCount === 0) overallStatus = "no-tcs";
      else if (failed > 0) overallStatus = "failing";
      else if (blocked > 0) overallStatus = "blocked";
      else if (notRun === tcCount) overallStatus = "not-run";
      else if (passed === tcCount) overallStatus = "passed";
      else overallStatus = "in-progress";

      return {
        reqId: req.reqId,
        reqRedmineId: req.reqRedmineId,
        reqTitle: req.reqTitle,
        reqModule: req.reqModule,
        projectId: req.projectId,
        projectName: req.projectName,
        reqStatus: req.reqStatus,
        tcCount,
        passed,
        failed,
        blocked,
        notRun,
        coveragePct,
        overallStatus,
        testCases: req.testCases.map(tc => ({
          ...tc,
          displayCaseId: tc.etcCaseId ?? tc.tcCaseId ?? `#${tc.tcId}`,
        })),
      };
    });

    // Apply status filter after aggregation
    const filtered =
      status && status !== "all"
        ? result.filter((r) => r.overallStatus === status)
        : result;

    res.json(filtered);
  } catch (err: any) {
    console.error("[GET /traceability]", err);
    res.status(500).json({ error: err?.message ?? "Failed to fetch traceability data" });
  }
});

export default router;
