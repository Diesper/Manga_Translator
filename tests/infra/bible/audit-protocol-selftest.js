'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolvePipeline,
  strictOwnershipProblems,
  commonClaimProblems,
  duplicateIndexProblem,
  leaseRevisionProblems,
  primaryLeaseStatusProblem,
  validateEditorialReservationEntries,
} = require('../../../scripts/bible/commands/audit-protocol');
const completedOrderFixture = require('./completed-order-fixture');

function state() {
  return {
    index: 1,
    file: 'fixture.js',
    bible: 'docs/biblia/fixture.js/Bíblia.md',
    source_sha: 'a'.repeat(40),
    status: 'COMPLETED',
  };
}

function record(phase, verdict, auditor, minute) {
  return {
    index: 1,
    phase,
    verdict,
    auditor,
    source_sha: 'a'.repeat(40),
    completed_at_ms: Date.parse('2026-10-01T15:' + String(minute).padStart(2, '0') + ':00Z'),
    path: phase + '-' + auditor + '.json',
    legacy: false,
  };
}

function assert(name, condition, detail) {
  if (!condition) throw new Error(name + ': ' + detail);
  process.stdout.write('PASS ' + name + '\n');
}

const legacy = new Map([[1, {
  index: 1,
  sourceSha: 'a'.repeat(40),
  verdict: 'APPROVED',
  legacy: true,
}]]);

let pipeline = resolvePipeline(state(), [], legacy);
assert(
  'aprovação legada vale somente como PRIMARY',
  pipeline.decision === 'WAITING_ADVERSARIAL' && pipeline.next_phase === 'ADVERSARIAL',
  JSON.stringify(pipeline)
);

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'APPROVED', 'AUDITOR-2', 1),
], new Map());
assert('PRIMARY + ADVERSARIAL aprovam', pipeline.decision === 'APPROVED', JSON.stringify(pipeline));

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'CHANGES_REQUIRED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', 1),
], new Map());
assert('dupla reprovação exige correção', pipeline.decision === 'CHANGES_REQUIRED', JSON.stringify(pipeline));

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', 1),
], new Map());
assert(
  'divergência exige REAUDIT',
  pipeline.decision === 'REAUDIT_REQUIRED' && pipeline.next_phase === 'REAUDIT',
  JSON.stringify(pipeline)
);

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', 1),
  record('REAUDIT', 'APPROVED', 'AUDITOR-3', 2),
], new Map());
assert('REAUDIT resolve divergência', pipeline.decision === 'APPROVED', JSON.stringify(pipeline));

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'APPROVED', 'AUDITOR-1', 1),
], new Map());
assert(
  'PRIMARY e ADVERSARIAL exigem auditores independentes',
  pipeline.problems.some((problem) => problem.includes('auditores diferentes')),
  JSON.stringify(pipeline)
);


const stale = record('PRIMARY', 'APPROVED', 'AUDITOR-STALE', 3);
stale.source_sha = 'b'.repeat(40);
pipeline = resolvePipeline(state(), [stale], new Map());
assert(
  'resultado distribuído com SOURCE_SHA stale é ignorado',
  pipeline.decision === 'WAITING_PRIMARY' && pipeline.primary === null,
  JSON.stringify(pipeline)
);

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', 1),
  record('REAUDIT', 'APPROVED', 'AUDITOR-1', 2),
], new Map());
assert(
  'REAUDIT não pode repetir auditor PRIMARY',
  pipeline.problems.some((problem) => problem.includes('REAUDIT deve ser independente')),
  JSON.stringify(pipeline)
);

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'CHANGES_REQUIRED', 'AUDITOR-2', 1),
  record('REAUDIT', 'APPROVED', 'AUDITOR-2', 2),
], new Map());
assert(
  'REAUDIT não pode repetir auditor ADVERSARIAL',
  pipeline.problems.some((problem) => problem.includes('REAUDIT deve ser independente')),
  JSON.stringify(pipeline)
);

pipeline = resolvePipeline(state(), [
  record('PRIMARY', 'APPROVED', 'AUDITOR-1', 0),
  record('ADVERSARIAL', 'APPROVED', 'AUDITOR-2', 1),
  record('REAUDIT', 'APPROVED', 'AUDITOR-3', 2),
], new Map());
assert(
  'REAUDIT sem divergência é inválido',
  pipeline.problems.some((problem) => problem.includes('REAUDIT só é válido')),
  JSON.stringify(pipeline)
);

