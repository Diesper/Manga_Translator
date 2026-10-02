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

console.log('Lifecycle authority append-only self-test: SUCCESS');
