import puppeteer from "puppeteer";

const rawBaseUrl = process.env.QAPULSE_BASE_URL;
const password = process.env.QAPULSE_TEST_PASSWORD;
if (!rawBaseUrl || !password) {
  console.error("Set QAPULSE_BASE_URL and QAPULSE_TEST_PASSWORD before running preprod:browser.");
  process.exit(2);
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");
const login = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@qapulse.com", password }),
  signal: AbortSignal.timeout(15_000),
});
if (!login.ok) throw new Error(`Login failed with ${login.status}`);
const session = await login.json();

const desktopRoutes = [
  "/my-work", "/dashboard", "/requirements", "/milestones", "/qa-pipeline",
  "/pm-dashboard", "/test-cases", "/tasks", "/test-execution", "/execution-progress",
  "/defects", "/traceability", "/qa-analytics", "/risk-register", "/uat-signoffs",
  "/resources", "/history", "/team", "/teams", "/module-project", "/roles",
  "/admin-search", "/settings", "/inbox", "/team-hangouts",
];
const responsiveRoutes = [
  "/my-work", "/dashboard", "/requirements", "/milestones", "/test-cases",
  "/tasks", "/defects", "/settings",
];

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
const browser = await puppeteer.launch({ headless: true, executablePath, args: ["--no-sandbox"] });
const failures = [];
let assertions = 0;

async function checkViewport(label, viewport, routes) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) {
      errors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate((data) => {
    localStorage.setItem("qa_pulse_remember_me", "false");
    sessionStorage.setItem("qa_pulse_token", data.token);
    sessionStorage.setItem("qa_pulse_refresh_token", data.refreshToken);
    sessionStorage.setItem("qa_pulse_user", JSON.stringify(data.user));
  }, session);

  for (const route of routes) {
    errors.length = 0;
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const state = await page.evaluate(() => ({
      textLength: document.body.innerText.trim().length,
      hasFatalText: /something went wrong|application error|failed to fetch/i.test(document.body.innerText),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    const checks = [
      ["document loaded", response != null && [200, 304].includes(response.status()), response?.status()],
      ["renders content", state.textLength > 80, state.textLength],
      ["no fatal error screen", !state.hasFatalText, state.hasFatalText],
      ["no page/console errors", errors.length === 0, errors.slice(0, 3).join(" | ")],
      ["no document overflow", state.overflow <= 2, state.overflow],
    ];
    for (const [check, pass, actual] of checks) {
      assertions++;
      if (!pass) failures.push({ viewport: label, route, check, actual });
    }
  }
  await page.close();
}

try {
  await checkViewport("desktop", { width: 1440, height: 900 }, desktopRoutes);
  await checkViewport("phone", { width: 375, height: 812, isMobile: true }, responsiveRoutes);
  await checkViewport("tablet", { width: 768, height: 1024 }, responsiveRoutes);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ assertions, passed: assertions - failures.length, failed: failures.length, failures }, null, 2));
if (failures.length > 0) process.exit(1);
