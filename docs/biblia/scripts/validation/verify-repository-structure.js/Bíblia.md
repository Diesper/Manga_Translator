# Bíblia técnica — verify-repository-structure.js

> **Estado:** ✅ CONCLUÍDO — AUDITORIA DE QUALIDADE APROVADA  
> **SHA auditado:** `c4509784d71a0f52dc98e822159ffd6b45b0cd7d`  
> **Agente responsável pela auditoria:** AGENTE 12  
> **Tipo:** gate Node de integridade estrutural, coordenação documental e prevenção de regressão arquitetural  
> **Linhas textuais:** **731**  
> **Posições documentais:** **732**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/validation/verify-repository-structure.js` é um gate bloqueante que converte a topologia esperada do repositório em regras executáveis. Ele acumula violações em `problems` e só encerra com código 1 no fim, o que permite uma única execução apontar várias regressões de estrutura simultaneamente.

O arquivo cobre seis áreas principais: presença/ausência de caminhos canônicos; integridade das Bíblias técnicas; coerência de STATUS/CHECKLIST/AUDITORIA e reservas; wiring do Manifest V3 e páginas da extensão; centralização de Node/Jest/Playwright e remoção de caminhos legados; disciplina dos testes e entradas obrigatórias do `.gitignore`.

É consumido diretamente por `package.json#validate:structure`, pela cadeia `npm run validate` e pelo workflow `.github/workflows/ci.yml`. O `verify-ci-contract.js` também verifica estaticamente que a CI continua chamando este gate e que o scan de referências legadas permanece presente.

## 2. Entradas, saídas e lifecycle

### Entradas

- árvore real do repositório sob a raiz calculada a partir de `__dirname`;
- `extension/manifest.json`, `extension/background.js`, páginas e scripts de UI;
- `docs/biblia/STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, reservas e Bíblias individuais;
- configs raiz de Jest/Playwright, `package.json`, `.gitignore` e `.github/workflows/ci.yml`;
- arquivos operacionais em `extension/`, `tests/`, `scripts/` e workflows.

### Processamento

1. valida paths obrigatórios e proibidos;
2. valida forma do diretório `docs/`;
3. implementa SHA Git blob e extrator de fonte integral das Bíblias;
4. cruza conclusões, revisão, in-progress e reservas com os trackers globais;
5. verifica wiring do Manifest e scripts de páginas;
6. varre referências operacionais legadas;
7. exige package/lock/configs únicos e proíbe wrappers BAT/PS1;
8. verifica caminhos legados no workflow, Playwright e scripts npm;
9. proíbe root-finder duplicado e `process.cwd()` nos testes;
10. valida entradas essenciais do `.gitignore`;
11. falha com exit 1 se qualquer problema foi coletado.

### Saídas

- stderr com cabeçalho `Estrutura do repositório inválida:` e uma linha por problema;
- exit code 1 quando há violações;
- mensagem de sucesso e exit code 0 quando `problems` permanece vazio.

## 3. Helpers e contratos internos

- `exists(rel)`: testa existência relativa à raiz canônica;
- `walk(dir)`: percorre recursivamente arquivos e respeita nomes ignorados;
- `rel(file)`: normaliza paths para `/`, inclusive no Windows;
- `requirePresent/requireAbsent`: transformam presença/ausência em violações acumuladas;
- `gitBlobSha`: calcula o SHA-1 no formato real de blob Git (`blob <len>\0<bytes>`);
- `extractBibleIntegralSource`: localiza a seção "Fonte integral" e extrai o primeiro fence;
- `validateApprovedBible`: confere selo de aprovação, SHA, fonte integral, cobertura linha a linha, invariantes, lacunas e boilerplate proibido;
- `validateReviewBibleHeader`: confere que Bíblias em revisão/in-progress se autodeclaram assim no cabeçalho;
- `coordinationField`: interpreta campos Markdown simples das reservas.

## 4. Evidência automatizada examinada

| Comportamento | Evidência atual | Classificação |
|---|---|---|
| CI executa o gate estrutural | `.github/workflows/ci.yml` chama `node scripts/validation/verify-repository-structure.js` | 🟨 EXECUTADO INDIRETAMENTE |
| comando npm oficial existe | `package.json#validate:structure` aponta exatamente para este arquivo | 🟦 GATE ESTÁTICO ESPECÍFICO |
| CI não pode remover silenciosamente o gate | `verify-ci-contract.js` exige o comando literal | 🟦 GATE ESTÁTICO ESPECÍFICO |
| scan de referências legadas permanece no verificador | `verify-ci-contract.js` exige `legacyReferenceMarkers` e a mensagem correspondente | 🟦 GATE ESTÁTICO ESPECÍFICO |
| detecção de caminhos obrigatórios/proibidos | executada em toda passagem da CI, sem fixture negativa focal | 🟨 EXECUTADO INDIRETAMENTE |
| validação detalhada de Bíblias aprovadas | executada contra os documentos reais, sem self-test isolado | 🟨 EXECUTADO INDIRETAMENTE |
| parsing/coerência de reservas | executado contra reservas reais, sem matriz de formatos controlados | 🟨 EXECUTADO INDIRETAMENTE |
| tratamento de `.state/<índice>.json` | nenhuma referência a `.state/` existe no fonte | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| comportamento com arquivo no lugar de diretório obrigatório | `exists()` testa somente existência | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| cenários negativos do gate em sandbox | não foi localizado self-test focal deste script | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Achados críticos da auditoria

### 5.1 `.state/` é rejeitado pelo próprio gate — HIGH

As linhas 220–239 percorrem **todos** os arquivos de `docs/biblia`. O predicado de infraestrutura reconhece apenas `.reservas/` e `.coordination/`; `.state/` não aparece em nenhuma das 731 linhas textuais. Logo, qualquer `docs/biblia/.state/*.json` cai em `unexpectedBibleFiles` e gera `problems.push`.

Isso conflita diretamente com a arquitetura operacional atual, em que cada item do corpus precisa de `.state/<ÍNDICE>.json`. O próprio `docs/biblia/.state/089.json` desta auditoria é evidência de que o caminho existe no branch.

### 5.2 O estado canônico individual não é validado — HIGH

Além de rejeitar fisicamente `.state/`, o algoritmo de coordenação deriva completed/review/in-progress apenas de `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md` e reservas. Não há leitura ou cruzamento de `.state/<ÍNDICE>.json`, do campo `agent`, `source_sha`, `status` ou `audit_requests`.

No protocolo atual, STATUS/CHECKLIST são visões derivadas e não concedem ownership. Este gate ainda trata trackers globais como fonte operacional de coerência, portanto pode não detectar divergência entre estado individual e trackers — e ao mesmo tempo pode falhar durante janelas legítimas de atualização multiagente.

### 5.3 Ausência de self-test focal

A busca por referências ao arquivo encontrou consumers e `verify-ci-contract-selftest.js`, mas não uma suíte que execute este verificador em uma árvore temporária com casos positivos/negativos. A CI exerce o estado real do repositório, o que é útil como gate end-to-end, porém não prova individualmente branches como SHA divergente, Bíblia truncada, reserva duplicada, regex de trackers, config extra ou caminhos legados.

### 5.4 Formato de `ESTADO` da reserva é rígido

`coordinationField` devolve todo o texto depois de `ESTADO:`, e a linha 353 aceita somente igualdade exata com `ATIVA`. Uma reserva semanticamente ativa, mas escrita como `ATIVA — EM ANDAMENTO`, é rejeitada. Há atualmente reserva de outro agente no branch usando essa forma ampliada. O gate não normaliza nem documenta enumeração tolerada.

### 5.5 `requirePresent` não garante tipo de filesystem

`exists()` usa `fs.existsSync`. Assim, caminhos conceitualmente diretórios (`tests/unit`, `extension/background`, etc.) satisfazem a presença mesmo que sejam substituídos por um arquivo com o mesmo nome. Regras posteriores reduzem parte do risco, mas o helper em si não prova file-vs-directory.

## 6. Segurança, portabilidade e desempenho

O script não recebe input de rede nem do usuário final; sua superfície é o checkout da CI. A principal fronteira de confiança é o próprio conteúdo do repositório. Como usa `readFileSync`/`readdirSync`, bloqueio síncrono é aceitável em um gate curto e evita concorrência interna durante o snapshot.

`rel()` normaliza backslashes, o que é importante no Windows. `gitBlobSha` usa bytes UTF-8 e o prefixo Git correto, permitindo comparar SHA de conteúdo de forma portátil.

O `walk(root)` pode percorrer grande parte do checkout, mas exclui diretórios volumosos/gerados como `node_modules`, coverage, dist e resultados. Não segue symlinks como diretórios, pois só recursa em `entry.isDirectory()`.

## 7. Invariantes

1. Qualquer violação deve entrar em `problems` e resultar em exit 1 ao final.
2. Paths comparados entre plataformas devem usar `/`.
3. O Manifest deve manter popup, options, background e content scripts no layout canônico.
4. Só pode existir um `package.json` e um `package-lock.json` no corpus percorrido.
5. Jest deve ter somente `jest.config.js`; Playwright apenas a config principal e a config de merge.
6. Scripts e workflows não podem reintroduzir caminhos operacionais legados.
7. Bíblias marcadas como concluídas precisam declarar aprovação, SHA correto, fonte integral equivalente e cobertura sequencial de todas as posições.
8. Uma reserva precisa espelhar o path do fonte e da Bíblia e apontar para o SHA atual.
9. Um agente não deve possuir duas reservas ativas.
10. Arquivo concluído não deve conservar reserva ativa.
11. A arquitetura atual exige que `.state/` seja infraestrutura reconhecida e validada, embora o fonte auditado ainda não cumpra essa invariante.
12. O SHA desta Bíblia só permanece válido enquanto o fonte for `c4509784d71a0f52dc98e822159ffd6b45b0cd7d`.

## 8. Lacunas e solicitações ao auditor

- **089-001 — STRUCTURE_GATE_BUG — OPEN — HIGH:** `.state/*.json` é classificado como arquivo inesperado dentro de `docs/biblia/`.
- **089-002 — COORDINATION_CONTRACT_REVIEW — OPEN — HIGH:** o gate não lê nem valida o estado individual canônico e ainda deriva coordenação de trackers globais.
- **089-003 — TEST_REQUIRED — OPEN:** falta self-test focal com árvore temporária cobrindo branches positivos e negativos.
- **089-004 — PARSER_ROBUSTNESS_REVIEW — OPEN:** `ESTADO` de reserva aceita apenas a string exata `ATIVA`.
- **089-005 — FILESYSTEM_TYPE_REVIEW — OPEN:** paths obrigatórios são validados apenas por existência, sem tipo esperado.

Essas solicitações não alteram o código auditado e não impedem concluir a documentação do comportamento **real** deste SHA.

## 9. Fonte integral auditada

```javascript
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
```

## 10. Cobertura linha a linha

### Linha 1

**Fonte:** `'use strict';`

**Função:** Ativa strict mode no módulo CommonJS para tornar erros de JavaScript mais explícitos durante a execução do gate estrutural.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 2

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `'use strict';` do bloco que começa em `const fs = require('fs');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 3

**Fonte:** `const fs = require('fs');`

**Função:** Carrega a dependência Node usada pelo verificador e associa o resultado a `fs`; o módulo requerido é `'fs'`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 4

**Fonte:** `const path = require('path');`

**Função:** Carrega a dependência Node usada pelo verificador e associa o resultado a `path`; o módulo requerido é `'path'`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 5

**Fonte:** `const crypto = require('crypto');`

**Função:** Carrega a dependência Node usada pelo verificador e associa o resultado a `crypto`; o módulo requerido é `'crypto'`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 6

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const crypto = require('crypto');` do bloco que começa em `const root = path.resolve(__dirname, '../..');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 7

**Fonte:** `const root = path.resolve(__dirname, '../..');`

**Função:** Define `root` com a expressão `path.resolve(__dirname, '../..')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 8

**Fonte:** `const problems = [];`

**Função:** Define `problems` com a expressão `[]`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 9

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const problems = [];` do bloco que começa em `function exists(rel) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 10

**Fonte:** `function exists(rel) {`

**Função:** Inicia o helper `exists` com parâmetros `rel`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 11

**Fonte:** `  return fs.existsSync(path.join(root, rel));`

**Função:** Retorna `fs.existsSync(path.join(root, rel))` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 12

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function walk(dir, { ignore = new Set() } = {}) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 13

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function walk(dir, { ignore = new Set() } = {}) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 14

**Fonte:** `function walk(dir, { ignore = new Set() } = {}) {`

**Função:** Inicia o helper `walk` com parâmetros `dir, { ignore = new Set() } = {}`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 15

**Fonte:** `  if (!fs.existsSync(dir)) return [];`

**Função:** Participa do contrato estrutural com a instrução `if (!fs.existsSync(dir)) return [];`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 16

**Fonte:** `  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {`

**Função:** Abre callback para a expressão `return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {`; o corpo decide como cada item será filtrado, mapeado ou validado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 17

**Fonte:** `    if (ignore.has(entry.name)) return [];`

**Função:** Participa do contrato estrutural com a instrução `if (ignore.has(entry.name)) return [];`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 18

**Fonte:** `    const full = path.join(dir, entry.name);`

