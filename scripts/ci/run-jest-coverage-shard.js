'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { hasForcedWorkerExit } = require('./jest-worker-warning');
const {
  caseKey,
  getRunIdentity,
  loadShardPlan,
  normalizeRelative,
  REPO_ROOT,
} = require('./coverage-shard-plan');

const OUTPUT_ROOT = path.join(REPO_ROOT, '.ci-results', 'coverage-shards');
const HARD_MAX_SHARD_RUNTIME_MS = 120000;

function configuredMaxRuntime() {
  const raw = process.env.COVERAGE_SHARD_MAX_RUNTIME_MS;
  if (raw == null || raw === '') return HARD_MAX_SHARD_RUNTIME_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > HARD_MAX_SHARD_RUNTIME_MS) {
    throw new Error('COVERAGE_SHARD_MAX_RUNTIME_MS deve ser inteiro positivo e não pode exceder 120000.');
  }
  return value;
}

function parseShardIndex(args) {
  const found = args.find((arg) => arg.startsWith('--shard='));
  const separateIndex = args.indexOf('--shard');
  const raw = found ? found.slice('--shard='.length) :
    separateIndex >= 0 ? args[separateIndex + 1] : null;
  if (!raw || !/^\d+$/.test(raw)) throw new Error('Uso: npm run test:coverage:shard -- --shard=N');
  return Number(raw);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeShardReport({ report, shard, plan, data }) {
  const problems = [];
  const expectedFileSet = new Set(shard.files);
  const actualReports = new Map();
  for (const testResult of report.testResults || []) {
    const testFile = normalizeRelative(path.relative(REPO_ROOT, testResult.name));
    if (!expectedFileSet.has(testFile)) {
      problems.push('Jest executou arquivo não atribuído ao shard: ' + testFile);
    }
    if (actualReports.has(testFile)) problems.push('Jest duplicou relatório de arquivo: ' + testFile);
    actualReports.set(testFile, testResult);
  }
  for (const testFile of shard.files) {
    if (!actualReports.has(testFile)) problems.push('Jest não reportou arquivo esperado: ' + testFile);
  }

  const globalCaseInventory = new Map();
  for (const file of data.files) {
    for (const testCase of file.cases) {
      globalCaseInventory.set(caseKey(file.file, testCase.fullName), testCase.occurrences);
    }
  }
  const selectedCaseInventory = new Map(shard.cases.map((testCase) => [
    caseKey(testCase.file, testCase.fullName), testCase.occurrences,
  ]));
  let executedCases = 0;
  let passedCases = 0;
  let usefulWorkMs = 0;
  let caseAssertionWorkMs = 0;
  let selectedPendingCases = 0;
  const selectedResults = [];

  for (const [testFile, testResult] of actualReports) {
    const fileStartTime = testResult.startTime;
    const fileEndTime = testResult.endTime;
    if (!Number.isFinite(fileStartTime) || !Number.isFinite(fileEndTime) ||
        fileStartTime < 0 || fileEndTime <= fileStartTime) {
      problems.push('Intervalo de execução ausente, inválido ou invertido para ' + testFile + '.');
    } else {
      usefulWorkMs += fileEndTime - fileStartTime;
    }
    const allTests = testResult.assertionResults || [];
    const actualNames = new Map();
    const activeNames = new Map();
    for (const assertion of allTests) {
      const fullName = assertion.fullName || [
        ...(assertion.ancestorTitles || []), assertion.title,
      ].join(' ');
      const key = caseKey(testFile, fullName);
      actualNames.set(key, (actualNames.get(key) || 0) + 1);

      const isPending = assertion.status === 'pending' || assertion.status === 'todo';
      const expectedInShard = selectedCaseInventory.get(key) || 0;
      if (expectedInShard > 0 && isPending) {
        selectedPendingCases += 1;
        problems.push('Caso atribuído ao shard foi ignorado/skipped: ' + testFile + ' :: ' + fullName);
      } else if (expectedInShard === 0 && !isPending) {
        problems.push('Caso executado fora da atribuição do shard: ' + testFile + ' :: ' + fullName);
      }
      if (!isPending) {
        activeNames.set(key, (activeNames.get(key) || 0) + 1);
        executedCases += 1;
        if (assertion.status === 'passed') {
          passedCases += 1;
          caseAssertionWorkMs += Math.max(0, Number(assertion.duration) || 0);
        }
        else problems.push('Caso falhou ou teve status inesperado: ' + assertion.status + ' ' +
          testFile + ' :: ' + fullName);
      }
      if (expectedInShard > 0) {
        selectedResults.push({ file: testFile, fullName, status: assertion.status });
      }
    }

    for (const [key, expectedOccurrences] of globalCaseInventory) {
      if (!key.startsWith(testFile + '\u0000')) continue;
      const actualOccurrences = actualNames.get(key) || 0;
      if (actualOccurrences !== expectedOccurrences) {
        const fullName = key.slice(testFile.length + 1);
        problems.push('Inventário de casos mudou para ' + testFile + ' :: ' + fullName +
          ' (esperado ' + expectedOccurrences + ', encontrado ' + actualOccurrences + ').');
      }
    }
    for (const [key, actualOccurrences] of actualNames) {
      if (!globalCaseInventory.has(key)) {
        problems.push('Caso novo sem timing/atribuição no plano: ' + testFile + ' :: ' + key.slice(testFile.length + 1));
      } else if (actualOccurrences !== globalCaseInventory.get(key)) {
        problems.push('Multiplicidade de caso diverge do plano: ' + testFile + ' :: ' + key.slice(testFile.length + 1));
      }
    }
    for (const [key, expectedOccurrences] of selectedCaseInventory) {
      if (!key.startsWith(testFile + '\u0000')) continue;
      const actualSelected = activeNames.get(key) || 0;
      if (actualSelected !== expectedOccurrences) {
        const fullName = key.slice(testFile.length + 1);
        problems.push('Seleção parcial/duplicada para ' + testFile + ' :: ' + fullName +
          ' (esperado ' + expectedOccurrences + ', executado ' + actualSelected + ').');
      }
    }
  }

  if (!Number.isFinite(usefulWorkMs) || usefulWorkMs <= 0) {
    problems.push('Soma do trabalho útil dos arquivos deve ser finita e maior que zero.');
  }

  if ((report.numFailedTests || 0) > 0 || (report.numFailedTestSuites || 0) > 0 || report.success === false) {
    problems.push('Relatório JSON do Jest contém falhas.');
  }

  return {
    problems,
    executedCases,
    passedCases,
    usefulWorkMs,
    caseAssertionWorkMs,
    selectedPendingCases,
    selectedResults,
    coverageFileCount: null,
  };
}

function runCoverageShard(shardIndex, { repoRoot = REPO_ROOT, outputRoot = OUTPUT_ROOT } = {}) {
  const { data, plan } = loadShardPlan({ repoRoot });
  const maxRuntimeMs = configuredMaxRuntime();
  const identity = getRunIdentity({ repoRoot });
  if (!Number.isInteger(shardIndex) || shardIndex < 1 || shardIndex > plan.shardCount) {
    throw new Error('Shard deve estar entre 1 e ' + plan.shardCount + '.');
  }
  const shard = plan.shards[shardIndex - 1];
  const shardDir = path.join(outputRoot, 'shard-' + shardIndex);
  fs.rmSync(shardDir, { recursive: true, force: true });
  fs.mkdirSync(shardDir, { recursive: true });

  const coverageFile = path.join(shardDir, 'coverage-final.json');
  const v8CoverageFile = path.join(shardDir, 'v8-coverage.json');
  const resultsFile = path.join(shardDir, 'jest-results.json');
  const metadataFile = path.join(shardDir, 'shard-result.json');
  const testFiles = shard.files.map((file) => path.join(repoRoot, ...file.split('/')));
  const fullNames = [...new Set(shard.cases.map((testCase) => testCase.fullName))].sort();
  const testNamePattern = '^(?:' + fullNames.map(escapeRegex).join('|') + ')$';
  const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');
  const args = [
    jestBin,
    '--config', path.join(repoRoot, 'jest.config.js'),
    '--ci',
    '--json',
    '--outputFile', resultsFile,
    '--coverage',
    '--coverageProvider', 'v8',
    '--coverageDirectory', shardDir,
    '--coverageReporters', 'json',
    '--reporters', 'default', path.join(repoRoot, 'scripts', 'ci', 'capture-jest-v8-coverage.js'),
    '--runInBand',
    '--runTestsByPath',
    ...testFiles,
    '--testNamePattern', testNamePattern,
  ];
  const startedAt = Date.now();
  const run = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: maxRuntimeMs,
    killSignal: 'SIGTERM',
    env: {
      ...process.env,
      COVERAGE_MODE: '1',
      COVERAGE_V8_PROFILE_OUTPUT: v8CoverageFile,
    },
  });
  const elapsedMs = Date.now() - startedAt;
  const jestStderr = run.stderr || '';
  if (jestStderr) process.stderr.write(jestStderr);

  const problems = [];
  if (run.error) problems.push('Falha ao iniciar Jest: ' + run.error.message);
  if (run.status !== 0) problems.push('Jest terminou com código ' + String(run.status) + '.');
  if (hasForcedWorkerExit(jestStderr)) problems.push('Um worker Jest precisou ser encerrado à força.');
  if (run.error && run.error.code === 'ETIMEDOUT') {
    problems.push('Jest foi interrompido pelo timeout de ' + maxRuntimeMs + 'ms.');
  } else if (elapsedMs > maxRuntimeMs) {
    problems.push('Shard levou ' + elapsedMs + 'ms no Jest; teto absoluto: ' + maxRuntimeMs + 'ms.');
  }

  let report = null;
  if (!fs.existsSync(resultsFile)) {
    problems.push('Jest não produziu jest-results.json.');
  } else {
    try { report = JSON.parse(fs.readFileSync(resultsFile, 'utf8')); }
    catch (error) { problems.push('jest-results.json inválido: ' + error.message); }
  }
  if (!fs.existsSync(coverageFile)) problems.push('Jest não produziu coverage-final.json.');
  if (!fs.existsSync(v8CoverageFile)) problems.push('Jest não produziu v8-coverage.json.');

  let execution = {
    executedCases: 0,
    passedCases: 0,
    usefulWorkMs: 0,
    caseAssertionWorkMs: 0,
    selectedPendingCases: 0,
    selectedResults: [],
    coverageFileCount: null,
  };
  if (report) {
    const summarized = summarizeShardReport({ report, shard, plan, data });
    problems.push(...summarized.problems);
    execution = summarized;
  }
  if (execution.executedCases !== shard.expectedCaseCount) {
    problems.push('Casos executados (' + execution.executedCases + ') divergem dos atribuídos (' +
      shard.expectedCaseCount + ').');
  }

  let coverageFiles = [];
  if (fs.existsSync(coverageFile)) {
    try {
      const coverageMap = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
      coverageFiles = Object.keys(coverageMap).sort();
      if (coverageFiles.length === 0) problems.push('coverage-final.json está vazio.');
      execution.coverageFileCount = coverageFiles.length;
    } catch (error) {
      problems.push('coverage-final.json inválido: ' + error.message);
    }
  }
  let v8Coverage = null;
  if (fs.existsSync(v8CoverageFile)) {
    try {
      v8Coverage = JSON.parse(fs.readFileSync(v8CoverageFile, 'utf8'));
      if (v8Coverage.schemaVersion !== 1 || v8Coverage.nodeVersion !== process.version ||
          v8Coverage.v8Version !== process.versions.v8 || !Array.isArray(v8Coverage.testProfiles)) {
        problems.push('v8-coverage.json possui identidade/schema inválido.');
      }
    } catch (error) {
      problems.push('v8-coverage.json inválido: ' + error.message);
    }
  }

  const metadata = {
    schemaVersion: 1,
    shardIndex,
    shardCount: plan.shardCount,
    ...identity,
    status: problems.length ? 'failed' : 'passed',
    estimatedMs: Math.round(shard.estimatedMs),
    jestRuntimeMs: elapsedMs,
    expectedCaseCount: shard.expectedCaseCount,
    executedCases: execution.executedCases,
    passedCases: execution.passedCases,
    usefulWorkMs: execution.usefulWorkMs,
    caseAssertionWorkMs: execution.caseAssertionWorkMs,
    selectedPendingCases: execution.selectedPendingCases,
    testFiles: shard.files,
    selectedCases: shard.cases.map(({ file, fullName, occurrences }) => ({ file, fullName, occurrences })),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    coverageFiles,
    coverageFileCount: coverageFiles.length,
    v8CoverageFile: 'v8-coverage.json',
    v8CoverageBytes: v8Coverage ? fs.statSync(v8CoverageFile).size : 0,
    errorMessages: problems,
  };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');

  console.log('[Coverage shard ' + shardIndex + '/' + plan.shardCount + '] cases=' +
    execution.executedCases + '/' + shard.expectedCaseCount + ', files=' + shard.files.length +
    ', fileWork=' + Math.round(execution.usefulWorkMs) + 'ms, assertionWork=' +
    Math.round(execution.caseAssertionWorkMs) + 'ms, estimated=' +
    Math.round(shard.estimatedMs) + 'ms, Jest=' + elapsedMs + 'ms, spread=' +
    plan.estimated.imbalanceRatio.toFixed(3));
  if (problems.length) {
    console.error('\nGate do shard de cobertura falhou:');
    problems.forEach((problem) => console.error('- ' + problem));
  }
  return { ok: problems.length === 0, metadata, problems };
}

if (require.main === module) {
  try {
    const shardIndex = parseShardIndex(process.argv.slice(2));
    const result = runCoverageShard(shardIndex);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error('Falha no shard de cobertura: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  HARD_MAX_SHARD_RUNTIME_MS,
  escapeRegex,
  parseShardIndex,
  runCoverageShard,
  summarizeShardReport,
};
