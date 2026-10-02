'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const life = require('../../docs/biblia/.coordination/lifecycle-core');
const transition = require('../../docs/biblia/.coordination/unit-transition');
const humanGate = require('../../docs/biblia/.coordination/human-gate');
const humanDiff = require('./verify-human-protected-diff');
const stateHistory = require('./verify-bible-state-history-append-only');

function sha(ch, length = 40) { return ch.repeat(length); }

function baseState(cycles = 0, status = 'CHANGES_REQUIRED') {
  const state = {
    index: 12,
    status,
    agent: null,
    file: 'tests/unit/example.test.js',
    bible: 'docs/biblia/tests/unit/example.test.js/Bíblia.md',
    production_files: ['extension/content_manga.js'],
    source_sha: sha('a'),
    bible_sha: sha('b'),
    history: [],
  };
  for (let i = 1; i <= cycles; i += 1) {
    state.history.push({
      at_utc: '2026-10-01T' + String(i).padStart(2,'0') + ':00:00Z',
      type: 'EDITOR_CORRECTION_STARTED',
      from_status: 'CHANGES_REQUIRED',
      to_status: 'IN_PROGRESS',
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      agent: 'AGENT-' + i,
    });
    state.history.push({
      at_utc: '2026-10-01T' + String(i).padStart(2,'0') + ':10:00Z',
      type: life.HANDOFF_EVENT,
      from_status: 'IN_PROGRESS',
      to_status: i >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT',
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      production_sha: sha('c'),
      agent: 'AGENT-' + i,
    });
  }
  return state;
}

function pipeline(state, decision = 'CHANGES_REQUIRED') {
  return {
    index: state.index,
    decision,
    problems: [],
    source_sha: state.source_sha,
    bible_sha: state.bible_sha,
    primary: decision === 'WAITING_ADVERSARIAL'
      ? {phase:'PRIMARY',verdict:'CHANGES_REQUIRED',auditor:'A1',path:'p.json',completed_at_utc:'2026-10-02T06:00:00Z'}
      : {phase:'PRIMARY',verdict:decision,auditor:'A1',path:'p.json',completed_at_utc:'2026-10-02T06:00:00Z'},
    adversarial: decision === 'WAITING_ADVERSARIAL'
      ? null
      : {phase:'ADVERSARIAL',verdict:decision,auditor:'A2',path:'a.json',completed_at_utc:'2026-10-02T06:01:00Z'},
  };
}

function strategyReview(cycle) {
  return {
    related_cycles:[cycle-2,cycle-1,cycle],
    observed_pattern:'same defect class repeated across three cycles',
    evidence:'independent audits reopened the same class repeatedly',
    why_previous_strategy_insufficient:'local patches did not close the end-to-end contract',
    new_strategy:'strategy-' + cycle + '-cross-boundary-validation',
  };
}

function humanLockedState() {
  const state=baseState(7,'HUMAN_LOCKED');
  state.agent=null;
  return state;
}

function expect(name, fn) {
  fn();
  console.log('PASS ATTACK ' + name);
}

// 1) corrigir sem token.
expect('01 direct correction without token',()=>{
  const state=baseState(0);
  assert.throws(()=>transition.planTransition({
    state,
    pipeline:pipeline(state),
    token:null,
    request:{action:'START_CORRECTION',actor:'ATTACKER',at_utc:'2026-10-02T08:00:00Z'},
  }),/TOKEN_/);
});

// 2) forçar CHANGES_REQUIRED manualmente após handoff.
expect('02 manual CHANGES_REQUIRED projection',()=>{
  const state=baseState(1,'CHANGES_REQUIRED');
  assert.ok(life.lifecycleProblems(state).some((x)=>x.includes('status diverge')));
});

// 3) dois corretores simultâneos.
expect('03 concurrent correction writers',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'anti-loop-reservation-'));
  const state=baseState(0);
  transition.createCorrectionReservation(root,state,'WRITER-1','2026-10-02T08:01:00Z',{token_id:'t1'});
  assert.throws(()=>transition.createCorrectionReservation(
    root,state,'WRITER-2','2026-10-02T08:01:01Z',{token_id:'t2'}
  ),/ALREADY_RESERVED/);
  fs.rmSync(root,{recursive:true,force:true});
});

