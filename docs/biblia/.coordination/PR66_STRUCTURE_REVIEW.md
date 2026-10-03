# Revisão estrutural do PR 66 e plano de melhoria sem redução dos gates

Data: 2 de outubro de 2026 (America/Sao_Paulo).

PR analisado: https://github.com/Diesper/Manga_Translator/pull/66

Snapshot fixo: `a4f679b3b4dfea8a2916057e3f75fa63c2415bc1`.
Merge-base com main: `650f9864d7ebb17f81a2a32cb4b50f604e07d98e`.
Branch de experimentação: `codex/temp-pr66-structure-review-20261002`.

## Conclusão

A estrutura npm/Jest/Playwright da raiz já está centralizada; recriar essa centralização não resolve o problema atual. A próxima melhoria deve reduzir o acoplamento entre **protocolo de auditoria, armazenamento Git/arquivos, projeções legadas, comandos operacionais e código da extensão**.

A primeira entrega segura é corrigir os defeitos de infraestrutura que já impedem validar a revisão. Depois, tornar explícitos os limites de snapshot e de escrita por unidade; só então mover arquivos e decompor os módulos grandes. Uma reorganização ampla enquanto a baseline está vermelha torna difícil atribuir qualquer falha a uma mudança específica.

Este PR temporário contém uma correção delimitada do workflow de reconciliação, uma verificação mais precisa de sua ordem, a correção do contexto de revisão usado pelo gerador de projeções, testes de mutação e CI própria. Não muda a extensão, os dados de auditoria, os limiares de cobertura ou os thresholds de performance. Não faz merge nem publica transições na branch canônica.

## Escopo e limites da análise

Foram comparados os caminhos alterados no PR, examinados os módulos centrais de coordenação/validação, os seis arquivos de runtime modificados, os helpers de teste e os workflows. A análise também carregou os 233 estados e os 528 resultados de auditoria do snapshot. Foram consultados logs reais do GitHub e o ruleset ativo de main.

Isso não equivale a uma nova auditoria PRIMARY/ADVERSARIAL linha a linha das 233 Bíblias. Não foram publicados vereditos de auditoria nem alteradas reservas, leases, tokens de correção ou aprovações humanas. As recomendações abaixo distinguem defeito reproduzido, fragilidade observada e proposta arquitetural.

O PR canônico continuou recebendo commits durante a análise. Os números deste relatório pertencem ao SHA acima; não descrevem automaticamente o head posterior do PR 66. A avaliação final de merge precisa ser repetida no SHA efetivamente proposto para merge.

## Inventário do snapshot

| Item | Observação |
| --- | --- |
| Arquivos alterados contra o merge-base | 1.123 |
| Runtime JS | 56 arquivos, aproximadamente 19.511 linhas |
| JS em `.coordination/`, incluindo self-tests | 35 arquivos, aproximadamente 10.402 linhas |
| JS de validação | 37 arquivos, aproximadamente 6.834 linhas |
| Helpers JS de testes | 8 arquivos, aproximadamente 967 linhas |
| `content_manga.js` | aproximadamente 3.120 linhas |
| `popup.js` | aproximadamente 2.033 linhas |
| `unit-transition.js` | aproximadamente 1.060 linhas |
| Estados carregados | 233 |
| Resultados append-only carregados | 528 |

Contagens de linhas incluem a posição final após newline e dependem desse detalhe de contagem; servem para dimensionar coesão e manutenção, não para medir qualidade.

O modelo distribuído estava estruturalmente consistente (`problems=0`) e sem leases, reservas ou leases expirados. As decisões atuais eram:

| Decisão | Unidades |
| --- | ---: |
| APPROVED | 27 |
| CHANGES_REQUIRED | 122 |
| WAITING_PRIMARY | 40 |
| WAITING_ADVERSARIAL | 21 |
| REAUDIT_REQUIRED | 23 |
| Total | 233 |

Portanto, **233 Bíblias materializadas não significam 233 revisões atualmente aprovadas**. O gate final deve continuar bloqueando esse snapshot. Não se deve ajustar o gate para tornar essa condição verde.

## P1 — Corrigir e validar o workflow de reconciliação antes de reorganizar

**Defeito comprovado.** No snapshot analisado, um trecho de steps foi inserido dentro da expressão `grep -E` do passo de refresh. Isso duplicou steps de reconciliação/commit e deixou `|| true` fora do bloco YAML na linha 91. `actionlint 1.7.12` e o parser YAML detectaram o erro.

