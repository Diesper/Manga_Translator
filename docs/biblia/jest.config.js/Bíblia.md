# Bíblia técnica — jest.config.js

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE ATIVA  
> **SHA auditado:** `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`  
> **Agente responsável pela auditoria:** Agente L  
> **Tipo:** configuração Jest canônica da raiz  
> **Linhas textuais:** **90**  
> **Posições documentais:** **91**, contando o newline final  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`jest.config.js` é a configuração canônica única de Jest do Manga Translator. Ela define **sete projetos unitários** e **um projeto de integração**, escolhe ambiente Node ou jsdom por domínio, injeta os mocks comuns e ativa cobertura somente quando `COVERAGE_MODE=1`.

A topologia é consumida diretamente pelos scripts npm e por `scripts/ci/run-jest-ci.js`, que chama o próprio Jest com este arquivo e `--selectProjects`. O runner não confia apenas nos nomes escritos: usa `--listTests` para obter os arquivos descobertos e verifica que unitários e integração têm **interseção vazia** e que sua união cobre o inventário esperado.

## 2. Matriz dos projetos

| Projeto | Ambiente | Escopo | Setup comum |
|---|---|---|---|
| `background` | node | `tests/unit/background/**` | Chrome API |
| `gtc` | node | `tests/unit/gtc/**` | nenhum global adicional |
| `content-scripts` | jsdom | content-manga + content-gemini + inject | Chrome API + DOM |
| `popup` | jsdom | `tests/unit/popup/**` | Chrome API + DOM |
| `reader` | jsdom | `tests/unit/reader/**` | Chrome API + DOM |
| `manifest` | node | `tests/unit/manifest/**` | nenhum global adicional |
| `shared-ui` | jsdom | `tests/unit/shared-ui/**` | Chrome API + DOM |
| `integration` | jsdom | `tests/integration/**` | Chrome API + DOM |

## 3. Contrato com package/CI

`package.json#test:unit` seleciona exatamente:

`background gtc content-scripts popup reader manifest shared-ui`

e `test:integration` seleciona exclusivamente `integration`. `verify-ci-contract.js` protege esses comandos. `run-jest-ci.js` mantém a mesma lista e falha se descoberta real não formar a partição esperada.

Em coverage, o runner injeta `COVERAGE_MODE=1`; o config muda cache, timeout e adiciona provider/escopo/reporters.

## 4. Cobertura

- provider: V8;
- universo: `extension/**/*.js`;
- saída: `coverage/`;
- reporters: text, text-summary, lcov, json-summary e html;
- `coverageThreshold`: deliberadamente indefinido aqui.

A política de aprovação não fica duplicada em Jest: `scripts/validation/verify-coverage.js` e o baseline CI aplicam a verificação. Isso cria uma dependência operacional: rodar **apenas** Jest com `--coverage` não equivale a executar o gate completo de cobertura.

## 5. Análise crítica

1. **Duas fontes de lista de projetos ainda existem:** `jest.config.js` e `run-jest-ci.js` possuem listas nominais. O runner detecta vários drifts porque `--selectProjects`/partição falham, mas a duplicação continua sendo manutenção manual.
2. **Ambiente integration é sempre jsdom:** integrações de módulos Node/background rodam com globals DOM disponíveis. Isso é conveniente para fluxos mistos, porém pode mascarar dependência acidental de browser em código que deveria ser service-worker/Node-like.
3. **Sem `clearMocks/resetMocks/restoreMocks` globais:** isolamento depende de cada suíte/setup chamar reset/restauração adequadamente. Um teste que esqueça cleanup pode vazar estado.
4. **Timeout de coverage é 4× maior:** coerente com instrumentação, mas não há teste focal que proteja 60 s/15 s.
5. **Cache de coverage separado é bom, mas não provado por teste:** uma regressão nessa propriedade pode gerar comportamento flaky difícil de diagnosticar sem gate.
6. **`coverageThreshold: undefined` exige disciplina externa:** `npm run test:coverage` sozinho pode não aplicar a política mínima; a CI deve executar também `test:coverage:verify`, algo que `verify-ci-contract.js` atualmente exige.
7. **Reporter HTML é gerado mesmo na CI coverage:** útil para artifact, mas aumenta tamanho/I/O. O contrato estático exige apenas lcov/json-summary/text-summary, portanto `html` e `text` podem mudar sem esse gate detectar.
8. **Config CommonJS + globals de setup:** funciona com o stack atual; migrar para ESM exigiria revisar carregamento de Jest e mocks, não apenas trocar sintaxe.

