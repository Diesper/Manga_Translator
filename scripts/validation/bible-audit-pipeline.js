'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_PHASES = new Set(['PRIMARY', 'ADVERSARIAL', 'REAUDIT']);
const AUDIT_VERDICTS = new Set(['APPROVED', 'CHANGES_REQUIRED']);

const slash = (value) => value.replace(/\\/g, '/');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function phaseFromPath(value) {
  const phase = String(value || '').toLowerCase();
  if (phase === 'primary') return 'PRIMARY';
  if (phase === 'adversarial') return 'ADVERSARIAL';
  if (phase === 'reaudit') return 'REAUDIT';
  return null;
}

function legacyAuditForState(legacyAudits, state) {
  const entry = legacyAudits instanceof Map ? legacyAudits.get(state.index) : null;
  if (!entry || !entry.sourceSha || !state.source_sha || !state.source_sha.startsWith(entry.sourceSha)) return null;
  if (!AUDIT_VERDICTS.has(entry.result)) return null;
  return {
    index: state.index,
    phase: 'PRIMARY',
    auditor: null,
    file: state.file,
    bible: state.bible,
    source_sha: state.source_sha,
    verdict: entry.result,
    completed_at_utc: null,
    completed_at_ms: -1,
    path: 'docs/biblia/AUDITORIA.md',
    legacy: true,
  };
}

function loadAuditResults(root, states = []) {
  const resultRoot = path.join(root, 'docs', 'biblia', '.coordination', 'audit-results');
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  const problems = [];
  const records = [];

  for (const absolute of walk(resultRoot)) {
    const rel = slash(path.relative(root, absolute));
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push('audit-result arquivo não-JSON: ' + rel);
      continue;
    }

    const match = /^docs\/biblia\/\.coordination\/audit-results\/(\d{3})\/(primary|adversarial|reaudit)\/([^/]+\.json)$/i.exec(rel);
    if (!match) {
      problems.push('audit-result path inválido: ' + rel);
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch (error) {
      problems.push('audit-result JSON inválido: ' + rel + ': ' + error.message);
      continue;
    }

    const pathIndex = Number(match[1]);
    const pathPhase = phaseFromPath(match[2]);
    const index = Number(raw.index);
    const phase = String(raw.phase || '').toUpperCase();
    const verdict = String(raw.verdict || '').toUpperCase();
    const completedAt = raw.completed_at_utc;
    const completedAtMs = typeof completedAt === 'string' ? Date.parse(completedAt) : NaN;

    if (raw.schema_version !== 1) problems.push('audit-result schema_version deve ser 1: ' + rel);
    if (!Number.isInteger(index) || index < 1 || index > 233) problems.push('audit-result INDEX inválido: ' + rel);
    if (index !== pathIndex) problems.push('audit-result path/index divergente: ' + rel);
    if (!AUDIT_PHASES.has(phase) || phase !== pathPhase) problems.push('audit-result PHASE divergente/inválida: ' + rel);
    if (!AUDIT_VERDICTS.has(verdict)) problems.push('audit-result VERDICT inválido: ' + rel);
    if (typeof raw.auditor !== 'string' || !raw.auditor.trim()) problems.push('audit-result AUDITOR ausente: ' + rel);
    if (typeof raw.file !== 'string' || !raw.file) problems.push('audit-result FILE ausente: ' + rel);
    if (typeof raw.bible !== 'string' || !raw.bible) problems.push('audit-result BIBLE ausente: ' + rel);
    if (!/^[0-9a-f]{40}$/i.test(raw.source_sha || '')) problems.push('audit-result SOURCE_SHA inválido: ' + rel);
    if (!Number.isFinite(completedAtMs)) problems.push('audit-result COMPLETED_AT_UTC inválido: ' + rel);
    if (raw.findings !== undefined && !Array.isArray(raw.findings)) problems.push('audit-result FINDINGS deve ser array: ' + rel);

    const state = stateByIndex.get(index);
    if (state) {
      if (raw.file !== state.file) problems.push('audit-result FILE diverge do state: ' + rel);
      if (raw.bible !== state.bible) problems.push('audit-result BIBLE diverge do state: ' + rel);
    }

    records.push({
      index,
      phase,
      auditor: typeof raw.auditor === 'string' ? raw.auditor.trim() : '',
      file: raw.file,
      bible: raw.bible,
      source_sha: raw.source_sha,
      verdict,
      findings: Array.isArray(raw.findings) ? raw.findings : [],
      completed_at_utc: completedAt,
      completed_at_ms: Number.isFinite(completedAtMs) ? completedAtMs : -1,
      path: rel,
      legacy: false,
    });
  }

  records.sort((a, b) => (
    a.index - b.index
    || a.phase.localeCompare(b.phase)
    || a.completed_at_ms - b.completed_at_ms
    || a.path.localeCompare(b.path)
  ));

  return { records, problems };
}

function latestFor(records, index, phase, sourceSha) {
  const candidates = records.filter((record) => (
    record.index === index
    && record.phase === phase
    && record.source_sha === sourceSha
  )).sort((a, b) => (
    (a.completed_at_ms || -1) - (b.completed_at_ms || -1)
    || String(a.path || '').localeCompare(String(b.path || ''))
  ));
  if (!candidates.length) return null;
  return candidates[candidates.length - 1];
}

