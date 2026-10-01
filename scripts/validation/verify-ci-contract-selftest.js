'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const contractRel = 'scripts/validation/verify-ci-contract.js';
const matrixRel = 'scripts/ci/data/regression-matrix.json';

const staticFiles = [
  contractRel,
  '.github/workflows/ci.yml',
  'playwright.config.js',
  'jest.config.js',
  'scripts/validation/verify-coverage.js',
  'scripts/validation/verify-coverage-selftest.js',
  'scripts/validation/verify-repository-structure.js',
  'scripts/validation/verify-test-policy.js',
  'scripts/validation/verify-test-policy-selftest.js',
  'scripts/validation/verify-publish-contract.js',
  'scripts/ci/playwright-gate-reporter.js',
  'scripts/ci/data/e2e-shard-plan.json',
  'scripts/validation/verify-e2e-shard-plan.js',
  'scripts/ci/run-e2e-group.js',
  'scripts/ci/run-jest-ci.js',
  'scripts/maintenance/diagnose-jest-workers.js',
  'package.json',
  'scripts/ci/data/test-baseline.json',
  matrixRel,
];

function copyFileIntoSandbox(sandbox, relPath) {
  const src = path.join(root, relPath);
  const dest = path.join(sandbox, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function createSandbox() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-ci-contract-'));
  const matrix = JSON.parse(fs.readFileSync(path.join(root, matrixRel), 'utf8'));
  const regressionFiles = (matrix.regressions || [])
    .map((entry) => entry && entry.file)
    .filter(Boolean);
  for (const relPath of new Set([...staticFiles, ...regressionFiles])) {
    copyFileIntoSandbox(sandbox, relPath);
  }
  return sandbox;
}

function replaceRequired(filePath, before, after) {
  const source = fs.readFileSync(filePath, 'utf8');
  // O checkout do GitHub Actions pode materializar CRLF no Windows.
  // O sandbox é descartável, então normalizamos para LF antes das mutações
  // para testar o contrato, não a política local de line endings.
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.includes(before)) {
    throw new Error('Self-test não encontrou marcador a remover em ' + filePath + ': ' + before);
  }
  fs.writeFileSync(filePath, normalized.replace(before, after), 'utf8');
}

function expectContractFailure(name, mutate, expectedMessage) {
  const sandbox = createSandbox();
  try {
    mutate(sandbox);
    const result = spawnSync(process.execPath, [path.join(sandbox, contractRel)], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });
    const output = String(result.stdout || '') + String(result.stderr || '');
    if (result.status === 0) {
      throw new Error(name + ': contrato aceitou uma configuração propositalmente enfraquecida');
    }
    if (!output.includes(expectedMessage)) {
      throw new Error(
        name + ': contrato falhou, mas não pelo motivo esperado. Esperado: ' +
        expectedMessage + '\nSaída:\n' + output
      );
    }
    console.log('✅ ' + name + ': rejeitado como esperado');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

expectContractFailure(
  'job obrigatório removido',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(workflowPath, '\n  visual:\n', '\n  visual-disabled-for-selftest:\n');
  },
  'job obrigatório ausente: visual'
);

expectContractFailure(
  'forbidOnly enfraquecido',
  (sandbox) => {
    const configPath = path.join(sandbox, 'playwright.config.js');
    replaceRequired(configPath, 'forbidOnly: isCi', 'forbidOnly: false');
  },
  'Playwright precisa proibir test.only em CI'
);

expectContractFailure(
  'marcador da matriz de regressão removido',
  (sandbox) => {
    const matrix = JSON.parse(fs.readFileSync(path.join(sandbox, matrixRel), 'utf8'));
    const entry = (matrix.regressions || []).find(
      (item) => item && item.file && Array.isArray(item.markers) && item.markers.length
    );
    if (!entry) throw new Error('Matriz de regressão não contém entrada testável');
    const target = path.join(sandbox, entry.file);
    replaceRequired(target, entry.markers[0], '__MARKER_REMOVED_FOR_CI_CONTRACT_SELFTEST__');
  },
  'marcador obrigatório ausente'
);

console.log('✅ CI Contract self-test aprovado: o gate rejeita job ausente, forbidOnly enfraquecido e marcador de regressão removido.');
