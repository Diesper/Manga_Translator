'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const protocolWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'bible-protocol-infra.yml'), 'utf8');
const structureWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pr66-structure-review.yml'), 'utf8');
const { parseWorkflow } = require('./bible-ci-sharding-contract');
const playwright = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');
const coverageConfig = fs.readFileSync(path.join(root, 'jest.config.js'), 'utf8');
const coverageVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-coverage.js'), 'utf8');
const coverageSelfTest = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-coverage-selftest.js'), 'utf8');
const repositoryStructureVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-repository-structure.js'), 'utf8');
const testPolicyVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-test-policy.js'), 'utf8');
const testPolicySelfTest = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-test-policy-selftest.js'), 'utf8');
const publishContractVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-publish-contract.js'), 'utf8');
const e2eReporter = fs.readFileSync(path.join(root, 'scripts', 'ci', 'playwright-gate-reporter.js'), 'utf8');
const shardJobMetrics = fs.readFileSync(path.join(root, 'scripts', 'ci', 'verify-shard-job-metrics.js'), 'utf8');
const jobTimingsFetcher = fs.readFileSync(path.join(root, 'scripts', 'ci', 'fetch-github-job-timings.js'), 'utf8');
const requiredJobResultsVerifier = fs.readFileSync(path.join(root, 'scripts', 'ci', 'verify-required-job-results.js'), 'utf8');
const e2ePlan = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'e2e-shard-plan.json'), 'utf8'));
const e2ePlanVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-e2e-shard-plan.js'), 'utf8');
const e2eGroupRunner = fs.readFileSync(path.join(root, 'scripts', 'ci', 'run-e2e-group.js'), 'utf8');
const jestWorkerDiagnostic = fs.readFileSync(path.join(root, 'scripts', 'maintenance', 'diagnose-jest-workers.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'test-baseline.json'), 'utf8'));
const coverageShardPlan = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'coverage-shard-plan.json'), 'utf8'));
const workflowShardMetrics = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'workflow-shard-metrics.json'), 'utf8'));
const regressionMatrixPath = path.join(root, 'scripts', 'ci', 'data', 'regression-matrix.json');

const problems = [];
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
let workflowDocument = null;
try {
  workflowDocument = parseWorkflow(workflow);
} catch (error) {
  problems.push('ci.yml não pôde ser validado estruturalmente: ' + error.message);
}
let structureWorkflowDocument = null;
try {
  structureWorkflowDocument = parseWorkflow(structureWorkflow);
} catch (error) {
  problems.push('pr66-structure-review.yml não pôde ser validado estruturalmente: ' + error.message);
}
let protocolWorkflowDocument = null;
try {
  protocolWorkflowDocument = parseWorkflow(protocolWorkflow);
} catch (error) {
  problems.push('bible-protocol-infra.yml não pôde ser validado estruturalmente: ' + error.message);
}
if (workflowDocument?.defaults !== undefined || workflowDocument?.env !== undefined) {
  problems.push('ci.yml: shell/env globais são proibidos porque podem mascarar todos os comandos bloqueantes');
}

function executableRunLines(block) {
  const lines = String(block || '').split(/\r?\n/);
  const commands = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;

    const runIndent = match[1].length;
    const scalar = match[2].trim();
    if (scalar && !/^[>|][+-]?$/.test(scalar)) {
      if (!scalar.startsWith('#')) commands.push(scalar);
      continue;
    }

    if (!/^[>|]/.test(scalar)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const indent = (line.match(/^\s*/) || [''])[0].length;
      if (indent <= runIndent) break;
      const trimmed = line.trim();
      if (!trimmed.startsWith('#')) commands.push(trimmed);
    }
  }
  return commands;
}

function executableRunText(block) {
  return executableRunLines(block).join('\n');
}

function hasExecutableRun(block, marker) {
  return executableRunLines(block).some((line) => {
    let from = 0;
    while (from <= line.length) {
      const index = line.indexOf(marker, from);
      if (index < 0) return false;
      const next = line[index + marker.length] || '';
      if (!next || /\s|[;&|)]/.test(next)) return true;
      from = index + marker.length;
    }
    return false;
  });
}

