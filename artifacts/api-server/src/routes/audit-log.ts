import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { verifyToken } from "./auth";

const router: IRouter = Router();

// CR011: Audit Log is admin-only — nav-gated in Layout, route-gated here
function requireAdmin(req: any, res: any): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  try {
    const { role } = verifyToken(authHeader.slice(7));
    if (role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
}

// Merged audit feed: activity rows + execution_tc_history mapped to the same
// Old/New shape (CR011 P2 — surface, don't double-write).
router.get("/audit-log", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  const add = (clause: string, value: any) => {
    params.push(value);
    conditions.push(clause.replace("?", `$${params.length}`));
  };

  if (typeof req.query.entityType === "string" && req.query.entityType) {
    add("merged.entity_type = ?", req.query.entityType);
  }
  if (req.query.userId && !isNaN(Number(req.query.userId))) {
    add("merged.user_id = ?", Number(req.query.userId));
  }
  if (typeof req.query.type === "string" && req.query.type) {
    add("merged.type = ?", req.query.type);
  }
  if (typeof req.query.startDate === "string" && req.query.startDate) {
    add("merged.created_at >= ?", new Date(req.query.startDate));
  }
  if (typeof req.query.endDate === "string" && req.query.endDate) {
    // inclusive end of day when a bare date is passed
    const end = new Date(req.query.endDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate)) end.setHours(23, 59, 59, 999);
    add("merged.created_at <= ?", end);
  }
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    add("merged.description ILIKE ?", `%${req.query.search.trim()}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const mergedSql = `
    SELECT 'activity' AS source, a.id, a.type, a.description,
           a.user_id, a.entity_id, a.entity_type,
           a.old_value, a.new_value, a.created_at
    FROM activity a
    UNION ALL
    SELECT 'execution_history' AS source, h.id, 'execution_result_changed',
           'TC ' || h.test_case_id || ' result changed'
             || COALESCE(' in "' || f.title || '"', ' in file #' || h.execution_file_id),
           h.changed_by, h.execution_file_id, 'execution',
           json_build_object('result', h.from_status)::text,
           json_build_object('result', h.to_status)::text,
           h.changed_at
    FROM execution_tc_history h
    LEFT JOIN execution_files f ON f.id = h.execution_file_id
  `;

  try {
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM (${mergedSql}) merged ${where}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rowsResult = await pool.query(
      `SELECT merged.*, u.name AS actor_name
       FROM (${mergedSql}) merged
       LEFT JOIN users u ON u.id = merged.user_id
       ${where}
       ORDER BY merged.created_at DESC, merged.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    res.json({
      total,
      page,
      limit,
      entries: rowsResult.rows.map((r: any) => ({
        id: `${r.source}-${r.id}`,
        source: r.source,
        type: r.type,
        description: r.description,
        userId: r.user_id,
        actorName: r.actor_name ?? null,
        entityId: r.entity_id,
        entityType: r.entity_type,
        oldValue: r.old_value ?? null,
        newValue: r.new_value ?? null,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    });
  } catch (err: any) {
    console.error("[GET /audit-log]", err);
    res.status(500).json({ error: err?.message ?? "Failed to load audit log" });
  }
});

export default router;
