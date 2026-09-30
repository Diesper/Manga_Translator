# Bíblia técnica — `scripts/ci/data/test-baseline.json`

## Identidade do arquivo

- **Arquivo:** `scripts/ci/data/test-baseline.json`
- **SHA auditado:** `52a4b3c1500dca615b6e2ca3d0d7b140ffdb9a3e`
- **Agente responsável pela auditoria:** AGENTE 7
- **Tipo:** JSON de configuração/contrato de CI
- **Runtime:** Node.js em scripts de CI, validação e runners de teste; não é carregado pelo runtime MV3 da extensão
- **Tamanho lógico:** 67 linhas de conteúdo + newline final = **68 posições documentais**
- **Papel:** fonte central de pisos quantitativos para Jest, testes visuais, Playwright E2E, smoke e coverage
- **PR / branch:** #66 / `docs/project-bible`

## Papel arquitetural

Este arquivo não executa código e não possui efeitos colaterais por conta própria. Seu valor arquitetural está em ser **dados de política**: vários processos Node carregam o mesmo JSON e decidem se uma execução de testes/coverage pode ser considerada válida.

A distinção principal é entre:

1. **inventário mínimo**, para detectar testes/arquivos que desapareceram silenciosamente;
2. **tolerância máxima**, hoje zero para skipped/TODO/flaky onde configurado;
3. **coverage mínimo global**;
4. **coverage mínimo por arquivo crítico**;
5. **snapshot medido** (`measuredBaseline`), que hoje é apenas informativo.

Uma implementação ingênua com números hardcoded em cada runner permitiria drift: por exemplo, o reporter E2E poderia exigir 21 casos enquanto o verificador de shards aceitasse outro total. A centralização reduz esse risco, mas não o elimina porque nem todos os valores são protegidos contra redução deliberada/acidental.

## Quem carrega e como os dados fluem

| Consumidor | Forma de carga | Campos usados | Efeito |
|---|---|---|---|
| `scripts/ci/run-jest-ci.js` | `require('./data/test-baseline.json')` | `jest.minSuites`, `minTests`, `maxSkipped`, `maxTodo` | acumula problemas e faz o processo terminar com falha se o inventário cair ou houver skip/TODO |
| `scripts/ci/playwright-gate-reporter.js` | `require('./data/test-baseline.json')` | `e2e.minTests`, `maxSkipped`, `maxFlaky` | retorna `{status:'failed'}` ao Playwright quando o gate é violado |
| `scripts/validation/verify-e2e-shard-plan.js` | `JSON.parse(fs.readFileSync(...))` | `e2e.minTests` | impede inventário E2E abaixo do piso e valida cobertura exata dos grupos |
| `scripts/validation/verify-coverage.js` | `JSON.parse` de `baselinePath` | `coverage.minimum`, `criticalMinimum`, `minInstrumentedFiles` | adiciona violações de coverage global, por arquivo e de inventário instrumentado |
| `scripts/validation/verify-ci-contract.js` | `JSON.parse(fs.readFileSync(...))` | mínimos principais e `e2e.maxFlaky`; também compara soma do plano E2E com `e2e.minTests` | gate estático de coerência do contrato |
| `tests/smoke/run-smoke.js` | `require('../../scripts/ci/data/test-baseline.json')` | `smoke.minFiles` | encerra com código 1 se poucos arquivos smoke forem descobertos |
| `tests/visual/runner.js` | `require('../../scripts/ci/data/test-baseline.json')` | `visual.minTests`, `visual.maxSkipped` | faz `printSummary()` retornar falso quando o gate visual cai |
| `scripts/validation/verify-repository-structure.js` | referência estrutural | caminho do arquivo | exige que o baseline exista no layout canônico; não valida os números |
| `scripts/validation/verify-ci-contract-selftest.js` | copia o baseline real para sandbox | arquivo inteiro incidentalmente | executa o CI Contract, mas suas assertions negativas focam job, `forbidOnly` e marcador de regressão |
| `scripts/validation/verify-coverage-selftest.js` | cria baseline sintético | shape de coverage | prova a mecânica do verificador, não os números reais deste arquivo |
| `scripts/validation/playwright-gate-reporter-selftest.js` | importa reporter que importa este baseline real | `e2e.*` | prova diretamente 21 testes mínimos, zero skipped e zero flaky/retry |

### Lifecycle

Cada consumidor lê o JSON no início do processo Node. Com `require()`, o objeto fica no cache de módulos pelo restante daquele processo; com `fs.readFileSync` + `JSON.parse`, é lido uma vez na inicialização do script. Não existe reidratação, storage, Chrome API, timer, listener ou estado MV3 aqui.

Alterar o arquivo entre processos afeta execuções futuras. Alterá-lo durante um processo já iniciado não atualiza o objeto carregado naquele processo.

## Segurança e trust boundaries

O arquivo não contém segredo, dado de usuário, URL remota, Base64, credencial ou identificador de aba. A fronteira relevante é **integridade da CI**:

- quem modifica este JSON pode enfraquecer o gate sem alterar código funcional;
- reduzir `jest.minTests`, `visual.minTests`, `smoke.minFiles` ou thresholds de coverage torna a regressão mais fácil de passar;
- aumentar `maxSkipped`, `maxTodo` ou `maxFlaky` relaxa a política;
- remover `coverage.minimum` ou `coverage.criticalMinimum` pode causar comportamento fail-open no verificador porque ele usa fallbacks vazios;
- `measuredBaseline` não participa de nenhuma decisão automatizada encontrada.

