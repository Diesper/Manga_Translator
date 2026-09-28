# Plano de finalização das pendências do PR #47

> Documento de execução para eliminar as pendências restantes do PR #47 sem reabrir problemas que já foram corrigidos.
>
> Fontes principais:
> - `docs/PLANO_CORRECAO_PENDENCIAS_PR47.md`
> - `docs/REGRESSOES_PR47.md`
> - código e testes do head verificado `db9056e1ed2316cc489c4fde8c7b0ceb8c4c09d3`
> - GitHub Actions run #1241 (`36364112640`)
> - ruleset ativo da `main` #23791606
>
> Este arquivo não declara o PR pronto. Ele descreve como transformar o estado atual em uma evidência objetiva de encerramento.

---

## 1. Resumo executivo

A situação do PR #47 mudou desde o diagnóstico inicial em `be6b9ec`.

Várias pendências descritas originalmente já receberam implementação e regressões:

1. o ciclo de vida da extração auxiliar em `content_manga.js` passou a registrar e cancelar timers, intervalos e listeners;
2. existem regressões para ACK persistido, retry, descarte por `pagehide` e prazo de segurança;
3. o teardown de RPA aguarda a Promise do runner e interrompe observers;
4. o fluxo de clique individual dispara descarte no teardown;
5. o mock de `chrome.runtime.sendMessage()` passou a registrar e cancelar os timeouts de canal pendentes;
6. o Jest completo possui um gate que converte o warning de worker forçado em falha real da CI;
7. o ruleset da `main` já foi atualizado para exigir `CI Gate`, e os nomes antigos de checks foram removidos.

Apesar disso, o problema principal **ainda está reproduzido no CI atual**.

No run #1241, associado ao head `db9056e`:

- Node 20.20.2: 108/108 suítes e 841/841 testes passaram, mas apareceu:
  `A worker process has failed to exit gracefully and has been force exited`;
- Node 22.23.2: o mesmo warning apareceu depois de 108/108 suítes e 841/841 testes aprovados;
- `Unit + Integration (20.x)` e `Unit + Integration (22.x)` falharam corretamente por causa do gate;
- `CI Gate` falhou como consequência;
- Smoke, Visual, E2E, Coverage, CI Contract, sintaxe, manifest e os diagnósticos isolados de background passaram;
- todos os jobs atuais de `Open Handles Diagnostic (...)` passaram.

Portanto, **o PR não está “falso verde” neste momento**. O gate está funcionando. O defeito remanescente é que pelo menos um worker do Jest ainda mantém um recurso vivo quando a suíte completa roda em paralelo.

A prioridade agora não é adicionar mais cleanup por suposição. A prioridade é **identificar qual recurso pertence a qual suíte/worker**, produzir uma reprodução mínima e corrigir o dono real.

---

## 2. Estado atual: o que NÃO deve ser refeito

### 2.1 Extração auxiliar

O ramo `isExtractionCandidate` em `extension/content_manga.js` já possui:

- `extractionTimeouts`;
- `extractionIntervals`;
- `stopImageWaiters`;
- `finishExtraction()` idempotente;
- descarte por `pagehide`;
- cancelamento de timers de mapping/retry;
- remoção de listeners `load`/`error`;
- cancelamento do polling;
- encerramento no timeout de segurança;
- guardas de atividade antes de executar callbacks tardios;
- encerramento após ACK persistido.

Os testes atuais em `tests/unit/content-manga/extraction-and-handlers-real.test.js` já cobrem, entre outros:

- ACK persistido sem retry tardio;
- ACK negativo seguido de confirmação;
- remoção do listener de descarte;
- `pagehide` cancelando retry;
- descarte durante mapping;
- prazo de segurança removendo polling/listeners.

### 2.2 RPA

`tests/unit/content-gemini/rpa-flow.test.js` já:

- guarda `processPromise`;
- interrompe o observer ativo;
- percorre o registry de observers;
- espera `processPromise` antes de terminar o teardown.

Não devemos alterar novamente esse teardown sem uma reprodução que aponte para ele.

### 2.3 Clique individual

