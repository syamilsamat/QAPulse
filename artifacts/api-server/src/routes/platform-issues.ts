import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, platformIssuesTable, usersTable } from "@workspace/db";
import { getAuthContext } from "../middleware/access";
import { logActivity, diffChanges } from "./_audit";
import { notifyUser } from "./_notify";

let nodemailer: any = null;
try {
  nodemailer = require("nodemailer");
} catch {}

// CR079 — Platform Issues: bugs/ideas/questions about QM Pulse itself,
// reported by anyone using it. Admin-only for list/triage in v1 (mirrors
// Audit Log's precedent — a single-owner internal tool, not department-
// scoped like Defects) — reporters find out what happened via notification,
// not by being granted read access to the page.

const VALID_TYPES = ["bug", "idea", "question"];
const VALID_SEVERITIES = ["blocking", "major", "minor"];
const VALID_STATUSES = ["open", "in_progress", "fixed", "wont_fix", "duplicate"];
const RESOLVED_STATUSES = new Set(["fixed", "wont_fix", "duplicate"]);

// Severities that page a human immediately, not just an in-app badge —
// "minor" stays in-app-only (notifyAdmins) to avoid inbox noise.
const EMAIL_ALERT_SEVERITIES = new Set(["blocking", "major"]);
const DEV_ALERT_RECIPIENTS = ["syamil.samat@bestinet.com.my", "raimi.rosman@bestinet.com.my"];

// A single base64 screenshot, kept well under the app's 25mb JSON body cap.
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const router: IRouter = Router();

function requireAuth(req: any, res: any): { userId: number; role: string } | null {
  const ctx = getAuthContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return ctx;
}

function requireAdmin(req: any, res: any): { userId: number; role: string } | null {
  const ctx = requireAuth(req, res);
  if (!ctx) return null;
  if (ctx.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return null; }
  return ctx;
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function fmt(i: typeof platformIssuesTable.$inferSelect, reporterName: string | null = null) {
  return {
    id: i.id,
    title: i.title,
    description: i.description ?? null,
    type: i.type,
    severity: i.severity,
    status: i.status,
    reporterId: i.reporterId ?? null,
    reporterName,
    pagePath: i.pagePath ?? null,
    browserInfo: i.browserInfo ?? null,
    screenshotUrl: i.screenshotUrl ?? null,
    promotedCr: i.promotedCr ?? null,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

async function reporterNameLookup(rows: { reporterId: number | null }[]): Promise<Map<number, string>> {
  const ids = [...new Set(rows.map((r) => r.reporterId).filter((id): id is number => id != null))];
  if (ids.length === 0) return new Map();
  const reporters = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, ids));
  return new Map(reporters.map((u) => [u.id, u.name]));
}

// Blocking/major issues also get emailed straight to the devs — in-app
// notifications only reach someone who already has QM Pulse open (see
// notifications.ts SSE registry), which for a "straightaway" alert isn't
// good enough. Reuses the same Office 365 SMTP config as the PMO report
// (verdict-report.ts): SMTP_HOST/PORT/SECURE/USER/PASS, EMAIL_FROM.
async function sendDevAlertEmail(issue: typeof platformIssuesTable.$inferSelect, reporterName: string | null): Promise<void> {
  if (!nodemailer) return;

  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  if (!smtpUser || !smtpPass) return;

  const smtpHost = process.env.SMTP_HOST ?? "smtp.office365.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpSecure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const emailFrom = process.env.EMAIL_FROM ?? smtpUser;

  const baseUrl = (process.env.CORS_ORIGIN ?? "").split(",")[0]?.trim();
  const issueLink = baseUrl ? `${baseUrl.replace(/\/$/, "")}/platform-issues` : null;

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const severityLabel = issue.severity.toUpperCase();
    await transporter.sendMail({
      from: `"QM Pulse" <${emailFrom}>`,
      to: DEV_ALERT_RECIPIENTS.join(", "),
      subject: `[QM Pulse] ${severityLabel} ${issue.type}: ${issue.title}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;line-height:1.5;">
        <p><strong>${severityLabel} ${issue.type}</strong> reported in QM Pulse.</p>
        <table cellpadding="4" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="color:#6b7280;">Title</td><td>${issue.title}</td></tr>
          <tr><td style="color:#6b7280;">Reporter</td><td>${reporterName ?? "Unknown"}</td></tr>
          <tr><td style="color:#6b7280;">Page</td><td>${issue.pagePath ?? "—"}</td></tr>
          ${issue.description ? `<tr><td style="color:#6b7280;vertical-align:top;">Description</td><td>${issue.description}</td></tr>` : ""}
        </table>
        ${issueLink ? `<p><a href="${issueLink}">Open Platform Issues in QM Pulse</a></p>` : ""}
      </div>`,
    });
  } catch (err) {
    console.error("Platform issue dev alert email failed:", err);
  }
}

// Fan out to admins so someone sees a new issue without polling the page.
// Not notifyRolesInProject (CR045) — that helper is project-scoped and
// platform issues aren't tied to a project.
async function notifyAdmins(issue: typeof platformIssuesTable.$inferSelect, actorId: number | null): Promise<void> {
  const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "admin"));
  await Promise.all(
    admins
      .filter((a) => a.id !== actorId)
      .map((a) =>
        notifyUser(a.id, "New platform issue", `"${issue.title}" was reported`, "platform_issue_opened", "platform_issue", issue.id, actorId).catch(() => {}),
      ),
  );
}

