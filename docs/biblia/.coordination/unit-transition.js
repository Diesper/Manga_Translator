'use strict';

const fs = require('fs');
const path = require('path');
const life = require('./lifecycle-core');
const human = require('./human-gate');
const auditCore = require('./audit-core');
const humanReview = require('./human-review');


function correctionReservationRelativePath(state) {
  return 'docs/biblia/.reservas/' + String(state?.file || '').replace(/\\/g, '/') + '.lock.md';
}

function reservationField(source, field) {
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    if (line.startsWith(field + ':')) return line.slice(field.length + 1).trim();
  }
  return null;
}

function activeCorrectionReservations(root) {
  const base = path.join(root, 'docs', 'biblia', '.reservas');
  return walk(base)
    .filter((absolute) => /\.lock\.md$/i.test(absolute))
    .map((absolute) => {
      const source = fs.readFileSync(absolute, 'utf8');
      return {
        path: path.relative(root, absolute).replace(/\\/g, '/'),
        agent: reservationField(source, 'AGENTE'),
        file: reservationField(source, 'ARQUIVO'),
        bible: reservationField(source, 'BIBLIA'),
        source_sha: reservationField(source, 'SHA_DO_FONTE_AO_RESERVAR'),
        state: reservationField(source, 'ESTADO'),
      };
    })
    .filter((item) => !item.state || item.state === 'ACTIVE');
}

function assertCorrectionReservation(root, state, actor) {
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) throw new Error('CORRECTION_RESERVATION_REQUIRED');
  const source = fs.readFileSync(absolute, 'utf8');
  const owner = reservationField(source, 'AGENTE');
  const file = reservationField(source, 'ARQUIVO');
  const bible = reservationField(source, 'BIBLIA');
  if (owner !== actor) throw new Error('CORRECTION_RESERVATION_OWNER_MISMATCH');
  if (file && file !== state.file) throw new Error('CORRECTION_RESERVATION_FILE_MISMATCH');
  if (bible && bible !== state.bible) throw new Error('CORRECTION_RESERVATION_BIBLE_MISMATCH');
  return rel;
}

function createCorrectionReservation(root, state, actor, atUtc, token) {
  if (!actor) throw new Error('ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(atUtc || ''))) throw new Error('RESERVATION_AT_REQUIRED');
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  const active = activeCorrectionReservations(root);
  if (active.some((item) => item.path === rel) || fs.existsSync(absolute)) {
    throw new Error('UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED');
  }
  const owned = active.find((item) => item.agent === actor);
  if (owned) throw new Error('CORRECTOR_ALREADY_RESERVED:' + owned.path);

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const content = [
    'AGENTE: ' + actor,
    'ARQUIVO: ' + state.file,
    'BIBLIA: ' + state.bible,
    'SHA_DO_FONTE_AO_RESERVAR: ' + state.source_sha,
    'RESERVADO_EM_UTC: ' + atUtc,
    'ATUALIZADO_EM_UTC: ' + atUtc,
    'PR: #66',
    'BRANCH: docs/project-bible',
    'ESTADO: ACTIVE',
    'CORRECTION_TOKEN_ID: ' + (token?.token_id || '-'),
    'REVISION_ID: ' + (token?.revision_id || '-'),
    'CORRECTION_CYCLE: ' + (token?.correction_cycle ?? '-'),
    '',
  ].join('\n');
  fs.writeFileSync(absolute, content, { flag: 'wx' });
  return rel;
}

function releaseCorrectionReservation(root, state, actor, options = {}) {
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) {
    if (options.optional) return null;
    throw new Error('CORRECTION_RESERVATION_REQUIRED');
  }
  assertCorrectionReservation(root, state, actor);
  fs.unlinkSync(absolute);
  return rel;
}

function ownershipIndex(rel) {
  const match = /(?:^|\/)(\d{3})\.lock\.md$/i.exec(String(rel || '').replace(/\\/g, '/'));
  return match ? Number(match[1]) : null;
}

function finalDecisionRecord(pipeline) {
  if (!pipeline) return null;
  if (pipeline.reaudit) return pipeline.reaudit;
  if (pipeline.adversarial) return pipeline.adversarial;
  return pipeline.primary || null;
}

function auditRecordIdentity(record) {
  if (!record) return null;
  return {
    path: record.path || null,
    phase: record.phase || null,
    auditor: record.auditor || null,
    completed_at_utc: record.completed_at_utc || null,
    verdict: record.verdict || null,
    source_sha: record.source_sha || null,
    bible_sha: record.bible_sha || null,
    revision_id: record.revision_id || null,
    audit_epoch: record.audit_epoch ?? null,
    handoff_id: record.handoff_id || null,
  };
}

function decisionIdForPipeline(pipeline) {
  return life.sha256(life.stableJson({
    index: pipeline?.index ?? null,
    decision: pipeline?.decision || null,
    primary: auditRecordIdentity(pipeline?.primary),
    adversarial: auditRecordIdentity(pipeline?.adversarial),
    reaudit: auditRecordIdentity(pipeline?.reaudit),
  }));
}

