'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const contractRel = 'scripts/validation/verify-ci-contract.js';
const matrixRel = 'scripts/ci/data/regression-matrix.json';
const coveragePlan = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/data/coverage-shard-plan.json'), 'utf8'));
const coverageMatrixText = 'shard: [' + Array.from({ length: coveragePlan.shardCount }, (_, index) => index + 1).join(', ') + ']';

const staticFiles = [
  contractRel,
  'scripts/validation/bible-ci-sharding-contract.js',
  'scripts/ci/data/bible-ci-sharding-baseline.json',
  'scripts/ci/data/workflow-shard-metrics.json',
  'scripts/ci/data/coverage-shard-plan.json',
  '.github/workflows/ci.yml',
  '.github/workflows/bible-protocol-infra.yml',
  '.github/workflows/pr66-structure-review.yml',
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
  'scripts/ci/fetch-github-job-timings.js',
  'scripts/ci/verify-shard-job-metrics.js',
  'scripts/validation/verify-shard-job-metrics-selftest.js',
  'scripts/ci/verify-required-job-results.js',
  'scripts/validation/verify-required-job-results-selftest.js',
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

function replaceInsideJob(sandbox, jobId, before, after, workflowRel = '.github/workflows/ci.yml') {
  const workflowPath = path.join(sandbox, workflowRel);
  const source = fs.readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === '  ' + jobId + ':');
  if (start < 0) throw new Error('Self-test não encontrou job: ' + jobId);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start, end).join('\n');
  if (!block.includes(before)) throw new Error('Self-test não encontrou marcador no job ' + jobId + ': ' + before);
  const changed = block.replace(before, after);
  fs.writeFileSync(workflowPath, [...lines.slice(0, start), changed, ...lines.slice(end)].join('\n'), 'utf8');
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
  'shell global pode mascarar todos os comandos do workflow',
  (sandbox) => replaceRequired(
    path.join(sandbox, '.github/workflows/ci.yml'),
    'jobs:\n',
    'defaults:\n  run:\n    shell: bash -c "exit 0" {0}\njobs:\n'
  ),
  'ci.yml: shell/env globais são proibidos porque podem mascarar todos os comandos bloqueantes'
);

expectContractFailure(
  'NODE_OPTIONS global pode pré-carregar bypass no workflow',
  (sandbox) => replaceRequired(
    path.join(sandbox, '.github/workflows/ci.yml'),
    'jobs:\n',
    'env:\n  NODE_OPTIONS: --require ./scripts/ci/bypass.js\njobs:\n'
  ),
  'ci.yml: shell/env globais são proibidos porque podem mascarar todos os comandos bloqueantes'
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
  'coverage perde um shard obrigatório',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage-shard',
    coverageMatrixText,
    'shard: [' + Array.from({ length: coveragePlan.shardCount - 1 }, (_, index) => index + 1).join(', ') + ']'
  ),
  'coverage-shard: matriz deve corresponder exatamente ao plano de shards'
);

expectContractFailure(
  'matriz coverage sai de sincronia com o manifesto',
  (sandbox) => replaceRequired(
    path.join(sandbox, 'scripts/ci/data/coverage-shard-plan.json'),
    '"shardCount": ' + coveragePlan.shardCount,
    '"shardCount": ' + (coveragePlan.shardCount + 1)
  ),
  'coverage-shard: matriz deve corresponder exatamente ao plano de shards'
);

expectContractFailure(
  'coverage shard matrix pode excluir um shard ou OS',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage-shard',
    coverageMatrixText,
    coverageMatrixText + '\n        exclude: []'
  ),
  'coverage-shard: matriz deve conter exatamente os shards do manifesto, sem exclusões e sem fail-fast'
);

expectContractFailure(
  'coverage shard tem matriz de exclusão',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage-shard',
    coverageMatrixText,
    coverageMatrixText + '\n        exclude: []'
  ),
  'coverage-shard: matriz deve conter exatamente os shards do manifesto, sem exclusões e sem fail-fast'
);

