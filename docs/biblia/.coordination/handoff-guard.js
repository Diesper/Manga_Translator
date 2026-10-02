'use strict';

const path = require('path');
const core = require('./audit-core');
const {
  readStates,
} = require('./audit-protocol');

const repoRoot = path.resolve(__dirname, '../../..');

function verifyHandoffGuard(root = repoRoot) {
  const states = readStates();
  const loaded = core.loadAuditResults(root, states);
  const handoffProblems = core.postHandoffCorrectionProblems(states, loaded.records, { root });
  return {
    states,
    records: loaded.records,
    loadProblems: loaded.problems,
    problems: handoffProblems,
  };
}

function main() {
  const result = verifyHandoffGuard();
  if (result.loadProblems.length) {
    console.warn('Bible handoff guard: audit-result warnings=' + result.loadProblems.length);
    for (const problem of result.loadProblems.slice(0, 20)) console.warn('- ' + problem);
  }
  if (result.problems.length) {
    console.error('Bible handoff guard: BLOCKED');
    for (const problem of result.problems) console.error('- ' + problem);
    process.exit(1);
  }

  const protectedStates = result.states.filter((state) => core.latestProtectedHandoff(state, { root: repoRoot }));
  console.log(
    'Bible handoff guard: PASS — protected revisions=' + protectedStates.length
    + ', audit results=' + result.records.length
  );
}

if (require.main === module) main();

module.exports = {
  verifyHandoffGuard,
};
