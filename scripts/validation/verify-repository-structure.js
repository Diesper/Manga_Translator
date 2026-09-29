'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const problems = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function walk(dir, { ignore = new Set() } = {}) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (ignore.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, { ignore });
    return entry.isFile() ? [full] : [];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function requirePresent(relPath) {
  if (!exists(relPath)) problems.push('arquivo/diretório obrigatório ausente: ' + relPath);
}

function requireAbsent(relPath) {
  if (exists(relPath)) problems.push('legado proibido ainda existe: ' + relPath);
}

for (const required of [
  'package.json',
  'package-lock.json',
  'jest.config.js',
  'playwright.config.js',
  'extension/manifest.json',
  'extension/background.js',
  'extension/background',
  'extension/content/content_manga.js',
  'extension/content/content_gemini.js',
  'extension/content/inject.js',
  'extension/content/gemini/job-runner.js',
  'extension/shared/gtc-fingerprint.js',
  'extension/shared/gtc-indexeddb.js',
  'extension/shared/storage-manager.js',
  'extension/shared/shared-ui.js',
  'extension/popup/popup.html',
  'extension/popup/popup.js',
  'extension/options/options.html',
  'extension/options/options.js',
  'extension/reader/reader.html',
  'extension/reader/reader.js',
  'tests/unit',
  'tests/integration',
  'tests/smoke',
  'tests/visual',
  'tests/e2e',
  'tests/fixtures',
  'tests/helpers',
  'tests/mocks',
  'tests/setup',
  'scripts/ci/data/test-baseline.json',
  'scripts/ci/data/e2e-shard-plan.json',
  'scripts/ci/data/regression-matrix.json',
  'scripts/validation/verify-ci-contract.js',
  'scripts/release/sync-version.js',
  'docs/Documentação.md',
  'docs/biblia/STATUS.md',
  'docs/biblia/CHECKLIST.md',
  'docs/biblia/AUDITORIA.md',
]) requirePresent(required);

const docsRootEntries = fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })
  .map(entry => entry.name)
  .sort();
const expectedDocsRootEntries = ['Documentação.md', 'biblia'].sort();
if (JSON.stringify(docsRootEntries) !== JSON.stringify(expectedDocsRootEntries)) {
  problems.push(
    'docs/ deve conter somente Documentação.md e o diretório biblia/; encontrados: '
    + docsRootEntries.join(', ')
  );
}

requireAbsent('docs/Bíblia.md');


function gitBlobSha(source) {
  const buffer = Buffer.from(source, 'utf8');
  return crypto.createHash('sha1')
    .update('blob ' + buffer.length + '\0')
    .update(buffer)
    .digest('hex');
}

function extractBibleIntegralSource(bible) {
  const normalized = bible.replace(/\r\n/g, '\n');
  const section = /^##+\s+(?:\d+\.\s+)?Fonte integral(?: auditada)?\s*$/im.exec(normalized);
  if (!section) return null;

  const rest = normalized.slice(section.index + section[0].length);
  const fence = /\n```[A-Za-z0-9_-]*\n/.exec(rest);
  if (!fence) return null;

  const contentStart = fence.index + fence[0].length;
  const after = rest.slice(contentStart);
  const contentEnd = after.indexOf('\n```');
  if (contentEnd < 0) return null;
  return after.slice(0, contentEnd);
}

