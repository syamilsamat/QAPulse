const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function load(name, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes', name + '.ts'), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => imports[name] ?? require(name), console, process: { env: {} }, AbortSignal, ...globals });
  return module.exports;
}
const journal = (id, details = [], notes = '') => ({ id, user: { id: 7, name: 'QA Member' }, created_on: `2026-09-${String(id).padStart(2,'0')}T09:00:00Z`, details, notes });
const issue = journals => ({ id: 42, updated_on: '2026-09-19T10:00:00Z', journals, custom_fields: [{ id: 8, name: 'Actual completion date' }] });
const adapter = load('redmine-history', {}, { fetch: async () => { throw new Error('Unexpected real fetch'); } });
test('normalizes grouped changes, comments, private notes, custom fields and attachment removal', () => {
  const payload = issue([
    journal(1, [{ property: 'attr', name: 'status_id', old_value: '1', new_value: '2' }, { property: 'cf', name: '8', new_value: '2026-09-18' }], '<script>unsafe()</script>'),
    { ...journal(2, [{ property: 'attachment', name: '72', old_value: 'proof.png', new_value: null }], 'Reviewed'), private_notes: true },
  ]);
  const result = adapter.normalizeHistory(payload, { status_id: { 1: 'New', 2: 'Verified' } });
  assert.equal(result[0].id, 2); assert.equal(result[0].private, true);
  assert.equal(result[0].changes[0].kind, 'attachment'); assert.equal(result[0].changes[0].before, 'proof.png'); assert.equal(result[0].changes[0].after, null);
  assert.equal(result[1].changes[0].before, 'New'); assert.equal(result[1].changes[0].after, 'Verified');
  assert.equal(result[1].changes[1].field, 'Actual completion date');
  assert.equal(result[1].notes, '<script>unsafe()</script>'); // Rendered as text by React.
});
test('keeps empty journals, deduplicates IDs, identifies unresolved IDs, rejects malformed snapshots', () => {
  const result = adapter.normalizeHistory(issue([journal(1), journal(1), journal(2, [{ property: 'attr', name: 'assigned_to_id', new_value: '999' }])]), {});
  assert.equal(result.length, 2); assert.equal(result[0].changes[0].after, '#999');
  assert.throws(() => adapter.normalizeHistory({ journals: [] }, {}), /incomplete/);
  assert.throws(() => adapter.normalizeHistory(issue([{ ...journal(1), created_on: 'bad' }]), {}), /incomplete/);
});
test('reads journals with personal credentials; denied access never retries under another identity', async () => {
  const requests = [];
  const denied = load('redmine-history', {}, { fetch: async (url, options) => { requests.push({ url, options }); return { ok: false, status: 403 }; } });
  await assert.rejects(denied.fetchHistory('42', 'personal-key'), err => err.status === 403);
  assert.equal(requests.length, 1); assert.equal(requests[0].options.headers['X-Redmine-API-Key'], 'personal-key');
  assert.match(requests[0].url, /issues\/42.json\?include=journals,attachments/);
});
test('optional lookup failure still returns journals and current field names', async () => {
  const a = load('redmine-history', {}, { fetch: async url => url.includes('/issues/42.json')
    ? { ok: true, json: async () => ({ issue: { ...issue([journal(1, [{ property: 'attr', name: 'status_id', new_value: '2' }])]), status: { id: 2, name: 'Verified' } } }) }
    : { ok: false, status: 403 } });
  assert.equal((await a.fetchHistory('42', 'key')).entries[0].changes[0].after, 'Verified');
});

