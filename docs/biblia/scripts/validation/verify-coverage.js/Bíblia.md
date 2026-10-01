# Bíblia técnica — scripts/validation/verify-coverage.js

> **Estado documental:** ✅ CONCLUÍDO pelo AGENTE 9
> **SHA auditado:** `45f920bd2db5ba3a1273438b1814b29aeafc3be4`
> **Agente responsável:** AGENTE 9
> **Tipo:** gate Node.js de integridade e thresholds de coverage
> **Linhas textuais:** **223**
> **Posições documentais:** **224**, contando o newline final
> **PR:** #66
> **Branch:** docs/project-bible

## 1. Papel arquitetural

Este arquivo é o segundo estágio do gate de cobertura. `scripts/ci/run-jest-ci.js --coverage` produz os relatórios Jest/V8; este verificador cruza `coverage-summary.json` e `lcov.info` com o corpus físico `extension/**/*.js`, aplica pisos globais e thresholds por arquivo crítico vindos de `scripts/ci/data/test-baseline.json`, e transforma inconsistências em falha do comando `npm run test:coverage:verify`.

A propriedade importante não é apenas “percentual acima de X”. O gate também tenta impedir cobertura enganosa por omissão de arquivos: deriva a lista física de JavaScript da extensão, normaliza os caminhos dos dois relatórios e exige que cada fonte apareça em ambos. Depois aplica presença explícita de arquivos críticos, valida percentuais globais, thresholds globais, thresholds críticos e o número mínimo de arquivos instrumentados.

A função principal é exportada e aceita paths/criticalFiles/quiet injetáveis. Isso permite que `verify-coverage-selftest.js` execute a implementação real em fixtures temporárias sem modificar coverage do repositório.

## 2. Dependências, consumidores e efeitos colaterais

- **Dependências diretas:** Node `fs` e `path`.
- **Entradas canônicas:** `coverage/coverage-summary.json`, `coverage/lcov.info`, `scripts/ci/data/test-baseline.json` e o corpus físico `extension/**/*.js`.
- **Configuração correlata:** `jest.config.js` usa provider V8, `collectCoverageFrom: ['<rootDir>/extension/**/*.js']` e reporters `lcov`, `json-summary`, `text-summary` e `html`.
- **Consumidor CLI:** `package.json#test:coverage:verify = node scripts/validation/verify-coverage.js`.
- **Consumidor programático direto:** `scripts/validation/verify-coverage-selftest.js` importa `verifyCoverage`.
- **Gate estático correlato:** `scripts/validation/verify-ci-contract.js` verifica o npm script, provider/reporters, alguns literais invariantes do verificador e cenários declarados no self-test.
- **CI:** job `coverage`, job `windows-portability` e `fresh-developer-flow` executam `npm run test:coverage:verify` depois de gerar coverage.
- **Efeitos colaterais:** somente leitura de filesystem e escrita em stdout/stderr; não altera coverage, baseline nem código. No modo CLI, falha encerra o processo com código 1.

## 3. Fluxo de decisão

1. resolve caminhos/defaults e cria `problems`;
2. exige summary e LCOV existentes e não vazios;
3. parseia o JSON de summary com diagnóstico controlado;
4. extrai e normaliza `SF:` do LCOV;
5. inventaria todos os `.js` físicos de `extension/`;
6. compara corpus físico contra summary e LCOV;
7. exige presença dos arquivos críticos;
8. extrai quatro métricas globais e rejeita NaN/zero;
9. lê baseline e aplica `coverage.minimum`;
10. aplica `coverage.criticalMinimum` por arquivo/métrica;
11. aplica `coverage.minInstrumentedFiles`;
12. opcionalmente imprime telemetria;
13. retorna resultado estruturado; no CLI, `ok:false` produz exit 1.

## 4. Matriz de evidência automatizada

| Contrato | Evidência real encontrada | Classificação |
|---|---|---|
| fixture válida retorna `ok:true` | `verify-coverage-selftest.js` chama `verifyCoverage` real e compara `result.ok` | ✅ PROVADO DIRETAMENTE |
| LCOV literalmente vazio reprova | caso `lcov vazio` | 🟨 CENÁRIO PROVA `ok:false`, mas não isola causalmente o precheck de LCOV vazio |
| coverage 0% reprova | caso `coverage 0%` | 🟨 CENÁRIO PROVA `ok:false`, mas não isola causalmente a guarda `pct <= 0` do threshold mínimo |
| threshold global 80 com actual 75 reprova | caso `threshold abaixo do mínimo` | ✅ PROVADO DIRETAMENTE |
| threshold crítico 80 com actual 75 reprova | caso `threshold crítico abaixo do mínimo` | ✅ PROVADO DIRETAMENTE |
| crítico omitido leva a `ok:false` | caso `arquivo crítico ausente` | 🟨 EXECUTADO, mas a causa não é isolada: as checagens gerais também reprovam |
| `lcov.info` não vazio sem `SF:` | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| summary ausente/vazio/JSON inválido | nenhum caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| paths LCOV relativos ao repo e a `tests/`, dedup e Windows | Windows CI executa o gate; sem assertion focal do parser | 🟨 EXECUTADO INDIRETAMENTE |
| arquivo fonte não crítico ausente do summary/LCOV | não há caso isolado | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `minInstrumentedFiles` abaixo do piso | baseline sintético usa 2, mas não existe caso que isole a falha | 🟨 EXECUTADO INDIRETAMENTE |
| baseline ausente ou `coverage.minimum` ausente | nenhuma prova focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| baseline JSON malformado | nenhuma prova focal; atualmente lança exceção não estruturada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| threshold global não numérico | implementação ignora (`continue`); nenhuma prova/decisão focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| threshold crítico não numérico | `pct < Number(threshold)` pode virar comparação com NaN e não reprovar | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| CLI usa este arquivo e bloqueia jobs | package + CI Contract + workflow | 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE |
| texto exato dos logs e shape completo do retorno | não há assertions específicas | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |

## 5. Invariantes e trust boundaries

1. O corpus auditado por este gate é `extension/**/*.js`; mudar `collectCoverageFrom` ou `walkJs` de forma divergente quebra a equivalência.
2. Todo `.js` físico da extensão deve aparecer tanto no summary quanto no LCOV.
3. Paths precisam ser comparados em representação relativa com `/`, inclusive no Windows.
4. `total` no summary é agregado e nunca conta como arquivo instrumentado.
5. As quatro métricas globais precisam ser finitas e maiores que zero.
6. Pisos globais e críticos vêm do baseline, não de constantes duplicadas neste arquivo.
7. `minInstrumentedFiles` é uma defesa adicional contra redução silenciosa do universo de arquivos.
8. Um resultado `ok:true` significa somente que nenhuma regra implementada acumulou problema; não prova semanticamente que os testes cobrem comportamentos corretos.
9. O filesystem e os dois relatórios são inputs não confiáveis do ponto de vista do parser; ausência/malformed devem falhar de modo previsível.
10. O baseline também é input de política e deveria ser tratado como contrato; hoje parte do schema pode desativar checks silenciosamente.

## 6. Lacunas e riscos encontrados

- **Baseline ausente pode enfraquecer o gate local:** se `baselinePath` não existir, `baseline={}` e nenhum threshold/minInstrumentedFiles é aplicado. Na CI canônica, `verify-ci-contract.js` lê o baseline separadamente e tenderá a falhar se ele sumir, mas `verifyCoverage` isolado não é fail-closed para isso.
- **Threshold global inválido é ignorado:** linha 151 usa `continue` para valores não finitos. Isso evita crash, mas também pode transformar política malformada em ausência de proteção.
- **Threshold crítico inválido pode passar silenciosamente:** a comparação usa `pct < Number(threshold)` sem validar a finitude de `threshold`; com NaN, a comparação é falsa.
- **JSON do baseline não tem diagnóstico controlado:** parse inválido lança exceção, falhando fechado no CLI, porém fora do contrato estruturado `{ok, problems,...}`.
- **Self-test de crítico não isola a guarda crítica:** ao remover `extension/background.js` da fixture, o arquivo também fica ausente do inventário geral do summary/LCOV e o resultado já seria vermelho mesmo sem linhas 128–131.
- **LCOV relativo/Windows não tem prova focal:** o parser implementa compatibilidade entre raiz e `tests/`, e há execução indireta em Windows, mas falta assertion sobre o resultado normalizado.
- **Shape de retorno é assimétrico:** early returns por artefato ausente/summary inválido não incluem `lcovFiles`, enquanto o retorno normal inclui. Consumidores atuais observados usam principalmente `ok/problems`, mas o contrato exportado não é explicitamente testado.

## 7. Solicitações ao auditor registradas em `.state/085.json`

