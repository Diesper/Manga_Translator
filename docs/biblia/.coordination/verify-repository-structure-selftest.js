'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
function run(root) {
  const verifier = path.join(root, 'scripts', 'validation', 'verify-repository-structure.js');
  return childProcess.spawnSync(process.execPath, [verifier], {
    cwd: root,
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 30000,
  });
}

function output(result) {
  const processOutput = String(result.stdout || '') + '\n' + String(result.stderr || '');
  return result.error ? processOutput + '\nPROCESS_ERROR: ' + result.error.message : processOutput;
}

function assertCompleted(name, result) {
  if (result.error) {
    throw new Error(name + ': verifier não concluiu normalmente\n' + output(result));
  }
}

function assertIntroduces(name, baselineResult, mutatedResult, marker) {
  assertCompleted(name + ' baseline', baselineResult);
  assertCompleted(name + ' mutação', mutatedResult);
  const baseline = output(baselineResult);
  const mutated = output(mutatedResult);
  if (baseline.includes(marker)) {
    throw new Error(name + ': baseline já contém marcador=' + marker + '\n' + baseline);
  }
  if (mutatedResult.status === 0) {
    throw new Error(name + ': mutação deveria falhar, mas terminou com exit code 0\n' + mutated);
  }
  if (!mutated.includes(marker)) {
    throw new Error(name + ': mutação não introduziu marcador=' + marker + '\n' + mutated);
  }
}

function assertRestored(name, baselineResult, restoredResult) {
  assertCompleted(name + ' baseline', baselineResult);
  assertCompleted(name + ' restaurado', restoredResult);
  if (baselineResult.status !== restoredResult.status || output(baselineResult) !== output(restoredResult)) {
    throw new Error(
      name + ': fixture não retornou ao baseline\nBASELINE:\n'
      + output(baselineResult) + '\nRESTAURADO:\n' + output(restoredResult)
    );
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

function mutateFile(fixture, baselineResult, relative, mutate, expectedMarker) {
  const file = path.join(fixture, relative);
  const original = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, mutate(original), 'utf8');
    assertIntroduces(relative, baselineResult, run(fixture), expectedMarker);
  } finally {
    fs.writeFileSync(file, original, 'utf8');
  }
}

function addFile(fixture, baselineResult, relative, content, expectedMarker) {
  const file = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, content, 'utf8');
    assertIntroduces(relative, baselineResult, run(fixture), expectedMarker);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function removeFile(fixture, baselineResult, relative, expectedMarker) {
  const file = path.join(fixture, relative);
  const original = fs.readFileSync(file);
  try {
    fs.rmSync(file, { force: true });
    assertIntroduces(relative, baselineResult, run(fixture), expectedMarker);
  } finally {
    fs.writeFileSync(file, original);
  }
}

function replaceFileWithDirectory(fixture, baselineResult, relative, expectedMarker) {
  const target = path.join(fixture, relative);
  const original = fs.readFileSync(target);
  try {
    fs.rmSync(target, { force: true });
    fs.mkdirSync(target, { recursive: true });
    assertIntroduces(relative, baselineResult, run(fixture), expectedMarker);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(target, original);
  }
}

function replaceDirectoryWithFile(fixture, baselineResult, relative, expectedMarker) {
  const target = path.join(fixture, relative);
  const backup = path.join(os.tmpdir(), 'mt-structure-selftest-backup-' + process.pid + '-' + Date.now());
  fs.cpSync(target, backup, { recursive: true });
  try {
    fs.rmSync(target, { recursive: true, force: true });
    fs.writeFileSync(target, 'not-a-directory\n', 'utf8');
    assertIntroduces(relative, baselineResult, run(fixture), expectedMarker);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(backup, target, { recursive: true });
    fs.rmSync(backup, { recursive: true, force: true });
  }
}

