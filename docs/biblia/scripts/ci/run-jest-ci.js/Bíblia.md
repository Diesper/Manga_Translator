# Bíblia técnica — scripts/ci/run-jest-ci.js

> **Estado da documentação:** ✅ MATERIALIZADA E AUTOAUDITADA PELO AGENTE 5  
> **SHA auditado:** `6d2e36a647aadeadb2b875c1b3f92df24cd2f494`  
> **Agente responsável:** AGENTE 5  
> **Tipo:** runner Node.js de Jest para CI, inventário, partição e coverage  
> **Linhas textuais:** **228**  
> **Posições documentais:** **229**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/ci/run-jest-ci.js` é o wrapper que transforma uma execução Jest em um gate de inventário e integridade. Ele deriva o inventário físico de `tests/unit/**/*.test.js` e `tests/integration/**/*.test.js`, executa o Jest real, exige relatório JSON, compara arquivos executados, aplica os pisos do baseline e transforma skipped, TODO, falhas e o warning de worker forçado em falha da CI.

No modo normal, ele também pergunta ao próprio Jest quais arquivos pertencem aos sete projects unitários e ao project `integration`; então rejeita overlap, omissões, inesperados e arquivos descobertos fora das árvores esperadas. No modo `--coverage`, reutiliza a execução principal, adiciona `--coverage`, limita a dois workers e injeta `COVERAGE_MODE=1`, mas pula a prova explícita de partição.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependências:** Node `fs`, `path`, `child_process.spawnSync`, `test-baseline.json`, `jest-worker-warning.js`, `jest.config.js`, `package.json`.
- **Consumidores:** `package.json#test:ci`, `package.json#test:coverage`, jobs `unit-and-integration`, `coverage`, portabilidade e fluxo de desenvolvedor na CI.
- **Efeitos colaterais:** cria `.ci-results/`, tenta apagar `jest-results.json` anterior, inicia processos Jest síncronos, grava/lê o relatório, reemite stderr e define exit code final.
- **Gates do próprio runner:** `verify-ci-contract.js` protege entrada por scripts, detector de worker, marcadores da partição e ausência de `--forceExit`; `verify-test-policy.js` proíbe escape hatches; `verify-jest-worker-warning-selftest.js` testa diretamente o helper de warning.

## 3. Fluxo de execução

1. resolve caminhos/config/projects/package/baseline;
2. prepara `.ci-results` e inventário físico;
3. falha cedo se não existir nenhum `.test.js`;
4. executa Jest real em CI/JSON;
5. no modo normal, prova a partição via duas consultas `--listTests`;
6. detecta warning de worker forçado;
7. exige e parseia o relatório JSON;
8. compara arquivos executados e baseline;
9. preserva erro/status do processo;
10. imprime todos os problemas e usa `process.exitCode=1`, ou aprova se o array ficar vazio.

## 4. Evidência automatizada

| Contrato | Evidência | Classificação |
|---|---|---|
| `test:ci` usa este runner | package + workflow | 🟨 EXECUTADO INDIRETAMENTE |
| `test:coverage` usa este runner com `--coverage` | package + workflow | 🟨 EXECUTADO INDIRETAMENTE |
| helper detecta warning de worker | 3 assertions em `verify-jest-worker-warning-selftest.js` | ✅ PROVADO DIRETAMENTE para o helper |
| runner chama `hasForcedWorkerExit(jestStderr)` | CI Contract + execução real | 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 |
| runner não usa `--forceExit` | CI Contract + test policy | 🟦 GATE ESTÁTICO ESPECÍFICO |
| scripts unit/integration canônicos | CI Contract + comparação no runner | 🟦 + 🟨 |
| partição real via `--listTests` | runner executado por `test:ci` | 🟨 EXECUTADO INDIRETAMENTE |
| branches negativos de overlap/ausência/JSON/spawn | nenhum self-test focal localizado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| mínimo 108 suites / 848 testes | baseline aplicado ao relatório real | 🟨 EXECUTADO INDIRETAMENTE |
| zero skipped / zero TODO | baseline aplicado ao relatório real | 🟨 EXECUTADO INDIRETAMENTE |
| JSON malformado e resultado stale | nenhuma prova focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| timeout do processo Jest | não há timeout local explícito | ⚠️ SEM POLÍTICA/PROVA ESPECÍFICA |

## 5. Invariantes

1. `test:ci` e `test:coverage` devem continuar delegando a este runner.
2. nenhum escape hatch como `--forceExit` ou `--passWithNoTests` pode entrar no fluxo.
3. todo `.test.js` físico de unit/integration deve aparecer no relatório.
4. no modo normal, unit e integration devem formar uma partição sem overlap.
5. os aliases npm unit/integration devem continuar alinhados aos projects canônicos.
6. suites/testes não podem cair abaixo do baseline atual sem alteração explícita.
7. skipped e TODO permanecem limitados pelos máximos do baseline, atualmente zero.
8. warning de worker forçado deve reprovar a execução mesmo se Jest retornar zero.
9. relatório ausente deve falhar.
10. falhas do JSON ou do processo Jest precisam produzir gate vermelho.
11. coverage mantém o inventário principal e é seguido por `verify-coverage.js`.

## 6. Casos-limite, riscos e análise crítica

- **Resultado stale:** a remoção anterior engole erro; falta prova focal de que um arquivo antigo nunca possa contaminar cenário anômalo.
- **JSON truncado/malformado:** o parse final não tem `try/catch`; é fail-closed por exceção, mas com diagnóstico não controlado.
- **Timeout:** os `spawnSync` não recebem timeout; um hang depende de política externa do job/plataforma.
- **Padrão de teste:** o inventário aceita apenas `.test.js`; o config também usa esse padrão, mas não foi localizado gate que rejeite introdução acidental de `.spec.js`.
- **Coverage assimétrico:** pula a prova explícita de partição e dos aliases, embora ainda exija todos os `.test.js` físicos no relatório.
- **Literal de worker:** a detecção depende da frase inglesa atual do Jest; o helper é diretamente testado apenas para esse literal.
- **`unitSet` sem uso:** criado na prova de partição, mas nenhum consumidor posterior foi localizado; é ruído/vestígio, não defeito funcional comprovado.
- **Ponto forte:** o gate não depende só do exit code; cruza filesystem, descoberta do Jest, relatório estruturado, baseline e stderr.

## 7. Solicitações ao auditor

Persistidas em `docs/biblia/.state/075.json`:
- **075-001 — TEST_REQUIRED:** self-test focal do runner real para branches negativos.
- **075-002 — ROBUSTNESS_REVIEW — HIGH:** resultado stale e JSON malformado.
- **075-003 — CI_POLICY_REVIEW:** timeout de Jest/coverage.
- **075-004 — CONTRACT_REVIEW:** assimetria de coverage e naming `.test.js`.

## 8. Fonte integral exata

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const baseline = require('./data/test-baseline.json');
const { hasForcedWorkerExit } = require('./jest-worker-warning');

