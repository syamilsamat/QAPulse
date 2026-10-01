import type { Request, Response, NextFunction, RequestHandler } from "express";
import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  aiGlobalSettingsTable,
  aiFeatureSettingsTable,
  aiUsageLogTable,
  milestonesTable,
  requirementsTable,
} from "@workspace/db";
import { getAuthContext, canAccessProject } from "../middleware/access";

/**
 * Single choke point for everything that spends AI quota. Every /ai route that
 * calls a model goes through aiGuard(feature), which in order:
 *   1. requires a signed-in user,
 *   2. honours the admin kill switch and the per-feature switch,
 *   3. checks the caller's role against the feature's allowed roles,
 *   4. checks the caller can access the project the request is about,
 *   5. enforces the hourly / daily per-user caps,
 *   6. records the attempt (allowed or blocked) in ai_usage_log.
 * New AI routes get all of that by adding one middleware, so none can forget it.
 */

export type AiFeatureMeta = {
  label: string;
  description: string;
  // True when the feature changes stored data once confirmed — shown as a
  // badge on the admin screen so the sensitive ones are easy to find.
  writes?: boolean;
  // Roles allowed when no admin override exists. null = any signed-in role.
  defaultRoles?: string[] | null;
  // Metered on its own: counts toward neither the global hourly nor daily cap,
  // and is limited to this many calls per user per day instead (an admin can
  // override it per feature). For high-frequency features like autocomplete
  // that would otherwise exhaust the shared cap in minutes.
  separateDailyCap?: number;
};

const QA_ROLES = ["qa_member", "qa_lead", "qa_manager", "hod_qa"];

export const AI_FEATURES = {
  "rephrase-suggestion": { label: "Rephrase requirement", description: "Suggests clearer wording for a requirement." },
  "analyze-requirement": { label: "Analyze requirement", description: "Scores a requirement and lists gaps and questions." },
  "edge-cases": { label: "Edge cases", description: "Suggests edge cases for a requirement." },
  "duplicate-detection": { label: "Duplicate detection", description: "Finds likely duplicate requirements." },
  "weekly-summary": { label: "Weekly summary", description: "Summarises the week's activity." },
  "coverage-gap": { label: "Coverage gap", description: "Finds requirements with thin test coverage." },
  "risk-score": { label: "Risk score", description: "Scores project or release risk." },
  "release-readiness": { label: "Release readiness", description: "Assesses whether a release is ready." },
  "chat": { label: "General chat", description: "Free-form assistant chat." },
  "autocomplete": { label: "Inline autocomplete", description: "Suggests the next few words while a tester types a test case.", separateDailyCap: 300 },
  "test-data": { label: "Test data", description: "Generates sample test data." },
  "regression-selection": { label: "Regression selection", description: "Picks test cases for a regression run." },
  "natural-language-search": { label: "Natural-language search", description: "Searches in plain English." },
  "capa-analysis": { label: "CAPA analysis", description: "Suggests corrective and preventive actions." },
  "search-tcs": { label: "Search test cases", description: "AI-assisted test case search." },
  "milestone-risk": { label: "Milestone risk", description: "Assesses risk for a milestone." },
  "execution-risk": { label: "Execution risk", description: "Assesses risk on an execution run." },
  "requirement-chat": { label: "Requirement chat", description: "Chat about one requirement." },
  "generate-bdd-test-cases": { label: "Generate BDD test cases", description: "Drafts test cases from Gherkin; saved only when a user confirms." },
  "generate-release-notes": { label: "Release notes", description: "Drafts release notes." },
  "tag-risk-priority": { label: "Suggest risk priorities", description: "Proposes a priority for each test case. Nothing is saved until a QA user applies it." },
  "tag-risk-priority-apply": {
    label: "Apply risk priorities",
    description: "Writes confirmed priorities onto test cases.",
    writes: true,
    defaultRoles: QA_ROLES,
  },
} as const satisfies Record<string, AiFeatureMeta>;

export type AiFeature = keyof typeof AI_FEATURES;

export const DEFAULT_GLOBAL = { enabled: true, dailyCapPerUser: 100, hourlyCapPerUser: 30 };

