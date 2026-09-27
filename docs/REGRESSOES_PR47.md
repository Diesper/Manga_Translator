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

Dentro de `tests/`, cada arquivo pode ser executado isoladamente com Jest:

```bash
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/extraction-and-handlers-real.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-manga/floating-button-guard-and-single-click.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/rpa-flow.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath unit/content-gemini/job-runner.test.js
npx jest --config jest.config.js --runInBand --runTestsByPath integration/performance.test.js
```

Essas execuções isoladas validam o comportamento dos casos alterados. O inventário completo, a cobertura global, a matriz Node 20/22 e o E2E são verificados pelos gates do GitHub Actions após o push.
