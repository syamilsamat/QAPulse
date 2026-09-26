const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/defect-description.ts'), 'utf8');
const module_ = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, { module: module_, exports: module_.exports });
const { mergeRedmineDescription, parseRedmineDescription } = module_.exports;

// Redmine's own copy of DEF-0003 (CRLF line endings, as Redmine stores them).
const REDMINE_BODY = [
  'testtt', '', '**Steps to Reproduce:**', 'Open statements; select a month.', 'Testing', '',
  '**Expected Result:**', 'PDF contains only the selected month.', '',
  '**Actual Result:**', 'testtt', '', '**Test Case ID:** TC-55564-001',
].join('\r\n');

test('editing only the description keeps every other section', () => {
  const merged = mergeRedmineDescription(REDMINE_BODY, { description: 'testtt (sync test)' });
  assert.equal(merged, [
    'testtt (sync test)', '', '**Steps to Reproduce:**', 'Open statements; select a month.\nTesting', '',
    '**Expected Result:**', 'PDF contains only the selected month.', '',
    '**Actual Result:**', 'testtt', '', '**Test Case ID:** TC-55564-001',
  ].join('\n'));
});

test('editing back to the original text restores the original body', () => {
  const edited = mergeRedmineDescription(REDMINE_BODY, { description: 'testtt (sync test)' });
  const back = mergeRedmineDescription(edited, { description: 'testtt' });
  assert.equal(back, REDMINE_BODY.replace(/\r\n/g, '\n'));
});

test('an unchanged push is a no-op apart from line endings', () => {
  assert.equal(mergeRedmineDescription(REDMINE_BODY, {}), REDMINE_BODY.replace(/\r\n/g, '\n'));
});

test('expected and actual results replace their own section only', () => {
  const merged = mergeRedmineDescription(REDMINE_BODY, { expectedResult: 'New expected', actualResult: 'New actual' });
  const p = parseRedmineDescription(merged);
  assert.equal(p.head, 'testtt');
  assert.deepEqual(Array.from(p.sections, (s) => [s.name, s.body]), [
    ['Steps to Reproduce', 'Open statements; select a month.\nTesting'],
    ['Expected Result', 'New expected'],
    ['Actual Result', 'New actual'],
    ['Test Case ID', 'TC-55564-001'],
  ]);
});

test('a body with no sections has its whole text treated as the description', () => {
  assert.equal(mergeRedmineDescription('just a note', { description: 'rewritten' }), 'rewritten');
  assert.equal(mergeRedmineDescription('', { description: 'first' }), 'first');
});

test('a missing section is inserted in canonical order', () => {
  const merged = mergeRedmineDescription('head\n\n**Steps to Reproduce:**\n1. go\n\n**Test Case ID:** TC-1', { actualResult: 'boom' });
  assert.deepEqual(Array.from(parseRedmineDescription(merged).sections, (s) => s.name), ['Steps to Reproduce', 'Actual Result', 'Test Case ID']);
});

test('clearing expected result removes that section and nothing else', () => {
  const merged = mergeRedmineDescription(REDMINE_BODY, { expectedResult: '' });
  assert.deepEqual(Array.from(parseRedmineDescription(merged).sections, (s) => s.name), ['Steps to Reproduce', 'Actual Result', 'Test Case ID']);
});

test('clearing the description keeps the sections', () => {
  const merged = mergeRedmineDescription(REDMINE_BODY, { description: '' });
  assert.ok(merged.startsWith('**Steps to Reproduce:**'));
  assert.ok(merged.endsWith('**Test Case ID:** TC-55564-001'));
});
