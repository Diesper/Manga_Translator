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
const e2ePlan = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'ci', 'e2e-shard-plan.json'), 'utf8'));
const e2ePlanVerifier = fs.readFileSync(path.join(root, 'tests', 'ci', 'verify-e2e-shard-plan.js'), 'utf8');
const e2eGroupRunner = fs.readFileSync(path.join(root, 'tests', 'ci', 'run-e2e-group.js'), 'utf8');
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
  'e2e-shard',
  'e2e',
  'jest-worker-diagnostic',
  'focused-project-leak-diagnostic',
  'background-leak-bisection',
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
    continue;
  }

  for (const requiredCondition of [
    "github.event_name == 'workflow_dispatch'",
    "github.event_name == 'push'",
    "github.ref == 'refs/heads/main'",
  ]) {
    if (!block.includes(requiredCondition)) {
      problems.push(
        diagnosticJob + ': precisa executar em workflow_dispatch e em todo push da main; ausente: ' +
        requiredCondition
      );
    }
  }

  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(diagnosticJob + ': não pode mascarar falha com continue-on-error no job');
  }

  const lines = block.split(/\r?\n/);
  const diagnosticRun = lines.findIndex((line) =>
    /run:\s+npm run test:diagnose-(?:workers|background-leak)/.test(line)
  );
  if (diagnosticRun < 0) {
    problems.push(diagnosticJob + ': comando de diagnóstico obrigatório ausente');
  } else {
    const nearby = lines.slice(Math.max(0, diagnosticRun - 3), diagnosticRun).join('\n');
    if (/continue-on-error:\s*true/.test(nearby)) {
      problems.push(diagnosticJob + ': passo de diagnóstico não pode usar continue-on-error');
    }
  }
}

if (!/cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/.test(workflow)) {
  problems.push('concurrency: execuções da main não podem ser canceladas por um merge posterior');
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

for (const job of ['smoke', 'visual', 'unit-and-integration', 'coverage', 'e2e-shard', 'e2e']) {
  const block = jobBlock(job);
  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(job + ': job funcional não pode usar continue-on-error: true');
  }
}