`tests/unit/content-manga/floating-button-guard-and-single-click.test.js` já dispara `pagehide` no `afterEach` e espera o trabalho assíncrono necessário.

Novas mudanças aqui só devem ser feitas se o bisection provar que essa suíte participa da reprodução mínima.

### 2.4 Gate de worker

`tests/ci/run-jest-ci.js` captura o `stderr` do Jest e reprova quando encontra o warning de worker forçado.

O gate deve permanecer ativo durante toda a investigação.

**Proibido “resolver” removendo o detector.**

### 2.5 Ruleset da `main`

O ruleset ativo #23791606 atualmente exige:

- `JS Syntax Check`;
- `Manifest Validation`;
- `E2E Tests (Playwright)`;
- `Code Coverage`;
- `CI Gate`.

`strict_required_status_checks_policy` permanece habilitado.

Os contexts antigos `Smoke + Visual + Unit Tests (20.x/22.x)` já foram removidos.

Não é necessário alterar o ruleset novamente, salvo se os nomes dos jobs obrigatórios forem deliberadamente modificados.

---

## 3. O defeito restante comprovado

### Sintoma

Ao executar a suíte Jest completa em paralelo no runner Linux do GitHub Actions, todos os testes passam, mas o processo Jest detecta que um de seus workers não encerrou espontaneamente e o mata.

### Evidência do Node 20

Ambiente:

- Ubuntu 24.04.5;
- Node v20.20.2;
- npm 10.8.2.

Resultado:

- 108 suítes aprovadas;
- 841 testes aprovados;
- skipped = 0;
- TODO = 0;
- warning de worker forçado;
- gate retorna exit code 1.

### Evidência do Node 22

Ambiente:

- Ubuntu 24.04.5;
- Node v22.23.2;
- npm 10.9.8.

Resultado:

- 108 suítes aprovadas;
- 841 testes aprovados;
- skipped = 0;
- TODO = 0;
- warning de worker forçado;
- gate retorna exit code 1.

### O que os diagnósticos atuais provam

Os jobs de `Open Handles Diagnostic` do run #1241 passaram para os arquivos de background testados.

Isso **não prova que o background inteiro esteja inocente**, e muito menos que os outros sete projects do Jest estejam limpos, porque a matriz atual executa um arquivo por job.

Também não testa de forma suficiente:

- interação entre dois arquivos;
- interação entre projects;
- ordem de execução;
- recurso criado por um arquivo e deixado para o próximo arquivo do mesmo worker;
- recurso que só fica pendente quando a carga paralela altera o timing;
- recurso específico de jsdom;
- recurso criado no final de uma suíte que vira a última suíte daquele worker.

---

## 4. Hipóteses técnicas que devem ser discriminadas por evidência

Não escolher uma hipótese e editar código diretamente. A investigação deve separar as classes abaixo.

### H1 — timer real não rastreado no mock do Chrome

O `ChromeRuntimeMock` já rastreia os timers de resposta, e `ChromeAlarmsMock` possui cleanup.

Porém existem outros `setTimeout()` reais no mock completo, por exemplo em caminhos de:

- storage callbacks;
- tabs callbacks;
- conclusão simulada de criação de aba;
- `onInstalled`;
- outros mocks auxiliares.

Timers de 0–10 ms normalmente desaparecem rápido, mas um timer criado no fim da última suíte de um worker ainda precisa ser atribuído ao dono correto.

A solução não é simplesmente aplicar `.unref()` em todos. Primeiro é necessário provar qual timer sobrevive.

### H2 — timer/listener criado por jsdom/content scripts

Os projects:

- `content-scripts`;
- `popup`;
- `reader`;
- `shared-ui`;
- `integration`

usam jsdom e carregam `dom-environment.js`.

Esse setup inclui APIs simuladas e callbacks assíncronos. Um recurso que não existe no project `background` pode explicar por que os diagnósticos atuais de background ficam verdes enquanto a suíte completa falha.

### H3 — interação entre arquivos no mesmo worker

Um teste pode terminar aparentemente limpo, mas deixar estado singleton/listener/timer que só se torna problemático quando outro arquivo é executado depois no mesmo processo.

