const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const source = fs.readFileSync(path.join(__dirname, '../../qm-pulse/src/lib/attachment-download.ts'), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
const { openAttachmentResponse } = mod.exports;
const originalWindow = global.window;
const originalDocument = global.document;
after(() => { global.window = originalWindow; global.document = originalDocument; });

function browser() {
  const downloads = [];
  let closed = false;
  const preview = { opener: {}, location: { href: '' }, close() { closed = true; } };
  const cleanup = [];
  global.window = { setTimeout(fn) { cleanup.push(fn); } };
  global.document = {
    body: { appendChild() {} },
    createElement() { return { href: '', download: '', click() { downloads.push(this.download); }, remove() {} }; },
  };
  return { downloads, preview, cleanup, get closed() { return closed; } };
}
function response(mime, disposition = 'inline') {
  return new Response('attachment contents', { headers: { 'Content-Type': mime, 'Content-Disposition': disposition } });
}

test('View on Word, Excel, ZIP and unknown formats downloads using the supplied filename, not a blob UUID', async () => {
  for (const [mime, name] of [
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Compare Quota Details_Final Approval.docx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Results.xlsx'],
    ['application/zip', 'Evidence.zip'],
    ['application/octet-stream', 'Original.bin'],
  ]) {
    const b = browser();
    await openAttachmentResponse(response(mime, 'attachment'), name, true, b.preview);
    assert.deepEqual(b.downloads, [name]);
    assert.equal(b.closed, true);
    assert.equal(b.preview.location.href, '');
    b.cleanup.forEach(fn => fn());
  }
});
test('explicit download preserves Unicode, spaces, punctuation and extension', async () => {
  const b = browser();
  const name = 'Bukti 审批 – final (2).png';
  await openAttachmentResponse(response('image/png'), name, false, null);
  assert.deepEqual(b.downloads, [name]);
  b.cleanup.forEach(fn => fn());
});
test('supported images, PDF and plain text still preview', async () => {
  for (const mime of ['image/png', 'application/pdf', 'text/plain; charset=utf-8']) {
    const b = browser();
    await openAttachmentResponse(response(mime), 'evidence', true, b.preview);
    assert.match(b.preview.location.href, /^blob:/);
    assert.equal(b.preview.opener, null);
    assert.deepEqual(b.downloads, []);
    assert.equal(b.closed, false);
    b.cleanup.forEach(fn => fn());
  }
});
test('server attachment disposition overrides preview and blocked popups do not prevent downloads', async () => {
  const b = browser();
  await openAttachmentResponse(response('application/pdf', 'attachment; filename="report.pdf"'), 'report.pdf', true, null);
  assert.deepEqual(b.downloads, ['report.pdf']);
  b.cleanup.forEach(fn => fn());
});
test('blocked supported preview reports an error', async () => {
  const b = browser();
  await assert.rejects(openAttachmentResponse(response('image/png'), 'image.png', true, null), /blocked/);
  assert.deepEqual(b.downloads, []);
});
test('failed reads never initiate a download', async () => {
  const b = browser();
  const res = response('application/octet-stream');
  res.blob = async () => { throw new Error('Network interrupted'); };
  await assert.rejects(openAttachmentResponse(res, 'file.docx', true, b.preview), /Network interrupted/);
  assert.deepEqual(b.downloads, []);
});

// Run the production download handler with isolated DB/auth boundaries. Use
// Express's real attachment encoder to verify names survive HTTP headers.
const express = require('express');
const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/test-execution.ts'), 'utf8');
const routeStart = routeSource.indexOf('router.get("/execution-test-cases/:rowId/evidence/:evidenceId/download"');
const routeEnd = routeSource.indexOf('\nrouter.delete(', routeStart);
const routeCode = transformSync(routeSource.slice(routeStart, routeEnd), { loader: 'ts', format: 'cjs' }).code;
async function runRoute(evidence, inline = false, authorized = true) {
  let handler;
  const headers = {};
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; },
    send(body) { this.body = body; },
    setHeader(key, value) { headers[key.toLowerCase()] = value; },
    getHeader(key) { return headers[key.toLowerCase()]; },
    type() { return this; },
    set(key, value) { this.setHeader(key, value); return this; },
    attachment: express.response.attachment,
  };
  const deps = {
    router: { get(_path, callback) { handler = callback; } },
    requireAuth: () => ({ userId: 1 }),
    getExecutionEvidenceScope: async () => ({ projectId: 1 }),
    canAccessFileProject: async () => authorized,
    db: { select: () => ({ from: () => ({ where: async () => evidence ? [evidence] : [] }) }) },
    executionTcEvidenceTable: {}, eq() {}, and() {},
    SAFE_INLINE_EVIDENCE_MIME: new Set(['image/png', 'application/pdf', 'text/plain']),
    Buffer,
  };
  new Function(...Object.keys(deps), routeCode)(...Object.values(deps));
  await handler({ params: { rowId: '1', evidenceId: '2' }, query: inline ? { inline: '1' } : {} }, res);
  return { res, headers };
}
test('execution endpoint preserves original filename and exact file bytes', async () => {
  const { res, headers } = await runRoute({ originalFileName: 'Compare Quota Details_Final Approval.docx', fileName: 'TC-123_40826_20260928.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dataBase64: Buffer.from('word bytes').toString('base64') }, true);
  assert.equal(headers['content-disposition'], 'attachment; filename="Compare Quota Details_Final Approval.docx"');
  assert.equal(res.body.toString(), 'word bytes');
});
test('execution endpoint supports legacy names, Unicode and PDF previews', async () => {
  const legacy = await runRoute({ fileName: 'legacy.pdf', mimeType: 'application/pdf', dataBase64: '' }, true);
  assert.equal(legacy.headers['content-disposition'], 'inline; filename="legacy.pdf"');
  const unicode = await runRoute({ originalFileName: '审批 "final".pdf', fileName: 'internal.pdf', mimeType: 'application/pdf', dataBase64: '' });
  assert.match(unicode.headers['content-disposition'], /filename\*=UTF-8''/);
  assert.ok(unicode.headers['content-disposition'].includes(encodeURIComponent('审批 "final".pdf')));
});
test('execution endpoint still denies other projects and missing evidence', async () => {
  const denied = await runRoute({}, false, false);
  assert.equal(denied.res.statusCode, 403);
  const missing = await runRoute(null);
  assert.equal(missing.res.statusCode, 404);
});

test('HTTP errors never read a body or create a download for requirements and evidence', async () => {
  for (const status of [401, 403, 404, 500]) {
    for (const inline of [false, true]) {
      const b = browser();
      const res = new Response('{"error":"Unavailable"}', { status, headers: { 'Content-Type': 'application/json' } });
      res.blob = async () => { throw new Error('Error body must not be read'); };
      await assert.rejects(openAttachmentResponse(res, 'Requirement.docx', inline, inline ? b.preview : null), new RegExp(`Attachment request failed \\(${status}\\)`));
      assert.deepEqual(b.downloads, []);
      assert.equal(b.preview.location.href, '');
      assert.equal(b.cleanup.length, 0);
    }
  }
});