function validateApprovedBible(sourcePath, biblePath) {
  if (!exists(sourcePath)) {
    problems.push('Bíblia aprovada aponta para fonte ausente: ' + sourcePath);
    return;
  }

  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n');
  const bible = fs.readFileSync(path.join(root, biblePath), 'utf8').replace(/\r\n/g, '\n');

  if (!/> \*\*Estado:\*\*[^\n]*CONCLUÍDO[^\n]*AUDITORIA DE QUALIDADE APROVADA/i.test(bible)) {
    problems.push('Bíblia CONCLUÍDA sem selo interno de auditoria aprovada: ' + sourcePath);
  }
  if (/REVISÃO DE QUALIDADE/i.test(bible.split('\n').slice(0, 12).join('\n'))) {
    problems.push('Bíblia CONCLUÍDA ainda se declara em revisão: ' + sourcePath);
  }

  const declaredSha = /\*\*SHA(?: do conteúdo)? auditado:\*\*\s*`([0-9a-f]{40})`/i.exec(bible);
  const actualSha = gitBlobSha(source);
  if (!declaredSha || declaredSha[1] !== actualSha) {
    problems.push(
      'SHA auditado divergente em ' + sourcePath
      + ': declarado=' + (declaredSha ? declaredSha[1] : 'ausente')
      + ', atual=' + actualSha
    );
  }

  const embedded = extractBibleIntegralSource(bible);
  const sourceWithoutTerminalNewline = source.endsWith('\n') ? source.slice(0, -1) : source;
  const embeddedMatches = embedded !== null && (
    embedded === sourceWithoutTerminalNewline ||
    embedded === sourceWithoutTerminalNewline + '\n'
  );
  if (!embeddedMatches) {
    problems.push('Fonte integral da Bíblia diverge da fonte auditada: ' + sourcePath);
  }

  const headings = [...bible.matchAll(/^#{2,4}\s+Linha\s+0*(\d+)/gm)]
    .map(match => Number(match[1]));
  const sourcePositions = source.split('\n').length;
  const sequential = headings.every((value, index) => value === index + 1);
  if (headings.length !== sourcePositions || !sequential) {
    problems.push(
      'Cobertura linha a linha incompleta em ' + sourcePath
      + ': posições documentadas=' + headings.length
      + ', posições fonte=' + sourcePositions
    );
  }

  if (!/Invariantes/i.test(bible)) {
    problems.push('Bíblia aprovada sem seção de invariantes: ' + sourcePath);
  }
  if (!/Lacunas|SEM TESTE PROBATÓRIO/i.test(bible)) {
    problems.push('Bíblia aprovada sem seção/avisos de lacunas de teste: ' + sourcePath);
  }

  const proseOnly = bible.replace(/```[\s\S]*?```/g, '');
  const forbiddenBoilerplate = [
    /executa a instrução concreta/i,
    /executa a instrução específica(?: de)?/i,
    /usa os dados já validados pelas linhas/i,
    /usa valores produzidos nas linhas vizinhas/i,
    /usa identidades e valores estabelecidos pelas linhas anteriores/i,
    /dentro do protocolo de (?:claim|commit)/i,
    /coberta direta ou estruturalmente pelos cenários/i,
    /quando coberta pelos cenários diretos acima/i,
    /a ordem desta seção é parte do contrato/i,
  ];
  const badPattern = forbiddenBoilerplate.find(pattern => pattern.test(proseOnly));
  if (badPattern) {
    problems.push(
      'Bíblia aprovada contém boilerplate genérico proibido '
      + String(badPattern) + ': ' + sourcePath
    );
  }
}

function validateReviewBibleHeader(sourcePath, biblePath, active) {
  if (!exists(biblePath)) return;
  const head = fs.readFileSync(path.join(root, biblePath), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .slice(0, 14)
    .join('\n');
  if (!/REVISÃO DE QUALIDADE/i.test(head)) {
    problems.push('Bíblia em revisão sem aviso interno de REVISÃO DE QUALIDADE: ' + sourcePath);
  }
  if (active && !/EM ANDAMENTO/i.test(head)) {
    problems.push('Bíblia do arquivo EM ANDAMENTO não declara revisão ativa: ' + sourcePath);
  }
}

const bibleRoot = path.join(root, 'docs', 'biblia');

function coordinationField(source, field) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');
    const prefix = field + ':';
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim().replace(/^"|"$/g, '');
    }
  }
  return null;
}
if (fs.existsSync(bibleRoot)) {
  const bibleFiles = walk(bibleRoot).map(rel).sort();
  const allowedControlFiles = new Set([
    'docs/biblia/STATUS.md',
    'docs/biblia/CHECKLIST.md',
    'docs/biblia/AUDITORIA.md',
  ]);
  const isCoordinationInfrastructure = file =>
    file.startsWith('docs/biblia/.reservas/')
    || file.startsWith('docs/biblia/.coordination/');
  const unexpectedBibleFiles = bibleFiles.filter(file =>
    !allowedControlFiles.has(file)
    && !isCoordinationInfrastructure(file)
    && !file.endsWith('/Bíblia.md')
  );
  if (unexpectedBibleFiles.length) {
    problems.push(
      'docs/biblia/ só pode conter STATUS.md, CHECKLIST.md, AUDITORIA.md e Bíblias individuais; inesperados: '
      + unexpectedBibleFiles.join(', ')
    );
  }

  const statusSource = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');
  const checklistSource = fs.readFileSync(path.join(bibleRoot, 'CHECKLIST.md'), 'utf8');
  const auditSource = fs.readFileSync(path.join(bibleRoot, 'AUDITORIA.md'), 'utf8');

  const completedFromStatus = new Set(
    [...statusSource.matchAll(/\|\s*\d+\s*\|\s*✅ CONCLUÍDO\s*\|\s*`([^`]+)`/g)]
      .map(match => match[1])
  );
  const reviewFromStatus = new Set(
    [...statusSource.matchAll(/\|\s*\d+\s*\|\s*🟣 REVISÃO DE QUALIDADE\s*\|\s*`([^`]+)`/g)]
      .map(match => match[1])
  );
  const inProgressEntries = [...statusSource.matchAll(
    /\|\s*(\d+)\s*\|\s*🟠 EM ANDAMENTO\s*—\s*([^|]+?)\s*\|\s*`([^`]+)`/g
  )].map(match => ({
    index: Number(match[1]),
    agent: match[2].trim(),
    sourcePath: match[3],
  }));
  const inProgress = inProgressEntries.map(entry => entry.sourcePath);
  const inProgressByFile = new Map(inProgressEntries.map(entry => [entry.sourcePath, entry]));

  const statusRows = [...statusSource.matchAll(
    /^\|\s*(\d+)\s*\|[^|]+\|\s*`([^`]+)`/gm
  )].map(match => ({ index: Number(match[1]), sourcePath: match[2] }));
  const uniqueStatusPaths = new Set(statusRows.map(row => row.sourcePath));
  if (statusRows.length !== 233 || uniqueStatusPaths.size !== 233) {
    problems.push(
      'docs/biblia/STATUS.md precisa representar 233 arquivos únicos; linhas='
      + statusRows.length + ', únicos=' + uniqueStatusPaths.size
    );
  }

  const completedFromChecklist = new Set(
    [...checklistSource.matchAll(/^- \[x\]\s+\d+\s+—\s+`([^`]+)`/gm)]
      .map(match => match[1])
  );
  const approvedFromAudit = new Set(
    [...auditSource.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|.*\|\s*✅ APROVADO\s*\|$/gm)]
      .map(match => match[1])
  );
  const reviewFromAudit = new Set(
    [...auditSource.matchAll(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|.*\|\s*🟣 REVISÃO OBRIGATÓRIA\s*\|$/gm)]
      .map(match => match[1])
  );

  const sortedStatusDone = [...completedFromStatus].sort();
  const sortedChecklistDone = [...completedFromChecklist].sort();
  const sortedAuditApproved = [...approvedFromAudit].sort();

  const checklistCurrentEntries = [
    ...checklistSource.matchAll(
      /^- \[ \]\s+(\d+)\s+—\s+`([^`]+)`[^\n]*\*\*← EM ANDAMENTO\s*—\s*([^*]+)\*\*/gm
    ),
  ].map(match => ({
    index: Number(match[1]),
    sourcePath: match[2],
    agent: match[3].trim(),
  }));
  const checklistCurrentByFile = new Map(
    checklistCurrentEntries.map(entry => [entry.sourcePath, entry])
  );

  if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedChecklistDone)) {
    problems.push('STATUS.md e CHECKLIST.md divergem sobre quais Bíblias estão concluídas');
  }
  if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedAuditApproved)) {
    problems.push('STATUS.md não pode marcar CONCLUÍDO sem ✅ APROVADO correspondente em AUDITORIA.md');
  }

  if (checklistCurrentEntries.length !== inProgressEntries.length) {
    problems.push(
      'STATUS.md e CHECKLIST.md divergem na quantidade de arquivos EM ANDAMENTO: status='
      + inProgressEntries.length + ', checklist=' + checklistCurrentEntries.length
    );
  }
  for (const entry of inProgressEntries) {
    const checklistEntry = checklistCurrentByFile.get(entry.sourcePath);
    if (!checklistEntry || checklistEntry.agent !== entry.agent || checklistEntry.index !== entry.index) {
      problems.push(
        'STATUS.md e CHECKLIST.md divergem sobre ownership de EM ANDAMENTO: '
        + entry.sourcePath + ' / ' + entry.agent
      );
    }
  }

  const auditReviewExpected = new Set([...reviewFromStatus]);
  const sortedAuditReviewExpected = [...auditReviewExpected].sort();
  const sortedAuditReviewActual = [...reviewFromAudit].sort();
  if (JSON.stringify(sortedAuditReviewExpected) !== JSON.stringify(sortedAuditReviewActual)) {
    problems.push('STATUS.md e AUDITORIA.md divergem sobre Bíblias em revisão de qualidade');
  }

  const reservationRoot = path.join(bibleRoot, '.reservas');
  const reservationFiles = fs.existsSync(reservationRoot)
    ? walk(reservationRoot).map(rel).filter(file => file.endsWith('.lock.md')).sort()
    : [];
  const reservationsByFile = new Map();
  const reservationCountByAgent = new Map();

  for (const reservationFile of reservationFiles) {
    const reservationSource = fs.readFileSync(path.join(root, reservationFile), 'utf8');
    const agent = coordinationField(reservationSource, 'AGENTE');
    const sourcePath = coordinationField(reservationSource, 'ARQUIVO');
    const biblePath = coordinationField(reservationSource, 'BÍBLIA');
    const reservedSha = coordinationField(reservationSource, 'SHA_DO_FONTE_AO_RESERVAR');
    const state = coordinationField(reservationSource, 'ESTADO');

    if (!agent || !sourcePath || !biblePath || !reservedSha || !state) {
      problems.push('Reserva incompleta: ' + reservationFile);
      continue;
    }
    if (state !== 'ATIVA') {
      problems.push('Reserva presente precisa estar ATIVA: ' + reservationFile + ' / estado=' + state);
    }

    const expectedReservation = 'docs/biblia/.reservas/' + sourcePath + '.lock.md';
    if (reservationFile !== expectedReservation) {
      problems.push('Caminho da reserva não espelha o fonte: ' + reservationFile + ' / esperado=' + expectedReservation);
    }
    const expectedBible = 'docs/biblia/' + sourcePath + '/Bíblia.md';
    if (biblePath !== expectedBible) {
      problems.push('BÍBLIA da reserva diverge do caminho canônico: ' + sourcePath);
    }

    if (!exists(sourcePath)) {
      problems.push('Reserva aponta para fonte inexistente: ' + sourcePath);
    } else {
      const currentSha = gitBlobSha(fs.readFileSync(path.join(root, sourcePath), 'utf8'));
      if (!/^[0-9a-f]{40}$/i.test(reservedSha)) {
        problems.push('Reserva contém SHA inválido: ' + sourcePath + ' / ' + reservedSha);
      } else if (currentSha !== reservedSha) {
        problems.push('Fonte mudou desde a reserva: ' + sourcePath + ' / reservado=' + reservedSha + ' / atual=' + currentSha);
      }
    }

    if (reservationsByFile.has(sourcePath)) {
      problems.push('Mais de uma reserva ativa para o mesmo arquivo: ' + sourcePath);
    }
    reservationsByFile.set(sourcePath, { agent, reservationFile });

    const agentCount = (reservationCountByAgent.get(agent) || 0) + 1;
    reservationCountByAgent.set(agent, agentCount);
    if (agentCount > 1) {
      problems.push('Agente possui mais de uma reserva ativa: ' + agent);
    }

    if (completedFromStatus.has(sourcePath)) {
      problems.push('Arquivo CONCLUÍDO não pode permanecer reservado: ' + sourcePath);
    }

    const statusEntry = inProgressByFile.get(sourcePath);
    if (!statusEntry) {
      problems.push('Reserva ativa sem EM ANDAMENTO correspondente no STATUS.md: ' + sourcePath);
    } else if (statusEntry.agent !== agent) {
      problems.push('Reserva diverge do agente no STATUS.md: ' + sourcePath + ' / reserva=' + agent + ' / status=' + statusEntry.agent);
    }

    const checklistEntry = checklistCurrentByFile.get(sourcePath);
    if (!checklistEntry) {
      problems.push('Reserva ativa sem EM ANDAMENTO correspondente no CHECKLIST.md: ' + sourcePath);
    } else if (checklistEntry.agent !== agent) {
      problems.push('Reserva diverge do agente no CHECKLIST.md: ' + sourcePath + ' / reserva=' + agent + ' / checklist=' + checklistEntry.agent);
    }
  }

  for (const entry of inProgressEntries) {
    const reservation = reservationsByFile.get(entry.sourcePath);
    if (!reservation) {
      problems.push('Arquivo EM ANDAMENTO sem reserva ativa: ' + entry.sourcePath);
    } else if (reservation.agent !== entry.agent) {
      problems.push('Arquivo EM ANDAMENTO com ownership divergente da reserva: ' + entry.sourcePath);
    }
  }
  const materializedStates = new Set([
    ...completedFromStatus,
    ...reviewFromStatus,
  ]);

  for (const sourcePath of materializedStates) {
    const expectedBible = 'docs/biblia/' + sourcePath + '/Bíblia.md';
    if (!exists(expectedBible)) {
      problems.push('estado materializado sem Bíblia individual: ' + sourcePath);
    }
  }

  for (const sourcePath of completedFromStatus) {
    validateApprovedBible(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md');
  }
  for (const sourcePath of reviewFromStatus) {
    validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', false);
  }
  for (const sourcePath of inProgress) {
    validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', true);
  }

  const individualBibles = bibleFiles.filter(file => file.endsWith('/Bíblia.md'));
  for (const bibleFile of individualBibles) {
    const sourcePath = bibleFile
      .slice('docs/biblia/'.length, -'/Bíblia.md'.length);
    if (!materializedStates.has(sourcePath) && !inProgress.includes(sourcePath)) {
      problems.push(
        'Bíblia individual existe sem estado CONCLUÍDO/EM ANDAMENTO/REVISÃO no STATUS.md: '
        + sourcePath
      );
    }
  }
}

