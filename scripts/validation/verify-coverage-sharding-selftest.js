'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { fileURLToPath } = require('url');
const strictAssert = require('assert').strict;
const {
  caseKey,
  loadShardPlan,
  validateTimingData,
} = require('../ci/coverage-shard-plan');
const { summarizeShardReport } = require('../ci/run-jest-coverage-shard');
const cardinalityBaseline = require('../ci/data/coverage-cardinality-baseline.json');
const { validateCoverageCardinality } = require('../ci/coverage-cardinality');
const { convertMergedV8Profiles } = require('../ci/coverage-v8-merge');
const {
  collectAndValidateShards,
  mergeCoverageMaps,
  validateCaseUnion,
  validateMetadata,
  validateRuntimeMetadata,
  validateShardDirectoryInventory,
} = require('../ci/merge-jest-coverage-shards');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function point(line, column = 0) {
  return { line, column };
}

function fixtureFileCoverage(file, { statements, functions, branches }) {
  const statementMap = {};
  const s = {};
  for (let index = 0; index < statements.length; index += 1) {
    const line = index + 1;
    statementMap[index] = { start: point(line), end: point(line, 1) };
    s[index] = statements[index];
  }
  const fnMap = {};
  const f = {};
  for (let index = 0; index < functions.length; index += 1) {
    const line = index + 1;
    fnMap[index] = {
      name: 'fn' + index,
      decl: { start: point(line), end: point(line, 1) },
      loc: { start: point(line), end: point(line, 1) },
      line,
    };
    f[index] = functions[index];
  }
  const branchMap = {};
  const b = {};
  for (let index = 0; index < branches.length; index += 1) {
    const line = index + 1;
    branchMap[index] = {
      type: 'if',
      line,
      loc: { start: point(line), end: point(line, 1) },
      locations: [
        { start: point(line), end: point(line, 1) },
        { start: point(line), end: point(line, 2) },
      ],
    };
    b[index] = branches[index];
  }
  return {
    path: file,
    all: false,
    statementMap,
    s,
    fnMap,
    f,
    branchMap,
    b,
  };
}

function testBalancedPlan() {
  const { data, plan } = loadShardPlan();
  assert(plan.shardCount >= 12, 'a cobertura integral deve ter pelo menos 12 shards.');
  assert(plan.expectedSuiteCount === data.baseline.suites, 'baseline de suítes não foi preservado.');
  assert(plan.expectedTestCaseCount === data.baseline.tests, 'baseline de testes não foi preservado.');
  assert(plan.estimated.maxMs <= 90000, 'estimativa de shard supera 90s.');
  assert(plan.estimated.imbalanceRatio <= 1.3, 'balanceamento previsto supera 30%.');

  const expected = new Map();
  for (const file of data.files) {
    for (const testCase of file.cases) expected.set(caseKey(file.file, testCase.fullName), testCase.occurrences);
  }
  const actual = new Map();
  for (const shard of plan.shards) {
    for (const testCase of shard.cases) {
      const key = caseKey(testCase.file, testCase.fullName);
      actual.set(key, (actual.get(key) || 0) + testCase.occurrences);
    }
  }
  assert(validateCaseUnion(expected, actual).length === 0, 'planner duplicou ou perdeu casos Jest.');

  for (const file of data.atomicFiles) {
    const owners = plan.shards.filter((shard) => shard.files.includes(file));
    const total = owners.reduce((sum, shard) => sum + shard.cases
      .filter((testCase) => testCase.file === file)
      .reduce((count, testCase) => count + testCase.occurrences, 0), 0);
    const expectedTotal = data.files.find((entry) => entry.file === file).cases
      .reduce((sum, testCase) => sum + testCase.occurrences, 0);
    assert(owners.length === 1 && total === expectedTotal,
      'arquivo atômico foi dividido ou perdeu casos: ' + file);
  }

  for (const file of data.files) {
    const shardOwners = plan.shards.filter((shard) => shard.files.includes(file.file));
    if (!data.splitFiles.includes(file.file)) {
      assert(shardOwners.length === 1, 'arquivo que deveria ser atômico foi dividido: ' + file.file);
    } else {
      assert(shardOwners.length > 1, 'suíte pesada deixou de ser dividida: ' + file.file);
    }
  }
  console.log('✓ plano cobre os 109 arquivos/877 casos em 15 shards balanceados e sem colisões.');
  console.log('✓ arquivo sensível de popup fica inteiro em um shard; suítes longas divididas por caso.');
}

