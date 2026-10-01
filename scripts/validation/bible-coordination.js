'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIFECYCLE = new Set(['PENDING','IN_PROGRESS','READY_FOR_AUDIT','CHANGES_REQUIRED','BLOCKED','COMPLETED']);
const COORDINATION = new Set(['OK','REPAIR_REQUIRED']);
const REQUEST_STATUSES = new Set(['OPEN','ACCEPTED','RESOLVED','REJECTED','SUPERSEDED']);

const slash = (p) => p.replace(/\\/g, '/');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}
function gitBlobSha(source) {
  const buffer = Buffer.from(source, 'utf8');
  return crypto.createHash('sha1').update('blob ' + buffer.length + '\0').update(buffer).digest('hex');
}
const normalizeText = (s) => s.replace(/\r\n/g, '\n');

function extractIntegralSource(bible) {
  const normalized = normalizeText(bible);
  const section = /^##+\s+(?:\d+\.\s+)?Fonte integral(?:\s+(?:auditada|exata))?\s*$/im.exec(normalized);
  if (!section) return null;
  const rest = normalized.slice(section.index + section[0].length);
  const fence = /\n((?:\x60\x60\x60)|~~~)[A-Za-z0-9_-]*\n/.exec(rest);
  if (!fence) return null;
  const contentStart = fence.index + fence[0].length;
  const after = rest.slice(contentStart);
  const contentEnd = after.indexOf('\n' + fence[1]);
  return contentEnd < 0 ? null : after.slice(0, contentEnd);
}

function isContiguousFromOne(intervals) {
  if (!intervals.length || intervals[0].start !== 1) return false;
  let expected = 1;
  for (const interval of intervals) {
    if (interval.start !== expected || interval.end < interval.start) return false;
    expected = interval.end + 1;
  }
  return true;
}

function parseCoverageIntervals(bible) {
  const rangeHeadings = [];
  const singleHeadings = [];

  const rangeLabel = '(?:Linhas?|Posi[cç][aã]o(?:es)?|Posi[cç][oõ]es|Linha\\/posi[cç][aã]o|Linhas\\/posi[cç][aã]o)';
  const singleLabel = '(?:Linha|Linhas|Posi[cç][aã]o|Posi[cç][oõ]es|Pos\\.?|Linha\\/posi[cç][aã]o|Linhas\\/posi[cç][aã]o)';

  const rangeRe = new RegExp(
    '^#{2,5}\\\\s+(?:\\\\d+\\\\.\\\\s+)?' + rangeLabel
      + '\\\\s+0*(\\\\d+)\\\\s*[–—-]\\\\s*0*(\\\\d+)\\\\b',
    'gmi'
  );
  const singleRe = new RegExp(
    '^#{2,5}\\\\s+(?:\\\\d+\\\\.\\\\s+)?' + singleLabel + '\\\\s+0*(\\\\d+)\\\\b',
    'gmi'
  );

  for (const match of bible.matchAll(rangeRe)) {
    rangeHeadings.push({ start: Number(match[1]), end: Number(match[2]), raw: match[0] });
  }
  for (const match of bible.matchAll(singleRe)) {
    singleHeadings.push({ start: Number(match[1]), end: Number(match[1]), raw: match[0] });
  }

  rangeHeadings.sort((a,b) => a.start - b.start || a.end - b.end);
  singleHeadings.sort((a,b) => a.start - b.start || a.end - b.end);

  // O formato V1 detalhado é inequívoco quando enumera 1,2,3... sem saltos.
  // Nesse caso ele é preferido a quaisquer faixas-resumo coexistentes.
  if (isContiguousFromOne(singleHeadings)) return singleHeadings;

  // Se há faixas semânticas, elas são o mapa principal. Singles isolados fora
  // das faixas completam newline/separadores sem duplicar cobertura interna.
  if (rangeHeadings.length) {
    const intervals = [...rangeHeadings];
    for (const single of singleHeadings) {
      const covered = rangeHeadings.some((range) => single.start >= range.start && single.end <= range.end);
      if (!covered) intervals.push(single);
    }
    intervals.sort((a,b) => a.start - b.start || a.end - b.end);
    if (isContiguousFromOne(intervals)) return intervals;
  }

  // Tabelas de cobertura podem usar quebras reais ou a sequência literal "\\n"
  // criada por alguns geradores antigos. Cada tabela é avaliada isoladamente.
  const normalizedForTables = bible.replace(/\\\\n/g, '\n');
  const lines = normalizedForTables.split(/\r?\n/);
  const tableCandidates = [];
  let current = null;
  const headerRe = /^\|\s*(?:Linha|Linhas|Linha\/posi[cç][aã]o|Linhas\/posi[cç][aã]o|Pos\.?|Posi[cç][aã]o|Posi[cç][oõ]es)\s*\|/i;

  function finishTable() {
    if (current && current.length) tableCandidates.push(current);
    current = null;
  }

  for (const line of lines) {
    if (headerRe.test(line)) {
      finishTable();
      current = [];
      continue;
    }
    if (current && /^\|\s*:?-{3,}/.test(line)) continue;
    if (current && !/^\|/.test(line)) {
      finishTable();
      continue;
    }
    if (!current) continue;

    let match = /^\|\s*(?:posi[cç][aã]o\s+)?0*(\d+)\s*[–—-]\s*0*(\d+)\s*\|/i.exec(line);
    if (match) {
      current.push({ start: Number(match[1]), end: Number(match[2]), raw: line.trim() });
      continue;
    }
    match = /^\|\s*(?:posi[cç][aã]o\s+)?0*(\d+)\s*\|/i.exec(line);
    if (match) current.push({ start: Number(match[1]), end: Number(match[1]), raw: line.trim() });
  }
  finishTable();

  for (const candidate of tableCandidates) {
    candidate.sort((a,b) => a.start - b.start || a.end - b.end);
    if (isContiguousFromOne(candidate)) return candidate;
  }

  // Último fallback: retorna o candidato estrutural mais promissor para que
  // validateCoverage produza gaps/overlaps objetivos em vez de "não reconhecido".
  const candidates = [
    ...(rangeHeadings.length ? [rangeHeadings] : []),
    ...(singleHeadings.length ? [singleHeadings] : []),
    ...tableCandidates,
  ].filter((candidate) => candidate.length);
  candidates.sort((a,b) => {
    const aStarts = a[0]?.start === 1 ? 1 : 0;
    const bStarts = b[0]?.start === 1 ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    return b.length - a.length;
  });
  return candidates[0] || [];
}