// ── settings cache ────────────────────────────────────────────────────────
// Read on every AI call, changed rarely from the admin screen (which calls
// invalidateAiSettingsCache), so a short TTL is only a backstop.
type Settings = {
  global: { enabled: boolean; dailyCapPerUser: number; hourlyCapPerUser: number };
  features: Map<string, { enabled: boolean; allowedRoles: string[] | null; dailyCapPerUser: number | null }>;
};
let cache: { at: number; value: Settings } | null = null;
const CACHE_TTL_MS = 15_000;

export function invalidateAiSettingsCache(): void {
  cache = null;
}

export function parseRoles(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  const list = raw.split(",").map((r) => r.trim()).filter(Boolean);
  return list.length > 0 ? list : null;
}

export async function loadAiSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const [g] = await db.select().from(aiGlobalSettingsTable).where(eq(aiGlobalSettingsTable.id, 1));
  const rows = await db.select().from(aiFeatureSettingsTable);
  const value: Settings = {
    global: g
      ? { enabled: g.enabled, dailyCapPerUser: g.dailyCapPerUser, hourlyCapPerUser: g.hourlyCapPerUser }
      : { ...DEFAULT_GLOBAL },
    features: new Map(
      rows.map((r) => [r.feature, { enabled: r.enabled, allowedRoles: parseRoles(r.allowedRoles), dailyCapPerUser: r.dailyCapPerUser }]),
    ),
  };
  cache = { at: Date.now(), value };
  return value;
}

// ── project resolution ────────────────────────────────────────────────────
// Works out which project a request is about so the guard can check access
// without every route re-implementing it. Unknown → null (no project check).
async function resolveProjectId(req: Request): Promise<number | null> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

  const projectId = num(body.projectId) ?? num(req.query.projectId) ?? num(req.params.projectId);
  if (projectId) return projectId;

  const milestoneId = num(body.milestoneId) ?? num(req.params.milestoneId);
  if (milestoneId) {
    const [m] = await db.select({ projectId: milestonesTable.projectId }).from(milestonesTable).where(eq(milestonesTable.id, milestoneId));
    if (m) return m.projectId;
  }
  const requirementId = num(body.requirementId);
  if (requirementId) {
    const [r] = await db.select({ projectId: requirementsTable.projectId }).from(requirementsTable).where(eq(requirementsTable.id, requirementId));
    if (r?.projectId != null) return r.projectId;
  }
  return null;
}

function inputSize(body: unknown): number | null {
  try {
    return JSON.stringify(body ?? {}).length;
  } catch {
    return null;
  }
}

type BlockReason = "ai_disabled" | "feature_disabled" | "role" | "access" | "daily_cap" | "hourly_cap";

const BLOCK_MESSAGE: Record<BlockReason, { status: number; error: string }> = {
  ai_disabled: { status: 403, error: "AI features are currently turned off by an administrator." },
  feature_disabled: { status: 403, error: "This AI feature is currently turned off by an administrator." },
  role: { status: 403, error: "Your role is not allowed to use this AI feature." },
  access: { status: 403, error: "Access denied to this project." },
  daily_cap: { status: 429, error: "You've reached today's AI usage limit. Try again tomorrow or ask an administrator." },
  hourly_cap: { status: 429, error: "You're using AI too quickly. Wait a little and try again." },
};

