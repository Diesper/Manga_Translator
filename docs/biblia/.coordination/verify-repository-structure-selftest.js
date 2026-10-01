'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const verifier = path.join(repoRoot, 'scripts', 'validation', 'verify-repository-structure.js');

function run(root) {
  return childProcess.spawnSync(process.execPath, [verifier], {
    cwd: root,
    env: { ...process.env, MANGA_TRANSLATOR_REPO_ROOT: root },
    encoding: 'utf8',
  });
}

function output(result) {
  return String(result.stdout || '') + '\n' + String(result.stderr || '');
}

function assertRun(name, result, shouldPass, marker) {
  const passed = result.status === 0;
  if (passed !== shouldPass) {
    throw new Error(
      name + ': status inesperado=' + result.status + '\n' + output(result)
    );
  }
  if (marker && !output(result).includes(marker)) {
    throw new Error(name + ': marcador ausente=' + marker + '\n' + output(result));
  }
}

function copyRepository(target) {
  fs.cpSync(repoRoot, target, {
    recursive: true,
    filter(source) {
      const relative = path.relative(repoRoot, source).replace(/\\/g, '/');
      if (!relative) return true;
      return !(
        relative === '.git'
        || relative.startsWith('.git/')
        || relative === 'node_modules'
        || relative.startsWith('node_modules/')
        || relative === 'coverage'
        || relative.startsWith('coverage/')
        || relative === 'playwright-report'
        || relative.startsWith('playwright-report/')
        || relative === 'test-results'
        || relative.startsWith('test-results/')
      );
    },
  });
}

function mutateFile(fixture, relative, mutate, expectedMarker) {
  const file = path.join(fixture, relative);
  const original = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, mutate(original), 'utf8');
    assertRun(relative, run(fixture), false, expectedMarker);
  } finally {
    fs.writeFileSync(file, original, 'utf8');
  }
}

function addFile(fixture, relative, content, expectedMarker) {
  const file = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, content, 'utf8');
    assertRun(relative, run(fixture), false, expectedMarker);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function removeFile(fixture, relative, expectedMarker) {
  const file = path.join(fixture, relative);
  const original = fs.readFileSync(file);
  try {
    fs.rmSync(file, { force: true });
    assertRun(relative, run(fixture), false, expectedMarker);
  } finally {
    fs.writeFileSync(file, original);
  }
}

function replaceFileWithDirectory(fixture, relative, expectedMarker) {
  const target = path.join(fixture, relative);
  const original = fs.readFileSync(target);
  try {
    fs.rmSync(target, { force: true });
    fs.mkdirSync(target, { recursive: true });
    assertRun(relative, run(fixture), false, expectedMarker);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(target, original);
  }
}