function validateCoverage(intervals, sourcePositions) {
  if (!intervals.length) return ['nenhuma cobertura V1/V2 reconhecida'];
  const errors = [];
  let expected = 1;
  for (const interval of intervals) {
    if (!Number.isInteger(interval.start) || !Number.isInteger(interval.end) || interval.start < 1 || interval.end < interval.start) {
      errors.push('faixa inválida: ' + interval.raw);
      continue;
    }
    if (interval.end > sourcePositions) errors.push('faixa fora do fonte: ' + interval.raw + ' / máximo=' + sourcePositions);
    if (interval.start > expected) errors.push('gap de cobertura: esperado ' + expected + ', próximo=' + interval.start);
    else if (interval.start < expected) errors.push('overlap de cobertura: esperado ' + expected + ', próximo=' + interval.start);
    expected = Math.max(expected, interval.end + 1);
  }
  if (expected <= sourcePositions) errors.push('cobertura termina em ' + (expected - 1) + ', fonte termina em ' + sourcePositions);
  return errors;
}

function coordinationField(source, field) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    const prefix = field + ':';
    if (line.startsWith(prefix)) return line.slice(prefix.length).trim().replace(/^"|"$/g, '');
  }
  return null;
}

function parseAuditRegistry(auditSource) {
  const byIndex = new Map();
  for (const match of auditSource.matchAll(/^\|\s*(\d+)\s*\|\s*\x60([^\x60]+)\x60\s*\|([^\n]*)\|\s*(✅ APROVADO(?:\s*—[^|]+)?|🟣 REVISÃO OBRIGATÓRIA)\s*\|$/gm)) {
    const row = match[0];
    const shaMatch = /SHA\s*\x60([0-9a-f]{12,40})(?:\.\.\.)?\x60/i.exec(row);
    byIndex.set(Number(match[1]), {
      index: Number(match[1]),
      file: match[2],
      sourceSha: shaMatch ? shaMatch[1] : null,
      result: /APROVADO/.test(match[4]) ? 'APPROVED' : 'CHANGES_REQUIRED',
      format: 'legacy-table',
    });
  }
  const headingRe = /^###\s+([^\n]+)$/gm;
  const headings = [...auditSource.matchAll(headingRe)];
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].index;
    const end = headings[i + 1] ? headings[i + 1].index : auditSource.length;
    const section = auditSource.slice(start, end);
    const idx = /\*\*Índice:\*\*\s*#?(\d+)/i.exec(section) || /#(\d{1,3})\b/.exec(headings[i][1]);
    if (!idx) continue;
    const index = Number(idx[1]);
    const fileMatch = /\*\*Índice:\*\*[^\n]*\x60([^\x60]+)\x60/i.exec(section)
      || /^###\s+\x60([^\x60]+)\x60/m.exec(section);
    const sha = /\*\*SHA auditado:\*\*\s*\x60([0-9a-f]{40})\x60/i.exec(section)
      || /APROVADO[^\n]*SHA\s*\x60([0-9a-f]{40})\x60/i.exec(section);
    let result = null;
    if (/Veredito documental independente:[^\n]*✅[^\n]*APROVADO/i.test(section)
      || /\*\*Veredito:\*\*\s*✅\s*APROVADO/i.test(section)) result = 'APPROVED';
    if (/Veredito documental independente:[^\n]*(?:❌|REPROVADO|CHANGES_REQUIRED)/i.test(section)
      || /\*\*Veredito:\*\*[^\n]*(?:❌|REPROVADO|CHANGES_REQUIRED)/i.test(section)) result = 'CHANGES_REQUIRED';
    if (result) byIndex.set(index, {
      index,
      file: fileMatch ? fileMatch[1] : (byIndex.get(index)?.file || null),
      sourceSha: sha ? sha[1] : (byIndex.get(index)?.sourceSha || null),
      result,
      format: 'section',
    });
  }
  return byIndex;
}
function approvalMatches(entry, sourceSha) {
  return Boolean(entry && entry.result === 'APPROVED' && entry.sourceSha && sourceSha.startsWith(entry.sourceSha));
}

