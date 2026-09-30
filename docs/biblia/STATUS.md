# Status — Bíblia técnica por arquivo

> Fonte de verdade do progresso. Desde a auditoria de qualidade de 2026-09-29, **CONCLUÍDO significa Bíblia materializada + auditoria aprovada**. Criar um arquivo não basta.

## Objetivo

Criar uma Bíblia independente para cada arquivo do corpus técnico, com fonte integral, análise contextual linha a linha, rastreabilidade conservadora de testes e uma auditoria separada que impeça falsos positivos de qualidade.

## Arquivos de controle

- `docs/biblia/STATUS.md` — estado operacional;
- `docs/biblia/CHECKLIST.md` — somente arquivos auditados/aprovados recebem `[x]`;
- `docs/biblia/AUDITORIA.md` — evidência e veredito da auditoria de qualidade;
- `docs/biblia/.reservas/` — ownership exclusivo por arquivo em modo multiagente;
- `docs/biblia/.coordination/` — mutexes curtos de bootstrap/progresso.

### Regra de ownership dos arquivos globais

> **STATUS.md não tem dono.** `STATUS.md`, `CHECKLIST.md`, `AUDITORIA.md` e o corpo do PR são estado compartilhado e não podem receber reserva/ownership individual. O `PROGRESS.lock.md` é somente um mutex temporário para serializar uma edição curta; possuir esse mutex não torna o agente proprietário de nenhum desses arquivos.

## Corpus congelado

- Base: `main` no início da reestruturação do PR #66.
- Total: **233 arquivos**.
- Inclui `extension/`, `tests/`, `scripts/`, `.github/workflows/` e configs canônicas da raiz.
- Exclui `package-lock.json`, binários, dependências, artefatos e documentação.

## Estados

- `⬜ PENDENTE`: Bíblia ainda não materializada.
- `🟠 EM ANDAMENTO — <AGENTE>`: arquivo reservado e sendo escrito/revisado por um único agente; vários arquivos distintos podem estar neste estado ao mesmo tempo.
- `🟣 REVISÃO DE QUALIDADE`: Bíblia existe, mas a auditoria encontrou falhas e ela não conta como concluída.
- `✅ CONCLUÍDO`: Bíblia existe **e** passou em `AUDITORIA.md`.
- `BLOQUEADO`: depende de evidência indisponível; o bloqueio deve ser descrito.

## Critério obrigatório de CONCLUÍDO

1. identidade/SHA/papel corretos;
2. fonte integral exata;
3. cobertura documental de 100% das linhas/posições;
4. dependências/consumidores/efeitos colaterais verdadeiros;
5. explicação específica, não template que apenas repete a linha;
6. o que faz, como faz, por que assim e risco de alternativa;
7. invariantes/casos-limite;
8. matriz de testes/gates baseada em assertions reais;
9. `⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO` onde não houver prova direta;
10. distinção entre prova direta, gate estático, execução indireta e ausência de prova;
11. referências numéricas de linha corretas;
12. aprovação explícita em `docs/biblia/AUDITORIA.md`.

## Progresso após auditoria de qualidade

- Total: **233**
- Bíblias materializadas: **98**
- ✅ Concluídos auditados: **75**
- 🟠 Em andamento: **0**
- 🟣 Aguardando revisão de qualidade: **0**
- ⬜ Ainda não materializados: **135**
- ⬜ Pendentes: **158**
- ⛔ Bloqueados: **0**
- Cobertura realmente aprovada: **32,19%**
- Cobertura apenas materializada: **42,06%**
- Último aprovado: `extension/popup/popup.js`
- Arquivos atualmente em andamento:

- Menor índice pendente sem reserva no momento desta atualização: `#033 extension/background/tab-identity.js`

## Observações técnicas para auditoria futura — #056 `extension/reader/reader.js`

> **Registro somente documental.** O #056 continua no estado atualmente aprovado; estas observações não alteram código, testes, Bíblia, CHECKLIST ou AUDITORIA. Elas registram lacunas de prova/robustez identificadas durante a análise para que um auditor futuro saiba exatamente o que confirmar.

### Principais achados/lacunas

1. **Virtualização: ciclo completo sem prova focal.** Há evidência de lazy-load, mas falta teste específico cobrindo `load → unload → reload`, inclusive preservação da altura do wrapper no unload.
2. **Falha de `SM_GET_PAGE`.** Falta teste probatório específico de erro e recuperação/retry quando o carregamento de uma página falha.
3. **Carregamento concorrente.** O estado `data-pending-src="loading"` aparenta impedir fetch duplicado enquanto existe `await`, mas falta teste focal que prove a invariância.
4. **Payload malformado de `SM_PAGE_INDEX`.** O fluxo verifica `(pageIndexResp.pages || []).length` e depois usa `.map`; o auditor deve testar o caso em que `pages` exista mas não seja array e confirmar se a implementação precisa de `Array.isArray`.
5. **Metadados ausentes com páginas existentes.** O reader pode exibir “Capítulo não encontrado” enquanto ainda há páginas recuperáveis do storage; o auditor deve decidir, com evidência, se isso é comportamento intencional ou inconsistência de UX/estado.
6. **Falhas de APIs do navegador.** Não foi localizada prova focal para exceção de acesso a `localStorage` nem para rejeição/erro da Fullscreen API.
7. **Fallback do contador.** Scroll/resize são coalescidos por `requestAnimationFrame`; falta teste focal garantindo que rajadas de eventos não causem trabalho redundante.
8. **`currentReadWidth` aparentemente sem consumo posterior.** O valor é escrito, mas não foi encontrado uso posterior no arquivo; confirmar se é estado morto ou contrato indireto.
9. **`loadedUrls = new Map()` aparentemente sem uso.** A estrutura é criada sem consumo observado; além disso, o comentário associado menciona `objectURL`, enquanto o fluxo observado trabalha com Data URLs. Confirmar se é legado morto ou se existe consumidor indireto não localizado.
10. **Lifecycle de observers/listeners.** Não há cleanup/disconnect explícito observado; o código aparenta depender do lifecycle da página. O auditor deve validar se essa dependência é aceitável e documentar a justificativa.
11. **Escala de DOM.** A memória das imagens é virtualizada, mas todos os wrappers permanecem no DOM; o custo estrutural continua O(N) no número de páginas. Avaliar capítulos muito grandes e registrar o risco/limite aceito.

### O que é necessário para fechar essas lacunas

- criar ou localizar testes focais que provem cada comportamento acima, sem promover mera execução indireta a prova;
- testar explicitamente payloads anômalos retornados pelo storage manager;
- provar descarregamento, preservação do layout e recarregamento posterior;
- provar comportamento de erro/retry e ausência de fetch duplicado;
- exercitar falhas reais/simuladas de `localStorage` e Fullscreen API;
- determinar com evidência se `currentReadWidth` e `loadedUrls` são código/estado morto;
- avaliar o custo de DOM para capítulos grandes e definir, se necessário, um limite ou invariante documentado.

### O que o auditor deve fazer no #056

1. Reabrir `extension/reader/reader.js` e reconfirmar o SHA antes de usar estas observações; se o SHA mudou, repetir a análise nas áreas afetadas.
2. Conferir as assertions reais em:
   - `tests/integration/reader.ui.test.js`;
   - `tests/unit/reader/keyboard-nav.test.js`;
   - `tests/unit/reader/page-counter.test.js`;
   - `tests/e2e/reader-offline.spec.js`.
3. Classificar cada item como **PROVA DIRETA EXISTENTE**, **PROVA INDIRETA**, **SEM TESTE PROBATÓRIO ESPECÍFICO** ou **NÃO APLICÁVEL**.
4. Não considerar a simples existência/execução de um teste como prova sem verificar a assertion correspondente.
5. Se uma lacuna reproduzir defeito real, registrar a correção em tarefa/PR funcional separado do PR #66 e exigir teste de regressão correspondente; não corrigir silenciosamente durante a auditoria documental.
6. Se o comportamento for intencional, registrar explicitamente motivo, invariante esperado, casos-limite e risco aceito.
7. Considerar uma lacuna encerrada somente quando houver evidência verificável do comportamento, e não apenas inspeção superficial.

## Observações técnicas para auditoria futura — #070 `scripts/ci/data/test-baseline.json`

> **Registro somente documental — AGENTE 7.** O #070 continua no estado atualmente aprovado/concluído. Esta seção não altera código, testes, Bíblia, CHECKLIST, AUDITORIA, PR, thresholds ou contadores; registra somente o que foi encontrado e o que um auditor futuro precisa confirmar.

### O que foi encontrado

1. **`coverage.measuredBaseline` aparenta ser somente informativo.** Os valores atuais `79.44 / 71.85 / 82.5 / 79.44` só foram encontrados no próprio `test-baseline.json`; não foi localizado consumidor automatizado que leia `measuredBaseline`.
2. **Há uma divergência de linguagem documental.** `docs/Documentação.md` descreve `test-baseline.json` como “contrato, não estatística informativa”, porém o subobjeto `measuredBaseline` não participa dos gates encontrados. O auditor deve tratar essa distinção explicitamente.
3. **Os valores E2E têm a evidência mais forte.** `playwright-gate-reporter-selftest.js` executa o reporter real, que importa este baseline real, e possui assertions que sustentam diretamente `e2e.minTests = 21`, `e2e.maxSkipped = 0` e `e2e.maxFlaky = 0`.
4. **Jest, visual, smoke e coverage usam o baseline real, mas isso não congela os números atuais.** O fato de `run-jest-ci.js`, `tests/visual/runner.js`, `tests/smoke/run-smoke.js` e `verify-coverage.js` lerem os campos prova que eles são operacionais; não prova, por si só, que reduzir os valores atuais será rejeitado.
5. **Falta proteção específica contra enfraquecimento de vários mínimos.** Não foi localizada assertion que fixe explicitamente `108` suítes Jest, `848` testes Jest, `224` testes visuais, `6` arquivos smoke nem os thresholds globais `78/71/80/78`.
6. **`coverage.minimum` e `coverage.criticalMinimum` possuem comportamento potencialmente fail-open.** `verify-coverage.js` usa fallbacks vazios quando esses objetos não existem; removê-los pode deixar de aplicar thresholds sem erro específico naquele verificador.
7. **A presença das cinco entradas de `criticalMinimum` não está protegida por um contrato focal.** O auditor deve confirmar que remover uma chave crítica é detectado por alguma assertion real; na análise do AGENTE 7 isso não ficou provado.
8. **Thresholds de coverage malformados merecem revisão.** No mínimo global, valores não numéricos podem ser ignorados; em thresholds críticos, conversões para `NaN` podem não gerar uma mensagem explícita de “baseline inválido”.
9. **`verify-ci-contract.js` valida apenas parte do shape.** Ele protege alguns `min*`, `coverage.minInstrumentedFiles` e `e2e.maxFlaky`, além da coerência do plano E2E, mas não demonstrou proteção completa dos thresholds globais/críticos atuais.
10. **`verify-coverage-selftest.js` usa baseline sintético.** Ele prova a mecânica do verificador com thresholds artificiais, mas não deve ser citado como prova direta dos valores reais deste arquivo sem uma assertion que use esses valores.

