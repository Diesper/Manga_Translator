'use strict';

const assert = require('assert');
const lifecycle = require('./lifecycle-core');
const { buildAuditResult } = require('./audit-result');

function baseState() {
  return {
    index: 12,
    status: 'READY_FOR_AUDIT',
    file: 'fixture.js',
    bible: 'docs/biblia/fixture/Bíblia.md',
    source_sha: 'a'.repeat(40),
    bible_sha: 'b'.repeat(40),
    history: [],
  };
}

let state = baseState();
let pipeline = { next_phase: 'PRIMARY' };
let result = buildAuditResult(state, pipeline, {
  phase:'PRIMARY',
  auditor:'AUDITOR-1',
  verdict:'APPROVED',
  completed_at_utc:'2026-10-02T06:00:00Z',
  findings:[],
});
assert.strictEqual(result.schema_version, 2);
console.log('PASS pre-handoff audit writer remains migration-compatible');

state = baseState();
state.history.push({
  at_utc:'2026-10-02T07:00:00Z',
  type:lifecycle.HANDOFF_EVENT,
  source_sha:state.source_sha,
  bible_sha:state.bible_sha,
  production_sha:'c'.repeat(40),
});
result = buildAuditResult(state, pipeline, {
  phase:'PRIMARY',
  auditor:'AUDITOR-1',
  verdict:'APPROVED',
  completed_at_utc:'2026-10-02T07:01:00Z',
  findings:[],
});
assert.strictEqual(result.schema_version, 3);
assert.strictEqual(result.audit_epoch,1);
assert.ok(result.handoff_id);
assert.ok(/^[0-9a-f]{64}$/.test(result.revision_id));
assert.strictEqual(result.test_sha,state.source_sha);
console.log('PASS post-handoff writer emits lifecycle-bound schema v3');

assert.throws(()=>buildAuditResult(state,{next_phase:'ADVERSARIAL'},{
  phase:'PRIMARY',auditor:'AUDITOR-1',verdict:'APPROVED',completed_at_utc:'2026-10-02T07:01:00Z'
}),/PHASE_NOT_CURRENT/);
console.log('PASS writer refuses wrong audit phase');

for(let i=2;i<=7;i+=1){
 state.history.push({
  at_utc:'2026-10-02T0'+i+':10:00Z',
  type:lifecycle.HANDOFF_EVENT,
  source_sha:state.source_sha,
  bible_sha:state.bible_sha,
  production_sha:'c'.repeat(40),
 });
}
state.status='HUMAN_LOCKED';
const snap=lifecycle.lifecycleSnapshot(state);
assert.throws(()=>buildAuditResult(state,pipeline,{
  phase:'PRIMARY',auditor:'AUDITOR-1',verdict:'APPROVED',completed_at_utc:'2026-10-02T08:01:00Z'
},[]),/HUMAN_AUDIT_APPROVAL_REQUIRED/);

const approval={
  schema_version:1,
  approval_id:'012-human-audit',
  index:12,
  locked_cycle:7,
  decision:'ALLOW_AUDIT_ONLY',
  permission:null,
  approved_by:'human',
  approved_at_utc:'2026-10-02T08:00:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  production_sha:snap.production_sha,
  test_sha:snap.test_sha,
  bible_sha:snap.bible_sha,
  revision_id:snap.revision_id,
};
result=buildAuditResult(state,pipeline,{
  phase:'PRIMARY',auditor:'AUDITOR-1',verdict:'APPROVED',completed_at_utc:'2026-10-02T08:01:00Z'
},[approval]);
assert.strictEqual(result.human_approval_id,approval.approval_id);
console.log('PASS HUMAN audit result records ALLOW_AUDIT_ONLY approval');

console.log('Audit result writer self-test: SUCCESS');
