'use strict';
const fs = require('fs');
const path = require('path');
const completion = require('../core/completion');
const storage = require('../storage/files');
const git = require('../storage/git');
const life = require('../core/lifecycle-core');
const transition = require('./unit-transition');

function migrate(state, pipeline, at) {
  if (!completion.hasCompleted(state)) return state;
  // Bootstrap only: an installed freeze cannot be re-evaluated by migration.
  if (state.completion?.achieved && state.completion?.human_order_required_since_utc) return state;
  const next = JSON.parse(JSON.stringify(state));
  const operational = completion.reviewStatus(state);
  completion.setReviewStatus(next, operational);
  next.completed_at_utc = next.completion.first_completed_at_utc;
  next.completion_quality = completion.completionQuality(next, pipeline);
  if (!state.completion?.human_order_required_since_utc) {
    next.completion.human_order_required_since_utc = at;
    life.appendLifecycleEvent(next.history, { type: 'COMPLETED_HUMAN_FREEZE_ACTIVATED', at_utc: at,
      from_status: 'COMPLETED', to_status: 'COMPLETED', from_review_status: operational, to_review_status: operational,
      reason: 'Ordem humana direta obrigatória para qualquer edição, auditoria ou reavaliação futura.' });
    next.updated_at_utc = at;
    transition.persistSnapshot(next, life.lifecycleSnapshot(next));
    next.completion_quality = completion.completionQuality(next, pipeline);
  }
  if (!state.completion?.achieved) {
    life.appendLifecycleEvent(next.history, { type: 'COMPLETION_POLICY_MIGRATION', at_utc: at,
      from_status: state.status, to_status: 'COMPLETED', from_review_status: operational, to_review_status: operational,
      reason: 'Conclusão histórica permanente; revisão operacional e ressalvas preservadas separadamente.' });
    next.updated_at_utc = at;
    transition.persistSnapshot(next, life.lifecycleSnapshot(next));
    next.completion_quality = completion.completionQuality(next, pipeline);
  }
  return next;
}

function main(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '../../..');
  const protocol = require('./audit-protocol');
  const model = protocol.loadModel();
  const at = new Date().toISOString();
  let changed = 0;
  for (const state of model.states) {
    const next = migrate(state, model.pipelines.find(p => p.index === state.index), at);
    if (JSON.stringify(next) === JSON.stringify(state)) continue;
    changed++;
    if (!argv.includes('--write')) continue;
    const file = path.join(root, 'docs/biblia/.state', String(state.index).padStart(3, '0') + '.json');
    storage.withUnitLock(root, state.index, () => {
      const raw = fs.readFileSync(file, 'utf8');
      if (JSON.stringify(JSON.parse(raw)) !== JSON.stringify(state)) throw new Error('STATE_CAS_CONFLICT');
      storage.transaction(root, state.index, { action: 'COMPLETION_POLICY_MIGRATION', expected_state_sha: git.gitBlobShaBuffer(Buffer.from(raw)) },
        () => storage.atomicWrite(file, JSON.stringify(next, null, 2) + '\n', { expected: raw }));
    });
  }
  console.log(JSON.stringify({ mode: argv.includes('--write') ? 'write' : 'check', changed }));
}
if (require.main === module) main();
module.exports = { migrate };
