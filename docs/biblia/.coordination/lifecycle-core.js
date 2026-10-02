'use strict';

const crypto = require('crypto');

const LIFECYCLE_POLICY_EFFECTIVE_AT_UTC = '2026-10-02T06:20:00.000Z';
const HANDOFF_EVENT = 'CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT';
const HUMAN_RESET_EVENT = 'HUMAN_RESET_ESCALATION';
const SAFE_ABORT_EVENT = 'PROTECTED_HANDOFF_UNAUTHORIZED_CORRECTION_ABORTED';

const ESCALATION = Object.freeze({
  NORMAL: 0,
  ELEVATED: 1000,
  HIGH: 2000,
  CRITICAL: 3000,
  EMERGENCY: 4000,
  HUMAN: 100000,
});

const ROOT_CAUSE_CATEGORIES = new Set([
  'TEST_WEAKNESS',
  'PRODUCTION_DESIGN',
  'MOCK_CONTAMINATION',
  'CONCURRENCY',
  'PROTOCOL_FAILURE',
  'SPEC_AMBIGUITY',
  'AUDIT_SCOPE_GAP',
  'STATE_MACHINE_FAILURE',
  'CROSS_FILE_REGRESSION',
  'OTHER',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function validSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || ''));
}

function escalationForCycle(value) {
  const cycle = Math.max(0, Number(value) || 0);
  if (cycle >= 7) return 'HUMAN';
  if (cycle === 6) return 'EMERGENCY';
  if (cycle === 5) return 'CRITICAL';
  if (cycle === 4) return 'HIGH';
  if (cycle === 3) return 'ELEVATED';
  return 'NORMAL';
}

function historyOf(state) {
  return Array.isArray(state?.history) ? state.history : [];
}

function handoffEvents(state) {
  return historyOf(state)
    .map((entry, position) => ({ entry, position }))
    .filter(({ entry }) => entry?.type === HANDOFF_EVENT);
}

function correctionCycles(state) {
  const handoffs = handoffEvents(state);
  const lifetime = handoffs.length;
  const history = historyOf(state);
  let resetPosition = -1;
  for (let i = 0; i < history.length; i += 1) {
    if (history[i]?.type === HUMAN_RESET_EVENT) resetPosition = i;
  }
  const current = resetPosition < 0
    ? lifetime
    : handoffs.filter(({ position }) => position > resetPosition).length;
  return {
    lifetime_correction_cycles: lifetime,
    current_escalation_cycle: current,
  };
}

function auditEpoch(state) {
  return handoffEvents(state).length;
}

function latestHandoff(state) {
  const all = handoffEvents(state);
  return all.length ? all[all.length - 1] : null;
}

function deterministicHandoffId(state, handoff = latestHandoff(state), epoch = auditEpoch(state)) {
  if (!handoff) return null;
  if (typeof handoff.entry?.handoff_id === 'string' && handoff.entry.handoff_id.trim()) {
    return handoff.entry.handoff_id.trim();
  }
  const seed = JSON.stringify({
    index: Number(state?.index),
    epoch,
    at_utc: handoff.entry?.at_utc || null,
    source_sha: handoff.entry?.source_sha || null,
    bible_sha: handoff.entry?.bible_sha || null,
  });
  return String(Number(state?.index)).padStart(3, '0')
    + '-e' + epoch + '-' + sha256(seed).slice(0, 12);
}

function latestProductionSha(state) {
  if (validSha(state?.production_sha)) return String(state.production_sha).toLowerCase();
  const handoff = latestHandoff(state);
  if (validSha(handoff?.entry?.production_sha)) return String(handoff.entry.production_sha).toLowerCase();
  return null;
}

function revisionIdentity(state, options = {}) {
  const productionSha = validSha(options.production_sha)
    ? String(options.production_sha).toLowerCase()
    : latestProductionSha(state);
  const testSha = validSha(options.test_sha)
    ? String(options.test_sha).toLowerCase()
    : (validSha(state?.test_sha) ? String(state.test_sha).toLowerCase()
      : (validSha(state?.source_sha) ? String(state.source_sha).toLowerCase() : null));
  const bibleSha = validSha(options.bible_sha)
    ? String(options.bible_sha).toLowerCase()
    : (validSha(state?.bible_sha) ? String(state.bible_sha).toLowerCase() : null);

  const canonical = JSON.stringify({
    production_sha: productionSha,
    test_sha: testSha,
    bible_sha: bibleSha,
  });
  return {
    production_sha: productionSha,
    test_sha: testSha,
    bible_sha: bibleSha,
    revision_id: sha256(canonical),
  };
}

function correctionAgents(state) {
  const history = historyOf(state);
  const handoffs = handoffEvents(state);
  const result = [];
  let previousHandoff = -1;
  for (const handoff of handoffs) {
    let actor = null;
    for (let i = handoff.position - 1; i > previousHandoff; i -= 1) {
      const entry = history[i];
      if (entry?.to_status === 'IN_PROGRESS' && typeof entry?.agent === 'string' && entry.agent.trim()) {
        actor = entry.agent.trim();
        break;
      }
    }
    result.push(actor);
    previousHandoff = handoff.position;
  }
  return result;
}

