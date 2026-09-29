'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const verifierRel = 'scripts/validation/verify-test-policy.js';

function createSandbox() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-test-policy-'));
  const verifierDest = path.join(sandbox, verifierRel);
  fs.mkdirSync(path.dirname(verifierDest), { recursive: true });
  fs.copyFileSync(path.join(root, verifierRel), verifierDest);
  fs.mkdirSync(path.join(sandbox, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts', 'ci'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts', 'maintenance'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'extension'), { recursive: true });
  fs.writeFileSync(
    path.join(sandbox, 'tests', 'sample.test.js'),
    "test('ok', () => { expect(true).toBe(true); });\n",
    'utf8'
  );
  fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    JSON.stringify({ scripts: { test: 'jest' } }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(sandbox, '.github', 'workflows', 'ci.yml'),
    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test\n",
    'utf8'
  );
  return sandbox;
}

function runVerifier(sandbox) {
  return spawnSync(process.execPath, [path.join(sandbox, verifierRel)], {
    cwd: sandbox,
    encoding: 'utf8',
  });
}

function expectBaselinePasses() {
  const sandbox = createSandbox();
  try {
    const result = runVerifier(sandbox);
    if (result.status !== 0) {
      throw new Error('baseline válida foi rejeitada:\n' + String(result.stdout || '') + String(result.stderr || ''));
    }
    console.log('✅ política baseline válida: aceita');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

function expectFailure(name, mutate, expected) {
  const sandbox = createSandbox();
  try {
    mutate(sandbox);
    const result = runVerifier(sandbox);
    const output = String(result.stdout || '') + String(result.stderr || '');
    if (result.status === 0) {
      throw new Error(name + ': política aceitou uma configuração proibida');
    }
    if (!output.includes(expected)) {
      throw new Error(name + ': falhou pelo motivo errado. Esperado: ' + expected + '\nSaída:\n' + output);
    }
    console.log('✅ ' + name + ': rejeitado como esperado');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

expectBaselinePasses();

expectFailure(
  'test.skip',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, 'tests', 'sample.test.js'),
    "test.skip('não pode', () => {});\n",
    'utf8'
  ),
  'uso proibido de .skip'
);

expectFailure(
  '--forceExit em script npm',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, 'package.json'),
    JSON.stringify({ scripts: { test: 'jest --forceExit' } }, null, 2) + '\n',
    'utf8'
  ),
  'escape hatch proibido: --forceExit'
);

expectFailure(
  'teste mascarado com || true',
  (sandbox) => fs.writeFileSync(
    path.join(sandbox, '.github', 'workflows', 'ci.yml'),
    "name: test\njobs:\n  test:\n    steps:\n      - run: npm run test:ci || true\n",
    'utf8'
  ),
  'comando de teste mascarado com || true'
);

console.log('✅ Test Policy self-test aprovado.');
