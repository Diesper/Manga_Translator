'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const baseline = require('./test-baseline.json');
const { hasForcedWorkerExit } = require('./jest-worker-warning');

const testsRoot = path.resolve(__dirname, '..');
const resultDir = path.join(testsRoot, '.ci-results');
const resultFile = path.join(resultDir, 'jest-results.json');
const coverageRequested = process.argv.includes('--coverage');
const jestConfig = coverageRequested ? 'jest.coverage.config.js' : 'jest.config.js';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function normalize(file) {
  return path.resolve(file).replace(/\\/g, '/');
}

fs.mkdirSync(resultDir, { recursive: true });
try { fs.rmSync(resultFile, { force: true }); } catch (_error) {}

const expectedFiles = [
  ...walk(path.join(testsRoot, 'unit')),
  ...walk(path.join(testsRoot, 'integration')),
]
  .filter((file) => file.endsWith('.test.js'))
  .map(normalize)
  .sort();

if (expectedFiles.length === 0) {
  console.error('CI/Jest: nenhum arquivo .test.js encontrado em unit/ ou integration/.');
  process.exit(1);
}

const jestBin = path.join(testsRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const args = [
  jestBin,
  '--config', jestConfig,
  '--ci',
  '--json',
  '--outputFile', resultFile,
];
if (coverageRequested) {
  args.push('--coverage');
  // V8 coverage aumenta significativamente CPU/memória por worker. Limitar a
  // concorrência torna o gate determinístico sem aumentar timeouts funcionais.
  args.push('--maxWorkers=2');
}

const run = spawnSync(process.execPath, args, {
  cwd: testsRoot,
  // Jest escreve o aviso no stderr mesmo quando retorna status 0.
  stdio: ['inherit', 'inherit', 'pipe'],
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: {
    ...process.env,
    ...(coverageRequested ? { COVERAGE_MODE: '1' } : {}),
  },
});
const jestStderr = run.stderr || '';
if (jestStderr) process.stderr.write(jestStderr);

const problems = [];
if (hasForcedWorkerExit(jestStderr)) {
  problems.push('Um worker Jest precisou ser encerrado à força; corrigir os recursos pendentes.');
}
if (!fs.existsSync(resultFile)) {
  problems.push('Jest não produziu o arquivo JSON de resultados.');
} else {
  const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  const actualFiles = new Set((report.testResults || []).map((item) => normalize(item.name)));
  const missingFiles = expectedFiles.filter((file) => !actualFiles.has(file));

  if (missingFiles.length) {
    problems.push(
      'Arquivos .test.js existentes que o Jest não descobriu:\n' +
      missingFiles.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
    );
  }

  if ((report.numTotalTestSuites || 0) < baseline.jest.minSuites) {
    problems.push('Jest executou apenas ' + (report.numTotalTestSuites || 0) +
      ' suítes; mínimo protegido: ' + baseline.jest.minSuites + '.');
  }
  if ((report.numTotalTests || 0) < baseline.jest.minTests) {
    problems.push('Jest executou apenas ' + (report.numTotalTests || 0) +
      ' testes; mínimo protegido: ' + baseline.jest.minTests + '.');
  }
  if ((report.numPendingTests || 0) > baseline.jest.maxSkipped) {
    problems.push('Jest possui ' + report.numPendingTests +
      ' teste(s) skipped; máximo permitido: ' + baseline.jest.maxSkipped + '.');
  }
  if ((report.numTodoTests || 0) > baseline.jest.maxTodo) {
    problems.push('Jest possui ' + report.numTodoTests +
      ' teste(s) TODO; máximo permitido: ' + baseline.jest.maxTodo + '.');
  }
  if ((report.numFailedTests || 0) > 0 ||
      (report.numFailedTestSuites || 0) > 0 ||
      report.success === false) {
    problems.push('O relatório JSON do Jest contém falhas.');
  }

  console.log('[CI/Jest] suites=' + (report.numTotalTestSuites || 0) +
    ', testes=' + (report.numTotalTests || 0) +
    ', skipped=' + (report.numPendingTests || 0) +
    ', todo=' + (report.numTodoTests || 0) +
    ', arquivos=' + actualFiles.size + '/' + expectedFiles.length);
}

if (run.error) problems.push('Falha ao iniciar Jest: ' + run.error.message);
if (run.status !== 0) problems.push('Jest terminou com código ' + String(run.status) + '.');

if (problems.length) {
  console.error('\nGate de inventário do Jest falhou:');
  for (const problem of problems) console.error('- ' + problem);
  // stderr pode ser um pipe assíncrono no GitHub Actions. process.exit()
  // descartaria o fim do relatório, inclusive o aviso que motivou a falha.
  process.exitCode = 1;
} else {
  console.log('Gate de inventário do Jest aprovado usando ' + jestConfig + '.');
}
