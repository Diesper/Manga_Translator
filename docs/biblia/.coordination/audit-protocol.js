'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const bibleRoot = path.join(repoRoot, 'docs', 'biblia');
const stateRoot = path.join(bibleRoot, '.state');
const resultRoot = path.join(__dirname, 'audit-results');
const legacyClaimRoot = path.join(__dirname, 'audit-claims');
const leaseRoot = path.join(__dirname, 'audit-leases');
const auditRegistryPath = path.join(bibleRoot, 'AUDITORIA.md');

const PHASES = new Set(['PRIMARY', 'ADVERSARIAL', 'REAUDIT']);
const VERDICTS = new Set(['APPROVED', 'CHANGES_REQUIRED']);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function parseLegacyAuditRegistry(source) {
  const byIndex = new Map();

  for (const match of source.matchAll(/^\|\s*(\d+)\s*\|\s*\x60([^\x60]+)\x60\s*\|([^\n]*)\|\s*(✅ APROVADO(?:\s*—[^|]+)?|🟣 REVISÃO OBRIGATÓRIA)\s*\|$/gm)) {
    const row = match[0];
    const shaMatch = /SHA\s*\x60([0-9a-f]{12,40})(?:\.\.\.)?\x60/i.exec(row);
    byIndex.set(Number(match[1]), {
      index: Number(match[1]),
      file: match[2],
      sourceSha: shaMatch ? shaMatch[1] : null,
      verdict: /APROVADO/.test(match[4]) ? 'APPROVED' : 'CHANGES_REQUIRED',
      legacy: true,
    });
  }

  const headings = [...source.matchAll(/^###\s+([^\n]+)$/gm)];
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].index;
    const end = headings[i + 1] ? headings[i + 1].index : source.length;
    const section = source.slice(start, end);
    const idx = /\*\*Índice:\*\*\s*#?(\d+)/i.exec(section) || /#(\d{1,3})\b/.exec(headings[i][1]);
    if (!idx) continue;

    const index = Number(idx[1]);
    const sha = /\*\*SHA auditado:\*\*\s*\x60([0-9a-f]{40})\x60/i.exec(section)
      || /APROVADO[^\n]*SHA\s*\x60([0-9a-f]{40})\x60/i.exec(section);

    let verdict = null;
    if (/Veredito documental independente:[^\n]*✅[^\n]*APROVADO/i.test(section)
      || /\*\*Veredito:\*\*\s*✅\s*APROVADO/i.test(section)) verdict = 'APPROVED';
    if (/Veredito documental independente:[^\n]*(?:❌|REPROVADO|CHANGES_REQUIRED)/i.test(section)
      || /\*\*Veredito:\*\*[^\n]*(?:❌|REPROVADO|CHANGES_REQUIRED)/i.test(section)) verdict = 'CHANGES_REQUIRED';

    if (verdict) {
      byIndex.set(index, {
        index,
        sourceSha: sha ? sha[1] : (byIndex.get(index)?.sourceSha || null),
        verdict,
        legacy: true,
      });
    }
  }

  return byIndex;
}

function readStates() {
  return fs.readdirSync(stateRoot)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(stateRoot, name), 'utf8')))
    .sort((a, b) => a.index - b.index);
}

