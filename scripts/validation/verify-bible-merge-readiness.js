'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateBibleCoordination,
  evaluateMergeReadiness,
} = require('./bible-coordination');
const {
  evaluateAuditPipelines,
  pipelineMergeBlockers,
} = require('./bible-audit-pipeline');

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

const auditEvaluation = evaluateAuditPipelines(
  validation.states,
  validation.auditResults || [],
  validation.audits
);
for (const problem of auditEvaluation.problems) readiness.blockers.push('audit-pipeline: ' + problem);
for (const blocker of pipelineMergeBlockers(validation.states, auditEvaluation)) readiness.blockers.push(blocker);
readiness.ready = readiness.blockers.length === 0;

if (!readiness.ready) {
  console.error('Bible merge readiness: NOT READY');
  for (const blocker of [...new Set(readiness.blockers)]) console.error('- ' + blocker);
  console.error('External requirement remains: GitHub Actions must pass for the exact final SHA.');
  process.exit(1);
}

console.log(
  'Bible merge readiness: READY — 233/233 COMPLETED, PRIMARY + ADVERSARIAL válidas para 100% dos SHAs, '
  + 'divergências re-auditadas, requests OPEN=0 e sem locks/claims/reservas.'
);
console.log('External requirement: GitHub Actions must pass for the exact final SHA.');
