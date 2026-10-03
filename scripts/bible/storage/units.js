'use strict';
const fs=require('fs');
const path=require('path');
const storage=require('./files');
const auditCore=require('../core/audit-core');
const life=require('../core/lifecycle-core');
const {finalDecisionRecord,decisionIdForPipeline,tokenConsumed,tokenConsumptionCount,tokenHistoryProblems,expectedCorrectionTokenId,issueCorrectionToken,validateCorrectionToken,assertCas,requireCasPreconditions,persistSnapshot,revisionBindingProblems,projectAuditDecision,planTransition,tokenPath,correctionReservationRelativePath,reservationField,ownershipIndex}=require('../core/unit-transition');

function activeCorrectionReservations(root) {
  const base = path.join(root, 'docs', 'biblia', '.reservas');
  return walk(base)
    .filter((absolute) => /\.lock\.md$/i.test(absolute))
    .map((absolute) => {
      const source = fs.readFileSync(absolute, 'utf8');
      return {
        path: path.relative(root, absolute).replace(/\\/g, '/'),
        agent: reservationField(source, 'AGENTE'),
        file: reservationField(source, 'ARQUIVO'),
        bible: reservationField(source, 'BIBLIA'),
        source_sha: reservationField(source, 'SHA_DO_FONTE_AO_RESERVAR'),
        state: reservationField(source, 'ESTADO'),
      };
    })
    .filter((item) => !item.state || item.state === 'ACTIVE');
}

function assertCorrectionReservation(root, state, actor) {
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) throw new Error('CORRECTION_RESERVATION_REQUIRED');
  const source = fs.readFileSync(absolute, 'utf8');
  const owner = reservationField(source, 'AGENTE');
  const file = reservationField(source, 'ARQUIVO');
  const bible = reservationField(source, 'BIBLIA');
  if (owner !== actor) throw new Error('CORRECTION_RESERVATION_OWNER_MISMATCH');
  if (file && file !== state.file) throw new Error('CORRECTION_RESERVATION_FILE_MISMATCH');
  if (bible && bible !== state.bible) throw new Error('CORRECTION_RESERVATION_BIBLE_MISMATCH');
  return rel;
}

function createCorrectionReservation(root, state, actor, atUtc, token) {
  if (!actor) throw new Error('ACTOR_REQUIRED');
  if (!Number.isFinite(Date.parse(atUtc || ''))) throw new Error('RESERVATION_AT_REQUIRED');
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  const active = activeCorrectionReservations(root);
  if (active.some((item) => item.path === rel) || fs.existsSync(absolute)) {
    throw new Error('UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED');
  }
  const owned = active.find((item) => item.agent === actor);
  if (owned) throw new Error('CORRECTOR_ALREADY_RESERVED:' + owned.path);

  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const content = [
    'AGENTE: ' + actor,
    'ARQUIVO: ' + state.file,
    'BIBLIA: ' + state.bible,
    'SHA_DO_FONTE_AO_RESERVAR: ' + state.source_sha,
    'RESERVADO_EM_UTC: ' + atUtc,
    'ATUALIZADO_EM_UTC: ' + atUtc,
    'PR: #66',
    'BRANCH: docs/project-bible',
    'ESTADO: ACTIVE',
    'CORRECTION_TOKEN_ID: ' + (token?.token_id || '-'),
    'REVISION_ID: ' + (token?.revision_id || '-'),
    'CORRECTION_CYCLE: ' + (token?.correction_cycle ?? '-'),
    '',
  ].join('\n');
  storage.atomicWrite(absolute, content, { createOnly: true });
  return rel;
}

function releaseCorrectionReservation(root, state, actor, options = {}) {
  const rel = correctionReservationRelativePath(state);
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) {
    if (options.optional) return null;
    throw new Error('CORRECTION_RESERVATION_REQUIRED');
  }
  assertCorrectionReservation(root, state, actor);
  fs.unlinkSync(absolute);
  return rel;
}