Execução real sem jobs, com failure:
https://github.com/Diesper/Manga_Translator/actions/runs/37067854945

Além disso, `reconcileRefreshProblems()` usava `source.indexOf()` no workflow inteiro. Existiam dois comandos iguais de captura de SHA: um anterior à validação do protocolo e outro posterior ao refresh. O validador tomava a primeira captura como se fosse a segunda, bloqueando também o Handoff Guard:
https://github.com/Diesper/Manga_Translator/actions/runs/37067856070

**Implementação neste PR temporário:** remover o trecho duplicado; restringir fetch/reset/captura ao step `id: observed`; exigir exatamente um step com essa identidade; rejeitar validação ausente, controles ausentes e mutação precoce. Normalizar CRLF em `loadSources()` para que os self-tests que adulteram strings multiline funcionem também no checkout Windows.

**Prova:** commit `bad1df82` adiciona um teste vermelho antes da correção. Commit `3a92bcc4` repara a implementação. Nove mutantes rejeitados cobrem falta de validação, fetch, reset, captura observada, identidade observada, identidade duplicada, reset antes de fetch, mutação antes da captura e captura antes do refresh. LF e CRLF válidos são aceitos. Os self-tests de governança anteriores permanecem ativos.

**Melhoria permanente:** incluir lint sintático/semântico de Actions como gate. Validação por fragmentos não substitui parsing YAML ou validação de contexts/steps. O `actionlint` está versionado e seu download tem SHA-256 fixado na CI experimental. Não há mudança dos permissions ou execução do workflow de escrita neste experimento.

**Aceite:** actionlint de todos os workflows, governança e mutações verdes em Linux e Windows. Um mutante que recoloque o bloco corrompido precisa falhar. Rollback: reverter o commit de correção isolado.

## P1 — Delimitar a vida de snapshots e evitar binding obsoleto

**Segundo defeito comprovado e corrigido neste PR:** `generate-bible-projections.js` chamava `evaluateAuditPipelines()` sem fornecer `root` ou baseline. Com isso, o gerador avaliava resultados sem a revisão atual da Bíblia, enquanto o modelo canônico usava essa revisão. `npm run validate` passou na validação estrutural, mas caiu na validação de projeções com 16 diagnostics de pipeline, apesar de `loadModel()` reportar zero problems para o mesmo snapshot.

O teste do commit `4e8715b9` executa o gerador e o motor reais numa fixture própria. Depois de uma edição somente da Bíblia, resultados da revisão antiga produzem WAITING_PRIMARY no motor canônico, mas bloqueavam incorretamente o gerador. O reparo fornece o contexto de root/baseline. O teste também restaura os bytes antigos e exige que um REAUDIT realmente inválido da revisão corrente continue bloqueando a escrita. Assim, a correção elimina a divergência entre consumidores sem ignorar erros válidos ou reescrever as views reais.

**Defeito reproduzido na API de leitura.** `audit-core.js` mantém `gitSnapshotCache` em um Map global do processo. O fast path devolve o SHA do índice se o snapshot armazenado considera o arquivo limpo. Depois de aquecer esse cache e editar a Bíblia, uma segunda leitura no mesmo processo continua devolvendo o SHA antigo, sem nova avaliação da working tree. Os self-tests atuais limpam explicitamente o cache antes de ler após a edição; não cobrem essa situação.

Reprodução em fixture Git própria, sem tocar nas Bíblias reais:

| Leitura | Blob Git |
| --- | --- |
| Bíblia inicial | `90be1f3056c4f471f977a28497b8d4b392c55a02` |
| Segunda leitura após escrever conteúdo diferente | `90be1f3056c4f471f977a28497b8d4b392c55a02` |
| `git hash-object` do conteúdo novo | `294186e497a23bf3fbfde12aacc7f720f668fe9a` |
| Leitura depois de limpar o cache | `294186e497a23bf3fbfde12aacc7f720f668fe9a` |

**Limite da evidência:** prova uma fragilidade da API em processos reutilizados; não prova que cada CLI atual, geralmente executada em processo novo, publicou aprovação indevida. A concorrência com editores ainda exige validação no momento da escrita.

**Proposta:** criar um contexto de leitura por operação (`snapshot`, `now`, `states`, `results`, identidade Git). O contexto deve nascer no início de `loadModel()`/validação e terminar antes de qualquer mutação. A publicação deve reler as precondições atuais. Um processo daemon ou duas operações consecutivas não devem herdar implicitamente o mesmo snapshot.