## 6. Segurança e trust boundaries

A configuração não manipula dados do usuário em runtime, mas controla **qual código de teste executa** e quais mocks substituem APIs privilegiadas. Um glob incorreto pode omitir testes; um setup global excessivo pode fazer código depender de uma API falsa inexistente no runtime real.

`collectCoverageFrom: extension/**/*.js` é importante para visibilidade: arquivos não importados ainda entram no denominador de coverage. Isso reduz o risco de “100% do que foi carregado” esconder módulos totalmente sem teste.

## 7. Evidência automatizada

| Comportamento | Evidência | Classificação |
|---|---|---|
| partição unit/integration sem overlap e sem arquivo perdido | `run-jest-ci.js` executa Jest `--listTests --selectProjects` e compara união/interseção | ✅ PROVADO DIRETAMENTE |
| scripts npm usam nomes canônicos | `verify-ci-contract.js` exige comandos exatos | 🟦 GATE ESTÁTICO ESPECÍFICO |
| provider V8 | `verify-ci-contract.js` procura literal obrigatório | 🟦 GATE ESTÁTICO ESPECÍFICO |
| cobertura inclui `extension/**/*.js` | mesmo gate | 🟦 GATE ESTÁTICO ESPECÍFICO |
| reporters lcov/json-summary/text-summary | mesmo gate itera os três | 🟦 GATE ESTÁTICO ESPECÍFICO |
| `COVERAGE_MODE=1` chega ao config | runner injeta a variável ao executar Jest com coverage | 🟨 EXECUTADO INDIRETAMENTE |
| Node/jsdom e setup files específicos | suítes rodam através dos projetos, mas não há assertion focal do config | 🟨 EXECUTADO INDIRETAMENTE |
| caches e timeouts exatos | nenhuma assertion/gate focal localizada | ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO |
| `coverageThreshold: undefined` | policy externa existe, mas não exige esse literal | 🟨 CONTRATO ARQUITETURAL |

## 8. Lacunas de teste

1. Falta self-test que muta um `testMatch` e prove que arquivo ausente/overlap é detectado end-to-end.
2. Falta teste focal da escolha node/jsdom por projeto.
3. Falta teste de presença/ordem dos dois `setupFilesAfterEnv` nos projetos DOM.
4. Falta teste dos caches normal vs coverage.
5. Falta teste dos timeouts 15 s vs 60 s.
6. Falta gate para os reporters `text` e `html`.
7. Falta teste específico de `coverageDirectory`.
8. Falta teste que prove que `COVERAGE_MODE='true'` ou outros valores não ativam coverage, caso essa estrita semântica seja requisito.
9. Falta teste garantindo que adicionar novo diretório unitário exige atribuí-lo exatamente a um projeto.
10. Falta proteção focal contra introdução de `clearMocks/resetMocks/restoreMocks` com semântica que possa quebrar suítes dependentes de mocks persistentes entre hooks.

## 9. Invariantes

1. Todo `*.test.js` unitário/integration canônico deve pertencer a exatamente um lado da partição validada pelo runner.
2. Nomes usados por `--selectProjects` em package/runner devem corresponder aos `displayName` deste arquivo.
3. Projetos que testam DOM devem ter jsdom; projetos deliberadamente Node não devem receber DOM sem justificativa.
4. Chrome mock não deve ser carregado em projetos que não precisam dele apenas para “fazer testes passarem”.
5. Coverage precisa incluir toda `extension/**/*.js`.
6. V8 continua provider enquanto o contrato CI exigir V8.
7. LCOV/json-summary/text-summary não podem sumir sem atualizar conscientemente consumidores/gates.
8. Cache de coverage e cache normal devem continuar isolados enquanto houver risco de artifacts incompatíveis.
9. O verificador externo de coverage deve continuar bloqueante se `coverageThreshold` permanecer indefinido no Jest.
10. Não deve reaparecer um segundo `tests/jest.config.js`/config de coverage paralelo.
11. Alterações de timeout não devem servir para mascarar hangs reais.
12. O SHA desta Bíblia só permanece válido enquanto `jest.config.js` for `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.

## 10. Fonte integral

```javascript
'use strict';

const isCoverage = process.env.COVERAGE_MODE === '1';