// 4) iniciar sem decisão final.
expect('04 no final distributed decision',()=>{
  const state=baseState(0);
  assert.throws(()=>transition.issueCorrectionToken(
    state,pipeline(state,'WAITING_ADVERSARIAL'),
    {issued_at_utc:'2026-10-02T08:02:00Z',actor:'A'}
  ),/TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED/);
});

// 5) usar token de revisão antiga.
expect('05 stale revision token',()=>{
  const state=baseState(0);
  const token=transition.issueCorrectionToken(state,pipeline(state),{
    issued_at_utc:'2026-10-02T08:03:00Z',actor:'A'
  });
  const changed={...state,source_sha:sha('d')};
  assert.ok(transition.validateCorrectionToken(changed,token,{actor:'A',pipeline:pipeline(changed)}).length>0);
});

// 6) reutilizar token consumido.
expect('06 reused correction token',()=>{
  const state=baseState(0);
  const token=transition.issueCorrectionToken(state,pipeline(state),{
    issued_at_utc:'2026-10-02T08:04:00Z',actor:'A'
  });
  state.history.push({type:'CORRECTION_TOKEN_CONSUMED',correction_token_id:token.token_id});
  assert.ok(transition.validateCorrectionToken(state,token,{actor:'A',pipeline:pipeline(state)})
    .includes('TOKEN_ALREADY_CONSUMED'));
});

// 7) editar evento antigo.
expect('07 mutate old lifecycle event',()=>{
  const state=baseState(0,'READY_FOR_AUDIT');
  life.appendLifecycleEvent(state.history,{at_utc:'2026-10-02T08:05:00Z',type:'X',value:1});
  life.appendLifecycleEvent(state.history,{at_utc:'2026-10-02T08:05:01Z',type:'Y',value:2});
  state.history[0].value=999;
  assert.ok(life.eventChainProblems(state).some((x)=>x.includes('event_hash inválido')));
});

// 8) apagar evento antigo.
expect('08 delete old lifecycle event',()=>{
  const before={index:12,history:[{type:'A'},{type:'B'}]};
  const current={index:12,history:[{type:'A'}]};
  assert.ok(stateHistory.historyAppendOnlyProblems(before,current).some((x)=>x.includes('truncado')));
});

// 9) inserir evento no meio.
expect('09 insert lifecycle event in middle',()=>{
  const before={index:12,history:[{type:'A'},{type:'B'}]};
  const current={index:12,history:[{type:'A'},{type:'X'},{type:'B'}]};
  assert.ok(stateHistory.historyAppendOnlyProblems(before,current).some((x)=>x.includes('posição 1')));
});

// 10) mesmo corretor em cycle 5.
expect('10 same corrector at cycle 5',()=>{
  const state=baseState(5);
  assert.strictEqual(life.correctorEligibility(state,'AGENT-5').eligible,false);
});

// 11) corretor recente em cycle 6.
expect('11 recent corrector at cycle 6',()=>{
  const state=baseState(6);
  assert.strictEqual(life.correctorEligibility(state,'AGENT-6').eligible,false);
  assert.strictEqual(life.correctorEligibility(state,'AGENT-5').eligible,false);
});

// 12) cycle 6 sem root-cause.
expect('12 emergency without root-cause review',()=>{
  const state=baseState(6);
  const token=transition.issueCorrectionToken(state,pipeline(state),{
    issued_at_utc:'2026-10-02T08:06:00Z',actor:'NEW'
  });
  assert.throws(()=>transition.planTransition({
    state,pipeline:pipeline(state),token,
    request:{
      action:'START_CORRECTION',actor:'NEW',at_utc:'2026-10-02T08:06:01Z',
      strategy_review:strategyReview(6),
    },
  }),/EMERGENCY_ROOT_CAUSE_REVIEW_REQUIRED/);
});