**Aceite:** leitura limpa, CRLF equivalente, alteração real, arquivo staged, troca de índice e duas operações consecutivas no mesmo processo; editar só a Bíblia invalida a aprovação anterior. Não cachear resultados entre revisões sem identidade explícita. Não confundir SHA de HEAD, índice e working tree: cada um representa um estado diferente.

## P1 — Fazer CAS e persistência por unidade de forma efetiva

**Fragilidade observada.** `unit-transition.js` lê o estado, verifica precondições e depois chama `fs.writeFileSync()` diretamente. A checagem de CAS é uma validação lógica anterior à escrita; essa sequência, por si só, não é uma primitiva atômica de filesystem entre dois escritores. O workflow serializa seu próprio índice, mas isso não cobre dois CLIs locais, comandos distintos ou leitores vendo uma escrita interrompida.

O comando também pode escrever estado, reserva e material de revisão humana em etapas diferentes. Uma falha intermediária pode deixar projeções ou ownership para reparar. O Git impede um push não fast-forward, mas não transforma operações locais de múltiplos arquivos em uma transação.

**Proposta:** armazenamento com exclusão curta por índice durante a mutação, reread do SHA dentro dessa exclusão, arquivo temporário no mesmo diretório e substituição atômica, mais um journal de intenção/resultado para mudanças que abrangem estado + reserva + token/projeção. O lock de escrita é por unidade e não substitui o lease de auditoria nem cria lock global. Em workflows, revalidar as precondições operacionais após rebase/refresh, e não apenas a forma estrutural do estado.

**Aceite:** dois processos tentam a mesma transição com o mesmo SHA: exatamente um vence; interrupção antes/depois do rename; falha em reserva; falha em revisão humana; retry idempotente; estado sempre parseável; token consumido no máximo uma vez. Essas falhas ainda não foram demonstradas em fixture multiprocesso nesta revisão; precisam de testes antes de implementar a proposta.

## P2 — Separar motor puro, repositório, comandos e projeções

**Acoplamento observado.** Há executáveis operacionais, schemas/dados e testes dentro de `docs/biblia/.coordination/`, enquanto scripts em `scripts/validation/` importam a implementação de lá. `bible-audit-pipeline.js` é um adaptador de reexportação. `audit-protocol.js` carrega filesystem, aplica regras e monta o modelo global. `unit-transition.js` reúne planejamento, tokens, reservas, Git e CLI.

O código explica uma razão importante: a implementação foi posicionada fora do corpus congelado para não invalidar as 233 unidades durante a introdução do protocolo. **Mover esses arquivos agora sem um plano de migração contrariaria esse contrato e criaria churn de auditoria.**

Estrutura-alvo, após estabelecer a migração do corpus:

```text
scripts/bible/
  core/         regras puras de lifecycle, revisão, decisão e elegibilidade
  storage/      Git, filesystem, snapshots, CAS e journal
  commands/     CLIs de claim, publish, transition e reconcile
  projections/ geradores das views de compatibilidade
tests/infra/bible/
                caracterização, falhas, mutações e concorrência
docs/biblia/
                Bíblias e dados/versionamento do protocolo
```

Direção das dependências: comandos usam core/storage/projections; core não acessa Git, filesystem ou a CLI. As autoridades são os resultados append-only e o estado/histórico definido pelo protocolo; STATUS/CHECKLIST e os trechos projetados de AUDITORIA são derivados. O registro legado só deve continuar participando como fonte na compatibilidade explicitamente prevista.

**Sequência:** extrair interfaces mantendo paths públicos; mover um grupo com todas as referências no mesmo commit; comparar saídas normalizadas antes/depois; atualizar workflows, npm scripts e corpus/mapa documental de maneira explícita. O adaptador temporário precisa ter escopo e data/condição de retirada, não se tornar uma segunda implementação.

**Aceite:** mesmos vereditos/identidades para todas as 233 unidades, mesmos blockers, nenhum evento histórico alterado, CLIs equivalentes, testes em Windows/Linux e zero references operacionais residuais. Rollback por bloco. Não mover `extension/` nem seu manifest.

## P2 — Otimizar o trabalho por índice, sem enfraquecer a prova

