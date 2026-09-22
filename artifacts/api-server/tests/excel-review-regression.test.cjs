const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const XLSX = require("xlsx");

// Bundle the production TypeScript with the project's existing build tool.
// Keep external package resolution beside the API server's node_modules.
const tempDir = mkdtempSync(path.join(__dirname, ".excel-test-"));
after(() => rmSync(tempDir, { recursive: true, force: true }));
const entry = path.join(tempDir, "builder.cjs");
buildSync({
  entryPoints: [path.join(__dirname, "../src/routes/excel-builder.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
const { buildTestCaseExcel } = require(entry);

// Never contact Redmine or AI providers, even if the developer has credentials.
process.env.REDMINE_URL = "";
process.env.REDMINE_API_KEY = "";

const alice = { reviewedByName: "Alice Reviewer", reviewedAt: "2026-09-10T10:00:00Z" };
const bob = { reviewedByName: "Bob Reviewer", reviewedAt: "2026-09-12T11:00:00Z" };
const carol = { reviewedByName: "Carol Reviewer", reviewedAt: "2026-09-14T12:00:00Z" };
const row = (summary, createdAt, review = {}) => ({
  summary, createdAt, updatedByName: "QA Author", tcCount: 1, ...review,
});
const a = row("Audit A", "2026-09-09T12:00:00Z", alice);
const b = row("Audit B", "2026-09-11T12:00:00Z", bob);
const c = row("Audit C", "2026-09-13T12:00:00Z");

async function exportRows(auditEntries, fileReview = {}) {
  const buffer = await buildTestCaseExcel([], {
    redmineId: "REG-EXCEL-001", issueType: "Change Request",
    refNo: "REG-DOC-001", auditEntries, ...fileReview,
  });
  assert.ok(Buffer.isBuffer(buffer), "export must produce an XLSX buffer");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets["Doc Info"];
  assert.ok(sheet, "export must contain Doc Info");
  assert.equal(sheet.G4?.v, "Ref. No.: REG-DOC-001");
  return auditEntries.map((entry, index) => {
    const n = index + 9;
    assert.equal(sheet[`E${n}`]?.v, entry.summary, `audit row ${n} identity/order`);
    return [sheet[`F${n}`]?.v ?? "", sheet[`G${n}`]?.v ?? ""];
  });
}

test("each audit row exports its own reviewer/date despite conflicting legacy values", async () => {
  // The latest row is fallback-eligible: this catches fallback taking priority.
  const conflicting = { reviewedByName: "Legacy Reviewer", reviewedAt: "2026-09-16T12:00:00Z" };
  const expected = [["Alice Reviewer", "10 Sept 2026"], ["Bob Reviewer", "12 Sept 2026"]];
  assert.deepEqual(await exportRows([a, b], conflicting), expected);
  // Removing the fallback must not change any modern row's output.
  assert.deepEqual(await exportRows([a, b]), expected);
});

test("Row C stays blank after Bob's approval, then gains its own approval without changing A/B", async () => {
  assert.deepEqual(await exportRows([a, b, c], bob), [
    ["Alice Reviewer", "10 Sept 2026"], ["Bob Reviewer", "12 Sept 2026"], ["", ""],
  ]);
  assert.deepEqual(await exportRows([a, b, { ...c, ...carol }], carol), [
    ["Alice Reviewer", "10 Sept 2026"], ["Bob Reviewer", "12 Sept 2026"],
    ["Carol Reviewer", "14 Sept 2026"],
  ]);
});

test("legacy fallback applies only to the latest eligible unstamped row", async () => {
  const legacyA = row("Legacy A", "2026-09-08T12:00:00Z");
  const legacyB = row("Legacy B", alice.reviewedAt);
  assert.deepEqual(await exportRows([legacyA, legacyB], alice), [
    ["", ""], ["Alice Reviewer", "10 Sept 2026"],
  ]);
});

test("unreviewed first row clears the template's sample reviewer/date", async () => {
  assert.deepEqual(await exportRows([c], bob), [["", ""]]);
});
