'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lifecycle = require('../../../scripts/bible/core/lifecycle-core');
const { buildAuditResult, confirmActionForPhase, publishFindingEvents } = require('../../../scripts/bible/commands/audit-result');

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

assert.strictEqual(confirmActionForPhase('PRIMARY'),'PRIMARY_CONFIRM');
assert.strictEqual(confirmActionForPhase('ADVERSARIAL'),'ADVERSARIAL_CONFIRM');
assert.strictEqual(confirmActionForPhase('REAUDIT'),'REAUDIT_CONFIRM');
assert.throws(()=>confirmActionForPhase('UNKNOWN'),/FINDING_CONFIRM_PHASE_INVALID/);
console.log('PASS finding confirmation action is phase-bound');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'audit-finding-publish-'));
const findingRel='docs/biblia/.coordination/unverified-findings/012/012-UF-001.json';
const findingAbs=path.join(tmp,findingRel);
fs.mkdirSync(path.dirname(findingAbs),{recursive:true});
const findingRevision={
  production_sha:'c'.repeat(40),
  test_sha:'a'.repeat(40),
  bible_sha:'b'.repeat(40),
  revision_id:'d'.repeat(64),
  audit_epoch:1,
  handoff_id:'012-e1-fixture',
};
fs.writeFileSync(findingAbs,JSON.stringify({
  schema_version:1,
  id:'012-UF-001',
  index:12,
  status:'UNVERIFIED',
  reported_by:'CORRETOR-1',
  reported_at_utc:'2026-10-02T06:30:00Z',
  revision_observed:findingRevision,
  title:'fixture',
  finding:'fixture',
  evidence:'fixture',
  suggested_test:'fixture',
  may_change_lifecycle:false,
},null,2)+'\n');

const resultRel='docs/biblia/.coordination/audit-results/012/primary/fixture.json';
const resultAbs=path.join(tmp,resultRel);
fs.mkdirSync(path.dirname(resultAbs),{recursive:true});
const findingAudit={
  schema_version:3,
  index:12,
  phase:'PRIMARY',
  auditor:'AUDITOR-1',
  source_sha:findingRevision.test_sha,
  bible_sha:findingRevision.bible_sha,
  verdict:'CHANGES_REQUIRED',
  findings:['FINDING_ID:012-UF-001'],
  completed_at_utc:'2026-10-02T07:10:00Z',
  production_sha:findingRevision.production_sha,
  test_sha:findingRevision.test_sha,
  audit_epoch:findingRevision.audit_epoch,
  handoff_id:findingRevision.handoff_id,
  revision_id:findingRevision.revision_id,
};
fs.writeFileSync(resultAbs,JSON.stringify(findingAudit,null,2)+'\n');
const eventPaths=publishFindingEvents(tmp,resultRel,findingAudit,{
  confirm_findings:['012-UF-001'],
  reject_findings:[],
});
assert.strictEqual(eventPaths.length,1);
const event=JSON.parse(fs.readFileSync(path.join(tmp,eventPaths[0]),'utf8'));
assert.strictEqual(event.action,'PRIMARY_CONFIRM');
assert.strictEqual(event.auditor,'AUDITOR-1');
assert.strictEqual(event.audit_result_path,resultRel);
fs.rmSync(tmp,{recursive:true,force:true});
console.log('PASS canonical audit publisher emits finding event beside confirming result');

console.log('Audit result writer self-test: SUCCESS');
