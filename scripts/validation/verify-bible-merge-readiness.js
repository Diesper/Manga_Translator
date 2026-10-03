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
const {
  loadModel: loadDistributedAuditModel,
} = require('../bible/commands/audit-protocol');

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
  validation.audits,
  { root }
);
for (const problem of auditEvaluation.problems) readiness.blockers.push('audit-pipeline: ' + problem);
for (const blocker of pipelineMergeBlockers(validation.states, auditEvaluation)) readiness.blockers.push(blocker);

// O validator V2 legado conhece audit-claims; o protocolo distribuído é a
// autoridade para audit-leases, baseline de Bible revision e invariantes
// estritas de ownership no fechamento.
const distributedModel = loadDistributedAuditModel();
for (const problem of distributedModel.problems || []) {
  readiness.blockers.push('distributed-protocol: ' + problem);
}
for (const problem of distributedModel.merge_problems || []) {
  readiness.blockers.push('distributed-merge: ' + problem);
}
if ((distributedModel.active_claims_and_leases || []).length) {
  readiness.blockers.push(
    'distributed claims/leases ativos=' + distributedModel.active_claims_and_leases.length
    + ': ' + distributedModel.active_claims_and_leases.join(', ')
  );
}
if ((distributedModel.expired_leases || []).length) {
  readiness.blockers.push(
    'distributed leases expirados residuais=' + distributedModel.expired_leases.length
    + ': ' + distributedModel.expired_leases.join(', ')
  );
}
if ((distributedModel.human_locked || []).length) {
  readiness.blockers.push(
    'HUMAN_LOCKED=' + distributedModel.human_locked.length + ': '
    + distributedModel.human_locked.map((item) => String(item.index).padStart(3, '0') + '/cycle-' + item.cycle).join(', ')
  );
}
const unresolvedFindings = (distributedModel.unverified_findings || []).filter((finding) => (
  finding.status === 'UNVERIFIED' || finding.status === 'CONFIRMED_BY_PRIMARY'
));
if (unresolvedFindings.length) {
  readiness.blockers.push(
    'unverified findings pendentes=' + unresolvedFindings.length + ': '
    + unresolvedFindings.map((finding) => finding.id).join(', ')
  );
}
if (!distributedModel.baseline || Object.keys(distributedModel.baseline.bibles || {}).length !== 233) {
  readiness.blockers.push('baseline de revisão das Bíblias ausente/incompleta');
}

readiness.blockers = [...new Set(readiness.blockers)];
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
