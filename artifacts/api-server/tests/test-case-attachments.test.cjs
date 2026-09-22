const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const express = require('express');
const temp = fs.mkdtempSync(path.join(__dirname, '.attachments-test-'));
let server, base;
// Exercise the real Express handlers, with an isolated database/access boundary.
const state = { files: [], cases: [{ id: 1, projectId: 10, module: 'Login', authorId: 1 }, { id: 2, projectId: 20, module: 'Login', authorId: 3 }, { id: 3, projectId: 10, module: 'Restricted', authorId: 3 }], audits: [], next: 1, execution: { result: 'Passed', libraryTcId: 1, evidence: ['execution-only'] } };
global.__attachmentTest = state;
const mock = `
const state = global.__attachmentTest;
const table = (name, keys) => Object.assign({ name }, Object.fromEntries(keys.map(k => [k, { key: k }])));
export const testCasesTable = table('cases', ['id']);
export const usersTable = table('users', ['id', 'name']);
export const testCaseAttachmentsTable = table('files', ['id','testCaseId','fileName','mimeType','sizeBytes','dataBase64','uploadedBy','createdAt']);
export const eq = (col, value) => row => row[col.key] === value;
export const and = (...checks) => row => checks.every(c => c(row));
export const desc = col => col;
function query(fields) {
  let target, filter = () => true;
  const q = { from(t) { target=t; return q }, leftJoin() { return q }, where(f) { filter=f; return q }, orderBy() { return q }, then(resolve,reject) { return Promise.resolve(state[target.name].filter(filter).map(row => fields ? Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, k === 'uploadedByName' ? 'User '+row.uploadedBy : row[v.key]])) : {...row})).then(resolve,reject) } }; return q;
}
export const db = { select: query, insert(t) { return { values(values) { return { async returning(fields) { const row={...values,id:state.next++,createdAt:new Date()};state[t.name].push(row);return [Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,row[v.key]]))] } } } } }, delete(t) { return { async where(filter) { state[t.name]=state[t.name].filter(row=>!filter(row)) } } } };
export const getAuthContext = req => { const raw=req.headers.authorization; if(!raw) return null; const [userId, role]=raw.split(':'); return {userId:Number(userId),role} };
export const canAccessProject = async (user,role,project) => project === 10 || role === 'admin' || role === 'cto';
export const canAccessModule = async (user,role,project,module) => module !== 'Restricted' || role === 'admin';
export const logActivity = async entry => state.audits.push(entry);
`;
before(async () => {
  await build({ entryPoints: [path.join(__dirname, '../src/routes/test-case-attachments.ts')], outfile: path.join(temp,'router.cjs'), bundle:true, platform:'node', format:'cjs', packages:'external', plugins:[{name:'isolated-boundaries',setup(b){b.onResolve({filter:/^(@workspace\/db|drizzle-orm|\.\.\/middleware\/access|\.\/_audit)$/},args=>({path:'mock',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:mock,loader:'js'}));}}] });
  const app=express(); app.use(express.json({limit:'29mb'})); app.use(require(path.join(temp,'router.cjs')).default);
  server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',error=>error?reject(error):resolve(s));s.on('error',reject)});base=`http://127.0.0.1:${server.address().port}/test-cases`;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});delete global.__attachmentTest;});
const call = (url, user='1:qa_member', method='GET', body) => fetch(base+url,{method,headers:{...(user?{Authorization:user}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const upload = (fileName='reference.txt',mimeType='text/plain',dataBase64=Buffer.from('persistent reference').toString('base64')) => call('/1/attachments','1:qa_member','POST',{fileName,mimeType,dataBase64});

test('library files persist across execution changes, with metadata and exact downloads',async()=>{
  const created=await upload(); assert.equal(created.status,201);const file=await created.json();assert.equal(file.canDelete,true);assert.equal(file.dataBase64,undefined);
  state.execution.result='Failed';
  const list=await (await call('/1/attachments','2:qa_member')).json();assert.equal(list.attachments.length,1);assert.equal(list.attachments[0].canDelete,false);assert.equal(list.attachments[0].dataBase64,undefined);
  const response=await call(`/1/attachments/${file.id}/download?inline=1`,'2:qa_member');assert.equal(response.status,200);assert.equal(await response.text(),'persistent reference');assert.match(response.headers.get('content-disposition'),/^inline/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(state.execution.evidence,['execution-only']);
});
test('other editors may upload but cannot delete another uploader’s file; admins and uploaders can delete',async()=>{
  const file=await (await upload()).json();assert.equal((await call(`/1/attachments/${file.id}`,'2:qa_member','DELETE')).status,403);
  const other=await call('/1/attachments','2:qa_member','POST',{fileName:'other.txt',mimeType:'text/plain',dataBase64:'b3RoZXI='});assert.equal(other.status,201);
  assert.equal((await call(`/1/attachments/${file.id}`,'3:admin','DELETE')).status,204);
  const own=await (await upload()).json();assert.equal((await call(`/1/attachments/${own.id}`,'1:qa_member','DELETE')).status,204);
  assert.equal((await call(`/1/attachments/${own.id}/download`)).status,404);
  const list=await (await call('/1/attachments','2:qa_member')).json();assert.ok(!list.attachments.some(f=>f.id===file.id));assert.deepEqual(state.execution.evidence,['execution-only']);
});
test('authentication, project and module scope apply to all actions; attachments cannot be read through another case',async()=>{
  for(const method of ['GET','POST','DELETE']){const suffix=method==='DELETE'?'/1':'';assert.equal((await call('/1/attachments'+suffix,null,method)).status,401);assert.equal((await call('/2/attachments'+suffix,'1:qa_member',method)).status,403);assert.equal((await call('/3/attachments'+suffix,'1:qa_member',method)).status,403);}
  assert.equal((await call('/2/attachments/1/download','1:qa_member')).status,403);
  assert.equal((await call('/2/attachments/1/download','3:admin')).status,404);
  assert.equal((await call('/2/attachments/1','3:admin','DELETE')).status,404);
  assert.equal((await call('/999/attachments')).status,404);assert.equal((await call('/nope/attachments')).status,400);
});
test('rejects malformed, empty and oversized data; accepts exactly 20 MB',async()=>{
  for(const data of ['', '%%%%', 'a', '====', 'ab=='])assert.equal((await upload('bad.txt','text/plain',data)).status,400);
  assert.equal((await upload('large.txt','text/plain',Buffer.alloc(20*1024*1024+1).toString('base64'))).status,413);
  const res=await upload('limit.txt','text/plain',Buffer.alloc(20*1024*1024).toString('base64'));assert.equal(res.status,201);const file=await res.json();assert.equal(file.sizeBytes,20*1024*1024);
  await call(`/1/attachments/${file.id}`,'1:qa_member','DELETE');
});
test('active content is download-only and international filenames remain safe',async()=>{
  const file=await (await upload('資料\r\n".html','text/html',Buffer.from('<script>alert(1)</script>').toString('base64'))).json();
  const res=await call(`/1/attachments/${file.id}/download?inline=1`);assert.equal(res.status,200);assert.match(res.headers.get('content-disposition'),/^attachment/);assert.match(res.headers.get('content-type'),/application\/octet-stream/);assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.ok(state.audits.some(e=>e.type==='test_case_attachment_uploaded'));assert.ok(state.audits.some(e=>e.type==='test_case_attachment_deleted'));
});
