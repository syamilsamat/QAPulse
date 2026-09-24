const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/dashboard.ts'), 'utf8');
const code = transformSync(source.slice(source.indexOf('type PhaseKey ='), source.indexOf('interface PhaseSummaryEntry')), { loader: 'ts', format: 'cjs' }).code;
const module_ = { exports: {} };
vm.runInNewContext(code, { module: module_, exports: module_.exports });
const { computeTimelineFromEvents } = module_.exports;

const d = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`);
const ev = (type, day) => ({ type, createdAt: d(day) });
const run = (events) => computeTimelineFromEvents(d(1), events, [], [], null);
const keys = (segs) => Array.from(segs, (s) => s.key);
const startOf = (segs, key, nth = 0) => segs.filter((s) => s.key === key)[nth]?.start;

test('first dev task moving to In progress starts Development', () => {
  const segs = run([ev('requirement_approve', 10), ev('requirement_dev_task_start', 12)]);
  assert.deepEqual(keys(segs), ['requirements', 'gap', 'develop']);
  assert.equal(startOf(segs, 'develop'), d(12).toISOString());
  assert.equal(segs.find((s) => s.key === 'gap').end, d(12).toISOString());
});

test('a task start earlier than the developer handoff wins', () => {
  const segs = run([ev('requirement_approve', 10), ev('requirement_dev_task_start', 12), ev('requirement_dev_assign', 15)]);
  assert.equal(startOf(segs, 'develop'), d(12).toISOString());
});

test('a developer handoff still starts Development when no task has started', () => {
  const segs = run([ev('requirement_approve', 10), ev('requirement_dev_assign', 15)]);
  assert.equal(startOf(segs, 'develop'), d(15).toISOString());
});

test('approved with no task started and no handoff stays in the gap', () => {
  const segs = run([ev('requirement_approve', 10)]);
  assert.deepEqual(keys(segs), ['requirements', 'gap']);
});

test('a task that started before approval does not start Development', () => {
  const segs = run([ev('requirement_dev_task_start', 8), ev('requirement_approve', 10)]);
  assert.deepEqual(keys(segs), ['requirements', 'gap']);
});

test('a re-approved requirement starts its next Development round at its own first task start', () => {
  const segs = run([
    ev('requirement_approve', 10),
    ev('requirement_dev_task_start', 11),
    ev('requirement_submit', 13),
    ev('requirement_approve', 14),
    ev('requirement_dev_task_start', 16),
  ]);
  assert.deepEqual(keys(segs), ['requirements', 'gap', 'develop', 'requirements', 'gap', 'develop']);
  assert.equal(startOf(segs, 'develop', 0), d(11).toISOString());
  assert.equal(startOf(segs, 'develop', 1), d(16).toISOString());
});

test('ready for QA still ends Development after a task-started round', () => {
  const segs = run([ev('requirement_approve', 10), ev('requirement_dev_task_start', 12), ev('requirement_dev_ready_for_qa', 18)]);
  const dev = segs.find((s) => s.key === 'develop');
  assert.equal(dev.start, d(12).toISOString());
  assert.equal(dev.end, d(18).toISOString());
});

test('batch: a dev task moving to In progress in the task activity log starts Development', async () => {
  const table = (name) => new Proxy({ name }, { get: (t, key) => (key === 'name' ? t.name : key) });
  const [requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable] =
    ['requirements', 'activity', 'execution', 'files', 'milestones', 'tasks'].map(table);
  const milestone = { id: 1, pipelineEnabled: false, requiresUat: false, signedOffAt: null, completedAt: null };
  let requirementReads = 0;
  const rows = {
    requirements: [{ id: 10, milestoneId: 1, title: 'Req', createdAt: d(9), reviewStatus: 'approved', devStatus: null, parentId: null }],
    milestones: [milestone],
    execution: [],
    tasks: [{ id: 5, requirementId: 10 }],
    activity: [
      { entityId: 10, type: 'requirement_approve', createdAt: d(11), newValue: null },
      // a task moving to not_started -> in_progress, and an unrelated field edit
      { entityId: 5, type: 'task_status_changed', createdAt: d(13), newValue: JSON.stringify({ status: 'in_progress' }) },
      { entityId: 5, type: 'task_updated', createdAt: d(14), newValue: JSON.stringify({ name: 'renamed' }) },
    ],
  };
  const db = { select: () => ({ from: (t) => {
    const result = t.name === 'requirements' && requirementReads++ > 0 ? [] : rows[t.name];
    const q = { where: () => q, innerJoin: () => q, orderBy: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return q;
  } }) };
  const ctx = { db, requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable,
    eq: () => null, and: () => null, or: () => null, inArray: () => null, like: () => null };
  const m = { exports: {} };
  vm.runInNewContext(code, { module: m, exports: m.exports, ...ctx });
  const entry = (await m.exports.computeRequirementTimelinesBatch([{ id: 1, completedAt: null }])).get(1)[0];
  assert.deepEqual(keys(entry.timeline), ['requirements', 'gap', 'develop']);
  assert.equal(startOf(entry.timeline, 'develop'), d(13).toISOString());
});

test('batch: with no dev task activity Development does not start on approval', async () => {
  const table = (name) => new Proxy({ name }, { get: (t, key) => (key === 'name' ? t.name : key) });
  const [requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable] =
    ['requirements', 'activity', 'execution', 'files', 'milestones', 'tasks'].map(table);
  let requirementReads = 0;
  const rows = {
    requirements: [{ id: 10, milestoneId: 1, title: 'Req', createdAt: d(9), reviewStatus: 'approved', devStatus: null, parentId: null }],
    milestones: [{ id: 1, pipelineEnabled: false, requiresUat: false, signedOffAt: null, completedAt: null }],
    execution: [], tasks: [{ id: 5, requirementId: 10 }],
    activity: [{ entityId: 10, type: 'requirement_approve', createdAt: d(11), newValue: null },
               { entityId: 5, type: 'task_created', createdAt: d(12), newValue: null }],
  };
  const db = { select: () => ({ from: (t) => {
    const result = t.name === 'requirements' && requirementReads++ > 0 ? [] : rows[t.name];
    const q = { where: () => q, innerJoin: () => q, orderBy: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return q;
  } }) };
  const m = { exports: {} };
  vm.runInNewContext(code, { module: m, exports: m.exports, db, requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable,
    eq: () => null, and: () => null, or: () => null, inArray: () => null, like: () => null });
  const entry = (await m.exports.computeRequirementTimelinesBatch([{ id: 1, completedAt: null }])).get(1)[0];
  assert.deepEqual(keys(entry.timeline), ['requirements', 'gap']);
});

function batchWith(activity, tasks = [{ id: 5, requirementId: 10 }]) {
  const table = (name) => new Proxy({ name }, { get: (t, key) => (key === 'name' ? t.name : key) });
  const [requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable] =
    ['requirements', 'activity', 'execution', 'files', 'milestones', 'tasks'].map(table);
  let requirementReads = 0;
  const rows = {
    requirements: [{ id: 10, milestoneId: 1, title: 'Req', createdAt: d(9), reviewStatus: 'approved', devStatus: null, parentId: null }],
    milestones: [{ id: 1, pipelineEnabled: false, requiresUat: false, signedOffAt: null, completedAt: null }],
    execution: [], tasks, activity,
  };
  const db = { select: () => ({ from: (t) => {
    const result = t.name === 'requirements' && requirementReads++ > 0 ? [] : rows[t.name];
    const q = { where: () => q, innerJoin: () => q, orderBy: () => q, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    return q;
  } }) };
  const m = { exports: {} };
  vm.runInNewContext(code, { module: m, exports: m.exports, db, requirementsTable, activityTable, executionTestCasesTable, executionFilesTable, milestonesTable, tasksTable,
    eq: () => null, and: () => null, or: () => null, inArray: () => null, like: () => null });
  return m.exports.computeRequirementTimelinesBatch([{ id: 1, completedAt: null }]).then((r) => r.get(1)[0]);
}

test('batch: a task submitted for review without ever being moved to In progress starts Development', async () => {
  // Mirrors live task 39: created -> submitted for review -> approved, no in_progress move.
  const entry = await batchWith([
    { entityId: 10, type: 'requirement_approve', createdAt: d(11), newValue: null },
    { entityId: 5, type: 'task_created', createdAt: d(12), newValue: null },
    { entityId: 5, type: 'task_submitted_for_review', createdAt: d(13), newValue: JSON.stringify({ reviewId: 5, prLink: 'PR001', hasEvidence: true }) },
    { entityId: 5, type: 'task_review_approved', createdAt: d(14), newValue: JSON.stringify({ reviewId: 5, note: null }) },
  ]);
  assert.deepEqual(keys(entry.timeline), ['requirements', 'gap', 'develop']);
  assert.equal(startOf(entry.timeline, 'develop'), d(13).toISOString());
});

test('batch: task creation, a review approval or a plain edit alone do not start Development', async () => {
  const entry = await batchWith([
    { entityId: 10, type: 'requirement_approve', createdAt: d(11), newValue: null },
    { entityId: 5, type: 'task_created', createdAt: d(12), newValue: null },
    { entityId: 5, type: 'task_updated', createdAt: d(13), newValue: JSON.stringify({ notes: 'description' }) },
    { entityId: 5, type: 'task_status_changed', createdAt: d(14), newValue: JSON.stringify({ status: 'blocked' }) },
  ]);
  assert.deepEqual(keys(entry.timeline), ['requirements', 'gap']);
});

test('batch: the earlier of In progress and submit-for-review wins', async () => {
  const entry = await batchWith([
    { entityId: 10, type: 'requirement_approve', createdAt: d(11), newValue: null },
    { entityId: 5, type: 'task_submitted_for_review', createdAt: d(15), newValue: JSON.stringify({ reviewId: 1 }) },
    { entityId: 5, type: 'task_status_changed', createdAt: d(13), newValue: JSON.stringify({ status: 'in_progress' }) },
  ]);
  assert.equal(startOf(entry.timeline, 'develop'), d(13).toISOString());
});
