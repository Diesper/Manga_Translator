'use strict';

const path = require('path');
const lifecycleCore = require('./lifecycle-core');
const {
  loadModel,
} = require('./audit-protocol');
const {
  shardForIndex,
  shardOrderForAuditor,
} = require('../../../scripts/validation/bible-audit-work-plan');

const DEFAULT_EDITOR_COUNT = 80;

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(name + ' deve ser inteiro >= 1');
  return parsed;
}

function correctionRecord(pipeline) {
  if (pipeline?.decision !== 'CHANGES_REQUIRED') return null;
  if (pipeline.reaudit?.verdict === 'CHANGES_REQUIRED') return pipeline.reaudit;
  if (pipeline.adversarial?.verdict === 'CHANGES_REQUIRED') return pipeline.adversarial;
  if (pipeline.primary?.verdict === 'CHANGES_REQUIRED') return pipeline.primary;
  return null;
}

function planCorrections(model, editorOrdinal, editorCount = DEFAULT_EDITOR_COUNT) {
  const count = positiveInt(editorCount, 'editorCount');
  const order = shardOrderForAuditor(editorOrdinal, count);
  const rank = new Map(order.map((shard, i) => [shard, i]));
  const busyIndexes = new Set(
    (model.active_claims_and_leases || [])
      .map((rel) => Number(/(?:^|\/)(\d{3})\.lock\.md$/i.exec(rel)?.[1]))
      .filter(Number.isInteger)
  );
  const reservedFiles = new Set(model.reservations || []);

  const candidates = [];
  for (const pipeline of model.pipelines || []) {
    if (pipeline.decision !== 'CHANGES_REQUIRED') continue;
    if (Array.isArray(pipeline.problems) && pipeline.problems.length) continue;
    if (busyIndexes.has(pipeline.index)) continue;

    const state = (model.states || []).find((item) => item.index === pipeline.index);
    if (!state || state.status === 'IN_PROGRESS') continue;
    const reservationPath = 'docs/biblia/.reservas/' + String(state.file || '').replace(/\\/g, '/') + '.lock.md';
    if (reservedFiles.has(reservationPath)) continue;
    const lifecycle = lifecycleCore.lifecycleSnapshot(state);
    if (lifecycle.human_locked) continue;
    const actor = 'AGENTE ' + positiveInt(editorOrdinal, 'editorOrdinal');
    const eligibility = lifecycleCore.correctorEligibility(state, actor);
    if (!eligibility.eligible) continue;
    const record = correctionRecord(pipeline);
    const shard = shardForIndex(pipeline.index, count);
    candidates.push({
      index: pipeline.index,
      index_label: String(pipeline.index).padStart(3, '0'),
      shard,
      preferred: rank.get(shard) === 0,
      steal_distance: rank.get(shard),
      file: state.file,
      bible: state.bible,
      source_sha: state.source_sha,
      bible_sha: pipeline.bible_sha || null,
      state_status: state.status,
      final_verdict_source: record?.phase || null,
      final_auditor: record?.auditor || null,
      findings: Array.isArray(record?.findings) ? record.findings : [],
      correction_cycle: lifecycle.correction_cycle,
      escalation_level: lifecycle.escalation_level,
      priority_score: lifecycle.priority_score,
      revision_id: lifecycle.revision_id,
      audit_epoch: lifecycle.audit_epoch,
      handoff_id: lifecycle.handoff_id,
      correction_token_required: true,
      reservation_path: reservationPath,
      strategy_review_required: lifecycleCore.strategyReviewDue(state),
      root_cause_review_required: lifecycle.correction_cycle === 6,
    });
  }

  candidates.sort((a,b) => (
    b.priority_score - a.priority_score
    || a.steal_distance - b.steal_distance
    || a.index - b.index
  ));
  return {
    editor: positiveInt(editorOrdinal, 'editorOrdinal'),
    shard_count: count,
    preferred_shard: order[0],
    candidates,
  };
}

function parseArgs(argv) {
  const args = { editor: null, editors: DEFAULT_EDITOR_COUNT, limit: 25, json: false };
  for (let i=0; i<argv.length; i+=1) {
    const arg = argv[i];
    if (arg === '--editor') args.editor = positiveInt(argv[++i], '--editor');
    else if (arg === '--editors' || arg === '--shards') args.editors = positiveInt(argv[++i], arg);
    else if (arg === '--limit') args.limit = positiveInt(argv[++i], '--limit');
    else if (arg === '--json') args.json = true;
    else throw new Error('argumento desconhecido: ' + arg);
  }
  if (!args.editor) throw new Error('uso: --editor N [--editors 80] [--limit 25] [--json]');
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const model = loadModel();
  if (model.problems.length) throw new Error('coordenação operacional inválida: ' + model.problems.join('; '));
  const plan = planCorrections(model, args.editor, args.editors);
  const output = { ...plan, candidates: plan.candidates.slice(0, args.limit) };
  if (args.json) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }
  console.log('Bible correction work plan');
  console.log('editor=' + plan.editor + ' preferred_shard=' + plan.preferred_shard + ' candidates=' + plan.candidates.length);
  for (const item of output.candidates) {
    console.log(
      (item.preferred ? 'LOCAL ' : 'STEAL ')
      + '#' + item.index_label
      + ' shard=' + item.shard
      + ' escalation=' + item.escalation_level
      + ' cycle=' + item.correction_cycle
      + ' source_sha=' + item.source_sha
      + ' bible_sha=' + (item.bible_sha || '-')
      + ' findings=' + item.findings.length
      + ' file=' + item.file
    );
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Bible correction work plan: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_EDITOR_COUNT,
  correctionRecord,
  planCorrections,
};
