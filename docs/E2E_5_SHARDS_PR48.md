# PR48 — Análise prévia para 5 shards E2E explícitos

## Escopo e invariantes

Esta análise vale exclusivamente para o PR #48 (`perf/e2e-parallel-isolated`).

Invariantes:
- 21 E2E antes e 21 E2E depois;
- nenhum `skip`, `only`, `fixme` ou equivalente;
- nenhuma assertion removida;
- `retries=0` em CI;
- gate agregado continua exigindo 21 testes, skipped=0, flaky=0, failed=0;
- PR #47 não é alterado.

## Fonte dos tempos

Tempos aproximados medidos no run #1323, após o rebalanceamento estável de 2 shards. Eles incluem hooks/launch do persistent context pertencentes ao próprio teste e são calculados entre o início de um teste e o início do seguinte (ou a conclusão do shard para o último).

## Inventário atual — 21 testes

| # | Teste | ~s | Shard atual | Classe |
|---:|---|---:|---:|---|
| 1 | cache: salva páginas traduzidas no storage | 19.5 | 1/2 | médio |
| 2 | cache: host espelho usa GTC sem Gemini | 19.4 | 1/2 | médio |
| 3 | cache: reload reaplica restoreMap | 19.2 | 1/2 | médio |
| 4 | cache: debug mode mantém abas Gemini | 18.8 | 1/2 | médio |
| 5 | reader: ordem/contador inicial | 0.8 | 1/2 | rápido |
| 6 | reader: slider persiste | 0.3 | 1/2 | rápido |
| 7 | reader: teclado/progresso | 1.9 | 1/2 | rápido |
| 8 | fluxo básico ponta a ponta | 19.3 | 1/2 | médio |
| 9 | attachment gate: temp_chat | 25.3 | 1/2 | pesado |
| 10 | attachment gate: minimized_window | 23.3 | 1/2 | pesado |
| 11 | attachment gate: background_delete | 23.9 | 1/2 | pesado |
| 12 | FIFO A→B→C→D→E→F→G | 86.1 | 2/2 | extremamente pesado |
| 13 | execução minimized_window | 14.2 | 2/2 | médio |
| 14 | execução background_delete | 15.1 | 2/2 | médio |
| 15 | resposta rápida | 9.2 | 2/2 | rápido |
| 16 | shadow DOM + assistant wrapper | 10.4 | 2/2 | rápido |
| 17 | submit ignorado falha cedo | 17.3 | 2/2 | médio |
| 18 | result ownership temp_chat | 10.4 | 2/2 | rápido |
| 19 | result ownership minimized_window | 9.2 | 2/2 | rápido |
| 20 | result ownership background_delete | 9.4 | 2/2 | rápido |
| 21 | aba Gemini manual | 2.6 | 2/2 | rápido |

Soma aproximada do trabalho de teste: **355.4 s**.

## Estado atual de 2 shards

Distribuição estável validada em 6 runs:
- Shard 1: 11 testes, **~2.9 min**
- Shard 2: 10 testes, **~3.0–3.1 min**
- caminho crítico real dos testes: **~3.1 min**
- gate agregado: 21/21, skipped=0, flaky=0, failed=0.

O FIFO continua sendo o maior teste individual (~86 s).

## Overhead fixo por shard/job

Medição representativa do run #1323:

| Etapa | ~tempo |
|---|---:|
| preparação inicial do runner até checkout | ~0.9 s |
| checkout | ~1.0 s |
| setup Node/cache npm | ~6.3 s |
| npm ci | ~2.5 s |
| Playwright/Chromium --with-deps --no-shell | ~22.5 s |
| geração das imagens de teste | ~0.2 s |
| inicialização do comando Playwright/webServer até “Running … tests” | ~2.8 s |
| upload blob report + post cleanup | ~1.8 s |
| **overhead fixo aproximado por shard** | **~37 s** |

Observações:
- launch do browser/persistent context e carregamento da extensão acontecem dentro do tempo de cada teste/hook e já estão refletidos nos tempos individuais acima;
- cada shard possui runner próprio, então o overhead não soma diretamente ao wall-clock se todos iniciarem juntos, mas aumenta consumo/competição por runners;
- em runs anteriores houve stagger de dezenas de segundos entre runners, portanto shards demais podem piorar wall-clock mesmo com menos trabalho por shard.

## Por que não usar simplesmente `--shard=X/N` com 5+

O sharding automático distribui os testes de forma previsível por inventário, mas não usa os tempos históricos medidos como objetivo de balanceamento. Com testes variando de ~0.3 s a ~86 s, quantidade de testes não é um proxy adequado de carga.

Para o PR #48, a proposta é usar **grupos explícitos por tags Playwright + `--grep`**, mantendo blob reports e merge global. Assim:
- cada teste pertence explicitamente a exatamente um grupo;
- a divisão é baseada em duração medida;
- nomes dos shards são semânticos;
- a manutenção é auditável;
- um verificador de plano compara o inventário completo com a união dos grupos e falha em caso de teste sem grupo ou duplicado.

## Otimização matemática para 5 shards

O FIFO sozinho (~86.1 s) estabelece o menor caminho crítico possível sem alterar o comportamento do teste.

Depois de reservar:
- FIFO = 86.1 s;
- testes rápidos = 54.2 s;

restam 215.2 s de testes médios/pesados. A melhor partição encontrada em três grupos fica praticamente perfeita:

- 72.6 s
- 71.2 s
- 71.4 s

Adicionar um 6º shard **não reduz o piso de 86.1 s do FIFO**, mas adiciona outro job com ~37 s de setup e aumenta a competição por runners. Por isso a primeira implementação deve usar **5 shards**.

## Plano explícito proposto

