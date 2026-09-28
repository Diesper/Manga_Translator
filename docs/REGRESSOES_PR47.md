# Regressões protegidas no PR #47

Este documento registra as falhas reproduzidas durante a investigação do PR #47 e o contrato que cada teste deve proteger. As mudanças abaixo dizem respeito aos testes e seus mocks; não alteram o protocolo da extensão.

## ACK da aba auxiliar de extração

`content_manga.js` considera `IMAGE_READY_FROM_NEW_TAB` entregue somente quando o background responde com `ok: true` e sem `persisted: false`. Se o mock responder `undefined`, a extensão agenda nova tentativa após 700 ms. Um timer desse tipo pode sobreviver ao caso atual e enviar mensagens durante o caso seguinte, gerando contagens erradas apenas em execuções mais lentas, como coverage.

Em `tests/unit/content-manga/extraction-and-handlers-real.test.js`, o mock padrão confirma `{ ok: true, persisted: true }`. Dois testes de regressão verificam os dois lados do protocolo:

- ACK positivo: uma entrega e nenhuma segunda mensagem após a janela de retry.
- ACK negativo seguido de positivo: exatamente uma nova entrega, com o mesmo payload, e parada depois da confirmação.

Falhas de persistência devem ser simuladas explicitamente no caso negativo. Remover o ACK positivo do mock ou fazer a extensão ignorar o ACK deve quebrar esses testes.

## Encerramento do runner Gemini

Receber o `GEMINI_ERROR` esperado não significa que `processGeminiJob()` já terminou. Se o teste desmontar o DOM e substituir o mock compartilhado enquanto essa Promise ainda executa, callbacks do caso anterior podem produzir `Observer interrompido` no caso seguinte.

`tests/unit/content-gemini/rpa-flow.test.js` guarda a Promise iniciada pelo helper e a aguarda no `afterEach`, depois de parar os observers. O caso `CG-36` também exige que a Promise termine com `status: result_timeout` e que haja somente o erro de timeout esperado. Isso torna uma interrupção antecipada observável no próprio caso.

## Clique individual e lote anterior

Uma instância anterior de `content_manga.js` pode concluir uma chamada assíncrona a `START_BATCH` depois da instalação do spy do caso seguinte. O caso de seleção individual em `tests/unit/content-manga/floating-button-guard-and-single-click.test.js` aguarda o próprio `START_BATCH` e exige uma única chamada antes de encerrar o lote. O caso de imagem removida limpa o histórico inicial do spy e exige que a confirmação inválida não inicie lote.

## Cobertura e performance

`tests/unit/content-gemini/job-runner.test.js` cobre dataURLs inválidas, ausência da API `File` e ausência de dispatcher de eventos. Esses caminhos de erro mantêm a cobertura de branches do arquivo crítico acima do piso de 64% sem diminuir o limite. `tests/ci/test-baseline.json` protege o novo inventário mínimo de 836 testes.

O caso `PERF-05` em `tests/integration/performance.test.js` mede até a aparição dos 200 capítulos. Os oito ciclos assíncronos usados para estabilizar as verificações seguintes ocorrem depois da medição. O limite de renderização continua sendo 1 segundo fora do modo coverage.

## Verificação direcionada

### Lifecycle e worker: verificação local

A extração auxiliar agora registra os timers de mapeamento, busca da imagem e retry, o interval de polling e os listeners `load`/`error`. O cleanup é idempotente e ocorre após ACK persistido, falha terminal ou `pagehide`; callbacks tardios verificam se a instância continua ativa. O prazo de segurança de 20 segundos encerra a espera e registra falha, sem deixar listeners presos. Quatro novos casos no arquivo de extração verificam ACK, retry interrompido, mapeamento interrompido e limpeza no prazo de segurança. O inventário mínimo passou para 840 testes.

O mock de `chrome.alarms` limpa os alarmes também no `afterEach`. As suítes reais de finalização e handlers cancelam, no teardown, os timers de fechamento diferido que iniciaram. O prompt de clique individual cancela a instalação adiada do listener externo e descarta seus listeners no `pagehide`. O teardown do teste de clique dispara o descarte antes de restaurar mocks. O teardown de RPA já espera `processPromise` e interrompe observers; a execução paralela ainda precisa confirmar se restou algum recurso fora desses fluxos.

`tests/ci/run-jest-ci.js` agora captura o stderr do Jest e reprova o warning `A worker process has failed to exit gracefully and has been force exited`, mesmo quando o Jest retorna zero. O contrato de CI exige o self-test desse detector. Isso torna o vazamento observável no job completo, mas **não demonstra, sem executar a suíte paralela, que o vazamento foi eliminado**.

O ruleset ativo da `main` (ID `23791606`) foi atualizado no GitHub: os checks antigos `Smoke + Visual + Unit Tests (20.x)` e `(22.x)` foram removidos e `CI Gate` foi incluído. Permaneceram `JS Syntax Check`, `Manifest Validation`, `E2E Tests (Playwright)` e `Code Coverage`, com `strict_required_status_checks_policy: true` e as regras de deleção, non-fast-forward e pull request. O snapshot anterior está em `pr47-ruleset-main-before.json` no diretório temporário local do operador. A resposta da API confirma a lista nova; o estado de merge do PR deve ser conferido após o próximo push e execução de CI.

