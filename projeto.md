# Projeto de otimização dos testes E2E — PR #47

## 1. Objetivo

Reduzir de forma significativa o tempo de execução dos testes E2E do PR #47 sem enfraquecer a proteção criada pelos PRs #44/#46 e sem transformar a CI em um conjunto de testes “verdes por omissão”.

Este projeto parte de quatro regras obrigatórias:

1. **Nenhum E2E pode ser pulado para ganhar velocidade.**
2. **Nenhum retry pode esconder flakiness.**
3. **A cobertura funcional atual do PR #47 deve ser preservada ou ampliada.**
4. **O ganho deve vir de remover espera artificial, tornar os mocks determinísticos e usar paralelismo seguro — não de simplesmente aumentar timeouts ou desabilitar validações.**

O baseline protegido no PR #47 permanece:

- mínimo de **21 E2E descobertos**;
- **0 skipped**;
- **0 flaky/retry aceito**;
- **0 falhas finais**.

---

## 2. Baseline medido no PR #47

Medição baseada no workflow **MangaTranslator CI / run #1233**, no commit do PR #47 que executou 21/21 E2E com sucesso.

### Tempo observado

| Parte | Tempo aproximado |
|---|---:|
| Job E2E completo | **~5m13s** |
| Comando Playwright | **~4m40s** |
| Setup anterior ao Playwright | **~32s** |
| `npm ci` | **~2s** |
| Instalação Playwright/Chromium + deps | **~23s** |
| Geração das imagens de fixture | **< 0,1s** |

Conclusão: **o gargalo principal não é npm nem geração das imagens; é a execução dos próprios cenários E2E.**

O Playwright reportou:

```text
Running 21 tests using 2 workers
21 passed (4.7m)
```

---

## 3. Gargalos encontrados

### 3.1. `translation-flow.spec.js` monopoliza um worker

O arquivo concentra a maior parte dos testes caros e, por padrão, os testes dentro do mesmo arquivo são executados em série.

Enquanto isso:

- `reader-offline.spec.js` termina muito cedo;
- `cache-and-storage.spec.js` também termina muito antes;
- o segundo worker acaba ficando sem trabalho enquanto o primeiro continua processando `translation-flow.spec.js`.

Isso significa que o CI possui paralelismo disponível, mas a organização atual do arquivo impede seu aproveitamento.

### 3.2. Cada teste de `translation-flow.spec.js` abre um Chromium persistente novo

Hoje o arquivo usa:

```js
test.beforeEach(async () => {
    browserContext = await chromium.launchPersistentContext(...)
});
```

e fecha o contexto no `afterEach`.

Isso é seguro em termos de isolamento, porém custa inicialização/encerramento do Chrome para praticamente cada cenário.

Não é o maior gargalo, mas se repete muitas vezes e deve ser medido.

### 3.3. FIFO A→G é o teste individual mais caro

Tempo aproximado observado:

- início do FIFO: ~23:59:04;
- próximo teste: ~00:00:29;
- custo aproximado: **~85s**.

O próprio teste adiciona:

```text
attachmentDelayMs=2500
```

para manter o lote A vivo tempo suficiente para B→G entrarem na fila.

Esse atraso resolve uma corrida usando tempo de relógio. É funcional, mas caro e desnecessariamente dependente da velocidade do runner.

### 3.4. O mock do resultado adiciona 2 segundos a toda imagem gerada

O endpoint `/gemini-result-image` possui:

```js
setTimeout(() => {
    ...
}, 2000);
```

Esse atraso de 2 segundos é aplicado a cada resultado bem-sucedido.

Nos cenários atuais existem muitas traduções individuais; portanto, são dezenas de segundos de latência artificial acumulada. A latência ajuda a simular assincronicidade, mas **não é necessário usar 2 segundos em todos os testes** para provar essa propriedade.

### 3.5. Os três testes de attachment failure consomem ~20s reais cada

No runtime real:

```js
timeoutMs: 20_000,
retryAfterMs: 3500,
maxDispatches: 3
```

e, quando falha:

```text
GEMINI_ATTACHMENT_NOT_CONFIRMED
```

é emitido após aproximadamente 20 segundos.

Tempos observados no run #1233:

| Cenário | Tempo aproximado |
|---|---:|
| temp_chat | ~25s |
| minimized_window | ~23s |
| background_delete | ~24s |

Somados serialmente, representam aproximadamente **72 segundos**.

Importante: o projeto **não recomenda simplesmente reduzir o timeout de produção de 20s para fazer a CI passar mais rápido**. O primeiro ganho deve ser executar esses cenários em paralelo.

### 3.6. Há várias esperas de tempo fixo no fluxo real

Foram encontrados, entre outros:

- estabilidade mínima do composer: **1500 ms**;
- pausa após conversa temporária: **1500 ms**;
- pausa depois de attachment confirmado: **1000 ms**;
- pausa após injetar prompt: **200 ms**;
- pausa antes do submit: **1000 ms**;
- mock de geração: **1200 ms**;
- mock de download da imagem: **2000 ms**.

Algumas podem ser requisitos reais; outras são candidatos a serem substituídos por “esperar a condição correta”.

O E2E acaba pagando toda essa latência em praticamente cada job.

### 3.7. Uso excessivo de `networkidle`

Há várias chamadas como:

```js
await page.waitForLoadState('networkidle');
```

em páginas locais controladas pelo próprio mock.

