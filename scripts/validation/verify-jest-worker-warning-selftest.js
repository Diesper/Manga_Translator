'use strict';

const assert = require('node:assert/strict');
const { FORCED_WORKER_EXIT, hasForcedWorkerExit } = require('../ci/jest-worker-warning');

assert.equal(hasForcedWorkerExit('PASS 107 suites\n' + FORCED_WORKER_EXIT + '\n'), true);
assert.equal(hasForcedWorkerExit('PASS 107 suites\nTests: 840 passed\n'), false);
assert.equal(hasForcedWorkerExit('FAIL unit/example.test.js\n'), false);

console.log('Gate de worker Jest: warning detectado sem mascarar falhas comuns.');