A revisão deste arquivo deve portanto ser tratada como mudança de política, não como simples atualização de dados.

## Fonte integral auditada

```json
{
  "jest": {
    "minSuites": 108,
    "minTests": 848,
    "maxSkipped": 0,
    "maxTodo": 0
  },
  "visual": {
    "minTests": 224,
    "maxSkipped": 0
  },
  "e2e": {
    "minTests": 21,
    "maxSkipped": 0,
    "maxFlaky": 0
  },
  "smoke": {
    "minFiles": 6
  },
  "coverage": {
    "minInstrumentedFiles": 56,
    "measuredBaseline": {
      "statements": 79.44,
      "branches": 71.85,
      "functions": 82.5,
      "lines": 79.44
    },
    "minimum": {
      "statements": 78,
      "branches": 71,
      "functions": 80,
      "lines": 78
    },
    "criticalMinimum": {
      "extension/background.js": {
        "statements": 55,
        "branches": 62,
        "functions": 72,
        "lines": 55
      },
      "extension/content/content_manga.js": {
        "statements": 72,
        "branches": 68,
        "functions": 71,
        "lines": 72
      },
      "extension/content/content_gemini.js": {
        "statements": 87,
        "branches": 81,
        "functions": 76,
        "lines": 87
      },
      "extension/shared/shared-ui.js": {
        "statements": 86,
        "branches": 69,
        "functions": 98,
        "lines": 86
      },
      "extension/content/gemini/job-runner.js": {
        "statements": 87,
        "branches": 64,
        "functions": 80,
        "lines": 87
      }
    }
  }
}
```

> O blob termina com newline; a posição 68 é documentada separadamente abaixo.

## Cobertura documental linha a linha

### Linha 1

**Fonte:** `{`

**O que faz / como faz:** Abre o objeto JSON raiz que centraliza todos os pisos de qualidade da suíte.

**Por que existe / risco de implementação ingênua:** A raiz única permite que runners Node carreguem o mesmo contrato por `require()` ou `JSON.parse`, evitando números duplicados em vários scripts.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO: `verify-ci-contract.js` faz `JSON.parse` deste arquivo; JSON inválido derruba o gate. Não existe schema JSON dedicado.

### Linha 2

**Fonte:** `  "jest": {`

**O que faz / como faz:** Abre o bloco `jest`, consumido pelo runner canônico `scripts/ci/run-jest-ci.js`.

**Por que existe / risco de implementação ingênua:** Agrupar os limites do Jest separa inventário unit/integration dos gates visual, smoke, E2E e coverage.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: `run-jest-ci.js` lê `baseline.jest.*` durante `npm run test:ci`; o workflow executa esse comando.

### Linha 3

**Fonte:** `    "minSuites": 108,`

**O que faz / como faz:** Define `jest.minSuites = 108`: o relatório JSON do Jest precisa conter pelo menos 108 suítes.

**Por que existe / risco de implementação ingênua:** O piso detecta desaparecimento silencioso de arquivos/suítes mesmo quando o Jest retorna sucesso.

**Evidência:** 🟦 + 🟨: `verify-ci-contract.js` exige inteiro positivo; `run-jest-ci.js` compara `numTotalTestSuites < baseline.jest.minSuites`. O valor exato 108 não é pinado por self-test.

### Linha 4

**Fonte:** `    "minTests": 848,`

**O que faz / como faz:** Define `jest.minTests = 848`: o runner rejeita inventário com menos de 848 testes.

**Por que existe / risco de implementação ingênua:** Protege contra regressões em que discovery/configuração deixa de executar testes sem produzir falha funcional.

**Evidência:** 🟦 + 🟨: inteiro positivo validado pelo CI Contract e comparação real em `run-jest-ci.js`. Não há assertion específica que congele exatamente 848.

### Linha 5

**Fonte:** `    "maxSkipped": 0,`

**O que faz / como faz:** Define `jest.maxSkipped = 0`: qualquer teste pendente/skipped no relatório Jest deve reprovar o gate.

**Por que existe / risco de implementação ingênua:** Zero implementa a política de não aceitar cobertura aparente com testes ignorados.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: `run-jest-ci.js` compara `numPendingTests > baseline.jest.maxSkipped`. Não há self-test específico do valor zero.

### Linha 6

**Fonte:** `    "maxTodo": 0`

**O que faz / como faz:** Define `jest.maxTodo = 0`: nenhum `test.todo` pode aparecer no relatório final.

**Por que existe / risco de implementação ingênua:** Evita que dívida de teste entre no inventário como caso contabilizado sem execução.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: `run-jest-ci.js` compara `numTodoTests > baseline.jest.maxTodo`; o valor exato não é protegido por assertion própria.

### Linha 7

**Fonte:** `  },`

**O que faz / como faz:** Fecha o objeto `jest`.

**Por que existe / risco de implementação ingênua:** Mantém os quatro limites como uma unidade de contrato carregada atomicamente pelo parser JSON.