### O que é necessário verificar

- confirmar novamente todos os consumidores reais de `test-baseline.json` e quais campos cada um efetivamente lê;
- confirmar por busca independente se `measuredBaseline` continua sem consumidor automatizado;
- verificar se os valores exatos de Jest, visual, smoke e coverage possuem algum teste anti-redução que não tenha sido localizado;
- testar explicitamente remoção de `coverage.minimum`, remoção de `coverage.criticalMinimum` e remoção de uma única entrada crítica;
- testar thresholds não numéricos, negativos, `null`, ausentes e percentuais fora do domínio esperado;
- distinguir “o gate usa este valor” de “uma assertion impede que este valor seja enfraquecido”;
- decidir se `measuredBaseline` deve permanecer como snapshot humano, ser validado automaticamente ou ter sua descrição arquitetural ajustada;
- confirmar que qualquer eventual mudança de política de thresholds tenha justificativa baseada no corpus/testes atuais, e não apenas em fazer a CI passar.

### O que o auditor deve fazer no #070

1. Reabrir `scripts/ci/data/test-baseline.json` e reconfirmar o SHA antes de usar estas observações.
2. Abrir e ler as assertions reais de:
   - `scripts/validation/playwright-gate-reporter-selftest.js`;
   - `scripts/validation/verify-coverage-selftest.js`;
   - `scripts/validation/verify-ci-contract-selftest.js`;
   - `scripts/ci/run-jest-ci.js`;
   - `tests/visual/runner.js`;
   - `tests/smoke/run-smoke.js`;
   - `scripts/validation/verify-e2e-shard-plan.js`;
   - `scripts/validation/verify-coverage.js`;
   - `scripts/validation/verify-ci-contract.js`.
3. Para cada campo do JSON, classificar a evidência como **PROVA DIRETA**, **GATE ESTÁTICO**, **EXECUÇÃO INDIRETA** ou **SEM TESTE PROBATÓRIO ESPECÍFICO**.
4. Não promover mera leitura/uso do campo a prova de que o valor numérico atual está protegido contra redução.
5. Confirmar especificamente se `measuredBaseline` é intencionalmente informativo. Se for, registrar isso explicitamente; se deveria ser operacional, exigir um teste/gate que realmente o consuma.
6. Confirmar se `minimum` e `criticalMinimum` podem desaparecer sem falha explícita. Se sim, registrar a fragilidade e exigir teste de regressão em tarefa/PR funcional separado.
7. Confirmar se todas as cinco chaves críticas e seus quatro thresholds possuem proteção de schema/anti-enfraquecimento suficiente.
8. Se alguma fragilidade for reproduzida, **não corrigir silenciosamente durante a auditoria documental**: registrar a evidência, abrir correção funcional separada e exigir teste que falhe antes da correção e passe depois.
9. Considerar a lacuna encerrada somente com assertion verificável; inspeção visual ou ocorrência textual não basta.


## Observações técnicas para auditoria futura — #074 `scripts/ci/run-e2e-group.js`

> **Registro documental do AGENTE 2.** A Bíblia está concluída e aprovada quanto à qualidade documental. As solicitações abaixo permanecem `OPEN` em `.state/074.json` e não bloqueiam a conclusão.

### O que foi encontrado

1. **Falta teste focal do runner.** Não foi localizada suíte que execute a implementação real com `child_process.spawn` controlado e verifique argv, cwd, ambiente, `stdio`, `shell:false`, branches de erro e propagação do exit code.
2. **Execução local e CI não têm exatamente a mesma semântica.** O runner seta `MANGA_E2E_SHARD=1` e `MANGA_E2E_WORKERS`, mas `playwright.config.js` só aplica workers do plano e blob reporter quando `CI` é truthy.
3. **O caminho do CLI está acoplado ao layout instalado.** O arquivo usa diretamente `node_modules/playwright/cli.js`, apesar de a dependência declarada ser `@playwright/test`.
4. **Leitura/parse do plano não possui tratamento próprio.** Plano ausente/JSON inválido gera falha genérica; este runner valida somente grupo e workers, deixando tag/contagens/estimativas para o gate externo.

### O que é necessário provar

- grupo vazio/inexistente → código 2 e diagnóstico correto;
- workers inválidos → código 2;
- argv completo do Playwright, cwd, env, `stdio: inherit` e `shell: false`;
- `spawn error` → código 1;
- `close(0)`, `close(n)` e `close(null)`;
- contrato deliberado da diferença entre execução local e CI;
- resolução válida do CLI após `npm ci`;
- comportamento com plano ausente ou JSON malformado.

### O que o auditor deve fazer no #074

1. Reconfirmar o SHA `e23c7aaa17123e63904799c1b366c48e344ed82a`.
2. Ler `run-e2e-group.js`, `playwright.config.js`, `e2e-shard-plan.json`, `verify-e2e-shard-plan.js`, `verify-ci-contract.js`, `package.json` e o job E2E de `ci.yml`.
3. Não confundir a prova direta da **partição do plano** com prova direta do **runner**.
4. Confirmar se a diferença local×CI é intencional e registrar a decisão.
5. Confirmar se o caminho direto para `playwright/cli.js` é contrato aceitável após `npm ci`.
6. Se a auditoria exigir cobertura focal, criar teste isolado/sandbox da implementação real; não copiar a lógica e chamar isso de prova.
7. Manter as solicitações `074-001` a `074-004` abertas até haver evidência específica ou decisão explícita de risco aceito.

## Observações técnicas para auditoria futura — #075 `scripts/ci/run-jest-ci.js`

> **Registro somente documental pelo AGENTE 5.** Nenhum código funcional, teste, Bíblia, CHECKLIST, AUDITORIA, reserva ou descrição do PR foi alterado por esta observação. O objetivo é deixar para o auditor o que foi encontrado no arquivo, o que ainda precisa ser provado e quais verificações devem ser feitas antes de qualquer aprovação.

### O que encontrei

1. **O runner executa o Jest real e depois valida o inventário.** Ele monta `.ci-results/jest-results.json`, executa `node_modules/jest/bin/jest.js` com `--ci --json --outputFile` e reprova se o processo termina com status diferente de zero, se o relatório contém falhas, se faltam arquivos de teste ou se os pisos do baseline não são atingidos.
2. **A partição unit/integration é verificada dinamicamente no modo normal.** Quando não está em `--coverage`, o script chama Jest com `--listTests --json --selectProjects`, compara unitários e integração, rejeita overlap, arquivos ausentes, arquivos inesperados e projetos descobrindo testes fora de `tests/unit/` ou `tests/integration/`.
3. **O runner também protege o contrato de `package.json`.** No modo normal ele exige que `test:unit` e `test:integration` sejam exatamente os comandos canônicos esperados.
4. **Worker leak é tratado como falha mesmo quando Jest retorna zero.** O stderr é capturado e passado a `hasForcedWorkerExit(jestStderr)`; o literal atual vem de `scripts/ci/jest-worker-warning.js`.
5. **O baseline é realmente bloqueante.** O runner usa `test-baseline.json` para exigir pelo menos 108 suítes, 848 testes, zero skipped e zero TODO.
6. **Coverage usa o mesmo runner, mas com comportamento diferente.** `--coverage` injeta `COVERAGE_MODE=1`, adiciona `--coverage` e `--maxWorkers=2`. Nesse caminho a prova explícita da partição unit/integration e a checagem dos scripts npm são puladas, embora o relatório final ainda seja comparado com o inventário de arquivos `.test.js`.
7. **Não localizei self-test focal do próprio `run-jest-ci.js`.** O arquivo é executado de verdade por `npm run test:ci` e `npm run test:coverage`, e `verify-ci-contract.js` protege alguns marcadores por inspeção estática, mas isso não equivale a testes negativos exercitando cada branch do runner.
8. **A leitura do JSON de resultados não está dentro de try/catch.** Se `jest-results.json` existir mas estiver truncado ou malformado, `JSON.parse` aborta o processo com exceção não tratada. Isso é fail-closed, mas falta prova de que o diagnóstico produzido é o desejado.
9. **A remoção do resultado anterior ignora erro.** O trecho `try { fs.rmSync(resultFile, { force: true }); } catch (_error) {}` suprime qualquer falha ao limpar `jest-results.json`. É necessário provar que um arquivo stale nunca pode ser aceito como resultado da execução atual em uma combinação anômala de falha de limpeza/escrita.
10. **Não há timeout no `spawnSync` que executa Jest.** Nos jobs `unit-and-integration` e `coverage` também não foi localizado `timeout-minutes` específico no workflow. Um hang pode, portanto, depender do limite externo do GitHub Actions em vez de uma política explícita do runner.
11. **A detecção de worker forçado depende de texto literal em inglês.** O self-test de `jest-worker-warning.js` prova o literal atual, mas uma mudança futura na mensagem do Jest pode fazer o detector deixar de reconhecer o mesmo problema sem que o comportamento do runner tenha mudado.
12. **O inventário esperado considera somente `*.test.js`.** O `walk()` percorre `tests/unit` e `tests/integration`, mas filtra apenas arquivos terminados em `.test.js`. O auditor deve confirmar se excluir `.spec.js` ou outros padrões é uma decisão canônica e protegida em outro gate.
13. **No modo coverage há uma assimetria adicional.** O relatório garante que todos os `.test.js` esperados foram executados, porém a checagem `unexpectedInPartition` só existe na prova de partição do modo normal. O auditor deve verificar se um teste inesperado fora do inventário poderia entrar no coverage sem ser explicitamente rejeitado por este runner.
14. **A estratégia de saída é deliberadamente não imediata.** Em caso de problemas, usa `process.exitCode = 1` em vez de `process.exit(1)` para evitar perder o fim do stderr/log no GitHub Actions. Isso parece intencional e coerente com o comentário, mas precisa ser classificado com a força de evidência correta.

### O que é necessário verificar/provar