const repoRoot = path.resolve(__dirname, '../..');
const testsRoot = path.join(repoRoot, 'tests');
const resultDir = path.join(repoRoot, '.ci-results');
const resultFile = path.join(resultDir, 'jest-results.json');
const coverageRequested = process.argv.includes('--coverage');
const jestConfig = path.join(repoRoot, 'jest.config.js');
const unitProjects = ['background', 'gtc', 'content-scripts', 'popup', 'reader', 'manifest', 'shared-ui'];
const integrationProjects = ['integration'];
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function normalize(file) {
  return path.resolve(file).replace(/\\/g, '/');
}

fs.mkdirSync(resultDir, { recursive: true });
try { fs.rmSync(resultFile, { force: true }); } catch (_error) {}

const expectedFiles = [
  ...walk(path.join(testsRoot, 'unit')),
  ...walk(path.join(testsRoot, 'integration')),
]
  .filter((file) => file.endsWith('.test.js'))
  .map(normalize)
  .sort();

if (expectedFiles.length === 0) {
  console.error('CI/Jest: nenhum arquivo .test.js encontrado em unit/ ou integration/.');
  process.exit(1);
}

const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');

function listProjectFiles(projects) {
  const proc = spawnSync(process.execPath, [
    jestBin,
    '--config', jestConfig,
    '--listTests',
    '--json',
    '--selectProjects',
    ...projects,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env },
  });

  if (proc.error) {
    throw new Error('Falha ao listar projetos Jest ' + projects.join(', ') + ': ' + proc.error.message);
  }
  if (proc.status !== 0) {
    throw new Error(
      'Jest --listTests falhou para ' + projects.join(', ') +
      ' com código ' + String(proc.status) + ':\n' + String(proc.stderr || '')
    );
  }

  let files;
  try {
    files = JSON.parse(String(proc.stdout || '[]'));
  } catch (error) {
    throw new Error(
      'Saída inválida de Jest --listTests para ' + projects.join(', ') +
      ': ' + error.message + '\n' + String(proc.stdout || '')
    );
  }
  return files.map(normalize).sort();
}
const args = [
  jestBin,
  '--config', jestConfig,
  '--ci',
  '--json',
  '--outputFile', resultFile,
];
if (coverageRequested) {
  args.push('--coverage');
  // V8 coverage aumenta significativamente CPU/memória por worker. Limitar a
  // concorrência torna o gate determinístico sem aumentar timeouts funcionais.
  args.push('--maxWorkers=2');
}

const run = spawnSync(process.execPath, args, {
  cwd: repoRoot,
  // Jest escreve o aviso no stderr mesmo quando retorna status 0.
  stdio: ['inherit', 'inherit', 'pipe'],
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: {
    ...process.env,
    ...(coverageRequested ? { COVERAGE_MODE: '1' } : {}),
  },
});
const jestStderr = run.stderr || '';
if (jestStderr) process.stderr.write(jestStderr);

const problems = [];

if (!coverageRequested) {
  try {
    const unitFiles = listProjectFiles(unitProjects);
    const integrationFiles = listProjectFiles(integrationProjects);
    const unitSet = new Set(unitFiles);
    const integrationSet = new Set(integrationFiles);
    const overlap = unitFiles.filter((file) => integrationSet.has(file));
    const union = [...new Set([...unitFiles, ...integrationFiles])].sort();
    const missingFromPartition = expectedFiles.filter((file) => !union.includes(file));
    const unexpectedInPartition = union.filter((file) => !expectedFiles.includes(file));

    if (overlap.length) {
      problems.push(
        'Partição Jest possui arquivo(s) em unit e integration ao mesmo tempo:\n' +
        overlap.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
      );
    }
    if (missingFromPartition.length || unexpectedInPartition.length) {
      problems.push(
        'Partição Jest unit + integration não corresponde ao inventário total.' +
        (missingFromPartition.length
          ? '\nAusentes:\n' + missingFromPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
          : '') +
        (unexpectedInPartition.length
          ? '\nInesperados:\n' + unexpectedInPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
          : '')
      );
    }
    if (unitFiles.some((file) => !file.includes('/tests/unit/'))) {
      problems.push('test:unit descobre arquivo fora de tests/unit/.');
    }
    if (integrationFiles.some((file) => !file.includes('/tests/integration/'))) {
      problems.push('test:integration descobre arquivo fora de tests/integration/.');
    }

    const expectedUnitCommand =
      'jest --config jest.config.js --selectProjects ' + unitProjects.join(' ');
    const expectedIntegrationCommand =
      'jest --config jest.config.js --selectProjects integration';
    if (pkg.scripts['test:unit'] !== expectedUnitCommand) {
      problems.push('package.json#test:unit não corresponde aos projetos unitários canônicos.');
    }
    if (pkg.scripts['test:integration'] !== expectedIntegrationCommand) {
      problems.push('package.json#test:integration não aponta exclusivamente para integration.');
    }

    console.log(
      '[CI/Jest Partition] unitFiles=' + String(unitFiles.length) +
      ', integrationFiles=' + String(integrationFiles.length) +
      ', union=' + String(union.length) +
      ', expected=' + String(expectedFiles.length)
    );
  } catch (error) {
    problems.push('Falha ao provar partição unit/integration: ' + error.message);
  }
}
if (hasForcedWorkerExit(jestStderr)) {
  problems.push('Um worker Jest precisou ser encerrado à força; corrigir os recursos pendentes.');
}
if (!fs.existsSync(resultFile)) {
  problems.push('Jest não produziu o arquivo JSON de resultados.');
} else {
  const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  const actualFiles = new Set((report.testResults || []).map((item) => normalize(item.name)));
  const missingFiles = expectedFiles.filter((file) => !actualFiles.has(file));

  if (missingFiles.length) {
    problems.push(
      'Arquivos .test.js existentes que o Jest não descobriu:\n' +
      missingFiles.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')
    );
  }

  if ((report.numTotalTestSuites || 0) < baseline.jest.minSuites) {
    problems.push('Jest executou apenas ' + (report.numTotalTestSuites || 0) +
      ' suítes; mínimo protegido: ' + baseline.jest.minSuites + '.');
  }
  if ((report.numTotalTests || 0) < baseline.jest.minTests) {
    problems.push('Jest executou apenas ' + (report.numTotalTests || 0) +
      ' testes; mínimo protegido: ' + baseline.jest.minTests + '.');
  }
  if ((report.numPendingTests || 0) > baseline.jest.maxSkipped) {
    problems.push('Jest possui ' + report.numPendingTests +
      ' teste(s) skipped; máximo permitido: ' + baseline.jest.maxSkipped + '.');
  }
  if ((report.numTodoTests || 0) > baseline.jest.maxTodo) {
    problems.push('Jest possui ' + report.numTodoTests +
      ' teste(s) TODO; máximo permitido: ' + baseline.jest.maxTodo + '.');
  }
  if ((report.numFailedTests || 0) > 0 ||
      (report.numFailedTestSuites || 0) > 0 ||
      report.success === false) {
    problems.push('O relatório JSON do Jest contém falhas.');
  }

  console.log('[CI/Jest] suites=' + (report.numTotalTestSuites || 0) +
    ', testes=' + (report.numTotalTests || 0) +
    ', skipped=' + (report.numPendingTests || 0) +
    ', todo=' + (report.numTodoTests || 0) +
    ', arquivos=' + actualFiles.size + '/' + expectedFiles.length);
}

