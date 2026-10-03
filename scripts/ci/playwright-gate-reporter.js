'use strict';

const fs = require('fs');
const path = require('path');
const baseline = require('./data/test-baseline.json');
const shardPlan = require('./data/e2e-shard-plan.json');

function minimumExpectedTests() {
  const raw = process.env.MANGA_E2E_MIN_TESTS;
  if (raw === undefined || raw === '') return baseline.e2e.minTests;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('MANGA_E2E_MIN_TESTS deve ser inteiro positivo');
  }
  return value;
}

class PlaywrightGateReporter {
  constructor() {
    this.total = 0;
    this.attemptsById = new Map();
    this.workFile = process.env.CI_SHARD_WORK_FILE || '';
    this.telemetryProblems = [];
    this.groupByTestId = new Map();
    this.groupWork = new Map((shardPlan.groups || []).map(group => [group.id, {
      id: group.id,
      workers: group.workers,
      expectedTests: group.expectedTests,
      testIds: new Set(),
      intervals: [],
    }]));
  }

  onBegin(_config, suite) {
    const tests = suite.allTests();
    this.total = tests.length;
    console.log('[CI/E2E] Playwright descobriu ' + this.total + ' teste(s).');

    if (this.workFile) {
      for (const test of tests) {
        const matches = groupsForTest(test);
        if (matches.length !== 1) {
          this.telemetryProblems.push(
            'teste ' + test.id + ' corresponde a ' + matches.length +
            ' grupos do plano; esperado exatamente 1.'
          );
          continue;
        }
        if (this.groupByTestId.has(test.id)) {
          this.telemetryProblems.push('test id duplicado no inventário agregado: ' + test.id);
          continue;
        }
        this.groupByTestId.set(test.id, matches[0].id);
      }
    }
  }

