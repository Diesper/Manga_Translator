# Bíblia técnica — scripts/validation/verify-ci-contract.js

> **Estado documental:** ✅ CONCLUÍDA PELO AGENTE 7 — consolidação global fora do escopo deste agente  
> **SHA auditado:** `636e4bfbaa0646cd8259e1f27f09004a92541294`  
> **Agente responsável:** AGENTE 7  
> **Tipo:** meta-gate Node.js de contratos da CI  
> **Linhas textuais / posições:** **508**; o arquivo **não possui newline terminal**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`verify-ci-contract.js` é o meta-gate estático que impede que a infraestrutura de teste/publicação perca proteções consideradas obrigatórias. Ele não executa Jest, Playwright ou os demais verificadores; lê seus arquivos/configurações e o workflow, cruza aliases e marcadores, valida a matriz de regressão e o plano E2E, acumula violações em `problems` e encerra com código 1 quando qualquer contrato é quebrado.

Seu escopo é deliberadamente transversal: versionamento, estrutura, anti-skip, publish, jobs de diagnóstico, gatilhos/concurrency, portabilidade Windows, fresh-developer-flow, sharding E2E, coverage, partição Jest, baseline e reporter E2E. Por isso ele funciona como proteção contra regressão da própria CI, mas muitas garantias são textuais/estruturais e não equivalem à execução funcional das suítes protegidas.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependências Node:** `fs` e `path`.
- **Entradas lidas:** `.github/workflows/ci.yml`, `playwright.config.js`, `jest.config.js`, `package.json`, `test-baseline.json`, `regression-matrix.json`, `e2e-shard-plan.json`, runners e verificadores auxiliares listados nas linhas 7–23 e 422.
- **Consumidores diretos:** `package.json#validate` e o job `ci-contract` de `.github/workflows/ci.yml`.
- **Self-test focal:** `scripts/validation/verify-ci-contract-selftest.js`, também ligado por `package.json#test:ci-contract:infra` e pelo job `ci-contract`.
- **Efeitos colaterais:** somente stdout/stderr e término do processo; o verifier não grava o workspace.
- **Trust boundary:** o gate confia que presença textual/regex nos arquivos representa o contrato que pretende proteger; essa aproximação é explicitamente tratada como risco, não como prova funcional.

## 3. Fluxo de execução

1. resolve a raiz e carrega os artefatos canônicos;
2. cria `problems` e executa grupos de checks estáticos;
3. parseia a matriz com tratamento local de erro e valida suas entradas/markers;
4. extrai jobs do YAML por `jobBlock` e verifica existência, wiring e condições;
5. cruza package scripts, configs, baseline, plano E2E e fontes auxiliares;
6. se houver qualquer problema, imprime todos e chama `process.exit(1)`;
7. sem problemas, imprime a mensagem de contrato validado.

## 4. Evidência automatizada

| Contrato | Evidência encontrada | Classificação |
|---|---|---|
| Rejeita remoção do job visual | verify-ci-contract-selftest.js executa este verifier real em sandbox e exige mensagem `job obrigatório ausente: visual` | ✅ PROVADO DIRETAMENTE |
| Rejeita `forbidOnly` enfraquecido | self-test troca `forbidOnly: isCi` por `false`, executa o verifier real e exige mensagem específica | ✅ PROVADO DIRETAMENTE |
| Rejeita marcador de regressão removido | self-test remove um marcador real escolhido da matriz e exige `marcador obrigatório ausente` | ✅ PROVADO DIRETAMENTE |
| Wiring do verifier na CI | ci.yml job `ci-contract` contém `node scripts/validation/verify-ci-contract.js`; package `validate` também o chama | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Wiring do self-test | ci.yml chama `npm run test:ci-contract:infra`; package aponta para `verify-ci-contract-selftest.js` | 🟦 GATE ESTÁTICO ESPECÍFICO |
| 23 entradas da matriz e presença de markers | o próprio verifier lê regression-matrix.json, exige >=20, unicidade, arquivo existente e marker literal | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Plano E2E 5 grupos / 21 testes | o verifier compara IDs, expectedTests/workers e soma com baseline.e2e.minTests | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Demais branches negativos do verifier | nenhum cenário focal correspondente foi localizado no self-test atual | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Resistência a comentário/dead text e YAML equivalente | não localizada; predominam includes/regex e parser textual simples | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

A presença do verifier no workflow/package prova wiring estático; não foi promovida a prova de cada regra negativa. As únicas três falhas negativas diretamente exercitadas pelo self-test atual são as registradas como `✅ PROVADO DIRETAMENTE`.

## 5. Invariantes principais

1. Os 16 jobs de `requiredJobs` devem continuar materializados no formato que `jobBlock` reconhece.
2. `version-integrity` preserva `version:check` e `--print-env`.
3. Política anti-skip, publish e self-tests permanecem ligados ao workflow e aos aliases npm canônicos.
4. A matriz de regressão mantém ao menos 20 entradas válidas, IDs únicos, arquivos existentes e markers presentes.
5. Jobs funcionais e diagnósticos não podem mascarar falhas com `continue-on-error: true`.
6. `windows-portability` e `fresh-developer-flow` preservam as sequências de validação exigidas.
7. O E2E usa cinco grupos explícitos, workers vindos do plano, cobertura total igual ao baseline e cinco blob reports no merge.
8. `ci-gate` usa `always() && !cancelled()` e depende de todos os jobs obrigatórios anteriores.
9. Jest usa o runner auditável, partição unit/integration canônica e não reintroduz `--forceExit`.
10. Coverage mantém provider V8, escopo extension/**/*.js, reporters e verificadores/self-tests esperados.
11. Baseline selecionado mantém inteiros positivos e `e2e.maxFlaky` inteiro não-negativo.
12. O reporter E2E continua rastreando tentativas/flaky e estados terminais reprovados.