- provar o caminho normal completo com sucesso, incluindo inventário, partição unit/integration e correspondência dos scripts npm;
- provar falha por overlap entre unit e integration;
- provar falha por arquivo `.test.js` ausente da partição;
- provar falha por arquivo inesperado incluído na partição;
- provar falha quando unit descobre algo fora de `tests/unit/` e integration fora de `tests/integration/`;
- provar os pisos de suítes/testes e os limites zero para skipped/TODO;
- provar que `report.success === false`, `numFailedTests` e `numFailedTestSuites` realmente tornam o runner vermelho;
- provar que warning de worker forçado reprova uma execução cujo status Jest seja zero;
- provar o comportamento quando o Jest não cria `jest-results.json`;
- provar o comportamento quando o JSON de resultado existe, mas é inválido/truncado;
- testar explicitamente a falha de remoção do arquivo de resultado anterior e descartar possibilidade de resultado stale ser aceito;
- testar `spawnSync` com `run.error`, status não zero, status nulo/sinal e stderr grande;
- decidir se o runner precisa de timeout próprio ou se o timeout deve existir no workflow, e documentar a política escolhida;
- validar separadamente o modo `--coverage`, inclusive `COVERAGE_MODE=1`, `--maxWorkers=2`, inventário completo e a ausência deliberada da prova de partição nesse modo;
- confirmar se o padrão oficial de testes é exclusivamente `.test.js`; se for, localizar o gate que impede introdução silenciosa de `.spec.js`; se não for, registrar a lacuna;
- verificar se a dependência do literal de worker warning precisa de teste de compatibilidade ou estratégia menos frágil.

### O que preciso que o auditor faça no #075

1. Reabrir `scripts/ci/run-jest-ci.js` e reconfirmar o SHA `6d2e36a647aadeadb2b875c1b3f92df24cd2f494` antes de usar estas observações. Se o SHA mudou, reanalisar os trechos afetados.
2. Ler as implementações reais de `jest.config.js`, `scripts/ci/data/test-baseline.json`, `scripts/ci/jest-worker-warning.js`, `package.json`, `.github/workflows/ci.yml` e `scripts/validation/verify-ci-contract.js`; não aceitar apenas referência textual.
3. Conferir o self-test `scripts/validation/verify-jest-worker-warning-selftest.js` e limitar sua conclusão ao que as três assertions realmente provam.
4. Localizar qualquer teste/self-test adicional do runner. Se não existir, classificar os branches acima como `⚠️ SEM TESTE PROBATÓRIO ESPECÍFICO`, mesmo que a CI execute o runner normalmente.
5. Diferenciar claramente:
   - execução real do runner pela CI;
   - gate estático de `verify-ci-contract.js`;
   - prova direta de um branch específico;
   - simples presença de string/código;
   - lacunas sem teste focal.
6. Criar, se a auditoria exigir prova, um self-test isolado que execute o runner em sandbox com Jest/relatório controlados e cubra sucesso e falhas negativas; não simular a lógica copiando-a manualmente e chamar isso de teste da implementação real.
7. Dar atenção especial a quatro pontos antes de aprovar: **resultado stale**, **JSON malformado**, **ausência de timeout** e **assimetria do modo coverage**.
8. Se alguma dessas lacunas revelar defeito funcional real, registrar correção em mudança funcional separada e exigir regressão correspondente; não corrigir silenciosamente durante a auditoria documental.
9. Só considerar o #075 documentalmente aprovado quando a Bíblia distinguir corretamente o que está diretamente provado, o que é gate estático, o que é execução indireta e o que continua sem teste probatório específico.


### Solicitações abertas do #067

- `067-001` — falta teste focal do controlador de recuperação.
- `067-002` — revisar revalidação do HEAD do PR antes do rerun.
- `067-003` — revisar tratamento de falhas transitórias da API.

## Auditoria de 2026-09-29

A auditoria rebaixou os arquivos que estavam marcados como concluídos sem satisfazer o padrão atual. Isso não apaga o trabalho já produzido; significa que essas Bíblias precisam ser corrigidas antes de receber `[x]` novamente.

### Aprovados

1. ✅ `extension/manifest.json`
2. ✅ `extension/background.js`
3. ✅ `extension/background/actions/calculate-visual-fingerprint.js`
4. ✅ `extension/background/actions/check-extraction-tab.js`
5. ✅ `extension/background/actions/claim-gemini-job.js`
6. ✅ `extension/background/actions/commit-result.js`
7. ✅ `extension/background/actions/deliver-result-from-tab.js`
8. ✅ `extension/background/actions/deliver-result-url.js`
9. ✅ `extension/background/actions/deliver-result.js`
10. ✅ `extension/background/actions/download-chapter.js`
11. ✅ `extension/background/actions/download-image.js`
12. ✅ `extension/background/actions/export-all.js`
13. ✅ `extension/background/actions/fetch-image-base64.js`
14. ✅ `extension/background/actions/force-send-activation.js`
15. ✅ `extension/background/actions/get-tab-id.js`
16. ✅ `extension/background/actions/log-entry.js`
17. ✅ `extension/background/actions/open-existing-folder.js`
18. ✅ `extension/background/actions/open-manga-root.js`
19. ✅ `extension/background/actions/refresh-job-watchdog.js`
20. ✅ `extension/background/actions/relay-progress.js`
21. ✅ `extension/background/actions/report-error.js`
22. ✅ `extension/background/actions/request-image-data.js`
23. ✅ `extension/background/actions/set-debug-mode.js`
24. ✅ `extension/background/actions/start-batch.js`
25. ✅ `extension/background/actions/stop-batch.js`
26. ✅ `extension/background/jobs-dom-ack.js`
27. ✅ `extension/background/jobs-lifecycle.js`
28. ✅ `extension/background/jobs-reconciliation.js`
29. ✅ `extension/background/jobs-watchdog.js`
30. ✅ `extension/background/log.js`
31. ✅ `extension/background/router.js`
32. ✅ `extension/background/state.js`
34. ✅ `extension/content/cm-auto-restore.js`
35. ✅ `extension/content/cm-chapter.js`
36. ✅ `extension/content/cm-dom-replace.js`
37. ✅ `extension/content/cm-gtc-client.js`
38. ✅ `extension/content/content_gemini.js`
39. ✅ `extension/content/gemini/attachment.js`
40. ✅ `extension/content/content_manga.js`
41. ✅ `extension/content/gemini/dom.js`
42. ✅ `extension/content/gemini/result-extractor.js`
43. ✅ `extension/content/gemini/temporary-chat.js`
44. ✅ `extension/content/gemini/image-quarantine.js`
45. ✅ `extension/content/gemini/job-runner.js`
46. ✅ `extension/content/inject.js`
47. ✅ `extension/reader/reader.js`
48. ✅ `extension/shared/gtc-fingerprint.js`
49. ✅ `extension/shared/gtc-indexeddb.js`
50. ✅ `extension/shared/shared-ui.js`
51. ✅ `.gitignore`
52. ✅ `jest.config.js`
54. ✅ `scripts/ci/data/e2e-shard-plan.json`

55. ✅ `scripts/ci/data/test-baseline.json`
56. ✅ `playwright.config.js`
57. ✅ `.github/workflows/ci.yml`
58. ✅ `package.json`
59. ✅ `.github/workflows/recover-cancelled-ci.yml`
60. ✅ `extension/popup/popup.html`

### Revisão obrigatória

Nenhuma. As seis revisões obrigatórias foram concluídas; a produção normal avançou até `extension/content/content_manga.js`.

Detalhes e provas: `docs/biblia/AUDITORIA.md`.

## Fila

