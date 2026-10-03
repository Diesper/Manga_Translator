'use strict';

const fs = require('fs');
const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const baseline = require('./data/test-baseline.json');
const cardinalityBaseline = require('./data/coverage-cardinality-baseline.json');
const {
  caseKey,
  getRunIdentity,
  loadShardPlan,
  normalizeRelative,
  REPO_ROOT,
} = require('./coverage-shard-plan');
const { validateCoverageCardinality } = require('./coverage-cardinality');
const { summarizeShardReport } = require('./run-jest-coverage-shard');
const { mergeV8CoverageMaps } = require('./coverage-v8-merge');

const DEFAULT_INPUT = path.join(REPO_ROOT, '.ci-results', 'coverage-shards');
const COVERAGE_DIR = path.join(REPO_ROOT, 'coverage');

function parseInput(args) {
  const inline = args.find((arg) => arg.startsWith('--input='));
  if (inline) return inline.slice('--input='.length);
  const index = args.indexOf('--input');
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return DEFAULT_INPUT;
}

function readJson(file, label) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(label + ' ausente ou vazio: ' + file);
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(label + ' inválido: ' + error.message); }
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function validateShardDirectoryInventory(foundDirs, shardCount) {
  const problems = [];
  const expectedDirs = new Set(Array.from({ length: shardCount }, (_, index) => 'shard-' + (index + 1)));
  for (const expected of expectedDirs) {
    if (!foundDirs.includes(expected)) problems.push('diretório de shard ausente: ' + expected);
  }
  for (const found of foundDirs) {
    if (!expectedDirs.has(found)) problems.push('diretório de shard inesperado: ' + found);
  }
  return problems;
}

function validateCaseUnion(expectedCaseCounts, executedCaseCounts) {
  const problems = [];
  if (executedCaseCounts.size !== expectedCaseCounts.size) {
    problems.push('união dos casos executados possui ' + executedCaseCounts.size +
      ' nomes; esperado ' + expectedCaseCounts.size + '.');
  }
  for (const [key, expectedCount] of expectedCaseCounts) {
    const actualCount = executedCaseCounts.get(key) || 0;
    if (actualCount !== expectedCount) {
      problems.push('caso ausente ou duplicado na união: ' + key.replace('\u0000', ' :: ') +
        ' (esperado ' + expectedCount + ', executado ' + actualCount + ').');
    }
  }
  for (const key of executedCaseCounts.keys()) {
    if (!expectedCaseCounts.has(key)) problems.push('caso inesperado na união: ' + key.replace('\u0000', ' :: '));
  }
  return problems;
}

function validateMetadata(metadata, shard, identity, data) {
  const problems = [];
  if (metadata.schemaVersion !== 1) problems.push('schema de metadata inválido.');
  if (metadata.shardIndex !== shard.index || metadata.shardCount !== data.shardCount) {
    problems.push('identidade do shard ' + shard.index + ' diverge do plano.');
  }
  if (metadata.status !== 'passed') problems.push('shard ' + shard.index + ' não foi aprovado.');
  if (metadata.nodeVersion !== identity.nodeVersion || metadata.v8Version !== identity.v8Version) {
    problems.push('shard ' + shard.index + ' foi executado em outra versão de Node/V8.');
  }
  if (metadata.platform !== identity.platform || metadata.arch !== identity.arch) {
    problems.push('shard ' + shard.index + ' veio de outra plataforma/arquitetura.');
  }
  for (const field of ['runnerOs', 'githubRunId', 'githubRunAttempt', 'githubSha', 'gitHead']) {
    if (metadata[field] !== identity[field]) {
      problems.push('shard ' + shard.index + ' tem identidade divergente em ' + field + '.');
    }
  }
  if (metadata.planSchemaVersion !== identity.planSchemaVersion || metadata.planSha256 !== identity.planSha256) {
    problems.push('shard ' + shard.index + ' usou outro plano de cobertura.');
  }
  if (!sameArray(metadata.testFiles, shard.files)) problems.push('inventário de arquivos no metadata do shard ' + shard.index + ' diverge.');
  if (metadata.expectedCaseCount !== shard.expectedCaseCount ||
      metadata.executedCases !== shard.expectedCaseCount ||
      metadata.passedCases !== shard.expectedCaseCount || metadata.selectedPendingCases !== 0) {
    problems.push('contagens de casos no metadata do shard ' + shard.index + ' divergem do plano.');
  }
  const expectedCases = shard.cases.map(({ file, fullName, occurrences }) => ({ file, fullName, occurrences }));
  if (JSON.stringify(metadata.selectedCases) !== JSON.stringify(expectedCases)) {
    problems.push('casos atribuídos no metadata do shard ' + shard.index + ' divergem do plano.');
  }
  return problems;
}