for (const forbidden of [
  'extension/content_manga.js',
  'extension/content_gemini.js',
  'extension/inject.js',
  'extension/cm-gtc-client.js',
  'extension/cm-dom-replace.js',
  'extension/cm-chapter.js',
  'extension/cm-auto-restore.js',
  'extension/gemini',
  'extension/gtc-fingerprint.js',
  'extension/gtc-indexeddb.js',
  'extension/storage-manager.js',
  'extension/shared-ui.js',
  'extension/popup.html',
  'extension/popup.js',
  'extension/options.html',
  'extension/options.js',
  'extension/reader.html',
  'extension/reader.js',
  'tests/package.json',
  'tests/package-lock.json',
  'tests/jest.config.js',
  'tests/jest.coverage.config.js',
  'tests/jest.background-diagnostic.config.js',
  'tests/playwright.config.js',
  'tests/test-results',
  'tests/coverage',
  'tests/.ci-results',
  'tests/ci',
  'tests/visual-v3',
  'tests/e2e/fixtures',
  'tests/run-all-tests.js',
  'tests/run-e2e.js',
  'scripts/sync-version.js',
  'projeto.md',
  'status.md',
  'docs/historico',
  'docs/ARQUITETURA_DO_REPOSITORIO.md',
  'docs/CHECKLIST_REESTRUTURACAO_PR65.md',
  'docs/PLANO_REESTRUTURACAO.md',
  'docs/MELHORIAS_EXTRACAO_E_PRAZO.md',
  'docs/QUARENTENA_DE_IMAGEM.md',
]) requireAbsent(forbidden);


