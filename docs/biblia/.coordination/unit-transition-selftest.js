'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const life = require('./lifecycle-core');
const transition = require('./unit-transition');

function state(cycles = 0) {
  const s = {
    index: 10,
    status: 'CHANGES_REQUIRED',
    file: 'fixture.js',
    bible: 'docs/biblia/fixture/Bíblia.md',
    source_sha: 'a'.repeat(40),
    bible_sha: 'b'.repeat(40),
    history: [],
  };
  for (let i=1;i<=cycles;i+=1) {
    s.history.push({
      at_utc: '2026-10-01T0' + i + ':00:00Z',
      type: 'EDITOR_CORRECTION_STARTED',
      from_status: 'CHANGES_REQUIRED',
      to_status: 'IN_PROGRESS',
      agent: 'AGENT-' + i,
      source_sha: s.source_sha,
      bible_sha: s.bible_sha,
    });
    s.history.push({
      at_utc: '2026-10-01T0' + i + ':10:00Z',
      type: life.HANDOFF_EVENT,
      source_sha: s.source_sha,
      bible_sha: s.bible_sha,
      agent: 'AGENT-' + i,
    });
  }
  return s;
}
function pipeline(s) {
  return {
    index: s.index,
    decision: 'CHANGES_REQUIRED',
    problems: [],
    source_sha: s.source_sha,
    bible_sha: s.bible_sha,
    primary: { phase:'PRIMARY', verdict:'CHANGES_REQUIRED', auditor:'A1', path:'p.json', completed_at_utc:'2026-10-02T06:00:00Z' },
    adversarial: { phase:'ADVERSARIAL', verdict:'CHANGES_REQUIRED', auditor:'A2', path:'a.json', completed_at_utc:'2026-10-02T06:01:00Z' },
  };
}

let s = state(3);
let snap = life.lifecycleSnapshot(s);
const token = transition.issueCorrectionToken(s, pipeline(s), { issued_at_utc:'2026-10-02T06:30:00Z', actor:'AGENT-X' });
assert.deepStrictEqual(transition.validateCorrectionToken(s, token), []);
console.log('PASS final CHANGES_REQUIRED issues revision-bound token');

