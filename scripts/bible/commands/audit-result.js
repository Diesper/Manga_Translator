'use strict';

const fs = require('fs');
const path = require('path');
const core = require('../core/audit-core');
const lifecycle = require('../core/lifecycle-core');
const human = require('../core/human-gate');
const completedAccess = require('../core/completed-access');
const storage = require('../storage/files');
const protocol = require('./audit-protocol');
const findingStore = require('../storage/unverified-findings');
const findingEvents = require('../storage/unverified-finding-events');

const repoRoot = path.resolve(__dirname, '../../..');

function slug(value) {
  return String(value || 'auditor').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'auditor';
}

function compactUtc(value) {
  return String(value).replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function activeLeaseFor(state, phase, auditor, completedAtUtc) {
  const indexLabel = String(state.index).padStart(3, '0');
  const phaseLower = String(phase).toLowerCase();
  const candidates = [
    path.join(repoRoot, 'docs', 'biblia', '.coordination', 'audit-leases', phaseLower, indexLabel + '.lock.md'),
  ];
  if (phase === 'PRIMARY') {
    candidates.push(path.join(repoRoot, 'docs', 'biblia', '.coordination', 'audit-claims', indexLabel + '.lock.md'));
  }

  for (const absolute of candidates) {
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    const declaredAuditor = protocol.parseClaimField(source, 'AUDITOR');
    const declaredPhase = String(protocol.parseClaimField(source, 'PHASE') || (absolute.includes('audit-claims') ? 'PRIMARY' : '')).toUpperCase();
    const sourceSha = protocol.parseClaimField(source, 'SOURCE_SHA');
    const bibleSha = protocol.parseClaimField(source, 'BIBLE_SHA');
    const leaseState = protocol.parseClaimField(source, 'ESTADO');
    const expires = protocol.parseClaimField(source, 'LEASE_EXPIRES_AT_UTC');

    if (declaredAuditor !== auditor) continue;
    if (declaredPhase !== phase) continue;
    if (sourceSha !== state.source_sha) continue;
    if (bibleSha && bibleSha !== core.currentBibleSha(repoRoot, state)) continue;
    if (leaseState && leaseState !== 'ACTIVE') continue;
    if (expires) {
      const expiryMs = Date.parse(expires);
      const completedMs = Date.parse(completedAtUtc);
      if (!Number.isFinite(expiryMs) || !Number.isFinite(completedMs) || expiryMs <= completedMs) continue;
    }
    return path.relative(repoRoot, absolute).replace(/\\/g, '/');
  }
  return null;
}

function buildAuditResult(state, pipeline, input, approvals = []) {
  const phase = String(input?.phase || '').toUpperCase();
  const verdict = String(input?.verdict || '').toUpperCase();
  const auditor = String(input?.auditor || '').trim();
  const completedAtUtc = String(input?.completed_at_utc || '');
  if (!core.AUDIT_PHASES.has(phase)) throw new Error('PHASE_INVALID');
  if (!core.AUDIT_VERDICTS.has(verdict)) throw new Error('VERDICT_INVALID');
  if (!auditor) throw new Error('AUDITOR_REQUIRED');
  if (!Number.isFinite(Date.parse(completedAtUtc))) throw new Error('COMPLETED_AT_INVALID');
  const completedOrder = completedAccess.requireOrder(state, approvals, completedAtUtc);
  if (completedOrder && completedOrder.approved_by === auditor) throw new Error('COMPLETED_ORDER_APPROVER_CANNOT_SELF_AUDIT');
  if (pipeline?.next_phase !== phase) {
    throw new Error('PHASE_NOT_CURRENT:expected=' + (pipeline?.next_phase || '-') + ',got=' + phase);
  }

  const bibleSha = core.currentBibleSha(repoRoot, state) || state.bible_sha || null;
  const snapshot = lifecycle.lifecycleSnapshot(state, { bible_sha: bibleSha });
  let humanApproval = null;
  if (snapshot.human_locked) {
    humanApproval = human.activeHumanApproval(state, snapshot, approvals, 'ALLOW_AUDIT_ONLY');
    if (!humanApproval) throw new Error('HUMAN_AUDIT_APPROVAL_REQUIRED');
    if (Date.parse(humanApproval.approved_at_utc) > Date.parse(completedAtUtc)) {
      throw new Error('HUMAN_AUDIT_APPROVAL_AFTER_RESULT');
    }
  }

  const findings = Array.isArray(input?.findings) ? input.findings : [];
  const common = {
    index: state.index,
    phase,
    auditor,
    file: state.file,
    bible: state.bible,
    source_sha: state.source_sha,
    bible_sha: bibleSha,
    verdict,
    findings,
    completed_at_utc: completedAtUtc,
    completed_order_id: completedOrder?.approval_id || null,
  };

  if (snapshot.audit_epoch >= 1 && snapshot.handoff_id) {
    return {
      schema_version: 3,
      ...common,
      production_sha: snapshot.production_sha,
      test_sha: snapshot.test_sha,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
      revision_id: snapshot.revision_id,
      human_approval_id: humanApproval?.approval_id || null,
    };
  }

  return {
    schema_version: 2,
    ...common,
  };
}

function confirmActionForPhase(phase) {
  const normalized = String(phase || '').toUpperCase();
  if (normalized === 'PRIMARY') return 'PRIMARY_CONFIRM';
  if (normalized === 'ADVERSARIAL') return 'ADVERSARIAL_CONFIRM';
  if (normalized === 'REAUDIT') return 'REAUDIT_CONFIRM';
  throw new Error('FINDING_CONFIRM_PHASE_INVALID:' + normalized);
}

function publishFindingEvents(root, resultPath, result, input) {
  const confirms = Array.isArray(input?.confirm_findings) ? input.confirm_findings : [];
  const rejects = Array.isArray(input?.reject_findings) ? input.reject_findings : [];
  if (!confirms.length && !rejects.length) return [];

  const loaded = findingStore.loadUnverifiedFindings(root);
  if (loaded.problems.length) throw new Error('FINDING_STORE_INVALID:' + loaded.problems.join(';'));
  const byId = new Map(loaded.findings.map((finding) => [finding.id, finding]));
  const created = [];

  for (const [id, action] of [
    ...confirms.map((id) => [id, confirmActionForPhase(result.phase)]),
    ...rejects.map((id) => [id, 'REJECT']),
  ]) {
    const finding = byId.get(id);
    if (!finding) throw new Error('FINDING_NOT_FOUND:' + id);
    const event = findingEvents.buildEvent(root, finding, {
      action,
      actor: result.auditor,
      auditor: result.auditor,
      at_utc: result.completed_at_utc,
      audit_result_path: resultPath,
      reason: 'Audit result ' + result.phase + ' recorded ' + action + ' for ' + id,
    }, loaded.findings);
    const absolute = path.join(
      root,
      'docs',
      'biblia',
      '.coordination',
      'unverified-finding-events',
      String(finding.index).padStart(3, '0'),
      finding.id,
      event.event_id + '.json'
    );
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    storage.atomicWrite(absolute, JSON.stringify(event, null, 2) + '\n', { createOnly: true });
    created.push(path.relative(root, absolute).replace(/\\/g, '/'));
  }
  return created;
}

function parseArgs(argv) {
  const args = { findings: [], confirm_findings: [], reject_findings: [] };
  for (let i=0;i<argv.length;i+=1) {
    const arg = argv[i];
    if (arg === '--index') args.index = Number(argv[++i]);
    else if (arg === '--phase') args.phase = String(argv[++i] || '').toUpperCase();
    else if (arg === '--auditor') args.auditor = String(argv[++i] || '');
    else if (arg === '--verdict') args.verdict = String(argv[++i] || '').toUpperCase();
    else if (arg === '--at') args.completed_at_utc = String(argv[++i] || '');
    else if (arg === '--finding') args.findings.push(String(argv[++i] || ''));
    else if (arg === '--findings-json') args.findings_json = String(argv[++i] || '');
    else if (arg === '--confirm-finding') args.confirm_findings.push(String(argv[++i] || ''));
    else if (arg === '--reject-finding') args.reject_findings.push(String(argv[++i] || ''));
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function main(argv = process.argv.slice(2), locked = false) {
  const args = parseArgs(argv);
  if (!Number.isInteger(args.index)) throw new Error('--index obrigatório');
  if (!locked) return storage.withUnitLock(repoRoot, args.index, () => main(argv, true));
  if (args.findings_json) {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(args.findings_json), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('--findings-json deve conter array');
    args.findings.push(...parsed);
  }
  for (const id of [...args.confirm_findings, ...args.reject_findings]) {
    if (!id) throw new Error('finding id vazio');
    if (!args.findings.some((item) => String(item).includes(id))) {
      args.findings.push('FINDING_ID:' + id);
    }
  }

  const model = protocol.loadModel();
  const state = model.states.find((item) => item.index === args.index);
  const pipeline = model.pipelines.find((item) => item.index === args.index);
  if (!state || !pipeline) throw new Error('INDEX_NOT_FOUND');
  completedAccess.requireOrder(state, model.human_approvals || []);

  const lease = activeLeaseFor(state, args.phase, args.auditor, args.completed_at_utc);
  if (!lease) throw new Error('ACTIVE_MATCHING_AUDIT_LEASE_REQUIRED');

  const result = buildAuditResult(state, pipeline, args, model.human_approvals || []);
  const phaseDir = args.phase.toLowerCase();
  const filename = compactUtc(args.completed_at_utc) + '-' + slug(args.auditor) + '-v' + result.schema_version + '.json';
  const absolute = path.join(
    repoRoot, 'docs', 'biblia', '.coordination', 'audit-results',
    String(args.index).padStart(3, '0'), phaseDir, filename
  );
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const resultRel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
  const created = [];
  try {
    storage.atomicWrite(absolute, JSON.stringify(result, null, 2) + '\n', { createOnly: true });
    created.push(absolute);
    const findingEventPaths = publishFindingEvents(repoRoot, resultRel, result, args);
    for (const rel of findingEventPaths) created.push(path.join(repoRoot, rel));
    console.log(resultRel);
    for (const rel of findingEventPaths) console.log(rel);
  } catch (error) {
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); } catch (_) {}
    }
    throw error;
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Audit result publish: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  slug,
  compactUtc,
  activeLeaseFor,
  buildAuditResult,
  confirmActionForPhase,
  publishFindingEvents,
};