`networkidle` contém uma janela de silêncio de rede e pode adicionar atraso desnecessário. Para esses testes, é melhor esperar diretamente pelo elemento/estado que torna a página pronta.

### 3.8. Retry configurado contradiz o gate atual

O Playwright está configurado com:

```js
retries: 2
```

mas o reporter do PR #47 exige:

```text
maxFlaky = 0
```

e considera `failed -> passed` ou `timedOut -> passed` como falha do gate.

Logo, no CI atual:

- retry **não pode tornar a CI verde**;
- retry só torna uma execução problemática mais longa;
- uma falha pode ser executada até três vezes antes de o gate rejeitá-la.

Isso deve ser corrigido.

---

# 4. Estratégia recomendada

A otimização deve ser feita em fases. Cada fase precisa ser testada isoladamente para sabermos qual mudança realmente economizou tempo e qual introduziu risco.

---

## Fase 0 — Instrumentação de desempenho

### Objetivo

Parar de avaliar desempenho pelo tempo total apenas e registrar o custo de cada teste.

### Implementar

1. Adicionar um reporter de timing ou ampliar o reporter atual para registrar:
   - nome do teste;
   - duração;
   - worker;
   - número de tentativa;
   - arquivo/spec;
   - top 10 testes mais lentos.

2. Gerar artifact, por exemplo:

```text
tests/test-results/e2e-timings.json
```

3. Imprimir resumo no log:

```text
[E2E PERF] total=...
[E2E PERF] slowest:
1. FIFO A-G ........ 85.2s
2. attachment temp . 25.2s
...
```

4. Guardar o tempo total por execução para comparar antes/depois.

### Critério de aceitação

A instrumentação não altera comportamento nem duração de forma significativa e os 21 E2E continuam first-pass.

---

## Fase 1 — Quick wins de risco baixo

### 1.1. Remover retries inúteis na CI

Configurar:

```js
retries: process.env.CI ? 0 : 0
```

ou, preferencialmente, permitir retry apenas quando solicitado explicitamente para diagnóstico:

```text
MANGA_E2E_RETRIES=1
```

Com isso, o modo normal continua estrito e uma falha não é executada 3 vezes.

**Impacto no green run:** pequeno.

**Impacto em CI com falha:** potencialmente muito grande.

### 1.2. Trocar `networkidle` por readiness específico

Exemplo:

em vez de:

```js
await page.goto(url);
await page.waitForLoadState('networkidle');
await expect(mainContent).toBeVisible();
```

usar:

```js
await page.goto(url, { waitUntil: 'domcontentloaded' });
await expect(mainContent).toBeVisible();
await expect(...condição funcional...).toBe(...);
```

Aplicar a:

- `translation-flow.spec.js`;
- `cache-and-storage.spec.js`;
- demais páginas controladas pela fixture.

O teste deve esperar o estado que realmente importa, não silêncio genérico da rede.

### 1.3. Remover espera fixa do teste manual

Hoje:

```js
await manual.waitForTimeout(1500);
```

Substituir por uma condição observável:

- status do mock;
- ausência de attachment;
- log `JOB_NOT_FOUND`;
- ausência de keepalive.

### 1.4. Remover esperas fixas do reader quando houver estado observável

O reader usa três vezes:

```js
waitForTimeout(450)
```

após ArrowRight.

Substituir por espera no contador/progresso correspondente após cada entrada.

---

## Fase 2 — Tornar o mock rápido e determinístico

Essa é uma das fases com maior potencial.

### 2.1. Parametrizar o atraso de `/gemini-result-image`

Em vez de 2000 ms fixos:

```text
resultImageDelayMs
```

com valor padrão de teste pequeno, por exemplo 50–100 ms.

Manter **um teste específico** com delay maior, por exemplo 300–500 ms, para provar que o fluxo continua assíncrono.

Não precisamos pagar 2 segundos em toda imagem para testar a mesma propriedade dezenas de vezes.

### 2.2. Remover o delay de 2500 ms do FIFO

Não trocar simplesmente 2500 por 200.

A solução robusta é criar uma **barreira determinística** no mock.

Exemplo conceitual:

1. lote A chega ao mock;
2. mock registra `A_ATTACHED`;
3. mock segura A em estado conhecido;
4. teste inicia B→G;
5. teste verifica que B→G estão em `pendingBatches`;
6. teste envia `RELEASE_A`;
7. a fila continua.

Possíveis implementações:

- endpoint de controle no mock;
- estado compartilhado no `gemini-mock-server.js`;
- query parameter com identificador de barrier;
- endpoint `/e2e/control/release?id=...`.

### Benefícios

- elimina corrida baseada em milissegundos;
- FIFO fica mais rápido;
- FIFO fica mais estável em máquina lenta;
- comportamento fica reprodutível;
- o teste passa a validar scheduler, não velocidade do runner.

### Meta

Levar o FIFO de ~85s para uma faixa muito menor sem reduzir A→G nem remover verificações de ordem/stale.

---

## Fase 3 — Paralelizar `translation-flow` com isolamento real

Essa é provavelmente a maior redução de **wall-clock**.

Hoje os ~14 cenários de `translation-flow.spec.js` são serializados dentro de um único arquivo.

### Opção A — menor mudança

Adicionar ao describe:

```js
test.describe.configure({ mode: 'parallel' });
```

Como cada teste já cria um `launchPersistentContext` próprio, eles são naturalmente isolados.

O Playwright executa workers em processos separados, então os globals do arquivo não são compartilhados entre workers.