function replaceDirectoryWithFile(fixture, relative, expectedMarker) {
  const target = path.join(fixture, relative);
  const backup = path.join(os.tmpdir(), 'mt-structure-selftest-backup-' + process.pid + '-' + Date.now());
  fs.cpSync(target, backup, { recursive: true });
  try {
    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(target, 'not-a-directory\n', 'utf8');
    assertRun(relative, run(fixture), false, expectedMarker);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(backup, target, { recursive: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
}

function main() {
  assertRun('checkout atual', run(repoRoot), true);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-structure-selftest-'));
  const fixture = path.join(tempRoot, 'repo');
  try {
    copyRepository(fixture);
    assertRun('fixture baseline', run(fixture), true);

    removeFile(
      fixture,
      'docs/Documentação.md',
      'arquivo/diretório obrigatório ausente: docs/Documentação.md'
    );

    replaceFileWithDirectory(
      fixture,
      'docs/biblia/STATUS.md',
      'tipo inválido para docs/biblia/STATUS.md: esperado arquivo'
    );

    replaceDirectoryWithFile(
      fixture,
      'tests/setup',
      'tipo inválido para tests/setup: esperado diretório'
    );

    addFile(
      fixture,
      'docs/extra.md',
      'unexpected\n',
      'docs/ deve conter somente Documentação.md e o diretório biblia/'
    );

    addFile(
      fixture,
      'tests/package.json',
      '{}\n',
      'legado proibido ainda existe: tests/package.json'
    );

    mutateFile(
      fixture,
      'extension/manifest.json',
      (source) => {
        const manifest = JSON.parse(source);
        manifest.action.default_popup = 'popup/WRONG.html';
        return JSON.stringify(manifest, null, 2) + '\n';
      },
      'manifest action.default_popup precisa apontar para popup/popup.html'
    );

    mutateFile(
      fixture,
      'extension/background.js',
      (source) => source + "\nimportScripts('gtc-fingerprint.js');\n",
      "background.js ainda contém referência plana antiga: importScripts('gtc-fingerprint.js')"
    );

    mutateFile(
      fixture,
      'extension/popup/popup.html',
      (source) => source.replace('../shared/shared-ui.js', '../shared/MISSING.js'),
      'extension/popup/popup.html precisa carregar ../shared/shared-ui.js'
    );

    addFile(
      fixture,
      'extension/rogue.js',
      '/* rogue */\n',
      'a raiz de extension/ deve conter somente background.js e manifest.json'
    );

    mutateFile(
      fixture,
      'tests/helpers/repo-root.js',
      (source) => source + '\n// tests/ci/ legacy marker\n',
      'referência operacional legada em tests/helpers/repo-root.js: tests/ci/'
    );

    addFile(
      fixture,
      'debug.ps1',
      'Write-Host bad\n',
      'wrappers BAT/PS1 proibidos:'
    );

    addFile(
      fixture,
      'jest.extra.config.js',
      'module.exports = {};\n',
      'Jest precisa ter exatamente uma config canônica:'
    );

    addFile(
      fixture,
      'playwright.extra.config.js',
      'module.exports = {};\n',
      'configs Playwright inesperadas:'
    );

    mutateFile(
      fixture,
      'scripts/ci/playwright-merge.config.js',
      (source) => source + '\n// testDir forbidden in merge config\n',
      'playwright-merge.config.js deve conter apenas configuração de merge/reporter; chave proibida: testDir'
    );

    mutateFile(
      fixture,
      '.github/workflows/ci.yml',
      (source) => source + '\n# working-directory: tests\n',
      'ci.yml contém referência operacional legada: working-directory: tests'
    );

    mutateFile(
      fixture,
      'playwright.config.js',
      (source) => source + "\n// outputDir: './tests/test-results'\n",
      "playwright.config.js contém caminho legado: outputDir: './tests/test-results'"
    );

    mutateFile(
      fixture,
      'package.json',
      (source) => {
        const pkg = JSON.parse(source);
        pkg.scripts = { ...(pkg.scripts || {}), '__legacy_selftest': 'cd tests' };
        return JSON.stringify(pkg, null, 2) + '\n';
      },
      'script npm __legacy_selftest contém legado: cd tests'
    );

    mutateFile(
      fixture,
      'tests/unit/background/regex-escape.test.js',
      (source) => source + '\nvoid process.cwd();\n',
      'dependência de process.cwd() em tests/unit/background/regex-escape.test.js'
    );

    mutateFile(
      fixture,
      '.gitignore',
      (source) => source.split(/\r?\n/).filter((line) => line !== 'dist/').join('\n') + '\n',
      '.gitignore não contém entrada obrigatória: dist/'
    );

    mutateFile(
      fixture,
      'docs/biblia/.state/001.json',
      (source) => {
        const state = JSON.parse(source);
        state.status = 'IMPOSSIBLE_STATUS';
        return JSON.stringify(state, null, 2) + '\n';
      },
      'Bíblia: docs/biblia/.state/001.json: lifecycle inválido=IMPOSSIBLE_STATUS'
    );

    assertRun('fixture restaurada', run(fixture), true);
    console.log('verify-repository-structure selftest: OK');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('verify-repository-structure selftest: FAIL — ' + error.message);
    process.exit(1);
  }
}

module.exports = { run, output };
