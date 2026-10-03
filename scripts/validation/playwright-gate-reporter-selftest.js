'use strict';

const assert = require('assert');
const PlaywrightGateReporter = require('../ci/playwright-gate-reporter');
const expectedTests = require('../ci/data/test-baseline.json').e2e.minTests;

function suite(total) {
  return {
    allTests() {
      return Array.from({ length: total }, (_, index) => ({ id: 't' + index }));
    },
  };
}

async function finish({ total = expectedTests, attempts = [], runStatus = 'passed' }) {
  const reporter = new PlaywrightGateReporter();
  reporter.onBegin({}, suite(total));
  for (const attempt of attempts) {
    reporter.onTestEnd(
      { id: attempt.id },
      { status: attempt.status, retry: attempt.retry || 0 }
    );
  }
  return reporter.onEnd({ status: runStatus });
}

function passedAttempts(total = expectedTests) {
  return Array.from({ length: total }, (_, index) => ({
    id: 't' + index,
    status: 'passed',
    retry: 0,
  }));
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
    const attempts = passedAttempts(expectedTests - 1);
    attempts.push({ id: 't' + (expectedTests - 1), status: terminalStatus, retry: 0 });
    assert.deepStrictEqual(
      await finish({ attempts }),
      { status: 'failed' },
      'status terminal deve reprovar o gate: ' + terminalStatus
    );
  }

  console.log('Self-test do reporter E2E aprovado.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