### Cuidados

Antes de ativar:

- confirmar que o mock HTTP é stateless por aba/job;
- confirmar que endpoints de controle novos usam identificadores únicos;
- confirmar que nenhum teste depende de estado global no servidor;
- manter userDataDir único;
- manter storage da extensão isolado por persistent context.

### Opção B — organização recomendada a médio prazo

Dividir o arquivo grande:

```text
e2e/
  translation-core.spec.js
  translation-fifo.spec.js
  translation-execution-modes.spec.js
  translation-attachment-gate.spec.js
  translation-result-ownership.spec.js
  translation-manual.spec.js
```

Criar helper compartilhado:

```text
e2e/helpers/extension-context.js
```

com:

- `getBrowserModeConfig`;
- `getExtensionPath`;
- `getBackgroundWorker`;
- `resetExtensionState`;
- `readStorage`;
- criação/cleanup de persistent context.

### Por que dividir ajuda

Playwright paraleliza arquivos naturalmente.

O FIFO, que é longo, pode rodar enquanto outro worker executa attachment/result ownership.

Hoje isso não acontece porque todos estão no mesmo arquivo.

### Número de workers

Primeiro manter **2 workers explícitos no CI** para comparar com o baseline.

Depois medir:

- 2 workers;
- 3 workers;
- 4 workers.

Não escolher 4 apenas porque “é maior”. Chromium + extensões MV3 consomem CPU/RAM e paralelismo excessivo pode aumentar flakiness.

O número final deve ser escolhido pelo menor tempo **com 0 flaky em execuções repetidas**.

---

## Fase 4 — Fazer os três timeouts de attachment ocorrerem em paralelo

Os cenários:

- `temp_chat`;
- `minimized_window`;
- `background_delete`;

precisam continuar cobertos.

A recomendação conservadora é **preservar o timeout real de 20s** inicialmente, mas permitir que esses três testes rodem em workers diferentes.

Assim a parede de tempo tende a se aproximar do cenário mais lento (~25s), em vez de somar aproximadamente 72s.

Isso preserva a semântica real e oferece um ganho grande sem criar um “modo E2E falso”.

Somente depois disso devemos avaliar se o timeout real de 20s precisa de uma estratégia de teste específica.

---

## Fase 5 — Reduzir inicializações do Chromium

Hoje `translation-flow` cria um persistent context por teste.

Existem duas estratégias.

### Estratégia segura inicial

Manter contexto por teste enquanto introduzimos paralelismo.

Vantagem: isolamento alto.

### Estratégia experimental posterior

Criar um contexto por worker/arquivo e limpar entre testes:

- todas as páginas extras;
- todas as abas Gemini;
- `chrome.storage.local`;
- IndexedDB;
- alarms;
- listeners temporários;
- pending batches;
- service worker state relevante.

Somente adotar se:

1. rodar repetidamente sem vazamento;
2. teste de ordem aleatória continuar verde;
3. não aparecer dependência entre testes.

Reutilizar browser/context cedo demais pode trocar velocidade por flakiness. Portanto, **não é a primeira otimização recomendada**.

---

## Fase 6 — Otimizar instalação do Playwright

O setup representa ~32s; vale otimizar, mas depois dos testes.

### Opção 1 — cache do browser Playwright

Cachear:

```text
~/.cache/ms-playwright
```

com chave baseada em:

- OS;
- versão do Playwright/package-lock.

Quando cache existir, evitar novo download.

### Opção 2 — evitar `--with-deps` em toda execução

O log atual mostra que muitas dependências já existem no runner.

Testar:

```bash
npx playwright install chromium
```

sem `--with-deps`.

Só manter `install-deps` se realmente necessário.

### Opção 3 — imagem/container Playwright

Usar imagem oficial com browser/deps pré-instalados.

Só vale a pena se:

- versão do browser bater com a versão do pacote;
- extensão MV3 funcionar da mesma forma;
- o custo de iniciar o container for menor que o setup atual.

Essa opção deve ser benchmark, não assumida como automaticamente melhor.

---

## Fase 7 — Refatorar sleeps do runtime para condições reais

Esta fase tem potencial de melhorar **o produto e os testes**, mas é mais sensível.

Candidatos atuais:

```text
waitForStableComposer: mínimo 1500 ms
após temp chat: 1500 ms
após attachment confirmado: 1000 ms
após injetar prompt: 200 ms
antes do submit: 1000 ms
```

A pergunta para cada espera deve ser:

> “Qual condição real esse sleep está tentando garantir?”

Exemplos:

- composer estável;
- attachment visível;
- prompt persistido no editor;
- botão de envio habilitado;
- model turn criado.

Se a condição puder ser observada diretamente, substituir o sleep por polling/evento com timeout máximo.

### Regra

Nunca trocar:

```js
sleep(1000)
```

por:

```js
sleep(50)
```

apenas para acelerar CI.

Trocar por condição é robustez.

Trocar apenas o número é esconder uma corrida.

---

# 5. Arquitetura proposta para os E2E

## Helpers comuns

Criar:

```text
tests/e2e/helpers/
  extension-context.js
  storage.js
  readiness.js
  timing.js
```

### `extension-context.js`

Responsável por:

- launch persistent context;
- extension path;
- service worker;
- cleanup.

### `storage.js`

Responsável por:

- reset do estado;
- leitura do storage;
- limpeza de GTC/StorageManager.

### `readiness.js`

Responsável por conditions como:

- manga pronto;
- botão flutuante pronto;
- batch finalizado;
- resultado aplicado;
- Gemini tab count.

### `timing.js`

Somente telemetria de teste, não lógica de produção.

---

# 6. Plano específico por teste atual

## Core de tradução

Preservar:

- seleção correta de imagens;
- exclusão de avatar/banner;
- data URL final;
- batch finalizado;
- botão atualizado.

Otimizar:

- sem `networkidle`;
- mock result rápido;
- contexto isolado.

## FIFO A→G

Preservar integralmente:

- A ativo;
- B→G em pending na ordem;
- promoção na ordem;
- resultados corretos;
- sem stale/mismatch;
- fila vazia;
- logs `BATCH_QUEUED`, `BATCH_PROMOTED`, `BATCH_DONE`.

Otimizar:

- substituir `attachmentDelayMs=2500` por barrier.

## minimized_window / background_delete

Preservar:

- tradução concluída;
- batch concluído;
- `DELETE_OK`;
- sem ghost mousemove.

Rodar em paralelo quando isolado.

## resposta rápida

Preservar resposta no mesmo task lógico.

Mock pode continuar usando `fastResult=1`.

Esse teste não precisa pagar delay padrão de imagem de 2s.

## shadow DOM

Preservar:

- model turn aceito;
- `new_model_turn`;
- sem intervenção manual.

## submit ignorado

Preservar falha cedo e limpeza da fila.

Preferir assert de evento, não timeout de parede como mecanismo principal.

## attachment gate

Preservar os três modos.

Primeira otimização: paralelismo.

Não reduzir o timeout de produção apenas por velocidade.

## result ownership

Preservar:

- rejeição `user_turn`;
- rejeição `missing_model_owner`;
- aceitação `new_model_turn`.

Pode rodar em paralelo por modo.

## aba Gemini manual

Remover `waitForTimeout(1500)` e esperar estados observáveis.

---

# 7. CI proposta

## Etapa 1 — manter um único job E2E

Primeiro otimizar dentro de um runner:

```text
E2E Tests (Playwright)
  - checkout
  - node
  - npm ci
  - browser/cache
  - fixtures
  - Playwright 2 workers
  - gate reporter
  - timings
```

Isso mantém o gate simples.

## Etapa 2 — só depois avaliar sharding entre jobs

Exemplo conceitual:

```text
e2e-shard 1/3
e2e-shard 2/3
e2e-shard 3/3
```

Vantagem:

- mais redução de wall-clock.

Desvantagens:

- cada shard paga setup;
- mais minutos de CI;
- reporter atual exige mínimo de 21 testes **por execução**, então precisaria ser adaptado;
- seria necessário um gate agregado para garantir que o inventário total continua >= 21.

Por isso, sharding de jobs fica como fase posterior.

---

# 8. Mudanças no gate necessárias para otimização

O gate rigoroso do PR #47 deve continuar.

### Manter

- mínimo total de E2E;
- 0 skipped;
- 0 flaky;
- 0 failures;
- histórico de tentativas.

### Ajustar

Se `retries=0` na CI:

- reporter continua válido;
- self-test de retry continua útil para proteger futuras regressões da configuração.

Se futuramente houver sharding:

- cada shard reporta seus testes;
- job agregador soma inventário;
- inventário esperado é validado uma única vez no agregado;
- qualquer shard skipped/flaky/fail derruba o gate.

---

# 9. Ordem de implementação recomendada

## PR47-E2E-OPT-01 — Métricas

- reporter de timing;
- artifact JSON;
- top slow tests.

## PR47-E2E-OPT-02 — Esperas de teste

- retries=0 no CI;
- remover `networkidle` onde não necessário;
- remover waits fixos dos próprios specs.

## PR47-E2E-OPT-03 — Mock rápido

- `resultImageDelayMs`;
- default pequeno;
- um cenário dedicado com atraso;
- sem alterar semântica de produção.

## PR47-E2E-OPT-04 — FIFO determinístico

- barrier;
- remover delay de 2500 ms;
- manter A→G completo.

## PR47-E2E-OPT-05 — Paralelismo

- dividir specs ou usar parallel describe;
- começar com 2 workers;
- benchmark 2/3/4.

## PR47-E2E-OPT-06 — Attachment modes

- rodar os três timeouts simultaneamente;
- preservar 20s real.

## PR47-E2E-OPT-07 — Browser setup

- cache Playwright;
- avaliar remoção de `--with-deps`.

## PR47-E2E-OPT-08 — Runtime event-driven

- substituir sleeps do produto por condições reais, somente onde comprovadamente seguro.

---

# 10. Metas de desempenho

Essas são metas, não garantias. Cada etapa deve ser medida.

### Baseline

```text
Playwright: ~4m40s
Job E2E:   ~5m13s
```

### Meta intermediária

Após mock rápido + esperas específicas + paralelismo seguro:

```text
Playwright: <= 3m
```

### Meta desejada

Após FIFO determinístico e melhor balanceamento entre workers:

```text
Playwright: <= 2m30s
```

### Stretch goal

Somente se continuar 100% estável:

```text
Job E2E total: ~2m ou menos
```

Não sacrificar confiabilidade para atingir o stretch goal.

---

# 11. Protocolo de validação

Toda otimização deve passar:

1. executar E2E completo;
2. confirmar >= 21 testes;
3. confirmar 0 skipped;
4. confirmar 0 flaky;
5. confirmar 0 retry;
6. confirmar 0 failed;
7. executar pelo menos **5 rodadas consecutivas**;
8. comparar:
   - mediana;
   - p95;
   - teste mais lento;
   - tempo total;