const unitProjects = [
  {
    displayName: 'background',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/background/**/*.test.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/mocks/chrome-api.mock.js'],
  },
  {
    displayName: 'gtc',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/gtc/**/*.test.js'],
  },
  {
    displayName: 'content-scripts',
    testEnvironment: 'jsdom',
    testMatch: [
      '<rootDir>/tests/unit/content-manga/**/*.test.js',
      '<rootDir>/tests/unit/content-gemini/**/*.test.js',
      '<rootDir>/tests/unit/inject/**/*.test.js',
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'popup',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/popup/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'reader',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/reader/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'manifest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/manifest/**/*.test.js'],
  },
  {
    displayName: 'shared-ui',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/shared-ui/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
];

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  verbose: true,
  cache: true,
  cacheDirectory: isCoverage ? '<rootDir>/.jest-cache-coverage' : '<rootDir>/.jest-cache',
  testTimeout: isCoverage ? 60000 : 15000,
  projects: [
    ...unitProjects,
    {
      displayName: 'integration',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: [
        '<rootDir>/tests/mocks/chrome-api.mock.js',
        '<rootDir>/tests/mocks/dom-environment.js',
      ],
    },
  ],
  ...(isCoverage ? {
    coverageProvider: 'v8',
    collectCoverageFrom: ['<rootDir>/extension/**/*.js'],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary', 'html'],
    coverageThreshold: undefined,
  } : {}),
};
```

## 11. Cobertura linha a linha

### Linha 1 — modo coverage e bootstrap

**Fonte:** ``'use strict';``

**O que faz:** Ativa strict mode durante a avaliação do arquivo de configuração CommonJS.

**Como faz:** O arquivo é avaliado pelo Node/Jest como CommonJS; a flag vem de `process.env`, inclusive quando o runner CI a injeta.

**Por que foi implementado dessa forma:** Torna a avaliação da configuração mais estrita e reduz globais/erros silenciosos.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 2 — modo coverage e bootstrap

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa blocos de modo coverage e bootstrap; não altera a configuração entregue ao Jest.

**Como faz:** O arquivo é avaliado pelo Node/Jest como CommonJS; a flag vem de `process.env`, inclusive quando o runner CI a injeta.

**Por que foi implementado dessa forma:** Melhora legibilidade sem introduzir configuração.

**Por que uma implementação ingênua seria pior:** Não afeta runtime, mas compactação excessiva torna revisão de uma matriz de projetos mais difícil.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 3 — modo coverage e bootstrap

**Fonte:** ``const isCoverage = process.env.COVERAGE_MODE === '1';``

**O que faz:** Deriva um booleano estrito: coverage só é ativado quando `COVERAGE_MODE` é exatamente a string `1`.

**Como faz:** O arquivo é avaliado pelo Node/Jest como CommonJS; a flag vem de `process.env`, inclusive quando o runner CI a injeta.

**Por que foi implementado dessa forma:** Um único config atende execução normal e coverage, mas o runner consegue ativar comportamento mais caro explicitamente.

**Por que uma implementação ingênua seria pior:** Manter um segundo `jest.coverage.config.js` recriaria a duplicação que o gate estrutural proíbe e favoreceria drift.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE: `run-jest-ci.js --coverage` injeta `COVERAGE_MODE=1`; não há assertion focal para qualquer outro valor.

### Linha 4 — modo coverage e bootstrap

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa blocos de modo coverage e bootstrap; não altera a configuração entregue ao Jest.

**Como faz:** O arquivo é avaliado pelo Node/Jest como CommonJS; a flag vem de `process.env`, inclusive quando o runner CI a injeta.

**Por que foi implementado dessa forma:** Melhora legibilidade sem introduzir configuração.

**Por que uma implementação ingênua seria pior:** Não afeta runtime, mas compactação excessiva torna revisão de uma matriz de projetos mais difícil.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 5 — projeto Jest unitProjects

**Fonte:** ``const unitProjects = [``

**O que faz:** Abre a lista canônica dos sete projetos unitários selecionáveis por nome.

**Como faz:** A propriedade faz parte do objeto de projeto unitário; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 6 — projeto Jest unitProjects

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto corrente dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto unitário; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 7 — projeto Jest background

**Fonte:** ``    displayName: 'background',``

**O que faz:** Define o nome Jest `background`, usado por `--selectProjects background` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 8 — projeto Jest background

**Fonte:** ``    testEnvironment: 'node',``

**O que faz:** Define `node` como ambiente de execução do projeto background.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Usar jsdom indiscriminadamente adicionaria globals de browser que podem mascarar dependências indevidas e aumentar custo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 9 — projeto Jest background

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/background/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto background ao glob `<rootDir>/tests/unit/background/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 10 — projeto Jest background

