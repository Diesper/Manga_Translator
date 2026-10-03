'use strict';
const assert = require('assert');
const transition = require('../bible/commands/unit-transition');
const life = require('../bible/core/lifecycle-core');
const completion = require('../bible/core/completion');

const state = { index: 1, file: 'fixture.js', status: 'COMPLETED', source_sha: 'a'.repeat(40),
  test_sha: 'a'.repeat(40), bible_sha: 'b'.repeat(40), production_sha: null,
  completed_at_utc: '2026-10-01T00:00:00Z', history: [], audit_requests: [] };
const snapshot = life.lifecycleSnapshot(state);
const result = transition.planTransition({ state, currentStateSha: 'c'.repeat(40), request: {
  action: 'REFRESH_REVISION_FOR_AUDIT', actor: 'reviewer', at_utc: '2026-10-03T02:00:00Z',
  expected_status: 'COMPLETED', expected_state_sha: 'c'.repeat(40),
  expected_revision_id: snapshot.revision_id, expected_cycle: 0,
  test_sha: 'd'.repeat(40), bible_sha: 'e'.repeat(40), production_sha: null,
} });
assert.strictEqual(result.state.status, 'COMPLETED');
assert.strictEqual(result.state.review_status, 'READY_FOR_AUDIT');
assert.strictEqual(result.state.completed_at_utc, state.completed_at_utc);
assert.strictEqual(result.state.history.at(-1).to_status, 'COMPLETED');
assert.strictEqual(result.state.history.at(-1).to_review_status, 'READY_FOR_AUDIT');
assert.deepStrictEqual(life.lifecycleProblems(result.state), []);
for (const status of completion.WORK_STATUSES) {
  const next = JSON.parse(JSON.stringify(result.state));
  completion.setReviewStatus(next, status);
  assert.strictEqual(next.status, 'COMPLETED');
  assert.strictEqual(next.review_status, status);
}
assert.ok(completion.completionQuality(result.state, { decision: 'WAITING_PRIMARY' }).caveats.includes('WAITING_PRIMARY'));
assert.ok(completion.completionProblems({ status: 'READY_FOR_AUDIT', history: [{ to_status: 'COMPLETED' }] }).length);
assert.strictEqual(completion.hasCompleted({ status: 'READY_FOR_AUDIT', history: [] }), false);
const reconciliation = require('../bible/commands/reconcile-audit-results');
const historyGuard = require('./verify-bible-state-history-append-only');
const migration = require('../bible/commands/migrate-completion');
const rejected = reconciliation.projectState(state, { index: 1, source_sha: state.source_sha,
  bible_sha: state.bible_sha, decision: 'CHANGES_REQUIRED', primary: { verdict: 'CHANGES_REQUIRED' },
  adversarial: { verdict: 'CHANGES_REQUIRED', completed_at_utc: '2026-10-03T03:00:00Z' }, problems: [] });
assert.strictEqual(rejected.state.status, 'COMPLETED');
assert.strictEqual(rejected.state.review_status, 'CHANGES_REQUIRED');
assert.deepStrictEqual(rejected.state.completion_quality, { status: 'WITH_CAVEATS', caveats: ['CHANGES_REQUIRED'] });
assert.strictEqual(rejected.state.completed_at_utc, state.completed_at_utc);
assert.ok(historyGuard.historyAppendOnlyProblems(state, { ...state, status: 'PENDING' }).includes('COMPLETED_STATUS_REGRESSION'));
const reopened = { ...state, status: 'CHANGES_REQUIRED', completed_at_utc: null,
  history: [{ at_utc: state.completed_at_utc, to_status: 'COMPLETED' }, { at_utc: '2026-10-02T00:00:00Z', to_status: 'CHANGES_REQUIRED' }] };
const restored = migration.migrate(reopened, { decision: 'WAITING_PRIMARY' }, '2026-10-03T00:00:00Z');
assert.strictEqual(restored.status, 'COMPLETED');
assert.strictEqual(restored.review_status, 'CHANGES_REQUIRED');
assert.deepStrictEqual(restored.history.slice(0, reopened.history.length), reopened.history);
assert.deepStrictEqual(historyGuard.historyAppendOnlyProblems(reopened, restored), []);
assert.deepStrictEqual(migration.migrate(restored, { decision: 'WAITING_PRIMARY' }, '2026-10-04T00:00:00Z'), restored);
const derived = require('./bible-coordination').buildDerived([result.state], new Map(), 'fixture', new Map([[1, { decision: 'WAITING_PRIMARY' }]]));
assert.match(derived.checklist, /\[x\].*COMPLETED.*com ressalvas/);
const readiness = require('./bible-coordination').evaluateMergeReadiness({states: [result.state], problems: [], auditPipelines: new Map([[1, {decision:'WAITING_PRIMARY'}]])});
assert.strictEqual(readiness.ready, false);
assert.ok(readiness.blockers.some(blocker => blocker.startsWith('conclusões com ressalvas=')));
const access = require('../bible/core/completed-access');
const firstCompletion = transition.projectAuditDecision({...state,status:'READY_FOR_AUDIT',completed_at_utc:null}, { decision:'APPROVED', source_sha:state.source_sha, bible_sha:state.bible_sha, problems:[] }, {at_utc:'2026-10-03T04:00:00Z'}).state;
assert.deepStrictEqual(access.resultProblems(firstCompletion,{completed_at_ms:Date.parse('2026-10-03T04:00:00Z'),completed_at_utc:'2026-10-03T04:00:00Z'},[]),[]);
assert.deepStrictEqual(access.resultProblems(firstCompletion,{completed_at_ms:Date.parse('2026-10-03T04:00:01Z'),completed_at_utc:'2026-10-03T04:00:01Z'},[]),['COMPLETED_AUDIT_WITHOUT_DIRECT_HUMAN_ORDER']);
console.log('Monotonic COMPLETED self-test: SUCCESS');