9. executar também os E2E individualmente;
10. confirmar que paralelismo não cria dependência de ordem.

Para mudanças em FIFO/attachment:

- rodar também sob CPU mais carregada quando possível;
- a lógica deve continuar determinística mesmo quando o runner estiver lento.

---

# 12. Critérios de rejeição

Uma “otimização” deve ser rejeitada se:

- adicionar `test.skip`;
- reduzir baseline para esconder teste removido;
- usar `continue-on-error` no E2E;
- permitir flaky;
- usar retry para deixar o gate verde;
- trocar espera por sleep arbitrariamente curto;
- reduzir timeout de produção sem justificativa funcional;
- compartilhar contexto entre testes com vazamento de state;
- tornar resultado dependente da ordem em que Playwright agenda os testes.

---

# 13. Melhor combinação inicial

A combinação de melhor relação ganho/risco para o PR #47 é:

1. **instrumentar duração por teste**;
2. **CI com retries=0**;
3. **remover `networkidle` desnecessário**;
4. **reduzir o delay artificial de 2s do mock, mantendo um teste de delay**;
5. **trocar FIFO 2500ms por barrier determinístico**;
6. **paralelizar os testes independentes de `translation-flow`**;
7. **deixar os três attachment-failure rodarem simultaneamente**;
8. só então avaliar reuse de browser e sharding de jobs.

Essa ordem conserva o objetivo do PR #47: CI rigorosa, first-pass e sem mascarar flakiness.

---

# 14. Resultado esperado do projeto

Ao final, o E2E deve ser:

- mais rápido;
- mais determinístico;
- menos dependente de milissegundos arbitrários;
- mais fácil de diagnosticar;
- distribuído entre workers;
- igualmente rigoroso ou mais rigoroso que o atual;
- capaz de dizer exatamente **qual teste ficou lento e por quê**.

A otimização não deve fazer “menos teste”.

Ela deve fazer **o mesmo teste com menos tempo desperdiçado esperando o relógio**.


---

# 15. Matriz detalhada de paralelização dos 21 E2E

Esta seção detalha quais testes do PR #47 podem rodar simultaneamente **com o código atual**, quais precisam permanecer seriais e quais só devem ser paralelizados após mudar o isolamento.

## 15.1. Estado atual relevante

O Playwright atual já usa **2 workers** no runner observado, mas o paralelismo efetivo é ruim porque:

- arquivos diferentes podem rodar simultaneamente;
- testes dentro do mesmo arquivo continuam em ordem por padrão;
- `translation-flow.spec.js` contém **14 dos 21 testes**;
- esses 14 testes ficam presos ao mesmo fluxo serial;
- `reader-offline.spec.js` termina muito cedo;
- `cache-and-storage.spec.js` termina muito antes do `translation-flow`;
- portanto um worker fica ocioso enquanto o outro continua executando o arquivo mais pesado.

O problema principal é **granularidade de agendamento**, não falta absoluta de workers.

---

## 15.2. Grupo A — seguros para paralelizar imediatamente

Os 14 testes de `translation-flow.spec.js` já criam um `chromium.launchPersistentContext()` novo no `beforeEach`.

Cada teste recebe:

- `userDataDir` único;
- `chrome.storage.local` próprio;
- IndexedDB próprio do perfil;
- service worker próprio;
- abas próprias;
- estado JS da extensão isolado;
- DOM próprio.

O mock HTTP compartilhado na porta 3999 não mantém uma sessão global do teste. Os estados importantes do mock, como:

- `attachmentSeen`;
- `attachmentAttempts`;
- `running`;

existem dentro do JavaScript de **cada página**, não como estado global no processo do servidor.

Por isso estes cenários são logicamente independentes entre si.

### Matriz

| Teste | Paralelizar? | Peso aproximado | Observação |
|---|---|---:|---|
| fluxo ponta a ponta básico | **SIM** | ~19s | contexto próprio |
| FIFO A→G | **SIM, com cautela de recursos** | ~85s | muitas páginas/abas; ideal junto de teste leve |
| minimized_window | **SIM** | ~14s | contexto próprio |
| background_delete | **SIM** | ~15s | contexto próprio |
| resposta rápida | **SIM** | ~9s | excelente candidato |
| shadow DOM | **SIM** | ~10s | excelente candidato |
| submit ignorado | **SIM** | ~17s | independente |
| attachment gate / temp_chat | **SIM** | ~25s | grande ganho se paralelo |
| attachment gate / minimized | **SIM** | ~23s | grande ganho se paralelo |
| attachment gate / background_delete | **SIM** | ~24s | grande ganho se paralelo |
| result ownership / temp_chat | **SIM** | ~10s | independente |
| result ownership / minimized | **SIM** | ~9s | independente |
| result ownership / background_delete | **SIM** | ~9s | independente |
| Gemini manual | **SIM**, mantendo contexto exclusivo | ~3s | adiciona listener no SW; não reutilizar seu contexto |

### Primeira implementação recomendada

Adicionar somente ao describe do `translation-flow.spec.js`:

```js
test.describe.configure({ mode: 'parallel' });
```

e fixar no CI inicialmente:

```js
workers: process.env.CI ? 2 : undefined
```

Isso permite que Playwright distribua os 14 testes entre os dois workers, mantendo `cache-and-storage` e `reader-offline` com o comportamento atual.