// GET /platform-issues?status=open
router.get("/platform-issues", async (req, res): Promise<void> => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  const status = typeof req.query.status === "string" ? req.query.status : null;
  const where = status && VALID_STATUSES.includes(status) ? eq(platformIssuesTable.status, status) : undefined;

  const rows = await db.select().from(platformIssuesTable).where(where).orderBy(desc(platformIssuesTable.createdAt));
  const nameById = await reporterNameLookup(rows);
  res.json(rows.map((r) => fmt(r, r.reporterId != null ? (nameById.get(r.reporterId) ?? null) : null)));
});

// POST /platform-issues — any authenticated user can report one.
router.post("/platform-issues", async (req, res): Promise<void> => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { title, description, type, severity, pagePath, browserInfo, screenshotUrl } = req.body ?? {};
  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }
  if (type != null && !VALID_TYPES.includes(type)) { res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(", ")}` }); return; }
  if (severity != null && !VALID_SEVERITIES.includes(severity)) { res.status(400).json({ error: `severity must be one of ${VALID_SEVERITIES.join(", ")}` }); return; }
  if (typeof screenshotUrl === "string" && screenshotUrl.length > MAX_SCREENSHOT_BYTES) {
    res.status(413).json({ error: "Screenshot too large" }); return;
  }

  const [issue] = await db.insert(platformIssuesTable).values({
    title: title.trim(),
    description: description?.trim() || null,
    type: type ?? "bug",
    severity: severity ?? "minor",
    status: "open",
    reporterId: ctx.userId,
    pagePath: pagePath ?? null,
    browserInfo: browserInfo ?? null,
    screenshotUrl: screenshotUrl ?? null,
  }).returning();

  await logActivity({
    type: "platform_issue_created",
    description: `Platform issue "${issue.title}" reported`,
    userId: ctx.userId,
    entityId: issue.id,
    entityType: "platform_issue",
    newValue: { title: issue.title, type: issue.type, severity: issue.severity, pagePath: issue.pagePath },
  });
  await notifyAdmins(issue, ctx.userId);

  const nameById = await reporterNameLookup([issue]);
  const reporterName = nameById.get(ctx.userId) ?? null;
  if (EMAIL_ALERT_SEVERITIES.has(issue.severity)) {
    sendDevAlertEmail(issue, reporterName).catch(() => {});
  }

  res.status(201).json(fmt(issue, reporterName));
});

// PATCH /platform-issues/:id — admin triages: status, promotedCr, severity/type corrections.
router.patch("/platform-issues/:id", async (req, res): Promise<void> => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid issue ID" }); return; }
  const [existing] = await db.select().from(platformIssuesTable).where(eq(platformIssuesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Issue not found" }); return; }

  const update: Partial<typeof platformIssuesTable.$inferInsert> = {};
  if (req.body.title !== undefined) update.title = req.body.title.trim();
  if (req.body.description !== undefined) update.description = req.body.description;
  if (req.body.type !== undefined) {
    if (!VALID_TYPES.includes(req.body.type)) { res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(", ")}` }); return; }
    update.type = req.body.type;
  }
  if (req.body.severity !== undefined) {
    if (!VALID_SEVERITIES.includes(req.body.severity)) { res.status(400).json({ error: `severity must be one of ${VALID_SEVERITIES.join(", ")}` }); return; }
    update.severity = req.body.severity;
  }
  if (req.body.promotedCr !== undefined) update.promotedCr = req.body.promotedCr?.trim() || null;
  if (req.body.status !== undefined) {
    if (!VALID_STATUSES.includes(req.body.status)) { res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }); return; }
    update.status = req.body.status;
    if (RESOLVED_STATUSES.has(req.body.status) && !RESOLVED_STATUSES.has(existing.status)) {
      update.resolvedAt = new Date();
    } else if (!RESOLVED_STATUSES.has(req.body.status) && RESOLVED_STATUSES.has(existing.status)) {
      update.resolvedAt = null;
    }
  }

  const [updated] = await db.update(platformIssuesTable).set(update).where(eq(platformIssuesTable.id, id)).returning();

  const diff = diffChanges(existing, updated);
  await logActivity({
    type: req.body.status !== undefined && req.body.status !== existing.status ? "platform_issue_status_changed" : "platform_issue_updated",
    description: `Platform issue "${updated.title}" updated`,
    userId: ctx.userId,
    entityId: id,
    entityType: "platform_issue",
    oldValue: diff?.oldValue ?? null,
    newValue: diff?.newValue ?? null,
  });

  if (req.body.status !== undefined && req.body.status !== existing.status && updated.reporterId) {
    const statusLabel = String(req.body.status).replace(/_/g, " ");
    await notifyUser(
      updated.reporterId,
      "Platform issue updated",
      `"${updated.title}" is now ${statusLabel}`,
      "platform_issue_status_changed",
      "platform_issue",
      updated.id,
      ctx.userId,
    ).catch(() => {});
  }

  const nameById = await reporterNameLookup([updated]);
  res.json(fmt(updated, updated.reporterId != null ? (nameById.get(updated.reporterId) ?? null) : null));
});

// DELETE /platform-issues/:id
router.delete("/platform-issues/:id", async (req, res): Promise<void> => {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  const id = parsePositiveId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid issue ID" }); return; }
  const [existing] = await db.select().from(platformIssuesTable).where(eq(platformIssuesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Issue not found" }); return; }

  await db.delete(platformIssuesTable).where(eq(platformIssuesTable.id, id));
  await logActivity({ type: "platform_issue_deleted", description: `Platform issue "${existing.title}" deleted`, userId: ctx.userId, entityId: id, entityType: "platform_issue" });
  res.sendStatus(204);
});

export default router;