**Evidência:** 🟦 Estrutural: necessário para o parse; não possui comportamento independente.

### Linha 8

**Fonte:** `  "visual": {`

**O que faz / como faz:** Abre o bloco `visual` para o runner visual customizado.

**Por que existe / risco de implementação ingênua:** Os testes visuais usam runner próprio, por isso precisam de limites separados dos contadores do Jest.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE por `tests/visual/runner.js`.

### Linha 9

**Fonte:** `    "minTests": 224,`

**O que faz / como faz:** Define `visual.minTests = 224`, piso do total `pass + fail + skip` calculado pelo runner visual.

**Por que existe / risco de implementação ingênua:** Detecta perda de suites/arquivos visuais mesmo que os testes restantes passem.

**Evidência:** 🟦 + 🟨: `verify-ci-contract.js` exige inteiro positivo; `printSummary()` reprova se `total < 224`. Não há self-test que congele 224.

### Linha 10

**Fonte:** `    "maxSkipped": 0`

**O que faz / como faz:** Define `visual.maxSkipped = 0`.

**Por que existe / risco de implementação ingênua:** Garante que um teste registrado sem função (`it(label)`/`ita(label)`) não seja aceito como cobertura válida.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE: `tests/visual/runner.js` reprova quando `results.skip` supera este valor; sem assertion específica do número zero.

### Linha 11

**Fonte:** `  },`

**O que faz / como faz:** Fecha o bloco `visual`.

**Por que existe / risco de implementação ingênua:** Delimita o contrato do runner visual antes do bloco E2E.

**Evidência:** 🟦 Estrutural: coberto pelo parse do JSON.

### Linha 12

**Fonte:** `  "e2e": {`

**O que faz / como faz:** Abre o bloco `e2e`, usado pelo reporter Playwright e pelo verificador do plano de shards.

**Por que existe / risco de implementação ingênua:** Centraliza inventário, skips e flakiness para o E2E em um único contrato.

**Evidência:** ✅ O módulo consumidor real é exercitado por `playwright-gate-reporter-selftest.js`.

### Linha 13

**Fonte:** `    "minTests": 21,`

**O que faz / como faz:** Define `e2e.minTests = 21`. O reporter exige ao menos 21 testes descobertos e o verificador do plano exige inventário completo >=21.

**Por que existe / risco de implementação ingênua:** Também amarra o total esperado dos cinco grupos do `e2e-shard-plan.json` ao baseline.

**Evidência:** ✅ PROVADO DIRETAMENTE: o self-test passa com 21 e exige falha com total 20; `verify-ci-contract.js` ainda exige que a soma fixa 1+3+4+4+9 seja igual a este valor.

### Linha 14

**Fonte:** `    "maxSkipped": 0,`

**O que faz / como faz:** Define `e2e.maxSkipped = 0`.

**Por que existe / risco de implementação ingênua:** Impede que Playwright finalize verde com teste E2E ignorado.

**Evidência:** ✅ PROVADO DIRETAMENTE: o self-test troca um dos 21 resultados para `skipped` e exige `{status:'failed'}`; aumentar esse limite quebraria a assertion.

### Linha 15

**Fonte:** `    "maxFlaky": 0`

**O que faz / como faz:** Define `e2e.maxFlaky = 0`. O reporter conta testes que falharam/timedOut e depois passaram em retry.

**Por que existe / risco de implementação ingênua:** A política considera retry recuperado como regressão, evitando mascarar instabilidade.

**Evidência:** ✅ PROVADO DIRETAMENTE: self-test cria tentativa `failed`/`timedOut` seguida de `passed` com retry=1 e exige falha. `verify-ci-contract.js` também exige inteiro não negativo.

### Linha 16

**Fonte:** `  },`

**O que faz / como faz:** Fecha o bloco `e2e`.

**Por que existe / risco de implementação ingênua:** Separa o contrato de execução do Playwright do inventário smoke.

**Evidência:** 🟦 Estrutural.

### Linha 17

**Fonte:** `  "smoke": {`

**O que faz / como faz:** Abre o bloco `smoke`.

**Por que existe / risco de implementação ingênua:** Smoke é executado por scripts Node independentes, então usa contagem de arquivos em vez de contagem de casos Jest.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE por `tests/smoke/run-smoke.js`.

### Linha 18

**Fonte:** `    "minFiles": 6`

**O que faz / como faz:** Define `smoke.minFiles = 6`: o launcher precisa descobrir pelo menos seis arquivos `smoke-*.js`.

**Por que existe / risco de implementação ingênua:** Protege contra remoção/rename acidental de cenários smoke que faria o launcher executar um subconjunto e ainda retornar zero.

**Evidência:** 🟦 + 🟨: inteiro positivo validado pelo CI Contract e comparação real em `run-smoke.js`; não há self-test que fixe exatamente 6.

### Linha 19

**Fonte:** `  },`

**O que faz / como faz:** Fecha o bloco `smoke`.

**Por que existe / risco de implementação ingênua:** Conclui os limites de inventário antes dos thresholds de cobertura.

**Evidência:** 🟦 Estrutural.

### Linha 20

**Fonte:** `  "coverage": {`

**O que faz / como faz:** Abre o bloco `coverage`, consumido por `scripts/validation/verify-coverage.js`.