**Fonte:** ``    setupFilesAfterEnv: ['<rootDir>/tests/mocks/chrome-api.mock.js'],``

**O que faz:** Carrega `<rootDir>/tests/mocks/chrome-api.mock.js` depois do ambiente Jest para background.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 11 — projeto Jest background

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto background dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 12 — projeto Jest background

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto background dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto background; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** O background é lógica de service worker/Node-like sem DOM; o mock de Chrome fornece a superfície da extensão sem simular uma janela.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 13 — projeto Jest gtc

**Fonte:** ``    displayName: 'gtc',``

**O que faz:** Define o nome Jest `gtc`, usado por `--selectProjects gtc` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto gtc; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os testes GTC focam fingerprint/storage e não precisam de DOM global por padrão; manter `node` reduz superfície simulada.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 14 — projeto Jest gtc

**Fonte:** ``    testEnvironment: 'node',``

**O que faz:** Define `node` como ambiente de execução do projeto gtc.

**Como faz:** A propriedade faz parte do objeto de projeto gtc; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os testes GTC focam fingerprint/storage e não precisam de DOM global por padrão; manter `node` reduz superfície simulada.

**Por que uma implementação ingênua seria pior:** Usar jsdom indiscriminadamente adicionaria globals de browser que podem mascarar dependências indevidas e aumentar custo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 15 — projeto Jest gtc

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/gtc/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto gtc ao glob `<rootDir>/tests/unit/gtc/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto gtc; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os testes GTC focam fingerprint/storage e não precisam de DOM global por padrão; manter `node` reduz superfície simulada.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 16 — projeto Jest gtc

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto gtc dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto gtc; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os testes GTC focam fingerprint/storage e não precisam de DOM global por padrão; manter `node` reduz superfície simulada.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 17 — projeto Jest gtc

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto gtc dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto gtc; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os testes GTC focam fingerprint/storage e não precisam de DOM global por padrão; manter `node` reduz superfície simulada.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 18 — projeto Jest content-scripts

**Fonte:** ``    displayName: 'content-scripts',``

**O que faz:** Define o nome Jest `content-scripts`, usado por `--selectProjects content-scripts` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 19 — projeto Jest content-scripts

**Fonte:** ``    testEnvironment: 'jsdom',``

**O que faz:** Define `jsdom` como ambiente de execução do projeto content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 20 — projeto Jest content-scripts

**Fonte:** ``    testMatch: [``

**O que faz:** Restringe descoberta do projeto content-scripts ao glob `declarado na linha`.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 21 — projeto Jest content-scripts

**Fonte:** ``      '<rootDir>/tests/unit/content-manga/**/*.test.js',``

**O que faz:** Inclui o conjunto de testes `<rootDir>/tests/unit/content-manga/**/*.test.js` no projeto content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 22 — projeto Jest content-scripts

**Fonte:** ``      '<rootDir>/tests/unit/content-gemini/**/*.test.js',``

**O que faz:** Inclui o conjunto de testes `<rootDir>/tests/unit/content-gemini/**/*.test.js` no projeto content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 23 — projeto Jest content-scripts

**Fonte:** ``      '<rootDir>/tests/unit/inject/**/*.test.js',``

**O que faz:** Inclui o conjunto de testes `<rootDir>/tests/unit/inject/**/*.test.js` no projeto content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 24 — projeto Jest content-scripts

**Fonte:** ``    ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 25 — projeto Jest content-scripts

**Fonte:** ``    setupFilesAfterEnv: [``

**O que faz:** Abre a lista de setup executada depois que o framework Jest está instalado para content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 26 — projeto Jest content-scripts

**Fonte:** ``      '<rootDir>/tests/mocks/chrome-api.mock.js',``

**O que faz:** Carrega o mock compartilhado de APIs Chrome para content-scripts, disponibilizando a superfície usada pelo código de extensão.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 27 — projeto Jest content-scripts

**Fonte:** ``      '<rootDir>/tests/mocks/dom-environment.js',``

**O que faz:** Carrega ajustes DOM compartilhados para content-scripts depois que jsdom/Jest estão disponíveis.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 28 — projeto Jest content-scripts

**Fonte:** ``    ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest content-scripts.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 29 — projeto Jest content-scripts

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto content-scripts dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 30 — projeto Jest content-scripts

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto content-scripts dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto content-scripts; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Content scripts dependem de DOM e APIs Chrome; `jsdom` mais os dois setup files aproxima a superfície mínima exigida pelos testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 31 — projeto Jest popup

**Fonte:** ``    displayName: 'popup',``

**O que faz:** Define o nome Jest `popup`, usado por `--selectProjects popup` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 32 — projeto Jest popup

**Fonte:** ``    testEnvironment: 'jsdom',``

**O que faz:** Define `jsdom` como ambiente de execução do projeto popup.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 33 — projeto Jest popup

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/popup/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto popup ao glob `<rootDir>/tests/unit/popup/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 34 — projeto Jest popup

