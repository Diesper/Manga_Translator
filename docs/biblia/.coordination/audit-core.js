'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const lifecycleCore = require('./lifecycle-core');

const AUDIT_PHASES = new Set(['PRIMARY', 'ADVERSARIAL', 'REAUDIT']);
const AUDIT_VERDICTS = new Set(['APPROVED', 'CHANGES_REQUIRED']);
const BASELINE_RELATIVE = 'docs/biblia/.coordination/audit-bible-baseline.json';
// Migração: a correção #191 já estava aberta às 05:08:00Z quando esta trava foi introduzida.
// Handoffs posteriores ficam protegidos contra reabertura editorial espontânea.
const HANDOFF_GUARD_EFFECTIVE_AT_UTC = '2026-10-02T05:08:00.001Z';

const slash = (value) => String(value || '').replace(/\\/g, '/');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function gitBlobShaBuffer(buffer) {
  const payload = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const header = Buffer.from('blob ' + payload.length + '\0');
  return crypto.createHash('sha1').update(header).update(payload).digest('hex');
}

function fileBlobSha(file) {
  if (!fs.existsSync(file)) return null;
  return gitBlobShaBuffer(fs.readFileSync(file));
}

const gitSnapshotCache = new Map();

function loadGitSnapshot(root) {
  const key = path.resolve(root);
  if (gitSnapshotCache.has(key)) return gitSnapshotCache.get(key);

  const index = new Map();
  const dirty = new Set();

  const indexedOutput = childProcess.execFileSync(
    'git',
    ['ls-files', '-s', '-z', '--', 'docs/biblia'],
    { cwd: key, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  for (const record of indexedOutput.split('\0')) {
    if (!record) continue;
    const match = /^\d+\s+([0-9a-f]{40})\s+\d+\t([\s\S]+)$/i.exec(record);
    if (match) index.set(slash(match[2]), match[1].toLowerCase());
  }

  // git diff aplica os mesmos clean filters do índice, portanto um checkout
  // CRLF limpo no Windows não aparece como modificado. Só os paths realmente
  // diferentes do índice precisam de hash-object individual.
  const dirtyOutput = childProcess.execFileSync(
    'git',
    ['diff', '--name-only', '-z', '--no-ext-diff', '--', 'docs/biblia'],
    { cwd: key, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
  for (const rel of dirtyOutput.split('\0')) {
    if (rel) dirty.add(slash(rel));
  }

  const snapshot = { index, dirty };
  gitSnapshotCache.set(key, snapshot);
  return snapshot;
}

function clearGitSnapshotCache(root = null) {
  if (root) gitSnapshotCache.delete(path.resolve(root));
  else gitSnapshotCache.clear();
}

function gitWorkingTreeBlobSha(root, relativePath) {
  if (!root || !relativePath) return null;
  const rel = slash(relativePath);
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return null;
  try {
    const snapshot = loadGitSnapshot(root);
    const indexedSha = snapshot.index.get(rel);

    // Caminho comum (CI/checkout limpo): zero processos Git por Bíblia.
    if (indexedSha && !snapshot.dirty.has(rel)) return indexedSha;

    // Caminho modificado/untracked: aplica clean filters/atributos do Git para
    // obter o blob que seria versionado, preservando binding correto da revisão.
    const output = childProcess.execFileSync(
      'git',
      ['hash-object', '--path=' + rel, absolute],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return /^[0-9a-f]{40}$/i.test(output) ? output.toLowerCase() : null;
  } catch (_error) {
    // Fixtures/self-tests fora de um repositório Git continuam suportados.
    return fileBlobSha(absolute);
  }
}

function loadBibleBaseline(root) {
  const absolute = path.join(root, BASELINE_RELATIVE);
  if (!fs.existsSync(absolute)) return null;
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (parsed.schema_version !== 1 || !parsed.bibles || typeof parsed.bibles !== 'object') {
    throw new Error('audit bible baseline inválida: ' + BASELINE_RELATIVE);
  }
  return parsed;
}

function productionFilesForState(state) {
  const paths = new Set();
  const add = (value) => {
    const normalized = slash(value);
    if (normalized && normalized !== slash(state?.file)) paths.add(normalized);
  };
  if (Array.isArray(state?.production_files)) {
    for (const value of state.production_files) add(value);
  }
  add(state?.production_file);
  for (const request of Array.isArray(state?.audit_requests) ? state.audit_requests : []) {
    add(request?.related_production_file);
    const target = slash(request?.target_file);
    if (target && target !== slash(state?.file)
      && !target.startsWith('docs/biblia/')
      && !target.startsWith('tests/')) add(target);
  }
  return [...paths].sort();
}

function currentProductionSha(root, state) {
  if (!root || !state) return lifecycleCore.revisionIdentity(state).production_sha;
  const entries = [];
  for (const relativePath of productionFilesForState(state)) {
    const sha = gitWorkingTreeBlobSha(root, relativePath);
    if (sha) entries.push([relativePath, sha]);
  }
  if (!entries.length) {
    return lifecycleCore.revisionIdentity(state).production_sha;
  }
  return gitBlobShaBuffer(Buffer.from(JSON.stringify(entries)));
}

function currentBibleSha(root, state) {
  // Em validação real, o conteúdo da Bíblia é a autoridade. O hash deve ser
  // calculado como Git o versionaria, não a partir dos bytes EOL-específicos
  // do working tree (CRLF no Windows vs LF no POSIX).
  if (root && state?.bible) return gitWorkingTreeBlobSha(root, state.bible);
  if (state && /^[0-9a-f]{40}$/i.test(state.bible_sha || '')) return state.bible_sha;
  return null;
}

function baselineEntryFor(state, baseline) {
  if (!baseline || !state || !Number.isInteger(Number(state.index))) return null;
  return baseline.bibles?.[String(Number(state.index)).padStart(3, '0')] || null;
}

function recordMatchesCurrentBible(record, state, options = {}) {
  const current = currentBibleSha(options.root, state);
  if (!current) return true;

  if (/^[0-9a-f]{40}$/i.test(record?.bible_sha || '')) {
    return String(record.bible_sha).toLowerCase() === current.toLowerCase();
  }

  // Compatibilidade pré-migração/fixtures: sem baseline instalada ainda
  // não existe uma revisão documental canônica contra a qual comparar.
  if (!options.baseline) return true;

  // Compatibilidade de migração: schema v1 não conhecia bible_sha.
  // Ele só permanece válido enquanto a Bíblia continuar byte-a-byte igual
  // à baseline capturada no início da migração distribuída.
  const entry = baselineEntryFor(state, options.baseline);
  return Boolean(
    entry
    && entry.bible === state.bible
    && /^[0-9a-f]{40}$/i.test(entry.bible_sha || '')
    && entry.bible_sha.toLowerCase() === current.toLowerCase()
  );
}

function currentLifecycleSnapshot(state, options = {}) {
  const bibleSha = currentBibleSha(options.root, state);
  return lifecycleCore.lifecycleSnapshot(state, {
    bible_sha: bibleSha || state?.bible_sha || null,
  });
}

function handoffRequiresAuditSchemaV3(state, options = {}) {
  const snapshot = currentLifecycleSnapshot(state, options);
  const handoffMs = Date.parse(snapshot.latest_handoff_at_utc || '');
  const effectiveMs = Date.parse(
    options.lifecycleEffectiveAtUtc || lifecycleCore.LIFECYCLE_POLICY_EFFECTIVE_AT_UTC
  );
  return Number.isFinite(handoffMs)
    && Number.isFinite(effectiveMs)
    && handoffMs >= effectiveMs;
}

function recordMatchesLifecycle(record, state, options = {}) {
  const snapshot = currentLifecycleSnapshot(state, options);
  const requiresV3 = handoffRequiresAuditSchemaV3(state, options);

  if (requiresV3 && Number(record?.schema_version) !== 3) return false;
  if (Number(record?.schema_version) !== 3) return true;

  return Number(record.audit_epoch) === Number(snapshot.audit_epoch)
    && String(record.handoff_id || '') === String(snapshot.handoff_id || '')
    && (record.production_sha || null) === (snapshot.production_sha || null)
    && String(record.test_sha || '').toLowerCase() === String(snapshot.test_sha || '').toLowerCase()
    && String(record.bible_sha || '').toLowerCase() === String(snapshot.bible_sha || '').toLowerCase()
    && String(record.revision_id || '').toLowerCase() === String(snapshot.revision_id || '').toLowerCase();
}

function phaseFromPath(value) {
  const phase = String(value || '').toLowerCase();
  if (phase === 'primary') return 'PRIMARY';
  if (phase === 'adversarial') return 'ADVERSARIAL';
  if (phase === 'reaudit') return 'REAUDIT';
  return null;
}

function legacyAuditForState(legacyAudits, state, options = {}) {
  const entry = legacyAudits instanceof Map ? legacyAudits.get(state.index) : null;
  const verdict = entry?.result || entry?.verdict;
  if (!entry || !entry.sourceSha || !state.source_sha || !state.source_sha.startsWith(entry.sourceSha)) return null;
  if (!AUDIT_VERDICTS.has(verdict)) return null;

  // Registros legados também ficam vinculados à revisão documental da baseline.
  if (!recordMatchesCurrentBible({ bible_sha: null }, state, options)) return null;

  return {
    index: state.index,
    phase: 'PRIMARY',
    auditor: null,
    file: state.file,
    bible: state.bible,
    source_sha: state.source_sha,
    bible_sha: currentBibleSha(options.root, state),
    verdict,
    completed_at_utc: null,
    completed_at_ms: -1,
    path: 'docs/biblia/AUDITORIA.md',
    legacy: true,
  };
}

function loadAuditResults(root, states = []) {
  const resultRoot = path.join(root, 'docs', 'biblia', '.coordination', 'audit-results');
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  const baseline = loadBibleBaseline(root);
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

    const schemaVersion = Number(raw.schema_version);
    const pathIndex = Number(match[1]);
    const pathPhase = phaseFromPath(match[2]);
    const index = Number(raw.index);
    const phase = String(raw.phase || '').toUpperCase();
    const verdict = String(raw.verdict || '').toUpperCase();
    const completedAt = raw.completed_at_utc;
    const completedAtMs = typeof completedAt === 'string' ? Date.parse(completedAt) : NaN;

    if (![1, 2, 3].includes(schemaVersion)) problems.push('audit-result schema_version deve ser 1, 2 ou 3: ' + rel);
    if (!Number.isInteger(index) || index < 1 || index > 233) problems.push('audit-result INDEX inválido: ' + rel);
    if (index !== pathIndex) problems.push('audit-result path/index divergente: ' + rel);
    if (!AUDIT_PHASES.has(phase) || phase !== pathPhase) problems.push('audit-result PHASE divergente/inválida: ' + rel);
    if (!AUDIT_VERDICTS.has(verdict)) problems.push('audit-result VERDICT inválido: ' + rel);
    if (typeof raw.auditor !== 'string' || !raw.auditor.trim()) problems.push('audit-result AUDITOR ausente: ' + rel);
    if (typeof raw.file !== 'string' || !raw.file) problems.push('audit-result FILE ausente: ' + rel);
    if (typeof raw.bible !== 'string' || !raw.bible) problems.push('audit-result BIBLE ausente: ' + rel);
    if (!/^[0-9a-f]{40}$/i.test(raw.source_sha || '')) problems.push('audit-result SOURCE_SHA inválido: ' + rel);
    if (schemaVersion === 2 && !/^[0-9a-f]{40}$/i.test(raw.bible_sha || '')) {
      problems.push('audit-result schema v2 exige BIBLE_SHA válido: ' + rel);
    }
    if (schemaVersion === 3) {
      if (!/^[0-9a-f]{40}$/i.test(raw.bible_sha || '')) problems.push('audit-result schema v3 exige BIBLE_SHA válido: ' + rel);
      if (!/^[0-9a-f]{40}$/i.test(raw.test_sha || '')) problems.push('audit-result schema v3 exige TEST_SHA válido: ' + rel);
      if (!Object.prototype.hasOwnProperty.call(raw, 'production_sha')
        || (raw.production_sha !== null && !/^[0-9a-f]{40}$/i.test(raw.production_sha || ''))) {
        problems.push('audit-result schema v3 exige PRODUCTION_SHA null ou SHA válido: ' + rel);
      }
      if (!Number.isInteger(Number(raw.audit_epoch)) || Number(raw.audit_epoch) < 1) {
        problems.push('audit-result schema v3 exige AUDIT_EPOCH inteiro >= 1: ' + rel);
      }
      if (typeof raw.handoff_id !== 'string' || !raw.handoff_id.trim()) {
        problems.push('audit-result schema v3 exige HANDOFF_ID: ' + rel);
      }
      if (!/^[0-9a-f]{64}$/i.test(raw.revision_id || '')) {
        problems.push('audit-result schema v3 exige REVISION_ID SHA-256: ' + rel);
      }
      if (/^[0-9a-f]{40}$/i.test(raw.test_sha || '')
        && /^[0-9a-f]{40}$/i.test(raw.source_sha || '')
        && String(raw.test_sha).toLowerCase() !== String(raw.source_sha).toLowerCase()) {
        problems.push('audit-result schema v3 TEST_SHA deve corresponder ao SOURCE_SHA auditado: ' + rel);
      }
    }
    if (raw.bible_sha !== undefined && raw.bible_sha !== null && !/^[0-9a-f]{40}$/i.test(raw.bible_sha || '')) {
      problems.push('audit-result BIBLE_SHA inválido: ' + rel);
    }
    if (!Number.isFinite(completedAtMs)) problems.push('audit-result COMPLETED_AT_UTC inválido: ' + rel);
    if (raw.findings !== undefined && !Array.isArray(raw.findings)) problems.push('audit-result FINDINGS deve ser array: ' + rel);

    const state = stateByIndex.get(index);
    if (state) {
      if (raw.file !== state.file) problems.push('audit-result FILE diverge do state: ' + rel);
      if (raw.bible !== state.bible) problems.push('audit-result BIBLE diverge do state: ' + rel);
    }
    if (state && handoffRequiresAuditSchemaV3(state, { root })
      && schemaVersion !== 3
      && Number.isFinite(completedAtMs)) {
      const snapshot = currentLifecycleSnapshot(state, { root });
      const handoffMs = Date.parse(snapshot.latest_handoff_at_utc || '');
      if (Number.isFinite(handoffMs) && completedAtMs > handoffMs) {
        problems.push('audit-result pós-handoff lifecycle exige schema v3: ' + rel);
      }
    }
    if (state && schemaVersion === 3 && Number.isFinite(completedAtMs)) {
      const snapshot = currentLifecycleSnapshot(state, { root });
      const handoffMs = Date.parse(snapshot.latest_handoff_at_utc || '');
      if (Number.isFinite(handoffMs) && completedAtMs > handoffMs) {
        const mismatches = [];
        if (Number(raw.audit_epoch) !== Number(snapshot.audit_epoch)) mismatches.push('AUDIT_EPOCH');
        if (String(raw.handoff_id || '') !== String(snapshot.handoff_id || '')) mismatches.push('HANDOFF_ID');
        if ((raw.production_sha || null) !== (snapshot.production_sha || null)) mismatches.push('PRODUCTION_SHA');
        if (String(raw.test_sha || '').toLowerCase() !== String(snapshot.test_sha || '').toLowerCase()) mismatches.push('TEST_SHA');
        if (String(raw.bible_sha || '').toLowerCase() !== String(snapshot.bible_sha || '').toLowerCase()) mismatches.push('BIBLE_SHA');
        if (String(raw.revision_id || '').toLowerCase() !== String(snapshot.revision_id || '').toLowerCase()) mismatches.push('REVISION_ID');
        if (mismatches.length) {
          problems.push('audit-result schema v3 diverge do lifecycle atual (' + mismatches.join(',') + '): ' + rel);
        }
      }
    }

    records.push({
      schema_version: schemaVersion,
      index,
      phase,
      auditor: typeof raw.auditor === 'string' ? raw.auditor.trim() : '',
      file: raw.file,
      bible: raw.bible,
      source_sha: raw.source_sha,
      production_sha: raw.production_sha === undefined ? null : raw.production_sha,
      test_sha: raw.test_sha || null,
      bible_sha: raw.bible_sha || null,
      audit_epoch: raw.audit_epoch === undefined ? null : Number(raw.audit_epoch),
      handoff_id: raw.handoff_id || null,
      revision_id: raw.revision_id || null,
      human_approval_id: raw.human_approval_id || null,
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

  return { records, problems, baseline };
}

function latestProtectedHandoff(state, options = {}) {
  const effectiveAtUtc = options.effectiveAtUtc || HANDOFF_GUARD_EFFECTIVE_AT_UTC;
  const effectiveAtMs = Date.parse(effectiveAtUtc);
  if (!Number.isFinite(effectiveAtMs)) return null;

  const currentSource = String(state?.source_sha || '').toLowerCase();
  const currentBible = String(currentBibleSha(options.root || null, state) || state?.bible_sha || '').toLowerCase();
  const history = Array.isArray(state?.history) ? state.history : [];

  const candidates = history
    .map((entry, position) => ({
      entry,
      position,
      at_ms: Date.parse(entry?.at_utc || ''),
    }))
    .filter(({ entry, at_ms }) => (
      (entry?.type === lifecycleCore.HANDOFF_EVENT
        || entry?.type === lifecycleCore.REVISION_REFRESH_EVENT)
      && Number.isFinite(at_ms)
      && at_ms >= effectiveAtMs
      && String(entry?.source_sha || '').toLowerCase() === currentSource
      && String(entry?.bible_sha || '').toLowerCase() === currentBible
    ))
    .sort((a, b) => a.position - b.position || a.at_ms - b.at_ms);

  return candidates.length ? candidates[candidates.length - 1] : null;
}

function latestFor(records, state, phase, options = {}) {
  const candidates = records.filter((record) => (
    record.index === state.index
    && record.phase === phase
    && record.source_sha === state.source_sha
    && recordMatchesCurrentBible(record, state, options)
    && recordMatchesLifecycle(record, state, options)
  )).sort((a, b) => (
    (a.completed_at_ms || -1) - (b.completed_at_ms || -1)
    || String(a.path || '').localeCompare(String(b.path || ''))
  ));
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function resolveAuditPipeline(state, records = [], legacyAudits = new Map(), options = {}) {
  const baseline = options.baseline || (options.root ? loadBibleBaseline(options.root) : null);
  const versionOptions = { ...options, baseline };
  const handoff = latestProtectedHandoff(state, versionOptions);
  const revisionRecords = handoff
    ? records.filter((record) => Number.isFinite(record?.completed_at_ms) && record.completed_at_ms > handoff.at_ms)
    : records;
  const primary = latestFor(revisionRecords, state, 'PRIMARY', versionOptions)
    || (handoff ? null : legacyAuditForState(legacyAudits, state, versionOptions));
  const adversarial = latestFor(revisionRecords, state, 'ADVERSARIAL', versionOptions);
  const reaudit = latestFor(revisionRecords, state, 'REAUDIT', versionOptions);
  const problems = [];

  if (adversarial && !primary) problems.push('ADVERSARIAL sem PRIMARY válido para source+bible atuais');
  if (primary?.auditor && adversarial?.auditor && primary.auditor === adversarial.auditor) {
    problems.push('PRIMARY e ADVERSARIAL devem ter auditores diferentes');
  }

  const divergent = Boolean(primary && adversarial && primary.verdict !== adversarial.verdict);
  if (reaudit && !divergent) problems.push('REAUDIT só é válido quando PRIMARY e ADVERSARIAL divergem');
  if (reaudit?.auditor && (
    reaudit.auditor === primary?.auditor
    || reaudit.auditor === adversarial?.auditor
  )) {
    problems.push('REAUDIT deve ser independente dos auditores PRIMARY e ADVERSARIAL');
  }

  let decision = 'WAITING_PRIMARY';
  let nextPhase = 'PRIMARY';
  if (primary && !adversarial) {
    decision = 'WAITING_ADVERSARIAL';
    nextPhase = 'ADVERSARIAL';
  } else if (primary && adversarial) {
    if (primary.verdict === adversarial.verdict) {
      decision = primary.verdict;
      nextPhase = primary.verdict === 'APPROVED' ? null : 'CORRECTION_REQUIRED';
    } else if (!reaudit) {
      decision = 'REAUDIT_REQUIRED';
      nextPhase = 'REAUDIT';
    } else {
      decision = reaudit.verdict;
      nextPhase = reaudit.verdict === 'APPROVED' ? null : 'CORRECTION_REQUIRED';
    }
  }

  const currentDistributed = revisionRecords.filter((record) => (
    record.index === state.index
    && record.source_sha === state.source_sha
    && recordMatchesCurrentBible(record, state, versionOptions)
    && recordMatchesLifecycle(record, state, versionOptions)
  ));

  return {
    index: state.index,
    file: state.file,
    source_sha: state.source_sha,
    bible_sha: currentBibleSha(options.root, state),
    status: state.status,
    primary,
    adversarial,
    reaudit,
    divergent,
    decision,
    next_phase: nextPhase,
    problems,
    handoff_after_utc: handoff?.entry?.at_utc || null,
    audit_epoch: currentLifecycleSnapshot(state, versionOptions).audit_epoch,
    handoff_id: currentLifecycleSnapshot(state, versionOptions).handoff_id,
    revision_id: currentLifecycleSnapshot(state, versionOptions).revision_id,
    audit_schema_v3_required: handoffRequiresAuditSchemaV3(state, versionOptions),
    hasDistributed: currentDistributed.length > 0,
  };
}

function nextAuditPhase(pipeline) {
  if (!pipeline?.primary) return 'PRIMARY';
  if (!pipeline.adversarial) return 'ADVERSARIAL';
  if (pipeline.divergent && !pipeline.reaudit) return 'REAUDIT';
  return null;
}

function evaluateAuditPipelines(states, records = [], legacyAudits = new Map(), options = {}) {
  const baseline = options.baseline || (options.root ? loadBibleBaseline(options.root) : null);
  const byIndex = new Map();
  const problems = [];
  for (const state of states) {
    const pipeline = resolveAuditPipeline(state, records, legacyAudits, { ...options, baseline });
    byIndex.set(state.index, pipeline);
    for (const problem of pipeline.problems) {
      problems.push('pipeline #' + String(state.index).padStart(3, '0') + ': ' + problem);
    }
  }
  return { byIndex, problems, baseline };
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
  if (buckets.WAITING_PRIMARY.length) blockers.push('auditoria primária pendente=' + buckets.WAITING_PRIMARY.length + ': ' + shortIndexList(buckets.WAITING_PRIMARY));
  if (buckets.WAITING_ADVERSARIAL.length) blockers.push('auditoria adversarial obrigatória pendente=' + buckets.WAITING_ADVERSARIAL.length + ': ' + shortIndexList(buckets.WAITING_ADVERSARIAL));
  if (buckets.REAUDIT_REQUIRED.length) blockers.push('reauditoria por divergência pendente=' + buckets.REAUDIT_REQUIRED.length + ': ' + shortIndexList(buckets.REAUDIT_REQUIRED));
  if (buckets.CHANGES_REQUIRED.length) blockers.push('auditoria exige correção=' + buckets.CHANGES_REQUIRED.length + ': ' + shortIndexList(buckets.CHANGES_REQUIRED));
  if (buckets.INVALID.length) {
    const unique = [...new Map(buckets.INVALID.map((state) => [state.index, state])).values()];
    blockers.push('pipeline de auditoria inválido=' + unique.length + ': ' + shortIndexList(unique));
  }
  return blockers;
}

function postHandoffCorrectionProblems(states, records = [], options = {}) {
  const effectiveAtUtc = options.effectiveAtUtc || HANDOFF_GUARD_EFFECTIVE_AT_UTC;
  const effectiveAtMs = Date.parse(effectiveAtUtc);
  if (!Number.isFinite(effectiveAtMs)) {
    throw new Error('HANDOFF guard effectiveAtUtc inválido: ' + effectiveAtUtc);
  }

  const problems = [];
  for (const state of states || []) {
    const history = Array.isArray(state?.history) ? state.history : [];
    const auditFences = history
      .map((entry, position) => ({
        entry,
        position,
        at_ms: Date.parse(entry?.at_utc || ''),
      }))
      .filter(({ entry, at_ms }) => (
        (entry?.type === lifecycleCore.HANDOFF_EVENT
          || entry?.type === lifecycleCore.REVISION_REFRESH_EVENT)
        && Number.isFinite(at_ms)
        && at_ms >= effectiveAtMs
      ));
    const handoffs = auditFences.filter(({ entry }) => entry?.type === lifecycleCore.HANDOFF_EVENT);

    for (const handoff of handoffs) {
      const sourceSha = String(handoff.entry?.source_sha || '').toLowerCase();
      const bibleSha = String(handoff.entry?.bible_sha || '').toLowerCase();
      if (!/^[0-9a-f]{40}$/i.test(sourceSha) || !/^[0-9a-f]{40}$/i.test(bibleSha)) {
        problems.push(
          'handoff protegido sem SOURCE_SHA+BIBLE_SHA válidos: #'
          + String(state.index).padStart(3, '0')
          + ' handoff=' + handoff.entry.at_utc
        );
        continue;
      }

      const nextHandoffPosition = auditFences
        .filter((candidate) => candidate.position > handoff.position)
        .map((candidate) => candidate.position)
        .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;

      const correctionStarts = history
        .map((entry, position) => ({
          entry,
          position,
          at_ms: Date.parse(entry?.at_utc || ''),
        }))
        .filter(({ entry, position, at_ms }) => (
          position > handoff.position
          && position < nextHandoffPosition
          && Number.isFinite(at_ms)
          && entry?.to_status === 'IN_PROGRESS'
        ))
        .sort((a, b) => a.position - b.position);

      const activeStarts = correctionStarts.filter((start) => {
        const aborted = history.some((entry, position) => (
          position > start.position
          && position < nextHandoffPosition
          && entry?.type === 'PROTECTED_HANDOFF_UNAUTHORIZED_CORRECTION_ABORTED'
          && entry?.reopen_at_utc === start.entry?.at_utc
          && entry?.to_status === 'READY_FOR_AUDIT'
          && String(entry?.source_sha || '').toLowerCase() === sourceSha
          && String(entry?.bible_sha || '').toLowerCase() === bibleSha
        ));
        return !aborted;
      });

      if (!activeStarts.length) {
        // Para o handoff protegido mais recente, também valida o snapshot atual.
        // Isso fecha o bypass de editar status/lock sem registrar a transição.
        if (!Number.isFinite(nextHandoffPosition) && state.status === 'IN_PROGRESS') {
          problems.push(
            'handoff protegido com state IN_PROGRESS sem transição de correção registrada: #'
            + String(state.index).padStart(3, '0')
            + ' handoff=' + handoff.entry.at_utc
          );
        }

        const currentSourceSha = String(state?.source_sha || '').toLowerCase();
        const currentBible = currentBibleSha(options.root || null, state);
        const currentBibleShaValue = String(currentBible || state?.bible_sha || '').toLowerCase();
        if (!Number.isFinite(nextHandoffPosition)
          && (
            currentSourceSha !== sourceSha
            || currentBibleShaValue !== bibleSha
          )) {
          problems.push(
            'handoff protegido teve revisão alterada sem correção autorizada: #'
            + String(state.index).padStart(3, '0')
            + ' handoff_source=' + sourceSha.slice(0, 12)
            + ' handoff_bible=' + bibleSha.slice(0, 12)
            + ' current_source=' + (currentSourceSha.slice(0, 12) || '-')
            + ' current_bible=' + (currentBibleShaValue.slice(0, 12) || '-')
          );
        }
        continue;
      }

      for (const correctionStart of activeStarts) {
        const reopenSourceSha = String(correctionStart.entry?.source_sha || '').toLowerCase();
        const reopenBibleSha = String(correctionStart.entry?.bible_sha || '').toLowerCase();
        if (reopenSourceSha !== sourceSha || reopenBibleSha !== bibleSha) {
          problems.push(
            'handoff protegido reaberto com binding ausente/divergente: #'
            + String(state.index).padStart(3, '0')
            + ' handoff_source=' + sourceSha.slice(0, 12)
            + ' handoff_bible=' + bibleSha.slice(0, 12)
            + ' reopen_source=' + (reopenSourceSha.slice(0, 12) || '-')
            + ' reopen_bible=' + (reopenBibleSha.slice(0, 12) || '-')
            + ' reopen=' + correctionStart.entry.at_utc
          );
          continue;
        }

        const eligibleRecords = (records || []).filter((record) => (
          record?.index === state.index
          && String(record?.source_sha || '').toLowerCase() === sourceSha
          && String(record?.bible_sha || '').toLowerCase() === bibleSha
          && Number.isFinite(record?.completed_at_ms)
          && record.completed_at_ms > handoff.at_ms
          && record.completed_at_ms <= correctionStart.at_ms
        ));
        const boundState = {
          ...state,
          source_sha: sourceSha,
          bible_sha: bibleSha,
          // Limita o fence ao handoff que está sendo validado. Um handoff
          // posterior do mesmo binding não pode reescrever retroativamente
          // a decisão que autorizou esta correção histórica.
          history: history.slice(0, correctionStart.position + 1),
        };
        const pipeline = resolveAuditPipeline(boundState, eligibleRecords, new Map(), {
          root: null,
          baseline: null,
        });

        if (pipeline.problems.length || pipeline.decision !== 'CHANGES_REQUIRED') {
          problems.push(
            'handoff protegido reaberto sem decisão final CHANGES_REQUIRED: #'
            + String(state.index).padStart(3, '0')
            + ' source=' + sourceSha.slice(0, 12)
            + ' bible=' + bibleSha.slice(0, 12)
            + ' handoff=' + handoff.entry.at_utc
            + ' reopen=' + correctionStart.entry.at_utc
            + ' decision=' + pipeline.decision
          );
        }
      }

      // Uma correção autorizada encerra o handoff anterior. Ao voltar para
      // READY_FOR_AUDIT, uma nova revisão precisa de um novo handoff protegido.
      if (!Number.isFinite(nextHandoffPosition) && state.status === 'READY_FOR_AUDIT') {
        problems.push(
          'correção pós-handoff terminou sem novo CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT: #'
          + String(state.index).padStart(3, '0')
          + ' previous_handoff=' + handoff.entry.at_utc
        );
      }
    }
  }
  return problems;
}

function displayAuditStatus(pipeline) {
  if (pipeline?.hasDistributed) return pipeline.decision;
  if (pipeline?.primary?.legacy) return pipeline.primary.verdict;
  return 'NOT_AUDITED';
}

module.exports = {
  AUDIT_PHASES,
  AUDIT_VERDICTS,
  BASELINE_RELATIVE,
  HANDOFF_GUARD_EFFECTIVE_AT_UTC,
  walk,
  gitBlobShaBuffer,
  fileBlobSha,
  loadGitSnapshot,
  clearGitSnapshotCache,
  gitWorkingTreeBlobSha,
  loadBibleBaseline,
  currentBibleSha,
  productionFilesForState,
  currentProductionSha,
  baselineEntryFor,
  recordMatchesCurrentBible,
  currentLifecycleSnapshot,
  handoffRequiresAuditSchemaV3,
  recordMatchesLifecycle,
  legacyAuditForState,
  loadAuditResults,
  latestProtectedHandoff,
  latestFor,
  resolveAuditPipeline,
  nextAuditPhase,
  evaluateAuditPipelines,
  pipelineMergeBlockers,
  postHandoffCorrectionProblems,
  displayAuditStatus,
};
