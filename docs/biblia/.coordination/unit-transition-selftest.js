'use strict';

const assert = require('assert');
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
const token = transition.issueCorrectionToken(s, pipeline(s), { issued_at_utc:'2026-10-02T06:30:00Z' });
assert.deepStrictEqual(transition.validateCorrectionToken(s, token), []);
console.log('PASS final CHANGES_REQUIRED issues revision-bound token');

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
console.log('PASS token is consumed append-only on correction start');

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
console.log('PASS stale CAS writer is rejected');

s = state(6);
snap = life.lifecycleSnapshot(s);
const emergencyToken = transition.issueCorrectionToken(s, pipeline(s), { issued_at_utc:'2026-10-02T06:40:00Z' });
assert.throws(()=>transition.planTransition({
  state:s,
  token:emergencyToken,
  request:{action:'START_CORRECTION',actor:'NEW-AGENT',at_utc:'2026-10-02T06:41:00Z'},
}), /EMERGENCY_ROOT_CAUSE_REVIEW_REQUIRED/);
planned = transition.planTransition({
  state:s,
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
  humanApproval:approval,
});
planned = transition.planTransition({
  state:hs,
  token:humanToken,
  humanApproval:approval,
  request:{action:'START_CORRECTION',actor:'HUMAN-AUTHORIZED-AGENT',at_utc:'2026-10-02T07:02:00Z'},
});
assert.strictEqual(planned.state.status,'IN_PROGRESS');
assert.ok(planned.state.history.some((e)=>e.type==='HUMAN_APPROVAL_CONSUMED'));
console.log('PASS HUMAN approval unlocks exactly one correction');

console.log('Unit transition self-test: SUCCESS');