const e2eShard = jobBlock('e2e-shard');
const e2e = jobBlock('e2e');
if (/^    needs:/m.test(e2eShard)) {
  problems.push('e2e-shard: precisa executar independentemente de outros jobs funcionais');
}
if (!/^    needs:\s*$/m.test(e2e) || !e2e.includes('- e2e-shard')) {
  problems.push('e2e: gate agregado precisa depender dos shards');
}
if (!e2e.includes('merge-reports') || !e2e.includes('playwright-merge.config.js')) {
  problems.push('e2e: gate agregado precisa mesclar blob reports antes de validar inventário');
}
for (const group of ['fifo', 'attachment', 'medium-a', 'medium-b', 'fast']) {
  if (!e2eShard.includes(group)) {
    problems.push('e2e-shard: grupo explícito ausente da matriz: ' + group);
  }
}
if (!e2eShard.includes('test:e2e:group') || !e2eShard.includes("MANGA_E2E_SHARD: '1'")) {
  problems.push('e2e-shard: precisa executar grupos explícitos com blob reporter');
}
if (/MANGA_E2E_WORKERS:\s*['"]?\d+/.test(e2eShard)) {
  problems.push('e2e-shard: workers não podem ficar hardcoded no workflow; use e2e-shard-plan.json');
}
if (!e2eGroupRunner.includes('MANGA_E2E_WORKERS: String(group.workers)')) {
  problems.push('run-e2e-group.js precisa aplicar workers do plano como fonte única de verdade');
}
if (e2eShard.includes('--shard=')) {
  problems.push('e2e-shard: não deve voltar ao sharding automático por contagem');
}
if (!e2e.includes('test:e2e:plan')) {
  problems.push('e2e: precisa verificar cobertura exata dos grupos antes do merge');
}
if (!e2e.includes('wc -l)" -eq 5')) {
  problems.push('e2e: precisa exigir exatamente 5 blob reports');
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

// O gate precisa sobreviver a falhas/skips de dependências para avaliá-las,
// mas não deve ressuscitar depois que o workflow inteiro foi cancelado.
const gate = jobBlock('ci-gate');
if (!/if:\s*\$\{\{\s*always\(\)\s*&&\s*!cancelled\(\)\s*\}\}/.test(gate)) {
  problems.push(
    'ci-gate: precisa usar if: always() && !cancelled() para avaliar falhas reais sem transformar workflow cancelado em falso vermelho'
  );
}
if (/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(gate)) {
  problems.push('ci-gate: if: always() puro é proibido porque pode gerar falso vermelho em run cancelado');
}
for (const dependency of requiredJobs.filter((job) => job !== 'ci-gate')) {
  if (!gate.includes('- ' + dependency)) {
    problems.push('ci-gate: dependência obrigatória ausente: ' + dependency);
  }
}

for (const marker of [
  'FULL_DIAGNOSTICS_REQUIRED',
  'JEST_WORKER_DIAGNOSTIC',
  'FOCUSED_PROJECT_LEAK',
  'BACKGROUND_LEAK_BISECTION',
  'if [ "$FULL_DIAGNOSTICS_REQUIRED" = "true" ]; then',
  'check "Jest Worker Diagnostic" "$JEST_WORKER_DIAGNOSTIC"',
  'check "Focused Project Leak" "$FOCUSED_PROJECT_LEAK"',
  'check "Background Leak Bisection" "$BACKGROUND_LEAK_BISECTION"',
]) {
  if (!gate.includes(marker)) {
    problems.push('ci-gate: proteção pós-merge incompleta, marcador ausente: ' + marker);
  }
}

if (!playwright.includes('forbidOnly: isCi')) {
  problems.push('Playwright precisa proibir test.only em CI');
}
if (!playwright.includes('fullyParallel: true')) {
  problems.push('Playwright precisa habilitar distribuição por teste para balancear shards');
}
if (!playwright.includes('retries: isCi ? 0')) {
  problems.push('Playwright CI precisa usar retries=0 para não mascarar flakiness nem desperdiçar tempo');
}
if (!playwright.includes('./ci/playwright-gate-reporter.js')) {
  problems.push('Playwright precisa carregar o reporter de gate em CI');
}
if (pkg.scripts['test:e2e:group'] !== 'node ci/run-e2e-group.js') {
  problems.push('tests/package.json#test:e2e:group precisa usar o runner de grupos explícitos');
}
if (pkg.scripts['test:e2e:plan'] !== 'node ci/verify-e2e-shard-plan.js') {
  problems.push('tests/package.json#test:e2e:plan precisa verificar o inventário dos shards');
}
if (!Array.isArray(e2ePlan.groups) || e2ePlan.groups.length !== 5) {
  problems.push('e2e-shard-plan.json precisa conter exatamente 5 grupos nesta fase');
} else {
  const expected = new Map([
    ['fifo', { tests: 1, workers: 1 }],
    ['attachment', { tests: 3, workers: 3 }],
    ['medium-a', { tests: 4, workers: 2 }],
    ['medium-b', { tests: 4, workers: 2 }],
    ['fast', { tests: 9, workers: 3 }],
  ]);
  let total = 0;
  for (const group of e2ePlan.groups) {
    total += Number(group.expectedTests || 0);
    if (!expected.has(group.id)) {
      problems.push('e2e-shard-plan.json contém grupo inesperado: ' + group.id);
      continue;
    }
    const expectedGroup = expected.get(group.id);
    if (group.expectedTests !== expectedGroup.tests) {
      problems.push('e2e-shard-plan.json contagem inválida para ' + group.id);
    }
    if (group.workers !== expectedGroup.workers) {
      problems.push('e2e-shard-plan.json workers inválidos para ' + group.id +
        ': esperado=' + expectedGroup.workers + ', atual=' + group.workers);
    }
  }
  if (total !== baseline.e2e.minTests) {
    problems.push('e2e-shard-plan.json precisa cobrir exatamente o baseline atual de E2E');
  }
}
for (const invariant of ['cobertura exata sem omissões ou duplicatas', 'teste duplicado entre grupos', 'Testes sem grupo']) {
  if (!e2ePlanVerifier.includes(invariant)) {
    problems.push('verify-e2e-shard-plan.js não protege invariável: ' + invariant);
  }
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

console.log('Contrato da CI validado: gates obrigatórios, regressões e verificação completa pós-merge da main protegidos.');