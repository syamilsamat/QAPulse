import { Router } from "express";
import { pool } from "@workspace/db";
import { getAuthContext } from "../middleware/access";

// Read current role and grants in the same statement as the feed. Errors must
// propagate: the legacy project helper's bootstrap fallback is unrestricted.
export const activityScopeSql = `WITH actor AS (
  SELECT u.id, u.role, COALESCE(r.tier_rank, 1) AS tier, r.department
  FROM users u LEFT JOIN roles r ON r.name = u.role WHERE u.id = $1
), scope AS (
  SELECT p.id, p.name, a.tier, a.department, a.role,
    CASE WHEN a.role = 'admin' OR a.tier >= 3 THEN NULL::integer[]
      ELSE COALESCE(pm.module_ids, ARRAY[pm.module_id]::integer[]) END AS modules
  FROM projects p CROSS JOIN actor a
  LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = a.id
  WHERE a.role = 'admin' OR a.tier >= 5 OR pm.user_id IS NOT NULL
    OR (a.tier >= 3 AND a.department IS NOT NULL AND EXISTS (
      SELECT 1 FROM project_members m JOIN users u ON u.id = m.user_id
      JOIN roles r ON r.name = u.role
      WHERE m.project_id = p.id AND r.department = a.department))
), members AS (
  SELECT DISTINCT u.id, u.name FROM users u CROSS JOIN actor a
  LEFT JOIN roles r ON r.name = u.role
  WHERE u.id = a.id OR ((a.role = 'admin' OR a.tier >= 2) AND
    (a.role = 'admin' OR a.tier >= 5 OR a.department = 'pm' OR r.department = a.department)
    AND EXISTS (SELECT 1 FROM project_members m JOIN scope s ON s.id = m.project_id
      WHERE m.user_id = u.id AND ($2::integer IS NULL OR s.id = $2)))
)`;

// Explicit resource mapping prevents old/new audit payloads from granting access.
// Deleted and unresolvable resources remain available only through audit history.
const resourcesSql = `, resources AS (
  SELECT 'requirement' AS kind, id, project_id, title, ARRAY[module]::text[] AS modules,
    '/requirements/' || id AS href FROM requirements
  UNION ALL SELECT 'test_case', id, project_id, title, ARRAY[module],
    '/test-cases?projectId=' || project_id || '&highlight=' || id FROM test_cases
  UNION ALL SELECT 'defect', id, project_id, title, ARRAY[module],
    '/defects?highlight=' || id || '&tab=' || CASE WHEN source IN ('production', 'other', 'requirement') THEN source ELSE 'qa' END FROM defects
  UNION ALL SELECT 'milestone', id, project_id, name, NULL::text[],
    '/milestones?projectId=' || project_id || '&highlight=' || id FROM milestones
  UNION ALL SELECT 'task', t.id, t.project_id, t.name,
    ARRAY(SELECT m.name FROM execution_modules m WHERE m.id = t.module_id
      OR m.id::text = ANY(string_to_array(COALESCE(t.module_ids, ''), ','))),
    CASE WHEN t.requirement_id IS NOT NULL THEN '/requirements/' || t.requirement_id ELSE '/tasks' END FROM tasks t
  UNION ALL SELECT 'risk', id, project_id, title, NULL::text[],
    '/risk-register?projectId=' || project_id FROM risks
  UNION ALL SELECT k.kind, f.id, f.project_id, COALESCE(f.title, f.redmine_ticket_id),
    CASE WHEN cardinality(f.selected_module_ids) > 0 THEN
      ARRAY(SELECT m.name FROM execution_modules m WHERE m.id = ANY(f.selected_module_ids))
      ELSE string_to_array(f.selected_modules, ',') END,
    '/test-cases/execution/' || f.redmine_ticket_id FROM execution_files f
    CROSS JOIN (VALUES ('execution'), ('execution_file')) k(kind)
  UNION ALL SELECT 'execution_test_case', t.id, f.project_id, COALESCE(t.case_name, f.title),
    ARRAY[t.module_name], '/test-cases/execution/' || f.redmine_ticket_id
    FROM execution_test_cases t JOIN execution_files f ON f.id = t.execution_file_id
)`;

