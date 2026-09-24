const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/dashboard.ts'), 'utf8');
const code = transformSync(source.slice(source.indexOf('type PhaseKey ='), source.indexOf('interface PhaseSummaryEntry')), { loader: 'ts', format: 'cjs' }).code;
const d = day => new Date(`2026-09-${day}T00:00:00Z`);
const milestone = { id: 1, pipelineEnabled: true, requiresUat: false, signedOffAt: null, completedAt: d('17') };
function load(extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, ...extra });
  return module.exports;
}
test('QA-only execution produces QA duration without approval or development events', () => {
  const r = load().computePipelineTimeline([d('10')], [], milestone);
  assert.equal(r.timeline.length, 1);
  assert.equal(r.timeline[0].key, 'qa');
  assert.equal(r.timeline[0].days, 7);
  assert.equal(r.status, 'Completed');
});
test('unexecuted pipeline has no fabricated duration or Draft status', () => {
  const r = load().computePipelineTimeline([], [], { ...milestone, completedAt: null });
  assert.equal(r.timeline.length, 0);
  assert.equal(r.status, 'Awaiting QA');
});
test('active QA is ongoing and functional sign-off stops its clock', () => {
  const f = load().computePipelineTimeline;
  assert.equal(f([d('10')], [], { ...milestone, completedAt: null }).timeline[0].ongoing, true);
  const r = f([d('10')], [], { ...milestone, completedAt: null, signedOffAt: d('12') });
  assert.equal(r.timeline[0].days, 2);
  assert.equal(r.timeline[0].ongoing, false);
  assert.equal(r.status, 'QA signed off');
});
test('UAT is included only when required and execution starts it', () => {
  const f = load().computePipelineTimeline;
  assert.equal(f([d('10')], [d('13')], milestone).timeline.length, 1);
  const r = f([d('10')], [d('13')], { ...milestone, requiresUat: true });
  assert.equal(r.timeline.map(s => s.key).join(','), 'qa,uat');
  assert.equal(r.timeline[0].days, 3);
  assert.equal(r.timeline[1].days, 4);
});
test('normal delivery retains requirement, development and QA phases', () => {
  const r = load().computeTimelineFromEvents(d('10'), [
    { type: 'requirement_approve', createdAt: d('11') },
    { type: 'requirement_dev_assign', createdAt: d('12') },
    { type: 'requirement_dev_ready_for_qa', createdAt: d('13') },
  ], [d('14')], [], d('17'));
  assert.equal(r.map(s => s.key).join(','), 'requirements,gap,develop,qa');
});
test('batch report routes pipeline records correctly and excludes execution from other milestones', async () => {
  const table = name => new Proxy({ name }, { get: (t, key) => key === 'name' ? t.name : key });
  const requirementsTable = table('requirements'), activityTable = table('activity');
  const executionTestCasesTable = table('execution'), executionFilesTable = table('files'), milestonesTable = table('milestones');
  const tasksTable = table('tasks');
  let reqReads = 0;
  const rows = {
    requirements: [{ id: 10, milestoneId: 1, title: 'Worker Inquiry', createdAt: d('09'), reviewStatus: 'draft', parentId: null }],
    activity: [], milestones: [milestone], tasks: [],
    execution: [
      { requirementId: 10, milestoneId: 99, fileType: 'qa', executedAt: d('01') },
      { requirementId: 10, milestoneId: 1, fileType: 'qa', executedAt: d('10') },
    ],
  };
  const db = { select: () => ({ from: t => {
    const result = t.name === 'requirements' && reqReads++ > 0 ? [] : rows[t.name];
    const q = { where: () => q, innerJoin: () => q, orderBy: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return q;
  } }) };
  const f = load({ db, requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable,
    eq: () => null, and: () => null, inArray: () => null, like: () => null });
  const result = (await f.computeRequirementTimelinesBatch([{ id: 1, completedAt: d('17') }])).get(1)[0];
  assert.equal(result.status, 'Completed');
  assert.equal(result.timeline[0].key, 'qa');
  assert.equal(result.timeline[0].days, 7);
  assert.equal(result.actualWorkStartedAt, d('10').toISOString());
});
