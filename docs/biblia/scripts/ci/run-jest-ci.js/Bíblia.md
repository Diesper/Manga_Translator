# Bíblia técnica — `scripts/ci/run-jest-ci.js`

> **Schema da Bíblia:** 2
> **Índice:** 75
> **Fonte:** `scripts/ci/run-jest-ci.js`
> **SHA da revisão pendente:** `24aee55099115c73d560a6635fedffbc03f0291e`
> **Posições da fonte:** 229
> **Status:** COMPLETED
> **Revisão:** READY_FOR_AUDIT — requer auditoria independente.

## Mudança e invariantes

Referências operacionais atualizadas junto à mudança de diretórios; contratos de execução preservados.

## Evidência e limites

A sincronização abaixo é mecânica. Não concede APPROVED nem reaproveita auditoria de outro SHA. A análise documental anterior está preservada em `.coordination/structure-review-history/075-4a60324d3f2b8ad0ff55751705415956e9ae49f5.md`. A cobertura de linhas deve receber revisão semântica independente.

## Fonte integral exata

~~~js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const baseline = require('./data/test-baseline.json');
const { hasForcedWorkerExit } = require('./jest-worker-warning');

const repoRoot = path.resolve(__dirname, '../..');
const testsRoot = path.join(repoRoot, 'tests');
const resultDir = path.join(repoRoot, '.ci-results');
const resultFile = path.join(resultDir, 'jest-results.json');
const coverageRequested = process.argv.includes('--coverage');
const jestConfig = path.join(repoRoot, 'jest.config.js');
const unitProjects = ['background', 'gtc', 'content-scripts', 'popup', 'reader', 'manifest', 'shared-ui'];
const integrationProjects = ['integration'];
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

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

const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');

function listProjectFiles(projects) {
  const proc = spawnSync(process.execPath, [
    jestBin,
    '--config', jestConfig,
    '--listTests',
    '--json',
    '--selectProjects',
    ...projects,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  });

  if (proc.error) {
    throw new Error('Falha ao listar projetos Jest ' + projects.join(', ') + ': ' + proc.error.message);
  }
  if (proc.status !== 0) {
    throw new Error(
      'Jest --listTests falhou para ' + projects.join(', ') +
      ' com código ' + String(proc.status) + ':\n' + String(proc.stderr || '')
    );
  }

  let files;
  try {
    files = JSON.parse(String(proc.stdout || '[]'));
  } catch (error) {
    throw new Error(
      'Saída inválida de Jest --listTests para ' + projects.join(', ') +
      ': ' + error.message + '\n' + String(proc.stdout || '')
    );
  }
  return files.map(normalize).sort();
}
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
  args.push('--runInBand');
}

const run = spawnSync(process.execPath, args, {
  cwd: repoRoot,
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

if (!coverageRequested) {
  try {
    const unitFiles = listProjectFiles(unitProjects);
    const integrationFiles = listProjectFiles(integrationProjects);
    const unitSet = new Set(unitFiles);
    const integrationSet = new Set(integrationFiles);
    const overlap = unitFiles.filter((file) => integrationSet.has(file));
    const union = [...new Set([...unitFiles, ...integrationFiles])].sort();
    const missingFromPartition = expectedFiles.filter((file) => !union.includes(file));
    const unexpectedInPartition = union.filter((file) => !expectedFiles.includes(file));

    if (overlap.length) {
      problems.push(
        'Partição Jest possui arquivo(s) em unit e integration ao mesmo tempo:\n' +
        overlap.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
      );
    }
    if (missingFromPartition.length || unexpectedInPartition.length) {
      problems.push(
        'Partição Jest unit + integration não corresponde ao inventário total.' +
        (missingFromPartition.length
          ? '\nAusentes:\n' + missingFromPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
          : '') +
        (unexpectedInPartition.length
          ? '\nInesperados:\n' + unexpectedInPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
          : '')
      );
    }
    if (unitFiles.some((file) => !file.includes('/tests/unit/'))) {
      problems.push('test:unit descobre arquivo fora de tests/unit/.');
    }
    if (integrationFiles.some((file) => !file.includes('/tests/integration/'))) {
      problems.push('test:integration descobre arquivo fora de tests/integration/.');
    }

    const expectedUnitCommand =
      'jest --config jest.config.js --selectProjects ' + unitProjects.join(' ');
    const expectedIntegrationCommand =
      'jest --config jest.config.js --selectProjects integration';
    if (pkg.scripts['test:unit'] !== expectedUnitCommand) {
      problems.push('package.json#test:unit não corresponde aos projetos unitários canônicos.');
    }
    if (pkg.scripts['test:integration'] !== expectedIntegrationCommand) {
      problems.push('package.json#test:integration não aponta exclusivamente para integration.');
    }

    console.log(
      '[CI/Jest Partition] unitFiles=' + String(unitFiles.length) +
      ', integrationFiles=' + String(integrationFiles.length) +
      ', union=' + String(union.length) +
      ', expected=' + String(expectedFiles.length)
    );
  } catch (error) {
    problems.push('Falha ao provar partição unit/integration: ' + error.message);
  }
}
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
~~~

## Cobertura documental de linhas

- 1–229: snapshot integral da revisão acima; revisão semântica independente pendente.