function loadResults(states) {
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  const records = [];
  const problems = [];

  for (const absolute of walk(resultRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push('resultado não-JSON: ' + rel);
      continue;
    }

    const match = /^docs\/biblia\/\.coordination\/audit-results\/(\d{3})\/(primary|adversarial|reaudit)\/([^/]+\.json)$/i.exec(rel);
    if (!match) {
      problems.push('path de resultado inválido: ' + rel);
      continue;
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch (error) {
      problems.push('JSON inválido: ' + rel + ': ' + error.message);
      continue;
    }

    const pathIndex = Number(match[1]);
    const pathPhase = match[2].toUpperCase();
    const index = Number(raw.index);
    const phase = String(raw.phase || '').toUpperCase();
    const verdict = String(raw.verdict || '').toUpperCase();
    const completedAtMs = Date.parse(raw.completed_at_utc || '');

    if (raw.schema_version !== 1) problems.push('schema_version deve ser 1: ' + rel);
    if (!Number.isInteger(index) || index < 1 || index > 233) problems.push('index inválido: ' + rel);
    if (index !== pathIndex) problems.push('index diverge do path: ' + rel);
    if (!PHASES.has(phase) || phase !== pathPhase) problems.push('phase inválida/divergente: ' + rel);
    if (!VERDICTS.has(verdict)) problems.push('verdict inválido: ' + rel);
    if (typeof raw.auditor !== 'string' || !raw.auditor.trim()) problems.push('auditor ausente: ' + rel);
    if (!/^[0-9a-f]{40}$/i.test(raw.source_sha || '')) problems.push('source_sha inválido: ' + rel);
    if (!Number.isFinite(completedAtMs)) problems.push('completed_at_utc inválido: ' + rel);
    if (raw.findings !== undefined && !Array.isArray(raw.findings)) problems.push('findings deve ser array: ' + rel);

    const state = stateByIndex.get(index);
    if (state) {
      if (raw.file !== state.file) problems.push('file diverge do state: ' + rel);
      if (raw.bible !== state.bible) problems.push('bible diverge do state: ' + rel);
    }

    records.push({
      index,
      phase,
      verdict,
      auditor: String(raw.auditor || '').trim(),
      source_sha: raw.source_sha,
      completed_at_utc: raw.completed_at_utc,
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
  const matches = records
    .filter((record) => record.index === index && record.phase === phase && record.source_sha === sourceSha)
    .sort((a, b) => a.completed_at_ms - b.completed_at_ms || a.path.localeCompare(b.path));
  return matches.length ? matches[matches.length - 1] : null;
}

function legacyPrimary(state, legacyAudits) {
  const legacy = legacyAudits.get(state.index);
  if (!legacy || !legacy.sourceSha || !state.source_sha || !state.source_sha.startsWith(legacy.sourceSha)) return null;
  if (!VERDICTS.has(legacy.verdict)) return null;
  return {
    index: state.index,
    phase: 'PRIMARY',
    verdict: legacy.verdict,
    auditor: null,
    source_sha: state.source_sha,
    completed_at_utc: null,
    completed_at_ms: -1,
    path: 'docs/biblia/AUDITORIA.md',
    legacy: true,
  };
}

function resolvePipeline(state, records, legacyAudits) {
  const primary = latestFor(records, state.index, 'PRIMARY', state.source_sha) || legacyPrimary(state, legacyAudits);
  const adversarial = latestFor(records, state.index, 'ADVERSARIAL', state.source_sha);
  const reaudit = latestFor(records, state.index, 'REAUDIT', state.source_sha);
  const problems = [];

  if (adversarial && !primary) problems.push('ADVERSARIAL sem PRIMARY para o SHA atual');
  if (primary?.auditor && adversarial?.auditor && primary.auditor === adversarial.auditor) {
    problems.push('PRIMARY e ADVERSARIAL devem usar auditores diferentes');
  }

  const divergent = Boolean(primary && adversarial && primary.verdict !== adversarial.verdict);

  if (reaudit && !divergent) problems.push('REAUDIT existe sem divergência PRIMARY × ADVERSARIAL');
  if (reaudit?.auditor && (reaudit.auditor === primary?.auditor || reaudit.auditor === adversarial?.auditor)) {
    problems.push('REAUDIT deve usar auditor diferente dos dois anteriores');
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

  return {
    index: state.index,
    file: state.file,
    source_sha: state.source_sha,
    status: state.status,
    primary,
    adversarial,
    reaudit,
    divergent,
    decision,
    next_phase: nextPhase,
    problems,
  };
}

function parseClaimField(source, field) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    if (line.startsWith(field + ':')) return line.slice(field.length + 1).trim().replace(/^"|"$/g, '');
  }
  return null;
}

function validateClaims(states) {
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  const problems = [];
  const activeByIndex = new Map();
  const active = [];
  const expired = [];

  function register(index, auditor, rel) {
    if (activeByIndex.has(index)) problems.push('mais de um claim/lease ativo para índice ' + index);
    activeByIndex.set(index, rel);
    active.push(rel);
  }

  // Claims planos existentes continuam sendo compatibilidade PRIMARY.
  // Não movemos esses arquivos durante a migração para não invalidar trabalho em andamento.
  for (const absolute of walk(legacyClaimRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (!/^docs\/biblia\/\.coordination\/audit-claims\/\d{3}\.lock\.md$/.test(rel)) continue;

    const basename = path.basename(rel);
    const indexMatch = /^(\d{3})\.lock\.md$/.exec(basename);
    const source = fs.readFileSync(absolute, 'utf8');
    const index = Number(parseClaimField(source, 'INDEX'));
    const auditor = parseClaimField(source, 'AUDITOR');
    const sourceSha = parseClaimField(source, 'SOURCE_SHA');
    const state = stateByIndex.get(index);

    if (!indexMatch || Number(indexMatch[1]) !== index) problems.push('claim legado filename/index divergente: ' + rel);
    if (!auditor) problems.push('claim legado sem AUDITOR: ' + rel);
    if (!state) problems.push('claim legado fora do corpus: ' + rel);
    if (state && sourceSha !== state.source_sha) problems.push('claim legado SOURCE_SHA stale: ' + rel);
    register(index, auditor, rel);
  }

  // Novas fases usam audit-leases, fora da árvore audit-claims legada.
  // Isso mantém compatibilidade com o validador estrutural V2 enquanto retira
  // PRIMARY/ADVERSARIAL/REAUDIT do mutex global.
  for (const absolute of walk(leaseRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.lock\.md$/.test(rel)) {
      problems.push('lease com arquivo inesperado: ' + rel);
      continue;
    }

    const match = /^docs\/biblia\/\.coordination\/audit-leases\/(primary|adversarial|reaudit)\/(\d{3})\.lock\.md$/i.exec(rel);
    if (!match) {
      problems.push('path de lease inválido: ' + rel);
      continue;
    }

    const pathPhase = match[1].toUpperCase();
    const pathIndex = Number(match[2]);
    const source = fs.readFileSync(absolute, 'utf8');
    const index = Number(parseClaimField(source, 'INDEX'));
    const auditor = parseClaimField(source, 'AUDITOR');
    const declaredPhase = String(parseClaimField(source, 'PHASE') || '').toUpperCase();
    const sourceSha = parseClaimField(source, 'SOURCE_SHA');
    const sourcePath = parseClaimField(source, 'ARQUIVO');
    const biblePath = parseClaimField(source, 'BIBLIA');
    const leaseExpiresAt = parseClaimField(source, 'LEASE_EXPIRES_AT_UTC');
    const leaseState = parseClaimField(source, 'ESTADO');
    const state = stateByIndex.get(index);

    if (index !== pathIndex) problems.push('lease filename/index divergente: ' + rel);
    if (!auditor) problems.push('lease sem AUDITOR: ' + rel);
    if (declaredPhase !== pathPhase) problems.push('lease PHASE diverge do path: ' + rel);
    if (leaseState !== 'ACTIVE') problems.push('lease deve estar ACTIVE: ' + rel);
    if (!state) problems.push('lease fora do corpus: ' + rel);

    if (state) {
      if (sourceSha !== state.source_sha) problems.push('lease SOURCE_SHA stale: ' + rel);
      if (sourcePath !== state.file) problems.push('lease ARQUIVO diverge do state: ' + rel);
      if (biblePath !== state.bible) problems.push('lease BIBLIA diverge do state: ' + rel);
    }

    const leaseMs = Date.parse(leaseExpiresAt || '');
    if (!Number.isFinite(leaseMs)) problems.push('lease sem LEASE_EXPIRES_AT_UTC válido: ' + rel);
    else if (leaseMs <= Date.now()) expired.push(rel);

    register(index, auditor, rel);
  }

  return { problems, active, expired };
}

function loadModel() {
  const states = readStates();
  const legacyAudits = fs.existsSync(auditRegistryPath)
    ? parseLegacyAuditRegistry(fs.readFileSync(auditRegistryPath, 'utf8'))
    : new Map();
  const loaded = loadResults(states);
  const claims = validateClaims(states);
  const pipelines = states.map((state) => resolvePipeline(state, loaded.records, legacyAudits));
  return {
    states,
    legacyAudits,
    results: loaded.records,
    pipelines,
    active_claims_and_leases: claims.active,
    expired_leases: claims.expired,
    problems: [...loaded.problems, ...claims.problems, ...pipelines.flatMap((pipeline) => pipeline.problems.map((problem) => '#' + String(pipeline.index).padStart(3, '0') + ': ' + problem))],
  };
}

function formatPipeline(pipeline) {
  return [
    String(pipeline.index).padStart(3, '0'),
    pipeline.decision,
    'next=' + (pipeline.next_phase || '-'),
    pipeline.file,
  ].join(' | ');
}

function verify(model) {
  const blockers = [...model.problems];
  if (model.states.length !== 233) blockers.push('corpus de states incompleto: ' + model.states.length + '/233');
  if (model.active_claims_and_leases.length) {
    blockers.push('claims/leases ativos=' + model.active_claims_and_leases.length + ': ' + model.active_claims_and_leases.join(', '));
  }
  for (const pipeline of model.pipelines) {
    if (pipeline.decision !== 'APPROVED') {
      blockers.push('#' + String(pipeline.index).padStart(3, '0') + ': ' + pipeline.decision);
    }
  }
  return [...new Set(blockers)];
}

function main() {
  const model = loadModel();
  const command = process.argv[2] || 'status';
  const indexArg = process.argv[3] ? Number(process.argv[3]) : null;

  if (command === 'next') {
    if (!Number.isInteger(indexArg)) {
      console.error('Uso: node docs/biblia/.coordination/audit-protocol.js next <ÍNDICE>');
      process.exit(2);
    }
    const pipeline = model.pipelines.find((item) => item.index === indexArg);
    if (!pipeline) {
      console.error('Índice fora do corpus: ' + indexArg);
      process.exit(2);
    }
    console.log(formatPipeline(pipeline));
    process.exit(model.problems.length ? 1 : 0);
  }

  if (command === 'verify') {
    const blockers = verify(model);
    if (blockers.length) {
      console.error('Distributed audit protocol: NOT READY');
      for (const blocker of blockers) console.error('- ' + blocker);
      process.exit(1);
    }
    console.log('Distributed audit protocol: READY — 233/233 PRIMARY + ADVERSARIAL, divergências re-auditadas.');
    return;
  }

  const selected = Number.isInteger(indexArg)
    ? model.pipelines.filter((item) => item.index === indexArg)
    : model.pipelines;

  for (const pipeline of selected) console.log(formatPipeline(pipeline));
  if (model.problems.length) {
    console.error('Problemas de coordenação:');
    for (const problem of model.problems) console.error('- ' + problem);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseLegacyAuditRegistry,
  loadResults,
  resolvePipeline,
  validateClaims,
  loadModel,
  verify,
};