| # | Estado | Arquivo | SHA-base | Bíblia individual |
|---:|---|---|---|---|
| 1 | ✅ CONCLUÍDO | `extension/manifest.json` | `841fe70c1833` | `docs/biblia/extension/manifest.json/Bíblia.md` |
| 2 | ✅ CONCLUÍDO | `extension/background.js` | `667c05eb2d7a` | `docs/biblia/extension/background.js/Bíblia.md` |
| 3 | ✅ CONCLUÍDO | `extension/background/actions/calculate-visual-fingerprint.js` | `ea474845cf9c` | `docs/biblia/extension/background/actions/calculate-visual-fingerprint.js/Bíblia.md` |
| 4 | ✅ CONCLUÍDO | `extension/background/actions/check-extraction-tab.js` | `9ee40474d8c5` | `docs/biblia/extension/background/actions/check-extraction-tab.js/Bíblia.md` |
| 5 | ✅ CONCLUÍDO | `extension/background/actions/claim-gemini-job.js` | `f5c4643d2919` | `docs/biblia/extension/background/actions/claim-gemini-job.js/Bíblia.md` |
| 6 | ✅ CONCLUÍDO | `extension/background/actions/commit-result.js` | `32270d1c4ade` | `docs/biblia/extension/background/actions/commit-result.js/Bíblia.md` |
| 7 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result-from-tab.js` | `59543c135966` | `docs/biblia/extension/background/actions/deliver-result-from-tab.js/Bíblia.md` |
| 8 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result-url.js` | `91c50efe4764` | `docs/biblia/extension/background/actions/deliver-result-url.js/Bíblia.md` |
| 9 | ✅ CONCLUÍDO | `extension/background/actions/deliver-result.js` | `3653bd10c2a0` | `docs/biblia/extension/background/actions/deliver-result.js/Bíblia.md` |
| 10 | ✅ CONCLUÍDO | `extension/background/actions/download-chapter.js` | `8636a03c8a20` | `docs/biblia/extension/background/actions/download-chapter.js/Bíblia.md` |
| 11 | ✅ CONCLUÍDO | `extension/background/actions/download-image.js` | `408102f057ab` | `docs/biblia/extension/background/actions/download-image.js/Bíblia.md` |
| 12 | ✅ CONCLUÍDO | `extension/background/actions/export-all.js` | `6160a220094d` | `docs/biblia/extension/background/actions/export-all.js/Bíblia.md` |
| 13 | ✅ CONCLUÍDO | `extension/background/actions/fetch-image-base64.js` | `4a4825c36fdb` | `docs/biblia/extension/background/actions/fetch-image-base64.js/Bíblia.md` |
| 14 | ✅ CONCLUÍDO | `extension/background/actions/force-send-activation.js` | `cbeea5768301` | `docs/biblia/extension/background/actions/force-send-activation.js/Bíblia.md` |
| 15 | ✅ CONCLUÍDO | `extension/background/actions/get-tab-id.js` | `2f3b26304ac1` | `docs/biblia/extension/background/actions/get-tab-id.js/Bíblia.md` |
| 16 | ✅ CONCLUÍDO | `extension/background/actions/log-entry.js` | `d57e1a25531b` | `docs/biblia/extension/background/actions/log-entry.js/Bíblia.md` |
| 17 | ✅ CONCLUÍDO | `extension/background/actions/open-existing-folder.js` | `59ef82cbf960` | `docs/biblia/extension/background/actions/open-existing-folder.js/Bíblia.md` |
| 18 | ✅ CONCLUÍDO | `extension/background/actions/open-manga-root.js` | `71c83df253cd` | `docs/biblia/extension/background/actions/open-manga-root.js/Bíblia.md` |
| 19 | ✅ CONCLUÍDO | `extension/background/actions/refresh-job-watchdog.js` | `25f86a8dba57` | `docs/biblia/extension/background/actions/refresh-job-watchdog.js/Bíblia.md` |
| 20 | ✅ CONCLUÍDO | `extension/background/actions/relay-progress.js` | `24e377893c71` | `docs/biblia/extension/background/actions/relay-progress.js/Bíblia.md` |
| 21 | ✅ CONCLUÍDO | `extension/background/actions/report-error.js` | `ac239ea49544` | `docs/biblia/extension/background/actions/report-error.js/Bíblia.md` |
| 22 | ✅ CONCLUÍDO | `extension/background/actions/request-image-data.js` | `249126232396` | `docs/biblia/extension/background/actions/request-image-data.js/Bíblia.md` |
| 23 | ✅ CONCLUÍDO | `extension/background/actions/set-debug-mode.js` | `92e4149b1bba` | `docs/biblia/extension/background/actions/set-debug-mode.js/Bíblia.md` |
| 24 | ✅ CONCLUÍDO | `extension/background/actions/start-batch.js` | `b0ef70bf1c23` | `docs/biblia/extension/background/actions/start-batch.js/Bíblia.md` |
| 25 | ✅ CONCLUÍDO | `extension/background/actions/stop-batch.js` | `e552d0a91109` | `docs/biblia/extension/background/actions/stop-batch.js/Bíblia.md` |
| 26 | ✅ CONCLUÍDO | `extension/background/jobs-dom-ack.js` | `07b4197a206f` | `docs/biblia/extension/background/jobs-dom-ack.js/Bíblia.md` |
| 27 | ✅ CONCLUÍDO | `extension/background/jobs-lifecycle.js` | `e4ab9f6c5472` | `docs/biblia/extension/background/jobs-lifecycle.js/Bíblia.md` |
| 28 | ✅ CONCLUÍDO | `extension/background/jobs-reconciliation.js` | `f0f2370ba6b7` | `docs/biblia/extension/background/jobs-reconciliation.js/Bíblia.md` |
| 29 | ✅ CONCLUÍDO | `extension/background/jobs-watchdog.js` | `c17b766d7fbc` | `docs/biblia/extension/background/jobs-watchdog.js/Bíblia.md` |
| 30 | ✅ CONCLUÍDO | `extension/background/log.js` | `86d5f2f1229b` | `docs/biblia/extension/background/log.js/Bíblia.md` |
| 31 | ✅ CONCLUÍDO | `extension/background/router.js` | `d9278e9e58e4` | `docs/biblia/extension/background/router.js/Bíblia.md` |
| 32 | ✅ CONCLUÍDO | `extension/background/state.js` | `7570b545d5e9` | `docs/biblia/extension/background/state.js/Bíblia.md` |
| 33 | ⬜ PENDENTE | `extension/background/tab-identity.js` | `008c9a054ae4` | `docs/biblia/extension/background/tab-identity.js/Bíblia.md` |
| 34 | ✅ CONCLUÍDO | `extension/content/cm-auto-restore.js` | `d20e7092652e` | `docs/biblia/extension/content/cm-auto-restore.js/Bíblia.md` |
| 35 | ✅ CONCLUÍDO | `extension/content/cm-chapter.js` | `44b621d570b6` | `docs/biblia/extension/content/cm-chapter.js/Bíblia.md` |
| 36 | ✅ CONCLUÍDO | `extension/content/cm-dom-replace.js` | `d3fc72032dbd` | `docs/biblia/extension/content/cm-dom-replace.js/Bíblia.md` |
| 37 | ✅ CONCLUÍDO | `extension/content/cm-gtc-client.js` | `95d062f41b9f` | `docs/biblia/extension/content/cm-gtc-client.js/Bíblia.md` |
| 38 | ✅ CONCLUÍDO | `extension/content/content_gemini.js` | `55bc83afe31a` | `docs/biblia/extension/content/content_gemini.js/Bíblia.md` |
| 39 | ✅ CONCLUÍDO | `extension/content/content_manga.js` | `a8b3698019f6` | `docs/biblia/extension/content/content_manga.js/Bíblia.md` |
| 40 | ✅ CONCLUÍDO | `extension/content/gemini/attachment.js` | `50092e4d7d71` | `docs/biblia/extension/content/gemini/attachment.js/Bíblia.md` |
| 41 | ✅ CONCLUÍDO | `extension/content/gemini/deletion.js` | `2cec17f19e52` | `docs/biblia/extension/content/gemini/deletion.js/Bíblia.md` |
| 42 | ✅ CONCLUÍDO | `extension/content/gemini/dom.js` | `d3694ea70cdd` | `docs/biblia/extension/content/gemini/dom.js/Bíblia.md` |
| 43 | ✅ CONCLUÍDO | `extension/content/gemini/editor.js` | `0adbd4374758` | `docs/biblia/extension/content/gemini/editor.js/Bíblia.md` |
| 44 | ✅ CONCLUÍDO | `extension/content/gemini/image-quarantine.js` | `ddca93d17ca2` | `docs/biblia/extension/content/gemini/image-quarantine.js/Bíblia.md` |
| 45 | ✅ CONCLUÍDO | `extension/content/gemini/job-runner.js` | `1b16fd656e82` | `docs/biblia/extension/content/gemini/job-runner.js/Bíblia.md` |
| 46 | ✅ CONCLUÍDO | `extension/content/gemini/observer.js` | `59c5335e1b4f` | `docs/biblia/extension/content/gemini/observer.js/Bíblia.md` |
| 47 | ✅ CONCLUÍDO | `extension/content/gemini/result-extractor.js` | `a3efd499a0b0` | `docs/biblia/extension/content/gemini/result-extractor.js/Bíblia.md` |
| 48 | ✅ CONCLUÍDO | `extension/content/gemini/selectors.js` | `0bf8db6e416a` | `docs/biblia/extension/content/gemini/selectors.js/Bíblia.md` |
| 49 | ✅ CONCLUÍDO | `extension/content/gemini/temporary-chat.js` | `40fbc8dc6acf` | `docs/biblia/extension/content/gemini/temporary-chat.js/Bíblia.md` |
| 50 | ✅ CONCLUÍDO | `extension/content/inject.js` | `21f7f6cf9c94` | `docs/biblia/extension/content/inject.js/Bíblia.md` |
| 51 | ✅ CONCLUÍDO | `extension/options/options.html` | `3ca95e66641d` | `docs/biblia/extension/options/options.html/Bíblia.md` |
| 52 | ✅ CONCLUÍDO | `extension/options/options.js` | `f69f132c0ef6` | `docs/biblia/extension/options/options.js/Bíblia.md` |
| 53 | ✅ CONCLUÍDO | `extension/popup/popup.html` | `05972d0fa116` | `docs/biblia/extension/popup/popup.html/Bíblia.md` |
| 54 | ✅ CONCLUÍDO | `extension/popup/popup.js` | `300cfe9a9c81` | `docs/biblia/extension/popup/popup.js/Bíblia.md` |
| 55 | ✅ CONCLUÍDO | `extension/reader/reader.html` | `065fc4e201c5` | `docs/biblia/extension/reader/reader.html/Bíblia.md` |
| 56 | ✅ CONCLUÍDO | `extension/reader/reader.js` | `490bbb184234` | `docs/biblia/extension/reader/reader.js/Bíblia.md` |
| 57 | ✅ CONCLUÍDO | `extension/shared/gtc-fingerprint.js` | `fa014028d5e2` | `docs/biblia/extension/shared/gtc-fingerprint.js/Bíblia.md` |
| 58 | ✅ CONCLUÍDO | `extension/shared/gtc-indexeddb.js` | `0c872f23a665` | `docs/biblia/extension/shared/gtc-indexeddb.js/Bíblia.md` |
| 59 | ✅ CONCLUÍDO | `extension/shared/shared-ui.js` | `b284fb8eb0e8` | `docs/biblia/extension/shared/shared-ui.js/Bíblia.md` |
| 60 | ✅ CONCLUÍDO | `extension/shared/storage-manager.js` | `d1cd5a2c83ed` | `docs/biblia/extension/shared/storage-manager.js/Bíblia.md` |
| 61 | ✅ CONCLUÍDO | `.gitignore` | `e48fc70b1acc` | `docs/biblia/.gitignore/Bíblia.md` |
| 62 | ✅ CONCLUÍDO | `jest.config.js` | `f0b7c55a5c8c` | `docs/biblia/jest.config.js/Bíblia.md` |
| 63 | ✅ CONCLUÍDO | `package.json` | `33e0b91d1a6f` | `docs/biblia/package.json/Bíblia.md` |
| 64 | ✅ CONCLUÍDO | `playwright.config.js` | `6a27b774a000` | `docs/biblia/playwright.config.js/Bíblia.md` |
| 65 | ✅ CONCLUÍDO | `.github/workflows/ci.yml` | `ebee75820db9` | `docs/biblia/.github/workflows/ci.yml/Bíblia.md` |
| 66 | ⬜ PENDENTE | `.github/workflows/publish.yml` | `f673d445a3cc` | `docs/biblia/.github/workflows/publish.yml/Bíblia.md` |
| 67 | ✅ CONCLUÍDO | `.github/workflows/recover-cancelled-ci.yml` | `4809f824f177` | `docs/biblia/.github/workflows/recover-cancelled-ci.yml/Bíblia.md` |
| 68 | ✅ CONCLUÍDO | `scripts/ci/data/e2e-shard-plan.json` | `22e8c20df9f4` | `docs/biblia/scripts/ci/data/e2e-shard-plan.json/Bíblia.md` |
| 69 | ✅ CONCLUÍDO | `scripts/ci/data/regression-matrix.json` | `f9b9e17e5870` | `docs/biblia/scripts/ci/data/regression-matrix.json/Bíblia.md` |
| 70 | ✅ CONCLUÍDO | `scripts/ci/data/test-baseline.json` | `52a4b3c1500d` | `docs/biblia/scripts/ci/data/test-baseline.json/Bíblia.md` |
| 71 | ✅ CONCLUÍDO | `scripts/ci/jest-worker-warning.js` | `b1379b6811e5` | `docs/biblia/scripts/ci/jest-worker-warning.js/Bíblia.md` |
| 72 | ✅ CONCLUÍDO | `scripts/ci/playwright-gate-reporter.js` | `71fb92c1215a` | `docs/biblia/scripts/ci/playwright-gate-reporter.js/Bíblia.md` |
| 73 | ✅ CONCLUÍDO | `scripts/ci/playwright-merge.config.js` | `59839922aca9` | `docs/biblia/scripts/ci/playwright-merge.config.js/Bíblia.md` |
| 74 | ✅ CONCLUÍDO | `scripts/ci/run-e2e-group.js` | `e23c7aaa1712` | `docs/biblia/scripts/ci/run-e2e-group.js/Bíblia.md` |
| 75 | ✅ CONCLUÍDO | `scripts/ci/run-jest-ci.js` | `6d2e36a647aa` | `docs/biblia/scripts/ci/run-jest-ci.js/Bíblia.md` |
| 76 | ✅ CONCLUÍDO | `scripts/maintenance/diagnose-background-leak.js` | `6b5a15d0d255` | `docs/biblia/scripts/maintenance/diagnose-background-leak.js/Bíblia.md` |
| 77 | ✅ CONCLUÍDO | `scripts/maintenance/diagnose-jest-workers.js` | `87d25d2b61cc` | `docs/biblia/scripts/maintenance/diagnose-jest-workers.js/Bíblia.md` |
| 78 | ⬜ PENDENTE | `scripts/release/sync-version.js` | `9bc8fa5ae3fb` | `docs/biblia/scripts/release/sync-version.js/Bíblia.md` |
| 79 | ⬜ PENDENTE | `scripts/validation/check-js-syntax.js` | `fbc69cf9f910` | `docs/biblia/scripts/validation/check-js-syntax.js/Bíblia.md` |
| 80 | ⬜ PENDENTE | `scripts/validation/playwright-gate-reporter-selftest.js` | `478d6673dbb6` | `docs/biblia/scripts/validation/playwright-gate-reporter-selftest.js/Bíblia.md` |
| 81 | ⬜ PENDENTE | `scripts/validation/validate-manifest.js` | `93dbb1882c69` | `docs/biblia/scripts/validation/validate-manifest.js/Bíblia.md` |
| 82 | ⬜ PENDENTE | `scripts/validation/verify-ci-contract-selftest.js` | `8d34dee0d632` | `docs/biblia/scripts/validation/verify-ci-contract-selftest.js/Bíblia.md` |
| 83 | ⬜ PENDENTE | `scripts/validation/verify-ci-contract.js` | `636e4bfbaa06` | `docs/biblia/scripts/validation/verify-ci-contract.js/Bíblia.md` |
| 84 | ⬜ PENDENTE | `scripts/validation/verify-coverage-selftest.js` | `ac08dd661f2d` | `docs/biblia/scripts/validation/verify-coverage-selftest.js/Bíblia.md` |
| 85 | ⬜ PENDENTE | `scripts/validation/verify-coverage.js` | `45f920bd2db5` | `docs/biblia/scripts/validation/verify-coverage.js/Bíblia.md` |
| 86 | ⬜ PENDENTE | `scripts/validation/verify-e2e-shard-plan.js` | `ea1149ced744` | `docs/biblia/scripts/validation/verify-e2e-shard-plan.js/Bíblia.md` |
| 87 | ⬜ PENDENTE | `scripts/validation/verify-jest-worker-warning-selftest.js` | `4c8ce078abcf` | `docs/biblia/scripts/validation/verify-jest-worker-warning-selftest.js/Bíblia.md` |
| 88 | ⬜ PENDENTE | `scripts/validation/verify-publish-contract.js` | `f5b3f6c69f85` | `docs/biblia/scripts/validation/verify-publish-contract.js/Bíblia.md` |
| 89 | ⬜ PENDENTE | `scripts/validation/verify-repository-structure.js` | `5151c7706c07` | `docs/biblia/scripts/validation/verify-repository-structure.js/Bíblia.md` |
| 90 | ⬜ PENDENTE | `scripts/validation/verify-test-policy-selftest.js` | `ac0318e4d90c` | `docs/biblia/scripts/validation/verify-test-policy-selftest.js/Bíblia.md` |
| 91 | ⬜ PENDENTE | `scripts/validation/verify-test-policy.js` | `4a8214033534` | `docs/biblia/scripts/validation/verify-test-policy.js/Bíblia.md` |
| 92 | ⬜ PENDENTE | `tests/e2e/cache-and-storage.spec.js` | `b181989a9b89` | `docs/biblia/tests/e2e/cache-and-storage.spec.js/Bíblia.md` |
| 93 | ⬜ PENDENTE | `tests/e2e/reader-offline.spec.js` | `1ab953d0a031` | `docs/biblia/tests/e2e/reader-offline.spec.js/Bíblia.md` |
| 94 | ⬜ PENDENTE | `tests/e2e/translation-flow.spec.js` | `db1da42c48ff` | `docs/biblia/tests/e2e/translation-flow.spec.js/Bíblia.md` |
| 95 | ⬜ PENDENTE | `tests/fixtures/gemini-mock-server.js` | `1cd13486bf3a` | `docs/biblia/tests/fixtures/gemini-mock-server.js/Bíblia.md` |
| 96 | ⬜ PENDENTE | `tests/fixtures/manga-images.js` | `cc4b67fe92fc` | `docs/biblia/tests/fixtures/manga-images.js/Bíblia.md` |
| 97 | ⬜ PENDENTE | `tests/fixtures/manga-page.html` | `71d78eea7edd` | `docs/biblia/tests/fixtures/manga-page.html/Bíblia.md` |
| 98 | ⬜ PENDENTE | `tests/helpers/background-test-utils.js` | `1c38cfc47917` | `docs/biblia/tests/helpers/background-test-utils.js/Bíblia.md` |
| 99 | ⬜ PENDENTE | `tests/helpers/extracted-functions.js` | `ccbf20485608` | `docs/biblia/tests/helpers/extracted-functions.js/Bíblia.md` |
| 100 | ⬜ PENDENTE | `tests/helpers/load-background-module.js` | `b1a20544a10b` | `docs/biblia/tests/helpers/load-background-module.js/Bíblia.md` |
| 101 | ⬜ PENDENTE | `tests/helpers/load-content-gemini-module.js` | `d7b72e8fd5c6` | `docs/biblia/tests/helpers/load-content-gemini-module.js/Bíblia.md` |
| 102 | ⬜ PENDENTE | `tests/helpers/load-content-script.js` | `40d7c59d81a5` | `docs/biblia/tests/helpers/load-content-script.js/Bíblia.md` |
| 103 | ⬜ PENDENTE | `tests/helpers/load-extension-page.js` | `c2325598f10b` | `docs/biblia/tests/helpers/load-extension-page.js/Bíblia.md` |
| 104 | ⬜ PENDENTE | `tests/helpers/repo-root.js` | `b2520d65820e` | `docs/biblia/tests/helpers/repo-root.js/Bíblia.md` |
| 105 | ⬜ PENDENTE | `tests/helpers/track-background-delay-timers.js` | `b7860da7879c` | `docs/biblia/tests/helpers/track-background-delay-timers.js/Bíblia.md` |
| 106 | ⬜ PENDENTE | `tests/integration/banned-images-flow.test.js` | `7624e120e7ff` | `docs/biblia/tests/integration/banned-images-flow.test.js/Bíblia.md` |
| 107 | ⬜ PENDENTE | `tests/integration/chapter-dedup.test.js` | `e62187cd957a` | `docs/biblia/tests/integration/chapter-dedup.test.js/Bíblia.md` |
| 108 | ⬜ PENDENTE | `tests/integration/gtc-end-to-end.test.js` | `9042b3b5370a` | `docs/biblia/tests/integration/gtc-end-to-end.test.js/Bíblia.md` |
| 109 | ⬜ PENDENTE | `tests/integration/ipc/gemini-cors-fallback.test.js` | `1f5a1236139d` | `docs/biblia/tests/integration/ipc/gemini-cors-fallback.test.js/Bíblia.md` |
| 110 | ⬜ PENDENTE | `tests/integration/ipc/gtc-cache-flow.test.js` | `e6eb5c744499` | `docs/biblia/tests/integration/ipc/gtc-cache-flow.test.js/Bíblia.md` |
| 111 | ⬜ PENDENTE | `tests/integration/ipc/gtc-indexeddb-deep.test.js` | `39d0542f9bad` | `docs/biblia/tests/integration/ipc/gtc-indexeddb-deep.test.js/Bíblia.md` |
| 112 | ⬜ PENDENTE | `tests/integration/ipc/image-translation-routing.test.js` | `4f1674c12311` | `docs/biblia/tests/integration/ipc/image-translation-routing.test.js/Bíblia.md` |
| 113 | ⬜ PENDENTE | `tests/integration/options.ui.test.js` | `33c34c89f713` | `docs/biblia/tests/integration/options.ui.test.js/Bíblia.md` |
| 114 | ⬜ PENDENTE | `tests/integration/performance.test.js` | `a2e759feddd0` | `docs/biblia/tests/integration/performance.test.js/Bíblia.md` |
| 115 | ⬜ PENDENTE | `tests/integration/popup-translated-thumbnails.test.js` | `7e4fea854647` | `docs/biblia/tests/integration/popup-translated-thumbnails.test.js/Bíblia.md` |
| 116 | ⬜ PENDENTE | `tests/integration/popup.advanced.ui.test.js` | `dd15edcefd59` | `docs/biblia/tests/integration/popup.advanced.ui.test.js/Bíblia.md` |
| 117 | ⬜ PENDENTE | `tests/integration/popup.ui.test.js` | `57158c9b6e6f` | `docs/biblia/tests/integration/popup.ui.test.js/Bíblia.md` |
| 118 | ⬜ PENDENTE | `tests/integration/reader.ui.test.js` | `810a207f1264` | `docs/biblia/tests/integration/reader.ui.test.js/Bíblia.md` |
| 119 | ⬜ PENDENTE | `tests/mocks/chrome-api.mock.js` | `c1d9a056b777` | `docs/biblia/tests/mocks/chrome-api.mock.js/Bíblia.md` |
| 120 | ⬜ PENDENTE | `tests/mocks/dom-environment.js` | `9c3bc91608aa` | `docs/biblia/tests/mocks/dom-environment.js/Bíblia.md` |
| 121 | ⬜ PENDENTE | `tests/setup/create-test-images.js` | `f35e7896ffb5` | `docs/biblia/tests/setup/create-test-images.js/Bíblia.md` |
| 122 | ⬜ PENDENTE | `tests/smoke/run-smoke.js` | `ea6fa903f7a6` | `docs/biblia/tests/smoke/run-smoke.js/Bíblia.md` |
| 123 | ⬜ PENDENTE | `tests/smoke/smoke-01-batch-lifecycle.js` | `c412ccaac3c0` | `docs/biblia/tests/smoke/smoke-01-batch-lifecycle.js/Bíblia.md` |
| 124 | ⬜ PENDENTE | `tests/smoke/smoke-02-uuid-and-reconcile.js` | `d977f43a4b29` | `docs/biblia/tests/smoke/smoke-02-uuid-and-reconcile.js/Bíblia.md` |
| 125 | ⬜ PENDENTE | `tests/smoke/smoke-03-chapter-persistence.js` | `63f904d8ad55` | `docs/biblia/tests/smoke/smoke-03-chapter-persistence.js/Bíblia.md` |
| 126 | ⬜ PENDENTE | `tests/smoke/smoke-04-storage-manager.js` | `0ba92d74356c` | `docs/biblia/tests/smoke/smoke-04-storage-manager.js/Bíblia.md` |
| 127 | ⬜ PENDENTE | `tests/smoke/smoke-05-perceptual-queries.js` | `bf8409c3df43` | `docs/biblia/tests/smoke/smoke-05-perceptual-queries.js/Bíblia.md` |
| 128 | ⬜ PENDENTE | `tests/smoke/smoke-06-sm-message-routing.js` | `dd32621bee49` | `docs/biblia/tests/smoke/smoke-06-sm-message-routing.js/Bíblia.md` |
| 129 | ⬜ PENDENTE | `tests/unit/background/actions-low-risk.test.js` | `e5d4d54674b5` | `docs/biblia/tests/unit/background/actions-low-risk.test.js/Bíblia.md` |
| 130 | ⬜ PENDENTE | `tests/unit/background/background-strict-load.test.js` | `25a663f527f7` | `docs/biblia/tests/unit/background/background-strict-load.test.js/Bíblia.md` |
| 131 | ⬜ PENDENTE | `tests/unit/background/batch-actions.test.js` | `113344a0e8db` | `docs/biblia/tests/unit/background/batch-actions.test.js/Bíblia.md` |
| 132 | ⬜ PENDENTE | `tests/unit/background/batch-lifecycle-real.test.js` | `1368df4b1fdb` | `docs/biblia/tests/unit/background/batch-lifecycle-real.test.js/Bíblia.md` |
| 133 | ⬜ PENDENTE | `tests/unit/background/calculate-visual-fingerprint-action.test.js` | `f51a0b629ac1` | `docs/biblia/tests/unit/background/calculate-visual-fingerprint-action.test.js/Bíblia.md` |
| 134 | ⬜ PENDENTE | `tests/unit/background/chrome-runtime-mock-lifecycle.test.js` | `1bd33ea5e027` | `docs/biblia/tests/unit/background/chrome-runtime-mock-lifecycle.test.js/Bíblia.md` |
| 135 | ⬜ PENDENTE | `tests/unit/background/claim-gemini-job-action.test.js` | `0cb6cb2f100d` | `docs/biblia/tests/unit/background/claim-gemini-job-action.test.js/Bíblia.md` |
| 136 | ⬜ PENDENTE | `tests/unit/background/commit-result-action.test.js` | `1a185784edd1` | `docs/biblia/tests/unit/background/commit-result-action.test.js/Bíblia.md` |
| 137 | ⬜ PENDENTE | `tests/unit/background/deliver-result-action.test.js` | `654194bf502f` | `docs/biblia/tests/unit/background/deliver-result-action.test.js/Bíblia.md` |
| 138 | ⬜ PENDENTE | `tests/unit/background/deliver-result-from-tab-action.test.js` | `263cb827e304` | `docs/biblia/tests/unit/background/deliver-result-from-tab-action.test.js/Bíblia.md` |
| 139 | ⬜ PENDENTE | `tests/unit/background/deliver-result-url-action.test.js` | `09a0f891434b` | `docs/biblia/tests/unit/background/deliver-result-url-action.test.js/Bíblia.md` |
| 140 | ⬜ PENDENTE | `tests/unit/background/download-chapter-action.test.js` | `ff0ecb6249b2` | `docs/biblia/tests/unit/background/download-chapter-action.test.js/Bíblia.md` |
| 141 | ⬜ PENDENTE | `tests/unit/background/download-image-action.test.js` | `9305ba72e1d6` | `docs/biblia/tests/unit/background/download-image-action.test.js/Bíblia.md` |
| 142 | ⬜ PENDENTE | `tests/unit/background/download-wait.test.js` | `1bb13ac03ab0` | `docs/biblia/tests/unit/background/download-wait.test.js/Bíblia.md` |
| 143 | ⬜ PENDENTE | `tests/unit/background/export-all-action.test.js` | `9ab092d95ac1` | `docs/biblia/tests/unit/background/export-all-action.test.js/Bíblia.md` |
| 144 | ⬜ PENDENTE | `tests/unit/background/export-guard.test.js` | `4a34bd498d62` | `docs/biblia/tests/unit/background/export-guard.test.js/Bíblia.md` |
| 145 | ⬜ PENDENTE | `tests/unit/background/fetch-image-base64-action.test.js` | `1246da7bd399` | `docs/biblia/tests/unit/background/fetch-image-base64-action.test.js/Bíblia.md` |
| 146 | ⬜ PENDENTE | `tests/unit/background/force-send-activation-action.test.js` | `cab687a5e5d5` | `docs/biblia/tests/unit/background/force-send-activation-action.test.js/Bíblia.md` |
| 147 | ⬜ PENDENTE | `tests/unit/background/gtc-runtime-bridge.test.js` | `21c01d044af7` | `docs/biblia/tests/unit/background/gtc-runtime-bridge.test.js/Bíblia.md` |
| 148 | ⬜ PENDENTE | `tests/unit/background/handlers-extra-real.test.js` | `2089f42642fc` | `docs/biblia/tests/unit/background/handlers-extra-real.test.js/Bíblia.md` |
| 149 | ⬜ PENDENTE | `tests/unit/background/helpers-real.test.js` | `668cef7f5922` | `docs/biblia/tests/unit/background/helpers-real.test.js/Bíblia.md` |
| 150 | ⬜ PENDENTE | `tests/unit/background/jobs-dom-ack-staging.test.js` | `5db47daff530` | `docs/biblia/tests/unit/background/jobs-dom-ack-staging.test.js/Bíblia.md` |
| 151 | ⬜ PENDENTE | `tests/unit/background/jobs-lifecycle-batch-status.test.js` | `820f8c87379f` | `docs/biblia/tests/unit/background/jobs-lifecycle-batch-status.test.js/Bíblia.md` |
| 152 | ⬜ PENDENTE | `tests/unit/background/jobs-reconciliation-batch-queue.test.js` | `032df2351f2a` | `docs/biblia/tests/unit/background/jobs-reconciliation-batch-queue.test.js/Bíblia.md` |
| 153 | ⬜ PENDENTE | `tests/unit/background/jobs-watchdog-ordering.test.js` | `2102182a1e31` | `docs/biblia/tests/unit/background/jobs-watchdog-ordering.test.js/Bíblia.md` |
| 154 | ⬜ PENDENTE | `tests/unit/background/lifecycle-alarms-real.test.js` | `1d4c22ba9a78` | `docs/biblia/tests/unit/background/lifecycle-alarms-real.test.js/Bíblia.md` |
| 155 | ⬜ PENDENTE | `tests/unit/background/marker-anchor-real.test.js` | `6a6c977a1a2b` | `docs/biblia/tests/unit/background/marker-anchor-real.test.js/Bíblia.md` |
| 156 | ⬜ PENDENTE | `tests/unit/background/message-handlers-real.test.js` | `1c2815cd1f2f` | `docs/biblia/tests/unit/background/message-handlers-real.test.js/Bíblia.md` |
| 157 | ⬜ PENDENTE | `tests/unit/background/open-existing-folder-action.test.js` | `49b6cd110eba` | `docs/biblia/tests/unit/background/open-existing-folder-action.test.js/Bíblia.md` |
| 158 | ⬜ PENDENTE | `tests/unit/background/open-manga-root-action.test.js` | `fd34ec27189d` | `docs/biblia/tests/unit/background/open-manga-root-action.test.js/Bíblia.md` |
| 159 | ⬜ PENDENTE | `tests/unit/background/plan-missing-handlers-real.test.js` | `9f8c6e4a8825` | `docs/biblia/tests/unit/background/plan-missing-handlers-real.test.js/Bíblia.md` |
| 160 | ⬜ PENDENTE | `tests/unit/background/process-finalize-real.test.js` | `abb1b936fadf` | `docs/biblia/tests/unit/background/process-finalize-real.test.js/Bíblia.md` |
| 161 | ⬜ PENDENTE | `tests/unit/background/refresh-job-watchdog-action.test.js` | `d2acd697b788` | `docs/biblia/tests/unit/background/refresh-job-watchdog-action.test.js/Bíblia.md` |
| 162 | ⬜ PENDENTE | `tests/unit/background/regex-escape.test.js` | `3707482c0137` | `docs/biblia/tests/unit/background/regex-escape.test.js/Bíblia.md` |
| 163 | ⬜ PENDENTE | `tests/unit/background/report-error-action.test.js` | `507406dfbbc2` | `docs/biblia/tests/unit/background/report-error-action.test.js/Bíblia.md` |
| 164 | ⬜ PENDENTE | `tests/unit/background/request-image-data-action.test.js` | `b04cd6cac533` | `docs/biblia/tests/unit/background/request-image-data-action.test.js/Bíblia.md` |
| 165 | ⬜ PENDENTE | `tests/unit/background/routed-actions-legacy.test.js` | `62d534355ac8` | `docs/biblia/tests/unit/background/routed-actions-legacy.test.js/Bíblia.md` |
| 166 | ⬜ PENDENTE | `tests/unit/background/router.test.js` | `d7c33bc525e1` | `docs/biblia/tests/unit/background/router.test.js/Bíblia.md` |
| 167 | ⬜ PENDENTE | `tests/unit/background/single-image-context-menu.test.js` | `c4e122e3fd2a` | `docs/biblia/tests/unit/background/single-image-context-menu.test.js/Bíblia.md` |
| 168 | ⬜ PENDENTE | `tests/unit/background/startup-recovery.test.js` | `649829ac36bb` | `docs/biblia/tests/unit/background/startup-recovery.test.js/Bíblia.md` |
| 169 | ⬜ PENDENTE | `tests/unit/background/state-api.test.js` | `d9c080339202` | `docs/biblia/tests/unit/background/state-api.test.js/Bíblia.md` |
| 170 | ⬜ PENDENTE | `tests/unit/background/tab-identity.test.js` | `1f2dd5251303` | `docs/biblia/tests/unit/background/tab-identity.test.js/Bíblia.md` |
| 171 | ⬜ PENDENTE | `tests/unit/background/tab-replacement-observability.test.js` | `b5aeb216f48e` | `docs/biblia/tests/unit/background/tab-replacement-observability.test.js/Bíblia.md` |
| 172 | ⬜ PENDENTE | `tests/unit/background/test_bg59.test.js` | `ae96b1427174` | `docs/biblia/tests/unit/background/test_bg59.test.js/Bíblia.md` |
| 173 | ⬜ PENDENTE | `tests/unit/background/version-sync.test.js` | `45927901e904` | `docs/biblia/tests/unit/background/version-sync.test.js/Bíblia.md` |
| 174 | ⬜ PENDENTE | `tests/unit/content-gemini/attachment.test.js` | `43d4591bc9ff` | `docs/biblia/tests/unit/content-gemini/attachment.test.js/Bíblia.md` |
| 175 | ⬜ PENDENTE | `tests/unit/content-gemini/claim-bootstrap-keepalive.test.js` | `6e6adc2747b0` | `docs/biblia/tests/unit/content-gemini/claim-bootstrap-keepalive.test.js/Bíblia.md` |
| 176 | ⬜ PENDENTE | `tests/unit/content-gemini/deletion.test.js` | `c570bbdc3407` | `docs/biblia/tests/unit/content-gemini/deletion.test.js/Bíblia.md` |
| 177 | ⬜ PENDENTE | `tests/unit/content-gemini/dom-modules.test.js` | `32441920c27f` | `docs/biblia/tests/unit/content-gemini/dom-modules.test.js/Bíblia.md` |
| 178 | ⬜ PENDENTE | `tests/unit/content-gemini/editor-submit.test.js` | `ccfa4c881543` | `docs/biblia/tests/unit/content-gemini/editor-submit.test.js/Bíblia.md` |
| 179 | ⬜ PENDENTE | `tests/unit/content-gemini/helpers-and-regressions-real.test.js` | `65c66f1a756d` | `docs/biblia/tests/unit/content-gemini/helpers-and-regressions-real.test.js/Bíblia.md` |
| 180 | ⬜ PENDENTE | `tests/unit/content-gemini/image-quarantine.test.js` | `b2c73b79c882` | `docs/biblia/tests/unit/content-gemini/image-quarantine.test.js/Bíblia.md` |
| 181 | ⬜ PENDENTE | `tests/unit/content-gemini/job-runner.test.js` | `feae92421dd9` | `docs/biblia/tests/unit/content-gemini/job-runner.test.js/Bíblia.md` |
| 182 | ⬜ PENDENTE | `tests/unit/content-gemini/manual-assist-hud.test.js` | `14f53ac3c5a9` | `docs/biblia/tests/unit/content-gemini/manual-assist-hud.test.js/Bíblia.md` |
| 183 | ⬜ PENDENTE | `tests/unit/content-gemini/observer.test.js` | `0eff259f673c` | `docs/biblia/tests/unit/content-gemini/observer.test.js/Bíblia.md` |
| 184 | ⬜ PENDENTE | `tests/unit/content-gemini/plan-rpa-edge-cases.test.js` | `81e21c6e245e` | `docs/biblia/tests/unit/content-gemini/plan-rpa-edge-cases.test.js/Bíblia.md` |
| 185 | ⬜ PENDENTE | `tests/unit/content-gemini/resolution-elevation.test.js` | `a8ef465959d2` | `docs/biblia/tests/unit/content-gemini/resolution-elevation.test.js/Bíblia.md` |
| 186 | ⬜ PENDENTE | `tests/unit/content-gemini/result-extractor.test.js` | `611df28380a8` | `docs/biblia/tests/unit/content-gemini/result-extractor.test.js/Bíblia.md` |
| 187 | ⬜ PENDENTE | `tests/unit/content-gemini/rpa-flow.test.js` | `4bcd24983325` | `docs/biblia/tests/unit/content-gemini/rpa-flow.test.js/Bíblia.md` |
| 188 | ⬜ PENDENTE | `tests/unit/content-gemini/safe-background-delete.test.js` | `cf85ff00f7cc` | `docs/biblia/tests/unit/content-gemini/safe-background-delete.test.js/Bíblia.md` |
| 189 | ⬜ PENDENTE | `tests/unit/content-gemini/temp-chat-activator.test.js` | `f9418a4301c9` | `docs/biblia/tests/unit/content-gemini/temp-chat-activator.test.js/Bíblia.md` |
| 190 | ⬜ PENDENTE | `tests/unit/content-gemini/temporary-chat-v2.test.js` | `bdf7146fac7f` | `docs/biblia/tests/unit/content-gemini/temporary-chat-v2.test.js/Bíblia.md` |
| 191 | ⬜ PENDENTE | `tests/unit/content-manga/audio-synthesis-full.test.js` | `e53e43da4f20` | `docs/biblia/tests/unit/content-manga/audio-synthesis-full.test.js/Bíblia.md` |
| 192 | ⬜ PENDENTE | `tests/unit/content-manga/audio-synthesis.test.js` | `f47b6cf91846` | `docs/biblia/tests/unit/content-manga/audio-synthesis.test.js/Bíblia.md` |
| 193 | ⬜ PENDENTE | `tests/unit/content-manga/auto-restore-system.test.js` | `3aa7a39030ab` | `docs/biblia/tests/unit/content-manga/auto-restore-system.test.js/Bíblia.md` |
| 194 | ⬜ PENDENTE | `tests/unit/content-manga/auto-restorer-real.test.js` | `cf792733e62f` | `docs/biblia/tests/unit/content-manga/auto-restorer-real.test.js/Bíblia.md` |
| 195 | ⬜ PENDENTE | `tests/unit/content-manga/button-ui-real.test.js` | `a82baea685c1` | `docs/biblia/tests/unit/content-manga/button-ui-real.test.js/Bíblia.md` |
| 196 | ⬜ PENDENTE | `tests/unit/content-manga/canonical-title-full.test.js` | `1b46903dbe4a` | `docs/biblia/tests/unit/content-manga/canonical-title-full.test.js/Bíblia.md` |
| 197 | ⬜ PENDENTE | `tests/unit/content-manga/canonical-title.test.js` | `bfb01bdfb8de` | `docs/biblia/tests/unit/content-manga/canonical-title.test.js/Bíblia.md` |
| 198 | ⬜ PENDENTE | `tests/unit/content-manga/chapter-id-cache.test.js` | `7bc23a456be6` | `docs/biblia/tests/unit/content-manga/chapter-id-cache.test.js/Bíblia.md` |
| 199 | ⬜ PENDENTE | `tests/unit/content-manga/chapter-id-rejection.test.js` | `783c8abd8602` | `docs/biblia/tests/unit/content-manga/chapter-id-rejection.test.js/Bíblia.md` |
| 200 | ⬜ PENDENTE | `tests/unit/content-manga/close-interval.test.js` | `e9bcb9c92671` | `docs/biblia/tests/unit/content-manga/close-interval.test.js/Bíblia.md` |
| 201 | ⬜ PENDENTE | `tests/unit/content-manga/drawer-real.test.js` | `eeebbd56fe1a` | `docs/biblia/tests/unit/content-manga/drawer-real.test.js/Bíblia.md` |
| 202 | ⬜ PENDENTE | `tests/unit/content-manga/extract-flow-real.test.js` | `1bbc481d426b` | `docs/biblia/tests/unit/content-manga/extract-flow-real.test.js/Bíblia.md` |
| 203 | ⬜ PENDENTE | `tests/unit/content-manga/extraction-and-handlers-real.test.js` | `038961e8228c` | `docs/biblia/tests/unit/content-manga/extraction-and-handlers-real.test.js/Bíblia.md` |
| 204 | ⬜ PENDENTE | `tests/unit/content-manga/floating-button-guard-and-single-click.test.js` | `8e8aacd0fc54` | `docs/biblia/tests/unit/content-manga/floating-button-guard-and-single-click.test.js/Bíblia.md` |
| 205 | ⬜ PENDENTE | `tests/unit/content-manga/get-clean-url.test.js` | `a04fe1e3552d` | `docs/biblia/tests/unit/content-manga/get-clean-url.test.js/Bíblia.md` |
| 206 | ⬜ PENDENTE | `tests/unit/content-manga/get-page-images-filter.test.js` | `d48888d1237e` | `docs/biblia/tests/unit/content-manga/get-page-images-filter.test.js/Bíblia.md` |
| 207 | ⬜ PENDENTE | `tests/unit/content-manga/image-filtering.test.js` | `a187a4c6e681` | `docs/biblia/tests/unit/content-manga/image-filtering.test.js/Bíblia.md` |
| 208 | ⬜ PENDENTE | `tests/unit/content-manga/image-fingerprint.test.js` | `e4e553c77027` | `docs/biblia/tests/unit/content-manga/image-fingerprint.test.js/Bíblia.md` |
| 209 | ⬜ PENDENTE | `tests/unit/content-manga/replacement-and-completion-real.test.js` | `9dcd26cf4a96` | `docs/biblia/tests/unit/content-manga/replacement-and-completion-real.test.js/Bíblia.md` |
| 210 | ⬜ PENDENTE | `tests/unit/content-manga/twin-backdrop-sync.test.js` | `5d2151b3673a` | `docs/biblia/tests/unit/content-manga/twin-backdrop-sync.test.js/Bíblia.md` |
| 211 | ⬜ PENDENTE | `tests/unit/gtc/fingerprint.test.js` | `5255083ff288` | `docs/biblia/tests/unit/gtc/fingerprint.test.js/Bíblia.md` |
| 212 | ⬜ PENDENTE | `tests/unit/gtc/indexeddb.test.js` | `30af6c23b546` | `docs/biblia/tests/unit/gtc/indexeddb.test.js/Bíblia.md` |
| 213 | ⬜ PENDENTE | `tests/unit/inject/inject-anti-hibernation.test.js` | `22cc82c2ea7b` | `docs/biblia/tests/unit/inject/inject-anti-hibernation.test.js/Bíblia.md` |
| 214 | ⬜ PENDENTE | `tests/unit/inject/raf-replacement.test.js` | `8b9e1c19b395` | `docs/biblia/tests/unit/inject/raf-replacement.test.js/Bíblia.md` |
| 215 | ⬜ PENDENTE | `tests/unit/inject/visibility-spoof.test.js` | `e94a89c7a69a` | `docs/biblia/tests/unit/inject/visibility-spoof.test.js/Bíblia.md` |
| 216 | ⬜ PENDENTE | `tests/unit/manifest/surface-reduction.test.js` | `d5bde042b414` | `docs/biblia/tests/unit/manifest/surface-reduction.test.js/Bíblia.md` |
| 217 | ⬜ PENDENTE | `tests/unit/popup/dynamic-button.test.js` | `4f4dea1b4897` | `docs/biblia/tests/unit/popup/dynamic-button.test.js/Bíblia.md` |
| 218 | ⬜ PENDENTE | `tests/unit/popup/log-exporter.test.js` | `3983f9d428ba` | `docs/biblia/tests/unit/popup/log-exporter.test.js/Bíblia.md` |
| 219 | ⬜ PENDENTE | `tests/unit/popup/progress-panel.test.js` | `d93235bdd142` | `docs/biblia/tests/unit/popup/progress-panel.test.js/Bíblia.md` |
| 220 | ⬜ PENDENTE | `tests/unit/popup/resize-and-tabs.test.js` | `d611cadbdfc9` | `docs/biblia/tests/unit/popup/resize-and-tabs.test.js/Bíblia.md` |
| 221 | ⬜ PENDENTE | `tests/unit/popup/version-ui.test.js` | `0fcb923f59ef` | `docs/biblia/tests/unit/popup/version-ui.test.js/Bíblia.md` |
| 222 | ⬜ PENDENTE | `tests/unit/reader/keyboard-nav.test.js` | `0d64775426e2` | `docs/biblia/tests/unit/reader/keyboard-nav.test.js/Bíblia.md` |
| 223 | ⬜ PENDENTE | `tests/unit/reader/page-counter.test.js` | `cec252ffefc2` | `docs/biblia/tests/unit/reader/page-counter.test.js/Bíblia.md` |
| 224 | ⬜ PENDENTE | `tests/unit/shared-ui/redo-confirmation.test.js` | `2b46e876c3f8` | `docs/biblia/tests/unit/shared-ui/redo-confirmation.test.js/Bíblia.md` |
| 225 | ⬜ PENDENTE | `tests/visual/background-fingerprint.visual.js` | `91f5cf4d9ed4` | `docs/biblia/tests/visual/background-fingerprint.visual.js/Bíblia.md` |
| 226 | ⬜ PENDENTE | `tests/visual/content-manga-pipeline.visual.js` | `61bc86351c91` | `docs/biblia/tests/visual/content-manga-pipeline.visual.js/Bíblia.md` |
| 227 | ⬜ PENDENTE | `tests/visual/crop.visual.js` | `432fe488697a` | `docs/biblia/tests/visual/crop.visual.js/Bíblia.md` |
| 228 | ⬜ PENDENTE | `tests/visual/gtc-fingerprint.visual.js` | `fb66d9d8eb41` | `docs/biblia/tests/visual/gtc-fingerprint.visual.js/Bíblia.md` |
| 229 | ⬜ PENDENTE | `tests/visual/gtc-indexeddb.visual.js` | `0f5ca8e043a0` | `docs/biblia/tests/visual/gtc-indexeddb.visual.js/Bíblia.md` |
| 230 | ⬜ PENDENTE | `tests/visual/helpers.js` | `8d740eb3ee27` | `docs/biblia/tests/visual/helpers.js/Bíblia.md` |
| 231 | ⬜ PENDENTE | `tests/visual/integration.visual.js` | `2407ce31e6c1` | `docs/biblia/tests/visual/integration.visual.js/Bíblia.md` |
| 232 | ⬜ PENDENTE | `tests/visual/run-all.js` | `2a5542167543` | `docs/biblia/tests/visual/run-all.js/Bíblia.md` |
| 233 | ⬜ PENDENTE | `tests/visual/runner.js` | `fe34764874ca` | `docs/biblia/tests/visual/runner.js/Bíblia.md` |

