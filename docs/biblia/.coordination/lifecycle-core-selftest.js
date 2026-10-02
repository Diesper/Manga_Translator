'use strict';

const assert = require('assert');
const life = require('./lifecycle-core');

function sha(ch) { return ch.repeat(40); }
function baseState() {
  return {
    index: 191,
    status: 'READY_FOR_AUDIT',
    file: 'tests/unit/content-manga/audio-synthesis-full.test.js',
    bible: 'docs/biblia/tests/unit/content-manga/audio-synthesis-full.test.js/Bíblia.md',
    source_sha: sha('a'),
    bible_sha: sha('b'),
    history: [],
  };
}
function addCycle(state, n, actor) {
  const who = actor || ('AGENTE-' + n);
  state.history.push({
    at_utc: '2026-10-01T0' + n + ':00:00Z',
    type: 'EDITOR_CORRECTION_STARTED',
    from_status: 'CHANGES_REQUIRED',
    to_status: 'IN_PROGRESS',
    source_sha: state.source_sha,
    bible_sha: state.bible_sha,
    agent: who,
  });
  state.history.push({
    at_utc: '2026-10-01T0' + n + ':10:00Z',
    type: life.HANDOFF_EVENT,
    source_sha: state.source_sha,
    bible_sha: state.bible_sha,
    production_sha: sha('c'),
    agent: who,
  });
}

for (const pair of [[0,'NORMAL'],[1,'NORMAL'],[2,'NORMAL'],[3,'ELEVATED'],[4,'HIGH'],[5,'CRITICAL'],[6,'EMERGENCY'],[7,'HUMAN'],[8,'HUMAN']]) {
  assert.strictEqual(life.escalationForCycle(pair[0]), pair[1]);
}
console.log('PASS escalation 0..8');

const s = baseState();
for (let i=1;i<=5;i+=1) addCycle(s, i);
let snap = life.lifecycleSnapshot(s);
assert.strictEqual(snap.correction_cycle, 5);
assert.strictEqual(snap.lifetime_correction_cycles, 5);
assert.strictEqual(snap.audit_epoch, 5);
assert.strictEqual(snap.escalation_level, 'CRITICAL');
assert.strictEqual(snap.human_locked, false);
assert.ok(snap.handoff_id.startsWith('191-e5-'));
assert.strictEqual(snap.test_sha, s.source_sha);
assert.strictEqual(snap.bible_sha, s.bible_sha);
assert.ok(/^[0-9a-f]{64}$/.test(snap.revision_id));
console.log('PASS migration derives cycle/epoch/revision from history');

const noCycle = baseState();
const initialNoCycle=life.lifecycleSnapshot(noCycle);
noCycle.history.push(
  {at_utc:'2026-10-01T01:00:00Z',type:'UNVERIFIED_FINDING_RECORDED'},
  {at_utc:'2026-10-01T01:01:00Z',type:'PRIMARY_SUBMITTED'},
  {at_utc:'2026-10-01T01:02:00Z',type:'OPERATIONAL_RETRY'},
  {at_utc:'2026-10-01T01:03:00Z',type:'ADVERSARIAL_SUBMITTED'}
);
const afterNonHandoff=life.lifecycleSnapshot(noCycle);
assert.strictEqual(afterNonHandoff.correction_cycle,initialNoCycle.correction_cycle);
assert.strictEqual(afterNonHandoff.audit_epoch,initialNoCycle.audit_epoch);
noCycle.history.push({
  at_utc:'2026-10-01T01:10:00Z',
  type:life.HANDOFF_EVENT,
  source_sha:noCycle.source_sha,
  bible_sha:noCycle.bible_sha,
});
const afterOnlyHandoff=life.lifecycleSnapshot(noCycle);
assert.strictEqual(afterOnlyHandoff.correction_cycle,initialNoCycle.correction_cycle+1);
assert.strictEqual(afterOnlyHandoff.audit_epoch,initialNoCycle.audit_epoch+1);
console.log('PASS finding/audit/retry events do not increment cycle or audit epoch');
console.log('PASS correction handoff alone increments cycle and audit epoch');

