const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const express = require('express');

// Exercise real route handlers against an isolated in-memory DB. No server,
// credentials, Redmine calls or production records are used by these tests.
function harness(file) {
  const rows = { usersTable: [
    { id: 1, role: 'qa_lead', name: 'QA Lead' },
    { id: 2, role: 'qa_member', name: 'QA Member' },
    { id: 3, role: 'dev_member', name: 'Developer' },
  ], milestonesTable: [], milestoneAssigneesTable: [], defectsTable: [
    { id: 1, projectId: 1, title: 'Test defect', assigneeId: null, redmineId: null },
  ] };
  const audit = [];
  let actor = { userId: 1, id: 1, role: 'qa_lead' };
  let access = true;
  const tables = new Proxy({}, { get: (_, table) => new Proxy({ table }, { get: (o, key) => key === 'table' ? o.table : key }) });
  function query(table, patch) {
    let predicate = () => true;
    const result = () => {
      const selected = (rows[table.table] || []).filter(predicate);
      if (patch) selected.forEach(row => Object.assign(row, patch));
      return selected;
    };
    return { where(p) { predicate = p; return this; }, returning: async () => result(), then(a,b) { return Promise.resolve(result()).then(a,b); } };
  }
  const db = {
    select: () => ({ from: table => query(table) }),
    insert: table => ({ values(value) {
      const list = rows[table.table] ||= [];
      const item = { id: list.length + 1, createdAt: new Date(), updatedAt: new Date(), ...value };
      list.push(item);
      return { returning: async () => [item], then(a,b) { return Promise.resolve().then(a,b); } };
    } }),
    update: table => ({ set: patch => query(table, patch) }),
  };
  const accessModule = {
    getAuthContext: () => actor,
    canAccessProject: async () => access,
    getRoleDepartment: async role => role.split('_')[0],
    getRoleTierRank: async role => role.endsWith('_lead') ? 2 : 1,
  };
  const mocks = {
    express,
    'drizzle-orm': { eq: (key,value) => row => row[key] === value, and: (...ps) => row => ps.every(p => p(row)), inArray: (key,values) => row => values.includes(row[key]) },
    '@workspace/db': new Proxy({ db }, { get: (o,k) => k === 'db' ? db : tables[k] }),
    '../middleware/access': accessModule,
    './auth': { verifyToken: () => actor, actorFromReq: () => actor.userId },
    './_audit': { logActivity: async entry => audit.push(entry), diffChanges: (before, after) => ({ oldValue: before, newValue: after }) },
    './_notify': { notifyUser: async () => {}, notifyRolesInProject: async () => {} },
  };
  const filename = path.resolve(__dirname, '../src/routes/', file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.require = name => {
    if (name in mocks) return mocks[name];
    // Other imports aren't used by these local-only handlers. Throw if a
    // test unexpectedly enters integration code instead of silently calling it.
    return new Proxy({}, { get: (_,key) => () => { throw new Error(`Unexpected integration: ${name}.${String(key)}`); } });
  };
  mod._compile(transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename);
  return {
    rows, audit,
    setActor(role, id=1) { actor = { role, id, userId: id }; },
    setAccess(value) { access = value; },
    async request(method, route, body, params={}) {
      const layer = mod.exports.default.stack.find(l => l.route?.path === route && l.route.methods[method]);
      assert.ok(layer, route);
      const res = { statusCode: 200, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } };
      await layer.route.stack[0].handle({ body, params, headers: { authorization: 'Bearer isolated-test' } }, res);
      return res;
    },
  };
}

test('create-time staffing adds the assigning lead once, including duplicated/self IDs', async () => {
  const h=harness('milestones.ts');
  let r=await h.request('post','/milestones',{ projectId:1, name:'Test', assigneeUserIds:[2,2,'2'] });
  assert.equal(r.statusCode,201);
  assert.deepEqual(h.rows.milestoneAssigneesTable.map(r=>r.userId).sort(),[1,2]);
  r=await h.request('post','/milestones',{ projectId:1, name:'Self', assigneeUserIds:[1,2] });
  assert.equal(r.statusCode,201);
  assert.equal(h.rows.milestoneAssigneesTable.filter(r=>r.milestoneId===2 && r.userId===1).length,1);
});

