# Bíblia técnica — `scripts/validation/verify-repository-structure.js`

> **Schema da Bíblia:** 2
> **Índice:** 89
> **Fonte:** `scripts/validation/verify-repository-structure.js`
> **SHA auditado:** `1b7b48a8e2c088b02616741c91e9998b624df5ab`
> **Posições da fonte:** 414
> **Autoauditoria:** READY_FOR_AUDIT

## 1. Papel arquitetural

Este script é o gate estrutural geral do repositório. Ele valida layout canônico, ausência de caminhos legados, wiring Manifest/HTML/JS, centralização npm/Jest/Playwright e portabilidade dos testes. Para o corpus das 233 Bíblias, ele delega **o contrato estrutural/documental que pertence ao structure gate** a `scripts/validation/bible-coordination.js`; o protocolo distribuído de auditoria e seus leases v2 são um gate complementar separado.

A mudança principal deste recovery é deliberada: o script deixou de inferir lifecycle documental a partir de `STATUS.md`/`CHECKLIST.md`. Esses arquivos são projeções derivadas. A validação **estrutural/documental pertencente a este gate** agora entra pela chamada `validateBibleCoordination(...)`; o protocolo distribuído completo permanece separado.

## 2. Dependências, consumidores e wiring

- `fs` e `path` fazem leitura e traversal do working tree.
- `bible-coordination.js` valida, no escopo deste structure gate, states/lifecycle, reservas editoriais, claims legados em `.coordination/audit-claims`, vínculo source/Bíblia/cobertura e as projeções/resultados que carrega.
- `docs/biblia/.coordination/audit-protocol.js` é o validador complementar do protocolo distribuído atual: percorre `.coordination/audit-leases`, valida fase/expiração/`SOURCE_SHA`/`BIBLE_SHA`, independência entre auditores e a decisão PRIMARY → ADVERSARIAL → REAUDIT. `verify-repository-structure.js` **não** o invoca.
- `package.json → validate:structure` executa este arquivo.
- `.github/workflows/ci.yml` executa a cadeia de validação no Linux e em Windows Portability.
- `scripts/validation/verify-ci-contract.js` é consumer direto deste source: lê `verify-repository-structure.js` e exige os marcadores `legacyReferenceMarkers` e `referência operacional legada` como parte do contrato estático da CI.
- Manifest, páginas internas, `background.js`, configs Jest/Playwright, package/lock e testes são lidos como contratos estáticos.
- `docs/biblia/.coordination/verify-repository-structure-selftest.js` executa este verifier real contra uma árvore temporária e injeta regressões negativas; `.github/workflows/repository-structure-selftest.yml` executa esse self-test em CI quando o gate ou o próprio teste mudam.

## 3. Fluxos e contratos relevantes

1. Inicializa `root` e acumula em `problems` as violações tratadas explicitamente pelas regras do gate. Isso **não** significa fail-safe universal: leituras/parses síncronos sem `try/catch` (`readdirSync`, `readFileSync`, `JSON.parse`) podem lançar antes do epílogo.
2. Confirma presença de artefatos canônicos e forma de `docs/`.
3. Delega o contrato estrutural/documental das Bíblias pertencente a este gate ao validador especializado.
4. Rejeita caminhos/arquivos legados da reestruturação.
5. Confere wiring do Manifest e imports/requires canônicos do background.
6. Confere scripts das páginas popup/options/reader e layout da raiz `extension/`.
7. Escaneia referências operacionais legadas em código/configuração.
8. Impõe um único package/lock, uma config Jest e o conjunto permitido de configs Playwright.
9. Rejeita wrappers BAT/PS1 e dependências de `process.cwd()`/finders de raiz duplicados nos testes.
10. Confere entradas obrigatórias de `.gitignore`.
11. Se a execução alcançar o epílogo, imprime todos os itens acumulados em `problems` e sai 1; sem problemas imprime sucesso. Exceções não tratadas de I/O/parsing podem encerrar o processo antes dessa agregação final.

## 4. Invariantes

- `STATUS.md` e `CHECKLIST.md` nunca determinam ownership/lifecycle neste script.
- Dentro deste structure gate, inconsistências de **state/lifecycle, reservas editoriais, claims legados, SHA/fonte/cobertura e projeções derivadas** das 233 Bíblias são delegadas a `bible-coordination.js`/checker de projeções. Os **leases distribuídos v2** em `.coordination/audit-leases/` e seus bindings de fase/expiração/`BIBLE_SHA` são validados por `audit-protocol.js` no gate distribuído separado. Este verifier ainda valida diretamente contratos documentais de nível de repositório, como presença de `docs/Documentação.md`, `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md`, forma da raiz `docs/` e ausência de paths documentais legados.
- Os **arquivos diretamente na raiz** de `extension/` permanecem somente `background.js` e `manifest.json`; diretórios canônicos como `background/`, `content/`, `options/`, `popup/`, `reader/` e `shared/` são permitidos e exigidos por outros contratos.
- `package.json` e `package-lock.json` são únicos e canônicos na raiz.
- Config Jest canônica: somente `jest.config.js`.
- Configs Playwright permitidas: `playwright.config.js` e `scripts/ci/playwright-merge.config.js`.
- `playwright-merge.config.js` não pode adquirir semântica de execução como `testDir`, `workers` ou `projects`.
- Testes devem derivar paths de `__dirname`/helper de repo, não de `process.cwd()`.

