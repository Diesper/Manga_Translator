'use strict';

const FORCED_WORKER_EXIT = 'A worker process has failed to exit gracefully and has been force exited';

function hasForcedWorkerExit(stderr) {
  return typeof stderr === 'string' && stderr.includes(FORCED_WORKER_EXIT);
}

module.exports = { FORCED_WORKER_EXIT, hasForcedWorkerExit };