function testPlanRejectsStaleOrUnsafeInventory() {
  const { data } = loadShardPlan();
  const stale = JSON.parse(JSON.stringify(data));
  stale.files[0].cases.push({ fullName: 'novo caso não medido', durationMs: 1, occurrences: 1 });
  assert(!validateTimingData(stale, { checkInventory: false }).ok,
    'plano deveria rejeitar caso sem atualização do inventário/timing.');

  const belowShardFloor = JSON.parse(JSON.stringify(data));
  belowShardFloor.shardCount = 11;
  const belowShardFloorResult = validateTimingData(belowShardFloor, { checkInventory: false });
  assert(!belowShardFloorResult.ok && belowShardFloorResult.problems
    .some((problem) => problem.includes('igual ou maior que 12')),
  'runner deveria rejeitar plano de cobertura com menos de 12 shards.');

  const unsafe = JSON.parse(JSON.stringify(data));
  unsafe.maxEstimatedImbalanceRatio = 1.001;
  unsafe.runtimePolicy.maxObservedRuntimeSpreadRatio = 1.001;
  assert(!validateTimingData(unsafe, { checkInventory: false }).ok || (() => {
    try { require('../ci/coverage-shard-plan').buildShardPlan(unsafe, { checkInventory: false }); return false; }
    catch (_error) { return true; }
  })(), 'planner deveria rejeitar balanceamento fora do limite.');
  console.log('✓ plano stale e plano desbalanceado são recusados.');
}

function testShardReportRequiresValidFileIntervals() {
  const testFile = 'tests/unit/coverage-fixture.test.js';
  const fullName = 'fixture passes';
  const shard = {
    index: 1,
    files: [testFile],
    cases: [{ file: testFile, fullName, occurrences: 1 }],
  };
  const plan = { shardCount: 12 };
  const data = {
    files: [{ file: testFile, cases: [{ fullName, occurrences: 1 }] }],
  };
  const testResult = (timing = {}) => ({
    name: path.join(require('../ci/coverage-shard-plan').REPO_ROOT, ...testFile.split('/')),
    ...timing,
    assertionResults: [{ fullName, status: 'passed', duration: 5 }],
  });
  const summarize = (result) => summarizeShardReport({
    report: {
      success: true,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      testResults: [result],
    },
    shard,
    plan,
    data,
  });

  const valid = summarize(testResult({ startTime: 100, endTime: 125 }));
  assert(valid.problems.length === 0 && valid.usefulWorkMs === 25,
    'intervalo válido deveria ser somado ao trabalho útil.');

  const invalidIntervals = [
    { endTime: 125 },
    { startTime: 100 },
    { startTime: NaN, endTime: 125 },
    { startTime: 100, endTime: Infinity },
    { startTime: 126, endTime: 125 },
    { startTime: 125, endTime: 125 },
  ];
  for (const interval of invalidIntervals) {
    const result = summarize(testResult(interval));
    assert(result.problems.some((problem) => problem.includes('Intervalo de execução')),
      'intervalo ausente, não finito, invertido ou nulo deveria ser rejeitado: ' +
        JSON.stringify(interval));
    assert(result.problems.some((problem) => problem.includes('Soma do trabalho útil')),
      'soma total de trabalho útil zero deveria ser rejeitada.');
  }
  console.log('✓ intervalos por arquivo ausentes, inválidos, invertidos ou zero são recusados.');
}

function testIstanbulMapMergeSemantics() {
  const file = path.join(os.tmpdir(), 'coverage-merge-fixture.js');
  const first = fixtureFileCoverage(file, { statements: [1, 0], functions: [1], branches: [[0, 1]] });
  const second = fixtureFileCoverage(file, { statements: [0, 1], functions: [0], branches: [[1, 0]] });
  const merged = mergeCoverageMaps([{ [file]: first }, { [file]: second }]);
  const result = merged.fileCoverageFor(file).toJSON();
  assert(result.s['0'] === 1 && result.s['1'] === 1, 'merge não somou contadores de statements.');
  assert(result.f['0'] === 1, 'merge não somou contadores de functions.');
  assert(JSON.stringify(result.b['0']) === '[1,1]', 'merge não somou counters de branches.');

  const emptyReport = { ...fixtureFileCoverage(file, { statements: [0], functions: [0], branches: [[0, 0]] }), all: true };
  const actualReport = fixtureFileCoverage(file, { statements: [1, 1], functions: [1], branches: [[1, 1]] });
  const replaced = mergeCoverageMaps([{ [file]: emptyReport }, { [file]: actualReport }]);
  assert(Object.keys(replaced.fileCoverageFor(file).s).length === 2 &&
    replaced.fileCoverageFor(file).f['0'] === 1,
  'merge não substituiu corretamente o sentinel V8 all:true por dados reais.');
  const retained = mergeCoverageMaps([{ [file]: actualReport }, { [file]: emptyReport }]);
  assert(Object.keys(retained.fileCoverageFor(file).s).length === 2 &&
    retained.fileCoverageFor(file).f['0'] === 1,
  'merge perdeu dados reais ao receber sentinel V8 all:true posterior.');
  console.log('✓ merge Istanbul soma maps V8 independentes sem perder counters.');
}