function latestAuditEvidenceMs(pipeline) {
  const values = [pipeline?.primary, pipeline?.adversarial, pipeline?.reaudit]
    .map((record) => Date.parse(record?.completed_at_utc || ''))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function expectedCorrectionTokenId(token) {
  const seed = JSON.stringify({
    index: Number(token?.index),
    cycle: Number(token?.correction_cycle),
    revision_id: token?.revision_id || null,
    handoff_id: token?.handoff_id || null,
    audit_epoch: Number(token?.audit_epoch),
    decision_id: token?.decision_id || null,
    human_approval_id: token?.human_approval_id || null,
    actor: token?.actor || '',
    issued_at_utc: token?.issued_at_utc || '',
  });
  return 'corr-' + String(Number(token?.index)).padStart(3, '0')
    + '-' + life.sha256(seed).slice(0, 20);
}

function tokenConsumed(state, tokenId) {
  return (Array.isArray(state?.history) ? state.history : []).some((entry) => (
    entry?.type === 'CORRECTION_TOKEN_CONSUMED'
    && entry?.correction_token_id === tokenId
  ));
}

function issueCorrectionToken(state, pipeline, options = {}) {
  const snapshot = life.lifecycleSnapshot(state, options.revision || {});
  const tokenActor = String(options.actor || '').trim();
  if (!tokenActor) throw new Error('TOKEN_ACTOR_REQUIRED');
  if (pipeline?.decision !== 'CHANGES_REQUIRED') throw new Error('TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED');
  if (Array.isArray(pipeline?.problems) && pipeline.problems.length) throw new Error('TOKEN_REJECTS_INVALID_PIPELINE');
  if (pipeline?.source_sha && pipeline.source_sha !== state.source_sha) throw new Error('TOKEN_PIPELINE_SOURCE_STALE');
  if (pipeline?.bible_sha && snapshot.bible_sha && pipeline.bible_sha !== snapshot.bible_sha) {
    throw new Error('TOKEN_PIPELINE_BIBLE_STALE');
  }

  const requiredStatus = snapshot.human_locked ? 'HUMAN_LOCKED' : 'CHANGES_REQUIRED';
  if (state?.status !== requiredStatus) throw new Error('TOKEN_STATE_INVALID:' + state?.status);

  let humanApprovalId = null;
  let humanApproval = null;
  if (snapshot.human_locked) {
    humanApproval = options.humanApproval;
    if (!human.approvalMatches(state, snapshot, humanApproval, 'ALLOW_ONE_CORRECTION')) {
      throw new Error('HUMAN_APPROVAL_REQUIRED');
    }
    humanApprovalId = humanApproval.approval_id;
  }

  const issuedAt = options.issued_at_utc;
  const issuedMs = Date.parse(issuedAt || '');
  if (!Number.isFinite(issuedMs)) throw new Error('TOKEN_ISSUED_AT_REQUIRED');
  const auditEvidenceMs = latestAuditEvidenceMs(pipeline);
  if (Number.isFinite(auditEvidenceMs) && issuedMs < auditEvidenceMs) {
    throw new Error('TOKEN_ISSUED_BEFORE_FINAL_DECISION');
  }
  if (humanApproval && issuedMs < Date.parse(humanApproval.approved_at_utc || '')) {
    throw new Error('TOKEN_ISSUED_BEFORE_HUMAN_APPROVAL');
  }
  const decisionId = decisionIdForPipeline({ ...pipeline, index: state.index });
  const token = {
    schema_version: 1,
    token_id: null,
    index: state.index,
    authorization_type: 'CORRECTION',
    decision: 'CHANGES_REQUIRED',
    correction_cycle: snapshot.current_escalation_cycle,
    audit_epoch: snapshot.audit_epoch,
    handoff_id: snapshot.handoff_id,
    production_sha: snapshot.production_sha,
    test_sha: snapshot.test_sha,
    bible_sha: snapshot.bible_sha,
    revision_id: snapshot.revision_id,
    decision_id: decisionId,
    actor: tokenActor,
    issued_at_utc: issuedAt,
    human_approval_id: humanApprovalId,
  };
  token.token_id = expectedCorrectionTokenId(token);
  return token;
}

function validateCorrectionToken(state, token, options = {}) {
  const problems = [];
  const snapshot = life.lifecycleSnapshot(state, options.revision || {});
  if (token?.schema_version !== 1) problems.push('TOKEN_SCHEMA_INVALID');
  if (token?.authorization_type !== 'CORRECTION') problems.push('TOKEN_TYPE_INVALID');
  if (token?.decision !== 'CHANGES_REQUIRED') problems.push('TOKEN_DECISION_INVALID');
  if (Number(token?.index) !== Number(state?.index)) problems.push('TOKEN_INDEX_STALE');
  if (Number(token?.correction_cycle) !== snapshot.current_escalation_cycle) problems.push('TOKEN_CYCLE_STALE');
  if (Number(token?.audit_epoch) !== snapshot.audit_epoch) problems.push('TOKEN_EPOCH_STALE');
  if ((token?.handoff_id || null) !== (snapshot.handoff_id || null)) problems.push('TOKEN_HANDOFF_STALE');
  if ((token?.production_sha || null) !== (snapshot.production_sha || null)) problems.push('TOKEN_PRODUCTION_STALE');
  if (token?.test_sha !== snapshot.test_sha) problems.push('TOKEN_TEST_STALE');
  if (token?.bible_sha !== snapshot.bible_sha) problems.push('TOKEN_BIBLE_STALE');
  if (token?.revision_id !== snapshot.revision_id) problems.push('TOKEN_REVISION_STALE');
  if (typeof token?.token_id !== 'string' || !token.token_id.trim()) {
    problems.push('TOKEN_ID_MISSING');
  } else if (Number.isInteger(Number(token?.index))
    && token.token_id !== expectedCorrectionTokenId(token)) {
    problems.push('TOKEN_ID_NOT_DETERMINISTIC');
  }
  const issuedMs = Date.parse(token?.issued_at_utc || '');
  if (!Number.isFinite(issuedMs)) problems.push('TOKEN_ISSUED_AT_INVALID');
  if (typeof token?.actor !== 'string' || !token.actor.trim()) problems.push('TOKEN_ACTOR_MISSING');
  if (options.actor && String(token?.actor || '').trim() !== String(options.actor).trim()) problems.push('TOKEN_ACTOR_MISMATCH');
  if (options.pipeline) {
    const pipeline = options.pipeline;
    if (pipeline?.decision !== 'CHANGES_REQUIRED') problems.push('TOKEN_DECISION_NO_LONGER_CHANGES_REQUIRED');
    if (Array.isArray(pipeline?.problems) && pipeline.problems.length) problems.push('TOKEN_PIPELINE_NOW_INVALID');
    const currentDecisionId = decisionIdForPipeline({ ...pipeline, index: state.index });
    if (token?.decision_id !== currentDecisionId) problems.push('TOKEN_DECISION_STALE');
    const auditEvidenceMs = latestAuditEvidenceMs(pipeline);
    if (Number.isFinite(issuedMs) && Number.isFinite(auditEvidenceMs) && issuedMs < auditEvidenceMs) {
      problems.push('TOKEN_ISSUED_BEFORE_FINAL_DECISION');
    }
  }
  if (snapshot.human_locked) {
    const approval = options.humanApproval
      || (options.humanApprovals || []).find((item) => item?.approval_id === token?.human_approval_id)
      || null;
    if (!token?.human_approval_id) {
      problems.push('TOKEN_HUMAN_APPROVAL_MISSING');
    } else if (!approval
      || !human.approvalMatches(state, snapshot, approval, 'ALLOW_ONE_CORRECTION')) {
      problems.push('TOKEN_HUMAN_APPROVAL_INVALID');
    } else {
      const approvalMs = Date.parse(approval.approved_at_utc || '');
      if (Number.isFinite(issuedMs) && Number.isFinite(approvalMs) && issuedMs < approvalMs) {
        problems.push('TOKEN_ISSUED_BEFORE_HUMAN_APPROVAL');
      }
    }
  } else if (token?.human_approval_id) {
    problems.push('TOKEN_UNEXPECTED_HUMAN_APPROVAL');
  }
  if (tokenConsumed(state, token?.token_id)) problems.push('TOKEN_ALREADY_CONSUMED');
  return problems;
}

function assertCas(state, snapshot, request, currentStateSha) {
  if (request?.expected_status && request.expected_status !== state.status) throw new Error('REJECTED_STATE_CHANGED:status');
  if (request?.expected_cycle !== undefined
    && Number(request.expected_cycle) !== snapshot.current_escalation_cycle) throw new Error('REJECTED_STATE_CHANGED:cycle');
  if (request?.expected_revision_id && request.expected_revision_id !== snapshot.revision_id) {
    throw new Error('REJECTED_STATE_CHANGED:revision');
  }
  if (request?.expected_state_sha && request.expected_state_sha !== currentStateSha) {
    throw new Error('REJECTED_STATE_CHANGED:state_sha');
  }
}

function requireCasPreconditions(value) {
  const missing = [];
  if (!value || typeof value.expected_status !== 'string' || !value.expected_status.trim()) missing.push('expected_status');
  if (!value || value.expected_cycle === undefined || value.expected_cycle === null || value.expected_cycle === '') missing.push('expected_cycle');
  if (!value || typeof value.expected_revision_id !== 'string' || !value.expected_revision_id.trim()) missing.push('expected_revision_id');
  if (!value || typeof value.expected_state_sha !== 'string' || !value.expected_state_sha.trim()) missing.push('expected_state_sha');
  if (missing.length) throw new Error('CAS_PRECONDITIONS_REQUIRED:' + missing.join(','));
}

function persistSnapshot(next, snapshot) {
  next.correction_cycle = snapshot.correction_cycle;
  next.lifetime_correction_cycles = snapshot.lifetime_correction_cycles;
  next.current_escalation_cycle = snapshot.current_escalation_cycle;
  next.escalation_level = snapshot.escalation_level;
  next.human_approval_required = snapshot.human_approval_required;
  next.audit_epoch = snapshot.audit_epoch;
  next.handoff_id = snapshot.handoff_id;
  next.production_sha = snapshot.production_sha;
  next.test_sha = snapshot.test_sha;
  next.bible_sha = snapshot.bible_sha;
  next.revision_id = snapshot.revision_id;
}

function deterministicProductionSha(root, state) {
  const files = [...new Set(Array.isArray(state?.production_files) ? state.production_files : [])]
    .filter((value) => typeof value === 'string' && value)
    .sort();
  if (!files.length) return life.lifecycleSnapshot(state).production_sha;
  const manifest = files.map((file) => {
    const sha = auditCore.gitWorkingTreeBlobSha(root, file);
    if (!life.validSha(sha)) throw new Error('PRODUCTION_FILE_SHA_UNAVAILABLE:' + file);
    return { file: file.replace(/\\/g, '/'), sha };
  });
  return auditCore.gitBlobShaBuffer(Buffer.from(life.stableJson(manifest)));
}

function workingRevision(root, state) {
  const testSha = auditCore.gitWorkingTreeBlobSha(root, state?.file);
  const bibleSha = auditCore.gitWorkingTreeBlobSha(root, state?.bible);
  if (!life.validSha(testSha)) throw new Error('TEST_SHA_UNAVAILABLE');
  if (!life.validSha(bibleSha)) throw new Error('BIBLE_SHA_UNAVAILABLE');
  return {
    test_sha: testSha,
    bible_sha: bibleSha,
    production_sha: auditCore.currentProductionSha(root, state),
  };
}

function revisionBindingProblems(expected, actual) {
  const problems = [];
  if ((expected?.production_sha || null) !== (actual?.production_sha || null)) problems.push('PRODUCTION');
  if ((expected?.test_sha || null) !== (actual?.test_sha || null)) problems.push('TEST');
  if ((expected?.bible_sha || null) !== (actual?.bible_sha || null)) problems.push('BIBLE');
  if (expected?.revision_id && actual?.revision_id && expected.revision_id !== actual.revision_id) problems.push('REVISION_ID');
  return problems;
}

function currentWorkingIdentity(root, state) {
  const actual = workingRevision(root, state);
  return {
    ...actual,
    revision_id: life.revisionIdentity(state, actual).revision_id,
  };
}

function projectAuditDecision(state, pipeline, options = {}) {
  if (!pipeline || !['APPROVED', 'CHANGES_REQUIRED'].includes(pipeline.decision)) {
    throw new Error('RECONCILE_DECISION_INVALID');
  }
  if (Array.isArray(pipeline.problems) && pipeline.problems.length) {
    throw new Error('RECONCILE_PIPELINE_INVALID:' + pipeline.problems.join(';'));
  }
  const snapshot = life.lifecycleSnapshot(state);
  if (snapshot.human_locked) throw new Error('RECONCILE_HUMAN_LOCKED');
  if (state.status === 'IN_PROGRESS') throw new Error('RECONCILE_IN_PROGRESS');
  if (state.status === 'BLOCKED') throw new Error('RECONCILE_BLOCKED');
  if (state.coordination_status === 'REPAIR_REQUIRED') throw new Error('RECONCILE_REPAIR_REQUIRED');
  if (pipeline.source_sha && pipeline.source_sha !== state.source_sha) throw new Error('RECONCILE_SOURCE_STALE');
  if (pipeline.bible_sha && snapshot.bible_sha && pipeline.bible_sha !== snapshot.bible_sha) {
    throw new Error('RECONCILE_BIBLE_STALE');
  }
  const openRequests = (state.audit_requests || []).filter((request) => request?.status === 'OPEN');
  if (pipeline.decision === 'APPROVED' && openRequests.length) {
    throw new Error('RECONCILE_OPEN_REQUESTS:' + openRequests.length);
  }

  const targetStatus = pipeline.decision === 'APPROVED' ? 'COMPLETED' : 'CHANGES_REQUIRED';
  const at = options.at_utc || state.updated_at_utc || state.completed_at_utc || null;
  const next = JSON.parse(JSON.stringify(state));
  const previous = next.status;
  next.status = targetStatus;
  next.agent = null;
  next.coordination_status = 'OK';
  next.updated_at_utc = at || next.updated_at_utc || null;
  next.completed_at_utc = targetStatus === 'COMPLETED' ? (at || next.completed_at_utc || null) : null;
  next.history = Array.isArray(next.history) ? next.history : [];

  const signature = {
    type: 'DISTRIBUTED_AUDIT_DECISION',
    source_sha: state.source_sha,
    bible_sha: pipeline.bible_sha || null,
    decision: pipeline.decision,
  };
  const alreadyRecorded = next.history.some((entry) => (
    entry?.type === signature.type
    && entry?.source_sha === signature.source_sha
    && (entry?.bible_sha || null) === signature.bible_sha
    && entry?.decision === signature.decision
  ));
  if (!alreadyRecorded) {
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: signature.type,
      from_status: previous,
      to_status: targetStatus,
      source_sha: signature.source_sha,
      bible_sha: signature.bible_sha,
      decision: signature.decision,
      primary: pipeline.primary?.verdict || null,
      adversarial: pipeline.adversarial?.verdict || null,
      reaudit: pipeline.reaudit?.verdict || null,
      revision_id: snapshot.revision_id,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
      reason: targetStatus === 'COMPLETED'
        ? 'PRIMARY + ADVERSARIAL (e REAUDIT quando necessária) produziram decisão final APPROVED para a revisão atual.'
        : 'Pipeline distribuído produziu decisão final CHANGES_REQUIRED para a revisão atual.',
    });
  }

  persistSnapshot(next, snapshot);
  next.progress_note = targetStatus === 'COMPLETED'
    ? 'Decisão distribuída final APPROVED vinculada à revisão atual.'
    : 'Decisão distribuída final CHANGES_REQUIRED; correção exige token canônico.';
  return { state: next, changed: JSON.stringify(next) !== JSON.stringify(state) };
}

