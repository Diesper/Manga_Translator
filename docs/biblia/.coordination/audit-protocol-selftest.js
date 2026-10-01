'use strict';

const fs = require('fs');
const path = require('path');
const { resolvePipeline, strictOwnershipProblems } = require('./audit-protocol');

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

const protocolSource = fs.readFileSync(path.join(__dirname, 'audit-protocol.js'), 'utf8');
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