// Contrato interno do bloco 0-G: paths de runtime precisam permanecer alinhados.
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const expectedContentScripts = [
  [
    'shared/gtc-fingerprint.js',
    'content/cm-gtc-client.js',
    'content/cm-dom-replace.js',
    'content/cm-chapter.js',
    'content/cm-auto-restore.js',
    'content/content_manga.js',
  ],
  ['content/inject.js'],
  [
    'content/gemini/selectors.js',
    'content/gemini/dom.js',
    'content/gemini/image-quarantine.js',
    'content/gemini/observer.js',
    'content/gemini/editor.js',
    'content/gemini/attachment.js',
    'content/gemini/temporary-chat.js',
    'content/gemini/result-extractor.js',
    'content/gemini/deletion.js',
    'content/gemini/job-runner.js',
    'content/content_gemini.js',
  ],
];
if (manifest.action?.default_popup !== 'popup/popup.html') {
  problems.push('manifest action.default_popup precisa apontar para popup/popup.html');
}
if (manifest.options_ui?.page !== 'options/options.html') {
  problems.push('manifest options_ui.page precisa apontar para options/options.html');
}
if (manifest.background?.service_worker !== 'background.js') {
  problems.push('manifest background.service_worker precisa permanecer em background.js');
}
const actualContentScripts = (manifest.content_scripts || []).map(entry => entry.js || []);
if (JSON.stringify(actualContentScripts) !== JSON.stringify(expectedContentScripts)) {
  problems.push('manifest content_scripts não corresponde ao layout canônico do bloco 0-G');
}