- **085-001 — TEST_REQUIRED — SUPERSEDED → 084-002:** ampliar o self-test para summary ausente/vazio/JSON inválido, LCOV não vazio sem `SF:`, fonte não crítica ausente, métrica ausente/NaN e `minInstrumentedFiles` abaixo do piso, com assertions sobre diagnósticos.
- **085-002 — ROBUSTNESS_REVIEW — ACCEPTED — HIGH:** decidir política fail-closed para baseline ausente/malformado e validar schema/thresholds globais/críticos não numéricos, negativos, `null` e ausentes.
- **085-003 — TEST_QUALITY — ACCEPTED:** tornar o caso “arquivo crítico ausente” causalmente específico para as guardas críticas e verificar mensagens/ramo, não apenas `ok:false`.
- **085-004 — PORTABILITY_TEST_REQUIRED — ACCEPTED:** testar `parseLcovFiles` com absoluto, relativo ao repo, relativo a `tests/`, CRLF, duplicatas e caminhos Windows.
- **085-005 — API_CONTRACT_REVIEW — ACCEPTED:** decidir e testar um shape de retorno consistente para falhas precoces versus retorno normal.

## 8. Fonte integral exata

```js
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CRITICAL_FILES = [
  'extension/background.js',
  'extension/content/content_manga.js',
  'extension/content/content_gemini.js',
  'extension/shared/shared-ui.js',
  'extension/content/gemini/job-runner.js',
];

function walkJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJs(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function relativeToRepo(repoRoot, file) {
  const absolute = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);
  return normalizeSlashes(path.relative(repoRoot, absolute));
}

function parseLcovFiles(lcovText, repoRoot) {
  const files = [];
  const testsRoot = path.join(repoRoot, 'tests');
  for (const line of String(lcovText || '').split(/\r?\n/)) {
    if (!line.startsWith('SF:')) continue;
    const raw = line.slice(3).trim();
    if (path.isAbsolute(raw)) {
      files.push(relativeToRepo(repoRoot, raw));
      continue;
    }

    // Aceita LCOV relativo tanto à raiz canônica quanto ao diretório tests/
    // para manter compatibilidade de leitura durante a migração estrutural.
    const fromRepo = path.resolve(repoRoot, raw);
    const fromTests = path.resolve(testsRoot, raw);
    const resolved = fs.existsSync(fromRepo) ? fromRepo : fromTests;
    files.push(relativeToRepo(repoRoot, resolved));
  }
  return [...new Set(files)].sort();
}

function metricPct(summary, metric) {
  const value = Number(summary?.total?.[metric]?.pct);
  return Number.isFinite(value) ? value : NaN;
}

function verifyCoverage({
  repoRoot = path.resolve(__dirname, '../..'),
  coverageDir = path.resolve(__dirname, '../../coverage'),
  baselinePath = path.resolve(__dirname, '../ci/data/test-baseline.json'),
  criticalFiles = DEFAULT_CRITICAL_FILES,
  quiet = false,
} = {}) {
  const problems = [];
  const summaryPath = path.join(coverageDir, 'coverage-summary.json');
  const lcovPath = path.join(coverageDir, 'lcov.info');

  if (!fs.existsSync(summaryPath) || fs.statSync(summaryPath).size === 0) {
    problems.push('coverage-summary.json ausente ou vazio');
  }
  if (!fs.existsSync(lcovPath) || fs.statSync(lcovPath).size === 0) {
    problems.push('lcov.info ausente ou vazio');
  }

  if (problems.length) {
    return { ok: false, problems, metrics: null, instrumentedFiles: [], sourceFiles: [] };
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      problems: ['coverage-summary.json inválido: ' + error.message],
      metrics: null,
      instrumentedFiles: [],
      sourceFiles: [],
    };
  }

  const lcovText = fs.readFileSync(lcovPath, 'utf8');
  const lcovFiles = parseLcovFiles(lcovText, repoRoot);
  if (lcovFiles.length === 0) {
    problems.push('lcov.info não contém nenhuma entrada SF:');
  }

  const sourceRoot = path.join(repoRoot, 'extension');
  const sourceFiles = walkJs(sourceRoot).map((file) => relativeToRepo(repoRoot, file)).sort();
  if (sourceFiles.length === 0) {
    problems.push('nenhum arquivo JavaScript foi encontrado em extension/');
  }

  const summaryFiles = Object.keys(summary)
    .filter((key) => key !== 'total')
    .map((file) => relativeToRepo(repoRoot, file))
    .sort();

  const summarySet = new Set(summaryFiles);
  const lcovSet = new Set(lcovFiles);
  const missingFromSummary = sourceFiles.filter((file) => !summarySet.has(file));
  const missingFromLcov = sourceFiles.filter((file) => !lcovSet.has(file));

  if (missingFromSummary.length) {
    problems.push(
      'arquivos da extensão ausentes do coverage-summary.json:\n' +
      missingFromSummary.map((file) => '  - ' + file).join('\n')
    );
  }
  if (missingFromLcov.length) {
    problems.push(
      'arquivos da extensão ausentes do lcov.info:\n' +
      missingFromLcov.map((file) => '  - ' + file).join('\n')
    );
  }

  for (const critical of criticalFiles) {
    if (!summarySet.has(critical)) problems.push('arquivo crítico ausente do summary: ' + critical);
    if (!lcovSet.has(critical)) problems.push('arquivo crítico ausente do LCOV: ' + critical);
  }

  const metrics = {
    statements: metricPct(summary, 'statements'),
    branches: metricPct(summary, 'branches'),
    functions: metricPct(summary, 'functions'),
    lines: metricPct(summary, 'lines'),
  };

  for (const [metric, pct] of Object.entries(metrics)) {
    if (!Number.isFinite(pct)) problems.push('percentual inválido para ' + metric);
    else if (pct <= 0) problems.push(metric + ' está em ' + pct + '%; coverage zero não é aceito');
  }

  let baseline = {};
  if (fs.existsSync(baselinePath)) {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  }
  const minimum = baseline.coverage?.minimum || {};
  for (const [metric, threshold] of Object.entries(minimum)) {
    if (!Number.isFinite(Number(threshold))) continue;
    if (Number.isFinite(metrics[metric]) && metrics[metric] < Number(threshold)) {
      problems.push(
        metric + '=' + metrics[metric] + '% abaixo do baseline mínimo de ' + Number(threshold) + '%'
      );
    }
  }

  const criticalMinimum = baseline.coverage?.criticalMinimum || {};
  for (const [criticalFile, thresholds] of Object.entries(criticalMinimum)) {
    const summaryKey = Object.keys(summary).find(
      (key) => key !== 'total' && relativeToRepo(repoRoot, key) === criticalFile
    );
    if (!summaryKey) {
      problems.push('não foi possível aplicar threshold ao arquivo crítico ausente: ' + criticalFile);
      continue;
    }
    for (const [metric, threshold] of Object.entries(thresholds || {})) {
      const pct = Number(summary[summaryKey]?.[metric]?.pct);
      if (!Number.isFinite(pct)) {
        problems.push(criticalFile + ': percentual inválido para ' + metric);
      } else if (pct < Number(threshold)) {
        problems.push(
          criticalFile + ': ' + metric + '=' + pct +
          '% abaixo do baseline crítico de ' + Number(threshold) + '%'
        );
      }
    }
  }

  const expectedMinFiles = Number(baseline.coverage?.minInstrumentedFiles || 0);
  if (expectedMinFiles > 0 && summaryFiles.length < expectedMinFiles) {
    problems.push(
      'apenas ' + summaryFiles.length + ' arquivos instrumentados; mínimo protegido: ' + expectedMinFiles
    );
  }

  if (!quiet) {
    console.log('[Coverage Integrity] sourceFiles=' + sourceFiles.length +
      ', summaryFiles=' + summaryFiles.length + ', lcovFiles=' + lcovFiles.length);
    console.log('[Coverage Integrity] Statements=' + metrics.statements + '%' +
      ' Branches=' + metrics.branches + '%' +
      ' Functions=' + metrics.functions + '%' +
      ' Lines=' + metrics.lines + '%');
    console.log('[Coverage Integrity] Arquivos instrumentados:');
    summaryFiles.forEach((file) => console.log('  ✓ ' + file));
  }

  return {
    ok: problems.length === 0,
    problems,
    metrics,
    instrumentedFiles: summaryFiles,
    lcovFiles,
    sourceFiles,
  };
}

if (require.main === module) {
  const result = verifyCoverage();
  if (!result.ok) {
    console.error('\n❌ Coverage Integrity falhou:');
    result.problems.forEach((problem) => console.error('- ' + problem));
    process.exit(1);
  }
  console.log('✅ Coverage Integrity aprovado.');
}

module.exports = {
  DEFAULT_CRITICAL_FILES,
  parseLcovFiles,
  verifyCoverage,
};
```

## 9. Auditoria linha a linha

### Linha 001 — modo estrito do módulo

