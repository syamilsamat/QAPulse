const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const bridge = fs.readFileSync(path.join(__dirname, '../src/routes/redmine-defect-bridge.ts'), 'utf8');
const start = bridge.indexOf('export async function refreshDefectStatuses');
const end = bridge.indexOf('\n}', start) + 2;
const code = transformSync(bridge.slice(start, end).replace('export ', ''), { loader: 'ts' }).code;
async function refresh(count, fetcher) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: i + 1, redmineId: String(i + 1), status: 'Old' }));
  const context = {
    db: {
      select: () => ({ from: () => ({ where: async () => rows }) }),
      update: () => ({ set: values => ({ where: async id => Object.assign(rows[id - 1], values) }) }),
    },
    defectsTable: { id: 'id' }, eq: (_, id) => id, isNotNull: () => true,
    redmineFetch: fetcher, AbortSignal,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { result: await context.refreshDefectStatuses('test'), rows };
}
const response = ids => ({ ok: true, json: async () => ({ issues: ids.map(id => ({ id, status: { name: 'Resolved' } })) }) });
test('no linked defects makes no Redmine request', async () => {
  const { result } = await refresh(0, () => assert.fail('Unexpected request'));
  assert.equal(result.refreshed, 0); assert.equal(result.failed, 0); assert.equal(result.error, undefined);
});
test('successful refresh persists statuses and timestamps', async () => {
  const { result, rows } = await refresh(2, async () => response([1, 2]));
  assert.equal(result.refreshed, 2); assert.equal(result.failed, 0);
  assert.ok(rows.every(row => row.status === 'Resolved' && row.statusSyncedAt));
});
test('access errors and network failures retain old data and report failures', async () => {
  for (const fetcher of [async () => ({ ok: false, status: 403 }), async () => { throw new Error('offline'); }]) {
    const { result, rows } = await refresh(2, fetcher);
    assert.equal(result.refreshed, 0); assert.equal(result.failed, 2); assert.ok(result.error);
    assert.ok(rows.every(row => row.status === 'Old' && !row.statusSyncedAt));
  }
});
test('missing issues count as failures', async () => {
  const { result, rows } = await refresh(2, async () => response([1]));
  assert.equal(result.refreshed, 1); assert.equal(result.failed, 1); assert.match(result.error, /inaccessible/);
  assert.equal(rows[1].status, 'Old');
});
test('a failed batch does not prevent later batches from refreshing', async () => {
  let calls = 0;
  const { result } = await refresh(91, async () => ++calls === 1 ? { ok: false, status: 503 } : response([91]));
  assert.equal(result.refreshed, 1); assert.equal(result.failed, 90); assert.match(result.error, /503/);
});
const page = fs.readFileSync(path.join(__dirname, '../../qm-pulse/src/pages/Defects.tsx'), 'utf8');
const handlerStart = page.indexOf('  const handleRefreshStatus =');
const handlerEnd = page.indexOf('\n  const handlePull', handlerStart);
const handlerCode = transformSync(page.slice(handlerStart, handlerEnd).replace('const handleRefreshStatus', 'globalThis.handleRefreshStatus'), { loader: 'ts' }).code;
async function click(res) {
  const notifications = [], loading = []; let reloads = 0;
  const context = { fetch: async () => res, getApiUrl: () => '', authHeaders: {}, setIsRefreshing: v => loading.push(v), toast: v => notifications.push(v), invalidate: () => reloads++ };
  vm.createContext(context); vm.runInContext(handlerCode, context);
  await context.handleRefreshStatus();
  assert.deepEqual(loading, [true, false]);
  return { toast: notifications[0], reloads };
}
test('UI distinguishes success, partial success, empty and HTTP failures', async () => {
  for (const [refreshed, failed, expected] of [[2, 0, /Status refreshed/], [1, 1, /could not be refreshed/], [0, 0, /No defects linked/]]) {
    const result = await click({ ok: true, json: async () => ({ refreshed, failed }) });
    assert.match(result.toast.title, expected); assert.equal(result.reloads, refreshed > 0 ? 1 : 0);
  }
  const result = await click({ ok: false, json: async () => ({ error: 'Access denied' }) });
  assert.equal(result.toast.variant, 'destructive'); assert.equal(result.toast.description, 'Access denied'); assert.equal(result.reloads, 0);
});
test('UI rejects non-JSON errors and malformed success responses', async () => {
  for (const res of [{ ok: false, json: async () => { throw new Error('not JSON'); } }, { ok: true, json: async () => ({}) }]) {
    const result = await click(res); assert.equal(result.toast.variant, 'destructive'); assert.equal(result.reloads, 0);
  }
});