## 6. Casos-limite, riscos e análise crítica

- **Parser YAML simplificado:** `jobBlock` reconhece somente chaves de job em formato textual específico; um YAML semanticamente equivalente pode ser rejeitado.
- **Presença não é semântica:** vários `includes` podem ser satisfeitos por comentário, string morta ou trecho fora do caminho executável.
- **Falhas de bootstrap:** `package.json`, `test-baseline.json` e `e2e-shard-plan.json` são parseados sem `try/catch`; JSON inválido reprova de forma fail-closed por exceção, mas sem diagnóstico agregado.
- **Matriz:** o gate prova cardinalidade mínima/shape/markers, não que cada marker represente semanticamente a regressão declarada.
- **Baseline parcial:** somente seis mínimos e `e2e.maxFlaky` recebem validação de tipo/faixa aqui; outros campos são responsabilidade dos consumidores.
- **Acoplamento a mensagens:** self-tests negativos verificam mensagens específicas; refactor textual legítimo exige atualizar o teste, o que é aceitável desde que o contrato seja preservado.
- **Ponto forte:** a falha final agrega múltiplas violações, fornecendo diagnóstico amplo em uma única execução.

## 7. Solicitações ao auditor

### 083-001 — TEST_REQUIRED — OPEN
- **Encontrado:** O self-test executa a implementação real, porém cobre diretamente somente três falhas negativas: job visual removido, forbidOnly enfraquecido e marcador da matriz removido.
- **Arquivo relacionado:** `scripts/validation/verify-ci-contract-selftest.js`
- **Evidência atual:** O sandbox copia o verifier real e seus artefatos, muta uma condição por cenário, executa o verifier em child_process e exige exit não-zero + mensagem específica.
- **Evidência ausente:** Não há prova focal encontrada para os demais branches, incluindo parser jobBlock, diagnósticos/continue-on-error, concurrency/triggers, Windows, topology E2E, coverage, aliases Jest/coverage, shape do baseline e reporter.
- **Por que importa:** O arquivo possui dezenas de regras independentes; alterações acidentais em mensagens/condições não cobertas podem enfraquecer um gate sem quebrar os três cenários atuais.
- **Ação solicitada:** Ampliar o self-test em mudança separada com cenários negativos representativos por família de contrato, executando sempre o verifier real em sandbox.
- **Evidência esperada:** Cada mutação relevante deve causar exit não-zero e mensagem específica correspondente ao contrato removido/enfraquecido.
- **Ação esperada do auditor:** Confirmar a lacuna e priorizar cobertura das famílias de maior risco sem alterar esta Bíblia como forma de produzir prova retroativa.
- **Regressão possível:** Uma regra não exercitada pode parar de detectar drift e a infraestrutura permanecer verde enquanto o self-test atual ainda passa.
- **Impacto:** Reduz confiança de regressão negativa sobre o meta-gate; não invalida as três provas diretas existentes.
- **Severidade:** NORMAL

### 083-002 — ROBUSTNESS_REVIEW — OPEN
- **Encontrado:** Grande parte do contrato é validada por String.includes e regex sobre YAML/JavaScript, e jobBlock depende de formatação textual exata de jobs com dois espaços.
- **Arquivo relacionado:** `scripts/validation/verify-ci-contract.js`
- **Evidência atual:** Linhas 26-65, 110-195, 237-383, 414-478 e 494-500 usam presença literal/regex; jobBlock localiza chaves por igualdade exata e regex de linha.
- **Evidência ausente:** Não foi encontrada prova de resistência a comentários/dead text que contenham o marcador nem a variações YAML semanticamente equivalentes, como formatação/chaves válidas diferentes.
- **Por que importa:** Checks textuais podem produzir falso positivo por marcador presente fora do caminho executável ou falso negativo após refactor de formatação sem mudança semântica.
- **Ação solicitada:** Avaliar se o contrato textual estrito é intencional. Se não for, considerar parser YAML/inspeção estrutural ou verificações mais contextuais, acompanhadas de regressões negativas e positivas.
- **Evidência esperada:** Testes demonstrando rejeição de marcador apenas em comentário/dead text e aceitação/rejeição consciente de formatações YAML equivalentes conforme o contrato decidido.
- **Ação esperada do auditor:** Classificar quais checks devem continuar textuais e quais exigem validação estrutural antes de qualquer mudança funcional.
- **Regressão possível:** A CI pode aceitar uma proteção apenas comentada ou rejeitar refactor seguro de formatação.
- **Impacto:** Robustez do meta-gate e manutenção futura; o estado atual continua verificável pelo contrato textual existente.
- **Severidade:** NORMAL

## 8. Fonte integral exata

O bloco abaixo transcreve integralmente o blob `636e4bfbaa0646cd8259e1f27f09004a92541294`. O arquivo termina na linha 508 **sem newline terminal**; a quebra usada para separar o conteúdo da fence Markdown é editorial e não pertence ao fonte.