export function aiGuard(feature: AiFeature): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = getAuthContext(req);
    if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }

    const started = Date.now();
    let projectId: number | null = null;

    const block = async (reason: BlockReason) => {
      await db.insert(aiUsageLogTable).values({
        userId: ctx.userId, userRole: ctx.role, feature, projectId,
        status: "blocked", blockedReason: reason, inputChars: inputSize(req.body),
      }).catch((err) => console.error("[ai-guard] log failed", err));
      const { status, error } = BLOCK_MESSAGE[reason];
      res.status(status).json({ error, code: reason });
    };

    try {
      const settings = await loadAiSettings();
      const isAdmin = ctx.role === "admin";

      // The kill switch stops everyone except admins, who need AI working to
      // test a change before switching it back on for the team.
      if (!settings.global.enabled && !isAdmin) { await block("ai_disabled"); return; }

      const fs = settings.features.get(feature);
      if (fs && !fs.enabled && !isAdmin) { await block("feature_disabled"); return; }

      const allowed = fs ? fs.allowedRoles : (AI_FEATURES[feature] as AiFeatureMeta).defaultRoles ?? null;
      if (allowed && !isAdmin && ctx.role !== "cto" && !allowed.includes(ctx.role)) { await block("role"); return; }

      projectId = await resolveProjectId(req);
      if (projectId != null && !(await canAccessProject(ctx.userId, ctx.role, projectId))) { await block("access"); return; }

      // Caps count calls that were allowed through (ok/error), not blocked
      // attempts, so being rate-limited never extends the lockout. Features
      // with a separate cap (autocomplete) are metered on their own and kept
      // out of the shared totals so they can't exhaust them.
      const now = Date.now();
      const daySince = new Date(now - 86_400_000);
      const counted = inArray(aiUsageLogTable.status, ["ok", "error"]);
      const mine = and(eq(aiUsageLogTable.userId, ctx.userId), counted);
      const separateCap = (AI_FEATURES[feature] as AiFeatureMeta).separateDailyCap;

      if (separateCap != null) {
        const cap = fs?.dailyCapPerUser ?? separateCap;
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiUsageLogTable)
          .where(and(mine, eq(aiUsageLogTable.feature, feature), gte(aiUsageLogTable.createdAt, daySince)));
        if (n >= cap) { await block("daily_cap"); return; }
      } else {
        const shared = and(mine, notInArray(aiUsageLogTable.feature, SEPARATELY_METERED));
        const [{ hourly }] = await db.select({ hourly: sql<number>`count(*)::int` }).from(aiUsageLogTable)
          .where(and(shared, gte(aiUsageLogTable.createdAt, new Date(now - 3_600_000))));
        if (hourly >= settings.global.hourlyCapPerUser) { await block("hourly_cap"); return; }

        const [{ daily }] = await db.select({ daily: sql<number>`count(*)::int` }).from(aiUsageLogTable)
          .where(and(shared, gte(aiUsageLogTable.createdAt, daySince)));
        if (daily >= settings.global.dailyCapPerUser) { await block("daily_cap"); return; }

        if (fs?.dailyCapPerUser != null) {
          const [{ featureDaily }] = await db.select({ featureDaily: sql<number>`count(*)::int` }).from(aiUsageLogTable)
            .where(and(mine, eq(aiUsageLogTable.feature, feature), gte(aiUsageLogTable.createdAt, daySince)));
          if (featureDaily >= fs.dailyCapPerUser) { await block("daily_cap"); return; }
        }
      }

      // Logged up front (so concurrent calls count against the cap) and
      // corrected to 'error' if the route ends up failing.
      const [row] = await db.insert(aiUsageLogTable).values({
        userId: ctx.userId, userRole: ctx.role, feature, projectId,
        status: "ok", inputChars: inputSize(req.body),
      }).returning({ id: aiUsageLogTable.id });

      res.on("finish", () => {
        if (!row) return;
        db.update(aiUsageLogTable)
          // A route sets res.locals.aiCacheHit when it answered from cache: no
          // model was called, so it should not count against the caller's caps.
          .set({ status: res.locals.aiCacheHit ? "cached" : res.statusCode >= 400 ? "error" : "ok", durationMs: Date.now() - started })
          .where(eq(aiUsageLogTable.id, row.id))
          .catch((err) => console.error("[ai-guard] finalize failed", err));
      });

      next();
    } catch (err) {
      // Fail closed: if the guard itself breaks, don't quietly let AI run
      // unmetered.
      console.error("[ai-guard]", err);
      res.status(500).json({ error: "Could not verify AI access. Please try again." });
    }
  };
}

// Features that keep their own daily count instead of sharing the global caps.
const SEPARATELY_METERED: string[] = (Object.keys(AI_FEATURES) as AiFeature[]).filter(
  (f) => (AI_FEATURES[f] as AiFeatureMeta).separateDailyCap != null,
);