test('invalid cross-department staffing does not add the member or lead', async () => {
  const h=harness('milestones.ts');
  const r=await h.request('post','/milestones',{ projectId:1, name:'Test', assigneeUserIds:[3] });
  assert.equal(r.statusCode,201);
  assert.equal(h.rows.milestoneAssigneesTable.length,0);
});

for (const role of ['qa_member','fa_member','dev_member']) {
  test(`${role} can save assignee and text, with audit, but needs project access`,async()=>{
    const h=harness('defects.ts');h.setActor(role,2);
    const r=await h.request('patch','/defects/:id',{ description:'Updated',assigneeId:3 },{id:'1'});
    assert.equal(r.statusCode,200,JSON.stringify(r.body));
    assert.equal(h.rows.defectsTable[0].assigneeId,3);
    assert.equal(h.rows.defectsTable[0].description,'Updated');
    assert.ok(h.audit.length);
    h.setAccess(false);
    assert.equal((await h.request('patch','/defects/:id',{assigneeId:null},{id:'1'})).statusCode,403);
  });
}

test('non-developer cannot combine Root Cause with otherwise permitted edits',async()=>{
  const h=harness('defects.ts');h.setActor('qa_member',2);
  const r=await h.request('patch','/defects/:id',{description:'Must not save',rootCause:'No',assigneeId:3},{id:'1'});
  assert.equal(r.statusCode,403);
  assert.equal(h.rows.defectsTable[0].description,undefined);
  assert.equal(h.rows.defectsTable[0].assigneeId,null);
});

test('task creation/assignment begins development without waiting for In progress',()=>{
  const file=path.resolve(__dirname,'../src/routes/development-task-events.ts');
  const mod=new Module(file,module);
  mod._compile(transformSync(readFileSync(file,'utf8'),{loader:'ts',format:'cjs'}).code,file);
  const {isDevelopmentTaskStart: starts}=mod.exports;
  for(const type of ['task_created','task_assigned','task_submitted_for_review']) assert.equal(starts({type,newValue:null}),true,type);
  assert.equal(starts({type:'task_updated',newValue:JSON.stringify({assigneeIds:[3]})}),true);
  assert.equal(starts({type:'task_status_changed',newValue:JSON.stringify({status:'in_progress'})}),true);
  for(const value of [null,'bad json','{}','{"assigneeIds":[]}','{"name":"Renamed"}']) assert.equal(starts({type:'task_updated',newValue:value}),false);
  assert.equal(starts({type:'requirement_approve',newValue:null}),false);
});

test('standalone assignment supports regular users and clearing an assignee',async()=>{
  const h=harness('defects.ts');h.setActor('qa_member',2);
  let r=await h.request('patch','/defects/:id/assign',{assigneeId:3},{id:'1'});
  assert.equal(r.statusCode,200,JSON.stringify(r.body));
  assert.equal(h.rows.defectsTable[0].assigneeId,3);
  r=await h.request('patch','/defects/:id/assign',{assigneeId:null},{id:'1'});
  assert.equal(r.statusCode,200,JSON.stringify(r.body));
  assert.equal(h.rows.defectsTable[0].assigneeId,null);
  h.setAccess(false);
  assert.equal((await h.request('patch','/defects/:id/assign',{assigneeId:3},{id:'1'})).statusCode,403);
});

test('developer Root Cause editing remains available',async()=>{
  const h=harness('defects.ts');h.setActor('dev_member',3);
  const r=await h.request('patch','/defects/:id',{rootCause:'Validation missing',resolutionSummary:'Added validation'},{id:'1'});
  assert.equal(r.statusCode,200,JSON.stringify(r.body));
  assert.equal(h.rows.defectsTable[0].rootCause,'Validation missing');
});

test('reassigning an existing member restores a missing lead without duplicating members',async()=>{
  const h=harness('milestones.ts');
  await h.request('post','/milestones',{projectId:1,name:'Legacy'});
  h.rows.milestoneAssigneesTable.push({milestoneId:1,userId:2});
  for(let n=0;n<2;n++) {
    const r=await h.request('post','/milestones/:id/assignees',{userId:2},{id:'1'});
    assert.equal(r.statusCode,200);
  }
  assert.deepEqual(h.rows.milestoneAssigneesTable.map(r=>r.userId).sort(),[1,2]);
});