## OBSERVAÇÃO DO AGENTE 2 — .github/workflows/publish.yml

> **Somente anotação para auditoria — nenhuma alteração funcional solicitada ou realizada no arquivo-fonte.**  
> **Arquivo analisado:** `.github/workflows/publish.yml`  
> **SHA observado:** `f673d445a3cc022d473f9b59ae1e0c8972ecd013`  
> **Responsável pela observação:** `AGENTE 2`

### O que encontrei

1. **Risco de mismatch entre o checkout e uma Release/tag já existente.**  
   Em execução por `workflow_dispatch`, a validação que compara `GITHUB_REF_NAME` com `RELEASE_TAG` pode não se aplicar porque o ref pode ser uma branch. Se `RELEASE_TAG` já existir, o workflow pode montar artifacts a partir do checkout atual e depois executar `gh release edit` / `gh release upload --clobber` sem provar que `GITHUB_SHA` corresponde ao commit apontado pela tag existente. Isso pode substituir assets corretos de uma versão por bytes produzidos a partir de outro commit.

2. **A publicação não possui dependência explícita de CI aprovado.**  
   O workflow executa `version:check`, mas não exige de forma explícita que unitários, integração, smoke, visual, E2E e demais gates obrigatórios tenham passado para o commit que será publicado.