function main() {
  const checkoutBaseline = run(repoRoot);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-structure-selftest-'));
  const fixture = path.join(tempRoot, 'repo');
  try {
    copyRepository(fixture);
    const fixtureBaseline = run(fixture);
    assertCompleted('checkout atual', checkoutBaseline);
    assertCompleted('fixture baseline', fixtureBaseline);

    removeFile(
      fixture,
      fixtureBaseline,
      'docs/Documentação.md',
      'arquivo/diretório obrigatório ausente: docs/Documentação.md'
    );

    replaceFileWithDirectory(
      fixture,
      fixtureBaseline,
      'docs/biblia/STATUS.md',
      'tipo inválido para docs/biblia/STATUS.md: esperado arquivo'
    );

    replaceDirectoryWithFile(
      fixture,
      fixtureBaseline,
      'tests/setup',
      'tipo inválido para tests/setup: esperado diretório'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'docs/extra.md',
      'unexpected\n',
      'docs/ deve conter somente Documentação.md e o diretório biblia/'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'tests/package.json',
      '{}\n',
      'legado proibido ainda existe: tests/package.json'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
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
      fixtureBaseline,
      'extension/background.js',
      (source) => source + "\nimportScripts('gtc-fingerprint.js');\n",
      "background.js ainda contém referência plana antiga: importScripts('gtc-fingerprint.js')"
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      'extension/popup/popup.html',
      (source) => source.replace('../shared/shared-ui.js', '../shared/MISSING.js'),
      'extension/popup/popup.html precisa carregar ../shared/shared-ui.js'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'extension/rogue.js',
      '/* rogue */\n',
      'a raiz de extension/ deve conter somente background.js e manifest.json'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      'tests/helpers/repo-root.js',
      (source) => source + '\n// tests/ci/ legacy marker\n',
      'referência operacional legada em tests/helpers/repo-root.js: tests/ci/'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'debug.ps1',
      'Write-Host bad\n',
      'wrappers BAT/PS1 proibidos:'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'jest.extra.config.js',
      'module.exports = {};\n',
      'Jest precisa ter exatamente uma config canônica:'
    );

    addFile(
      fixture,
      fixtureBaseline,
      'playwright.extra.config.js',
      'module.exports = {};\n',
      'configs Playwright inesperadas:'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      'scripts/ci/playwright-merge.config.js',
      (source) => source + '\n// testDir forbidden in merge config\n',
      'playwright-merge.config.js deve conter apenas configuração de merge/reporter; chave proibida: testDir'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      '.github/workflows/ci.yml',
      (source) => source + '\n# working-directory: tests\n',
      'ci.yml contém referência operacional legada: working-directory: tests'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      'playwright.config.js',
      (source) => source + "\n// outputDir: './tests/test-results'\n",
      "playwright.config.js contém caminho legado: outputDir: './tests/test-results'"
    );

    mutateFile(
      fixture,
      fixtureBaseline,
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
      fixtureBaseline,
      'tests/unit/background/regex-escape.test.js',
      (source) => source + '\nvoid process.cwd();\n',
      'dependência de process.cwd() em tests/unit/background/regex-escape.test.js'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      '.gitignore',
      (source) => source.split(/\r?\n/).filter((line) => line !== 'dist/').join('\n') + '\n',
      '.gitignore não contém entrada obrigatória: dist/'
    );

    mutateFile(
      fixture,
      fixtureBaseline,
      'docs/biblia/.state/001.json',
      (source) => {
        const state = JSON.parse(source);
        state.status = 'IMPOSSIBLE_STATUS';
        return JSON.stringify(state, null, 2) + '\n';
      },
      'Bíblia: docs/biblia/.state/001.json: lifecycle inválido=IMPOSSIBLE_STATUS'
    );

    assertRestored('fixture restaurada', fixtureBaseline, run(fixture));
    if (checkoutBaseline.status !== 0) {
      console.log('verify-repository-structure selftest: baseline do PR possui pendências externas; deltas focais validados.');
    }
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
