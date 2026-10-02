'use strict';

const assert = require('assert');
const guard = require('./verify-lifecycle-artifacts-append-only');

assert.strictEqual(
  guard.protectedArtifact('docs/biblia/.coordination/human-approvals/191/a.json'),
  true
);
assert.strictEqual(
  guard.protectedArtifact('docs/biblia/.coordination/correction-authorizations/191/t.json'),
  true
);
assert.strictEqual(
  guard.protectedArtifact('docs/biblia/.coordination/human-review/191.json'),
  false
);
console.log('PASS authority artifact scope');

assert.strictEqual(guard.trustedAuthorityCommitter({
  name:'github-actions[bot]',
  email:guard.TRUSTED_COMMITTER_EMAIL,
}),true);
assert.strictEqual(guard.trustedAuthorityCommitter({
  name:'AGENTE HÍBRIDO',
  email:'agent@example.invalid',
}),false);
console.log('PASS direct agent committer cannot mint authority artifacts');

const rawLine=':100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40)
  + ' M\tdocs/biblia/.coordination/human-approvals/191/a.json';
const parsed=guard.parseRawHistory(rawLine);
assert.strictEqual(parsed.length,1);
assert.strictEqual(parsed[0].status,'M');
assert.strictEqual(parsed[0].file,'docs/biblia/.coordination/human-approvals/191/a.json');
console.log('PASS historical raw authority change parser');

console.log('Lifecycle authority append-only self-test: SUCCESS');