function fixture() {
  const table = name => new Proxy({ name }, { get: (obj, key) => key === 'name' ? obj.name : { table: name, col: key } });
  const tables = { defectsTable: table('defects'), defectHistoryTable: table('history'), usersTable: table('users') };
  const state = { ctx: { userId: 1, role: 'qa_member' }, projectAccess: true, moduleAccess: true,
    defects: [{ id: 5, projectId: 9, module: 'Portal', redmineId: '42' }], history: [],
    users: [{ id: 1, redmineApiKey: 'key1' }, { id: 2, redmineApiKey: 'key2' }], fetches: 0,
    fresh: { entries: adapter.normalizeHistory(issue([journal(1)]), {}), issueUpdatedAt: new Date('2026-09-19T10:00:00Z') },
    remote: { issues: [{ id: 42, updated_on: '2026-09-19T10:00:00Z' }] } };
  const eq = (field, value) => row => row[field.col] === value;
  const and = (...checks) => row => checks.filter(Boolean).every(check => check(row));
  const inArray = (field, values) => row => values.includes(row[field.col]);
  const sql = (parts, ...values) => ({ parts, values });
  const db = {
    select(fields) { return { from(t) { return { where: async predicate => state[t.name].filter(predicate).map(row => fields ? Object.fromEntries(Object.entries(fields).map(([key, f]) => [key, row[f.col]])) : row) }; } }; },
    insert(t) { return { values(values) { return { onConflictDoUpdate(config) { return { returning: async () => {
      const previous = state[t.name].find(r => r.defectId === values.defectId && r.userId === values.userId);
      if (previous && previous.syncedAt > values.syncedAt) return [];
      const same = previous?.credentialFingerprint === values.credentialFingerprint && previous?.redmineId === values.redmineId;
      const row = { ...values, seenJournalId: same ? previous.seenJournalId : 0, seenUpdatedAt: same ? previous.seenUpdatedAt : null };
      if (previous) Object.assign(previous, row); else state[t.name].push(row);
      return [row];
    } }; } }; } }; },
    update(t) { return { set(values) { return { where(predicate) { return { returning: async () => {
      const rows = state[t.name].filter(predicate); rows.forEach(row => Object.assign(row, values)); return rows;
    } }; } }; } }; },
    delete(t) { return { where: async predicate => { state[t.name] = state[t.name].filter(row => !predicate(row)); } }; },
  };
  const routes = {};
  const router = { get: (url, fn) => routes['GET '+url] = fn, post: (url, fn) => routes['POST '+url] = fn };
  load('defect-history', {
    express: { Router: () => router }, 'drizzle-orm': { eq, and, inArray, sql }, '@workspace/db': { db, ...tables },
    '../middleware/access': { getAuthContext: () => state.ctx, canAccessProject: async () => state.projectAccess, getModuleScope: async () => ({ restricted: !state.moduleAccess, moduleNames: [] }) },
    './redmine-history': { HistoryError: adapter.HistoryError, redmineHistoryBaseUrl: () => 'https://redmine.example',
      fetchHistory: async () => { state.fetches++; if (state.error) throw state.error; return state.fresh; },
      historyRead: async () => { if (state.error) throw state.error; return state.remote; } },
  });
  async function request(route, { id = '5', body = {} } = {}) {
    const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code=code;return this; }, json(body) { this.body=body;return this; } };
    await routes[route]({ params: { id }, body }, res); return res;
  }
  return { state, request, get: () => request('GET /defects/:id/history'), seen: snapshotId => request('POST /defects/:id/history/seen', { body: { snapshotId } }), summaries: () => request('POST /defects/history/summaries', { body: { ids: [5] } }) };
}
test('history endpoints require authentication, project/module access, a linked issue and a personal key', async () => {
  for (const [change, status] of [
    [s => s.ctx=null,401], [s => s.projectAccess=false,404], [s => s.moduleAccess=false,404],
    [s => s.defects[0].redmineId=null,409], [s => s.users[0].redmineApiKey='',428],
  ]) { const f=fixture(); change(f.state); assert.equal((await f.get()).code,status); assert.equal(f.state.fetches,0); }
  const f=fixture(); assert.equal((await f.request('GET /defects/:id/history',{id:'bad'})).code,400);
});
test('first view establishes baseline; fresh updates produce personal unread markers and clear after viewing', async () => {
  const f=fixture(); const first=await f.get(); assert.equal(first.code,200); assert.equal(first.body.unreadIds.length,0);
  assert.equal(first.headers['Cache-Control'],'private, no-store'); assert.equal((await f.seen(first.body.snapshotId)).code,200);
  f.state.remote.issues[0].updated_on='2026-09-20T10:00:00Z';
  assert.equal((await f.summaries()).body.items[0].hasUpdates,true);
  f.state.fresh={ entries:adapter.normalizeHistory(issue([journal(1),journal(2)]),{}),issueUpdatedAt:new Date('2026-09-20T10:00:00Z') };
  const next=await f.get(); assert.deepEqual(Array.from(next.body.unreadIds),[2]);
  assert.equal((await f.seen(first.body.snapshotId)).code,409); // Stale tabs cannot acknowledge unseen updates.
  assert.equal((await f.seen(next.body.snapshotId)).code,200);
  assert.equal((await f.summaries()).body.items[0].hasUpdates,false);
});
test('transient outages retain cached history and do not advance the view marker', async () => {
  const f=fixture(); const first=await f.get(); f.state.error=new adapter.HistoryError(502,'Offline');
  const stale=await f.get(); assert.equal(stale.code,200); assert.equal(stale.body.stale,true);
  assert.equal(stale.body.snapshotId,first.body.snapshotId); assert.equal(stale.body.error,'Offline');
  assert.equal(f.state.history[0].seenUpdatedAt,null);
});
test('denied/deleted issues purge history and do not return cached content', async () => {
  for (const code of [403,404]) { const f=fixture(); await f.get(); f.state.error=new adapter.HistoryError(code,'Denied');
    const result=await f.get(); assert.equal(result.code,code); assert.equal(result.body.entries,undefined); assert.equal(f.state.history.length,0); }
});
test('cache cannot cross users, changed credentials, or relinked defects', async () => {
  for (const change of [s=>s.ctx.userId=2,s=>s.users[0].redmineApiKey='new-key',s=>s.defects[0].redmineId='99']) {
    const f=fixture(); await f.get(); change(f.state); f.state.error=new adapter.HistoryError(502,'Offline');
    const result=await f.get(); assert.equal(result.code,502); assert.equal(result.body.entries,undefined);
  }
});
test('summary scoping and omission do not expose inaccessible issues', async () => {
  const f=fixture(); await f.get(); f.state.remote.issues=[];
  assert.equal((await f.summaries()).body.items.length,0); assert.equal(f.state.history.length,0);
  f.state.projectAccess=false; assert.equal((await f.summaries()).body.items.length,0);
  assert.equal((await f.request('POST /defects/history/summaries',{body:{ids:Array(91).fill(5)}})).code,400);
});