if (run.error) problems.push('Falha ao iniciar Jest: ' + run.error.message);
if (run.status !== 0) problems.push('Jest terminou com código ' + String(run.status) + '.');

if (problems.length) {
  console.error('\nGate de inventário do Jest falhou:');
  for (const problem of problems) console.error('- ' + problem);
  // stderr pode ser um pipe assíncrono no GitHub Actions. process.exit()
  // descartaria o fim do relatório, inclusive o aviso que motivou a falha.
  process.exitCode = 1;
} else {
  console.log('Gate de inventário do Jest aprovado usando ' + jestConfig + '.');
}
```

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:** `'use strict';`

**O que faz:** Ativa strict mode para o módulo CommonJS.

**Como faz:** A diretiva literal aparece antes de imports e afeta todo o arquivo.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE em toda invocação do runner.

### Linha/posição 2

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 3

**Fonte:** `const fs = require('fs');`

**O que faz:** Importa `fs`.

**Como faz:** O módulo é usado para inventário, criação/limpeza de artefatos e leitura de JSON/package.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 4

**Fonte:** `const path = require('path');`

**O que faz:** Importa `path`.

**Como faz:** É usado para construir caminhos portáveis e relativos.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 5

**Fonte:** `const { spawnSync } = require('child_process');`

**O que faz:** Importa `spawnSync`.

**Como faz:** É o mecanismo de execução do Jest real e das listagens de projects.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem self-test focal de erro/hang.

### Linha/posição 6

**Fonte:** `const baseline = require('./data/test-baseline.json');`

**O que faz:** Carrega o baseline canônico.

**Como faz:** Os campos `baseline.jest.*` governam mínimos/máximos no relatório.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; o CI Contract valida sanidade de campos-base.

### Linha/posição 7

**Fonte:** `const { hasForcedWorkerExit } = require('./jest-worker-warning');`

**O que faz:** Importa o detector de worker forçado.

**Como faz:** `hasForcedWorkerExit` recebe o stderr da execução principal.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ✅ O helper é provado diretamente por `verify-jest-worker-warning-selftest.js`; integração do runner é 🟨.

### Linha/posição 8

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 9

**Fonte:** `const repoRoot = path.resolve(__dirname, '../..');`

**O que faz:** Resolve a raiz do repositório.

**Como faz:** Sobe dois níveis a partir de `scripts/ci`.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 10

**Fonte:** `const testsRoot = path.join(repoRoot, 'tests');`

**O que faz:** Define `testsRoot`.

**Como faz:** Une a raiz do repo a `tests`.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 11

**Fonte:** `const resultDir = path.join(repoRoot, '.ci-results');`

**O que faz:** Define `.ci-results`.

**Como faz:** Centraliza artefatos internos do gate fora das árvores de testes.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; `.gitignore` ignora o diretório.

### Linha/posição 12

**Fonte:** `const resultFile = path.join(resultDir, 'jest-results.json');`

**O que faz:** Define `jest-results.json`.

**Como faz:** É passado a Jest via `--outputFile` e lido depois.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ stale/malformado sem prova focal.

### Linha/posição 13

**Fonte:** `const coverageRequested = process.argv.includes('--coverage');`

**O que faz:** Detecta `--coverage`.

**Como faz:** Usa `process.argv.includes('--coverage')`.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE por `npm run test:coverage`.

### Linha/posição 14

**Fonte:** `const jestConfig = path.join(repoRoot, 'jest.config.js');`

**O que faz:** Resolve `jest.config.js`.

**Como faz:** Força execução/listagem a usar o mesmo config absoluto.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 15

**Fonte:** `const unitProjects = ['background', 'gtc', 'content-scripts', 'popup', 'reader', 'manifest', 'shared-ui'];`

**O que faz:** Declara sete projects unitários canônicos.

**Como faz:** A lista alimenta `--selectProjects` e a string esperada de `test:unit`.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO adicional em `verify-ci-contract.js`.

### Linha/posição 16

**Fonte:** `const integrationProjects = ['integration'];`

**O que faz:** Declara o project `integration`.

**Como faz:** Mantém a integração separada dos sete unitários.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; script de integration é protegido estaticamente.

### Linha/posição 17

**Fonte:** `const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));`

**O que faz:** Lê e parseia `package.json`.

**Como faz:** Permite conferir aliases npm reais do checkout.

**Por que foi implementado dessa forma:** Centraliza as entradas que governam todo o gate antes de qualquer efeito colateral.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; 🟦 CI Contract também protege scripts críticos.

### Linha/posição 18

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 19

**Fonte:** `function walk(dir) {`

**O que faz:** Integra o bloco **inventário recursivo**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `function walk(dir) {` é avaliada em conjunto com as linhas adjacentes para implementa a caminhada recursiva usada para descobrir arquivos físicos nas árvores de testes..

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 20

**Fonte:** `  if (!fs.existsSync(dir)) return [];`

**O que faz:** Retorna lista vazia quando o diretório não existe.

**Como faz:** Evita `readdirSync` sobre caminho ausente.

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ branch negativo sem self-test focal.

### Linha/posição 21

**Fonte:** `  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {`

**O que faz:** Lê entradas com `withFileTypes` e usa `flatMap`.

**Como faz:** Permite distinguir diretórios e achatar a recursão.

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 22

**Fonte:** `    const full = path.join(dir, entry.name);`

**O que faz:** Constrói o caminho completo da entrada.

**Como faz:** Combina diretório corrente e nome da entrada.

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 23

**Fonte:** `    return entry.isDirectory() ? walk(full) : [full];`

**O que faz:** Recorre em diretórios ou retorna arquivo folha.

**Como faz:** Produz uma lista plana de arquivos.

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 24

**Fonte:** `  });`

**O que faz:** Integra o bloco **inventário recursivo**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `});` é avaliada em conjunto com as linhas adjacentes para implementa a caminhada recursiva usada para descobrir arquivos físicos nas árvores de testes..

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 25

**Fonte:** `}`

**O que faz:** Integra o bloco **inventário recursivo**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para implementa a caminhada recursiva usada para descobrir arquivos físicos nas árvores de testes..

**Por que foi implementado dessa forma:** O gate precisa derivar o inventário do checkout real em vez de confiar apenas na configuração declarativa do Jest.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 26

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 27

**Fonte:** `function normalize(file) {`

**O que faz:** Integra o bloco **normalização de caminho**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `function normalize(file) {` é avaliada em conjunto com as linhas adjacentes para normaliza caminhos absolutos e separadores para permitir comparações determinísticas entre sistemas..

**Por que foi implementado dessa forma:** Windows e POSIX representam separadores de forma diferente; a comparação precisa de uma forma canônica.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 28

**Fonte:** `  return path.resolve(file).replace(/\\/g, '/');`

**O que faz:** Resolve caminho absoluto e troca `\` por `/`.

**Como faz:** Cria representação canônica para Windows/POSIX.

**Por que foi implementado dessa forma:** Windows e POSIX representam separadores de forma diferente; a comparação precisa de uma forma canônica.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; job Windows executa `test:ci`.

### Linha/posição 29

**Fonte:** `}`

**O que faz:** Integra o bloco **normalização de caminho**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para normaliza caminhos absolutos e separadores para permitir comparações determinísticas entre sistemas..

**Por que foi implementado dessa forma:** Windows e POSIX representam separadores de forma diferente; a comparação precisa de uma forma canônica.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 30

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 31

**Fonte:** `fs.mkdirSync(resultDir, { recursive: true });`

**O que faz:** Cria `.ci-results` recursivamente.

**Como faz:** Garante diretório de saída em checkout limpo.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 32

**Fonte:** `try { fs.rmSync(resultFile, { force: true }); } catch (_error) {}`

**O que faz:** Tenta apagar resultado anterior e engole qualquer erro.

**Como faz:** `rmSync(...,{force:true})` está dentro de `try/catch` vazio.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; audit_request `075-002`.

### Linha/posição 33

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 34

**Fonte:** `const expectedFiles = [`

**O que faz:** Integra o bloco **preparo do resultado e inventário esperado**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `const expectedFiles = [` é avaliada em conjunto com as linhas adjacentes para prepara `.ci-results`, tenta remover resultado anterior, constrói `expectedfiles` a partir de unit/integration e falha se o inventário ficar vazio..

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 35

**Fonte:** `  ...walk(path.join(testsRoot, 'unit')),`

**O que faz:** Adiciona arquivos encontrados em `tests/unit`.

**Como faz:** Usa o helper recursivo `walk`.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 36

**Fonte:** `  ...walk(path.join(testsRoot, 'integration')),`

**O que faz:** Adiciona arquivos encontrados em `tests/integration`.

**Como faz:** Usa o mesmo helper para a segunda árvore.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 37

**Fonte:** `]`

**O que faz:** Integra o bloco **preparo do resultado e inventário esperado**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `]` é avaliada em conjunto com as linhas adjacentes para prepara `.ci-results`, tenta remover resultado anterior, constrói `expectedfiles` a partir de unit/integration e falha se o inventário ficar vazio..

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 38

**Fonte:** `  .filter((file) => file.endsWith('.test.js'))`

**O que faz:** Filtra exclusivamente nomes terminados em `.test.js`.

**Como faz:** Define a convenção física protegida pelo inventário.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO da proibição de `.spec.js`; audit_request `075-004`.

### Linha/posição 39

**Fonte:** `  .map(normalize)`

**O que faz:** Normaliza todos os caminhos esperados.

**Como faz:** Aplica `normalize` a cada arquivo físico.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 40

**Fonte:** `  .sort();`

**O que faz:** Ordena o inventário esperado.

**Como faz:** Estabiliza logs/comparações independentemente da ordem do filesystem.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 41

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 42

**Fonte:** `if (expectedFiles.length === 0) {`

**O que faz:** Detecta inventário físico vazio.

**Como faz:** Abre early-fail antes de chamar Jest.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do branch negativo.

### Linha/posição 43

**Fonte:** `  console.error('CI/Jest: nenhum arquivo .test.js encontrado em unit/ ou integration/.');`

**O que faz:** Emite diagnóstico de inventário zero.

**Como faz:** Escreve mensagem específica em stderr.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 44

**Fonte:** `  process.exit(1);`

**O que faz:** Encerra com status 1 se não há testes.

**Como faz:** Usa `process.exit(1)`.

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do early exit.

### Linha/posição 45

**Fonte:** `}`

**O que faz:** Integra o bloco **preparo do resultado e inventário esperado**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para prepara `.ci-results`, tenta remover resultado anterior, constrói `expectedfiles` a partir de unit/integration e falha se o inventário ficar vazio..

**Por que foi implementado dessa forma:** Evita aprovar uma execução sem base física de testes e reduz risco de reutilizar resultado anterior.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 46

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 47

**Fonte:** `const jestBin = path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');`

**O que faz:** Resolve o script local do Jest.

**Como faz:** Aponta diretamente para `node_modules/jest/bin/jest.js`.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 48

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 49

**Fonte:** `function listProjectFiles(projects) {`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `function listProjectFiles(projects) {` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 50

**Fonte:** `  const proc = spawnSync(process.execPath, [`

**O que faz:** Inicia processo Node para `--listTests`.

**Como faz:** Chama `spawnSync(process.execPath, [...])`.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem self-test focal de spawn.

### Linha/posição 51

**Fonte:** `    jestBin,`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `jestBin,` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 52

**Fonte:** `    '--config', jestConfig,`

**O que faz:** Força o config canônico na listagem.

**Como faz:** Passa `--config` e o caminho absoluto.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 53

**Fonte:** `    '--listTests',`

**O que faz:** Ativa `--listTests`.

**Como faz:** Consulta descoberta sem executar testes.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 54

**Fonte:** `    '--json',`

**O que faz:** Solicita JSON da listagem.

**Como faz:** Facilita parse determinístico.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 55

**Fonte:** `    '--selectProjects',`

**O que faz:** Ativa seleção explícita de projects.

**Como faz:** É seguido pela expansão do array recebido.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 56

**Fonte:** `    ...projects,`

**O que faz:** Expande os nomes dos projects.

**Como faz:** Passa cada project como argumento Jest.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 57

**Fonte:** `  ], {`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `], {` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 58

**Fonte:** `    cwd: repoRoot,`

**O que faz:** Fixa `cwd` na raiz do repo.

**Como faz:** Evita descoberta relativa ao diretório do chamador.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 59

**Fonte:** `    encoding: 'utf8',`

**O que faz:** Pede saída UTF-8 em strings.

**Como faz:** Permite `JSON.parse` direto de stdout.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 60

**Fonte:** `    maxBuffer: 16 * 1024 * 1024,`

**O que faz:** Limita buffers de listagem a 16 MiB.

**Como faz:** Evita buffer ilimitado no processo síncrono.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO de overflow.

### Linha/posição 61

**Fonte:** `    env: { ...process.env },`

**O que faz:** Propaga o ambiente atual à listagem.

**Como faz:** Não injeta `COVERAGE_MODE` nessa consulta.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 62

**Fonte:** `  });`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `});` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 63

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 64

**Fonte:** `  if (proc.error) {`

**O que faz:** Detecta `proc.error`.

**Como faz:** Converte falha de criação/execução do filho em exceção contextual.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 65

**Fonte:** `    throw new Error('Falha ao listar projetos Jest ' + projects.join(', ') + ': ' + proc.error.message);`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `throw new Error('Falha ao listar projetos Jest ' + projects.join(', ') + ': ' + proc.error.message);` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 66

**Fonte:** `  }`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 67

**Fonte:** `  if (proc.status !== 0) {`

**O que faz:** Detecta status não zero da listagem.

**Como faz:** Evita tratar stdout parcial como inventário válido.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 68

**Fonte:** `    throw new Error(`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `throw new Error(` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 69

**Fonte:** `      'Jest --listTests falhou para ' + projects.join(', ') +`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'Jest --listTests falhou para ' + projects.join(', ') +` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 70

**Fonte:** `      ' com código ' + String(proc.status) + ':\n' + String(proc.stderr || '')`

**O que faz:** Inclui status e stderr no erro da listagem.

**Como faz:** Preserva diagnóstico do Jest.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 71

**Fonte:** `    );`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 72

**Fonte:** `  }`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 73

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 74

**Fonte:** `  let files;`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `let files;` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 75

**Fonte:** `  try {`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `try {` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 76

**Fonte:** `    files = JSON.parse(String(proc.stdout || '[]'));`

**O que faz:** Parseia stdout da listagem como JSON.

**Como faz:** Usa `[]` quando stdout é vazio.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; JSON inválido tem tratamento local.

### Linha/posição 77

**Fonte:** `  } catch (error) {`

**O que faz:** Captura erro de parse da listagem.

**Como faz:** Evita exception crua e acrescenta contexto.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ branch negativo sem self-test focal.

### Linha/posição 78

**Fonte:** `    throw new Error(`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `throw new Error(` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 79

**Fonte:** `      'Saída inválida de Jest --listTests para ' + projects.join(', ') +`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'Saída inválida de Jest --listTests para ' + projects.join(', ') +` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 80

**Fonte:** `      ': ' + error.message + '\n' + String(proc.stdout || '')`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `': ' + error.message + '\n' + String(proc.stdout || '')` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 81

**Fonte:** `    );`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 82

**Fonte:** `  }`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 83

**Fonte:** `  return files.map(normalize).sort();`

**O que faz:** Normaliza e ordena a lista devolvida pelo Jest.

**Como faz:** Produz formato comparável ao inventário físico.

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 84

**Fonte:** `}`

**O que faz:** Integra o bloco **listagem de projects Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para define o helper que executa jest com `--listtests --json --selectprojects`, trata falhas e retorna caminhos normalizados..

**Por que foi implementado dessa forma:** A prova de partição precisa perguntar ao próprio Jest o que cada project realmente descobre.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 85

**Fonte:** `const args = [`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `const args = [` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 86

**Fonte:** `  jestBin,`

**O que faz:** Adiciona o binário Jest à execução principal.

**Como faz:** O processo Node recebe o arquivo JS do Jest como primeiro argumento.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 87

**Fonte:** `  '--config', jestConfig,`

**O que faz:** Fixa `--config` na execução principal.

**Como faz:** Garante alinhamento com a listagem e com o config auditado.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 88

**Fonte:** `  '--ci',`

**O que faz:** Ativa `--ci`.

**Como faz:** Coloca o Jest em comportamento apropriado ao pipeline.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 89

**Fonte:** `  '--json',`

**O que faz:** Solicita relatório JSON.

**Como faz:** É necessário para pós-validação estruturada.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 90

**Fonte:** `  '--outputFile', resultFile,`

**O que faz:** Define `--outputFile` para `jest-results.json`.

**Como faz:** Conecta execução principal ao artefato lido depois.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 91

**Fonte:** `];`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `];` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 92

**Fonte:** `if (coverageRequested) {`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `if (coverageRequested) {` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 93

**Fonte:** `  args.push('--coverage');`

**O que faz:** Adiciona `--coverage` quando solicitado.

**Como faz:** Aciona geração de coverage pelo Jest.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 94

**Fonte:** `  // V8 coverage aumenta significativamente CPU/memória por worker. Limitar a`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, registra a justificativa de manutenção.

**Como faz:** A linha `// V8 coverage aumenta significativamente CPU/memória por worker. Limitar a` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 95

**Fonte:** `  // concorrência torna o gate determinístico sem aumentar timeouts funcionais.`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, registra a justificativa de manutenção.

**Como faz:** A linha `// concorrência torna o gate determinístico sem aumentar timeouts funcionais.` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 96

**Fonte:** `  args.push('--maxWorkers=2');`

**O que faz:** Adiciona `--maxWorkers=2` em coverage.

**Como faz:** Reduz concorrência do modo V8 mais pesado.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem teste focal da CLI final.

### Linha/posição 97

**Fonte:** `}`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 98

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 99

**Fonte:** `const run = spawnSync(process.execPath, args, {`

**O que faz:** Inicia a execução principal síncrona do Jest.

**Como faz:** Usa Node + argumentos montados.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 100

**Fonte:** `  cwd: repoRoot,`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `cwd: repoRoot,` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 101

**Fonte:** `  // Jest escreve o aviso no stderr mesmo quando retorna status 0.`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, registra a justificativa de manutenção.

**Como faz:** A linha `// Jest escreve o aviso no stderr mesmo quando retorna status 0.` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 102

**Fonte:** `  stdio: ['inherit', 'inherit', 'pipe'],`

**O que faz:** Herda stdin/stdout e captura stderr.

**Como faz:** Permite inspecionar o warning sem esconder stdout do Jest.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 103

**Fonte:** `  encoding: 'utf8',`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `encoding: 'utf8',` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 104

**Fonte:** `  maxBuffer: 32 * 1024 * 1024,`

**O que faz:** Limita stderr capturado a 32 MiB.

**Como faz:** Define `maxBuffer` da execução principal.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO de overflow.

### Linha/posição 105

**Fonte:** `  env: {`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `env: {` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 106

**Fonte:** `    ...process.env,`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `...process.env,` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 107

**Fonte:** `    ...(coverageRequested ? { COVERAGE_MODE: '1' } : {}),`

**O que faz:** Injeta `COVERAGE_MODE=1` somente em coverage.

**Como faz:** Faz `jest.config.js` habilitar configuração específica.

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 108

**Fonte:** `  },`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `},` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 109

**Fonte:** `});`

**O que faz:** Integra o bloco **montagem e execução principal do Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `});` é avaliada em conjunto com as linhas adjacentes para monta a cli principal, habilita coverage quando pedido, limita workers nesse modo e executa o jest real capturando stderr..

**Por que foi implementado dessa forma:** O runner precisa preservar exit code/relatório reais e ainda inspecionar warnings que não tornam o Jest vermelho sozinhos.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 110

**Fonte:** `const jestStderr = run.stderr || '';`

**O que faz:** Converte stderr falsy em string vazia.

**Como faz:** Prepara entrada segura para detector/log.

**Por que foi implementado dessa forma:** Mantém observabilidade do Jest sem abrir mão da validação adicional do wrapper.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 111

**Fonte:** `if (jestStderr) process.stderr.write(jestStderr);`

**O que faz:** Reemite o stderr capturado.

**Como faz:** Mantém warnings/falhas visíveis no log da CI.

**Por que foi implementado dessa forma:** Mantém observabilidade do Jest sem abrir mão da validação adicional do wrapper.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 112

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 113

**Fonte:** `const problems = [];`

**O que faz:** Inicializa `problems`.

**Como faz:** Todas as violações posteriores convergem nesse array.

**Por que foi implementado dessa forma:** Mantém observabilidade do Jest sem abrir mão da validação adicional do wrapper.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 114

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 115

**Fonte:** `if (!coverageRequested) {`

**O que faz:** Pula a prova de partição em coverage.

**Como faz:** O bloco roda somente com `!coverageRequested`.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ ASSIMETRIA DOCUMENTADA; audit_request `075-004`.

### Linha/posição 116

**Fonte:** `  try {`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `try {` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 117

**Fonte:** `    const unitFiles = listProjectFiles(unitProjects);`

**O que faz:** Lista arquivos dos projects unitários pelo Jest real.

**Como faz:** Chama `listProjectFiles(unitProjects)`.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; 🟦 CI Contract exige esse marcador.

### Linha/posição 118

**Fonte:** `    const integrationFiles = listProjectFiles(integrationProjects);`

**O que faz:** Lista arquivos do project integration.

**Como faz:** Chama `listProjectFiles(integrationProjects)`.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 119

**Fonte:** `    const unitSet = new Set(unitFiles);`

**O que faz:** Cria `unitSet`.

**Como faz:** O valor não é usado em nenhuma linha posterior do arquivo.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM CONSUMO POSTERIOR OBSERVADO; possível estado vestigial.

### Linha/posição 120

**Fonte:** `    const integrationSet = new Set(integrationFiles);`

**O que faz:** Cria `integrationSet`.

**Como faz:** É usado na detecção de overlap.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 121

**Fonte:** `    const overlap = unitFiles.filter((file) => integrationSet.has(file));`

**O que faz:** Calcula overlap entre unit e integration.

**Como faz:** Filtra unitários presentes no set de integration.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem self-test negativo focal.

### Linha/posição 122

**Fonte:** `    const union = [...new Set([...unitFiles, ...integrationFiles])].sort();`

**O que faz:** Constrói a união deduplicada e ordenada.

**Como faz:** Usa `Set` sobre as duas listas.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 123

**Fonte:** `    const missingFromPartition = expectedFiles.filter((file) => !union.includes(file));`

**O que faz:** Calcula esperados ausentes da partição.

**Como faz:** Compara inventário físico contra união Jest.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 124

**Fonte:** `    const unexpectedInPartition = union.filter((file) => !expectedFiles.includes(file));`

**O que faz:** Calcula itens inesperados na partição.

**Como faz:** Compara união Jest contra inventário físico.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 125

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 126

**Fonte:** `    if (overlap.length) {`

**O que faz:** Abre falha quando há overlap.

**Como faz:** Impede dupla classificação do mesmo arquivo.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE NEGATIVO FOCAL.

### Linha/posição 127

**Fonte:** `      problems.push(`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push(` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 128

**Fonte:** `        'Partição Jest possui arquivo(s) em unit e integration ao mesmo tempo:\n' +`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'Partição Jest possui arquivo(s) em unit e integration ao mesmo tempo:\n' +` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 129

**Fonte:** `        overlap.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `overlap.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 130

**Fonte:** `      );`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 131

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 132

**Fonte:** `    if (missingFromPartition.length || unexpectedInPartition.length) {`

**O que faz:** Abre falha quando união difere do inventário.

**Como faz:** Cobre ausentes e inesperados.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE NEGATIVO FOCAL.

### Linha/posição 133

**Fonte:** `      problems.push(`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push(` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 134

**Fonte:** `        'Partição Jest unit + integration não corresponde ao inventário total.' +`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'Partição Jest unit + integration não corresponde ao inventário total.' +` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 135

**Fonte:** `        (missingFromPartition.length`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `(missingFromPartition.length` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 136

**Fonte:** `          ? '\nAusentes:\n' + missingFromPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `? '\nAusentes:\n' + missingFromPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 137

**Fonte:** `          : '') +`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `: '') +` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 138

**Fonte:** `        (unexpectedInPartition.length`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `(unexpectedInPartition.length` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 139

**Fonte:** `          ? '\nInesperados:\n' + unexpectedInPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `? '\nInesperados:\n' + unexpectedInPartition.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 140

**Fonte:** `          : '')`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `: '')` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 141

**Fonte:** `      );`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 142

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 143

**Fonte:** `    if (unitFiles.some((file) => !file.includes('/tests/unit/'))) {`

**O que faz:** Detecta project unitário descobrindo fora de `tests/unit`.

**Como faz:** Usa o caminho normalizado para fronteira estrutural.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE NEGATIVO FOCAL.

### Linha/posição 144

**Fonte:** `      problems.push('test:unit descobre arquivo fora de tests/unit/.');`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('test:unit descobre arquivo fora de tests/unit/.');` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 145

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 146

**Fonte:** `    if (integrationFiles.some((file) => !file.includes('/tests/integration/'))) {`

**O que faz:** Detecta integration descobrindo fora de `tests/integration`.

**Como faz:** Aplica fronteira estrutural equivalente.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE NEGATIVO FOCAL.

### Linha/posição 147

**Fonte:** `      problems.push('test:integration descobre arquivo fora de tests/integration/.');`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('test:integration descobre arquivo fora de tests/integration/.');` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 148

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 149

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 150

**Fonte:** `    const expectedUnitCommand =`

**O que faz:** Inicia a string esperada do script unitário.

**Como faz:** A string é derivada da lista canônica de projects.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟦 CI Contract fixa o mesmo comando.

### Linha/posição 151

**Fonte:** `      'jest --config jest.config.js --selectProjects ' + unitProjects.join(' ');`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'jest --config jest.config.js --selectProjects ' + unitProjects.join(' ');` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 152

**Fonte:** `    const expectedIntegrationCommand =`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `const expectedIntegrationCommand =` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 153

**Fonte:** `      'jest --config jest.config.js --selectProjects integration';`

**O que faz:** Define a string esperada de integration.

**Como faz:** Exige exclusivamente o project `integration`.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟦 CI Contract fixa o mesmo comando.

### Linha/posição 154

**Fonte:** `    if (pkg.scripts['test:unit'] !== expectedUnitCommand) {`

**O que faz:** Compara `package.json#test:unit`.

**Como faz:** Divergência vira problema agregado.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 execução real + 🟦 gate estático.

### Linha/posição 155

**Fonte:** `      problems.push('package.json#test:unit não corresponde aos projetos unitários canônicos.');`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('package.json#test:unit não corresponde aos projetos unitários canônicos.');` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 156

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 157

**Fonte:** `    if (pkg.scripts['test:integration'] !== expectedIntegrationCommand) {`

**O que faz:** Compara `package.json#test:integration`.

**Como faz:** Divergência vira problema agregado.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 execução real + 🟦 gate estático.

### Linha/posição 158

**Fonte:** `      problems.push('package.json#test:integration não aponta exclusivamente para integration.');`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('package.json#test:integration não aponta exclusivamente para integration.');` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 159

**Fonte:** `    }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 160

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 161

**Fonte:** `    console.log(`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `console.log(` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 162

**Fonte:** `      '[CI/Jest Partition] unitFiles=' + String(unitFiles.length) +`

**O que faz:** Inicia log de contagens da partição.

**Como faz:** Expõe unitFiles/integrationFiles/union/expected para diagnóstico.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 163

**Fonte:** `      ', integrationFiles=' + String(integrationFiles.length) +`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', integrationFiles=' + String(integrationFiles.length) +` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 164

**Fonte:** `      ', union=' + String(union.length) +`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', union=' + String(union.length) +` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 165

**Fonte:** `      ', expected=' + String(expectedFiles.length)`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', expected=' + String(expectedFiles.length)` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 166

**Fonte:** `    );`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 167

**Fonte:** `  } catch (error) {`

**O que faz:** Captura qualquer erro da prova de partição.

**Como faz:** Transforma a exceção em item de `problems`.

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem self-test focal.

### Linha/posição 168

**Fonte:** `    problems.push('Falha ao provar partição unit/integration: ' + error.message);`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('Falha ao provar partição unit/integration: ' + error.message);` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 169

**Fonte:** `  }`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 170

**Fonte:** `}`

**O que faz:** Integra o bloco **prova de partição unit/integration**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para no modo normal, lista projects unitários e integration, calcula overlap/união/ausentes/inesperados, verifica fronteiras e confere scripts npm canônicos..

**Por que foi implementado dessa forma:** Contagem total sozinha não prova que cada arquivo está exatamente em uma partição correta.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 171

**Fonte:** `if (hasForcedWorkerExit(jestStderr)) {`

**O que faz:** Detecta warning de worker forçado no stderr real.

**Como faz:** Chama o helper sobre `jestStderr`.

**Por que foi implementado dessa forma:** Exit code zero não basta para provar ausência de leak nem existência de inventário estruturado.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ✅ helper diretamente testado; 🟦 CI Contract exige a chamada; integração é 🟨.

### Linha/posição 172

**Fonte:** `  problems.push('Um worker Jest precisou ser encerrado à força; corrigir os recursos pendentes.');`

**O que faz:** Adiciona worker forçado como falha.

**Como faz:** Converte warning operacional em gate vermelho.

**Por que foi implementado dessa forma:** Exit code zero não basta para provar ausência de leak nem existência de inventário estruturado.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 173

**Fonte:** `}`

**O que faz:** Integra o bloco **worker forçado e existência do relatório**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para converte warning de worker forçado em problema e exige que o json de resultados exista..

**Por que foi implementado dessa forma:** Exit code zero não basta para provar ausência de leak nem existência de inventário estruturado.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 174

**Fonte:** `if (!fs.existsSync(resultFile)) {`

**O que faz:** Exige que `jest-results.json` exista.

**Como faz:** Usa `existsSync` após execução Jest.

**Por que foi implementado dessa forma:** Exit code zero não basta para provar ausência de leak nem existência de inventário estruturado.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ branch negativo sem self-test focal.

### Linha/posição 175

**Fonte:** `  problems.push('Jest não produziu o arquivo JSON de resultados.');`

**O que faz:** Registra ausência do relatório como problema.

**Como faz:** Mantém fail-closed sem inventário estruturado.

**Por que foi implementado dessa forma:** Exit code zero não basta para provar ausência de leak nem existência de inventário estruturado.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 176

**Fonte:** `} else {`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `} else {` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 177

**Fonte:** `  const report = JSON.parse(fs.readFileSync(resultFile, 'utf8'));`

**O que faz:** Parseia o relatório final sem try/catch local.

**Como faz:** JSON inválido/truncado causa exceção não tratada.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO; audit_request `075-002`.

### Linha/posição 178

**Fonte:** `  const actualFiles = new Set((report.testResults || []).map((item) => normalize(item.name)));`

**O que faz:** Constrói `Set` de arquivos realmente reportados.

**Como faz:** Normaliza `item.name` de cada testResult.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 179

**Fonte:** `  const missingFiles = expectedFiles.filter((file) => !actualFiles.has(file));`

**O que faz:** Calcula arquivos físicos ausentes da execução real.

**Como faz:** Filtra esperados não presentes no set do relatório.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ sem self-test negativo focal.

### Linha/posição 180

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 181

**Fonte:** `  if (missingFiles.length) {`

**O que faz:** Abre falha quando faltam arquivos.

**Como faz:** Impede verde com arquivo físico não descoberto.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE NEGATIVO FOCAL.

### Linha/posição 182

**Fonte:** `    problems.push(`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push(` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 183

**Fonte:** `      'Arquivos .test.js existentes que o Jest não descobriu:\n' +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `'Arquivos .test.js existentes que o Jest não descobriu:\n' +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 184

**Fonte:** `      missingFiles.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `missingFiles.map((file) => '  - ' + path.relative(testsRoot, file)).join('\n')` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 185

**Fonte:** `    );`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `);` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 186

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 187

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 188

**Fonte:** `  if ((report.numTotalTestSuites || 0) < baseline.jest.minSuites) {`

**O que faz:** Compara suites com `baseline.jest.minSuites`.

**Como faz:** Atualmente protege mínimo 108.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 189

**Fonte:** `    problems.push('Jest executou apenas ' + (report.numTotalTestSuites || 0) +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('Jest executou apenas ' + (report.numTotalTestSuites || 0) +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 190

**Fonte:** `      ' suítes; mínimo protegido: ' + baseline.jest.minSuites + '.');`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `' suítes; mínimo protegido: ' + baseline.jest.minSuites + '.');` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 191

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 192

**Fonte:** `  if ((report.numTotalTests || 0) < baseline.jest.minTests) {`

**O que faz:** Compara testes com `baseline.jest.minTests`.

**Como faz:** Atualmente protege mínimo 848.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 193

**Fonte:** `    problems.push('Jest executou apenas ' + (report.numTotalTests || 0) +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('Jest executou apenas ' + (report.numTotalTests || 0) +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 194

**Fonte:** `      ' testes; mínimo protegido: ' + baseline.jest.minTests + '.');`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `' testes; mínimo protegido: ' + baseline.jest.minTests + '.');` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 195

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 196

**Fonte:** `  if ((report.numPendingTests || 0) > baseline.jest.maxSkipped) {`

**O que faz:** Compara skipped com `baseline.jest.maxSkipped`.

**Como faz:** Atualmente máximo 0.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 197

**Fonte:** `    problems.push('Jest possui ' + report.numPendingTests +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('Jest possui ' + report.numPendingTests +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 198

**Fonte:** `      ' teste(s) skipped; máximo permitido: ' + baseline.jest.maxSkipped + '.');`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `' teste(s) skipped; máximo permitido: ' + baseline.jest.maxSkipped + '.');` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 199

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 200

**Fonte:** `  if ((report.numTodoTests || 0) > baseline.jest.maxTodo) {`

**O que faz:** Compara TODO com `baseline.jest.maxTodo`.

**Como faz:** Atualmente máximo 0.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 201

**Fonte:** `    problems.push('Jest possui ' + report.numTodoTests +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `problems.push('Jest possui ' + report.numTodoTests +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 202

**Fonte:** `      ' teste(s) TODO; máximo permitido: ' + baseline.jest.maxTodo + '.');`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `' teste(s) TODO; máximo permitido: ' + baseline.jest.maxTodo + '.');` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 203

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 204

**Fonte:** `  if ((report.numFailedTests || 0) > 0 ||`

**O que faz:** Inicia condição de falhas do relatório.

**Como faz:** Considera testes falhos, suites falhas ou `success === false`.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 205

**Fonte:** `      (report.numFailedTestSuites || 0) > 0 ||`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `(report.numFailedTestSuites || 0) > 0 ||` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 206

**Fonte:** `      report.success === false) {`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `report.success === false) {` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 207

**Fonte:** `    problems.push('O relatório JSON do Jest contém falhas.');`

**O que faz:** Registra falha estrutural do relatório.

**Como faz:** Converte qualquer condição anterior em problema.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 208

**Fonte:** `  }`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 209

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 210

**Fonte:** `  console.log('[CI/Jest] suites=' + (report.numTotalTestSuites || 0) +`

**O que faz:** Imprime resumo de suites/testes/skipped/TODO/arquivos.

**Como faz:** Fornece telemetria final antes da decisão.

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 211

**Fonte:** `    ', testes=' + (report.numTotalTests || 0) +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', testes=' + (report.numTotalTests || 0) +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 212

**Fonte:** `    ', skipped=' + (report.numPendingTests || 0) +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', skipped=' + (report.numPendingTests || 0) +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 213

**Fonte:** `    ', todo=' + (report.numTodoTests || 0) +`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', todo=' + (report.numTodoTests || 0) +` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 214

**Fonte:** `    ', arquivos=' + actualFiles.size + '/' + expectedFiles.length);`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `', arquivos=' + actualFiles.size + '/' + expectedFiles.length);` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 215

**Fonte:** `}`

**O que faz:** Integra o bloco **validação do relatório Jest**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para parseia o relatório, compara arquivos executados e aplica baseline de suites/testes/skipped/todo/falhas..

**Por que foi implementado dessa forma:** Impede regressões silenciosas em que a suíte encolhe ou passa verde com testes ignorados.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 216

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 217

**Fonte:** `if (run.error) problems.push('Falha ao iniciar Jest: ' + run.error.message);`

**O que faz:** Registra `run.error` como falha.

**Como faz:** Cobre erro de infraestrutura do `spawnSync`.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO.

### Linha/posição 218

**Fonte:** `if (run.status !== 0) problems.push('Jest terminou com código ' + String(run.status) + '.');`

**O que faz:** Registra status Jest não zero.

**Como faz:** Preserva a falha normal do processo filho.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; status nulo/sinal sem teste focal.

### Linha/posição 219

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

### Linha/posição 220

**Fonte:** `if (problems.length) {`

**O que faz:** Decide falha final por `problems.length`.

**Como faz:** Só aprova quando nenhuma validação acumulou problema.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 221

**Fonte:** `  console.error('\nGate de inventário do Jest falhou:');`

**O que faz:** Emite cabeçalho do gate falho.

**Como faz:** Separa diagnósticos do wrapper da saída do Jest.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 222

**Fonte:** `  for (const problem of problems) console.error('- ' + problem);`

**O que faz:** Imprime todos os problemas acumulados.

**Como faz:** Itera o array e prefixa cada item.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 223

**Fonte:** `  // stderr pode ser um pipe assíncrono no GitHub Actions. process.exit()`

**O que faz:** Integra o bloco **status do processo e decisão final**; nesta posição, registra a justificativa de manutenção.

**Como faz:** A linha `// stderr pode ser um pipe assíncrono no GitHub Actions. process.exit()` é avaliada em conjunto com as linhas adjacentes para acrescenta falhas de spawn/status, imprime todos os problemas e usa `process.exitcode=1`; sem problemas, registra aprovação..

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 224

**Fonte:** `  // descartaria o fim do relatório, inclusive o aviso que motivou a falha.`

**O que faz:** Integra o bloco **status do processo e decisão final**; nesta posição, registra a justificativa de manutenção.

**Como faz:** A linha `// descartaria o fim do relatório, inclusive o aviso que motivou a falha.` é avaliada em conjunto com as linhas adjacentes para acrescenta falhas de spawn/status, imprime todos os problemas e usa `process.exitcode=1`; sem problemas, registra aprovação..

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 225

**Fonte:** `  process.exitCode = 1;`

**O que faz:** Define `process.exitCode = 1`.

**Como faz:** Falha sem chamar `process.exit()` imediatamente.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ flush não tem self-test focal.

### Linha/posição 226

**Fonte:** `} else {`

**O que faz:** Integra o bloco **status do processo e decisão final**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `} else {` é avaliada em conjunto com as linhas adjacentes para acrescenta falhas de spawn/status, imprime todos os problemas e usa `process.exitcode=1`; sem problemas, registra aprovação..

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 227

**Fonte:** `  console.log('Gate de inventário do Jest aprovado usando ' + jestConfig + '.');`

**O que faz:** Emite mensagem final de aprovação.

**Como faz:** Inclui o caminho do config usado.

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Uma implementação que removesse esta garantia ou a substituísse por heurística menos específica poderia produzir falso verde, diagnóstico pior ou divergência entre inventário físico e Jest.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha/posição 228

**Fonte:** `}`

**O que faz:** Integra o bloco **status do processo e decisão final**; nesta posição, completa a expressão/estrutura necessária ao comportamento do bloco.

**Como faz:** A linha `}` é avaliada em conjunto com as linhas adjacentes para acrescenta falhas de spawn/status, imprime todos os problemas e usa `process.exitcode=1`; sem problemas, registra aprovação..

**Por que foi implementado dessa forma:** Agrega diagnóstico antes de encerrar e evita truncar stderr com `process.exit()` imediato.

**Por que uma implementação ingênua seria pior:** Remover ou alterar a linha isoladamente sem preservar o contrato do bloco pode quebrar sintaxe, perder diagnóstico ou enfraquecer uma verificação sem que a contagem total de testes revele o problema.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando o bloco correspondente é alcançado; nenhuma assertion focal adicional foi localizada para esta linha isolada.

### Linha/posição 229

**Fonte:** `␤ [posição vazia/newline final ou separação]`

**O que faz:** Separa visualmente blocos lógicos do runner sem gerar instrução JavaScript.

**Como faz:** É uma linha vazia preservada no fonte; não altera AST nem estado de execução.

**Por que foi implementado dessa forma:** O arquivo concentra descoberta, execução, partição e pós-validação; separar fases reduz ambiguidade de revisão.

**Por que uma implementação ingênua seria pior:** Compactar tudo em um bloco contínuo não quebra o runtime, mas dificulta auditoria e manutenção.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — efeito apenas textual.

## 10. Verificação final desta Bíblia

- SHA reconfirmado contra a reserva: **sim** — `6d2e36a647aadeadb2b875c1b3f92df24cd2f494`.
- Fonte integral reproduzida: **sim**.
- 228 linhas textuais + newline final = **229/229 posições documentadas**.
- Dependências e consumidores lidos no estado atual do branch: **sim**.
- Força de evidência diferenciada entre prova direta, gate estático, execução indireta e ausência de prova: **sim**.
- Lacunas externas persistidas em `.state/075.json`: **sim**.
- Código funcional/testes externos alterados para fabricar prova: **não**.