```javascript
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const playwright = fs.readFileSync(path.join(root, 'playwright.config.js'), 'utf8');
const coverageConfig = fs.readFileSync(path.join(root, 'jest.config.js'), 'utf8');
const coverageVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-coverage.js'), 'utf8');
const coverageSelfTest = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-coverage-selftest.js'), 'utf8');
const repositoryStructureVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-repository-structure.js'), 'utf8');
const testPolicyVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-test-policy.js'), 'utf8');
const testPolicySelfTest = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-test-policy-selftest.js'), 'utf8');
const publishContractVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-publish-contract.js'), 'utf8');
const e2eReporter = fs.readFileSync(path.join(root, 'scripts', 'ci', 'playwright-gate-reporter.js'), 'utf8');
const e2ePlan = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'e2e-shard-plan.json'), 'utf8'));
const e2ePlanVerifier = fs.readFileSync(path.join(root, 'scripts', 'validation', 'verify-e2e-shard-plan.js'), 'utf8');
const e2eGroupRunner = fs.readFileSync(path.join(root, 'scripts', 'ci', 'run-e2e-group.js'), 'utf8');
const jestWorkerDiagnostic = fs.readFileSync(path.join(root, 'scripts', 'maintenance', 'diagnose-jest-workers.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ci', 'data', 'test-baseline.json'), 'utf8'));
const regressionMatrixPath = path.join(root, 'scripts', 'ci', 'data', 'regression-matrix.json');

const problems = [];
if (!workflow.includes('node scripts/validation/verify-repository-structure.js')) {
  problems.push('CI Contract precisa executar o gate estrutural do repositório');
}
if (!repositoryStructureVerifier.includes('legacyReferenceMarkers') ||
    !repositoryStructureVerifier.includes('referência operacional legada')) {
  problems.push('gate estrutural precisa varrer referências operacionais aos caminhos legados');
}
if (!workflow.includes('npm run validate:test-policy')) {
  problems.push('CI Contract precisa executar a política anti-skip/escape-hatch');
}
if (pkg.scripts['validate:test-policy'] !== 'node scripts/validation/verify-test-policy.js') {
  problems.push('package.json#validate:test-policy precisa apontar para o verificador canônico');
}
if (!workflow.includes('npm run test:test-policy:infra')) {
  problems.push('CI Contract precisa executar o self-test da política anti-skip');
}
if (pkg.scripts['test:test-policy:infra'] !== 'node scripts/validation/verify-test-policy-selftest.js') {
  problems.push('package.json#test:test-policy:infra precisa executar o self-test canônico');
}
for (const marker of ['test.skip', '--forceExit em script npm', 'teste mascarado com || true']) {
  if (!testPolicySelfTest.includes(marker)) {
    problems.push('self-test da política não cobre cenário: ' + marker);
  }
}
if (!workflow.includes('npm run validate:publish')) {
  problems.push('CI Contract precisa executar o contrato de publicação');
}
if (pkg.scripts['validate:publish'] !== 'node scripts/validation/verify-publish-contract.js') {
  problems.push('package.json#validate:publish precisa executar o verificador de publicação');
}
for (const marker of ['cp -R extension/.', 'docs/Documentação.md', 'scripts/release/sync-version.js']) {
  if (!publishContractVerifier.includes(marker)) {
    problems.push('verify-publish-contract.js não protege marcador de release: ' + marker);
  }
}
for (const marker of ['.skip', '.only', 'test.todo', '--forceExit', '--passWithNoTests', '|| true']) {
  if (!testPolicyVerifier.includes(marker)) {
    problems.push('verify-test-policy.js não protege marcador proibido: ' + marker);
  }
}

let regressionMatrix = null;
try {
  regressionMatrix = JSON.parse(fs.readFileSync(regressionMatrixPath, 'utf8'));
} catch (error) {
  problems.push('regression-matrix.json inválido ou ausente: ' + error.message);
}
const requiredJobs = [
  'version-integrity',
  'syntax-check',
  'manifest-validation',
  'ci-contract',
  'smoke',
  'visual',
  'unit-and-integration',
  'coverage',
  'e2e-shard',
  'e2e',
  'jest-worker-diagnostic',
  'focused-project-leak-diagnostic',
  'background-leak-bisection',
  'windows-portability',
  'fresh-developer-flow',
  'ci-gate',
];

function jobBlock(id) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === '  ' + id + ':');
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

for (const job of requiredJobs) {
  if (!jobBlock(job)) problems.push('job obrigatório ausente: ' + job);
}

const versionIntegrity = jobBlock('version-integrity');
if (!versionIntegrity.includes('run: npm run version:check')) {
  problems.push('version-integrity precisa executar npm run version:check');
}
if (!versionIntegrity.includes('run: node scripts/release/sync-version.js --print-env')) {
  problems.push('version-integrity precisa executar sync-version.js --print-env');
}


const freshDeveloperFlow = jobBlock('fresh-developer-flow');
if (!freshDeveloperFlow.includes("github.event_name == 'workflow_dispatch'")) {
  problems.push('fresh-developer-flow deve executar no workflow_dispatch pré-revisão');
}
for (const marker of [
  'run: npm ci',
  'run: npm run test:unit',
  'run: npm run test:integration',
  'run: npm run test:smoke',
  'run: npm run test:visual',
  'npm run test:e2e',
  'run: npm run test:coverage',
  'run: npm run test:coverage:verify',
  'run: npm test',
]) {
  if (!freshDeveloperFlow.includes(marker)) {
    problems.push('fresh-developer-flow não preserva a sequência oficial: ' + marker);
  }
}
if (!freshDeveloperFlow.includes('playwright install chromium --with-deps --no-shell')) {
  problems.push('fresh-developer-flow precisa instalar Chromium antes do E2E');
}
if (!freshDeveloperFlow.includes('xvfb-run --auto-servernum -- npm run test:e2e')) {
  problems.push('fresh-developer-flow precisa executar o E2E da extensão com Xvfb no Linux');
}

for (const diagnosticJob of [
  'jest-worker-diagnostic',
  'focused-project-leak-diagnostic',
  'background-leak-bisection',
]) {
  const block = jobBlock(diagnosticJob);
  if (!block) {
    problems.push('job de diagnóstico ausente: ' + diagnosticJob);
    continue;
  }

  for (const requiredCondition of [
    "github.event_name == 'workflow_dispatch'",
    "github.event_name == 'push'",
    "github.ref == 'refs/heads/main'",
  ]) {
    if (!block.includes(requiredCondition)) {
      problems.push(
        diagnosticJob + ': precisa executar em workflow_dispatch e em todo push da main; ausente: ' +
        requiredCondition
      );
    }
  }

  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(diagnosticJob + ': não pode mascarar falha com continue-on-error no job');
  }

  const lines = block.split(/\r?\n/);
  const diagnosticRun = lines.findIndex((line) =>
    /run:\s+npm run test:diagnose-(?:workers|background-leak)/.test(line)
  );
  if (diagnosticRun < 0) {
    problems.push(diagnosticJob + ': comando de diagnóstico obrigatório ausente');
  } else {
    const nearby = lines.slice(Math.max(0, diagnosticRun - 3), diagnosticRun).join('\n');
    if (/continue-on-error:\s*true/.test(nearby)) {
      problems.push(diagnosticJob + ': passo de diagnóstico não pode usar continue-on-error');
    }
  }
}

if (!/cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/.test(workflow)) {
  problems.push('concurrency: execuções da main não podem ser canceladas por um merge posterior');
}
if (!/push:\s*\n\s*branches:\s*\n\s*- main/.test(workflow)) {
  problems.push('workflow deve executar push automático somente na main para não duplicar o mesmo commit de PR');
}
if (!/^\s{2}pull_request:\s*$/m.test(workflow) || !/^\s{2}workflow_dispatch:\s*$/m.test(workflow)) {
  problems.push('workflow precisa preservar pull_request e workflow_dispatch');
}

if (regressionMatrix) {
  const entries = Array.isArray(regressionMatrix.regressions)
    ? regressionMatrix.regressions
    : [];
  if (entries.length < 20) {
    problems.push('matriz de regressão precisa preservar pelo menos 20 contratos críticos');
  }
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id) {
      problems.push('matriz de regressão contém entrada sem id');
      continue;
    }
    if (ids.has(entry.id)) problems.push('id de regressão duplicado: ' + entry.id);
    ids.add(entry.id);

    if (typeof entry.file !== 'string' || !entry.file) {
      problems.push(entry.id + ': arquivo de regressão ausente');
      continue;
    }
    const target = path.join(root, entry.file);
    if (!fs.existsSync(target)) {
      problems.push(entry.id + ': arquivo de regressão não existe: ' + entry.file);
      continue;
    }

    const source = fs.readFileSync(target, 'utf8');
    const markers = Array.isArray(entry.markers) ? entry.markers : [];
    if (!markers.length) {
      problems.push(entry.id + ': precisa declarar pelo menos um marcador obrigatório');
      continue;
    }
    for (const marker of markers) {
      if (typeof marker !== 'string' || !marker || !source.includes(marker)) {
        problems.push(entry.id + ': marcador obrigatório ausente em ' + entry.file + ': ' + marker);
      }
    }
  }
}

for (const job of ['smoke', 'visual', 'unit-and-integration', 'coverage', 'e2e-shard', 'e2e', 'windows-portability']) {
  const block = jobBlock(job);
  if (/^    continue-on-error:\s*true\s*$/m.test(block)) {
    problems.push(job + ': job funcional não pode usar continue-on-error: true');
  }
}

const windowsPortability = jobBlock('windows-portability');
if (!windowsPortability.includes('runs-on: windows-latest')) {
  problems.push('windows-portability precisa executar em windows-latest');
}
for (const marker of [
  'run: npm ci',
  'run: npm run validate',
  'run: npm run test:ci',
  'run: npm run test:smoke',
  'run: npm run test:visual',
  'run: npm run test:coverage',
  'run: npm run test:coverage:verify',
]) {
  if (!windowsPortability.includes(marker)) {
    problems.push('windows-portability não cobre contrato obrigatório: ' + marker);
  }
}

const e2eShard = jobBlock('e2e-shard');
const e2e = jobBlock('e2e');
if (/^    needs:/m.test(e2eShard)) {
  problems.push('e2e-shard: precisa executar independentemente de outros jobs funcionais');
}
if (!/^    needs:\s*$/m.test(e2e) || !e2e.includes('- e2e-shard')) {
  problems.push('e2e: gate agregado precisa depender dos shards');
}
if (!e2e.includes('merge-reports') || !e2e.includes('playwright-merge.config.js')) {
  problems.push('e2e: gate agregado precisa mesclar blob reports antes de validar inventário');
}
for (const group of ['fifo', 'attachment', 'medium-a', 'medium-b', 'fast']) {
  if (!e2eShard.includes(group)) {
    problems.push('e2e-shard: grupo explícito ausente da matriz: ' + group);
  }
}
if (!e2eShard.includes('test:e2e:group') || !e2eShard.includes("MANGA_E2E_SHARD: '1'")) {
  problems.push('e2e-shard: precisa executar grupos explícitos com blob reporter');
}
if (/MANGA_E2E_WORKERS:\s*['"]?\d+/.test(e2eShard)) {
  problems.push('e2e-shard: workers não podem ficar hardcoded no workflow; use e2e-shard-plan.json');
}
if (!e2eGroupRunner.includes('MANGA_E2E_WORKERS: String(group.workers)')) {
  problems.push('run-e2e-group.js precisa aplicar workers do plano como fonte única de verdade');
}

if (!jestWorkerDiagnostic.includes("path.join(repoRoot, '.ci-results', aggregateName)")) {
  problems.push('diagnose-jest-workers.js precisa gravar o resumo agregado em /.ci-results');
}
if (jestWorkerDiagnostic.includes("path.join(testsRoot, '.ci-results'")) {
  problems.push('diagnose-jest-workers.js não pode reintroduzir tests/.ci-results');
}
if (e2eShard.includes('--shard=')) {
  problems.push('e2e-shard: não deve voltar ao sharding automático por contagem');
}
if (!e2e.includes('test:e2e:plan')) {
  problems.push('e2e: precisa verificar cobertura exata dos grupos antes do merge');
}
if (!e2e.includes('wc -l)" -eq 5')) {
  problems.push('e2e: precisa exigir exatamente 5 blob reports');
}

if (/npm run test:[^\n]*\|\|\s*true/.test(workflow)) {
  problems.push('workflow mascara comando de testes com "|| true"');
}

const coverage = jobBlock('coverage');
if (!/run:\s+npm run test:coverage/.test(coverage)) {
  problems.push('coverage: deve executar test:coverage de forma bloqueante');
}
if (!/run:\s+npm run test:coverage:verify/.test(coverage)) {
  problems.push('coverage: deve verificar a integridade do relatório em etapa bloqueante');
}
if (/npm run test:coverage[^\n]*\|\|\s*true/.test(coverage)) {
  problems.push('coverage: não pode mascarar Jest/coverage com "|| true"');
}
if (!coverage.includes('CODECOV_TOKEN not configured')) {
  problems.push('coverage: ausência de CODECOV_TOKEN precisa ser reportada explicitamente como SKIPPED');
}
if (!coverage.includes('fail_ci_if_error: true')) {
  problems.push('coverage: Codecov configurado deve reportar sua própria falha');
}

// O gate precisa sobreviver a falhas/skips de dependências para avaliá-las,
// mas não deve ressuscitar depois que o workflow inteiro foi cancelado.
const gate = jobBlock('ci-gate');
if (!/if:\s*\$\{\{\s*always\(\)\s*&&\s*!cancelled\(\)\s*\}\}/.test(gate)) {
  problems.push(
    'ci-gate: precisa usar if: always() && !cancelled() para avaliar falhas reais sem transformar workflow cancelado em falso vermelho'
  );
}
if (/if:\s*\$\{\{\s*always\(\)\s*\}\}/.test(gate)) {
  problems.push('ci-gate: if: always() puro é proibido porque pode gerar falso vermelho em run cancelado');
}
for (const dependency of requiredJobs.filter((job) => job !== 'ci-gate')) {
  if (!gate.includes('- ' + dependency)) {
    problems.push('ci-gate: dependência obrigatória ausente: ' + dependency);
  }
}

for (const marker of [
  'FULL_DIAGNOSTICS_REQUIRED',
  'JEST_WORKER_DIAGNOSTIC',
  'FOCUSED_PROJECT_LEAK',
  'BACKGROUND_LEAK_BISECTION',
  'if [ "$FULL_DIAGNOSTICS_REQUIRED" = "true" ]; then',
  'check "Jest Worker Diagnostic" "$JEST_WORKER_DIAGNOSTIC"',
  'check "Focused Project Leak" "$FOCUSED_PROJECT_LEAK"',
  'check "Background Leak Bisection" "$BACKGROUND_LEAK_BISECTION"',
  'WINDOWS_PORTABILITY',
  'FRESH_DEVELOPER_FLOW',
  'check "Fresh Developer Flow" "$FRESH_DEVELOPER_FLOW"',
]) {
  if (!gate.includes(marker)) {
    problems.push('ci-gate: proteção pós-merge incompleta, marcador ausente: ' + marker);
  }
}

if (!playwright.includes('forbidOnly: isCi')) {
  problems.push('Playwright precisa proibir test.only em CI');
}
if (!playwright.includes('fullyParallel: true')) {
  problems.push('Playwright precisa habilitar distribuição por teste para balancear shards');
}
if (!playwright.includes('retries: isCi ? 0')) {
  problems.push('Playwright CI precisa usar retries=0 para não mascarar flakiness nem desperdiçar tempo');
}
if (!playwright.includes('./scripts/ci/playwright-gate-reporter.js')) {
  problems.push('Playwright precisa carregar o reporter de gate em CI');
}
if (pkg.scripts['test:e2e:group'] !== 'node scripts/ci/run-e2e-group.js') {
  problems.push('package.json#test:e2e:group precisa usar o runner de grupos explícitos');
}
if (pkg.scripts['pretest:e2e'] !== 'npm run test:images') {
  problems.push('package.json#pretest:e2e precisa preparar fixtures pela fonte única');
}
if (pkg.scripts['pretest:e2e:group'] !== 'npm run test:images') {
  problems.push('package.json#pretest:e2e:group precisa preparar fixtures pela fonte única');
}
if (pkg.scripts['test:e2e:plan'] !== 'node scripts/validation/verify-e2e-shard-plan.js') {
  problems.push('package.json#test:e2e:plan precisa verificar o inventário dos shards');
}
if (!Array.isArray(e2ePlan.groups) || e2ePlan.groups.length !== 5) {
  problems.push('e2e-shard-plan.json precisa conter exatamente 5 grupos nesta fase');
} else {
  const expected = new Map([
    ['fifo', { tests: 1, workers: 1 }],
    ['attachment', { tests: 3, workers: 3 }],
    ['medium-a', { tests: 4, workers: 2 }],
    ['medium-b', { tests: 4, workers: 2 }],
    ['fast', { tests: 9, workers: 3 }],
  ]);
  let total = 0;
  for (const group of e2ePlan.groups) {
    total += Number(group.expectedTests || 0);
    if (!expected.has(group.id)) {
      problems.push('e2e-shard-plan.json contém grupo inesperado: ' + group.id);
      continue;
    }
    const expectedGroup = expected.get(group.id);
    if (group.expectedTests !== expectedGroup.tests) {
      problems.push('e2e-shard-plan.json contagem inválida para ' + group.id);
    }
    if (group.workers !== expectedGroup.workers) {
      problems.push('e2e-shard-plan.json workers inválidos para ' + group.id +
        ': esperado=' + expectedGroup.workers + ', atual=' + group.workers);
    }
  }
  if (total !== baseline.e2e.minTests) {
    problems.push('e2e-shard-plan.json precisa cobrir exatamente o baseline atual de E2E');
  }
}
for (const invariant of ['cobertura exata sem omissões ou duplicatas', 'teste duplicado entre grupos', 'Testes sem grupo']) {
  if (!e2ePlanVerifier.includes(invariant)) {
    problems.push('verify-e2e-shard-plan.js não protege invariável: ' + invariant);
  }
}
if (pkg.scripts['test:ci'] !== 'node scripts/ci/run-jest-ci.js') {
  problems.push('package.json#test:ci precisa usar o runner auditável');
}
const jestRunner = fs.readFileSync(path.join(root, 'scripts', 'ci', 'run-jest-ci.js'), 'utf8');
if (!jestRunner.includes('hasForcedWorkerExit(jestStderr)')) {
  problems.push('run-jest-ci.js precisa reprovar o aviso de worker forçado');
}
if (!jestRunner.includes('[CI/Jest Partition]') || !jestRunner.includes('listProjectFiles(unitProjects)')) {
  problems.push('run-jest-ci.js precisa provar a partição exata entre test:unit e test:integration');
}
const expectedUnitScript = 'jest --config jest.config.js --selectProjects background gtc content-scripts popup reader manifest shared-ui';
if (pkg.scripts['test:unit'] !== expectedUnitScript) {
  problems.push('package.json#test:unit precisa selecionar exatamente os projetos unitários canônicos');
}
if (pkg.scripts['test:integration'] !== 'jest --config jest.config.js --selectProjects integration') {
  problems.push('package.json#test:integration precisa selecionar exclusivamente o projeto integration');
}
if (!workflow.includes('node scripts/validation/verify-jest-worker-warning-selftest.js')) {
  problems.push('CI Contract precisa testar a detecção de worker forçado');
}

if (!workflow.includes('npm run test:ci-contract:infra')) {
  problems.push('CI Contract precisa executar o self-test negativo do próprio contrato');
}
if (pkg.scripts['test:ci-contract:infra'] !== 'node scripts/validation/verify-ci-contract-selftest.js') {
  problems.push('package.json#test:ci-contract:infra precisa executar o self-test negativo do contrato');
}
if (jestRunner.includes("'--forceExit'") || jestRunner.includes('"--forceExit"')) {
  problems.push('run-jest-ci.js não pode mascarar open handles com --forceExit');
}
if (pkg.scripts['test:coverage'] !== 'node scripts/ci/run-jest-ci.js --coverage') {
  problems.push('package.json#test:coverage precisa usar o runner auditável com cobertura');
}
if (pkg.scripts['test:coverage:verify'] !== 'node scripts/validation/verify-coverage.js') {
  problems.push('package.json#test:coverage:verify precisa executar o verificador de integridade');
}
if (pkg.scripts['test:coverage:infra'] !== 'node scripts/validation/verify-coverage-selftest.js') {
  problems.push('package.json#test:coverage:infra precisa testar a própria infraestrutura');
}
if (!coverageConfig.includes("coverageProvider: 'v8'")) {
  problems.push('jest.config.js precisa usar coverageProvider v8');
}
if (!coverageConfig.includes("<rootDir>/extension/**/*.js")) {
  problems.push('coverage precisa incluir a arquitetura atual extension/**/*.js');
}
for (const reporter of ['lcov', 'json-summary', 'text-summary']) {
  if (!coverageConfig.includes("'" + reporter + "'")) {
    problems.push('jest.config.js precisa gerar reporter ' + reporter);
  }
}
for (const invariant of ['lcov.info ausente ou vazio', 'coverage zero não é aceito', 'arquivo crítico ausente']) {
  if (!coverageVerifier.includes(invariant)) {
    problems.push('verify-coverage.js não protege invariável: ' + invariant);
  }
}
for (const scenario of ['coverage normal', 'lcov vazio', 'coverage 0%', 'arquivo crítico ausente', 'threshold abaixo do mínimo']) {
  if (!coverageSelfTest.includes(scenario)) {
    problems.push('self-test de coverage não cobre cenário: ' + scenario);
  }
}

for (const [name, value] of [
  ['jest.minSuites', baseline.jest && baseline.jest.minSuites],
  ['jest.minTests', baseline.jest && baseline.jest.minTests],
  ['visual.minTests', baseline.visual && baseline.visual.minTests],
  ['e2e.minTests', baseline.e2e && baseline.e2e.minTests],
  ['smoke.minFiles', baseline.smoke && baseline.smoke.minFiles],
  ['coverage.minInstrumentedFiles', baseline.coverage && baseline.coverage.minInstrumentedFiles],
]) {
  if (!Number.isInteger(value) || value <= 0) problems.push('baseline inválido: ' + name);
}

if (!Number.isInteger(baseline.e2e && baseline.e2e.maxFlaky) || baseline.e2e.maxFlaky < 0) {
  problems.push('baseline inválido: e2e.maxFlaky');
}

if (!e2eReporter.includes('attemptsById') || !e2eReporter.includes('maxFlaky')) {
  problems.push('reporter E2E precisa preservar tentativas e bloquear flaky/retry');
}
if (!e2eReporter.includes('const failed =') || !e2eReporter.includes('status final não aprovado')) {
  problems.push('reporter E2E precisa reprovar failed/timedOut/interrupted terminais');
}

if (problems.length) {
  console.error('Contrato da CI inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log('Contrato da CI validado: gates obrigatórios, regressões e verificação completa pós-merge da main protegidos.');
```