function yamlListValues(block, key) {
  const lines = String(block || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (!match || match[2] !== key) continue;
    const keyIndent = match[1].length;
    const values = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const indent = (line.match(/^\s*/) || [''])[0].length;
      if (indent <= keyIndent) break;
      const item = /^\s*-\s*([^#]*?)(?:\s+#.*)?$/.exec(line);
      if (item) values.push(item[1].trim());
    }
    return values;
  }
  return [];
}

const ciContract = jobBlock('ci-contract');
if (!hasExecutableRun(ciContract, 'node scripts/validation/verify-repository-structure.js')) {
  problems.push('CI Contract precisa executar o gate estrutural do repositório');
}
if (!repositoryStructureVerifier.includes('legacyReferenceMarkers') ||
    !repositoryStructureVerifier.includes('referência operacional legada')) {
  problems.push('gate estrutural precisa varrer referências operacionais aos caminhos legados');
}
if (!hasExecutableRun(ciContract, 'npm run validate:test-policy')) {
  problems.push('CI Contract precisa executar a política anti-skip/escape-hatch');
}
if (pkg.scripts['validate:test-policy'] !== 'node scripts/validation/verify-test-policy.js') {
  problems.push('package.json#validate:test-policy precisa apontar para o verificador canônico');
}
if (!hasExecutableRun(ciContract, 'npm run test:test-policy:infra')) {
  problems.push('CI Contract precisa executar o self-test da política anti-skip');
}
if (pkg.scripts['test:test-policy:infra'] !== 'node scripts/validation/verify-test-policy-selftest.js') {
  problems.push('package.json#test:test-policy:infra precisa executar o self-test canônico');
}
for (const marker of ['test.skip', '--forceExit em script npm', 'teste mascarado com || true']) {
  if (!testPolicySelfTest.includes(marker)) {
    problems.push('self-test da política não cobre cenário: ' + marker);
  }
}
if (!hasExecutableRun(ciContract, 'npm run validate:publish')) {
  problems.push('CI Contract precisa executar o contrato de publicação');
}
if (pkg.scripts['validate:publish'] !== 'node scripts/validation/verify-publish-contract.js') {
  problems.push('package.json#validate:publish precisa executar o verificador de publicação');
}
for (const marker of ['cp -R extension/.', 'docs/Documentação.md', 'scripts/release/sync-version.js']) {
  if (!publishContractVerifier.includes(marker)) {
    problems.push('verify-publish-contract.js não protege marcador de release: ' + marker);
  }
}
for (const marker of ['.skip', '.only', 'test.todo', '--forceExit', '--passWithNoTests', '|| true']) {
  if (!testPolicyVerifier.includes(marker)) {
    problems.push('verify-test-policy.js não protege marcador proibido: ' + marker);
  }
}

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
  'coverage-shard',
  'coverage',
  'e2e-shard',
  'e2e',
  'jest-worker-diagnostic',
  'focused-project-leak-diagnostic',
  'background-leak-bisection',
  'windows-portability',
  'fresh-developer-flow',
  'bible-final-readiness',
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

const versionIntegrity = jobBlock('version-integrity');
if (!hasExecutableRun(versionIntegrity, 'npm run version:check')) {
  problems.push('version-integrity precisa executar npm run version:check');
}
if (!hasExecutableRun(versionIntegrity, 'node scripts/release/sync-version.js --print-env')) {
  problems.push('version-integrity precisa executar sync-version.js --print-env');
}


const freshDeveloperFlow = jobBlock('fresh-developer-flow');
if (!freshDeveloperFlow.includes("github.event_name == 'workflow_dispatch'")) {
  problems.push('fresh-developer-flow deve executar no workflow_dispatch pré-revisão');
}
for (const command of [
  'npm ci',
  'npm run test:unit',
  'npm run test:integration',
  'npm run test:smoke',
  'npm run test:visual',
  'npm run test:e2e',
  'npm test',
]) {
  if (!hasExecutableRun(freshDeveloperFlow, command)) {
    problems.push('fresh-developer-flow não preserva a sequência oficial: ' + command);
  }
}
if (!freshDeveloperFlow.includes('needs: [coverage]')) {
  problems.push('fresh-developer-flow deve depender do gate agregado de coverage Linux/Windows');
}
if (hasExecutableRun(freshDeveloperFlow, 'npm run test:coverage') ||
    hasExecutableRun(freshDeveloperFlow, 'npm run test:coverage:verify')) {
  problems.push('fresh-developer-flow não pode executar coverage integral serial; deve usar os shards agregados');
}
if (!hasExecutableRun(freshDeveloperFlow, 'playwright install chromium --with-deps --no-shell')) {
  problems.push('fresh-developer-flow precisa instalar Chromium antes do E2E');
}
if (!hasExecutableRun(freshDeveloperFlow, 'xvfb-run --auto-servernum -- npm run test:e2e')) {
  problems.push('fresh-developer-flow precisa executar o E2E da extensão com Xvfb no Linux');
}

const bibleFinalReadiness = jobBlock('bible-final-readiness');
for (const marker of [
  "github.head_ref == 'docs/project-bible'",
  "github.event_name == 'push'",
  "github.ref == 'refs/heads/main'",
  'fetch-depth: 0',
]) {
  if (!bibleFinalReadiness.includes(marker)) {
    problems.push('bible-final-readiness: marcador obrigatório ausente: ' + marker);
  }
}
if (!hasExecutableRun(bibleFinalReadiness, 'npm run bible:final-readiness')) {
  problems.push('bible-final-readiness: marcador obrigatório ausente: npm run bible:final-readiness');
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

  const diagnosticCommand = diagnosticJob === 'background-leak-bisection'
    ? 'npm run test:diagnose-background-leak'
    : 'npm run test:diagnose-workers';
  if (!hasExecutableRun(block, diagnosticCommand)) {
    problems.push(diagnosticJob + ': comando de diagnóstico obrigatório ausente');
  }
}

if (!/cancel-in-progress:\s*(?:false\b|\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\})/.test(workflow)) {
  problems.push('concurrency: execuções da main não podem ser canceladas por um merge posterior');
}
if (!/push:\s*\n\s*branches:\s*\n\s*- main/.test(workflow)) {
  problems.push('workflow deve executar push automático somente na main para não duplicar o mesmo commit de PR');
}
if (!/^\s{2}pull_request:\s*$/m.test(workflow) || !/^\s{2}workflow_dispatch:\s*$/m.test(workflow)) {
  problems.push('workflow precisa preservar pull_request e workflow_dispatch');
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

for (const job of ['smoke', 'visual', 'unit-and-integration', 'coverage', 'e2e-shard', 'e2e', 'windows-portability']) {
  const block = jobBlock(job);
  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(job + ': job funcional não pode usar continue-on-error: true');
  }
}

const windowsPortability = jobBlock('windows-portability');
if (!windowsPortability.includes('runs-on: windows-latest')) {
  problems.push('windows-portability precisa executar em windows-latest');
}
if (!windowsPortability.includes('needs: [coverage]')) {
  problems.push('windows-portability deve depender da cobertura integral agregada nos dois sistemas');
}
for (const command of [
  'npm ci',
  'npm run validate',
  'npm run test:ci',
  'npm run test:smoke',
  'npm run test:visual',
]) {
  if (!hasExecutableRun(windowsPortability, command)) {
    problems.push('windows-portability não cobre contrato obrigatório: ' + command);
  }
}

