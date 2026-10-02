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
    at_utc: '2026-10-02T0' + n + ':00:00Z',
    type: 'EDITOR_CORRECTION_STARTED',
    from_status: 'CHANGES_REQUIRED',
    to_status: 'IN_PROGRESS',
    source_sha: state.source_sha,
    bible_sha: state.bible_sha,
    agent: who,
  });
  state.history.push({
    at_utc: '2026-10-02T0' + n + ':10:00Z',
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

const same = life.revisionIdentity(s);
const changed = life.revisionIdentity({...s, source_sha: sha('d')});
assert.notStrictEqual(same.revision_id, changed.revision_id);
assert.strictEqual(same.revision_id, life.revisionIdentity({...s}).revision_id);
console.log('PASS revision_id deterministic and test-sensitive');

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
  evidence: 'race reproduzida',
  strategy: 'serializar writer',
}), true);
assert.strictEqual(life.rootCauseReviewValid({ categories: ['CONCURRENCY'] }), false);
console.log('PASS emergency root-cause review validation');

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
assert.ok(forgedProblems.some((x) => x.includes('exige status HUMAN_LOCKED')));
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