async function testRawV8MergeMatchesSerialCoverageSummary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-raw-v8-merge-'));
  try {
    const source = path.join(root, 'branch-fixture.cjs');
    const harness = path.join(root, 'run-fixture.cjs');
    fs.writeFileSync(source, [
      "module.exports = function choose(value) {",
      "  if (value === 'left') {",
      '    if (value.length > 0) return "L";',
      '    return "l0";',
      '  }',
      '  return "R";',
      '};',
      '',
    ].join('\n'));
    fs.writeFileSync(harness, [
      'const choose = require(' + JSON.stringify(source) + ');',
      'const side = process.argv[2];',
      "if (side === 'serial') { choose('left'); choose('right'); } else choose(side);",
      '',
    ].join('\n'));

    function capture(mode) {
      const outputDir = path.join(root, mode);
      fs.mkdirSync(outputDir);
      const run = spawnSync(process.execPath, [harness, mode], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, NODE_V8_COVERAGE: outputDir },
      });
      assert(run.status === 0, 'fixture Node/V8 falhou: ' + (run.stderr || run.error?.message || run.status));
      const coverageFiles = fs.readdirSync(outputDir).filter((file) => file.endsWith('.json'));
      const profile = coverageFiles.map((file) => JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8')))
        .flatMap((report) => report.result || [])
        .find((result) => result.url.startsWith('file://') &&
          path.resolve(fileURLToPath(result.url)) === path.resolve(source));
      assert(profile, 'fixture não produziu profile V8 da fonte com ramos.');
      return {
        schemaVersion: 1,
        testProfiles: [{ profiles: [profile] }],
        transforms: {},
      };
    }

    const serial = capture('serial');
    const left = capture('left');
    const right = capture('right');
    const serialMap = await convertMergedV8Profiles([serial]);
    const shardedMap = await convertMergedV8Profiles([left, right]);
    const reversedMap = await convertMergedV8Profiles([right, left]);
    const serialCoverage = serialMap.fileCoverageFor(source);
    const shardedCoverage = shardedMap.fileCoverageFor(source);
    const reversedCoverage = reversedMap.fileCoverageFor(source);
    const serialSummary = serialCoverage.toSummary().toJSON();
    const shardedSummary = shardedCoverage.toSummary().toJSON();

    assert(serialSummary.branches.total >= 3, 'fixture não exercitou ramos V8 suficientes.');
    strictAssert.deepStrictEqual(shardedSummary, serialSummary,
      'merge de profiles V8 por shard deve preservar o summary serial das mesmas execuções.');
    strictAssert.deepStrictEqual(reversedCoverage.toSummary().toJSON(), serialSummary,
      'merge de profiles V8 deve ser independente da ordem dos shards.');
    console.log('✓ merge/conversão V8 de profiles parciais reproduz o summary serial, inclusive em ordem invertida.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testIncompleteMapRejectedDespite100Percent() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-coverage-cardinality-'));
  try {
    const file = path.join(root, 'extension', 'fixture.js');
    const fullBaseline = {
      schemaVersion: 1,
      source: 'selftest serial baseline',
      files: {
        'extension/fixture.js': { statements: 2, branches: 4, functions: 2, lines: 2 },
      },
    };
    const truncated = fixtureFileCoverage(file, { statements: [1], functions: [1], branches: [[1, 1]] });
    const result = validateCoverageCardinality({ [file]: truncated }, fullBaseline, { repoRoot: root });
    assert(!result.ok, 'mapa truncado foi aceito apesar de cardinalidade inferior.');
    assert(result.problems.some((problem) => problem.includes('statements cardinality=1')),
      'selftest não detectou denominador de statements truncado.');
    assert(result.problems.some((problem) => problem.includes('branches cardinality=2')),
      'selftest não detectou denominador de branches truncado.');
    console.log('✓ mapa com 100% e filenames corretos é recusado se cardinalidades serial foram truncadas.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testIncompleteDuplicateAndStaleShardsRejected() {
  const missing = validateShardDirectoryInventory(['shard-1', 'shard-3'], 3);
  assert(missing.some((problem) => problem.includes('shard-2')), 'shard ausente não foi detectado.');
  const extra = validateShardDirectoryInventory(['shard-1', 'shard-2', 'shard-3', 'shard-4'], 3);
  assert(extra.some((problem) => problem.includes('inesperado: shard-4')),
    'diretório de shard extra/stale não foi detectado.');

  const expected = new Map([['suite.test.js\u0000case A', 1], ['suite.test.js\u0000case B', 1]]);
  const duplicated = new Map([['suite.test.js\u0000case A', 2], ['suite.test.js\u0000case B', 1]]);
  assert(validateCaseUnion(expected, duplicated).some((problem) => problem.includes('duplicado')),
    'caso duplicado entre shards não foi detectado.');

  const wrongShard = validateMetadata({
    schemaVersion: 1,
    shardIndex: 2,
    shardCount: 3,
    status: 'passed',
    platform: 'win32',
    arch: 'x64',
    runnerOs: null,
    githubRunId: null,
    githubRunAttempt: null,
    githubSha: null,
    gitHead: 'head-a',
    planSchemaVersion: 1,
    planSha256: 'plan-a',
    expectedCaseCount: 0,
    executedCases: 0,
    passedCases: 0,
    selectedPendingCases: 0,
    testFiles: [],
    selectedCases: [],
  }, { index: 1, files: [], cases: [], expectedCaseCount: 0 }, {
    platform: 'win32', arch: 'x64', runnerOs: null, githubRunId: null,
    githubRunAttempt: null, githubSha: null, gitHead: 'head-a',
    planSchemaVersion: 1, planSha256: 'plan-a',
  }, { shardCount: 3 });
  assert(wrongShard.some((problem) => problem.includes('identidade do shard')),
    'metadata com shard duplicado/identidade errada não foi detectado.');
  console.log('✓ shard ausente, extra/stale, duplicado e identidade incorreta são recusados.');
}

function testRuntimeAndUsefulWorkAreObserved() {
  const report = {
    startTime: 10000,
    testResults: [
      { startTime: 10001, endTime: 10400 },
      { startTime: 10401, endTime: 11000 },
    ],
  };
  const observedWork = { usefulWorkMs: 250, caseAssertionWorkMs: 100 };
  const metadata = {
    shardIndex: 1, jestRuntimeMs: 1001, usefulWorkMs: 250, caseAssertionWorkMs: 100,
  };
  assert(validateRuntimeMetadata(metadata, report, observedWork, 1).length === 0,
    'schema de runtime Jest 29 sem endTime global foi recusado.');
  assert(validateRuntimeMetadata({ ...metadata, usefulWorkMs: 999 }, report, observedWork, 1)
    .some((problem) => problem.includes('trabalho útil')),
  'metadata adulterado de trabalho útil foi aceito.');
  assert(validateRuntimeMetadata({ ...metadata, caseAssertionWorkMs: 999 }, report, observedWork, 1)
    .some((problem) => problem.includes('assertions')),
  'metadata adulterado de duração de assertions foi aceito.');
  assert(validateRuntimeMetadata({ ...metadata, jestRuntimeMs: 120001 }, report, observedWork, 1)
    .some((problem) => problem.includes('120000')),
  'runtime acima de 120s foi aceito.');
  console.log('✓ runtime usa startTime/max(testResult.endTime), limita 120s e reconstrói útil do Jest JSON.');
}

function testShardCollectionReturnsAssertionWork() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-coverage-shard-work-'));
  try {
    const testFile = 'tests/unit/fixture.test.js';
    const fullName = 'fixture passes';
    const identity = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      runnerOs: null,
      githubRunId: null,
      githubRunAttempt: null,
      githubSha: null,
      gitHead: 'fixture-head',
      planSchemaVersion: 1,
      planSha256: 'fixture-plan',
    };
    const plan = {
      shardCount: 1,
      shards: [{
        index: 1,
        files: [testFile],
        expectedCaseCount: 1,
        cases: [{ file: testFile, fullName, occurrences: 1 }],
      }],
    };
    const data = {
      shardCount: 1,
      maxEstimatedImbalanceRatio: 1.3,
      baseline: { suites: 1, tests: 1, maxSkipped: 0, maxTodo: 0, coverage: { minInstrumentedFiles: 0 } },
      files: [{ file: testFile, cases: [{ fullName, occurrences: 1 }] }],
    };
    const shardDir = path.join(root, 'shard-1');
    fs.mkdirSync(shardDir);
    const rawV8Coverage = JSON.stringify({
      schemaVersion: 1,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      testProfiles: [],
      transforms: {},
    });
    const coverageFiles = Array.from({ length: 57 }, (_, index) =>
      'src/fixture-' + String(index + 1).padStart(2, '0') + '.js');
    fs.writeFileSync(path.join(shardDir, 'shard-result.json'), JSON.stringify({
      schemaVersion: 1,
      shardIndex: 1,
      shardCount: 1,
      status: 'passed',
      ...identity,
      testFiles: [testFile],
      expectedCaseCount: 1,
      executedCases: 1,
      passedCases: 1,
      selectedPendingCases: 0,
      selectedCases: [{ file: testFile, fullName, occurrences: 1 }],
      coverageFiles,
      coverageFileCount: coverageFiles.length,
      v8CoverageFile: 'v8-coverage.json',
      v8CoverageBytes: Buffer.byteLength(rawV8Coverage),
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      jestRuntimeMs: 1000,
      usefulWorkMs: 500,
      caseAssertionWorkMs: 125,
    }));
    fs.writeFileSync(path.join(shardDir, 'jest-results.json'), JSON.stringify({
      startTime: 10000,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      success: true,
      testResults: [{
        name: path.join(require('../ci/coverage-shard-plan').REPO_ROOT, ...testFile.split('/')),
        startTime: 10000,
        endTime: 10500,
        assertionResults: [{ fullName, status: 'passed', duration: 125 }],
      }],
    }));
    fs.writeFileSync(path.join(shardDir, 'coverage-final.json'), JSON.stringify(
      Object.fromEntries(coverageFiles.map((file) => [file, {}]))));
    fs.writeFileSync(path.join(shardDir, 'v8-coverage.json'), rawV8Coverage);

    const collected = collectAndValidateShards(root, { data, plan, identity });
    assert(collected.ok, 'fixture de coleta deve validar: ' + collected.problems.join('; '));
    assert(collected.usefulWorkMs === 500, 'coleta deve retornar trabalho útil observado.');
    assert(collected.caseAssertionWorkMs === 125,
      'coleta deve retornar tempo de assertions para JSON agregado e resumo legível.');
    console.log('✓ coleta agrega e retorna o tempo de assertions observado.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function testSerialCardinalityBaselineIsWellFormed() {
  assert(cardinalityBaseline.schemaVersion === 1, 'baseline serial de cardinalidade sem versão.');
  assert(Object.keys(cardinalityBaseline.files).length === 57,
    'baseline serial deve preservar cardinalidade dos 57 arquivos instrumentados.');
  console.log('✓ baseline serial protege denominadores por arquivo e métrica.');
}

function testPublicCoverageAliasStillDispatchesToFullRunner() {
  const scripts = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).scripts;
  assert(scripts['test:coverage'] === 'node scripts/ci/run-jest-ci.js --coverage',
    'alias público protegido test:coverage foi alterado.');
  assert(scripts['test:coverage:shard'] === 'node scripts/ci/run-jest-coverage-shard.js',
    'CLI interno de shard não aponta ao runner balanceado.');
  assert(scripts['test:coverage:merge'] === 'node scripts/ci/merge-jest-coverage-shards.js',
    'CLI interno de merge não aponta ao agregador V8 bruto.');
  console.log('✓ alias público test:coverage preserva o comando protegido e despacha ao runner sharded.');
}

testBalancedPlan();
testPlanRejectsStaleOrUnsafeInventory();
testShardReportRequiresValidFileIntervals();
testIstanbulMapMergeSemantics();
testRawV8MergeMatchesSerialCoverageSummary().catch((error) => {
  console.error('✗ teste de merge de perfis V8 brutos falhou: ' + error.stack);
  process.exitCode = 1;
});
testIncompleteMapRejectedDespite100Percent();
testIncompleteDuplicateAndStaleShardsRejected();
testRuntimeAndUsefulWorkAreObserved();
testShardCollectionReturnsAssertionWork();
testSerialCardinalityBaselineIsWellFormed();
testPublicCoverageAliasStillDispatchesToFullRunner();
