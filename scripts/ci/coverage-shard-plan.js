'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLAN_PATH = path.join(__dirname, 'data', 'coverage-shard-plan.json');

function normalizeRelative(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function walkTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTestFiles(full);
    return entry.isFile() && entry.name.endsWith('.test.js') ? [full] : [];
  });
}

function discoverTestFiles(repoRoot = REPO_ROOT) {
  const testsRoot = path.join(repoRoot, 'tests');
  return [
    ...walkTestFiles(path.join(testsRoot, 'unit')),
    ...walkTestFiles(path.join(testsRoot, 'integration')),
  ].map((file) => normalizeRelative(path.relative(repoRoot, file))).sort();
}

function caseKey(testFile, fullName) {
  return normalizeRelative(testFile) + '\u0000' + String(fullName);
}

function validateTimingData(data, { repoRoot = REPO_ROOT, checkInventory = true } = {}) {
  const problems = [];
  if (!data || data.schemaVersion !== 1) problems.push('schemaVersion deve ser 1.');
  if (!Number.isInteger(data?.shardCount) || data.shardCount < 12) {
    problems.push('shardCount deve ser um inteiro igual ou maior que 12 para cobertura integral.');
  }
  if (!Number.isFinite(data?.maxEstimatedImbalanceRatio) || data.maxEstimatedImbalanceRatio < 1) {
    problems.push('maxEstimatedImbalanceRatio inválido.');
  }
  if (!Number.isFinite(data?.maxEstimatedShardMs) || data.maxEstimatedShardMs <= 0) {
    problems.push('maxEstimatedShardMs inválido.');
  }
  if (data?.runtimePolicy?.hardMaxShardMs !== 120000 ||
      data?.runtimePolicy?.jestProcessTimeoutMs !== 120000 ||
      data?.runtimePolicy?.githubJobTimeoutMinutes !== 2 ||
      data?.runtimePolicy?.maxObservedRuntimeSpreadRatio !== data?.maxEstimatedImbalanceRatio) {
    problems.push('política de runtime deve impor o teto de 120s e spread alinhado ao plano.');
  }
  if (!Number.isInteger(data?.baseline?.suites) || !Number.isInteger(data?.baseline?.tests) ||
      !Number.isInteger(data?.baseline?.maxSkipped) || !Number.isInteger(data?.baseline?.maxTodo)) {
    problems.push('baseline global de suítes/testes/skipped/todo inválido.');
  }
  if (!Array.isArray(data?.files) || data.files.length === 0) {
    problems.push('manifesto não contém arquivos de teste.');
  }
  for (const field of ['splitFiles', 'atomicFiles']) {
    if (!Array.isArray(data?.[field])) problems.push(field + ' deve ser uma lista explícita.');
    const normalized = (data?.[field] || []).map(normalizeRelative);
    if (new Set(normalized).size !== normalized.length) problems.push(field + ' contém duplicatas.');
    data[field] = normalized;
  }
  const splitFileSet = new Set(data?.splitFiles || []);
  const atomicFileSet = new Set(data?.atomicFiles || []);
  for (const file of splitFileSet) {
    if (atomicFileSet.has(file)) problems.push('arquivo não pode ser split e atômico: ' + file);
  }

  const fileNames = [];
  const testFileNames = new Set();
  const occurrences = new Map();
  const fullNameOwners = new Map();
  let occurrenceCount = 0;
  for (const file of data?.files || []) {
    const normalizedFile = normalizeRelative(file.file);
    if (!normalizedFile.startsWith('tests/unit/') && !normalizedFile.startsWith('tests/integration/')) {
      problems.push('arquivo fora de tests/unit ou tests/integration: ' + normalizedFile);
    }
    if (!normalizedFile.endsWith('.test.js')) problems.push('arquivo de teste inválido: ' + normalizedFile);
    if (testFileNames.has(normalizedFile)) problems.push('arquivo duplicado no manifesto: ' + normalizedFile);
    testFileNames.add(normalizedFile);
    fileNames.push(normalizedFile);
    if (!Number.isFinite(file.setupMs) || file.setupMs < 0) {
      problems.push('setupMs inválido em ' + normalizedFile);
    }
    if (!Array.isArray(file.cases) || file.cases.length === 0) {
      problems.push('arquivo sem casos Jest no manifesto: ' + normalizedFile);
      continue;
    }
    const names = new Set();
    for (const testCase of file.cases) {
      if (typeof testCase.fullName !== 'string' || testCase.fullName.length === 0) {
        problems.push('fullName ausente em ' + normalizedFile);
        continue;
      }
      if (names.has(testCase.fullName)) problems.push('fullName duplicado sem agrupamento em ' + normalizedFile);
      names.add(testCase.fullName);
      const owner = fullNameOwners.get(testCase.fullName);
      if (owner && owner !== normalizedFile) {
        problems.push('fullName colide entre arquivos e não pode ser roteado com segurança por Jest: ' +
          JSON.stringify(testCase.fullName) + ' (' + owner + ' e ' + normalizedFile + ').');
      } else {
        fullNameOwners.set(testCase.fullName, normalizedFile);
      }
      if (!Number.isFinite(testCase.durationMs) || testCase.durationMs < 0) {
        problems.push('durationMs inválido para ' + normalizedFile + ' :: ' + testCase.fullName);
      }
      if (!Number.isInteger(testCase.occurrences) || testCase.occurrences < 1) {
        problems.push('multiplicidade inválida para ' + normalizedFile + ' :: ' + testCase.fullName);
      } else {
        occurrenceCount += testCase.occurrences;
        occurrences.set(caseKey(normalizedFile, testCase.fullName), testCase.occurrences);
      }
    }
  }

  if (fileNames.some((file, index) => index > 0 && fileNames[index - 1] >= file)) {
    problems.push('arquivos do manifesto devem estar ordenados e ser únicos.');
  }
  for (const file of [...splitFileSet, ...atomicFileSet]) {
    if (!testFileNames.has(file)) problems.push('splitFiles/atomicFiles referencia arquivo fora do manifesto: ' + file);
  }
  if (data?.baseline) {
    if (data.baseline.suites !== testFileNames.size) {
      problems.push('baseline de suítes (' + data.baseline.suites + ') não corresponde aos arquivos do manifesto (' +
        testFileNames.size + ').');
    }
    if (data.baseline.tests !== occurrenceCount) {
      problems.push('baseline de testes (' + data.baseline.tests + ') não corresponde aos casos do manifesto (' +
        occurrenceCount + ').');
    }
    if (data.baseline.maxSkipped !== 0 || data.baseline.maxTodo !== 0) {
      problems.push('este gate exige exatamente zero skipped e zero todo.');
    }
  }

  if (checkInventory) {
    const discovered = discoverTestFiles(repoRoot);
    const expected = [...testFileNames].sort();
    const missing = discovered.filter((file) => !testFileNames.has(file));
    const stale = expected.filter((file) => !discovered.includes(file));
    if (missing.length || stale.length) {
      problems.push('inventário Jest difere do manifesto.' +
        (missing.length ? '\nNovos arquivos sem timing: ' + missing.join(', ') : '') +
        (stale.length ? '\nArquivos removidos ainda no manifesto: ' + stale.join(', ') : ''));
    }
  }

  return { ok: problems.length === 0, problems, testFileNames, occurrences, occurrenceCount };
}

