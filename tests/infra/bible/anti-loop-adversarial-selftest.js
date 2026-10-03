'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const life = require('../../../scripts/bible/core/lifecycle-core');
const transition = require('../../../scripts/bible/commands/unit-transition');
const human = require('../../../scripts/bible/core/human-gate');
const findingStore = require('../../../scripts/bible/storage/unverified-findings');
const auditCore = require('../../../scripts/bible/core/audit-core');
const humanDiff = require('../../../scripts/validation/verify-human-protected-diff');
const historyGuard = require('../../../scripts/validation/verify-bible-state-history-append-only');

function sha(ch) { return ch.repeat(40); }
function pass(n, message) {
  console.log('PASS bypass ' + String(n).padStart(2,'0') + ' — ' + message);
}

function state(index, cycles, status = 'CHANGES_REQUIRED') {
  const s = {
    index,
    status,
    agent:null,
    file:'tests/fixture-' + index + '.test.js',
    bible:'docs/biblia/tests/fixture-' + index + '/Bíblia.md',
    production_files:['extension/fixture-' + index + '.js'],
    source_sha:sha('a'),
    bible_sha:sha('b'),
    history:[],
  };
  for(let i=1;i<=cycles;i+=1){
    const actor='CORR-' + i;
    s.history.push({
      at_utc:'2026-10-01T'+String(i).padStart(2,'0')+':00:00Z',
      type:'EDITOR_CORRECTION_STARTED',
      from_status:'CHANGES_REQUIRED',
      to_status:'IN_PROGRESS',
      agent:actor,
      source_sha:s.source_sha,
      bible_sha:s.bible_sha,
    });
    s.history.push({
      at_utc:'2026-10-01T'+String(i).padStart(2,'0')+':10:00Z',
      type:life.HANDOFF_EVENT,
      source_sha:s.source_sha,
      bible_sha:s.bible_sha,
      agent:actor,
    });
  }
  return s;
}

function changesPipeline(s) {
  return {
    index:s.index,
    decision:'CHANGES_REQUIRED',
    problems:[],
    source_sha:s.source_sha,
    bible_sha:s.bible_sha,
    primary:{phase:'PRIMARY',verdict:'CHANGES_REQUIRED',auditor:'P',path:'p.json',completed_at_utc:'2026-10-02T06:00:00Z'},
    adversarial:{phase:'ADVERSARIAL',verdict:'CHANGES_REQUIRED',auditor:'A',path:'a.json',completed_at_utc:'2026-10-02T06:01:00Z'},
  };
}

function auditResultV3(s, phase, auditor, at) {
  const snap=life.lifecycleSnapshot(s);
  return {
    schema_version:3,
    index:s.index,
    phase,
    auditor,
    file:s.file,
    bible:s.bible,
    source_sha:s.source_sha,
    bible_sha:snap.bible_sha,
    production_sha:snap.production_sha,
    test_sha:snap.test_sha,
    audit_epoch:snap.audit_epoch,
    handoff_id:snap.handoff_id,
    revision_id:snap.revision_id,
    verdict:'APPROVED',
    findings:[],
    completed_at_utc:at,
    completed_at_ms:Date.parse(at),
    path:'fixture/' + phase + '/' + auditor + '.json',
    legacy:false,
  };
}

// 01 — edit state directly while HUMAN.
const locked=state(12,7,'HUMAN_LOCKED');
assert.ok(humanDiff.problemsForHumanDiff(
  locked,locked,['docs/biblia/.state/012.json'],[]
).length>0);
pass(1,'direct HUMAN .state edit is rejected');

// 02 — decrease correction_cycle projection.
const lowered=JSON.parse(JSON.stringify(locked));
lowered.correction_cycle=1;
assert.ok(life.lifecycleProblems(lowered).some((x)=>x.includes('correction_cycle persistido diverge')));
pass(2,'manual correction_cycle decrease is rejected');

// 03 — downgrade HUMAN to NORMAL/READY.
const downgraded=JSON.parse(JSON.stringify(locked));
downgraded.status='READY_FOR_AUDIT';
downgraded.escalation_level='NORMAL';
const downgradeProblems=life.lifecycleProblems(downgraded);
assert.ok(downgradeProblems.some((x)=>x.includes('escalation_level persistido diverge')));
assert.ok(downgradeProblems.some((x)=>x.includes('correction_cycle >= 7 exige HUMAN_LOCKED')));
pass(3,'HUMAN downgrade to NORMAL/READY is rejected');