function correctorEligibility(state, actor) {
  const cycle = correctionCycles(state).current_escalation_cycle;
  const escalation = escalationForCycle(cycle);
  const normalized = String(actor || '').trim();
  if (!normalized) return { eligible: false, reason: 'ACTOR_REQUIRED', cycle, escalation };
  if (cycle >= 7) return { eligible: false, reason: 'HUMAN_LOCKED', cycle, escalation };

  const recent = correctionAgents(state).filter(Boolean);
  if (cycle === 5 && recent[recent.length - 1] === normalized) {
    return { eligible: false, reason: 'CYCLE_5_REQUIRES_DIFFERENT_CORRECTOR', cycle, escalation };
  }
  if (cycle === 6 && recent.slice(-2).includes(normalized)) {
    return { eligible: false, reason: 'CYCLE_6_REQUIRES_DIFFERENT_CORRECTOR', cycle, escalation };
  }
  return { eligible: true, reason: null, cycle, escalation };
}

function rootCauseReviewValid(review) {
  if (!review || typeof review !== 'object') return false;
  const categories = Array.isArray(review.categories) ? review.categories : [];
  return categories.length > 0
    && categories.every((item) => ROOT_CAUSE_CATEGORIES.has(String(item)))
    && typeof review.evidence === 'string' && review.evidence.trim().length > 0
    && typeof review.strategy === 'string' && review.strategy.trim().length > 0;
}

function priorityForState(state) {
  const cycle = correctionCycles(state).current_escalation_cycle;
  const escalation = escalationForCycle(cycle);
  return {
    cycle,
    escalation,
    priority_score: ESCALATION[escalation],
    automatic_eligible: escalation !== 'HUMAN',
  };
}

function lifecycleSnapshot(state, options = {}) {
  const cycles = correctionCycles(state);
  const epoch = auditEpoch(state);
  const handoff = latestHandoff(state);
  const escalation = escalationForCycle(cycles.current_escalation_cycle);
  const revision = revisionIdentity(state, options);
  return {
    ...cycles,
    correction_cycle: cycles.current_escalation_cycle,
    escalation_level: escalation,
    human_approval_required: escalation === 'HUMAN',
    human_locked: escalation === 'HUMAN',
    audit_epoch: epoch,
    handoff_id: deterministicHandoffId(state, handoff, epoch),
    latest_handoff_at_utc: handoff?.entry?.at_utc || null,
    recent_correctors: correctionAgents(state).filter(Boolean).slice(-2),
    ...revision,
    priority_score: ESCALATION[escalation],
  };
}

function lifecycleProblems(state, options = {}) {
  const snapshot = lifecycleSnapshot(state, options);
  const problems = [];
  const label = '#' + String(state?.index || 0).padStart(3, '0');

  const checks = [
    ['correction_cycle', snapshot.correction_cycle],
    ['lifetime_correction_cycles', snapshot.lifetime_correction_cycles],
    ['current_escalation_cycle', snapshot.current_escalation_cycle],
    ['escalation_level', snapshot.escalation_level],
    ['audit_epoch', snapshot.audit_epoch],
    ['handoff_id', snapshot.handoff_id],
    ['revision_id', snapshot.revision_id],
  ];
  for (const [field, expected] of checks) {
    if (state?.[field] !== undefined && state[field] !== null && state[field] !== expected) {
      problems.push(label + ': ' + field + ' persistido diverge do valor canônico; esperado=' + expected + ' atual=' + state[field]);
    }
  }

  if (snapshot.human_locked && state?.status !== 'HUMAN_LOCKED') {
    problems.push(label + ': correction_cycle >= 7 exige status HUMAN_LOCKED');
  }
  if (!snapshot.human_locked && state?.status === 'HUMAN_LOCKED') {
    problems.push(label + ': HUMAN_LOCKED sem correction_cycle >= 7');
  }

  const effectiveMs = Date.parse(options.effectiveAtUtc || LIFECYCLE_POLICY_EFFECTIVE_AT_UTC);
  for (const entry of historyOf(state)) {
    const atMs = Date.parse(entry?.at_utc || '');
    if (!Number.isFinite(atMs) || atMs < effectiveMs) continue;
    if (entry?.to_status === 'IN_PROGRESS' && entry?.type !== SAFE_ABORT_EVENT) {
      if (typeof entry?.correction_token_id !== 'string' || !entry.correction_token_id.trim()) {
        problems.push(label + ': correção pós-policy sem correction_token_id em ' + entry.at_utc);
      }
    }
  }
  return problems;
}

function evaluateLifecycleStates(states, options = {}) {
  const byIndex = new Map();
  const problems = [];
  const humanLocked = [];
  for (const state of states || []) {
    const snapshot = lifecycleSnapshot(state, options);
    byIndex.set(state.index, snapshot);
    for (const problem of lifecycleProblems(state, options)) problems.push(problem);
    if (snapshot.human_locked) humanLocked.push({
      index: state.index,
      file: state.file,
      cycle: snapshot.correction_cycle,
      status: state.status,
    });
  }
  return { byIndex, problems, humanLocked };
}

module.exports = {
  LIFECYCLE_POLICY_EFFECTIVE_AT_UTC,
  HANDOFF_EVENT,
  HUMAN_RESET_EVENT,
  SAFE_ABORT_EVENT,
  ESCALATION,
  ROOT_CAUSE_CATEGORIES,
  sha256,
  validSha,
  escalationForCycle,
  handoffEvents,
  correctionCycles,
  auditEpoch,
  latestHandoff,
  deterministicHandoffId,
  revisionIdentity,
  correctionAgents,
  correctorEligibility,
  rootCauseReviewValid,
  priorityForState,
  lifecycleSnapshot,
  lifecycleProblems,
  evaluateLifecycleStates,
};
