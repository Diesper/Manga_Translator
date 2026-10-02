'use strict';

const assert = require('assert');
const life = require('../../docs/biblia/.coordination/lifecycle-core');
const guard = require('./verify-human-protected-diff');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function humanLockedState() {
  const state = {
    index: 12,
    status: 'HUMAN_LOCKED',
    agent: null,
    file: 'tests/unit/example.test.js',
    bible: 'docs/biblia/tests/unit/example.test.js/Bíblia.md',
    production_files: ['extension/content_manga.js'],
    source_sha: 'a'.repeat(40),
    bible_sha: 'b'.repeat(40),
    history: [],
  };
  for (let i = 1; i <= 7; i += 1) {
    state.history.push({
      at_utc: '2026-10-01T0' + i + ':00:00Z',
      type: life.HANDOFF_EVENT,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      agent: 'AGENT-' + i,
    });
  }
  return state;
}

const locked = humanLockedState();
assert.strictEqual(life.lifecycleSnapshot(locked).human_locked, true);

assert.ok(
  guard.problemsForHumanDiff(locked, locked, [locked.file]).some((item) => item.includes('sem correction approval')),
);
console.log('PASS HUMAN source edit without approval is blocked');

assert.ok(
  guard.problemsForHumanDiff(locked, locked, [locked.bible]).some((item) => item.includes('sem correction approval')),
);
console.log('PASS HUMAN Bible edit without approval is blocked');

assert.ok(
  guard.problemsForHumanDiff(locked, locked, ['extension/content_manga.js']).some((item) => item.includes('sem correction approval')),
);
console.log('PASS HUMAN production edit without approval is blocked');

assert.ok(
  guard.problemsForHumanDiff(
    locked,
    locked,
    ['docs/biblia/.state/012.json'],
  ).some((item) => item.includes('sem correction approval')),
);
console.log('PASS HUMAN state mutation without approval is blocked');

assert.ok(
  guard.problemsForHumanDiff(
    locked,
    locked,
    ['docs/biblia/.coordination/audit-results/012/primary/result.json'],
  ).some((item) => item.includes('não permite lease/resultado')),
);
console.log('PASS HUMAN audit-result bypass is blocked');

const lockedSnapshot = life.lifecycleSnapshot(locked);
const auditApproval = {
  schema_version: 1,
  approval_id: '012-human-audit',
  index: 12,
  locked_cycle: lockedSnapshot.current_escalation_cycle,
  decision: 'ALLOW_AUDIT_ONLY',
  permission: null,
  approved_by: 'human-reviewer',
  approved_at_utc: '2026-10-02T07:30:00Z',
  approval_source: 'workflow_dispatch',
  approval_environment: 'human-approval',
  production_sha: lockedSnapshot.production_sha,
  test_sha: lockedSnapshot.test_sha,
  bible_sha: lockedSnapshot.bible_sha,
  revision_id: lockedSnapshot.revision_id,
};
assert.deepStrictEqual(
  guard.problemsForHumanDiff(
    locked,
    locked,
    ['docs/biblia/.coordination/audit-results/012/primary/result.json'],
    [auditApproval],
  ),
  [],
);
console.log('PASS revision-bound ALLOW_AUDIT_ONLY permits HUMAN audit artifact');


const started = clone(locked);
started.status = 'IN_PROGRESS';
started.agent = 'AUTHORIZED';
life.appendLifecycleEvent(started.history, {
  at_utc: '2026-10-02T07:00:00Z',
  type: 'HUMAN_APPROVAL_CONSUMED',
  approval_id: 'approval-1',
  correction_token_id: 'token-1',
  actor: 'AUTHORIZED',
});
life.appendLifecycleEvent(started.history, {
  at_utc: '2026-10-02T07:00:01Z',
  type: 'HUMAN_AUTHORIZED_CORRECTION_STARTED',
  from_status: 'HUMAN_LOCKED',
  to_status: 'IN_PROGRESS',
  approval_id: 'approval-1',
  correction_token_id: 'token-1',
  agent: 'AUTHORIZED',
});
life.appendLifecycleEvent(started.history, {
  at_utc: '2026-10-02T07:00:02Z',
  type: 'CORRECTION_TOKEN_CONSUMED',
  correction_token_id: 'token-1',
  actor: 'AUTHORIZED',
});

assert.deepStrictEqual(guard.problemsForHumanDiff(locked, started, [locked.file]), []);
assert.strictEqual(life.activeHumanAuthorizedCorrection(started), true);
console.log('PASS approval start opens exactly one HUMAN correction window');

const during = clone(started);
assert.deepStrictEqual(guard.problemsForHumanDiff(started, during, [locked.file]), []);
console.log('PASS source edit during active authorized correction is allowed');

const stolen = clone(started);
stolen.agent = 'OTHER';
assert.ok(guard.problemsForHumanDiff(started, stolen, [locked.file]).length > 0);
console.log('PASS another actor cannot inherit active HUMAN correction window');

const handed = clone(started);
handed.status = 'HUMAN_LOCKED';
handed.agent = null;
life.appendLifecycleEvent(handed.history, {
  at_utc: '2026-10-02T07:10:00Z',
  type: life.HANDOFF_EVENT,
  from_status: 'IN_PROGRESS',
  to_status: 'HUMAN_LOCKED',
  agent: 'AUTHORIZED',
  source_sha: handed.source_sha,
  bible_sha: handed.bible_sha,
});
assert.deepStrictEqual(
  guard.problemsForHumanDiff(started, handed, [locked.file, 'docs/biblia/.state/012.json']),
  [],
);
console.log('PASS authorized HUMAN handoff may close the one-shot correction');

console.log('Human protected diff self-test: SUCCESS');