const refreshOnly = baseState();
const refreshBefore = life.lifecycleSnapshot(refreshOnly);
refreshOnly.source_sha = sha('d');
refreshOnly.bible_sha = sha('e');
refreshOnly.history.push({
  at_utc:'2026-10-02T06:25:00Z',
  type:life.REVISION_REFRESH_EVENT,
  from_status:'COMPLETED',
  to_status:'READY_FOR_AUDIT',
  source_sha:refreshOnly.source_sha,
  test_sha:refreshOnly.source_sha,
  bible_sha:refreshOnly.bible_sha,
  audit_epoch:1,
});
const refreshAfter = life.lifecycleSnapshot(refreshOnly);
assert.strictEqual(refreshAfter.correction_cycle, refreshBefore.correction_cycle);
assert.strictEqual(refreshAfter.lifetime_correction_cycles, refreshBefore.lifetime_correction_cycles);
assert.strictEqual(refreshAfter.audit_epoch, refreshBefore.audit_epoch + 1);
assert.strictEqual(life.auditFenceEvents(refreshOnly).length, 1);
assert.strictEqual(life.handoffEvents(refreshOnly).length, 0);
console.log('PASS revision refresh increments audit epoch without correction cycle');

const same = life.revisionIdentity(s);
const changed = life.revisionIdentity({...s, source_sha: sha('d')});
assert.notStrictEqual(same.revision_id, changed.revision_id);
assert.strictEqual(same.revision_id, life.revisionIdentity({...s}).revision_id);
console.log('PASS revision_id deterministic and test-sensitive');

const revisionBase=life.revisionIdentity(baseState(),{
  production_sha:'1'.repeat(40),
  test_sha:'2'.repeat(40),
  bible_sha:'3'.repeat(40),
});
const revisionProduction=life.revisionIdentity(baseState(),{
  production_sha:'4'.repeat(40),
  test_sha:'2'.repeat(40),
  bible_sha:'3'.repeat(40),
});
const revisionTest=life.revisionIdentity(baseState(),{
  production_sha:'1'.repeat(40),
  test_sha:'5'.repeat(40),
  bible_sha:'3'.repeat(40),
});
const revisionBible=life.revisionIdentity(baseState(),{
  production_sha:'1'.repeat(40),
  test_sha:'2'.repeat(40),
  bible_sha:'6'.repeat(40),
});
assert.notStrictEqual(revisionBase.revision_id,revisionProduction.revision_id);
assert.notStrictEqual(revisionBase.revision_id,revisionTest.revision_id);
assert.notStrictEqual(revisionBase.revision_id,revisionBible.revision_id);
assert.strictEqual(
  revisionBase.revision_id,
  life.revisionIdentity(baseState(),{
    bible_sha:'3'.repeat(40),
    production_sha:'1'.repeat(40),
    test_sha:'2'.repeat(40),
  }).revision_id
);
console.log('PASS production/test/Bible changes independently alter revision_id');
console.log('PASS canonical revision identity is deterministic independent of option key order');

let change = life.classifyRevisionChange(
  {production_sha:'a'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40)},
  {production_sha:'d'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40)}
);
assert.deepStrictEqual(change.changes,['PRODUCTION']);
assert.strictEqual(change.invalidates_audit_revision,true);
change = life.classifyRevisionChange(
  {production_sha:'a'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'c'.repeat(40)},
  {production_sha:'a'.repeat(40),test_sha:'b'.repeat(40),bible_sha:'d'.repeat(40)},
  {bible_change_type:'BIBLE_FORMATTING'}
);
assert.deepStrictEqual(change.changes,['BIBLE_FORMATTING']);
assert.strictEqual(change.invalidates_audit_revision,true);
console.log('PASS revision change classification is conservative');

let eligibility = life.correctorEligibility(s, 'AGENTE-5');
assert.strictEqual(eligibility.reason, 'CYCLE_5_REQUIRES_DIFFERENT_CORRECTOR');
assert.strictEqual(life.correctorEligibility(s, 'OUTRO').eligible, true);
console.log('PASS cycle 5 corrector diversity');

addCycle(s, 6, 'OUTRO');
assert.strictEqual(life.correctorEligibility(s, 'OUTRO').eligible, false);
assert.strictEqual(life.correctorEligibility(s, 'AGENTE-5').eligible, false);
assert.strictEqual(life.correctorEligibility(s, 'TERCEIRO').eligible, true);
assert.strictEqual(life.lifecycleSnapshot(s).escalation_level, 'EMERGENCY');
console.log('PASS cycle 6 blocks last two correctors');

assert.strictEqual(life.rootCauseReviewValid({
  categories: ['CONCURRENCY'],
  related_cycles: [4,5,6],
  evidence: 'race reproduzida',
  why_previous_failed: 'correções locais não serializavam o writer compartilhado',
  strategy: 'serializar writer',
}), true);
assert.strictEqual(life.rootCauseReviewValid({ categories: ['CONCURRENCY'] }), false);
console.log('PASS emergency root-cause review validation');