function buildDerived(states, audits, headLabel) {
  const counters = Object.fromEntries([...LIFECYCLE].map((s) => [s, 0]));
  const requestCounters = Object.fromEntries([...REQUEST_STATUSES].map((s) => [s, 0]));
  for (const state of states) {
    if (Object.prototype.hasOwnProperty.call(counters, state.status)) counters[state.status] += 1;
    for (const request of state.audit_requests || []) {
      const status = request.status === 'SATISFIED' ? 'RESOLVED' : request.status;
      if (Object.prototype.hasOwnProperty.call(requestCounters, status)) requestCounters[status] += 1;
    }
  }
  const statusLines = [
    '# Status — Bíblia técnica por arquivo',
    '',
    '> Arquivo gerado deterministicamente a partir de .state/*.json, AUDITORIA.md e filesystem.',
    '',
    '## Snapshot',
    '',
    '- total: **' + states.length + '**',
    '- materializadas: **' + states.length + '**',
  ];
  for (const s of LIFECYCLE) statusLines.push('- ' + s + ': **' + counters[s] + '**');
  for (const s of REQUEST_STATUSES) statusLines.push('- requests ' + s + ': **' + requestCounters[s] + '**');
  statusLines.push('- snapshot/HEAD: ' + String.fromCharCode(96) + (headLabel || 'working-tree') + String.fromCharCode(96));
  statusLines.push('', '## Itens', '', '| # | arquivo | status | auditoria | owner | SHA | requests |', '|---:|---|---|---|---|---|---:|');
  for (const state of states) {
    const audit = audits.get(state.index);
    statusLines.push('| ' + String(state.index).padStart(3,'0') + ' | ' + state.file + ' | ' + state.status + ' | '
      + (audit?.result || 'NOT_AUDITED') + ' | ' + (state.status === 'IN_PROGRESS' ? (state.agent || 'MISSING') : '-')
      + ' | ' + (state.source_sha || '-') + ' | ' + (state.audit_requests || []).length + ' |');
  }

  const checklistLines = [
    '# Checklist — Bíblias técnicas',
    '',
    '> Gerado deterministicamente. [x] exige COMPLETED + auditoria APPROVED válida para o SHA atual + Bíblia existente.',
    '',
  ];
  for (const state of states) {
    const checked = state.status === 'COMPLETED' && approvalMatches(audits.get(state.index), state.source_sha || '');
    checklistLines.push('- [' + (checked ? 'x' : ' ') + '] ' + String(state.index).padStart(3,'0')
      + ' — ' + String.fromCharCode(96) + state.file + String.fromCharCode(96) + ' — ' + state.status);
  }
  return {
    status: statusLines.join('\n') + '\n',
    checklist: checklistLines.join('\n') + '\n',
    counters,
    requestCounters,
  };
}

