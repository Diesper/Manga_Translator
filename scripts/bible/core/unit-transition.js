'use strict';
const path=require('path');
const completion=require('./completion');
const life=require('./lifecycle-core');
const human=require('./human-gate');
const completedAccess=require('./completed-access');

function appendEvent(state, event) { return life.appendLifecycleEvent(state.history, completion.completionEvent(state, event)); }

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
  if (completion.reviewStatus(state) !== requiredStatus) throw new Error('TOKEN_STATE_INVALID:' + completion.reviewStatus(state));

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
  if (completion.hasCompleted(next)) next.completion_quality = completion.completionQuality(next);
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

function revisionBindingProblems(expected, actual) {
  const problems = [];
  if ((expected?.production_sha || null) !== (actual?.production_sha || null)) problems.push('PRODUCTION');
  if ((expected?.test_sha || null) !== (actual?.test_sha || null)) problems.push('TEST');
  if ((expected?.bible_sha || null) !== (actual?.bible_sha || null)) problems.push('BIBLE');
  if (expected?.revision_id && actual?.revision_id && expected.revision_id !== actual.revision_id) problems.push('REVISION_ID');
  return problems;
}

function projectAuditDecision(state, pipeline, options = {}) {
  const completedOrder = state.completion?.human_order_required_since_utc
    ? completedAccess.requireOrder(state, [options.completedOrder].filter(Boolean), options.at_utc) : null;
  if (!pipeline || !['APPROVED', 'CHANGES_REQUIRED'].includes(pipeline.decision)) {
    throw new Error('RECONCILE_DECISION_INVALID');
  }
  if (Array.isArray(pipeline.problems) && pipeline.problems.length) {
    throw new Error('RECONCILE_PIPELINE_INVALID:' + pipeline.problems.join(';'));
  }
  const snapshot = life.lifecycleSnapshot(state);
  if (snapshot.human_locked) throw new Error('RECONCILE_HUMAN_LOCKED');
  if (completion.reviewStatus(state) === 'IN_PROGRESS') throw new Error('RECONCILE_IN_PROGRESS');
  if (completion.reviewStatus(state) === 'BLOCKED') throw new Error('RECONCILE_BLOCKED');
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
  completedAccess.openOrder(next, completedOrder, at);
  const previous = completion.reviewStatus(next);
  completion.setReviewStatus(next, targetStatus);
  next.agent = null;
  next.coordination_status = 'OK';
  next.updated_at_utc = at || next.updated_at_utc || null;
  next.completed_at_utc = state.completed_at_utc || next.completion?.first_completed_at_utc || (targetStatus === 'COMPLETED' ? at : null);
  if (next.completion && !next.completion.first_completed_at_utc) next.completion.first_completed_at_utc = next.completed_at_utc;
  if (!completion.hasCompleted(state) && next.completion) next.completion.human_order_required_since_utc = at;
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
    appendEvent(next, {
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
  if (completion.hasCompleted(next)) next.completion_quality = completion.completionQuality(next, pipeline);
  if (completedOrder && !alreadyRecorded) completedAccess.closeOrder(next, completedOrder, at);
  return { state: next, changed: JSON.stringify(next) !== JSON.stringify(state) };
}

function planTransitionInternal({ state, pipeline = null, request, token = null, humanApproval = null, completedOrder = null, currentStateSha = null }) {
  if (!state || !request) throw new Error('STATE_AND_REQUEST_REQUIRED');
  const action = String(request.action || '').toUpperCase();
  const actor = String(request.actor || '').trim();
  const at = request.at_utc;
  if (!actor) throw new Error('ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(at || ''))) throw new Error('AT_UTC_REQUIRED');

  const snapshot = life.lifecycleSnapshot(state);
  assertCas(state, snapshot, request, currentStateSha);
  if (state.completion?.human_order_required_since_utc) completedAccess.requireOrder(state, [completedOrder].filter(Boolean), at);
  if (action !== 'SAFE_ABORT') {
    const stateProblems = life.lifecycleProblems(state);
    if (stateProblems.length) throw new Error('STATE_LIFECYCLE_INVALID:' + stateProblems.join(';'));
  }
  const next = JSON.parse(JSON.stringify(state));
  next.history = Array.isArray(next.history) ? next.history : [];
  completedAccess.openOrder(next, completedOrder, at);

  if (action === 'RECONCILE_DECISION') {
    return projectAuditDecision(state, pipeline, { at_utc: at, completedOrder });
  }

  if (action === 'START_CORRECTION') {
    const expectedStatus = snapshot.human_locked ? 'HUMAN_LOCKED' : 'CHANGES_REQUIRED';
    if (completion.reviewStatus(state) !== expectedStatus) throw new Error('START_CORRECTION_STATUS_INVALID:' + completion.reviewStatus(state));
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
      appendEvent(next, {
        at_utc: at,
        type: 'HUMAN_APPROVAL_CONSUMED',
        approval_id: humanApproval.approval_id,
        correction_token_id: token.token_id,
        actor,
        source_sha: state.source_sha,
        bible_sha: state.bible_sha,
      });
    }

    appendEvent(next, {
      at_utc: at,
      type: snapshot.human_locked ? 'HUMAN_AUTHORIZED_CORRECTION_STARTED' : 'EDITOR_CORRECTION_STARTED',
      from_status: completion.reviewStatus(state),
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
    appendEvent(next, {
      at_utc: at,
      type: 'CORRECTION_TOKEN_CONSUMED',
      correction_token_id: token.token_id,
      actor,
      revision_id: snapshot.revision_id,
    });
    completion.setReviewStatus(next, 'IN_PROGRESS');
    next.agent = actor;
    next.updated_at_utc = at;
    persistSnapshot(next, snapshot);
    return { state: next, consumed_token_id: token.token_id };
  }

  if (action === 'REFRESH_REVISION_FOR_AUDIT') {
    if (!['COMPLETED', 'READY_FOR_AUDIT', 'CHANGES_REQUIRED'].includes(completion.reviewStatus(state))) {
      throw new Error('REVISION_REFRESH_STATUS_INVALID:' + completion.reviewStatus(state));
    }
    const nextTestSha = request.test_sha;
    const nextBibleSha = request.bible_sha;
    const nextProductionSha = request.production_sha === undefined
      ? snapshot.production_sha
      : request.production_sha;
    if (!life.validSha(nextTestSha)) throw new Error('REVISION_REFRESH_TEST_SHA_INVALID');
    if (!life.validSha(nextBibleSha)) throw new Error('REVISION_REFRESH_BIBLE_SHA_INVALID');
    if (nextProductionSha !== null && nextProductionSha !== undefined
      && !life.validSha(nextProductionSha)) throw new Error('REVISION_REFRESH_PRODUCTION_SHA_INVALID');

    const priorRevisionId = snapshot.revision_id;
    const candidate = {
      production_sha: nextProductionSha ? String(nextProductionSha).toLowerCase() : null,
      test_sha: String(nextTestSha).toLowerCase(),
      bible_sha: String(nextBibleSha).toLowerCase(),
    };
    const nextRevision = life.revisionIdentity(state, candidate);
    if (nextRevision.revision_id === priorRevisionId && !(completedOrder && request.force_reaudit === true)) throw new Error('REVISION_REFRESH_REQUIRES_DRIFT');

    const previousSourceSha = state.source_sha || null;
    const previousBibleSha = state.bible_sha || null;
    const previousProductionSha = snapshot.production_sha || null;
    next.source_sha = candidate.test_sha;
    next.test_sha = candidate.test_sha;
    next.bible_sha = candidate.bible_sha;
    next.production_sha = candidate.production_sha;
    const nextEpoch = snapshot.audit_epoch + 1;
    const handoffId = String(state.index).padStart(3, '0')
      + '-e' + nextEpoch + '-' + life.sha256(life.stableJson({
        index: state.index,
        epoch: nextEpoch,
        at_utc: at,
        event: life.REVISION_REFRESH_EVENT,
        test_sha: next.test_sha,
        bible_sha: next.bible_sha,
        production_sha: next.production_sha,
      })).slice(0, 12);

    appendEvent(next, {
      at_utc: at,
      type: life.REVISION_REFRESH_EVENT,
      from_status: completion.reviewStatus(state),
      to_status: 'READY_FOR_AUDIT',
      actor,
      previous_source_sha: previousSourceSha,
      previous_bible_sha: previousBibleSha,
      previous_production_sha: previousProductionSha,
      previous_revision_id: priorRevisionId,
      source_sha: next.source_sha,
      test_sha: next.test_sha,
      bible_sha: next.bible_sha,
      production_sha: next.production_sha,
      revision_id: nextRevision.revision_id,
      correction_cycle: snapshot.current_escalation_cycle,
      audit_epoch: nextEpoch,
      handoff_id: handoffId,
      reason: String(request.reason || 'Revisão externa legítima vinculada ao working tree e devolvida para auditoria independente.'),
    });
    completion.setReviewStatus(next, 'READY_FOR_AUDIT');
    next.agent = null;
    if (!completion.hasCompleted(next)) next.completed_at_utc = null;
    next.updated_at_utc = at;
    const after = life.lifecycleSnapshot(next, candidate);
    persistSnapshot(next, after);
    return { state: next, handoff_id: after.handoff_id, audit_epoch: after.audit_epoch };
  }

  if (action === 'HANDOFF_FOR_AUDIT') {
    if (completion.reviewStatus(state) !== 'IN_PROGRESS') throw new Error('HANDOFF_REQUIRES_IN_PROGRESS');
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
    appendEvent(next, {
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
    completion.setReviewStatus(next, snapshot.current_escalation_cycle + 1 >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT');
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
    if (completion.reviewStatus(state) !== 'IN_PROGRESS') throw new Error('SAFE_ABORT_REQUIRES_IN_PROGRESS');
    appendEvent(next, {
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
    completion.setReviewStatus(next, request.restore_status || 'READY_FOR_AUDIT');
    next.agent = null;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next };
  }

  if (action === 'HUMAN_COMPLETE') {
    if (!snapshot.human_locked || completion.reviewStatus(state) !== 'HUMAN_LOCKED') {
      throw new Error('HUMAN_COMPLETE_REQUIRES_HUMAN_LOCK');
    }
    if (pipeline?.decision !== 'APPROVED' || (pipeline?.problems || []).length) {
      throw new Error('HUMAN_COMPLETE_REQUIRES_FINAL_APPROVED');
    }
    if (!human.approvalMatches(state, snapshot, humanApproval, 'PERMANENTLY_CLOSE')) {
      throw new Error('HUMAN_PERMANENT_CLOSE_APPROVAL_REQUIRED');
    }
    appendEvent(next, {
      at_utc: at,
      type: 'HUMAN_APPROVAL_CONSUMED',
      approval_id: humanApproval.approval_id,
      actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
    });
    appendEvent(next, {
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
    completion.setReviewStatus(next, 'COMPLETED');
    next.agent = null;
    next.completed_at_utc = state.completed_at_utc || next.completion?.first_completed_at_utc || at;
    next.completion.first_completed_at_utc ||= next.completed_at_utc;
    if (!completion.hasCompleted(state)) next.completion.human_order_required_since_utc = at;
    next.updated_at_utc = at;
    persistSnapshot(next, life.lifecycleSnapshot(next));
    return { state: next, human_closed: true };
  }

  if (action === 'HUMAN_RESET_ESCALATION') {
    if (!snapshot.human_locked) throw new Error('RESET_REQUIRES_HUMAN_LOCK');
    if (!human.approvalMatches(state, snapshot, humanApproval, 'RESET_ESCALATION')) {
      throw new Error('HUMAN_RESET_APPROVAL_REQUIRED');
    }
    appendEvent(next, {
      at_utc: at,
      type: 'HUMAN_APPROVAL_CONSUMED',
      approval_id: humanApproval.approval_id,
      actor,
      source_sha: state.source_sha,
      bible_sha: state.bible_sha,
    });
    appendEvent(next, {
      at_utc: at,
      type: life.HUMAN_RESET_EVENT,
      from_status: 'HUMAN_LOCKED',
      to_status: 'READY_FOR_AUDIT',
      approval_id: humanApproval.approval_id,
      actor,
      lifetime_correction_cycles: snapshot.lifetime_correction_cycles,
      reason: String(request.reason || 'Escalonamento reiniciado por decisão humana explícita.'),
    });
    completion.setReviewStatus(next, 'READY_FOR_AUDIT');
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
        completion.eventReviewStatus(candidate) === 'IN_PROGRESS'
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

function tokenPath(root, index, tokenId) {
  return path.join(root, 'docs', 'biblia', '.coordination', 'correction-authorizations',
    String(index).padStart(3, '0'), tokenId + '.json');
}

function planTransition(input) {
  const result = planTransitionInternal(input);
  if (input.completedOrder) completedAccess.requireOrder(result.state, [input.completedOrder], input.request.at_utc, {allowClosed:true});
  return result;
}

module.exports={finalDecisionRecord,decisionIdForPipeline,tokenConsumed,tokenConsumptionCount,tokenHistoryProblems,expectedCorrectionTokenId,issueCorrectionToken,validateCorrectionToken,assertCas,requireCasPreconditions,persistSnapshot,revisionBindingProblems,projectAuditDecision,planTransition,tokenPath,correctionReservationRelativePath,reservationField,ownershipIndex};