const emergencyHistory = baseState();
for (let i=1;i<=6;i+=1) addCycle(emergencyHistory,i,'ROOT-'+i);
emergencyHistory.history.push({
  at_utc:'2026-10-01T05:00:00Z',
  type:'EMERGENCY_ROOT_CAUSE_REVIEW',
  root_cause_review:{
    categories:['CONCURRENCY'],
    related_cycles:[4,5],
    evidence:'race anterior',
    why_previous_failed:'o lock anterior era local ao módulo',
    strategy:'serializar writer',
  },
});
assert.ok(life.rootCauseReviewProblems(emergencyHistory,{
  categories:['CONCURRENCY'],
  related_cycles:[4,5],
  evidence:'race reaparece',
  why_previous_failed:'o lock anterior permaneceu local',
  strategy:'serializar writer',
}).includes('ROOT_CAUSE_STRATEGY_MUST_DIFFER_FROM_PREVIOUS_EMERGENCY'));
assert.deepStrictEqual(life.rootCauseReviewProblems(emergencyHistory,{
  categories:['STATE_MACHINE_FAILURE'],
  related_cycles:[4,5],
  evidence:'nova evidência',
  why_previous_failed:'as mutações ainda não passavam pelo mesmo CAS',
  strategy:'mover transição para writer canônico',
}),[]);
assert.ok(life.rootCauseReviewProblems(emergencyHistory,{
  categories:['STATE_MACHINE_FAILURE'],
  related_cycles:[99],
  evidence:'ciclo impossível',
  why_previous_failed:'fixture',
  strategy:'estratégia nova',
}).includes('ROOT_CAUSE_RELATED_CYCLE_INVALID'));
console.log('PASS repeated EMERGENCY must use a different strategy');

const threeCycleState=baseState();
for(let i=1;i<=3;i+=1) addCycle(threeCycleState,i,'S'+i);
assert.strictEqual(life.strategyReviewDue(threeCycleState),true);
assert.ok(life.strategyReviewProblems(threeCycleState,null).includes('STRATEGY_REVIEW_REQUIRED'));
assert.deepStrictEqual(life.strategyReviewProblems(threeCycleState,{
  related_cycles:[1,2,3],
  observed_pattern:'same failure class repeated',
  evidence:'three independent audit rounds reopened the unit',
  why_previous_strategy_insufficient:'the earlier tactic only patched local symptoms',
  new_strategy:'validate the end-to-end contract before editing',
}),[]);
console.log('PASS every three cycles force explicit strategy reassessment');

addCycle(s, 7, 'TERCEIRO');
s.status = 'HUMAN_LOCKED';
snap = life.lifecycleSnapshot(s);
assert.strictEqual(snap.human_locked, true);
assert.strictEqual(life.correctorEligibility(s, 'QUALQUER').reason, 'HUMAN_LOCKED');
assert.deepStrictEqual(life.lifecycleProblems(s), []);
console.log('PASS cycle 7 enters HUMAN_LOCKED');

const forged = JSON.parse(JSON.stringify(s));
forged.status = 'READY_FOR_AUDIT';
forged.correction_cycle = 0;
const forgedProblems = life.lifecycleProblems(forged);
assert.ok(forgedProblems.some((x) => x.includes('correction_cycle persistido diverge')));
assert.ok(forgedProblems.some((x) => x.includes('correction_cycle >= 7 exige HUMAN_LOCKED')));
console.log('PASS HUMAN/cycle downgrade is detected');

const approvalFlagTamper = JSON.parse(JSON.stringify(s));
approvalFlagTamper.human_approval_required = false;
const approvalFlagProblems = life.lifecycleProblems(approvalFlagTamper);
assert.ok(approvalFlagProblems.some((x)=>x.includes('human_approval_required persistido diverge')));
console.log('PASS human_approval_required removal is detected');

s.history.push({
  at_utc: '2026-10-02T08:00:00Z',
  type: life.HUMAN_RESET_EVENT,
  actor: 'HUMAN',
});
snap = life.lifecycleSnapshot(s);
assert.strictEqual(snap.lifetime_correction_cycles, 7);
assert.strictEqual(snap.current_escalation_cycle, 0);
console.log('PASS human reset keeps lifetime monotonic');

const future = baseState();
future.history.push({
  at_utc: '2026-10-02T06:30:00Z',
  type: 'EDITOR_CORRECTION_STARTED',
  from_status: 'CHANGES_REQUIRED',
  to_status: 'IN_PROGRESS',
});
assert.ok(life.lifecycleProblems(future).some((x) => x.includes('sem correction_token_id')));
console.log('PASS future direct correction without token is rejected');