Com autorização posterior, os arquivos alterados de extração (25 testes), clique individual (15), finalização do background (11) e handlers do background (6) passaram isoladamente no Node 20. Os gates de contrato, worker, coverage e reporter E2E passaram; os 6 smoke e 224 testes visuais também passaram. O Jest completo em paralelo passou localmente no Node 20 com 107 suítes, 840 testes, skipped=0 e TODO=0, **sem o warning de worker forçado**. O próprio `run-jest-ci.js` teria retornado erro se o warning tivesse aparecido no stderr.

A cobertura real e o Playwright E2E passaram nos dois runs de GitHub Actions do commit `0068e93`. Os 840 testes Jest também passaram, mas os jobs paralelos Linux Node 20/22 **falharam no gate de worker**. Portanto, o resultado local do Windows não encerrou o incidente. A inspeção mostrou que `ChromeRuntimeMock.sendMessage()` deixava timeouts de canal sem resposta pendentes até 500 ms após o caso; agora o mock registra e cancela esses timers no `afterEach`, com regressão dedicada. O inventário mínimo passou para 108 suítes/841 testes.

O runner de CI também não usa mais `process.exit(1)` após escrever um stderr grande: usa `process.exitCode`, permitindo que o log de erro seja descarregado antes da saída. No run anterior, o fim do relatório e o motivo do gate foram truncados. Nesta rodada, por solicitação do usuário, executamos localmente apenas a nova regressão do timer pendente; os demais testes aprovados anteriormente não foram repetidos. O incidente só fica plenamente verificado quando os dois jobs paralelos do CI terminarem sem warning e o `CI Gate` ficar verde.

Dentro de `tests/`, cada arquivo pode ser executado isoladamente com Jest:

```bash
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/extraction-and-handlers-real.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/floating-button-guard-and-single-click.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/rpa-flow.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/job-runner.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath integration/performance.test.js
```

Essas execuções isoladas validam o comportamento dos casos alterados. O inventário completo, a cobertura global, a matriz Node 20/22 e o E2E são verificados pelos gates do GitHub Actions após o push.


## Causa-raiz encerrada — worker Jest do PR #47

A investigação do worker leak terminou com reprodução mínima e correção atribuível a um recurso concreto.

### Reprodução mínima

O delta debugging do project `background` reduziu 44 suítes ao par:

- `unit/background/process-finalize-real.test.js`
- `unit/background/regex-escape.test.js`

Com `--maxWorkers=3`, esse par reproduziu o warning **4/4 vezes**. Cada arquivo executado sozinho ficava limpo, demonstrando por que diagnósticos isolados anteriores davam falso negativo: uma execução de um único arquivo não reproduz necessariamente o mesmo ciclo de vida de worker pool.

### Recurso responsável

`regex-escape.test.js` exercita `SHOW_EXISTING_FOLDER`. Nos cenários em que não há uma pasta existente, o fluxo real chega a `handleMarkerAndShow()`, cria `_anchor.png` e agenda sua remoção/erase cerca de **4 segundos** depois.

Esse timer não pertencia ao teardown da suíte. Assim, o teste podia terminar aprovado enquanto o processo ainda possuía um Timeout ativo. Dependendo da distribuição dos arquivos entre workers, o Jest precisava matar o worker após o fim das assertions.

### Correção

`trackBackgroundDelayTimers()` passou a possuir também o delay de **4000 ms**, além dos delays já rastreados de 600 ms e 18 s. `regex-escape.test.js` inicia o tracker no setup e o cancela no teardown.

As suítes reais relacionadas a marker/finalização também usam teardown explícito para impedir que recursos de um caso atravessem para o próximo.

### Prova de resolução

Run #1327:

- background: 44 suítes / 221 testes, `forcedWorkerExit=false`;
- bisection em 3 workers: 2/2 execuções limpas;
- Node 20/22 completos: sem warning.

Run #1355 no head `d940df4ddf982a7b45c423ba74901b993fc37f06`:

- Node 20: 108/108 suítes, 847/847 testes, gate aprovado;
- Node 22: 108/108 suítes, 847/847 testes, gate aprovado;
- sem worker forçado.

O detector de worker continua ativo no caminho obrigatório de CI. A solução não usa `--forceExit`, não ignora stderr e não serializa permanentemente a suíte.

## Regressão de coverage do JobRunner

Durante a finalização, `extension/gemini/job-runner.js` ficou em 63,37% de branches, abaixo do piso crítico de 64%.

O piso **não foi reduzido**. Foram adicionados testes para:

- guardas explícitas de dependências obrigatórias do JobRunner;
- ausência de candidato em `tryClickModelImageCards()`;
- candidato cujo `click()` falha e fallback para o próximo candidato.

Resultado no run #1355:

