'use strict';

const assert = require('assert');
const { CI_REQUIRED_JOBS, evaluateGateResults } = require('../ci/verify-required-job-results');

function needsForCi() {
  return Object.fromEntries(CI_REQUIRED_JOBS.map(([job]) => [job, { result: 'success' }]));
}

function evaluate(needs, overrides = {}) {
  return evaluateGateResults({
    GATE_MODE: 'ci',
    NEEDS_JSON: JSON.stringify(needs),
    BIBLE_FINAL_REQUIRED: 'false',
    FULL_DIAGNOSTICS_REQUIRED: 'false',
    FRESH_DEVELOPER_REQUIRED: 'false',
    ...overrides,
  });
}

const allSuccess = evaluate(needsForCi());
assert.strictEqual(allSuccess.failures.length, 0, 'todos os gates obrigatórios aprovados devem passar.');

for (const result of ['failure', 'skipped', 'cancelled', undefined]) {
  const needs = needsForCi();
  needs.coverage = result === undefined ? {} : { result };
  const evaluation = evaluate(needs);
  assert(evaluation.failures.some((entry) => entry.label === 'Code Coverage'),
    'coverage com resultado ' + result + ' precisa falhar o gate.');
}

const diagnosticsSkipped = needsForCi();
diagnosticsSkipped['jest-worker-diagnostic'] = { result: 'skipped' };
assert.strictEqual(evaluate(diagnosticsSkipped).failures.length, 0,
  'diagnóstico opcional não deve bloquear PR quando sua regra não o exige.');
assert(evaluate(diagnosticsSkipped, { FULL_DIAGNOSTICS_REQUIRED: 'true' }).failures
  .some((entry) => entry.label === 'Jest Worker Diagnostic'),
'diagnóstico deve bloquear quando workflow_dispatch/main o torna obrigatório.');

const bibleSkipped = needsForCi();
bibleSkipped['bible-final-readiness'] = { result: 'skipped' };
assert.strictEqual(evaluate(bibleSkipped).failures.length, 0,
  'Bible Final Readiness pode ser opcional em PRs sem escopo da Bíblia.');
assert(evaluate(bibleSkipped, { BIBLE_FINAL_REQUIRED: 'true' }).failures
  .some((entry) => entry.label === 'Bible Final Readiness'),
'Bible Final Readiness deve bloquear quando exigido.');

const freshFlowSkipped = needsForCi();
freshFlowSkipped['fresh-developer-flow'] = { result: 'skipped' };
assert(evaluate(freshFlowSkipped, { FRESH_DEVELOPER_REQUIRED: 'true' }).failures
  .some((entry) => entry.label === 'Fresh Developer Flow'),
'Fresh Developer Flow deve bloquear workflow_dispatch quando exigido.');

assert.strictEqual(evaluateGateResults({ NEEDS_JSON: JSON.stringify({
  governance: { result: 'success' }, mutation: { result: 'success' }, performance: { result: 'success' },
}) }).failures.length, 0, 'todos os needs diretos dos agregadores devem passar.');
assert(evaluateGateResults({ NEEDS_JSON: JSON.stringify({ governance: { result: 'success' },
  mutation: { result: 'failure' }, performance: { result: 'success' } }) }).failures
  .some((entry) => entry.label === 'mutation'), 'o agregador precisa rejeitar falha de dependência.');
assert.throws(() => evaluateGateResults({ NEEDS_JSON: '{}' }), /Nenhuma dependência/,
  'needs vazio deve falhar fechado.');
assert.throws(() => evaluateGateResults({ NEEDS_JSON: 'not-json' }), /NEEDS_JSON inválido/,
  'JSON inválido deve falhar fechado.');

console.log('✅ Self-test do gate: falhas, skips, dependências ausentes e JSON inválido são rejeitados; regras condicionais preservadas.');