const waitingAdversarial = {
  ...pipeline(s),
  decision:'WAITING_ADVERSARIAL',
  adversarial:null,
};
assert.throws(()=>transition.issueCorrectionToken(
  s,
  waitingAdversarial,
  {issued_at_utc:'2026-10-02T06:30:05Z',actor:'AGENT-X'}
),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
console.log('PASS isolated PRIMARY cannot mint correction token');

const divergentNoReaudit = {
  ...pipeline(s),
  decision:'REAUDIT_REQUIRED',
  primary:{...pipeline(s).primary,verdict:'APPROVED'},
  adversarial:{...pipeline(s).adversarial,verdict:'CHANGES_REQUIRED'},
  reaudit:null,
};
assert.throws(()=>transition.issueCorrectionToken(
  s,
  divergentNoReaudit,
  {issued_at_utc:'2026-10-02T06:30:06Z',actor:'AGENT-X'}
),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
console.log('PASS divergence without REAUDIT cannot mint correction token');

const approvedNoCorrection = {
  ...pipeline(s),
  decision:'APPROVED',
  primary:{...pipeline(s).primary,verdict:'APPROVED'},
  adversarial:{...pipeline(s).adversarial,verdict:'APPROVED'},
};
assert.throws(()=>transition.issueCorrectionToken(
  s,
  approvedNoCorrection,
  {issued_at_utc:'2026-10-02T06:30:07Z',actor:'AGENT-X'}
),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
console.log('PASS APPROVED pipeline cannot mint correction token');

assert.throws(()=>transition.planTransition({
  state:s,
  pipeline:pipeline(s),
  token,
  request:{action:'START_CORRECTION',actor:'TOKEN-THIEF',at_utc:'2026-10-02T06:30:30Z'},
}), /TOKEN_ACTOR_MISMATCH/);
console.log('PASS token cannot be transferred to another actor');

const supersededPipeline = pipeline(s);
supersededPipeline.adversarial = {
  ...supersededPipeline.adversarial,
  auditor:'A3',
  path:'a-new.json',
  completed_at_utc:'2026-10-02T06:05:00Z',
};
assert.ok(
  transition.validateCorrectionToken(s, token, { pipeline:supersededPipeline })
    .includes('TOKEN_DECISION_STALE')
);
assert.throws(()=>transition.planTransition({
  state:s,
  pipeline:supersededPipeline,
  token,
  request:{action:'START_CORRECTION',actor:'AGENT-X',at_utc:'2026-10-02T06:30:45Z'},
}),/TOKEN_DECISION_STALE/);
console.log('PASS newer final decision record invalidates previously issued token');

const tokenRoot=fs.mkdtempSync(path.join(os.tmpdir(),'corr-token-registry-'));
const tokenDir=path.join(tokenRoot,'docs','biblia','.coordination','correction-authorizations','010');
fs.mkdirSync(tokenDir,{recursive:true});
fs.writeFileSync(path.join(tokenDir,token.token_id+'.json'),JSON.stringify(token,null,2)+'\n');
const tokenRegistry=transition.loadCorrectionTokens(
  tokenRoot,
  [s],
  {pipelines:new Map([[s.index,supersededPipeline]])}
);
assert.ok(tokenRegistry.problems.some((x)=>x.includes('TOKEN_DECISION_STALE')));
fs.rmSync(tokenRoot,{recursive:true,force:true});
console.log('PASS active token registry also rejects superseded decision before use');

assert.throws(()=>transition.planTransition({
  state:s,
  token,
  request:{action:'START_CORRECTION',actor:'AGENT-X',at_utc:'2026-10-02T06:30:50Z'},
}),/START_CORRECTION_PIPELINE_REQUIRED/);
console.log('PASS correction start cannot bypass current decision by omitting pipeline');

let planned = transition.planTransition({
  state:s,
  pipeline:pipeline(s),
  token,
  currentStateSha:'state-sha',
  request:{
    action:'START_CORRECTION',
    actor:'AGENT-X',
    at_utc:'2026-10-02T06:31:00Z',
    expected_status:'CHANGES_REQUIRED',
    expected_cycle:3,
    expected_revision_id:snap.revision_id,
    expected_state_sha:'state-sha',
  },
});
assert.strictEqual(planned.state.status, 'IN_PROGRESS');
assert.ok(transition.tokenConsumed(planned.state, token.token_id));
assert.ok(planned.state.history.some((e)=>e.correction_token_id===token.token_id));
assert.deepStrictEqual(life.eventChainProblems(planned.state), []);
console.log('PASS token is consumed append-only on correction start');
console.log('PASS canonical transition history remains hash-chained');
assert.deepStrictEqual(transition.tokenHistoryProblems([planned.state],[token]), []);
console.log('PASS registry validates consumed token history');

const aborted = transition.planTransition({
  state:planned.state,
  request:{
    action:'SAFE_ABORT',
    actor:'AGENT-X',
    at_utc:'2026-10-02T06:31:15Z',
    restore_status:'READY_FOR_AUDIT',
    correction_token_id:token.token_id,
    reason:'fixture abort',
  },
});
assert.strictEqual(life.lifecycleSnapshot(aborted.state).correction_cycle,3);
assert.strictEqual(aborted.state.status,'READY_FOR_AUDIT');
console.log('PASS SAFE_ABORT does not increment correction cycle');

const correctedHandoff = transition.planTransition({
  state: planned.state,
  request: {
    action:'HANDOFF_FOR_AUDIT',
    actor:'AGENT-X',
    at_utc:'2026-10-02T06:31:30Z',
    test_sha:'c'.repeat(40),
    bible_sha:'d'.repeat(40),
    production_sha:'e'.repeat(40),
  },
});
const correctedSnapshot = life.lifecycleSnapshot(correctedHandoff.state);
assert.strictEqual(correctedHandoff.state.source_sha,'c'.repeat(40));
assert.strictEqual(correctedHandoff.state.test_sha,'c'.repeat(40));
assert.strictEqual(correctedHandoff.state.bible_sha,'d'.repeat(40));
assert.strictEqual(correctedHandoff.state.production_sha,'e'.repeat(40));
assert.notStrictEqual(correctedSnapshot.revision_id,snap.revision_id);
assert.deepStrictEqual(life.eventChainProblems(correctedHandoff.state),[]);
console.log('PASS handoff freezes corrected production/test/Bible revision rather than stale state binding');


const orphanState = JSON.parse(JSON.stringify(planned.state));
const consumed = orphanState.history.find((entry)=>entry.type==='CORRECTION_TOKEN_CONSUMED');
consumed.correction_token_id = 'corr-missing';
assert.ok(transition.tokenHistoryProblems([orphanState],[token]).some((x)=>x.includes('inexistente')));
console.log('PASS registry rejects orphan token consumption');

const transferredState = JSON.parse(JSON.stringify(planned.state));
const transferred = transferredState.history.find((entry)=>entry.type==='CORRECTION_TOKEN_CONSUMED');
transferred.actor = 'TOKEN-THIEF';
assert.ok(transition.tokenHistoryProblems([transferredState],[token]).some((x)=>x.includes('ator do consumo diverge')));
console.log('PASS registry rejects transferred token consumption');

assert.throws(()=>transition.planTransition({
  state:planned.state,
  token,
  request:{action:'START_CORRECTION',actor:'OTHER',at_utc:'2026-10-02T06:32:00Z'},
}), /START_CORRECTION_STATUS_INVALID|TOKEN_ALREADY_CONSUMED/);
console.log('PASS token cannot be reused');

assert.throws(()=>transition.planTransition({
  state:s,
  token,
  currentStateSha:'new-sha',
  request:{
    action:'START_CORRECTION',
    actor:'AGENT-X',
    at_utc:'2026-10-02T06:31:00Z',
    expected_state_sha:'old-sha',
  },
}), /REJECTED_STATE_CHANGED:state_sha/);
assert.strictEqual(life.lifecycleSnapshot(s).correction_cycle,3);
console.log('PASS stale CAS writer is rejected');
console.log('PASS stale CAS rejection leaves correction cycle unchanged');

transition.assertCas(s,snap,{
  expected_status:'CHANGES_REQUIRED',
  expected_cycle:3,
  expected_revision_id:snap.revision_id,
  expected_state_sha:'state-sha',
},'state-sha');
assert.throws(()=>transition.assertCas(
  s,snap,{expected_status:'READY_FOR_AUDIT'},'state-sha'
),/REJECTED_STATE_CHANGED:status/);
assert.throws(()=>transition.assertCas(
  s,snap,{expected_cycle:4},'state-sha'
),/REJECTED_STATE_CHANGED:cycle/);
assert.throws(()=>transition.assertCas(
  s,snap,{expected_revision_id:'f'.repeat(64)},'state-sha'
),/REJECTED_STATE_CHANGED:revision/);
console.log('PASS CAS correct preconditions pass');
console.log('PASS CAS rejects status, cycle and revision drift independently');

assert.deepStrictEqual(
  transition.revisionBindingProblems(
    {production_sha:'a'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40),revision_id:'d'.repeat(64)},
    {production_sha:'a'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40),revision_id:'d'.repeat(64)}
  ),
  []
);
assert.ok(
  transition.revisionBindingProblems(
    {production_sha:null,test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40),revision_id:'d'.repeat(64)},
    {production_sha:null,test_sha:'e'.repeat(40),bible_sha:'c'.repeat(40),revision_id:'f'.repeat(64)}
  ).includes('TEST')
);
console.log('PASS live working revision drift invalidates token binding');