Nesse caso:

- arquivo A isolado passa;
- arquivo B isolado passa;
- A+B no mesmo worker reproduz;
- mudar ordem B+A pode ou não reproduzir.

Essa hipótese precisa de testes de combinação, não apenas arquivos individuais.

### H4 — interação entre projects do Jest

O config atual executa oito projects:

1. background;
2. gtc;
3. content-scripts;
4. popup;
5. reader;
6. manifest;
7. shared-ui;
8. integration.

Se cada project isolado ficar limpo, mas a suíte completa falhar, testar pares/grupos de projects passa a ser obrigatório.

### H5 — vazamento sensível ao número de workers

O PR já teve um commit de diagnóstico para `maxWorkers=1/2/4`, mas aquela rodada foi cancelada e não serve como conclusão atual.

O run atual precisa repetir essa varredura sobre o **head atual**.

O fato de Coverage estar verde não demonstra que `maxWorkers=2` corrige o problema, porque coverage usa outro config, instrumentação V8 e timing diferente.

### H6 — recurso não representado bem por `--detectOpenHandles`

`--detectOpenHandles` implica execução serial e muda o scheduling.

É possível que o leak seja um:

- Timeout;
- Immediate;
- MessagePort;
- socket/servidor;
- watcher;
- callback de ambiente;
- recurso nativo ou assíncrono cuja existência dependa da concorrência.

Por isso `--detectOpenHandles --runInBand` deve continuar sendo diagnóstico secundário.

---

## 5. Estratégia de investigação — ordem obrigatória

### Fase A — congelar a reprodução atual

Antes de qualquer correção:

1. registrar o SHA do head;
2. registrar o merge SHA usado pelo evento `pull_request`;
3. registrar Node/npm/Ubuntu;
4. guardar o log dos jobs 20.x e 22.x;
5. guardar o texto exato do warning;
6. registrar inventário 108/841;
7. registrar quais gates ficaram verdes e quais falharam.

Objetivo: impedir que uma nova alteração transforme a investigação em comparação entre ambientes diferentes.

---

## 6. Fase B — sweep real de quantidade de workers

Adicionar temporariamente um diagnóstico não obrigatório ou executar em branch de investigação com os mesmos arquivos do PR.

Rodar a suíte completa com:

```bash
npx jest --config jest.config.js --ci --maxWorkers=1
npx jest --config jest.config.js --ci --maxWorkers=2
npx jest --config jest.config.js --ci --maxWorkers=3
npx jest --config jest.config.js --ci --maxWorkers=4
```

Também registrar o comando sem `--maxWorkers`, pois esse é o comportamento real do gate.

Cada variante deve:

- preservar stderr;
- falhar se aparecer o warning;
- registrar tempo;
- registrar quantidade real de CPUs vista por Node;
- registrar `JEST_WORKER_ID` quando útil;
- ser repetida pelo menos três vezes se houver resultado inconsistente.

### Decisão

- **Só 1 worker fica limpo:** forte indicação de concorrência/interação.
- **1 e 2 limpos; 3+ falham:** problema dependente de pressão/paralelismo.
- **todos falham:** vazamento determinístico independente do número de workers.
- **nenhum sweep falha, mas default falha:** investigar cálculo automático de workers e timing do runner.
- **resultado varia entre repetições:** tratar como race; repetir a reprodução mínima várias vezes.

**Não transformar `maxWorkers=1` ou `maxWorkers=2` em “solução final” antes de encontrar o recurso.**

Limitar workers pode ser uma decisão de performance/estabilidade futura, mas não deve mascarar um teardown incorreto.

---

## 7. Fase C — isolar por project

Executar cada project sozinho usando o mesmo detector de warning:

```bash
npx jest --config jest.config.js --ci --selectProjects background
npx jest --config jest.config.js --ci --selectProjects gtc
npx jest --config jest.config.js --ci --selectProjects content-scripts
npx jest --config jest.config.js --ci --selectProjects popup
npx jest --config jest.config.js --ci --selectProjects reader
npx jest --config jest.config.js --ci --selectProjects manifest
npx jest --config jest.config.js --ci --selectProjects shared-ui
npx jest --config jest.config.js --ci --selectProjects integration
```

