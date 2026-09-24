const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/ai-rephrase.ts'), 'utf8');
const module_ = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, { module: module_, exports: module_.exports });
const { cleanRephrased, buildRephrasePrompt, REPHRASE_SYSTEM_PROMPT } = module_.exports;

const original = 'Specify how the system handles a failed OTP attempt';

test('plain prose passes through trimmed', () => {
  assert.equal(cleanRephrased('  The system must lock the account after three failed OTP attempts.  ', original),
    'The system must lock the account after three failed OTP attempts.');
});

test('category labels, code fences and wrapping quotes are stripped', () => {
  assert.equal(cleanRephrased('Missing Items: The system rejects an expired OTP.', original), 'The system rejects an expired OTP.');
  assert.equal(cleanRephrased('```\nThe system rejects an expired OTP.\n```', original), 'The system rejects an expired OTP.');
  assert.equal(cleanRephrased('"The system rejects an expired OTP."', original), 'The system rejects an expired OTP.');
});

test('empty or whitespace output is rejected so the caller falls back', () => {
  assert.equal(cleanRephrased('', original), null);
  assert.equal(cleanRephrased('   \n ', original), null);
  assert.equal(cleanRephrased(undefined, original), null);
  assert.equal(cleanRephrased(null, original), null);
});

test('runaway output far longer than the input is rejected', () => {
  assert.equal(cleanRephrased('x'.repeat(original.length * 3 + 400), original), null);
  assert.notEqual(cleanRephrased('x'.repeat(original.length * 2), original), null);
});

test('the prompt carries the title, current description and suggestion, and forbids labels', () => {
  const p = buildRephrasePrompt('Login', 'Users log in with OTP.', 'Handle lockout');
  assert.match(p, /Login/); assert.match(p, /Users log in with OTP\./); assert.match(p, /Handle lockout/);
  assert.match(buildRephrasePrompt('T', null, 's'), /Existing description: Not provided/);
  assert.match(REPHRASE_SYSTEM_PROMPT, /Missing Items/);
});