const reservationRoot=fs.mkdtempSync(path.join(os.tmpdir(),'corr-reservation-'));
const reservationState=state(3);
reservationState.file='fixture/a.js';
reservationState.bible='docs/biblia/fixture/a.js/Bíblia.md';
const reservationToken={token_id:'corr-fixture',revision_id:'r'.repeat(64),correction_cycle:3};
const reservationRel=transition.createCorrectionReservation(
  reservationRoot,reservationState,'WRITER-A','2026-10-02T06:35:00Z',reservationToken
);
assert.strictEqual(transition.assertCorrectionReservation(reservationRoot,reservationState,'WRITER-A'),reservationRel);
assert.throws(()=>transition.createCorrectionReservation(
  reservationRoot,reservationState,'WRITER-B','2026-10-02T06:35:01Z',reservationToken
),/UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED/);
const secondReservationState={...reservationState,file:'fixture/b.js',bible:'docs/biblia/fixture/b.js/Bíblia.md'};
assert.throws(()=>transition.createCorrectionReservation(
  reservationRoot,secondReservationState,'WRITER-A','2026-10-02T06:35:02Z',reservationToken
),/CORRECTOR_ALREADY_RESERVED/);
transition.releaseCorrectionReservation(reservationRoot,reservationState,'WRITER-A');
assert.throws(()=>transition.assertCorrectionReservation(reservationRoot,reservationState,'WRITER-A'),/CORRECTION_RESERVATION_REQUIRED/);
fs.rmSync(reservationRoot,{recursive:true,force:true});
console.log('PASS correction reservation grants one writer and rejects concurrent second writer');

