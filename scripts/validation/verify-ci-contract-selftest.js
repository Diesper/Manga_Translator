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

expectContractFailure(
  'comando obrigatório presente somente em comentário YAML',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '        run: npm run validate:test-policy',
      '        # run: npm run validate:test-policy'
    );
  },
  'CI Contract precisa executar a política anti-skip/escape-hatch'
);

expectContractFailure(
  'self-test do contrato presente somente em comentário YAML',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '        run: npm run test:ci-contract:infra',
      '        # run: npm run test:ci-contract:infra'
    );
  },
  'CI Contract precisa executar o self-test negativo do próprio contrato'
);

expectContractFailure(
  'coverage bloqueante convertido em comentário',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '      - name: Gerar coverage com Jest/V8\n        run: npm run test:coverage',
      '      - name: Gerar coverage com Jest/V8\n        # run: npm run test:coverage'
    );
  },
  'coverage: deve executar test:coverage de forma bloqueante'
);

expectContractFailure(
  'Windows perde verificação de coverage',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '      - name: Verificar coverage e normalização de paths\n        run: npm run test:coverage:verify',
      '      - name: Verificar coverage e normalização de paths\n        # run: npm run test:coverage:verify'
    );
  },
  'windows-portability não cobre contrato obrigatório: npm run test:coverage:verify'
);

expectContractFailure(
  'Bible Final Readiness convertido em comentário',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '        run: npm run bible:final-readiness',
      '        # run: npm run bible:final-readiness'
    );
  },
  'bible-final-readiness: marcador obrigatório ausente: npm run bible:final-readiness'
);

expectContractFailure(
  'concurrency passa a cancelar execução da main',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '  cancel-in-progress: false',
      '  cancel-in-progress: true'
    );
  },
  'concurrency: execuções da main não podem ser canceladas por um merge posterior'
);

expectContractFailure(
  'dependência obrigatória removida do CI Gate',
  (sandbox) => {
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
    replaceRequired(
      workflowPath,
      '      - coverage\n      - e2e-shard',
      '      - coverage-disabled-for-selftest\n      - e2e-shard'
    );
  },
  'ci-gate: dependência obrigatória ausente: coverage'
);

console.log(
  '✅ CI Contract self-test aprovado: o gate rejeita mutações de jobs, comandos executáveis, ' +
  'coverage/Windows, Bible readiness, concurrency, dependências do gate, forbidOnly e matriz de regressão.'
);
