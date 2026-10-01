import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  db,
  rolesTable,
  usersTable,
  aiGlobalSettingsTable,
  aiFeatureSettingsTable,
  aiUsageLogTable,
} from "@workspace/db";
import { getAuthContext } from "../middleware/access";
import { logActivity } from "./_audit";
import {
  AI_FEATURES,
  DEFAULT_GLOBAL,
  invalidateAiSettingsCache,
  loadAiSettings,
  parseRoles,
  type AiFeature,
  type AiFeatureMeta,
} from "../lib/ai-guard";

const router: IRouter = Router();

// AI controls change what the whole team can spend and do, so they are for
// administrators only — not for anyone who merely manages a project.
function requireAiAdmin(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (ctx.role !== "admin" && ctx.role !== "cto") {
    res.status(403).json({ error: "Only an administrator can manage AI controls" }); return null;
  }
  return ctx;
}

function isFeature(name: string): name is AiFeature {
  return Object.prototype.hasOwnProperty.call(AI_FEATURES, name);
}

function parseCap(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) return undefined;
  return n;
}

// GET /ai/controls — everything the admin screen needs in one call.
router.get("/ai/controls", async (req, res): Promise<void> => {
  const ctx = requireAiAdmin(req, res);
  if (!ctx) return;
  try {
    const settings = await loadAiSettings();
    const roles = await db.select({ name: rolesTable.name }).from(rolesTable);

    const features = (Object.keys(AI_FEATURES) as AiFeature[]).map((feature) => {
      const meta = AI_FEATURES[feature] as AiFeatureMeta;
      const override = settings.features.get(feature);
      return {
        feature,
        label: meta.label,
        description: meta.description,
        writes: meta.writes === true,
        enabled: override?.enabled ?? true,
        allowedRoles: override ? override.allowedRoles : null,
        defaultRoles: meta.defaultRoles ?? null,
        dailyCapPerUser: override?.dailyCapPerUser ?? null,
        separateDailyCap: meta.separateDailyCap ?? null,
      };
    });

    res.json({
      global: settings.global,
      defaults: DEFAULT_GLOBAL,
      features,
      roles: roles.map((r) => r.name).sort(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load AI controls" });
  }
});

// PUT /ai/controls/global — kill switch and the per-user caps.
router.put("/ai/controls/global", async (req, res): Promise<void> => {
  const ctx = requireAiAdmin(req, res);
  if (!ctx) return;
  try {
    const cur = (await loadAiSettings()).global;
    const body = req.body ?? {};
    const next = { ...cur };

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") { res.status(400).json({ error: "enabled must be true or false" }); return; }
      next.enabled = body.enabled;
    }
    for (const key of ["dailyCapPerUser", "hourlyCapPerUser"] as const) {
      if (body[key] === undefined) continue;
      const cap = parseCap(body[key]);
      if (cap == null) { res.status(400).json({ error: `${key} must be a whole number between 0 and 100000` }); return; }
      next[key] = cap;
    }

    await db.insert(aiGlobalSettingsTable)
      .values({ id: 1, ...next, updatedBy: ctx.userId })
      .onConflictDoUpdate({ target: aiGlobalSettingsTable.id, set: { ...next, updatedBy: ctx.userId, updatedAt: new Date() } });
    invalidateAiSettingsCache();

    await logActivity({
      type: "ai_controls_updated",
      description: `AI global settings changed${next.enabled !== cur.enabled ? ` — AI turned ${next.enabled ? "on" : "off"}` : ""}`,
      userId: ctx.userId,
      entityId: 1,
      entityType: "ai_controls",
      oldValue: cur,
      newValue: next,
    });
    res.json(next);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update AI settings" });
  }
});

// PUT /ai/controls/features/:feature — on/off, allowed roles, daily cap.
router.put("/ai/controls/features/:feature", async (req, res): Promise<void> => {
  const ctx = requireAiAdmin(req, res);
  if (!ctx) return;
  const feature = req.params.feature;
  if (!isFeature(feature)) { res.status(404).json({ error: "Unknown AI feature" }); return; }
  try {
    const settings = await loadAiSettings();
    const cur = settings.features.get(feature) ?? { enabled: true, allowedRoles: null, dailyCapPerUser: null };
    const body = req.body ?? {};
    const next = { ...cur };

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") { res.status(400).json({ error: "enabled must be true or false" }); return; }
      next.enabled = body.enabled;
    }
    if (body.allowedRoles !== undefined) {
      if (body.allowedRoles === null) {
        next.allowedRoles = null;
      } else if (Array.isArray(body.allowedRoles) && body.allowedRoles.every((r: unknown) => typeof r === "string")) {
        const known = new Set((await db.select({ name: rolesTable.name }).from(rolesTable)).map((r) => r.name));
        const unknown = body.allowedRoles.filter((r: string) => !known.has(r));
        if (unknown.length > 0) { res.status(400).json({ error: `Unknown role: ${unknown.join(", ")}` }); return; }
        next.allowedRoles = body.allowedRoles.length > 0 ? body.allowedRoles : null;
      } else {
        res.status(400).json({ error: "allowedRoles must be a list of role names, or null for any role" }); return;
      }
    }
    if (body.dailyCapPerUser !== undefined) {
      const cap = parseCap(body.dailyCapPerUser);
      if (cap === undefined) { res.status(400).json({ error: "dailyCapPerUser must be a whole number, or null to use the global cap" }); return; }
      next.dailyCapPerUser = cap;
    }

    const row = {
      enabled: next.enabled,
      allowedRoles: next.allowedRoles ? next.allowedRoles.join(",") : null,
      dailyCapPerUser: next.dailyCapPerUser,
      updatedBy: ctx.userId,
    };
    await db.insert(aiFeatureSettingsTable)
      .values({ feature, ...row })
      .onConflictDoUpdate({ target: aiFeatureSettingsTable.feature, set: { ...row, updatedAt: new Date() } });
    invalidateAiSettingsCache();

    await logActivity({
      type: "ai_controls_updated",
      description: `AI feature "${(AI_FEATURES[feature] as AiFeatureMeta).label}" settings changed${next.enabled !== cur.enabled ? ` — turned ${next.enabled ? "on" : "off"}` : ""}`,
      userId: ctx.userId,
      entityId: null as any,
      entityType: "ai_controls",
      oldValue: cur,
      newValue: next,
    });
    res.json({ feature, ...next });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update AI feature" });
  }
});

// GET /ai/controls/usage?days=7 — who is using what, and what was blocked.
router.get("/ai/controls/usage", async (req, res): Promise<void> => {
  const ctx = requireAiAdmin(req, res);
  if (!ctx) return;
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "7"), 10) || 7, 1), 90);
    const since = new Date(Date.now() - days * 86_400_000);
    const inWindow = gte(aiUsageLogTable.createdAt, since);

    const byFeature = await db
      .select({
        feature: aiUsageLogTable.feature,
        ok: sql<number>`count(*) filter (where ${aiUsageLogTable.status} = 'ok')::int`,
        error: sql<number>`count(*) filter (where ${aiUsageLogTable.status} = 'error')::int`,
        cached: sql<number>`count(*) filter (where ${aiUsageLogTable.status} = 'cached')::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsageLogTable.status} = 'blocked')::int`,
      })
      .from(aiUsageLogTable)
      .where(inWindow)
      .groupBy(aiUsageLogTable.feature);

    const byUser = await db
      .select({
        userId: aiUsageLogTable.userId,
        name: usersTable.name,
        calls: sql<number>`count(*) filter (where ${aiUsageLogTable.status} in ('ok', 'error'))::int`,
        blocked: sql<number>`count(*) filter (where ${aiUsageLogTable.status} = 'blocked')::int`,
      })
      .from(aiUsageLogTable)
      .leftJoin(usersTable, eq(usersTable.id, aiUsageLogTable.userId))
      .where(inWindow)
      .groupBy(aiUsageLogTable.userId, usersTable.name)
      .orderBy(desc(sql`count(*)`))
      .limit(25);

    const recent = await db
      .select({
        id: aiUsageLogTable.id,
        feature: aiUsageLogTable.feature,
        status: aiUsageLogTable.status,
        blockedReason: aiUsageLogTable.blockedReason,
        userName: usersTable.name,
        inputChars: aiUsageLogTable.inputChars,
        durationMs: aiUsageLogTable.durationMs,
        createdAt: aiUsageLogTable.createdAt,
      })
      .from(aiUsageLogTable)
      .leftJoin(usersTable, eq(usersTable.id, aiUsageLogTable.userId))
      .where(and(inWindow))
      .orderBy(desc(aiUsageLogTable.createdAt), desc(aiUsageLogTable.id))
      .limit(50);

    res.json({
      days,
      byFeature: byFeature.map((f) => ({
        ...f,
        label: isFeature(f.feature) ? (AI_FEATURES[f.feature] as AiFeatureMeta).label : f.feature,
      })),
      byUser: byUser.map((u) => ({ ...u, name: u.name ?? "Unknown" })),
      recent: recent.map((r) => ({
        ...r,
        userName: r.userName ?? "Unknown",
        label: isFeature(r.feature) ? (AI_FEATURES[r.feature] as AiFeatureMeta).label : r.feature,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load AI usage" });
  }
});

export default router;