Usar o número de workers que reproduziu na Fase B.

### Se um project falhar sozinho

Esse project vira o universo do bisection.

### Se todos passarem sozinhos

Testar combinações, começando pelas que compartilham setup:

1. `content-scripts + integration`;
2. `content-scripts + popup + reader + shared-ui + integration`;
3. `background + content-scripts`;
4. `background + integration`;
5. `background + todos os jsdom`;
6. metade dos projects contra a outra metade.

A finalidade é descobrir se o warning depende de dois ambientes/configurações coexistindo na mesma invocação.

---

## 8. Fase D — bisection por arquivos, não por opinião

Quando um project ou grupo reproduzir:

1. listar os arquivos executados;
2. dividir em duas metades;
3. rodar cada metade com o mesmo número de workers;
4. manter a metade que reproduz;
5. repetir até chegar ao menor conjunto possível.

Se nenhuma metade isolada reproduzir, o leak depende da combinação entre as duas metades.

Nesse cenário:

- fixar um arquivo/conjunto “A”;
- testar A + metade de B;
- continuar reduzindo B;
- depois inverter.

### Teste de ordem

Com o menor conjunto:

- A B;
- B A;
- A B A;
- B A B.

A ordem é evidência valiosa para singleton global, listener herdado e timer agendado tarde.

### Repetição

Uma reprodução mínima só é aceita como confiável se:

- falhar várias vezes antes da correção;
- passar várias vezes depois da correção;
- não depender de sleep arbitrário.

---

## 9. Fase E — instrumentação de recursos assíncronos por suíte

Se o bisection chegar a um grupo pequeno, mas o recurso ainda não estiver evidente, adicionar instrumentação **temporária e opt-in**.

Sugestão:

```text
MT_DIAG_ASYNC_LEAKS=1
```

A instrumentação deve registrar, com PID/worker/suíte:

- `Timeout`;
- `Immediate`;
- `Interval`;
- MessagePort;
- TCP/servidor, se existir;
- watchers;
- outros recursos async relevantes.

### Abordagem recomendada

Usar `async_hooks` apenas no modo diagnóstico para guardar:

- asyncId;
- tipo;
- triggerAsyncId;
- stack de criação;
- nome do test file/project;
- timestamp;
- status destroy/ativo.

No teardown do ambiente de teste, produzir somente os recursos criados pela suíte que continuem ativos.

Salvar em algo semelhante a:

```text
tests/.ci-results/async-leaks/<pid>-<project>-<suite>.json
```

### Complemento

Usar `process._getActiveHandles()` e `process._getActiveRequests()` como informação adicional, não como única fonte.

### Requisito

A instrumentação:

- não pode rodar na CI normal após a investigação;
- não pode alterar semântica dos timers;
- não pode chamar `.unref()` automaticamente;
- não pode “limpar” o recurso antes de identificá-lo;
- deve existir para apontar o dono.

---

## 10. Fase F — auditar todos os schedulers do mock compartilhado

Quando houver evidência de que o leak passa por `tests/mocks/chrome-api.mock.js`, substituir schedulers dispersos por um lifecycle consistente.

### Meta

Cada recurso assíncrono criado pelo mock deve ter:

1. owner;
2. registry;
3. remoção quando dispara;
4. cleanup explícito no teardown.

### Candidatos a unificação

- Runtime;
- Storage;
- Tabs;
- Alarms;
- Downloads;
- callbacks simulados de instalação/startup.

Criar, se a reprodução justificar, um pequeno helper interno como:

```text
scheduleOwnedTimeout(owner, callback, delay)
clearOwnedTimeout(timer)
clearOwnedTimers(owner?)
disposeTransientResources()
```

Não é necessário transformar todos os mocks em uma arquitetura nova se um recurso específico for confirmado. O objetivo é o menor patch que forneça ownership correto e evite recorrência.

### Atenção ao Runtime singleton

O runtime preserva listeners do background entre testes por desenho.