---

# 16. Testes que NÃO devem ser paralelizados internamente ainda

## 16.1. `cache-and-storage.spec.js`

Os quatro testes deste arquivo compartilham um único persistent context criado em `beforeAll`.

O `beforeEach` limpa storage, mas todos continuam usando:

- o mesmo browser profile;
- o mesmo service worker;
- o mesmo `chrome.storage.local`;
- o mesmo IndexedDB;
- a mesma extensão carregada.

Portanto:

> **o arquivo pode rodar simultaneamente com outros arquivos, mas seus quatro testes não devem rodar simultaneamente entre si na arquitetura atual.**

Testes:

1. salva páginas no storage;
2. host espelho usa GTC;
3. reload reaplica restoreMap;
4. debug mode mantém abas Gemini.

Para paralelizá-los internamente seria necessário trocar `beforeAll` por contexto exclusivo por teste ou construir fixture de isolamento equivalente.

### Recomendação

**Não fazer isso agora.**

Esse arquivo já economiza inicialização do browser reutilizando um contexto e não é o maior gargalo.

---

## 16.2. `reader-offline.spec.js`

Também usa persistent context compartilhado em `beforeAll`.

Os testes mexem em:

- `chapterList`;
- chaves de imagens por capítulo;
- localStorage do reader;
- storage da extensão.

Apesar de cada teste usar chapter IDs diferentes em vários pontos, o reset global e o contexto compartilhado tornam paralelismo interno desnecessariamente arriscado.

### Recomendação

Manter os três testes seriais dentro do arquivo.

O arquivo inteiro já é muito rápido; não vale trocar isolamento por ganho de poucos segundos.

---

# 17. Estimativa do ganho apenas com melhor agendamento

A medição anterior permite estimar aproximadamente:

```text
translation-flow ≈ 274 s de trabalho serial
cache-and-storage ≈ 80 s
reader-offline ≈ 4 s
```

Esses valores não são um benchmark formal por teste; são uma reconstrução das timestamps do run #1233 e servem para dimensionar o problema.

## Com 2 workers

Distribuição teórica aproximada do trabalho:

```text
worker 1 ≈ 179 s
worker 2 ≈ 179 s
```

Portanto o critical path pode cair de ~4m40s para aproximadamente **3 minutos de execução**, antes de otimizar o mock.

## Com 3 workers

Distribuição teórica aproximada:

```text
~120 s por worker
```

Possível wall-clock próximo de **2 minutos**, mais overhead.

## Com 4 workers

Distribuição teórica:

```text
~90–92 s no worker mais carregado
```

Mas esta configuração tem risco maior de:

- contenção de CPU;
- contenção de memória;
- Chromium mais lento por processo;
- timing diferente do service worker MV3;
- flakiness induzida pelo runner.

Por isso a sequência correta é:

```text
2 workers -> medir 5 execuções
3 workers -> medir 5 execuções
4 workers -> medir 5 execuções
```

e escolher pelo **pior caso estável**, não pelo melhor run isolado.

---

# 18. Estratégia de divisão de arquivos

Mesmo que `mode: 'parallel'` funcione, dividir o arquivo grande melhora manutenção, sharding e diagnóstico.

Estrutura recomendada:

```text
tests/e2e/
  translation-core.spec.js
  translation-fifo.spec.js
  translation-execution-modes.spec.js
  translation-attachment-gate.spec.js
  translation-result-ownership.spec.js
  translation-manual.spec.js
  cache-and-storage.spec.js
  reader-offline.spec.js
```

## Distribuição sugerida

### `translation-core.spec.js`

- fluxo ponta a ponta;
- resposta rápida;
- shadow DOM;
- submit ignorado.

### `translation-fifo.spec.js`

- FIFO A→G sozinho.

Motivo: é o cenário mais pesado e deve ser livre para ocupar um worker enquanto outros workers drenam testes menores.

### `translation-execution-modes.spec.js`

- minimized_window;
- background_delete.

### `translation-attachment-gate.spec.js`

- temp_chat;
- minimized_window;
- background_delete.

Configurar este describe como paralelo.

Os três timeouts de ~20s deixam de somar ~72s de parede e passam a poder ocorrer simultaneamente.

### `translation-result-ownership.spec.js`

- temp_chat;
- minimized_window;
- background_delete.

Também pode ser paralelo.

### `translation-manual.spec.js`

- teste de Gemini manual.

Mantê-lo isolado porque ele instala um listener `chrome.runtime.onConnect.addListener` no service worker. Hoje o listener é anônimo e não é removido no final do teste.

---

# 19. Reutilização de browser/context — análise específica do PR #47

## 19.1. Restrição importante de extensões

Os E2E carregam uma extensão Manifest V3.

Isso exige persistent context para o modelo usado pelo Playwright/Chromium.

Um `launchPersistentContext` representa o único contexto daquele processo do browser; ao fechar esse contexto, o browser correspondente também fecha.

Isso significa que não existe a mesma otimização simples de:

```text
1 browser
  -> newContext teste A
  -> newContext teste B
  -> newContext teste C
```

usada em aplicações web normais, porque o carregamento da extensão depende do perfil persistente.

A otimização possível é:

> **reutilizar o mesmo persistent context entre vários testes do mesmo worker.**

Mas isso reduz isolamento.

---

## 19.2. Onde reutilização já existe

### cache-and-storage

Já reutiliza um persistent context para quatro testes.

