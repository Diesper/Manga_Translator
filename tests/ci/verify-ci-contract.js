'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const playwright = fs.readFileSync(path.join(root, 'tests', 'playwright.config.js'), 'utf8');
const coverageConfig = fs.readFileSync(path.join(root, 'tests', 'jest.coverage.config.js'), 'utf8');
const coverageVerifier = fs.readFileSync(path.join(root, 'tests', 'ci', 'verify-coverage.js'), 'utf8');
const coverageSelfTest = fs.readFileSync(path.join(root, 'tests', 'ci', 'verify-coverage-selftest.js'), 'utf8');
const e2eReporter = fs.readFileSync(path.join(root, 'tests', 'ci', 'playwright-gate-reporter.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'ci', 'test-baseline.json'), 'utf8'));
const regressionMatrixPath = path.join(root, 'tests', 'ci', 'regression-matrix.json');

const problems = [];
let regressionMatrix = null;
try {
  regressionMatrix = JSON.parse(fs.readFileSync(regressionMatrixPath, 'utf8'));
} catch (error) {
  problems.push('regression-matrix.json inválido ou ausente: ' + error.message);
}
const requiredJobs = [
  'version-integrity',
  'syntax-check',
  'manifest-validation',
  'ci-contract',
  'smoke',
  'visual',
  'unit-and-integration',
  'coverage',
  'e2e',
  'ci-gate',
];

function jobBlock(id) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === '  ' + id + ':');
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

for (const job of requiredJobs) {
  if (!jobBlock(job)) problems.push('job obrigatório ausente: ' + job);
}

for (const diagnosticJob of [
  'jest-worker-diagnostic',
  'focused-project-leak-diagnostic',
  'background-leak-bisection',
]) {
  const block = jobBlock(diagnosticJob);
  if (!block) {
    problems.push('job de diagnóstico ausente: ' + diagnosticJob);
  } else if (!block.includes("github.event_name == 'workflow_dispatch'")) {
    problems.push(diagnosticJob + ': diagnóstico pesado deve rodar somente por workflow_dispatch');
  }
}

if (regressionMatrix) {
  const entries = Array.isArray(regressionMatrix.regressions)
    ? regressionMatrix.regressions
    : [];
  if (entries.length < 20) {
    problems.push('matriz de regressão precisa preservar pelo menos 20 contratos críticos');
  }
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) {
      problems.push('matriz de regressão contém entrada sem id');
      continue;
    }
    if (ids.has(entry.id)) problems.push('id de regressão duplicado: ' + entry.id);
    ids.add(entry.id);

    if (typeof entry.file !== 'string' || !entry.file) {
      problems.push(entry.id + ': arquivo de regressão ausente');
      continue;
    }
    const target = path.join(root, entry.file);
    if (!fs.existsSync(target)) {
      problems.push(entry.id + ': arquivo de regressão não existe: ' + entry.file);
      continue;
    }

    const source = fs.readFileSync(target, 'utf8');
    const markers = Array.isArray(entry.markers) ? entry.markers : [];
    if (!markers.length) {
      problems.push(entry.id + ': precisa declarar pelo menos um marcador obrigatório');
      continue;
    }
    for (const marker of markers) {
      if (typeof marker !== 'string' || !marker || !source.includes(marker)) {
        problems.push(entry.id + ': marcador obrigatório ausente em ' + entry.file + ': ' + marker);
      }
    }
  }
}

for (const job of ['smoke', 'visual', 'unit-and-integration', 'coverage', 'e2e']) {
  const block = jobBlock(job);
  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(job + ': job funcional não pode usar continue-on-error: true');
  }
}

const e2e = jobBlock('e2e');
if (/^    needs:/m.test(e2e)) {
  problems.push('e2e: precisa executar independentemente e não depender do sucesso de outro job funcional');
}

if (/npm run test:[^\n]*\|\|\s*true/.test(workflow)) {
  problems.push('workflow mascara comando de testes com "|| true"');
}

const coverage = jobBlock('coverage');
if (!/run:\s+npm run test:coverage/.test(coverage)) {
  problems.push('coverage: deve executar test:coverage de forma bloqueante');
}
if (!/run:\s+npm run test:coverage:verify/.test(coverage)) {
  problems.push('coverage: deve verificar a integridade do relatório em etapa bloqueante');
}
if (/npm run test:coverage[^\n]*\|\|\s*true/.test(coverage)) {
  problems.push('coverage: não pode mascarar Jest/coverage com "|| true"');
}
if (!coverage.includes('CODECOV_TOKEN not configured')) {
  problems.push('coverage: ausência de CODECOV_TOKEN precisa ser reportada explicitamente como SKIPPED');
}
if (!coverage.includes('fail_ci_if_error: true')) {
  problems.push('coverage: Codecov configurado deve reportar sua própria falha');
}

