'use strict';

const baseline = require('./data/test-baseline.json');

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
  }

  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    console.log('[CI/E2E] Playwright descobriu ' + this.total + ' teste(s).');
  }

  onTestEnd(test, result) {
    const attempts = this.attemptsById.get(test.id) || [];
    attempts.push({
      status: result.status,
      retry: Number(result.retry || 0),
    });
    this.attemptsById.set(test.id, attempts);
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
    const flaky = entries.filter((attempts) => {
      if (!attempts.length) return false;
      const finalAttempt = attempts[attempts.length - 1];
      if (finalAttempt.status !== 'passed') return false;

      const retried = attempts.length > 1 || attempts.some((attempt) => attempt.retry > 0);
      const hadNonPassingAttempt = attempts
        .slice(0, -1)
        .some((attempt) => attempt.status !== 'passed');

      return retried && hadNonPassingAttempt;
    }).length;

    const problems = [];

    const minTests = minimumExpectedTests();
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
    if (this.attemptsById.size < this.total && result.status === 'passed') {
      problems.push('apenas ' + this.attemptsById.size + '/' + this.total + ' testes produziram resultado final');
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

module.exports = PlaywrightGateReporter;
module.exports.minimumExpectedTests = minimumExpectedTests;
