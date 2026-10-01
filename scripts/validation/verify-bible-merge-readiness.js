'use strict';

const fs = require('fs');
const path = require('path');
const { validateBibleCoordination } = require('./bible-coordination');

const root = path.resolve(__dirname, '../..');
const bibleRoot = path.join(root, 'docs', 'biblia');

const validation = validateBibleCoordination(root, {
  checkDerived: true,
  headLabel: 'states-v2',
});

const problems = [...validation.problems];
const nonCompleted = validation.states.filter((state) => state.status !== 'COMPLETED');
const repairRequired = validation.states.filter((state) => state.coordination_status !== 'OK');

if (validation.states.length !== 233) {
  problems.push('merge readiness exige exatamente 233 states; atual=' + validation.states.length);
}
if (nonCompleted.length) {
  const counts = new Map();
  for (const state of nonCompleted) counts.set(state.status, (counts.get(state.status) || 0) + 1);
  const summary = [...counts.entries()].map(([status, count]) => status + '=' + count).join(', ');
  problems.push('merge readiness exige 233 COMPLETED; pendentes=' + nonCompleted.length + ' (' + summary + ')');
}
if (repairRequired.length) {
  problems.push('merge readiness exige coordination_status OK em todos os states; divergentes='
    + repairRequired.map((state) => String(state.index).padStart(3, '0')).join(','));
}
if (validation.reservations.length) {
  problems.push('merge readiness exige zero reservas; atuais=' + validation.reservations.join(', '));
}
if (validation.auditClaims.length) {
  problems.push('merge readiness exige zero audit claims; atuais=' + validation.auditClaims.join(', '));
}

for (const lockName of ['PROGRESS.lock.md', 'BOOTSTRAP.lock.md']) {
  const lockPath = path.join(bibleRoot, '.coordination', lockName);
  if (fs.existsSync(lockPath)) problems.push('merge readiness exige ausência de ' + lockName);
}

if (problems.length) {
  console.error('Bible merge readiness: NOT READY');
  for (const problem of [...new Set(problems)]) console.error('- ' + problem);
  process.exit(1);
}

console.log('Bible merge readiness: READY — 233/233 COMPLETED, sem locks/claims/reservas e projeções coerentes.');
