// Shared SMTP sender — same Office 365/Gmail-compatible config already used
// by the PMO Verdict Report and Platform Issues dev alerts:
// SMTP_HOST/PORT/SECURE/USER/PASS, EMAIL_FROM. Centralised here so a new
// call site (in-app notification emails) doesn't re-duplicate the transport
// setup a third time.
let nodemailer: any = null;
try {
  nodemailer = require("nodemailer");
} catch {}

export function emailConfigured(): boolean {
  return !!nodemailer && !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** The app's own URL, for links back into QM Pulse from an email — the first
 *  entry of CORS_ORIGIN, with no trailing slash. Null if unset. */
export function appBaseUrl(): string | null {
  const origin = (process.env.CORS_ORIGIN ?? "").split(",")[0]?.trim();
  return origin ? origin.replace(/\/$/, "") : null;
}

/**
 * Fire-and-forget email send. Never throws — a broken or unconfigured SMTP
 * setup degrades to "no email sent," not a failed request, matching every
 * other email call site in this codebase.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!emailConfigured()) return;

  const smtpHost = process.env.SMTP_HOST ?? "smtp.office365.com";
  const smtpPort = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const smtpSecure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  const smtpUser = process.env.SMTP_USER ?? "";
  const smtpPass = process.env.SMTP_PASS ?? "";
  const emailFrom = process.env.EMAIL_FROM ?? smtpUser;

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"QM Pulse" <${emailFrom}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  } catch (err) {
    console.error("Email send failed:", err);
  }
}