function planTransition({ state, pipeline = null, request, token = null, humanApproval = null, currentStateSha = null }) {
  if (!state || !request) throw new Error('STATE_AND_REQUEST_REQUIRED');
  const action = String(request.action || '').toUpperCase();
  const actor = String(request.actor || '').trim();
  const at = request.at_utc;
  if (!actor) throw new Error('ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(at || ''))) throw new Error('AT_UTC_REQUIRED');

  const snapshot = life.lifecycleSnapshot(state);
  assertCas(state, snapshot, request, currentStateSha);
  if (action !== 'SAFE_ABORT') {
    const stateProblems = life.lifecycleProblems(state);
    if (stateProblems.length) throw new Error('STATE_LIFECYCLE_INVALID:' + stateProblems.join(';'));
  }
  const next = JSON.parse(JSON.stringify(state));
  next.history = Array.isArray(next.history) ? next.history : [];

  if (action === 'RECONCILE_DECISION') {
    return projectAuditDecision(state, pipeline, { at_utc: at });
  }

  if (action === 'START_CORRECTION') {
    const expectedStatus = snapshot.human_locked ? 'HUMAN_LOCKED' : 'CHANGES_REQUIRED';
    if (state.status !== expectedStatus) throw new Error('START_CORRECTION_STATUS_INVALID:' + state.status);
    if (!pipeline) throw new Error('START_CORRECTION_PIPELINE_REQUIRED');
    const tokenProblems = validateCorrectionToken(state, token, { actor, pipeline, humanApproval });
    if (tokenProblems.length) throw new Error(tokenProblems.join(';'));

    const eligibility = life.correctorEligibility(state, actor);
    if (!snapshot.human_locked && !eligibility.eligible) throw new Error(eligibility.reason);
    const strategyProblems = life.strategyReviewProblems(state, request.strategy_review);
    if (strategyProblems.length) throw new Error(strategyProblems.join(';'));
    if (snapshot.current_escalation_cycle === 6) {
      const rootCauseProblems = life.rootCauseReviewProblems(state, request.root_cause_review);
      if (rootCauseProblems.length) {
        throw new Error(
          rootCauseProblems.includes('ROOT_CAUSE_REVIEW_INVALID')
            ? 'EMERGENCY_ROOT_CAUSE_REVIEW_REQUIRED'
            : rootCauseProblems.join(';')
        );
      }
    }
    if (snapshot.human_locked) {
      if (!human.approvalMatches(state, snapshot, humanApproval, 'ALLOW_ONE_CORRECTION')) {
        throw new Error('HUMAN_APPROVAL_REQUIRED');
      }
      if (token?.human_approval_id !== humanApproval.approval_id) throw new Error('TOKEN_HUMAN_APPROVAL_MISMATCH');
      life.appendLifecycleEvent(next.history, {
        at_utc: at,
        type: 'HUMAN_APPROVAL_CONSUMED',
        approval_id: humanApproval.approval_id,
        correction_token_id: token.token_id,
        actor,
        source_sha: state.source_sha,
        bible_sha: state.bible_sha,
      });
    }

    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: snapshot.human_locked ? 'HUMAN_AUTHORIZED_CORRECTION_STARTED' : 'EDITOR_CORRECTION_STARTED',
      from_status: state.status,
      to_status: 'IN_PROGRESS',
      agent: actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      correction_cycle: snapshot.current_escalation_cycle,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
      revision_id: snapshot.revision_id,
      correction_token_id: token.token_id,
      approval_id: token.human_approval_id || null,
      root_cause_review: request.root_cause_review || null,
      strategy_review: request.strategy_review || null,
      reservation_path: request.reservation_path || null,
    });
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: 'CORRECTION_TOKEN_CONSUMED',
      correction_token_id: token.token_id,
      actor,
      revision_id: snapshot.revision_id,
    });
    next.status = 'IN_PROGRESS';
    next.agent = actor;
    next.updated_at_utc = at;
    persistSnapshot(next, snapshot);
    return { state: next, consumed_token_id: token.token_id };
  }

  if (action === 'HANDOFF_FOR_AUDIT') {
    if (state.status !== 'IN_PROGRESS') throw new Error('HANDOFF_REQUIRES_IN_PROGRESS');
    if (state.agent && state.agent !== actor) throw new Error('HANDOFF_ACTOR_NOT_OWNER');
    const handoffTestSha = request.test_sha || state.test_sha || state.source_sha;
    const handoffBibleSha = request.bible_sha || state.bible_sha;
    const handoffProductionSha = request.production_sha === undefined
      ? snapshot.production_sha
      : request.production_sha;
    if (!life.validSha(handoffTestSha)) throw new Error('HANDOFF_TEST_SHA_INVALID');
    if (!life.validSha(handoffBibleSha)) throw new Error('HANDOFF_BIBLE_SHA_INVALID');
    if (handoffProductionSha !== null && handoffProductionSha !== undefined
      && !life.validSha(handoffProductionSha)) throw new Error('HANDOFF_PRODUCTION_SHA_INVALID');

    next.source_sha = String(handoffTestSha).toLowerCase();
    next.test_sha = String(handoffTestSha).toLowerCase();
    next.bible_sha = String(handoffBibleSha).toLowerCase();
    next.production_sha = handoffProductionSha ? String(handoffProductionSha).toLowerCase() : null;

    const nextEpoch = snapshot.audit_epoch + 1;
    const handoffId = String(state.index).padStart(3, '0')
      + '-e' + nextEpoch + '-' + life.sha256(life.stableJson({
        index: state.index,
        epoch: nextEpoch,
        at_utc: at,
        test_sha: next.test_sha,
        bible_sha: next.bible_sha,
        production_sha: next.production_sha,
      })).slice(0, 12);
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: life.HANDOFF_EVENT,
      from_status: 'IN_PROGRESS',
      to_status: snapshot.current_escalation_cycle + 1 >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT',
      source_sha: next.source_sha,
      test_sha: next.test_sha,
      bible_sha: next.bible_sha,
      production_sha: next.production_sha,
      agent: actor,
      correction_cycle: snapshot.current_escalation_cycle + 1,
      audit_epoch: nextEpoch,
      handoff_id: handoffId,
      reservation_path: request.reservation_path || null,
      reason: String(request.reason || 'Correção entregue pelo transition engine.'),
    });
    next.status = snapshot.current_escalation_cycle + 1 >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT';
    next.agent = null;
    next.updated_at_utc = at;
    const after = life.lifecycleSnapshot(next, {
      production_sha: next.production_sha,
      test_sha: next.test_sha,
      bible_sha: next.bible_sha,
    });
    persistSnapshot(next, after);
    return { state: next, handoff_id: after.handoff_id, audit_epoch: after.audit_epoch };
  }

  if (action === 'SAFE_ABORT') {
    if (state.status !== 'IN_PROGRESS') throw new Error('SAFE_ABORT_REQUIRES_IN_PROGRESS');
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: life.SAFE_ABORT_EVENT,
      from_status: 'IN_PROGRESS',
      to_status: request.restore_status || 'READY_FOR_AUDIT',
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      reopen_at_utc: request.reopen_at_utc || null,
      correction_token_id: request.correction_token_id || null,
      reservation_path: request.reservation_path || null,
      actor,
      reason: String(request.reason || 'Correção abortada com restauração do binding protegido.'),
    });
    next.status = request.restore_status || 'READY_FOR_AUDIT';
    next.agent = null;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next };
  }

  if (action === 'HUMAN_COMPLETE') {
    if (!snapshot.human_locked || state.status !== 'HUMAN_LOCKED') {
      throw new Error('HUMAN_COMPLETE_REQUIRES_HUMAN_LOCK');
    }
    if (pipeline?.decision !== 'APPROVED' || (pipeline?.problems || []).length) {
      throw new Error('HUMAN_COMPLETE_REQUIRES_FINAL_APPROVED');
    }
    if (!human.approvalMatches(state, snapshot, humanApproval, 'PERMANENTLY_CLOSE')) {
      throw new Error('HUMAN_PERMANENT_CLOSE_APPROVAL_REQUIRED');
    }
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: 'HUMAN_APPROVAL_CONSUMED',
      approval_id: humanApproval.approval_id,
      actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
    });
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: 'HUMAN_PERMANENTLY_CLOSED',
      from_status: 'HUMAN_LOCKED',
      to_status: 'COMPLETED',
      approval_id: humanApproval.approval_id,
      actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      revision_id: snapshot.revision_id,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
      reason: String(request.reason || 'Fechamento humano explícito após decisão distribuída APPROVED.'),
    });
    next.status = 'COMPLETED';
    next.agent = null;
    next.completed_at_utc = at;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next, human_closed: true };
  }

  if (action === 'HUMAN_RESET_ESCALATION') {
    if (!snapshot.human_locked) throw new Error('RESET_REQUIRES_HUMAN_LOCK');
    if (!human.approvalMatches(state, snapshot, humanApproval, 'RESET_ESCALATION')) {
      throw new Error('HUMAN_RESET_APPROVAL_REQUIRED');
    }
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: 'HUMAN_APPROVAL_CONSUMED',
      approval_id: humanApproval.approval_id,
      actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
    });
    life.appendLifecycleEvent(next.history, {
      at_utc: at,
      type: life.HUMAN_RESET_EVENT,
      from_status: 'HUMAN_LOCKED',
      to_status: 'READY_FOR_AUDIT',
      approval_id: humanApproval.approval_id,
      actor,
      lifetime_correction_cycles: snapshot.lifetime_correction_cycles,
      reason: String(request.reason || 'Escalonamento reiniciado por decisão humana explícita.'),
    });
    next.status = 'READY_FOR_AUDIT';
    next.agent = null;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next };
  }

  throw new Error('ACTION_NOT_SUPPORTED:' + action);
}