## 9. Cobertura documental por faixas contíguas

As 508 linhas são cobertas pelas 34 faixas abaixo, em ordem, sem lacunas nem sobreposição. Cada faixa descreve o papel semântico do trecho e não converte sua mera presença em prova automatizada.

### Bloco 01 — linhas 1–1
Ativa strict mode para o módulo inteiro; evita semânticas permissivas acidentais do CommonJS e faz erros de atribuição/this emergirem cedo.

### Bloco 02 — linhas 2–5
Separa o cabeçalho e importa fs/path, as únicas dependências Node necessárias para ler o workspace e resolver caminhos canônicos.

### Bloco 03 — linhas 6–23
Resolve a raiz do repositório e carrega, de forma síncrona, todos os artefatos que constituem o contrato: workflow CI, configs Playwright/Jest, verificadores auxiliares, self-tests, plano E2E, runner de grupos, diagnóstico Jest, package.json, baseline e caminho da matriz de regressão. JSON de plano/package/baseline é parseado já no bootstrap.

### Bloco 04 — linhas 24–25
Abre a fase de validação e cria o acumulador problems. O design coleta várias violações antes de reprovar, em vez de sair no primeiro mismatch.

### Bloco 05 — linhas 26–32
Exige que ci.yml invoque o gate estrutural e que verify-repository-structure.js continue contendo os marcadores usados para detectar referências operacionais legadas.