export function parseActivityQuery(query: Record<string, unknown>) {
  const positive = (value: unknown, name: string) => {
    if (value === undefined) return null;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) throw new Error(`Invalid ${name}`);
    return Number(value);
  };
  const limit = positive(query.limit, 'limit') ?? 20;
  if (limit > 100) throw new Error('Limit must be between 1 and 100');
  let cursor: { time: string; id: number } | null = null;
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string' || query.cursor.length > 256) throw new Error('Invalid cursor');
    try {
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
      if (!cursor || typeof cursor.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.time)
        || !Number.isFinite(Date.parse(cursor.time)) || !Number.isSafeInteger(cursor.id) || cursor.id < 1) throw new Error();
    } catch { throw new Error('Invalid cursor'); }
  }
  return { limit, projectId: positive(query.projectId, 'projectId'), userId: positive(query.userId, 'userId'), cursor };
}

export function presentActivity(row: any) {
  // Never expose audit description/old/new values: these can contain review notes.
  const action = String(row.type).replace(/_/g, ' ');
  const cursor = Buffer.from(JSON.stringify({ time: row.cursor_time, id: row.id })).toString('base64url');
  return { id: row.id, type: row.type, description: `${action} · ${row.title ?? 'Work item'}`,
    userId: row.user_id, userName: row.user_name, entityId: row.entity_id, entityType: row.entity_type,
    createdAt: row.created_at, projectId: row.project_id, projectName: row.project_name,
    href: row.href?.startsWith('/test-cases/execution/')
      ? '/test-cases/execution/' + encodeURIComponent(row.href.slice('/test-cases/execution/'.length)) : row.href,
    cursor };
}

const router = Router();
router.get(['/dashboard/activity', '/dashboard/activity/options'], async (req, res) => {
  const auth = getAuthContext(req);
  if (!auth) { res.status(401).json({ error: 'Unauthorized' }); return; }
  let params: ReturnType<typeof parseActivityQuery>;
  try { params = parseActivityQuery(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  try {
    const { rows: [options] } = await pool.query(`${activityScopeSql}
      SELECT COALESCE((SELECT json_agg(p ORDER BY p.name) FROM (SELECT id, name FROM scope) p), '[]') AS projects,
        COALESCE((SELECT json_agg(m ORDER BY m.name) FROM members m), '[]') AS members`, [auth.userId, params.projectId]);
    if (params.projectId && !options.projects.some((p: any) => p.id === params.projectId)) {
      res.status(403).json({ error: 'Project access denied' }); return;
    }
    if (params.userId && !options.members.some((u: any) => u.id === params.userId)) {
      res.status(403).json({ error: 'Member filter access denied' }); return;
    }
    if (req.path.endsWith('/options')) { res.json(options); return; }
    const { rows } = await pool.query(`${activityScopeSql}${resourcesSql}
      SELECT a.id, a.type, a.user_id, u.name AS user_name, a.entity_id, a.entity_type,
        a.created_at, to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
        r.title, r.href, r.project_id, s.name AS project_name
      FROM activity a JOIN resources r ON r.kind = a.entity_type AND r.id = a.entity_id
      JOIN scope s ON s.id = r.project_id LEFT JOIN users u ON u.id = a.user_id
      WHERE a.type NOT IN ('user_login', 'user_logout')
        AND ($2::integer IS NULL OR r.project_id = $2)
        AND ($3::integer IS NULL OR (a.user_id = $3 AND EXISTS (SELECT 1 FROM members WHERE id = $3)))
        AND (s.modules IS NULL OR cardinality(array_remove(s.modules, NULL)) = 0
          OR (cardinality(r.modules) > 0 AND NOT EXISTS (
            SELECT 1 FROM unnest(r.modules) rm(name) WHERE rm.name IS NULL OR NOT EXISTS (
              SELECT 1 FROM execution_modules em WHERE em.id = ANY(s.modules) AND em.name = trim(rm.name)))))
        AND ($4::timestamptz IS NULL OR (a.created_at, a.id) < ($4::timestamptz, $5::integer))
      ORDER BY a.created_at DESC, a.id DESC LIMIT $6`,
      [auth.userId, params.projectId, params.userId, params.cursor?.time ?? null, params.cursor?.id ?? null, params.limit]);
    res.json(rows.map(presentActivity));
  } catch (error) {
    console.error('Recent activity unavailable', error);
    res.status(503).json({ error: 'Recent activity is temporarily unavailable. Please retry.' });
  }
});
export default router;