Não remover indiscriminadamente listeners persistentes no `afterEach`.

Separar:

- listeners estruturais/persistentes do background;
- callbacks/timers transitórios criados pelo caso atual.

---

## 11. Fase G — auditar o setup jsdom se ele for implicado

Se o bisection apontar para projects jsdom, revisar:

- `tests/mocks/dom-environment.js`;
- `requestAnimationFrame` simulado;
- timers de UI;
- observers;
- listeners globais;
- Promises iniciadas por scripts carregados;
- `pagehide`/unload;
- recursos criados por `content_manga.js`, `content_gemini.js`, popup, reader e shared-ui.

### Regra

Não fazer cleanup genérico que esconda bug.

Exemplo ruim:

```js
afterEach(() => {
  jest.clearAllTimers();
});
```

se os timers em questão forem reais, externos ao fake timer atual ou se a linha só fizer o warning desaparecer sem provar ownership.

Exemplo desejado:

- a função que cria o recurso devolve um disposer;
- o teste/instância chama o disposer em toda saída terminal;
- existe uma regressão que falha quando esse disposer é removido.

---

## 12. Fase H — criar regressão exatamente para o recurso encontrado

Depois de identificar o recurso real, criar um teste pequeno e determinístico.

A regressão deve provar:

1. o recurso é criado;
2. o fluxo terminal ocorre;
3. o cleanup elimina o recurso;
4. callback tardio não executa;
5. o próximo caso não recebe efeito residual.

Se o problema depender da combinação de dois arquivos, criar:

- regressão unitária do lifecycle do recurso;
- e uma regressão de integração pequena que execute a sequência problemática.

### Não aceitar como regressão suficiente

- apenas `expect(messageCount).toBe(...)`;
- apenas aumento de timeout;
- apenas `await delay(...)`;
- teste que passa porque `--runInBand` mudou o scheduling;
- teste que chama diretamente cleanup que a produção nunca chama.

---

## 13. Fase I — validação em camadas

A correção só avança quando passar nesta ordem.

### 13.1 Teste mínimo

Executar o conjunto que reproduzia o warning.

Resultado esperado:

- antes: warning reproduzível;
- depois: sem warning.

### 13.2 Project afetado

Executar o project inteiro em paralelo.

### 13.3 Suíte completa local/Linux

```bash
npm run test:ci
```

Sem `--runInBand`.

### 13.4 Node 20 no GitHub Actions

Exigir:

- 108 ou mais suítes;
- 841 ou mais testes, respeitando o baseline vigente;
- skipped = 0;
- TODO = 0;
- zero warning de worker;
- exit code 0.

### 13.5 Node 22 no GitHub Actions

Mesmos critérios.

### 13.6 Repetição

Fazer pelo menos três execuções completas do caminho que anteriormente falhava, principalmente se o leak era timing-sensitive.

Uma única execução verde não é prova suficiente para um race.

---

## 14. Fase J — validar que a correção não degradou os demais gates

Depois que Unit + Integration estiver limpo:

- CI Contract: verde;
- Smoke: verde;
- Visual: verde;
- Code Coverage: verde;
- E2E Playwright: verde;
- JS Syntax Check: verde;
- Manifest Validation: verde;
- Version Integrity: verde;
- CI Gate: verde.

Também confirmar:

- nenhuma suíte `skip`;
- nenhum TODO;
- E2E flaky = 0;
- coverage acima dos thresholds;
- reporter E2E continua reprovando retry/flaky;
- worker gate continua ativo.

---

## 15. O que fazer com os jobs temporários de diagnóstico

Os jobs atuais `Open Handles Diagnostic (...)` são úteis durante a investigação, mas têm duas limitações:

1. focam somente alguns arquivos de background;
2. aumentam custo/tempo da CI normal.

Depois de encontrar e corrigir o leak:

### opção preferida

Mover diagnósticos pesados para:

- `workflow_dispatch`; ou
- condição por label/variável; ou
- script local/CI manual documentado.

Manter na CI obrigatória apenas:

- o gate real do Jest completo;
- self-test do detector.

O melhor detector permanente é o próprio `npm run test:ci`: se um worker voltar a vazar, a CI deve ficar vermelha.