### Bloco 06 — linhas 33–44
Protege a política anti-skip em duas camadas: wiring do workflow e aliases exatos de package.json tanto para o verificador quanto para seu self-test.

### Bloco 07 — linhas 45–49
Percorre três cenários nominais do self-test anti-skip e exige que os respectivos textos continuem presentes; é um contrato textual sobre a abrangência mínima daquele self-test.

### Bloco 08 — linhas 50–60
Protege o gate de publicação: exige execução no workflow, alias npm canônico e três marcadores do verificador de publish ligados à cópia da extensão, documentação canônica e sync-version.

### Bloco 09 — linhas 61–65
Exige que verify-test-policy.js continue reconhecendo seis escape hatches: skip, only, todo, forceExit, passWithNoTests e mascaramento com || true.

### Bloco 10 — linhas 66–72
Tenta carregar regression-matrix.json com tratamento próprio de erro. Diferentemente de outros JSONs do bootstrap, falha de parse/ausência vira item de problems e permite acumular outros diagnósticos.

### Bloco 11 — linhas 73–90
Declara a lista canônica de 16 jobs que formam o contrato da CI: versionamento, sintaxe, manifesto, contrato, suítes, coverage, E2E, diagnósticos, Windows, fluxo fresh e gate final.

### Bloco 12 — linhas 91–104
Implementa jobBlock(id): divide o YAML por linhas, localiza exatamente uma chave de job com dois espaços, determina o próximo job de mesmo nível e devolve o bloco textual. A função é um parser deliberadamente simples e sensível ao formato textual canônico.