**Fonte:** ``    setupFilesAfterEnv: [``

**O que faz:** Abre a lista de setup executada depois que o framework Jest está instalado para popup.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 35 — projeto Jest popup

**Fonte:** ``      '<rootDir>/tests/mocks/chrome-api.mock.js',``

**O que faz:** Carrega o mock compartilhado de APIs Chrome para popup, disponibilizando a superfície usada pelo código de extensão.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 36 — projeto Jest popup

**Fonte:** ``      '<rootDir>/tests/mocks/dom-environment.js',``

**O que faz:** Carrega ajustes DOM compartilhados para popup depois que jsdom/Jest estão disponíveis.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 37 — projeto Jest popup

**Fonte:** ``    ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest popup.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 38 — projeto Jest popup

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto popup dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 39 — projeto Jest popup

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto popup dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto popup; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Popup é uma página DOM privilegiada da extensão e também chama APIs Chrome; por isso recebe `jsdom`, mock Chrome e ambiente DOM comum.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 40 — projeto Jest reader

**Fonte:** ``    displayName: 'reader',``

**O que faz:** Define o nome Jest `reader`, usado por `--selectProjects reader` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 41 — projeto Jest reader

**Fonte:** ``    testEnvironment: 'jsdom',``

**O que faz:** Define `jsdom` como ambiente de execução do projeto reader.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 42 — projeto Jest reader

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/reader/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto reader ao glob `<rootDir>/tests/unit/reader/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 43 — projeto Jest reader

**Fonte:** ``    setupFilesAfterEnv: [``

**O que faz:** Abre a lista de setup executada depois que o framework Jest está instalado para reader.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 44 — projeto Jest reader

**Fonte:** ``      '<rootDir>/tests/mocks/chrome-api.mock.js',``

**O que faz:** Carrega o mock compartilhado de APIs Chrome para reader, disponibilizando a superfície usada pelo código de extensão.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 45 — projeto Jest reader

**Fonte:** ``      '<rootDir>/tests/mocks/dom-environment.js',``

**O que faz:** Carrega ajustes DOM compartilhados para reader depois que jsdom/Jest estão disponíveis.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 46 — projeto Jest reader

**Fonte:** ``    ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest reader.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 47 — projeto Jest reader

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto reader dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 48 — projeto Jest reader

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto reader dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto reader; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Reader é página DOM com mensagens/runtime e interação visual; usa a mesma base jsdom+Chrome do restante das UIs.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 49 — projeto Jest manifest

**Fonte:** ``    displayName: 'manifest',``

**O que faz:** Define o nome Jest `manifest`, usado por `--selectProjects manifest` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto manifest; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Validação do Manifest é análise de dados/arquivo e não requer DOM, reduzindo custo e acoplamento.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 50 — projeto Jest manifest

**Fonte:** ``    testEnvironment: 'node',``

**O que faz:** Define `node` como ambiente de execução do projeto manifest.

**Como faz:** A propriedade faz parte do objeto de projeto manifest; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Validação do Manifest é análise de dados/arquivo e não requer DOM, reduzindo custo e acoplamento.

**Por que uma implementação ingênua seria pior:** Usar jsdom indiscriminadamente adicionaria globals de browser que podem mascarar dependências indevidas e aumentar custo.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 51 — projeto Jest manifest

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/manifest/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto manifest ao glob `<rootDir>/tests/unit/manifest/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto manifest; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Validação do Manifest é análise de dados/arquivo e não requer DOM, reduzindo custo e acoplamento.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 52 — projeto Jest manifest

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto manifest dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto manifest; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Validação do Manifest é análise de dados/arquivo e não requer DOM, reduzindo custo e acoplamento.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 53 — projeto Jest manifest

**Fonte:** ``  {``

**O que faz:** Delimita o objeto do projeto manifest dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto manifest; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Validação do Manifest é análise de dados/arquivo e não requer DOM, reduzindo custo e acoplamento.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 54 — projeto Jest shared-ui

**Fonte:** ``    displayName: 'shared-ui',``

**O que faz:** Define o nome Jest `shared-ui`, usado por `--selectProjects shared-ui` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 55 — projeto Jest shared-ui

**Fonte:** ``    testEnvironment: 'jsdom',``

**O que faz:** Define `jsdom` como ambiente de execução do projeto shared-ui.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 56 — projeto Jest shared-ui

**Fonte:** ``    testMatch: ['<rootDir>/tests/unit/shared-ui/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto shared-ui ao glob `<rootDir>/tests/unit/shared-ui/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 57 — projeto Jest shared-ui

**Fonte:** ``    setupFilesAfterEnv: [``

**O que faz:** Abre a lista de setup executada depois que o framework Jest está instalado para shared-ui.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 58 — projeto Jest shared-ui

**Fonte:** ``      '<rootDir>/tests/mocks/chrome-api.mock.js',``

**O que faz:** Carrega o mock compartilhado de APIs Chrome para shared-ui, disponibilizando a superfície usada pelo código de extensão.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 59 — projeto Jest shared-ui

**Fonte:** ``      '<rootDir>/tests/mocks/dom-environment.js',``

**O que faz:** Carrega ajustes DOM compartilhados para shared-ui depois que jsdom/Jest estão disponíveis.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 60 — projeto Jest shared-ui

**Fonte:** ``    ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest shared-ui.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Os helpers compartilhados criam modal, usam storage/runtime e manipulam DOM; precisam de jsdom e dos mocks comuns.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 61 — projeto Jest shared-ui

**Fonte:** ``  },``

**O que faz:** Delimita o objeto do projeto shared-ui dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 62 — projeto Jest shared-ui

**Fonte:** ``];``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest shared-ui.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 63 — projeto Jest shared-ui

**Fonte:** ``␠ [linha vazia]``

**O que faz:** Linha vazia que separa blocos de projeto Jest shared-ui; não altera a configuração entregue ao Jest.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Melhora legibilidade sem introduzir configuração.

**Por que uma implementação ingênua seria pior:** Não afeta runtime, mas compactação excessiva torna revisão de uma matriz de projetos mais difícil.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 64 — configuração raiz/export

**Fonte:** ``module.exports = {``

**O que faz:** Inicia o objeto CommonJS que o Jest consome como configuração raiz.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 65 — configuração raiz/export

**Fonte:** ``  rootDir: __dirname,``

**O que faz:** Ancora `<rootDir>` no diretório que contém este arquivo, isto é, a raiz canônica do repositório.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟦 GATE/CONTRATO ESTRUTURAL: o repositório exige um único `jest.config.js` na raiz e os globs usam `<rootDir>`; sem assertion focal do valor `__dirname`.

### Linha 66 — configuração raiz/export

**Fonte:** ``  testEnvironment: 'node',``

**O que faz:** Define `node` como ambiente de execução do projeto shared-ui.

**Como faz:** A propriedade faz parte do objeto de projeto shared-ui; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 67 — configuração raiz/export

**Fonte:** ``  verbose: true,``

**O que faz:** Habilita saída detalhada de casos/suítes na execução Jest.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 68 — configuração raiz/export

**Fonte:** ``  cache: true,``

**O que faz:** Mantém o cache do Jest habilitado.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 69 — configuração raiz/export

**Fonte:** ``  cacheDirectory: isCoverage ? '<rootDir>/.jest-cache-coverage' : '<rootDir>/.jest-cache',``

**O que faz:** Separa cache de coverage (`.jest-cache-coverage`) do cache normal (`.jest-cache`) conforme `isCoverage`.

**Como faz:** O operador ternário lê `isCoverage`, garantindo valores distintos sem manter dois arquivos de configuração.

**Por que foi implementado dessa forma:** Instrumentação V8 pode alterar transformações/cache; separar diretórios evita reutilização cruzada e facilita limpeza seletiva.

**Por que uma implementação ingênua seria pior:** Um cache único pode misturar resultados instrumentados/não instrumentados e torna troubleshooting menos previsível.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o valor exato desta propriedade.

### Linha 70 — configuração raiz/export

**Fonte:** ``  testTimeout: isCoverage ? 60000 : 15000,``

**O que faz:** Define timeout global de 60 s em coverage e 15 s nas execuções normais.

**Como faz:** O operador ternário lê `isCoverage`, garantindo valores distintos sem manter dois arquivos de configuração.

**Por que foi implementado dessa forma:** Coverage e instrumentação aumentam custo; permitir 60 s reduz falso timeout sem enfraquecer a execução normal de 15 s.

**Por que uma implementação ingênua seria pior:** 60 s para tudo esconderia testes lentos; 15 s também em coverage geraria falhas por overhead de instrumentação.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para o valor exato desta propriedade.

### Linha 71 — configuração raiz/export

**Fonte:** ``  projects: [``

**O que faz:** Abre a lista final de projetos que Jest executará/permitirá selecionar.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** A lista explícita permite comandos unit/integration separados e partição verificável pela CI.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 72 — configuração raiz/export

**Fonte:** ``    ...unitProjects,``

**O que faz:** Expande os sete projetos unitários previamente definidos na configuração final.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 73 — configuração raiz/export

**Fonte:** ``    {``

**O que faz:** Delimita o objeto do projeto shared-ui dentro da configuração.

**Como faz:** A propriedade é entregue diretamente no objeto exportado que Jest carrega a partir da raiz.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 74 — projeto Jest integration

**Fonte:** ``      displayName: 'integration',``

**O que faz:** Define o nome Jest `integration`, usado por `--selectProjects integration` e pelos runners npm/CI.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 75 — projeto Jest integration

**Fonte:** ``      testEnvironment: 'jsdom',``

**O que faz:** Define `jsdom` como ambiente de execução do projeto integration.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Usar apenas Node faria testes DOM falharem ou exigiria mocks manuais frágeis de document/window.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 76 — projeto Jest integration

**Fonte:** ``      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],``

**O que faz:** Restringe descoberta do projeto integration ao glob `<rootDir>/tests/integration/**/*.test.js`.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Globs amplos podem provocar sobreposição entre projetos; globs estreitos demais deixam arquivos sem projeto. O runner CI verifica união/interseção da partição.

**Evidência automatizada:** ✅ PROVADO DIRETAMENTE no gate executável `run-jest-ci.js`: ele chama Jest com este config, usa `--listTests --selectProjects`, rejeita sobreposição e rejeita arquivos fora da união unit/integration.

### Linha 77 — projeto Jest integration

**Fonte:** ``      setupFilesAfterEnv: [``

**O que faz:** Abre a lista de setup executada depois que o framework Jest está instalado para integration.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Duplicar bootstrap em cada teste aumenta divergência; carregar mocks desnecessários em todos os projetos também mascara acoplamentos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 78 — projeto Jest integration

**Fonte:** ``        '<rootDir>/tests/mocks/chrome-api.mock.js',``

**O que faz:** Carrega o mock compartilhado de APIs Chrome para integration, disponibilizando a superfície usada pelo código de extensão.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 79 — projeto Jest integration

**Fonte:** ``        '<rootDir>/tests/mocks/dom-environment.js',``

**O que faz:** Carrega ajustes DOM compartilhados para integration depois que jsdom/Jest estão disponíveis.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pelas suítes descobertas neste projeto; não foi localizada assertion focal que prove especificamente a escolha deste ambiente/setup.

### Linha 80 — projeto Jest integration

**Fonte:** ``      ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest integration.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 81 — projeto Jest integration

**Fonte:** ``    },``

**O que faz:** Delimita o objeto do projeto integration dentro da configuração.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 82 — projeto Jest integration

**Fonte:** ``  ],``

**O que faz:** Fecha a coleção/objeto correspondente a projeto Jest integration.

**Como faz:** A propriedade faz parte do objeto de projeto integration; Jest usa `displayName` para seleção, `testMatch` para descoberta e o ambiente/setup para preparar globals antes dos testes.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 83 — configuração de cobertura condicional

**Fonte:** ``  ...(isCoverage ? {``

**O que faz:** Adiciona propriedades de coverage somente quando `COVERAGE_MODE === '1'`; fora desse modo espalha objeto vazio.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 84 — configuração de cobertura condicional

**Fonte:** ``    coverageProvider: 'v8',``

**O que faz:** Seleciona o provider nativo V8 para instrumentação/cobertura.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** O projeto padronizou coverage em V8 e o contrato CI exige esse provider.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige literalmente `coverageProvider: 'v8'`.

### Linha 85 — configuração de cobertura condicional

**Fonte:** ``    collectCoverageFrom: ['<rootDir>/extension/**/*.js'],``

**O que faz:** Inclui todos os JavaScript sob `extension/**/*.js` no universo de cobertura, mesmo quando um arquivo não for importado por teste.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** A cobertura deve representar toda a implementação em `extension/`, não apenas módulos importados incidentalmente.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` exige `<rootDir>/extension/**/*.js`.

### Linha 86 — configuração de cobertura condicional

**Fonte:** ``    coverageDirectory: '<rootDir>/coverage',``

**O que faz:** Direciona artifacts de cobertura para `<rootDir>/coverage`, caminho também ignorado pelo Git e publicado pela CI.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 CONTRATO OPERACIONAL: CI e `.gitignore` usam `coverage/`; sem assertion focal desta propriedade.

### Linha 87 — configuração de cobertura condicional

**Fonte:** ``    coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary', 'html'],``

**O que faz:** Solicita relatórios de console, resumo textual, LCOV, JSON summary e HTML.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** LCOV alimenta Codecov, JSON/text summary alimentam verificadores humanos/automáticos e HTML facilita inspeção local.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para `lcov`, `json-summary` e `text-summary`; `text` e `html` não recebem a mesma checagem focal.

### Linha 88 — configuração de cobertura condicional

**Fonte:** ``    coverageThreshold: undefined,``

**O que faz:** Deixa o threshold nativo do Jest indefinido; a política mínima é aplicada pelo verificador externo de coverage.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Thresholds vivem em `scripts/validation/verify-coverage.js`/baseline; duplicá-los no Jest criaria duas fontes de verdade.

**Por que uma implementação ingênua seria pior:** Definir números divergentes aqui e no verificador externo faria um comando passar e outro falhar com políticas distintas.

**Evidência automatizada:** 🟨 CONTRATO ARQUITETURAL: o verificador externo aplica baseline/thresholds; não há gate exigindo especificamente `undefined` aqui.

### Linha 89 — configuração de cobertura condicional

**Fonte:** ``  } : {}),``

**O que faz:** Fecha a coleção/objeto correspondente a configuração de cobertura condicional.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 90 — configuração de cobertura condicional

**Fonte:** ``};``

**O que faz:** Fecha o objeto exportado de configuração.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Centralizar em um único `jest.config.js` evita configs paralelos e mantém npm/CI apontando à mesma topologia de testes.

**Por que uma implementação ingênua seria pior:** Espalhar a mesma decisão entre package scripts, configs por pasta e workflow aumentaria risco de partições divergentes e testes omitidos.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

### Linha 91 — configuração de cobertura condicional

**Fonte:** ``⏎ [newline final]``

**O que faz:** Representa o LF terminal do arquivo, contado como posição documental pelo gate das Bíblias.

**Como faz:** O spread condicional injeta essas propriedades no objeto raiz apenas em coverage, evitando instrumentação e reporters caros nas execuções normais.

**Por que foi implementado dessa forma:** Preserva convenção de arquivo texto e permite equivalência posicional exata com o blob.

**Por que uma implementação ingênua seria pior:** Omitir a posição terminal quebraria a contagem documental 91/91.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE quando Jest carrega esta configuração pelos scripts npm/CI; nenhuma assertion focal adicional foi localizada para esta linha.

## 12. Autoauditoria

- SHA reconfirmado: `f0b7c55a5c8c5d87ae213e5821d7f8891b77d8cc`.
- Reserva: `Agente L`.
- Fonte integral: 90 linhas textuais + newline final.
- Posições: 91/91.
- Headings `Linha N`: 91/91 e sequenciais.
- Partição de projetos cruzada com `package.json`, `run-jest-ci.js` e `verify-ci-contract.js`.
- Provider/escopo/reporters classificados como gate estático apenas onde o verificador realmente os exige.
- Ambiente/setup/cache/timeout não receberam promoção indevida para prova direta.
- Nenhum código funcional/config foi alterado.

**Estado documental desta materialização:** 🟠 EM ANDAMENTO — pronta para promoção após auditoria e reconciliação serializada dos rastreadores.
