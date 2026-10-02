'use strict';

const lifecycleCore = require('../../docs/biblia/.coordination/lifecycle-core');

const {
  shardForIndex,
  shardOrderForAuditor,
  isExpiredClaimSource,
  planAuditWork,
} = require('./bible-audit-work-plan');

function assert(name, condition) {
  if (!condition) throw new Error(name);
  console.log('PASS ' + name);
}

function state(index, status = 'READY_FOR_AUDIT') {
  return {
    index,
    status,
    file: 'fixture/' + index + '.js',
    bible: 'docs/biblia/fixture/' + index + '.js/Bíblia.md',
    source_sha: String(index).padStart(40, '0'),
  };
}

assert('shard 1', shardForIndex(1, 80) === 1);
assert('shard 80', shardForIndex(80, 80) === 80);
assert('shard wrap 81 -> 1', shardForIndex(81, 80) === 1);
assert('auditor 16 prefere shard 16', shardOrderForAuditor(16, 80)[0] === 16);
assert('work stealing é circular', shardOrderForAuditor(80, 80)[1] === 1);
assert(
  'lease expirado é recuperável',
  isExpiredClaimSource('LEASE_EXPIRES_AT_UTC: 2026-10-01T10:00:00Z', Date.parse('2026-10-01T11:00:00Z')) === true
);
assert(
  'lease vigente continua bloqueando',
  isExpiredClaimSource('LEASE_EXPIRES_AT_UTC: 2026-10-01T12:00:00Z', Date.parse('2026-10-01T11:00:00Z')) === false
);
assert(
  'claim legado sem TTL continua bloqueando',
  isExpiredClaimSource('AUDITOR: AGENTE 1', Date.parse('2026-10-01T11:00:00Z')) === false
);

const pipelines = new Map([
  [1, { primary: null, adversarial: null, reaudit: null, divergent: false }],
  [2, { primary: { verdict: 'APPROVED' }, adversarial: null, reaudit: null, divergent: false }],
  [3, { primary: { verdict: 'CHANGES_REQUIRED' }, adversarial: null, reaudit: null, divergent: false }],
  [4, { primary: { verdict: 'APPROVED' }, adversarial: { verdict: 'CHANGES_REQUIRED' }, reaudit: null, divergent: true }],
  [5, { primary: { verdict: 'APPROVED' }, adversarial: { verdict: 'APPROVED' }, reaudit: null, divergent: false }],
]);

const plan = planAuditWork({
  states: [state(1), state(2), state(3), state(4), state(5, 'COMPLETED')],
  pipelines,
  auditClaims: ['docs/biblia/.coordination/audit-claims/primary/001.lock.md'],
  auditorOrdinal: 2,
  shardCount: 4,
});

assert('claim ativo remove índice', !plan.candidates.some((item) => item.index === 1));
assert('ADVERSARIAL obrigatória após PRIMARY APPROVED', plan.candidates.some((item) => item.index === 2 && item.phase === 'ADVERSARIAL'));
assert('ADVERSARIAL obrigatória após PRIMARY CHANGES_REQUIRED', plan.candidates.some((item) => item.index === 3 && item.phase === 'ADVERSARIAL'));
assert('REAUDIT somente na divergência', plan.candidates.some((item) => item.index === 4 && item.phase === 'REAUDIT'));
assert('pipeline final não gera trabalho', !plan.candidates.some((item) => item.index === 5));
assert('trabalho do shard local vem antes de steal', plan.candidates[0].shard === 2);

const escalatedState = state(8);
escalatedState.bible_sha = '8'.repeat(40);
escalatedState.history = [];
for (let i=1;i<=4;i+=1) {
  escalatedState.history.push({
    at_utc:'2026-10-01T0' + i + ':10:00Z',
    type:lifecycleCore.HANDOFF_EVENT,
    source_sha:escalatedState.source_sha,
    bible_sha:escalatedState.bible_sha,
  });
}
const normalPriorityState = state(9);
normalPriorityState.bible_sha = '9'.repeat(40);
const priorityPlan = planAuditWork({
  states:[normalPriorityState,escalatedState],
  pipelines:new Map([
    [9,{primary:null,adversarial:null,reaudit:null,divergent:false}],
    [8,{primary:null,adversarial:null,reaudit:null,divergent:false}],
  ]),
  auditorOrdinal:1,
  shardCount:4,
});
assert('escalation priority vence preferência de shard', priorityPlan.candidates[0].index === 8);
assert('audit planner expõe HIGH e priority score', priorityPlan.candidates[0].escalation_level === 'HIGH' && priorityPlan.candidates[0].priority_score > priorityPlan.candidates[1].priority_score);

const humanState = state(6, 'HUMAN_LOCKED');
humanState.bible_sha = 'b'.repeat(40);
humanState.history = [];
for (let i=1;i<=7;i+=1) {
  humanState.history.push({
    at_utc: '2026-10-01T0' + i + ':10:00Z',
    type: lifecycleCore.HANDOFF_EVENT,
    source_sha: humanState.source_sha,
    bible_sha: humanState.bible_sha,
  });
}
const humanSnapshot = lifecycleCore.lifecycleSnapshot(humanState);
const humanPipelines = new Map([[6, { primary:null, adversarial:null, reaudit:null, divergent:false }]]);
let humanPlan = planAuditWork({
  states:[humanState],
  pipelines:humanPipelines,
  auditorOrdinal:1,
  shardCount:4,
  humanApprovals:[],
});
assert('HUMAN sem aprovação fica fora', humanPlan.candidates.length === 0);

const auditApproval = {
  schema_version:1,
  approval_id:'006-human-audit',
  index:6,
  locked_cycle:7,
  decision:'ALLOW_AUDIT_ONLY',
  permission:null,
  approved_by:'human',
  approved_at_utc:'2026-10-02T07:00:00Z',
  approval_source:'workflow_dispatch',
  approval_environment:'human-approval',
  production_sha:humanSnapshot.production_sha,
  test_sha:humanSnapshot.test_sha,
  bible_sha:humanSnapshot.bible_sha,
  revision_id:humanSnapshot.revision_id,
};
humanPlan = planAuditWork({
  states:[humanState],
  pipelines:humanPipelines,
  auditorOrdinal:1,
  shardCount:4,
  humanApprovals:[auditApproval],
});
assert('ALLOW_AUDIT_ONLY libera PRIMARY sem liberar correção', humanPlan.candidates.length === 1 && humanPlan.candidates[0].phase === 'PRIMARY');
assert('candidato HUMAN carrega approval id', humanPlan.candidates[0].human_audit_approval_id === auditApproval.approval_id);

console.log('Bible audit shards self-test: SUCCESS');
