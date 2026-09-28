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

A cobertura real, o Playwright E2E e a matriz Linux Node 20/22 permanecem para o GitHub Actions depois do push, conforme a orientação do usuário. O diagnóstico serial `--detectOpenHandles --runInBand` havia passado no commit anterior; ele não substitui a confirmação paralela. O incidente só fica plenamente verificado quando os dois jobs paralelos do CI terminarem sem warning e o `CI Gate` ficar verde.

Dentro de `tests/`, cada arquivo pode ser executado isoladamente com Jest:

```bash
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/extraction-and-handlers-real.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/floating-button-guard-and-single-click.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/rpa-flow.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/job-runner.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath integration/performance.test.js
```

Essas execuções isoladas validam o comportamento dos casos alterados. O inventário completo, a cobertura global, a matriz Node 20/22 e o E2E são verificados pelos gates do GitHub Actions após o push.