function validateRuntimeMetadata(metadata, testReport, observedWork, shardIndex = metadata.shardIndex) {
  const problems = [];
  const runtimeMs = Number(metadata.jestRuntimeMs);
  if (!Number.isFinite(runtimeMs) || runtimeMs <= 0 || runtimeMs > 120000) {
    problems.push('runtime do shard ' + shardIndex + ' inválido ou acima de 120000ms.');
  }
  const resultEndTimes = (testReport.testResults || []).map((item) => Number(item.endTime))
    .filter((value) => Number.isFinite(value) && value > 0);
  const resultStartTimes = (testReport.testResults || []).map((item) => Number(item.startTime))
    .filter((value) => Number.isFinite(value) && value > 0);
  const reportStartTime = Number(testReport.startTime) ||
    (resultStartTimes.length ? Math.min(...resultStartTimes) : NaN);
  const reportRuntimeMs = (resultEndTimes.length ? Math.max(...resultEndTimes) : NaN) - reportStartTime;
  if (!Number.isFinite(reportRuntimeMs) || reportRuntimeMs <= 0 || reportRuntimeMs > 120000) {
    problems.push('runtime observado no JSON do shard ' + shardIndex + ' inválido ou acima de 120000ms.');
  }
  if (Number.isFinite(runtimeMs) && Number.isFinite(reportRuntimeMs) &&
      Math.abs(runtimeMs - reportRuntimeMs) > 5000) {
    problems.push('runtime do metadata não confere com o relatório Jest do shard ' + shardIndex + '.');
  }
  const metadataUsefulWorkMs = Number(metadata.usefulWorkMs);
  if (!Number.isFinite(metadataUsefulWorkMs) || metadataUsefulWorkMs < 0 ||
      metadataUsefulWorkMs > runtimeMs || metadataUsefulWorkMs !== observedWork.usefulWorkMs) {
    problems.push('trabalho útil do metadata não confere com as durações observadas no Jest do shard ' + shardIndex + '.');
  }
  const metadataAssertionWorkMs = Number(metadata.caseAssertionWorkMs);
  if (!Number.isFinite(metadataAssertionWorkMs) || metadataAssertionWorkMs < 0 ||
      metadataAssertionWorkMs !== observedWork.caseAssertionWorkMs) {
    problems.push('duração de assertions no metadata não confere com o JSON do Jest do shard ' + shardIndex + '.');
  }
  return problems;
}