**Por que existe / risco de implementação ingênua:** Agrupa integridade do inventário instrumentado, snapshot observado e pisos globais/por arquivo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE no job de coverage; o self-test da infraestrutura usa um baseline sintético.

### Linha 21

**Fonte:** `    "minInstrumentedFiles": 56,`

**O que faz / como faz:** Define `coverage.minInstrumentedFiles = 56`. O verificador conta entradas de arquivo em `coverage-summary.json` e reprova abaixo desse piso.

**Por que existe / risco de implementação ingênua:** Evita que mudanças em `collectCoverageFrom` ou discovery reduzam silenciosamente o conjunto instrumentado.

**Evidência:** 🟦 + 🟨: CI Contract exige inteiro positivo e o verificador real compara a contagem. O valor exato 56 não é congelado por self-test.

### Linha 22

**Fonte:** `    "measuredBaseline": {`

**O que faz / como faz:** Abre `measuredBaseline`, um snapshot de percentuais observados.

**Por que existe / risco de implementação ingênua:** O nome diferencia medição histórica de `minimum`, que é o que efetivamente bloqueia o CI.

**Evidência:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO: busca de consumidores encontrou `measuredBaseline` somente neste arquivo; nenhum gate lê este objeto.

### Linha 23

**Fonte:** `      "statements": 79.44,`

**O que faz / como faz:** Registra `measuredBaseline.statements = 79.44`.

**Por que existe / risco de implementação ingênua:** Serve como referência humana de margem sobre o mínimo de statements (78), hoje +1,44 p.p.

**Evidência:** ⚠️ Sem consumidor automatizado; alterar/remover este número não muda o resultado dos gates encontrados.

### Linha 24

**Fonte:** `      "branches": 71.85,`

**O que faz / como faz:** Registra `measuredBaseline.branches = 71.85`.

**Por que existe / risco de implementação ingênua:** Documenta a medição de branches, hoje +0,85 p.p. sobre o mínimo 71.

**Evidência:** ⚠️ Sem consumidor automatizado.

### Linha 25

**Fonte:** `      "functions": 82.5,`

**O que faz / como faz:** Registra `measuredBaseline.functions = 82.5`.

**Por que existe / risco de implementação ingênua:** Documenta a medição de functions, hoje +2,5 p.p. sobre o mínimo 80.

**Evidência:** ⚠️ Sem consumidor automatizado.

### Linha 26

**Fonte:** `      "lines": 79.44`

**O que faz / como faz:** Registra `measuredBaseline.lines = 79.44`.

**Por que existe / risco de implementação ingênua:** Documenta a medição de lines, hoje +1,44 p.p. sobre o mínimo 78.

**Evidência:** ⚠️ Sem consumidor automatizado.

### Linha 27

**Fonte:** `    },`

**O que faz / como faz:** Fecha `measuredBaseline`.

**Por que existe / risco de implementação ingênua:** Mantém o snapshot separado dos thresholds bloqueantes.

**Evidência:** ⚠️ Estrutura apenas informativa enquanto nenhum consumidor ler esse objeto.

### Linha 28

**Fonte:** `    "minimum": {`

**O que faz / como faz:** Abre `coverage.minimum`, conjunto de pisos globais aplicados ao bloco `total` de `coverage-summary.json`.

**Por que existe / risco de implementação ingênua:** Separar mínimo global de `criticalMinimum` permite tolerar distribuição desigual sem deixar a cobertura total cair demais.

**Evidência:** 🟨 O verificador real itera este objeto; o self-test prova a mecânica com baseline sintético, não os números deste arquivo.

### Linha 29

**Fonte:** `      "statements": 78,`

**O que faz / como faz:** Define mínimo global de statements em 78%.

**Por que existe / risco de implementação ingênua:** `verify-coverage.js` compara `metrics.statements` com este valor e adiciona problema quando fica abaixo.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; ⚠️ a imutabilidade do valor 78 não é testada e o CI Contract não impede redução.

### Linha 30

**Fonte:** `      "branches": 71,`

**O que faz / como faz:** Define mínimo global de branches em 71%.

**Por que existe / risco de implementação ingênua:** Protege a cobertura de decisões, normalmente mais difícil de manter do que statements/lines.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; o valor exato 71 pode ser reduzido sem self-test específico.

### Linha 31

**Fonte:** `      "functions": 80,`

**O que faz / como faz:** Define mínimo global de functions em 80%.

**Por que existe / risco de implementação ingênua:** Evita que funções inteiras deixem de ser exercitadas mesmo com statements globais ainda altos.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; sem pinagem específica do 80.

### Linha 32

**Fonte:** `      "lines": 78`

**O que faz / como faz:** Define mínimo global de lines em 78%.

**Por que existe / risco de implementação ingênua:** Complementa statements com a métrica de linhas reportada pelo provider V8/Jest.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE; sem pinagem específica do 78.

### Linha 33

**Fonte:** `    },`

**O que faz / como faz:** Fecha `minimum`.

**Por que existe / risco de implementação ingênua:** Finaliza os quatro thresholds globais antes dos pisos por arquivo crítico.

**Evidência:** 🟦 Estrutural; a presença do objeto em si não é exigida pelo CI Contract.

### Linha 34

**Fonte:** `    "criticalMinimum": {`

