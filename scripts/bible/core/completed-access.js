'use strict';
const completion = require('./completion');
const life = require('./lifecycle-core');
const human = require('./human-gate');

function orderFor(state, approvals = [], atUtc = new Date().toISOString(), options = {}) {
  if (!completion.hasCompleted(state)) return null;
  const snapshot = life.lifecycleSnapshot(state);
  const at = Date.parse(atUtc);
  return approvals.find(order => {
    if (order.decision !== 'ALLOW_COMPLETED_WORK' || human.validateApproval(order).length
      || Number(order.index) !== state.index || !Number.isFinite(at)
      || Date.parse(order.approved_at_utc) > at || Date.parse(order.expires_at_utc) <= at) return false;
    const opened = (state.history || []).find(event => event.type === 'COMPLETED_WORK_ORDER_OPENED' && event.approval_id === order.approval_id);
    const closed = (state.history || []).find(event => event.type === 'COMPLETED_WORK_ORDER_CLOSED' && event.approval_id === order.approval_id);
    if (closed && (!options.allowClosed || at > Date.parse(closed.at_utc))) return false;
    if (!opened) return order.revision_id === snapshot.revision_id
      && order.test_sha === snapshot.test_sha && order.bible_sha === snapshot.bible_sha
      && (order.production_sha || null) === (snapshot.production_sha || null)
      && Number(order.audit_epoch) === snapshot.audit_epoch;
    return opened.origin_revision_id === order.revision_id
      && Number(opened.origin_audit_epoch) === Number(order.audit_epoch)
      && snapshot.audit_epoch >= Number(order.audit_epoch)
      && snapshot.audit_epoch <= Number(order.audit_epoch) + 1;
  }) || null;
}
function requireOrder(state, approvals, atUtc, options) {
  if (!completion.hasCompleted(state)) return null;
  const order = orderFor(state, approvals, atUtc, options);
  if (!order) throw new Error('COMPLETED_REQUIRES_DIRECT_HUMAN_ORDER');
  return order;
}
function openOrder(state, order, atUtc) {
  if (!order || (state.history || []).some(event => event.type === 'COMPLETED_WORK_ORDER_OPENED' && event.approval_id === order.approval_id)) return;
  if (!Array.isArray(state.history)) state.history = [];
  life.appendLifecycleEvent(state.history, { type: 'COMPLETED_WORK_ORDER_OPENED', at_utc: atUtc,
    approval_id: order.approval_id, origin_revision_id: order.revision_id, origin_audit_epoch: order.audit_epoch,
    from_status: 'COMPLETED', to_status: 'COMPLETED', from_review_status: completion.reviewStatus(state), to_review_status: completion.reviewStatus(state) });
}
function closeOrder(state, order, atUtc) {
  if (!order) return;
  life.appendLifecycleEvent(state.history, { type: 'COMPLETED_WORK_ORDER_CLOSED', at_utc: atUtc,
    approval_id: order.approval_id, from_status: 'COMPLETED', to_status: 'COMPLETED',
    from_review_status: completion.reviewStatus(state), to_review_status: completion.reviewStatus(state) });
}
function resultProblems(state, record, approvals) {
  const since = Date.parse(state.completion?.human_order_required_since_utc || '');
  if (!completion.hasCompleted(state) || !Number.isFinite(since) || record.completed_at_ms <= since) return [];
  const order = orderFor(state, approvals, record.completed_at_utc, { allowClosed: true });
  if (!order || record.completed_order_id !== order.approval_id || record.auditor === order.approved_by) return ['COMPLETED_AUDIT_WITHOUT_DIRECT_HUMAN_ORDER'];
  return [];
}
module.exports = { orderFor, requireOrder, openOrder, closeOrder, resultProblems };
