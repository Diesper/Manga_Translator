'use strict';

const path = require('path');
const {
  validateBibleCoordination,
} = require('./bible-coordination');
const {
  evaluateAuditPipelines,
  nextAuditPhase,
} = require('./bible-audit-pipeline');

const DEFAULT_AUDITOR_COUNT = 80;
const AUDIT_PHASES = new Set(['AUTO', 'PRIMARY', 'ADVERSARIAL', 'REAUDIT']);

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(name + ' deve ser inteiro >= 1');
  return parsed;
}

function shardForIndex(index, shardCount = DEFAULT_AUDITOR_COUNT) {
  const normalizedIndex = positiveInt(index, 'index');
  const normalizedCount = positiveInt(shardCount, 'shardCount');
  return ((normalizedIndex - 1) % normalizedCount) + 1;
}

function shardOrderForAuditor(auditorOrdinal, shardCount = DEFAULT_AUDITOR_COUNT) {
  const count = positiveInt(shardCount, 'shardCount');
  const auditor = positiveInt(auditorOrdinal, 'auditorOrdinal');
  const preferred = ((auditor - 1) % count) + 1;
  return Array.from({ length: count }, (_, offset) => ((preferred - 1 + offset) % count) + 1);
}

function claimIndex(claimPath) {
  const match = /(?:^|\/)(\d{3})\.lock\.md$/i.exec(String(claimPath || '').replace(/\\/g, '/'));
  return match ? Number(match[1]) : null;
}

function allowedForPhase(state, phase) {
  if (phase === 'PRIMARY') return state.status === 'READY_FOR_AUDIT';
  if (phase === 'ADVERSARIAL' || phase === 'REAUDIT') {
    return state.status === 'READY_FOR_AUDIT' || state.status === 'COMPLETED';
  }
  return false;
}

function planAuditWork({
  states,
  pipelines,
  auditClaims = [],
  auditorOrdinal,
  shardCount = DEFAULT_AUDITOR_COUNT,
  phase = 'AUTO',
}) {
  const normalizedPhase = String(phase || 'AUTO').toUpperCase();
  if (!AUDIT_PHASES.has(normalizedPhase)) throw new Error('phase inválida: ' + phase);
  const count = positiveInt(shardCount, 'shardCount');
  const shardOrder = shardOrderForAuditor(auditorOrdinal, count);
  const shardRank = new Map(shardOrder.map((shard, rank) => [shard, rank]));
  const claimed = new Set(auditClaims.map(claimIndex).filter(Number.isInteger));

  const candidates = [];
  for (const state of states || []) {
    if (claimed.has(state.index)) continue;
    const pipeline = pipelines instanceof Map ? pipelines.get(state.index) : null;
    const nextPhase = nextAuditPhase(pipeline);
    if (!nextPhase) continue;
    if (normalizedPhase !== 'AUTO' && nextPhase !== normalizedPhase) continue;
    if (!allowedForPhase(state, nextPhase)) continue;

    const shard = shardForIndex(state.index, count);
    candidates.push({
      index: state.index,
      index_label: String(state.index).padStart(3, '0'),
      shard,
      preferred: shardRank.get(shard) === 0,
      steal_distance: shardRank.get(shard),
      phase: nextPhase,
      status: state.status,
      file: state.file,
      bible: state.bible,
      source_sha: state.source_sha,
    });
  }

  candidates.sort((a, b) => (
    a.steal_distance - b.steal_distance
    || a.index - b.index
  ));

  return {
    auditor: positiveInt(auditorOrdinal, 'auditorOrdinal'),
    shard_count: count,
    preferred_shard: shardOrder[0],
    shard_order: shardOrder,
    phase: normalizedPhase,
    candidates,
  };
}

function parseArgs(argv) {
  const args = { auditor: null, auditors: DEFAULT_AUDITOR_COUNT, phase: 'AUTO', json: false, limit: 25 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--auditor') args.auditor = positiveInt(argv[++i], '--auditor');
    else if (arg === '--auditors' || arg === '--shards') args.auditors = positiveInt(argv[++i], arg);
    else if (arg === '--phase') args.phase = String(argv[++i] || '').toUpperCase();
    else if (arg === '--limit') args.limit = positiveInt(argv[++i], '--limit');
    else if (arg === '--json') args.json = true;
    else throw new Error('argumento desconhecido: ' + arg);
  }
  if (!args.auditor) throw new Error('uso: --auditor N [--auditors 80] [--phase AUTO|PRIMARY|ADVERSARIAL|REAUDIT] [--limit 25] [--json]');
  if (!AUDIT_PHASES.has(args.phase)) throw new Error('--phase inválida: ' + args.phase);
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.resolve(__dirname, '../..');
  const validation = validateBibleCoordination(root, {
    checkDerived: false,
    enforceSingleAuditClaimPerAuditor: false,
    headLabel: 'distributed-work-plan',
  });
  const evaluation = evaluateAuditPipelines(
    validation.states,
    validation.auditResults || [],
    validation.audits
  );
  const plan = planAuditWork({
    states: validation.states,
    pipelines: evaluation.byIndex,
    auditClaims: validation.auditClaims,
    auditorOrdinal: args.auditor,
    shardCount: args.auditors,
    phase: args.phase,
  });
  const output = { ...plan, candidates: plan.candidates.slice(0, args.limit) };

  if (args.json) {
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  console.log('Bible audit work plan');
  console.log('auditor=' + plan.auditor + ' shards=' + plan.shard_count + ' preferred_shard=' + plan.preferred_shard + ' phase=' + plan.phase);
  console.log('candidates=' + plan.candidates.length + ' showing=' + output.candidates.length);
  for (const item of output.candidates) {
    console.log(
      (item.preferred ? 'LOCAL ' : 'STEAL ')
      + '#' + item.index_label
      + ' shard=' + item.shard
      + ' phase=' + item.phase
      + ' status=' + item.status
      + ' file=' + item.file
    );
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Bible audit work plan: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_AUDITOR_COUNT,
  shardForIndex,
  shardOrderForAuditor,
  claimIndex,
  allowedForPhase,
  planAuditWork,
};