const fakeType = baseState();
fakeType.status='IN_PROGRESS';
fakeType.history.push({
  at_utc:'2026-10-02T06:35:00Z',
  type:'MANUAL_HACK',
  from_status:'CHANGES_REQUIRED',
  to_status:'IN_PROGRESS',
  correction_token_id:'corr-fake',
});
fakeType.history.push({
  at_utc:'2026-10-02T06:35:01Z',
  type:'CORRECTION_TOKEN_CONSUMED',
  correction_token_id:'corr-fake',
});
assert.ok(life.lifecycleProblems(fakeType).some((x)=>x.includes('evento pós-policy não canônico')));
console.log('PASS arbitrary event type cannot open IN_PROGRESS even with token-shaped data');

const missingConsumption = baseState();
missingConsumption.status='IN_PROGRESS';
missingConsumption.history.push({
  at_utc:'2026-10-02T06:36:00Z',
  type:'EDITOR_CORRECTION_STARTED',
  from_status:'CHANGES_REQUIRED',
  to_status:'IN_PROGRESS',
  correction_token_id:'corr-unconsumed',
});
assert.ok(life.lifecycleProblems(missingConsumption)
  .some((x)=>x.includes('sem CORRECTION_TOKEN_CONSUMED imediatamente posterior')));
console.log('PASS canonical correction start must consume its token immediately');

const forgedInProgress = baseState();
forgedInProgress.status='IN_PROGRESS';
forgedInProgress.updated_at_utc='2026-10-01T00:00:00Z';
assert.ok(life.lifecycleProblems(forgedInProgress).some((x)=>x.includes('IN_PROGRESS sem START_CORRECTION canônico')));
console.log('PASS stale/missing updated_at cannot bypass canonical correction start');

const chained = baseState();
life.appendLifecycleEvent(chained.history, {
  at_utc:'2026-10-02T06:40:00Z',
  type:'CORRECTION_TOKEN_CONSUMED',
  correction_token_id:'corr-test',
});
life.appendLifecycleEvent(chained.history, {
  at_utc:'2026-10-02T06:41:00Z',
  type:'EDITOR_CORRECTION_STARTED',
  to_status:'IN_PROGRESS',
  correction_token_id:'corr-test',
});
assert.deepStrictEqual(life.eventChainProblems(chained), []);
const tampered = JSON.parse(JSON.stringify(chained));
tampered.history[tampered.history.length-1].correction_token_id = 'corr-tampered';
assert.ok(life.eventChainProblems(tampered).some((x)=>x.includes('event_hash inválido')));
console.log('PASS hash chain detects tampering');

const inserted = JSON.parse(JSON.stringify(chained));
inserted.history.push({at_utc:'2026-10-02T06:42:00Z',type:'MANUAL_EVENT'});
assert.ok(life.eventChainProblems(inserted).some((x)=>x.includes('sem hashes')));
console.log('PASS chain rejects unchained event insertion');

const projected = baseState();
projected.status = 'IN_PROGRESS';
projected.updated_at_utc = '2026-10-02T06:50:00Z';
life.appendLifecycleEvent(projected.history, {
  at_utc:'2026-10-02T06:50:00Z',
  type:'EDITOR_CORRECTION_STARTED',
  from_status:'CHANGES_REQUIRED',
  to_status:'IN_PROGRESS',
  correction_token_id:'corr-projection',
});
life.appendLifecycleEvent(projected.history, {
  at_utc:'2026-10-02T06:50:01Z',
  type:'CORRECTION_TOKEN_CONSUMED',
  correction_token_id:'corr-projection',
  actor:'FIXTURE',
});
const projectedSnapshot = life.lifecycleSnapshot(projected);
Object.assign(projected, {
  correction_cycle:projectedSnapshot.correction_cycle,
  lifetime_correction_cycles:projectedSnapshot.lifetime_correction_cycles,
  current_escalation_cycle:projectedSnapshot.current_escalation_cycle,
  escalation_level:projectedSnapshot.escalation_level,
  human_approval_required:projectedSnapshot.human_approval_required,
  audit_epoch:projectedSnapshot.audit_epoch,
  handoff_id:projectedSnapshot.handoff_id,
  production_sha:projectedSnapshot.production_sha,
  test_sha:projectedSnapshot.test_sha,
  bible_sha:projectedSnapshot.bible_sha,
  revision_id:projectedSnapshot.revision_id,
});
assert.deepStrictEqual(life.lifecycleProblems(projected),[]);
const statusTampered = {...projected,status:'READY_FOR_AUDIT'};
assert.ok(life.lifecycleProblems(statusTampered).some((x)=>x.includes('status diverge da projeção')));
console.log('PASS state status must match latest lifecycle event');

const missingProjection = {...projected};
delete missingProjection.revision_id;
assert.ok(life.lifecycleProblems(missingProjection).some((x)=>x.includes('projeção lifecycle pós-chain ausente: revision_id')));
console.log('PASS chained event requires complete state projection');

console.log('Bible lifecycle core self-test: SUCCESS');