const fixtureState = {
  ...state(),
  review_status: 'CHANGES_REQUIRED',
  test_sha: 'a'.repeat(40),
  bible_sha: 'c'.repeat(40),
  completion: {
    achieved: true,
    first_completed_at_utc: '2026-10-01T00:00:00.000Z',
    human_order_required_since_utc: '2026-10-01T00:00:00.000Z',
  },
};
const completedOrder = completedOrderFixture.orderFor(fixtureState, new Date().toISOString());
assert(
  'lease PRIMARY em COMPLETED aceita ordem humana exata e ativa',
  primaryLeaseStatusProblem(fixtureState, false, [completedOrder]) === null,
  String(primaryLeaseStatusProblem(fixtureState, false, [completedOrder]))
);
assert(
  'lease PRIMARY em COMPLETED sem ordem humana continua rejeitado',
  Boolean(primaryLeaseStatusProblem(fixtureState, false, [])),
  String(primaryLeaseStatusProblem(fixtureState, false, []))
);
const staleCompletedOrder = { ...completedOrder, test_sha: 'b'.repeat(40) };
assert(
  'lease PRIMARY em COMPLETED rejeita ordem vinculada a revisão antiga',
  Boolean(primaryLeaseStatusProblem(fixtureState, false, [staleCompletedOrder])),
  String(primaryLeaseStatusProblem(fixtureState, false, [staleCompletedOrder]))
);

let leaseProblems = commonClaimProblems({
  state: fixtureState,
  index: 1,
  auditor: 'AUDITOR-LEASE',
  sourceSha: 'b'.repeat(40),
  sourcePath: fixtureState.file,
  biblePath: fixtureState.bible,
  rel: 'docs/biblia/.coordination/audit-leases/primary/001.lock.md',
  phase: 'PRIMARY',
});
assert(
  'lease com SOURCE_SHA stale é rejeitado',
  leaseProblems.some((problem) => problem.includes('SOURCE_SHA stale')),
  JSON.stringify(leaseProblems)
);

leaseProblems = commonClaimProblems({
  state: fixtureState,
  index: 1,
  auditor: 'AUDITOR-LEASE',
  sourceSha: fixtureState.source_sha,
  sourcePath: fixtureState.file,
  biblePath: fixtureState.bible,
  rel: 'docs/biblia/.coordination/audit-leases/primary/001.lock.md',
  phase: 'PRIMARY',
  reservationPath: 'docs/biblia/.reservas/fixture.js.lock.md',
});
assert(
  'lease conflitando com reserva editorial é rejeitado',
  leaseProblems.some((problem) => problem.includes('conflita com reserva de edição')),
  JSON.stringify(leaseProblems)
);

const duplicateMap = new Map([[1, {
  path: 'docs/biblia/.coordination/audit-leases/primary/001.lock.md',
  auditor: 'AUDITOR-1',
  phase: 'PRIMARY',
}]]);
const duplicate = duplicateIndexProblem(
  duplicateMap,
  1,
  'docs/biblia/.coordination/audit-leases/adversarial/001.lock.md'
);
assert(
  'mais de um lease ativo no mesmo índice é rejeitado',
  Boolean(duplicate && duplicate.includes('mais de um claim/lease ativo')),
  String(duplicate)
);

const currentBibleSha = 'c'.repeat(40);
leaseProblems = leaseRevisionProblems({
  state: fixtureState,
  bibleSha: 'd'.repeat(40),
  currentBibleSha,
  baseline: null,
  rel: 'docs/biblia/.coordination/audit-leases/primary/001.lock.md',
});
assert(
  'lease com BIBLE_SHA stale é rejeitado',
  leaseProblems.some((problem) => problem.includes('BIBLE_SHA stale')),
  JSON.stringify(leaseProblems)
);

leaseProblems = leaseRevisionProblems({
  state: fixtureState,
  bibleSha: currentBibleSha,
  currentBibleSha,
  baseline: null,
  rel: 'docs/biblia/.coordination/audit-leases/primary/001.lock.md',
});
assert(
  'lease com BIBLE_SHA atual é aceito',
  leaseProblems.length === 0,
  JSON.stringify(leaseProblems)
);