- **Código:** `'use strict';`
- **O que faz:** Ativa o strict mode para todo o CommonJS, reduzindo coerções implícitas e tornando erros de atribuição/this mais explícitos.
- **Como:** a linha participa do bloco **modo estrito do módulo** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de modo estrito do módulo localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — carregado sempre que o self-test importa o módulo; sem assertion específica sobre estas linhas.

### Linha 002 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 003 — dependências Node

- **Código:** `const fs = require('fs');`
- **O que faz:** Importa `fs`, usado para existência, stat, leitura, listagem recursiva e resolução prática de caminhos LCOV.
- **Como:** a linha participa do bloco **dependências Node** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de dependências Node localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — carregado sempre que o self-test importa o módulo; sem assertion específica sobre estas linhas.

### Linha 004 — dependências Node

- **Código:** `const path = require('path');`
- **O que faz:** Importa `path`, usado para construir caminhos portáveis, detectar absolutos, resolver relativos e calcular paths relativos ao repo.
- **Como:** a linha participa do bloco **dependências Node** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de dependências Node localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE — carregado sempre que o self-test importa o módulo; sem assertion específica sobre estas linhas.

### Linha 005 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 006 — lista canônica de arquivos críticos

- **Código:** `const DEFAULT_CRITICAL_FILES = [`
- **O que faz:** Inicia a constante `DEFAULT_CRITICAL_FILES`, que define o conjunto padrão que recebe presença e thresholds críticos.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 007 — lista canônica de arquivos críticos

- **Código:** `  'extension/background.js',`
- **O que faz:** Inclui `extension/background.js` no conjunto crítico padrão; o baseline atual também possui thresholds específicos para ele.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 008 — lista canônica de arquivos críticos

- **Código:** `  'extension/content/content_manga.js',`
- **O que faz:** Inclui `extension/content/content_manga.js` como arquivo crítico do fluxo principal de tradução na página.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 009 — lista canônica de arquivos críticos

- **Código:** `  'extension/content/content_gemini.js',`
- **O que faz:** Inclui `extension/content/content_gemini.js` como arquivo crítico do fluxo de automação no Gemini.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 010 — lista canônica de arquivos críticos

- **Código:** `  'extension/shared/shared-ui.js',`
- **O que faz:** Inclui `extension/shared/shared-ui.js` como arquivo crítico compartilhado de UI.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 011 — lista canônica de arquivos críticos

- **Código:** `  'extension/content/gemini/job-runner.js',`
- **O que faz:** Inclui `extension/content/gemini/job-runner.js` como arquivo crítico do orquestrador de jobs.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 012 — lista canônica de arquivos críticos

- **Código:** `];`
- **O que faz:** Fecha o array dos cinco arquivos críticos padrão.
- **Como:** a linha participa do bloco **lista canônica de arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de lista canônica de arquivos críticos localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟦 GATE ESTÁTICO/CONTRATO DE BASELINE parcialmente correlacionado; presença dos cinco nomes não é isoladamente testada por este self-test.

### Linha 013 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 014 — descoberta recursiva de JavaScript

- **Código:** `function walkJs(dir) {`
- **O que faz:** Declara `walkJs(dir)`, helper que inventaria recursivamente somente arquivos `.js` abaixo de uma raiz.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 015 — descoberta recursiva de JavaScript

- **Código:** `  if (!fs.existsSync(dir)) return [];`
- **O que faz:** Faz retorno vazio quando o diretório não existe; isso evita exceção de `readdirSync`, mas transforma ausência em inventário vazio a ser denunciado depois.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O fallback evita quebrar o helper, enquanto a função principal transforma o inventário vazio em erro explícito; lançar aqui duplicaria política de erro.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 016 — descoberta recursiva de JavaScript

- **Código:** `  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {`
- **O que faz:** Lista o diretório com `withFileTypes:true` e usa `flatMap` para concatenar resultados por entrada.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 017 — descoberta recursiva de JavaScript

- **Código:** `    const full = path.join(dir, entry.name);`
- **O que faz:** Calcula o caminho completo da entrada antes de decidir recursão ou inclusão.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 018 — descoberta recursiva de JavaScript

- **Código:** `    if (entry.isDirectory()) return walkJs(full);`
- **O que faz:** Recursa somente em diretórios reais segundo `Dirent.isDirectory()`.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 019 — descoberta recursiva de JavaScript

- **Código:** `    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];`
- **O que faz:** Inclui somente arquivos cujo nome termina em `.js`; outros tipos e extensões são ignorados pelo contrato deste gate.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O Jest coleta coverage apenas de `extension/**/*.js`; incluir outros tipos aqui criaria divergência entre corpus físico e instrumento configurado.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 020 — descoberta recursiva de JavaScript

- **Código:** `  });`
- **O que faz:** Fecha o callback de `flatMap` e retorna o vetor achatado.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 021 — descoberta recursiva de JavaScript

- **Código:** `}`
- **O que faz:** Fecha `walkJs`.
- **Como:** a linha participa do bloco **descoberta recursiva de JavaScript** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de descoberta recursiva de JavaScript localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nas fixtures temporárias; diretório ausente e entradas não-JS não têm caso focal.

### Linha 022 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 023 — normalização de separadores

- **Código:** `function normalizeSlashes(value) {`
- **O que faz:** Declara normalizador de slash usado para comparar caminhos vindos de Windows, LCOV e Node.
- **Como:** a linha participa do bloco **normalização de separadores** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de normalização de separadores localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 024 — normalização de separadores

