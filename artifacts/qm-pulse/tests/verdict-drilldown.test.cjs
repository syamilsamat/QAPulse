const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/verdict-drilldown.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleObject = { exports: {} };
vm.runInNewContext(compiled, { exports: moduleObject.exports, URLSearchParams });
const { VERDICT_RESULTS, verdictExecutionUrl, readVerdictDrilldown, matchesExecutionResult } = moduleObject.exports;

for (const result of VERDICT_RESULTS) {
  test(`${result}: report link selects only matching execution rows`, () => {
    const url = new URL(verdictExecutionUrl('40926', result), 'https://qa.example');
    assert.equal(url.pathname, '/test-cases/execution/40926');
    const filters = readVerdictDrilldown(url.search);
    assert.equal(filters.result, result);
    assert.equal(filters.module, null);
    const rows = VERDICT_RESULTS.filter(value => matchesExecutionResult(value, [filters.result]));
    assert.equal(rows.join(','), result);
  });
}
test('module drilldown preserves exact module, including URL punctuation', () => {
  const module = 'PLKS > Worker & Inquiry / A+B';
  const filters = readVerdictDrilldown(new URL(verdictExecutionUrl('40926', 'Failed', module), 'https://qa.example').search);
  assert.equal(filters.module, module);
  assert.equal(filters.result, 'Failed');
});
test('unassigned module stays distinct from no module filter', () => {
  const url = new URL(verdictExecutionUrl('40926', 'Passed', 'Unassigned Module'), 'https://qa.example');
  assert.equal(readVerdictDrilldown(url.search).module, '');
});
test('Not Executed includes empty results; Pending/Empty excludes explicit Not Executed', () => {
  for (const value of [null, undefined, '', ' ', 'Not Executed']) {
    assert.equal(matchesExecutionResult(value, ['Not Executed']), true);
  }
  assert.equal(matchesExecutionResult('Not Executed', ['']), false);
  assert.equal(matchesExecutionResult('Passed', ['Not Executed']), false);
});
test('invalid URL result cannot enable report drilldown or override normal filters', () => {
  for (const query of ['', '?result=Passed', '?source=verdict&result=other']) {
    assert.equal(readVerdictDrilldown(query), null);
  }
});
test('stored result casing and short labels match the canonical selection', () => {
  assert.equal(matchesExecutionResult('passed', ['Passed']), true);
  assert.equal(matchesExecutionResult(' fail ', ['Failed']), true);
  assert.equal(matchesExecutionResult('passed', ['Failed']), false);
  assert.equal(matchesExecutionResult('anything', []), true);
});
