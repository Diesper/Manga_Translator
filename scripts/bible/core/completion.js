'use strict';

const WORK_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'READY_FOR_AUDIT', 'CHANGES_REQUIRED', 'HUMAN_LOCKED', 'BLOCKED', 'COMPLETED']);

function hasCompleted(state) {
  return state?.status === 'COMPLETED' || state?.completion?.achieved === true
    || (state?.history || []).some(event => event?.to_status === 'COMPLETED' || event?.from_status === 'COMPLETED');
}

function reviewStatus(state) { return state?.review_status || state?.status; }
function eventReviewStatus(event) { return event?.to_review_status || event?.to_status; }

function setReviewStatus(state, status) {
  if (!WORK_STATUSES.has(status)) throw new Error('INVALID_REVIEW_STATUS:' + status);
  if (hasCompleted(state) || status === 'COMPLETED') {
    state.status = 'COMPLETED';
    state.review_status = status;
    const first = (state.history || []).find(event => event?.to_status === 'COMPLETED' || event?.from_status === 'COMPLETED');
    state.completion = { ...(state.completion || {}), achieved: true,
      first_completed_at_utc: state.completion?.first_completed_at_utc || state.completed_at_utc || first?.at_utc || null,
      human_order_required_since_utc: state.completion?.human_order_required_since_utc || state.updated_at_utc || state.completed_at_utc || first?.at_utc || null };
  } else {
    state.status = status;
    if (state.review_status) state.review_status = status;
  }
  return state;
}

function completionEvent(state, event) {
  if (!hasCompleted(state) || !event.to_status) return event;
  if (event.to_status === 'COMPLETED' && !state.completion?.first_completed_at_utc
    && !(state.history || []).some(item => item.to_status === 'COMPLETED' || item.from_status === 'COMPLETED')) return event;
  return { ...event, from_status: 'COMPLETED', to_status: 'COMPLETED',
    from_review_status: event.from_review_status || event.from_status || reviewStatus(state),
    to_review_status: event.to_review_status || event.to_status };
}

function completionQuality(state, pipeline = null, identity = null) {
  const caveats = [];
  if (pipeline && pipeline.decision !== 'APPROVED') caveats.push(pipeline.decision);
  if (pipeline?.problems?.length) caveats.push('INVALID_AUDIT_EVIDENCE');
  if (!pipeline && state?.status === 'COMPLETED') caveats.push('REVALIDATION_REQUIRED');
  if (!['COMPLETED', 'READY_FOR_AUDIT'].includes(reviewStatus(state))) caveats.push(reviewStatus(state));
  if ((state?.audit_requests || []).some(request => request.status === 'OPEN')) caveats.push('OPEN_AUDIT_REQUESTS');
  if (identity && ['source_sha', 'test_sha', 'bible_sha', 'production_sha'].some(key => (
    Object.prototype.hasOwnProperty.call(identity, key) && (state[key] || null) !== (identity[key] || null)
  ))) caveats.push('REVISION_CHANGED');
  return { status: caveats.length ? 'WITH_CAVEATS' : 'VERIFIED', caveats: [...new Set(caveats)].filter(Boolean) };
}

function completionProblems(state) {
  const problems = [];
  if (hasCompleted(state) && state.status !== 'COMPLETED') problems.push('COMPLETED_STATUS_REGRESSION');
  if (state.review_status && !WORK_STATUSES.has(state.review_status)) problems.push('INVALID_REVIEW_STATUS');
  if ((state.history || []).some(event => event.type === 'COMPLETED_HUMAN_FREEZE_ACTIVATED') && !state.completion?.human_order_required_since_utc) problems.push('COMPLETED_HUMAN_FREEZE_MISSING');
  return problems;
}

module.exports = { WORK_STATUSES, hasCompleted, reviewStatus, eventReviewStatus, setReviewStatus,
  completionEvent, completionQuality, completionProblems };
