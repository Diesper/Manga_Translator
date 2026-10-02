'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadModel,
} = require('../../docs/biblia/.coordination/audit-protocol');
const lifecycleCore = require('../../docs/biblia/.coordination/lifecycle-core');
const humanGate = require('../../docs/biblia/.coordination/human-gate');

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

function coordinationField(source, field) {
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    const prefix = field + ':';
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim().replace(/^"|"$/g, '');
  }
  return null;
}

function isExpiredClaimSource(source, nowMs = Date.now()) {
  const expiresAt = coordinationField(source, 'LEASE_EXPIRES_AT_UTC');
  if (!expiresAt) return false; // claim legado: conservadoramente continua bloqueando.
  const leaseMs = Date.parse(expiresAt);
  if (!Number.isFinite(leaseMs)) return false; // inválido é problema de coordenação, não autorização para takeover.
  return leaseMs <= nowMs;
}

function classifyAuditClaims(root, auditClaims = [], nowMs = Date.now()) {
  const active = [];
  const recoverable = [];
  for (const claimPath of auditClaims) {
    const index = claimIndex(claimPath);
    let source = '';
    try { source = fs.readFileSync(path.join(root, claimPath), 'utf8'); }
    catch (_) {
      // Se desapareceu entre READ e planejamento, ele não deve bloquear a fila local.
      continue;
    }
    if (isExpiredClaimSource(source, nowMs)) recoverable.push({ path: claimPath, index });
    else active.push(claimPath);
  }
  return { active, recoverable };
}

function nextPhaseForPipeline(pipeline) {
  if (pipeline?.next_phase) return pipeline.next_phase;
  if (!pipeline?.primary) return 'PRIMARY';
  if (!pipeline.adversarial) return 'ADVERSARIAL';
  if (pipeline.divergent && !pipeline.reaudit) return 'REAUDIT';
  return null;
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
  recoverableClaimIndexes = [],
  humanApprovals = [],
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
  const recoverable = new Set((recoverableClaimIndexes || []).filter(Number.isInteger));

  const candidates = [];
  for (const state of states || []) {
    if (claimed.has(state.index)) continue;
    const lifecycle = lifecycleCore.lifecycleSnapshot(state);
    const humanAuditApproval = lifecycle.human_locked
      ? humanGate.activeHumanApproval(state, lifecycle, humanApprovals, 'ALLOW_AUDIT_ONLY')
      : null;
    if (lifecycle.human_locked && !humanAuditApproval) continue;
    const pipeline = pipelines instanceof Map ? pipelines.get(state.index) : null;
    const nextPhase = nextPhaseForPipeline(pipeline);
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
      bible_sha: pipeline?.bible_sha || null,
      lease_recovery_required: recoverable.has(state.index),
      correction_cycle: lifecycle.correction_cycle,
      escalation_level: lifecycle.escalation_level,
      priority_score: lifecycle.priority_score,
      revision_id: lifecycle.revision_id,
      audit_epoch: lifecycle.audit_epoch,
      handoff_id: lifecycle.handoff_id,
      human_audit_approval_id: humanAuditApproval?.approval_id || null,
    });
  }

  candidates.sort((a, b) => (
    b.priority_score - a.priority_score
    || a.steal_distance - b.steal_distance
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

function listCoordinationClaimsAndLeases(root) {
  const roots = [
    path.join(root, 'docs', 'biblia', '.coordination', 'audit-claims'),
    path.join(root, 'docs', 'biblia', '.coordination', 'audit-leases'),
  ];
  const found = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.lock\.md$/i.test(entry.name)) {
        found.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  };
  for (const dir of roots) visit(dir);
  return found.sort();
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
  const model = loadModel();
  if (model.problems.length) {
    throw new Error('coordenação inválida: ' + model.problems.join('; '));
  }

  const pipelines = new Map(model.pipelines.map((pipeline) => [pipeline.index, pipeline]));
  const claimPaths = listCoordinationClaimsAndLeases(root);
  const claimSets = classifyAuditClaims(root, claimPaths);

  const plan = planAuditWork({
    states: model.states,
    pipelines,
    auditClaims: claimSets.active,
    recoverableClaimIndexes: claimSets.recoverable.map((claim) => claim.index),
    humanApprovals: model.human_approvals || [],
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
      (item.lease_recovery_required ? 'RECOVER ' : (item.preferred ? 'LOCAL ' : 'STEAL '))
      + '#' + item.index_label
      + ' shard=' + item.shard
      + ' phase=' + item.phase
      + ' status=' + item.status
      + ' source_sha=' + item.source_sha
      + ' bible_sha=' + (item.bible_sha || '-')
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
  coordinationField,
  isExpiredClaimSource,
  classifyAuditClaims,
  listCoordinationClaimsAndLeases,
  nextPhaseForPipeline,
  allowedForPhase,
  planAuditWork,
};