## 5. Matriz de evidência

| Contrato | Evidência existente | Classificação | Limite |
|---|---|---|---|
| caminhos obrigatórios/legados | `requirePresent` tipado + `requireAbsent` + self-test de mutação | PROVA_DIRETA estrutural de existência/tipo/ausência | tipo e existência não provam conteúdo/semântica do arquivo |
| wiring Manifest/background/páginas | comparação literal/estrutural neste script | GATE_ESTATICO | strings corretas não provam fluxo completo em browser |
| coordenação estrutural das Bíblias | `validateBibleCoordination` + self-tests de coordenação | PROVA_DIRETA do contrato coberto pelo structure gate | não cobre `audit-leases/` v2; esse contrato pertence a `audit-protocol.js`/final readiness |
| detectores negativos do structure gate | `verify-repository-structure-selftest.js` executando o verifier real em sandbox + workflow dedicado | PROVA_DIRETA de regressão para presença/tipo/docs/legados/Manifest/layout/configs/CI/npm/paths/lifecycle | não substitui auditoria semântica de requisitos novos que ainda não tenham detector |
| portabilidade de paths dos testes | scan `process.cwd()`/finder duplicado + job Windows | GATE_ESTATICO + EXECUCAO_INDIRETA | Windows job prova o conjunto executado, não todo comportamento do SO |
| centralização package/Jest/Playwright | inventário do tree | PROVA_DIRETA estrutural | não substitui execução das ferramentas |

## 6. Lacunas e solicitações ao auditor

Esta Bíblia documenta o gate estrutural; ela não promove a presença de um marker a prova funcional do software.

### Pendências históricas fechadas nesta revisão

- **089-005 — RESOLVED:** `requirePresent()` agora valida tanto existência quanto tipo esperado (`arquivo`/`diretório`) para todos os paths obrigatórios. O self-test substitui `docs/biblia/STATUS.md` por diretório e `tests/setup` por arquivo e exige falha específica.
- **089-003 — RESOLVED:** existe self-test focal persistente em `docs/biblia/.coordination/verify-repository-structure-selftest.js`. Ele executa o verifier real contra uma árvore temporária e injeta regressões em presença, tipo, raiz de docs, paths legados, Manifest, background, páginas, raiz da extensão, scan de markers, wrappers, configs Jest/Playwright, merge config, workflow, Playwright raiz, scripts npm, portabilidade de testes, `.gitignore` e lifecycle das Bíblias.
- O self-test torna o gate testável sem hook no source: copia o repositório para um sandbox e executa `scripts/validation/verify-repository-structure.js` **da própria cópia**, preservando no gate de produção o root fixo derivado de `__dirname`.

Após esses reparos, não permanece lacuna conhecida da unidade #089 que possa ser corrigida localmente sem depender das auditorias distribuídas independentes exigidas pelo protocolo.

O auditor independente deve continuar tentando refutar especialmente:

- falsos positivos de regex/scan em caminhos legados;
- se a lista de arquivos proibidos continua alinhada à arquitetura real;
- se novos arquivos de infraestrutura documental necessários ao PR permanecem fora do corpus congelado sem quebrar a correspondência 233 states ↔ 233 Bíblias;
- a fronteira entre `bible-coordination.js` (contrato estrutural/documental deste gate) e `audit-protocol.js` (leases e decisão distribuída v2).

## 7. Fonte integral exata

