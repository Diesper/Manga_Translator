# Bíblia técnica — scripts/ci/data/regression-matrix.json

> **Estado:** 🟠 EM ANDAMENTO — REVISÃO DE QUALIDADE  
> **SHA auditado:** `f9b9e17e5870c0c6dff9394ef944a803414cc4d2`  
> **Agente responsável pela auditoria:** AGENTE 6  
> **Tipo:** configuração JSON de política/regressões do CI  
> **Linhas textuais:** **231**  
> **Posições documentais:** **232**, contando o newline final  
> **Entradas de regressão:** **23**  
> **PR:** #66  
> **Branch:** docs/project-bible

## 1. Papel arquitetural

`scripts/ci/data/regression-matrix.json` é a matriz declarativa que transforma regressões históricas críticas do Manga Translator em **sentinelas obrigatórias do CI Contract**. O arquivo não roda no runtime da extensão e não usa APIs Chrome, storage, rede ou DOM. Seu efeito acontece durante validação/CI: `scripts/validation/verify-ci-contract.js` lê este JSON, exige que a coleção tenha pelo menos 20 entradas, rejeita IDs vazios/duplicados, exige que cada arquivo alvo exista, exige pelo menos um marcador por entrada e procura literalmente cada marcador no arquivo indicado.

A matriz contém **23 contratos**, cobrindo lifecycle de extração, teardown de mocks/timers, RPA Gemini, clique individual, timer de worker, regex de pasta, gates de worker/flaky/coverage, guardas do JobRunner e cinco famílias E2E. Ela funciona como uma lista de “não deixe esta evidência desaparecer”, não como executor dos testes.

## 2. Consumidores e fluxo de execução

1. **`scripts/validation/verify-ci-contract.js` — consumidor operacional principal.** Lê `regression-matrix.json` por caminho canônico. Um JSON ausente/inválido adiciona problema. Para cada entrada, valida `id`, `file` e `markers`; procura cada marcador com `source.includes(marker)`.
2. **`scripts/validation/verify-ci-contract-selftest.js` — prova negativa do mecanismo.** Lê a própria matriz, copia para sandbox os arquivos referenciados e remove o primeiro marcador da primeira entrada testável; o processo só passa se `verify-ci-contract.js` falhar com “marcador obrigatório ausente”.
3. **`scripts/validation/verify-repository-structure.js` — gate de existência.** Inclui este JSON em `requirePresent`, impedindo remoção/renomeação silenciosa.
4. **`package.json#validate` e `#test:ci-contract:infra`.** O fluxo `validate` chama o CI Contract e seu self-test.
5. **`.github/workflows/ci.yml` — job `ci-contract`.** Executa o gate estrutural, `verify-ci-contract.js` e `npm run test:ci-contract:infra`; portanto alterações nesta matriz podem bloquear o PR.
6. README e `docs/Documentação.md` mencionam a matriz, mas são consumidores documentais, não executores.

### Fluxo concreto

`CI/package validate → verify-ci-contract.js → JSON.parse(regression-matrix.json) → regressions[] → validar id/file/markers → ler arquivo alvo → source.includes(marker) → problems[] → exit 1 se qualquer contrato falhar`.

O self-test acrescenta um segundo circuito: `matriz → descobrir arquivos de regressão → sandbox → remover marcador → executar verify-ci-contract.js → exigir falha`.

## 3. Contrato de dados observado

| Campo | Uso real | Proteção automatizada |
|---|---|---|
| `version` | metadado humano de schema | ⚠️ não lido pelo consumidor |
| `description` | contexto histórico do PR #47 | ⚠️ não lido |
| `regressions` | coleção operacional | 🟦 deve ser array efetivo e resultar em ≥20 entradas |
| `id` | identidade/diagnóstico | 🟦 string não vazia + unicidade |
| `error` | descrição humana do defeito | ⚠️ não lido |
| `file` | arquivo em que sentinelas devem existir | 🟦 string não vazia + arquivo existente |
| `markers` | substrings obrigatórias | 🟦 array não vazio; cada string precisa existir no arquivo |
| `gate` | rótulo humano da camada de teste | ⚠️ não lido |

## 4. Inventário dos 23 contratos

| Linhas | ID | Risco protegido |
|---:|---|---|
| 5–13 | `REG-EXTRACT-ACK-PERSISTED` | ACK persistido não pode deixar retry tardio da aba auxiliar. |
| 14–22 | `REG-EXTRACT-ACK-RETRY` | ACK negativo precisa repetir uma vez e cessar assim que houver persistência. |
| 23–31 | `REG-EXTRACT-PAGEHIDE-RETRY` | Descarte da página precisa cancelar retry pendente. |
| 32–40 | `REG-EXTRACT-PAGEHIDE-MAPPING` | Aba descartada não pode continuar consultando o mapeamento. |
| 41–49 | `REG-EXTRACT-SAFETY-TIMEOUT` | Timeout de segurança precisa encerrar polling/listeners sem disparo tardio. |
| 50–59 | `REG-RUNTIME-MESSAGE-TIMER` | Timer do mock de runtime não pode atravessar teardown. |
| 60–69 | `REG-STORAGE-PENDING-CALLBACK` | Callbacks do storage mock não podem contaminar o caso seguinte. |
| 70–78 | `REG-TABS-PENDING-UPDATE` | `tabs.create` tardio não pode reativar listener depois do teardown. |
| 79–87 | `REG-RUNTIME-INSTALLED-PENDING` | Evento `onInstalled` simulado deve pertencer ao lifecycle do teste. |
| 88–97 | `REG-RPA-PROMISE-TEARDOWN` | Promise do job não pode continuar viva e contaminar teardown. |
| 98–107 | `REG-SINGLE-CLICK-STALE-BATCH` | Imagem stale não pode iniciar lote depois de removida. |
| 108–118 | `REG-WORKER-ANCHOR-4S` | Timer de 4 s do arquivo-âncora não pode manter worker Jest vivo. |
| 119–127 | `REG-REGEX-FOLDER` | Metacaracteres do path não podem gerar SyntaxError ou match incorreto. |
| 128–138 | `REG-WORKER-WARNING-GATE` | Exit code verde não pode mascarar warning de worker forçado. |
| 139–149 | `REG-E2E-FLAKY-RETRY-GATE` | Flaky recuperado em retry não pode tornar o gate E2E verde. |
| 150–159 | `REG-COVERAGE-CRITICAL-THRESHOLD` | Cobertura crítica ausente/abaixo do threshold não pode ser mascarada. |
| 160–168 | `REG-JOB-RUNNER-GUARDS` | JobRunner não pode iniciar com dependências obrigatórias ausentes. |
| 169–177 | `REG-JOB-RUNNER-CLICK-FALLBACK` | Falha de clique em um card não pode impedir tentativa do próximo candidato. |
| 178–186 | `REG-E2E-FIFO-MULTIBATCH` | Lotes A→G não podem misturar estado, ordem ou resultados stale. |
| 187–197 | `REG-E2E-MODES-NO-GHOST` | Modos não podem depender de foco físico/ghost mousemove. |
| 198–208 | `REG-E2E-ATTACHMENT-GATE` | Prompt não pode ser enviado sem confirmação real do anexo. |
| 209–219 | `REG-E2E-RESULT-OWNERSHIP` | Clone do input/IMG órfã não pode ser aceito como resposta do modelo. |
| 220–229 | `REG-E2E-MANUAL-INERT` | Aba Gemini manual precisa permanecer inerte sem job. |

## 5. Evidência automatizada realmente conferida

A tabela abaixo separa duas coisas: **(a)** o CI Contract somente garante presença textual dos marcadores; **(b)** esta auditoria abriu os testes/scripts apontados e verificou as assertions reais. Assim, uma sentinela textual não é promovida indevidamente a prova comportamental.

