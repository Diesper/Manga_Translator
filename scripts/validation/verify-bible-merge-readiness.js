'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateBibleCoordination,
  evaluateMergeReadiness,
} = require('./bible-coordination');

const root = path.resolve(__dirname, '../..');
const bibleRoot = path.join(root, 'docs', 'biblia');

const validation = validateBibleCoordination(root, {
  checkDerived: true,
  enforceSingleAuditClaimPerAuditor: true,
  headLabel: 'states-v2',
});

const readiness = evaluateMergeReadiness(validation, {
  progressLockActive: fs.existsSync(path.join(bibleRoot, '.coordination', 'PROGRESS.lock.md')),
  bootstrapLockActive: fs.existsSync(path.join(bibleRoot, '.coordination', 'BOOTSTRAP.lock.md')),
});

if (!readiness.ready) {
  console.error('Bible merge readiness: NOT READY');
  for (const blocker of [...new Set(readiness.blockers)]) console.error('- ' + blocker);
  console.error('External requirement remains: GitHub Actions must pass for the exact final SHA.');
  process.exit(1);
}

console.log(
  'Bible merge readiness: READY — 233/233 COMPLETED, requests OPEN=0, '
  + 'sem locks/claims/reservas e projeções coerentes.'
);
console.log('External requirement: GitHub Actions must pass for the exact final SHA.');
