'use strict';

const core = require('../bible/core/audit-core');

// Adaptador de compatibilidade. A implementação canônica do protocolo
// distribuído vive fora do corpus congelado, em docs/biblia/.coordination.
// Todos os consumidores (planner, projections e merge-readiness) usam
// exatamente as mesmas regras de source_sha + bible_sha.
module.exports = {
  AUDIT_PHASES: core.AUDIT_PHASES,
  AUDIT_VERDICTS: core.AUDIT_VERDICTS,
  loadAuditResults: core.loadAuditResults,
  resolveAuditPipeline: core.resolveAuditPipeline,
  nextAuditPhase: core.nextAuditPhase,
  evaluateAuditPipelines: core.evaluateAuditPipelines,
  pipelineMergeBlockers: core.pipelineMergeBlockers,
  postHandoffCorrectionProblems: core.postHandoffCorrectionProblems,
  displayAuditStatus: core.displayAuditStatus,
  recordMatchesCurrentBible: core.recordMatchesCurrentBible,
  loadBibleBaseline: core.loadBibleBaseline,
  currentBibleSha: core.currentBibleSha,
};