const gate = jobBlock('ci-gate');
if (!/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(gate)) {
  problems.push('ci-gate: precisa usar if: always() para avaliar failure/skipped/cancelled');
}
for (const dependency of requiredJobs.filter((job) => job !== 'ci-gate')) {
  if (!gate.includes('- ' + dependency)) {
    problems.push('ci-gate: dependência obrigatória ausente: ' + dependency);
  }
}

if (!playwright.includes('forbidOnly: !!process.env.CI')) {
  problems.push('Playwright precisa proibir test.only em CI');
}
if (!playwright.includes('./ci/playwright-gate-reporter.js')) {
  problems.push('Playwright precisa carregar o reporter de gate em CI');
}
if (pkg.scripts['test:ci'] !== 'node ci/run-jest-ci.js') {
  problems.push('tests/package.json#test:ci precisa usar o runner auditável');
}
const jestRunner = fs.readFileSync(path.join(root, 'tests', 'ci', 'run-jest-ci.js'), 'utf8');
if (!jestRunner.includes('hasForcedWorkerExit(jestStderr)')) {
  problems.push('run-jest-ci.js precisa reprovar o aviso de worker forçado');
}
if (!workflow.includes('node tests/ci/verify-jest-worker-warning-selftest.js')) {
  problems.push('CI Contract precisa testar a detecção de worker forçado');
}
if (jestRunner.includes("'--forceExit'") || jestRunner.includes('"--forceExit"')) {
  problems.push('run-jest-ci.js não pode mascarar open handles com --forceExit');
}
if (pkg.scripts['test:coverage'] !== 'node ci/run-jest-ci.js --coverage') {
  problems.push('tests/package.json#test:coverage precisa usar o runner auditável com cobertura');
}
if (pkg.scripts['test:coverage:verify'] !== 'node ci/verify-coverage.js') {
  problems.push('tests/package.json#test:coverage:verify precisa executar o verificador de integridade');
}
if (pkg.scripts['test:coverage:infra'] !== 'node ci/verify-coverage-selftest.js') {
  problems.push('tests/package.json#test:coverage:infra precisa testar a própria infraestrutura');
}
if (!coverageConfig.includes("coverageProvider: 'v8'")) {
  problems.push('jest.coverage.config.js precisa usar coverageProvider v8');
}
if (!coverageConfig.includes("<rootDir>/extension/**/*.js")) {
  problems.push('coverage precisa incluir a arquitetura atual extension/**/*.js');
}
for (const reporter of ['lcov', 'json-summary', 'text-summary']) {
  if (!coverageConfig.includes("'" + reporter + "'")) {
    problems.push('jest.coverage.config.js precisa gerar reporter ' + reporter);
  }
}
for (const invariant of ['lcov.info ausente ou vazio', 'coverage zero não é aceito', 'arquivo crítico ausente']) {
  if (!coverageVerifier.includes(invariant)) {
    problems.push('verify-coverage.js não protege invariável: ' + invariant);
  }
}
for (const scenario of ['coverage normal', 'lcov vazio', 'coverage 0%', 'arquivo crítico ausente', 'threshold abaixo do mínimo']) {
  if (!coverageSelfTest.includes(scenario)) {
    problems.push('self-test de coverage não cobre cenário: ' + scenario);
  }
}

for (const [name, value] of [
  ['jest.minSuites', baseline.jest && baseline.jest.minSuites],
  ['jest.minTests', baseline.jest && baseline.jest.minTests],
  ['visual.minTests', baseline.visual && baseline.visual.minTests],
  ['e2e.minTests', baseline.e2e && baseline.e2e.minTests],
  ['smoke.minFiles', baseline.smoke && baseline.smoke.minFiles],
  ['coverage.minInstrumentedFiles', baseline.coverage && baseline.coverage.minInstrumentedFiles],
]) {
  if (!Number.isInteger(value) || value <= 0) problems.push('baseline inválido: ' + name);
}

if (!Number.isInteger(baseline.e2e && baseline.e2e.maxFlaky) || baseline.e2e.maxFlaky < 0) {
  problems.push('baseline inválido: e2e.maxFlaky');
}

if (!e2eReporter.includes('attemptsById') || !e2eReporter.includes('maxFlaky')) {
  problems.push('reporter E2E precisa preservar tentativas e bloquear flaky/retry');
}
if (!e2eReporter.includes('const failed =') || !e2eReporter.includes('status final não aprovado')) {
  problems.push('reporter E2E precisa reprovar failed/timedOut/interrupted terminais');
}

if (problems.length) {
  console.error('Contrato da CI inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log('Contrato da CI validado: jobs independentes, gates obrigatórios e inventários protegidos.');