### Shard 1 — FIFO exclusivo
- FIFO A→G
- estimado: **86.1 s**
- 1 teste

### Shard 2 — attachment gates
- attachment gate temp_chat — 25.3 s
- attachment gate minimized_window — 23.3 s
- attachment gate background_delete — 23.9 s
- estimado: **72.6 s**
- 3 testes

### Shard 3 — médios A
- cache save — 19.5 s
- cache mirror/GTC — 19.4 s
- submit ignorado — 17.3 s
- execution background_delete — 15.1 s
- estimado: **71.2 s**
- 4 testes

### Shard 4 — médios B
- cache reload — 19.2 s
- cache debug mode — 18.8 s
- fluxo básico — 19.3 s
- execution minimized_window — 14.2 s
- estimado: **71.4 s**
- 4 testes

### Shard 5 — rápidos
- reader ordem/contador — 0.8 s
- reader slider — 0.3 s
- reader teclado — 1.9 s
- resposta rápida — 9.2 s
- shadow DOM — 10.4 s
- ownership temp — 10.4 s
- ownership minimized — 9.2 s
- ownership background — 9.4 s
- Gemini manual — 2.6 s
- estimado: **54.2 s**
- 9 testes

Total: **21 testes**.

## Estimativa antes da implementação

Assumindo ~37 s de overhead por shard e inicialização simultânea:
- Shard 1: ~123 s total de job
- Shard 2: ~110 s
- Shard 3: ~108 s
- Shard 4: ~108 s
- Shard 5: ~91 s

Caminho crítico teórico dos shards: **~123 s (~2.05 min)**, antes de fila/scheduling do GitHub.

Estado atual equivalente:
- teste crítico ~186 s;
- + ~37 s setup;
- ~223 s (~3.7 min) quando o runner não sofre stagger relevante.

A redução potencial do caminho crítico do E2E é, portanto, material. O resultado real deve ser medido no GitHub porque a concorrência de runners pode introduzir atraso.

## Critério de aceite

Após implementar:
1. verificar inventário estático/dinâmico: união dos 5 grupos = inventário completo, interseção vazia;
2. executar todos os 5 shards sem dependência entre eles;
3. merge dos 5 blob reports;
4. gate agregado: 21/21, skipped=0, flaky=0, failed=0;
5. medir setup, teste e total por shard;
6. rebalancear uma segunda vez se os tempos reais divergirem materialmente;
7. repetir a mesma árvore de código em várias execuções consecutivas para detectar flakiness.


## Primeira execução real com 5 shards

Fonte principal: workflow #1353.

| Shard | Testes | Tempo efetivo observado | Duração total do job |
|---|---:|---:|---:|
| fifo | 1 | ~86.3 s | ~121 s |
| attachment | 3 | ~73.2 s | ~107 s |
| medium-a | 4 | ~71.1 s | ~115 s |
| medium-b | 4 | ~72.7 s | ~117 s |
| fast | 9 | ~54.6 s | ~89 s |

Inventário dinâmico no agregador:
- fifo: 1
- attachment: 3
- medium-a: 4
- medium-b: 4
- fast: 9
- total: **21**
- união exata, sem omissões e sem duplicatas.

Resultado agregado:
- 21/21 passed;
- skipped=0;
- flaky=0;
- failed=0;
- CI Gate = success.

### Wall-clock observado

Run #1353:
- primeiro shard iniciou: ~02:14:25;
- último shard concluiu: ~02:16:26;
- janela real dos shards: **~121 s (~2.02 min)**;
- agregador/gate E2E concluiu: ~02:16:50;
- E2E completo desde o início dos shards até fim do agregador: **~145 s (~2.42 min)**.

Baseline anterior de 2 shards (run #1323):
- primeiro shard iniciou: ~02:00:18;
- último shard concluiu: ~02:04:05;
- agregador concluiu: ~02:04:25;
- E2E completo: **~247 s (~4.12 min)**.

Redução inicial de wall-clock E2E completo:
- absoluta: **~102 s (~1.70 min)**;
- percentual: **~41%**.

## Segunda rodada de balanceamento com tempos reais

Tempos individuais do #1353 confirmaram:
- FIFO: ~86.3 s;
- attachment gates: ~25.7 / 23.4 / 24.1 s;
- caches: ~20.2 / 19.5 / 20.9 / 18.7 s;
- fluxo básico: ~19.0 s;
- submit ignorado: ~17.3 s;
- execution modes: ~14.1 / 14.1 s;
- rápidos: ~0.4–10.4 s.

A partição medida ficou:
- FIFO = 86.3 s;
- attachment = 73.2 s;
- medium-a = 71.1 s;
- medium-b = 72.7 s;
- fast = 54.6 s.

### Decisão da segunda rodada

**Nenhum teste foi movido após a primeira execução**, porque os dados reais confirmaram que a distribuição proposta já é a melhor sob as restrições:

1. FIFO sozinho define o piso inevitável do caminho crítico em ~86 s.
2. Os três shards pesados/médios ficaram concentrados em ~71–73 s, praticamente balanceados.
3. O shard fast precisa continuar contendo somente testes classificados como rápidos; adicionar um teste de 14–20 s violaria essa restrição.
4. Mover um teste rápido para um shard médio deixaria o fast ainda mais curto e aumentaria o desvio.
5. Criar um 6º shard não reduz o FIFO de ~86 s, mas acrescenta outro setup de ~30–40 s e mais disputa por runners.

Portanto, a segunda rodada é deliberadamente um **no-op de distribuição**, validado por medição real, e não uma ausência de análise.

O próximo passo de validação é repetir exatamente esta mesma árvore de código várias vezes para medir flakiness, scheduling e p95.
