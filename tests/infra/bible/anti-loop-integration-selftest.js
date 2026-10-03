'use strict';

const assert = require('assert');
const life = require('../../../scripts/bible/core/lifecycle-core');
const transition = require('../../../scripts/bible/commands/unit-transition');
const findings = require('../../../scripts/bible/storage/unverified-findings');

function sha(ch) { return ch.repeat(40); }

function state(index, cycles = 0, status = 'CHANGES_REQUIRED') {
  const s = {
    index,
    status,
    agent: null,
    file: 'fixture/' + index + '.test.js',
    bible: 'docs/biblia/fixture/' + index + '/Bíblia.md',
    source_sha: sha('a'),
    bible_sha: sha('b'),
    history: [],
    audit_requests: [],
  };
  for (let i = 1; i <= cycles; i += 1) {
    s.history.push({
      at_utc: '2026-10-01T' + String(i).padStart(2, '0') + ':00:00Z',
      type: 'EDITOR_CORRECTION_STARTED',
      from_status: 'CHANGES_REQUIRED',
      to_status: 'IN_PROGRESS',
      agent: 'LEGACY-' + i,
      source_sha: s.source_sha,
      bible_sha: s.bible_sha,
    });
    s.history.push({
      at_utc: '2026-10-01T' + String(i).padStart(2, '0') + ':10:00Z',
      type: life.HANDOFF_EVENT,
      source_sha: s.source_sha,
      bible_sha: s.bible_sha,
      agent: 'LEGACY-' + i,
    });
  }
  return s;
}

function changesPipeline(s) {
  return {
    index: s.index,
    decision: 'CHANGES_REQUIRED',
    problems: [],
    source_sha: s.source_sha,
    bible_sha: s.bible_sha,
    primary: {
      phase:'PRIMARY', verdict:'CHANGES_REQUIRED', auditor:'P-' + s.index,
      path:'p-' + s.index + '.json', completed_at_utc:'2026-10-02T06:10:00Z',
    },
    adversarial: {
      phase:'ADVERSARIAL', verdict:'CHANGES_REQUIRED', auditor:'A-' + s.index,
      path:'a-' + s.index + '.json', completed_at_utc:'2026-10-02T06:11:00Z',
    },
  };
}

function approvedPipeline(s) {
  return {
    ...changesPipeline(s),
    decision:'APPROVED',
    primary:{
      ...changesPipeline(s).primary,
      verdict:'APPROVED',
    },
    adversarial:{
      ...changesPipeline(s).adversarial,
      verdict:'APPROVED',
    },
  };
}

function startCorrection(s, actor, at, options = {}) {
  const pipeline = changesPipeline(s);
  const token = transition.issueCorrectionToken(s, pipeline, {
    issued_at_utc: at,
    actor,
    humanApproval: options.humanApproval || null,
  });
  const started = transition.planTransition({
    state:s,
    pipeline,
    token,
    humanApproval:options.humanApproval || null,
    request:{
      action:'START_CORRECTION',
      actor,
      at_utc:new Date(Date.parse(at) + 1000).toISOString(),
      strategy_review:options.strategy_review || null,
      root_cause_review:options.root_cause_review || null,
    },
  });
  return { token, state:started.state };
}

// SCENARIO 1: normal correction -> handoff -> distributed APPROVED -> COMPLETED.
let s1=state(101,0,'CHANGES_REQUIRED');
let flow=startCorrection(s1,'CORR-101','2026-10-02T06:30:00Z');
let handoff=transition.planTransition({
  state:flow.state,
  request:{
    action:'HANDOFF_FOR_AUDIT',
    actor:'CORR-101',
    at_utc:'2026-10-02T06:31:30Z',
    test_sha:sha('c'),
    bible_sha:sha('d'),
    production_sha:sha('e'),
  },
}).state;
assert.strictEqual(handoff.status,'READY_FOR_AUDIT');
assert.strictEqual(life.lifecycleSnapshot(handoff).correction_cycle,1);
let completed=transition.planTransition({
  state:handoff,
  pipeline:approvedPipeline(handoff),
  request:{action:'RECONCILE_DECISION',actor:'SYSTEM',at_utc:'2026-10-02T06:40:00Z'},
}).state;
assert.strictEqual(completed.status,'COMPLETED');
console.log('PASS scenario 1 NORMAL -> correction -> handoff -> P/A APPROVED -> COMPLETED');

// SCENARIO 2: cycle 4 correction creates cycle 5 and forces a different corrector.
let s2=state(102,4,'CHANGES_REQUIRED');
flow=startCorrection(s2,'CORR-X','2026-10-02T06:50:00Z');
handoff=transition.planTransition({
  state:flow.state,
  request:{
    action:'HANDOFF_FOR_AUDIT',actor:'CORR-X',at_utc:'2026-10-02T06:51:30Z',
    test_sha:sha('c'),bible_sha:sha('d'),production_sha:sha('e'),
  },
}).state;
let changesAgain=transition.planTransition({
  state:handoff,
  pipeline:changesPipeline(handoff),
  request:{action:'RECONCILE_DECISION',actor:'SYSTEM',at_utc:'2026-10-02T06:52:00Z'},
}).state;
assert.strictEqual(life.lifecycleSnapshot(changesAgain).correction_cycle,5);
assert.strictEqual(life.correctorEligibility(changesAgain,'CORR-X').eligible,false);
assert.strictEqual(life.correctorEligibility(changesAgain,'CORR-Y').eligible,true);
console.log('PASS scenario 2 cycle 4 -> cycle 5 CRITICAL -> previous corrector ineligible');