---

## 16. Critérios de aceite finais

O PR #47 só pode ser considerado tecnicamente concluído quando TODOS os itens abaixo forem verdadeiros.

### Cleanup funcional

- [x] lifecycle da extração auxiliar centralizado;
- [x] timers/intervals/listeners descartados;
- [x] callbacks tardios protegidos;
- [x] regressões de ACK/retry/pagehide/safety timeout presentes.

### Teardowns

- [x] RPA espera runner e para observers;
- [x] clique individual descarrega a instância;
- [x] runtime mock limpa timers de canal conhecidos;
- [ ] recurso final responsável pelo worker forçado identificado;
- [ ] regressão específica desse recurso adicionada.

### Jest

- [x] warning de worker é gate;
- [ ] full suite paralela limpa em Node 20;
- [ ] full suite paralela limpa em Node 22;
- [ ] três execuções consecutivas sem warning;
- [ ] nenhuma necessidade de `--forceExit`;
- [ ] nenhuma necessidade de declarar `--runInBand` como fix.

### Gates

- [x] skipped/TODO bloqueados;
- [x] E2E flaky/retry bloqueado;
- [x] coverage protegido;
- [x] `CI Gate` consolida jobs obrigatórios;
- [ ] `CI Gate` verde depois da correção do leak.

### Ruleset

- [x] contexts antigos removidos;
- [x] `CI Gate` obrigatório;
- [x] strict status checks preservado;
- [ ] confirmar no SHA final que a UI do PR reconhece todos os checks obrigatórios.

---

## 17. Ordem recomendada de implementação

### Passo 1 — não tocar mais no código funcional ainda

Reproduzir o warning no head atual e executar sweep de workers.

### Passo 2 — project isolation

Executar os oito projects separadamente usando o mesmo gate de warning.

### Passo 3 — combinações

Se todos os projects isolados passarem, testar combinações entre os projects, principalmente os que compartilham jsdom/setup.

### Passo 4 — bisection

Reduzir para o menor conjunto de arquivos que ainda reproduz.

### Passo 5 — instrumentação

Somente se o menor conjunto ainda não revelar o owner, ativar `async_hooks`/active handles por suíte.

### Passo 6 — correção mínima

Corrigir o owner do recurso. Não espalhar `clearTimeout` defensivo em arquivos sem relação comprovada.

### Passo 7 — regressão

Criar teste que falha sem a correção.

### Passo 8 — validação Node 20/22

Executar a suíte completa paralela no GitHub Actions.

### Passo 9 — repetição

Reexecutar para provar estabilidade.

### Passo 10 — limpar instrumentação temporária

Remover jobs/scripts experimentais que não agreguem proteção permanente.

### Passo 11 — documentação final

Atualizar:

- `docs/REGRESSOES_PR47.md` com causa raiz, reprodução mínima e teste permanente;
- `docs/PLANO_CORRECAO_PENDENCIAS_PR47.md` marcando as etapas concluídas;
- este arquivo com SHA/run final.

---

## 18. Formato do relatório de causa raiz

Quando o problema for resolvido, registrar exatamente:

```text
Causa raiz:
Recurso que permanecia vivo:
Arquivo/função que o criava:
Por que o teardown anterior não o removia:
Por que aparecia somente na suíte paralela:
Menor comando que reproduzia:
Teste que falhava antes:
Patch aplicado:
Node 20 run:
Node 22 run:
Número de repetições limpas:
CI Gate:
Ruleset:
```

Evitar descrições vagas como “problema de timing resolvido”.

A documentação deve permitir que outra pessoa recrie o defeito e entenda por que o patch é correto.

---

## 19. Anti-soluções proibidas

Não aceitar como solução:

- `jest --forceExit`;
- remover o detector de warning;
- ignorar stderr;
- `continue-on-error` no Unit + Integration;
- reduzir baseline de testes;
- adicionar `.skip`;
- aumentar timeout sem causa demonstrada;
- trocar toda a suíte para `--runInBand`;
- reduzir permanentemente workers só para esconder o warning;
- `.unref()` em timer que deveria ser cancelado;
- sleep para “dar tempo de terminar”;
- remover testes problemáticos;
- considerar verde só porque 841 assertions passaram.