function tokenConsumptionCount(state, tokenId) {
  return (Array.isArray(state?.history) ? state.history : []).filter((entry) => (
    entry?.type === 'CORRECTION_TOKEN_CONSUMED'
    && entry?.correction_token_id === tokenId
  )).length;
}

function tokenHistoryProblems(states, tokens) {
  const problems = [];
  const tokenById = new Map((tokens || []).map((token) => [token.token_id, token]));

  for (const state of states || []) {
    const history = Array.isArray(state?.history) ? state.history : [];
    for (let position = 0; position < history.length; position += 1) {
      const entry = history[position];
      if (entry?.type !== 'CORRECTION_TOKEN_CONSUMED') continue;
      const tokenId = String(entry?.correction_token_id || '').trim();
      const token = tokenById.get(tokenId);
      const label = '#' + String(state.index).padStart(3, '0') + '/history[' + position + ']';
      if (!token) {
        problems.push(label + ': consumo referencia correction token inexistente: ' + (tokenId || '-'));
        continue;
      }
      if (Number(token.index) !== Number(state.index)) problems.push(label + ': token pertence a outro índice');
      if (String(token.actor || '').trim() !== String(entry.actor || '').trim()) {
        problems.push(label + ': ator do consumo diverge do ator autorizado no token');
      }
      if (String(token.revision_id || '') !== String(entry.revision_id || '')) {
        problems.push(label + ': revision_id do consumo diverge do token');
      }

      const start = history.slice(0, position).reverse().find((candidate) => (
        candidate?.to_status === 'IN_PROGRESS'
        && candidate?.correction_token_id === tokenId
      ));
      if (!start) {
        problems.push(label + ': token consumido sem START_CORRECTION correspondente');
      } else if (String(start.agent || start.actor || '').trim() !== String(token.actor || '').trim()) {
        problems.push(label + ': corretor inicial diverge do ator autorizado no token');
      }

      if (token.human_approval_id) {
        const approvalConsumption = history.slice(0, position).find((candidate) => (
          candidate?.type === 'HUMAN_APPROVAL_CONSUMED'
          && candidate?.approval_id === token.human_approval_id
          && candidate?.correction_token_id === tokenId
        ));
        if (!approvalConsumption) {
          problems.push(label + ': token HUMAN consumido sem HUMAN_APPROVAL_CONSUMED correspondente');
        }
      }
    }
  }
  return problems;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function loadCorrectionTokens(root, states = [], options = {}) {
  const base = path.join(root, 'docs', 'biblia', '.coordination', 'correction-authorizations');
  const stateByIndex = new Map((states || []).map((state) => [state.index, state]));
  const tokens = [];
  const problems = [];
  const ids = new Set();
  const activeByIndex = new Map();

  for (const absolute of walk(base)) {
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push(rel + ': correction authorization deve ser JSON');
      continue;
    }
    let token;
    try { token = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch (error) {
      problems.push(rel + ': JSON inválido: ' + error.message);
      continue;
    }
    tokens.push({ ...token, path: rel });
    const pathMatch = /^docs\/biblia\/\.coordination\/correction-authorizations\/(\d{3})\/([^/]+)\.json$/i.exec(rel);
    if (!pathMatch) {
      problems.push(rel + ': path de correction token inválido');
    } else {
      if (Number(pathMatch[1]) !== Number(token?.index)) problems.push(rel + ': index do token diverge do path');
      if (pathMatch[2] !== String(token?.token_id || '')) problems.push(rel + ': token_id diverge do filename');
    }
    if (ids.has(token?.token_id)) problems.push(rel + ': token_id duplicado');
    if (token?.token_id) ids.add(token.token_id);

    const state = stateByIndex.get(Number(token?.index));
    if (!state) {
      problems.push(rel + ': token fora do corpus');
      continue;
    }
    const consumptionCount = tokenConsumptionCount(state, token?.token_id);
    if (consumptionCount > 1) problems.push(rel + ': token consumido mais de uma vez');
    if (consumptionCount === 0) {
      const pipeline = options.pipelines instanceof Map ? options.pipelines.get(state.index) : null;
      for (const problem of validateCorrectionToken(state, token, {
        pipeline,
        humanApprovals: options.humanApprovals || [],
      })) problems.push(rel + ': ' + problem);
      if (activeByIndex.has(state.index)) {
        problems.push(rel + ': mais de um correction token ativo para o mesmo índice');
      } else {
        activeByIndex.set(state.index, rel);
      }
    }
  }
  problems.push(...tokenHistoryProblems(states, tokens));
  return { tokens, problems, activeByIndex };
}

function tokenPath(root, index, tokenId) {
  return path.join(root, 'docs', 'biblia', '.coordination', 'correction-authorizations',
    String(index).padStart(3, '0'), tokenId + '.json');
}

function loadToken(root, index, tokenId) {
  const absolute = tokenPath(root, index, tokenId);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function parseCli(argv) {
  const command = argv[0] || 'status';
  const args = { command };
  for (let i=1;i<argv.length;i+=1) {
    const arg=argv[i];
    if (arg === '--index') args.index=Number(argv[++i]);
    else if (arg === '--at') args.at_utc=String(argv[++i] || '');
    else if (arg === '--approval-id') args.approval_id=String(argv[++i] || '');
    else if (arg === '--actor') args.actor=String(argv[++i] || '');
    else if (arg === '--expected-status') args.expected_status=String(argv[++i] || '');
    else if (arg === '--expected-state-sha') args.expected_state_sha=String(argv[++i] || '');
    else if (arg === '--expected-revision-id') args.expected_revision_id=String(argv[++i] || '');
    else if (arg === '--expected-cycle') args.expected_cycle=Number(argv[++i]);
    else if (arg === '--request') args.request=String(argv[++i] || '');
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function statePathFor(root, index) {
  return path.join(root, 'docs', 'biblia', '.state', String(index).padStart(3, '0') + '.json');
}

function main(argv=process.argv.slice(2)) {
  const args=parseCli(argv);
  const root=path.resolve(__dirname,'../../..');
  if (!Number.isInteger(args.index) && args.command !== 'apply') throw new Error('--index obrigatório');

  if (args.command === 'status') {
    const state=JSON.parse(fs.readFileSync(statePathFor(root,args.index),'utf8'));
    console.log(JSON.stringify(life.lifecycleSnapshot(state),null,2));
    return;
  }

  const protocol=require('./audit-protocol');
  const model=protocol.loadModel();

  if (args.command === 'issue-token') {
    requireCasPreconditions(args);
    const state=model.states.find((item)=>item.index===args.index);
    const pipeline=model.pipelines.find((item)=>item.index===args.index);
    if (!state || !pipeline) throw new Error('INDEX_NOT_FOUND');
    const stateRaw=fs.readFileSync(statePathFor(root,args.index),'utf8');
    const snapshot=life.lifecycleSnapshot(state);
    assertCas(state,snapshot,args,auditCore.gitBlobShaBuffer(Buffer.from(stateRaw)));
    const working=currentWorkingIdentity(root,state);
    const drift=revisionBindingProblems(snapshot,working);
    if (drift.length) throw new Error('TOKEN_REJECTS_WORKING_REVISION_DRIFT:'+drift.join(','));
    const approval=args.approval_id
      ? (model.human_approvals || []).find((item)=>item.approval_id===args.approval_id)
      : null;
    const reservationRel=correctionReservationRelativePath(state);
    if ((model.reservations || []).includes(reservationRel)) {
      throw new Error('UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED');
    }
    if ((model.active_claims_and_leases || []).some((rel)=>ownershipIndex(rel)===state.index)) {
      throw new Error('CORRECTION_BLOCKED_BY_ACTIVE_AUDIT_LEASE');
    }
    const activeToken=(model.correction_tokens || []).find((item)=>(
      Number(item.index)===Number(state.index) && !tokenConsumed(state,item.token_id)
    ));
    if (activeToken) throw new Error('ACTIVE_CORRECTION_TOKEN_EXISTS:' + activeToken.token_id);
    const token=issueCorrectionToken(state,pipeline,{issued_at_utc:args.at_utc,humanApproval:approval,actor:args.actor});
    const out=tokenPath(root,state.index,token.token_id);
    fs.mkdirSync(path.dirname(out),{recursive:true});
    if (fs.existsSync(out)) throw new Error('TOKEN_ALREADY_EXISTS');
    fs.writeFileSync(out,JSON.stringify(token,null,2)+'\n');
    console.log(path.relative(root,out).replace(/\\/g,'/'));
    return;
  }

  if (args.command === 'apply') {
    if (!args.request) throw new Error('--request obrigatório');
    const request=JSON.parse(fs.readFileSync(path.resolve(args.request),'utf8'));
    if (!Number.isInteger(Number(request.index))) throw new Error('request.index inválido');
    requireCasPreconditions(request);
    const sp=statePathFor(root,Number(request.index));
    const raw=fs.readFileSync(sp,'utf8');
    const state=JSON.parse(raw);
    const pipeline=model.pipelines.find((item)=>item.index===state.index) || null;
    const token=request.token_id ? loadToken(root,state.index,request.token_id) : null;
    const approval=request.approval_id
      ? (model.human_approvals || []).find((item)=>item.approval_id===request.approval_id)
      : null;
    const action=String(request.action || '').toUpperCase();
    let reservationCreated=null;
    if (action === 'START_CORRECTION') {
      request.reservation_path=correctionReservationRelativePath(state);
      if ((model.active_claims_and_leases || []).some((rel)=>ownershipIndex(rel)===state.index)) {
        throw new Error('CORRECTION_BLOCKED_BY_ACTIVE_AUDIT_LEASE');
      }
      const working=currentWorkingIdentity(root,state);
      const drift=revisionBindingProblems(token || {},working);
      if (drift.length) throw new Error('TOKEN_WORKING_REVISION_STALE:'+drift.join(','));
    } else if (action === 'HANDOFF_FOR_AUDIT') {
      request.reservation_path=assertCorrectionReservation(root,state,request.actor);
      Object.assign(request, workingRevision(root, state));
    } else if (action === 'SAFE_ABORT') {
      const rel=correctionReservationRelativePath(state);
      if (fs.existsSync(path.join(root,rel))) request.reservation_path=assertCorrectionReservation(root,state,request.actor);
    }

    const result=planTransition({
      state,
      pipeline,
      request,
      token,
      humanApproval:approval,
      currentStateSha:auditCore.gitBlobShaBuffer(Buffer.from(raw)),
    });

    if (action === 'START_CORRECTION') {
      reservationCreated=createCorrectionReservation(root,state,request.actor,request.at_utc,token);
    }
    try {
      fs.writeFileSync(sp,JSON.stringify(result.state,null,2)+'\n');
    } catch (error) {
      if (reservationCreated) {
        try { fs.unlinkSync(path.join(root,reservationCreated)); } catch (_) {}
      }
      throw error;
    }
    if (action === 'HANDOFF_FOR_AUDIT') {
      releaseCorrectionReservation(root,state,request.actor);
    } else if (action === 'SAFE_ABORT' && request.reservation_path) {
      releaseCorrectionReservation(root,state,request.actor,{optional:true});
    }

    const snapshot=life.lifecycleSnapshot(result.state);
    if (snapshot.human_locked && result.state.status === 'HUMAN_LOCKED') {
      humanReview.writeHumanReview(root,result.state,snapshot,{
        generated_at_utc:request.at_utc,
        unverified_findings:model.unverified_findings || [],
      });
    }
    console.log(JSON.stringify({
      index:result.state.index,
      status:result.state.status,
      correction_cycle:snapshot.correction_cycle,
      escalation:snapshot.escalation_level,
      revision_id:snapshot.revision_id,
    },null,2));
    return;
  }

  throw new Error('comando desconhecido: ' + args.command);
}

if (require.main===module) {
  try { main(); }
  catch (error) { console.error('Unit transition: ERROR — '+error.message); process.exit(1); }
}

module.exports = {
  finalDecisionRecord,
  decisionIdForPipeline,
  tokenConsumed,
  tokenConsumptionCount,
  tokenHistoryProblems,
  expectedCorrectionTokenId,
  issueCorrectionToken,
  validateCorrectionToken,
  assertCas,
  requireCasPreconditions,
  persistSnapshot,
  deterministicProductionSha,
  workingRevision,
  revisionBindingProblems,
  currentWorkingIdentity,
  projectAuditDecision,
  planTransition,
  loadCorrectionTokens,
  tokenPath,
  loadToken,
  correctionReservationRelativePath,
  reservationField,
  activeCorrectionReservations,
  assertCorrectionReservation,
  createCorrectionReservation,
  releaseCorrectionReservation,
  ownershipIndex,
};
