export {};

const rawBaseUrl = process.env.QMPULSE_BASE_URL;
const password = process.env.QMPULSE_TEST_PASSWORD;
if (!rawBaseUrl || !password) {
  console.error("Set QMPULSE_BASE_URL and QMPULSE_TEST_PASSWORD before running preprod:load.");
  process.exit(2);
}

const baseUrl = `${rawBaseUrl.replace(/\/$/, "")}/api`;
const login = await fetch(`${baseUrl}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "admin@qmpulse.com", password }),
  signal: AbortSignal.timeout(15_000),
});
if (!login.ok) throw new Error(`Login failed with ${login.status}`);
const token = String((await login.json() as any).token ?? "");

const samples: Array<{ path: string; status: number; durationMs: number }> = [];
const jobs = Array.from({ length: 50 }, (_, index) => index % 2 === 0 ? "/healthz" : "/projects");
const concurrency = 5;

async function worker() {
  while (jobs.length > 0) {
    const path = jobs.shift();
    if (!path) return;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: path === "/projects" ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15_000),
      });
      await response.arrayBuffer();
      samples.push({ path, status: response.status, durationMs: performance.now() - started });
    } catch {
      samples.push({ path, status: 0, durationMs: performance.now() - started });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
const percentile = (p: number) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] ?? 0;
const failures = samples.filter((sample) => sample.status !== 200);
const result = {
  requests: samples.length,
  concurrency,
  failures: failures.length,
  latencyMs: {
    min: Math.round(durations[0] ?? 0),
    p50: Math.round(percentile(0.5)),
    p95: Math.round(percentile(0.95)),
    max: Math.round(durations.at(-1) ?? 0),
  },
  statusCounts: Object.fromEntries([...new Set(samples.map((sample) => sample.status))].map((status) => [status, samples.filter((sample) => sample.status === status).length])),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0 || percentile(0.95) > 3_000) process.exit(1);