---

## 20. Resultado esperado

Ao final, o PR #47 deve provar simultaneamente:

1. as correções funcionais combinadas dos PRs #44/#46 continuam intactas;
2. a extração auxiliar não deixa recursos residuais;
3. os testes não contaminam uns aos outros;
4. nenhum worker Jest precisa ser morto;
5. Node 20 e Node 22 encerram normalmente;
6. skipped/TODO/flaky continuam proibidos;
7. coverage e E2E continuam íntegros;
8. `CI Gate` fica verde por mérito, não por relaxamento;
9. o ruleset da `main` exige exatamente o gate atual;
10. existe uma regressão permanente para a causa raiz encontrada.

O ponto central é simples: **o warning de worker não deve ser silenciado; deve deixar de existir porque o recurso que o mantém vivo passa a ter ownership e teardown corretos.**


## Encerramento executado — 28/09/2026

Este plano foi executado até a causa-raiz, sem recorrer às anti-soluções listadas acima.

### Resultado da investigação

- Sweep de workers mostrou: 2 workers limpos e 3/default reproduzindo o warning em rodadas intermediárias.
- Isolamento por project mostrou `background` como project capaz de reproduzir sozinho.
- Delta debugging reduziu 44 arquivos a `process-finalize-real.test.js + regex-escape.test.js`, com reprodução 4/4.
- O timer de 4 s do fallback `handleMarkerAndShow()` não era possuído pelo teardown de `regex-escape`.
- O teardown passou a cancelar o recurso no dono correto.
- Após a correção, o project `background` e o Jest completo deixaram de emitir o warning.

### Validação final

Head funcional validado: `d940df4ddf982a7b45c423ba74901b993fc37f06`.

GitHub Actions run #1355 (`36369097974`):

| Gate | Resultado |
| --- | --- |
| Version Integrity | success |
| JS Syntax Check | success |
| Manifest Validation | success |
| CI Contract | success |
| Smoke Tests | success |
| Visual Tests | success |
| Unit + Integration Node 20 | success |
| Unit + Integration Node 22 | success |
| Code Coverage | success |
| E2E Tests (Playwright) | success |
| CI Gate | success |

Jest: **108 suítes / 847 testes**, skipped=0, TODO=0, sem worker forçado.

Coverage: `job-runner.js` **65,67% branches**, acima de 64%; global **79,52 / 71,68 / 82,71 / 79,52** (statements/branches/functions/lines).

E2E: **21/21 passed**, skipped=0, flaky=0, failed=0.

### Estado das anti-soluções

- `--forceExit`: não usado;
- remoção do detector: não feita;
- ignorar stderr: não feito;
- `.skip`/TODO: não usados;
- redução de baseline: não feita;
- redução do threshold de coverage: não feita;
- `--runInBand` como solução permanente: não usado;
- redução permanente de workers para esconder o problema: não feita.

### Operação contínua

Os diagnósticos exploratórios pesados foram movidos para `workflow_dispatch`, mas permanecem disponíveis para investigação futura. O job obrigatório `Unit + Integration` continua falhando se o warning do worker reaparecer.

O ruleset #23791606 exige `CI Gate` e os checks reais atuais, com strict status checks habilitado.


## Pós-fechamento — matriz de regressões obrigatórias

A finalização foi endurecida com uma proteção adicional de manutenção:

1. o caminho real de `handleMarkerAndShow()` ganhou `REG-WORKER-4S`, que observa o timer de 4 s antes do teardown e exige seu cancelamento;
2. o helper de ownership expõe contagem/delays somente para testes;
3. `tests/ci/regression-matrix.json` lista as regressões críticas;
4. o `CI Contract` falha se qualquer teste/marcador obrigatório da matriz desaparecer;
5. o baseline mínimo Jest passa a **108 suítes / 848 testes**.

A matriz não substitui a execução dos testes: ela garante que os testes críticos continuem fazendo parte dos gates que já os executam.