const ownership = strictOwnershipProblems(new Map([
  ['AGENTE 8', [
    'docs/biblia/.coordination/audit-claims/101.lock.md',
    'docs/biblia/.coordination/audit-leases/adversarial/081.lock.md',
  ]],
]), ['docs/biblia/.coordination/audit-leases/primary/099.lock.md']);
assert(
  'gate final rejeita auditor com claim legado + lease novo simultâneos',
  ownership.some((problem) => problem.includes('>1 claim/lease ativo')),
  JSON.stringify(ownership)
);
assert(
  'gate final rejeita lease expirado residual',
  ownership.some((problem) => problem.includes('lease expirado residual')),
  JSON.stringify(ownership)
);

const reservationStates = [
  {
    index: 11,
    file:'tests/a.test.js',
    bible:'docs/biblia/tests/a.test.js/Bíblia.md',
    source_sha:'1'.repeat(40),
    status:'IN_PROGRESS',
    agent:'CORRETOR-X',
  },
  {
    index: 12,
    file:'tests/b.test.js',
    bible:'docs/biblia/tests/b.test.js/Bíblia.md',
    source_sha:'2'.repeat(40),
    status:'IN_PROGRESS',
    agent:'CORRETOR-X',
  },
];
const oneReservation = validateEditorialReservationEntries(reservationStates, [{
  path:'docs/biblia/.reservas/tests/a.test.js.lock.md',
  agent:'CORRETOR-X',
  file:'tests/a.test.js',
  bible:'docs/biblia/tests/a.test.js/Bíblia.md',
  source_sha:'1'.repeat(40),
  state:'ACTIVE',
}]);
assert(
  'reserva editorial coerente é aceita',
  oneReservation.problems.length===0 && oneReservation.strictProblems.length===0,
  JSON.stringify(oneReservation)
);

const badReservation = validateEditorialReservationEntries(reservationStates, [{
  path:'docs/biblia/.reservas/tests/a.test.js.lock.md',
  agent:'OUTRO-CORRETOR',
  file:'tests/a.test.js',
  bible:'docs/biblia/tests/a.test.js/Outra.md',
  source_sha:'1'.repeat(40),
  state:'ACTIVE',
}]);
assert(
  'reserva editorial owner/Bíblia divergentes são rejeitados',
  badReservation.problems.some((problem)=>problem.includes('BIBLIA diverge'))
    && badReservation.problems.some((problem)=>problem.includes('AGENTE diverge')),
  JSON.stringify(badReservation)
);

const duplicateReservations = validateEditorialReservationEntries(reservationStates, [
  {
    path:'docs/biblia/.reservas/tests/a.test.js.lock.md',
    agent:'CORRETOR-X',
    file:'tests/a.test.js',
    bible:'docs/biblia/tests/a.test.js/Bíblia.md',
    source_sha:'1'.repeat(40),
    state:'ACTIVE',
  },
  {
    path:'docs/biblia/.reservas/tests/b.test.js.lock.md',
    agent:'CORRETOR-X',
    file:'tests/b.test.js',
    bible:'docs/biblia/tests/b.test.js/Bíblia.md',
    source_sha:'2'.repeat(40),
    state:'ACTIVE',
  },
]);
assert(
  'gate distribuído rejeita corretor com duas reservas editoriais ativas',
  duplicateReservations.strictProblems.some((problem)=>problem.includes('>1 reserva editorial ativa')),
  JSON.stringify(duplicateReservations)
);

const protocolSource = fs.readFileSync(path.join(__dirname, '../../../scripts/bible/commands/audit-protocol.js'), 'utf8');
assert(
  'protocolo normal não depende de PROGRESS.lock.md',
  !protocolSource.includes('PROGRESS.lock.md'),
  'audit-protocol.js não pode adquirir/exigir o mutex global legado'
);
assert(
  'leases conflitam explicitamente com reserva editorial',
  protocolSource.includes('claim/lease conflita com reserva de edição'),
  'validação deve preservar exclusão edição↔auditoria'
);

process.stdout.write('Distributed audit protocol self-test: SUCCESS\n');
