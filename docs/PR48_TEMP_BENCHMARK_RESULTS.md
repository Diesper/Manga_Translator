# PR #48 — Benchmark temporário dos E2E antes da otimização FIFO

## 1. Base congelada

Todos os benchmarks temporários partiram do mesmo commit do PR #48:

- branch: `perf/e2e-parallel-isolated`
- commit congelado: `ef3276eb4d7e1ddfdbe500e0fbb1a4d3a3a20032`
- E2E total: **21**
- Node: **20.x**
- Playwright: **1.59.1**
- workers por benchmark: **1**
- retries Playwright em CI: **0**
- timeout padrão: **60 s**, preservando os overrides específicos existentes
- baseline do gate: minTests=21, maxSkipped=0, maxFlaky=0

A única mudança funcional nas branches temporárias foi o workflow de seleção do grupo. O PR temporário FIFO recebeu depois instrumentação de console/timestamps, sem alterar delays, assertions, timeouts ou fluxo.

## 2. PRs temporários

| PR | Grupo | Seleção | Quantidade |
|---|---|---|---:|
| #49 | FIFO A→G | `@e2e-fifo` | 1 |
| #50 | Cache A | save + mirror/GTC | 2 |
| #51 | Cache B | reload + debug mode | 2 |
| #52 | Attachment Gate | `@e2e-attachment` | 3 |
| #53 | Fast E2E | `@e2e-fast` | 9 |
| #54 | Medium A residual | background_delete + submit ignorado | 2 |
| #55 | Medium B residual | fluxo básico + minimized_window | 2 |

União: **21/21 testes**, sem uso de skip/only/fixme.

## 3. Primeira rodada — tempos reais

| Grupo | Testes | Execução efetiva | Setup | Cleanup | Total job |
|---|---:|---:|---:|---:|---:|
| FIFO | 1 | ~84–87 s | ~29 s | ~2 s | ~119 s |
| Attachment | 3 | ~72–74 s | ~35 s | ~4 s | ~112 s |
| Fast | 9 | ~55,5 s | ~31 s | ~3 s | ~90 s |
| Cache B | 2 | ~39–40 s | ~48 s | ~3 s | ~93 s |
| Cache A | 2 | ~39–40 s | ~36 s | ~4 s | ~81 s |
| Medium B | 2 | ~36,7 s | ~31 s | ~2 s | ~71 s |
| Medium A | 2 | ~34,3 s | ~31 s | ~4 s | ~71 s |

Os benchmarks foram executados em jobs independentes e, quando havia capacidade de runner, simultaneamente.

## 4. Tempos individuais observados

### Cache A
- salva páginas no storage: ~19,0 s
- mirror host usa GTC: ~19,3 s

### Cache B
- reload reaplica restoreMap: ~19,9 s
- debug mode mantém Gemini: ~18,8 s

### Attachment gate
- temp_chat: ~26,0 s
- minimized_window: ~23,3 s
- background_delete: ~23,9 s

### Fast
- reader ordem/contador: ~1,1 s
- reader slider: ~0,3 s
- reader teclado: ~1,9 s
- resposta rápida: ~9,2 s
- shadow DOM: ~10,4 s
- ownership temp_chat: ~10,4 s
- ownership minimized_window: ~9,2 s
- ownership background_delete: ~9,3 s
- Gemini manual: ~2,6 s

### Medium A
- execution background_delete: ~16,4 s
- submit ignorado: ~17,3 s

### Medium B
- fluxo básico: ~21,5 s
- execution minimized_window: ~14,2 s

## 5. Repetições dos grupos críticos

### FIFO — 5 execuções instrumentadas semanticamente idênticas

Tempo medido da entrada do teste até fechamento das páginas:
- run 1: **84,681 s**
- run 2: **83,875 s**
- run 3: **83,697 s**
- run 4: **84,849 s**
- run 5: **83,540 s**

Estatísticas:
- mínimo: **83,540 s**
- máximo: **84,849 s**
- média: **84,128 s**
- mediana: **83,875 s**
- amplitude: **1,309 s**
- desvio-padrão populacional: **~0,533 s**
- falhas: **0**
- Playwright retries: **0**
- timeouts: **0**

### Cache A — 5 execuções
- 39,5 / 39,0 / 40,4 / 39,3 / 38,6 s
- média: **39,36 s**
- mediana: **39,3 s**
- amplitude: **1,8 s**
- falhas: **0**

### Cache B — 5 execuções
- 40,0 / 39,9 / 39,3 / 39,2 / 39,2 s
- média: **39,52 s**
- mediana: **39,3 s**
- amplitude: **0,8 s**
- falhas: **0**