function deterministicProductionSha(root, state) {
  const files = [...new Set(Array.isArray(state?.production_files) ? state.production_files : [])]
    .filter((value) => typeof value === 'string' && value)
    .sort();
  if (!files.length) return life.lifecycleSnapshot(state).production_sha;
  const manifest = files.map((file) => {
    const sha = auditCore.gitWorkingTreeBlobSha(root, file);
    if (!life.validSha(sha)) throw new Error('PRODUCTION_FILE_SHA_UNAVAILABLE:' + file);
    return { file: file.replace(/\\/g, '/'), sha };
  });
  return auditCore.gitBlobShaBuffer(Buffer.from(life.stableJson(manifest)));
}

function workingRevision(root, state) {
  const testSha = auditCore.gitWorkingTreeBlobSha(root, state?.file);
  const bibleSha = auditCore.gitWorkingTreeBlobSha(root, state?.bible);
  if (!life.validSha(testSha)) throw new Error('TEST_SHA_UNAVAILABLE');
  if (!life.validSha(bibleSha)) throw new Error('BIBLE_SHA_UNAVAILABLE');
  return {
    test_sha: testSha,
    bible_sha: bibleSha,
    production_sha: auditCore.currentProductionSha(root, state),
  };
}

function currentWorkingIdentity(root, state) {
  const actual = workingRevision(root, state);
  return {
    ...actual,
    revision_id: life.revisionIdentity(state, actual).revision_id,
  };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function loadCorrectionTokens(root, states = [], options = {}) {
  const base = path.join(root, 'docs', 'biblia', '.coordination', 'correction-authorizations');
  const stateByIndex = new Map((states || []).map((state) => [state.index, state]));
  const tokens = [];
  const problems = [];
  const ids = new Set();
  const activeByIndex = new Map();

  for (const absolute of walk(base)) {
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push(rel + ': correction authorization deve ser JSON');
      continue;
    }
    let token;
    try { token = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch (error) {
      problems.push(rel + ': JSON inválido: ' + error.message);
      continue;
    }
    tokens.push({ ...token, path: rel });
    const pathMatch = /^docs\/biblia\/\.coordination\/correction-authorizations\/(\d{3})\/([^/]+)\.json$/i.exec(rel);
    if (!pathMatch) {
      problems.push(rel + ': path de correction token inválido');
    } else {
      if (Number(pathMatch[1]) !== Number(token?.index)) problems.push(rel + ': index do token diverge do path');
      if (pathMatch[2] !== String(token?.token_id || '')) problems.push(rel + ': token_id diverge do filename');
    }
    if (ids.has(token?.token_id)) problems.push(rel + ': token_id duplicado');
    if (token?.token_id) ids.add(token.token_id);

    const state = stateByIndex.get(Number(token?.index));
    if (!state) {
      problems.push(rel + ': token fora do corpus');
      continue;
    }
    const consumptionCount = tokenConsumptionCount(state, token?.token_id);
    if (consumptionCount > 1) problems.push(rel + ': token consumido mais de uma vez');
    if (consumptionCount === 0) {
      const pipeline = options.pipelines instanceof Map ? options.pipelines.get(state.index) : null;
      for (const problem of validateCorrectionToken(state, token, {
        pipeline,
        humanApprovals: options.humanApprovals || [],
      })) problems.push(rel + ': ' + problem);
      if (activeByIndex.has(state.index)) {
        problems.push(rel + ': mais de um correction token ativo para o mesmo índice');
      } else {
        activeByIndex.set(state.index, rel);
      }
    }
  }
  problems.push(...tokenHistoryProblems(states, tokens));
  return { tokens, problems, activeByIndex };
}

function loadToken(root, index, tokenId) {
  const absolute = tokenPath(root, index, tokenId);
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

module.exports={deterministicProductionSha,workingRevision,currentWorkingIdentity,loadCorrectionTokens,loadToken,activeCorrectionReservations,assertCorrectionReservation,createCorrectionReservation,releaseCorrectionReservation};