expectContractFailure(
  'coverage shard exclui Windows',
  (sandbox) => replaceInsideJob(sandbox, 'coverage-shard',
    'os: [ubuntu-latest, windows-latest]', 'os: [ubuntu-latest]'),
  'coverage-shard: cobertura integral deve executar em Linux e Windows'
);

expectContractFailure(
  'merge coverage exclui Windows',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    'os: [ubuntu-latest, windows-latest]', 'os: [ubuntu-latest]'),
  'coverage: merge e verificação integral devem ocorrer nos dois sistemas operacionais'
);

expectContractFailure(
  'execução do shard fica condicional',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage-shard',
    '      - name: Executar shard integral de coverage\n        timeout-minutes: 2\n        run:',
    '      - name: Executar shard integral de coverage\n        timeout-minutes: 2\n        if: false\n        run:'
  ),
  'coverage-shard: comando executável único deve rodar incondicionalmente e falhar fechado'
);

expectContractFailure(
  'merge coverage substituído por echo',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage',
    'run: npm run test:coverage:merge -- --input=coverage-shards',
    'run: echo npm run test:coverage:merge -- --input=coverage-shards'
  ),
  'coverage: infra, métricas reais, merge e verifier completos devem ser incondicionais, ordenados e bloqueantes'
);

expectContractFailure(
  'verifier coverage substituído por echo',
  (sandbox) => replaceInsideJob(
    sandbox,
    'coverage',
    'run: npm run test:coverage:verify',
    'run: echo npm run test:coverage:verify'
  ),
  'coverage: infra, métricas reais, merge e verifier completos devem ser incondicionais, ordenados e bloqueantes'
);
expectContractFailure(
  'coverage perde leitura da Actions API',
  (sandbox) => replaceInsideJob(sandbox, 'coverage', '      actions: read', '      actions: write'),
  'coverage: agregador obrigatório deve aguardar shards e verificar ambos os sistemas sem exclusões'
);
expectContractFailure(
  'coverage captura timings sem token confiável',
  (sandbox) => replaceInsideJob(sandbox, 'coverage', '          GITHUB_TOKEN: ${{ github.token }}', '          GITHUB_TOKEN: ${{ secrets.CODECOV_TOKEN }}'),
  'coverage: captura de tempos precisa ser incondicional, falhar fechado e vincular github.token/HEAD'
);
expectContractFailure(
  'coverage perde o HEAD real do PR',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    "          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n", ''),
  'coverage: captura de tempos precisa ser incondicional, falhar fechado e vincular github.token/HEAD'
);
expectContractFailure(
  'coverage métricas não recebe HEAD real do PR',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n        run: npm run ci:verify-shard-job-metrics',
    '        run: npm run ci:verify-shard-job-metrics'),
  'coverage: gate de métricas medidos precisa ser incondicional e sem overrides'
);
expectContractFailure(
  'coverage gate de wall-clock substituído por echo',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    'run: npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
    'run: echo npm run ci:verify-shard-job-metrics -- --kind=coverage --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards'),
  'coverage: gate de métricas medidos precisa ser incondicional e sem overrides'
);
expectContractFailure(
  'E2E perde leitura da Actions API',
  (sandbox) => replaceInsideJob(sandbox, 'e2e', '      actions: read', '      actions: write'),
  'e2e: coletor de wall-clock exige somente actions:read e contents:read'
);
expectContractFailure(
  'E2E perde o HEAD real do PR',
  (sandbox) => replaceInsideJob(sandbox, 'e2e',
    "          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n", ''),
  'e2e: captura de tempos precisa ser incondicional, falhar fechado e vincular github.token/HEAD'
);
expectContractFailure(
  'E2E merger métricas não recebem HEAD real do PR',
  (sandbox) => replaceInsideJob(sandbox, 'e2e',
    '          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}\n        run: npm run ci:verify-shard-job-metrics',
    '        run: npm run ci:verify-shard-job-metrics'),
  'e2e: telemetria, merge de resultados e gate de métricas reais devem estar ordenados e bloqueantes'
);
expectContractFailure(
  'E2E wall-clock gate substituído por echo',
  (sandbox) => replaceInsideJob(sandbox, 'e2e',
    'run: npm run ci:verify-shard-job-metrics -- --kind=e2e --timings=.ci-results/github-job-timings.json --work=.ci-results/e2e-shard-work.json',
    'run: echo npm run ci:verify-shard-job-metrics -- --kind=e2e --timings=.ci-results/github-job-timings.json --work=.ci-results/e2e-shard-work.json'),
  'e2e: telemetria, merge de resultados e gate de métricas reais devem estar ordenados e bloqueantes'
);