// Approval fixture.
const lockedSnap=life.lifecycleSnapshot(locked);
const approval={
  schema_version:1,
  approval_id:'012-human-valid',
  index:12,
  locked_cycle:7,
  decision:'ALLOW_ONE_CORRECTION',
  permission:'ONE_CORRECTION_CYCLE',
  approved_by:'HUMAN-REVIEWER',
  approved_at_utc:'2026-10-02T07:00:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  production_sha:lockedSnap.production_sha,
  test_sha:lockedSnap.test_sha,
  bible_sha:lockedSnap.bible_sha,
  revision_id:lockedSnap.revision_id,
};

// 04 — fabricate approval.
const fakeApproval={...approval,approval_id:'012-human-fake',approval_source:'agent_commit'};
assert.ok(human.validateApproval(fakeApproval).length>0);
assert.strictEqual(human.approvalMatches(locked,lockedSnap,fakeApproval,'ALLOW_ONE_CORRECTION'),false);
pass(4,'fabricated non-workflow HUMAN approval is rejected');

// 05 — reuse approval.
const consumedApprovalState=JSON.parse(JSON.stringify(locked));
consumedApprovalState.history.push({
  at_utc:'2026-10-02T07:01:00Z',
  type:'HUMAN_APPROVAL_CONSUMED',
  approval_id:approval.approval_id,
});
assert.strictEqual(human.approvalMatches(
  consumedApprovalState,life.lifecycleSnapshot(consumedApprovalState),approval,'ALLOW_ONE_CORRECTION'
),false);
pass(5,'consumed HUMAN approval cannot be reused');

// Correction token fixture.
const correctionState=state(20,2,'CHANGES_REQUIRED');
const token=transition.issueCorrectionToken(correctionState,changesPipeline(correctionState),{
  issued_at_utc:'2026-10-02T07:05:00Z',
  actor:'CORRECTOR-20',
});

// 06 — reuse correction token.
const tokenConsumedState=JSON.parse(JSON.stringify(correctionState));
tokenConsumedState.history.push({
  at_utc:'2026-10-02T07:05:01Z',
  type:'CORRECTION_TOKEN_CONSUMED',
  correction_token_id:token.token_id,
  actor:'CORRECTOR-20',
});
assert.ok(transition.validateCorrectionToken(tokenConsumedState,token,{actor:'CORRECTOR-20'})
  .includes('TOKEN_ALREADY_CONSUMED'));
pass(6,'consumed correction token cannot be reused');

// Audit lifecycle fixture after policy.
const auditState={
  ...state(30,0,'READY_FOR_AUDIT'),
  source_sha:sha('3'),
  bible_sha:sha('4'),
  history:[{
    at_utc:'2026-10-02T07:10:00Z',
    type:life.HANDOFF_EVENT,
    source_sha:sha('3'),
    bible_sha:sha('4'),
    production_sha:sha('5'),
    agent:'CORR-30',
  }],
};
const auditSnap=life.lifecycleSnapshot(auditState);
const primaryCurrent=auditResultV3(auditState,'PRIMARY','AUDITOR-P','2026-10-02T07:11:00Z');

// 07 — old epoch result.
const oldEpoch={...primaryCurrent,audit_epoch:auditSnap.audit_epoch-1};
let auditPipeline=auditCore.resolveAuditPipeline(auditState,[oldEpoch],new Map(),{root:null,baseline:null});
assert.strictEqual(auditPipeline.decision,'WAITING_PRIMARY');
pass(7,'audit result from an earlier epoch is ignored');

// 08 — other handoff result.
const wrongHandoff={...primaryCurrent,handoff_id:auditSnap.handoff_id+'-other'};
auditPipeline=auditCore.resolveAuditPipeline(auditState,[wrongHandoff],new Map(),{root:null,baseline:null});
assert.strictEqual(auditPipeline.decision,'WAITING_PRIMARY');
pass(8,'audit result from another handoff is ignored');