### Bloco 13 — linhas 105–108
Valida a existência de cada job obrigatório usando jobBlock; qualquer bloco vazio gera problema nominando o job ausente.

### Bloco 14 — linhas 109–116
Inspeciona version-integrity e exige tanto npm run version:check quanto sync-version.js --print-env, preservando os dois lados do contrato de versionamento.

### Bloco 15 — linhas 117–143
Inspeciona fresh-developer-flow: restringe-o a workflow_dispatch, exige a sequência oficial npm ci/unit/integration/smoke/visual/E2E/coverage/npm test, instalação de Chromium e execução E2E via Xvfb no Linux.

### Bloco 16 — linhas 144–185
Valida três jobs de diagnóstico. Cada um deve existir, rodar em workflow_dispatch e push da main, não mascarar falha com continue-on-error no job/passo e conter o comando npm de diagnóstico esperado.

### Bloco 17 — linhas 186–195
Protege gatilhos/concurrency: main não pode ser cancelada por merge posterior, push automático fica limitado à main e pull_request + workflow_dispatch devem permanecer declarados.

### Bloco 18 — linhas 196–235
Valida a matriz de regressão: exige array com pelo menos 20 entradas, IDs presentes/únicos, arquivo alvo válido/existente, pelo menos um marcador por entrada e presença literal de cada marcador no fonte indicado.