expectContractFailure(
  'reporter aceita run interrompido quando testes passaram',
  (sandbox) => replaceRequired(path.join(sandbox, 'scripts/ci/playwright-gate-reporter.js'),
    "result.status !== 'passed'", "result.status === 'passed'"),
  'playwright reporter precisa rejeitar runs interrompidos e medir intervalos úteis/inventário por grupo'
);

for (const [name, before, after] of [
  ['E2E herda shell que ignora scripts', '    name: E2E Tests (Playwright)',
    '    name: E2E Tests (Playwright)\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}'],
  ['E2E job fica desabilitado', '    if: ${{ always() && !cancelled() }}', '    if: false'],
  ['E2E job tolera falha', '    name: E2E Tests (Playwright)',
    '    name: E2E Tests (Playwright)\n    continue-on-error: true'],
]) expectContractFailure(name, sandbox => replaceInsideJob(sandbox, 'e2e', before, after),
  'e2e: agregador deve executar incondicionalmente após os shards sem overrides de job');
for (const [name, override] of [['merge skipped', 'if: false'], ['merge tolerates failure', 'continue-on-error: true'],
  ['merge bypass shell', 'shell: bash -c "exit 0" {0}']]) {
  expectContractFailure('E2E ' + name, sandbox => replaceInsideJob(sandbox, 'e2e',
    '      - name: Mesclar shards e aplicar gate global E2E\n',
    '      - name: Mesclar shards e aplicar gate global E2E\n        ' + override + '\n'),
  'e2e: telemetria, merge de resultados e gate de métricas reais devem estar ordenados e bloqueantes');
}

expectContractFailure(
  'reporter deixa de medir o intervalo útil sem dupla contagem',
  (sandbox) => replaceRequired(path.join(sandbox, 'scripts/ci/playwright-gate-reporter.js'),
    'unionIntervalDuration', 'sumAttemptDurations'),
  'playwright reporter precisa rejeitar runs interrompidos e medir intervalos úteis/inventário por grupo'
);
expectContractFailure(
  'CI omite self-test de wall-clock por shard',
  (sandbox) => replaceInsideJob(sandbox, 'ci-contract',
    'run: npm run test:shard-job-metrics:infra', 'run: echo npm run test:shard-job-metrics:infra'),
  'CI Contract precisa executar o self-test de wall-clock como passo bloqueante e incondicional'
);

expectContractFailure(
  'structure coverage não coleta tempos reais',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    'run: npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json',
    'run: echo npm run ci:capture-job-timings -- --output=.ci-results/github-job-timings.json',
    '.github/workflows/pr66-structure-review.yml'),
  'pr66-structure-review coverage: medição Actions API, merge, métrica real e threshold devem estar ordenados e bloqueantes'
);
expectContractFailure(
  'structure coverage permite wall-clock fora do limite',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    'run: npm run ci:verify-shard-job-metrics -- --kind=coverage --job-prefix="Structure coverage shard" --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
    'run: echo npm run ci:verify-shard-job-metrics -- --kind=coverage --job-prefix="Structure coverage shard" --os=${{ matrix.os }} --timings=.ci-results/github-job-timings.json --input=coverage-shards',
    '.github/workflows/pr66-structure-review.yml'),
  'pr66-structure-review coverage: medição Actions API, merge, métrica real e threshold devem estar ordenados e bloqueantes'
);
expectContractFailure(
  'protocol shards sem medição real',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    'run: npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=protocol --timings=.ci-results/github-job-timings.json',
    'run: echo npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=protocol --timings=.ci-results/github-job-timings.json',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);
