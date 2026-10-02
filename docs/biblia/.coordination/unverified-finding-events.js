'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const lifecycle = require('./lifecycle-core');

const EVENT_ACTIONS = new Set([
  'PRIMARY_CONFIRM',
  'ADVERSARIAL_CONFIRM',
  'REAUDIT_CONFIRM',
  'REJECT',
  'MARK_STALE',
  'SUPERSEDE',
]);

const TERMINAL_STATUSES = new Set(['CONFIRMED', 'REJECTED', 'SUPERSEDED', 'STALE']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRel(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function auditPhaseForAction(action) {
  if (action === 'PRIMARY_CONFIRM') return 'PRIMARY';
  if (action === 'ADVERSARIAL_CONFIRM') return 'ADVERSARIAL';
  if (action === 'REAUDIT_CONFIRM') return 'REAUDIT';
  return null;
}

function transitionFor(status, action) {
  if (TERMINAL_STATUSES.has(status)) return null;
  if (action === 'PRIMARY_CONFIRM' && status === 'UNVERIFIED') return 'CONFIRMED_BY_PRIMARY';
  if ((action === 'ADVERSARIAL_CONFIRM' || action === 'REAUDIT_CONFIRM')
    && status === 'CONFIRMED_BY_PRIMARY') return 'CONFIRMED';
  if (action === 'REJECT' && (status === 'UNVERIFIED' || status === 'CONFIRMED_BY_PRIMARY')) return 'REJECTED';
  if (action === 'MARK_STALE' && (status === 'UNVERIFIED' || status === 'CONFIRMED_BY_PRIMARY')) return 'STALE';
  if (action === 'SUPERSEDE' && (status === 'UNVERIFIED' || status === 'CONFIRMED_BY_PRIMARY')) return 'SUPERSEDED';
  return null;
}

function readJson(root, rel) {
  const normalized = normalizeRel(rel);
  const absolute = path.resolve(root, normalized);
  const rootPrefix = path.resolve(root) + path.sep;
  if (!absolute.startsWith(rootPrefix)) throw new Error('PATH_OUTSIDE_REPO');
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function auditResultProblems(root, finding, event, rel) {
  const problems = [];
  const action = String(event?.action || '');
  const requiredPhase = auditPhaseForAction(action);
  if (!requiredPhase && action !== 'REJECT') return problems;

  const auditPath = normalizeRel(event?.audit_result_path);
  const expectedPrefix = 'docs/biblia/.coordination/audit-results/'
    + String(finding.index).padStart(3, '0') + '/';
  if (!auditPath || !auditPath.startsWith(expectedPrefix) || !auditPath.endsWith('.json')) {
    problems.push(rel + ': audit_result_path inválido para o índice');
    return problems;
  }

  let audit;
  try {
    audit = readJson(root, auditPath);
  } catch (error) {
    problems.push(rel + ': audit_result_path ilegível: ' + error.message);
    return problems;
  }

  if (Number(audit?.index) !== Number(finding.index)) problems.push(rel + ': audit-result pertence a outro índice');
  const phase = String(audit?.phase || '').toUpperCase();
  if (requiredPhase && phase !== requiredPhase) {
    problems.push(rel + ': action ' + action + ' exige audit phase ' + requiredPhase);
  }
  if (action === 'REJECT' && !['PRIMARY','ADVERSARIAL','REAUDIT'].includes(phase)) {
    problems.push(rel + ': REJECT exige audit phase independente');
  }

  const auditor = String(event?.auditor || '').trim();
  if (!auditor) problems.push(rel + ': auditor ausente');
  if (auditor && auditor !== String(audit?.auditor || '').trim()) {
    problems.push(rel + ': auditor diverge do audit-result referenciado');
  }
  if (auditor && auditor === String(finding?.reported_by || '').trim()) {
    problems.push(rel + ': reporter não pode validar/rejeitar o próprio finding');
  }

  const observed = finding?.revision_observed || {};
  if (Number(audit?.schema_version) >= 3) {
    if (audit?.revision_id !== observed.revision_id) problems.push(rel + ': audit-result revision_id diverge do finding');
    if (Number(audit?.audit_epoch) !== Number(observed.audit_epoch)) problems.push(rel + ': audit-result audit_epoch diverge do finding');
    if ((audit?.handoff_id || null) !== (observed.handoff_id || null)) problems.push(rel + ': audit-result handoff_id diverge do finding');
  } else {
    if (String(audit?.source_sha || '').toLowerCase() !== String(observed.test_sha || '').toLowerCase()) {
      problems.push(rel + ': audit-result source_sha diverge do finding');
    }
    if (String(audit?.bible_sha || '').toLowerCase() !== String(observed.bible_sha || '').toLowerCase()) {
      problems.push(rel + ': audit-result bible_sha diverge do finding');
    }
  }

  const completedMs = Date.parse(audit?.completed_at_utc || '');
  const eventMs = Date.parse(event?.at_utc || '');
  if (!Number.isFinite(completedMs) || !Number.isFinite(eventMs) || completedMs > eventMs) {
    problems.push(rel + ': finding event deve ocorrer após o audit-result');
  }

  const mentionsFinding = Array.isArray(audit?.findings)
    && audit.findings.some((item) => String(item).includes(String(finding.id)));
  if (!mentionsFinding) {
    problems.push(rel + ': audit-result deve mencionar explicitamente finding id ' + finding.id);
  }
  return problems;
}

function validateEvent(root, finding, current, event, allFindings, rel = '<event>') {
  const problems = [];
  const action = String(event?.action || '');
  if (event?.schema_version !== 1) problems.push(rel + ': schema_version deve ser 1');
  if (!EVENT_ACTIONS.has(action)) problems.push(rel + ': action inválida');
  if (typeof event?.event_id !== 'string' || !event.event_id.trim()) problems.push(rel + ': event_id ausente');
  if (String(event?.finding_id || '') !== String(finding?.id || '')) problems.push(rel + ': finding_id divergente');
  if (Number(event?.index) !== Number(finding?.index)) problems.push(rel + ': index divergente');
  if (!Number.isFinite(Date.parse(event?.at_utc || ''))) problems.push(rel + ': at_utc inválido');
  if (event?.revision_id !== finding?.revision_observed?.revision_id) problems.push(rel + ': revision_id divergente');
  if (Number(event?.audit_epoch) !== Number(finding?.revision_observed?.audit_epoch)) problems.push(rel + ': audit_epoch divergente');
  if ((event?.handoff_id || null) !== (finding?.revision_observed?.handoff_id || null)) problems.push(rel + ': handoff_id divergente');
  if (typeof event?.actor !== 'string' || !event.actor.trim()) problems.push(rel + ': actor ausente');

  const nextStatus = transitionFor(current.status, action);
  if (!nextStatus) {
    problems.push(rel + ': transição inválida ' + current.status + ' -> ' + action);
  }
  if (event?.status_before !== current.status) problems.push(rel + ': status_before divergente');
  if (nextStatus && event?.status_after !== nextStatus) problems.push(rel + ': status_after divergente');

  problems.push(...auditResultProblems(root, finding, event, rel));

  if ((action === 'ADVERSARIAL_CONFIRM' || action === 'REAUDIT_CONFIRM')
    && String(current.confirmed_by_primary || '').trim()
    && String(current.confirmed_by_primary).trim() === String(event?.auditor || '').trim()) {
    problems.push(rel + ': auditor final deve ser independente do PRIMARY');
  }

  if (action === 'MARK_STALE') {
    const statePath = path.join(root, 'docs', 'biblia', '.state', String(finding.index).padStart(3, '0') + '.json');
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      const snapshot = lifecycle.lifecycleSnapshot(state);
      if (snapshot.revision_id === finding.revision_observed.revision_id) {
        problems.push(rel + ': MARK_STALE exige revisão atual diferente da revisão observada');
      }
    } catch (error) {
      problems.push(rel + ': não foi possível provar staleness: ' + error.message);
    }
  }

  if (action === 'SUPERSEDE') {
    const replacement = String(event?.replacement_finding_id || '').trim();
    if (!replacement) {
      problems.push(rel + ': SUPERSEDE exige replacement_finding_id');
    } else {
      const target = allFindings.get(replacement);
      if (!target || Number(target.index) !== Number(finding.index) || replacement === finding.id) {
        problems.push(rel + ': replacement_finding_id inválido');
      }
    }
  }

  return { problems, nextStatus };
}

function applyEvent(current, event, nextStatus) {
  const next = { ...current, status: nextStatus };
  if (event.action === 'PRIMARY_CONFIRM') {
    next.confirmed_by_primary = event.auditor;
    next.primary_confirmed_at_utc = event.at_utc;
  } else if (event.action === 'ADVERSARIAL_CONFIRM') {
    next.confirmed_by_adversarial = event.auditor;
    next.adversarial_confirmed_at_utc = event.at_utc;
  } else if (event.action === 'REAUDIT_CONFIRM') {
    next.confirmed_by_reaudit = event.auditor;
    next.reaudit_confirmed_at_utc = event.at_utc;
  } else if (event.action === 'REJECT') {
    next.rejected_by = event.auditor;
    next.rejected_at_utc = event.at_utc;
  } else if (event.action === 'MARK_STALE') {
    next.stale_at_utc = event.at_utc;
  } else if (event.action === 'SUPERSEDE') {
    next.superseded_at_utc = event.at_utc;
    next.superseded_by = event.replacement_finding_id;
  }
  return next;
}

function loadFindingEvents(root, baseFindings) {
  const dir = path.join(root, 'docs', 'biblia', '.coordination', 'unverified-finding-events');
  const problems = [];
  const events = [];
  const ids = new Set();
  for (const absolute of walk(dir)) {
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push(rel + ': finding event deve ser JSON');
      continue;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
      if (ids.has(raw?.event_id)) problems.push(rel + ': event_id duplicado');
      if (raw?.event_id) ids.add(raw.event_id);
      events.push({ ...raw, path: rel });
    } catch (error) {
      problems.push(rel + ': JSON inválido: ' + error.message);
    }
  }

  events.sort((a, b) => (
    Date.parse(a.at_utc || '') - Date.parse(b.at_utc || '')
    || String(a.path).localeCompare(String(b.path))
  ));

  const baseById = new Map((baseFindings || []).map((finding) => [finding.id, finding]));
  const currentById = new Map((baseFindings || []).map((finding) => [finding.id, { ...finding }]));
  for (const event of events) {
    const finding = baseById.get(event.finding_id);
    if (!finding) {
      problems.push((event.path || '<event>') + ': finding_id inexistente: ' + event.finding_id);
      continue;
    }
    const current = currentById.get(event.finding_id);
    const checked = validateEvent(root, finding, current, event, baseById, event.path || '<event>');
    problems.push(...checked.problems);
    if (!checked.problems.length && checked.nextStatus) {
      const applied = applyEvent(current, event, checked.nextStatus);
      applied.transition_events = [...(current.transition_events || []), event.path];
      currentById.set(event.finding_id, applied);
    }
  }

  return {
    findings: [...currentById.values()],
    events,
    problems,
  };
}

function buildEvent(root, finding, input, allFindings = []) {
  const action = String(input?.action || '').toUpperCase();
  const actor = String(input?.actor || input?.auditor || '').trim();
  const at = String(input?.at_utc || '');
  const current = { ...finding };
  const nextStatus = transitionFor(current.status, action);
  if (!nextStatus) throw new Error('FINDING_TRANSITION_INVALID:' + current.status + '->' + action);

  let auditor = String(input?.auditor || '').trim() || null;
  if (auditPhaseForAction(action) || action === 'REJECT') {
    if (!auditor) throw new Error('AUDITOR_REQUIRED');
  }

  const seed = JSON.stringify({
    finding_id: finding.id,
    action,
    actor,
    auditor,
    at_utc: at,
    audit_result_path: normalizeRel(input?.audit_result_path || ''),
    replacement_finding_id: input?.replacement_finding_id || null,
  });
  const event = {
    schema_version: 1,
    event_id: finding.id + '-EV-' + sha256(seed).slice(0, 16),
    finding_id: finding.id,
    index: finding.index,
    action,
    actor,
    auditor,
    at_utc: at,
    revision_id: finding.revision_observed.revision_id,
    audit_epoch: finding.revision_observed.audit_epoch,
    handoff_id: finding.revision_observed.handoff_id,
    audit_result_path: input?.audit_result_path ? normalizeRel(input.audit_result_path) : null,
    replacement_finding_id: input?.replacement_finding_id || null,
    reason: String(input?.reason || ''),
    status_before: current.status,
    status_after: nextStatus,
  };
  const checked = validateEvent(
    root,
    finding,
    current,
    event,
    new Map((allFindings || [finding]).map((item) => [item.id, item])),
    '<new-event>'
  );
  if (checked.problems.length) throw new Error(checked.problems.join('; '));
  return event;
}

module.exports = {
  EVENT_ACTIONS,
  TERMINAL_STATUSES,
  auditPhaseForAction,
  transitionFor,
  auditResultProblems,
  validateEvent,
  applyEvent,
  loadFindingEvents,
  buildEvent,
};
