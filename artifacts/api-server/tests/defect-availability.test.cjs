const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
function fixture() {
  const rows = [];
  const table = new Proxy({}, {get: (_, key) => key});
  const orm = {eq: (key, value) => row => row[key] === value, inArray: (key, values) => row => values.includes(row[key]), and: (...predicates) => row => predicates.every(p => p(row))};
  const db = {
    select: () => ({from: () => ({where: async predicate => rows.filter(predicate)})}),
    insert: () => ({values: value => ({onConflictDoUpdate: async () => {
      const index = rows.findIndex(row => row.userId === value.userId && row.defectId === value.defectId);
      if (index < 0) rows.push(value); else rows[index] = value;
    }})}),
    delete: () => ({where: async predicate => { for(let i = rows.length - 1; i >= 0; i--) if(predicate(rows[i])) rows.splice(i, 1); }}),
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/defect-availability.ts'), 'utf8');
  const module = {exports: {}};
  const env = { REDMINE_URL: 'https://redmine.test' };
  vm.runInNewContext(transformSync(source, {loader:'ts', format:'cjs'}).code, {module, exports: module.exports,
    require: name => name === '@workspace/db' ? {db, defectAvailabilityTable:table} : name === 'drizzle-orm' ? orm : require(name), process: {env}});
  return {...module.exports, rows, env};
}
test('unavailability persists per user and cannot cross credentials, host or requested defect scope', async () => {
  const f=fixture();
  await f.recordAvailability(1, 'key1', {id: 5, redmineId:'42'}, true);
  assert.equal((await f.readAvailability(1,'key1',[5])).length,1);
  assert.equal((await f.readAvailability(2,'key1',[5])).length,0);
  assert.equal((await f.readAvailability(1,'key2',[5])).length,0);
  assert.equal((await f.readAvailability(1,'key1',[6])).length,0);
  f.env.REDMINE_URL='https://another.test';
  assert.equal((await f.readAvailability(1,'key1',[5])).length,0);
});
test('repeated missing checks update one record; successful recovery clears only the requesting user', async () => {
  const f=fixture(); const d={id:5,redmineId:'42'};
  await f.recordAvailability(1,'key1',d,true);
  await f.recordAvailability(1,'key1',d,true);
  await f.recordAvailability(2,'key2',d,true);
  assert.equal(f.rows.length,2);
  await f.recordAvailability(1,'key1',d,false);
  assert.equal((await f.readAvailability(1,'key1',[5])).length,0);
  assert.equal((await f.readAvailability(2,'key2',[5])).length,1);
});
test('known missing issues reject write-through; relinked or native issues remain editable', async () => {
  const source=fs.readFileSync(path.join(__dirname,'../src/routes/defects.ts'),'utf8');
  const start=source.indexOf('async function blockUnavailable');
  const end=source.indexOf('\n}',start)+2;
  const context={resolveApiKeyFromToken: async ()=>'key', readAvailability: async()=>[{redmineId:'42'}]};
  vm.createContext(context); vm.runInContext(transformSync(source.slice(start,end),{loader:'ts'}).code,context);
  let status, body;
  const res={status: s => {status=s; return res;}, json: b=>body=b};
  assert.equal(await context.blockUnavailable({headers:{}},res,1,{id:5,redmineId:'42'}),true);
  assert.equal(status,409); assert.match(body.error,/Check again/);
  assert.equal(await context.blockUnavailable({headers:{}},res,1,{id:5,redmineId:'43'}),false);
  assert.equal(await context.blockUnavailable({headers:{}},res,1,{id:5,redmineId:null}),false);
});
