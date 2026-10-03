'use strict';

const CI_REQUIRED_JOBS = [
  ['version-integrity', 'Version Integrity'],
  ['syntax-check', 'JS Syntax Check'],
  ['manifest-validation', 'Manifest Validation'],
  ['ci-contract', 'CI Contract'],
  ['smoke', 'Smoke Tests'],
  ['visual', 'Visual Tests'],
  ['unit-and-integration', 'Unit + Integration'],
  ['coverage-shard', 'Coverage Shards'],
  ['coverage', 'Code Coverage'],
  ['e2e-shard', 'E2E Shards'],
  ['e2e', 'E2E Tests'],
  ['windows-portability', 'Windows Portability'],
];

const OPTIONAL_CI_JOBS = [
  { env: 'BIBLE_FINAL_REQUIRED', job: 'bible-final-readiness', label: 'Bible Final Readiness' },
  { env: 'FULL_DIAGNOSTICS_REQUIRED', job: 'jest-worker-diagnostic', label: 'Jest Worker Diagnostic' },
  { env: 'FULL_DIAGNOSTICS_REQUIRED', job: 'focused-project-leak-diagnostic', label: 'Focused Project Leak' },
  { env: 'FULL_DIAGNOSTICS_REQUIRED', job: 'background-leak-bisection', label: 'Background Leak Bisection' },
  { env: 'FRESH_DEVELOPER_REQUIRED', job: 'fresh-developer-flow', label: 'Fresh Developer Flow' },
];

function parseNeeds(raw) {
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('NEEDS_JSON ausente.');
  let needs;
  try { needs = JSON.parse(raw); }
  catch (error) { throw new Error('NEEDS_JSON inválido: ' + error.message); }
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    throw new Error('NEEDS_JSON precisa ser um objeto.');
  }
  return needs;
}

function requiredCiJobs(env) {
  const checks = CI_REQUIRED_JOBS.slice();
  for (const { env: flag } of OPTIONAL_CI_JOBS) {
    if (env[flag] !== 'true' && env[flag] !== 'false') {
      throw new Error(flag + ' precisa ser exatamente true ou false.');
    }
  }
  for (const entry of OPTIONAL_CI_JOBS) {
    if (env[entry.env] === 'true') checks.push([entry.job, entry.label]);
  }
  return checks;
}

function evaluateGateResults(env) {
  const needs = parseNeeds(env.NEEDS_JSON);
  if (env.GATE_MODE && env.GATE_MODE !== 'ci') throw new Error('GATE_MODE inválido.');
  const checks = env.GATE_MODE === 'ci' ? requiredCiJobs(env) : Object.keys(needs).map((job) => [job, job]);
  if (checks.length === 0) throw new Error('Nenhuma dependência foi declarada; falha fechada.');

  const failures = [];
  const passed = [];
  for (const [job, label] of checks) {
    const result = needs[job]?.result;
    if (result === 'success') passed.push(label);
    else failures.push({ label, result: typeof result === 'string' ? result : 'ausente' });
  }
  return { passed, failures };
}

function main(env = process.env) {
  try {
    const { passed, failures } = evaluateGateResults(env);
    for (const label of passed) console.log('✅ ' + label + ' = success');
    for (const { label, result } of failures) {
      console.error('::error::' + label + " terminou como '" + result + "'; o gate exige 'success'.");
    }
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    console.error('::error::Não foi possível verificar os gates obrigatórios: ' + error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { CI_REQUIRED_JOBS, evaluateGateResults, main, parseNeeds, requiredCiJobs };