### Bloco 19 — linhas 236–242
Proíbe continue-on-error: true em sete jobs funcionais centrais, evitando que smoke/visual/Jest/coverage/E2E/Windows fiquem verdes após falha.

### Bloco 20 — linhas 243–260
Inspeciona windows-portability: exige runner windows-latest e a sequência npm ci, validate, test:ci, smoke, visual e coverage + verifier.

### Bloco 21 — linhas 261–286
Define contratos do E2E: shards independentes, gate agregado dependente dos shards, merge de blob reports com config própria, cinco grupos explícitos, MANGA_E2E_SHARD ativo, workers não hardcoded no YAML e runner lendo workers do plano.

### Bloco 22 — linhas 287–302
Protege saída do diagnóstico Jest em /.ci-results, impede regressão para tests/.ci-results, proíbe --shard= automático, exige test:e2e:plan e exatamente cinco blob reports antes do merge.

### Bloco 23 — linhas 303–323
Bloqueia mascaramento geral de testes com || true e valida o job coverage: geração e verificação bloqueantes, sem || true, ausência de token Codecov reportada como SKIPPED e upload configurado para reportar falha própria.

### Bloco 24 — linhas 324–340
Documenta e implementa a política do ci-gate: sobreviver a falhas/skips de dependências com always() sem ressuscitar após cancelamento, rejeitar always() puro e depender de todos os requiredJobs exceto ele próprio.