3. **Não existe coordenação explícita de concorrência por versão/tag.**  
   Dois runs para a mesma `RELEASE_TAG` podem competir em `gh release create/edit/upload`; com `--clobber`, o último escritor pode substituir assets do primeiro.

4. **Dependências de execução mutáveis.**  
   `ubuntu-latest`, `actions/checkout@v4` e `actions/setup-node@v4` não estão presos a uma imagem/SHA imutável. O workflow também pressupõe disponibilidade de `zip`, `sha256sum`, `git` e `gh`.

5. **`--latest` é aplicado incondicionalmente.**  
   Isso funciona para uma linha de releases estáveis, mas deve ser reavaliado caso o projeto use backports, prereleases ou releases paralelas.

6. **Release notes contêm destaques arquiteturais hardcoded.**  
   Esses textos podem ficar desatualizados em relação ao código e hoje não existe prova semântica de que continuam verdadeiros.

### O que considero necessário

- Garantir que, quando a tag já existir, o commit resolvido por `refs/tags/${RELEASE_TAG}` seja exatamente o commit autorizado para gerar/substituir os assets.
- Impedir `--clobber` de substituir artifacts de uma tag com conteúdo produzido por outro commit.
- Definir uma regra explícita de que somente commits com os gates obrigatórios aprovados podem ser publicados.
- Considerar `concurrency` por `RELEASE_TAG` para impedir duas publicações simultâneas da mesma versão.
- Manter permissões do `github.token` no mínimo necessário e confirmar que `contents: write` é suficiente.
- Criar prova automatizada para os três ramos reais do release: Release existente, tag existente sem Release e tag inexistente.
- Criar teste/harness que monte o artifact, abra o ZIP, confira seu inventário e recalcule `SHA256SUMS.txt`.
- Validar deliberadamente a política de `--latest`, dependências mutáveis do runner/actions e manutenção das release notes.

