'use strict';

const fs = require('fs');
const path = require('path');

const root = process.env.MANGA_TRANSLATOR_REPO_ROOT
  ? path.resolve(process.env.MANGA_TRANSLATOR_REPO_ROOT)
  : path.resolve(__dirname, '../..');
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