expectContractFailure(
  'structure governance shards sem medição real',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    'run: npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=structure --timings=.ci-results/github-job-timings.json',
    'run: echo npm run ci:verify-shard-job-metrics -- --kind=workflow --profile=structure --timings=.ci-results/github-job-timings.json',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);
expectContractFailure(
  'protocol shard remove teto de dois minutos',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra', '    timeout-minutes: 2\n', '' ,
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: manifest de métricas deve corresponder exatamente aos shards do workflow'
);
expectContractFailure(
  'structure governance remove teto de dois minutos',
  (sandbox) => replaceInsideJob(sandbox, 'governance', '    timeout-minutes: 2\n', '',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: manifest de métricas deve corresponder exatamente aos shards do workflow'
);

expectContractFailure(
  'shell herdado do agregador pode ignorar os thresholds',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '    name: Code Coverage (${{ matrix.os }})',
    '    name: Code Coverage (${{ matrix.os }})\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}'),
  'coverage: agregador obrigatório deve aguardar shards e verificar ambos os sistemas sem exclusões'
);

expectContractFailure(
  'NODE_OPTIONS herdado pode pré-carregar bypass no agregador',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '    name: Code Coverage (${{ matrix.os }})',
    '    name: Code Coverage (${{ matrix.os }})\n    env:\n      NODE_OPTIONS: --require ./bypass.js'),
  'coverage: agregador obrigatório deve aguardar shards e verificar ambos os sistemas sem exclusões'
);

expectContractFailure(
  'shell customizado no verifier pode aceitar thresholds omitidos',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '        run: npm run test:coverage:verify',
    '        run: npm run test:coverage:verify\n        shell: bash -c "exit 0" {0}'),
  'coverage: passo crítico não pode herdar shell/env/diretório/timeout que altere ou masque o comando: npm run test:coverage:verify'
);

expectContractFailure(
  'NODE_OPTIONS direto no verifier pode pré-carregar bypass',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '        run: npm run test:coverage:verify',
    '        run: npm run test:coverage:verify\n        env:\n          NODE_OPTIONS: --require ./bypass.js'),
  'coverage: passo crítico não pode herdar shell/env/diretório/timeout que altere ou masque o comando: npm run test:coverage:verify'
);

expectContractFailure(
  'verifier roda fora da raiz do checkout',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    '        run: npm run test:coverage:verify',
    '        run: npm run test:coverage:verify\n        working-directory: ..'),
  'coverage: passo crítico não pode herdar shell/env/diretório/timeout que altere ou masque o comando: npm run test:coverage:verify'
);

expectContractFailure(
  'agregador não depende dos shards',
  (sandbox) => replaceInsideJob(sandbox, 'coverage',
    'needs: [coverage-shard]', 'needs: [coverage-shard-disabled]'),
  'coverage: merge precisa depender de todos os shards'
);

expectContractFailure(
  'Windows Portability não depende do coverage agregado',
  (sandbox) => replaceInsideJob(sandbox, 'windows-portability',
    '    needs: [coverage]\n', ''),
  'windows-portability deve depender da cobertura integral agregada nos dois sistemas'
);

expectContractFailure(
  'Fresh Developer Flow não depende do coverage agregado',
  (sandbox) => replaceInsideJob(sandbox, 'fresh-developer-flow',
    '    needs: [coverage]\n', ''),
  'fresh-developer-flow deve depender do gate agregado de coverage Linux/Windows'
);

expectContractFailure(
  'E2E shard perde teto wall-clock de dois minutos',
  (sandbox) => replaceInsideJob(sandbox, 'e2e-shard', '    timeout-minutes: 2\n', ''),
  'e2e-shard: cada job precisa limitar o wall-clock total a dois minutos'
);