### O que preciso que o auditor faça

1. **Reproduza/valide especificamente o cenário `workflow_dispatch` em um ref diferente da tag**, com `RELEASE_TAG` já existente, e confirme se seria possível chegar a `gh release upload --clobber` com artifacts de outro commit.
2. **Compare `GITHUB_SHA` com o SHA real da tag** nos três ramos do workflow e determine se existe alguma proteção equivalente já fora deste arquivo.
3. **Verifique se existe em outro workflow, branch protection, ruleset ou environment protection uma exigência efetiva de CI aprovado antes da publicação.** Não assumir que o fato de existir `ci.yml` cria essa dependência.
4. **Audite concorrência real:** dois runs para a mesma versão não devem conseguir criar/editar/substituir assets de forma não determinística.
5. **Leia as assertions reais** de `scripts/validation/verify-publish-contract.js`, `scripts/validation/verify-ci-contract.js` e `tests/unit/background/version-sync.test.js`; diferencie gate de string de execução real do GitHub CLI.
6. **Confirme o conteúdo do ZIP e os checksums produzidos**, não apenas a presença textual dos comandos.
7. **Confirme a política mínima de permissões** e se o token pode realizar somente as mutações esperadas.
8. **Registre no parecer da auditoria quais riscos são bugs reais, quais são decisões arquiteturais deliberadas e quais necessitam correção/testes adicionais.**
9. **Não considerar a ocorrência textual de `gh release`, `--clobber`, `sha256sum` ou `workflow_dispatch` como prova de comportamento.** A conclusão deve vir de execução, simulação fiel ou análise do fluxo real.
10. **Não alterar o arquivo funcional apenas para satisfazer esta observação sem uma decisão explícita de correção.** Esta nota é para orientar a auditoria.