function collectAndValidateShards(inputDir, { data, plan, identity }) {
  const problems = [];
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error('Diretório de shards ausente: ' + inputDir);
  }
  const foundDirs = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^shard-\d+$/.test(entry.name))
    .map((entry) => entry.name);
  problems.push(...validateShardDirectoryInventory(foundDirs, plan.shardCount));

  const shards = [];
  const coverageFileSets = [];
  const executedCaseCounts = new Map();
  const executedFileNames = new Set();
  let passedCases = 0;
  let usefulWorkMs = 0;
  let caseAssertionWorkMs = 0;
  let skippedCases = 0;
  let todoCases = 0;

  for (let index = 1; index <= plan.shardCount; index += 1) {
    const shard = plan.shards[index - 1];
    const dir = path.join(inputDir, 'shard-' + index);
    try {
      const metadata = readJson(path.join(dir, 'shard-result.json'), 'metadata do shard');
      problems.push(...validateMetadata(metadata, shard, identity, data));
      const testReport = readJson(path.join(dir, 'jest-results.json'), 'resultados Jest do shard');
      const coverageFile = path.join(dir, 'coverage-final.json');
      const coverageJson = readJson(coverageFile, 'mapa V8 do shard');
      if (metadata.v8CoverageFile !== 'v8-coverage.json') {
        problems.push('identificador do perfil V8 no metadata do shard ' + index + ' diverge.');
      }
      const v8Coverage = readJson(path.join(dir, 'v8-coverage.json'), 'perfis V8 brutos do shard');
      if (v8Coverage.nodeVersion !== metadata.nodeVersion || v8Coverage.v8Version !== metadata.v8Version ||
          !Array.isArray(v8Coverage.testProfiles)) {
        problems.push('identidade Node/V8 dos perfis brutos diverge no shard ' + index + '.');
      }
      if (metadata.v8CoverageBytes !== fs.statSync(path.join(dir, 'v8-coverage.json')).size) {
        problems.push('tamanho dos perfis V8 brutos diverge no metadata do shard ' + index + '.');
      }
      const coverageFiles = sortedUnique(Object.keys(coverageJson));
      if (coverageFiles.length === 0) problems.push('mapa de cobertura vazio no shard ' + index + '.');
      if (!sameArray(metadata.coverageFiles, coverageFiles) || metadata.coverageFileCount !== coverageFiles.length) {
        problems.push('arquivos do mapa de cobertura no metadata do shard ' + index + ' divergem.');
      }
      coverageFileSets.push(coverageFiles);

      const summary = summarizeShardReport({ report: testReport, shard, plan, data });
      problems.push(...summary.problems.map((problem) => 'shard ' + index + ': ' + problem));
      problems.push(...validateRuntimeMetadata(metadata, testReport, summary, index));
      usefulWorkMs += summary.usefulWorkMs;
      caseAssertionWorkMs += summary.caseAssertionWorkMs;
      if (summary.executedCases !== shard.expectedCaseCount || summary.passedCases !== shard.expectedCaseCount ||
          summary.selectedPendingCases !== 0) {
        problems.push('contagem real de casos do shard ' + index + ' diverge da atribuição.');
      }
      passedCases += summary.passedCases;
      skippedCases += summary.selectedPendingCases;
      for (const testFile of shard.files) executedFileNames.add(testFile);
      for (const testResult of testReport.testResults || []) {
        const testFile = normalizeRelative(path.relative(REPO_ROOT, testResult.name));
        for (const assertion of testResult.assertionResults || []) {
          const fullName = assertion.fullName || [
            ...(assertion.ancestorTitles || []), assertion.title,
          ].join(' ');
          const key = caseKey(testFile, fullName);
          const isSelected = (shard.cases.some((item) => item.file === testFile && item.fullName === fullName));
          if (!isSelected) continue;
          if (assertion.status === 'todo') todoCases += 1;
          if (assertion.status === 'pending' || assertion.status === 'todo') continue;
          executedCaseCounts.set(key, (executedCaseCounts.get(key) || 0) + 1);
        }
      }
      shards.push({ index, dir, metadata, testReport, coverageJson, v8Coverage, coverageFiles });
    } catch (error) {
      problems.push('shard ' + index + ': ' + error.message);
    }
  }

  const expectedCaseCounts = new Map();
  for (const file of data.files) {
    for (const testCase of file.cases) {
      expectedCaseCounts.set(caseKey(file.file, testCase.fullName), testCase.occurrences);
    }
  }
  problems.push(...validateCaseUnion(expectedCaseCounts, executedCaseCounts));
  if (executedFileNames.size !== data.baseline.suites) {
    problems.push('suítes cobertas=' + executedFileNames.size + '; baseline=' + data.baseline.suites + '.');
  }
  if (passedCases !== data.baseline.tests) {
    problems.push('testes aprovados=' + passedCases + '; baseline=' + data.baseline.tests + '.');
  }
  if (skippedCases !== data.baseline.maxSkipped) {
    problems.push('skipped global=' + skippedCases + '; limite=' + data.baseline.maxSkipped + '.');
  }
  if (todoCases !== data.baseline.maxTodo) {
    problems.push('todo global=' + todoCases + '; limite=' + data.baseline.maxTodo + '.');
  }
  const validRuntimes = shards.map((shard) => Number(shard.metadata.jestRuntimeMs))
    .filter((runtime) => Number.isFinite(runtime) && runtime > 0 && runtime <= 120000);
  if (validRuntimes.length === plan.shardCount) {
    const minRuntimeMs = Math.min(...validRuntimes);
    const maxRuntimeMs = Math.max(...validRuntimes);
    const spreadRatio = maxRuntimeMs / minRuntimeMs;
    if (spreadRatio > data.maxEstimatedImbalanceRatio) {
      problems.push('spread real dos shards=' + spreadRatio.toFixed(3) +
        '; limite=' + data.maxEstimatedImbalanceRatio.toFixed(3) + '.');
    }
  }

  if (coverageFileSets.length) {
    const canonicalSet = coverageFileSets[0];
    for (let index = 1; index < coverageFileSets.length; index += 1) {
      if (!sameArray(coverageFileSets[index], canonicalSet)) {
        problems.push('shard ' + (index + 1) + ' tem inventário instrumentado V8 diferente.');
      }
    }
    const minInstrumentedFiles = Number(baseline.coverage?.minInstrumentedFiles || 0);
    if (canonicalSet.length < minInstrumentedFiles) {
      problems.push('mapa contém ' + canonicalSet.length + ' arquivos; mínimo protegido=' + minInstrumentedFiles + '.');
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    shards,
    coverageFiles: coverageFileSets[0] || [],
    passedCases,
    usefulWorkMs,
    caseAssertionWorkMs,
    executedFileNames,
  };
}

function mergeCoverageMaps(shardMaps) {
  const merged = createCoverageMap({});
  for (const coverageJson of shardMaps) merged.merge(coverageJson);
  return merged;
}

