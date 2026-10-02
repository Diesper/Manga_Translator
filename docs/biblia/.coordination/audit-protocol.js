'use strict';

const fs = require('fs');
const path = require('path');
const core = require('./audit-core');
const lifecycleCore = require('./lifecycle-core');
const unverifiedFindings = require('./unverified-findings');
const humanGate = require('./human-gate');
const unitTransition = require('./unit-transition');

const repoRoot = path.resolve(__dirname, '../../..');
const bibleRoot = path.join(repoRoot, 'docs', 'biblia');
const stateRoot = path.join(bibleRoot, '.state');
const legacyClaimRoot = path.join(__dirname, 'audit-claims');
const leaseRoot = path.join(__dirname, 'audit-leases');
const reserveRoot = path.join(bibleRoot, '.reservas');
const auditRegistryPath = path.join(bibleRoot, 'AUDITORIA.md');

function walk(dir) {
  return core.walk(dir);
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

function parseClaimField(source, field) {
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    if (line.startsWith(field + ':')) return line.slice(field.length + 1).trim().replace(/^"|"$/g, '');
  }
  return null;
}

function reservationFilesBySource() {
  const result = new Map();
  for (const absolute of walk(reserveRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (!rel.endsWith('.lock.md')) continue;
    const prefix = 'docs/biblia/.reservas/';
    if (!rel.startsWith(prefix)) continue;
    const sourcePath = rel.slice(prefix.length, -'.lock.md'.length);
    result.set(sourcePath, rel);
  }
  return result;
}

function loadEditorialReservationEntries() {
  const entries = [];
  const prefix = 'docs/biblia/.reservas/';
  for (const absolute of walk(reserveRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (!rel.endsWith('.lock.md') || !rel.startsWith(prefix)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    entries.push({
      path: rel,
      agent: parseClaimField(source, 'AGENTE'),
      file: parseClaimField(source, 'ARQUIVO'),
      bible: parseClaimField(source, 'BIBLIA'),
      source_sha: parseClaimField(source, 'SHA_DO_FONTE_AO_RESERVAR'),
      state: parseClaimField(source, 'ESTADO'),
    });
  }
  return entries;
}

function validateEditorialReservationEntries(states, entries = []) {
  const problems = [];
  const strictProblems = [];
  const stateByFile = new Map((states || []).map((state) => [state.file, state]));
  const activeByAgent = new Map();
  const active = [];

  for (const entry of entries || []) {
    const rel = String(entry?.path || '').replace(/\\/g, '/');
    const agent = String(entry?.agent || '').trim();
    const file = String(entry?.file || '').replace(/\\/g, '/').trim();
    const bible = String(entry?.bible || '').replace(/\\/g, '/').trim();
    const sourceSha = String(entry?.source_sha || '').trim().toLowerCase();
    const lockState = String(entry?.state || '').trim().toUpperCase();
    const expectedPath = file ? 'docs/biblia/.reservas/' + file + '.lock.md' : null;

    if (!agent) problems.push('reserva editorial sem AGENTE: ' + rel);
    if (!file) problems.push('reserva editorial sem ARQUIVO: ' + rel);
    if (!bible) problems.push('reserva editorial sem BIBLIA: ' + rel);
    if (expectedPath && rel !== expectedPath) problems.push('reserva editorial path/ARQUIVO divergente: ' + rel);
    if (!/^[0-9a-f]{40}$/i.test(sourceSha)) problems.push('reserva editorial SHA inválido: ' + rel);
    if (lockState !== 'ACTIVE') problems.push('reserva editorial deve estar ACTIVE ou ser removida: ' + rel);

    const state = stateByFile.get(file);
    if (!state) {
      problems.push('reserva editorial fora do corpus: ' + rel);
      continue;
    }
    if (bible && bible !== state.bible) problems.push('reserva editorial BIBLIA diverge do state: ' + rel);
    if (state.status !== 'IN_PROGRESS') {
      problems.push('reserva editorial ACTIVE exige state IN_PROGRESS: #' + String(state.index).padStart(3, '0') + '/' + state.status);
    }
    if (agent && String(state.agent || '').trim() !== agent) {
      problems.push('reserva editorial AGENTE diverge do owner do state: #' + String(state.index).padStart(3, '0'));
    }

    if (lockState === 'ACTIVE') {
      active.push(rel);
      if (agent) {
        const list = activeByAgent.get(agent) || [];
        list.push(rel);
        activeByAgent.set(agent, list);
      }
    }
  }

  for (const [agent, paths] of activeByAgent.entries()) {
    if (paths.length > 1) {
      strictProblems.push('corretor possui >1 reserva editorial ativa: ' + agent + ' -> ' + paths.join(', '));
    }
  }

  return { problems, strictProblems, active, activeByAgent };
}

function validateEditorialReservations(states) {
  return validateEditorialReservationEntries(states, loadEditorialReservationEntries());
}

function commonClaimProblems({
  state,
  index,
  auditor,
  sourceSha,
  sourcePath,
  biblePath,
  rel,
  phase,
  reservationPath = null,
}) {
  const problems = [];
  if (!auditor) problems.push('claim/lease sem AUDITOR: ' + rel);
  if (!state) {
    problems.push('claim/lease fora do corpus: ' + rel);
    return problems;
  }
  if (sourceSha !== state.source_sha) problems.push('claim/lease SOURCE_SHA stale: ' + rel);
  if (sourcePath && sourcePath !== state.file) problems.push('claim/lease ARQUIVO diverge do state: ' + rel);
  if (biblePath && biblePath !== state.bible) problems.push('claim/lease BIBLIA diverge do state: ' + rel);
  if (reservationPath) {
    problems.push(
      'claim/lease conflita com reserva de edição: #'
      + String(index).padStart(3, '0') + ' (' + phase + ')'
    );
  }
  return problems;
}

function duplicateIndexProblem(activeByIndex, index, rel) {
  if (!activeByIndex.has(index)) return null;
  return 'mais de um claim/lease ativo para índice '
    + index + ': ' + activeByIndex.get(index).path + ', ' + rel;
}

function leaseRevisionProblems({ state, bibleSha, currentBibleSha, baseline, rel }) {
  const problems = [];
  if (!state) return problems;

  if (bibleSha) {
    if (!/^[0-9a-f]{40}$/i.test(bibleSha)) {
      problems.push('lease BIBLE_SHA inválido: ' + rel);
    } else if (currentBibleSha && bibleSha.toLowerCase() !== currentBibleSha.toLowerCase()) {
      problems.push('lease BIBLE_SHA stale: ' + rel);
    }
    return problems;
  }

  const entry = core.baselineEntryFor(state, baseline);
  if (!entry || !currentBibleSha || entry.bible_sha !== currentBibleSha) {
    problems.push('lease legado sem BIBLE_SHA não corresponde à Bíblia atual: ' + rel);
  }
  return problems;
}

function validateClaims(states, options = {}) {
  const baseline = options.baseline || core.loadBibleBaseline(repoRoot);
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  const reservations = reservationFilesBySource();
  const problems = [];
  const strictProblems = [];
  const activeByIndex = new Map();
  const activeByAuditor = new Map();
  const active = [];
  const expired = [];

  function register(index, auditor, rel, phase) {
    const duplicate = duplicateIndexProblem(activeByIndex, index, rel);
    if (duplicate) {
      problems.push(duplicate);
    } else {
      activeByIndex.set(index, { path: rel, auditor, phase });
    }
    active.push(rel);
    if (auditor) {
      const list = activeByAuditor.get(auditor) || [];
      list.push(rel);
      activeByAuditor.set(auditor, list);
    }
  }

  function validateCommon({ index, auditor, sourceSha, sourcePath, biblePath, rel, phase }) {
    const state = stateByIndex.get(index);
    problems.push(...commonClaimProblems({
      state,
      index,
      auditor,
      sourceSha,
      sourcePath,
      biblePath,
      rel,
      phase,
      reservationPath: state ? reservations.get(state.file) : null,
    }));
    return state || null;
  }

  // Claims planos legados permanecem PRIMARY durante a migração.
  for (const absolute of walk(legacyClaimRoot)) {
    const rel = path.relative(repoRoot, absolute).replace(/\\/g, '/');
    if (!/^docs\/biblia\/\.coordination\/audit-claims\/\d{3}\.lock\.md$/.test(rel)) continue;

    const source = fs.readFileSync(absolute, 'utf8');
    const basename = path.basename(rel);
    const index = Number(parseClaimField(source, 'INDEX'));
    const auditor = parseClaimField(source, 'AUDITOR');
    const sourceSha = parseClaimField(source, 'SOURCE_SHA');
    const sourcePath = parseClaimField(source, 'ARQUIVO');
    const biblePath = parseClaimField(source, 'BIBLIA');
    const indexMatch = /^(\d{3})\.lock\.md$/.exec(basename);

    if (!indexMatch || Number(indexMatch[1]) !== index) problems.push('claim legado filename/index divergente: ' + rel);
    validateCommon({ index, auditor, sourceSha, sourcePath, biblePath, rel, phase: 'PRIMARY' });
    register(index, auditor, rel, 'PRIMARY');
  }

  // Novos trabalhos usam leases por fase. BIBLE_SHA é obrigatório para a
  // geração nova; leases antigos sem o campo só sobrevivem enquanto a Bíblia
  // permanecer idêntica à baseline de migração.
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
    const bibleSha = parseClaimField(source, 'BIBLE_SHA');
    const sourcePath = parseClaimField(source, 'ARQUIVO');
    const biblePath = parseClaimField(source, 'BIBLIA');
    const leaseExpiresAt = parseClaimField(source, 'LEASE_EXPIRES_AT_UTC');
    const leaseState = parseClaimField(source, 'ESTADO');

    if (index !== pathIndex) problems.push('lease filename/index divergente: ' + rel);
    if (declaredPhase !== pathPhase) problems.push('lease PHASE diverge do path: ' + rel);
    if (leaseState !== 'ACTIVE') problems.push('lease deve estar ACTIVE: ' + rel);

    const state = validateCommon({
      index,
      auditor,
      sourceSha,
      sourcePath,
      biblePath,
      rel,
      phase: pathPhase,
    });

    if (state) {
      const currentBibleSha = core.currentBibleSha(repoRoot, state);
      problems.push(...leaseRevisionProblems({
        state,
        bibleSha,
        currentBibleSha,
        baseline,
        rel,
      }));

      const lifecycle = options.lifecycleByIndex instanceof Map
        ? options.lifecycleByIndex.get(index)
        : lifecycleCore.lifecycleSnapshot(state);
      const humanAuditApproval = lifecycle?.human_locked
        ? humanGate.activeHumanApproval(
          state,
          lifecycle,
          options.humanApprovals || [],
          'ALLOW_AUDIT_ONLY'
        )
        : null;
      const humanAuditAllowed = Boolean(lifecycle?.human_locked && humanAuditApproval);
      if (pathPhase === 'PRIMARY'
        && state.status !== 'READY_FOR_AUDIT'
        && !(state.status === 'HUMAN_LOCKED' && humanAuditAllowed)) {
        problems.push('lease PRIMARY incompatível com status: #' + index + '/' + state.status);
      }
      if ((pathPhase === 'ADVERSARIAL' || pathPhase === 'REAUDIT')
        && !['READY_FOR_AUDIT', 'COMPLETED', 'CHANGES_REQUIRED'].includes(state.status)
        && !(state.status === 'HUMAN_LOCKED' && humanAuditAllowed)) {
        problems.push('lease ' + pathPhase + ' incompatível com status: #' + index + '/' + state.status);
      }
    }

    const leaseMs = Date.parse(leaseExpiresAt || '');
    if (!Number.isFinite(leaseMs)) {
      problems.push('lease sem LEASE_EXPIRES_AT_UTC válido: ' + rel);
      register(index, auditor, rel, pathPhase);
    } else if (leaseMs <= Date.now()) {
      expired.push(rel);
    } else {
      register(index, auditor, rel, pathPhase);
    }
  }

  strictProblems.push(...strictOwnershipProblems(activeByAuditor, expired));

  return {
    problems,
    strictProblems,
    active,
    expired,
    activeByIndex,
    activeByAuditor,
    reservations: [...reservations.values()].sort(),
  };
}

function strictOwnershipProblems(activeByAuditor, expired = []) {
  const strictProblems = [];
  const entries = activeByAuditor instanceof Map
    ? activeByAuditor.entries()
    : Object.entries(activeByAuditor || {});
  for (const [auditor, pathsValue] of entries) {
    const paths = Array.isArray(pathsValue) ? pathsValue : [];
    if (paths.length > 1) {
      strictProblems.push('auditor possui >1 claim/lease ativo: ' + auditor + ' -> ' + paths.join(', '));
    }
  }
  for (const rel of expired || []) {
    strictProblems.push('lease expirado residual deve ser reconciliado/removido por CAS: ' + rel);
  }
  return strictProblems;
}

function loadResults(states) {
  return core.loadAuditResults(repoRoot, states);
}

function resolvePipeline(state, records = [], legacyAudits = new Map(), options = {}) {
  const baseline = options.baseline || core.loadBibleBaseline(repoRoot);
  return core.resolveAuditPipeline(state, records, legacyAudits, {
    root: options.root || repoRoot,
    baseline,
  });
}

function loadModel() {
  const states = readStates();
  const baseline = core.loadBibleBaseline(repoRoot);
  const legacyAudits = fs.existsSync(auditRegistryPath)
    ? parseLegacyAuditRegistry(fs.readFileSync(auditRegistryPath, 'utf8'))
    : new Map();
  const loaded = core.loadAuditResults(repoRoot, states);
  const lifecycle = lifecycleCore.evaluateLifecycleStates(states);
  const findings = unverifiedFindings.loadUnverifiedFindings(repoRoot);
  const approvals = humanGate.loadHumanApprovals(repoRoot);
  const claims = validateClaims(states, {
    baseline,
    lifecycleByIndex: lifecycle.byIndex,
    humanApprovals: approvals.approvals,
  });
  const editorialReservations = validateEditorialReservations(states);
  const evaluation = core.evaluateAuditPipelines(states, loaded.records, legacyAudits, {
    root: repoRoot,
    baseline,
  });
  const handoffProblems = core.postHandoffCorrectionProblems(states, loaded.records, { root: repoRoot });
  const humanProblems = humanGate.humanGateProblems(states, lifecycle.byIndex, approvals.approvals);
  const humanAuditProblems = humanGate.humanAuditResultProblems(
    states,
    lifecycle.byIndex,
    approvals.approvals,
    loaded.records
  );
  const pipelines = states.map((state) => evaluation.byIndex.get(state.index));
  const pipelineByIndex = new Map(pipelines.map((pipeline) => [pipeline.index, pipeline]));
  const humanApprovalAuditorProblems = humanGate.humanApprovalAuditorProblems(
    approvals.approvals,
    pipelineByIndex
  );
  const humanPermanentCloseProblems = humanGate.humanPermanentClosePipelineProblems(
    states,
    approvals.approvals,
    pipelineByIndex
  );
  const tokens = unitTransition.loadCorrectionTokens(repoRoot, states, {
    pipelines: pipelineByIndex,
    humanApprovals: approvals.approvals,
  });

  return {
    states,
    baseline,
    legacyAudits,
    results: loaded.records,
    pipelines,
    lifecycle_by_index: lifecycle.byIndex,
    human_locked: lifecycle.humanLocked,
    unverified_findings: findings.findings,
    human_approvals: approvals.approvals,
    correction_tokens: tokens.tokens,
    active_correction_tokens: [...tokens.activeByIndex.values()],
    active_claims_and_leases: claims.active,
    expired_leases: claims.expired,
    reservations: editorialReservations.active,
    editorial_reservations_by_agent: editorialReservations.activeByAgent,
    problems: [
      ...loaded.problems,
      ...claims.problems,
      ...editorialReservations.problems,
      ...evaluation.problems,
      ...handoffProblems,
      ...lifecycle.problems,
      ...findings.problems,
      ...approvals.problems,
      ...humanProblems,
      ...humanAuditProblems,
      ...humanApprovalAuditorProblems,
      ...humanPermanentCloseProblems,
      ...tokens.problems,
    ],
    merge_problems: [...claims.strictProblems, ...editorialReservations.strictProblems],
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
  const blockers = [...model.problems, ...(model.merge_problems || [])];

  if (model.states.length !== 233) blockers.push('corpus de states incompleto: ' + model.states.length + '/233');
  if (!model.baseline || Object.keys(model.baseline.bibles || {}).length !== 233) {
    blockers.push('baseline de revisão das Bíblias incompleta ou ausente');
  }
  if (model.reservations.length) blockers.push('reservas editoriais ativas=' + model.reservations.length);
  if (model.active_claims_and_leases.length) {
    blockers.push('claims/leases ativos=' + model.active_claims_and_leases.length + ': ' + model.active_claims_and_leases.join(', '));
  }
  if (model.expired_leases.length) {
    blockers.push('leases expirados residuais=' + model.expired_leases.length + ': ' + model.expired_leases.join(', '));
  }
  if ((model.human_locked || []).length) {
    blockers.push(
      'unidades HUMAN_LOCKED=' + model.human_locked.length + ': '
      + model.human_locked.map((item) => String(item.index).padStart(3, '0') + '/cycle-' + item.cycle).join(', ')
    );
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
    console.log('Distributed audit protocol: READY — 233/233 PRIMARY + ADVERSARIAL, divergências re-auditadas, Bible revisions atuais.');
    return;
  }

  for (const pipeline of model.pipelines) console.log(formatPipeline(pipeline));
  if (model.problems.length) {
    console.error('Problemas operacionais de coordenação:');
    for (const problem of model.problems) console.error('- ' + problem);
    process.exitCode = 1;
  }
  if (model.merge_problems.length) {
    console.error('Pendências estritas do gate final:');
    for (const problem of model.merge_problems) console.error('- ' + problem);
  }
}

if (require.main === module) main();

module.exports = {
  parseLegacyAuditRegistry,
  readStates,
  parseClaimField,
  reservationFilesBySource,
  loadEditorialReservationEntries,
  validateEditorialReservationEntries,
  validateEditorialReservations,
  commonClaimProblems,
  duplicateIndexProblem,
  leaseRevisionProblems,
  validateClaims,
  strictOwnershipProblems,
  loadResults,
  resolvePipeline,
  loadModel,
  verify,
};