function validateBibleCoordination(root, options = {}) {
  const problems = [];
  const bibleRoot = path.join(root, 'docs', 'biblia');
  const stateRoot = path.join(bibleRoot, '.state');
  const reserveRoot = path.join(bibleRoot, '.reservas');
  const auditPath = path.join(bibleRoot, 'AUDITORIA.md');

  const all = walk(bibleRoot).map((file) => slash(path.relative(root, file))).sort();
  const allowedControls = new Set(['docs/biblia/STATUS.md','docs/biblia/CHECKLIST.md','docs/biblia/AUDITORIA.md']);
  const unexpected = all.filter((file) => !allowedControls.has(file)
    && !file.startsWith('docs/biblia/.state/')
    && !file.startsWith('docs/biblia/.reservas/')
    && !file.startsWith('docs/biblia/.coordination/')
    && !file.endsWith('/Bíblia.md'));
  if (unexpected.length) problems.push('arquivos inesperados em docs/biblia: ' + unexpected.join(', '));

  const stateFiles = walk(stateRoot).map((file) => slash(path.relative(root, file))).filter((file) => /\.json$/.test(file)).sort();
  if (stateFiles.length !== 233) problems.push('quantidade de states deve ser 233; atual=' + stateFiles.length);

  const states = [];
  const seenIndexes = new Set();
  const seenSources = new Set();
  for (const stateFile of stateFiles) {
    let state;
    try { state = JSON.parse(fs.readFileSync(path.join(root, stateFile), 'utf8')); }
    catch (error) { problems.push(stateFile + ': JSON inválido: ' + error.message); continue; }

    const fileIndex = Number(path.basename(stateFile, '.json'));
    if (state.index !== fileIndex) problems.push(stateFile + ': index divergente=' + state.index);
    if (seenIndexes.has(state.index)) problems.push('índice duplicado: ' + state.index);
    seenIndexes.add(state.index);
    if (seenSources.has(state.file)) problems.push('source duplicado indevidamente: ' + state.file);
    seenSources.add(state.file);

    if (!LIFECYCLE.has(state.status)) problems.push(stateFile + ': lifecycle inválido=' + state.status);
    if (state.schema_version === 2 && !COORDINATION.has(state.coordination_status)) problems.push(stateFile + ': coordination_status inválido/ausente em schema v2');
    if (state.schema_version !== undefined && state.schema_version !== 1 && state.schema_version !== 2) problems.push(stateFile + ': schema_version inválido=' + state.schema_version);

    const expectedBible = 'docs/biblia/' + state.file + '/Bíblia.md';
    if (state.bible !== expectedBible) problems.push(stateFile + ': bible path divergente; esperado=' + expectedBible);
    const sourceAbs = path.join(root, state.file || '');
    const bibleAbs = path.join(root, expectedBible);
    if (!fs.existsSync(sourceAbs)) problems.push(stateFile + ': source ausente=' + state.file);
    if (!fs.existsSync(bibleAbs)) problems.push(stateFile + ': Bible ausente=' + expectedBible);

    if (fs.existsSync(sourceAbs)) {
      const source = normalizeText(fs.readFileSync(sourceAbs, 'utf8'));
      const currentSha = gitBlobSha(source);
      if (!/^[0-9a-f]{40}$/i.test(state.source_sha || '')) problems.push(stateFile + ': source_sha ausente/inválido');
      else if (state.source_sha !== currentSha) problems.push(stateFile + ': SHA stale declarado=' + state.source_sha + ' atual=' + currentSha);

      if (fs.existsSync(bibleAbs)) {
        const bible = normalizeText(fs.readFileSync(bibleAbs, 'utf8'));
        const embedded = extractIntegralSource(bible);
        if (embedded !== null) {
          const sourceNoNl = source.endsWith('\n') ? source.slice(0, -1) : source;
          if (embedded !== sourceNoNl && embedded !== sourceNoNl + '\n') problems.push(stateFile + ': fonte integral realmente divergente');
        } else if (state.status === 'COMPLETED') problems.push(stateFile + ': COMPLETED sem seção Fonte integral reconhecível');

        if (['COMPLETED','READY_FOR_AUDIT','CHANGES_REQUIRED'].includes(state.status)) {
          for (const error of validateCoverage(parseCoverageIntervals(bible), source.split('\n').length)) {
            problems.push(stateFile + ': ' + error);
          }
        }
      }
    }

    for (const request of Array.isArray(state.audit_requests) ? state.audit_requests : []) {
      if (request.status === 'SATISFIED') problems.push(stateFile + '/' + (request.id || 'sem-id') + ': SATISFIED deve migrar para RESOLVED preservando resolution');
      else if (!REQUEST_STATUSES.has(request.status)) problems.push(stateFile + '/' + (request.id || 'sem-id') + ': audit_request status inválido=' + request.status);
    }
    if (state.status === 'IN_PROGRESS' && !state.agent) problems.push(stateFile + ': IN_PROGRESS sem agent');
    if (state.status !== 'IN_PROGRESS' && state.agent) problems.push(stateFile + ': agent deve ser null fora de IN_PROGRESS');
    states.push(state);
  }
  states.sort((a,b) => a.index - b.index);
  for (let i = 1; i <= 233; i += 1) if (!seenIndexes.has(i)) problems.push('state ausente para índice ' + String(i).padStart(3,'0'));

  const bibles = all.filter((file) => file.endsWith('/Bíblia.md'));
  if (bibles.length !== 233) problems.push('quantidade de Bíblias deve ser 233; atual=' + bibles.length);
  const expectedBibles = new Set(states.map((state) => state.bible));
  for (const bible of bibles) if (!expectedBibles.has(bible)) problems.push('Bíblia sem state correspondente: ' + bible);

  const reservations = walk(reserveRoot).map((file) => slash(path.relative(root, file))).filter((file) => file.endsWith('.lock.md')).sort();
  const locksByFile = new Map();
  const locksByAgent = new Map();
  for (const reservationFile of reservations) {
    const source = fs.readFileSync(path.join(root, reservationFile), 'utf8');
    const agent = coordinationField(source, 'AGENTE');
    const sourcePath = coordinationField(source, 'ARQUIVO');
    if (!agent || !sourcePath) { problems.push('reserva incompleta: ' + reservationFile); continue; }
    if (locksByFile.has(sourcePath)) problems.push('mais de um lock para arquivo: ' + sourcePath);
    locksByFile.set(sourcePath, { agent, reservationFile });
    locksByAgent.set(agent, (locksByAgent.get(agent) || 0) + 1);
    if (locksByAgent.get(agent) > 1) problems.push('agente possui >1 lock ativo: ' + agent);
    const state = states.find((item) => item.file === sourcePath);
    if (!state) problems.push('lock de arquivo fora do corpus: ' + sourcePath);
    else {
      if (state.status !== 'IN_PROGRESS') problems.push('lock existe para state não-IN_PROGRESS: ' + sourcePath + '/' + state.status);
      if (state.agent !== agent) problems.push('lock não satisfaz ownership do state: ' + sourcePath);
    }
  }
  for (const state of states) {
    const lock = locksByFile.get(state.file);
    if (state.status === 'IN_PROGRESS' && !lock) problems.push('IN_PROGRESS sem lock: ' + state.file);
    if (state.status === 'COMPLETED' && lock) problems.push('COMPLETED com lock proibido: ' + state.file);
  }

  const audits = fs.existsSync(auditPath) ? parseAuditRegistry(fs.readFileSync(auditPath, 'utf8')) : new Map();
  for (const state of states) {
    if (state.status === 'COMPLETED' && !approvalMatches(audits.get(state.index), state.source_sha || '')) {
      problems.push('COMPLETED sem auditoria APPROVED para SHA atual: #' + state.index + ' ' + state.file);
    }
  }

  if (options.checkDerived && states.length === 233) {
    const generated = buildDerived(states, audits, options.headLabel || 'working-tree');
    const currentStatus = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');
    const currentChecklist = fs.readFileSync(path.join(bibleRoot, 'CHECKLIST.md'), 'utf8');
    if (normalizeText(currentStatus).trimEnd() !== normalizeText(generated.status).trimEnd()) problems.push('STATUS.md derivado divergente/stale');
    if (normalizeText(currentChecklist).trimEnd() !== normalizeText(generated.checklist).trimEnd()) problems.push('CHECKLIST.md derivado divergente/stale');
  }

  return { problems, states, audits, reservations };
}

module.exports = {
  LIFECYCLE,
  REQUEST_STATUSES,
  gitBlobSha,
  extractIntegralSource,
  parseCoverageIntervals,
  validateCoverage,
  parseAuditRegistry,
  approvalMatches,
  buildDerived,
  validateBibleCoordination,
};
