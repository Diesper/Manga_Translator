# Bíblia técnica — scripts/validation/verify-ci-contract-selftest.js

> **Estado:** ✅ CONCLUÍDO DOCUMENTALMENTE PELO AGENTE 5  
> **SHA auditado:** `8d34dee0d632fde17c0609dac7dfe2a0ef60c927`  
> **Agente responsável:** AGENTE 5  
> **Tipo:** self-test negativo do contrato estrutural da CI  
> **Linhas textuais:** **122**  
> **Posições documentais:** **123**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/validation/verify-ci-contract-selftest.js` é um **teste de infraestrutura fail-closed** para `scripts/validation/verify-ci-contract.js`. Em vez de apenas procurar strings no verificador, ele cria um repositório mínimo descartável, copia os artefatos reais de que o contrato depende, introduz uma regressão proposital e executa o **verificador real** como subprocesso Node.

O arquivo protege três propriedades distintas:

1. remover um job obrigatório (`visual`) do workflow precisa fazer o contrato falhar com `job obrigatório ausente: visual`;
2. trocar `forbidOnly: isCi` por `forbidOnly: false` precisa falhar com a mensagem específica de proteção a `test.only`;
3. remover um marcador declarado na matriz de regressões precisa falhar com `marcador obrigatório ausente`.

O critério de aprovação é deliberadamente mais forte que “processo retornou erro”: cada caso exige **status diferente de zero e a mensagem esperada**. Assim, erro incidental de arquivo ausente, sintaxe ou fixture incompleta não conta como prova do contrato.

## 2. Dependências, consumidores e efeitos colaterais

### Dependências diretas

- Node.js: `fs`, `os`, `path`, `child_process.spawnSync`;
- `scripts/validation/verify-ci-contract.js` — objeto funcional exercitado;
- `scripts/ci/data/regression-matrix.json` — fonte dinâmica dos arquivos/markers de regressão;
- os arquivos listados em `staticFiles`, copiados para reconstruir no sandbox o universo mínimo que o contrato lê.

### Consumidores/wiring comprovado por leitura do branch

- `package.json:40` define `test:ci-contract:infra = node scripts/validation/verify-ci-contract-selftest.js`;
- `package.json:38` inclui esse script no encadeamento `npm run validate`;
- `.github/workflows/ci.yml:78-79` executa o self-test no job `ci-contract`;
- `.github/workflows/ci.yml:423` executa `npm run validate` no job Windows, portanto o self-test participa também desse fluxo;
- `verify-ci-contract.js:440-444` protege estaticamente tanto a presença da chamada no workflow quanto o valor exato do script npm.

### Efeitos colaterais

- cria diretórios temporários em `os.tmpdir()` com prefixo `manga-ci-contract-`;
- copia arquivos do repositório **somente** para esses diretórios;
- altera exclusivamente as cópias sandbox;
- inicia três subprocessos do verificador real com `CI=true`;
- escreve logs de sucesso/erro;
- remove cada sandbox em `finally`.

**Não foi encontrada escrita no checkout real pelo self-test.**

## 3. Fluxo operacional

1. resolve a raiz e os caminhos canônicos do contrato/matriz;
2. define dependências estáticas;
3. para cada cenário, cria sandbox único;
4. lê a matriz real e acrescenta todos os arquivos de regressão ao conjunto de cópia;
5. normaliza o arquivo a mutar para LF e exige que o marcador exista;
6. aplica exatamente uma mutação controlada;
7. executa `verify-ci-contract.js` real dentro do sandbox com `CI=true`;
8. exige status não zero;
9. exige mensagem diagnóstica específica;
10. registra sucesso do cenário;
11. remove o sandbox mesmo se ocorrer exceção;
12. depois dos três cenários, imprime o resumo final.

## 4. Evidência automatizada e força real

| Propriedade | Evidência observada | Classificação |
|---|---|---|
| Job `visual` ausente reprova o contrato | cenário linhas 90-97 + guard real em `verify-ci-contract.js:107` | ✅ PROVADO DIRETAMENTE |
| `forbidOnly:false` reprova o contrato | cenário linhas 99-106 + guard real em `verify-ci-contract.js:360-361` | ✅ PROVADO DIRETAMENTE |
| Marcador da matriz ausente reprova o contrato | cenário linhas 108-120 + guard real em `verify-ci-contract.js:197-231` | ✅ PROVADO DIRETAMENTE |
| O terceiro cenário altera um marcador real atual | matriz escolhe `REG-EXTRACT-ACK-PERSISTED`; marcador ocorre uma vez no alvo, linha 180 | ✅ PROVADO DIRETAMENTE para o estado/SHA auditado |
| `package.json` aponta para este self-test | `package.json:40`; o contrato também verifica o valor em 443-444 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Workflow executa o self-test | `.github/workflows/ci.yml:78-79`; o contrato protege a presença em 440-441 | 🟦 GATE ESTÁTICO ESPECÍFICO |
| Helpers de cópia/sandbox/cleanup participam dos três casos | execução inevitável dos cenários | 🟨 EXECUTADO INDIRETAMENTE |
| Branch de marcador ausente em `replaceRequired` | nenhum caso atual remove/renomeia o marcador antes da chamada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Matriz sem entrada testável | guard na linha 115, sem caso focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Falha de `spawnSync`/cópia | fail-closed por exceção/diagnóstico, sem injeção focal | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| Normalização CRLF | código existe e o self-test roda no fluxo Windows, mas nenhuma fixture força CRLF | 🟨 indireto + ⚠️ sem prova específica da ramificação CRLF |
| Cleanup após uma falha provocada no harness | `finally` existe, mas não há assertion externa de remoção após erro deliberado | 🟨 no fluxo normal; ⚠️ no caminho excepcional focal |

## 5. Invariantes e contratos

1. cada cenário deve operar em sandbox próprio;
2. nenhuma mutação pode atingir o checkout real;
3. todo caminho estático que `verify-ci-contract.js` lê deve estar disponível no sandbox;
4. arquivos referenciados pela matriz precisam ser copiados dinamicamente;
5. uma mutação só é aplicada se o marcador original existir;
6. contrato enfraquecido precisa retornar status não zero;
7. a saída precisa conter o diagnóstico específico esperado;
8. qualquer falha do cenário deve ainda executar o cleanup;
9. `CI=true` deve ser usado ao exercitar o gate;
10. o cenário de regressão deve remover um marcador realmente declarado e presente;
11. o self-test precisa continuar conectado ao package e ao workflow;
12. sucesso final só pode ser impresso após os três cenários terminarem sem erro.

## 6. Casos-limite e riscos

- **Dependências do contrato evoluem:** se `verify-ci-contract.js` passar a ler novo arquivo e `staticFiles` não for atualizado, o self-test tende a falhar fechado por arquivo ausente. Isso é seguro contra falso verde, mas gera acoplamento de manutenção.
- **Primeira ocorrência somente:** `String.replace` remove apenas uma ocorrência; hoje o marcador dinâmico selecionado ocorre uma única vez, mas essa unicidade não é contrato persistente.
- **CRLF:** a normalização é apropriada ao objetivo do teste, porém o caso CRLF não é produzido deterministicamente pela suíte.
- **Erro de spawn:** o harness não trata `result.error` explicitamente; no estado atual um erro de spawn não satisfaria o diagnóstico esperado e portanto faria o self-test falhar, o que é fail-closed.
- **Saída combinada:** stdout e stderr são concatenados sem separador adicional; como a prova usa `includes`, isso não afeta os fragmentos atuais.
- **Seleção dinâmica da matriz:** o terceiro caso sempre pega a primeira entrada testável, cobrindo a regra genérica de marcador, mas não cada entrada individual — a cobertura de todas as entradas pertence ao próprio `verify-ci-contract.js`.

## 7. Solicitações ao auditor

### 082-001 — TEST_REQUIRED — OPEN

- **Encontrado:** O self-test prova diretamente os três cenários negativos principais, mas não há prova focal dos caminhos de erro do próprio harness: marcador de mutação ausente, matriz sem entrada testável, falha de cópia e erro de spawn.
- **Arquivo relacionado:** `scripts/validation/verify-ci-contract-selftest.js`
- **Evidência atual:** A execução normal em CI percorre createSandbox/replaceRequired/expectContractFailure e falha fechada se uma dessas operações lançar; isso não exercita deliberadamente os branches de diagnóstico do harness.
- **Evidência ausente:** Assertions/execuções controladas que provoquem cada falha do harness e confirmem mensagem, exit code e cleanup.
- **Por que importa:** Uma regressão nos diagnósticos ou no cleanup do self-test pode ficar invisível enquanto os três cenários felizes do harness continuam verdes.
- **Ação solicitada:** Adicionar teste separado do harness (ou refatoração exportável seguida de teste) que provoque os branches de erro sem alterar artefatos reais do repositório.
- **Evidência esperada:** Provas específicas para marcador ausente, matriz sem entrada testável, falha de spawn/cópia e remoção do sandbox após exceção.
- **Ação esperada do auditor:** Confirmar se a cobertura meta-infra é exigida e, se sim, implementar em alteração separada.
- **Possível regressão:** O self-test pode falhar com diagnóstico enganoso ou deixar temporários sem que o contrato funcional tenha regredido.
- **Impacto:** Diagnóstico/robustez da infraestrutura de validação; não foi observado falso verde atual nos três casos cobertos.
- **Severidade:** NORMAL

### 082-002 — ROBUSTNESS_REVIEW — OPEN

- **Encontrado:** replaceRequired usa String.replace e remove somente a primeira ocorrência; o cenário de matriz seleciona dinamicamente o primeiro marcador da primeira entrada testável.
- **Arquivo relacionado:** `scripts/validation/verify-ci-contract-selftest.js`
- **Evidência atual:** No SHA auditado, a entrada escolhida é REG-EXTRACT-ACK-PERSISTED e o marcador `ACK persistido encerra a entrega sem retry tardio` ocorre uma única vez no arquivo alvo (linha 180), portanto o cenário atual é válido.
- **Evidência ausente:** Não existe invariante que exija unicidade do marcador escolhido nem assertion pós-mutação de que o marcador ficou ausente.
- **Por que importa:** Uma futura primeira entrada da matriz pode usar um marcador repetido; substituir só uma ocorrência pode fazer o contrato continuar encontrando o texto e o self-test falhar pelo motivo errado.
- **Ação solicitada:** Decidir entre exigir marcador único, escolher uma ocorrência estrutural inequívoca ou verificar/remover todas as ocorrências na fixture; adicionar assertion pós-mutação.
- **Evidência esperada:** Teste com marcador duplicado ou assertion `!mutated.includes(before)` quando o contrato esperado exigir ausência total.
- **Ação esperada do auditor:** Classificar o acoplamento e, se pertinente, endurecer o harness em mudança separada.
- **Possível regressão:** Atualização legítima da matriz pode quebrar o self-test mesmo quando verify-ci-contract.js continua correto.
- **Impacto:** Robustez futura do self-test negativo da matriz.
- **Severidade:** NORMAL

### 082-003 — PORTABILITY_TEST — OPEN

- **Encontrado:** O helper normaliza CRLF para LF para suportar Windows, mas nenhum cenário força deterministicamente uma fixture CRLF antes da mutação.
- **Arquivo relacionado:** `scripts/validation/verify-ci-contract-selftest.js`
- **Evidência atual:** O job windows-portability executa `npm run validate`, que inclui o self-test; contudo o checkout não garante que os arquivos relevantes cheguem com CRLF em toda execução.
- **Evidência ausente:** Fixture controlada com CRLF que prove que os três marcadores continuam sendo encontrados/mutados e que o contrato falha pelo motivo esperado.
- **Por que importa:** Execução em Windows é evidência indireta de portabilidade, não prova específica da ramificação de normalização de CRLF.
- **Ação solicitada:** Adicionar caso controlado que converta a fixture alvo para CRLF antes de replaceRequired e verifique o mesmo diagnóstico negativo.
- **Evidência esperada:** Self-test/asserção específica sobre mutação funcional em conteúdo CRLF.
- **Ação esperada do auditor:** Confirmar necessidade de cobertura determinística de EOL e tratar em alteração de teste separada.
- **Possível regressão:** Mudança no helper pode quebrar checkouts CRLF sem ser detectada se a CI continuar materializando LF.
- **Impacto:** Portabilidade do self-test no Windows.
- **Severidade:** NORMAL

## 8. Fonte integral exata

```js
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
```

## 9. Documentação linha/posição a linha

### Linha/posição 1

**Fonte:**

```text
'use strict';
```

**O que faz:** Ativa strict mode para todo o script CommonJS.

**Como faz:** A diretiva é avaliada antes dos imports e dos efeitos colaterais.

**Por que foi implementado dessa forma:** Mantém falhas de linguagem mais explícitas no harness de infraestrutura.

**Por que uma implementação ingênua seria pior:** Remover a diretiva não melhora o teste e pode reintroduzir semântica permissiva em futuras alterações.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 2

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 3

**Fonte:**

```text
const fs = require('fs');
```

**O que faz:** Importa `fs` para copiar, ler, escrever, criar diretórios e remover o sandbox.

**Como faz:** Usa o módulo nativo síncrono em todo o ciclo do self-test.

**Por que foi implementado dessa forma:** Operações síncronas mantêm cada cenário determinístico antes de iniciar o próximo.

**Por que uma implementação ingênua seria pior:** Misturar I/O assíncrono sem coordenação poderia deixar mutações ou cleanup concorrentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 4

**Fonte:**

```text
const os = require('os');
```

**O que faz:** Importa `os` para localizar o diretório temporário do sistema.

**Como faz:** `os.tmpdir()` alimenta `mkdtempSync`.

**Por que foi implementado dessa forma:** Evita criar artefatos de teste dentro do repositório.

**Por que uma implementação ingênua seria pior:** Usar caminho fixo no checkout criaria colisões e risco de sujeira persistente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 5

**Fonte:**

```text
const path = require('path');
```

**O que faz:** Importa `path` para construir caminhos portáveis.

**Como faz:** Todas as junções de raiz, sandbox e arquivos usam `path.join/resolve/dirname`.

**Por que foi implementado dessa forma:** Preserva compatibilidade Linux/Windows.

**Por que uma implementação ingênua seria pior:** Concatenar separadores manualmente quebraria portabilidade do gate.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 6

**Fonte:**

```text
const { spawnSync } = require('child_process');
```

**O que faz:** Importa `spawnSync` para executar o verificador real em subprocesso.

**Como faz:** O child process roda com `process.execPath` apontando para o contrato copiado no sandbox.

**Por que foi implementado dessa forma:** Testar o processo real evita simular a lógica que se pretende validar.

**Por que uma implementação ingênua seria pior:** Mockar o verificador poderia gerar falso verde se o CLI real divergisse.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 7

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 8

**Fonte:**

```text
const root = path.resolve(__dirname, '../..');
```

**O que faz:** Resolve a raiz canônica do repositório a partir do diretório deste script.

**Como faz:** Sobe dois níveis de `scripts/validation` com `path.resolve`.

**Por que foi implementado dessa forma:** Permite copiar dependências reais sem depender do cwd do chamador.

**Por que uma implementação ingênua seria pior:** Usar `process.cwd()` tornaria o self-test sensível ao diretório de invocação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 9

**Fonte:**

```text
const contractRel = 'scripts/validation/verify-ci-contract.js';
```

**O que faz:** Define o caminho relativo do contrato sob teste.

**Como faz:** O literal é reutilizado ao copiar e ao executar o arquivo dentro do sandbox.

**Por que foi implementado dessa forma:** Evita duplicar caminhos divergentes entre preparação e execução.

**Por que uma implementação ingênua seria pior:** Dois literais independentes poderiam fazer o teste copiar um arquivo e executar outro.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 10

**Fonte:**

```text
const matrixRel = 'scripts/ci/data/regression-matrix.json';
```

**O que faz:** Define o caminho relativo da matriz de regressões.

**Como faz:** O mesmo literal serve para copiar, ler e escolher um marcador a remover.

**Por que foi implementado dessa forma:** Mantém a matriz como fonte dinâmica para o terceiro cenário negativo.

**Por que uma implementação ingênua seria pior:** Hardcode de um teste de regressão específico envelheceria mais rápido que a matriz.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 11

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 12

**Fonte:**

```text
const staticFiles = [
```

**O que faz:** Inicia a lista das dependências estáticas que o contrato precisa encontrar no sandbox.

**Como faz:** O array é combinado depois com os arquivos vindos da matriz.

**Por que foi implementado dessa forma:** Explicita o universo mínimo necessário para executar o verificador real isoladamente.

**Por que uma implementação ingênua seria pior:** Copiar o repositório inteiro esconderia dependências implícitas e tornaria o self-test menos focal.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 13

**Fonte:**

```text
  contractRel,
```

**O que faz:** inclui o próprio `verify-ci-contract.js`, que será executado dentro do sandbox.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 14

**Fonte:**

```text
  '.github/workflows/ci.yml',
```

**O que faz:** leva o workflow real da CI para que o contrato possa inspecionar jobs e comandos.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 15

**Fonte:**

```text
  'playwright.config.js',
```

**O que faz:** leva `playwright.config.js`, necessário para o cenário que enfraquece `forbidOnly`.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 16

**Fonte:**

```text
  'jest.config.js',
```

**O que faz:** leva `jest.config.js`, dependência estática verificada pelo contrato.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 17

**Fonte:**

```text
  'scripts/validation/verify-coverage.js',
```

**O que faz:** leva o verificador de coverage lido pelo contrato.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 18

**Fonte:**

```text
  'scripts/validation/verify-coverage-selftest.js',
```

**O que faz:** leva o self-test de coverage cujos marcadores são validados pelo contrato.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 19

**Fonte:**

```text
  'scripts/validation/verify-repository-structure.js',
```

**O que faz:** leva o verificador de estrutura canônica.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 20

**Fonte:**

```text
  'scripts/validation/verify-test-policy.js',
```

**O que faz:** leva o verificador de política de testes.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 21

**Fonte:**

```text
  'scripts/validation/verify-test-policy-selftest.js',
```

**O que faz:** leva o self-test da política de testes.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 22

**Fonte:**

```text
  'scripts/validation/verify-publish-contract.js',
```

**O que faz:** leva o contrato de publicação.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 23

**Fonte:**

```text
  'scripts/ci/playwright-gate-reporter.js',
```

**O que faz:** leva o reporter Playwright usado pelo gate E2E.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 24

**Fonte:**

```text
  'scripts/ci/data/e2e-shard-plan.json',
```

**O que faz:** leva o plano canônico dos cinco grupos E2E.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 25

**Fonte:**

```text
  'scripts/validation/verify-e2e-shard-plan.js',
```

**O que faz:** leva o verificador do plano E2E.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 26

**Fonte:**

```text
  'scripts/ci/run-e2e-group.js',
```

**O que faz:** leva o runner dos grupos E2E.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 27

**Fonte:**

```text
  'scripts/ci/run-jest-ci.js',
```

**O que faz:** leva o wrapper auditável do Jest.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 28

**Fonte:**

```text
  'scripts/maintenance/diagnose-jest-workers.js',
```

**O que faz:** leva o diagnóstico de workers Jest.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 29

**Fonte:**

```text
  'package.json',
```

**O que faz:** leva `package.json`, de onde o contrato lê os scripts canônicos.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 30

**Fonte:**

```text
  'scripts/ci/data/test-baseline.json',
```

**O que faz:** leva o baseline de testes/coverage usado pelo contrato.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 31

**Fonte:**

```text
  matrixRel,
```

**O que faz:** inclui explicitamente a própria matriz de regressões.

**Como faz:** A entrada é uma string relativa (ou constante relativa) consumida pelo `Set` de `createSandbox`.

**Por que foi implementado dessa forma:** O contrato lê esses artefatos; copiá-los preserva o contexto real sem duplicar o checkout inteiro.

**Por que uma implementação ingênua seria pior:** Omitir esta dependência faz o sandbox falhar fechado; copiar tudo mascararia acoplamentos novos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 32

**Fonte:**

```text
];
```

**O que faz:** Fecha a lista `staticFiles`.

**Como faz:** Termina o literal do array usado na composição do sandbox.

**Por que foi implementado dessa forma:** Delimita claramente dependências fixas das dinâmicas vindas da matriz.

**Por que uma implementação ingênua seria pior:** Uma lista implícita espalhada por helpers dificultaria detectar drift de dependências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 33

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 34

**Fonte:**

```text
function copyFileIntoSandbox(sandbox, relPath) {
```

**O que faz:** Declara o helper que copia um arquivo real para a mesma rota relativa no sandbox.

**Como faz:** Recebe o diretório temporário e um caminho relativo.

**Por que foi implementado dessa forma:** Centraliza a criação de diretórios e cópia byte a byte para todos os artefatos.

**Por que uma implementação ingênua seria pior:** Repetir cópia em cada cenário aumentaria risco de sandboxes inconsistentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 35

**Fonte:**

```text
  const src = path.join(root, relPath);
```

**O que faz:** Calcula o caminho de origem no checkout real.

**Como faz:** Combina `root` com `relPath`.

**Por que foi implementado dessa forma:** Mantém a origem ancorada na raiz auditada.

**Por que uma implementação ingênua seria pior:** Resolver contra cwd poderia copiar arquivos errados.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 36

**Fonte:**

```text
  const dest = path.join(sandbox, relPath);
```

**O que faz:** Calcula o destino equivalente dentro do sandbox.

**Como faz:** Combina `sandbox` com o mesmo caminho relativo.

**Por que foi implementado dessa forma:** Preserva a topologia esperada por `verify-ci-contract.js`.

**Por que uma implementação ingênua seria pior:** Achatar arquivos quebraria imports/leitura por caminhos relativos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 37

**Fonte:**

```text
  fs.mkdirSync(path.dirname(dest), { recursive: true });
```

**O que faz:** Cria recursivamente o diretório-pai do destino.

**Como faz:** Usa `mkdirSync(...,{recursive:true})`.

**Por que foi implementado dessa forma:** Permite copiar caminhos profundamente aninhados em sandbox recém-criado.

**Por que uma implementação ingênua seria pior:** Criar apenas um nível falharia em `.github/workflows`, `scripts/ci/data` etc.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 38

**Fonte:**

```text
  fs.copyFileSync(src, dest);
```

**O que faz:** Copia o arquivo real para o sandbox.

**Como faz:** `copyFileSync` preserva o conteúdo antes das mutações controladas.

**Por que foi implementado dessa forma:** Garante que o contrato seja testado contra artefatos atuais do branch.

**Por que uma implementação ingênua seria pior:** Gerar fixtures manuais duplicaria configuração e poderia divergir do projeto real.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 39

**Fonte:**

```text
}
```

**O que faz:** Encerra `copyFileIntoSandbox`.

**Como faz:** Fecha o bloco da função.

**Por que foi implementado dessa forma:** Mantém o helper pequeno e sem estado compartilhado.

**Por que uma implementação ingênua seria pior:** Misturar seleção e cópia no mesmo helper reduziria rastreabilidade.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 40

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 41

**Fonte:**

```text
function createSandbox() {
```

**O que faz:** Declara o construtor de um sandbox descartável por cenário.

**Como faz:** Cada chamada cria uma cópia independente do conjunto de entradas do contrato.

**Por que foi implementado dessa forma:** Isolamento impede que uma mutação contamine os outros casos ou o checkout.

**Por que uma implementação ingênua seria pior:** Reutilizar um sandbox acumularia enfraquecimentos e confundiria o motivo da falha.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 42

**Fonte:**

```text
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-ci-contract-'));
```

**O que faz:** Cria um diretório temporário exclusivo com prefixo identificável.

**Como faz:** `mkdtempSync` usa `os.tmpdir()` e adiciona sufixo único.

**Por que foi implementado dessa forma:** Evita colisões entre processos/agentes e deixa cleanup seguro por raiz.

**Por que uma implementação ingênua seria pior:** Nome fixo poderia colidir em CI concorrente.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 43

**Fonte:**

```text
  const matrix = JSON.parse(fs.readFileSync(path.join(root, matrixRel), 'utf8'));
```

**O que faz:** Lê e parseia a matriz de regressões real antes de montar o sandbox.

**Como faz:** Usa `JSON.parse(readFileSync(...,'utf8'))`.

**Por que foi implementado dessa forma:** Descobre dinamicamente quais arquivos de regressão o contrato tentará abrir.

**Por que uma implementação ingênua seria pior:** Uma lista manual de regressões poderia ficar incompleta após novas entradas.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 44

**Fonte:**

```text
  const regressionFiles = (matrix.regressions || [])
```

**O que faz:** Obtém `matrix.regressions` ou usa array vazio como fallback.

**Como faz:** O operador `|| []` impede erro apenas quando o campo é ausente/falsy.

**Por que foi implementado dessa forma:** Permite encadear o mapeamento sem acesso inválido imediato.

**Por que uma implementação ingênua seria pior:** Assumir sempre um array causaria erro menos localizado para matriz sem o campo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 45

**Fonte:**

```text
    .map((entry) => entry && entry.file)
```

**O que faz:** Mapeia cada entrada para seu arquivo, protegendo entrada nula.

**Como faz:** `entry && entry.file` produz o caminho ou valor falsy.

**Por que foi implementado dessa forma:** Extrai apenas os arquivos que o contrato poderá ler pelos marcadores.

**Por que uma implementação ingênua seria pior:** Acesso direto a `entry.file` quebraria em entrada nula antes do contrato diagnosticar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 46

**Fonte:**

```text
    .filter(Boolean);
```

**O que faz:** Remove caminhos falsy da lista dinâmica.

**Como faz:** `filter(Boolean)` mantém somente nomes utilizáveis.

**Por que foi implementado dessa forma:** Evita tentar copiar `undefined`/string vazia.

**Por que uma implementação ingênua seria pior:** Passar falsy a `path.join` produziria falha de harness não relacionada ao contrato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 47

**Fonte:**

```text
  for (const relPath of new Set([...staticFiles, ...regressionFiles])) {
```

**O que faz:** Une dependências estáticas e arquivos de regressão removendo duplicatas.

**Como faz:** Espalha os dois arrays em `Set`.

**Por que foi implementado dessa forma:** Evita copiar repetidamente um mesmo arquivo que esteja em mais de uma fonte.

**Por que uma implementação ingênua seria pior:** Duplicatas não agregariam cobertura e fariam I/O redundante.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 48

**Fonte:**

```text
    copyFileIntoSandbox(sandbox, relPath);
```

**O que faz:** Copia cada dependência selecionada para o sandbox.

**Como faz:** Chama o helper preservando a rota relativa.

**Por que foi implementado dessa forma:** Materializa o ambiente mínimo que o verificador real espera.

**Por que uma implementação ingênua seria pior:** Pular qualquer item necessário faz o contrato falhar por arquivo ausente, não pelo cenário pretendido.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 49

**Fonte:**

```text
  }
```

**O que faz:** Fecha o loop de cópia.

**Como faz:** Conclui a materialização antes de retornar o diretório.

**Por que foi implementado dessa forma:** Garante que nenhuma mutação comece com cópia parcialmente percorrida.

**Por que uma implementação ingênua seria pior:** Intercalar mutação e cópia poderia sobrescrever o enfraquecimento aplicado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 50

**Fonte:**

```text
  return sandbox;
```

**O que faz:** Retorna o caminho do sandbox pronto.

**Como faz:** O chamador recebe a raiz usada pela mutação, subprocesso e cleanup.

**Por que foi implementado dessa forma:** Um único identificador conecta todo o ciclo do cenário.

**Por que uma implementação ingênua seria pior:** Retornar múltiplos caminhos derivados aumentaria chance de operar em raízes diferentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 51

**Fonte:**

```text
}
```

**O que faz:** Encerra `createSandbox`.

**Como faz:** Fecha a função após o retorno.

**Por que foi implementado dessa forma:** Delimita a fase de preparação.

**Por que uma implementação ingênua seria pior:** Misturar execução do contrato aqui reduziria reutilização entre cenários.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 52

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 53

**Fonte:**

```text
function replaceRequired(filePath, before, after) {
```

**O que faz:** Declara o helper de mutação obrigatória de texto.

**Como faz:** Recebe arquivo, marcador original e substituição.

**Por que foi implementado dessa forma:** Faz cada cenário falhar cedo se a pré-condição da mutação não existir.

**Por que uma implementação ingênua seria pior:** Substituição silenciosa de zero ocorrências poderia produzir um falso teste negativo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 54

**Fonte:**

```text
  const source = fs.readFileSync(filePath, 'utf8');
```

**O que faz:** Lê integralmente o arquivo a ser mutado como UTF-8.

**Como faz:** O conteúdo original é obtido do sandbox, nunca do checkout real.

**Por que foi implementado dessa forma:** A mutação trabalha apenas sobre cópia descartável.

**Por que uma implementação ingênua seria pior:** Editar o arquivo real violaria isolamento e poderia contaminar o PR.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 55

**Fonte:**

```text
  // O checkout do GitHub Actions pode materializar CRLF no Windows.
```

**O que faz:** Documenta a possibilidade de checkout com CRLF no Windows.

**Como faz:** É comentário sem efeito de runtime.

**Por que foi implementado dessa forma:** Explica por que a normalização seguinte existe.

**Por que uma implementação ingênua seria pior:** Sem essa justificativa, a normalização pareceria alteração arbitrária da fixture.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 56

**Fonte:**

```text
  // O sandbox é descartável, então normalizamos para LF antes das mutações
```

**O que faz:** Documenta que apenas o sandbox é normalizado para LF.

**Como faz:** É comentário ligado à política de fixture descartável.

**Por que foi implementado dessa forma:** Separa portabilidade de line ending do contrato funcional testado.

**Por que uma implementação ingênua seria pior:** Misturar as duas políticas faria um teste de CI falhar por newline em vez do contrato alvo.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 57

**Fonte:**

```text
  // para testar o contrato, não a política local de line endings.
```

**O que faz:** Conclui a justificativa: o alvo é o contrato, não a política local de EOL.

**Como faz:** Comentário explica o escopo sem alterar dados.

**Por que foi implementado dessa forma:** Previne interpretações de que o self-test valida formatação do checkout.

**Por que uma implementação ingênua seria pior:** Um teste ingênuo poderia confundir CRLF com regressão funcional.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 58

**Fonte:**

```text
  const normalized = source.replace(/\r\n/g, '\n');
```

**O que faz:** Normaliza CRLF para LF antes de procurar os marcadores de mutação.

**Como faz:** Substitui todas as sequências `\r\n` por `\n`.

**Por que foi implementado dessa forma:** Torna os literais com `\n` estáveis entre plataformas.

**Por que uma implementação ingênua seria pior:** Sem normalização, o cenário do workflow poderia não encontrar `\n  visual:\n` em checkout CRLF.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ a ramificação com CRLF real não é forçada por fixture específica.

### Linha/posição 59

**Fonte:**

```text
  if (!normalized.includes(before)) {
```

**O que faz:** Verifica se o marcador que deve ser removido realmente existe.

**Como faz:** `includes(before)` é a pré-condição da mutação.

**Por que foi implementado dessa forma:** Evita declarar um cenário testado quando nenhuma alteração foi aplicada.

**Por que uma implementação ingênua seria pior:** Ignorar ausência do marcador poderia deixar o contrato original intacto e gerar conclusão enganosa.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 60

**Fonte:**

```text
    throw new Error('Self-test não encontrou marcador a remover em ' + filePath + ': ' + before);
```

**O que faz:** Falha explicitamente quando a mutação não encontra seu alvo.

**Como faz:** A exceção inclui arquivo e marcador esperado.

**Por que foi implementado dessa forma:** Produz diagnóstico do harness em vez de atribuir a falha ao contrato.

**Por que uma implementação ingênua seria pior:** Continuar sem mutar poderia transformar um erro de fixture em falso verde do self-test.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 61

**Fonte:**

```text
  }
```

**O que faz:** Fecha o guard de marcador ausente.

**Como faz:** A escrita só ocorre depois da pré-condição.

**Por que foi implementado dessa forma:** Preserva a ordem validar → mutar.

**Por que uma implementação ingênua seria pior:** Escrever fora do guard permitiria mutação não comprovada.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 62

**Fonte:**

```text
  fs.writeFileSync(filePath, normalized.replace(before, after), 'utf8');
```

**O que faz:** Grava a versão mutada substituindo a primeira ocorrência do marcador.

**Como faz:** `normalized.replace(before, after)` modifica a cópia no sandbox.

**Por que foi implementado dessa forma:** É suficiente para os três marcadores atuais, todos escolhidos de forma que a ocorrência relevante seja removida.

**Por que uma implementação ingênua seria pior:** Usar edição estrutural complexa adicionaria lógica ao harness; porém a primeira ocorrência cria dependência de unicidade registrada em `082-002`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE nos três cenários; a unicidade futura do marcador não é garantida por assertion.

### Linha/posição 63

**Fonte:**

```text
}
```

**O que faz:** Encerra `replaceRequired`.

**Como faz:** Fecha o helper após a escrita síncrona.

**Por que foi implementado dessa forma:** Mantém mutação atômica no nível do fluxo do script.

**Por que uma implementação ingênua seria pior:** Acumular múltiplas responsabilidades aqui dificultaria saber o que foi alterado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 64

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 65

**Fonte:**

```text
function expectContractFailure(name, mutate, expectedMessage) {
```

**O que faz:** Declara o executor/assertor comum dos cenários negativos.

**Como faz:** Recebe nome, função de mutação e fragmento de mensagem esperado.

**Por que foi implementado dessa forma:** Centraliza a regra de sucesso: gate precisa reprovar pelo motivo certo.

**Por que uma implementação ingênua seria pior:** Cada cenário implementar sua própria execução poderia esquecer status, diagnóstico ou cleanup.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 66

**Fonte:**

```text
  const sandbox = createSandbox();
```

**O que faz:** Cria um sandbox novo para o cenário atual.

**Como faz:** Chama `createSandbox()` antes da mutação.

**Por que foi implementado dessa forma:** Garante independência entre casos.

**Por que uma implementação ingênua seria pior:** Reaproveitar um sandbox contaminaria o segundo/terceiro cenário.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 67

**Fonte:**

```text
  try {
```

**O que faz:** Inicia `try` que abrange mutação, execução e assertions.

**Como faz:** O bloco é emparelhado com `finally` de cleanup.

**Por que foi implementado dessa forma:** Garante limpeza mesmo quando qualquer assertion falha.

**Por que uma implementação ingênua seria pior:** Sem `finally`, falhas deixariam diretórios temporários persistentes.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 68

**Fonte:**

```text
    mutate(sandbox);
```

**O que faz:** Aplica a mutação específica fornecida pelo cenário.

**Como faz:** Executa callback sobre a raiz temporária.

**Por que foi implementado dessa forma:** Separa o mecanismo comum do detalhe de enfraquecimento.

**Por que uma implementação ingênua seria pior:** Hardcode das três mutações dentro do executor reduziria clareza e extensibilidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 69

**Fonte:**

```text
    const result = spawnSync(process.execPath, [path.join(sandbox, contractRel)], {
```

**O que faz:** Executa o `verify-ci-contract.js` real copiado no sandbox.

**Como faz:** Usa o Node atual e o caminho do contrato sob a raiz temporária.

**Por que foi implementado dessa forma:** A prova negativa observa o comportamento do gate real, não uma réplica.

**Por que uma implementação ingênua seria pior:** Mockar a função interna do gate não provaria o CLI nem suas leituras reais.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 70

**Fonte:**

```text
      cwd: sandbox,
```

**O que faz:** Define o cwd do subprocesso como o sandbox.

**Como faz:** Isso faz resoluções dependentes da raiz apontarem para a fixture isolada.

**Por que foi implementado dessa forma:** Impede leitura acidental do checkout real após a mutação.

**Por que uma implementação ingênua seria pior:** Executar com cwd do repositório poderia invalidar o isolamento.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 71

**Fonte:**

```text
      encoding: 'utf8',
```

**O que faz:** Solicita stdout/stderr textuais em UTF-8.

**Como faz:** `encoding:'utf8'` faz `spawnSync` retornar strings.

**Por que foi implementado dessa forma:** Permite procurar o diagnóstico esperado sem lidar com buffers.

**Por que uma implementação ingênua seria pior:** Comparar buffers manualmente seria mais frágil e verboso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 72

**Fonte:**

```text
      env: { ...process.env, CI: 'true' },
```

**O que faz:** Força `CI=true` no subprocesso preservando o restante do ambiente.

**Como faz:** Espalha `process.env` e sobrescreve `CI`.

**Por que foi implementado dessa forma:** Testa as regras condicionais que o contrato deve proteger em CI.

**Por que uma implementação ingênua seria pior:** Omitir `CI` poderia exercer um modo local diferente do gate real.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 73

**Fonte:**

```text
    });
```

**O que faz:** Fecha as opções e a chamada de `spawnSync`.

**Como faz:** O resultado síncrono só é inspecionado após o processo terminar.

**Por que foi implementado dessa forma:** Evita corrida entre saída e assertions.

**Por que uma implementação ingênua seria pior:** Processo assíncrono exigiria coordenação adicional e poderia ler saída incompleta.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 74

**Fonte:**

```text
    const output = String(result.stdout || '') + String(result.stderr || '');
```

**O que faz:** Concatena stdout e stderr com fallback vazio.

**Como faz:** Normaliza ambos para string.

**Por que foi implementado dessa forma:** O diagnóstico esperado pode ser emitido em qualquer stream pelo contrato/Node.

**Por que uma implementação ingênua seria pior:** Olhar apenas stdout ou stderr tornaria o teste dependente do canal de log.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 75

**Fonte:**

```text
    if (result.status === 0) {
```

**O que faz:** Verifica que o contrato realmente terminou com status diferente de zero.

**Como faz:** `result.status === 0` identifica falso aceite do cenário enfraquecido.

**Por que foi implementado dessa forma:** Esta é a assertion central de fail-closed.

**Por que uma implementação ingênua seria pior:** Aceitar apenas mensagem textual sem checar exit status permitiria CI verde apesar do aviso.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 76

**Fonte:**

```text
      throw new Error(name + ': contrato aceitou uma configuração propositalmente enfraquecida');
```

**O que faz:** Lança erro quando a configuração enfraquecida é aceita.

**Como faz:** A mensagem inclui o nome do cenário.

**Por que foi implementado dessa forma:** Transforma falso aceite em falha do próprio self-test.

**Por que uma implementação ingênua seria pior:** Somente logar o problema não reprovaria o job.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como guard: os três cenários atuais só passam porque este erro não é lançado; o corpo de erro não é tomado no estado verde.

### Linha/posição 77

**Fonte:**

```text
    }
```

**O que faz:** Fecha o guard de status zero.

**Como faz:** A validação de mensagem ocorre somente após confirmar rejeição.

**Por que foi implementado dessa forma:** Separa rejeição do diagnóstico correto.

**Por que uma implementação ingênua seria pior:** Misturar as condições reduziria precisão do motivo de falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 78

**Fonte:**

```text
    if (!output.includes(expectedMessage)) {
```

**O que faz:** Verifica que a saída contém o diagnóstico específico esperado.

**Como faz:** `includes(expectedMessage)` diferencia falha correta de erro acidental do sandbox.

**Por que foi implementado dessa forma:** Evita considerar qualquer status não zero como prova do contrato.

**Por que uma implementação ingênua seria pior:** Sem essa checagem, arquivo ausente/erro de sintaxe poderia produzir falso verde.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 79

**Fonte:**

```text
      throw new Error(
```

**O que faz:** Inicia a exceção usada quando o gate falha pelo motivo errado.

**Como faz:** O erro é construído em múltiplas linhas para incluir contexto.

**Por que foi implementado dessa forma:** Faz o self-test falhar com diagnóstico acionável.

**Por que uma implementação ingênua seria pior:** Aceitar falha genérica mascararia quebra da fixture ou do próprio gate.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE como guard; o corpo só seria executado se a mensagem esperada faltasse.

### Linha/posição 80

**Fonte:**

```text
        name + ': contrato falhou, mas não pelo motivo esperado. Esperado: ' +
```

**O que faz:** Compõe a primeira parte da mensagem de erro com nome e expectativa.

**Como faz:** Concatena texto e o fragmento esperado.

**Por que foi implementado dessa forma:** Identifica precisamente qual cenário divergiu.

**Por que uma implementação ingênua seria pior:** Mensagem genérica dificultaria localizar o contrato afetado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 81

**Fonte:**

```text
        expectedMessage + '\nSaída:\n' + output
```

**O que faz:** Acrescenta a saída real do subprocesso ao erro.

**Como faz:** Inclui `output` depois de uma quebra de linha.

**Por que foi implementado dessa forma:** Preserva evidência para depuração da CI.

**Por que uma implementação ingênua seria pior:** Omitir a saída obrigaria reproduzir o caso localmente para entender a falha.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 82

**Fonte:**

```text
      );
```

**O que faz:** Fecha a construção da exceção de diagnóstico incorreto.

**Como faz:** Termina `throw new Error(...)`.

**Por que foi implementado dessa forma:** Mantém toda a informação na mesma falha.

**Por que uma implementação ingênua seria pior:** Fragmentar o erro em logs separados poderia perder contexto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 83

**Fonte:**

```text
    }
```

**O que faz:** Fecha o guard de mensagem esperada.

**Como faz:** Após esta linha o cenário satisfez status e diagnóstico.

**Por que foi implementado dessa forma:** Marca o ponto em que a prova negativa foi aceita.

**Por que uma implementação ingênua seria pior:** Pular este guard equivaleria a aceitar qualquer falha.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 84

**Fonte:**

```text
    console.log('✅ ' + name + ': rejeitado como esperado');
```

**O que faz:** Emite confirmação por cenário após as duas assertions passarem.

**Como faz:** Inclui nome do caso no log.

**Por que foi implementado dessa forma:** Torna a execução da CI auditável por cenário.

**Por que uma implementação ingênua seria pior:** Um único log final ocultaria qual mutação chegou a ser exercitada.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 85

**Fonte:**

```text
  } finally {
```

**O que faz:** Inicia `finally` do cenário.

**Como faz:** O bloco roda em sucesso e em qualquer exceção do `try`.

**Por que foi implementado dessa forma:** Garante que falhas do self-test não acumulem fixtures temporárias.

**Por que uma implementação ingênua seria pior:** Cleanup somente no happy path vazaria diretórios quando mais se precisa depurar.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 86

**Fonte:**

```text
    fs.rmSync(sandbox, { recursive: true, force: true });
```

**O que faz:** Remove recursivamente o sandbox do cenário.

**Como faz:** `rmSync` usa `recursive:true, force:true`.

**Por que foi implementado dessa forma:** Limpa todos os arquivos copiados e mutados sem tocar o checkout.

**Por que uma implementação ingênua seria pior:** Remover arquivo por arquivo seria frágil a novas dependências.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 87

**Fonte:**

```text
  }
```

**O que faz:** Fecha o `finally`.

**Como faz:** Conclui a garantia lexical de cleanup.

**Por que foi implementado dessa forma:** Mantém a limpeza acoplada ao ciclo do cenário.

**Por que uma implementação ingênua seria pior:** Cleanup fora do `finally` poderia ser pulado por `throw`.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — participa das três execuções reais do self-test na CI; não há assertion externa isolada para esta linha.

### Linha/posição 88

**Fonte:**

```text
}
```

**O que faz:** Encerra `expectContractFailure`.

**Como faz:** Fecha o executor comum.

**Por que foi implementado dessa forma:** Os cenários seguintes passam somente dados específicos.

**Por que uma implementação ingênua seria pior:** Duplicar o executor em cada caso elevaria risco de inconsistência.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 89

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 90

**Fonte:**

```text
expectContractFailure(
```

**O que faz:** Inicia o primeiro cenário negativo: remoção de job obrigatório.

**Como faz:** Chama o executor comum com nome, mutação e diagnóstico esperado.

**Por que foi implementado dessa forma:** Prova que o contrato não aceita workflow sem um job protegido.

**Por que uma implementação ingênua seria pior:** Testar apenas presença estática do texto no verificador não provaria o comportamento fim a fim.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 91

**Fonte:**

```text
  'job obrigatório removido',
```

**O que faz:** Nomeia o cenário como `job obrigatório removido`.

**Como faz:** O nome é usado nos erros e no log de sucesso.

**Por que foi implementado dessa forma:** Dá rastreabilidade humana à mutação.

**Por que uma implementação ingênua seria pior:** Nome genérico dificultaria correlacionar a saída ao contrato de jobs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 92

**Fonte:**

```text
  (sandbox) => {
```

**O que faz:** Abre o callback que mutará o workflow no sandbox.

**Como faz:** Recebe somente a raiz temporária.

**Por que foi implementado dessa forma:** Impede que a mutação alcance o checkout.

**Por que uma implementação ingênua seria pior:** Callback sem parâmetro explícito poderia capturar por engano `root`.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 93

**Fonte:**

```text
    const workflowPath = path.join(sandbox, '.github/workflows/ci.yml');
```

**O que faz:** Resolve a cópia sandbox de `.github/workflows/ci.yml`.

**Como faz:** Junta `sandbox` ao caminho canônico do workflow.

**Por que foi implementado dessa forma:** Garante que apenas a fixture seja editada.

**Por que uma implementação ingênua seria pior:** Editar o workflow real para testar o gate seria proibido e destrutivo.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 94

**Fonte:**

```text
    replaceRequired(workflowPath, '\n  visual:\n', '\n  visual-disabled-for-selftest:\n');
```

**O que faz:** Renomeia a chave do job `visual` para que o job obrigatório desapareça semanticamente.

**Como faz:** Troca exatamente `\n  visual:\n` por `visual-disabled-for-selftest`.

**Por que foi implementado dessa forma:** Cria uma violação mínima preservando YAML suficiente para o verificador localizar ausência do job.

**Por que uma implementação ingênua seria pior:** Apagar grandes blocos poderia causar erro de parsing/estrutura não relacionado ao contrato de presença.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 95

**Fonte:**

```text
  },
```

**O que faz:** Fecha o callback do primeiro cenário.

**Como faz:** Nenhuma outra alteração é aplicada ao sandbox deste caso.

**Por que foi implementado dessa forma:** Mantém causa única para a falha esperada.

**Por que uma implementação ingênua seria pior:** Múltiplas mutações tornariam impossível saber qual regra provocou a rejeição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 96

**Fonte:**

```text
  'job obrigatório ausente: visual'
```

**O que faz:** Declara o diagnóstico exato esperado do contrato para o job ausente.

**Como faz:** Corresponde ao erro produzido por `verify-ci-contract.js` ao não encontrar `visual`.

**Por que foi implementado dessa forma:** Prova não só que falhou, mas que a proteção específica disparou.

**Por que uma implementação ingênua seria pior:** Aceitar qualquer texto de erro permitiria falso verde por falha acidental.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 97

**Fonte:**

```text
);
```

**O que faz:** Encerra a chamada do primeiro cenário.

**Como faz:** Entrega todos os argumentos ao executor comum.

**Por que foi implementado dessa forma:** Materializa a primeira prova negativa completa.

**Por que uma implementação ingênua seria pior:** Separar execução e expected message em fluxos diferentes aumentaria risco de desencontro.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 98

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 99

**Fonte:**

```text
expectContractFailure(
```

**O que faz:** Inicia o segundo cenário negativo: enfraquecimento de `forbidOnly`.

**Como faz:** Reutiliza o executor contra uma mutação no Playwright config.

**Por que foi implementado dessa forma:** Prova que `test.only` continua proibido em CI pelo contrato.

**Por que uma implementação ingênua seria pior:** Uma simples busca no config não provaria que o gate reprova quando a regra muda.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 100

**Fonte:**

```text
  'forbidOnly enfraquecido',
```

**O que faz:** Nomeia o cenário `forbidOnly enfraquecido`.

**Como faz:** O nome aparece em falhas e sucesso.

**Por que foi implementado dessa forma:** Distingue este caso do workflow e da matriz.

**Por que uma implementação ingênua seria pior:** Sem nome específico os três casos ficariam indistinguíveis nos logs.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 101

**Fonte:**

```text
  (sandbox) => {
```

**O que faz:** Abre o callback de mutação do Playwright.

**Como faz:** Opera somente no sandbox recebido.

**Por que foi implementado dessa forma:** Preserva isolamento do checkout.

**Por que uma implementação ingênua seria pior:** Capturar config real violaria a regra de não alterar objeto auditado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 102

**Fonte:**

```text
    const configPath = path.join(sandbox, 'playwright.config.js');
```

**O que faz:** Resolve `playwright.config.js` dentro do sandbox.

**Como faz:** Usa `path.join(sandbox,...)`.

**Por que foi implementado dessa forma:** Direciona a alteração para a fixture copiada.

**Por que uma implementação ingênua seria pior:** Path relativo ao processo poderia acertar o arquivo real.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 103

**Fonte:**

```text
    replaceRequired(configPath, 'forbidOnly: isCi', 'forbidOnly: false');
```

**O que faz:** Troca `forbidOnly: isCi` por `forbidOnly: false`.

**Como faz:** Usa `replaceRequired` para garantir que a configuração protegida existia antes da alteração.

**Por que foi implementado dessa forma:** Simula exatamente a regressão que permitiria `.only` em CI.

**Por que uma implementação ingênua seria pior:** Remover a linha inteira poderia produzir sintaxe/config diferente e testar outra coisa.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 104

**Fonte:**

```text
  },
```

**O que faz:** Fecha o callback do segundo cenário.

**Como faz:** Não altera outras regras do Playwright.

**Por que foi implementado dessa forma:** Isola a causa esperada da rejeição.

**Por que uma implementação ingênua seria pior:** Enfraquecer retries/reporters junto reduziria especificidade.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 105

**Fonte:**

```text
  'Playwright precisa proibir test.only em CI'
```

**O que faz:** Declara a mensagem específica que `verify-ci-contract.js` deve emitir.

**Como faz:** O texto corresponde ao guard `Playwright precisa proibir test.only em CI`.

**Por que foi implementado dessa forma:** Confirma que o gate detectou exatamente `forbidOnly` enfraquecido.

**Por que uma implementação ingênua seria pior:** Status não zero sozinho poderia vir de arquivo faltando ou erro não relacionado.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 106

**Fonte:**

```text
);
```

**O que faz:** Encerra o segundo cenário.

**Como faz:** Finaliza a prova contra `forbidOnly:false`.

**Por que foi implementado dessa forma:** Mantém o caso autocontido.

**Por que uma implementação ingênua seria pior:** Fluxos compartilhados adicionais poderiam contaminar a evidência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 107

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 108

**Fonte:**

```text
expectContractFailure(
```

**O que faz:** Inicia o terceiro cenário negativo: remoção de marcador de regressão.

**Como faz:** Reutiliza o executor e escolhe dinamicamente uma entrada real da matriz.

**Por que foi implementado dessa forma:** Prova que o contrato verifica conteúdo mínimo dos arquivos de regressão.

**Por que uma implementação ingênua seria pior:** Hardcode de uma regressão fixa não acompanharia a evolução da matriz.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 109

**Fonte:**

```text
  'marcador da matriz de regressão removido',
```

**O que faz:** Nomeia o cenário `marcador da matriz de regressão removido`.

**Como faz:** O nome aparece em logs e exceções.

**Por que foi implementado dessa forma:** Explicita a propriedade protegida.

**Por que uma implementação ingênua seria pior:** Nome vago esconderia que o teste é sobre marcador, não existência do arquivo.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 110

**Fonte:**

```text
  (sandbox) => {
```

**O que faz:** Abre o callback do cenário da matriz.

**Como faz:** Recebe o sandbox já populado com arquivos dinâmicos.

**Por que foi implementado dessa forma:** A mutação usa a mesma matriz que o contrato lerá.

**Por que uma implementação ingênua seria pior:** Criar uma matriz artificial poderia divergir do contrato atual.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 111

**Fonte:**

```text
    const matrix = JSON.parse(fs.readFileSync(path.join(sandbox, matrixRel), 'utf8'));
```

**O que faz:** Lê e parseia a matriz copiada dentro do próprio sandbox.

**Como faz:** Usa `matrixRel` sob a raiz temporária.

**Por que foi implementado dessa forma:** Assegura que seleção e verificador observem a mesma fixture.

**Por que uma implementação ingênua seria pior:** Ler a matriz do checkout enquanto o gate lê a cópia abriria divergência.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 112

**Fonte:**

```text
    const entry = (matrix.regressions || []).find(
```

**O que faz:** Busca a primeira regressão com arquivo e pelo menos um marcador.

**Como faz:** `find` percorre `matrix.regressions || []`.

**Por que foi implementado dessa forma:** Escolhe automaticamente uma entrada exercitável sem codificar ID específico.

**Por que uma implementação ingênua seria pior:** Fixar ID tornaria o self-test quebradiço a reorganização da matriz.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no estado atual; a entrada escolhida é `REG-EXTRACT-ACK-PERSISTED`.

### Linha/posição 113

**Fonte:**

```text
      (item) => item && item.file && Array.isArray(item.markers) && item.markers.length
```

**O que faz:** Define o predicado que exige entrada, arquivo, array de marcadores e comprimento positivo.

**Como faz:** Combina guards curtos com `Array.isArray`.

**Por que foi implementado dessa forma:** Evita selecionar registro incapaz de sustentar a mutação.

**Por que uma implementação ingênua seria pior:** Assumir shape perfeito faria o harness quebrar de forma menos diagnóstica.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 114

**Fonte:**

```text
    );
```

**O que faz:** Fecha a busca da entrada testável.

**Como faz:** O resultado fica em `entry` para os guards seguintes.

**Por que foi implementado dessa forma:** Separa seleção da mutação.

**Por que uma implementação ingênua seria pior:** Misturar busca e escrita dificultaria validar a pré-condição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 115

**Fonte:**

```text
    if (!entry) throw new Error('Matriz de regressão não contém entrada testável');
```

**O que faz:** Falha explicitamente se a matriz não contém nenhuma entrada testável.

**Como faz:** Lança erro do harness antes de resolver alvo.

**Por que foi implementado dessa forma:** Evita falso teste quando não há marcador a remover.

**Por que uma implementação ingênua seria pior:** Continuar com `undefined` produziria erro incidental e menos acionável.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 116

**Fonte:**

```text
    const target = path.join(sandbox, entry.file);
```

**O que faz:** Resolve o arquivo da regressão escolhida dentro do sandbox.

**Como faz:** Combina `sandbox` com `entry.file`.

**Por que foi implementado dessa forma:** A mutação atinge a cópia exata que o contrato inspecionará.

**Por que uma implementação ingênua seria pior:** Usar o arquivo real violaria isolamento; usar path diferente não testaria o gate.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 117

**Fonte:**

```text
    replaceRequired(target, entry.markers[0], '__MARKER_REMOVED_FOR_CI_CONTRACT_SELFTEST__');
```

**O que faz:** Substitui o primeiro marcador declarado por um sentinel inexistente no contrato.

**Como faz:** Passa `entry.markers[0]` a `replaceRequired`.

**Por que foi implementado dessa forma:** Cria perda controlada de um requisito que o gate deve detectar.

**Por que uma implementação ingênua seria pior:** Apagar o arquivo inteiro só provaria existência, não validação de marcador.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE; no estado auditado o marcador selecionado ocorre uma única vez no alvo, linha 180.

### Linha/posição 118

**Fonte:**

```text
  },
```

**O que faz:** Fecha o callback do terceiro cenário.

**Como faz:** A matriz e os demais arquivos permanecem intactos.

**Por que foi implementado dessa forma:** Mantém a violação limitada a um marcador.

**Por que uma implementação ingênua seria pior:** Múltiplas alterações poderiam gerar mensagem diferente da esperada.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 119

**Fonte:**

```text
  'marcador obrigatório ausente'
```

**O que faz:** Declara o fragmento `marcador obrigatório ausente` como diagnóstico esperado.

**Como faz:** Corresponde ao guard do contrato que percorre os marcadores da matriz.

**Por que foi implementado dessa forma:** Demonstra que a falha veio da verificação de marcador, não de outro erro.

**Por que uma implementação ingênua seria pior:** Checar somente exit status não provaria o caminho de regressões.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 120

**Fonte:**

```text
);
```

**O que faz:** Encerra o terceiro cenário.

**Como faz:** Conclui a terceira execução negativa independente.

**Por que foi implementado dessa forma:** Fecha o conjunto atual de regressões do próprio gate.

**Por que uma implementação ingênua seria pior:** Adicionar lógica depois da chamada sem nova assertion poderia confundir o escopo.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE — o próprio self-test executa esta mutação e exige status não zero mais a mensagem diagnóstica correspondente do verificador real.

### Linha/posição 121

**Fonte:**

```text
␤ [linha vazia]
```

**O que faz:** Separa visualmente dois blocos lógicos.

**Como faz:** É uma linha vazia sem efeito na AST executável.

**Por que foi implementado dessa forma:** Facilita auditar imports, helpers e os três cenários negativos.

**Por que uma implementação ingênua seria pior:** Compactar tudo não mudaria o runtime, mas pioraria leitura e revisão.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

### Linha/posição 122

**Fonte:**

```text
console.log('✅ CI Contract self-test aprovado: o gate rejeita job ausente, forbidOnly enfraquecido e marcador de regressão removido.');
```

**O que faz:** Emite o resumo final somente depois que os três cenários retornam sem lançar.

**Como faz:** O log lista explicitamente as três proteções exercitadas.

**Por que foi implementado dessa forma:** Dá um sinal único de conclusão sem substituir os logs por cenário.

**Por que uma implementação ingênua seria pior:** Imprimir sucesso antes das assertions ou em `finally` poderia produzir mensagem enganosa.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — sua presença em uma execução concluída implica que as três chamadas anteriores não lançaram; não é uma assertion adicional.

### Linha/posição 123

**Fonte:**

```text
␤ [newline final]
```

**O que faz:** Representa o newline final do arquivo.

**Como faz:** O blob termina com `\n`, criando uma posição documental após a linha textual 122.

**Por que foi implementado dessa forma:** Preserva equivalência editorial byte a byte da fonte embutida.

**Por que uma implementação ingênua seria pior:** Ignorar o newline final faria a contagem documental divergir do blob auditado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — a posição existe no fonte, mas não há assertion automatizada focal para essa propriedade isolada.

## 10. Autoauditoria documental

- SHA do blob reconfirmado imediatamente antes da escrita: `8d34dee0d632fde17c0609dac7dfe2a0ef60c927`.
- Fonte embutida: conteúdo integral do blob, incluindo newline final.
- Cobertura documental: **123/123 posições**.
- Dependências e consumidores cruzados com `package.json`, workflow, contrato real e matriz de regressões.
- Classificações de evidência não tratam mera ocorrência textual como prova direta.
- Os três cenários negativos executam a implementação real de `verify-ci-contract.js` em sandbox.
- Lacunas encontradas foram preservadas como lacunas e registradas como solicitações `082-001` a `082-003`.
- Nenhum código, teste, fixture, workflow, configuração ou arquivo global foi alterado para produzir evidência.

**Resultado da autoauditoria do AGENTE 5:** ✅ APROVADA para fidelidade documental deste SHA.
