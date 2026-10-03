'use strict';

const assert = require('assert');
const guard = require('./verify-lifecycle-artifacts-append-only');
const life = require('../bible/core/lifecycle-core');

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

const humanState={
  index:191,
  status:'HUMAN_LOCKED',
  file:'fixture.test.js',
  bible:'docs/biblia/fixture/Bíblia.md',
  source_sha:'a'.repeat(40),
  bible_sha:'b'.repeat(40),
  history:[],
};
for(let i=1;i<=7;i+=1){
  humanState.history.push({
    at_utc:'2026-10-01T'+String(i).padStart(2,'0')+':10:00Z',
    type:life.HANDOFF_EVENT,
    source_sha:humanState.source_sha,
    bible_sha:humanState.bible_sha,
    production_sha:'c'.repeat(40),
    agent:'A'+i,
  });
}
const snap=life.lifecycleSnapshot(humanState);
const approval={
  schema_version:2,
  approval_id:'191-human-fixture',
  index:191,
  locked_cycle:snap.current_escalation_cycle,
  decision:'ALLOW_ONE_CORRECTION',
  permission:'ONE_CORRECTION_CYCLE',
  approved_by:'human-reviewer',
  approved_at_utc:'2026-10-02T08:00:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  workflow_run_id:'123',
  workflow_run_attempt:1,
  workflow_name:'Bible Human Approval',
  repository:'Diesper/Manga_Translator',
  target_branch:'docs/project-bible',
  branch_head_sha:'d'.repeat(40),
  production_sha:snap.production_sha,
  test_sha:snap.test_sha,
  bible_sha:snap.bible_sha,
  revision_id:snap.revision_id,
};
assert.deepStrictEqual(guard.approvalStateBindingProblems(approval,humanState),[]);
assert.ok(guard.approvalStateBindingProblems({...approval,locked_cycle:8},humanState)
  .some((x)=>x.includes('locked_cycle diverge')));
assert.ok(guard.approvalStateBindingProblems({...approval,revision_id:'e'.repeat(64)},humanState)
  .some((x)=>x.includes('revision_id diverge')));
assert.ok(guard.approvalStateBindingProblems(approval,{...humanState,status:'READY_FOR_AUDIT'})
  .some((x)=>x.includes('HUMAN_LOCKED')));
console.log('PASS approval provenance binds exact HUMAN state/cycle/revision');

console.log('Lifecycle authority append-only self-test: SUCCESS');
