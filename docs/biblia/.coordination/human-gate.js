'use strict';

const fs = require('fs');
const path = require('path');

const HUMAN_DECISIONS = new Set([
  'ALLOW_ONE_CORRECTION',
  'ALLOW_AUDIT_ONLY',
  'RESET_ESCALATION',
  'PERMANENTLY_CLOSE',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function clearlyAutomatedApprover(value) {
  const actor = String(value || '').trim();
  return /\[bot\]$/i.test(actor) || /^github-actions(?:\[bot\])?$/i.test(actor);
}

function validateApproval(raw, rel = '<memory>') {
  const problems = [];
  const index = Number(raw?.index);
  if (![1,2].includes(Number(raw?.schema_version))) problems.push(rel + ': schema_version deve ser 1 ou 2');
  if (!Number.isInteger(index) || index < 1 || index > 233) problems.push(rel + ': index inválido');
  if (typeof raw?.approval_id !== 'string' || !raw.approval_id.trim()) problems.push(rel + ': approval_id ausente');
  if (!HUMAN_DECISIONS.has(String(raw?.decision || ''))) problems.push(rel + ': decision inválida');
  if (!Number.isInteger(Number(raw?.locked_cycle)) || Number(raw.locked_cycle) < 7) problems.push(rel + ': locked_cycle deve ser >= 7');
  if (typeof raw?.approved_by !== 'string' || !raw.approved_by.trim()) problems.push(rel + ': approved_by ausente');
  if (clearlyAutomatedApprover(raw?.approved_by)) problems.push(rel + ': approved_by deve ser identidade humana, não bot');
  if (!Number.isFinite(Date.parse(raw?.approved_at_utc || ''))) problems.push(rel + ': approved_at_utc inválido');
  if (raw?.approval_source !== 'workflow_dispatch') problems.push(rel + ': approval_source deve ser workflow_dispatch');
  if (raw?.approval_environment !== 'human-approval') problems.push(rel + ': approval_environment deve ser human-approval');
  if (Number(raw?.schema_version) >= 2) {
    if (!/^\d+$/.test(String(raw?.workflow_run_id || '')) || Number(raw.workflow_run_id) < 1) {
      problems.push(rel + ': workflow_run_id inválido');
    }
    if (!Number.isInteger(Number(raw?.workflow_run_attempt)) || Number(raw.workflow_run_attempt) < 1) {
      problems.push(rel + ': workflow_run_attempt inválido');
    }
    if (raw?.workflow_name !== 'Bible Human Approval') problems.push(rel + ': workflow_name inválido');
    if (raw?.repository !== 'Diesper/Manga_Translator') problems.push(rel + ': repository inválido');
    if (raw?.target_branch !== 'docs/project-bible') problems.push(rel + ': target_branch inválido');
    if (!/^[0-9a-f]{40}$/i.test(String(raw?.branch_head_sha || ''))) problems.push(rel + ': branch_head_sha inválido');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(raw?.revision_id || ''))) problems.push(rel + ': revision_id inválido');
  if (!/^[0-9a-f]{40}$/i.test(String(raw?.test_sha || ''))) problems.push(rel + ': test_sha inválido');
  if (!/^[0-9a-f]{40}$/i.test(String(raw?.bible_sha || ''))) problems.push(rel + ': bible_sha inválido');
  if (raw?.production_sha !== null && raw?.production_sha !== undefined
    && !/^[0-9a-f]{40}$/i.test(String(raw.production_sha))) {
    problems.push(rel + ': production_sha inválido');
  }
  if (raw?.decision === 'ALLOW_ONE_CORRECTION' && raw?.permission !== 'ONE_CORRECTION_CYCLE') {
    problems.push(rel + ': ALLOW_ONE_CORRECTION exige permission ONE_CORRECTION_CYCLE');
  }
  return problems;
}

function loadHumanApprovals(root) {
  const base = path.join(root, 'docs', 'biblia', '.coordination', 'human-approvals');
  const approvals = [];
  const problems = [];
  const ids = new Set();
  for (const absolute of walk(base)) {
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push(rel + ': artefato de aprovação deve ser JSON');
      continue;
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch (error) {
      problems.push(rel + ': JSON inválido: ' + error.message);
      continue;
    }
    problems.push(...validateApproval(raw, rel));
    if (ids.has(raw?.approval_id)) problems.push(rel + ': approval_id duplicado: ' + raw.approval_id);
    if (raw?.approval_id) ids.add(raw.approval_id);
    approvals.push({ ...raw, path: rel });
  }
  return { approvals, problems };
}

function approvalConsumed(state, approvalId) {
  return (Array.isArray(state?.history) ? state.history : []).some((entry) => (
    entry?.type === 'HUMAN_APPROVAL_CONSUMED'
    && entry?.approval_id === approvalId
  ));
}

function approvalMatches(state, snapshot, approval, decision = null) {
  if (!state || !snapshot || !approval) return false;
  if (validateApproval(approval).length) return false;
  if (decision && approval.decision !== decision) return false;
  if (Number(approval.index) !== Number(state.index)) return false;
  if (Number(approval.locked_cycle) !== Number(snapshot.current_escalation_cycle)) return false;
  if (approval.revision_id !== snapshot.revision_id) return false;
  if (approval.test_sha !== snapshot.test_sha) return false;
  if (approval.bible_sha !== snapshot.bible_sha) return false;
  if ((approval.production_sha || null) !== (snapshot.production_sha || null)) return false;
  if (approvalConsumed(state, approval.approval_id)) return false;
  return true;
}

function activeHumanApproval(state, snapshot, approvals, decision = 'ALLOW_ONE_CORRECTION') {
  const matches = (approvals || [])
    .filter((approval) => approvalMatches(state, snapshot, approval, decision))
    .sort((a, b) => Date.parse(a.approved_at_utc) - Date.parse(b.approved_at_utc));
  return matches.length ? matches[matches.length - 1] : null;
}

function humanAuditResultProblems(states, lifecycleByIndex, approvals, records) {
  const problems = [];
  const stateByIndex = new Map((states || []).map((state) => [state.index, state]));
  for (const record of records || []) {
    const state = stateByIndex.get(record.index);
    const snapshot = lifecycleByIndex instanceof Map ? lifecycleByIndex.get(record.index) : null;
    if (!state || !snapshot?.human_locked) continue;
    if (record.source_sha !== state.source_sha) continue;
    if (record.bible_sha && snapshot.bible_sha && record.bible_sha !== snapshot.bible_sha) continue;
    const handoffMs = Date.parse(snapshot.latest_handoff_at_utc || '');
    if (Number.isFinite(handoffMs) && Number(record.completed_at_ms) <= handoffMs) continue;
    if (record.schema_version === 3
      && (record.revision_id !== snapshot.revision_id
        || record.handoff_id !== snapshot.handoff_id
        || Number(record.audit_epoch) !== Number(snapshot.audit_epoch))) {
      continue;
    }
    const approval = (approvals || []).find((candidate) => (
      String(candidate?.approval_id || '') === String(record.human_approval_id || '')
    ));
    const approvalMs = Date.parse(approval?.approved_at_utc || '');
    if (!approval
      || !approvalMatches(state, snapshot, approval, 'ALLOW_AUDIT_ONLY')
      || !Number.isFinite(approvalMs)
      || approvalMs > Number(record.completed_at_ms)) {
      problems.push(
        '#' + String(record.index).padStart(3, '0')
        + ': audit-result HUMAN sem ALLOW_AUDIT_ONLY exata, válida e anterior ao resultado: '
        + (record.path || record.phase)
      );
    }
  }
  return problems;
}

function humanApprovalAuditorProblems(approvals, pipelines) {
  const problems = [];
  const pipelineByIndex = pipelines instanceof Map
    ? pipelines
    : new Map((pipelines || []).map((pipeline) => [Number(pipeline?.index), pipeline]));

  for (const approval of approvals || []) {
    const pipeline = pipelineByIndex.get(Number(approval?.index));
    if (!pipeline) continue;
    const auditors = [
      pipeline?.primary?.auditor,
      pipeline?.adversarial?.auditor,
      pipeline?.reaudit?.auditor,
    ].filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim());
    const approver = String(approval?.approved_by || '').trim();
    if (approver && auditors.includes(approver)) {
      problems.push(
        (approval?.path || '<approval>')
        + ': aprovação humana deve ser independente dos auditores da revisão atual; conflito='
        + approver
      );
    }
  }
  return problems;
}