expectContractFailure(
  'E2E shard ultrapassa teto wall-clock de dois minutos',
  (sandbox) => replaceInsideJob(sandbox, 'e2e-shard', '    timeout-minutes: 2\n', '    timeout-minutes: 3\n'),
  'e2e-shard: cada job precisa limitar o wall-clock total a dois minutos'
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
      '      - coverage-shard\n      - coverage\n      - e2e-shard',
      '      - coverage-shard-disabled\n      - coverage\n      - e2e-shard'
    );
  },
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate pula o único step de avaliação',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '      - name: Exigir execução e sucesso de todos os gates\n',
    '      - name: Exigir execução e sucesso de todos os gates\n        if: false\n'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate troca o verificador por comando bem-sucedido',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '        run: node scripts/ci/verify-required-job-results.js', '        run: true'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate mascara falhas do próprio gate com continue-on-error',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '    name: CI Gate', '    name: CI Gate\n    continue-on-error: true'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate herda shell que mascara o verificador',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '    name: CI Gate', '    name: CI Gate\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate herda NODE_OPTIONS que pode pré-carregar bypass',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '    name: CI Gate', '    name: CI Gate\n    env:\n      NODE_OPTIONS: --require ./bypass.js'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate permite container não revisado',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '    name: CI Gate', '    name: CI Gate\n    container: node:20'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'CI Gate permite serviços não revisados',
  (sandbox) => replaceInsideJob(sandbox, 'ci-gate',
    '    name: CI Gate', '    name: CI Gate\n    services:\n      redis:\n        image: redis:7'),
  'ci-gate: precisa executar o verificador bloqueante com needs completo e regras condicionais exatas'
);

expectContractFailure(
  'protocol gate troca a checagem de dependências por comando bem-sucedido',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '        run: node scripts/ci/verify-required-job-results.js', '        run: true',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate pula a checagem de dependências',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '      - name: Require every dependency to succeed\n',
    '      - name: Require every dependency to succeed\n        if: false\n',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate mascara falha do agregador com continue-on-error',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '    name: protocol-infra-gate', '    name: protocol-infra-gate\n    continue-on-error: true',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate herda shell que mascara métricas e dependências',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '    name: protocol-infra-gate',
    '    name: protocol-infra-gate\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate herda NODE_OPTIONS que pode pré-carregar bypass',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '    name: protocol-infra-gate',
    '    name: protocol-infra-gate\n    env:\n      NODE_OPTIONS: --require ./bypass.js',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate permite container não revisado',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '    name: protocol-infra-gate', '    name: protocol-infra-gate\n    container: node:20',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate permite serviços não revisados',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    '    name: protocol-infra-gate',
    '    name: protocol-infra-gate\n    services:\n      redis:\n        image: redis:7',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate troca a checagem de dependências por comando bem-sucedido',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '        run: node scripts/ci/verify-required-job-results.js', '        run: true',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate mascara falha do agregador com continue-on-error',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '    name: structure-review-gate', '    name: structure-review-gate\n    continue-on-error: true',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate herda shell que mascara métricas e dependências',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '    name: structure-review-gate',
    '    name: structure-review-gate\n    defaults:\n      run:\n        shell: bash -c "exit 0" {0}',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate herda NODE_OPTIONS que pode pré-carregar bypass',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '    name: structure-review-gate',
    '    name: structure-review-gate\n    env:\n      NODE_OPTIONS: --require ./bypass.js',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate permite container não revisado',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '    name: structure-review-gate', '    name: structure-review-gate\n    container: node:20',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'structure gate permite serviços não revisados',
  (sandbox) => replaceInsideJob(sandbox, 'structure-review-gate',
    '    name: structure-review-gate',
    '    name: structure-review-gate\n    services:\n      redis:\n        image: redis:7',
    '.github/workflows/pr66-structure-review.yml'),
  'structure: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

expectContractFailure(
  'protocol gate deixa de aguardar os post-gates',
  (sandbox) => replaceInsideJob(sandbox, 'protocol-infra-gate',
    'needs: [protocol-infra, protocol-post-gates]', 'needs: [protocol-infra]',
    '.github/workflows/bible-protocol-infra.yml'),
  'protocol: gate precisa medir os shards e rejeitar falha/skip de todas as dependências'
);

console.log(
  '✅ CI Contract self-test aprovado: o gate rejeita mutações de jobs, comandos executáveis, ' +
  'shards e merges integrais de coverage nos dois sistemas, Bible readiness, concurrency, dependências do gate, forbidOnly e matriz de regressão.'
);