### Bloco 25 — linhas 341–358
Exige marcadores do gate pós-merge para decidir diagnósticos completos, resultados de três diagnósticos, Windows e fresh-developer-flow; a ausência de qualquer marcador enfraquece o gate final.

### Bloco 26 — linhas 359–383
Protege Playwright/package E2E: forbidOnly em CI, fullyParallel, retries zero em CI, reporter de gate, runner de grupos, hooks de fixtures e verificador do plano via scripts npm exatos.

### Bloco 27 — linhas 384–413
Valida o plano E2E estruturalmente: exatamente cinco grupos, IDs/contagens/workers esperados, rejeição de grupo inesperado e soma expectedTests exatamente igual ao baseline e2e.minTests.

### Bloco 28 — linhas 414–418
Exige que verify-e2e-shard-plan.js continue contendo três invariantes textuais ligados a cobertura exata, duplicidade e testes sem grupo.

### Bloco 29 — linhas 419–438
Protege o runner Jest e a partição unit/integration: alias test:ci, detecção de worker forçado, marcador da prova de partição, scripts unit/integration canônicos e presença do self-test de worker no workflow.

### Bloco 30 — linhas 439–457
Protege o self-test do próprio CI Contract, ausência de --forceExit no runner e os aliases de coverage/coverage verifier/coverage self-test.

### Bloco 31 — linhas 458–478
Valida a configuração de coverage e a infraestrutura associada: provider V8, inclusão extension/**/*.js, três reporters, três invariantes no verifier e cinco cenários no self-test de coverage.

### Bloco 32 — linhas 479–493
Valida shape mínimo do baseline: seis métricas devem ser inteiros positivos; e2e.maxFlaky deve ser inteiro não-negativo. Outros campos do baseline não são validados aqui.

### Bloco 33 — linhas 494–500
Protege o reporter E2E por marcadores que preservam tentativas/flaky e reprovação de estados terminais failed/timedOut/interrupted.

### Bloco 34 — linhas 501–508
Finaliza o gate: se problems não estiver vazio, imprime cabeçalho e todos os problemas e encerra com código 1; caso contrário imprime a mensagem única de aprovação. A linha 508 é o fim físico do arquivo, sem newline terminal.

## 10. Verificação final desta Bíblia

- SHA do fonte reconfirmado: `636e4bfbaa0646cd8259e1f27f09004a92541294`.
- Fonte integral incorporada: **sim**.
- Linhas/posições cobertas: **508/508**, sem newline terminal.
- Faixas documentais: **34**, contíguas, sem gaps e sem overlap.
- Self-test real lido integralmente e três provas diretas identificadas.
- Consumers/wiring `package.json` + `ci.yml` cruzados.
- Matriz atual observada: **23** regressões.
- Plano E2E atual observado: **5** grupos, **21** testes esperados.
- Lacunas de prova não foram mascaradas; duas solicitações ao auditor foram registradas no state.
- Nenhum código, teste, fixture, workflow, config ou arquivo de outro agente foi alterado.
