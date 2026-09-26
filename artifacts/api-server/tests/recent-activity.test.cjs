// Run with PGLITE_PATH pointing to an isolated @electric-sql/pglite installation.
// No application database or network is used.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');
let db, handler, code, actor = { userId: 1 }, fail = false;
before(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE roles(name text, tier_rank integer, department text);
    CREATE TABLE users(id integer, name text, role text);
    CREATE TABLE projects(id integer, name text);
    CREATE TABLE project_members(project_id integer,user_id integer,module_id integer,module_ids integer[]);
    CREATE TABLE execution_modules(id integer,name text);
    CREATE TABLE requirements(id integer,project_id integer,title text,module text);
    CREATE TABLE test_cases(LIKE requirements);
    CREATE TABLE defects(LIKE requirements); ALTER TABLE defects ADD source text;
    CREATE TABLE milestones(id integer,project_id integer,name text);
    CREATE TABLE tasks(id integer,project_id integer,name text,module_id integer,module_ids text,requirement_id integer);
    CREATE TABLE risks(id integer,project_id integer,title text);
    CREATE TABLE execution_files(id integer,project_id integer,title text,redmine_ticket_id text,selected_module_ids integer[],selected_modules text);
    CREATE TABLE execution_test_cases(id integer,execution_file_id integer,case_name text,module_name text);
    CREATE TABLE activity(id integer,type text,user_id integer,entity_id integer,entity_type text,description text,created_at timestamptz);
    INSERT INTO roles VALUES ('qa_member',1,'qa'),('qa_lead',2,'qa'),('qa_manager',3,'qa'),('pm_lead',2,'pm'),('dev_member',1,'dev'),('cto',5,NULL);
    INSERT INTO users VALUES (1,'QA','qa_member'),(2,'Lead','qa_lead'),(3,'Other QA','qa_member'),(4,'Dev','dev_member'),(5,'PM','pm_lead'),(6,'Admin','admin'),(7,'Manager','qa_manager'),(8,'No projects','qa_member'),(9,'Restricted','qa_member'),(10,'CTO','cto');
    INSERT INTO projects VALUES (1,'Shared'),(2,'Private');
    INSERT INTO project_members VALUES (1,1,NULL,NULL),(1,2,NULL,NULL),(2,3,NULL,NULL),(1,4,NULL,NULL),(1,5,NULL,NULL),(1,9,1,NULL);
    INSERT INTO execution_modules VALUES (1,'Allowed'),(2,'Restricted');
    INSERT INTO requirements VALUES (1,1,'Public title','Allowed'),(2,2,'Private title','Allowed'),(3,1,'Restricted title','Restricted');
    INSERT INTO activity VALUES
      (1,'requirement_approve',1,1,'requirement','SECRET review comment','2026-09-25T10:00:00.000001Z'),
      (2,'requirement_update',4,1,'requirement','SECRET','2026-09-25T10:00:00.000002Z'),
      (3,'requirement_update',3,2,'requirement','SECRET','2026-09-25T11:00:00Z'),
      (4,'user_login',1,1,'requirement','login','2026-09-25T12:00:00Z'),
      (5,'user_logout',1,NULL,'user','logout','2026-09-25T13:00:00Z'),
      (6,'requirement_deleted',1,99,'requirement','deleted secret','2026-09-25T14:00:00Z'),
      (7,'requirement_update',1,3,'requirement','SECRET','2026-09-25T15:00:00Z');
  `);
  const filename = path.resolve(__dirname, '../src/routes/recent-activity.ts');
  const mod = new Module(filename, module);
  mod.require = name => {
    if (name === 'express') return { Router: () => ({ get: (_, fn) => { handler = fn; } }) };
    if (name === '@workspace/db') return { pool: { query: (...args) => { if (fail) throw new Error('offline'); return db.query(...args); } } };
    if (name === '../middleware/access') return { getAuthContext: () => actor };
    return require(name);
  };
  mod._compile(transformSync(fs.readFileSync(filename,'utf8'),{ loader:'ts',format:'cjs' }).code, filename);
  code = mod.exports;
});
after(async () => { await db.close(); });
async function request(userId, query = {}, options = false) {
  actor = userId ? { userId } : null;
  const res = { statusCode:200,status(n){ this.statusCode=n; return this; },json(data){this.data=data;} };
  await handler({ query,path:options ? '/dashboard/activity/options' : '/dashboard/activity' },res);
  return res;
}
test('requires authentication',async()=>assert.equal((await request(null)).statusCode,401));
test('only returns accessible work, omits auth events and orphan records',async()=> {
  const r=await request(1); assert.equal(r.statusCode,200); assert.deepEqual(r.data.map(x=>x.id),[7,2,1]);
  assert.ok(!JSON.stringify(r.data).includes('SECRET')); assert.equal(r.data[0].projectName,'Shared');
});
test('empty membership grants nothing',async()=>assert.deepEqual((await request(8)).data,[]));
test('explicit foreign project and unauthorized member filters are forbidden',async()=>{
  assert.equal((await request(1,{projectId:'2'})).statusCode,403);
  assert.equal((await request(1,{userId:'4'})).statusCode,403);
  assert.equal((await request(2,{userId:'3'})).statusCode,403);
});
test('member predicate precedes limit and cursor preserves microseconds',async()=>{
  const first=await request(1,{userId:'1',limit:'1'});assert.equal(first.data[0].id,7);
  const second=await request(1,{userId:'1',limit:'1',cursor:first.data[0].cursor});assert.equal(second.data[0].id,1);
  const all=await request(1,{limit:'2'});assert.deepEqual(all.data.map(x=>x.id),[7,2]);
  const next=await request(1,{limit:'2',cursor:all.data[1].cursor});assert.deepEqual(next.data.map(x=>x.id),[1]);
});
test('module-restricted member cannot see other modules',async()=>assert.deepEqual((await request(9)).data.map(x=>x.id),[2,1]));
test('lead member choices are department scoped; PM includes other departments',async()=>{
  const lead=await request(2,{},true);assert.deepEqual(lead.data.members.map(x=>x.id).sort((a,b)=>a-b),[1,2,9]);
  const pm=await request(5,{},true);assert.ok(pm.data.members.some(x=>x.id===4));assert.ok(!pm.data.members.some(x=>x.id===3));
});
test('manager department scope and admin/CTO organization scope',async()=>{
  for(const id of [6,7,10])assert.deepEqual((await request(id)).data.map(x=>x.id),[7,3,2,1]);
});
test('validates limits IDs and cursors instead of silently broadening query',async()=>{
  for(const query of [{limit:'0'},{limit:'101'},{limit:'-1'},{userId:'oops'},{projectId:['1','2']},{cursor:'bad'}])assert.equal((await request(1,query)).statusCode,400);
});
test('database failure fails closed',async()=>{
  fail=true; const original=console.error;console.error=()=>{};
  try {const result=await request(1);assert.equal(result.statusCode,503);assert.ok(!Array.isArray(result.data));}
  finally {fail=false;console.error=original;}
});
test('equal timestamps use descending IDs without duplicate or missing rows',async()=>{
  await db.exec(`INSERT INTO activity VALUES (20,'requirement_update',1,1,'requirement','secret','2026-09-26T10:00:00Z'),(21,'requirement_update',1,1,'requirement','secret','2026-09-26T10:00:00Z')`);
  try {
    const a=await request(1,{limit:'1'});assert.equal(a.data[0].id,21);
    const b=await request(1,{limit:'1',cursor:a.data[0].cursor});assert.equal(b.data[0].id,20);
  } finally {await db.exec('DELETE FROM activity WHERE id IN (20,21)');}
});
test('resource mappings produce project-aware links and exclude mixed-module files',async()=>{
  await db.exec(`
    INSERT INTO defects VALUES (20,1,'Defect title','Allowed','production');
    INSERT INTO milestones VALUES (20,1,'Milestone title');
    INSERT INTO tasks VALUES (20,1,'Task title',1,NULL,1);
    INSERT INTO risks VALUES (20,1,'Risk title');
    INSERT INTO test_cases VALUES (20,1,'Test title','Allowed');
    INSERT INTO execution_files VALUES (20,1,'File title','T / 20',ARRAY[1,2],NULL);
    INSERT INTO execution_test_cases VALUES (20,20,'Case title','Allowed');
    INSERT INTO activity SELECT 30 + row_number() OVER (), 'work_updated', 1, 20, kind, 'secret', '2026-09-26T10:00:00Z'::timestamptz
      FROM (VALUES ('defect'),('milestone'),('task'),('risk'),('test_case'),('execution'),('execution_file'),('execution_test_case')) kinds(kind);
  `);
  try {
    const normal=await request(1);const byKind=Object.fromEntries(normal.data.filter(x=>x.id>30).map(x=>[x.entityType,x]));
    assert.equal(byKind.defect.href,'/defects?highlight=20&tab=production');
    assert.equal(byKind.milestone.href,'/milestones?projectId=1&highlight=20');
    assert.equal(byKind.task.href,'/requirements/1');
    assert.equal(byKind.execution.href,'/test-cases/execution/T%20%2F%2020');
    assert.equal(Object.keys(byKind).length,8);
    const restricted=await request(9);assert.deepEqual(restricted.data.filter(x=>x.id>30).map(x=>x.entityType).sort(),['defect','execution_test_case','task','test_case']);
  } finally {await db.exec('DELETE FROM activity WHERE id > 30');}
});