- **Código:** `  return String(value || '').replace(/\\/g, '/');`
- **O que faz:** Converte entradas falsy para string vazia e troca todas as barras invertidas por `/`, produzindo representação canônica de comparação.
- **Como:** a linha participa do bloco **normalização de separadores** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Sem normalização, Windows (`\`) e relatórios com `/` poderiam representar o mesmo arquivo de formas diferentes e gerar falso ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 025 — normalização de separadores

- **Código:** `}`
- **O que faz:** Fecha `normalizeSlashes`.
- **Como:** a linha participa do bloco **normalização de separadores** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de normalização de separadores localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 026 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 027 — conversão para caminho relativo ao repositório

- **Código:** `function relativeToRepo(repoRoot, file) {`
- **O que faz:** Declara `relativeToRepo(repoRoot,file)`, que converte path absoluto ou relativo em path relativo canônico ao repositório.
- **Como:** a linha participa do bloco **conversão para caminho relativo ao repositório** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de conversão para caminho relativo ao repositório localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 028 — conversão para caminho relativo ao repositório

- **Código:** `  const absolute = path.isAbsolute(file) ? file : path.resolve(repoRoot, file);`
- **O que faz:** Se `file` já é absoluto, preserva-o; caso contrário resolve-o sob `repoRoot` antes de relativizar.
- **Como:** a linha participa do bloco **conversão para caminho relativo ao repositório** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de conversão para caminho relativo ao repositório localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 029 — conversão para caminho relativo ao repositório

- **Código:** `  return normalizeSlashes(path.relative(repoRoot, absolute));`
- **O que faz:** Calcula `path.relative(repoRoot, absolute)` e normaliza barras para permitir comparação independente do SO.
- **Como:** a linha participa do bloco **conversão para caminho relativo ao repositório** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Sem normalização, Windows (`\`) e relatórios com `/` poderiam representar o mesmo arquivo de formas diferentes e gerar falso ausente.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 030 — conversão para caminho relativo ao repositório

- **Código:** `}`
- **O que faz:** Fecha `relativeToRepo`.
- **Como:** a linha participa do bloco **conversão para caminho relativo ao repositório** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de conversão para caminho relativo ao repositório localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; Windows CI executa o verificador real, porém não há assertion focal de normalização.

### Linha 031 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 032 — parser do inventário LCOV

- **Código:** `function parseLcovFiles(lcovText, repoRoot) {`
- **O que faz:** Declara `parseLcovFiles`, responsável por extrair as linhas `SF:` do LCOV e normalizá-las para caminhos do repo.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 033 — parser do inventário LCOV

- **Código:** `  const files = [];`
- **O que faz:** Inicializa o acumulador dos arquivos encontrados no LCOV.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 034 — parser do inventário LCOV

- **Código:** `  const testsRoot = path.join(repoRoot, 'tests');`
- **O que faz:** Define `testsRoot` porque o parser aceita, por compatibilidade de migração, caminhos relativos tanto ao repo quanto a `tests/`.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 035 — parser do inventário LCOV

- **Código:** `  for (const line of String(lcovText || '').split(/\r?\n/)) {`
- **O que faz:** Itera o LCOV linha a linha, tolerando CRLF e LF; entrada falsy vira string vazia.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 036 — parser do inventário LCOV

- **Código:** `    if (!line.startsWith('SF:')) continue;`
- **O que faz:** Ignora todas as linhas LCOV que não começam com `SF:`; somente registros de arquivo interessam ao inventário.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 037 — parser do inventário LCOV

- **Código:** `    const raw = line.slice(3).trim();`
- **O que faz:** Remove o prefixo `SF:` e espaços laterais para obter o path cru.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 038 — parser do inventário LCOV

- **Código:** `    if (path.isAbsolute(raw)) {`
- **O que faz:** Se o path LCOV é absoluto, entra no ramo de normalização direta.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 039 — parser do inventário LCOV

- **Código:** `      files.push(relativeToRepo(repoRoot, raw));`
- **O que faz:** Converte o absoluto para path relativo ao repo e o adiciona ao inventário.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 040 — parser do inventário LCOV

- **Código:** `      continue;`
- **O que faz:** Usa `continue` para não aplicar a heurística de caminhos relativos ao caso absoluto.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 041 — parser do inventário LCOV

- **Código:** `    }`
- **O que faz:** Fecha a construção sintática pertencente ao bloco de parser do inventário LCOV; seu efeito é delimitar corretamente o escopo iniciado nas linhas anteriores.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 042 — parser do inventário LCOV

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do parser do inventário LCOV; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 043 — parser do inventário LCOV

- **Código:** `    // Aceita LCOV relativo tanto à raiz canônica quanto ao diretório tests/`
- **O que faz:** Comentário que documenta a política de aceitar duas raízes relativas durante a migração estrutural.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 044 — parser do inventário LCOV

- **Código:** `    // para manter compatibilidade de leitura durante a migração estrutural.`
- **O que faz:** Completa a justificativa: compatibilidade de leitura sem exigir que o produtor LCOV use uma única base antiga.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 045 — parser do inventário LCOV

- **Código:** `    const fromRepo = path.resolve(repoRoot, raw);`
- **O que faz:** Resolve a interpretação do path relativo a partir da raiz do repositório.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 046 — parser do inventário LCOV

- **Código:** `    const fromTests = path.resolve(testsRoot, raw);`
- **O que faz:** Resolve a interpretação alternativa a partir de `tests/`.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 047 — parser do inventário LCOV

- **Código:** `    const resolved = fs.existsSync(fromRepo) ? fromRepo : fromTests;`
- **O que faz:** Escolhe a raiz do repo quando o arquivo existe ali; caso contrário usa a interpretação sob `tests/`.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 048 — parser do inventário LCOV

- **Código:** `    files.push(relativeToRepo(repoRoot, resolved));`
- **O que faz:** Normaliza o caminho escolhido para a representação relativa canônica e o adiciona ao inventário.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A heurística preserva compatibilidade com produtores LCOV de bases relativas diferentes; exigir uma única base sem migração poderia gerar falsos negativos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 049 — parser do inventário LCOV

- **Código:** `  }`
- **O que faz:** Fecha o loop de linhas LCOV.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 050 — parser do inventário LCOV

- **Código:** `  return [...new Set(files)].sort();`
- **O que faz:** Remove duplicatas com `Set` e ordena; isso torna comparações e logs determinísticos.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Deduplicação/ordenação estabilizam comparações, logs e diagnóstico, evitando ruído dependente da ordem do filesystem/relatório.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 051 — parser do inventário LCOV

- **Código:** `}`
- **O que faz:** Fecha `parseLcovFiles`.
- **Como:** a linha participa do bloco **parser do inventário LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de parser do inventário LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE com caminhos absolutos no self-test; caminhos relativos repo/tests, deduplicação e Windows não têm assertion focal.

### Linha 052 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 053 — extração defensiva de percentual

- **Código:** `function metricPct(summary, metric) {`
- **O que faz:** Declara `metricPct(summary,metric)` para extrair uma porcentagem global do summary.
- **Como:** a linha participa do bloco **extração defensiva de percentual** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de extração defensiva de percentual localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 054 — extração defensiva de percentual

- **Código:** `  const value = Number(summary?.total?.[metric]?.pct);`
- **O que faz:** Converte `summary.total[metric].pct` para número usando optional chaining; shape ausente resulta `Number(undefined)`/NaN.
- **Como:** a linha participa do bloco **extração defensiva de percentual** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de extração defensiva de percentual localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 055 — extração defensiva de percentual

- **Código:** `  return Number.isFinite(value) ? value : NaN;`
- **O que faz:** Retorna o valor somente se finito; qualquer valor inválido vira `NaN` explícito para o chamador reprovar.
- **Como:** a linha participa do bloco **extração defensiva de percentual** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Propagar NaN como sentinela permite ao chamador falhar explicitamente em vez de aceitar coerção numérica enganosa.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 056 — extração defensiva de percentual

- **Código:** `}`
- **O que faz:** Fecha `metricPct`.
- **Como:** a linha participa do bloco **extração defensiva de percentual** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de extração defensiva de percentual localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 057 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 058 — assinatura/configuração de verifyCoverage

- **Código:** `function verifyCoverage({`
- **O que faz:** Inicia `verifyCoverage` com objeto de opções injetável, o que permite self-test em fixture temporária sem alterar o repo real.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 059 — assinatura/configuração de verifyCoverage

- **Código:** `  repoRoot = path.resolve(__dirname, '../..'),`
- **O que faz:** Por padrão, resolve `repoRoot` dois níveis acima do diretório deste script.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 060 — assinatura/configuração de verifyCoverage

- **Código:** `  coverageDir = path.resolve(__dirname, '../../coverage'),`
- **O que faz:** Por padrão, lê relatórios em `<repo>/coverage`.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 061 — assinatura/configuração de verifyCoverage

- **Código:** `  baselinePath = path.resolve(__dirname, '../ci/data/test-baseline.json'),`
- **O que faz:** Por padrão, lê o baseline canônico em `scripts/ci/data/test-baseline.json`.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 062 — assinatura/configuração de verifyCoverage

- **Código:** `  criticalFiles = DEFAULT_CRITICAL_FILES,`
- **O que faz:** Usa a lista crítica canônica quando o chamador não injeta outra.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 063 — assinatura/configuração de verifyCoverage

- **Código:** `  quiet = false,`
- **O que faz:** `quiet=false` mantém logs humanos por padrão; testes podem silenciá-los.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 064 — assinatura/configuração de verifyCoverage

- **Código:** `} = {}) {`
- **O que faz:** Fecha a lista de parâmetros e aplica objeto vazio como default.
- **Como:** a linha participa do bloco **assinatura/configuração de verifyCoverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de assinatura/configuração de verifyCoverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ✅ PROVADO DIRETAMENTE em parte — `verify-coverage-selftest.js` injeta `repoRoot`, `coverageDir`, `baselinePath`, `criticalFiles` e `quiet`; defaults canônicos continuam 🟨 quando executados pela CI.

### Linha 065 — pré-condições dos artefatos de coverage

- **Código:** `  const problems = [];`
- **O que faz:** Inicializa `problems`, acumulador único de violações não fatais encontradas durante a validação.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de pré-condições dos artefatos de coverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 066 — pré-condições dos artefatos de coverage

- **Código:** `  const summaryPath = path.join(coverageDir, 'coverage-summary.json');`
- **O que faz:** Constrói o caminho esperado de `coverage-summary.json` dentro do diretório de coverage.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de pré-condições dos artefatos de coverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 067 — pré-condições dos artefatos de coverage

- **Código:** `  const lcovPath = path.join(coverageDir, 'lcov.info');`
- **O que faz:** Constrói o caminho esperado de `lcov.info` no mesmo diretório.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de pré-condições dos artefatos de coverage localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 068 — pré-condições dos artefatos de coverage

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do pré-condições dos artefatos de coverage; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 069 — pré-condições dos artefatos de coverage

- **Código:** `  if (!fs.existsSync(summaryPath) || fs.statSync(summaryPath).size === 0) {`
- **O que faz:** Testa simultaneamente inexistência ou tamanho zero do summary.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para summary ausente/vazio.

### Linha 070 — pré-condições dos artefatos de coverage

- **Código:** `    problems.push('coverage-summary.json ausente ou vazio');`
- **O que faz:** Registra diagnóstico de summary ausente/vazio sem ainda lançar exceção.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para summary ausente/vazio.

### Linha 071 — pré-condições dos artefatos de coverage

- **Código:** `  }`
- **O que faz:** Fecha a construção sintática pertencente ao bloco de pré-condições dos artefatos de coverage; seu efeito é delimitar corretamente o escopo iniciado nas linhas anteriores.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para summary ausente/vazio.

### Linha 072 — pré-condições dos artefatos de coverage

- **Código:** `  if (!fs.existsSync(lcovPath) || fs.statSync(lcovPath).size === 0) {`
- **O que faz:** Aplica a mesma pré-condição de existência/tamanho ao LCOV.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA ISOLADA — `lcov vazio` termina `ok:false`, porém checks posteriores também reprovariam LCOV sem entradas; summary ausente/vazio segue sem caso focal.

### Linha 073 — pré-condições dos artefatos de coverage

- **Código:** `    problems.push('lcov.info ausente ou vazio');`
- **O que faz:** Registra o diagnóstico correspondente para LCOV ausente/vazio.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA ISOLADA — `lcov vazio` termina `ok:false`, porém checks posteriores também reprovariam LCOV sem entradas; summary ausente/vazio segue sem caso focal.

### Linha 074 — pré-condições dos artefatos de coverage

- **Código:** `  }`
- **O que faz:** Fecha a construção sintática pertencente ao bloco de pré-condições dos artefatos de coverage; seu efeito é delimitar corretamente o escopo iniciado nas linhas anteriores.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA ISOLADA — `lcov vazio` termina `ok:false`, porém checks posteriores também reprovariam LCOV sem entradas; summary ausente/vazio segue sem caso focal.

### Linha 075 — pré-condições dos artefatos de coverage

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do pré-condições dos artefatos de coverage; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 076 — pré-condições dos artefatos de coverage

- **Código:** `  if (problems.length) {`
- **O que faz:** Se qualquer artefato obrigatório falhou na pré-condição, interrompe antes de leituras/parses.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, NÃO CAUSAL — o caso `lcov vazio` retorna `ok:false`, mas não isola este precheck de checks posteriores de ausência de `SF:`.

### Linha 077 — pré-condições dos artefatos de coverage

- **Código:** `    return { ok: false, problems, metrics: null, instrumentedFiles: [], sourceFiles: [] };`
- **O que faz:** Retorna resultado estruturado de falha com métricas nulas e inventários vazios, evitando acesso a arquivos ausentes.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, NÃO CAUSAL — o caso `lcov vazio` retorna `ok:false`, mas não isola este precheck de checks posteriores de ausência de `SF:`.

### Linha 078 — pré-condições dos artefatos de coverage

- **Código:** `  }`
- **O que faz:** Fecha o early return.
- **Como:** a linha participa do bloco **pré-condições dos artefatos de coverage** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Validar presença/tamanho antes da leitura evita exceções triviais e produz um erro operacional mais útil no caminho normal.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, NÃO CAUSAL — o caso `lcov vazio` retorna `ok:false`, mas não isola este precheck de checks posteriores de ausência de `SF:`.

### Linha 079 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 080 — parse controlado do coverage-summary

- **Código:** `  let summary;`
- **O que faz:** Declara `summary` fora do `try` para usá-lo no restante da função.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 081 — parse controlado do coverage-summary

- **Código:** `  try {`
- **O que faz:** Inicia bloco de parse controlado do JSON de coverage.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 082 — parse controlado do coverage-summary

- **Código:** `    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));`
- **O que faz:** Lê UTF-8 e faz `JSON.parse` do summary em uma única operação.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 083 — parse controlado do coverage-summary

- **Código:** `  } catch (error) {`
- **O que faz:** Captura erro de I/O de leitura ou JSON inválido dessa operação.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 084 — parse controlado do coverage-summary

- **Código:** `    return {`
- **O que faz:** Inicia retorno específico para erro de summary.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 085 — parse controlado do coverage-summary

- **Código:** `      ok: false,`
- **O que faz:** Marca a operação como falha.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 086 — parse controlado do coverage-summary

- **Código:** `      problems: ['coverage-summary.json inválido: ' + error.message],`
- **O que faz:** Preserva a mensagem concreta da exceção no diagnóstico `coverage-summary.json inválido`.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 087 — parse controlado do coverage-summary

- **Código:** `      metrics: null,`
- **O que faz:** Mantém métricas nulas porque o summary não é confiável.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 088 — parse controlado do coverage-summary

- **Código:** `      instrumentedFiles: [],`
- **O que faz:** Retorna inventário instrumentado vazio nesse caminho.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 089 — parse controlado do coverage-summary

- **Código:** `      sourceFiles: [],`
- **O que faz:** Retorna inventário físico vazio nesse caminho precoce, pois ele ainda não foi calculado.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 090 — parse controlado do coverage-summary

- **Código:** `    };`
- **O que faz:** Fecha o objeto retornado.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 091 — parse controlado do coverage-summary

- **Código:** `  }`
- **O que faz:** Fecha o catch.
- **Como:** a linha participa do bloco **parse controlado do coverage-summary** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O summary é JSON estruturado e merece diagnóstico controlado; aceitar JSON inválido comprometeria todas as métricas seguintes.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para JSON inválido/erro de leitura do summary.

### Linha 092 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 093 — leitura e validação estrutural do LCOV

- **Código:** `  const lcovText = fs.readFileSync(lcovPath, 'utf8');`
- **O que faz:** Lê o LCOV em UTF-8; diferentemente do summary, esta leitura não possui `try/catch` local.
- **Como:** a linha participa do bloco **leitura e validação estrutural do LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A leitura direta simplifica o fluxo, mas uma falha de I/O vira exceção não estruturada; isso é uma lacuna registrada para auditoria.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos do self-test.

### Linha 094 — leitura e validação estrutural do LCOV

- **Código:** `  const lcovFiles = parseLcovFiles(lcovText, repoRoot);`
- **O que faz:** Passa o texto LCOV pelo parser normalizador.
- **Como:** a linha participa do bloco **leitura e validação estrutural do LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de leitura e validação estrutural do LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos do self-test.

### Linha 095 — leitura e validação estrutural do LCOV

- **Código:** `  if (lcovFiles.length === 0) {`
- **O que faz:** Verifica o caso de arquivo LCOV não vazio que mesmo assim não contém nenhum registro `SF:`.
- **Como:** a linha participa do bloco **leitura e validação estrutural do LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de leitura e validação estrutural do LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para LCOV não vazio sem `SF:`; o caso existente usa arquivo literalmente vazio e falha antes.

### Linha 096 — leitura e validação estrutural do LCOV

- **Código:** `    problems.push('lcov.info não contém nenhuma entrada SF:');`
- **O que faz:** Registra diagnóstico específico de LCOV estruturalmente inútil.
- **Como:** a linha participa do bloco **leitura e validação estrutural do LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de leitura e validação estrutural do LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para LCOV não vazio sem `SF:`; o caso existente usa arquivo literalmente vazio e falha antes.

### Linha 097 — leitura e validação estrutural do LCOV

- **Código:** `  }`
- **O que faz:** Fecha essa validação.
- **Como:** a linha participa do bloco **leitura e validação estrutural do LCOV** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A forma atual mantém a responsabilidade do bloco de leitura e validação estrutural do LCOV localizada; alternativas que misturem normalização, inventário e decisão aumentariam acoplamento e dificultariam diagnosticar qual contrato falhou.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para LCOV não vazio sem `SF:`; o caso existente usa arquivo literalmente vazio e falha antes.

### Linha 098 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 099 — inventário físico da extensão

- **Código:** `  const sourceRoot = path.join(repoRoot, 'extension');`
- **O que faz:** Define a raiz física de fontes como `<repo>/extension`.
- **Como:** a linha participa do bloco **inventário físico da extensão** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 100 — inventário físico da extensão

- **Código:** `  const sourceFiles = walkJs(sourceRoot).map((file) => relativeToRepo(repoRoot, file)).sort();`
- **O que faz:** Inventaria todos os `.js` da extensão, converte para paths relativos e ordena para comparação determinística.
- **Como:** a linha participa do bloco **inventário físico da extensão** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 101 — inventário físico da extensão

- **Código:** `  if (sourceFiles.length === 0) {`
- **O que faz:** Detecta extensão sem qualquer JavaScript descoberto.
- **Como:** a linha participa do bloco **inventário físico da extensão** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 102 — inventário físico da extensão

- **Código:** `    problems.push('nenhum arquivo JavaScript foi encontrado em extension/');`
- **O que faz:** Registra que nenhum `.js` foi encontrado; o gate não considera um relatório válido sem corpus fonte.
- **Como:** a linha participa do bloco **inventário físico da extensão** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 103 — inventário físico da extensão

- **Código:** `  }`
- **O que faz:** Fecha a validação do inventário físico.
- **Como:** a linha participa do bloco **inventário físico da extensão** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 104 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 105 — inventários normalizados e diferenças

- **Código:** `  const summaryFiles = Object.keys(summary)`
- **O que faz:** Começa a derivar a lista de arquivos presentes no coverage-summary.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 106 — inventários normalizados e diferenças

- **Código:** `    .filter((key) => key !== 'total')`
- **O que faz:** Exclui a chave agregada `total`, que não representa um arquivo.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 107 — inventários normalizados e diferenças

- **Código:** `    .map((file) => relativeToRepo(repoRoot, file))`
- **O que faz:** Normaliza cada chave de arquivo do JSON para path relativo ao repo.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 108 — inventários normalizados e diferenças

- **Código:** `    .sort();`
- **O que faz:** Ordena para determinismo.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Deduplicação/ordenação estabilizam comparações, logs e diagnóstico, evitando ruído dependente da ordem do filesystem/relatório.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 109 — inventários normalizados e diferenças

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do inventários normalizados e diferenças; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 110 — inventários normalizados e diferenças

- **Código:** `  const summarySet = new Set(summaryFiles);`
- **O que faz:** Cria `Set` do inventário do summary para consultas O(1) de presença.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 111 — inventários normalizados e diferenças

- **Código:** `  const lcovSet = new Set(lcovFiles);`
- **O que faz:** Cria `Set` equivalente para o LCOV.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 112 — inventários normalizados e diferenças

- **Código:** `  const missingFromSummary = sourceFiles.filter((file) => !summarySet.has(file));`
- **O que faz:** Calcula todo arquivo fonte da extensão ausente do summary.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 113 — inventários normalizados e diferenças

- **Código:** `  const missingFromLcov = sourceFiles.filter((file) => !lcovSet.has(file));`
- **O que faz:** Calcula todo arquivo fonte da extensão ausente do LCOV.
- **Como:** a linha participa do bloco **inventários normalizados e diferenças** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 114 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 115 — diagnósticos de arquivos ausentes

- **Código:** `  if (missingFromSummary.length) {`
- **O que faz:** Entra no diagnóstico quando o summary não cobre todos os `.js` físicos da extensão.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 116 — diagnósticos de arquivos ausentes

- **Código:** `    problems.push(`
- **O que faz:** Inicia mensagem multi-linha de arquivos ausentes.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 117 — diagnósticos de arquivos ausentes

- **Código:** `      'arquivos da extensão ausentes do coverage-summary.json:\n' +`
- **O que faz:** Define o cabeçalho do diagnóstico do summary.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 118 — diagnósticos de arquivos ausentes

- **Código:** `      missingFromSummary.map((file) => '  - ' + file).join('\n')`
- **O que faz:** Formata cada caminho ausente em linha própria com marcador.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 119 — diagnósticos de arquivos ausentes

- **Código:** `    );`
- **O que faz:** Fecha o `problems.push`.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 120 — diagnósticos de arquivos ausentes

- **Código:** `  }`
- **O que faz:** Fecha a construção sintática pertencente ao bloco de diagnósticos de arquivos ausentes; seu efeito é delimitar corretamente o escopo iniciado nas linhas anteriores.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 121 — diagnósticos de arquivos ausentes

- **Código:** `  if (missingFromLcov.length) {`
- **O que faz:** Entra no diagnóstico equivalente para LCOV.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 122 — diagnósticos de arquivos ausentes

- **Código:** `    problems.push(`
- **O que faz:** Inicia mensagem multi-linha do LCOV.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 123 — diagnósticos de arquivos ausentes

- **Código:** `      'arquivos da extensão ausentes do lcov.info:\n' +`
- **O que faz:** Define o cabeçalho do diagnóstico de LCOV.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 124 — diagnósticos de arquivos ausentes

- **Código:** `      missingFromLcov.map((file) => '  - ' + file).join('\n')`
- **O que faz:** Formata a lista de arquivos ausentes do LCOV.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 125 — diagnósticos de arquivos ausentes

- **Código:** `    );`
- **O que faz:** Fecha o `problems.push`.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 126 — diagnósticos de arquivos ausentes

- **Código:** `  }`
- **O que faz:** Fecha a construção sintática pertencente ao bloco de diagnósticos de arquivos ausentes; seu efeito é delimitar corretamente o escopo iniciado nas linhas anteriores.
- **Como:** a linha participa do bloco **diagnósticos de arquivos ausentes** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O gate cruza relatório com o corpus físico, impedindo que coverage alto de um subconjunto esconda arquivos inteiros não instrumentados.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o self-test usa corpus sintético completo e um caso com crítico omitido, mas não possui assertions específicas para cada lista/diagnóstico.

### Linha 127 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 128 — presença explícita dos arquivos críticos

- **Código:** `  for (const critical of criticalFiles) {`
- **O que faz:** Itera a lista de arquivos críticos configurada para impor presença explícita além do inventário geral.
- **Como:** a linha participa do bloco **presença explícita dos arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A lista crítica torna explícitos componentes de maior risco, embora o self-test atual não isole completamente esta guarda da checagem geral.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE no caso `arquivo crítico ausente`; a falha também seria causada pelas checagens gerais, então a guarda crítica não está isoladamente provada.

### Linha 129 — presença explícita dos arquivos críticos

- **Código:** `    if (!summarySet.has(critical)) problems.push('arquivo crítico ausente do summary: ' + critical);`
- **O que faz:** Registra ausência de cada crítico no summary.
- **Como:** a linha participa do bloco **presença explícita dos arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A lista crítica torna explícitos componentes de maior risco, embora o self-test atual não isole completamente esta guarda da checagem geral.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE no caso `arquivo crítico ausente`; a falha também seria causada pelas checagens gerais, então a guarda crítica não está isoladamente provada.

### Linha 130 — presença explícita dos arquivos críticos

- **Código:** `    if (!lcovSet.has(critical)) problems.push('arquivo crítico ausente do LCOV: ' + critical);`
- **O que faz:** Registra ausência de cada crítico no LCOV.
- **Como:** a linha participa do bloco **presença explícita dos arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A lista crítica torna explícitos componentes de maior risco, embora o self-test atual não isole completamente esta guarda da checagem geral.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE no caso `arquivo crítico ausente`; a falha também seria causada pelas checagens gerais, então a guarda crítica não está isoladamente provada.

### Linha 131 — presença explícita dos arquivos críticos

- **Código:** `  }`
- **O que faz:** Fecha a verificação de críticos.
- **Como:** a linha participa do bloco **presença explícita dos arquivos críticos** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A lista crítica torna explícitos componentes de maior risco, embora o self-test atual não isole completamente esta guarda da checagem geral.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE no caso `arquivo crítico ausente`; a falha também seria causada pelas checagens gerais, então a guarda crítica não está isoladamente provada.

### Linha 132 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 133 — métricas globais e rejeição de zero/NaN

- **Código:** `  const metrics = {`
- **O que faz:** Cria o objeto das quatro métricas globais usadas pelo gate.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 134 — métricas globais e rejeição de zero/NaN

- **Código:** `    statements: metricPct(summary, 'statements'),`
- **O que faz:** Extrai `statements` pelo helper que converte inválidos para NaN.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 135 — métricas globais e rejeição de zero/NaN

- **Código:** `    branches: metricPct(summary, 'branches'),`
- **O que faz:** Extrai `branches`.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 136 — métricas globais e rejeição de zero/NaN

- **Código:** `    functions: metricPct(summary, 'functions'),`
- **O que faz:** Extrai `functions`.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 137 — métricas globais e rejeição de zero/NaN

- **Código:** `    lines: metricPct(summary, 'lines'),`
- **O que faz:** Extrai `lines`.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 138 — métricas globais e rejeição de zero/NaN

- **Código:** `  };`
- **O que faz:** Fecha o objeto de métricas.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 139 — métricas globais e rejeição de zero/NaN

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do métricas globais e rejeição de zero/NaN; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 140 — métricas globais e rejeição de zero/NaN

- **Código:** `  for (const [metric, pct] of Object.entries(metrics)) {`
- **O que faz:** Itera as quatro métricas globais como pares nome/percentual.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 141 — métricas globais e rejeição de zero/NaN

- **Código:** `    if (!Number.isFinite(pct)) problems.push('percentual inválido para ' + metric);`
- **O que faz:** Reprova percentual não finito, cobrindo campos ausentes, NaN e coerções inválidas.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 142 — métricas globais e rejeição de zero/NaN

- **Código:** `    else if (pct <= 0) problems.push(metric + ' está em ' + pct + '%; coverage zero não é aceito');`
- **O que faz:** Reprova coverage igual ou abaixo de zero, evitando relatório formalmente presente mas sem cobertura útil.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 143 — métricas globais e rejeição de zero/NaN

- **Código:** `  }`
- **O que faz:** Fecha o loop global.
- **Como:** a linha participa do bloco **métricas globais e rejeição de zero/NaN** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Percentuais finitos e positivos são pré-condições mínimas para considerar o relatório semanticamente válido.
- **Evidência:** 🟨 CENÁRIO EXECUTADO, MAS NÃO PROVA CAUSAL DA GUARDA `pct <= 0` — `coverage 0%` também viola o threshold mínimo padrão; percentuais ausentes/NaN seguem sem caso focal.

### Linha 144 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 145 — baseline global

- **Código:** `  let baseline = {};`
- **O que faz:** Inicializa baseline vazio; isso é fallback funcional quando o arquivo de baseline não existe.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos sintéticos que fornecem baseline válido.

### Linha 146 — baseline global

- **Código:** `  if (fs.existsSync(baselinePath)) {`
- **O que faz:** Só tenta ler o baseline se o path existir.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos sintéticos que fornecem baseline válido.

### Linha 147 — baseline global

- **Código:** `    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));`
- **O que faz:** Lê e faz parse do baseline sem `try/catch`; JSON malformado gera exceção para o chamador/CLI.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos sintéticos que fornecem baseline válido.

### Linha 148 — baseline global

- **Código:** `  }`
- **O que faz:** Fecha leitura condicional do baseline.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos sintéticos que fornecem baseline válido.

### Linha 149 — baseline global

- **Código:** `  const minimum = baseline.coverage?.minimum || {};`
- **O que faz:** Extrai `coverage.minimum`, usando objeto vazio se baseline/coverage/minimum estiver ausente.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE nos casos sintéticos que fornecem baseline válido.

### Linha 150 — baseline global

- **Código:** `  for (const [metric, threshold] of Object.entries(minimum)) {`
- **O que faz:** Itera cada threshold global declarado no baseline.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 151 — baseline global

- **Código:** `    if (!Number.isFinite(Number(threshold))) continue;`
- **O que faz:** Ignora silenciosamente threshold que não converte para número finito.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 152 — baseline global

- **Código:** `    if (Number.isFinite(metrics[metric]) && metrics[metric] < Number(threshold)) {`
- **O que faz:** Compara apenas quando a métrica real é finita e está abaixo do threshold convertido.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 153 — baseline global

- **Código:** `      problems.push(`
- **O que faz:** Inicia diagnóstico de violação de threshold global.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 154 — baseline global

- **Código:** `        metric + '=' + metrics[metric] + '% abaixo do baseline mínimo de ' + Number(threshold) + '%'`
- **O que faz:** Inclui métrica, percentual real e valor mínimo no texto.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 155 — baseline global

- **Código:** `      );`
- **O que faz:** Fecha a montagem da mensagem.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 156 — baseline global

- **Código:** `    }`
- **O que faz:** Fecha a comparação.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 157 — baseline global

- **Código:** `  }`
- **O que faz:** Fecha o loop de thresholds globais.
- **Como:** a linha participa do bloco **baseline global** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Separar o baseline do código permite política alterável sem editar o verificador; o risco é fail-open quando o schema/valor é inválido, lacuna registrada.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold global abaixo do mínimo; baseline ausente/malformado/threshold inválido permanecem sem prova focal.

### Linha 158 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 159 — thresholds por arquivo crítico

- **Código:** `  const criticalMinimum = baseline.coverage?.criticalMinimum || {};`
- **O que faz:** Extrai `coverage.criticalMinimum`, também com fallback para objeto vazio.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 160 — thresholds por arquivo crítico

- **Código:** `  for (const [criticalFile, thresholds] of Object.entries(criticalMinimum)) {`
- **O que faz:** Itera cada arquivo crítico que possui mapa de thresholds no baseline.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 161 — thresholds por arquivo crítico

- **Código:** `    const summaryKey = Object.keys(summary).find(`
- **O que faz:** Procura no summary a chave cujo path normalizado corresponde exatamente ao arquivo crítico do baseline.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 162 — thresholds por arquivo crítico

- **Código:** `      (key) => key !== 'total' && relativeToRepo(repoRoot, key) === criticalFile`
- **O que faz:** Ignora a chave `total` e compara paths via `relativeToRepo`.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 163 — thresholds por arquivo crítico

- **Código:** `    );`
- **O que faz:** Fecha a busca pela chave.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 164 — thresholds por arquivo crítico

- **Código:** `    if (!summaryKey) {`
- **O que faz:** Se o arquivo crítico não está no summary, entra no ramo de impossibilidade de aplicar threshold.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 165 — thresholds por arquivo crítico

- **Código:** `      problems.push('não foi possível aplicar threshold ao arquivo crítico ausente: ' + criticalFile);`
- **O que faz:** Registra diagnóstico específico de threshold crítico inaplicável.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 166 — thresholds por arquivo crítico

- **Código:** `      continue;`
- **O que faz:** Pula para o próximo arquivo crítico para não acessar uma chave inexistente.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 167 — thresholds por arquivo crítico

- **Código:** `    }`
- **O que faz:** Fecha esse ramo.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 168 — thresholds por arquivo crítico

- **Código:** `    for (const [metric, threshold] of Object.entries(thresholds || {})) {`
- **O que faz:** Itera cada métrica/threshold do arquivo crítico; `thresholds || {}` tolera valor falsy.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 169 — thresholds por arquivo crítico

- **Código:** `      const pct = Number(summary[summaryKey]?.[metric]?.pct);`
- **O que faz:** Converte o percentual específico do arquivo/métrica para número.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 170 — thresholds por arquivo crítico

- **Código:** `      if (!Number.isFinite(pct)) {`
- **O que faz:** Detecta percentual crítico não finito.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 171 — thresholds por arquivo crítico

- **Código:** `        problems.push(criticalFile + ': percentual inválido para ' + metric);`
- **O que faz:** Registra diagnóstico com arquivo e métrica afetada.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 172 — thresholds por arquivo crítico

- **Código:** `      } else if (pct < Number(threshold)) {`
- **O que faz:** Caso o percentual seja finito, compara-o ao `Number(threshold)` do baseline.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 173 — thresholds por arquivo crítico

- **Código:** `        problems.push(`
- **O que faz:** Inicia mensagem de threshold crítico violado.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 174 — thresholds por arquivo crítico

- **Código:** `          criticalFile + ': ' + metric + '=' + pct +`
- **O que faz:** Inclui arquivo, métrica e percentual real.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 175 — thresholds por arquivo crítico

- **Código:** `          '% abaixo do baseline crítico de ' + Number(threshold) + '%'`
- **O que faz:** Inclui o valor de baseline crítico convertido.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 176 — thresholds por arquivo crítico

- **Código:** `        );`
- **O que faz:** Fecha a mensagem.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 177 — thresholds por arquivo crítico

- **Código:** `      }`
- **O que faz:** Fecha o branch de comparação.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 178 — thresholds por arquivo crítico

- **Código:** `    }`
- **O que faz:** Fecha o loop de métricas críticas.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 179 — thresholds por arquivo crítico

- **Código:** `  }`
- **O que faz:** Fecha o loop de arquivos críticos.
- **Como:** a linha participa do bloco **thresholds por arquivo crítico** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Threshold por arquivo impede que média global esconda regressão concentrada em componente crítico; thresholds inválidos, porém, não são validados de forma robusta.
- **Evidência:** ✅ PROVADO DIRETAMENTE para threshold crítico abaixo do mínimo; schema/threshold crítico inválido não possui prova focal.

### Linha 180 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 181 — mínimo de arquivos instrumentados

- **Código:** `  const expectedMinFiles = Number(baseline.coverage?.minInstrumentedFiles || 0);`
- **O que faz:** Lê `minInstrumentedFiles`; valor ausente/falsy vira zero antes da conversão numérica.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 182 — mínimo de arquivos instrumentados

- **Código:** `  if (expectedMinFiles > 0 && summaryFiles.length < expectedMinFiles) {`
- **O que faz:** Só aplica o piso quando ele é maior que zero e a quantidade de arquivos do summary é menor.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 183 — mínimo de arquivos instrumentados

- **Código:** `    problems.push(`
- **O que faz:** Inicia diagnóstico de inventário instrumentado insuficiente.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 184 — mínimo de arquivos instrumentados

- **Código:** `      'apenas ' + summaryFiles.length + ' arquivos instrumentados; mínimo protegido: ' + expectedMinFiles`
- **O que faz:** Inclui contagem real e mínimo protegido.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 185 — mínimo de arquivos instrumentados

- **Código:** `    );`
- **O que faz:** Fecha a mensagem.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 186 — mínimo de arquivos instrumentados

- **Código:** `  }`
- **O que faz:** Fecha essa validação.
- **Como:** a linha participa do bloco **mínimo de arquivos instrumentados** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O piso de quantidade dificulta reduzir o universo instrumentado mantendo porcentagens artificiais altas.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo baseline sintético com `minInstrumentedFiles:2`; não há caso isolado abaixo do mínimo.

### Linha 187 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 188 — telemetria de console

- **Código:** `  if (!quiet) {`
- **O que faz:** Só emite telemetria humana quando `quiet` é falso.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 189 — telemetria de console

- **Código:** `    console.log('[Coverage Integrity] sourceFiles=' + sourceFiles.length +`
- **O que faz:** Começa log de contagens de fonte, summary e LCOV.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 190 — telemetria de console

- **Código:** `      ', summaryFiles=' + summaryFiles.length + ', lcovFiles=' + lcovFiles.length);`
- **O que faz:** Completa o log com todas as três contagens.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 191 — telemetria de console

- **Código:** `    console.log('[Coverage Integrity] Statements=' + metrics.statements + '%' +`
- **O que faz:** Começa log das métricas globais.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 192 — telemetria de console

- **Código:** `      ' Branches=' + metrics.branches + '%' +`
- **O que faz:** Anexa branches.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 193 — telemetria de console

- **Código:** `      ' Functions=' + metrics.functions + '%' +`
- **O que faz:** Anexa functions.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 194 — telemetria de console

- **Código:** `      ' Lines=' + metrics.lines + '%');`
- **O que faz:** Anexa lines e fecha a mensagem.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 195 — telemetria de console

- **Código:** `    console.log('[Coverage Integrity] Arquivos instrumentados:');`
- **O que faz:** Emite cabeçalho antes de listar arquivos instrumentados.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 196 — telemetria de console

- **Código:** `    summaryFiles.forEach((file) => console.log('  ✓ ' + file));`
- **O que faz:** Imprime cada arquivo do summary com marcador de sucesso; é telemetria, não validação adicional.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 197 — telemetria de console

- **Código:** `  }`
- **O que faz:** Fecha bloco de logging.
- **Como:** a linha participa do bloco **telemetria de console** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Logs fornecem observabilidade humana sem alterar a decisão; `quiet` mantém self-tests limpos.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE na execução CLI/CI; self-test usa `quiet:true`, portanto não prova o texto dos logs.

### Linha 198 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 199 — resultado estruturado

- **Código:** `  return {`
- **O que faz:** Inicia o objeto final retornado pelo verificador.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 200 — resultado estruturado

- **Código:** `    ok: problems.length === 0,`
- **O que faz:** Define `ok` exclusivamente como ausência total de problemas acumulados.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 201 — resultado estruturado

- **Código:** `    problems,`
- **O que faz:** Expõe a lista completa de problemas para CLI/testes/consumidores.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 202 — resultado estruturado

- **Código:** `    metrics,`
- **O que faz:** Expõe as métricas globais calculadas.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 203 — resultado estruturado

- **Código:** `    instrumentedFiles: summaryFiles,`
- **O que faz:** Expõe a lista de arquivos instrumentados derivada do summary.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 204 — resultado estruturado

- **Código:** `    lcovFiles,`
- **O que faz:** Expõe a lista de arquivos `SF:` derivada do LCOV.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 205 — resultado estruturado

- **Código:** `    sourceFiles,`
- **O que faz:** Expõe o inventário físico de `.js` da extensão.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 206 — resultado estruturado

- **Código:** `  };`
- **O que faz:** Fecha o objeto retornado.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 207 — resultado estruturado

- **Código:** `}`
- **O que faz:** Fecha `verifyCoverage`.
- **Como:** a linha participa do bloco **resultado estruturado** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Resultado estruturado separa cálculo de política de saída, permitindo uso programático e CLI.
- **Evidência:** ✅ PROVADO DIRETAMENTE para `ok` nos seis casos do self-test; campos `metrics`/listas não recebem assertions focais.

### Linha 208 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 209 — entry point CLI

- **Código:** `if (require.main === module) {`
- **O que faz:** Detecta execução direta do arquivo, distinguindo CLI de importação como módulo.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 210 — entry point CLI

- **Código:** `  const result = verifyCoverage();`
- **O que faz:** Executa o verificador com defaults canônicos quando invocado pelo npm script.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 211 — entry point CLI

- **Código:** `  if (!result.ok) {`
- **O que faz:** Se o resultado não é válido, entra no caminho de falha do processo.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 212 — entry point CLI

- **Código:** `    console.error('\n❌ Coverage Integrity falhou:');`
- **O que faz:** Escreve cabeçalho de erro em stderr.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 213 — entry point CLI

- **Código:** `    result.problems.forEach((problem) => console.error('- ' + problem));`
- **O que faz:** Escreve cada problema em stderr com marcador.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 214 — entry point CLI

- **Código:** `    process.exit(1);`
- **O que faz:** Encerra imediatamente com exit code 1, tornando o npm step bloqueante.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 215 — entry point CLI

- **Código:** `  }`
- **O que faz:** Fecha caminho de falha.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 216 — entry point CLI

- **Código:** `  console.log('✅ Coverage Integrity aprovado.');`
- **O que faz:** Quando não há problemas, imprime mensagem de aprovação.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 217 — entry point CLI

- **Código:** `}`
- **O que faz:** Fecha o entry point CLI.
- **Como:** a linha participa do bloco **entry point CLI** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** O padrão `require.main` evita encerrar o processo quando importado pelo self-test, mas torna a execução direta bloqueante na CI.
- **Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO + 🟨 EXECUTADO INDIRETAMENTE — package/CI Contract fixam o npm script e jobs executam o CLI, mas não há self-test de subprocesso do exit/output.

### Linha 218 — separação estrutural

- **Código:** ␠ linha vazia
- **O que faz:** Linha em branco que separa blocos do separação estrutural; não altera runtime, mas preserva legibilidade entre responsabilidades distintas.
- **Como:** a linha participa do bloco **separação estrutural** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** A separação visual reduz risco de misturar responsabilidades durante manutenção; removê-la não muda semântica, mas piora legibilidade.
- **Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para esta posição isolada.

### Linha 219 — API exportada

- **Código:** `module.exports = {`
- **O que faz:** Inicia exports CommonJS para permitir self-test e outros consumidores programáticos.
- **Como:** a linha participa do bloco **API exportada** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Exportar helpers habilita prova focal da implementação real; sem export seria necessário testar apenas via subprocesso ou duplicar lógica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE/sem consumidor focal atual.

### Linha 220 — API exportada

- **Código:** `  DEFAULT_CRITICAL_FILES,`
- **O que faz:** Exporta a lista crítica padrão para inspeção/reuso.
- **Como:** a linha participa do bloco **API exportada** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Exportar helpers habilita prova focal da implementação real; sem export seria necessário testar apenas via subprocesso ou duplicar lógica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE/sem consumidor focal atual.

### Linha 221 — API exportada

- **Código:** `  parseLcovFiles,`
- **O que faz:** Exporta `parseLcovFiles` para possível teste/consumo direto.
- **Como:** a linha participa do bloco **API exportada** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Exportar helpers habilita prova focal da implementação real; sem export seria necessário testar apenas via subprocesso ou duplicar lógica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE/sem consumidor focal atual.

### Linha 222 — API exportada

- **Código:** `  verifyCoverage,`
- **O que faz:** Exporta a função principal `verifyCoverage` usada pelo self-test.
- **Como:** a linha participa do bloco **API exportada** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Exportar helpers habilita prova focal da implementação real; sem export seria necessário testar apenas via subprocesso ou duplicar lógica.
- **Evidência:** ✅ PROVADO DIRETAMENTE — o self-test importa e executa `verifyCoverage` real.

### Linha 223 — API exportada

- **Código:** `};`
- **O que faz:** Fecha o objeto exportado.
- **Como:** a linha participa do bloco **API exportada** e opera sobre os valores/estado definidos nesse mesmo fluxo, sem efeitos implícitos fora do módulo além de filesystem/log/exit onde explicitado.
- **Por que assim / risco de alternativa:** Exportar helpers habilita prova focal da implementação real; sem export seria necessário testar apenas via subprocesso ou duplicar lógica.
- **Evidência:** 🟨 EXECUTADO INDIRETAMENTE/sem consumidor focal atual.

### Posição 224 — newline final

- **Código:** newline terminal após a linha 223.
- **O que faz:** encerra o arquivo textual de forma canônica.
- **Como:** o blob auditado termina em `\n`; esta posição não executa JavaScript.
- **Por que assim / risco de alternativa:** preserva convenção POSIX e evita diffs artificiais em ferramentas que exigem newline final.
- **Evidência:** 🟦 GATE ESTÁTICO/INTEGRIDADE DOCUMENTAL — confirmado diretamente no blob auditado.

## 10. Conclusão documental

O blob `45f920bd2db5ba3a1273438b1814b29aeafc3be4` foi documentado integralmente: 223 linhas textuais + newline final. O arquivo é um gate funcional e realmente consumido pela CI; o self-test executa a implementação real, mas cobre apenas um subconjunto dos ramos e, em alguns casos, comprova somente o resultado agregado. As lacunas acima permanecem explicitamente classificadas e foram encaminhadas ao auditor sem alterar código, testes, baseline, workflow ou qualquer arquivo externo ao ownership do AGENTE 9.

> **Correção pós-REAUDIT:** evidência de LCOV vazio (6 ocorrências) e coverage zero (11 ocorrências) foi rebaixada de prova causal direta para prova de cenário/result.ok. 085-001 está SUPERSEDED por `084-002`; 085-002..005 estão ACCEPTED.