- `job-runner.js`: **285/434 branches = 65,67%**;
- coverage global: **79,52% statements, 71,68% branches, 82,71% functions, 79,52% lines**;
- Coverage Integrity aprovado.

O inventário Jest final protegido é **108 suítes / 847 testes**.

## Evidência E2E e CI final

Run #1355:

- Playwright descobriu 21 testes;
- **21 passed**;
- skipped=0;
- flaky=0;
- failed=0;
- E2E gate aprovado;
- CI Gate aprovado com todos os gates obrigatórios em `success`.

Os diagnósticos caros de leak continuam disponíveis por `workflow_dispatch`, enquanto o gate permanente do Jest completo permanece obrigatório.


## Matriz obrigatória de regressões — atualização final

A partir desta atualização, `tests/ci/regression-matrix.json` é a fonte machine-readable das regressões críticas do PR #47. O `CI Contract` lê a matriz e falha se:

- um ID estiver duplicado;
- o arquivo do teste desaparecer;
- um teste/marcador obrigatório desaparecer;
- a matriz cair abaixo do conjunto mínimo de contratos críticos.

Isso complementa o baseline numérico: não basta manter “848 testes” substituindo um teste crítico por outro irrelevante.

| ID | Falha protegida | Teste/arquivo | Gate |
|---|---|---|---|
| REG-EXTRACT-ACK-PERSISTED | retry tardio após ACK persistido | `extraction-and-handlers-real.test.js` | Jest |
| REG-EXTRACT-ACK-RETRY | retry acumulado após ACK negativo/positivo | mesmo arquivo | Jest |
| REG-EXTRACT-PAGEHIDE-RETRY | retry sobrevivendo a descarte | mesmo arquivo | Jest |
| REG-EXTRACT-PAGEHIDE-MAPPING | lookup sobrevivendo a descarte | mesmo arquivo | Jest |
| REG-EXTRACT-SAFETY-TIMEOUT | polling/listeners presos | mesmo arquivo | Jest |
| REG-RUNTIME-MESSAGE-TIMER | timeout de canal do mock atravessando teardown | `chrome-runtime-mock-lifecycle.test.js` | Jest |
| REG-STORAGE-PENDING-CALLBACK | callback de storage tardio | mesmo arquivo | Jest |
| REG-TABS-PENDING-UPDATE | onUpdated tardio de tabs.create | mesmo arquivo | Jest |
| REG-RUNTIME-INSTALLED-PENDING | onInstalled pendente | mesmo arquivo | Jest |
| REG-RPA-PROMISE-TEARDOWN | runner Gemini vivo após teardown | `rpa-flow.test.js` | Jest + worker gate |
| REG-SINGLE-CLICK-STALE-BATCH | START_BATCH stale após imagem desaparecer | `floating-button-guard-and-single-click.test.js` | Jest |
| REG-WORKER-ANCHOR-4S | timer de 4 s do `_anchor.png` mantém worker vivo | `marker-anchor-real.test.js` / `REG-WORKER-4S` | Jest + worker gate |
| REG-REGEX-FOLDER | regex inválida em path com metacaracteres | `regex-escape.test.js` | Jest |
| REG-WORKER-WARNING-GATE | warning de force-exit não reprova CI | self-test de worker | CI Contract |
| REG-E2E-FLAKY-RETRY-GATE | retry transforma falha em verde | self-test reporter Playwright | CI Contract |
| REG-COVERAGE-CRITICAL-THRESHOLD | coverage crítico é reduzido/omitido | self-test coverage | Coverage + CI Contract |
| REG-JOB-RUNNER-GUARDS | dependências obrigatórias sem erro explícito | `job-runner.test.js` RUN-00 | Jest + Coverage |
| REG-JOB-RUNNER-CLICK-FALLBACK | card stale impede próximo candidato | `job-runner.test.js` RUN-COV-02 | Jest + Coverage |
| REG-E2E-FIFO-MULTIBATCH | batches A→G quebram FIFO/ownership | `translation-flow.spec.js` | E2E |
| REG-E2E-MODES-NO-GHOST | modos dependem de ghost mousemove/foco | mesmo arquivo | E2E |
| REG-E2E-ATTACHMENT-GATE | texto enviado sem anexo confirmado | mesmo arquivo | E2E |
| REG-E2E-RESULT-OWNERSHIP | input/IMG órfã aceita como resultado | mesmo arquivo | E2E |
| REG-E2E-MANUAL-INERT | Gemini manual inicia automação/keepalive | mesmo arquivo | E2E |

### Regressão específica nova do timer de 4 s

O teste `REG-WORKER-4S` usa o fluxo real de `handleMarkerAndShow()`, confirma que o tracker possui um delay de `4000` ms, executa o teardown e exige contagem zero de recursos pendentes.

O helper de testes agora expõe apenas para regressão:

- `getPendingDelays()`;
- `getPendingCount()`;
- a lista de delays efetivamente cancelados no retorno do cleanup.

Isso evita esperar quatro segundos reais e torna a causa-raiz diretamente observável.

O baseline Jest passa de 847 para **848 testes**, mantendo **108 suítes**, skipped=0 e TODO=0.