### Attachment — 5 execuções
- 72,3 / 73,4 / 73,4 / 73,4 / 73,8 s
- média: **73,26 s**
- mediana: **73,4 s**
- amplitude: **1,5 s**
- falhas: **0**

Conclusão: FIFO, cache e attachment são consistentemente lentos, não flaky.

## 6. Profiling do FIFO A→G

O teste monta sete páginas A→G, inicia A, confirma A como lote ativo, coloca B–G na fila e então exige resultado em A→G, fila drenada e logs exatos de queue/promote/done.

### Marcos observados em uma execução representativa

- test start: 0 ms
- todas as páginas A–G prontas: ~4.127 ms
- A ativo: ~4.287 ms
- B–G completamente enfileirados: ~5.130 ms
- resultado A: ~16.031 ms
- resultado B: ~26.946 ms
- resultado C: ~38.862 ms
- resultado D: ~49.768 ms
- resultado E: ~60.684 ms
- resultado F: ~72.630 ms
- resultado G: ~84.548 ms
- scheduler drenado: ~84.552 ms

Os degraus depois de A são aproximadamente **11–12 s por lote**.

## 7. Esperas >100 ms relevantes no caminho FIFO

| Arquivo / ponto | Espera | Tipo | Duração | Contagem FIFO | Acumulado teórico | Observação |
|---|---|---|---:|---:|---:|---|
| `job-runner.js`, após temp-chat ativo | `sleep(1500)` | B — sincronização fixa | 1,5 s | 7 | 10,5 s | ocorre mesmo com status `already_active` |
| `waitForStableComposer` | polling 250 ms + mínimo temporal | A/B | mínimo 1,5 s | 7 | >=10,5 s | proteção real de hidratação, mas contém mínimo temporal |
| mock FIFO `attachmentDelayMs=2500` | atraso antes da preview | C — mock artificial | 2,5 s | 7 | 17,5 s | intenção original era manter A ativo para B–G entrarem na fila |
| `job-runner.js` pós-attachment | `sleep(1000)` | B | 1,0 s | 7 | 7,0 s | confirmação do attachment já ocorreu |
| `job-runner.js` evento de prompt | `sleep(200)` | B | 0,2 s | 7 | 1,4 s | espera fixa entre bridge e escrita |
| `job-runner.js` pós prompt | `sleep(1000)` | B | 1,0 s | 7 | 7,0 s | anterior ao submit |
| mock `runTranslation` | `setTimeout/Promise 1200` | C | 1,2 s | 7 | 8,4 s | simula geração; FIFO não testa latência de geração |
| mock `/gemini-result-image` | `setTimeout 2000` | C | 2,0 s | 7 | 14,0 s | simula rede da imagem; FIFO não testa latência de download |
| attachment retry interval | 3,5 s | A/B | 3,5 s | 0 observado | 0 | confirmação ocorre antes do retry |
| submit confirmation timeout | até 5 s | A | até 5 s | 0 timeout | 0 | submit confirma praticamente imediatamente |
| result extractor retry | 1 s | A | 1,0 s | 0 observado | 0 | não houve retry |

As esperas sequenciais conhecidas que realmente disparam representam aproximadamente **76,3 s** dos ~84 s. O restante é abertura das páginas, enfileiramento, criação/fechamento das abas, storage, observers, extração e finalização.

## 8. Por que `attachmentDelayMs=2500` não explica sozinho os ~84 s

Ele responde por aproximadamente **17,5 s** (2,5 s × 7), ou ~21% do tempo do FIFO.

O perfil mostra que o custo é composto:
- sincronização real/fixa do runner;
- atraso artificial de attachment do mock;
- atraso artificial de geração do mock;
- atraso artificial do endpoint da imagem;
- transições de batch e browser.

Portanto, simplesmente trocar 2500 por um número pequeno não é uma solução aceitável.

## 9. Otimização justificada para o PR #48

Primeira mudança definitiva proposta:

1. substituir `attachmentDelayMs=2500` no FIFO por **barreira explícita** do mock:
   - A chega à barreira de attachment;
   - teste confirma que A está bloqueado no ponto conhecido;
   - B–G são enfileirados;
   - a ordem da fila é verificada;
   - teste libera A;
   - fluxo continua normalmente.

2. tornar os atrasos artificiais do mock configuráveis:
   - geração: padrão atual **1200 ms** preservado para os demais testes;
   - imagem: padrão atual **2000 ms** preservado para os demais testes;
   - somente o FIFO poderá usar resposta sem atraso artificial, porque sua finalidade é ordem/serialização, não latência do Gemini.

3. não alterar, nesta etapa, os sleeps de produção do `job-runner.js`.

Essa abordagem remove principalmente categoria **C (mock artificial)** e converte o atraso de attachment em sincronização por estado/evento.

