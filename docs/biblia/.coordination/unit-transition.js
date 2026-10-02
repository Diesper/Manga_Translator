'use strict';

const fs = require('fs');
const path = require('path');
const life = require('./lifecycle-core');
const human = require('./human-gate');

function finalDecisionRecord(pipeline) {
  if (!pipeline) return null;
  if (pipeline.reaudit) return pipeline.reaudit;
  if (pipeline.adversarial) return pipeline.adversarial;
  return pipeline.primary || null;
}

function tokenConsumed(state, tokenId) {
  return (Array.isArray(state?.history) ? state.history : []).some((entry) => (
    entry?.type === 'CORRECTION_TOKEN_CONSUMED'
    && entry?.correction_token_id === tokenId
  ));
}

function issueCorrectionToken(state, pipeline, options = {}) {
  const snapshot = life.lifecycleSnapshot(state, options.revision || {});
  if (pipeline?.decision !== 'CHANGES_REQUIRED') throw new Error('TOKEN_REQUIRES_FINAL_CHANGES_REQUIRED');
  if (Array.isArray(pipeline?.problems) && pipeline.problems.length) throw new Error('TOKEN_REJECTS_INVALID_PIPELINE');
  if (pipeline?.source_sha && pipeline.source_sha !== state.source_sha) throw new Error('TOKEN_PIPELINE_SOURCE_STALE');
  if (pipeline?.bible_sha && snapshot.bible_sha && pipeline.bible_sha !== snapshot.bible_sha) {
    throw new Error('TOKEN_PIPELINE_BIBLE_STALE');
  }

  let humanApprovalId = null;
  if (snapshot.human_locked) {
    const approval = options.humanApproval;
    if (!human.approvalMatches(state, snapshot, approval, 'ALLOW_ONE_CORRECTION')) {
      throw new Error('HUMAN_APPROVAL_REQUIRED');
    }
    humanApprovalId = approval.approval_id;
  }

  const record = finalDecisionRecord(pipeline);
  const issuedAt = options.issued_at_utc;
  if (!Number.isFinite(Date.parse(issuedAt || ''))) throw new Error('TOKEN_ISSUED_AT_REQUIRED');
  const decisionId = life.sha256(JSON.stringify({
    index: state.index,
    path: record?.path || null,
    phase: record?.phase || null,
    auditor: record?.auditor || null,
    completed_at_utc: record?.completed_at_utc || null,
    verdict: record?.verdict || pipeline.decision,
  }));
  const seed = JSON.stringify({
    index: state.index,
    cycle: snapshot.current_escalation_cycle,
    revision_id: snapshot.revision_id,
    handoff_id: snapshot.handoff_id,
    audit_epoch: snapshot.audit_epoch,
    decision_id: decisionId,
    human_approval_id: humanApprovalId,
    issued_at_utc: issuedAt,
  });
  return {
    schema_version: 1,
    token_id: 'corr-' + String(state.index).padStart(3, '0') + '-' + life.sha256(seed).slice(0, 20),
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
    issued_at_utc: issuedAt,
    human_approval_id: humanApprovalId,
  };
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
  if (typeof token?.token_id !== 'string' || !token.token_id.trim()) problems.push('TOKEN_ID_MISSING');
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

function planTransition({ state, pipeline = null, request, token = null, humanApproval = null, currentStateSha = null }) {
  if (!state || !request) throw new Error('STATE_AND_REQUEST_REQUIRED');
  const action = String(request.action || '').toUpperCase();
  const actor = String(request.actor || '').trim();
  const at = request.at_utc;
  if (!actor) throw new Error('ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(at || ''))) throw new Error('AT_UTC_REQUIRED');

  const snapshot = life.lifecycleSnapshot(state);
  assertCas(state, snapshot, request, currentStateSha);
  const next = JSON.parse(JSON.stringify(state));
  next.history = Array.isArray(next.history) ? next.history : [];

  if (action === 'START_CORRECTION') {
    const expectedStatus = snapshot.human_locked ? 'HUMAN_LOCKED' : 'CHANGES_REQUIRED';
    if (state.status !== expectedStatus) throw new Error('START_CORRECTION_STATUS_INVALID:' + state.status);
    const tokenProblems = validateCorrectionToken(state, token);
    if (tokenProblems.length) throw new Error(tokenProblems.join(';'));

    const eligibility = life.correctorEligibility(state, actor);
    if (!snapshot.human_locked && !eligibility.eligible) throw new Error(eligibility.reason);
    if (snapshot.current_escalation_cycle === 6 && !life.rootCauseReviewValid(request.root_cause_review)) {
      throw new Error('EMERGENCY_ROOT_CAUSE_REVIEW_REQUIRED');
    }
    if (snapshot.human_locked) {
      if (!human.approvalMatches(state, snapshot, humanApproval, 'ALLOW_ONE_CORRECTION')) {
        throw new Error('HUMAN_APPROVAL_REQUIRED');
      }
      if (token?.human_approval_id !== humanApproval.approval_id) throw new Error('TOKEN_HUMAN_APPROVAL_MISMATCH');
      next.history.push({
        at_utc: at,
        type: 'HUMAN_APPROVAL_CONSUMED',
        approval_id: humanApproval.approval_id,
        correction_token_id: token.token_id,
        actor,
        source_sha: state.source_sha,
        bible_sha: state.bible_sha,
      });
    }

    next.history.push({
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
      root_cause_review: request.root_cause_review || null,
    });
    next.history.push({
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
    const nextEpoch = snapshot.audit_epoch + 1;
    const handoffId = String(state.index).padStart(3, '0')
      + '-e' + nextEpoch + '-' + life.sha256(JSON.stringify({
        index: state.index,
        epoch: nextEpoch,
        at_utc: at,
        source_sha: state.source_sha,
        bible_sha: state.bible_sha,
      })).slice(0, 12);
    next.history.push({
      at_utc: at,
      type: life.HANDOFF_EVENT,
      from_status: 'IN_PROGRESS',
      to_status: snapshot.current_escalation_cycle + 1 >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT',
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      production_sha: request.production_sha || snapshot.production_sha,
      agent: actor,
      correction_cycle: snapshot.current_escalation_cycle + 1,
      audit_epoch: nextEpoch,
      handoff_id: handoffId,
      reason: String(request.reason || 'Correção entregue pelo transition engine.'),
    });
    next.status = snapshot.current_escalation_cycle + 1 >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT';
    next.agent = null;
    next.updated_at_utc = at;
    const after = life.lifecycleSnapshot(next, { production_sha: request.production_sha || snapshot.production_sha });
    persistSnapshot(next, after);
    return { state: next, handoff_id: after.handoff_id, audit_epoch: after.audit_epoch };
  }

  if (action === 'SAFE_ABORT') {
    if (state.status !== 'IN_PROGRESS') throw new Error('SAFE_ABORT_REQUIRES_IN_PROGRESS');
    next.history.push({
      at_utc: at,
      type: life.SAFE_ABORT_EVENT,
      from_status: 'IN_PROGRESS',
      to_status: request.restore_status || 'READY_FOR_AUDIT',
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
      reopen_at_utc: request.reopen_at_utc || null,
      correction_token_id: request.correction_token_id || null,
      actor,
      reason: String(request.reason || 'Correção abortada com restauração do binding protegido.'),
    });
    next.status = request.restore_status || 'READY_FOR_AUDIT';
    next.agent = null;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next };
  }

  if (action === 'HUMAN_RESET_ESCALATION') {
    if (!snapshot.human_locked) throw new Error('RESET_REQUIRES_HUMAN_LOCK');
    if (!human.approvalMatches(state, snapshot, humanApproval, 'RESET_ESCALATION')) {
      throw new Error('HUMAN_RESET_APPROVAL_REQUIRED');
    }
    next.history.push({
      at_utc: at,
      type: life.HUMAN_RESET_EVENT,
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

function tokenPath(root, index, tokenId) {
  return path.join(root, 'docs', 'biblia', '.coordination', 'correction-authorizations',
    String(index).padStart(3, '0'), tokenId + '.json');
}

function loadToken(root, index, tokenId) {
  const absolute = tokenPath(root, index, tokenId);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

module.exports = {
  finalDecisionRecord,
  tokenConsumed,
  issueCorrectionToken,
  validateCorrectionToken,
  assertCas,
  persistSnapshot,
  planTransition,
  tokenPath,
  loadToken,
};
