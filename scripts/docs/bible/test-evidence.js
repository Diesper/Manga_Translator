'use strict';

const path = require('path');
const {
  STOP,
  isTestOrGate,
  identifiers,
  executable,
} = require('./project-files');

function buildEvidence(files) {
  const evidenceFiles = files.filter(file => isTestOrGate(file.rel));
  const tokenIndex = new Map();

  for (const file of evidenceFiles) {
    file.lowerContent = file.content.toLowerCase();

    for (const token of new Set(identifiers(file.content).map(id => id.toLowerCase()))) {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      const refs = tokenIndex.get(token);
      if (refs.length < 12) refs.push(file.rel);
    }
  }

  return { evidenceFiles, tokenIndex };
}

function statusForLine(file, line, contextSymbol, evidence) {
  if (!executable(line, file.rel)) {
    return 'ℹ️ **NÃO EXECUTÁVEL** — comentário, separador ou documentação; não exige prova de execução própria.';
  }

  if (isTestOrGate(file.rel)) {
    return '✅ **LINHA DE TESTE/GATE** — esta linha pertence ao próprio mecanismo de verificação; ela é parte da prova, não o alvo.';
  }

  const candidates = [];
  if (contextSymbol) candidates.push(contextSymbol);
  candidates.push(...identifiers(line));

  for (const symbol of candidates) {
    const key = symbol.toLowerCase();
    if (key.length < 4 || STOP.has(key)) continue;

    const refs = evidence.tokenIndex.get(key);
    if (!refs || !refs.length) continue;

    const unique = [...new Set(refs)]
      .filter(relative => relative !== file.rel)
      .slice(0, 4);

    if (unique.length) {
      return '✅ **TESTE/GATE ASSOCIADO AO CONTEXTO** — o símbolo `'
        + symbol
        + '` aparece em '
        + unique.map(relative => '`' + relative + '`').join(', ')
        + '. Isso é evidência rastreável de comportamento associado; não equivale a coverage de linha.';
    }
  }

  const base = path.basename(file.rel, path.extname(file.rel)).toLowerCase();
  const fileMentions = evidence.evidenceFiles
    .filter(candidate => candidate.rel !== file.rel)
    .filter(candidate => (
      candidate.lowerContent.includes(file.rel.toLowerCase())
      || (base.length >= 5 && candidate.lowerContent.includes(base))
    ))
    .map(candidate => candidate.rel)
    .slice(0, 4);

  if (fileMentions.length) {
    return '🟡 **ARQUIVO ALCANÇADO POR TESTE, MAS SEM PROVA ESPECÍFICA DESTA LINHA** — referências em '
      + fileMentions.map(relative => '`' + relative + '`').join(', ')
      + '. **Comentário extra obrigatório:** esta linha continua sem uma asserção/coverage rastreável que prove individualmente seu funcionamento.';
  }

  return '⚠️ **SEM TESTE PROBATÓRIO RASTREÁVEL** — **comentário extra obrigatório:** não foi encontrada prova automatizada ligada a esta linha ou ao contexto funcional atual. Alterações aqui devem ser tratadas como risco até existir teste/coverage que execute e faça asserções sobre este comportamento.';
}

module.exports = {
  buildEvidence,
  statusForLine,
};