function humanApprovalConsumptionProblems(states, approvals) {
  const problems = [];
  const approvalById = new Map((approvals || []).map((approval) => [approval.approval_id, approval]));
  const consumed = new Map();

  for (const state of states || []) {
    const history = Array.isArray(state?.history) ? state.history : [];
    for (let position = 0; position < history.length; position += 1) {
      const entry = history[position];
      if (entry?.type !== 'HUMAN_APPROVAL_CONSUMED') continue;
      const approvalId = String(entry?.approval_id || '').trim();
      const label = '#' + String(state.index).padStart(3, '0') + '/history[' + position + ']';
      if (!approvalId) {
        problems.push(label + ': HUMAN_APPROVAL_CONSUMED sem approval_id');
        continue;
      }
      const approval = approvalById.get(approvalId);
      if (!approval) {
        problems.push(label + ': consumo de approval inexistente: ' + approvalId);
        continue;
      }
      const seen = consumed.get(approvalId) || [];
      seen.push(label);
      consumed.set(approvalId, seen);

      if (Number(approval.index) !== Number(state.index)) {
        problems.push(label + ': approval consumida por outro índice: ' + approvalId);
      }
      if (entry?.source_sha && approval.test_sha && entry.source_sha !== approval.test_sha) {
        problems.push(label + ': approval consumida em test/source revision divergente');
      }
      if (entry?.bible_sha && approval.bible_sha && entry.bible_sha !== approval.bible_sha) {
        problems.push(label + ': approval consumida em Bible revision divergente');
      }
      const approvedMs = Date.parse(approval.approved_at_utc || '');
      const consumedMs = Date.parse(entry.at_utc || '');
      if (!Number.isFinite(consumedMs) || (Number.isFinite(approvedMs) && consumedMs < approvedMs)) {
        problems.push(label + ': approval consumida antes de existir');
      }

      const next = history[position + 1];
      const expectedType = approval.decision === 'ALLOW_ONE_CORRECTION'
        ? 'HUMAN_AUTHORIZED_CORRECTION_STARTED'
        : approval.decision === 'PERMANENTLY_CLOSE'
          ? 'HUMAN_PERMANENTLY_CLOSED'
          : approval.decision === 'RESET_ESCALATION'
            ? lifecycle.HUMAN_RESET_EVENT
            : null;
      if (expectedType && (next?.type !== expectedType || next?.approval_id !== approvalId)) {
        problems.push(label + ': consumo não é seguido pela ação humana esperada ' + expectedType);
      }
      if (approval.decision === 'ALLOW_AUDIT_ONLY') {
        problems.push(label + ': ALLOW_AUDIT_ONLY não deve ser consumida como mutação de state');
      }
    }
  }

  for (const [approvalId, labels] of consumed) {
    if (labels.length > 1) {
      problems.push('approval single-use consumida mais de uma vez: ' + approvalId + ' -> ' + labels.join(', '));
    }
  }
  return problems;
}

function humanGateProblems(states, lifecycleByIndex, approvals) {
  const problems = [];
  for (const state of states || []) {
    const snapshot = lifecycleByIndex instanceof Map ? lifecycleByIndex.get(state.index) : null;
    if (!snapshot) continue;
    const relevant = (approvals || []).filter((approval) => Number(approval.index) === Number(state.index));
    for (const approval of relevant) {
      for (const problem of validateApproval(approval, approval.path || '<approval>')) problems.push(problem);
    }
  }
  problems.push(...humanApprovalConsumptionProblems(states, approvals));
  return [...new Set(problems)];
}

module.exports = {
  HUMAN_DECISIONS,
  clearlyAutomatedApprover,
  validateApproval,
  loadHumanApprovals,
  approvalConsumed,
  approvalMatches,
  activeHumanApproval,
  humanAuditResultProblems,
  humanApprovalAuditorProblems,
  humanApprovalConsumptionProblems,
  humanGateProblems,
};