s = state(6);
snap = life.lifecycleSnapshot(s);
const emergencyToken = transition.issueCorrectionToken(s, pipeline(s), { issued_at_utc:'2026-10-02T06:40:00Z', actor:'NEW-AGENT' });
assert.throws(()=>transition.planTransition({
  state:s,
  pipeline:pipeline(s),
  token:emergencyToken,
  request:{action:'START_CORRECTION',actor:'NEW-AGENT',at_utc:'2026-10-02T06:41:00Z'},
}), /EMERGENCY_ROOT_CAUSE_REVIEW_REQUIRED/);
planned = transition.planTransition({
  state:s,
  pipeline:pipeline(s),
  token:emergencyToken,
  request:{
    action:'START_CORRECTION',
    actor:'NEW-AGENT',
    at_utc:'2026-10-02T06:41:00Z',
    root_cause_review:{categories:['CONCURRENCY'],evidence:'reproduzido',strategy:'mudar arquitetura'},
  },
});
planned = transition.planTransition({
  state:planned.state,
  request:{action:'HANDOFF_FOR_AUDIT',actor:'NEW-AGENT',at_utc:'2026-10-02T06:50:00Z'},
});
assert.strictEqual(planned.state.status, 'HUMAN_LOCKED');
assert.strictEqual(life.lifecycleSnapshot(planned.state).correction_cycle, 7);
console.log('PASS cycle 6 handoff escalates to HUMAN_LOCKED');

const hs = planned.state;
const hsnap = life.lifecycleSnapshot(hs);
const approval = {
  schema_version:1,
  approval_id:'human-10-1',
  index:10,
  locked_cycle:7,
  decision:'ALLOW_ONE_CORRECTION',
  permission:'ONE_CORRECTION_CYCLE',
  approved_by:'human',
  approved_at_utc:'2026-10-02T07:00:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  production_sha:hsnap.production_sha,
  test_sha:hsnap.test_sha,
  bible_sha:hsnap.bible_sha,
  revision_id:hsnap.revision_id,
};
const humanToken = transition.issueCorrectionToken(hs, pipeline(hs), {
  issued_at_utc:'2026-10-02T07:01:00Z',
  actor:'HUMAN-AUTHORIZED-AGENT',
  humanApproval:approval,
});
planned = transition.planTransition({
  state:hs,
  pipeline:pipeline(hs),
  token:humanToken,
  humanApproval:approval,
  request:{action:'START_CORRECTION',actor:'HUMAN-AUTHORIZED-AGENT',at_utc:'2026-10-02T07:02:00Z'},
});
assert.strictEqual(planned.state.status,'IN_PROGRESS');
assert.ok(planned.state.history.some((e)=>e.type==='HUMAN_APPROVAL_CONSUMED'));
assert.strictEqual(life.activeHumanAuthorizedCorrection(planned.state), true);
assert.deepStrictEqual(life.lifecycleProblems(planned.state), []);
console.log('PASS HUMAN approval unlocks exactly one correction without disabling HUMAN quarantine');