// 13) cycle 6 repetindo estratégia anterior.
expect('13 emergency repeats prior strategy',()=>{
  const state=baseState(6);
  state.history.push({
    at_utc:'2026-10-01T06:20:00Z',
    type:'EMERGENCY_ROOT_CAUSE_REVIEW',
    root_cause_review:{
      categories:['CONCURRENCY'],related_cycles:[4,5,6],
      evidence:'old',why_previous_failed:'old failed',strategy:'same strategy',
    },
  });
  assert.ok(life.rootCauseReviewProblems(state,{
    categories:['CONCURRENCY'],related_cycles:[4,5,6],
    evidence:'again',why_previous_failed:'still fails',strategy:'same strategy',
  }).includes('ROOT_CAUSE_STRATEGY_MUST_DIFFER_FROM_PREVIOUS_EMERGENCY'));
});

// 14-16) HUMAN source/Bible/production sem approval.
for (const [n,label,file] of [
  ['14','HUMAN source edit without approval','tests/unit/example.test.js'],
  ['15','HUMAN Bible edit without approval','docs/biblia/tests/unit/example.test.js/Bíblia.md'],
  ['16','HUMAN production edit without approval','extension/content_manga.js'],
]) {
  expect(n+' '+label,()=>{
    const state=humanLockedState();
    assert.ok(humanDiff.problemsForHumanDiff(state,state,[file],[]).length>0);
  });
}

// 17) publicar resultado HUMAN sem ALLOW_AUDIT_ONLY.
expect('17 HUMAN audit result without audit approval',()=>{
  const state=humanLockedState();
  const file='docs/biblia/.coordination/audit-results/012/primary/result.json';
  assert.ok(humanDiff.problemsForHumanDiff(state,state,[file],[]).some((x)=>x.includes('ALLOW_AUDIT_ONLY')));
});

// 18) remover human_approval_required.
expect('18 remove human_approval_required projection',()=>{
  const state=humanLockedState();
  state.human_approval_required=false;
  assert.ok(life.lifecycleProblems(state).some((x)=>x.includes('human_approval_required persistido diverge')));
});

// 19) usar a mesma approval em duas ações/ciclos.
expect('19 reuse HUMAN approval',()=>{
  const state=humanLockedState();
  const snap=life.lifecycleSnapshot(state);
  const approval={
    schema_version:1,approval_id:'012-human-attack',index:12,locked_cycle:7,
    decision:'ALLOW_ONE_CORRECTION',permission:'ONE_CORRECTION_CYCLE',
    approved_by:'human-reviewer',approved_at_utc:'2026-10-02T08:10:00Z',
    approval_source:'workflow_dispatch',approval_environment:'human-approval',
    production_sha:snap.production_sha,test_sha:snap.test_sha,bible_sha:snap.bible_sha,
    revision_id:snap.revision_id,
  };
  state.history.push({
    at_utc:'2026-10-02T08:11:00Z',type:'HUMAN_APPROVAL_CONSUMED',
    approval_id:approval.approval_id,source_sha:approval.test_sha,bible_sha:approval.bible_sha,
  });
  state.history.push({at_utc:'2026-10-02T08:11:01Z',type:'HUMAN_AUTHORIZED_CORRECTION_STARTED',approval_id:approval.approval_id});
  state.history.push({
    at_utc:'2026-10-02T08:12:00Z',type:'HUMAN_APPROVAL_CONSUMED',
    approval_id:approval.approval_id,source_sha:approval.test_sha,bible_sha:approval.bible_sha,
  });
  state.history.push({at_utc:'2026-10-02T08:12:01Z',type:'HUMAN_AUTHORIZED_CORRECTION_STARTED',approval_id:approval.approval_id});
  assert.ok(humanGate.humanApprovalConsumptionProblems([state],[approval]).some((x)=>x.includes('mais de uma vez')));
});

// 20) forçar COMPLETED sem transição válida.
expect('20 fake COMPLETED without human close',()=>{
  const state=humanLockedState();
  state.status='COMPLETED';
  assert.ok(life.lifecycleProblems(state).some((x)=>x.includes('HUMAN_LOCKED') || x.includes('status diverge')));
});

console.log('Bible anti-loop adversarial matrix: SUCCESS — 20/20 bypasses rejected');
