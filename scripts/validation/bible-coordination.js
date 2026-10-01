'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const {
  loadAuditResults,
  evaluateAuditPipelines,
  displayAuditStatus,
} = require('./bible-audit-pipeline');

const LIFECYCLE = new Set(['PENDING','IN_PROGRESS','READY_FOR_AUDIT','CHANGES_REQUIRED','BLOCKED','COMPLETED']);
const COORDINATION = new Set(['OK','REPAIR_REQUIRED']);
const REQUEST_STATUSES = new Set(['OPEN','ACCEPTED','RESOLVED','REJECTED','SUPERSEDED']);

function normalizeRequestStatus(status) {
  return status === 'SATISFIED' ? 'RESOLVED' : status;
}

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
function trackedBlobSha(root, sourcePath, fallbackSource) {
  try {
    const value = childProcess.execFileSync(
      'git',
      ['rev-parse', 'HEAD:' + slash(sourcePath)],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (/^[0-9a-f]{40}$/i.test(value)) return value;
  } catch (_) {
    // Self-tests use temporary non-Git roots; fall back to exact fixture bytes.
  }
  return gitBlobSha(fallbackSource);
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

function coverageScope(bible) {
  const normalized = normalizeText(bible);
  const matches = [...normalized.matchAll(/^##\s+.*(?:cobertura[^\n]*(?:documental|linhas?|posi[cç]|faixa)|rastreabilidade|mapa[^\n]*(?:linha|posi[cç]|faixa)|auditoria linha a linha)[^\n]*$/gmi)];
  if (!matches.length) return normalized;
  const start = matches[matches.length - 1].index;
  const rest = normalized.slice(start);
  const next = /\n##\s+/.exec(rest.slice(1));
  return next ? rest.slice(0, next.index + 1) : rest;
}

function parseCoverageIntervals(bible, sourcePositions = null) {
  const scope = coverageScope(bible);
  const rangeHeadings = [];
  const singleHeadings = [];

  const rangeLabel = '(?:Linhas?|Posi[cç][aã]o(?:es)?|Posi[cç][oõ]es|Linha\\/posi[cç][aã]o|Linhas\\/posi[cç][aã]o)';
  const singleLabel = '(?:Linha|Linhas|Posi[cç][aã]o|Posi[cç][oõ]es|Pos\\.?|Linha\\/posi[cç][aã]o|Linhas\\/posi[cç][aã]o)';

  const rangeRe = new RegExp(
    rangeLabel + '\\s+0*(\\d+)\\s*[–—-]\\s*0*(\\d+)\\b',
    'i'
  );
  const singleRe = new RegExp(
    singleLabel + '\\s+0*(\\d+)\\b',
    'i'
  );

  for (const line of scope.split(/\r?\n/)) {
    const heading = /^#{2,5}\s+(.+)$/.exec(line);
    if (!heading) continue;
    const range = rangeRe.exec(heading[1]);
    if (range) {
      rangeHeadings.push({ start: Number(range[1]), end: Number(range[2]), raw: line.trim() });
      continue;
    }
    const single = singleRe.exec(heading[1]);
    if (single) singleHeadings.push({ start: Number(single[1]), end: Number(single[1]), raw: line.trim() });
  }

  rangeHeadings.sort((a,b) => a.start - b.start || a.end - b.end);
  singleHeadings.sort((a,b) => a.start - b.start || a.end - b.end);

  // O formato V1 detalhado é inequívoco quando enumera 1,2,3... sem saltos.
  // Nesse caso ele é preferido a quaisquer faixas-resumo coexistentes.
  if (!sourcePositions && isContiguousFromOne(singleHeadings)) return singleHeadings;

  // Se há faixas semânticas, elas são o mapa principal. Singles isolados fora
  // das faixas completam newline/separadores sem duplicar cobertura interna.
  if (rangeHeadings.length) {
    const intervals = [...rangeHeadings];
    for (const single of singleHeadings) {
      const covered = rangeHeadings.some((range) => single.start >= range.start && single.end <= range.end);
      if (!covered) intervals.push(single);
    }
    intervals.sort((a,b) => a.start - b.start || a.end - b.end);
    if (!sourcePositions && isContiguousFromOne(intervals)) return intervals;
  }

  // Tabelas de cobertura: primeiro usa quebras reais. Só tenta expandir a
  // sequência literal "\\n" quando nenhum mapa tabular foi encontrado, para
  // não quebrar células de código que contêm strings como '\n'.
  function collectCoverageTables(tableText) {
    const rows = tableText.split(/\r?\n/);
    const tables = [];
    let current = null;
    const headerRe = /^\|\s*(?:Linha|Linhas|Linha\/posi[cç][aã]o|Linhas\/posi[cç][aã]o|Pos\.?|Posi[cç][aã]o|Posi[cç][oõ]es|Faixa|Intervalo)\s*\|/i;
    const finishTable = () => {
      if (current && current.length) tables.push(current);
      current = null;
    };

    for (const line of rows) {
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
      if (match) {
        current.push({ start: Number(match[1]), end: Number(match[1]), raw: line.trim() });
        continue;
      }
      if (sourcePositions && /^\|\s*posi[cç][aã]o\s+final\s*\|/i.test(line)) {
        current.push({ start: sourcePositions, end: sourcePositions, raw: line.trim() });
      }
    }
    finishTable();
    return tables;
  }

  let tableCandidates = collectCoverageTables(scope);
  if (!tableCandidates.length && /\\n/.test(scope)) {
    tableCandidates = collectCoverageTables(scope.replace(/\\n/g, '\n'));
  }

  const combinedRanges = [...rangeHeadings];
  for (const single of singleHeadings) {
    const covered = rangeHeadings.some((range) => single.start >= range.start && single.end <= range.end);
    if (!covered) combinedRanges.push(single);
  }
  combinedRanges.sort((a,b) => a.start - b.start || a.end - b.end);

  // Escolhe primeiro um mapa que cubra exatamente a fonte atual. Isso resolve
  // Bíblias legadas que preservam simultaneamente mapa linha-a-linha, resumo
  // por faixas e tabelas de cenários sem misturar esses formatos.
  const exactCandidates = [
    singleHeadings,
    combinedRanges,
    ...tableCandidates,
    rangeHeadings,
  ].filter((candidate) => candidate.length);
  if (sourcePositions) {
    for (const candidate of exactCandidates) {
      if (validateCoverage(candidate, sourcePositions).length === 0) return candidate;
    }
  }

  // Último fallback: retorna o candidato estrutural mais promissor para que
  // validateCoverage produza gaps/overlaps objetivos em vez de "não reconhecido".
  exactCandidates.sort((a,b) => {
    const aStarts = a[0]?.start === 1 ? 1 : 0;
    const bStarts = b[0]?.start === 1 ? 1 : 0;
    if (aStarts !== bStarts) return bStarts - aStarts;
    return b.length - a.length;
  });
  return exactCandidates[0] || [];
}

function validateCoverage(intervals, sourcePositions, sourceText = null) {
  if (!intervals.length) return ['nenhuma cobertura V1/V2 reconhecida'];
  const errors = [];
  const sourceLines = sourceText === null ? null : normalizeText(sourceText).split('\n');
  const blankGap = (start, end) => Boolean(
    sourceLines && start <= end
    && sourceLines.slice(start - 1, end).every((line) => line.trim() === '')
  );
  let expected = 1;
  for (const interval of intervals) {
    if (!Number.isInteger(interval.start) || !Number.isInteger(interval.end) || interval.start < 1 || interval.end < interval.start) {
      errors.push('faixa inválida: ' + interval.raw);
      continue;
    }
    if (interval.end > sourcePositions) errors.push('faixa fora do fonte: ' + interval.raw + ' / máximo=' + sourcePositions);
    if (interval.start > expected) {
      if (!blankGap(expected, interval.start - 1)) {
        errors.push('gap de cobertura: esperado ' + expected + ', próximo=' + interval.start);
      }
    } else if (interval.start < expected) {
      errors.push('overlap de cobertura: esperado ' + expected + ', próximo=' + interval.start);
    }
    expected = Math.max(expected, interval.end + 1);
  }
  if (expected <= sourcePositions && !blankGap(expected, sourcePositions)) {
    errors.push('cobertura termina em ' + (expected - 1) + ', fonte termina em ' + sourcePositions);
  }
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
function auditResultForSource(entry, sourceSha) {
  if (!entry || !entry.sourceSha || !sourceSha || !sourceSha.startsWith(entry.sourceSha)) return 'NOT_AUDITED';
  return entry.result || 'NOT_AUDITED';
}

function buildDerived(states, audits, headLabel, auditPipelines = null) {
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
    '> View de compatibilidade gerada deterministicamente a partir de .state/*.json, AUDITORIA.md legado e filesystem; resultados distribuídos são reconciliados em lote.',
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
    const pipeline = auditPipelines instanceof Map ? auditPipelines.get(state.index) : null;
    const auditStatus = pipeline ? displayAuditStatus(pipeline, audit) : auditResultForSource(audit, state.source_sha || '');
    statusLines.push('| ' + String(state.index).padStart(3,'0') + ' | ' + state.file + ' | ' + state.status + ' | '
      + auditStatus + ' | ' + (state.status === 'IN_PROGRESS' ? (state.agent || 'MISSING') : '-')
      + ' | ' + (state.source_sha || '-') + ' | ' + (state.audit_requests || []).length + ' |');
  }

  const checklistLines = [
    '# Checklist — Bíblias técnicas',
    '',
    '> Gerado deterministicamente. [x] exige COMPLETED + auditoria APPROVED válida para o SHA atual + Bíblia existente.',
    '',
  ];
  for (const state of states) {
    const audit = audits.get(state.index);
    const pipeline = auditPipelines instanceof Map ? auditPipelines.get(state.index) : null;
    const pipelineApproved = Boolean(pipeline?.hasDistributed && pipeline.decision === 'APPROVED');
    const legacyPipelineApproved = Boolean(pipeline?.primary?.legacy && pipeline.primary.verdict === 'APPROVED');
    const checked = state.status === 'COMPLETED' && (
      pipeline
        ? (pipelineApproved || legacyPipelineApproved)
        : approvalMatches(audit, state.source_sha || '')
    );
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
  const enforceSingleAuditClaimPerAuditor = options.enforceSingleAuditClaimPerAuditor === true;
  const bibleRoot = path.join(root, 'docs', 'biblia');
  const stateRoot = path.join(bibleRoot, '.state');
  const reserveRoot = path.join(bibleRoot, '.reservas');
  const auditClaimRoot = path.join(bibleRoot, '.coordination', 'audit-claims');
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
      const rawSource = fs.readFileSync(sourceAbs, 'utf8');
      const currentSha = trackedBlobSha(root, state.file, rawSource);
      const source = normalizeText(rawSource);
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
          for (const error of validateCoverage(parseCoverageIntervals(bible, source.split('\n').length), source.split('\n').length, source)) {
            problems.push(stateFile + ': ' + error);
          }
        }
      }
    }

    const stateRequests = Array.isArray(state.audit_requests) ? state.audit_requests : [];
    for (const request of stateRequests) {
      if (request.status === 'SATISFIED') problems.push(stateFile + '/' + (request.id || 'sem-id') + ': SATISFIED deve migrar para RESOLVED preservando resolution');
      else if (!REQUEST_STATUSES.has(request.status)) problems.push(stateFile + '/' + (request.id || 'sem-id') + ': audit_request status inválido=' + request.status);
      // O lifecycle mutável da request é canônico somente no .state.
      // Textos OPEN/ACCEPTED/etc. dentro da Bíblia são snapshots documentais
      // e não devem obrigar reescrita de uma Bíblia já auditada a cada triagem.
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

  // Claims de auditoria são leases particionados por índice e fase.
  // O caminho normal de auditoria não usa lock global. Claims legados planos
  // continuam aceitos como PRIMARY durante a migração.
  const auditClaims = walk(auditClaimRoot)
    .map((file) => slash(path.relative(root, file)))
    .filter((file) => file.endsWith('.lock.md'))
    .sort();
  const auditClaimsByIndex = new Map();
  const auditClaimsByAuditor = new Map();
  for (const claimFile of auditClaims) {
    const basename = path.basename(claimFile);
    const canonicalName = /^(\d{3})\.lock\.md$/.exec(basename);
    const source = fs.readFileSync(path.join(root, claimFile), 'utf8');
    const auditor = coordinationField(source, 'AUDITOR');
    const indexRaw = coordinationField(source, 'INDEX');
    const sourcePath = coordinationField(source, 'ARQUIVO');
    const biblePath = coordinationField(source, 'BIBLIA');
    const sourceSha = coordinationField(source, 'SOURCE_SHA');
    const claimState = coordinationField(source, 'ESTADO');
    const declaredPhase = coordinationField(source, 'PHASE');
    const leaseExpiresAt = coordinationField(source, 'LEASE_EXPIRES_AT_UTC');
    const relativeClaim = claimFile.split('docs/biblia/.coordination/audit-claims/')[1] || '';
    const phaseDir = relativeClaim.includes('/') ? relativeClaim.split('/')[0].toLowerCase() : null;
    const pathPhase = phaseDir === 'primary' ? 'PRIMARY'
      : phaseDir === 'adversarial' ? 'ADVERSARIAL'
      : phaseDir === 'reaudit' ? 'REAUDIT'
      : null;
    const phase = pathPhase || 'PRIMARY';
    const stagedClaim = Boolean(pathPhase);

    if (!canonicalName) problems.push('audit claim com nome inválido: ' + claimFile);
    if (stagedClaim && String(declaredPhase || '').toUpperCase() !== phase) {
      problems.push('audit claim PHASE diverge do path: ' + claimFile);
    }
    if (stagedClaim) {
      const leaseMs = Date.parse(leaseExpiresAt || '');
      if (!Number.isFinite(leaseMs)) problems.push('audit claim LEASE_EXPIRES_AT_UTC inválido/ausente: ' + claimFile);
      else if (leaseMs <= Date.now()) problems.push('audit claim lease expirado: ' + claimFile);
    }
    if (!auditor || !indexRaw || !sourcePath || !biblePath || !sourceSha || !claimState) {
      problems.push('audit claim incompleto: ' + claimFile);
      continue;
    }

    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 1 || index > 233) {
      problems.push('audit claim com INDEX inválido: ' + claimFile + '/' + indexRaw);
      continue;
    }
    if (canonicalName && Number(canonicalName[1]) !== index) {
      problems.push('audit claim filename/index divergente: ' + claimFile + '/INDEX=' + index);
    }
    if (claimState !== 'ACTIVE') problems.push('audit claim deve estar ACTIVE: ' + claimFile);

    if (auditClaimsByIndex.has(index)) problems.push('mais de um audit claim para índice: ' + index);
    auditClaimsByIndex.set(index, { auditor, claimFile });

    auditClaimsByAuditor.set(auditor, (auditClaimsByAuditor.get(auditor) || 0) + 1);
    if (enforceSingleAuditClaimPerAuditor && auditClaimsByAuditor.get(auditor) > 1) {
      problems.push('auditor possui >1 audit claim ativo: ' + auditor);
    }

    const state = states.find((item) => item.index === index);
    if (!state) {
      problems.push('audit claim fora do corpus: ' + claimFile);
      continue;
    }
    const allowedStatus = phase === 'PRIMARY'
      ? state.status === 'READY_FOR_AUDIT'
      : ['READY_FOR_AUDIT', 'COMPLETED'].includes(state.status);
    if (!allowedStatus) {
      problems.push('audit claim ' + phase + ' incompatível com status: #' + index + '/' + state.status);
    }
    if (state.file !== sourcePath) problems.push('audit claim ARQUIVO diverge do state: #' + index);
    if (state.bible !== biblePath) problems.push('audit claim BIBLIA diverge do state: #' + index);
    if (state.source_sha !== sourceSha) problems.push('audit claim SOURCE_SHA diverge do state: #' + index);
    if (locksByFile.has(state.file)) problems.push('audit claim conflita com reserva de edição: #' + index);
  }

  const audits = fs.existsSync(auditPath) ? parseAuditRegistry(fs.readFileSync(auditPath, 'utf8')) : new Map();
  const distributed = loadAuditResults(root, states);
  for (const problem of distributed.problems) problems.push(problem);
  const pipelineEvaluation = evaluateAuditPipelines(states, distributed.records, audits, {
    root,
    baseline: distributed.baseline,
  });
  for (const problem of pipelineEvaluation.problems) problems.push(problem);

  for (const state of states) {
    const pipeline = pipelineEvaluation.byIndex.get(state.index);
    const legacyApproved = Boolean(pipeline?.primary?.legacy && pipeline.primary.verdict === 'APPROVED');
    const pipelineApproved = pipeline?.decision === 'APPROVED';
    if (state.status === 'COMPLETED' && !legacyApproved && !pipelineApproved) {
      problems.push('COMPLETED sem auditoria APPROVED para source+bible atuais: #' + state.index + ' ' + state.file);
    }
  }

  if (options.checkDerived && states.length === 233) {
    const generated = buildDerived(states, audits, options.headLabel || 'working-tree', pipelineEvaluation.byIndex);
    const currentStatus = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');
    const currentChecklist = fs.readFileSync(path.join(bibleRoot, 'CHECKLIST.md'), 'utf8');
    if (normalizeText(currentStatus).trimEnd() !== normalizeText(generated.status).trimEnd()) problems.push('STATUS.md derivado divergente/stale');
    if (normalizeText(currentChecklist).trimEnd() !== normalizeText(generated.checklist).trimEnd()) problems.push('CHECKLIST.md derivado divergente/stale');
  }

  return { problems, states, audits, reservations, auditClaims, auditResults: distributed.records, auditPipelines: pipelineEvaluation.byIndex };
}

function evaluateMergeReadiness(validation, options = {}) {
  const states = Array.isArray(validation?.states) ? validation.states : [];
  const reservations = Array.isArray(validation?.reservations) ? validation.reservations : [];
  const auditClaims = Array.isArray(validation?.auditClaims) ? validation.auditClaims : [];
  const blockers = [];

  for (const problem of validation?.problems || []) blockers.push('coordination: ' + problem);
  if (states.length !== 233) blockers.push('corpus incompleto: states=' + states.length + '/233');

  const nonCompleted = states.filter((state) => state.status !== 'COMPLETED');
  if (nonCompleted.length) {
    blockers.push('states não-COMPLETED=' + nonCompleted.length + ': '
      + nonCompleted.map((state) => String(state.index).padStart(3, '0') + '/' + state.status).join(', '));
  }

  const repairRequired = states.filter((state) => state.coordination_status !== 'OK');
  if (repairRequired.length) {
    blockers.push('coordination_status não-OK=' + repairRequired.length + ': '
      + repairRequired.map((state) => String(state.index).padStart(3, '0') + '/' + state.coordination_status).join(', '));
  }

  const openRequests = [];
  const requestCounts = Object.fromEntries([...REQUEST_STATUSES].map((status) => [status, 0]));
  for (const state of states) {
    for (const request of Array.isArray(state.audit_requests) ? state.audit_requests : []) {
      const status = normalizeRequestStatus(request.status);
      if (Object.prototype.hasOwnProperty.call(requestCounts, status)) requestCounts[status] += 1;
      if (status === 'OPEN') openRequests.push(String(state.index).padStart(3, '0') + '/' + (request.id || 'sem-id'));
    }
  }
  if (openRequests.length) blockers.push('audit_requests OPEN=' + openRequests.length + ': ' + openRequests.join(', '));
  if (reservations.length) blockers.push('reservas ativas=' + reservations.length + ': ' + reservations.join(', '));
  if (auditClaims.length) blockers.push('audit claims ativos=' + auditClaims.length + ': ' + auditClaims.join(', '));
  if (options.progressLockActive) blockers.push('PROGRESS.lock.md ainda está ativo');
  if (options.bootstrapLockActive) blockers.push('BOOTSTRAP.lock.md ainda está ativo');

  return {
    ready: blockers.length === 0,
    blockers,
    counts: {
      states: states.length,
      completed: states.filter((state) => state.status === 'COMPLETED').length,
      nonCompleted: nonCompleted.length,
      coordinationRepairRequired: repairRequired.length,
      reservations: reservations.length,
      auditClaims: auditClaims.length,
      requests: requestCounts,
    },
  };
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
  evaluateMergeReadiness,
};