const e2eShard = jobBlock('e2e-shard');
const e2e = jobBlock('e2e');
if (workflowDocument?.jobs?.['e2e-shard']?.['timeout-minutes'] !== 2) {
  problems.push('e2e-shard: cada job precisa limitar o wall-clock total a dois minutos');
}
if (/^    needs:/m.test(e2eShard)) {
  problems.push('e2e-shard: precisa executar independentemente de outros jobs funcionais');
}
if (!/^    needs:\s*$/m.test(e2e) || !e2e.includes('- e2e-shard')) {
  problems.push('e2e: gate agregado precisa depender dos shards');
}
const e2eJob = workflowDocument?.jobs?.e2e;
if (e2eJob?.if !== '${{ always() && !cancelled() }}' ||
    e2eJob?.defaults !== undefined || e2eJob?.env !== undefined ||
    e2eJob?.container !== undefined || e2eJob?.services !== undefined ||
    e2eJob?.['continue-on-error'] !== undefined) {
  problems.push('e2e: agregador deve executar incondicionalmente após os shards sem overrides de job');
}
if (!same(e2eJob?.permissions, { actions: 'read', contents: 'read' })) {
  problems.push('e2e: coletor de wall-clock exige somente actions:read e contents:read');
}
if (!hasExecutableRun(e2e, 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json')) {
  problems.push('e2e: precisa coletar os tempos reais dos jobs via Actions API');
}
if (!hasExecutableRun(e2e, 'npm run ci:verify-shard-job-metrics -- --kind=e2e --timings=.ci-results/github-job-timings.json --work=.ci-results/e2e-shard-work.json')) {
  problems.push('e2e: precisa impor limites medidos de wall-clock, skew e eficiência útil/job');
}
if (!e2e.includes('CI_SHARD_WORK_FILE: .ci-results/e2e-shard-work.json')) {
  problems.push('e2e: merge de blob reports precisa materializar trabalho útil medido por shard');
}
if (!e2e.includes('merge-reports') || !e2e.includes('playwright-merge.config.js')) {
  problems.push('e2e: gate agregado precisa mesclar blob reports antes de validar inventário');
}
for (const group of ['fifo', 'attachment', 'medium-a', 'medium-b', 'fast']) {
  if (!e2eShard.includes(group)) {
    problems.push('e2e-shard: grupo explícito ausente da matriz: ' + group);
  }
}
if (!hasExecutableRun(e2eShard, 'npm run test:e2e:group') || !e2eShard.includes("MANGA_E2E_SHARD: '1'")) {
  problems.push('e2e-shard: precisa executar grupos explícitos com blob reporter');
}
if (!e2eShard.includes('GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}')) {
  problems.push('e2e-shard: telemetria precisa guardar separadamente o HEAD do PR');
}
if (/MANGA_E2E_WORKERS:\s*['"]?\d+/.test(e2eShard)) {
  problems.push('e2e-shard: workers não podem ficar hardcoded no workflow; use e2e-shard-plan.json');
}
if (!e2eGroupRunner.includes('MANGA_E2E_WORKERS: String(group.workers)')) {
  problems.push('run-e2e-group.js precisa aplicar workers do plano como fonte única de verdade');
}

if (!jestWorkerDiagnostic.includes("path.join(repoRoot, '.ci-results', aggregateName)")) {
  problems.push('diagnose-jest-workers.js precisa gravar o resumo agregado em /.ci-results');
}
if (jestWorkerDiagnostic.includes("path.join(testsRoot, '.ci-results'")) {
  problems.push('diagnose-jest-workers.js não pode reintroduzir tests/.ci-results');
}
if (e2eShard.includes('--shard=')) {
  problems.push('e2e-shard: não deve voltar ao sharding automático por contagem');
}
if (!hasExecutableRun(e2e, 'npm run test:e2e:plan')) {
  problems.push('e2e: precisa verificar cobertura exata dos grupos antes do merge');
}
if (!e2e.includes('wc -l)" -eq 5')) {
  problems.push('e2e: precisa exigir exatamente 5 blob reports');
}
if (!e2eReporter.includes('CI_SHARD_WORK_FILE') || !e2eReporter.includes('result.duration') ||
    !e2eReporter.includes('observedTests') || !e2eReporter.includes('GITHUB_HEAD_SHA') ||
    !e2eReporter.includes('headSha') || !e2eReporter.includes("result.status !== 'passed'") ||
    !e2eReporter.includes('result.startTime') ||
    !e2eReporter.includes('Math.round(unionIntervalDuration(group.intervals))')) {
  problems.push('playwright reporter precisa rejeitar runs interrompidos e medir intervalos úteis/inventário por grupo');
}
const e2eSteps = e2eJob?.steps || [];
const e2eCaptureSteps = e2eSteps.filter((step) => step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json');
const e2eMetricsSteps = e2eSteps.filter((step) => step.run === 'npm run ci:verify-shard-job-metrics -- --kind=e2e --timings=.ci-results/github-job-timings.json --work=.ci-results/e2e-shard-work.json');
const e2eMergeSteps = e2eSteps.filter((step) => String(step.run || '').includes('npx playwright merge-reports'));
if (e2eCaptureSteps.length !== 1 || e2eCaptureSteps[0]?.if !== undefined ||
    e2eCaptureSteps[0]?.['continue-on-error'] !== undefined || e2eCaptureSteps[0]?.shell !== undefined ||
    !same(e2eCaptureSteps[0]?.env, {
      GITHUB_TOKEN: '${{ github.token }}',
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    })) {
  problems.push('e2e: captura de tempos precisa ser incondicional, falhar fechado e vincular github.token/HEAD');
}
if (e2eMetricsSteps.length !== 1 || e2eMetricsSteps[0]?.if !== undefined ||
    e2eMetricsSteps[0]?.['continue-on-error'] !== undefined || e2eMetricsSteps[0]?.shell !== undefined ||
    !same(e2eMetricsSteps[0]?.env, {
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    }) || e2eMetricsSteps[0]?.['working-directory'] !== undefined ||
    e2eMergeSteps.length !== 1 ||
    e2eMergeSteps[0]?.if !== undefined || e2eMergeSteps[0]?.['continue-on-error'] !== undefined ||
    e2eMergeSteps[0]?.shell !== undefined || e2eMergeSteps[0]?.['working-directory'] !== undefined ||
    !same(e2eMergeSteps[0]?.env, {
      CI: true,
      CI_SHARD_WORK_FILE: '.ci-results/e2e-shard-work.json',
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    }) ||
    e2eSteps.indexOf(e2eCaptureSteps[0]) >= e2eSteps.indexOf(e2eMergeSteps[0]) ||
    e2eSteps.indexOf(e2eMergeSteps[0]) >= e2eSteps.indexOf(e2eMetricsSteps[0])) {
  problems.push('e2e: telemetria, merge de resultados e gate de métricas reais devem estar ordenados e bloqueantes');
}

if (/npm run test:[^\n]*\|\|\s*true/.test(executableRunText(workflow))) {
  problems.push('workflow mascara comando de testes com "|| true"');
}

const coverageShards = jobBlock('coverage-shard');
if (!coverageShards.includes('os: [ubuntu-latest, windows-latest]')) {
  problems.push('coverage-shard: cobertura integral deve executar em Linux e Windows');
}
const expectedCoverageShards = Array.from({ length: coverageShardPlan.shardCount }, (_, index) => index + 1);
const expectedCoverageMatrixText = 'shard: [' + expectedCoverageShards.join(', ') + ']';
if (!coverageShards.includes(expectedCoverageMatrixText)) {
  problems.push('coverage-shard: matriz deve corresponder exatamente ao plano de shards');
}
if (!coverageShards.includes('fail-fast: false')) {
  problems.push('coverage-shard: falha de um shard não pode cancelar a coleta dos demais');
}
if (!coverageShards.includes('timeout-minutes: 2')) {
  problems.push('coverage-shard: o job inteiro deve impor o limite absoluto de dois minutos');
}
if (!Number.isInteger(coverageShardPlan.shardCount) || coverageShardPlan.shardCount < 12 ||
    coverageShardPlan.maxEstimatedImbalanceRatio > 1.3 || coverageShardPlan.maxEstimatedShardMs > 120000) {
  problems.push('coverage-shard-plan: exige ao menos doze shards, spread até 30% e máximo abaixo de 120000ms');
}
if (!hasExecutableRun(coverageShards, 'npm run test:coverage:shard -- --shard=${{ matrix.shard }}')) {
  problems.push('coverage-shard: precisa executar cada shard de forma bloqueante');
}
if (!coverageShards.includes('actions/upload-artifact@v4') ||
    !coverageShards.includes('coverage-${{ matrix.os }}-${{ matrix.shard }}-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}') ||
    !coverageShards.includes('path: .ci-results/coverage-shards/') ||
    !coverageShards.includes('if-no-files-found: error')) {
  problems.push('coverage-shard: resultado único de cada shard/OS deve ser publicado obrigatoriamente');
}
if (/npm run test:coverage[^\n]*\|\|\s*true/.test(executableRunText(coverageShards))) {
  problems.push('coverage-shard: não pode mascarar falha com "|| true"');
}

const coverage = jobBlock('coverage');
if (!coverage.includes('needs: [coverage-shard]')) {
  problems.push('coverage: merge precisa depender de todos os shards');
}
if (!coverage.includes('os: [ubuntu-latest, windows-latest]')) {
  problems.push('coverage: merge e verificação integral devem ocorrer nos dois sistemas operacionais');
}
if (!coverage.includes('pattern: coverage-${{ matrix.os }}-*-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}') ||
    !coverage.includes('merge-multiple: true') || !coverage.includes('path: coverage-shards')) {
  problems.push('coverage: merge deve baixar todos e somente os artefatos do mesmo sistema operacional');
}
if (!hasExecutableRun(coverage, 'npm run test:coverage:merge -- --input=coverage-shards')) {
  problems.push('coverage: deve mesclar todos os relatórios antes de verificar thresholds');
}
if (!hasExecutableRun(coverage, 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json')) {
  problems.push('coverage: precisa coletar os tempos reais dos jobs via Actions API');
}
if (!hasExecutableRun(coverage, 'npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards')) {
  problems.push('coverage: precisa impor limites medidos de wall-clock, skew e eficiência útil/job');
}
if (!hasExecutableRun(coverage, 'npm run test:coverage:verify')) {
  problems.push('coverage: deve verificar integridade e thresholds depois do merge');
}
if (/npm run test:coverage[^\n]*\|\|\s*true/.test(executableRunText(coverage))) {
  problems.push('coverage: não pode mascarar falha de merge/verificação com "|| true"');
}
if (!coverage.includes('CODECOV_TOKEN not configured')) {
  problems.push('coverage: ausência de CODECOV_TOKEN precisa ser reportada explicitamente como SKIPPED');
}
if (!coverage.includes('fail_ci_if_error: true')) {
  problems.push('coverage: Codecov configurado deve reportar sua própria falha');
}

const coverageShardJob = workflowDocument?.jobs?.['coverage-shard'];
if (!same(coverageShardJob?.strategy?.matrix?.os, ['ubuntu-latest', 'windows-latest']) ||
    coverageShardJob?.['runs-on'] !== '${{ matrix.os }}') {
  problems.push('coverage-shard: matriz executável deve incluir exatamente Linux e Windows');
}
if (!same(coverageShardJob?.strategy?.matrix?.shard, expectedCoverageShards) ||
    coverageShardJob?.strategy?.['fail-fast'] !== false ||
    coverageShardJob?.strategy?.matrix?.include !== undefined || coverageShardJob?.strategy?.matrix?.exclude !== undefined) {
  problems.push('coverage-shard: matriz deve conter exatamente os shards do manifesto, sem exclusões e sem fail-fast');
}
if (!coverageShardJob || coverageShardJob['timeout-minutes'] !== 2 || coverageShardJob.if !== undefined || coverageShardJob.needs !== undefined ||
    coverageShardJob.defaults !== undefined || coverageShardJob.env !== undefined ||
    coverageShardJob['continue-on-error'] !== undefined) {
  problems.push('coverage-shard: execução obrigatória não pode ser condicional ou tolerar falha');
}
const shardSteps = coverageShardJob?.steps || [];
const shardExecutableSteps = shardSteps.filter((step) => step.run !== undefined);
if (!same(shardExecutableSteps.map((step) => step.run), [
  'npm ci',
  'npm run test:coverage:shard -- --shard=${{ matrix.shard }}',
])) {
  problems.push('coverage-shard: única sequência executável permitida é instalar e rodar o shard atribuído');
}
if (!same(shardSteps.filter((step) => step.uses).map((step) => step.uses), [
  'actions/checkout@v4', 'actions/setup-node@v4', 'actions/upload-artifact@v4',
])) {
  problems.push('coverage-shard: ações de checkout/setup/upload devem ser explícitas e sem substituições');
}
const shardRunSteps = shardSteps.filter((step) => step.run === 'npm run test:coverage:shard -- --shard=${{ matrix.shard }}');
if (shardRunSteps.length !== 1 || shardRunSteps[0].if !== undefined ||
    shardRunSteps[0]['continue-on-error'] !== undefined || shardRunSteps[0].shell !== undefined ||
    shardRunSteps[0]['timeout-minutes'] !== 2) {
  problems.push('coverage-shard: comando executável único deve rodar incondicionalmente e falhar fechado');
}
const shardUploadSteps = shardSteps.filter((step) => step.uses === 'actions/upload-artifact@v4');
if (shardUploadSteps.length !== 1 || shardUploadSteps[0]?.if !== undefined ||
    shardUploadSteps[0]?.['continue-on-error'] !== undefined ||
    shardUploadSteps[0]?.with?.name !== 'coverage-${{ matrix.os }}-${{ matrix.shard }}-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}' ||
    shardUploadSteps[0]?.with?.path !== '.ci-results/coverage-shards/' ||
    shardUploadSteps[0]?.with?.['if-no-files-found'] !== 'error') {
  problems.push('coverage-shard: cada artefato deve usar nome exclusivo por OS/shard/tentativa e preservar shard-N');
}

const coverageJob = workflowDocument?.jobs?.coverage;
if (!same(coverageJob?.needs, ['coverage-shard']) || coverageJob?.if !== undefined ||
    coverageJob?.['continue-on-error'] !== undefined ||
    coverageJob?.defaults !== undefined || coverageJob?.env !== undefined ||
    !same(coverageJob?.permissions, { actions: 'read', contents: 'read' }) ||
    !same(coverageJob?.strategy?.matrix?.os, ['ubuntu-latest', 'windows-latest']) ||
    coverageJob?.['runs-on'] !== '${{ matrix.os }}' || coverageJob?.strategy?.['fail-fast'] !== false ||
    coverageJob?.strategy?.matrix?.include !== undefined || coverageJob?.strategy?.matrix?.exclude !== undefined) {
  problems.push('coverage: agregador obrigatório deve aguardar shards e verificar ambos os sistemas sem exclusões');
}
const coverageSteps = coverageJob?.steps || [];
if (!same(coverageSteps.filter((step) => step.run !== undefined).map((step) => step.run), [
  'npm ci',
  'npm run test:coverage:sharding:infra',
  'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json',
  'npm run test:coverage:merge -- --input=coverage-shards',
  'npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
  'npm run test:coverage:verify',
  'if [ -n "$CODECOV_TOKEN" ]; then\n  echo "enabled=true" >> "$GITHUB_OUTPUT"\n  echo "Codecov upload: ENABLED"\nelse\n  echo "enabled=false" >> "$GITHUB_OUTPUT"\n  echo "::notice::Codecov upload: SKIPPED — CODECOV_TOKEN not configured"\nfi\n',
  'echo "::warning::Codecov upload FAILED — o gate local de coverage já passou, mas o dashboard externo não foi atualizado."',
])) {
  problems.push('coverage: sequência executável de setup, infra, merge, thresholds e Codecov deve permanecer explícita');
}
const coverageDownloadSteps = coverageSteps.filter((step) => step.uses === 'actions/download-artifact@v4');
if (coverageDownloadSteps.length !== 1 || coverageDownloadSteps[0]?.if !== undefined ||
    coverageDownloadSteps[0]?.['continue-on-error'] !== undefined ||
    coverageDownloadSteps[0]?.with?.path !== 'coverage-shards' ||
    coverageDownloadSteps[0]?.with?.pattern !== 'coverage-${{ matrix.os }}-*-${{ github.sha }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}' ||
    coverageDownloadSteps[0]?.with?.['merge-multiple'] !== true) {
  problems.push('coverage: download deve juntar somente artefatos únicos da mesma OS/tentativa preservando shard-N');
}
const mergeSteps = coverageSteps.filter((step) => step.run === 'npm run test:coverage:merge -- --input=coverage-shards');
const verifySteps = coverageSteps.filter((step) => step.run === 'npm run test:coverage:verify');
const shardInfraSteps = coverageSteps.filter((step) => step.run === 'npm run test:coverage:sharding:infra');
const captureTimingSteps = coverageSteps.filter((step) => step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json');
const metricsSteps = coverageSteps.filter((step) => step.run === 'npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards');
if (captureTimingSteps.length !== 1 || captureTimingSteps[0]?.if !== undefined ||
    captureTimingSteps[0]?.['continue-on-error'] !== undefined || captureTimingSteps[0]?.shell !== undefined ||
    !same(captureTimingSteps[0]?.env, {
      GITHUB_TOKEN: '${{ github.token }}',
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    })) {
  problems.push('coverage: captura de tempos precisa ser incondicional, falhar fechado e vincular github.token/HEAD');
}
if (metricsSteps.length !== 1 || metricsSteps[0]?.if !== undefined ||
    metricsSteps[0]?.['continue-on-error'] !== undefined || metricsSteps[0]?.shell !== undefined ||
    !same(metricsSteps[0]?.env, {
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    }) || metricsSteps[0]?.['working-directory'] !== undefined) {
  problems.push('coverage: gate de métricas medidos precisa ser incondicional e sem overrides');
}
if (shardInfraSteps.length !== 1 || shardInfraSteps[0]?.if !== undefined ||
    shardInfraSteps[0]?.['continue-on-error'] !== undefined ||
    mergeSteps.length !== 1 || mergeSteps[0]?.if !== undefined || mergeSteps[0]?.['continue-on-error'] !== undefined ||
    metricsSteps.length !== 1 || metricsSteps[0]?.if !== undefined || metricsSteps[0]?.['continue-on-error'] !== undefined ||
    verifySteps.length !== 1 || verifySteps[0]?.if !== undefined || verifySteps[0]?.['continue-on-error'] !== undefined ||
    coverageSteps.indexOf(shardInfraSteps[0]) >= coverageSteps.indexOf(mergeSteps[0]) ||
    coverageSteps.indexOf(captureTimingSteps[0]) >= coverageSteps.indexOf(mergeSteps[0]) ||
    coverageSteps.indexOf(mergeSteps[0]) >= coverageSteps.indexOf(metricsSteps[0]) ||
    coverageSteps.indexOf(metricsSteps[0]) >= coverageSteps.indexOf(verifySteps[0])) {
  problems.push('coverage: infra, métricas reais, merge e verifier completos devem ser incondicionais, ordenados e bloqueantes');
}
for (const command of [
  'npm ci',
  'npm run test:coverage:sharding:infra',
  'npm run test:coverage:merge -- --input=coverage-shards',
  'npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
  'npm run test:coverage:verify',
]) {
  const steps = coverageSteps.filter((step) => step.run === command);
  const expectedEnv = command.startsWith('npm run ci:verify-shard-job-metrics')
    ? { GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}' }
    : undefined;
  if (steps.length !== 1 || steps[0].shell !== undefined ||
      (expectedEnv === undefined ? steps[0].env !== undefined : !same(steps[0].env, expectedEnv)) ||
      steps[0]['working-directory'] !== undefined || steps[0].timeout !== undefined ||
      steps[0]['timeout-minutes'] !== undefined) {
    problems.push('coverage: passo crítico não pode herdar shell/env/diretório/timeout que altere ou masque o comando: ' + command);
  }
}

const structureCoverageJob = structureWorkflowDocument?.jobs?.coverage;
const structureCoverageSteps = structureCoverageJob?.steps || [];
const structureCaptureSteps = structureCoverageSteps.filter((step) =>
  step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json');
const structureMergeSteps = structureCoverageSteps.filter((step) =>
  step.run === 'npm run test:coverage:merge -- --input=coverage-shards');
const structureMetricsSteps = structureCoverageSteps.filter((step) =>
  step.run === 'npm run ci:verify-shard-job-metrics -- --kind=coverage --job-prefix="Structure coverage shard" --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards');
const structureVerifySteps = structureCoverageSteps.filter((step) =>
  step.run === 'npm run test:coverage:verify');
if (!same(structureCoverageJob?.needs, ['coverage-shard']) ||
    !same(structureCoverageJob?.permissions, { actions: 'read', contents: 'read' }) ||
    !same(structureCoverageJob?.strategy?.matrix?.os, ['ubuntu-latest', 'windows-latest']) ||
    structureCoverageJob?.if !== undefined || structureCoverageJob?.['continue-on-error'] !== undefined) {
  problems.push('pr66-structure-review coverage: agregador de estrutura deve aguardar shards Linux/Windows e usar permissões mínimas');
}
if (structureCaptureSteps.length !== 1 || structureCaptureSteps[0]?.if !== undefined ||
    structureCaptureSteps[0]?.['continue-on-error'] !== undefined ||
    !same(structureCaptureSteps[0]?.env, {
      GITHUB_TOKEN: '${{ github.token }}',
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    }) || structureMetricsSteps.length !== 1 || structureMetricsSteps[0]?.if !== undefined ||
    structureMetricsSteps[0]?.['continue-on-error'] !== undefined ||
    !same(structureMetricsSteps[0]?.env, {
      GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
    }) ||
    structureMergeSteps.length !== 1 || structureVerifySteps.length !== 1 ||
    structureCoverageSteps.indexOf(structureCaptureSteps[0]) >= structureCoverageSteps.indexOf(structureMergeSteps[0]) ||
    structureCoverageSteps.indexOf(structureMergeSteps[0]) >= structureCoverageSteps.indexOf(structureMetricsSteps[0]) ||
    structureCoverageSteps.indexOf(structureMetricsSteps[0]) >= structureCoverageSteps.indexOf(structureVerifySteps[0])) {
  problems.push('pr66-structure-review coverage: medição Actions API, merge, métrica real e threshold devem estar ordenados e bloqueantes');
}

function validateWorkflowShardProfile(profileName, workflowDocument, matrixJobId, gateJobId, gateCommand,
  expectedGateNeeds) {
  const profile = workflowShardMetrics?.profiles?.[profileName];
  const matrixJob = workflowDocument?.jobs?.[matrixJobId];
  const matrixIds = matrixJob?.strategy?.matrix?.shard
    ?.map((shard) => shard.id);
  if (!Array.isArray(matrixIds) || !same(profile?.ids, matrixIds) ||
      profile?.shardsPerOs !== matrixIds.length || matrixIds.length < 10 ||
      profile?.maxJobMs !== 120000 || profile?.maxSpreadRatio !== 1.3 ||
      !profile?.jobPrefix || !profile?.workStep || matrixJob?.['timeout-minutes'] !== 2 ||
      matrixJob?.strategy?.['fail-fast'] !== false ||
      !same(matrixJob?.strategy?.matrix?.os, ['ubuntu-latest', 'windows-latest']) ||
      matrixJob?.strategy?.matrix?.include !== undefined || matrixJob?.strategy?.matrix?.exclude !== undefined) {
    problems.push(profileName + ': manifest de métricas deve corresponder exatamente aos shards do workflow');
  }
  const workSteps = (matrixJob?.steps || []).filter((step) => step.name === profile?.workStep);
  if (workSteps.length !== 1 || workSteps[0]?.run !== '${{ matrix.shard.command }}' ||
      workSteps[0]?.if !== undefined || workSteps[0]?.['continue-on-error'] !== undefined) {
    problems.push(profileName + ': cada shard precisa executar uma única etapa útil incondicional');
  }
  const gateJob = workflowDocument?.jobs?.[gateJobId];
  const steps = gateJob?.steps || [];
  const captureSteps = steps.filter((step) =>
    step.run === 'npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json');
  const metricSteps = steps.filter((step) => step.run === gateCommand);
  const requireSteps = steps.filter((step) => step.name === 'Require every dependency to succeed');
  if (!same(gateJob?.permissions, { actions: 'read', contents: 'read' }) ||
      gateJob?.if !== '${{ always() && !cancelled() }}' || !same(gateJob?.needs, expectedGateNeeds) ||
      gateJob?.['continue-on-error'] !== undefined ||
      gateJob?.defaults !== undefined || gateJob?.env !== undefined ||
      gateJob?.container !== undefined || gateJob?.services !== undefined ||
      captureSteps.length !== 1 || metricSteps.length !== 1 || requireSteps.length !== 1 ||
      !same(captureSteps[0]?.env, {
        GITHUB_TOKEN: '${{ github.token }}',
        GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
      }) || captureSteps[0]?.if !== undefined || captureSteps[0]?.['continue-on-error'] !== undefined ||
      captureSteps[0]?.shell !== undefined || captureSteps[0]?.['working-directory'] !== undefined ||
      metricSteps[0]?.if !== undefined || metricSteps[0]?.['continue-on-error'] !== undefined ||
      metricSteps[0]?.shell !== undefined || !same(metricSteps[0]?.env, {
        GITHUB_HEAD_SHA: '${{ github.event.pull_request.head.sha || github.sha }}',
      }) ||
      metricSteps[0]?.['working-directory'] !== undefined ||
      requireSteps[0]?.run !== 'node scripts/ci/verify-required-job-results.js' ||
      requireSteps[0]?.if !== undefined || requireSteps[0]?.['continue-on-error'] !== undefined ||
      requireSteps[0]?.shell !== undefined || requireSteps[0]?.['working-directory'] !== undefined ||
      !same(requireSteps[0]?.env, { NEEDS_JSON: '${{ toJSON(needs) }}' }) ||
      steps.indexOf(captureSteps[0]) >= steps.indexOf(metricSteps[0]) ||
      steps.indexOf(metricSteps[0]) >= steps.indexOf(requireSteps[0])) {
    problems.push(profileName + ': gate precisa medir os shards e rejeitar falha/skip de todas as dependências');
  }
}

validateWorkflowShardProfile('protocol', protocolWorkflowDocument, 'protocol-infra', 'protocol-infra-gate',
  'npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=protocol --timings=.ci-results/github-job-timings.json',
  ['protocol-infra', 'protocol-post-gates']);
validateWorkflowShardProfile('structure', structureWorkflowDocument, 'governance', 'structure-review-gate',
  'npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=structure --timings=.ci-results/github-job-timings.json',
  ['governance', 'coverage-shard', 'coverage', 'mutation', 'performance', 'workflow-lint']);
for (const jobId of ['windows-portability', 'fresh-developer-flow']) {
  const job = workflowDocument?.jobs?.[jobId];
  if (!Array.isArray(job?.needs) || !job.needs.includes('coverage')) {
    problems.push(jobId + ': deve depender do coverage completo agregado em Linux e Windows');
  }
  if (executableRunText(jobBlock(jobId)).includes('npm run test:coverage')) {
    problems.push(jobId + ': não pode iniciar coverage serial em um único job');
  }
}

// O gate precisa sobreviver a falhas/skips de dependências para avaliá-las,
// mas não deve ressuscitar depois que o workflow inteiro foi cancelado.
const gate = jobBlock('ci-gate');
const ciGateJob = workflowDocument?.jobs?.['ci-gate'];
const ciGateSteps = ciGateJob?.steps || [];
const ciGateRunSteps = ciGateSteps.filter((step) => step.name === 'Exigir execução e sucesso de todos os gates');
const ciGateEnv = {
  NEEDS_JSON: '${{ toJSON(needs) }}',
  GATE_MODE: 'ci',
  FULL_DIAGNOSTICS_REQUIRED: "${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main') }}",
  BIBLE_FINAL_REQUIRED: "${{ (github.event_name == 'pull_request' && github.head_ref == 'docs/project-bible') || (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'workflow_dispatch' }}",
  FRESH_DEVELOPER_REQUIRED: "${{ github.event_name == 'workflow_dispatch' }}",
};
if (ciGateJob?.if !== '${{ always() && !cancelled() }}') {
  problems.push(
    'ci-gate: precisa usar if: always() && !cancelled() para avaliar falhas reais sem transformar workflow cancelado em falso vermelho'
  );
}
if (/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(gate)) {
  problems.push('ci-gate: if: always() puro é proibido porque pode gerar falso vermelho em run cancelado');
}
const expectedCiGateNeeds = requiredJobs.filter((job) => job !== 'ci-gate');
if (!same(ciGateJob?.needs, expectedCiGateNeeds) || ciGateJob?.['continue-on-error'] !== undefined ||
    ciGateJob?.defaults !== undefined || ciGateJob?.env !== undefined ||
    ciGateJob?.container !== undefined || ciGateJob?.services !== undefined ||
    ciGateSteps.length !== 1 || ciGateRunSteps.length !== 1 ||
    ciGateRunSteps[0]?.run !== 'node scripts/ci/verify-required-job-results.js' ||
    ciGateRunSteps[0]?.if !== undefined || ciGateRunSteps[0]?.['continue-on-error'] !== undefined ||
    ciGateRunSteps[0]?.shell !== undefined || ciGateRunSteps[0]?.['working-directory'] !== undefined ||
    !same(ciGateRunSteps[0]?.env, ciGateEnv)) {
  problems.push('ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas');
}
for (const marker of ['CI_REQUIRED_JOBS', 'result === \'success\'', 'FULL_DIAGNOSTICS_REQUIRED',
  'BIBLE_FINAL_REQUIRED', 'FRESH_DEVELOPER_REQUIRED', 'NEEDS_JSON ausente', 'Nenhuma dependência']) {
  if (!requiredJobResultsVerifier.includes(marker)) {
    problems.push('verify-required-job-results.js não protege invariável: ' + marker);
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
if (!playwright.includes('./scripts/ci/playwright-gate-reporter.js')) {
  problems.push('Playwright precisa carregar o reporter de gate em CI');
}
if (pkg.scripts['test:e2e:group'] !== 'node scripts/ci/run-e2e-group.js') {
  problems.push('package.json#test:e2e:group precisa usar o runner de grupos explícitos');
}
if (pkg.scripts['pretest:e2e'] !== 'npm run test:images') {
  problems.push('package.json#pretest:e2e precisa preparar fixtures pela fonte única');
}
if (pkg.scripts['pretest:e2e:group'] !== 'npm run test:images') {
  problems.push('package.json#pretest:e2e:group precisa preparar fixtures pela fonte única');
}
if (pkg.scripts['test:e2e:plan'] !== 'node scripts/validation/verify-e2e-shard-plan.js') {
  problems.push('package.json#test:e2e:plan precisa verificar o inventário dos shards');
}
if (!Array.isArray(e2ePlan.groups) || e2ePlan.groups.length !== 5) {
  problems.push('e2e-shard-plan.json precisa conter exatamente 5 grupos nesta fase');
} else {
  const expected = new Map([
    ['fifo', { tests: 1, workers: 1 }],
    ['attachment', { tests: 3, workers: 3 }],
    ['medium-a', { tests: 4, workers: 2 }],
    ['medium-b', { tests: 4, workers: 2 }],
    ['fast', { tests: 10, workers: 3 }],
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
if (pkg.scripts['test:ci'] !== 'node scripts/ci/run-jest-ci.js') {
  problems.push('package.json#test:ci precisa usar o runner auditável');
}
const jestRunner = fs.readFileSync(path.join(root, 'scripts', 'ci', 'run-jest-ci.js'), 'utf8');
if (!jestRunner.includes('hasForcedWorkerExit(jestStderr)')) {
  problems.push('run-jest-ci.js precisa reprovar o aviso de worker forçado');
}
if (!jestRunner.includes('[CI/Jest Partition]') || !jestRunner.includes('listProjectFiles(unitProjects)')) {
  problems.push('run-jest-ci.js precisa provar a partição exata entre test:unit e test:integration');
}
const expectedUnitScript = 'jest --config jest.config.js --selectProjects background gtc content-scripts popup reader manifest shared-ui';
if (pkg.scripts['test:unit'] !== expectedUnitScript) {
  problems.push('package.json#test:unit precisa selecionar exatamente os projetos unitários canônicos');
}
if (pkg.scripts['test:integration'] !== 'jest --config jest.config.js --selectProjects integration') {
  problems.push('package.json#test:integration precisa selecionar exclusivamente o projeto integration');
}
if (!hasExecutableRun(ciContract, 'node scripts/validation/verify-jest-worker-warning-selftest.js')) {
  problems.push('CI Contract precisa testar a detecção de worker forçado');
}

if (!hasExecutableRun(ciContract, 'npm run test:ci-contract:infra')) {
  problems.push('CI Contract precisa executar o self-test negativo do próprio contrato');
}
if (pkg.scripts['test:ci-contract:infra'] !== 'node scripts/validation/verify-ci-contract-selftest.js') {
  problems.push('package.json#test:ci-contract:infra precisa executar o self-test negativo do contrato');
}
if (pkg.scripts['test:ci-gate:infra'] !== 'node scripts/validation/verify-required-job-results-selftest.js' ||
    !hasExecutableRun(ciContract, 'npm run test:ci-gate:infra')) {
  problems.push('CI Contract precisa testar e executar o self-test dos resultados obrigatórios dos jobs');
}
if (jestRunner.includes("'--forceExit'") || jestRunner.includes('"--forceExit"')) {
  problems.push('run-jest-ci.js não pode mascarar open handles com --forceExit');
}
if (pkg.scripts['test:coverage'] !== 'node scripts/ci/run-jest-ci.js --coverage') {
  problems.push('package.json#test:coverage precisa usar o runner auditável com cobertura');
}
if (pkg.scripts['test:coverage:verify'] !== 'node scripts/validation/verify-coverage.js') {
  problems.push('package.json#test:coverage:verify precisa executar o verificador de integridade');
}
if (pkg.scripts['test:coverage:infra'] !== 'node scripts/validation/verify-coverage-selftest.js') {
  problems.push('package.json#test:coverage:infra precisa testar a própria infraestrutura');
}
if (pkg.scripts['test:coverage:sharding:infra'] !== 'node scripts/validation/verify-coverage-sharding-selftest.js') {
  problems.push('package.json#test:coverage:sharding:infra precisa validar o plano, os shards e o merge');
}
if (pkg.scripts['ci:capture-job-timings'] !== 'node scripts/ci/fetch-github-job-timings.js' ||
    pkg.scripts['ci:verify-shard-job-metrics'] !== 'node scripts/ci/verify-shard-job-metrics.js' ||
    pkg.scripts['test:shard-job-metrics:infra'] !== 'node scripts/validation/verify-shard-job-metrics-selftest.js') {
  problems.push('package.json precisa expor os coletores, gates e self-tests de métricas de shards');
}
if (!hasExecutableRun(ciContract, 'npm run test:shard-job-metrics:infra')) {
  problems.push('CI Contract precisa executar os self-tests de wall-clock/skew/eficiência por shard');
}
const shardMetricsSelfTestSteps = (workflowDocument?.jobs?.['ci-contract']?.steps || [])
  .filter((step) => step.run === 'npm run test:shard-job-metrics:infra');
if (shardMetricsSelfTestSteps.length !== 1 || shardMetricsSelfTestSteps[0]?.if !== undefined ||
    shardMetricsSelfTestSteps[0]?.['continue-on-error'] !== undefined ||
    shardMetricsSelfTestSteps[0]?.shell !== undefined || shardMetricsSelfTestSteps[0]?.env !== undefined) {
  problems.push('CI Contract precisa executar o self-test de wall-clock como passo bloqueante e incondicional');
}
for (const invariant of ['MAX_JOB_MS = 120000', 'MAX_SPREAD_RATIO = 1.3', 'workflowSha',
  'validateWorkflowShardMetrics', 'usefulWorkEfficiency', 'job obrigatório ausente',
  'trabalho útil ausente ou zero']) {
  if (!shardJobMetrics.includes(invariant)) {
    problems.push('verify-shard-job-metrics.js não protege invariável: ' + invariant);
  }
}
for (const invariant of ['GITHUB_TOKEN', 'GITHUB_HEAD_SHA', 'workflowSha', 'steps',
  'Distributed Bible Protocol Infra', 'Structure Governance', 'Structure coverage shard',
  'run_attempt', 'head_sha', 'started_at', 'completed_at']) {
  if (!jobTimingsFetcher.includes(invariant)) {
    problems.push('fetch-github-job-timings.js não protege identidade/tempos da Actions API: ' + invariant);
  }
}
if (!pkg.scripts.validate.includes('npm run test:shard-job-metrics:infra')) {
  problems.push('npm run validate precisa incluir self-test de wall-clock/skew/eficiência por shard');
}
if (!coverageConfig.includes("coverageProvider: 'v8'")) {
  problems.push('jest.config.js precisa usar coverageProvider v8');
}
if (!coverageConfig.includes("<rootDir>/extension/**/*.js")) {
  problems.push('coverage precisa incluir a arquitetura atual extension/**/*.js');
}
for (const reporter of ['lcov', 'json-summary', 'text-summary']) {
  if (!coverageConfig.includes("'" + reporter + "'")) {
    problems.push('jest.config.js precisa gerar reporter ' + reporter);
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