// SCENARIO 3: cycle 6 requires full root-cause review and the delivered cycle 7 is HUMAN.
let s3=state(103,6,'CHANGES_REQUIRED');
flow=startCorrection(s3,'EMERGENCY-CORR','2026-10-02T07:00:00Z',{
  strategy_review:{
    related_cycles:[4,5,6],
    observed_pattern:'same race survived three consecutive correction cycles',
    evidence:'cycles 4..6 repeatedly reopened around canonical writer ordering',
    why_previous_strategy_insufficient:'local fixes did not change the mutation authority',
    new_strategy:'move mutation behind one CAS transition authority',
  },
  root_cause_review:{
    categories:['CONCURRENCY','STATE_MACHINE_FAILURE'],
    related_cycles:[4,5,6],
    evidence:'same race survived local fixes',
    why_previous_failed:'previous fixes did not serialize the canonical writer',
    strategy:'move mutation behind one CAS transition authority',
  },
});
handoff=transition.planTransition({
  state:flow.state,
  request:{
    action:'HANDOFF_FOR_AUDIT',actor:'EMERGENCY-CORR',at_utc:'2026-10-02T07:01:30Z',
    test_sha:sha('c'),bible_sha:sha('d'),production_sha:sha('e'),
  },
}).state;
assert.strictEqual(life.lifecycleSnapshot(handoff).correction_cycle,7);
assert.strictEqual(handoff.status,'HUMAN_LOCKED');
assert.strictEqual(life.correctorEligibility(handoff,'ANY-AUTO').eligible,false);
console.log('PASS scenario 3 cycle 6 EMERGENCY -> full root cause -> handoff -> cycle 7 HUMAN_LOCKED');

// SCENARIO 4: HUMAN approval is one-shot; after its correction/handoff the unit is HUMAN again.
const hsnap=life.lifecycleSnapshot(handoff);
const approval={
  schema_version:1,
  approval_id:'103-human-one-shot',
  index:103,
  locked_cycle:7,
  decision:'ALLOW_ONE_CORRECTION',
  permission:'ONE_CORRECTION_CYCLE',
  approved_by:'HUMAN-REVIEWER',
  approved_at_utc:'2026-10-02T07:05:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  production_sha:hsnap.production_sha,
  test_sha:hsnap.test_sha,
  bible_sha:hsnap.bible_sha,
  revision_id:hsnap.revision_id,
};
flow=startCorrection(handoff,'HUMAN-AUTHORIZED-CORR','2026-10-02T07:06:00Z',{humanApproval:approval});
assert.ok(flow.state.history.some((e)=>e.type==='HUMAN_APPROVAL_CONSUMED' && e.approval_id===approval.approval_id));
const humanRehandoff=transition.planTransition({
  state:flow.state,
  request:{
    action:'HANDOFF_FOR_AUDIT',actor:'HUMAN-AUTHORIZED-CORR',at_utc:'2026-10-02T07:07:30Z',
    test_sha:sha('f'),bible_sha:sha('1'),production_sha:sha('2'),
  },
}).state;
assert.strictEqual(humanRehandoff.status,'HUMAN_LOCKED');
assert.ok(life.lifecycleSnapshot(humanRehandoff).correction_cycle>=8);
assert.strictEqual(life.correctorEligibility(humanRehandoff,'ANY-AUTO').eligible,false);
assert.strictEqual(require('../../../scripts/bible/core/human-gate').approvalMatches(
  humanRehandoff,life.lifecycleSnapshot(humanRehandoff),approval,'ALLOW_ONE_CORRECTION'
),false);
console.log('PASS scenario 4 HUMAN approval -> one correction -> handoff -> immediate HUMAN quarantine again');

// SCENARIO 5: post-handoff suspicion remains non-authoritative until final distributed CHANGES_REQUIRED.
let s5=state(105,2,'READY_FOR_AUDIT');
const s5Before=JSON.stringify(s5);
const s5snap=life.lifecycleSnapshot(s5);
const finding=findings.buildFinding(s5,s5snap,{
  id:'105-UF-001',
  reported_by:'CORRECTOR-105',
  reported_at_utc:'2026-10-02T07:20:00Z',
  title:'possible post-handoff defect',
  finding:'suspected defect needs independent reproduction',
  evidence:'read-only observation',
  suggested_test:'independent auditor reproduces',
});
assert.strictEqual(finding.status,'UNVERIFIED');
assert.strictEqual(JSON.stringify(s5),s5Before);
assert.throws(()=>transition.issueCorrectionToken(s5,{
  index:105,decision:'WAITING_ADVERSARIAL',problems:[],
  source_sha:s5.source_sha,bible_sha:s5.bible_sha,
  primary:{phase:'PRIMARY',verdict:'CHANGES_REQUIRED',auditor:'P105'},
  adversarial:null,
},{
  issued_at_utc:'2026-10-02T07:21:00Z',actor:'CORRECTOR-105',
}),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
s5={...s5,status:'CHANGES_REQUIRED'};
const finalToken=transition.issueCorrectionToken(s5,changesPipeline(s5),{
  issued_at_utc:'2026-10-02T07:22:00Z',actor:'CORRECTOR-OTHER',
});
assert.strictEqual(finalToken.decision,'CHANGES_REQUIRED');
console.log('PASS scenario 5 UNVERIFIED finding cannot reopen; final distributed CHANGES_REQUIRED can authorize correction');

console.log('Anti-loop integration scenarios self-test: SUCCESS');
