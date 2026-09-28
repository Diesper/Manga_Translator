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