```js
'use strict';

const fs = require('fs');
const path = require('path');

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

function requirePresent(relPath, expectedType) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    problems.push('arquivo/diretório obrigatório ausente: ' + relPath);
    return;
  }

  if (!expectedType) return;
  let stat;
  try {
    stat = fs.statSync(full);
  } catch (error) {
    problems.push('não foi possível inspecionar tipo de ' + relPath + ': ' + error.message);
    return;
  }

  const validType = expectedType === 'directory' ? stat.isDirectory() : stat.isFile();
  if (!validType) {
    problems.push(
      'tipo inválido para ' + relPath + ': esperado '
      + (expectedType === 'directory' ? 'diretório' : 'arquivo')
    );
  }
}

function requireAbsent(relPath) {
  if (exists(relPath)) problems.push('legado proibido ainda existe: ' + relPath);
}

const requiredDirectories = new Set([
  'extension/background',
  'tests/unit',
  'tests/integration',
  'tests/smoke',
  'tests/visual',
  'tests/e2e',
  'tests/fixtures',
  'tests/helpers',
  'tests/mocks',
  'tests/setup',
]);

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
]) requirePresent(required, requiredDirectories.has(required) ? 'directory' : 'file');

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


const { validateBibleCoordination } = require('./bible-coordination');
const bibleValidation = validateBibleCoordination(root, {
  checkDerived: false,
  headLabel: 'states-v2',
});
for (const problem of bibleValidation.problems) problems.push('Bíblia: ' + problem);

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

## 8. Cobertura documental por posições/faixas

### Posições 1–8 — bootstrap, imports, root fixo e accumulator

Inicializa strict mode/imports, deriva o root exclusivamente de `__dirname` e cria o vetor `problems`.

### Posições 9–26 — helpers de filesystem e paths

`exists`, `walk` e `rel` fornecem traversal portável e normalização de paths.

### Posições 27–55 — presença tipada e ausência

`requirePresent` falha para path ausente e também para tipo incorreto usando `fs.statSync`; `requireAbsent` rejeita legado ainda existente.

### Posições 56–110 — inventário obrigatório com contrato arquivo/diretório

`requiredDirectories` separa os diretórios obrigatórios; todos os demais entries são tratados como arquivos obrigatórios.

### Posições 111–124 — contrato da raiz `docs/`

Exige exatamente `Documentação.md` e `biblia/` na raiz de docs e rejeita `docs/Bíblia.md` legado.

### Posições 125–131 — delegação do contrato estrutural das Bíblias

Importa `validateBibleCoordination`, executa com `checkDerived: false` e agrega seus problemas. Este bloco não lê `audit-leases/`; o protocolo distribuído v2 é validado por `audit-protocol.js` fora deste verifier.

### Posições 132–176 — caminhos legados proibidos

Lista e rejeita layouts antigos de extension/tests/scripts/docs removidos na reestruturação.

### Posições 177–267 — contratos de runtime/layout da extensão

Valida Manifest, content scripts, imports/requires do background, carregamento shared/own scripts de popup/options/reader e forma dos arquivos diretamente na raiz `extension/`.

### Posições 268–321 — scan de referências operacionais legadas

Percorre arquivos textuais operacionais, exclui explicitamente os próprios validadores que precisam citar markers antigos e reporta referências proibidas.

### Posições 322–356 — centralização de package/lock/configs e merge Playwright

Exige package/lock únicos, proíbe BAT/PS1, limita configs Jest/Playwright e impede chaves de execução dentro do arquivo usado só para merge/report.

### Posições 357–385 — workflow, Playwright raiz e scripts npm

Rejeita working-directory/prefixos/caminhos antigos em CI, paths antigos no Playwright raiz e scripts npm que recriem o layout legado.

### Posições 386–397 — portabilidade dos testes

Enumera JavaScript sob `tests/` e reprova finder de raiz duplicado ou dependência de `process.cwd()`.

### Posições 398–404 — `.gitignore` obrigatório

Confirma as quatro entradas de caches/resultados/build esperadas.

### Posições 405–413 — resultado do gate

Se `problems` estiver preenchido, imprime todos os itens acumulados e termina com código 1; sem problemas, imprime sucesso. Exceções anteriores de I/O/parsing ainda podem encerrar o processo antes deste epílogo.

### Posição 414 — newline final

Posição vazia terminal do LF final.

## 9. Casos-limite, riscos, segurança e performance

- Traversal completo é O(n) no número de arquivos rastreados e adequado ao tamanho atual do repositório.
- Scans por substring podem gerar falso positivo se um marker legado aparecer em contexto não operacional; a lista de exclusões precisa ser mínima e explícita.
- O gate usa leitura local somente; não executa conteúdo dos arquivos analisados.
- O root do gate não é redirecionável por ambiente; o isolamento de sandbox pertence exclusivamente ao self-test, que executa a cópia do verifier.
- O caminho principal contém `readdirSync`, `readFileSync` e `JSON.parse` sem `try/catch`; arquivo ausente coberto por `requirePresent` é agregado, mas I/O/JSON malformado em leituras posteriores pode lançar imediatamente e não produzir a lista completa de `problems`.
- Alterar esta lista de contratos pode bloquear Windows e CI Contract simultaneamente; `verify-ci-contract.js`, self-tests e CI devem acompanhar toda mudança.

## 10. Autoauditoria documental

- [x] source SHA atualizado após remover o validador inline morto.
- [x] fonte integral copiada do blob atual.
- [x] 414/414 posições cobertas por faixas contíguas.
- [x] fronteira atual entre `bible-coordination.js` e `audit-protocol.js` explicitada sem atribuir exclusividade ao primeiro.
- [x] STATUS/CHECKLIST descritos como projeções, não fontes primárias.
- [x] consumer direto `verify-ci-contract.js` registrado no wiring.
- [x] semântica de agregação limitada às regras que chegam ao vetor `problems`; exceções síncronas não tratadas documentadas como fail-fast.
- [x] faixa 323–363 reconciliada com as posições reais do loop npm e do scan de testes.
- [x] `requirePresent()` agora distingue arquivo/diretório e possui regressões negativas focais.
- [x] self-test adversarial persistente executa o verifier real em sandbox e está ligado a workflow dedicado.
- [x] nenhum código funcional da extensão foi alterado para satisfazer esta Bíblia.

**Autoauditoria:** READY_FOR_AUDIT.
