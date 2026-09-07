export {};

const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
const value = (name: string) => process.env[name]?.trim() ?? "";
const present = (name: string, required = true) => {
  const pass = Boolean(value(name));
  checks.push({ name, pass: pass || !required, detail: pass ? "configured" : required ? "missing" : "optional/not configured" });
};

checks.push({
  name: "NODE_ENV",
  pass: value("NODE_ENV") === "production",
  detail: value("NODE_ENV") === "production" ? "production" : "must be production",
});

present("DATABASE_URL");
const jwtSecret = value("JWT_SECRET");
checks.push({
  name: "JWT_SECRET",
  pass: jwtSecret.length >= 32 && jwtSecret !== "qm-pulse-dev-secret-change-in-production-2024",
  detail: jwtSecret ? (jwtSecret.length >= 32 ? "configured with sufficient length" : "must be at least 32 characters") : "missing",
});

const corsOrigin = value("CORS_ORIGIN");
checks.push({
  name: "CORS_ORIGIN",
  pass: /^https:\/\/[^*\s]+$/.test(corsOrigin),
  detail: corsOrigin ? "must be one explicit HTTPS origin" : "missing",
});

for (const name of ["REDMINE_URL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "PMO_EMAIL_TO"]) {
  present(name);
}
for (const name of ["OPENROUTER_API_KEY", "REDMINE_API_KEY"]) present(name, false);

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
if (failed.length > 0) process.exit(1);