**Medição:** duas chamadas de `loadModel()` no mesmo processo levaram aproximadamente 1,76 s e 1,74 s no Windows deste ambiente, com 771 leituras de arquivos por chamada. A primeira executou `ls-files`, `diff` e `rev-parse` uma vez cada; a segunda ainda fez as 771 leituras e um `rev-parse`. A máquina tinha outras cargas: esses tempos não são SLOs ou benchmarks controlados.

`latestFor()` e o cálculo do pipeline filtram o array de resultados por unidade/fase. Contextos de lifecycle/Bible SHA também podem ser calculados repetidamente. No validador estrutural, `trackedBlobSha()` usa um processo `git rev-parse HEAD:path` por source; esse caminho tem contrato de HEAD distinto do hash da working tree do audit-core.

**Proposta:** indexar resultados por `(index, source_sha, bible_sha, phase)` em uma única passagem; calcular a identidade de revisão uma vez por unidade/contexto; carregar os blobs de HEAD em lote no validador estrutural. Oferecer validação local de uma unidade para iteração e manter a varredura das 233 unidades no gate final.

**Aceite:** comparar integralmente decisões, blockers e projeções entre implementações nos casos aprovado, divergente, legado, SHA antigo, HUMAN_LOCKED e resultados duplicados. Registrar quantidade de processos/leitura, mediana/p95 e memória em runs sequenciais. Usar desempate byte a byte explicitamente definido para paths/IDs, em vez de depender de locale implícito. Uma melhoria de performance só é aceita se os mutantes de revisão obsoleta continuarem sendo rejeitados.

## P2 — Eliminar testes de cópias e tornar a baseline progressiva

**Fato observado:** `tests/helpers/extracted-functions.js` declara que reimplementa funções da produção. Três suítes ainda o importam: audio-synthesis, canonical-title e canonical-title-full. A presença de testes mais completos que carregam produção é positiva, mas não torna a cópia uma prova da produção. Testar uma cópia não detecta necessariamente uma regressão no arquivo usado pelo navegador.

**Proposta:** usar os módulos reais existentes, ou extrair a função pura para um módulo de produção carregado tanto pelo manifest quanto pelos testes. Converter um arquivo de teste por vez; antes de remover a cópia, um mutante aplicado à produção deve derrubar os testes que supostamente a protegem. Não reduzir asserts ou contar casos equivalentes duas vezes para atingir um mínimo.

O baseline Jest continua em 108 suítes/848 testes, enquanto o inventário atual executou 109/877. E2E descobriu 22 casos para um mínimo de 21. Esses mínimos antigos permitem perder parte das novas proteções e ainda satisfazer apenas a contagem. Após estabilizar a base e comprovar o inventário completo, subir os mínimos e manter o gate de todos os arquivos executados. Cobertura deve ser recalculada por arquivo crítico: quantidade de testes sozinha não é garantia.

**Aceite:** produção real carregada, mutação sensível, zero skipped/todo, inventário completo, coverage e E2E sem redução. Benchmarks sintéticos devem rodar em job dedicado de carga controlada; não aumentar o limite para esconder uma falha.

## P2 — Decompor runtime por responsabilidade, preservando bootstrap MV3

**Proposta arquitetural.** `content_manga.js` concentra áudio, UI, fingerprints/cache, protocolo UPDATE_IMAGE, persistência e side effects. O novo caminho de replay usa diversos Maps/Sets paralelos. `popup.js` combina capítulos, sites/configuração, thumbnails, logs e recursos com lifetimes diferentes.

Começar pelo controlador de áudio; depois o estado e handshake de UPDATE_IMAGE; depois separar persistência obrigatória de side effects como download/cache; por fim os controladores de abas/logs do popup. Um registro de entrega pode agrupar payload, horário e estado, reduzindo a obrigação de manter múltiplos Maps consistentes. Avaliar limite em bytes/quantidade além do TTL do replay: um TTL sozinho limita idade, mas não volume sob carga alta.

A extensão usa scripts MV3 ordenados no manifest/importScripts. A extração precisa preservar a ordem de carregamento, globals usados, o guard de instância única e os nomes dos handlers. Não introduzir ES modules/bundler incidentalmente. Manter primeiro os contratos e o bootstrap; só depois considerar ferramenta de build.

**Aceite:** preservar ACK somente após persistência, replay idempotente, payload conflitante rejeitado, falha de storage reportada, ausência de gravações/side effects duplicados, isolamento entre lotes e cleanup de listeners. Testes de áudio precisam cobrir contexto suspenso/fechado e falha de resume. E2E no Chromium confirma o que jsdom não prova.