const resetApproval = {
  ...approval,
  approval_id:'human-10-reset',
  decision:'RESET_ESCALATION',
  permission:null,
  approved_at_utc:'2026-10-02T07:02:30Z',
};
const reset = transition.planTransition({
  state:hs,
  humanApproval:resetApproval,
  request:{action:'HUMAN_RESET_ESCALATION',actor:'HUMAN-OPERATOR',at_utc:'2026-10-02T07:03:00Z'},
});
assert.strictEqual(reset.state.status,'READY_FOR_AUDIT');
assert.strictEqual(life.lifecycleSnapshot(reset.state).current_escalation_cycle,0);
assert.ok(reset.state.history.some((e)=>e.type==='HUMAN_APPROVAL_CONSUMED' && e.approval_id===resetApproval.approval_id));
assert.deepStrictEqual(life.lifecycleProblems(reset.state),[]);
assert.throws(()=>transition.planTransition({
  state:reset.state,
  humanApproval:resetApproval,
  request:{action:'HUMAN_RESET_ESCALATION',actor:'HUMAN-OPERATOR',at_utc:'2026-10-02T07:04:00Z'},
}),/RESET_REQUIRES_HUMAN_LOCK|HUMAN_RESET_APPROVAL_REQUIRED/);
console.log('PASS RESET_ESCALATION consumes approval once and projects status canonically');

const approvedPipeline = {
  ...pipeline(hs),
  decision:'APPROVED',
  primary:{phase:'PRIMARY',verdict:'APPROVED',auditor:'HA1',path:'hp.json',completed_at_utc:'2026-10-02T07:10:00Z'},
  adversarial:{phase:'ADVERSARIAL',verdict:'APPROVED',auditor:'HA2',path:'ha.json',completed_at_utc:'2026-10-02T07:11:00Z'},
};
const closeApproval = {
  ...approval,
  approval_id:'human-10-close',
  decision:'PERMANENTLY_CLOSE',
  permission:null,
  approved_at_utc:'2026-10-02T07:12:00Z',
};
assert.throws(()=>transition.planTransition({
  state:hs,
  pipeline:pipeline(hs),
  humanApproval:closeApproval,
  request:{action:'HUMAN_COMPLETE',actor:'HUMAN-OPERATOR',at_utc:'2026-10-02T07:13:00Z'},
}),/HUMAN_COMPLETE_REQUIRES_FINAL_APPROVED/);
assert.throws(()=>transition.planTransition({
  state:hs,
  pipeline:approvedPipeline,
  humanApproval:null,
  request:{action:'HUMAN_COMPLETE',actor:'HUMAN-OPERATOR',at_utc:'2026-10-02T07:13:00Z'},
}),/HUMAN_PERMANENT_CLOSE_APPROVAL_REQUIRED/);
const closed = transition.planTransition({
  state:hs,
  pipeline:approvedPipeline,
  humanApproval:closeApproval,
  request:{action:'HUMAN_COMPLETE',actor:'HUMAN-OPERATOR',at_utc:'2026-10-02T07:13:00Z'},
});
assert.strictEqual(closed.state.status,'COMPLETED');
assert.strictEqual(life.lifecycleSnapshot(closed.state).lifetime_correction_cycles,7);
assert.strictEqual(life.lifecycleSnapshot(closed.state).human_permanently_closed,true);
assert.deepStrictEqual(life.lifecycleProblems(closed.state),[]);
console.log('PASS HUMAN permanent close requires APPROVED + human approval');

console.log('Unit transition self-test: SUCCESS');