| ID | Arquivo alvo | Assertion/comportamento conferido | Classificação do comportamento |
|---|---|---|---|
| `REG-EXTRACT-ACK-PERSISTED` | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | `extraction-and-handlers-real.test.js` carrega `extension/content/content_manga.js`; após a primeira entrega espera 850 ms, maior que o retry de 700 ms, e exige exatamente uma `IMAGE_READY_FROM_NEW_TAB`. | ✅ PROVADO DIRETAMENTE |
| `REG-EXTRACT-ACK-RETRY` | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | O teste força primeiro ACK negativo e segundo persistido; espera duas entregas, dois acknowledgements e igualdade entre payload original e retry. | ✅ PROVADO DIRETAMENTE |
| `REG-EXTRACT-PAGEHIDE-RETRY` | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | Após registrar `AUXILIARY_EXTRACT_RETRY`, o teste dispara `pagehide`, aguarda além do retry e exige que o total de entregas permaneça em 1. | ✅ PROVADO DIRETAMENTE |
| `REG-EXTRACT-PAGEHIDE-MAPPING` | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | O teste conta `CHECK_IF_EXTRACTION_TAB`, dispara `pagehide`, espera 150 ms e exige que nenhuma nova consulta de mapeamento apareça. | ✅ PROVADO DIRETAMENTE |
| `REG-EXTRACT-SAFETY-TIMEOUT` | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | O teste captura o timeout de segurança de 20 s, executa-o manualmente e exige `clearInterval`, remoção única dos listeners `load` e `error` e zero entrega posterior. | ✅ PROVADO DIRETAMENTE |
| `REG-RUNTIME-MESSAGE-TIMER` | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | `chrome-runtime-mock-lifecycle.test.js` cria canal pendente, exige `_pendingMessageTimers.size===1`, chama `clearMessageTimers`, exige zero e confirma que callback não roda após avanço de timer. | ✅ PROVADO DIRETAMENTE |
| `REG-STORAGE-PENDING-CALLBACK` | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | O teste agenda `storage.get`, observa dois timers pendentes, limpa o registry, exige zero e confirma callback não chamado. | ✅ PROVADO DIRETAMENTE |
| `REG-TABS-PENDING-UPDATE` | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | O teste registra listener de `tabs.onUpdated`, cria aba, verifica timer pendente, limpa timers e prova que o listener não dispara após avanço de 11 ms. | ✅ PROVADO DIRETAMENTE |
| `REG-RUNTIME-INSTALLED-PENDING` | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | O teste registra `onInstalled`, observa timer no registry do runtime, limpa-o e exige que o callback instalado não seja chamado. | ✅ PROVADO DIRETAMENTE |
| `REG-RPA-PROMISE-TEARDOWN` | `tests/unit/content-gemini/rpa-flow.test.js` | `rpa-flow.test.js` carrega os arquivos reais, força timeout do Observer V2, exige `processPromise` resolvido com `status: result_timeout`, um único `GEMINI_ERROR` e log `GEMINI_TIMEOUT`. | ✅ PROVADO DIRETAMENTE |
| `REG-SINGLE-CLICK-STALE-BATCH` | `tests/unit/content-manga/floating-button-guard-and-single-click.test.js` | O teste abre a ação por clique direito, remove a imagem antes da confirmação, exige resposta `image_ineligible`, log de aborto e nenhuma mensagem `START_BATCH`. | ✅ PROVADO DIRETAMENTE |
| `REG-WORKER-ANCHOR-4S` | `tests/unit/background/marker-anchor-real.test.js` | `marker-anchor-real.test.js` executa `handleMarkerAndShow`, exige timer pendente de `4_000`, cancela-o e confirma registry vazio. | ✅ PROVADO DIRETAMENTE |
| `REG-REGEX-FOLDER` | `tests/unit/background/regex-escape.test.js` | `regex-escape.test.js` despacha `SHOW_EXISTING_FOLDER`, exige regex compilável e match exato para path com `()`, `.`, `+` e `/`. | ✅ PROVADO DIRETAMENTE |
| `REG-WORKER-WARNING-GATE` | `scripts/validation/verify-jest-worker-warning-selftest.js` | `verify-jest-worker-warning-selftest.js` importa `FORCED_WORKER_EXIT`/`hasForcedWorkerExit` reais e usa `assert.equal` para distinguir warning forçado, PASS normal e FAIL comum. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-FLAKY-RETRY-GATE` | `scripts/validation/playwright-gate-reporter-selftest.js` | O self-test injeta tentativa `failed` ou `timedOut` seguida de retry `passed` e exige `{status:'failed'}` do gate. | ✅ PROVADO DIRETAMENTE |
| `REG-COVERAGE-CRITICAL-THRESHOLD` | `scripts/validation/verify-coverage-selftest.js` | `verify-coverage-selftest.js` executa casos negativos para arquivo crítico ausente e threshold crítico abaixo do mínimo, ambos esperados como falha. | ✅ PROVADO DIRETAMENTE |
| `REG-JOB-RUNNER-GUARDS` | `tests/unit/content-gemini/job-runner.test.js` | `job-runner.test.js` requer o módulo real e exige erros explícitos quando faltam root/runtime/storage, APIs Gemini ou result/deletion controllers. | ✅ PROVADO DIRETAMENTE |
| `REG-JOB-RUNNER-CLICK-FALLBACK` | `tests/unit/content-gemini/job-runner.test.js` | O teste faz o primeiro botão lançar `stale element`, oferece card fallback e exige retorno true, tentativa no quebrado e um clique no fallback. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-FIFO-MULTIBATCH` | `tests/e2e/translation-flow.spec.js` | `translation-flow.spec.js` enfileira A→G com barreira explícita, verifica posições/IDs FIFO, uma tradução por página, drenagem completa e ausência de logs de stale/identity mismatch. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-MODES-NO-GHOST` | `tests/e2e/translation-flow.spec.js` | O E2E executa `minimized_window` e `background_delete` sem mousemove sintético, exige imagem traduzida, fila drenada, `BATCH_DONE` e `DELETE_OK`. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-ATTACHMENT-GATE` | `tests/e2e/translation-flow.spec.js` | Para três modos, o E2E força falha de anexo, exige `GEMINI_ATTACHMENT_NOT_CONFIRMED`, ordem `ATTACHMENT_STARTED→REJECTED→SUBMIT_BLOCKED_ATTACHMENT`, nenhum submit/prompt e zero imagem traduzida. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-RESULT-OWNERSHIP` | `tests/e2e/translation-flow.spec.js` | Para três modos, o E2E injeta clone do input e IMG órfã, exige tradução pelo resultado real, rejeições `user_turn`/`missing_model_owner` e aceitação `new_model_turn`. | ✅ PROVADO DIRETAMENTE |
| `REG-E2E-MANUAL-INERT` | `tests/e2e/translation-flow.spec.js` | Abre Gemini manualmente sem job, verifica DOM intacto, nenhum anexo/prompt/resultado, keepalive zero e presença de `JOB_NOT_FOUND`. | ✅ PROVADO DIRETAMENTE |

### Prova específica do próprio arquivo de matriz

- **✅ PROVADO DIRETAMENTE:** `verify-ci-contract-selftest.js` remove um marcador real no sandbox e exige que o CI Contract falhe por “marcador obrigatório ausente”.
- **🟦 GATE ESTÁTICO ESPECÍFICO:** o CI Contract valida quantidade mínima, ID não vazio/único, existência de arquivo, lista de markers não vazia e presença de cada substring.
- **🟨 EXECUTADO INDIRETAMENTE:** a matriz é parseada em todo `npm run validate`/job `ci-contract`.
- **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO:** valores de `version`, `description`, `error` e `gate` não são validados; o conjunto exato dos 23 IDs também não é fixado.

## 6. Segurança, integridade e trust boundaries

Este arquivo não processa dados de usuário, mas é **política de CI versionada**. O trust boundary relevante é quem consegue alterar o repositório/PR:

- um erro ou alteração maliciosa na matriz pode enfraquecer quais regressões são protegidas;
- `file` é concatenado com `path.join(root, entry.file)` sem regra explícita que obrigue o path a permanecer dentro do repositório. Como o JSON é conteúdo confiável do repo, não é uma entrada remota, mas o gate não se protege contra `../`;
- `source.includes(marker)` aceita marker em comentário, fixture, string morta ou bloco de teste sem assertion. Portanto presença textual não equivale a comportamento;
- não há hash dos arquivos alvo; a matriz depende de conteúdo corrente e da qualidade dos testes;
- o campo `gate` não controla execução. A confiança de que “Jest”, “E2E” ou “Code Coverage” roda vem de package/CI separados.

## 7. Análise crítica

1. **Conjunto crítico não é pinado.** O verificador exige apenas `entries.length >= 20` e IDs únicos. É possível substituir um contrato crítico por outro ID arbitrário com marcador fácil e ainda satisfazer a forma.
2. **Marcador é substring, não assertion.** Um marcador movido para comentário ou texto sem teste pode manter o gate verde.
3. **`error` pode mentir sem falhar.** O campo que explica o motivo da regressão é ignorado.
4. **`gate` pode ficar stale.** Renomear de “E2E” para “Jest” neste JSON não altera execução nem gera erro.
5. **`version` não possui semântica.** Não há switch/migração de schema; `version: 999` continuaria aceito.
6. **Sem schema formal.** Tipos de `error` e `gate` não são validados; campos extras também são aceitos silenciosamente.
7. **Sem restrição de path.** `file` não é normalizado/checado contra escape da raiz.
8. **Sem unicidade de `file+markers`.** Duas entradas podem duplicar a mesma sentinela e inflar a contagem mínima.
9. **Self-test cobre um mecanismo genérico, não todas as mutações.** Ele remove o primeiro marker de uma entrada; não prova falha para ID duplicado, array <20, file ausente, marker vazio ou path fora da raiz.
10. **Descrição ainda fala no PR #47.** Isso é contexto histórico válido, mas não descreve que a matriz agora é contrato permanente do repositório.
11. **Risco de falso senso de cobertura.** Como a matriz protege nomes/strings de testes, um teste pode continuar existindo e deixar de provar o comportamento por mudança de assertions sem que este gate detecte.

## 8. Casos-limite

- JSON inválido/ausente → erro capturado e `regressionMatrix=null`; o restante do CI Contract continua reunindo problemas e falha no final.
- `regressions` ausente/não-array → tratado como `[]` e falha por ter menos de 20 contratos.
- entrada nula → “entrada sem id”.
- ID vazio/não-string → falha e `continue`.
- ID duplicado → falha, mas a entrada continua sendo validada.
- `file` vazio/não-string → falha e `continue`.
- arquivo inexistente → falha e `continue`.
- `markers` ausente/não-array/vazio → falha e `continue`.
- marker vazio/não-string/ausente no source → falha.
- marker duplicado → aceito; não há deduplicação.
- mais de 20 entradas arbitrárias → aceito se forma/markers passarem.
- `gate` ausente ou incorreto → aceito.
- `error` ausente ou incorreto → aceito.
- path com `../` → não bloqueado explicitamente pelo verificador.

## 9. Invariantes

1. Este arquivo deve continuar sendo JSON válido e permanecer em `scripts/ci/data/regression-matrix.json`.
2. `regressions` deve ser array e preservar todos os contratos críticos, não apenas atingir o mínimo numérico de 20.
3. Cada contrato deve ter ID estável, único e semanticamente ligado a uma regressão real.
4. Cada `file` deve apontar para arquivo versionado dentro do repositório e para a evidência correta.
5. Cada `marker` deve estar dentro de um teste/gate significativo; presença em comentário não deve ser considerada suficiente em revisão humana.
6. Marcadores devem ser específicos o bastante para não casar conteúdo irrelevante.
7. Alterar/remover uma assertion protegida exige atualizar conscientemente a matriz e reavaliar a regressão — não simplesmente trocar o marker.
8. O rótulo `gate` deve continuar coerente com a execução real em Jest/Playwright/CI, mesmo não sendo validado automaticamente.
9. Os cinco contratos E2E devem continuar exercitando o fluxo da extensão, não virar simulações locais.
10. Os contratos de mocks devem continuar sendo reconhecidos como testes da infraestrutura de teste, não do Chrome real.
11. A matriz não deve ser usada como substituta da execução das suítes; ela apenas protege sentinelas.
12. Qualquer evolução de `version` deve ganhar validação explícita antes que o campo seja tratado como esquema efetivo.
13. O SHA desta Bíblia só é válido enquanto a fonte permanecer `f9b9e17e5870c0c6dff9394ef944a803414cc4d2`.

## 10. Lacunas de teste

1. **⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — lista exata de IDs.** Teste necessário: mutar/remover cada ID obrigatório e exigir falha por ID faltante. Regressão possível: contrato crítico substituído por entrada irrelevante.
2. **⚠️ Campo `gate`.** Teste necessário: validar enum e conferir que o gate rotulado existe/é executado. Regressão: documentação diz E2E, mas o teste deixa de rodar.
3. **⚠️ Campo `error`.** Teste/schema deve exigir string não vazia; revisão humana deve garantir fidelidade semântica.
4. **⚠️ `version`.** Teste necessário: rejeitar versão desconhecida ou implementar migração.
5. **⚠️ Escape da raiz por `file`.** Teste necessário: entrada `../outside` deve ser rejeitada antes de `fs.existsSync`.
6. **⚠️ Marker em comentário.** Teste necessário: mover marker para comentário e remover assertion; um verificador semântico/AST deveria falhar.
7. **⚠️ Duplicação de sentinelas.** Teste necessário: duas entradas com mesmo `file+markers` não devem contar como contratos independentes.
8. **⚠️ Self-test incompleto das validações.** Casos negativos faltantes: <20 entries, ID vazio/duplicado, file ausente, markers vazio, marker non-string.
9. **⚠️ Sem pin de assertion.** O teste alvo pode manter o nome mas trocar expectativas; somente auditoria humana ou AST dedicado detecta.
10. **⚠️ Descrição histórica.** Não há gate que impeça `description` de ficar incompatível com o papel atual.

## 11. Fonte integral

```json
{
  "version": 1,
  "description": "Regressões críticas do PR #47 que não podem desaparecer sem quebrar o CI Contract.",
  "regressions": [
    {
      "id": "REG-EXTRACT-ACK-PERSISTED",
      "error": "ACK persistido deixava retry tardio da aba auxiliar.",
      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",
      "markers": [
        "ACK persistido encerra a entrega sem retry tardio"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-EXTRACT-ACK-RETRY",
      "error": "ACK negativo podia acumular retry ou continuar depois da confirmação.",
      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",
      "markers": [
        "ACK não confirmado repete a entrega e para após persistência"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-EXTRACT-PAGEHIDE-RETRY",
      "error": "pagehide podia deixar retry de entrega vivo.",
      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",
      "markers": [
        "descarte cancela retry agendado por ACK negativo"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-EXTRACT-PAGEHIDE-MAPPING",
      "error": "pagehide podia deixar nova consulta de mapeamento viva.",
      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",
      "markers": [
        "descarte cancela a nova consulta de mapeamento da aba marcada"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-EXTRACT-SAFETY-TIMEOUT",
      "error": "prazo de segurança podia deixar polling e listeners load/error presos.",
      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",
      "markers": [
        "prazo de segurança remove polling e listeners da imagem incompleta"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-RUNTIME-MESSAGE-TIMER",
      "error": "timeout de canal sem resposta do ChromeRuntimeMock atravessava teardown.",
      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",
      "markers": [
        "descarta timeout de canal sem resposta no teardown",
        "_pendingMessageTimers.size"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-STORAGE-PENDING-CALLBACK",
      "error": "callbacks pendentes do storage podiam atingir o caso seguinte.",
      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",
      "markers": [
        "descarta callbacks pendentes do storage antes que atravessem o teardown",
        "_pendingTimers.size"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-TABS-PENDING-UPDATE",
      "error": "onUpdated tardio de tabs.create podia reativar listeners após teardown.",
      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",
      "markers": [
        "descarta onUpdated atrasado de tabs.create antes que reative listeners do background"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-RUNTIME-INSTALLED-PENDING",
      "error": "onInstalled podia manter callback/timer fora do ciclo do teste.",
      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",
      "markers": [
        "onInstalled usa o registry do runtime e pode ser cancelado no teardown"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-RPA-PROMISE-TEARDOWN",
      "error": "processGeminiJob podia continuar depois do teardown e contaminar a suíte seguinte.",
      "file": "tests/unit/content-gemini/rpa-flow.test.js",
      "markers": [
        "CG-36: encerra com GEMINI_ERROR quando o Observer V2 estoura o timeout de geração",
        "expect(await processPromise)"
      ],
      "gate": "Jest + worker warning gate"
    },
    {
      "id": "REG-SINGLE-CLICK-STALE-BATCH",
      "error": "imagem removida entre clique e confirmação podia iniciar START_BATCH indevido.",
      "file": "tests/unit/content-manga/floating-button-guard-and-single-click.test.js",
      "markers": [
        "imagem removida entre clique e confirmação aborta sem iniciar tradução",
        "action === 'START_BATCH'"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-WORKER-ANCHOR-4S",
      "error": "timer real de 4 s do _anchor.png sobrevivia ao teardown e mantinha worker Jest vivo.",
      "file": "tests/unit/background/marker-anchor-real.test.js",
      "markers": [
        "REG-WORKER-4S: teardown possui e cancela o timer de 4s do arquivo-âncora",
        "getPendingDelays",
        "4_000"
      ],
      "gate": "Jest + worker warning gate"
    },
    {
      "id": "REG-REGEX-FOLDER",
      "error": "metacaracteres no path de SHOW_EXISTING_FOLDER podiam produzir regex incorreta/SyntaxError.",
      "file": "tests/unit/background/regex-escape.test.js",
      "markers": [
        "path complexo do mundo real não lança SyntaxError e faz match exato"
      ],
      "gate": "Jest"
    },
    {
      "id": "REG-WORKER-WARNING-GATE",
      "error": "Jest podia retornar zero mesmo após force-exit de worker.",
      "file": "scripts/validation/verify-jest-worker-warning-selftest.js",
      "markers": [
        "FORCED_WORKER_EXIT",
        "hasForcedWorkerExit",
        "warning detectado sem mascarar falhas comuns"
      ],
      "gate": "CI Contract"
    },
    {
      "id": "REG-E2E-FLAKY-RETRY-GATE",
      "error": "failed/timedOut -> passed em retry podia deixar E2E verde.",
      "file": "scripts/validation/playwright-gate-reporter-selftest.js",
      "markers": [
        "status: 'failed', retry: 0",
        "status: 'passed', retry: 1",
        "status: 'timedOut', retry: 0"
      ],
      "gate": "CI Contract"
    },
    {
      "id": "REG-COVERAGE-CRITICAL-THRESHOLD",
      "error": "arquivo crítico ou threshold de coverage podia ser mascarado.",
      "file": "scripts/validation/verify-coverage-selftest.js",
      "markers": [
        "arquivo crítico ausente",
        "threshold crítico abaixo do mínimo"
      ],
      "gate": "CI Contract + Code Coverage"
    },
    {
      "id": "REG-JOB-RUNNER-GUARDS",
      "error": "dependências obrigatórias ausentes do JobRunner não tinham regressão explícita.",
      "file": "tests/unit/content-gemini/job-runner.test.js",
      "markers": [
        "RUN-00: rejeita dependências obrigatórias ausentes com erro explícito"
      ],
      "gate": "Jest + Code Coverage"
    },
    {
      "id": "REG-JOB-RUNNER-CLICK-FALLBACK",
      "error": "clique quebrado em card de imagem podia impedir fallback para o próximo candidato.",
      "file": "tests/unit/content-gemini/job-runner.test.js",
      "markers": [
        "RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato"
      ],
      "gate": "Jest + Code Coverage"
    },
    {
      "id": "REG-E2E-FIFO-MULTIBATCH",
      "error": "lotes A→G podiam misturar estado/resultado stale ou quebrar FIFO.",
      "file": "tests/e2e/translation-flow.spec.js",
      "markers": [
        "E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale"
      ],
      "gate": "E2E"
    },
    {
      "id": "REG-E2E-MODES-NO-GHOST",
      "error": "minimized_window/background_delete podiam depender de ghost mousemove/foco físico.",
      "file": "tests/e2e/translation-flow.spec.js",
      "markers": [
        "test(`Executa o lote em ${scenario.label} sem depender de ghost mousemove`",
        "mode: 'minimized_window'",
        "mode: 'background_delete'"
      ],
      "gate": "E2E"
    },
    {
      "id": "REG-E2E-ATTACHMENT-GATE",
      "error": "prompt podia ser enviado sem confirmação real do anexo.",
      "file": "tests/e2e/translation-flow.spec.js",
      "markers": [
        "REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma",
        "GEMINI_ATTACHMENT_NOT_CONFIRMED",
        "SUBMIT_BLOCKED_ATTACHMENT"
      ],
      "gate": "E2E"
    },
    {
      "id": "REG-E2E-RESULT-OWNERSHIP",
      "error": "clone do input ou IMG órfã podia ser confundido com resultado do modelo.",
      "file": "tests/e2e/translation-flow.spec.js",
      "markers": [
        "REG result ownership: ${scenario.label} ignora clone do input e IMG órfã",
        "missing_model_owner",
        "new_model_turn"
      ],
      "gate": "E2E"
    },
    {
      "id": "REG-E2E-MANUAL-INERT",
      "error": "aba Gemini aberta manualmente podia iniciar automação/keepalive sem job.",
      "file": "tests/e2e/translation-flow.spec.js",
      "markers": [
        "E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto",
        "JOB_NOT_FOUND"
      ],
      "gate": "E2E"
    }
  ]
}
```

## 12. Cobertura linha a linha

### Linha 1 — abertura do objeto raiz

**Fonte:** `{`

**O que faz:** Abre o único objeto JSON que contém metadados da matriz e a coleção de regressões.

**Como faz:** `JSON.parse` em `verify-ci-contract.js` precisa desta raiz sintaticamente válida antes de acessar `regressions`.

**Por que foi implementado dessa forma / risco de alternativa:** Um objeto raiz nomeado por propriedades permite evoluir o formato sem transformar o arquivo em array nu; remover/chavear incorretamente a abertura invalida todo o parse.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 2 — versão do formato

**Fonte:** `  "version": 1,`

**O que faz:** Declara `version: 1` como versão humana do esquema da matriz.

**Como faz:** O valor é armazenado no JSON, mas o consumidor atual não lê `regressionMatrix.version`.

**Por que foi implementado dessa forma / risco de alternativa:** É útil para evolução futura, porém hoje uma versão alterada continua passando; confiar nela como proteção de compatibilidade seria incorreto.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — nenhum gate valida `version` ou reage a versões desconhecidas.

### Linha 3 — descrição histórica

**Fonte:** `  "description": "Regressões críticas do PR #47 que não podem desaparecer sem quebrar o CI Contract.",`

**O que faz:** Registra que a matriz nasceu para preservar regressões críticas associadas ao PR #47.

**Como faz:** É metadado textual; não participa de decisões em `verify-ci-contract.js`.

**Por que foi implementado dessa forma / risco de alternativa:** Mantém contexto humano, mas pode ficar stale se o conjunto evoluir; mover essa semântica para validação automática exigiria um contrato separado.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — `description` não é validada.

### Linha 4 — abertura de `regressions`

**Fonte:** `  "regressions": [`

**O que faz:** Inicia o array que contém os 23 contratos de regressão.

**Como faz:** O consumidor usa `Array.isArray(regressionMatrix.regressions)`; se não for array, substitui por `[]` e falha porque exige pelo menos 20 entradas.

**Por que foi implementado dessa forma / risco de alternativa:** Array preserva múltiplos contratos e permite iteração uniforme; objeto por ID exigiria outra estratégia para ordem/duplicidade.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO — o CI Contract exige array efetivo com pelo menos 20 entradas.

### Linha 5 — abertura do contrato REG-EXTRACT-ACK-PERSISTED

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-EXTRACT-ACK-PERSISTED`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-EXTRACT-ACK-PERSISTED em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 6 — identificador REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      "id": "REG-EXTRACT-ACK-PERSISTED",`

**O que faz:** Define o identificador estável `REG-EXTRACT-ACK-PERSISTED` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-EXTRACT-ACK-PERSISTED; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 7 — risco histórico de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      "error": "ACK persistido deixava retry tardio da aba auxiliar.",`

**O que faz:** Descreve o defeito que `REG-EXTRACT-ACK-PERSISTED` existe para impedir: ACK persistido deixava retry tardio da aba auxiliar.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 8 — arquivo-sentinela de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",`

**O que faz:** Aponta `REG-EXTRACT-ACK-PERSISTED` para `tests/unit/content-manga/extraction-and-handlers-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 9 — abertura dos marcadores de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-EXTRACT-ACK-PERSISTED`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 10 — marcador obrigatório de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `        "ACK persistido encerra a entrega sem retry tardio"`

**O que faz:** Exige que o arquivo alvo contenha a substring `ACK persistido encerra a entrega sem retry tardio`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-EXTRACT-ACK-PERSISTED, esta sentinela ancora a prova descrita como: `extraction-and-handlers-real.test.js` carrega `extension/content/content_manga.js`; após a primeira entrega espera 850 ms, maior que o retry de 700 ms, e exige exatamente uma `IMAGE_READY_FROM_NEW_TAB`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 11 — fechamento dos marcadores de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-EXTRACT-ACK-PERSISTED`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 12 — rótulo de gate de REG-EXTRACT-ACK-PERSISTED

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-EXTRACT-ACK-PERSISTED`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 13 — fechamento do contrato REG-EXTRACT-ACK-PERSISTED

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-EXTRACT-ACK-PERSISTED` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 14 — abertura do contrato REG-EXTRACT-ACK-RETRY

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-EXTRACT-ACK-RETRY`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-EXTRACT-ACK-RETRY em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 15 — identificador REG-EXTRACT-ACK-RETRY

**Fonte:** `      "id": "REG-EXTRACT-ACK-RETRY",`

**O que faz:** Define o identificador estável `REG-EXTRACT-ACK-RETRY` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-EXTRACT-ACK-RETRY; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 16 — risco histórico de REG-EXTRACT-ACK-RETRY

**Fonte:** `      "error": "ACK negativo podia acumular retry ou continuar depois da confirmação.",`

**O que faz:** Descreve o defeito que `REG-EXTRACT-ACK-RETRY` existe para impedir: ACK negativo podia acumular retry ou continuar depois da confirmação.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 17 — arquivo-sentinela de REG-EXTRACT-ACK-RETRY

**Fonte:** `      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",`

**O que faz:** Aponta `REG-EXTRACT-ACK-RETRY` para `tests/unit/content-manga/extraction-and-handlers-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 18 — abertura dos marcadores de REG-EXTRACT-ACK-RETRY

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-EXTRACT-ACK-RETRY`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 19 — marcador obrigatório de REG-EXTRACT-ACK-RETRY

**Fonte:** `        "ACK não confirmado repete a entrega e para após persistência"`

**O que faz:** Exige que o arquivo alvo contenha a substring `ACK não confirmado repete a entrega e para após persistência`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-EXTRACT-ACK-RETRY, esta sentinela ancora a prova descrita como: O teste força primeiro ACK negativo e segundo persistido; espera duas entregas, dois acknowledgements e igualdade entre payload original e retry. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 20 — fechamento dos marcadores de REG-EXTRACT-ACK-RETRY

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-EXTRACT-ACK-RETRY`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 21 — rótulo de gate de REG-EXTRACT-ACK-RETRY

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-EXTRACT-ACK-RETRY`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 22 — fechamento do contrato REG-EXTRACT-ACK-RETRY

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-EXTRACT-ACK-RETRY` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 23 — abertura do contrato REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-EXTRACT-PAGEHIDE-RETRY`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-EXTRACT-PAGEHIDE-RETRY em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 24 — identificador REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      "id": "REG-EXTRACT-PAGEHIDE-RETRY",`

**O que faz:** Define o identificador estável `REG-EXTRACT-PAGEHIDE-RETRY` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-EXTRACT-PAGEHIDE-RETRY; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 25 — risco histórico de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      "error": "pagehide podia deixar retry de entrega vivo.",`

**O que faz:** Descreve o defeito que `REG-EXTRACT-PAGEHIDE-RETRY` existe para impedir: pagehide podia deixar retry de entrega vivo.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 26 — arquivo-sentinela de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",`

**O que faz:** Aponta `REG-EXTRACT-PAGEHIDE-RETRY` para `tests/unit/content-manga/extraction-and-handlers-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 27 — abertura dos marcadores de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-EXTRACT-PAGEHIDE-RETRY`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 28 — marcador obrigatório de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `        "descarte cancela retry agendado por ACK negativo"`

**O que faz:** Exige que o arquivo alvo contenha a substring `descarte cancela retry agendado por ACK negativo`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-EXTRACT-PAGEHIDE-RETRY, esta sentinela ancora a prova descrita como: Após registrar `AUXILIARY_EXTRACT_RETRY`, o teste dispara `pagehide`, aguarda além do retry e exige que o total de entregas permaneça em 1. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 29 — fechamento dos marcadores de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-EXTRACT-PAGEHIDE-RETRY`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 30 — rótulo de gate de REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-EXTRACT-PAGEHIDE-RETRY`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 31 — fechamento do contrato REG-EXTRACT-PAGEHIDE-RETRY

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-EXTRACT-PAGEHIDE-RETRY` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 32 — abertura do contrato REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-EXTRACT-PAGEHIDE-MAPPING`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-EXTRACT-PAGEHIDE-MAPPING em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 33 — identificador REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      "id": "REG-EXTRACT-PAGEHIDE-MAPPING",`

**O que faz:** Define o identificador estável `REG-EXTRACT-PAGEHIDE-MAPPING` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-EXTRACT-PAGEHIDE-MAPPING; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 34 — risco histórico de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      "error": "pagehide podia deixar nova consulta de mapeamento viva.",`

**O que faz:** Descreve o defeito que `REG-EXTRACT-PAGEHIDE-MAPPING` existe para impedir: pagehide podia deixar nova consulta de mapeamento viva.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 35 — arquivo-sentinela de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",`

**O que faz:** Aponta `REG-EXTRACT-PAGEHIDE-MAPPING` para `tests/unit/content-manga/extraction-and-handlers-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 36 — abertura dos marcadores de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-EXTRACT-PAGEHIDE-MAPPING`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 37 — marcador obrigatório de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `        "descarte cancela a nova consulta de mapeamento da aba marcada"`

**O que faz:** Exige que o arquivo alvo contenha a substring `descarte cancela a nova consulta de mapeamento da aba marcada`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-EXTRACT-PAGEHIDE-MAPPING, esta sentinela ancora a prova descrita como: O teste conta `CHECK_IF_EXTRACTION_TAB`, dispara `pagehide`, espera 150 ms e exige que nenhuma nova consulta de mapeamento apareça. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 38 — fechamento dos marcadores de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-EXTRACT-PAGEHIDE-MAPPING`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 39 — rótulo de gate de REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-EXTRACT-PAGEHIDE-MAPPING`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 40 — fechamento do contrato REG-EXTRACT-PAGEHIDE-MAPPING

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-EXTRACT-PAGEHIDE-MAPPING` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 41 — abertura do contrato REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-EXTRACT-SAFETY-TIMEOUT`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-EXTRACT-SAFETY-TIMEOUT em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 42 — identificador REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      "id": "REG-EXTRACT-SAFETY-TIMEOUT",`

**O que faz:** Define o identificador estável `REG-EXTRACT-SAFETY-TIMEOUT` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-EXTRACT-SAFETY-TIMEOUT; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 43 — risco histórico de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      "error": "prazo de segurança podia deixar polling e listeners load/error presos.",`

**O que faz:** Descreve o defeito que `REG-EXTRACT-SAFETY-TIMEOUT` existe para impedir: prazo de segurança podia deixar polling e listeners load/error presos.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 44 — arquivo-sentinela de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      "file": "tests/unit/content-manga/extraction-and-handlers-real.test.js",`

**O que faz:** Aponta `REG-EXTRACT-SAFETY-TIMEOUT` para `tests/unit/content-manga/extraction-and-handlers-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 45 — abertura dos marcadores de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-EXTRACT-SAFETY-TIMEOUT`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 46 — marcador obrigatório de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `        "prazo de segurança remove polling e listeners da imagem incompleta"`

**O que faz:** Exige que o arquivo alvo contenha a substring `prazo de segurança remove polling e listeners da imagem incompleta`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-EXTRACT-SAFETY-TIMEOUT, esta sentinela ancora a prova descrita como: O teste captura o timeout de segurança de 20 s, executa-o manualmente e exige `clearInterval`, remoção única dos listeners `load` e `error` e zero entrega posterior. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 47 — fechamento dos marcadores de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-EXTRACT-SAFETY-TIMEOUT`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 48 — rótulo de gate de REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-EXTRACT-SAFETY-TIMEOUT`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 49 — fechamento do contrato REG-EXTRACT-SAFETY-TIMEOUT

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-EXTRACT-SAFETY-TIMEOUT` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 50 — abertura do contrato REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-RUNTIME-MESSAGE-TIMER`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-RUNTIME-MESSAGE-TIMER em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 51 — identificador REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      "id": "REG-RUNTIME-MESSAGE-TIMER",`

**O que faz:** Define o identificador estável `REG-RUNTIME-MESSAGE-TIMER` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-RUNTIME-MESSAGE-TIMER; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 52 — risco histórico de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      "error": "timeout de canal sem resposta do ChromeRuntimeMock atravessava teardown.",`

**O que faz:** Descreve o defeito que `REG-RUNTIME-MESSAGE-TIMER` existe para impedir: timeout de canal sem resposta do ChromeRuntimeMock atravessava teardown.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 53 — arquivo-sentinela de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",`

**O que faz:** Aponta `REG-RUNTIME-MESSAGE-TIMER` para `tests/unit/background/chrome-runtime-mock-lifecycle.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre o mock real compartilhado.

### Linha 54 — abertura dos marcadores de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-RUNTIME-MESSAGE-TIMER`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 55 — marcador obrigatório de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `        "descarta timeout de canal sem resposta no teardown",`

**O que faz:** Exige que o arquivo alvo contenha a substring `descarta timeout de canal sem resposta no teardown`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-RUNTIME-MESSAGE-TIMER, esta sentinela ancora a prova descrita como: `chrome-runtime-mock-lifecycle.test.js` cria canal pendente, exige `_pendingMessageTimers.size===1`, chama `clearMessageTimers`, exige zero e confirma que callback não roda após avanço de timer. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 56 — marcador obrigatório de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `        "_pendingMessageTimers.size"`

**O que faz:** Exige que o arquivo alvo contenha a substring `_pendingMessageTimers.size`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-RUNTIME-MESSAGE-TIMER, esta sentinela ancora a prova descrita como: `chrome-runtime-mock-lifecycle.test.js` cria canal pendente, exige `_pendingMessageTimers.size===1`, chama `clearMessageTimers`, exige zero e confirma que callback não roda após avanço de timer. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 57 — fechamento dos marcadores de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-RUNTIME-MESSAGE-TIMER`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 58 — rótulo de gate de REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-RUNTIME-MESSAGE-TIMER`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre o mock real compartilhado.

### Linha 59 — fechamento do contrato REG-RUNTIME-MESSAGE-TIMER

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-RUNTIME-MESSAGE-TIMER` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 60 — abertura do contrato REG-STORAGE-PENDING-CALLBACK

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-STORAGE-PENDING-CALLBACK`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-STORAGE-PENDING-CALLBACK em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 61 — identificador REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      "id": "REG-STORAGE-PENDING-CALLBACK",`

**O que faz:** Define o identificador estável `REG-STORAGE-PENDING-CALLBACK` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-STORAGE-PENDING-CALLBACK; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 62 — risco histórico de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      "error": "callbacks pendentes do storage podiam atingir o caso seguinte.",`

**O que faz:** Descreve o defeito que `REG-STORAGE-PENDING-CALLBACK` existe para impedir: callbacks pendentes do storage podiam atingir o caso seguinte.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 63 — arquivo-sentinela de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",`

**O que faz:** Aponta `REG-STORAGE-PENDING-CALLBACK` para `tests/unit/background/chrome-runtime-mock-lifecycle.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre o mock real compartilhado.

### Linha 64 — abertura dos marcadores de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-STORAGE-PENDING-CALLBACK`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 65 — marcador obrigatório de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `        "descarta callbacks pendentes do storage antes que atravessem o teardown",`

**O que faz:** Exige que o arquivo alvo contenha a substring `descarta callbacks pendentes do storage antes que atravessem o teardown`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-STORAGE-PENDING-CALLBACK, esta sentinela ancora a prova descrita como: O teste agenda `storage.get`, observa dois timers pendentes, limpa o registry, exige zero e confirma callback não chamado. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 66 — marcador obrigatório de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `        "_pendingTimers.size"`

**O que faz:** Exige que o arquivo alvo contenha a substring `_pendingTimers.size`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-STORAGE-PENDING-CALLBACK, esta sentinela ancora a prova descrita como: O teste agenda `storage.get`, observa dois timers pendentes, limpa o registry, exige zero e confirma callback não chamado. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 67 — fechamento dos marcadores de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-STORAGE-PENDING-CALLBACK`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 68 — rótulo de gate de REG-STORAGE-PENDING-CALLBACK

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-STORAGE-PENDING-CALLBACK`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre o mock real compartilhado.

### Linha 69 — fechamento do contrato REG-STORAGE-PENDING-CALLBACK

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-STORAGE-PENDING-CALLBACK` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 70 — abertura do contrato REG-TABS-PENDING-UPDATE

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-TABS-PENDING-UPDATE`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-TABS-PENDING-UPDATE em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 71 — identificador REG-TABS-PENDING-UPDATE

**Fonte:** `      "id": "REG-TABS-PENDING-UPDATE",`

**O que faz:** Define o identificador estável `REG-TABS-PENDING-UPDATE` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-TABS-PENDING-UPDATE; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 72 — risco histórico de REG-TABS-PENDING-UPDATE

**Fonte:** `      "error": "onUpdated tardio de tabs.create podia reativar listeners após teardown.",`

**O que faz:** Descreve o defeito que `REG-TABS-PENDING-UPDATE` existe para impedir: onUpdated tardio de tabs.create podia reativar listeners após teardown.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 73 — arquivo-sentinela de REG-TABS-PENDING-UPDATE

**Fonte:** `      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",`

**O que faz:** Aponta `REG-TABS-PENDING-UPDATE` para `tests/unit/background/chrome-runtime-mock-lifecycle.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre o mock real compartilhado.

### Linha 74 — abertura dos marcadores de REG-TABS-PENDING-UPDATE

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-TABS-PENDING-UPDATE`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 75 — marcador obrigatório de REG-TABS-PENDING-UPDATE

**Fonte:** `        "descarta onUpdated atrasado de tabs.create antes que reative listeners do background"`

**O que faz:** Exige que o arquivo alvo contenha a substring `descarta onUpdated atrasado de tabs.create antes que reative listeners do background`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-TABS-PENDING-UPDATE, esta sentinela ancora a prova descrita como: O teste registra listener de `tabs.onUpdated`, cria aba, verifica timer pendente, limpa timers e prova que o listener não dispara após avanço de 11 ms. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 76 — fechamento dos marcadores de REG-TABS-PENDING-UPDATE

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-TABS-PENDING-UPDATE`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 77 — rótulo de gate de REG-TABS-PENDING-UPDATE

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-TABS-PENDING-UPDATE`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre o mock real compartilhado.

### Linha 78 — fechamento do contrato REG-TABS-PENDING-UPDATE

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-TABS-PENDING-UPDATE` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 79 — abertura do contrato REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-RUNTIME-INSTALLED-PENDING`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-RUNTIME-INSTALLED-PENDING em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 80 — identificador REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      "id": "REG-RUNTIME-INSTALLED-PENDING",`

**O que faz:** Define o identificador estável `REG-RUNTIME-INSTALLED-PENDING` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-RUNTIME-INSTALLED-PENDING; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 81 — risco histórico de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      "error": "onInstalled podia manter callback/timer fora do ciclo do teste.",`

**O que faz:** Descreve o defeito que `REG-RUNTIME-INSTALLED-PENDING` existe para impedir: onInstalled podia manter callback/timer fora do ciclo do teste.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 82 — arquivo-sentinela de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      "file": "tests/unit/background/chrome-runtime-mock-lifecycle.test.js",`

**O que faz:** Aponta `REG-RUNTIME-INSTALLED-PENDING` para `tests/unit/background/chrome-runtime-mock-lifecycle.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre o mock real compartilhado.

### Linha 83 — abertura dos marcadores de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-RUNTIME-INSTALLED-PENDING`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 84 — marcador obrigatório de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `        "onInstalled usa o registry do runtime e pode ser cancelado no teardown"`

**O que faz:** Exige que o arquivo alvo contenha a substring `onInstalled usa o registry do runtime e pode ser cancelado no teardown`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-RUNTIME-INSTALLED-PENDING, esta sentinela ancora a prova descrita como: O teste registra `onInstalled`, observa timer no registry do runtime, limpa-o e exige que o callback instalado não seja chamado. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 85 — fechamento dos marcadores de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-RUNTIME-INSTALLED-PENDING`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 86 — rótulo de gate de REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-RUNTIME-INSTALLED-PENDING`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre o mock real compartilhado.

### Linha 87 — fechamento do contrato REG-RUNTIME-INSTALLED-PENDING

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-RUNTIME-INSTALLED-PENDING` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 88 — abertura do contrato REG-RPA-PROMISE-TEARDOWN

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-RPA-PROMISE-TEARDOWN`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-RPA-PROMISE-TEARDOWN em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 89 — identificador REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      "id": "REG-RPA-PROMISE-TEARDOWN",`

**O que faz:** Define o identificador estável `REG-RPA-PROMISE-TEARDOWN` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-RPA-PROMISE-TEARDOWN; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 90 — risco histórico de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      "error": "processGeminiJob podia continuar depois do teardown e contaminar a suíte seguinte.",`

**O que faz:** Descreve o defeito que `REG-RPA-PROMISE-TEARDOWN` existe para impedir: processGeminiJob podia continuar depois do teardown e contaminar a suíte seguinte.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 91 — arquivo-sentinela de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      "file": "tests/unit/content-gemini/rpa-flow.test.js",`

**O que faz:** Aponta `REG-RPA-PROMISE-TEARDOWN` para `tests/unit/content-gemini/rpa-flow.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_gemini.js e módulos Gemini reais.

### Linha 92 — abertura dos marcadores de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-RPA-PROMISE-TEARDOWN`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 93 — marcador obrigatório de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `        "CG-36: encerra com GEMINI_ERROR quando o Observer V2 estoura o timeout de geração",`

**O que faz:** Exige que o arquivo alvo contenha a substring `CG-36: encerra com GEMINI_ERROR quando o Observer V2 estoura o timeout de geração`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-RPA-PROMISE-TEARDOWN, esta sentinela ancora a prova descrita como: `rpa-flow.test.js` carrega os arquivos reais, força timeout do Observer V2, exige `processPromise` resolvido com `status: result_timeout`, um único `GEMINI_ERROR` e log `GEMINI_TIMEOUT`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 94 — marcador obrigatório de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `        "expect(await processPromise)"`

**O que faz:** Exige que o arquivo alvo contenha a substring `expect(await processPromise)`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-RPA-PROMISE-TEARDOWN, esta sentinela ancora a prova descrita como: `rpa-flow.test.js` carrega os arquivos reais, força timeout do Observer V2, exige `processPromise` resolvido com `status: result_timeout`, um único `GEMINI_ERROR` e log `GEMINI_TIMEOUT`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 95 — fechamento dos marcadores de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-RPA-PROMISE-TEARDOWN`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 96 — rótulo de gate de REG-RPA-PROMISE-TEARDOWN

**Fonte:** `      "gate": "Jest + worker warning gate"`

**O que faz:** Declara o rótulo documental `Jest + worker warning gate` para `REG-RPA-PROMISE-TEARDOWN`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_gemini.js e módulos Gemini reais.

### Linha 97 — fechamento do contrato REG-RPA-PROMISE-TEARDOWN

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-RPA-PROMISE-TEARDOWN` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 98 — abertura do contrato REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-SINGLE-CLICK-STALE-BATCH`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-SINGLE-CLICK-STALE-BATCH em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 99 — identificador REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      "id": "REG-SINGLE-CLICK-STALE-BATCH",`

**O que faz:** Define o identificador estável `REG-SINGLE-CLICK-STALE-BATCH` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-SINGLE-CLICK-STALE-BATCH; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 100 — risco histórico de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      "error": "imagem removida entre clique e confirmação podia iniciar START_BATCH indevido.",`

**O que faz:** Descreve o defeito que `REG-SINGLE-CLICK-STALE-BATCH` existe para impedir: imagem removida entre clique e confirmação podia iniciar START_BATCH indevido.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 101 — arquivo-sentinela de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      "file": "tests/unit/content-manga/floating-button-guard-and-single-click.test.js",`

**O que faz:** Aponta `REG-SINGLE-CLICK-STALE-BATCH` para `tests/unit/content-manga/floating-button-guard-and-single-click.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre content_manga.js real.

### Linha 102 — abertura dos marcadores de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-SINGLE-CLICK-STALE-BATCH`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 103 — marcador obrigatório de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `        "imagem removida entre clique e confirmação aborta sem iniciar tradução",`

**O que faz:** Exige que o arquivo alvo contenha a substring `imagem removida entre clique e confirmação aborta sem iniciar tradução`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-SINGLE-CLICK-STALE-BATCH, esta sentinela ancora a prova descrita como: O teste abre a ação por clique direito, remove a imagem antes da confirmação, exige resposta `image_ineligible`, log de aborto e nenhuma mensagem `START_BATCH`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 104 — marcador obrigatório de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `        "action === 'START_BATCH'"`

**O que faz:** Exige que o arquivo alvo contenha a substring `action === 'START_BATCH'`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-SINGLE-CLICK-STALE-BATCH, esta sentinela ancora a prova descrita como: O teste abre a ação por clique direito, remove a imagem antes da confirmação, exige resposta `image_ineligible`, log de aborto e nenhuma mensagem `START_BATCH`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 105 — fechamento dos marcadores de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-SINGLE-CLICK-STALE-BATCH`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 106 — rótulo de gate de REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-SINGLE-CLICK-STALE-BATCH`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre content_manga.js real.

### Linha 107 — fechamento do contrato REG-SINGLE-CLICK-STALE-BATCH

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-SINGLE-CLICK-STALE-BATCH` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 108 — abertura do contrato REG-WORKER-ANCHOR-4S

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-WORKER-ANCHOR-4S`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-WORKER-ANCHOR-4S em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 109 — identificador REG-WORKER-ANCHOR-4S

**Fonte:** `      "id": "REG-WORKER-ANCHOR-4S",`

**O que faz:** Define o identificador estável `REG-WORKER-ANCHOR-4S` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-WORKER-ANCHOR-4S; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 110 — risco histórico de REG-WORKER-ANCHOR-4S

**Fonte:** `      "error": "timer real de 4 s do _anchor.png sobrevivia ao teardown e mantinha worker Jest vivo.",`

**O que faz:** Descreve o defeito que `REG-WORKER-ANCHOR-4S` existe para impedir: timer real de 4 s do _anchor.png sobrevivia ao teardown e mantinha worker Jest vivo.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 111 — arquivo-sentinela de REG-WORKER-ANCHOR-4S

**Fonte:** `      "file": "tests/unit/background/marker-anchor-real.test.js",`

**O que faz:** Aponta `REG-WORKER-ANCHOR-4S` para `tests/unit/background/marker-anchor-real.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre background.js real.

### Linha 112 — abertura dos marcadores de REG-WORKER-ANCHOR-4S

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-WORKER-ANCHOR-4S`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 113 — marcador obrigatório de REG-WORKER-ANCHOR-4S

**Fonte:** `        "REG-WORKER-4S: teardown possui e cancela o timer de 4s do arquivo-âncora",`

**O que faz:** Exige que o arquivo alvo contenha a substring `REG-WORKER-4S: teardown possui e cancela o timer de 4s do arquivo-âncora`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-ANCHOR-4S, esta sentinela ancora a prova descrita como: `marker-anchor-real.test.js` executa `handleMarkerAndShow`, exige timer pendente de `4_000`, cancela-o e confirma registry vazio. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 114 — marcador obrigatório de REG-WORKER-ANCHOR-4S

**Fonte:** `        "getPendingDelays",`

**O que faz:** Exige que o arquivo alvo contenha a substring `getPendingDelays`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-ANCHOR-4S, esta sentinela ancora a prova descrita como: `marker-anchor-real.test.js` executa `handleMarkerAndShow`, exige timer pendente de `4_000`, cancela-o e confirma registry vazio. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 115 — marcador obrigatório de REG-WORKER-ANCHOR-4S

**Fonte:** `        "4_000"`

**O que faz:** Exige que o arquivo alvo contenha a substring `4_000`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-ANCHOR-4S, esta sentinela ancora a prova descrita como: `marker-anchor-real.test.js` executa `handleMarkerAndShow`, exige timer pendente de `4_000`, cancela-o e confirma registry vazio. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 116 — fechamento dos marcadores de REG-WORKER-ANCHOR-4S

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-WORKER-ANCHOR-4S`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 117 — rótulo de gate de REG-WORKER-ANCHOR-4S

**Fonte:** `      "gate": "Jest + worker warning gate"`

**O que faz:** Declara o rótulo documental `Jest + worker warning gate` para `REG-WORKER-ANCHOR-4S`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre background.js real.

### Linha 118 — fechamento do contrato REG-WORKER-ANCHOR-4S

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-WORKER-ANCHOR-4S` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 119 — abertura do contrato REG-REGEX-FOLDER

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-REGEX-FOLDER`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-REGEX-FOLDER em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 120 — identificador REG-REGEX-FOLDER

**Fonte:** `      "id": "REG-REGEX-FOLDER",`

**O que faz:** Define o identificador estável `REG-REGEX-FOLDER` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-REGEX-FOLDER; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 121 — risco histórico de REG-REGEX-FOLDER

**Fonte:** `      "error": "metacaracteres no path de SHOW_EXISTING_FOLDER podiam produzir regex incorreta/SyntaxError.",`

**O que faz:** Descreve o defeito que `REG-REGEX-FOLDER` existe para impedir: metacaracteres no path de SHOW_EXISTING_FOLDER podiam produzir regex incorreta/SyntaxError.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 122 — arquivo-sentinela de REG-REGEX-FOLDER

**Fonte:** `      "file": "tests/unit/background/regex-escape.test.js",`

**O que faz:** Aponta `REG-REGEX-FOLDER` para `tests/unit/background/regex-escape.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre background.js real.

### Linha 123 — abertura dos marcadores de REG-REGEX-FOLDER

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-REGEX-FOLDER`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 124 — marcador obrigatório de REG-REGEX-FOLDER

**Fonte:** `        "path complexo do mundo real não lança SyntaxError e faz match exato"`

**O que faz:** Exige que o arquivo alvo contenha a substring `path complexo do mundo real não lança SyntaxError e faz match exato`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-REGEX-FOLDER, esta sentinela ancora a prova descrita como: `regex-escape.test.js` despacha `SHOW_EXISTING_FOLDER`, exige regex compilável e match exato para path com `()`, `.`, `+` e `/`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 125 — fechamento dos marcadores de REG-REGEX-FOLDER

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-REGEX-FOLDER`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 126 — rótulo de gate de REG-REGEX-FOLDER

**Fonte:** `      "gate": "Jest"`

**O que faz:** Declara o rótulo documental `Jest` para `REG-REGEX-FOLDER`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre background.js real.

### Linha 127 — fechamento do contrato REG-REGEX-FOLDER

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-REGEX-FOLDER` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 128 — abertura do contrato REG-WORKER-WARNING-GATE

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-WORKER-WARNING-GATE`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-WORKER-WARNING-GATE em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 129 — identificador REG-WORKER-WARNING-GATE

**Fonte:** `      "id": "REG-WORKER-WARNING-GATE",`

**O que faz:** Define o identificador estável `REG-WORKER-WARNING-GATE` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-WORKER-WARNING-GATE; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 130 — risco histórico de REG-WORKER-WARNING-GATE

**Fonte:** `      "error": "Jest podia retornar zero mesmo após force-exit de worker.",`

**O que faz:** Descreve o defeito que `REG-WORKER-WARNING-GATE` existe para impedir: Jest podia retornar zero mesmo após force-exit de worker.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 131 — arquivo-sentinela de REG-WORKER-WARNING-GATE

**Fonte:** `      "file": "scripts/validation/verify-jest-worker-warning-selftest.js",`

**O que faz:** Aponta `REG-WORKER-WARNING-GATE` para `scripts/validation/verify-jest-worker-warning-selftest.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — self-test Node do gate.

### Linha 132 — abertura dos marcadores de REG-WORKER-WARNING-GATE

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-WORKER-WARNING-GATE`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 133 — marcador obrigatório de REG-WORKER-WARNING-GATE

**Fonte:** `        "FORCED_WORKER_EXIT",`

**O que faz:** Exige que o arquivo alvo contenha a substring `FORCED_WORKER_EXIT`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-WARNING-GATE, esta sentinela ancora a prova descrita como: `verify-jest-worker-warning-selftest.js` importa `FORCED_WORKER_EXIT`/`hasForcedWorkerExit` reais e usa `assert.equal` para distinguir warning forçado, PASS normal e FAIL comum. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 134 — marcador obrigatório de REG-WORKER-WARNING-GATE

**Fonte:** `        "hasForcedWorkerExit",`

**O que faz:** Exige que o arquivo alvo contenha a substring `hasForcedWorkerExit`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-WARNING-GATE, esta sentinela ancora a prova descrita como: `verify-jest-worker-warning-selftest.js` importa `FORCED_WORKER_EXIT`/`hasForcedWorkerExit` reais e usa `assert.equal` para distinguir warning forçado, PASS normal e FAIL comum. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 135 — marcador obrigatório de REG-WORKER-WARNING-GATE

**Fonte:** `        "warning detectado sem mascarar falhas comuns"`

**O que faz:** Exige que o arquivo alvo contenha a substring `warning detectado sem mascarar falhas comuns`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-WORKER-WARNING-GATE, esta sentinela ancora a prova descrita como: `verify-jest-worker-warning-selftest.js` importa `FORCED_WORKER_EXIT`/`hasForcedWorkerExit` reais e usa `assert.equal` para distinguir warning forçado, PASS normal e FAIL comum. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 136 — fechamento dos marcadores de REG-WORKER-WARNING-GATE

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-WORKER-WARNING-GATE`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 137 — rótulo de gate de REG-WORKER-WARNING-GATE

**Fonte:** `      "gate": "CI Contract"`

**O que faz:** Declara o rótulo documental `CI Contract` para `REG-WORKER-WARNING-GATE`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: self-test Node do gate.

### Linha 138 — fechamento do contrato REG-WORKER-WARNING-GATE

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-WORKER-WARNING-GATE` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 139 — abertura do contrato REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-FLAKY-RETRY-GATE`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-FLAKY-RETRY-GATE em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 140 — identificador REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      "id": "REG-E2E-FLAKY-RETRY-GATE",`

**O que faz:** Define o identificador estável `REG-E2E-FLAKY-RETRY-GATE` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-FLAKY-RETRY-GATE; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 141 — risco histórico de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      "error": "failed/timedOut -> passed em retry podia deixar E2E verde.",`

**O que faz:** Descreve o defeito que `REG-E2E-FLAKY-RETRY-GATE` existe para impedir: failed/timedOut -> passed em retry podia deixar E2E verde.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 142 — arquivo-sentinela de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      "file": "scripts/validation/playwright-gate-reporter-selftest.js",`

**O que faz:** Aponta `REG-E2E-FLAKY-RETRY-GATE` para `scripts/validation/playwright-gate-reporter-selftest.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — self-test Node do reporter Playwright.

### Linha 143 — abertura dos marcadores de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-FLAKY-RETRY-GATE`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 144 — marcador obrigatório de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `        "status: 'failed', retry: 0",`

**O que faz:** Exige que o arquivo alvo contenha a substring `status: 'failed', retry: 0`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-FLAKY-RETRY-GATE, esta sentinela ancora a prova descrita como: O self-test injeta tentativa `failed` ou `timedOut` seguida de retry `passed` e exige `{status:'failed'}` do gate. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 145 — marcador obrigatório de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `        "status: 'passed', retry: 1",`

**O que faz:** Exige que o arquivo alvo contenha a substring `status: 'passed', retry: 1`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-FLAKY-RETRY-GATE, esta sentinela ancora a prova descrita como: O self-test injeta tentativa `failed` ou `timedOut` seguida de retry `passed` e exige `{status:'failed'}` do gate. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 146 — marcador obrigatório de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `        "status: 'timedOut', retry: 0"`

**O que faz:** Exige que o arquivo alvo contenha a substring `status: 'timedOut', retry: 0`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-FLAKY-RETRY-GATE, esta sentinela ancora a prova descrita como: O self-test injeta tentativa `failed` ou `timedOut` seguida de retry `passed` e exige `{status:'failed'}` do gate. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 147 — fechamento dos marcadores de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-FLAKY-RETRY-GATE`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 148 — rótulo de gate de REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `      "gate": "CI Contract"`

**O que faz:** Declara o rótulo documental `CI Contract` para `REG-E2E-FLAKY-RETRY-GATE`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: self-test Node do reporter Playwright.

### Linha 149 — fechamento do contrato REG-E2E-FLAKY-RETRY-GATE

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-E2E-FLAKY-RETRY-GATE` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 150 — abertura do contrato REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-COVERAGE-CRITICAL-THRESHOLD`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-COVERAGE-CRITICAL-THRESHOLD em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 151 — identificador REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      "id": "REG-COVERAGE-CRITICAL-THRESHOLD",`

**O que faz:** Define o identificador estável `REG-COVERAGE-CRITICAL-THRESHOLD` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-COVERAGE-CRITICAL-THRESHOLD; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 152 — risco histórico de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      "error": "arquivo crítico ou threshold de coverage podia ser mascarado.",`

**O que faz:** Descreve o defeito que `REG-COVERAGE-CRITICAL-THRESHOLD` existe para impedir: arquivo crítico ou threshold de coverage podia ser mascarado.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 153 — arquivo-sentinela de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      "file": "scripts/validation/verify-coverage-selftest.js",`

**O que faz:** Aponta `REG-COVERAGE-CRITICAL-THRESHOLD` para `scripts/validation/verify-coverage-selftest.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — self-test Node do verificador de coverage.

### Linha 154 — abertura dos marcadores de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-COVERAGE-CRITICAL-THRESHOLD`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 155 — marcador obrigatório de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `        "arquivo crítico ausente",`

**O que faz:** Exige que o arquivo alvo contenha a substring `arquivo crítico ausente`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-COVERAGE-CRITICAL-THRESHOLD, esta sentinela ancora a prova descrita como: `verify-coverage-selftest.js` executa casos negativos para arquivo crítico ausente e threshold crítico abaixo do mínimo, ambos esperados como falha. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 156 — marcador obrigatório de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `        "threshold crítico abaixo do mínimo"`

**O que faz:** Exige que o arquivo alvo contenha a substring `threshold crítico abaixo do mínimo`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-COVERAGE-CRITICAL-THRESHOLD, esta sentinela ancora a prova descrita como: `verify-coverage-selftest.js` executa casos negativos para arquivo crítico ausente e threshold crítico abaixo do mínimo, ambos esperados como falha. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 157 — fechamento dos marcadores de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-COVERAGE-CRITICAL-THRESHOLD`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 158 — rótulo de gate de REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `      "gate": "CI Contract + Code Coverage"`

**O que faz:** Declara o rótulo documental `CI Contract + Code Coverage` para `REG-COVERAGE-CRITICAL-THRESHOLD`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: self-test Node do verificador de coverage.

### Linha 159 — fechamento do contrato REG-COVERAGE-CRITICAL-THRESHOLD

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-COVERAGE-CRITICAL-THRESHOLD` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 160 — abertura do contrato REG-JOB-RUNNER-GUARDS

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-JOB-RUNNER-GUARDS`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-JOB-RUNNER-GUARDS em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 161 — identificador REG-JOB-RUNNER-GUARDS

**Fonte:** `      "id": "REG-JOB-RUNNER-GUARDS",`

**O que faz:** Define o identificador estável `REG-JOB-RUNNER-GUARDS` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-JOB-RUNNER-GUARDS; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 162 — risco histórico de REG-JOB-RUNNER-GUARDS

**Fonte:** `      "error": "dependências obrigatórias ausentes do JobRunner não tinham regressão explícita.",`

**O que faz:** Descreve o defeito que `REG-JOB-RUNNER-GUARDS` existe para impedir: dependências obrigatórias ausentes do JobRunner não tinham regressão explícita.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 163 — arquivo-sentinela de REG-JOB-RUNNER-GUARDS

**Fonte:** `      "file": "tests/unit/content-gemini/job-runner.test.js",`

**O que faz:** Aponta `REG-JOB-RUNNER-GUARDS` para `tests/unit/content-gemini/job-runner.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre job-runner.js real.

### Linha 164 — abertura dos marcadores de REG-JOB-RUNNER-GUARDS

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-JOB-RUNNER-GUARDS`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 165 — marcador obrigatório de REG-JOB-RUNNER-GUARDS

**Fonte:** `        "RUN-00: rejeita dependências obrigatórias ausentes com erro explícito"`

**O que faz:** Exige que o arquivo alvo contenha a substring `RUN-00: rejeita dependências obrigatórias ausentes com erro explícito`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-JOB-RUNNER-GUARDS, esta sentinela ancora a prova descrita como: `job-runner.test.js` requer o módulo real e exige erros explícitos quando faltam root/runtime/storage, APIs Gemini ou result/deletion controllers. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 166 — fechamento dos marcadores de REG-JOB-RUNNER-GUARDS

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-JOB-RUNNER-GUARDS`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 167 — rótulo de gate de REG-JOB-RUNNER-GUARDS

**Fonte:** `      "gate": "Jest + Code Coverage"`

**O que faz:** Declara o rótulo documental `Jest + Code Coverage` para `REG-JOB-RUNNER-GUARDS`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre job-runner.js real.

### Linha 168 — fechamento do contrato REG-JOB-RUNNER-GUARDS

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-JOB-RUNNER-GUARDS` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 169 — abertura do contrato REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-JOB-RUNNER-CLICK-FALLBACK`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-JOB-RUNNER-CLICK-FALLBACK em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 170 — identificador REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      "id": "REG-JOB-RUNNER-CLICK-FALLBACK",`

**O que faz:** Define o identificador estável `REG-JOB-RUNNER-CLICK-FALLBACK` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-JOB-RUNNER-CLICK-FALLBACK; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 171 — risco histórico de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      "error": "clique quebrado em card de imagem podia impedir fallback para o próximo candidato.",`

**O que faz:** Descreve o defeito que `REG-JOB-RUNNER-CLICK-FALLBACK` existe para impedir: clique quebrado em card de imagem podia impedir fallback para o próximo candidato.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 172 — arquivo-sentinela de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      "file": "tests/unit/content-gemini/job-runner.test.js",`

**O que faz:** Aponta `REG-JOB-RUNNER-CLICK-FALLBACK` para `tests/unit/content-gemini/job-runner.test.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Jest sobre job-runner.js real.

### Linha 173 — abertura dos marcadores de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-JOB-RUNNER-CLICK-FALLBACK`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 174 — marcador obrigatório de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `        "RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato"`

**O que faz:** Exige que o arquivo alvo contenha a substring `RUN-COV-02: tryClickModelImageCards ignora clique que lança e tenta o próximo candidato`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-JOB-RUNNER-CLICK-FALLBACK, esta sentinela ancora a prova descrita como: O teste faz o primeiro botão lançar `stale element`, oferece card fallback e exige retorno true, tentativa no quebrado e um clique no fallback. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 175 — fechamento dos marcadores de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-JOB-RUNNER-CLICK-FALLBACK`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 176 — rótulo de gate de REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `      "gate": "Jest + Code Coverage"`

**O que faz:** Declara o rótulo documental `Jest + Code Coverage` para `REG-JOB-RUNNER-CLICK-FALLBACK`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Jest sobre job-runner.js real.

### Linha 177 — fechamento do contrato REG-JOB-RUNNER-CLICK-FALLBACK

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-JOB-RUNNER-CLICK-FALLBACK` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 178 — abertura do contrato REG-E2E-FIFO-MULTIBATCH

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-FIFO-MULTIBATCH`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-FIFO-MULTIBATCH em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 179 — identificador REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      "id": "REG-E2E-FIFO-MULTIBATCH",`

**O que faz:** Define o identificador estável `REG-E2E-FIFO-MULTIBATCH` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-FIFO-MULTIBATCH; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 180 — risco histórico de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      "error": "lotes A→G podiam misturar estado/resultado stale ou quebrar FIFO.",`

**O que faz:** Descreve o defeito que `REG-E2E-FIFO-MULTIBATCH` existe para impedir: lotes A→G podiam misturar estado/resultado stale ou quebrar FIFO.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 181 — arquivo-sentinela de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      "file": "tests/e2e/translation-flow.spec.js",`

**O que faz:** Aponta `REG-E2E-FIFO-MULTIBATCH` para `tests/e2e/translation-flow.spec.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Playwright E2E da extensão.

### Linha 182 — abertura dos marcadores de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-FIFO-MULTIBATCH`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 183 — marcador obrigatório de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `        "E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale"`

**O que faz:** Exige que o arquivo alvo contenha a substring `E2E FIFO N-lotes: A→B→C→D→E→F→G preserva resultados e ordem sem stale`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-FIFO-MULTIBATCH, esta sentinela ancora a prova descrita como: `translation-flow.spec.js` enfileira A→G com barreira explícita, verifica posições/IDs FIFO, uma tradução por página, drenagem completa e ausência de logs de stale/identity mismatch. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 184 — fechamento dos marcadores de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-FIFO-MULTIBATCH`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 185 — rótulo de gate de REG-E2E-FIFO-MULTIBATCH

**Fonte:** `      "gate": "E2E"`

**O que faz:** Declara o rótulo documental `E2E` para `REG-E2E-FIFO-MULTIBATCH`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Playwright E2E da extensão.

### Linha 186 — fechamento do contrato REG-E2E-FIFO-MULTIBATCH

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-E2E-FIFO-MULTIBATCH` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 187 — abertura do contrato REG-E2E-MODES-NO-GHOST

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-MODES-NO-GHOST`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-MODES-NO-GHOST em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 188 — identificador REG-E2E-MODES-NO-GHOST

**Fonte:** `      "id": "REG-E2E-MODES-NO-GHOST",`

**O que faz:** Define o identificador estável `REG-E2E-MODES-NO-GHOST` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-MODES-NO-GHOST; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 189 — risco histórico de REG-E2E-MODES-NO-GHOST

**Fonte:** `      "error": "minimized_window/background_delete podiam depender de ghost mousemove/foco físico.",`

**O que faz:** Descreve o defeito que `REG-E2E-MODES-NO-GHOST` existe para impedir: minimized_window/background_delete podiam depender de ghost mousemove/foco físico.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 190 — arquivo-sentinela de REG-E2E-MODES-NO-GHOST

**Fonte:** `      "file": "tests/e2e/translation-flow.spec.js",`

**O que faz:** Aponta `REG-E2E-MODES-NO-GHOST` para `tests/e2e/translation-flow.spec.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Playwright E2E da extensão.

### Linha 191 — abertura dos marcadores de REG-E2E-MODES-NO-GHOST

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-MODES-NO-GHOST`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 192 — marcador obrigatório de REG-E2E-MODES-NO-GHOST

**Fonte:** `        "test(\`Executa o lote em ${scenario.label} sem depender de ghost mousemove\`",`

**O que faz:** Exige que o arquivo alvo contenha a substring `test(\`Executa o lote em ${scenario.label} sem depender de ghost mousemove\``.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-MODES-NO-GHOST, esta sentinela ancora a prova descrita como: O E2E executa `minimized_window` e `background_delete` sem mousemove sintético, exige imagem traduzida, fila drenada, `BATCH_DONE` e `DELETE_OK`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 193 — marcador obrigatório de REG-E2E-MODES-NO-GHOST

**Fonte:** `        "mode: 'minimized_window'",`

**O que faz:** Exige que o arquivo alvo contenha a substring `mode: 'minimized_window'`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-MODES-NO-GHOST, esta sentinela ancora a prova descrita como: O E2E executa `minimized_window` e `background_delete` sem mousemove sintético, exige imagem traduzida, fila drenada, `BATCH_DONE` e `DELETE_OK`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 194 — marcador obrigatório de REG-E2E-MODES-NO-GHOST

**Fonte:** `        "mode: 'background_delete'"`

**O que faz:** Exige que o arquivo alvo contenha a substring `mode: 'background_delete'`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-MODES-NO-GHOST, esta sentinela ancora a prova descrita como: O E2E executa `minimized_window` e `background_delete` sem mousemove sintético, exige imagem traduzida, fila drenada, `BATCH_DONE` e `DELETE_OK`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 195 — fechamento dos marcadores de REG-E2E-MODES-NO-GHOST

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-MODES-NO-GHOST`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 196 — rótulo de gate de REG-E2E-MODES-NO-GHOST

**Fonte:** `      "gate": "E2E"`

**O que faz:** Declara o rótulo documental `E2E` para `REG-E2E-MODES-NO-GHOST`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Playwright E2E da extensão.

### Linha 197 — fechamento do contrato REG-E2E-MODES-NO-GHOST

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-E2E-MODES-NO-GHOST` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 198 — abertura do contrato REG-E2E-ATTACHMENT-GATE

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-ATTACHMENT-GATE`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-ATTACHMENT-GATE em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 199 — identificador REG-E2E-ATTACHMENT-GATE

**Fonte:** `      "id": "REG-E2E-ATTACHMENT-GATE",`

**O que faz:** Define o identificador estável `REG-E2E-ATTACHMENT-GATE` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-ATTACHMENT-GATE; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 200 — risco histórico de REG-E2E-ATTACHMENT-GATE

**Fonte:** `      "error": "prompt podia ser enviado sem confirmação real do anexo.",`

**O que faz:** Descreve o defeito que `REG-E2E-ATTACHMENT-GATE` existe para impedir: prompt podia ser enviado sem confirmação real do anexo.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 201 — arquivo-sentinela de REG-E2E-ATTACHMENT-GATE

**Fonte:** `      "file": "tests/e2e/translation-flow.spec.js",`

**O que faz:** Aponta `REG-E2E-ATTACHMENT-GATE` para `tests/e2e/translation-flow.spec.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Playwright E2E da extensão.

### Linha 202 — abertura dos marcadores de REG-E2E-ATTACHMENT-GATE

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-ATTACHMENT-GATE`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 203 — marcador obrigatório de REG-E2E-ATTACHMENT-GATE

**Fonte:** `        "REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma",`

**O que faz:** Exige que o arquivo alvo contenha a substring `REG attachment gate: ${scenario.label} nunca envia texto quando a imagem não confirma`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-ATTACHMENT-GATE, esta sentinela ancora a prova descrita como: Para três modos, o E2E força falha de anexo, exige `GEMINI_ATTACHMENT_NOT_CONFIRMED`, ordem `ATTACHMENT_STARTED→REJECTED→SUBMIT_BLOCKED_ATTACHMENT`, nenhum submit/prompt e zero imagem traduzida. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 204 — marcador obrigatório de REG-E2E-ATTACHMENT-GATE

**Fonte:** `        "GEMINI_ATTACHMENT_NOT_CONFIRMED",`

**O que faz:** Exige que o arquivo alvo contenha a substring `GEMINI_ATTACHMENT_NOT_CONFIRMED`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-ATTACHMENT-GATE, esta sentinela ancora a prova descrita como: Para três modos, o E2E força falha de anexo, exige `GEMINI_ATTACHMENT_NOT_CONFIRMED`, ordem `ATTACHMENT_STARTED→REJECTED→SUBMIT_BLOCKED_ATTACHMENT`, nenhum submit/prompt e zero imagem traduzida. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 205 — marcador obrigatório de REG-E2E-ATTACHMENT-GATE

**Fonte:** `        "SUBMIT_BLOCKED_ATTACHMENT"`

**O que faz:** Exige que o arquivo alvo contenha a substring `SUBMIT_BLOCKED_ATTACHMENT`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-ATTACHMENT-GATE, esta sentinela ancora a prova descrita como: Para três modos, o E2E força falha de anexo, exige `GEMINI_ATTACHMENT_NOT_CONFIRMED`, ordem `ATTACHMENT_STARTED→REJECTED→SUBMIT_BLOCKED_ATTACHMENT`, nenhum submit/prompt e zero imagem traduzida. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 206 — fechamento dos marcadores de REG-E2E-ATTACHMENT-GATE

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-ATTACHMENT-GATE`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 207 — rótulo de gate de REG-E2E-ATTACHMENT-GATE

**Fonte:** `      "gate": "E2E"`

**O que faz:** Declara o rótulo documental `E2E` para `REG-E2E-ATTACHMENT-GATE`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Playwright E2E da extensão.

### Linha 208 — fechamento do contrato REG-E2E-ATTACHMENT-GATE

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-E2E-ATTACHMENT-GATE` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 209 — abertura do contrato REG-E2E-RESULT-OWNERSHIP

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-RESULT-OWNERSHIP`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-RESULT-OWNERSHIP em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 210 — identificador REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      "id": "REG-E2E-RESULT-OWNERSHIP",`

**O que faz:** Define o identificador estável `REG-E2E-RESULT-OWNERSHIP` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-RESULT-OWNERSHIP; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 211 — risco histórico de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      "error": "clone do input ou IMG órfã podia ser confundido com resultado do modelo.",`

**O que faz:** Descreve o defeito que `REG-E2E-RESULT-OWNERSHIP` existe para impedir: clone do input ou IMG órfã podia ser confundido com resultado do modelo.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 212 — arquivo-sentinela de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      "file": "tests/e2e/translation-flow.spec.js",`

**O que faz:** Aponta `REG-E2E-RESULT-OWNERSHIP` para `tests/e2e/translation-flow.spec.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Playwright E2E da extensão.

### Linha 213 — abertura dos marcadores de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-RESULT-OWNERSHIP`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 214 — marcador obrigatório de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `        "REG result ownership: ${scenario.label} ignora clone do input e IMG órfã",`

**O que faz:** Exige que o arquivo alvo contenha a substring `REG result ownership: ${scenario.label} ignora clone do input e IMG órfã`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-RESULT-OWNERSHIP, esta sentinela ancora a prova descrita como: Para três modos, o E2E injeta clone do input e IMG órfã, exige tradução pelo resultado real, rejeições `user_turn`/`missing_model_owner` e aceitação `new_model_turn`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 215 — marcador obrigatório de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `        "missing_model_owner",`

**O que faz:** Exige que o arquivo alvo contenha a substring `missing_model_owner`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-RESULT-OWNERSHIP, esta sentinela ancora a prova descrita como: Para três modos, o E2E injeta clone do input e IMG órfã, exige tradução pelo resultado real, rejeições `user_turn`/`missing_model_owner` e aceitação `new_model_turn`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 216 — marcador obrigatório de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `        "new_model_turn"`

**O que faz:** Exige que o arquivo alvo contenha a substring `new_model_turn`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-RESULT-OWNERSHIP, esta sentinela ancora a prova descrita como: Para três modos, o E2E injeta clone do input e IMG órfã, exige tradução pelo resultado real, rejeições `user_turn`/`missing_model_owner` e aceitação `new_model_turn`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 217 — fechamento dos marcadores de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-RESULT-OWNERSHIP`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 218 — rótulo de gate de REG-E2E-RESULT-OWNERSHIP

**Fonte:** `      "gate": "E2E"`

**O que faz:** Declara o rótulo documental `E2E` para `REG-E2E-RESULT-OWNERSHIP`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Playwright E2E da extensão.

### Linha 219 — fechamento do contrato REG-E2E-RESULT-OWNERSHIP

**Fonte:** `    },`

**O que faz:** Encerra o objeto da regressão `REG-E2E-RESULT-OWNERSHIP` e separa a próxima entrada.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 220 — abertura do contrato REG-E2E-MANUAL-INERT

**Fonte:** `    {`

**O que faz:** Abre o objeto independente da regressão `REG-E2E-MANUAL-INERT`.

**Como faz:** O loop do CI Contract tratará este objeto como uma entrada e validará id, file e markers.

**Por que foi implementado dessa forma / risco de alternativa:** Isolar REG-E2E-MANUAL-INERT em objeto próprio mantém juntos risco, arquivo alvo, sentinelas e rótulo de gate; fundir campos entre regressões facilitaria associação errada.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE — a estrutura precisa parsear para o loop alcançar esta entrada.

### Linha 221 — identificador REG-E2E-MANUAL-INERT

**Fonte:** `      "id": "REG-E2E-MANUAL-INERT",`

**O que faz:** Define o identificador estável `REG-E2E-MANUAL-INERT` para esta regressão.

**Como faz:** `verify-ci-contract.js` exige string não vazia e usa um `Set` para rejeitar duplicatas.

**Por que foi implementado dessa forma / risco de alternativa:** O ID dá identidade ao contrato REG-E2E-MANUAL-INERT; sem unicidade, diagnósticos e rastreabilidade poderiam conflitar. O gate, porém, não fixa a lista esperada dos 23 IDs.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença/unicidade; ⚠️ o conjunto exato de IDs não é pinado.

### Linha 222 — risco histórico de REG-E2E-MANUAL-INERT

**Fonte:** `      "error": "aba Gemini aberta manualmente podia iniciar automação/keepalive sem job.",`

**O que faz:** Descreve o defeito que `REG-E2E-MANUAL-INERT` existe para impedir: aba Gemini aberta manualmente podia iniciar automação/keepalive sem job.

**Como faz:** Serve como explicação humana dentro do JSON; o verificador atual não lê `entry.error`.

**Por que foi implementado dessa forma / risco de alternativa:** Registrar o modo de falha evita que um futuro mantenedor preserve apenas a string do teste sem entender a regressão; ainda assim o texto pode divergir do teste sem falhar CI.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO para a fidelidade de `error`; a regressão subjacente foi inspecionada separadamente.

### Linha 223 — arquivo-sentinela de REG-E2E-MANUAL-INERT

**Fonte:** `      "file": "tests/e2e/translation-flow.spec.js",`

**O que faz:** Aponta `REG-E2E-MANUAL-INERT` para `tests/e2e/translation-flow.spec.js`.

**Como faz:** O consumidor faz `path.join(root, entry.file)`, exige `fs.existsSync` e lê o arquivo inteiro em UTF-8 para procurar cada marcador.

**Por que foi implementado dessa forma / risco de alternativa:** Vincular o contrato ao arquivo que contém a prova torna a regressão verificável; um path inválido falha cedo. Não há restrição explícita contra `../`, portanto o campo é confiável por estar versionado no repositório.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para existência do path. Evidência do comportamento: ✅ PROVADO DIRETAMENTE — Playwright E2E da extensão.

### Linha 224 — abertura dos marcadores de REG-E2E-MANUAL-INERT

**Fonte:** `      "markers": [`

**O que faz:** Inicia a lista de substrings obrigatórias da regressão `REG-E2E-MANUAL-INERT`.

**Como faz:** O CI Contract converte `entry.markers` em array e exige pelo menos um elemento.

**Por que foi implementado dessa forma / risco de alternativa:** Vários marcadores podem tornar a sentinela mais específica, mas o mecanismo continua textual e não entende AST, bloco de teste ou assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para array não vazio.

### Linha 225 — marcador obrigatório de REG-E2E-MANUAL-INERT

**Fonte:** `        "E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto",`

**O que faz:** Exige que o arquivo alvo contenha a substring `E2E aba Gemini manual: zero automação, zero keepalive e DOM intacto`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-MANUAL-INERT, esta sentinela ancora a prova descrita como: Abre Gemini manualmente sem job, verifica DOM intacto, nenhum anexo/prompt/resultado, keepalive zero e presença de `JOB_NOT_FOUND`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 226 — marcador obrigatório de REG-E2E-MANUAL-INERT

**Fonte:** `        "JOB_NOT_FOUND"`

**O que faz:** Exige que o arquivo alvo contenha a substring `JOB_NOT_FOUND`.

**Como faz:** `verify-ci-contract.js` executa `source.includes(marker)`; ausência, string vazia ou tipo não textual gera problema e falha final do contrato.

**Por que foi implementado dessa forma / risco de alternativa:** Para REG-E2E-MANUAL-INERT, esta sentinela ancora a prova descrita como: Abre Gemini manualmente sem job, verifica DOM intacto, nenhum anexo/prompt/resultado, keepalive zero e presença de `JOB_NOT_FOUND`. O uso de substring é simples e resistente a refactors pequenos fora do marcador, mas pode casar comentário/texto sem preservar a assertion.

**Evidência automatizada:** 🟦 GATE ESTÁTICO ESPECÍFICO para presença textual; comportamento subjacente: ✅ PROVADO DIRETAMENTE.

### Linha 227 — fechamento dos marcadores de REG-E2E-MANUAL-INERT

**Fonte:** `      ],`

**O que faz:** Encerra a lista de sentinelas de `REG-E2E-MANUAL-INERT`.

**Como faz:** Completa o array que o consumidor percorre com `for (const marker of markers)`.

**Por que foi implementado dessa forma / risco de alternativa:** Delimitação explícita impede que `gate` ou outro campo seja interpretado como marcador.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 228 — rótulo de gate de REG-E2E-MANUAL-INERT

**Fonte:** `      "gate": "E2E"`

**O que faz:** Declara o rótulo documental `E2E` para `REG-E2E-MANUAL-INERT`.

**Como faz:** O campo fica armazenado no JSON, mas `verify-ci-contract.js` não lê `entry.gate`; a execução real decorre de package scripts/Jest/Playwright/CI.

**Por que foi implementado dessa forma / risco de alternativa:** O rótulo ajuda humanos a localizar a camada de prova, porém não é fonte de verdade executável; renomeá-lo incorretamente hoje não quebra o gate.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO do valor do campo `gate`. Execução subjacente verificada manualmente: Playwright E2E da extensão.

### Linha 229 — fechamento do contrato REG-E2E-MANUAL-INERT

**Fonte:** `    }`

**O que faz:** Encerra o objeto da regressão `REG-E2E-MANUAL-INERT` como último item do array.

**Como faz:** Preserva fronteira sintática entre este conjunto de campos e o contrato seguinte.

**Por que foi implementado dessa forma / risco de alternativa:** Uma vírgula ausente entre objetos ou extra após o último item tornaria JSON inválido e impediria qualquer validação.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 230 — fechamento do array `regressions`

**Fonte:** `  ]`

**O que faz:** Encerra a coleção após o 23º contrato.

**Como faz:** Completa a sintaxe do array consumido por `Array.isArray` e pelo loop de validação.

**Por que foi implementado dessa forma / risco de alternativa:** Sem este fechamento o JSON não parseia e o CI Contract registra matriz inválida.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 231 — fechamento do objeto raiz

**Fonte:** `}`

**O que faz:** Encerra o documento JSON depois de `regressions`.

**Como faz:** Fecha a raiz iniciada na linha 1.

**Por que foi implementado dessa forma / risco de alternativa:** Mantém o arquivo JSON estrito; conteúdo estrutural fora da raiz exigiria outra propriedade ou formato.

**Evidência automatizada:** 🟨 EXECUTADO INDIRETAMENTE pela leitura JSON do CI Contract; não há assertion focal para esta posição isolada.

### Linha 232 — newline final

**Fonte:** *(linha vazia / newline terminal)*

**O que faz:** Representa a posição vazia criada pelo newline terminal do arquivo.

**Como faz:** Não cria dado JSON adicional; o parser ignora whitespace após `}`.

**Por que foi implementado dessa forma / risco de alternativa:** Preserva convenção POSIX/editor e é contado documentalmente para garantir cobertura exata das posições.

**Evidência automatizada:** ⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO — o newline final não possui gate dedicado.

