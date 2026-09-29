# Plano de correção das pendências do PR #47

## Objetivo e estado verificado

Este é um plano de execução, não uma declaração de que os defeitos já foram corrigidos. O ponto de partida é o commit `be6b9ec30ecbc0ba7e155eadbf5c781d83316ae8` do [PR #47](https://github.com/Diesper/Manga_Translator/pull/47). Antes de executar as etapas, conferir novamente o SHA da ponta do PR e o estado do checkout, pois a branch pode avançar.

| Tema | Evidência atual | Conclusão |
| --- | --- | --- |
| Worker do Jest | O [run #1233](https://github.com/Diesper/Manga_Translator/actions/runs/36360431441) passou com 107 suítes e 836 testes, mas os jobs Node 20 e Node 22 registraram `A worker process has failed to exit gracefully and has been force exited`. | O aviso ainda existe na execução paralela do CI. Sucesso do job não prova encerramento limpo. |
| Diagnóstico serial | `jest --config jest.config.js --runInBand --detectOpenHandles --ci --no-verbose` passou localmente com 107 suítes/836 testes e sem handle reportado. | O resultado só cobre a execução serial. `--detectOpenHandles` implica `--runInBand`; não reproduz, por si, o problema dos workers. |
| Extração auxiliar | Em `extension/content_manga.js`, os timers de 100 ms (mapeamento), 500 ms (imagem ausente) e 700 ms (retry) não têm cancelamento central. O timer de segurança de 20 s encerra o intervalo, mas mantém listeners da imagem. | O cleanup funcional está incompleto. Não há prova de que seja a causa única do warning do Jest. |
| Regressões atuais | `docs/REGRESSOES_PR47.md` descreve os dois testes novos de ACK, os testes do runner e o ajuste de isolamento do clique. | Esses casos protegem os bugs já tratados, mas não são quatro testes específicos de descarte da extração. |
| Gates de CI | `tests/ci/run-jest-ci.js` verifica inventário e rejeita skipped/TODO; o gate de Playwright rejeita skipped/flaky; a cobertura tem verificação própria; `.github/workflows/ci.yml` contém `CI Gate`. | Os gates existem no código, mas o job Jest completo ainda pode passar com warning de worker. |
| Proteção da `main` | O ruleset GitHub `23791606` ainda exige `Smoke + Visual + Unit Tests (20.x)` e `(22.x)`, nomes antigos. Ele não exige `CI Gate`. | O ajuste depende de configuração do repositório no GitHub; editar arquivos do PR não o altera. |

## 1. Reproduzir e localizar o worker que permanece vivo

1. Congelar o SHA analisado, a versão exata de Node/Jest e os logs dos dois jobs do CI. Registrar separadamente o resultado dos testes, o texto do warning e o tempo de encerramento do processo. Não inferir a causa só porque um teste isolado passa.
2. Reproduzir o comando **paralelo** de `npm run test:ci` em ambiente Linux equivalente ao CI, primeiro com o `maxWorkers` padrão, depois com 2 e 4 workers. Guardar logs e códigos de saída. Usar `--runInBand --detectOpenHandles` apenas como diagnóstico complementar, nunca como prova de que o worker paralelo encerra.
3. Isolar por grupos do Jest e, dentro do grupo que reproduz o aviso, dividir a lista de arquivos ao meio até localizar a menor suíte ou combinação que o provoca. Repetir os comandos para separar falha determinística de ordem/tempo. Conservar um comando mínimo reproduzível no registro da investigação.
4. No escopo dos testes suspeitos, inspecionar timers, intervals, `MutationObserver`/`ResizeObserver`, listeners de DOM, Promise pendente, portas/canais, servidores e mocks que lançam callbacks após o teardown. Instrumentar temporariamente `process._getActiveHandles()` e `process._getActiveRequests()` no ambiente de teste, identificando tipo e proprietário quando possível; esses métodos servem apenas para diagnóstico e não devem virar lógica da extensão. Conferir também processos filhos do Jest e a diferença entre teardown de cada suíte e saída global.
5. Corrigir a origem identificada. Encerrar explicitamente o recurso no dono, aguardar trabalho assíncrono iniciado pelo teste e restaurar mocks depois que ele terminar. Evitar `--forceExit`, `unref()`, aumento arbitrário de timeout ou silenciar stderr como substitutos da correção.

**Critério de aceite:** o comando paralelo completo, no mesmo ambiente do CI, termina sem o texto de worker forçado, com todas as suítes e testes passando. Repetir no Node 20 e 22, inclusive em mais de uma execução para descartar falso negativo por timing. A execução serial com `--detectOpenHandles` também deve terminar limpa. Se o warning persistir, manter esta etapa aberta mesmo que os testes de extração passem.

## 2. Implementar ciclo de vida da extração auxiliar

1. Centralizar os recursos criados pelo ramo `isExtractionCandidate` em uma instância de extração: timers de mapeamento, espera da imagem e retry; interval de polling; listeners `load`/`error`; callbacks assíncronos de `chrome.runtime.sendMessage`. Usar um registro de limpeza com identificadores e estado `cancelled`/geração, ou mecanismo equivalente simples.
2. Tornar a limpeza idempotente. Executá-la ao receber ACK persistido, ao esgotar tentativas, ao ocorrer `pagehide`/descarte da página e em qualquer saída terminal. Remover os listeners da imagem também quando vencer o timer de segurança. Conferir se uma nova imagem pode ser aguardada após o prazo; preservar o comportamento intencional sem deixar callbacks órfãos.
3. Todo callback que pode chegar depois do descarte deve testar o estado da instância antes de agendar timer, fazer fetch, desenhar canvas, enviar `IMAGE_READY_FROM_NEW_TAB` ou iniciar outra tentativa. Não há cancelamento garantido de `sendMessage` já enviado; o importante é impedir trabalho posterior e duplicação de entrega.
4. Preservar o contrato atual de ACK: sucesso exige `ok: true` e `persisted !== false`; ACK negativo permite retry dentro do limite. Não reduzir as tentativas nem mascarar falhas para tornar os testes verdes.

**Critério de aceite:** após sucesso, falha terminal ou descarte, não resta timer/interval/listener pertencente à instância, e callbacks tardios não iniciam nova ação. ACK positivo produz uma única entrega; ACK negativo mantém a política de retry prevista.

## 3. Adicionar quatro regressões específicas para o cleanup

Criar **quatro casos adicionais** em `tests/unit/content-manga/extraction-and-handlers-real.test.js` ou em arquivo de teste próximo. Eles são diferentes dos quatro testes adicionados anteriormente ao PR. Medir timers pendentes e remoção de listeners com spies controlados, restaurados em `afterEach`; usar fake timers apenas no escopo de cada caso e aguardar microtasks/callbacks relevantes.

1. **ACK confirmado:** iniciar extração de imagem pronta, confirmar persistência, avançar além da janela de retry e provar que não houve segunda entrega nem timer/listener remanescente.
2. **ACK rejeitado e depois confirmado:** forçar uma resposta negativa e uma positiva; provar que há exatamente um retry, que não se acumulam timers e que a limpeza ocorre após a confirmação.
3. **Descarte durante espera:** testar `pagehide` enquanto há mapeamento pendente ou enquanto a imagem ainda não existe; avançar o relógio e entregar callbacks tardios, exigindo nenhuma nova consulta/envio. Cobrir as duas variantes no mesmo caso com cenários parametrizados, se mantiver legibilidade.
4. **Imagem e timer de segurança:** iniciar com imagem incompleta, acionar o prazo de segurança e depois `load`/`error`; provar que interval e ambos os listeners foram removidos e que nenhum callback tardio duplica a extração. Verificar separadamente a saída normal por `load` se o fluxo de segurança tiver semântica distinta.

Executar cada arquivo alterado isoladamente durante o desenvolvimento, como pedido anteriormente. O CI executará a suíte completa após o push. Um teste que só compara quantidade de mensagens, sem observar recursos pendentes, não basta para este objetivo.

## 4. Fechar teardowns de RPA e clique individual

1. Em `tests/unit/content-gemini/rpa-flow.test.js`, auditar todos os helpers que iniciam `processGeminiJob()` e observers. Guardar e aguardar a Promise do runner em todas as saídas; desconectar observers próprios antes de limpar DOM; verificar ausência de callback tardio depois do `afterEach`. A proteção atual de `processPromise` é um ponto de partida, não uma prova global.
2. Em `tests/unit/content-manga/floating-button-guard-and-single-click.test.js`, identificar a instância que inicia `START_BATCH` e qualquer timer/listener associado. Esperar sua conclusão e descartar recursos antes de restaurar mocks e apagar DOM. O spy limpo em casos individuais deve continuar, mas o teardown precisa funcionar mesmo quando uma asserção falha.
3. Executar cada arquivo isolado e depois junto com a menor combinação que reproduzia o vazamento. Se esses arquivos não causarem o warning, registrar o resultado e continuar a investigação da etapa 1.

**Critério de aceite:** nenhum callback de um caso altera o mock, DOM ou contador do caso seguinte; a reprodução paralela identificada na etapa 1 desaparece por uma correção atribuível a recurso concreto.

## 5. Fazer o CI detectar regressão de worker

Depois de eliminar o warning, capturar a saída do **Jest completo** no job `Unit + Integration` para Node 20 e 22 e falhar o job caso apareça `A worker process has failed to exit gracefully`. Preservar o código de saída real de `npm run test:ci` ao usar `tee`/pipe e manter o relatório JSON/inventário. Os diagnósticos por grupos já presentes no workflow não cobrem o job completo.

Acrescentar um teste pequeno do script de gate com log sintético contendo o warning e outro sem ele, para verificar que o aviso falha e que um erro normal do Jest continua falhando. Não usar grep isolado cujo código de saída possa esconder a falha principal. Atualizar `docs/REGRESSOES_PR47.md` com o comando de reprodução e a evidência final.

**Critério de aceite:** logs com warning fazem o job falhar; logs limpos com testes aprovados passam. O `CI Gate` continua exigindo sucesso dos jobs dependentes; skipped/TODO, flaky e cobertura abaixo do piso continuam reprovados.

## 6. Atualizar o ruleset da `main` no GitHub

Esta etapa é uma operação de configuração externa ao PR. Fazer depois de verificar que o novo `CI Gate` conclui no SHA atual. Consultar o ruleset `23791606`, salvar o JSON integral e calcular um diff mínimo antes da atualização.

1. Na regra `required_status_checks`, remover os dois contextos obsoletos `Smoke + Visual + Unit Tests (20.x)` e `(22.x)`.
2. Adicionar o contexto exato `CI Gate`, associado ao aplicativo GitHub Actions quando a API exigir `integration_id`. Manter os demais checks ainda válidos, a política `strict_required_status_checks_policy` e todas as outras regras do ruleset, salvo decisão explícita baseada em evidência de redundância. Não apagar e recriar o ruleset.
3. Consultar novamente a API após a atualização e comparar todos os campos relevantes com o snapshot. Confirmar na UI do PR que não há check antigo em estado `Expected` e que `CI Gate` aparece como obrigatório.
4. Demonstrar a proteção: check ausente/falho bloqueia merge; check concluído com sucesso satisfaz a exigência correspondente. Considerar reviews e conversas pendentes separadamente, pois elas também podem bloquear merge. Se a configuração não produzir o resultado esperado, restaurar o JSON anterior e investigar o nome/contexto exibido pelo GitHub.

**Critério de aceite:** `main` exige o check real `CI Gate`, não espera os dois nomes antigos, e o PR #47 mostra o estado coerente com os checks executados. Registrar data, operador, snapshot e diff da alteração no relatório de execução.

## Ordem de entrega e evidência final

1. Reproduzir o worker, localizar o recurso e criar um teste que falhe antes da correção quando possível.
2. Corrigir extração e teardowns; rodar apenas os arquivos afetados localmente e a reprodução mínima paralela.
3. Confirmar Jest completo paralelo em Node 20/22 no CI sem warning; então ativar o gate que transforma warning em falha.
4. Atualizar documentação e enviar código/testes para a **mesma branch do PR #47**. Verificar SHA do commit, arquivos no diff e resultados de todos os jobs `push`/`pull_request` no GitHub.
5. Atualizar o ruleset da `main`, validar os checks obrigatórios no próprio PR e registrar o resultado. Não considerar a tarefa encerrada apenas porque a suíte serial passou ou porque o CI ficou verde enquanto emitia o warning.

Relatório de conclusão esperado: SHA enviado; lista dos quatro testes novos e o que falhavam antes; comando mínimo que reproduzia o worker; logs paralelos finais de Node 20/22 sem warning; resultado de inventário, cobertura, skipped/TODO e Playwright; diff antes/depois do ruleset; estado final do PR. Se qualquer item não for comprovado, marcar como pendente com a evidência disponível.


## Estado final verificado — 28/09/2026

As pendências deste plano foram encerradas com evidência no GitHub Actions. O head funcional validado foi `d940df4ddf982a7b45c423ba74901b993fc37f06`, run **#1355** (`36369097974`).

### Causa-raiz do worker Jest

O warning de worker forçado foi reduzido por delta debugging de 44 suítes de `background` até o par:

- `unit/background/process-finalize-real.test.js`
- `unit/background/regex-escape.test.js`

O par reproduziu o leak **4/4 vezes** com 3 workers; cada arquivo isolado ficava limpo. A causa concreta era um recurso assíncrono pertencente ao teste de `SHOW_EXISTING_FOLDER`: quando o fallback chegava a `handleMarkerAndShow()`, era criado `_anchor.png` e agendado cleanup por `setTimeout(..., 4000)`. O teardown de `regex-escape.test.js` não possuía/cancelava esse timer, permitindo que ele sobrevivesse ao caso e mantivesse um worker Jest vivo.

A correção passou a registrar esse timer no helper de ownership de timers do background e cancelá-lo no `afterEach` da suíte. O helper também preserva ownership dos delays já conhecidos de 600 ms e 18 s.

### Evidência pós-correção

No run #1327, depois da correção:

- `project-background`: **44/44 suítes, 221/221 testes, CLEAN**, sem worker forçado;
- bisection completo com `maxWorkers=3`: **2/2 execuções limpas**;
- Node 20 e Node 22: 108 suítes aprovadas, sem warning.

No run final #1355:

- evidência do run #1355 antes da regressão explícita do timer: Node 20 e Node 22 com **108/108 suítes, 847/847 testes**, skipped=0, TODO=0;
- baseline atual após `REG-WORKER-4S`: **108 suítes / mínimo de 848 testes**;
- nenhum `A worker process has failed to exit gracefully`;
- nenhum `--forceExit`;
- nenhuma conversão da suíte para `--runInBand`.

### Coverage

O piso crítico de `extension/gemini/job-runner.js` permaneceu em **64% branches**. Não houve redução de threshold.

Foram adicionadas regressões para guardas de dependência e caminhos de `tryClickModelImageCards()`. Resultado final:

- `job-runner.js`: **285/434 branches = 65,67%**;
- global: Statements **79,52%**, Branches **71,68%**, Functions **82,71%**, Lines **79,52%**;
- 56/56 arquivos de coverage esperados;
- **847/847 testes** no job de coverage daquele run; o baseline atual posterior exige 848;
- `Coverage Integrity`: aprovado.

### E2E

Playwright no run #1355:

- **21/21 passed**;
- skipped=0;
- flaky=0;
- failed=0;
- gate E2E aprovado;
- execução de aproximadamente 4,6 min.

### CI Gate e ruleset

O `CI Gate` do run #1355 terminou com sucesso e confirmou:

- Version Integrity = success;
- JS Syntax Check = success;
- Manifest Validation = success;
- CI Contract = success;
- Smoke Tests = success;
- Visual Tests = success;
- Unit + Integration = success;
- Code Coverage = success;
- E2E Tests = success.

O ruleset ativo da `main` (#23791606) está com `strict_required_status_checks_policy: true` e exige:

- `JS Syntax Check`;
- `Manifest Validation`;
- `E2E Tests (Playwright)`;
- `Code Coverage`;
- `CI Gate`.

Os nomes antigos de checks não são mais exigidos.

### Diagnósticos pesados

Os diagnósticos de leak foram preservados, mas movidos para `workflow_dispatch` depois da causa-raiz ser comprovada:

- `Jest Worker Diagnostic`;
- `Focused Project Leak`;
- `Background Leak Bisection`.

Eles não consomem runners em todo push/PR. A proteção permanente continua no `Unit + Integration`: se o warning de worker reaparecer, `run-jest-ci.js` reprova o job.

### Critérios de aceite

- [x] cleanup da extração auxiliar;
- [x] regressões de ACK/retry/pagehide/safety timeout;
- [x] teardown de RPA;
- [x] teardown de clique individual;
- [x] worker leak reproduzido e reduzido a um conjunto mínimo;
- [x] causa-raiz concreta identificada;
- [x] regressão/ownership do timer de 4 s adicionados;
- [x] Jest paralelo limpo em Node 20;
- [x] Jest paralelo limpo em Node 22;
- [x] skipped=0 e TODO=0;
- [x] coverage crítico sem redução de threshold;
- [x] E2E sem skipped/flaky/failure;
- [x] CI Gate verde;
- [x] ruleset da main alinhado ao workflow real;
- [x] diagnósticos pesados retirados da CI normal sem remover o gate permanente.


## Proteção adicional contra remoção futura de regressões

Depois do fechamento da causa-raiz, foi adicionada uma camada de conservação do conhecimento:

- `REG-WORKER-4S` testa diretamente ownership/cancelamento do timer de 4 s;
- `tests/ci/regression-matrix.json` registra as regressões críticas do PR;
- `verify-ci-contract.js` exige que os arquivos e marcadores desses testes permaneçam presentes;
- o baseline Jest passa a exigir **848 testes**;
- os diagnósticos pesados continuam restritos a `workflow_dispatch`.

Isso impede duas classes diferentes de regressão: o bug funcional voltar e o teste que o detecta ser removido silenciosamente.