  onTestEnd(test, result) {
    const attempts = this.attemptsById.get(test.id) || [];
    attempts.push({
      status: result.status,
      retry: Number(result.retry || 0),
    });
    this.attemptsById.set(test.id, attempts);

    if (this.workFile) {
      const groupId = this.groupByTestId.get(test.id);
      const group = this.groupWork.get(groupId);
      const duration = Number(result.duration);
      const startMs = result.startTime instanceof Date
        ? result.startTime.getTime() : Date.parse(result.startTime);
      if (!group) {
        this.telemetryProblems.push('resultado sem grupo único no plano: ' + test.id);
        return;
      }
      if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(startMs)) {
        this.telemetryProblems.push('intervalo de execução inválido para o teste ' + test.id +
          ': startTime=' + result.startTime + ', duration=' + result.duration);
        return;
      }
      group.testIds.add(test.id);
      group.intervals.push({ startMs, endMs: startMs + duration });
    }
  }

  async onEnd(result) {
    const entries = [...this.attemptsById.values()];
    const finalStatuses = entries
      .map((attempts) => attempts[attempts.length - 1])
      .filter(Boolean);

    const skipped = finalStatuses.filter((attempt) => attempt.status === 'skipped').length;
    const failed = finalStatuses.filter(
      (attempt) => attempt.status !== 'passed' && attempt.status !== 'skipped'
    ).length;
    const flaky = entries.filter((attempts) =>
      attempts.length > 1 || attempts.some((attempt) => attempt.retry > 0)
    ).length;

    const problems = [];
    if (!result || result.status !== 'passed') {
      problems.push('execução Playwright terminou como ' + (result?.status || 'status ausente') + '; esperado=passed');
    }

    let minTests = baseline.e2e.minTests;
    try {
      minTests = minimumExpectedTests();
    } catch (error) {
      problems.push('configuração inválida do mínimo E2E: ' + error.message);
      minTests = Number.POSITIVE_INFINITY;
    }
    if (this.total < minTests) {
      problems.push('somente ' + this.total + ' E2E descobertos; mínimo protegido: ' + minTests);
    }
    if (skipped > baseline.e2e.maxSkipped) {
      problems.push(skipped + ' E2E skipped; máximo permitido: ' + baseline.e2e.maxSkipped);
    }
    if (flaky > baseline.e2e.maxFlaky) {
      problems.push(flaky + ' E2E flaky/retry; máximo permitido: ' + baseline.e2e.maxFlaky);
    }
    if (failed > 0) {
      problems.push(failed + ' E2E com status final não aprovado (failed/timedOut/interrupted)');
    }
    if (this.attemptsById.size < this.total && result?.status === 'passed') {
      problems.push('apenas ' + this.attemptsById.size + '/' + this.total + ' testes produziram resultado final');
    }

    if (this.workFile) {
      const sha = process.env.GITHUB_SHA || null;
      const headSha = process.env.GITHUB_HEAD_SHA || sha;
      const runId = process.env.GITHUB_RUN_ID || null;
      const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
      if (!sha || !headSha || !runId || !Number.isInteger(runAttempt) || runAttempt < 1) {
        this.telemetryProblems.push('CI_SHARD_WORK_FILE exige SHA executado, HEAD SHA, GITHUB_RUN_ID e GITHUB_RUN_ATTEMPT válidos.');
      }
      for (const group of this.groupWork.values()) {
        if (group.testIds.size !== group.expectedTests) {
          this.telemetryProblems.push('grupo ' + group.id + ' observou ' + group.testIds.size +
            ' teste(s); esperado=' + group.expectedTests + '.');
        }
      }
      problems.push(...this.telemetryProblems);

      // Persist the terminal gate result even when an assertion, skip, retry,
      // missing result, or telemetry check fails. merge-reports does not
      // reliably propagate custom reporter return values to its exit code,
      // so the downstream metrics gate consumes this durable record.
      const workReport = {
        schemaVersion: 1,
        sha,
        headSha,
        runId,
        runAttempt: Number.isInteger(runAttempt) && runAttempt > 0 ? runAttempt : null,
        gatePassed: problems.length === 0,
        runStatus: result?.status || null,
        totalTests: this.total,
        completedTests: this.attemptsById.size,
        skipped,
        flaky,
        failed,
        groups: [...this.groupWork.values()].map(group => ({
          id: group.id,
          workers: group.workers,
          expectedTests: group.expectedTests,
          observedTests: group.testIds.size,
          usefulWorkMs: Math.round(unionIntervalDuration(group.intervals)),
        })),
      };
      let temporaryOutputPath = '';
      try {
        const outputPath = path.resolve(this.workFile);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.rmSync(outputPath, { force: true });
        temporaryOutputPath = outputPath + '.tmp-' + process.pid + '-' + Date.now();
        fs.writeFileSync(temporaryOutputPath, JSON.stringify(workReport, null, 2) + '\n', { flag: 'wx' });
        fs.renameSync(temporaryOutputPath, outputPath);
        console.log('[CI/E2E] Telemetria por grupo gravada: ' + outputPath);
      } catch (error) {
        if (temporaryOutputPath) {
          try { fs.rmSync(temporaryOutputPath, { force: true }); } catch (_) { /* best-effort cleanup */ }
        }
        problems.push('não foi possível gravar telemetria E2E: ' + error.message);
      }
    }

    if (problems.length) {
      console.error('\nGate E2E falhou:');
      for (const problem of problems) console.error('- ' + problem);
      return { status: 'failed' };
    }

    console.log(
      'Gate E2E aprovado: ' + this.total +
      ' teste(s), skipped=' + skipped +
      ', flaky=' + flaky +
      ', failed=' + failed + '.'
    );
    return undefined;
  }
}

function matcherForGroup(group) {
  const selector = String(group.grep || group.tag || '').trim();
  if (!selector) throw new Error('selector grep vazio para o grupo ' + group.id);
  const match = selector.match(/^\/(.*)\/([gi]*)$/s);
  return match ? new RegExp(match[1], match[2]) : new RegExp(selector, 'gi');
}

function groupsForTest(test, groups = shardPlan.groups || []) {
  const titlePath = typeof test.titlePath === 'function' ? test.titlePath() : [];
  const tags = Array.isArray(test.tags) ? test.tags : [];
  const searchableTitle = [...titlePath, ...tags].join(' ');
  return groups.filter(group => {
    const matcher = matcherForGroup(group);
    matcher.lastIndex = 0;
    return matcher.test(searchableTitle);
  });
}

module.exports = PlaywrightGateReporter;
module.exports.minimumExpectedTests = minimumExpectedTests;
module.exports.groupsForTest = groupsForTest;
module.exports.unionIntervalDuration = unionIntervalDuration;

function unionIntervalDuration(intervals) {
  const sorted = intervals.slice().sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  let total = 0;
  let activeStart = null;
  let activeEnd = null;
  for (const interval of sorted) {
    if (activeStart === null) {
      activeStart = interval.startMs;
      activeEnd = interval.endMs;
    } else if (interval.startMs <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.endMs);
    } else {
      total += activeEnd - activeStart;
      activeStart = interval.startMs;
      activeEnd = interval.endMs;
    }
  }
  if (activeStart !== null) total += activeEnd - activeStart;
  return total;
}