## 10. Invariantes que devem permanecer

O FIFO otimizado continuará exigindo:
- A→B→C→D→E→F→G na entrada;
- mesma ordem de promoção;
- mesma ordem de conclusão;
- nenhum lote perdido;
- nenhum lote duplicado;
- nenhum stale result;
- attachment confirmado;
- fila completamente drenada;
- jobIndex vazio ao final;
- zero mismatch/rejected/stale/accounting foreign;
- mesmas assertions existentes.

Nenhuma alteração definitiva deve ser trazida das branches temporárias; somente mudanças redesenhadas e revisadas no PR #48.


## 11. Benchmark de workers por grupo

Depois de estabilizar o baseline, foram testados workers adicionais sem alterar testes, assertions, retries ou timeouts.

| Grupo temporário | Antes | Configuração testada | Execução 1 | Execução 2 |
|---|---:|---:|---:|---:|
| Attachment | ~73,4 s | 3 workers | 28,7 s | 26,8 s |
| Fast | ~55,5 s | 3 workers | 21,8 s | 22,0 s |
| Medium A residual | ~34,3 s | 2 workers | 18,6 s | 18,5 s |
| Medium B residual | ~36,7 s | 2 workers | 21,2 s | 20,1 s |

A primeira tentativa de benchmark de workers foi descartada porque a variável foi aplicada somente à etapa de inventário e o log mostrou `using 1 worker`. Os números acima vêm das execuções corrigidas, cujos logs confirmam explicitamente `using 2 workers` ou `using 3 workers`.

Configuração escolhida para o PR #48:
- fifo: 1 worker;
- attachment: 3 workers;
- medium-a: 2 workers;
- medium-b: 2 workers;
- fast: 3 workers.

A configuração ficou centralizada em `tests/ci/e2e-shard-plan.json`; `run-e2e-group.js` aplica o valor e o CI Contract protege a alocação medida.

## 12. FIFO definitivo no PR #48

A implementação definitiva no PR #48 ficou mais rigorosa que a variante experimental simples:

1. o primeiro attachment chega a uma barreira explícita;
2. o teste exige `arrivals=1`, `waiting=1` e `released=false`;
3. só então B–G são enfileirados e a ordem é validada;
4. a barreira é liberada explicitamente;
5. os delays artificiais do mock de geração (1200 ms) e imagem (2000 ms) são configuráveis;
6. somente o FIFO usa esses delays artificiais como zero;
7. os defaults dos demais testes permanecem inalterados;
8. nenhum sleep de produção de `job-runner.js` foi reduzido.

No run integrado #1426 (attempt 1), o FIFO completo A→G passou em **50,5 s**, contra baseline mediano de **86,1 s** no Playwright (~41% menor), preservando as mesmas invariantes de fila e resultado.

## 13. Primeiro run integrado com barreira + workers

Workflow #1426, attempt 1:

| Shard | Testes | Workers | Playwright |
|---|---:|---:|---:|
| fifo | 1 | 1 | **50,5 s** |
| attachment | 3 | 3 | **27,4 s** |
| medium-a | 4 | 2 | **41,5 s** |
| medium-b | 4 | 2 | **42,1 s** |
| fast | 9 | 3 | **22,4 s** |

Resultado agregado:
- inventário: **21/21**;
- blob reports: **5/5**;
- passed: **21**;
- skipped: **0**;
- flaky: **0**;
- failed: **0**;
- retries CI: **0**;
- CI Contract: **success**;
- Code Coverage: **success**;
- CI Gate: **success**.

Tempos de parede do bloco E2E nesse run:
- janela desde o início do primeiro shard até o último shard terminar: **106 s**;
- espera até o agregador: **2 s**;
- agregador/gate E2E: **17 s**;
- E2E completo: **125 s (~2m05s)**.

Comparação com a arquitetura estável anterior de 5 shards/1 worker:
- mediana E2E anterior: **169 s**;
- primeira execução integrada nova: **125 s**;
- redução: **44 s (~26%)**.

Comparação com o baseline antigo de 2 shards:
- mediana E2E: **261,5 s**;
- nova execução: **125 s**;
- redução: **136,5 s (~52%)**.

O workflow inteiro do #1426 terminou depois do E2E porque o job de **Code Coverage (~176 s)** passou a ser o caminho crítico global. Portanto novas reduções do E2E abaixo deste ponto têm retorno limitado no wall-clock total do workflow enquanto coverage continuar mais lento.

## 14. Próxima validação

A árvore final (incluindo este relatório e as estimativas atualizadas) deve ser repetida em execuções completas consecutivas, sem alterações de código entre elas, antes de considerar a otimização concluída.