function generateCoverageReports(coverageMap, coverageDir = COVERAGE_DIR) {
  fs.rmSync(coverageDir, { recursive: true, force: true });
  fs.mkdirSync(coverageDir, { recursive: true });
  const context = createContext({
    dir: coverageDir,
    coverageMap,
    defaultSummarizer: 'pkg',
  });
  for (const reporter of ['json', 'json-summary', 'lcov', 'text', 'text-summary', 'html']) {
    reports.create(reporter).execute(context);
  }
  for (const file of ['coverage-final.json', 'coverage-summary.json', 'lcov.info']) {
    const output = path.join(coverageDir, file);
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error('Relatório agregado ausente ou vazio: ' + output);
    }
  }
}

async function mergeCoverageShards({ inputDir = DEFAULT_INPUT, repoRoot = REPO_ROOT, planPath, outputDir } = {}) {
  const { data, plan } = loadShardPlan({ repoRoot, ...(planPath ? { planPath } : {}) });
  const identity = {
    ...getRunIdentity({ repoRoot, ...(planPath ? { planPath } : {}) }),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
  };
  const collected = collectAndValidateShards(path.resolve(inputDir), { data, plan, identity });
  if (!collected.ok) throw new Error('Merge da cobertura recusado:\n- ' + collected.problems.join('\n- '));

  const coverageMap = await mergeV8CoverageMaps(
    collected.shards.map((shard) => shard.v8Coverage),
    collected.coverageFiles,
    collected.shards.map((shard) => shard.coverageJson)
  );
  const mergedFiles = sortedUnique(coverageMap.files());
  if (!sameArray(mergedFiles, collected.coverageFiles)) {
    throw new Error('Merge alterou o inventário de arquivos instrumentados.');
  }
  const cardinality = validateCoverageCardinality(coverageMap.toJSON(), cardinalityBaseline, { repoRoot });
  if (!cardinality.ok) {
    throw new Error('Cardinalidade da cobertura agregada abaixo do baseline serial:\n- ' +
      cardinality.problems.join('\n- '));
  }
  const reportDirectory = outputDir || path.join(repoRoot, 'coverage');
  generateCoverageReports(coverageMap, reportDirectory);

  const runtimes = collected.shards.map((shard) => Number(shard.metadata.jestRuntimeMs));
  const result = {
    schemaVersion: 1,
    ...identity,
    shardCount: plan.shardCount,
    suites: data.baseline.suites,
    tests: collected.passedCases,
    skipped: 0,
    todo: 0,
    instrumentedFiles: mergedFiles.length,
    usefulWorkMs: collected.usefulWorkMs,
    caseAssertionWorkMs: collected.caseAssertionWorkMs,
    shardRuntimeMs: {
      min: Math.min(...runtimes),
      max: Math.max(...runtimes),
      spreadRatio: Math.max(...runtimes) / Math.min(...runtimes),
    },
    usefulWorkEfficiencyVsJestRuntime: collected.usefulWorkMs /
      runtimes.reduce((sum, runtime) => sum + runtime, 0),
    reports: [
      path.relative(repoRoot, path.join(reportDirectory, 'coverage-final.json')).replace(/\\/g, '/'),
      path.relative(repoRoot, path.join(reportDirectory, 'coverage-summary.json')).replace(/\\/g, '/'),
      path.relative(repoRoot, path.join(reportDirectory, 'lcov.info')).replace(/\\/g, '/'),
    ],
  };
  const resultPath = path.join(repoRoot, '.ci-results', 'coverage-merge-result.json');
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log('[Coverage merge] shards=' + plan.shardCount + ', suites=' + result.suites +
    ', tests=' + result.tests + ', skipped=' + result.skipped + ', todo=' + result.todo +
    ', instrumented=' + result.instrumentedFiles + ', fileWork=' +
    Math.round(result.usefulWorkMs) + 'ms, assertionWork=' +
    Math.round(result.caseAssertionWorkMs) + 'ms, within-Jest proxy=' +
    result.usefulWorkEfficiencyVsJestRuntime.toFixed(3) + ', observed shard spread=' +
    result.shardRuntimeMs.spreadRatio.toFixed(3));
  return result;
}

if (require.main === module) {
  try {
    const inputDir = path.resolve(REPO_ROOT, parseInput(process.argv.slice(2)));
    const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--output='));
    const outputDir = outputArg ? path.resolve(REPO_ROOT, outputArg.slice('--output='.length)) : undefined;
    mergeCoverageShards({ inputDir, outputDir }).catch((error) => {
      console.error('Falha ao combinar shards de cobertura: ' + error.message);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('Falha ao combinar shards de cobertura: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  collectAndValidateShards,
  mergeV8CoverageMaps,
  generateCoverageReports,
  mergeCoverageMaps,
  mergeCoverageShards,
  parseInput,
  validateCaseUnion,
  validateMetadata,
  validateRuntimeMetadata,
  validateShardDirectoryInventory,
};