**O que faz / como faz:** Abre `criticalMinimum`, mapa `caminho -> métricas mínimas`.

**Por que existe / risco de implementação ingênua:** Impede que bons números globais escondam queda forte em arquivos centrais do produto.

**Evidência:** 🟨 `verify-coverage.js` itera as entradas; ⚠️ o conjunto de chaves não é pinado por um teste específico.

### Linha 35

**Fonte:** `      "extension/background.js": {`

**O que faz / como faz:** Abre thresholds de `extension/background.js`.

**Por que existe / risco de implementação ingênua:** O service worker é uma superfície crítica; o mapa exige um piso individual além da presença no relatório.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE no verificador real. A lista `DEFAULT_CRITICAL_FILES` também exige que o arquivo exista no summary/LCOV, mas não fixa estes números.

### Linha 36

**Fonte:** `        "statements": 55,`

**O que faz / como faz:** Define statements mínimos de `background.js` em 55%.

**Por que existe / risco de implementação ingênua:** O verificador compara o percentual do arquivo com 55.

**Evidência:** 🟨; valor exato sem assertion de anti-redução.

### Linha 37

**Fonte:** `        "branches": 62,`

**O que faz / como faz:** Define branches mínimos de `background.js` em 62%.

**Por que existe / risco de implementação ingênua:** Protege caminhos condicionais do background contra queda abaixo do piso configurado.

**Evidência:** 🟨; sem pinagem exata.

### Linha 38

**Fonte:** `        "functions": 72,`

**O que faz / como faz:** Define functions mínimas de `background.js` em 72%.

**Por que existe / risco de implementação ingênua:** Piso por função para o service worker.

**Evidência:** 🟨; sem pinagem exata.

### Linha 39

**Fonte:** `        "lines": 55`

**O que faz / como faz:** Define lines mínimas de `background.js` em 55%.

**Por que existe / risco de implementação ingênua:** Piso por linhas do service worker.

**Evidência:** 🟨; sem pinagem exata.

### Linha 40

**Fonte:** `      },`

**O que faz / como faz:** Fecha thresholds de `background.js`.

**Por que existe / risco de implementação ingênua:** Termina a primeira entrada crítica.

**Evidência:** 🟦 Estrutural.

### Linha 41

**Fonte:** `      "extension/content/content_manga.js": {`

**O que faz / como faz:** Abre thresholds de `extension/content/content_manga.js`.

**Por que existe / risco de implementação ingênua:** Protege o content script principal, grande e central ao fluxo de tradução.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE pelo verificador de coverage.

### Linha 42

**Fonte:** `        "statements": 72,`

**O que faz / como faz:** Statements mínimos de `content_manga.js`: 72%.

**Por que existe / risco de implementação ingênua:** Aplicado ao summary específico desse arquivo.

**Evidência:** 🟨; número não pinado.

### Linha 43

**Fonte:** `        "branches": 68,`

**O que faz / como faz:** Branches mínimos de `content_manga.js`: 68%.

**Por que existe / risco de implementação ingênua:** Piso de decisões do pipeline Manga.

**Evidência:** 🟨; número não pinado.

### Linha 44

**Fonte:** `        "functions": 71,`

**O que faz / como faz:** Functions mínimas de `content_manga.js`: 71%.

**Por que existe / risco de implementação ingênua:** Piso de funções do content script.

**Evidência:** 🟨; número não pinado.

### Linha 45

**Fonte:** `        "lines": 72`

**O que faz / como faz:** Lines mínimas de `content_manga.js`: 72%.

**Por que existe / risco de implementação ingênua:** Piso de linhas do content script.

**Evidência:** 🟨; número não pinado.

### Linha 46

**Fonte:** `      },`

**O que faz / como faz:** Fecha thresholds de `content_manga.js`.

**Por que existe / risco de implementação ingênua:** Conclui a segunda entrada crítica.

**Evidência:** 🟦 Estrutural.

### Linha 47

**Fonte:** `      "extension/content/content_gemini.js": {`

**O que faz / como faz:** Abre thresholds de `extension/content/content_gemini.js`.

**Por que existe / risco de implementação ingênua:** Protege o content script Gemini e sua orquestração de mensagens/DOM.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 48

**Fonte:** `        "statements": 87,`

**O que faz / como faz:** Statements mínimos de `content_gemini.js`: 87%.

**Por que existe / risco de implementação ingênua:** Piso individual alto para statements desse módulo.

**Evidência:** 🟨; valor exato sem assertion específica.

### Linha 49

**Fonte:** `        "branches": 81,`

**O que faz / como faz:** Branches mínimos de `content_gemini.js`: 81%.

**Por que existe / risco de implementação ingênua:** Piso de ramificações do módulo Gemini.

**Evidência:** 🟨; valor exato sem assertion específica.

### Linha 50

**Fonte:** `        "functions": 76,`

**O que faz / como faz:** Functions mínimas de `content_gemini.js`: 76%.

**Por que existe / risco de implementação ingênua:** Piso de funções do módulo Gemini.

**Evidência:** 🟨; valor exato sem assertion específica.

### Linha 51

**Fonte:** `        "lines": 87`

**O que faz / como faz:** Lines mínimas de `content_gemini.js`: 87%.