function resolveAuditPipeline(state, records = [], legacyAudits = new Map()) {
  const current = records.filter((record) => record.index === state.index && record.source_sha === state.source_sha);
  const primary = latestFor(current, state.index, 'PRIMARY', state.source_sha) || legacyAuditForState(legacyAudits, state);
  const adversarial = latestFor(current, state.index, 'ADVERSARIAL', state.source_sha);
  const reaudit = latestFor(current, state.index, 'REAUDIT', state.source_sha);
  const problems = [];

  if (adversarial && !primary) {
    problems.push('ADVERSARIAL sem PRIMARY válido para o SHA atual');
  }
  if (primary?.auditor && adversarial?.auditor && primary.auditor === adversarial.auditor) {
    problems.push('PRIMARY e ADVERSARIAL devem ter auditores diferentes');
  }

  const divergent = Boolean(primary && adversarial && primary.verdict !== adversarial.verdict);
  if (reaudit && !divergent) {
    problems.push('REAUDIT só é válido quando PRIMARY e ADVERSARIAL divergem');
  }
  if (reaudit?.auditor && (
    reaudit.auditor === primary?.auditor
    || reaudit.auditor === adversarial?.auditor
  )) {
    problems.push('REAUDIT deve ser independente dos auditores PRIMARY e ADVERSARIAL');
  }

  let decision = 'WAITING_PRIMARY';
  if (primary && !adversarial) {
    decision = 'WAITING_ADVERSARIAL';
  } else if (primary && adversarial) {
    if (primary.verdict === adversarial.verdict) {
      decision = primary.verdict;
    } else if (!reaudit) {
      decision = 'REAUDIT_REQUIRED';
    } else {
      decision = reaudit.verdict;
    }
  }

  return {
    index: state.index,
    source_sha: state.source_sha,
    primary,
    adversarial,
    reaudit,
    divergent,
    decision,
    problems,
    hasDistributed: current.length > 0,
  };
}

function evaluateAuditPipelines(states, records = [], legacyAudits = new Map()) {
  const byIndex = new Map();
  const problems = [];

  for (const state of states) {
    const pipeline = resolveAuditPipeline(state, records, legacyAudits);
    byIndex.set(state.index, pipeline);
    for (const problem of pipeline.problems) {
      problems.push('pipeline #' + String(state.index).padStart(3, '0') + ': ' + problem);
    }
  }

  return { byIndex, problems };
}

function shortIndexList(items, limit = 25) {
  const values = items.map((item) => String(item.index).padStart(3, '0'));
  if (values.length <= limit) return values.join(', ');
  return values.slice(0, limit).join(', ') + ', ... (+' + (values.length - limit) + ')';
}

function pipelineMergeBlockers(states, evaluation) {
  const buckets = {
    WAITING_PRIMARY: [],
    WAITING_ADVERSARIAL: [],
    REAUDIT_REQUIRED: [],
    CHANGES_REQUIRED: [],
    INVALID: [],
  };

  for (const state of states) {
    const pipeline = evaluation.byIndex.get(state.index);
    if (!pipeline) {
      buckets.INVALID.push(state);
      continue;
    }
    if (pipeline.problems.length) buckets.INVALID.push(state);
    if (pipeline.decision !== 'APPROVED') {
      if (!buckets[pipeline.decision]) buckets.INVALID.push(state);
      else buckets[pipeline.decision].push(state);
    }
  }

  const blockers = [];
  if (buckets.WAITING_PRIMARY.length) {
    blockers.push('auditoria primária pendente=' + buckets.WAITING_PRIMARY.length + ': ' + shortIndexList(buckets.WAITING_PRIMARY));
  }
  if (buckets.WAITING_ADVERSARIAL.length) {
    blockers.push('auditoria adversarial obrigatória pendente=' + buckets.WAITING_ADVERSARIAL.length + ': ' + shortIndexList(buckets.WAITING_ADVERSARIAL));
  }
  if (buckets.REAUDIT_REQUIRED.length) {
    blockers.push('reauditoria por divergência pendente=' + buckets.REAUDIT_REQUIRED.length + ': ' + shortIndexList(buckets.REAUDIT_REQUIRED));
  }
  if (buckets.CHANGES_REQUIRED.length) {
    blockers.push('auditoria exige correção=' + buckets.CHANGES_REQUIRED.length + ': ' + shortIndexList(buckets.CHANGES_REQUIRED));
  }
  if (buckets.INVALID.length) {
    const unique = [...new Map(buckets.INVALID.map((state) => [state.index, state])).values()];
    blockers.push('pipeline de auditoria inválido=' + unique.length + ': ' + shortIndexList(unique));
  }
  return blockers;
}

function displayAuditStatus(pipeline, legacyEntry = null) {
  if (pipeline?.hasDistributed) return pipeline.decision;
  if (legacyEntry?.result) return legacyEntry.result;
  return 'NOT_AUDITED';
}

module.exports = {
  AUDIT_PHASES,
  AUDIT_VERDICTS,
  loadAuditResults,
  resolveAuditPipeline,
  evaluateAuditPipelines,
  pipelineMergeBlockers,
  displayAuditStatus,
};