const backgroundSource = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');
for (const requiredMarker of [
  "importScripts('shared/gtc-fingerprint.js')",
  "importScripts('shared/gtc-indexeddb.js')",
  "importScripts('shared/storage-manager.js')",
  "require('./shared/gtc-indexeddb.js')",
  "require('./shared/storage-manager.js')",
]) {
  if (!backgroundSource.includes(requiredMarker)) {
    problems.push('background.js não contém referência canônica: ' + requiredMarker);
  }
}
for (const legacyMarker of [
  "importScripts('gtc-fingerprint.js')",
  "importScripts('gtc-indexeddb.js')",
  "importScripts('storage-manager.js')",
  "require('./gtc-indexeddb.js')",
  "require('./storage-manager.js')",
]) {
  if (backgroundSource.includes(legacyMarker)) {
    problems.push('background.js ainda contém referência plana antiga: ' + legacyMarker);
  }
}

const pageContracts = [
  ['extension/popup/popup.html', '../shared/shared-ui.js', 'popup.js'],
  ['extension/options/options.html', '../shared/shared-ui.js', 'options.js'],
  ['extension/reader/reader.html', '../shared/shared-ui.js', 'reader.js'],
];
for (const [page, sharedSrc, ownSrc] of pageContracts) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (!html.includes(`<script src="${sharedSrc}"></script>`)) {
    problems.push(page + ' precisa carregar ' + sharedSrc);
  }
  if (!html.includes(`<script src="${ownSrc}"></script>`)) {
    problems.push(page + ' precisa carregar ' + ownSrc);
  }
}
const popupSource = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');
if (!popupSource.includes('reader/reader.html?id=')) {
  problems.push('popup/popup.js precisa abrir reader/reader.html');
}