**Por que existe / risco de implementação ingênua:** Piso de linhas do módulo Gemini.

**Evidência:** 🟨; valor exato sem assertion específica.

### Linha 52

**Fonte:** `      },`

**O que faz / como faz:** Fecha thresholds de `content_gemini.js`.

**Por que existe / risco de implementação ingênua:** Conclui a terceira entrada crítica.

**Evidência:** 🟦 Estrutural.

### Linha 53

**Fonte:** `      "extension/shared/shared-ui.js": {`

**O que faz / como faz:** Abre thresholds de `extension/shared/shared-ui.js`.

**Por que existe / risco de implementação ingênua:** Protege utilitários de UI compartilhados por páginas da extensão.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 54

**Fonte:** `        "statements": 86,`

**O que faz / como faz:** Statements mínimos de `shared-ui.js`: 86%.

**Por que existe / risco de implementação ingênua:** Piso individual de statements.

**Evidência:** 🟨; sem pinagem exata.

### Linha 55

**Fonte:** `        "branches": 69,`

**O que faz / como faz:** Branches mínimos de `shared-ui.js`: 69%.

**Por que existe / risco de implementação ingênua:** Piso individual de branches.

**Evidência:** 🟨; sem pinagem exata.

### Linha 56

**Fonte:** `        "functions": 98,`

**O que faz / como faz:** Functions mínimas de `shared-ui.js`: 98%.

**Por que existe / risco de implementação ingênua:** Piso quase total de funções, sensível à introdução de helpers não cobertos.

**Evidência:** 🟨; sem pinagem exata.

### Linha 57

**Fonte:** `        "lines": 86`

**O que faz / como faz:** Lines mínimas de `shared-ui.js`: 86%.

**Por que existe / risco de implementação ingênua:** Piso individual de lines.

**Evidência:** 🟨; sem pinagem exata.

### Linha 58

**Fonte:** `      },`

**O que faz / como faz:** Fecha thresholds de `shared-ui.js`.

**Por que existe / risco de implementação ingênua:** Conclui a quarta entrada crítica.

**Evidência:** 🟦 Estrutural.

### Linha 59

**Fonte:** `      "extension/content/gemini/job-runner.js": {`

**O que faz / como faz:** Abre thresholds de `extension/content/gemini/job-runner.js`.

**Por que existe / risco de implementação ingênua:** Protege o runner de jobs, núcleo do pipeline Gemini.

**Evidência:** 🟨 EXECUTADO INDIRETAMENTE.

### Linha 60

**Fonte:** `        "statements": 87,`

**O que faz / como faz:** Statements mínimos de `job-runner.js`: 87%.

**Por que existe / risco de implementação ingênua:** Piso individual de statements.

**Evidência:** 🟨; sem pinagem exata.

### Linha 61

**Fonte:** `        "branches": 64,`

**O que faz / como faz:** Branches mínimos de `job-runner.js`: 64%.

**Por que existe / risco de implementação ingênua:** Piso individual de branches.

**Evidência:** 🟨; sem pinagem exata.

### Linha 62

**Fonte:** `        "functions": 80,`

**O que faz / como faz:** Functions mínimas de `job-runner.js`: 80%.

**Por que existe / risco de implementação ingênua:** Piso individual de functions.

**Evidência:** 🟨; sem pinagem exata.

### Linha 63

**Fonte:** `        "lines": 87`

**O que faz / como faz:** Lines mínimas de `job-runner.js`: 87%.

**Por que existe / risco de implementação ingênua:** Piso individual de lines.

**Evidência:** 🟨; sem pinagem exata.

### Linha 64

**Fonte:** `      }`

**O que faz / como faz:** Fecha thresholds de `job-runner.js`.

**Por que existe / risco de implementação ingênua:** Conclui a quinta entrada crítica.

**Evidência:** 🟦 Estrutural.

### Linha 65

**Fonte:** `    }`

**O que faz / como faz:** Fecha `criticalMinimum`.

**Por que existe / risco de implementação ingênua:** Encerra o mapa de thresholds por arquivo.

**Evidência:** 🟦 Estrutural. ⚠️ Remover todo o objeto faria `verify-coverage.js` usar `{}` e deixaria de aplicar pisos por arquivo; o CI Contract atual não rejeita explicitamente essa ausência.

### Linha 66

**Fonte:** `  }`

**O que faz / como faz:** Fecha o bloco `coverage`.

**Por que existe / risco de implementação ingênua:** Finaliza todas as regras de cobertura.

**Evidência:** 🟦 Estrutural. Alguns consumidores usam optional chaining/fallback, portanto subobjetos ausentes podem enfraquecer o gate sem erro explícito.

### Linha 67

**Fonte:** `}`

**O que faz / como faz:** Fecha o objeto raiz.

**Por que existe / risco de implementação ingênua:** Completa o documento JSON carregado por todos os consumidores.

**Evidência:** 🟦 GATE ESTÁTICO ESPECÍFICO via parsing pelo CI Contract e pelos runners.

### Linha 68

**Fonte:** ␤ (newline final)

**O que faz / como faz:** Representa o newline final após `}`.

**Por que existe / risco de implementação ingênua:** Não altera o valor JSON, mas é parte do blob auditado e preserva formato textual/compatibilidade POSIX.