// 09 — create finding and try to open correction.
const findingState=state(40,2,'READY_FOR_AUDIT');
const finding=findingStore.buildFinding(findingState,life.lifecycleSnapshot(findingState),{
  id:'040-UF-001',
  reported_by:'CORRECTOR-40',
  reported_at_utc:'2026-10-02T07:15:00Z',
  title:'possible issue',
  finding:'needs independent proof',
  evidence:'read-only observation',
  suggested_test:'reproduce independently',
});
assert.strictEqual(finding.status,'UNVERIFIED');
assert.throws(()=>transition.issueCorrectionToken(findingState,{
  index:40,
  decision:'WAITING_ADVERSARIAL',
  problems:[],
  source_sha:findingState.source_sha,
  bible_sha:findingState.bible_sha,
  primary:{phase:'PRIMARY',verdict:'CHANGES_REQUIRED',auditor:'P40'},
  adversarial:null,
},{
  issued_at_utc:'2026-10-02T07:16:00Z',
  actor:'CORRECTOR-40',
}),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
pass(9,'UNVERIFIED finding cannot open correction');

// 10 — same corrector at cycle 5.
const cycle5=state(50,5,'CHANGES_REQUIRED');
assert.strictEqual(life.correctorEligibility(cycle5,'CORR-5').eligible,false);
pass(10,'cycle 5 blocks the previous corrector');

// 11 — either of the last two at cycle 6.
const cycle6=state(60,6,'CHANGES_REQUIRED');
assert.strictEqual(life.correctorEligibility(cycle6,'CORR-6').eligible,false);
assert.strictEqual(life.correctorEligibility(cycle6,'CORR-5').eligible,false);
assert.strictEqual(life.correctorEligibility(cycle6,'NEW-CORR').eligible,true);
pass(11,'cycle 6 blocks both recent correctors and permits a different one');

// 12 — alter source/production during HUMAN.
assert.ok(humanDiff.problemsForHumanDiff(locked,locked,[locked.production_files[0]],[]).length>0);
pass(12,'HUMAN production/source mutation is rejected');

// 13 — alter test during HUMAN.
assert.ok(humanDiff.problemsForHumanDiff(locked,locked,[locked.file],[]).length>0);
pass(13,'HUMAN test mutation is rejected');

// 14 — alter Bible during HUMAN.
assert.ok(humanDiff.problemsForHumanDiff(locked,locked,[locked.bible],[]).length>0);
pass(14,'HUMAN Bible mutation is rejected');

// 15 — change revision after token issuance.
const changedRevision={...correctionState,source_sha:sha('9')};
const staleTokenProblems=transition.validateCorrectionToken(changedRevision,token,{actor:'CORRECTOR-20'});
assert.ok(staleTokenProblems.includes('TOKEN_TEST_STALE'));
assert.ok(staleTokenProblems.includes('TOKEN_REVISION_STALE'));
pass(15,'revision change invalidates previously issued correction token');

// 16 — two agents acquire correction lease.
const reservationRoot=fs.mkdtempSync(path.join(os.tmpdir(),'anti-loop-reservation-'));
try{
  transition.createCorrectionReservation(
    reservationRoot,correctionState,'AGENT-A','2026-10-02T07:20:00Z',token
  );
  assert.throws(()=>transition.createCorrectionReservation(
    reservationRoot,correctionState,'AGENT-B','2026-10-02T07:20:01Z',token
  ),/UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED/);
} finally {
  fs.rmSync(reservationRoot,{recursive:true,force:true});
}
pass(16,'second correction writer is rejected when reservation exists');

// 17 — change only .state without event.
const stateOnly=state(70,2,'IN_PROGRESS');
stateOnly.updated_at_utc='2026-10-01T00:00:00Z';
assert.ok(life.lifecycleProblems(stateOnly)
  .some((x)=>x.includes('IN_PROGRESS sem START_CORRECTION canônico')));
pass(17,'state-only IN_PROGRESS mutation without event is rejected');

// 18 — change only event without projection.
const eventOnly=state(80,2,'CHANGES_REQUIRED');
life.appendLifecycleEvent(eventOnly.history,{
  at_utc:'2026-10-02T07:30:00Z',
  type:'EDITOR_CORRECTION_STARTED',
  from_status:'CHANGES_REQUIRED',
  to_status:'IN_PROGRESS',
  correction_token_id:'corr-event-only',
  agent:'AGENT-EVENT',
});
const eventOnlyProblems=life.lifecycleProblems(eventOnly);
assert.ok(eventOnlyProblems.some((x)=>x.includes('status diverge da projeção')));
assert.ok(eventOnlyProblems.some((x)=>x.includes('projeção lifecycle pós-chain ausente')));
pass(18,'event-only mutation without state projection is rejected');

// 19 — delete old event.
const oldHistory={index:90,history:[
  {at_utc:'2026-10-01T01:00:00Z',type:'A'},
  {at_utc:'2026-10-01T02:00:00Z',type:'B'},
]};
const deletedHistory={index:90,history:[oldHistory.history[0]]};
assert.ok(historyGuard.historyAppendOnlyProblems(oldHistory,deletedHistory)
  .some((x)=>x.includes('history truncado')));
pass(19,'deleting an old lifecycle event is rejected');

// 20 — insert event in the middle.
const insertedHistory={index:90,history:[
  oldHistory.history[0],
  {at_utc:'2026-10-01T01:30:00Z',type:'INSERTED'},
  oldHistory.history[1],
]};
assert.ok(historyGuard.historyAppendOnlyProblems(oldHistory,insertedHistory)
  .some((x)=>x.includes('append-only na posição 1')));
pass(20,'inserting an event in the middle of history is rejected');

console.log('Anti-loop adversarial bypass self-test: SUCCESS — 20/20 bypasses rejected');