const extensionRootFiles = fs.readdirSync(path.join(root, 'extension'), { withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => entry.name)
  .sort();
if (JSON.stringify(extensionRootFiles) !== JSON.stringify(['background.js', 'manifest.json'])) {
  problems.push('a raiz de extension/ deve conter somente background.js e manifest.json: ' + extensionRootFiles.join(', '));
}

const tracked = walk(root, { ignore: new Set(['.git', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'dist', 'build', '.ci-results', 'blob-report', 'all-blob-reports']) });
const legacyReferenceMarkers = [
  'tests/ci/',
  'tests/package.json',
  'tests/package-lock.json',
  'tests/jest.config.js',
  'tests/jest.coverage.config.js',
  'tests/jest.background-diagnostic.config.js',
  'tests/playwright.config.js',
  'tests/visual-v3/',
  'tests/e2e/fixtures/',
  'scripts/sync-version.js',
  'extension/content_manga.js',
  'extension/content_gemini.js',
  'extension/inject.js',
  'extension/gemini/',
  'extension/gtc-fingerprint.js',
  'extension/gtc-indexeddb.js',
  'extension/storage-manager.js',
  'extension/shared-ui.js',
  'extension/popup.html',
  'extension/popup.js',
  'extension/options.html',
  'extension/options.js',
  'extension/reader.html',
  'extension/reader.js',
];

const legacyScanExcluded = new Set([
  'scripts/validation/verify-repository-structure.js',
  'scripts/validation/verify-ci-contract.js',
]);
const operationalTextFiles = tracked.filter((file) => {
  const relative = rel(file);
  if (legacyScanExcluded.has(relative)) return false;
  if (!/\.(?:js|json|ya?ml|html)$/i.test(relative)) return false;
  return (
    relative.startsWith('extension/') ||
    relative.startsWith('tests/') ||
    relative.startsWith('scripts/') ||
    relative.startsWith('.github/workflows/') ||
    relative === 'package.json'
  );
});
for (const file of operationalTextFiles) {
  const relative = rel(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of legacyReferenceMarkers) {
    if (source.includes(marker)) {
      problems.push('referência operacional legada em ' + relative + ': ' + marker);
    }
  }
}

const packageJsons = tracked.filter((file) => path.basename(file) === 'package.json').map(rel);
const lockfiles = tracked.filter((file) => path.basename(file) === 'package-lock.json').map(rel);
if (packageJsons.length !== 1 || packageJsons[0] !== 'package.json') {
  problems.push('deve existir exatamente um package.json canônico na raiz; encontrados: ' + packageJsons.join(', '));
}
if (lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json') {
  problems.push('deve existir exatamente um package-lock.json canônico na raiz; encontrados: ' + lockfiles.join(', '));
}

const wrappers = tracked.filter((file) => /\.(?:bat|ps1)$/i.test(file)).map(rel);
if (wrappers.length) problems.push('wrappers BAT/PS1 proibidos: ' + wrappers.join(', '));

const jestConfigs = tracked
  .filter((file) => /^jest.*config\.js$/i.test(path.basename(file)))
  .map(rel)
  .sort();
if (JSON.stringify(jestConfigs) !== JSON.stringify(['jest.config.js'])) {
  problems.push('Jest precisa ter exatamente uma config canônica: ' + jestConfigs.join(', '));
}

const playwrightConfigs = tracked
  .filter((file) => /^playwright.*config\.js$/i.test(path.basename(file)))
  .map(rel)
  .sort();
const allowedPlaywrightConfigs = ['playwright.config.js', 'scripts/ci/playwright-merge.config.js'].sort();
if (JSON.stringify(playwrightConfigs) !== JSON.stringify(allowedPlaywrightConfigs)) {
  problems.push('configs Playwright inesperadas: ' + playwrightConfigs.join(', '));
}
const mergeConfig = fs.readFileSync(path.join(root, 'scripts/ci/playwright-merge.config.js'), 'utf8');
for (const forbiddenKey of ['testDir', 'outputDir', 'workers', 'retries', 'projects', 'webServer', 'launchOptions']) {
  if (mergeConfig.includes(forbiddenKey)) {
    problems.push('playwright-merge.config.js deve conter apenas configuração de merge/reporter; chave proibida: ' + forbiddenKey);
  }
}

const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
for (const marker of [
  'working-directory: tests',
  'npm --prefix tests',
  'cd tests',
  'tests/ci/',
  'tests/package.json',
  'tests/package-lock.json',
  'tests/playwright.config.js',
  'tests/jest.coverage.config.js',
  'scripts/sync-version.js',
]) {
  if (workflow.includes(marker)) problems.push('ci.yml contém referência operacional legada: ' + marker);
}

const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');
for (const marker of ["outputDir: './tests/test-results'", "testDir: './e2e'"]) {
  if (playwrightConfig.includes(marker)) problems.push('playwright.config.js contém caminho legado: ' + marker);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  for (const marker of ['npm --prefix tests', 'cd tests', 'tests/package.json', 'tests/run-all-tests.js', 'tests/run-e2e.js']) {
    if (String(command).includes(marker)) {
      problems.push('script npm ' + name + ' contém legado: ' + marker);
    }
  }
}

const testJs = walk(path.join(root, 'tests'), { ignore: new Set(['node_modules']) })
  .filter((file) => file.endsWith('.js'));
for (const file of testJs) {
  const source = fs.readFileSync(file, 'utf8');
  if (/function\s+_?findRoot\s*\(/.test(source)) {
    problems.push('finder de raiz duplicado em ' + rel(file) + '; use tests/helpers/repo-root.js');
  }
  if (source.includes('process.cwd()')) {
    problems.push('dependência de process.cwd() em ' + rel(file) + '; derive paths de __dirname/repo-root');
  }
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
for (const entry of ['.jest-cache*/', '.ci-results/', 'all-blob-reports/', 'dist/']) {
  if (!gitignore.split(/\r?\n/).includes(entry)) {
    problems.push('.gitignore não contém entrada obrigatória: ' + entry);
  }
}

if (problems.length) {
  console.error('Estrutura do repositório inválida:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log(
  'Estrutura validada: npm/Jest/Playwright centralizados, tooling separado e caminhos legados ausentes.'
);
