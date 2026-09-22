const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

// Execute the production registration handler against an isolated DB boundary;
// never import the Redmine bridge or send notifications to real users.
const source = fs.readFileSync(path.join(__dirname, '../src/routes/defects.ts'), 'utf8');
const start = source.indexOf('router.post("/defects/register"');
const end = source.indexOf('\n});', start) + 4;
assert.ok(start > 0 && end > start);
const code = transformSync(source.slice(start, end), { loader: 'ts' }).code;
let handler;
const table = (name) => new Proxy({ name }, { get: (t, key) => key === 'name' ? t.name : key });
const state = {};
const tables = { defectsTable: table('defects'), defectLinksTable: table('links'), executionTestCasesTable: table('execution'), executionFilesTable: table('files'), projectsTable: table('projects') };
function query() {
  let target, predicate = () => true;
  const q = { from(t) { target = t.name; return q; }, leftJoin() { return q; }, where(p) { predicate=p; return q; }, then(resolve,reject) { return Promise.resolve(state[target].filter(predicate)).then(resolve,reject); } };
  return q;
}
const db = {
  select: query,
  insert(t) { return { values(values) { let result; const save = () => { if (!result) { result = { ...values, id: state[t.name].length + 1 }; state[t.name].push(result); } return result; }; return { returning: async () => [save()], then: (resolve,reject) => Promise.resolve(save()).then(resolve,reject) }; } }; },
  update(t) { return { set(values) { return { where: async p => state[t.name].filter(p).forEach(row => Object.assign(row, values)) }; } }; },
};
vm.runInNewContext(code, {
  router: { post(_path, fn) { handler = fn; } }, db, ...tables,
  eq: (key, value) => row => row[key] === value,
  requireAuth: () => ({ userId: 1, role: 'qa_member' }), actorFromReq: () => 1,
  DEFECT_CATEGORIES: [], canSetDefectCategory: async () => false,
  canAccessDefectProject: async (_ctx, id) => id == null || [11,22,33].includes(id),
  resolveUserIdByName: async () => null, logActivity: async () => {},
  notifyQaLeads: async () => {}, notifyUser: async () => {}, console,
});
beforeEach(() => Object.assign(state, {
  defects: [], links: [], projects: [{ id: 11 }, { id: 22 }],
  execution: [{ id: 100, libraryTcId: 4, requirementId: 8, fileProjectId: 11, fileMilestoneId: 7, fileTracker: 'UAT' }],
}));
async function register(overrides = {}) {
  const res = { code: 200, body: null, status(code) { this.code=code;return this; }, json(body) { this.body=body;return this; } };
  await handler({ body: { redmineId: '501', title: 'Search failure', executionTcId: 100, ...overrides } }, res);
  return res;
}
test('stores all steps and module, preserves execution project/milestone and normalizes severity', async () => {
  const steps = '1. Open search\n2. Enter worker ID\n3. Click Search';
  const res = await register({ stepsToReproduce: steps, module: 'Worker Search', projectId: 11, severity: 'High' });
  assert.equal(res.code,201);assert.equal(res.body.stepsToReproduce,steps);assert.equal(res.body.module,'Worker Search');assert.equal(res.body.severity,'high');assert.equal(res.body.projectId,11);assert.equal(res.body.milestoneId,7);assert.equal(res.body.foundIn,'UAT');assert.equal(state.links[0].testCaseId,4);
});
test('persists an edited QM Pulse project without carrying a milestone from another project', async () => {
  const res = await register({ projectId:22 });assert.equal(res.code,201);assert.equal(res.body.projectId,22);assert.equal(res.body.milestoneId,null);
});
test('rejects unauthorized/missing projects, invalid inputs and execution references', async () => {
  assert.equal((await register({ projectId:99 })).code,403);
  assert.equal((await register({ projectId:33 })).code,400);
  assert.equal((await register({ projectId:'11' })).code,400);
  assert.equal((await register({ stepsToReproduce:['step'] })).code,400);
  assert.equal((await register({ severity:'urgent' })).code,400);
  assert.equal((await register({ executionTcId:999 })).code,404);
  state.execution[0].fileProjectId=99;
  assert.equal((await register({ projectId:11 })).code,403);
  assert.equal(state.defects.length,0);
});
test('older clients retain inferred project and duplicate registration preserves the existing defect', async () => {
  const first = await register({ stepsToReproduce:'Original steps' });assert.equal(first.body.projectId,11);
  const second = await register({ stepsToReproduce:'Other steps' });assert.equal(second.code,200);assert.equal(second.body.stepsToReproduce,'Original steps');assert.equal(state.defects.length,1);assert.equal(state.links.length,1);
});