**Evidência:** 🟦 Estrutural; explicitamente incluído para fechar 68/68 posições documentais.


## Evidências automatizadas

### ✅ PROVADO DIRETAMENTE

**E2E — `scripts/validation/playwright-gate-reporter-selftest.js`**

O self-test carrega `PlaywrightGateReporter`, que por sua vez carrega **este baseline real**. As assertions relevantes são:

- 21 tentativas `passed` → `assert.strictEqual(..., undefined)`;
- 20 testes totais → `assert.deepStrictEqual(..., { status: 'failed' })`;
- 1 resultado `skipped` em 21 → falha;
- tentativa `failed`/ `timedOut` seguida de `passed` com retry=1 → falha.

Isso prova diretamente os contratos atuais de `e2e.minTests = 21`, `e2e.maxSkipped = 0` e `e2e.maxFlaky = 0`.

### 🟦 GATE ESTÁTICO ESPECÍFICO

`scripts/validation/verify-ci-contract.js`:

- exige inteiros positivos para `jest.minSuites`, `jest.minTests`, `visual.minTests`, `e2e.minTests`, `smoke.minFiles` e `coverage.minInstrumentedFiles`;
- exige `e2e.maxFlaky` inteiro e não negativo;
- exige que a soma dos cinco grupos canônicos do plano E2E seja igual a `baseline.e2e.minTests`;
- lê o JSON real, então sintaxe inválida impede o gate de completar.

Esse gate prova **shape mínimo/coerência**, mas não congela a maior parte dos números exatos.

### 🟨 EXECUTADO INDIRETAMENTE

- Jest: `run-jest-ci.js` usa os quatro valores de `jest` sobre o JSON real produzido pela execução.
- Visual: `tests/visual/runner.js#printSummary` usa `visual.minTests` e `visual.maxSkipped`.
- Smoke: `tests/smoke/run-smoke.js` usa `smoke.minFiles`.
- Coverage: `verify-coverage.js` usa `minimum`, `criticalMinimum` e `minInstrumentedFiles` no relatório real.
- `verify-e2e-shard-plan.js` usa `e2e.minTests` para o inventário total.

Nesses casos o comportamento participa do fluxo de CI, mas não há assertion dedicada dizendo que **o número atual específico** não pode ser reduzido.

### Evidência complementar / baseline sintético

`verify-coverage-selftest.js` cria seu próprio `test-baseline.json` temporário. Ele prova que `verifyCoverage()` rejeita, entre outros cenários, `threshold=80` com coverage real 75 e threshold crítico 80 com coverage 75. Isso é boa prova da implementação do verificador, mas **não prova** os valores 78/71/80/78 nem os cinco mapas críticos deste arquivo real.

`verify-ci-contract-selftest.js` copia este arquivo real para um sandbox, porém suas mutações/assertions focam outros contratos. A presença do baseline nesse teste é execução indireta, não uma prova específica dos números.

## Lacunas de teste

### 1. `measuredBaseline` não é consumido

- **Comportamento:** deveria representar a medição de referência.
- **Por que os testes atuais não provam:** nenhuma referência de código a `measuredBaseline` foi encontrada fora deste JSON.
- **Teste necessário:** gate que compare as medições documentadas com um snapshot/regras explícitas, ou remover/rotular o bloco como puramente informativo.
- **Regressão possível:** números ficarem obsoletos e transmitirem uma margem de segurança inexistente.

### 2. Valores exatos de Jest não são pinados

- **Comportamento:** 108 suítes, 848 testes, zero skipped e zero TODO são a política atual.
- **Por que não está provado especificamente:** o runner os usa, mas não existe self-test que enfraqueça cada valor e exija falha.
- **Teste necessário:** sandbox com relatório sintético no limite e mutações do baseline.
- **Regressão possível:** baixar `minTests`/ `minSuites` ou aumentar máximos sem que o CI Contract detecte o enfraquecimento.

### 3. Valores exatos do gate visual não são pinados

- **Comportamento:** 224 testes e zero skipped.
- **Teste necessário:** self-test do runner com 223/224 casos e um caso skipped.
- **Regressão possível:** redução silenciosa do inventário visual.

### 4. `smoke.minFiles = 6` não é pinado

- **Comportamento:** exige seis arquivos smoke.
- **Teste necessário:** executar o launcher em sandbox com cinco e seis arquivos, além de mutar o baseline.
- **Regressão possível:** remover cenário smoke e reduzir o baseline junto, mantendo CI verde.

### 5. `coverage.minimum` pode ser reduzido sem gate de anti-enfraquecimento

- **Comportamento:** 78/71/80/78 são pisos globais.
- **Por que a infraestrutura atual não basta:** o self-test usa thresholds sintéticos e o CI Contract só valida `minInstrumentedFiles`, não estes quatro números.
- **Teste necessário:** CI Contract deve exigir shape e pisos mínimos versionados, ou comparar contra valores canônicos.
- **Regressão possível:** uma alteração para 1% continuaria sintaticamente válida e o verificador passaria a aceitar coverage muito menor.

### 6. Remoção de `criticalMinimum` é fail-open para thresholds por arquivo