**Função:** Define `full` com a expressão `path.join(dir, entry.name)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 19

**Fonte:** `    if (entry.isDirectory()) return walk(full, { ignore });`

**Função:** Participa do contrato estrutural com a instrução `if (entry.isDirectory()) return walk(full, { ignore });`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 20

**Fonte:** `    return entry.isFile() ? [full] : [];`

**Função:** Retorna `entry.isFile() ? [full] : []` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 21

**Fonte:** `  });`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 22

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function rel(file) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 23

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function rel(file) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 24

**Fonte:** `function rel(file) {`

**Função:** Inicia o helper `rel` com parâmetros `file`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 25

**Fonte:** `  return path.relative(root, file).replace(/\\/g, '/');`

**Função:** Retorna `path.relative(root, file).replace(/\\/g, '/')` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 26

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function requirePresent(relPath) {`.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 27

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function requirePresent(relPath) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 28

**Fonte:** `function requirePresent(relPath) {`

**Função:** Inicia o helper `requirePresent` com parâmetros `relPath`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 29

**Fonte:** `  if (!exists(relPath)) problems.push('arquivo/diretório obrigatório ausente: ' + relPath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `arquivo/diretório obrigatório ausente: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 30

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function requireAbsent(relPath) {`.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 31

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function requireAbsent(relPath) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — `verify-ci-contract.js` exige que a CI invoque este arquivo e que o verificador mantenha o scan de referências legadas; não há cenário unitário isolando esta linha.

### Linha 32

**Fonte:** `function requireAbsent(relPath) {`

**Função:** Inicia o helper `requireAbsent` com parâmetros `relPath`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 33

**Fonte:** `  if (exists(relPath)) problems.push('legado proibido ainda existe: ' + relPath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `legado proibido ainda existe: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 34

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const required of [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 35

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `for (const required of [`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 36

**Fonte:** `for (const required of [`

**Função:** Participa do contrato estrutural com a instrução `for (const required of [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 37

**Fonte:** `  'package.json',`

**Função:** Inclui `package.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 38

**Fonte:** `  'package-lock.json',`

**Função:** Inclui `package-lock.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 39

**Fonte:** `  'jest.config.js',`

**Função:** Inclui `jest.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 40

**Fonte:** `  'playwright.config.js',`

**Função:** Inclui `playwright.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 41

**Fonte:** `  'extension/manifest.json',`

**Função:** Inclui `extension/manifest.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 42

**Fonte:** `  'extension/background.js',`

**Função:** Inclui `extension/background.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 43

**Fonte:** `  'extension/background',`

**Função:** Inclui `extension/background` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 44

**Fonte:** `  'extension/content/content_manga.js',`

**Função:** Inclui `extension/content/content_manga.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 45

**Fonte:** `  'extension/content/content_gemini.js',`

**Função:** Inclui `extension/content/content_gemini.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 46

**Fonte:** `  'extension/content/inject.js',`

**Função:** Inclui `extension/content/inject.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 47

**Fonte:** `  'extension/content/gemini/job-runner.js',`

**Função:** Inclui `extension/content/gemini/job-runner.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 48

**Fonte:** `  'extension/shared/gtc-fingerprint.js',`

**Função:** Inclui `extension/shared/gtc-fingerprint.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 49

**Fonte:** `  'extension/shared/gtc-indexeddb.js',`

**Função:** Inclui `extension/shared/gtc-indexeddb.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 50

**Fonte:** `  'extension/shared/storage-manager.js',`

**Função:** Inclui `extension/shared/storage-manager.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 51

**Fonte:** `  'extension/shared/shared-ui.js',`

**Função:** Inclui `extension/shared/shared-ui.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 52

**Fonte:** `  'extension/popup/popup.html',`

**Função:** Inclui `extension/popup/popup.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 53

**Fonte:** `  'extension/popup/popup.js',`

**Função:** Inclui `extension/popup/popup.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 54

**Fonte:** `  'extension/options/options.html',`

**Função:** Inclui `extension/options/options.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 55

**Fonte:** `  'extension/options/options.js',`

**Função:** Inclui `extension/options/options.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 56

**Fonte:** `  'extension/reader/reader.html',`

**Função:** Inclui `extension/reader/reader.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 57

**Fonte:** `  'extension/reader/reader.js',`

**Função:** Inclui `extension/reader/reader.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 58

**Fonte:** `  'tests/unit',`

**Função:** Inclui `tests/unit` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 59

**Fonte:** `  'tests/integration',`

**Função:** Inclui `tests/integration` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 60

**Fonte:** `  'tests/smoke',`

**Função:** Inclui `tests/smoke` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 61

**Fonte:** `  'tests/visual',`

**Função:** Inclui `tests/visual` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 62

**Fonte:** `  'tests/e2e',`

**Função:** Inclui `tests/e2e` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 63

**Fonte:** `  'tests/fixtures',`

**Função:** Inclui `tests/fixtures` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 64

**Fonte:** `  'tests/helpers',`

**Função:** Inclui `tests/helpers` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 65

**Fonte:** `  'tests/mocks',`

**Função:** Inclui `tests/mocks` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 66

**Fonte:** `  'tests/setup',`

**Função:** Inclui `tests/setup` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 67

**Fonte:** `  'scripts/ci/data/test-baseline.json',`

**Função:** Inclui `scripts/ci/data/test-baseline.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 68

**Fonte:** `  'scripts/ci/data/e2e-shard-plan.json',`

**Função:** Inclui `scripts/ci/data/e2e-shard-plan.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 69

**Fonte:** `  'scripts/ci/data/regression-matrix.json',`

**Função:** Inclui `scripts/ci/data/regression-matrix.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 70

**Fonte:** `  'scripts/validation/verify-ci-contract.js',`

**Função:** Inclui `scripts/validation/verify-ci-contract.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 71

**Fonte:** `  'scripts/release/sync-version.js',`

**Função:** Inclui `scripts/release/sync-version.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 72

**Fonte:** `  'docs/Documentação.md',`

**Função:** Inclui `docs/Documentação.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 73

**Fonte:** `  'docs/biblia/STATUS.md',`

**Função:** Inclui `docs/biblia/STATUS.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 74

**Fonte:** `  'docs/biblia/CHECKLIST.md',`

**Função:** Inclui `docs/biblia/CHECKLIST.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 75

**Fonte:** `  'docs/biblia/AUDITORIA.md',`

**Função:** Inclui `docs/biblia/AUDITORIA.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 76

**Fonte:** `]) requirePresent(required);`

**Função:** Participa do contrato estrutural com a instrução `]) requirePresent(required);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 77

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `]) requirePresent(required);` do bloco que começa em `const docsRootEntries = fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 78

**Fonte:** `const docsRootEntries = fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })`

**Função:** Enumera entradas do filesystem com `const docsRootEntries = fs.readdirSync(path.join(root, 'docs'), { withFileTypes: true })` para comparar a topologia real com o contrato canônico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 79

**Fonte:** `  .map(entry => entry.name)`

**Função:** Continua a cadeia de transformação com `.map(entry => entry.name)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 80

**Fonte:** `  .sort();`

**Função:** Continua a cadeia de transformação com `.sort();`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 81

**Fonte:** `const expectedDocsRootEntries = ['Documentação.md', 'biblia'].sort();`

**Função:** Define `expectedDocsRootEntries` com a expressão `['Documentação.md', 'biblia'].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 82

**Fonte:** `if (JSON.stringify(docsRootEntries) !== JSON.stringify(expectedDocsRootEntries)) {`

**Função:** Abre a condição `JSON.stringify(docsRootEntries) !== JSON.stringify(expectedDocsRootEntries)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 83

**Fonte:** `  problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 84

**Fonte:** `    'docs/ deve conter somente Documentação.md e o diretório biblia/; encontrados: '`

**Função:** Inclui `docs/ deve conter somente Documentação.md e o diretório biblia/; encontrados: ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 85

**Fonte:** `    + docsRootEntries.join(', ')`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ docsRootEntries.join(', ')`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 86

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 87

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `requireAbsent('docs/Bíblia.md');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 88

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `requireAbsent('docs/Bíblia.md');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 89

**Fonte:** `requireAbsent('docs/Bíblia.md');`

**Função:** Participa do contrato estrutural com a instrução `requireAbsent('docs/Bíblia.md');`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 90

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `requireAbsent('docs/Bíblia.md');` do bloco que começa em `function gitBlobSha(source) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 91

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `requireAbsent('docs/Bíblia.md');` do bloco que começa em `function gitBlobSha(source) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 92

**Fonte:** `function gitBlobSha(source) {`

**Função:** Inicia o helper `gitBlobSha` com parâmetros `source`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 93

**Fonte:** `  const buffer = Buffer.from(source, 'utf8');`

**Função:** Define `buffer` com a expressão `Buffer.from(source, 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 94

**Fonte:** `  return crypto.createHash('sha1')`

**Função:** Participa do contrato estrutural com a instrução `return crypto.createHash('sha1')`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 95

**Fonte:** `    .update('blob ' + buffer.length + '\0')`

**Função:** Continua a cadeia de transformação com `.update('blob ' + buffer.length + '\0')`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 96

**Fonte:** `    .update(buffer)`

**Função:** Continua a cadeia de transformação com `.update(buffer)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 97

**Fonte:** `    .digest('hex');`

**Função:** Continua a cadeia de transformação com `.digest('hex');`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 98

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function extractBibleIntegralSource(bible) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 99

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function extractBibleIntegralSource(bible) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 100

**Fonte:** `function extractBibleIntegralSource(bible) {`

**Função:** Inicia o helper `extractBibleIntegralSource` com parâmetros `bible`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 101

**Fonte:** `  const normalized = bible.replace(/\r\n/g, '\n');`

**Função:** Define `normalized` com a expressão `bible.replace(/\r\n/g, '\n')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 102

**Fonte:** `  const section = /^##+\s+(?:\d+\.\s+)?Fonte integral(?: auditada)?\s*$/im.exec(normalized);`

**Função:** Define `section` com a expressão `/^##+\s+(?:\d+\.\s+)?Fonte integral(?: auditada)?\s*$/im.exec(normalized)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 103

**Fonte:** `  if (!section) return null;`

**Função:** Participa do contrato estrutural com a instrução `if (!section) return null;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 104

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `if (!section) return null;` do bloco que começa em `const rest = normalized.slice(section.index + section[0].length);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 105

**Fonte:** `  const rest = normalized.slice(section.index + section[0].length);`

**Função:** Define `rest` com a expressão `normalized.slice(section.index + section[0].length)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 106

**Fonte:** `  const fence = /\n\`\`\`[A-Za-z0-9_-]*\n/.exec(rest);`

**Função:** Define `fence` com a expressão `/\n\`\`\`[A-Za-z0-9_-]*\n/.exec(rest)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 107

**Fonte:** `  if (!fence) return null;`

**Função:** Participa do contrato estrutural com a instrução `if (!fence) return null;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 108

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `if (!fence) return null;` do bloco que começa em `const contentStart = fence.index + fence[0].length;`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 109

**Fonte:** `  const contentStart = fence.index + fence[0].length;`

**Função:** Define `contentStart` com a expressão `fence.index + fence[0].length`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 110

**Fonte:** `  const after = rest.slice(contentStart);`

**Função:** Define `after` com a expressão `rest.slice(contentStart)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 111

**Fonte:** `  const contentEnd = after.indexOf('\n\`\`\`');`

**Função:** Define `contentEnd` com a expressão `after.indexOf('\n\`\`\`')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 112

**Fonte:** `  if (contentEnd < 0) return null;`

**Função:** Participa do contrato estrutural com a instrução `if (contentEnd < 0) return null;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 113

**Fonte:** `  return after.slice(0, contentEnd);`

**Função:** Retorna `after.slice(0, contentEnd)` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 114

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function validateApprovedBible(sourcePath, biblePath) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 115

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function validateApprovedBible(sourcePath, biblePath) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 116

**Fonte:** `function validateApprovedBible(sourcePath, biblePath) {`

**Função:** Inicia o helper `validateApprovedBible` com parâmetros `sourcePath, biblePath`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 117

**Fonte:** `  if (!exists(sourcePath)) {`

**Função:** Abre a condição `!exists(sourcePath)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 118

**Fonte:** `    problems.push('Bíblia aprovada aponta para fonte ausente: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia aprovada aponta para fonte ausente: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 119

**Fonte:** `    return;`

**Função:** Participa do contrato estrutural com a instrução `return;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 120

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const source = fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 121

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const source = fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 122

**Fonte:** `  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n');`

**Função:** Define `source` com a expressão `fs.readFileSync(path.join(root, sourcePath), 'utf8').replace(/\r\n/g, '\n')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 123

**Fonte:** `  const bible = fs.readFileSync(path.join(root, biblePath), 'utf8').replace(/\r\n/g, '\n');`

**Função:** Define `bible` com a expressão `fs.readFileSync(path.join(root, biblePath), 'utf8').replace(/\r\n/g, '\n')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 124

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const bible = fs.readFileSync(path.join(root, biblePath), 'utf8').replace(/\r\n/g, '\n');` do bloco que começa em `if (!/> \*\*Estado:\*\*[^\n]*CONCLUÍDO[^\n]*AUDITORIA DE QUALIDADE APROVADA/i.test(bible)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 125

**Fonte:** `  if (!/> \*\*Estado:\*\*[^\n]*CONCLUÍDO[^\n]*AUDITORIA DE QUALIDADE APROVADA/i.test(bible)) {`

**Função:** Abre a condição `!/> \*\*Estado:\*\*[^\n]*CONCLUÍDO[^\n]*AUDITORIA DE QUALIDADE APROVADA/i.test(bible)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 126

**Fonte:** `    problems.push('Bíblia CONCLUÍDA sem selo interno de auditoria aprovada: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia CONCLUÍDA sem selo interno de auditoria aprovada: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 127

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (/REVISÃO DE QUALIDADE/i.test(bible.split('\n').slice(0, 12).join('\n'))) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 128

**Fonte:** `  if (/REVISÃO DE QUALIDADE/i.test(bible.split('\n').slice(0, 12).join('\n'))) {`

**Função:** Abre a condição `/REVISÃO DE QUALIDADE/i.test(bible.split('\n').slice(0, 12).join('\n'))`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 129

**Fonte:** `    problems.push('Bíblia CONCLUÍDA ainda se declara em revisão: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia CONCLUÍDA ainda se declara em revisão: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 130

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const declaredSha = /\*\*SHA(?: do conteúdo)? auditado:\*\*\s*\`([0-9a-f]{40})\`/i.exec(bible);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 131

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const declaredSha = /\*\*SHA(?: do conteúdo)? auditado:\*\*\s*\`([0-9a-f]{40})\`/i.exec(bible);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 132

**Fonte:** `  const declaredSha = /\*\*SHA(?: do conteúdo)? auditado:\*\*\s*\`([0-9a-f]{40})\`/i.exec(bible);`

**Função:** Define `declaredSha` com a expressão `/\*\*SHA(?: do conteúdo)? auditado:\*\*\s*\`([0-9a-f]{40})\`/i.exec(bible)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 133

**Fonte:** `  const actualSha = gitBlobSha(source);`

**Função:** Define `actualSha` com a expressão `gitBlobSha(source)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 134

**Fonte:** `  if (!declaredSha || declaredSha[1] !== actualSha) {`

**Função:** Abre a condição `!declaredSha || declaredSha[1] !== actualSha`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 135

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 136

**Fonte:** `      'SHA auditado divergente em ' + sourcePath`

**Função:** Inclui `SHA auditado divergente em ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 137

**Fonte:** `      + ': declarado=' + (declaredSha ? declaredSha[1] : 'ausente')`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ ': declarado=' + (declaredSha ? declaredSha[1] : 'ausente')`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 138

**Fonte:** `      + ', atual=' + actualSha`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ ', atual=' + actualSha`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 139

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 140

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const embedded = extractBibleIntegralSource(bible);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 141

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const embedded = extractBibleIntegralSource(bible);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 142

**Fonte:** `  const embedded = extractBibleIntegralSource(bible);`

**Função:** Define `embedded` com a expressão `extractBibleIntegralSource(bible)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 143

**Fonte:** `  const sourceWithoutTerminalNewline = source.endsWith('\n') ? source.slice(0, -1) : source;`

**Função:** Define `sourceWithoutTerminalNewline` com a expressão `source.endsWith('\n') ? source.slice(0, -1) : source`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 144

**Fonte:** `  const embeddedMatches = embedded !== null && (`

**Função:** Participa do contrato estrutural com a instrução `const embeddedMatches = embedded !== null && (`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 145

**Fonte:** `    embedded === sourceWithoutTerminalNewline ||`

**Função:** Participa do contrato estrutural com a instrução `embedded === sourceWithoutTerminalNewline ||`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 146

**Fonte:** `    embedded === sourceWithoutTerminalNewline + '\n'`

**Função:** Participa do contrato estrutural com a instrução `embedded === sourceWithoutTerminalNewline + '\n'`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 147

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (!embeddedMatches) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 148

**Fonte:** `  if (!embeddedMatches) {`

**Função:** Abre a condição `!embeddedMatches`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 149

**Fonte:** `    problems.push('Fonte integral da Bíblia diverge da fonte auditada: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Fonte integral da Bíblia diverge da fonte auditada: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 150

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const headings = [...bible.matchAll(/^#{2,4}\s+Linha\s+0*(\d+)/gm)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 151

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const headings = [...bible.matchAll(/^#{2,4}\s+Linha\s+0*(\d+)/gm)]`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 152

**Fonte:** `  const headings = [...bible.matchAll(/^#{2,4}\s+Linha\s+0*(\d+)/gm)]`

**Função:** Extrai todas as ocorrências compatíveis com a expressão regular em `const headings = [...bible.matchAll(/^#{2,4}\s+Linha\s+0*(\d+)/gm)]`, convertendo Markdown em conjuntos de estado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 153

**Fonte:** `    .map(match => Number(match[1]));`

**Função:** Continua a cadeia de transformação com `.map(match => Number(match[1]));`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 154

**Fonte:** `  const sourcePositions = source.split('\n').length;`

**Função:** Define `sourcePositions` com a expressão `source.split('\n').length`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 155

**Fonte:** `  const sequential = headings.every((value, index) => value === index + 1);`

**Função:** Define `sequential` com a expressão `headings.every((value, index) => value === index + 1)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 156

**Fonte:** `  if (headings.length !== sourcePositions || !sequential) {`

**Função:** Abre a condição `headings.length !== sourcePositions || !sequential`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 157

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 158

**Fonte:** `      'Cobertura linha a linha incompleta em ' + sourcePath`

**Função:** Inclui `Cobertura linha a linha incompleta em ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 159

**Fonte:** `      + ': posições documentadas=' + headings.length`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ ': posições documentadas=' + headings.length`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 160

**Fonte:** `      + ', posições fonte=' + sourcePositions`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ ', posições fonte=' + sourcePositions`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 161

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 162

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (!/Invariantes/i.test(bible)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 163

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (!/Invariantes/i.test(bible)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 164

**Fonte:** `  if (!/Invariantes/i.test(bible)) {`

**Função:** Abre a condição `!/Invariantes/i.test(bible)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 165

**Fonte:** `    problems.push('Bíblia aprovada sem seção de invariantes: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia aprovada sem seção de invariantes: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 166

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (!/Lacunas|SEM TESTE PROBATÓRIO/i.test(bible)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 167

**Fonte:** `  if (!/Lacunas|SEM TESTE PROBATÓRIO/i.test(bible)) {`

**Função:** Abre a condição `!/Lacunas|SEM TESTE PROBATÓRIO/i.test(bible)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 168

**Fonte:** `    problems.push('Bíblia aprovada sem seção/avisos de lacunas de teste: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia aprovada sem seção/avisos de lacunas de teste: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 169

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const proseOnly = bible.replace(/\`\`\`[\s\S]*?\`\`\`/g, '');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 170

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const proseOnly = bible.replace(/\`\`\`[\s\S]*?\`\`\`/g, '');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 171

**Fonte:** `  const proseOnly = bible.replace(/\`\`\`[\s\S]*?\`\`\`/g, '');`

**Função:** Define `proseOnly` com a expressão `bible.replace(/\`\`\`[\s\S]*?\`\`\`/g, '')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 172

**Fonte:** `  const forbiddenBoilerplate = [`

**Função:** Participa do contrato estrutural com a instrução `const forbiddenBoilerplate = [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 173

**Fonte:** `    /executa a instrução concreta/i,`

**Função:** Participa do contrato estrutural com a instrução `/executa a instrução concreta/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 174

**Fonte:** `    /executa a instrução específica(?: de)?/i,`

**Função:** Participa do contrato estrutural com a instrução `/executa a instrução específica(?: de)?/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 175

**Fonte:** `    /usa os dados já validados pelas linhas/i,`

**Função:** Participa do contrato estrutural com a instrução `/usa os dados já validados pelas linhas/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 176

**Fonte:** `    /usa valores produzidos nas linhas vizinhas/i,`

**Função:** Participa do contrato estrutural com a instrução `/usa valores produzidos nas linhas vizinhas/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 177

**Fonte:** `    /usa identidades e valores estabelecidos pelas linhas anteriores/i,`

**Função:** Participa do contrato estrutural com a instrução `/usa identidades e valores estabelecidos pelas linhas anteriores/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 178

**Fonte:** `    /dentro do protocolo de (?:claim|commit)/i,`

**Função:** Participa do contrato estrutural com a instrução `/dentro do protocolo de (?:claim|commit)/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 179

**Fonte:** `    /coberta direta ou estruturalmente pelos cenários/i,`

**Função:** Participa do contrato estrutural com a instrução `/coberta direta ou estruturalmente pelos cenários/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 180

**Fonte:** `    /quando coberta pelos cenários diretos acima/i,`

**Função:** Participa do contrato estrutural com a instrução `/quando coberta pelos cenários diretos acima/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 181

**Fonte:** `    /a ordem desta seção é parte do contrato/i,`

**Função:** Participa do contrato estrutural com a instrução `/a ordem desta seção é parte do contrato/i,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 182

**Fonte:** `  ];`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const badPattern = forbiddenBoilerplate.find(pattern => pattern.test(proseOnly));`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 183

**Fonte:** `  const badPattern = forbiddenBoilerplate.find(pattern => pattern.test(proseOnly));`

**Função:** Define `badPattern` com a expressão `forbiddenBoilerplate.find(pattern => pattern.test(proseOnly))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 184

**Fonte:** `  if (badPattern) {`

**Função:** Abre a condição `badPattern`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 185

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 186

**Fonte:** `      'Bíblia aprovada contém boilerplate genérico proibido '`

**Função:** Inclui `Bíblia aprovada contém boilerplate genérico proibido ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 187

**Fonte:** `      + String(badPattern) + ': ' + sourcePath`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ String(badPattern) + ': ' + sourcePath`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 188

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 189

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 190

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `function validateReviewBibleHeader(sourcePath, biblePath, active) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 191

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `function validateReviewBibleHeader(sourcePath, biblePath, active) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 192

**Fonte:** `function validateReviewBibleHeader(sourcePath, biblePath, active) {`

**Função:** Inicia o helper `validateReviewBibleHeader` com parâmetros `sourcePath, biblePath, active`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 193

**Fonte:** `  if (!exists(biblePath)) return;`

**Função:** Participa do contrato estrutural com a instrução `if (!exists(biblePath)) return;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 194

**Fonte:** `  const head = fs.readFileSync(path.join(root, biblePath), 'utf8')`

**Função:** Lê arquivo do repositório de forma síncrona por meio de `const head = fs.readFileSync(path.join(root, biblePath), 'utf8')`; o gate usa snapshot consistente durante uma execução curta de CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 195

**Fonte:** `    .replace(/\r\n/g, '\n')`

**Função:** Continua a cadeia de transformação com `.replace(/\r\n/g, '\n')`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 196

**Fonte:** `    .split('\n')`

**Função:** Continua a cadeia de transformação com `.split('\n')`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 197

**Fonte:** `    .slice(0, 14)`

**Função:** Continua a cadeia de transformação com `.slice(0, 14)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 198

**Fonte:** `    .join('\n');`

**Função:** Continua a cadeia de transformação com `.join('\n');`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 199

**Fonte:** `  if (!/REVISÃO DE QUALIDADE/i.test(head)) {`

**Função:** Abre a condição `!/REVISÃO DE QUALIDADE/i.test(head)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 200

**Fonte:** `    problems.push('Bíblia em revisão sem aviso interno de REVISÃO DE QUALIDADE: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia em revisão sem aviso interno de REVISÃO DE QUALIDADE: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 201

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (active && !/EM ANDAMENTO/i.test(head)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 202

**Fonte:** `  if (active && !/EM ANDAMENTO/i.test(head)) {`

**Função:** Abre a condição `active && !/EM ANDAMENTO/i.test(head)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 203

**Fonte:** `    problems.push('Bíblia do arquivo EM ANDAMENTO não declara revisão ativa: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Bíblia do arquivo EM ANDAMENTO não declara revisão ativa: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 204

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 205

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const bibleRoot = path.join(root, 'docs', 'biblia');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 206

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const bibleRoot = path.join(root, 'docs', 'biblia');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 207

**Fonte:** `const bibleRoot = path.join(root, 'docs', 'biblia');`

**Função:** Define `bibleRoot` com a expressão `path.join(root, 'docs', 'biblia')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 208

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const bibleRoot = path.join(root, 'docs', 'biblia');` do bloco que começa em `function coordinationField(source, field) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 209

**Fonte:** `function coordinationField(source, field) {`

**Função:** Inicia o helper `coordinationField` com parâmetros `source, field`; este bloco encapsula uma regra reutilizada do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 210

**Fonte:** `  for (const rawLine of source.split(/\r?\n/)) {`

**Função:** Inicia iteração sobre `const rawLine of source.split(/\r?\n/)` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 211

**Fonte:** `    const line = rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '');`

**Função:** Define `line` com a expressão `rawLine.trim().replace(/^[-*]\s*/, '').replace(/\*\*/g, '')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 212

**Fonte:** `    const prefix = field + ':';`

**Função:** Define `prefix` com a expressão `field + ':'`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 213

**Fonte:** `    if (line.startsWith(prefix)) {`

**Função:** Abre a condição `line.startsWith(prefix)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 214

**Fonte:** `      return line.slice(prefix.length).trim().replace(/^"|"$/g, '');`

**Função:** Retorna `line.slice(prefix.length).trim().replace(/^"|"$/g, '')` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 215

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 216

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `return null;`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 217

**Fonte:** `  return null;`

**Função:** Retorna `null` ao chamador, encerrando este caminho do helper.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 218

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (fs.existsSync(bibleRoot)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 219

**Fonte:** `if (fs.existsSync(bibleRoot)) {`

**Função:** Abre a condição `fs.existsSync(bibleRoot)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 220

**Fonte:** `  const bibleFiles = walk(bibleRoot).map(rel).sort();`

**Função:** Define `bibleFiles` com a expressão `walk(bibleRoot).map(rel).sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 221

**Fonte:** `  const allowedControlFiles = new Set([`

**Função:** Participa do contrato estrutural com a instrução `const allowedControlFiles = new Set([`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 222

**Fonte:** `    'docs/biblia/STATUS.md',`

**Função:** Inclui `docs/biblia/STATUS.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 223

**Fonte:** `    'docs/biblia/CHECKLIST.md',`

**Função:** Inclui `docs/biblia/CHECKLIST.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 224

**Fonte:** `    'docs/biblia/AUDITORIA.md',`

**Função:** Inclui `docs/biblia/AUDITORIA.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 225

**Fonte:** `  ]);`

**Função:** Participa do contrato estrutural com a instrução `]);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 226

**Fonte:** `  const isCoordinationInfrastructure = file =>`

**Função:** Define uma função seta curta em `const isCoordinationInfrastructure = file =>`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 227

**Fonte:** `    file.startsWith('docs/biblia/.reservas/')`

**Função:** Participa do contrato estrutural com a instrução `file.startsWith('docs/biblia/.reservas/')`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 228

**Fonte:** `    || file.startsWith('docs/biblia/.coordination/');`

**Função:** Continua a condição lógica anterior com `|| file.startsWith('docs/biblia/.coordination/');`, compondo o predicado completo sem duplicar blocos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 229

**Fonte:** `  const unexpectedBibleFiles = bibleFiles.filter(file =>`

**Função:** Define uma função seta curta em `const unexpectedBibleFiles = bibleFiles.filter(file =>`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 230

**Fonte:** `    !allowedControlFiles.has(file)`

**Função:** Continua o predicado de filtragem com `!allowedControlFiles.has(file)`, excluindo ou exigindo esta condição específica.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 231

**Fonte:** `    && !isCoordinationInfrastructure(file)`

**Função:** Continua a condição lógica anterior com `&& !isCoordinationInfrastructure(file)`, compondo o predicado completo sem duplicar blocos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 232

**Fonte:** `    && !file.endsWith('/Bíblia.md')`

**Função:** Continua a condição lógica anterior com `&& !file.endsWith('/Bíblia.md')`, compondo o predicado completo sem duplicar blocos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 233

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (unexpectedBibleFiles.length) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 234

**Fonte:** `  if (unexpectedBibleFiles.length) {`

**Função:** Abre a condição `unexpectedBibleFiles.length`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 235

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 236

**Fonte:** `      'docs/biblia/ só pode conter STATUS.md, CHECKLIST.md, AUDITORIA.md e Bíblias individuais; inesperados: '`

**Função:** Inclui `docs/biblia/ só pode conter STATUS.md, CHECKLIST.md, AUDITORIA.md e Bíblias individuais; inesperados: ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 237

**Fonte:** `      + unexpectedBibleFiles.join(', ')`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ unexpectedBibleFiles.join(', ')`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 238

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 239

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const statusSource = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 240

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const statusSource = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 241

**Fonte:** `  const statusSource = fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8');`

**Função:** Define `statusSource` com a expressão `fs.readFileSync(path.join(bibleRoot, 'STATUS.md'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 242

**Fonte:** `  const checklistSource = fs.readFileSync(path.join(bibleRoot, 'CHECKLIST.md'), 'utf8');`

**Função:** Define `checklistSource` com a expressão `fs.readFileSync(path.join(bibleRoot, 'CHECKLIST.md'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 243

**Fonte:** `  const auditSource = fs.readFileSync(path.join(bibleRoot, 'AUDITORIA.md'), 'utf8');`

**Função:** Define `auditSource` com a expressão `fs.readFileSync(path.join(bibleRoot, 'AUDITORIA.md'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 244

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const auditSource = fs.readFileSync(path.join(bibleRoot, 'AUDITORIA.md'), 'utf8');` do bloco que começa em `const completedFromStatus = new Set(`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 245

**Fonte:** `  const completedFromStatus = new Set(`

**Função:** Participa do contrato estrutural com a instrução `const completedFromStatus = new Set(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 246

**Fonte:** `    [...statusSource.matchAll(/\|\s*\d+\s*\|\s*✅ CONCLUÍDO\s*\|\s*\`([^\`]+)\`/g)]`

**Função:** Declara uma entrada composta da coleção corrente: `[...statusSource.matchAll(/\|\s*\d+\s*\|\s*✅ CONCLUÍDO\s*\|\s*\`([^\`]+)\`/g)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 247

**Fonte:** `      .map(match => match[1])`

**Função:** Continua a cadeia de transformação com `.map(match => match[1])`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 248

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const reviewFromStatus = new Set(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 249

**Fonte:** `  const reviewFromStatus = new Set(`

**Função:** Participa do contrato estrutural com a instrução `const reviewFromStatus = new Set(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 250

**Fonte:** `    [...statusSource.matchAll(/\|\s*\d+\s*\|\s*🟣 REVISÃO DE QUALIDADE\s*\|\s*\`([^\`]+)\`/g)]`

**Função:** Declara uma entrada composta da coleção corrente: `[...statusSource.matchAll(/\|\s*\d+\s*\|\s*🟣 REVISÃO DE QUALIDADE\s*\|\s*\`([^\`]+)\`/g)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 251

**Fonte:** `      .map(match => match[1])`

**Função:** Continua a cadeia de transformação com `.map(match => match[1])`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 252

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const inProgressEntries = [...statusSource.matchAll(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 253

**Fonte:** `  const inProgressEntries = [...statusSource.matchAll(`

**Função:** Extrai todas as ocorrências compatíveis com a expressão regular em `const inProgressEntries = [...statusSource.matchAll(`, convertendo Markdown em conjuntos de estado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 254

**Fonte:** `    /\|\s*(\d+)\s*\|\s*🟠 EM ANDAMENTO\s*—\s*([^|]+?)\s*\|\s*\`([^\`]+)\`/g`

**Função:** Participa do contrato estrutural com a instrução `/\|\s*(\d+)\s*\|\s*🟠 EM ANDAMENTO\s*—\s*([^|]+?)\s*\|\s*\`([^\`]+)\`/g`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 255

**Fonte:** `  )].map(match => ({`

**Função:** Define uma função seta curta em `)].map(match => ({`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 256

**Fonte:** `    index: Number(match[1]),`

**Função:** Participa do contrato estrutural com a instrução `index: Number(match[1]),`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 257

**Fonte:** `    agent: match[2].trim(),`

**Função:** Participa do contrato estrutural com a instrução `agent: match[2].trim(),`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 258

**Fonte:** `    sourcePath: match[3],`

**Função:** Participa do contrato estrutural com a instrução `sourcePath: match[3],`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 259

**Fonte:** `  }));`

**Função:** Participa do contrato estrutural com a instrução `}));`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 260

**Fonte:** `  const inProgress = inProgressEntries.map(entry => entry.sourcePath);`

**Função:** Define `inProgress` com a expressão `inProgressEntries.map(entry => entry.sourcePath)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 261

**Fonte:** `  const inProgressByFile = new Map(inProgressEntries.map(entry => [entry.sourcePath, entry]));`

**Função:** Define `inProgressByFile` com a expressão `new Map(inProgressEntries.map(entry => [entry.sourcePath, entry]))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 262

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const inProgressByFile = new Map(inProgressEntries.map(entry => [entry.sourcePath, entry]));` do bloco que começa em `const statusRows = [...statusSource.matchAll(`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 263

**Fonte:** `  const statusRows = [...statusSource.matchAll(`

**Função:** Extrai todas as ocorrências compatíveis com a expressão regular em `const statusRows = [...statusSource.matchAll(`, convertendo Markdown em conjuntos de estado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 264

**Fonte:** `    /^\|\s*(\d+)\s*\|[^|]+\|\s*\`([^\`]+)\`/gm`

**Função:** Participa do contrato estrutural com a instrução `/^\|\s*(\d+)\s*\|[^|]+\|\s*\`([^\`]+)\`/gm`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 265

**Fonte:** `  )].map(match => ({ index: Number(match[1]), sourcePath: match[2] }));`

**Função:** Define uma função seta curta em `)].map(match => ({ index: Number(match[1]), sourcePath: match[2] }));`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 266

**Fonte:** `  const uniqueStatusPaths = new Set(statusRows.map(row => row.sourcePath));`

**Função:** Define `uniqueStatusPaths` com a expressão `new Set(statusRows.map(row => row.sourcePath))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 267

**Fonte:** `  if (statusRows.length !== 233 || uniqueStatusPaths.size !== 233) {`

**Função:** Abre a condição `statusRows.length !== 233 || uniqueStatusPaths.size !== 233`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 268

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 269

**Fonte:** `      'docs/biblia/STATUS.md precisa representar 233 arquivos únicos; linhas='`

**Função:** Inclui `docs/biblia/STATUS.md precisa representar 233 arquivos únicos; linhas=` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 270

**Fonte:** `      + statusRows.length + ', únicos=' + uniqueStatusPaths.size`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ statusRows.length + ', únicos=' + uniqueStatusPaths.size`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 271

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 272

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const completedFromChecklist = new Set(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 273

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const completedFromChecklist = new Set(`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 274

**Fonte:** `  const completedFromChecklist = new Set(`

**Função:** Participa do contrato estrutural com a instrução `const completedFromChecklist = new Set(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 275

**Fonte:** `    [...checklistSource.matchAll(/^- \[x\]\s+\d+\s+—\s+\`([^\`]+)\`/gm)]`

**Função:** Declara uma entrada composta da coleção corrente: `[...checklistSource.matchAll(/^- \[x\]\s+\d+\s+—\s+\`([^\`]+)\`/gm)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 276

**Fonte:** `      .map(match => match[1])`

**Função:** Continua a cadeia de transformação com `.map(match => match[1])`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 277

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const approvedFromAudit = new Set(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 278

**Fonte:** `  const approvedFromAudit = new Set(`

**Função:** Participa do contrato estrutural com a instrução `const approvedFromAudit = new Set(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 279

**Fonte:** `    [...auditSource.matchAll(/^\|\s*\d+\s*\|\s*\`([^\`]+)\`\s*\|.*\|\s*✅ APROVADO\s*\|$/gm)]`

**Função:** Declara uma entrada composta da coleção corrente: `[...auditSource.matchAll(/^\|\s*\d+\s*\|\s*\`([^\`]+)\`\s*\|.*\|\s*✅ APROVADO\s*\|$/gm)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 280

**Fonte:** `      .map(match => match[1])`

**Função:** Continua a cadeia de transformação com `.map(match => match[1])`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 281

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const reviewFromAudit = new Set(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 282

**Fonte:** `  const reviewFromAudit = new Set(`

**Função:** Participa do contrato estrutural com a instrução `const reviewFromAudit = new Set(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 283

**Fonte:** `    [...auditSource.matchAll(/^\|\s*\d+\s*\|\s*\`([^\`]+)\`\s*\|.*\|\s*🟣 REVISÃO OBRIGATÓRIA\s*\|$/gm)]`

**Função:** Declara uma entrada composta da coleção corrente: `[...auditSource.matchAll(/^\|\s*\d+\s*\|\s*\`([^\`]+)\`\s*\|.*\|\s*🟣 REVISÃO OBRIGATÓRIA\s*\|$/gm)]`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 284

**Fonte:** `      .map(match => match[1])`

**Função:** Continua a cadeia de transformação com `.map(match => match[1])`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 285

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const sortedStatusDone = [...completedFromStatus].sort();`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 286

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `);` do bloco que começa em `const sortedStatusDone = [...completedFromStatus].sort();`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 287

**Fonte:** `  const sortedStatusDone = [...completedFromStatus].sort();`

**Função:** Define `sortedStatusDone` com a expressão `[...completedFromStatus].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 288

**Fonte:** `  const sortedChecklistDone = [...completedFromChecklist].sort();`

**Função:** Define `sortedChecklistDone` com a expressão `[...completedFromChecklist].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 289

**Fonte:** `  const sortedAuditApproved = [...approvedFromAudit].sort();`

**Função:** Define `sortedAuditApproved` com a expressão `[...approvedFromAudit].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 290

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const sortedAuditApproved = [...approvedFromAudit].sort();` do bloco que começa em `const checklistCurrentEntries = [`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 291

**Fonte:** `  const checklistCurrentEntries = [`

**Função:** Participa do contrato estrutural com a instrução `const checklistCurrentEntries = [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 292

**Fonte:** `    ...checklistSource.matchAll(`

**Função:** Extrai todas as ocorrências compatíveis com a expressão regular em `...checklistSource.matchAll(`, convertendo Markdown em conjuntos de estado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 293

**Fonte:** `      /^- \[ \]\s+(\d+)\s+—\s+\`([^\`]+)\`[^\n]*\*\*← EM ANDAMENTO\s*—\s*([^*]+)\*\*/gm`

**Função:** Participa do contrato estrutural com a instrução `/^- \[ \]\s+(\d+)\s+—\s+\`([^\`]+)\`[^\n]*\*\*← EM ANDAMENTO\s*—\s*([^*]+)\*\*/gm`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 294

**Fonte:** `    ),`

**Função:** Participa do contrato estrutural com a instrução `),`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 295

**Fonte:** `  ].map(match => ({`

**Função:** Define uma função seta curta em `].map(match => ({`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 296

**Fonte:** `    index: Number(match[1]),`

**Função:** Participa do contrato estrutural com a instrução `index: Number(match[1]),`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 297

**Fonte:** `    sourcePath: match[2],`

**Função:** Participa do contrato estrutural com a instrução `sourcePath: match[2],`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 298

**Fonte:** `    agent: match[3].trim(),`

**Função:** Participa do contrato estrutural com a instrução `agent: match[3].trim(),`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 299

**Fonte:** `  }));`

**Função:** Participa do contrato estrutural com a instrução `}));`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 300

**Fonte:** `  const checklistCurrentByFile = new Map(`

**Função:** Participa do contrato estrutural com a instrução `const checklistCurrentByFile = new Map(`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 301

**Fonte:** `    checklistCurrentEntries.map(entry => [entry.sourcePath, entry])`

**Função:** Define uma função seta curta em `checklistCurrentEntries.map(entry => [entry.sourcePath, entry])`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 302

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedChecklistDone)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 303

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `);` do bloco que começa em `if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedChecklistDone)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 304

**Fonte:** `  if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedChecklistDone)) {`

**Função:** Abre a condição `JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedChecklistDone)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 305

**Fonte:** `    problems.push('STATUS.md e CHECKLIST.md divergem sobre quais Bíblias estão concluídas');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `STATUS.md e CHECKLIST.md divergem sobre quais Bíblias estão concluídas`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 306

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedAuditApproved)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 307

**Fonte:** `  if (JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedAuditApproved)) {`

**Função:** Abre a condição `JSON.stringify(sortedStatusDone) !== JSON.stringify(sortedAuditApproved)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 308

**Fonte:** `    problems.push('STATUS.md não pode marcar CONCLUÍDO sem ✅ APROVADO correspondente em AUDITORIA.md');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `STATUS.md não pode marcar CONCLUÍDO sem ✅ APROVADO correspondente em AUDITORIA.md`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 309

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (checklistCurrentEntries.length !== inProgressEntries.length) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 310

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (checklistCurrentEntries.length !== inProgressEntries.length) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 311

**Fonte:** `  if (checklistCurrentEntries.length !== inProgressEntries.length) {`

**Função:** Abre a condição `checklistCurrentEntries.length !== inProgressEntries.length`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 312

**Fonte:** `    problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 313

**Fonte:** `      'STATUS.md e CHECKLIST.md divergem na quantidade de arquivos EM ANDAMENTO: status='`

**Função:** Inclui `STATUS.md e CHECKLIST.md divergem na quantidade de arquivos EM ANDAMENTO: status=` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 314

**Fonte:** `      + inProgressEntries.length + ', checklist=' + checklistCurrentEntries.length`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ inProgressEntries.length + ', checklist=' + checklistCurrentEntries.length`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 315

**Fonte:** `    );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 316

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const entry of inProgressEntries) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 317

**Fonte:** `  for (const entry of inProgressEntries) {`

**Função:** Inicia iteração sobre `const entry of inProgressEntries` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 318

**Fonte:** `    const checklistEntry = checklistCurrentByFile.get(entry.sourcePath);`

**Função:** Define `checklistEntry` com a expressão `checklistCurrentByFile.get(entry.sourcePath)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 319

**Fonte:** `    if (!checklistEntry || checklistEntry.agent !== entry.agent || checklistEntry.index !== entry.index) {`

**Função:** Abre a condição `!checklistEntry || checklistEntry.agent !== entry.agent || checklistEntry.index !== entry.index`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 320

**Fonte:** `      problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 321

**Fonte:** `        'STATUS.md e CHECKLIST.md divergem sobre ownership de EM ANDAMENTO: '`

**Função:** Inclui `STATUS.md e CHECKLIST.md divergem sobre ownership de EM ANDAMENTO: ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 322

**Fonte:** `        + entry.sourcePath + ' / ' + entry.agent`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ entry.sourcePath + ' / ' + entry.agent`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 323

**Fonte:** `      );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 324

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 325

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const auditReviewExpected = new Set([...reviewFromStatus]);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 326

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const auditReviewExpected = new Set([...reviewFromStatus]);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 327

**Fonte:** `  const auditReviewExpected = new Set([...reviewFromStatus]);`

**Função:** Define `auditReviewExpected` com a expressão `new Set([...reviewFromStatus])`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 328

**Fonte:** `  const sortedAuditReviewExpected = [...auditReviewExpected].sort();`

**Função:** Define `sortedAuditReviewExpected` com a expressão `[...auditReviewExpected].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 329

**Fonte:** `  const sortedAuditReviewActual = [...reviewFromAudit].sort();`

**Função:** Define `sortedAuditReviewActual` com a expressão `[...reviewFromAudit].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 330

**Fonte:** `  if (JSON.stringify(sortedAuditReviewExpected) !== JSON.stringify(sortedAuditReviewActual)) {`

**Função:** Abre a condição `JSON.stringify(sortedAuditReviewExpected) !== JSON.stringify(sortedAuditReviewActual)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 331

**Fonte:** `    problems.push('STATUS.md e AUDITORIA.md divergem sobre Bíblias em revisão de qualidade');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `STATUS.md e AUDITORIA.md divergem sobre Bíblias em revisão de qualidade`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 332

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const reservationRoot = path.join(bibleRoot, '.reservas');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 333

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const reservationRoot = path.join(bibleRoot, '.reservas');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 334

**Fonte:** `  const reservationRoot = path.join(bibleRoot, '.reservas');`

**Função:** Define `reservationRoot` com a expressão `path.join(bibleRoot, '.reservas')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 335

**Fonte:** `  const reservationFiles = fs.existsSync(reservationRoot)`

**Função:** Participa do contrato estrutural com a instrução `const reservationFiles = fs.existsSync(reservationRoot)`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 336

**Fonte:** `    ? walk(reservationRoot).map(rel).filter(file => file.endsWith('.lock.md')).sort()`

**Função:** Define uma função seta curta em `? walk(reservationRoot).map(rel).filter(file => file.endsWith('.lock.md')).sort()`, usada para transformar, filtrar ou comparar os dados do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 337

**Fonte:** `    : [];`

**Função:** Participa do contrato estrutural com a instrução `: [];`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 338

**Fonte:** `  const reservationsByFile = new Map();`

**Função:** Define `reservationsByFile` com a expressão `new Map()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 339

**Fonte:** `  const reservationCountByAgent = new Map();`

**Função:** Define `reservationCountByAgent` com a expressão `new Map()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 340

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const reservationCountByAgent = new Map();` do bloco que começa em `for (const reservationFile of reservationFiles) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 341

**Fonte:** `  for (const reservationFile of reservationFiles) {`

**Função:** Inicia iteração sobre `const reservationFile of reservationFiles` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 342

**Fonte:** `    const reservationSource = fs.readFileSync(path.join(root, reservationFile), 'utf8');`

**Função:** Define `reservationSource` com a expressão `fs.readFileSync(path.join(root, reservationFile), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 343

**Fonte:** `    const agent = coordinationField(reservationSource, 'AGENTE');`

**Função:** Define `agent` com a expressão `coordinationField(reservationSource, 'AGENTE')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 344

**Fonte:** `    const sourcePath = coordinationField(reservationSource, 'ARQUIVO');`

**Função:** Define `sourcePath` com a expressão `coordinationField(reservationSource, 'ARQUIVO')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 345

**Fonte:** `    const biblePath = coordinationField(reservationSource, 'BÍBLIA');`

**Função:** Define `biblePath` com a expressão `coordinationField(reservationSource, 'BÍBLIA')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 346

**Fonte:** `    const reservedSha = coordinationField(reservationSource, 'SHA_DO_FONTE_AO_RESERVAR');`

**Função:** Define `reservedSha` com a expressão `coordinationField(reservationSource, 'SHA_DO_FONTE_AO_RESERVAR')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 347

**Fonte:** `    const state = coordinationField(reservationSource, 'ESTADO');`

**Função:** Define `state` com a expressão `coordinationField(reservationSource, 'ESTADO')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 348

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `const state = coordinationField(reservationSource, 'ESTADO');` do bloco que começa em `if (!agent || !sourcePath || !biblePath || !reservedSha || !state) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 349

**Fonte:** `    if (!agent || !sourcePath || !biblePath || !reservedSha || !state) {`

**Função:** Abre a condição `!agent || !sourcePath || !biblePath || !reservedSha || !state`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 350

**Fonte:** `      problems.push('Reserva incompleta: ' + reservationFile);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva incompleta: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 351

**Fonte:** `      continue;`

**Função:** Participa do contrato estrutural com a instrução `continue;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 352

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (state !== 'ATIVA') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 353

**Fonte:** `    if (state !== 'ATIVA') {`

**Função:** Abre a condição `state !== 'ATIVA'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 354

**Fonte:** `      problems.push('Reserva presente precisa estar ATIVA: ' + reservationFile + ' / estado=' + state);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva presente precisa estar ATIVA: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 355

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const expectedReservation = 'docs/biblia/.reservas/' + sourcePath + '.lock.md';`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 356

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const expectedReservation = 'docs/biblia/.reservas/' + sourcePath + '.lock.md';`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 357

**Fonte:** `    const expectedReservation = 'docs/biblia/.reservas/' + sourcePath + '.lock.md';`

**Função:** Define `expectedReservation` com a expressão `'docs/biblia/.reservas/' + sourcePath + '.lock.md'`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 358

**Fonte:** `    if (reservationFile !== expectedReservation) {`

**Função:** Abre a condição `reservationFile !== expectedReservation`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 359

**Fonte:** `      problems.push('Caminho da reserva não espelha o fonte: ' + reservationFile + ' / esperado=' + expectedReservation);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Caminho da reserva não espelha o fonte: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 360

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const expectedBible = 'docs/biblia/' + sourcePath + '/Bíblia.md';`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 361

**Fonte:** `    const expectedBible = 'docs/biblia/' + sourcePath + '/Bíblia.md';`

**Função:** Define `expectedBible` com a expressão `'docs/biblia/' + sourcePath + '/Bíblia.md'`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 362

**Fonte:** `    if (biblePath !== expectedBible) {`

**Função:** Abre a condição `biblePath !== expectedBible`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 363

**Fonte:** `      problems.push('BÍBLIA da reserva diverge do caminho canônico: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `BÍBLIA da reserva diverge do caminho canônico: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 364

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (!exists(sourcePath)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 365

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (!exists(sourcePath)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 366

**Fonte:** `    if (!exists(sourcePath)) {`

**Função:** Abre a condição `!exists(sourcePath)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 367

**Fonte:** `      problems.push('Reserva aponta para fonte inexistente: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva aponta para fonte inexistente: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 368

**Fonte:** `    } else {`

**Função:** Abre o ramo alternativo do teste imediatamente anterior, cobrindo o caso complementar da validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 369

**Fonte:** `      const currentSha = gitBlobSha(fs.readFileSync(path.join(root, sourcePath), 'utf8'));`

**Função:** Define `currentSha` com a expressão `gitBlobSha(fs.readFileSync(path.join(root, sourcePath), 'utf8'))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 370

**Fonte:** `      if (!/^[0-9a-f]{40}$/i.test(reservedSha)) {`

**Função:** Abre a condição `!/^[0-9a-f]{40}$/i.test(reservedSha)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 371

**Fonte:** `        problems.push('Reserva contém SHA inválido: ' + sourcePath + ' / ' + reservedSha);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva contém SHA inválido: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 372

**Fonte:** `      } else if (currentSha !== reservedSha) {`

**Função:** Encadeia uma condição alternativa `currentSha !== reservedSha`, usada somente se o ramo anterior não foi tomado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 373

**Fonte:** `        problems.push('Fonte mudou desde a reserva: ' + sourcePath + ' / reservado=' + reservedSha + ' / atual=' + currentSha);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Fonte mudou desde a reserva: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 374

**Fonte:** `      }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 375

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (reservationsByFile.has(sourcePath)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 376

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (reservationsByFile.has(sourcePath)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 377

**Fonte:** `    if (reservationsByFile.has(sourcePath)) {`

**Função:** Abre a condição `reservationsByFile.has(sourcePath)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 378

**Fonte:** `      problems.push('Mais de uma reserva ativa para o mesmo arquivo: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Mais de uma reserva ativa para o mesmo arquivo: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 379

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `reservationsByFile.set(sourcePath, { agent, reservationFile });`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 380

**Fonte:** `    reservationsByFile.set(sourcePath, { agent, reservationFile });`

**Função:** Participa do contrato estrutural com a instrução `reservationsByFile.set(sourcePath, { agent, reservationFile });`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 381

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `reservationsByFile.set(sourcePath, { agent, reservationFile });` do bloco que começa em `const agentCount = (reservationCountByAgent.get(agent) || 0) + 1;`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 382

**Fonte:** `    const agentCount = (reservationCountByAgent.get(agent) || 0) + 1;`

**Função:** Define `agentCount` com a expressão `(reservationCountByAgent.get(agent) || 0) + 1`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 383

**Fonte:** `    reservationCountByAgent.set(agent, agentCount);`

**Função:** Participa do contrato estrutural com a instrução `reservationCountByAgent.set(agent, agentCount);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 384

**Fonte:** `    if (agentCount > 1) {`

**Função:** Abre a condição `agentCount > 1`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 385

**Fonte:** `      problems.push('Agente possui mais de uma reserva ativa: ' + agent);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Agente possui mais de uma reserva ativa: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 386

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (completedFromStatus.has(sourcePath)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 387

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (completedFromStatus.has(sourcePath)) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 388

**Fonte:** `    if (completedFromStatus.has(sourcePath)) {`

**Função:** Abre a condição `completedFromStatus.has(sourcePath)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 389

**Fonte:** `      problems.push('Arquivo CONCLUÍDO não pode permanecer reservado: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Arquivo CONCLUÍDO não pode permanecer reservado: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 390

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const statusEntry = inProgressByFile.get(sourcePath);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 391

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const statusEntry = inProgressByFile.get(sourcePath);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 392

**Fonte:** `    const statusEntry = inProgressByFile.get(sourcePath);`

**Função:** Define `statusEntry` com a expressão `inProgressByFile.get(sourcePath)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 393

**Fonte:** `    if (!statusEntry) {`

**Função:** Abre a condição `!statusEntry`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 394

**Fonte:** `      problems.push('Reserva ativa sem EM ANDAMENTO correspondente no STATUS.md: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva ativa sem EM ANDAMENTO correspondente no STATUS.md: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 395

**Fonte:** `    } else if (statusEntry.agent !== agent) {`

**Função:** Encadeia uma condição alternativa `statusEntry.agent !== agent`, usada somente se o ramo anterior não foi tomado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 396

**Fonte:** `      problems.push('Reserva diverge do agente no STATUS.md: ' + sourcePath + ' / reserva=' + agent + ' / status=' + statusEntry.agent);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva diverge do agente no STATUS.md: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 397

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const checklistEntry = checklistCurrentByFile.get(sourcePath);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 398

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const checklistEntry = checklistCurrentByFile.get(sourcePath);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 399

**Fonte:** `    const checklistEntry = checklistCurrentByFile.get(sourcePath);`

**Função:** Define `checklistEntry` com a expressão `checklistCurrentByFile.get(sourcePath)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 400

**Fonte:** `    if (!checklistEntry) {`

**Função:** Abre a condição `!checklistEntry`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 401

**Fonte:** `      problems.push('Reserva ativa sem EM ANDAMENTO correspondente no CHECKLIST.md: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva ativa sem EM ANDAMENTO correspondente no CHECKLIST.md: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 402

**Fonte:** `    } else if (checklistEntry.agent !== agent) {`

**Função:** Encadeia uma condição alternativa `checklistEntry.agent !== agent`, usada somente se o ramo anterior não foi tomado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 403

**Fonte:** `      problems.push('Reserva diverge do agente no CHECKLIST.md: ' + sourcePath + ' / reserva=' + agent + ' / checklist=' + checklistEntry.agent);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Reserva diverge do agente no CHECKLIST.md: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 404

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 405

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const entry of inProgressEntries) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 406

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `for (const entry of inProgressEntries) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 407

**Fonte:** `  for (const entry of inProgressEntries) {`

**Função:** Inicia iteração sobre `const entry of inProgressEntries` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 408

**Fonte:** `    const reservation = reservationsByFile.get(entry.sourcePath);`

**Função:** Define `reservation` com a expressão `reservationsByFile.get(entry.sourcePath)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 409

**Fonte:** `    if (!reservation) {`

**Função:** Abre a condição `!reservation`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 410

**Fonte:** `      problems.push('Arquivo EM ANDAMENTO sem reserva ativa: ' + entry.sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Arquivo EM ANDAMENTO sem reserva ativa: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 411

**Fonte:** `    } else if (reservation.agent !== entry.agent) {`

**Função:** Encadeia uma condição alternativa `reservation.agent !== entry.agent`, usada somente se o ramo anterior não foi tomado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 412

**Fonte:** `      problems.push('Arquivo EM ANDAMENTO com ownership divergente da reserva: ' + entry.sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Arquivo EM ANDAMENTO com ownership divergente da reserva: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 413

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 414

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const materializedStates = new Set([`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 415

**Fonte:** `  const materializedStates = new Set([`

**Função:** Participa do contrato estrutural com a instrução `const materializedStates = new Set([`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 416

**Fonte:** `    ...completedFromStatus,`

**Função:** Participa do contrato estrutural com a instrução `...completedFromStatus,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 417

**Fonte:** `    ...reviewFromStatus,`

**Função:** Participa do contrato estrutural com a instrução `...reviewFromStatus,`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 418

**Fonte:** `  ]);`

**Função:** Participa do contrato estrutural com a instrução `]);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 419

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `]);` do bloco que começa em `for (const sourcePath of materializedStates) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 420

**Fonte:** `  for (const sourcePath of materializedStates) {`

**Função:** Inicia iteração sobre `const sourcePath of materializedStates` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 421

**Fonte:** `    const expectedBible = 'docs/biblia/' + sourcePath + '/Bíblia.md';`

**Função:** Define `expectedBible` com a expressão `'docs/biblia/' + sourcePath + '/Bíblia.md'`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 422

**Fonte:** `    if (!exists(expectedBible)) {`

**Função:** Abre a condição `!exists(expectedBible)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 423

**Fonte:** `      problems.push('estado materializado sem Bíblia individual: ' + sourcePath);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `estado materializado sem Bíblia individual: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 424

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 425

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const sourcePath of completedFromStatus) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 426

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `for (const sourcePath of completedFromStatus) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 427

**Fonte:** `  for (const sourcePath of completedFromStatus) {`

**Função:** Inicia iteração sobre `const sourcePath of completedFromStatus` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 428

**Fonte:** `    validateApprovedBible(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md');`

**Função:** Participa do contrato estrutural com a instrução `validateApprovedBible(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md');`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 429

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const sourcePath of reviewFromStatus) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 430

**Fonte:** `  for (const sourcePath of reviewFromStatus) {`

**Função:** Inicia iteração sobre `const sourcePath of reviewFromStatus` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 431

**Fonte:** `    validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', false);`

**Função:** Participa do contrato estrutural com a instrução `validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', false);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 432

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const sourcePath of inProgress) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 433

**Fonte:** `  for (const sourcePath of inProgress) {`

**Função:** Inicia iteração sobre `const sourcePath of inProgress` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 434

**Fonte:** `    validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', true);`

**Função:** Participa do contrato estrutural com a instrução `validateReviewBibleHeader(sourcePath, 'docs/biblia/' + sourcePath + '/Bíblia.md', true);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 435

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const individualBibles = bibleFiles.filter(file => file.endsWith('/Bíblia.md'));`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 436

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const individualBibles = bibleFiles.filter(file => file.endsWith('/Bíblia.md'));`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 437

**Fonte:** `  const individualBibles = bibleFiles.filter(file => file.endsWith('/Bíblia.md'));`

**Função:** Define `individualBibles` com a expressão `bibleFiles.filter(file => file.endsWith('/Bíblia.md'))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 438

**Fonte:** `  for (const bibleFile of individualBibles) {`

**Função:** Inicia iteração sobre `const bibleFile of individualBibles` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 439

**Fonte:** `    const sourcePath = bibleFile`

**Função:** Participa do contrato estrutural com a instrução `const sourcePath = bibleFile`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 440

**Fonte:** `      .slice('docs/biblia/'.length, -'/Bíblia.md'.length);`

**Função:** Continua a cadeia de transformação com `.slice('docs/biblia/'.length, -'/Bíblia.md'.length);`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 441

**Fonte:** `    if (!materializedStates.has(sourcePath) && !inProgress.includes(sourcePath)) {`

**Função:** Abre a condição `!materializedStates.has(sourcePath) && !inProgress.includes(sourcePath)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 442

**Fonte:** `      problems.push(`

**Função:** Adiciona ao acumulador `problems` uma violação construída neste ramo; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 443

**Fonte:** `        'Bíblia individual existe sem estado CONCLUÍDO/EM ANDAMENTO/REVISÃO no STATUS.md: '`

**Função:** Inclui `Bíblia individual existe sem estado CONCLUÍDO/EM ANDAMENTO/REVISÃO no STATUS.md: ` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 444

**Fonte:** `        + sourcePath`

**Função:** Continua a concatenação da mensagem iniciada na linha anterior com `+ sourcePath`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 445

**Fonte:** `      );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 446

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 447

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 448

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const forbidden of [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a CI executa este verificador real, porém não foi localizado self-test que monte estados/reservas/Markdown controlados e faça assertions específicas sobre este ramo.

### Linha 449

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `for (const forbidden of [`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 450

**Fonte:** `for (const forbidden of [`

**Função:** Participa do contrato estrutural com a instrução `for (const forbidden of [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 451

**Fonte:** `  'extension/content_manga.js',`

**Função:** Inclui `extension/content_manga.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 452

**Fonte:** `  'extension/content_gemini.js',`

**Função:** Inclui `extension/content_gemini.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 453

**Fonte:** `  'extension/inject.js',`

**Função:** Inclui `extension/inject.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 454

**Fonte:** `  'extension/cm-gtc-client.js',`

**Função:** Inclui `extension/cm-gtc-client.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 455

**Fonte:** `  'extension/cm-dom-replace.js',`

**Função:** Inclui `extension/cm-dom-replace.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 456

**Fonte:** `  'extension/cm-chapter.js',`

**Função:** Inclui `extension/cm-chapter.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 457

**Fonte:** `  'extension/cm-auto-restore.js',`

**Função:** Inclui `extension/cm-auto-restore.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 458

**Fonte:** `  'extension/gemini',`

**Função:** Inclui `extension/gemini` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 459

**Fonte:** `  'extension/gtc-fingerprint.js',`

**Função:** Inclui `extension/gtc-fingerprint.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 460

**Fonte:** `  'extension/gtc-indexeddb.js',`

**Função:** Inclui `extension/gtc-indexeddb.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 461

**Fonte:** `  'extension/storage-manager.js',`

**Função:** Inclui `extension/storage-manager.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 462

**Fonte:** `  'extension/shared-ui.js',`

**Função:** Inclui `extension/shared-ui.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 463

**Fonte:** `  'extension/popup.html',`

**Função:** Inclui `extension/popup.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 464

**Fonte:** `  'extension/popup.js',`

**Função:** Inclui `extension/popup.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 465

**Fonte:** `  'extension/options.html',`

**Função:** Inclui `extension/options.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 466

**Fonte:** `  'extension/options.js',`

**Função:** Inclui `extension/options.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 467

**Fonte:** `  'extension/reader.html',`

**Função:** Inclui `extension/reader.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 468

**Fonte:** `  'extension/reader.js',`

**Função:** Inclui `extension/reader.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 469

**Fonte:** `  'tests/package.json',`

**Função:** Inclui `tests/package.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 470

**Fonte:** `  'tests/package-lock.json',`

**Função:** Inclui `tests/package-lock.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 471

**Fonte:** `  'tests/jest.config.js',`

**Função:** Inclui `tests/jest.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 472

**Fonte:** `  'tests/jest.coverage.config.js',`

**Função:** Inclui `tests/jest.coverage.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 473

**Fonte:** `  'tests/jest.background-diagnostic.config.js',`

**Função:** Inclui `tests/jest.background-diagnostic.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 474

**Fonte:** `  'tests/playwright.config.js',`

**Função:** Inclui `tests/playwright.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 475

**Fonte:** `  'tests/test-results',`

**Função:** Inclui `tests/test-results` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 476

**Fonte:** `  'tests/coverage',`

**Função:** Inclui `tests/coverage` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 477

**Fonte:** `  'tests/.ci-results',`

**Função:** Inclui `tests/.ci-results` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 478

**Fonte:** `  'tests/ci',`

**Função:** Inclui `tests/ci` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 479

**Fonte:** `  'tests/visual-v3',`

**Função:** Inclui `tests/visual-v3` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 480

**Fonte:** `  'tests/e2e/fixtures',`

**Função:** Inclui `tests/e2e/fixtures` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 481

**Fonte:** `  'tests/run-all-tests.js',`

**Função:** Inclui `tests/run-all-tests.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 482

**Fonte:** `  'tests/run-e2e.js',`

**Função:** Inclui `tests/run-e2e.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 483

**Fonte:** `  'scripts/sync-version.js',`

**Função:** Inclui `scripts/sync-version.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 484

**Fonte:** `  'projeto.md',`

**Função:** Inclui `projeto.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 485

**Fonte:** `  'status.md',`

**Função:** Inclui `status.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 486

**Fonte:** `  'docs/historico',`

**Função:** Inclui `docs/historico` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 487

**Fonte:** `  'docs/ARQUITETURA_DO_REPOSITORIO.md',`

**Função:** Inclui `docs/ARQUITETURA_DO_REPOSITORIO.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 488

**Fonte:** `  'docs/CHECKLIST_REESTRUTURACAO_PR65.md',`

**Função:** Inclui `docs/CHECKLIST_REESTRUTURACAO_PR65.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 489

**Fonte:** `  'docs/PLANO_REESTRUTURACAO.md',`

**Função:** Inclui `docs/PLANO_REESTRUTURACAO.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 490

**Fonte:** `  'docs/MELHORIAS_EXTRACAO_E_PRAZO.md',`

**Função:** Inclui `docs/MELHORIAS_EXTRACAO_E_PRAZO.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 491

**Fonte:** `  'docs/QUARENTENA_DE_IMAGEM.md',`

**Função:** Inclui `docs/QUARENTENA_DE_IMAGEM.md` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 492

**Fonte:** `]) requireAbsent(forbidden);`

**Função:** Participa do contrato estrutural com a instrução `]) requireAbsent(forbidden);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 493

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `]) requireAbsent(forbidden);` do bloco que começa em `// Contrato interno do bloco 0-G: paths de runtime precisam permanecer alinhados.`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 494

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `]) requireAbsent(forbidden);` do bloco que começa em `// Contrato interno do bloco 0-G: paths de runtime precisam permanecer alinhados.`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 495

**Fonte:** `// Contrato interno do bloco 0-G: paths de runtime precisam permanecer alinhados.`

**Função:** Comentário que delimita a intenção do bloco seguinte: Contrato interno do bloco 0-G: paths de runtime precisam permanecer alinhados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 496

**Fonte:** `const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));`

**Função:** Define `manifest` com a expressão `JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 497

**Fonte:** `const expectedContentScripts = [`

**Função:** Participa do contrato estrutural com a instrução `const expectedContentScripts = [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 498

**Fonte:** `  [`

**Função:** Abre ou encerra uma sublista dentro da estrutura declarativa usada pelo contrato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 499

**Fonte:** `    'shared/gtc-fingerprint.js',`

**Função:** Inclui `shared/gtc-fingerprint.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 500

**Fonte:** `    'content/cm-gtc-client.js',`

**Função:** Inclui `content/cm-gtc-client.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 501

**Fonte:** `    'content/cm-dom-replace.js',`

**Função:** Inclui `content/cm-dom-replace.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 502

**Fonte:** `    'content/cm-chapter.js',`

**Função:** Inclui `content/cm-chapter.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 503

**Fonte:** `    'content/cm-auto-restore.js',`

**Função:** Inclui `content/cm-auto-restore.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 504

**Fonte:** `    'content/content_manga.js',`

**Função:** Inclui `content/content_manga.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 505

**Fonte:** `  ],`

**Função:** Abre ou encerra uma sublista dentro da estrutura declarativa usada pelo contrato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 506

**Fonte:** `  ['content/inject.js'],`

**Função:** Declara uma entrada composta da coleção corrente: `['content/inject.js'],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 507

**Fonte:** `  [`

**Função:** Abre ou encerra uma sublista dentro da estrutura declarativa usada pelo contrato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 508

**Fonte:** `    'content/gemini/selectors.js',`

**Função:** Inclui `content/gemini/selectors.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 509

**Fonte:** `    'content/gemini/dom.js',`

**Função:** Inclui `content/gemini/dom.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 510

**Fonte:** `    'content/gemini/image-quarantine.js',`

**Função:** Inclui `content/gemini/image-quarantine.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 511

**Fonte:** `    'content/gemini/observer.js',`

**Função:** Inclui `content/gemini/observer.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 512

**Fonte:** `    'content/gemini/editor.js',`

**Função:** Inclui `content/gemini/editor.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 513

**Fonte:** `    'content/gemini/attachment.js',`

**Função:** Inclui `content/gemini/attachment.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 514

**Fonte:** `    'content/gemini/temporary-chat.js',`

**Função:** Inclui `content/gemini/temporary-chat.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 515

**Fonte:** `    'content/gemini/result-extractor.js',`

**Função:** Inclui `content/gemini/result-extractor.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 516

**Fonte:** `    'content/gemini/deletion.js',`

**Função:** Inclui `content/gemini/deletion.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 517

**Fonte:** `    'content/gemini/job-runner.js',`

**Função:** Inclui `content/gemini/job-runner.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 518

**Fonte:** `    'content/content_gemini.js',`

**Função:** Inclui `content/content_gemini.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 519

**Fonte:** `  ],`

**Função:** Abre ou encerra uma sublista dentro da estrutura declarativa usada pelo contrato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 520

**Fonte:** `];`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (manifest.action?.default_popup !== 'popup/popup.html') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 521

**Fonte:** `if (manifest.action?.default_popup !== 'popup/popup.html') {`

**Função:** Abre a condição `manifest.action?.default_popup !== 'popup/popup.html'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 522

**Fonte:** `  problems.push('manifest action.default_popup precisa apontar para popup/popup.html');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `manifest action.default_popup precisa apontar para popup/popup.html`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 523

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (manifest.options_ui?.page !== 'options/options.html') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 524

**Fonte:** `if (manifest.options_ui?.page !== 'options/options.html') {`

**Função:** Abre a condição `manifest.options_ui?.page !== 'options/options.html'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 525

**Fonte:** `  problems.push('manifest options_ui.page precisa apontar para options/options.html');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `manifest options_ui.page precisa apontar para options/options.html`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 526

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (manifest.background?.service_worker !== 'background.js') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 527

**Fonte:** `if (manifest.background?.service_worker !== 'background.js') {`

**Função:** Abre a condição `manifest.background?.service_worker !== 'background.js'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 528

**Fonte:** `  problems.push('manifest background.service_worker precisa permanecer em background.js');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `manifest background.service_worker precisa permanecer em background.js`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 529

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const actualContentScripts = (manifest.content_scripts || []).map(entry => entry.js || []);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 530

**Fonte:** `const actualContentScripts = (manifest.content_scripts || []).map(entry => entry.js || []);`

**Função:** Define `actualContentScripts` com a expressão `(manifest.content_scripts || []).map(entry => entry.js || [])`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 531

**Fonte:** `if (JSON.stringify(actualContentScripts) !== JSON.stringify(expectedContentScripts)) {`

**Função:** Abre a condição `JSON.stringify(actualContentScripts) !== JSON.stringify(expectedContentScripts)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 532

**Fonte:** `  problems.push('manifest content_scripts não corresponde ao layout canônico do bloco 0-G');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `manifest content_scripts não corresponde ao layout canônico do bloco 0-G`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 533

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const backgroundSource = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 534

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const backgroundSource = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 535

**Fonte:** `const backgroundSource = fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8');`

**Função:** Define `backgroundSource` com a expressão `fs.readFileSync(path.join(root, 'extension/background.js'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 536

**Fonte:** `for (const requiredMarker of [`

**Função:** Participa do contrato estrutural com a instrução `for (const requiredMarker of [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 537

**Fonte:** `  "importScripts('shared/gtc-fingerprint.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 538

**Fonte:** `  "importScripts('shared/gtc-indexeddb.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 539

**Fonte:** `  "importScripts('shared/storage-manager.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 540

**Fonte:** `  "require('./shared/gtc-indexeddb.js')",`

**Função:** Inclui `require(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 541

**Fonte:** `  "require('./shared/storage-manager.js')",`

**Função:** Inclui `require(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 542

**Fonte:** `]) {`

**Função:** Participa do contrato estrutural com a instrução `]) {`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 543

**Fonte:** `  if (!backgroundSource.includes(requiredMarker)) {`

**Função:** Abre a condição `!backgroundSource.includes(requiredMarker)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 544

**Fonte:** `    problems.push('background.js não contém referência canônica: ' + requiredMarker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `background.js não contém referência canônica: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 545

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 546

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const legacyMarker of [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 547

**Fonte:** `for (const legacyMarker of [`

**Função:** Participa do contrato estrutural com a instrução `for (const legacyMarker of [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 548

**Fonte:** `  "importScripts('gtc-fingerprint.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 549

**Fonte:** `  "importScripts('gtc-indexeddb.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 550

**Fonte:** `  "importScripts('storage-manager.js')",`

**Função:** Inclui `importScripts(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 551

**Fonte:** `  "require('./gtc-indexeddb.js')",`

**Função:** Inclui `require(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 552

**Fonte:** `  "require('./storage-manager.js')",`

**Função:** Inclui `require(` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 553

**Fonte:** `]) {`

**Função:** Participa do contrato estrutural com a instrução `]) {`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 554

**Fonte:** `  if (backgroundSource.includes(legacyMarker)) {`

**Função:** Abre a condição `backgroundSource.includes(legacyMarker)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 555

**Fonte:** `    problems.push('background.js ainda contém referência plana antiga: ' + legacyMarker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `background.js ainda contém referência plana antiga: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 556

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 557

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const pageContracts = [`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 558

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const pageContracts = [`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 559

**Fonte:** `const pageContracts = [`

**Função:** Participa do contrato estrutural com a instrução `const pageContracts = [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 560

**Fonte:** `  ['extension/popup/popup.html', '../shared/shared-ui.js', 'popup.js'],`

**Função:** Declara uma entrada composta da coleção corrente: `['extension/popup/popup.html', '../shared/shared-ui.js', 'popup.js'],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 561

**Fonte:** `  ['extension/options/options.html', '../shared/shared-ui.js', 'options.js'],`

**Função:** Declara uma entrada composta da coleção corrente: `['extension/options/options.html', '../shared/shared-ui.js', 'options.js'],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 562

**Fonte:** `  ['extension/reader/reader.html', '../shared/shared-ui.js', 'reader.js'],`

**Função:** Declara uma entrada composta da coleção corrente: `['extension/reader/reader.html', '../shared/shared-ui.js', 'reader.js'],`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 563

**Fonte:** `];`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const [page, sharedSrc, ownSrc] of pageContracts) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 564

**Fonte:** `for (const [page, sharedSrc, ownSrc] of pageContracts) {`

**Função:** Inicia iteração sobre `const [page, sharedSrc, ownSrc] of pageContracts` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 565

**Fonte:** `  const html = fs.readFileSync(path.join(root, page), 'utf8');`

**Função:** Define `html` com a expressão `fs.readFileSync(path.join(root, page), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 566

**Fonte:** `  if (!html.includes(\`<script src="${sharedSrc}"></script>\`)) {`

**Função:** Abre a condição `!html.includes(\`<script src="${sharedSrc}"></script>\`)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 567

**Fonte:** `    problems.push(page + ' precisa carregar ' + sharedSrc);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por ` precisa carregar `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 568

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (!html.includes(\`<script src="${ownSrc}"></script>\`)) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 569

**Fonte:** `  if (!html.includes(\`<script src="${ownSrc}"></script>\`)) {`

**Função:** Abre a condição `!html.includes(\`<script src="${ownSrc}"></script>\`)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 570

**Fonte:** `    problems.push(page + ' precisa carregar ' + ownSrc);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por ` precisa carregar `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 571

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 572

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const popupSource = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 573

**Fonte:** `const popupSource = fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8');`

**Função:** Define `popupSource` com a expressão `fs.readFileSync(path.join(root, 'extension/popup/popup.js'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 574

**Fonte:** `if (!popupSource.includes('reader/reader.html?id=')) {`

**Função:** Abre a condição `!popupSource.includes('reader/reader.html?id=')`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 575

**Fonte:** `  problems.push('popup/popup.js precisa abrir reader/reader.html');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `popup/popup.js precisa abrir reader/reader.html`; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 576

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const extensionRootFiles = fs.readdirSync(path.join(root, 'extension'), { withFileTypes: true })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 577

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const extensionRootFiles = fs.readdirSync(path.join(root, 'extension'), { withFileTypes: true })`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 578

**Fonte:** `const extensionRootFiles = fs.readdirSync(path.join(root, 'extension'), { withFileTypes: true })`

**Função:** Enumera entradas do filesystem com `const extensionRootFiles = fs.readdirSync(path.join(root, 'extension'), { withFileTypes: true })` para comparar a topologia real com o contrato canônico.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 579

**Fonte:** `  .filter(entry => entry.isFile())`

**Função:** Continua a cadeia de transformação com `.filter(entry => entry.isFile())`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 580

**Fonte:** `  .map(entry => entry.name)`

**Função:** Continua a cadeia de transformação com `.map(entry => entry.name)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 581

**Fonte:** `  .sort();`

**Função:** Continua a cadeia de transformação com `.sort();`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 582

**Fonte:** `if (JSON.stringify(extensionRootFiles) !== JSON.stringify(['background.js', 'manifest.json'])) {`

**Função:** Abre a condição `JSON.stringify(extensionRootFiles) !== JSON.stringify(['background.js', 'manifest.json'])`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 583

**Fonte:** `  problems.push('a raiz de extension/ deve conter somente background.js e manifest.json: ' + extensionRootFiles.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `a raiz de extension/ deve conter somente background.js e manifest.json: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 584

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const tracked = walk(root, { ignore: new Set(['.git', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'dist', 'build', '.ci`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 585

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const tracked = walk(root, { ignore: new Set(['.git', 'node_modules', 'coverage', 'playwright-report', 'test-results', '`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 586

**Fonte:** `const tracked = walk(root, { ignore: new Set(['.git', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'dist', 'build', '.ci-results', 'blob-report', 'all-blob-reports']) });`

**Função:** Define `tracked` com a expressão `walk(root, { ignore: new Set(['.git', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'dist', 'build', '.ci-results', 'blob-report', 'all-blob-reports']) })`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 587

**Fonte:** `const legacyReferenceMarkers = [`

**Função:** Participa do contrato estrutural com a instrução `const legacyReferenceMarkers = [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 588

**Fonte:** `  'tests/ci/',`

**Função:** Inclui `tests/ci/` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 589

**Fonte:** `  'tests/package.json',`

**Função:** Inclui `tests/package.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 590

**Fonte:** `  'tests/package-lock.json',`

**Função:** Inclui `tests/package-lock.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 591

**Fonte:** `  'tests/jest.config.js',`

**Função:** Inclui `tests/jest.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 592

**Fonte:** `  'tests/jest.coverage.config.js',`

**Função:** Inclui `tests/jest.coverage.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 593

**Fonte:** `  'tests/jest.background-diagnostic.config.js',`

**Função:** Inclui `tests/jest.background-diagnostic.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 594

**Fonte:** `  'tests/playwright.config.js',`

**Função:** Inclui `tests/playwright.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 595

**Fonte:** `  'tests/visual-v3/',`

**Função:** Inclui `tests/visual-v3/` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 596

**Fonte:** `  'tests/e2e/fixtures/',`

**Função:** Inclui `tests/e2e/fixtures/` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 597

**Fonte:** `  'scripts/sync-version.js',`

**Função:** Inclui `scripts/sync-version.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 598

**Fonte:** `  'extension/content_manga.js',`

**Função:** Inclui `extension/content_manga.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 599

**Fonte:** `  'extension/content_gemini.js',`

**Função:** Inclui `extension/content_gemini.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 600

**Fonte:** `  'extension/inject.js',`

**Função:** Inclui `extension/inject.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 601

**Fonte:** `  'extension/gemini/',`

**Função:** Inclui `extension/gemini/` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 602

**Fonte:** `  'extension/gtc-fingerprint.js',`

**Função:** Inclui `extension/gtc-fingerprint.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 603

**Fonte:** `  'extension/gtc-indexeddb.js',`

**Função:** Inclui `extension/gtc-indexeddb.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 604

**Fonte:** `  'extension/storage-manager.js',`

**Função:** Inclui `extension/storage-manager.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 605

**Fonte:** `  'extension/shared-ui.js',`

**Função:** Inclui `extension/shared-ui.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 606

**Fonte:** `  'extension/popup.html',`

**Função:** Inclui `extension/popup.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 607

**Fonte:** `  'extension/popup.js',`

**Função:** Inclui `extension/popup.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 608

**Fonte:** `  'extension/options.html',`

**Função:** Inclui `extension/options.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 609

**Fonte:** `  'extension/options.js',`

**Função:** Inclui `extension/options.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 610

**Fonte:** `  'extension/reader.html',`

**Função:** Inclui `extension/reader.html` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 611

**Fonte:** `  'extension/reader.js',`

**Função:** Inclui `extension/reader.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 612

**Fonte:** `];`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const legacyScanExcluded = new Set([`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 613

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `];` do bloco que começa em `const legacyScanExcluded = new Set([`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 614

**Fonte:** `const legacyScanExcluded = new Set([`

**Função:** Participa do contrato estrutural com a instrução `const legacyScanExcluded = new Set([`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 615

**Fonte:** `  'scripts/validation/verify-repository-structure.js',`

**Função:** Inclui `scripts/validation/verify-repository-structure.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 616

**Fonte:** `  'scripts/validation/verify-ci-contract.js',`

**Função:** Inclui `scripts/validation/verify-ci-contract.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 617

**Fonte:** `]);`

**Função:** Participa do contrato estrutural com a instrução `]);`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 618

**Fonte:** `const operationalTextFiles = tracked.filter((file) => {`

**Função:** Abre callback para a expressão `const operationalTextFiles = tracked.filter((file) => {`; o corpo decide como cada item será filtrado, mapeado ou validado.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 619

**Fonte:** `  const relative = rel(file);`

**Função:** Define `relative` com a expressão `rel(file)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 620

**Fonte:** `  if (legacyScanExcluded.has(relative)) return false;`

**Função:** Participa do contrato estrutural com a instrução `if (legacyScanExcluded.has(relative)) return false;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 621

**Fonte:** `  if (!/\.(?:js|json|ya?ml|html)$/i.test(relative)) return false;`

**Função:** Participa do contrato estrutural com a instrução `if (!/\.(?:js|json|ya?ml|html)$/i.test(relative)) return false;`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 622

**Fonte:** `  return (`

**Função:** Participa do contrato estrutural com a instrução `return (`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 623

**Fonte:** `    relative.startsWith('extension/') ||`

**Função:** Participa do contrato estrutural com a instrução `relative.startsWith('extension/') ||`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 624

**Fonte:** `    relative.startsWith('tests/') ||`

**Função:** Participa do contrato estrutural com a instrução `relative.startsWith('tests/') ||`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 625

**Fonte:** `    relative.startsWith('scripts/') ||`

**Função:** Participa do contrato estrutural com a instrução `relative.startsWith('scripts/') ||`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 626

**Fonte:** `    relative.startsWith('.github/workflows/') ||`

**Função:** Participa do contrato estrutural com a instrução `relative.startsWith('.github/workflows/') ||`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 627

**Fonte:** `    relative === 'package.json'`

**Função:** Participa do contrato estrutural com a instrução `relative === 'package.json'`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 628

**Fonte:** `  );`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `});`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 629

**Fonte:** `});`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `for (const file of operationalTextFiles) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 630

**Fonte:** `for (const file of operationalTextFiles) {`

**Função:** Inicia iteração sobre `const file of operationalTextFiles` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 631

**Fonte:** `  const relative = rel(file);`

**Função:** Define `relative` com a expressão `rel(file)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 632

**Fonte:** `  const source = fs.readFileSync(file, 'utf8');`

**Função:** Define `source` com a expressão `fs.readFileSync(file, 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 633

**Fonte:** `  for (const marker of legacyReferenceMarkers) {`

**Função:** Inicia iteração sobre `const marker of legacyReferenceMarkers` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 634

**Fonte:** `    if (source.includes(marker)) {`

**Função:** Abre a condição `source.includes(marker)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 635

**Fonte:** `      problems.push('referência operacional legada em ' + relative + ': ' + marker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `referência operacional legada em `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 636

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 637

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 638

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const packageJsons = tracked.filter((file) => path.basename(file) === 'package.json').map(rel);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 639

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const packageJsons = tracked.filter((file) => path.basename(file) === 'package.json').map(rel);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 640

**Fonte:** `const packageJsons = tracked.filter((file) => path.basename(file) === 'package.json').map(rel);`

**Função:** Define `packageJsons` com a expressão `tracked.filter((file) => path.basename(file) === 'package.json').map(rel)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 641

**Fonte:** `const lockfiles = tracked.filter((file) => path.basename(file) === 'package-lock.json').map(rel);`

**Função:** Define `lockfiles` com a expressão `tracked.filter((file) => path.basename(file) === 'package-lock.json').map(rel)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 642

**Fonte:** `if (packageJsons.length !== 1 || packageJsons[0] !== 'package.json') {`

**Função:** Abre a condição `packageJsons.length !== 1 || packageJsons[0] !== 'package.json'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 643

**Fonte:** `  problems.push('deve existir exatamente um package.json canônico na raiz; encontrados: ' + packageJsons.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `deve existir exatamente um package.json canônico na raiz; encontrados: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 644

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json') {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 645

**Fonte:** `if (lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json') {`

**Função:** Abre a condição `lockfiles.length !== 1 || lockfiles[0] !== 'package-lock.json'`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 646

**Fonte:** `  problems.push('deve existir exatamente um package-lock.json canônico na raiz; encontrados: ' + lockfiles.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `deve existir exatamente um package-lock.json canônico na raiz; encontrados: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 647

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const wrappers = tracked.filter((file) => /\.(?:bat|ps1)$/i.test(file)).map(rel);`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 648

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const wrappers = tracked.filter((file) => /\.(?:bat|ps1)$/i.test(file)).map(rel);`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 649

**Fonte:** `const wrappers = tracked.filter((file) => /\.(?:bat|ps1)$/i.test(file)).map(rel);`

**Função:** Define `wrappers` com a expressão `tracked.filter((file) => /\.(?:bat|ps1)$/i.test(file)).map(rel)`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 650

**Fonte:** `if (wrappers.length) problems.push('wrappers BAT/PS1 proibidos: ' + wrappers.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `wrappers BAT/PS1 proibidos: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 651

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `if (wrappers.length) problems.push('wrappers BAT/PS1 proibidos: ' + wrappers.join(', '));` do bloco que começa em `const jestConfigs = tracked`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 652

**Fonte:** `const jestConfigs = tracked`

**Função:** Participa do contrato estrutural com a instrução `const jestConfigs = tracked`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 653

**Fonte:** `  .filter((file) => /^jest.*config\.js$/i.test(path.basename(file)))`

**Função:** Continua a cadeia de transformação com `.filter((file) => /^jest.*config\.js$/i.test(path.basename(file)))`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 654

**Fonte:** `  .map(rel)`

**Função:** Continua a cadeia de transformação com `.map(rel)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 655

**Fonte:** `  .sort();`

**Função:** Continua a cadeia de transformação com `.sort();`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 656

**Fonte:** `if (JSON.stringify(jestConfigs) !== JSON.stringify(['jest.config.js'])) {`

**Função:** Abre a condição `JSON.stringify(jestConfigs) !== JSON.stringify(['jest.config.js'])`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 657

**Fonte:** `  problems.push('Jest precisa ter exatamente uma config canônica: ' + jestConfigs.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `Jest precisa ter exatamente uma config canônica: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 658

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const playwrightConfigs = tracked`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 659

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const playwrightConfigs = tracked`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 660

**Fonte:** `const playwrightConfigs = tracked`

**Função:** Participa do contrato estrutural com a instrução `const playwrightConfigs = tracked`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 661

**Fonte:** `  .filter((file) => /^playwright.*config\.js$/i.test(path.basename(file)))`

**Função:** Continua a cadeia de transformação com `.filter((file) => /^playwright.*config\.js$/i.test(path.basename(file)))`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 662

**Fonte:** `  .map(rel)`

**Função:** Continua a cadeia de transformação com `.map(rel)`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 663

**Fonte:** `  .sort();`

**Função:** Continua a cadeia de transformação com `.sort();`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 664

**Fonte:** `const allowedPlaywrightConfigs = ['playwright.config.js', 'scripts/ci/playwright-merge.config.js'].sort();`

**Função:** Define `allowedPlaywrightConfigs` com a expressão `['playwright.config.js', 'scripts/ci/playwright-merge.config.js'].sort()`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 665

**Fonte:** `if (JSON.stringify(playwrightConfigs) !== JSON.stringify(allowedPlaywrightConfigs)) {`

**Função:** Abre a condição `JSON.stringify(playwrightConfigs) !== JSON.stringify(allowedPlaywrightConfigs)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 666

**Fonte:** `  problems.push('configs Playwright inesperadas: ' + playwrightConfigs.join(', '));`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `configs Playwright inesperadas: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 667

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const mergeConfig = fs.readFileSync(path.join(root, 'scripts/ci/playwright-merge.config.js'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 668

**Fonte:** `const mergeConfig = fs.readFileSync(path.join(root, 'scripts/ci/playwright-merge.config.js'), 'utf8');`

**Função:** Define `mergeConfig` com a expressão `fs.readFileSync(path.join(root, 'scripts/ci/playwright-merge.config.js'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 669

**Fonte:** `for (const forbiddenKey of ['testDir', 'outputDir', 'workers', 'retries', 'projects', 'webServer', 'launchOptions']) {`

**Função:** Inicia iteração sobre `const forbiddenKey of ['testDir', 'outputDir', 'workers', 'retries', 'projects', 'webServer', 'launchOptions']` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 670

**Fonte:** `  if (mergeConfig.includes(forbiddenKey)) {`

**Função:** Abre a condição `mergeConfig.includes(forbiddenKey)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 671

**Fonte:** `    problems.push('playwright-merge.config.js deve conter apenas configuração de merge/reporter; chave proibida: ' + forbiddenKey);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `playwright-merge.config.js deve conter apenas configuração de merge/reporter; chave proibida: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 672

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 673

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 674

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 675

**Fonte:** `const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');`

**Função:** Define `workflow` com a expressão `fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 676

**Fonte:** `for (const marker of [`

**Função:** Participa do contrato estrutural com a instrução `for (const marker of [`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 677

**Fonte:** `  'working-directory: tests',`

**Função:** Inclui `working-directory: tests` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 678

**Fonte:** `  'npm --prefix tests',`

**Função:** Inclui `npm --prefix tests` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 679

**Fonte:** `  'cd tests',`

**Função:** Inclui `cd tests` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 680

**Fonte:** `  'tests/ci/',`

**Função:** Inclui `tests/ci/` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 681

**Fonte:** `  'tests/package.json',`

**Função:** Inclui `tests/package.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 682

**Fonte:** `  'tests/package-lock.json',`

**Função:** Inclui `tests/package-lock.json` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 683

**Fonte:** `  'tests/playwright.config.js',`

**Função:** Inclui `tests/playwright.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 684

**Fonte:** `  'tests/jest.coverage.config.js',`

**Função:** Inclui `tests/jest.coverage.config.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 685

**Fonte:** `  'scripts/sync-version.js',`

**Função:** Inclui `scripts/sync-version.js` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 686

**Fonte:** `]) {`

**Função:** Participa do contrato estrutural com a instrução `]) {`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 687

**Fonte:** `  if (workflow.includes(marker)) problems.push('ci.yml contém referência operacional legada: ' + marker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `ci.yml contém referência operacional legada: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 688

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 689

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 690

**Fonte:** `const playwrightConfig = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');`

**Função:** Define `playwrightConfig` com a expressão `fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 691

**Fonte:** `for (const marker of ["outputDir: './tests/test-results'", "testDir: './e2e'"]) {`

**Função:** Inicia iteração sobre `const marker of ["outputDir: './tests/test-results'", "testDir: './e2e'"]` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 692

**Fonte:** `  if (playwrightConfig.includes(marker)) problems.push('playwright.config.js contém caminho legado: ' + marker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `playwright.config.js contém caminho legado: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 693

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 694

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 695

**Fonte:** `const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));`

**Função:** Define `pkg` com a expressão `JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 696

**Fonte:** `for (const [name, command] of Object.entries(pkg.scripts || {})) {`

**Função:** Inicia iteração sobre `const [name, command] of Object.entries(pkg.scripts || {})` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 697

**Fonte:** `  for (const marker of ['npm --prefix tests', 'cd tests', 'tests/package.json', 'tests/run-all-tests.js', 'tests/run-e2e.js']) {`

**Função:** Inicia iteração sobre `const marker of ['npm --prefix tests', 'cd tests', 'tests/package.json', 'tests/run-all-tests.js', 'tests/run-e2e.js']` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 698

**Fonte:** `    if (String(command).includes(marker)) {`

**Função:** Abre a condição `String(command).includes(marker)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 699

**Fonte:** `      problems.push('script npm ' + name + ' contém legado: ' + marker);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `script npm `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 700

**Fonte:** `    }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 701

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 702

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const testJs = walk(path.join(root, 'tests'), { ignore: new Set(['node_modules']) })`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 703

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const testJs = walk(path.join(root, 'tests'), { ignore: new Set(['node_modules']) })`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 704

**Fonte:** `const testJs = walk(path.join(root, 'tests'), { ignore: new Set(['node_modules']) })`

**Função:** Participa do contrato estrutural com a instrução `const testJs = walk(path.join(root, 'tests'), { ignore: new Set(['node_modules']) })`; seu efeito deve ser interpretado junto do bloco sintático em que está inserida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 705

**Fonte:** `  .filter((file) => file.endsWith('.js'));`

**Função:** Continua a cadeia de transformação com `.filter((file) => file.endsWith('.js'));`, refinando o valor produzido na linha anterior.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 706

**Fonte:** `for (const file of testJs) {`

**Função:** Inicia iteração sobre `const file of testJs` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 707

**Fonte:** `  const source = fs.readFileSync(file, 'utf8');`

**Função:** Define `source` com a expressão `fs.readFileSync(file, 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 708

**Fonte:** `  if (/function\s+_?findRoot\s*\(/.test(source)) {`

**Função:** Abre a condição `/function\s+_?findRoot\s*\(/.test(source)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 709

**Fonte:** `    problems.push('finder de raiz duplicado em ' + rel(file) + '; use tests/helpers/repo-root.js');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `finder de raiz duplicado em `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 710

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (source.includes('process.cwd()')) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 711

**Fonte:** `  if (source.includes('process.cwd()')) {`

**Função:** Abre a condição `source.includes('process.cwd()')`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 712

**Fonte:** `    problems.push('dependência de process.cwd() em ' + rel(file) + '; derive paths de __dirname/repo-root');`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `dependência de process.cwd() em `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 713

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 714

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 715

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 716

**Fonte:** `const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');`

**Função:** Define `gitignore` com a expressão `fs.readFileSync(path.join(root, '.gitignore'), 'utf8')`, estabelecendo dado reutilizado pelas validações seguintes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 717

**Fonte:** `for (const entry of ['.jest-cache*/', '.ci-results/', 'all-blob-reports/', 'dist/']) {`

**Função:** Inicia iteração sobre `const entry of ['.jest-cache*/', '.ci-results/', 'all-blob-reports/', 'dist/']` para aplicar a mesma regra estrutural a cada item do conjunto.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 718

**Fonte:** `  if (!gitignore.split(/\r?\n/).includes(entry)) {`

**Função:** Abre a condição `!gitignore.split(/\r?\n/).includes(entry)`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 719

**Fonte:** `    problems.push('.gitignore não contém entrada obrigatória: ' + entry);`

**Função:** Adiciona ao acumulador `problems` uma violação cujo texto começa por `.gitignore não contém entrada obrigatória: `; a saída final só falha depois de reunir todas as ocorrências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 720

**Fonte:** `  }`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `}`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 721

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `if (problems.length) {`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 722

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `if (problems.length) {`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 723

**Fonte:** `if (problems.length) {`

**Função:** Abre a condição `problems.length`; quando verdadeira, o verificador registra ou trata a anomalia correspondente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 724

**Fonte:** `  console.error('Estrutura do repositório inválida:');`

**Função:** Emite diagnóstico de erro no stderr; neste ponto o script está materializando as violações acumuladas para a CI ou operador local.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 725

**Fonte:** `  for (const problem of problems) console.error('- ' + problem);`

**Função:** Emite diagnóstico de erro no stderr; neste ponto o script está materializando as violações acumuladas para a CI ou operador local.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 726

**Fonte:** `  process.exit(1);`

**Função:** Encerra o processo com código 1, transformando qualquer problema estrutural acumulado em falha bloqueante da CI.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 727

**Fonte:** `}`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com `console.log(`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 728

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `}` do bloco que começa em `console.log(`, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 729

**Fonte:** `console.log(`

**Função:** Emite a mensagem de sucesso do gate quando nenhuma violação estrutural foi acumulada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 730

**Fonte:** `  'Estrutura validada: npm/Jest/Playwright centralizados, tooling separado e caminhos legados ausentes.'`

**Função:** Inclui `Estrutura validada: npm/Jest/Playwright centralizados, tooling separado e caminhos legados ausentes.` na coleção declarativa corrente; essa entrada passa a participar da regra aplicada ao conjunto inteiro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 731

**Fonte:** `);`

**Função:** Fecha a estrutura sintática iniciada anteriormente; a próxima linha prossegue com ``.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.

### Linha 732

**Fonte:** `␠ [linha vazia]`

**Função:** Separa visualmente o bloco que termina em `);` do bloco que começa em ``, preservando legibilidade sem alterar a execução.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — o arquivo é executado diretamente pelo job de validação da CI e por `npm run validate:structure`, mas não há assertion focal desta linha.
