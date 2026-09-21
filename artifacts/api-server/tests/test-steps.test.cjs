// Step numbering is applied in three places — the execution sheet's read-only
// views, the edit-mode normaliser that rewrites the stored text on blur, and the
// Redmine defect description — so all three have to agree or "step 4 failed"
// means a different step depending on where you read it.
//
// The trap is idempotence: the modal prefills already-numbered text and then
// numbers it again on submit, and an edit-mode blur re-runs over text it
// numbered a moment ago. Anything that isn't a fixed point produces
// "1. 1. Open statements".
//
// lib/test-steps.ts is a standalone module with no imports, so it is compiled
// straight from its path rather than resolved through the qm-pulse package —
// this suite is the only Node test harness in the repo and the logic is worth
// covering wherever it lives.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { transformSync } = require("esbuild");

const source = fs.readFileSync(
  path.join(__dirname, "../../qm-pulse/src/lib/test-steps.ts"),
  "utf8",
);
const { code } = transformSync(source, { loader: "ts", format: "cjs" });
const mod = { exports: {} };
new Function("module", "exports", code)(mod, mod.exports);
const { splitTestSteps, numberTestSteps, isAlreadyNumbered } = mod.exports;

test("numbers plain lines from their order", () => {
  assert.equal(numberTestSteps("Open statements\nDownload PDF"), "1. Open statements\n2. Download PDF");
});

test("a lone step gets no number — that reads as a list of one", () => {
  assert.equal(numberTestSteps("Open statements"), "Open statements");
  assert.deepEqual(splitTestSteps("Open statements"), ["Open statements"]);
});

test("is idempotent — the modal and the blur handler both re-run it", () => {
  const once = numberTestSteps("Open statements\nDownload PDF");
  assert.equal(numberTestSteps(once), once);
  assert.equal(numberTestSteps(numberTestSteps(once)), once);
});

test("strips whatever numbering the author typed before applying its own", () => {
  for (const authored of [
    "1. Open statements\n2. Download PDF",
    "1) Open statements\n2) Download PDF",
    "1 - Open statements\n2 - Download PDF",
    "Step 1: Open statements\nStep 2: Download PDF",
    "1.Open statements\n2.Download PDF",
  ]) {
    assert.equal(
      numberTestSteps(authored),
      "1. Open statements\n2. Download PDF",
      `failed for: ${JSON.stringify(authored)}`,
    );
  }
});

test("renumbers from position, not from what the author wrote", () => {
  // Author deleted their step 2 and left the rest numbered 1, 3, 4.
  assert.equal(
    numberTestSteps("1. Alpha\n3. Gamma\n4. Delta"),
    "1. Alpha\n2. Gamma\n3. Delta",
  );
});

test("a decimal leading a step is not mistaken for a step number", () => {
  assert.deepEqual(splitTestSteps("1.5x zoom is applied\n2.5x zoom is applied"), [
    "1.5x zoom is applied",
    "2.5x zoom is applied",
  ]);
});

test("a step that legitimately starts with a year or count is left alone", () => {
  assert.deepEqual(splitTestSteps("2024 report must load"), ["2024 report must load"]);
});

test("a stripped prefix can expose a number without eating it", () => {
  assert.deepEqual(splitTestSteps("3. 5 items are listed"), ["5 items are listed"]);
});

test("blank lines and surrounding whitespace are dropped", () => {
  assert.equal(numberTestSteps("  Alpha  \n\n\n   Beta\n  "), "1. Alpha\n2. Beta");
});

test("handles CRLF — steps pasted from Word arrive that way", () => {
  assert.equal(numberTestSteps("Alpha\r\nBeta"), "1. Alpha\n2. Beta");
});

test("empty input yields an empty string, so callers need no special case", () => {
  for (const empty of ["", "   ", "\n\n", null, undefined]) {
    assert.equal(numberTestSteps(empty), "");
    assert.deepEqual(splitTestSteps(empty), []);
  }
});

test("isAlreadyNumbered spots a no-op so a blur doesn't dirty the row", () => {
  assert.equal(isAlreadyNumbered("1. Alpha\n2. Beta"), true);
  assert.equal(isAlreadyNumbered("Alpha\nBeta"), false);
  assert.equal(isAlreadyNumbered("Open statements"), true);
  assert.equal(isAlreadyNumbered(""), true);
});