- **Comportamento:** cinco arquivos têm pisos individuais.
- **Por que não está protegido:** `verify-coverage.js` usa `baseline.coverage?.criticalMinimum || {}`; objeto ausente vira mapa vazio. O CI Contract não exige as cinco chaves.
- **Teste necessário:** self-test que remova o mapa/uma chave e exija falha do contrato.
- **Regressão possível:** coverage global continuar alto enquanto um módulo crítico cai muito.

### 7. Thresholds de coverage inválidos podem ser ignorados

- **Comportamento:** `minimum` deveria conter números.
- **Por que é frágil:** no mínimo global, valor não numérico cai em `continue`; no crítico, `Number(threshold)` pode virar `NaN` e a comparação não acusa threshold inválido.
- **Teste necessário:** baseline com `"statements": "abc"` deve reprovar explicitamente.
- **Regressão possível:** typo no JSON desativar um piso sem erro claro.

## Casos-limite e falhas

- JSON malformado: consumidores com `require`/`JSON.parse` falham cedo; isso tende a reprovar CI.
- Bloco `jest` ausente: `run-jest-ci.js` acessa `baseline.jest.*` e pode lançar; fail-closed por crash, mas com mensagem ruim.
- `coverage.minimum` ausente: vira objeto vazio e deixa de aplicar pisos globais.
- `coverage.criticalMinimum` ausente: vira objeto vazio e deixa de aplicar pisos por arquivo.
- `coverage.minInstrumentedFiles` ausente/zero: o verificador de coverage não aplica o piso, embora o CI Contract deva reprovar valor não inteiro positivo quando executado.
- máximos muito grandes: runners passam a tolerar skips/TODO/flaky; só o E2E possui self-test forte que hoje fixa zero.
- números fracionários nos campos de inventário: o CI Contract rejeita alguns `min*` por exigir inteiro; thresholds percentuais podem e devem ser fracionários.
- números negativos em coverage: não há validação de domínio explícita; comparações podem tornar o gate trivialmente permissivo.
- caminhos em `criticalMinimum`: são comparados após normalização para slash; uma chave errada gera "arquivo crítico ausente" somente porque o próprio mapa é iterado, mas remover a chave inteira não é detectado como ausência de política.

## Invariantes

1. O arquivo deve permanecer JSON válido e parseável por Node.
2. `e2e.minTests` deve continuar coerente com a soma do plano de shards.
3. `e2e.maxSkipped = 0` e `e2e.maxFlaky = 0` não podem ser relaxados sem revisão explícita da política e do self-test.
4. Nenhum piso de inventário deve ser reduzido apenas para fazer uma execução passar; mudança exige justificativa de corpus.
5. `coverage.minimum` deve conter statements/branches/functions/lines numéricos e não negativos.
6. `coverage.criticalMinimum` deve preservar explicitamente os módulos críticos pretendidos; remover uma chave é mudança de política.
7. `minInstrumentedFiles` deve acompanhar crescimento do conjunto instrumentado e nunca mascarar desaparecimento de arquivos.
8. `measuredBaseline` não deve ser apresentado como gate enquanto continuar sem consumidor automatizado.
9. Consumers devem ler este arquivo canônico; duplicar valores em workflow/scripts aumenta risco de drift.
10. Alterações futuras precisam distinguir “nova medição” de “novo mínimo”: medir pior não é motivo suficiente para baixar o mínimo.
11. O arquivo não deve passar a conter segredo, token ou dado sensível; ele é versionado publicamente no repositório.
12. O newline final faz parte do blob auditado e deve ser preservado quando possível.

## Análise crítica

### Ponto forte

A centralização já impede uma classe importante de drift: Jest, visual, smoke, E2E e coverage consultam o mesmo arquivo em vez de manter contagens locais independentes.

### Risco principal

O próprio baseline é uma **autoridade mutável**. Para a maioria dos campos, os gates verificam que a execução respeita o valor atual, mas não verificam que o valor atual não foi enfraquecido. Isso é especialmente importante para coverage, onde a remoção dos objetos de threshold pode resultar em ausência silenciosa de regras.

### Dívida técnica específica

`measuredBaseline` está desacoplado do sistema: tem aparência de dado operacional, mas nenhum consumidor. Ou ele precisa ganhar uma função verificável, ou a documentação deve continuar deixando claro que é apenas snapshot humano.

## Checklist de revisão futura

Antes de alterar este arquivo:

- confirmar inventário real de suites/testes/arquivos;
- verificar se o aumento do corpus requer elevar pisos;
- não reduzir threshold para “destravar CI” sem investigar a regressão;
- rodar `verify-ci-contract.js` e os self-tests de infraestrutura;
- executar Jest, smoke, visual, E2E e coverage relevantes;
- conferir que o plano E2E ainda soma exatamente `e2e.minTests`;
- revisar se as cinco entradas de `criticalMinimum` continuam representando os módulos que precisam de proteção individual;
- atualizar `measuredBaseline` apenas como snapshot, sem confundi-lo com mínimo bloqueante.

## Conclusão documental

A fonte integral foi reproduzida e as **68/68 posições** (67 linhas + newline final) estão explicitamente cobertas. O arquivo é pequeno, porém de alto impacto: altera critérios de aprovação de CI. A evidência é forte para os três campos E2E, moderada/indireta para Jest, visual, smoke e coverage, e inexistente para o uso automatizado de `measuredBaseline`.
