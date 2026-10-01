'use strict';

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

console.log('Bible audit shards self-test: SUCCESS');