Uma falha concreta já existente em `log-exporter.test.js` espera `window.logPoller === null` no unload; o runtime deixa `undefined` quando nunca houve poller. A falha foi repetida isoladamente. Antes de modularizar esse cleanup, definir o contrato de estado ocioso e corrigi-lo com caracterização. Este experimento não altera esse código ou o assert.

## CI temporária e independência do PR 66

O workflow novo `PR66 Isolated Structure Review` usa checkout do **head SHA** do PR temporário, contents read e grupo `pr66-structure-review-<número>`. Seus jobs executam somente governança/mutações em Windows/Linux e lint dos workflows reparados. Não despacha transições, aprovações humanas ou reconciliação contra `docs/project-bible`.

Os workflows normais herdados continuam elegíveis para o PR; não foram desabilitados. Seus grupos por ref são distintos do PR 66. Isso isola cancelamento/serialização por grupo, mas **não reserva capacidade de runners ou quota da conta**. Um PR temporário também não faz desaparecer failures preexistentes do runtime ou do gate final.

O ruleset ativo de main exige JS Syntax Check, Manifest Validation, E2E Tests (Playwright), Code Coverage e CI Gate com branch atualizada. A ausência de proteção no endpoint legado de branch não significa ausência de ruleset: o ruleset ativo foi consultado separadamente.

## Evidências de execução

| Check | Resultado observado |
| --- | --- |
| `npm ci --no-audit --no-fund` | Passou, 334 pacotes |
| `npm run test:ci` antes da correção de infraestrutura | 109 suítes, 877 testes; 106 suítes/874 testes passaram; 3 falhas; 0 skipped/todo |
| Smoke | 6/6 arquivos passaram |
| Visual | 224/224 casos passaram |
| Reexecução isolada dos 3 arquivos Jest problemáticos | 17/19 testes passaram; popup cleanup e PERF-05 falharam; o guard GTC <750 ms passou |
| actionlint antes | Falha sintática no YAML, linha 91 |
| actionlint depois | Todos os workflows do checkout passaram |
| Governança e self-tests após correção | Passaram, incluindo LF/CRLF e 9 mutantes da reconciliação |
| Cache de revisão | Defeito reproduzido em fixture Git própria |
| `npm run validate` antes do reparo de contexto | Estrutura passou; projeções bloquearam com 16 diagnostics de pipeline |
| Regressão de contexto de projeção | Vermelho em `4e8715b9`; verde após `36bf8eaf`, mantendo rejeição do REAUDIT inválido corrente |
| Check das projeções reais após reparo | Eliminou os falsos diagnostics; continua vermelho por STATUS/CHECKLIST stale, sem regenerar dados |
| Cobertura, E2E e self-tests demorados | Uma primeira execução foi interrompida antes da conclusão; não conta como resultado verde |

A primeira corrida Jest foi concorrente com self-tests de infraestrutura; houve falhas de tempo em PERF-05 e no guard GTC. A reexecução isolada elimina apenas a falha GTC. Isso demonstra sensibilidade à carga para aquele caso, mas não prova que toda falha de performance é falsa. A máquina ainda tinha processos de outros trabalhos; não há justificativa para afrouxar thresholds.

## Ordem sugerida de entregas

1. Aplicar o reparo da reconciliação + validação estrutural de workflow e estabilizar a baseline atual. Não iniciar uma migração ampla com tests vermelhos.
2. Snapshot por operação e revalidação no momento da publicação, com teste de cache aquecido.
3. Escrita efetiva por unidade e recuperação de falhas, com disputa entre processos e crash injection.
4. Extrair core/storage/commands/projections e migrar paths/corpus em blocos pequenos.
5. Indexar resultados e blobs em lote, comparando os outputs antigos e novos antes de retirar o caminho antigo.
6. Converter testes de cópias para produção real e elevar a baseline comprovada.
7. Extrair módulos de áudio/entrega/UI um por vez, com Chromium e persistência verificadas.

Para cada entrega: snapshot de base registrado, teste vermelho antes quando corrigir defeito, mutante que restaure o defeito, resultado antes/depois por arquivo crítico, rollback por commit e CI verde do SHA final. Esta ordem reduz o risco; nenhuma refatoração pode prometer ausência absoluta de regressões sem essas evidências.
