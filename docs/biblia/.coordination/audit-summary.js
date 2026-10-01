'use strict';

const { loadModel } = require('./audit-protocol');

function summarize(model) {
  const decisions = {};
  const decisionIndices = {};
  const nextPhases = {};
  let finalApproved = 0;
  let finalChangesRequired = 0;

  for (const pipeline of model.pipelines || []) {
    decisions[pipeline.decision] = (decisions[pipeline.decision] || 0) + 1;
    if (!decisionIndices[pipeline.decision]) decisionIndices[pipeline.decision] = [];
    decisionIndices[pipeline.decision].push(pipeline.index);
    const next = pipeline.next_phase || 'DONE';
    nextPhases[next] = (nextPhases[next] || 0) + 1;
    if (pipeline.decision === 'APPROVED') finalApproved += 1;
    if (pipeline.decision === 'CHANGES_REQUIRED') finalChangesRequired += 1;
  }

  return {
    states: model.states?.length || 0,
    results: {
      total: model.results?.length || 0,
      primary: (model.results || []).filter((r) => r.phase === 'PRIMARY').length,
      adversarial: (model.results || []).filter((r) => r.phase === 'ADVERSARIAL').length,
      reaudit: (model.results || []).filter((r) => r.phase === 'REAUDIT').length,
    },
    decisions,
    decision_indices: decisionIndices,
    next_phases: nextPhases,
    final: {
      approved: finalApproved,
      changes_required: finalChangesRequired,
      unresolved: (model.pipelines || []).length - finalApproved - finalChangesRequired,
    },
    coordination: {
      active_claims_and_leases: model.active_claims_and_leases?.length || 0,
      expired_leases: model.expired_leases?.length || 0,
      reservations: model.reservations?.length || 0,
      operational_problems: model.problems?.length || 0,
      strict_merge_problems: model.merge_problems?.length || 0,
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const summary = summarize(loadModel());
  if (json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }
  console.log('Bible distributed audit summary');
  console.log('states=' + summary.states + ' results=' + summary.results.total);
  console.log('results PRIMARY=' + summary.results.primary
    + ' ADVERSARIAL=' + summary.results.adversarial
    + ' REAUDIT=' + summary.results.reaudit);
  console.log('decisions ' + Object.entries(summary.decisions).sort().map(([k,v]) => k + '=' + v).join(' '));
  if (summary.decision_indices.CHANGES_REQUIRED?.length) {
    console.log('changes_required_indices=' + summary.decision_indices.CHANGES_REQUIRED.map((i) => String(i).padStart(3, '0')).join(','));
  }
  if (summary.decision_indices.REAUDIT_REQUIRED?.length) {
    console.log('reaudit_required_indices=' + summary.decision_indices.REAUDIT_REQUIRED.map((i) => String(i).padStart(3, '0')).join(','));
  }
  console.log('next ' + Object.entries(summary.next_phases).sort().map(([k,v]) => k + '=' + v).join(' '));
  console.log('final approved=' + summary.final.approved
    + ' changes_required=' + summary.final.changes_required
    + ' unresolved=' + summary.final.unresolved);
  console.log('coordination active=' + summary.coordination.active_claims_and_leases
    + ' expired=' + summary.coordination.expired_leases
    + ' reservations=' + summary.coordination.reservations
    + ' operational_problems=' + summary.coordination.operational_problems
    + ' strict_merge_problems=' + summary.coordination.strict_merge_problems);
}

if (require.main === module) main();

module.exports = { summarize };