function buildShardPlan(data, options = {}) {
  const validation = validateTimingData(data, options);
  if (!validation.ok) throw new Error('Plano de cobertura inválido:\n- ' + validation.problems.join('\n- '));

  const fileData = new Map(data.files.map((file) => [normalizeRelative(file.file), file]));
  const schedulingUnits = [];
  for (const file of data.files) {
    const normalizedFile = normalizeRelative(file.file);
    const totalCaseMs = file.cases.reduce((sum, testCase) => sum + testCase.durationMs, 0);
    const makeCase = (testCase) => ({
      file: normalizedFile,
      fullName: testCase.fullName,
      durationMs: testCase.durationMs,
      occurrences: testCase.occurrences,
      setupMs: file.setupMs,
    });
    if ((data.splitFiles || []).includes(normalizedFile)) {
      for (const testCase of file.cases) {
        const item = makeCase(testCase);
        const setupShareMs = totalCaseMs > 0
          ? file.setupMs * testCase.durationMs / totalCaseMs
          : file.setupMs / file.cases.length;
        schedulingUnits.push({
          file: normalizedFile,
          cases: [item],
          durationMs: item.durationMs,
          setupMs: file.setupMs,
          priorityMs: item.durationMs + setupShareMs,
        });
      }
    } else {
      const unitCases = file.cases.map(makeCase);
      schedulingUnits.push({
        file: normalizedFile,
        cases: unitCases,
        durationMs: totalCaseMs,
        setupMs: file.setupMs,
        priorityMs: totalCaseMs + file.setupMs,
      });
    }
  }

  schedulingUnits.sort((a, b) => b.priorityMs - a.priorityMs ||
    a.file.localeCompare(b.file) ||
    String(a.cases[0]?.fullName || '').localeCompare(String(b.cases[0]?.fullName || '')));
  const shards = Array.from({ length: data.shardCount }, (_, index) => ({
    index: index + 1,
    estimatedMs: 0,
    files: new Set(),
    cases: [],
    expectedCaseCount: 0,
  }));

  for (const unit of schedulingUnits) {
    let selected = null;
    let selectedProjectedMs = Infinity;
    for (const shard of shards) {
      const extraSetup = shard.files.has(unit.file) ? 0 : fileData.get(unit.file).setupMs;
      const projectedMs = shard.estimatedMs + unit.durationMs + extraSetup;
      if (projectedMs < selectedProjectedMs) {
        selected = shard;
        selectedProjectedMs = projectedMs;
      }
    }
    selected.estimatedMs = selectedProjectedMs;
    selected.files.add(unit.file);
    selected.cases.push(...unit.cases);
    selected.expectedCaseCount += unit.cases.reduce((sum, testCase) => sum + testCase.occurrences, 0);
  }

  for (const shard of shards) {
    shard.files = [...shard.files].sort();
    shard.cases.sort((a, b) => a.file.localeCompare(b.file) || a.fullName.localeCompare(b.fullName));
  }
  for (const file of data.atomicFiles || []) {
    const ownerShards = shards.filter((shard) => shard.files.includes(file));
    const expectedCaseCount = fileData.get(file).cases.reduce((sum, testCase) => sum + testCase.occurrences, 0);
    if (ownerShards.length !== 1 || ownerShards[0].cases.filter((testCase) => testCase.file === file)
      .reduce((sum, testCase) => sum + testCase.occurrences, 0) !== expectedCaseCount) {
      throw new Error('Arquivo atomicamente agrupado foi dividido entre shards: ' + file);
    }
  }
  const estimatedTimes = shards.map((shard) => shard.estimatedMs);
  const minEstimatedMs = Math.min(...estimatedTimes);
  const maxEstimatedMs = Math.max(...estimatedTimes);
  const imbalanceRatio = minEstimatedMs > 0 ? maxEstimatedMs / minEstimatedMs : Infinity;
  const issues = [];
  if (imbalanceRatio > data.maxEstimatedImbalanceRatio) {
    issues.push('spread estimado ' + imbalanceRatio.toFixed(3) + ' excede o máximo ' +
      data.maxEstimatedImbalanceRatio.toFixed(3) + '.');
  }
  if (maxEstimatedMs > data.maxEstimatedShardMs) {
    issues.push('shard estimado em ' + Math.round(maxEstimatedMs) + 'ms excede ' +
      Math.round(data.maxEstimatedShardMs) + 'ms.');
  }
  if (issues.length) throw new Error('Balanceamento de cobertura inválido:\n- ' + issues.join('\n- '));

  return {
    schemaVersion: 1,
    shardCount: shards.length,
    estimated: {
      minMs: minEstimatedMs,
      maxMs: maxEstimatedMs,
      imbalanceRatio,
      maxAllowedImbalanceRatio: data.maxEstimatedImbalanceRatio,
      maxAllowedShardMs: data.maxEstimatedShardMs,
    },
    shards,
    expectedCaseCount: validation.occurrenceCount,
    expectedSuiteCount: data.baseline.suites,
    expectedTestFileCount: validation.testFileNames.size,
    expectedTestCaseCount: validation.occurrenceCount,
  };
}

function loadShardPlan(options = {}) {
  const data = JSON.parse(fs.readFileSync(options.planPath || PLAN_PATH, 'utf8'));
  return { data, plan: buildShardPlan(data, options) };
}

function getRunIdentity({ repoRoot = REPO_ROOT, planPath = PLAN_PATH } = {}) {
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return {
    platform: process.platform,
    arch: process.arch,
    runnerOs: process.env.RUNNER_OS || null,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    githubSha: process.env.GITHUB_SHA || null,
    gitHead,
    planSchemaVersion: 1,
    planSha256: crypto.createHash('sha256').update(fs.readFileSync(planPath)).digest('hex'),
  };
}

module.exports = {
  PLAN_PATH,
  REPO_ROOT,
  buildShardPlan,
  caseKey,
  discoverTestFiles,
  getRunIdentity,
  loadShardPlan,
  normalizeRelative,
  validateTimingData,
};