Resultado: esse arquivo é um bom laboratório para medir reaproveitamento.

### reader-offline

Também reutiliza um persistent context.

---

## 19.3. Onde NÃO reutilizar primeiro

`translation-flow` possui efeitos mais profundos:

- cria e remove abas Gemini;
- cria batches;
- usa scheduler;
- usa alarms/timers;
- altera debug mode;
- trabalha com recovery;
- exercita service worker;
- cria listeners;
- manipula IndexedDB e storage;
- pode deixar operações assíncronas pendentes.

Por isso paralelizar mantendo **um contexto por teste** é muito mais seguro do que reutilizar contexto nesta primeira fase.

---

## 19.4. Caso especialmente perigoso: teste Gemini manual

O teste manual executa:

```js
chrome.runtime.onConnect.addListener(port => {
    ...
});
```

Esse listener é instalado no service worker e não é removido explicitamente.

Em contexto descartável isso não importa.

Em contexto reutilizado ele pode sobreviver ao teste e modificar o comportamento dos seguintes.

Portanto qualquer projeto de reuse precisa fazer uma destas coisas:

1. manter o teste manual em contexto exclusivo; ou
2. transformar o listener em função nomeada e removê-lo no cleanup.

A opção 1 é mais segura.

---

# 20. Protocolo obrigatório antes de reutilizar persistent context

Criar primeiro um helper de cleanup capaz de provar que o contexto voltou a um estado conhecido.

Checklist:

- fechar páginas de mangá restantes;
- fechar abas Gemini restantes;
- zerar `chrome.storage.local`;
- limpar GTC;
- limpar StorageManager IndexedDB;
- limpar restore maps;
- limpar `pendingBatches`;
- zerar `jobQueue`;
- zerar `jobIndex`;
- garantir `activeJobsCount = 0`;
- garantir `isProcessing = false`;
- remover alarms criados pelos testes;
- confirmar que não há `deleting_urls`;
- confirmar ausência de jobs persistidos;
- garantir debugMode padrão;
- garantir execução mode padrão;
- verificar que nenhuma página extra ficou aberta.

Depois do cleanup executar uma asserção de invariantes.

Se qualquer invariante falhar, destruir o contexto e iniciar outro.

---

# 21. Estratégia híbrida de reuse recomendada

Não reutilizar tudo.

## Pool A — contexto descartável

Usar contexto novo por teste para:

- FIFO;
- attachment failure;
- minimized_window;
- background_delete;
- Gemini manual;
- testes que mexem em recovery/lifecycle.

## Pool B — contexto reutilizável por worker

Candidatos posteriores:

- resposta rápida;
- shadow DOM;
- fluxo básico;
- alguns result-ownership após provar cleanup.

Mesmo nesses casos, primeiro medir o custo real de abrir Chromium.

Se paralelismo e mock rápido já levarem o E2E para a meta, **não assumir o risco de reuse**.

---

# 22. Cache do Chromium — prioridade real

O package-lock atual usa Playwright **1.59.1**.

O browser do Playwright fica em Linux normalmente em:

```text
~/.cache/ms-playwright
```

Entretanto a própria documentação do Playwright não recomenda cachear os browsers como otimização padrão de CI: restaurar centenas de MB pode levar tempo comparável ao download, e dependências de sistema continuam sendo outra etapa.

No run medido, a instalação do Playwright/browsers ficou em aproximadamente **23 segundos**.

Comparação:

```text
browser/setup ≈ 23s
testes Playwright ≈ 280s
```

Logo, hoje o retorno esperado de atacar o browser cache é muito menor do que paralelizar os testes.

## Experimento correto

Criar dois runs comparáveis:

### A — atual

```bash
npx playwright install chromium --with-deps
```

### B — browser cache

Cache:

```text
~/.cache/ms-playwright
```

chave contendo pelo menos:

```text
Linux + Playwright 1.59.1
```

Medir:

- cache miss;
- cache hit;
- restore duration;
- install duration;
- tamanho transferido;
- job total.

Só manter o cache se a mediana melhorar de verdade.

---

# 23. Experimento mais interessante que cache puro: `--no-shell`

Os testes usam Chromium com o novo headless/headed-via-Xvfb e extensão MV3.

A documentação atual do Playwright permite evitar baixar o headless shell quando ele não é usado:

```bash
npx playwright install --with-deps --no-shell chromium
```

Isso deve ser testado separadamente.

Critério:

- extensão carrega normalmente;
- todos os 21 E2E passam;
- download/setup fica menor.

Não combinar cache + no-shell na primeira medição, senão não saberemos qual mudança produziu o ganho.

---

# 24. Sharding — quando passar para múltiplos runners

Sharding só deve entrar depois que o paralelismo interno estiver estável.

Hoje o comando seria conceitualmente:

```bash
npx playwright test --shard=1/2
npx playwright test --shard=2/2
```

em jobs GitHub independentes.

Isso adiciona CPU real porque cada shard recebe outro runner.

---

# 25. Problema do reporter atual com sharding

O reporter do PR #47 exige que a execução descubra pelo menos 21 testes.

Um shard naturalmente vê apenas uma parte dos 21.

Logo:

> simplesmente adicionar `--shard=1/2` fará o gate atual interpretar cada shard como inventário incompleto.

O baseline **não deve ser reduzido** para resolver isso.

---

# 26. Arquitetura correta do gate com shards

Usar Blob Reporter nos shards.

## Cada shard

Executa:

```text
Playwright
  -> line reporter
  -> blob reporter
```

e publica o blob como artifact.

Não aplica o mínimo global de 21 naquele shard.

Cada shard ainda deve falhar imediatamente se um teste final falhar.

## Job agregador

1. baixa blobs dos shards;
2. executa `playwright merge-reports`;
3. roda o reporter/gate customizado sobre o relatório agregado;
4. verifica:
   - total >= 21;
   - skipped = 0;
   - flaky = 0;
   - failed = 0;
   - todas as tentativas first-pass.

O Playwright chama a mesma API de reporter ao produzir relatório mesclado, então o gate atual pode ser adaptado para validar o conjunto completo no merge.

---

# 27. Quantidade de shards recomendada

## Primeiro teste: 2 shards

Com cada shard usando 2 workers:

```text
2 runners × 2 workers = até 4 testes simultâneos
```

Isso já é agressivo o bastante para esta suíte.

Não começar com 3 ou 4 shards.

### Motivos

- Chromium MV3 é pesado;
- cada runner paga setup;
- mais artifacts;
- mais complexidade no gate;
- o workflow já possui muitos outros jobs simultâneos;
- limite de concorrência da conta/repositório pode gerar fila.

Se o segundo shard ficar esperando runner, o ganho de wall-clock desaparece.

---

# 28. Sharding e balanceamento

Sem `fullyParallel`, Playwright distribui principalmente por arquivo.

Por isso a divisão proposta em vários arquivos é importante antes do sharding.

Uma distribuição razoável fica naturalmente próxima de:

```text
Shard A:
  FIFO
  alguns core/result tests

Shard B:
  attachment gates
  cache/storage
  execution modes
  reader
```

Se `translation-flow` permanecer como um arquivo monolítico, um shard pode ficar com quase todo o trabalho pesado e o outro terminar cedo.

Portanto:

> **dividir o arquivo pesado vem antes do sharding.**

---

# 29. Por que não ativar `fullyParallel: true` global agora

Globalmente isso afetaria também:

- `cache-and-storage.spec.js`;
- `reader-offline.spec.js`.

Esses arquivos compartilham persistent context.

A configuração global poderia quebrar o pressuposto de estado serial.

A opção segura é uma destas:

1. `test.describe.configure({ mode: 'parallel' })` somente nos grupos independentes; ou
2. projetos Playwright separados, com `fullyParallel` apenas no projeto de translation.

A opção 1 é mais simples para o PR #47.

---

# 30. Plano de implementação recomendado para paralelismo

## Etapa P1 — sem alterar semântica

- fixar 2 workers;
- `mode: parallel` apenas no translation-flow;
- retries=0 no CI;
- executar 5 vezes.

### Aprovar se

- 21/21;
- 0 retry;
- 0 flaky;
- nenhum novo timeout;
- mediana claramente menor.

---

## Etapa P2 — dividir translation-flow

Criar os seis arquivos descritos anteriormente.

Extrair helpers comuns.

Executar 5 vezes com 2 workers.

---

## Etapa P3 — testar 3 workers

Executar 5 vezes.

Comparar:

- mediana;
- p95;
- CPU/estabilidade;
- teste mais lento;
- falhas.

Se 3 workers não forem claramente melhores, permanecer em 2.

---

## Etapa P4 — mock determinístico

- FIFO barrier;
- reduzir delay artificial de resultado;
- remover networkidle desnecessário.

Executar novamente 5 vezes.

---

## Etapa P5 — avaliar 4 workers

Somente depois do mock estar determinístico.

---

## Etapa P6 — cache/no-shell

Benchmark separado.

---

## Etapa P7 — reuse experimental

Somente se ainda existir ganho material possível.

---

## Etapa P8 — 2 shards

Implementar blobs + merge + gate agregado.

---

# 31. Ordem por retorno esperado

| Mudança | Ganho potencial | Risco | Prioridade |
|---|---:|---:|---:|
| paralelizar translation-flow em 2 workers | **muito alto** | baixo/médio | **1** |
| dividir arquivo pesado | alto | baixo | **2** |
| attachment gates simultâneos | alto | baixo | **3** |
| FIFO barrier | alto | médio | **4** |
| mock result delay menor | alto | médio | **5** |
| 3 workers | médio/alto | médio | **6** |
| remover networkidle/sleeps de teste | médio | baixo | **7** |
| `--no-shell` | pequeno/médio | baixo | **8** |
| cache ms-playwright | pequeno | baixo | **9** |
| reuse de persistent context | pequeno/médio | **alto** | **10** |
| sharding 2 runners | alto wall-clock | médio/alto | **11**, depois da suíte estar bem dividida |

---

# 32. Decisão recomendada para o PR #47

A próxima mudança técnica não deve ser browser cache nem reuse.

O primeiro experimento deve ser:

```text
translation-flow => parallel
CI workers => 2 explícitos
cache/storage => serial interno
reader => serial interno
contexto novo => continuar por teste em translation
```

Isso ataca diretamente o maior desperdício observado sem alterar a lógica da extensão e sem enfraquecer isolamento.

Depois que essa versão estiver comprovadamente estável, avançar para:

```text
split de arquivos
-> 3 workers
-> FIFO barrier/mock rápido
-> no-shell/cache
-> reuse
-> sharding com blob merge
```

Essa sequência maximiza ganho por risco e mantém o princípio do PR #47: **first-pass real, nenhum skipped e nenhum flaky mascarado**.
