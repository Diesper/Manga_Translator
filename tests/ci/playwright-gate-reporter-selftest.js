'use strict';

const assert = require('assert');
const PlaywrightGateReporter = require('./playwright-gate-reporter');

function suite(total) {
  return {
    allTests() {
      return Array.from({ length: total }, (_, index) => ({ id: 't' + index }));
    },
  };
}

async function finish({ total = 21, attempts = [], runStatus = 'passed' }) {
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

function passedAttempts(total = 21) {
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
    attempts[20] = { id: 't20', status: 'skipped', retry: 0 };
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: 'failed', retry: 0 });
    attempts.push({ id: 't20', status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: 'timedOut', retry: 0 });
    attempts.push({ id: 't20', status: 'passed', retry: 1 });
    assert.deepStrictEqual(await finish({ attempts }), { status: 'failed' });
  }

  {
    const attempts = passedAttempts(20);
    assert.deepStrictEqual(
      await finish({ total: 20, attempts }),
      { status: 'failed' }
    );
  }

  for (const terminalStatus of ['failed', 'timedOut', 'interrupted']) {
    const attempts = passedAttempts(20);
    attempts.push({ id: 't20', status: terminalStatus, retry: 0 });
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
