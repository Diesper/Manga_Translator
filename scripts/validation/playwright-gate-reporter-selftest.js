'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const PlaywrightGateReporter = require('../ci/playwright-gate-reporter');
const expectedTests = require('../ci/data/test-baseline.json').e2e.minTests;
const shardPlan = require('../ci/data/e2e-shard-plan.json');
const { groupsForTest } = PlaywrightGateReporter;

function suite(total) {
  return {
    allTests() {
      return Array.from({ length: total }, (_, index) => ({ id: 't' + index }));
    },
  };
}

async function finish({ total = expectedTests, attempts = [], runStatus = 'passed', tests, workFile, identity } = {}) {
  const envKeys = ['CI_SHARD_WORK_FILE', 'GITHUB_SHA', 'GITHUB_HEAD_SHA', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT'];
  const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));
  if (workFile) {
    process.env.CI_SHARD_WORK_FILE = workFile;
    process.env.GITHUB_SHA = identity?.sha || 'selftest-sha';
    process.env.GITHUB_HEAD_SHA = identity?.headSha || process.env.GITHUB_SHA;
    process.env.GITHUB_RUN_ID = identity?.runId || '12345';
    process.env.GITHUB_RUN_ATTEMPT = String(identity?.runAttempt || 2);
  } else {
    delete process.env.CI_SHARD_WORK_FILE;
    delete process.env.GITHUB_SHA;
    delete process.env.GITHUB_HEAD_SHA;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ATTEMPT;
  }

  try {
    const selectedTests = tests || suite(total).allTests();
    const testById = new Map(selectedTests.map(test => [test.id, test]));
    const reporter = new PlaywrightGateReporter();
    reporter.onBegin({}, { allTests: () => selectedTests });
    let cursorMs = 100000;
    for (const attempt of attempts) {
      const startMs = Number.isFinite(attempt.startTimeMs) ? attempt.startTimeMs : cursorMs;
      const duration = attempt.duration ?? 0;
      reporter.onTestEnd(
        testById.get(attempt.id) || { id: attempt.id },
        { status: attempt.status, retry: attempt.retry || 0, duration, startTime: new Date(startMs) }
      );
      cursorMs = Math.max(cursorMs, startMs + duration);
    }
    return await reporter.onEnd({ status: runStatus });
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function passedAttempts(total = expectedTests) {
  return Array.from({ length: total }, (_, index) => ({
    id: 't' + index,
    status: 'passed',
    retry: 0,
  }));
}

function plannedTests() {
  return shardPlan.groups.flatMap(group => {
    const selector = String(group.grep || group.tag);
    const choices = selector.startsWith('@') ? null : selector.split('|');
    return Array.from({ length: group.expectedTests }, (_, index) => ({
      id: group.id + '-' + index,
      plannedGroupId: group.id,
      titlePath: () => [choices ? choices[index % choices.length] : 'test ' + index],
      tags: choices ? [] : [selector],
    }));
  });
}

(async () => {
  assert.strictEqual(await finish({ attempts: passedAttempts() }), undefined);

  {
    const attempts = passedAttempts();
    attempts[expectedTests - 1] = { id: 't' + (expectedTests - 1), status: 'skipped', retry: 0 };
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: 'failed', retry: 0 });
    attempts.push({ id: 't' + (expectedTests - 1), status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: 'passed', retry: 0 });
    attempts.push({ id: 't' + (expectedTests - 1), status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' },
      'duas tentativas aprovadas ainda contam como retry e devem falhar');
  }

  {
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' },
      'retry sem resultado anterior deve falhar fechado');
  }

  {
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: 'timedOut', retry: 0 });
    attempts.push({ id: 't' + (expectedTests - 1), status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(expectedTests - 1);
    assert.deepStrictEqual(
      await finish({ total: expectedTests - 1, attempts }),
      { status: 'failed' }
    );
  }

  {
    const previous = process.env.MANGA_E2E_MIN_TESTS;
    process.env.MANGA_E2E_MIN_TESTS = '4';
    try {
      assert.strictEqual(
        await finish({ total: 4, attempts: passedAttempts(4) }),
        undefined
      );
      assert.deepStrictEqual(
        await finish({ total: 3, attempts: passedAttempts(3) }),
        { status: 'failed' }
      );
      process.env.MANGA_E2E_MIN_TESTS = '0';
      assert.throws(
        () => PlaywrightGateReporter.minimumExpectedTests(),
        /inteiro positivo/
      );
    } finally {
      if (previous === undefined) delete process.env.MANGA_E2E_MIN_TESTS;
      else process.env.MANGA_E2E_MIN_TESTS = previous;
    }
  }

  for (const terminalStatus of ['failed', 'timedOut', 'interrupted']) {
    assert.deepStrictEqual(
      await finish({ attempts: passedAttempts(), runStatus: terminalStatus }),
      { status: 'failed' },
      'status terminal do run deve reprovar mesmo se todos os testes individuais passaram: ' + terminalStatus
    );
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: terminalStatus, retry: 0 });
    assert.deepStrictEqual(
      await finish({ attempts }),
      { status: 'failed' },
      'status terminal deve reprovar o gate: ' + terminalStatus
    );
  }

  {
    const tests = plannedTests();
    for (const test of tests) {
      assert.deepStrictEqual(
        groupsForTest(test).map(group => group.id),
        [test.plannedGroupId],
        'cada teste do fixture deve corresponder a exatamente um grupo: ' + test.id
      );
    }

    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-shard-work-'));
    const workFile = path.join(temporaryDirectory, 'shard-work.json');
    const attempts = tests.map((test, index) => ({
      id: test.id,
      status: 'passed',
      duration: (index + 1) * 13,
    }));
    try {
      assert.strictEqual(
        await finish({ tests, attempts, workFile, identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }),
        undefined
      );
      const report = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.deepStrictEqual(Object.keys(report), [
        'schemaVersion', 'sha', 'headSha', 'runId', 'runAttempt', 'gatePassed',
        'runStatus', 'totalTests', 'completedTests', 'skipped', 'flaky', 'failed', 'groups',
      ]);
      assert.strictEqual(report.schemaVersion, 1);
      assert.strictEqual(report.sha, 'abc123');
      assert.strictEqual(report.headSha, 'abc123');
      assert.strictEqual(report.runId, '98765');
      assert.strictEqual(report.runAttempt, 3);
      assert.strictEqual(report.gatePassed, true);
      assert.strictEqual(report.runStatus, 'passed');
      assert.strictEqual(report.totalTests, expectedTests);
      assert.strictEqual(report.completedTests, expectedTests);
      assert.strictEqual(report.skipped, 0);
      assert.strictEqual(report.flaky, 0);
      assert.strictEqual(report.failed, 0);
      assert.strictEqual(report.groups.length, shardPlan.groups.length);
      for (const plannedGroup of shardPlan.groups) {
        const actualGroup = report.groups.find(group => group.id === plannedGroup.id);
        const groupTests = tests.filter(test => test.plannedGroupId === plannedGroup.id);
        const expectedUsefulWorkMs = groupTests.reduce((sum, test) => {
          const attempt = attempts.find(item => item.id === test.id);
          return sum + attempt.duration;
        }, 0);
        assert.deepStrictEqual(actualGroup, {
          id: plannedGroup.id,
          workers: plannedGroup.workers,
          expectedTests: plannedGroup.expectedTests,
          observedTests: plannedGroup.expectedTests,
          usefulWorkMs: expectedUsefulWorkMs,
        });
      }

      const overlappingAttempts = tests.map(test => ({
        id: test.id,
        status: 'passed',
        duration: test.plannedGroupId === 'attachment' ? 100 : 10,
        ...(test.plannedGroupId === 'attachment' ? { startTimeMs: 200000 } : {}),
      }));
      assert.strictEqual(await finish({ tests, attempts: overlappingAttempts, workFile,
        identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }), undefined);
      const overlapReport = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(overlapReport.groups.find(group => group.id === 'attachment').usefulWorkMs, 100,
        'testes paralelos contam o intervalo útil concorrente uma só vez, sem multiplicar por workers');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  {
    const tests = plannedTests();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-shard-terminal-work-'));
    const workFile = path.join(temporaryDirectory, 'shard-work.json');
    try {
      const skippedAttempts = tests.map((test, index) => ({
        id: test.id,
        status: index === 0 ? 'skipped' : 'passed',
        duration: 10,
      }));
      assert.deepStrictEqual(await finish({ tests, attempts: skippedAttempts, workFile,
        identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }), { status: 'failed' });
      const skippedReport = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(skippedReport.gatePassed, false);
      assert.strictEqual(skippedReport.runStatus, 'passed');
      assert.strictEqual(skippedReport.skipped, 1);
      assert.strictEqual(skippedReport.flaky, 0);
      assert.strictEqual(skippedReport.failed, 0);
      assert.strictEqual(skippedReport.completedTests, expectedTests);

      const failedAttempts = tests.map((test, index) => ({
        id: test.id,
        status: index === 0 ? 'failed' : 'passed',
        duration: 10,
      }));
      assert.deepStrictEqual(await finish({ tests, attempts: failedAttempts, runStatus: 'failed', workFile,
        identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }), { status: 'failed' });
      const failedReport = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(failedReport.gatePassed, false);
      assert.strictEqual(failedReport.runStatus, 'failed');
      assert.strictEqual(failedReport.skipped, 0);
      assert.strictEqual(failedReport.flaky, 0);
      assert.strictEqual(failedReport.failed, 1);

      const flakyAttempts = tests.flatMap((test, index) => index === 0
        ? [
          { id: test.id, status: 'failed', retry: 0, duration: 10 },
          { id: test.id, status: 'passed', retry: 1, duration: 10 },
        ]
        : [{ id: test.id, status: 'passed', retry: 0, duration: 10 }]);
      assert.deepStrictEqual(await finish({ tests, attempts: flakyAttempts, workFile,
        identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }), { status: 'failed' });
      const flakyReport = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(flakyReport.gatePassed, false);
      assert.strictEqual(flakyReport.runStatus, 'passed');
      assert.strictEqual(flakyReport.skipped, 0);
      assert.strictEqual(flakyReport.flaky, 1);
      assert.strictEqual(flakyReport.failed, 0);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  {
    const tests = plannedTests();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-shard-config-failure-'));
    const workFile = path.join(temporaryDirectory, 'shard-work.json');
    const previousMinimum = process.env.MANGA_E2E_MIN_TESTS;
    process.env.MANGA_E2E_MIN_TESTS = '0';
    try {
      assert.deepStrictEqual(await finish({ tests, attempts: tests.map(test => ({
        id: test.id, status: 'passed', duration: 10,
      })), workFile, identity: { sha: 'abc123', runId: '98765', runAttempt: 3 } }), { status: 'failed' });
      const report = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(report.gatePassed, false,
        'configuração que faz o cálculo do gate lançar exceção deve persistir reprovação terminal');
      assert.strictEqual(report.runStatus, 'passed');
      assert.strictEqual(report.failed, 0);
    } finally {
      if (previousMinimum === undefined) delete process.env.MANGA_E2E_MIN_TESTS;
      else process.env.MANGA_E2E_MIN_TESTS = previousMinimum;
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  {
    const ambiguousTest = {
      id: 'ambiguous',
      titlePath: () => ['ambiguous test'],
      tags: ['@e2e-fifo', '@e2e-attachment'],
    };
    assert.deepStrictEqual(
      groupsForTest(ambiguousTest).map(group => group.id).sort(),
      ['attachment', 'fifo'],
      'correspondência ambígua deve ser detectada, não escolhida silenciosamente'
    );

    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-shard-work-'));
    const workFile = path.join(temporaryDirectory, 'shard-work.json');
    try {
      assert.deepStrictEqual(
        await finish({
          total: 1,
          tests: [ambiguousTest],
          attempts: [{ id: ambiguousTest.id, status: 'passed', duration: 17 }],
          workFile,
        }),
        { status: 'failed' },
        'o reporter deve falhar fechado diante da ambiguidade'
      );
      assert.strictEqual(fs.existsSync(workFile), true, 'deve persistir o resultado terminal mesmo com telemetria ambígua');
      const report = JSON.parse(fs.readFileSync(workFile, 'utf8'));
      assert.strictEqual(report.gatePassed, false);
      assert.strictEqual(report.groups.reduce((sum, group) => sum + group.observedTests, 0), 0,
        'a telemetria ambígua deve registrar contagens incompletas para o validador rejeitar');
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }

  await testActualMergeReportsPersistsSkippedFailure();

  console.log('Self-test do reporter E2E aprovado.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function testActualMergeReportsPersistsSkippedFailure() {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const playwrightCli = path.join(repositoryRoot, 'node_modules', 'playwright', 'cli.js');
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-merge-gate-boundary-'));
  const testDirectory = path.join(temporaryDirectory, 'tests');
  const blobDirectory = path.join(temporaryDirectory, 'blob');
  const workFile = path.join(temporaryDirectory, 'work.json');
  const configFile = path.join(temporaryDirectory, 'playwright.config.js');
  fs.mkdirSync(testDirectory, { recursive: true });

  try {
    const testLines = [
      'const { test } = require(' + JSON.stringify(require.resolve('@playwright/test')) + ');',
    ];
    for (const group of shardPlan.groups) {
      const selector = String(group.grep || group.tag);
      const choices = selector.startsWith('@') ? [selector] : selector.split('|');
      for (let index = 0; index < group.expectedTests; index += 1) {
        const isSkipProbe = group.id === 'fifo' && index === 0;
        const token = choices[index % choices.length].trim();
        const title = 'merge probe ' + group.id + ' ' + index + (isSkipProbe ? ' [skip-probe]' : '') + ' ' + token;
        testLines.push('test(' + JSON.stringify(title) + ', async ({}, testInfo) => {');
        testLines.push("  if (testInfo.title.includes('[skip-probe]')) test.skip();");
        testLines.push('});');
      }
    }
    fs.writeFileSync(path.join(testDirectory, 'merge-probe.spec.js'), testLines.join('\n') + '\n', 'utf8');
    fs.writeFileSync(configFile, [
      'module.exports = {',
      '  testDir: ' + JSON.stringify(testDirectory) + ',',
      '  testMatch: /.*\\.spec\\.js/,',
      '  reporter: [["blob", { outputDir: ' + JSON.stringify(blobDirectory) + ' }]],',
      '  workers: 3,',
      '  retries: 0,',
      '  timeout: 5000,',
      '};',
      '',
    ].join('\n'), 'utf8');

    const commonEnv = {
      ...process.env,
      CI: '1',
      GITHUB_SHA: 'b'.repeat(40),
      GITHUB_HEAD_SHA: 'a'.repeat(40),
      GITHUB_RUN_ID: '123456789',
      GITHUB_RUN_ATTEMPT: '1',
    };
    const testRun = spawnSync(process.execPath, [playwrightCli, 'test', '--config', configFile], {
      cwd: repositoryRoot,
      env: commonEnv,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.strictEqual(testRun.error, undefined, 'execução Playwright do fixture não deve falhar ao iniciar: ' + testRun.error);
    assert.strictEqual(testRun.status, 0,
      'a execução sintética com um skipped deve terminar sem falha de teste: ' + testRun.stdout + testRun.stderr);
    assert(fs.existsSync(blobDirectory), 'o runner deve produzir o blob report para merge-reports');

    const mergeRun = spawnSync(process.execPath, [playwrightCli, 'merge-reports',
      '--config=' + path.join(repositoryRoot, 'scripts', 'ci', 'playwright-merge.config.js'), blobDirectory], {
      cwd: repositoryRoot,
      env: { ...commonEnv, CI_SHARD_WORK_FILE: workFile },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.strictEqual(mergeRun.error, undefined, 'merge-reports não deve falhar ao iniciar: ' + mergeRun.error);
    assert([0, 1].includes(mergeRun.status), 'merge-reports deve encerrar normalmente: ' + mergeRun.stdout + mergeRun.stderr);
    assert(fs.existsSync(workFile), 'merge-reports deve persistir o resultado terminal no work artifact');
    const report = JSON.parse(fs.readFileSync(workFile, 'utf8'));
    assert.strictEqual(report.gatePassed, false, 'um skip deve reprovar o gate durável');
    assert.strictEqual(report.runStatus, 'passed', 'Playwright pode marcar o run como passed mesmo com teste skipped');
    assert.strictEqual(report.skipped, 1);
    assert.strictEqual(report.flaky, 0);
    assert.strictEqual(report.failed, 0);
    assert.strictEqual(report.totalTests, expectedTests);
    assert.strictEqual(report.completedTests, expectedTests);
    assert.deepStrictEqual(report.groups.map(group => group.id), shardPlan.groups.map(group => group.id));
    assert(report.groups.every(group => group.observedTests === group.expectedTests),
      'os cinco grupos devem conservar inventário completo no merge real');
    if (mergeRun.status === 0) {
      assert.strictEqual(report.gatePassed, false,
        'se merge-reports ignorar o retorno failed do reporter, o work artifact ainda bloqueia o gate');
    }
    console.log('[CI/E2E] merge-reports boundary: exit=' + mergeRun.status +
      ', gatePassed=' + report.gatePassed + ', skipped=' + report.skipped + '.');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