## Regra de continuidade multiagente

1. Definir uma identidade estável de agente.
2. Ler `AUDITORIA.md`, `STATUS.md`, `CHECKLIST.md` e as reservas atuais.
3. Cada agente pode possuir no máximo uma reserva ativa; cada arquivo pode possuir no máximo um proprietário.
4. Escolher o menor índice `⬜ PENDENTE` sem reserva, ou migrar primeiro um legado `EM ANDAMENTO` sem reserva.
5. Criar a reserva com semântica CREATE ONLY e relê-la antes de editar a Bíblia.
6. Trabalhar somente na Bíblia reservada pelo próprio agente.
7. Antes de alterar STATUS/CHECKLIST/AUDITORIA/PR, adquirir `.coordination/PROGRESS.lock.md` com CREATE ONLY, reler o estado e aplicar apenas o delta necessário.
8. Somente após auditoria aprovada: mudar para `✅ CONCLUÍDO`, marcar `[x]`, atualizar `AUDITORIA.md`, recalcular contadores e liberar a reserva antiga.
9. Vários arquivos distintos podem ficar `🟠 EM ANDAMENTO — <AGENTE>` simultaneamente, desde que reserva, STATUS e CHECKLIST concordem.
10. Nunca roubar reserva, nunca force-push e nunca restaurar STATUS/CHECKLIST a partir de snapshot antigo.
11. Publicar no chat o checkpoint de cada arquivo concluído antes de iniciar a análise do próximo arquivo reservado.
