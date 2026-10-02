# Coordenação multiagente das Bíblias

Este diretório implementa coordenação **particionada por Bíblia e por fase de auditoria**.

## Princípio central

Nenhum editor, auditor, validador ou reauditor depende de um lock global para iniciar, executar ou registrar o trabalho normal.

A unidade de concorrência é o índice da Bíblia.

~~~text
Bíblia NNN
  ↓
validação automática
  ↓
PRIMARY
  ↓
ADVERSARIAL  ← obrigatória para 100%
  ↓
decisão determinística por índice
  ├─ concordância → resultado
  └─ divergência → REAUDIT
~~~

REAUDIT é por exceção. ADVERSARIAL não é por exceção.

## Sem agregador único

Não existe um agente agregador obrigatório.

A consolidação de uma Bíblia pode ser executada pelo agente editor, auditor PRIMARY, auditor ADVERSARIAL ou reauditor, desde que:

- opere somente sobre o índice correspondente;
- releia o estado atual antes de escrever;
- use escrita condicional/CAS quando alterar um arquivo mutável;
- não sobrescreva resultado de auditoria existente;
- produza a mesma decisão para os mesmos resultados.

STATUS.md, CHECKLIST.md e AUDITORIA.md são views/projeções ou compatibilidade legada. Eles não são mecanismo de ownership e não ficam no caminho crítico da auditoria distribuída. A CI normal não exige regenerar STATUS.md/CHECKLIST.md a cada resultado; a coerência dessas projeções é exigida novamente pelo gate final de merge.

## Shards virtuais + work stealing

O agendamento de trabalho não usa fila global nem arquivo agregador. Ele usa **shards virtuais determinísticos** sobre os 233 índices.

Por padrão existem **80 shards**, alinhados à execução atual de 80 agentes:

~~~text
shard(index) = ((index - 1) % 80) + 1
~~~

Assim, o AGENTE 16 prioriza o shard 16. Se não houver trabalho elegível nele, percorre os demais shards em ordem circular e faz **work stealing**.

O shard é apenas uma preferência de descoberta/agendamento:

- não concede ownership;
- não substitui claim/lease;
- não cria lock de shard;
- não existe coordenador central;
- qualquer auditor pode roubar trabalho ocioso de outro shard;
- a aquisição real continua sendo CREATE ONLY no lease da Bíblia/fase.

Comando operacional:

~~~bash
node scripts/validation/bible-audit-work-plan.js --auditor 16 --auditors 80
~~~

Também é possível filtrar fase:

~~~bash
node scripts/validation/bible-audit-work-plan.js --auditor 16 --phase ADVERSARIAL
~~~

O planejador sempre considera a próxima fase obrigatória do SHA atual. Em particular, **PRIMARY CHANGES_REQUIRED não pula ADVERSARIAL**: todas as Bíblias passam pela auditoria adversarial antes da decisão final daquele SHA.

## Leases por fase

Novos trabalhos usam uma árvore separada do mecanismo legado:

~~~text
docs/biblia/.coordination/audit-leases/
  primary/NNN.lock.md
  adversarial/NNN.lock.md
  reaudit/NNN.lock.md
~~~

Claims planos já existentes em `audit-claims/NNN.lock.md` permanecem válidos temporariamente como PRIMARY legado. Novos agentes **não** criam claims por fase dentro de `audit-claims/`; usam `audit-leases/`.

Essa separação permite introduzir PRIMARY/ADVERSARIAL/REAUDIT sem quebrar o validador V2 legado que ainda conhece apenas os claims antigos.

Cada lease novo deve conter:

~~~text
AUDITOR: AGENTE 12
PHASE: PRIMARY | ADVERSARIAL | REAUDIT
INDEX: 087
ARQUIVO: <source>
BIBLIA: <Bible path>
SOURCE_SHA: <40-hex>
BIBLE_SHA: <Git blob SHA de 40 hex da Bíblia atual>
CLAIMED_AT_UTC: <timestamp>
UPDATED_AT_UTC: <timestamp>
LEASE_EXPIRES_AT_UTC: <timestamp futuro>
PR: #66
BRANCH: docs/project-bible
ESTADO: ACTIVE
~~~

Regras:

1. criação inicial é **CREATE ONLY**;
2. índice → no máximo um claim ativo entre as fases;
3. auditor → no máximo um claim ativo no modo estrito;
4. claim e reserva editorial do mesmo arquivo não coexistem;
5. SOURCE_SHA, BIBLE_SHA, arquivo, Bíblia e índice devem corresponder à revisão atual;
6. lease novo sem BIBLE_SHA é inválido; somente leases/resultados pré-migração podem usar a compatibilidade controlada pela baseline;
7. claim expirado não autoriza overwrite cego: recuperação exige reler, confirmar expiração e usar operação condicional sobre a versão exata;
8. o lease protege somente contra trabalho duplicado; não concede ownership da Bíblia ou do source.

## Resultados append-only

Resultados novos são imutáveis e particionados:

~~~text
docs/biblia/.coordination/audit-results/
  NNN/
    primary/<resultado-unico>.json
    adversarial/<resultado-unico>.json
    reaudit/<resultado-unico>.json
~~~

Schema mínimo:

~~~json
{
  "schema_version": 2,
  "index": 87,
  "phase": "ADVERSARIAL",
  "auditor": "AGENTE 31",
  "file": "scripts/example.js",
  "bible": "docs/biblia/scripts/example.js/Bíblia.md",
  "source_sha": "<40-hex>",
  "bible_sha": "<40-hex Git blob SHA>",
  "verdict": "APPROVED",
  "findings": [],
  "completed_at_utc": "2026-10-01T15:00:00Z"
}
~~~

Vereditos permitidos:

- APPROVED
- CHANGES_REQUIRED

Um resultado existente nunca deve ser editado ou removido para mudar o passado. Nova tentativa gera um novo arquivo. Para a mesma unidade `(index, SOURCE_SHA, BIBLE_SHA, PHASE)`, a resolução usa o resultado mais recente de forma determinística, mantendo o histórico completo.

Resultados schema v1 são apenas compatibilidade de migração: permanecem válidos somente enquanto a Bíblia for byte-a-byte o mesmo Git blob registrado em `audit-bible-baseline.json`. O invariant append-only é verificado por histórico Git e exige que cada path publicado preserve um único blob imutável e continue presente no HEAD.

## Ordem obrigatória

### Camada 1 — automática

Validadores determinísticos verificam estrutura, SHA, cobertura, fonte integral, coordenação e invariantes.

### Camada 2A — auditoria IA PRIMARY

Objetivo: verificar se a Bíblia satisfaz os requisitos e se as evidências sustentam as afirmações.

### Camada 2B — auditoria IA ADVERSARIAL

**Obrigatória para 100% das Bíblias.**

Objetivo explícito: tentar provar que a Bíblia ou a auditoria PRIMARY estão erradas.

Deve procurar ativamente contradições, claims sem evidência, referências inexistentes, SHA/versão incorretos, cobertura enganosa, omissões, dependências ignoradas, classificação incorreta de prova e falsos positivos da PRIMARY.

PRIMARY e ADVERSARIAL devem ser independentes quando ambas possuem identidade de auditor registrada.

### Camada 3 — REAUDIT

Executada somente quando PRIMARY e ADVERSARIAL divergem.

O reauditor deve ser diferente dos dois auditores anteriores.

## Decisão determinística por Bíblia

~~~text
PRIMARY APPROVED + ADVERSARIAL APPROVED
→ APPROVED

PRIMARY CHANGES_REQUIRED + ADVERSARIAL CHANGES_REQUIRED
→ CHANGES_REQUIRED

PRIMARY != ADVERSARIAL
→ REAUDIT_REQUIRED

REAUDIT APPROVED
→ APPROVED

REAUDIT CHANGES_REQUIRED
→ CHANGES_REQUIRED
~~~

A decisão não requer coordenador central.

## Trava pós-handoff contra loop de correção

Depois de `CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT`, a revisão entregue fica protegida pelo binding exato:

```text
(index, SOURCE_SHA, BIBLE_SHA)
```

Enquanto esse binding estiver em auditoria independente, é proibido reabrir editorialmente a unidade apenas porque um corretor encontrou um novo possível problema. Em particular:

- mudança do `HEAD` global do PR não autoriza reabertura;
- finding informal, comentário ou inspeção do corretor não autoriza retorno a `IN_PROGRESS`;
- PRIMARY isolada em `CHANGES_REQUIRED` ainda não autoriza correção, porque ADVERSARIAL continua obrigatória;
- divergência PRIMARY × ADVERSARIAL exige REAUDIT antes de qualquer correção;
- resultados concluídos **antes ou no instante do handoff** não contam para a nova rodada, mesmo que tenham o mesmo SOURCE_SHA+BIBLE_SHA;
- PRIMARY legado também não atravessa um handoff protegido: a revisão começa novamente em `WAITING_PRIMARY`;
- alteração de `state`, reserva/lock ou revisão sem uma transição de correção registrada não contorna a trava;
- o blob real atual da Bíblia deve continuar igual ao `BIBLE_SHA` entregue enquanto a revisão aguarda auditoria;
- somente uma decisão distribuída final `CHANGES_REQUIRED`, válida para o mesmo SOURCE_SHA+BIBLE_SHA, posterior ao handoff e sem violações de independência, libera nova correção.

Fluxo protegido:

```text
CORRECTION_HANDOFF_READY_FOR_INDEPENDENT_AUDIT
→ PRIMARY
→ ADVERSARIAL
→ [REAUDIT se houver divergência]
→ decisão final
   ├─ APPROVED          → não reabrir editorialmente
   └─ CHANGES_REQUIRED  → correção pode adquirir reserva e iniciar
```

A CI valida esse histórico. Reabertura pós-handoff sem decisão final `CHANGES_REQUIRED` torna o modelo distribuído inválido.

A migração preserva a correção da unidade #191 que já estava aberta em `2026-10-02T05:08:00Z`; handoffs posteriores ficam integralmente protegidos.

## Migração do registro legado

docs/biblia/AUDITORIA.md continua legível como histórico e compatibilidade.

Uma aprovação válida existente nele conta como **PRIMARY legado**, nunca como ADVERSARIAL.

Bíblias já COMPLETED antes desta migração continuam estruturalmente válidas durante o trabalho, mas o gate distribuído final exige uma auditoria ADVERSARIAL válida para o SHA atual.

O resultado das fases novas é canônico em `audit-results/`. Enquanto os validadores V2 legados ainda exigirem `AUDITORIA.md` + `.state` para materializar `COMPLETED`, essa projeção é reconciliada **em lote**, fora do caminho crítico. Qualquer agente ou auditor pode executar esse checkpoint; não existe agregador único.

## PROGRESS.lock.md

PROGRESS.lock.md **não faz parte do fluxo normal de auditoria**.

Ele pode existir somente em migrações estruturais raras ou em um **checkpoint de compatibilidade legado em lote** que projete muitos resultados já concluídos para `AUDITORIA.md` / `.state` / views globais.

É proibido exigir esse lock para executar PRIMARY, ADVERSARIAL ou REAUDIT, publicar um resultado append-only ou calcular a decisão de um índice.

O checkpoint canônico atual não usa esse mutex: `bible-reconcile-checkpoint.yml` faz READ LATEST, reconciliação determinística, GC seguro e publicação somente por fast-forward/CAS se o branch não tiver avançado.

O merge readiness continua exigindo ausência de qualquer lock global residual.

## Fluxo operacional

~~~text
READ LATEST
→ validar automaticamente
→ adquirir lease PRIMARY do índice
→ auditar
→ publicar resultado PRIMARY append-only
→ liberar lease
→ adquirir lease ADVERSARIAL do mesmo índice
→ tentar refutar PRIMARY + Bíblia
→ publicar resultado ADVERSARIAL append-only
→ liberar lease
→ calcular decisão deterministicamente
→ se divergência: claim REAUDIT + resultado append-only
→ decisão distribuída concluída
→ se CHANGES_REQUIRED: liberar correção editorial da revisão
→ se APPROVED: proibir reabertura editorial daquela revisão
→ continuar imediatamente para outra Bíblia
→ em checkpoint separado, qualquer agente/auditor pode projetar resultados legados em lote
~~~

Qualquer auditor ou agente autorizado pode fazer a reconciliação por índice.

## Gates finais

Os comandos canônicos são expostos no `package.json`:

~~~bash
npm run test:bible-protocol:infra
npm run bible:audit:append-only
npm run bible:reconcile:check
npm run bible:audit:verify
npm run bible:merge-readiness
~~~

O fechamento completo é:

~~~bash
npm run bible:final-readiness
~~~

Os dois gates semânticos centrais continuam equivalentes a:

~~~bash
node docs/biblia/.coordination/audit-protocol.js verify
node scripts/validation/verify-bible-merge-readiness.js
~~~

O primeiro exige para **cada um dos 233 SHAs atuais**:

- PRIMARY válida;
- ADVERSARIAL válida;
- independência PRIMARY/ADVERSARIAL quando identificadas;
- REAUDIT independente quando houver divergência;
- decisão distribuída final APPROVED;
- leases/claims coerentes.

O segundo preserva o contrato estrutural legado do PR:

- state COMPLETED;
- zero reservas;
- zero claims legados;
- zero requests OPEN;
- projeções globais coerentes;
- nenhum lock global residual.

Portanto a auditoria escala sem serialização global, enquanto a projeção final de compatibilidade pode ser feita em lote por qualquer agente/auditor antes do merge. A CI do SHA final também deve estar verde.

## Revisão da própria Bíblia

Desde a migração de revision binding, a unidade canônica de auditoria é:

```text
(index, SOURCE_SHA, BIBLE_SHA, PHASE)
```

`audit-bible-baseline.json` permite consumir resultados schema v1 já publicados sem perder trabalho. Qualquer edição posterior da Bíblia altera seu Git blob SHA e invalida automaticamente resultados antigos daquela revisão. Novas publicações devem usar schema v2 com `bible_sha`.

A reconciliação em lote é feita por:

```bash
npm run bible:reconcile:check
npm run bible:reconcile:write
```

Equivalentes diretos:

```bash
node docs/biblia/.coordination/reconcile-audit-results.js --check
node docs/biblia/.coordination/reconcile-audit-results.js --write
```

O modo `--write` é idempotente e deve ser commitado usando o mesmo protocolo READ LATEST → VERIFY → CONDITIONAL WRITE do restante da coordenação.

## Anti-loop estrutural — ciclos, HUMAN gate e lifecycle transacional

A trava pós-handoff continua válida, mas agora existe uma camada estrutural acima dela.

### Ciclos e escalonamento

`correction_cycle` é derivado canonicamente dos handoffs corretivos do histórico. A migração não reescreve em massa os 233 states: os valores persistidos, quando existirem, são projeções e precisam coincidir com o valor derivado.

```text
cycle 0–2  → NORMAL
cycle 3    → ELEVATED
cycle 4    → HIGH
cycle 5    → CRITICAL
cycle 6    → EMERGENCY
cycle >= 7 → HUMAN
```

O contador `lifetime_correction_cycles` é monotônico. `HUMAN_RESET_ESCALATION` pode reiniciar apenas o ciclo de escalonamento corrente mediante aprovação humana explícita; ele não apaga o histórico vitalício.

Os work planners ordenam a mesma classe operacional por:

```text
EMERGENCY > CRITICAL > HIGH > ELEVATED > NORMAL
```

Prioridade não concede ownership. Leases/reservas continuam garantindo um writer por unidade.

### Revisão periódica de estratégia

A cada três ciclos de correção ativos (`cycle 3`, `cycle 6`, ... antes de HUMAN), uma nova correção exige `strategy_review` no `START_CORRECTION`.

Schema operacional mínimo:

```json
{
  "strategy_review": {
    "related_cycles": [1, 2, 3],
    "observed_pattern": "padrão de falha recorrente observado",
    "evidence": "evidência concreta do padrão",
    "why_previous_strategy_insufficient": "por que a abordagem anterior não fechou o problema",
    "new_strategy": "estratégia materialmente diferente para a próxima tentativa"
  }
}
```

A revisão precisa cobrir os três ciclos imediatamente anteriores e não pode reutilizar uma estratégia periódica já registrada. Em `cycle 6`, essa revisão é cumulativa com a `ROOT_CAUSE_REVIEW` obrigatória.

### Diversidade e EMERGENCY

- cycle 5: o corretor do ciclo anterior é inelegível;
- cycle 6: os dois corretores mais recentes são inelegíveis;
- cycle 6 exige `ROOT_CAUSE_REVIEW` com categoria, evidência e estratégia diferente;
- cycle >= 7 não possui corretor automático elegível.

Categorias de causa-raiz suportadas incluem `TEST_WEAKNESS`, `PRODUCTION_DESIGN`, `MOCK_CONTAMINATION`, `CONCURRENCY`, `PROTOCOL_FAILURE`, `SPEC_AMBIGUITY`, `AUDIT_SCOPE_GAP`, `STATE_MACHINE_FAILURE`, `CROSS_FILE_REGRESSION` e `OTHER`.

### HUMAN_LOCKED

Ao entregar o sétimo ciclo, o transition engine muda a unidade para `HUMAN_LOCKED`.

Sem aprovação humana válida, agentes automáticos não podem:

- iniciar correção;
- adquirir correção canônica;
- reconciliar automaticamente;
- auditar a revisão HUMAN;
- fechar a unidade;
- resetar o escalonamento.

Existem permissões humanas distintas:

- `ALLOW_AUDIT_ONLY`: libera PRIMARY/ADVERSARIAL/REAUDIT somente para a revisão HUMAN atual;
- `ALLOW_ONE_CORRECTION`: após decisão final `CHANGES_REQUIRED`, libera exatamente uma correção;
- `PERMANENTLY_CLOSE`: após decisão final `APPROVED`, permite `HUMAN_COMPLETE → COMPLETED`;
- `RESET_ESCALATION`: reinicia o escalonamento corrente, preservando o lifetime.

`ALLOW_ONE_CORRECTION` é single-use. O artefato original não é reescrito; o consumo é registrado no event log.

Aprovações são criadas apenas pelo workflow:

```text
Bible Human Approval
environment: human-approval
```

**Configuração administrativa necessária:** o environment GitHub `human-approval` deve possuir required reviewer(s) humanos. O repositório não consegue transformar um nome de environment em revisão humana real sem essa configuração do GitHub.

### Transition engine + CAS

O caminho canônico para mutações de lifecycle é:

```bash
npm run bible:transition -- status --index 191
```

e o workflow `Bible Unit Transition`.

Transições usam compare-and-swap por:

- expected status;
- expected correction cycle;
- expected revision_id;
- expected state Git blob SHA.

Writer stale recebe `REJECTED_STATE_CHANGED`.

Ações implementadas incluem:

- `START_CORRECTION`;
- `HANDOFF_FOR_AUDIT`;
- `SAFE_ABORT`;
- `HUMAN_COMPLETE`;
- `HUMAN_RESET_ESCALATION`.

### Correction authorization token

Uma correção nova depende de token append-only emitido somente quando:

```text
pipeline final == CHANGES_REQUIRED
AND pipeline.problems == 0
AND revisão atual coincide
AND ator autorizado coincide
AND regras HUMAN/cycle são satisfeitas
```

O token é vinculado a:

```text
index
+ actor
+ correction_cycle
+ audit_epoch
+ handoff_id
+ production_sha
+ test_sha
+ bible_sha
+ revision_id
+ decision_id
```

O consumo é append-only em `.state.history`. O registry valida também no sentido inverso: um `CORRECTION_TOKEN_CONSUMED` sem token existente, com ator diferente ou revision divergente é erro.

JSONs em `correction-authorizations/` e `human-approvals/` são append-only e o CI exige que sejam introduzidos pelo writer canônico `github-actions[bot]`.

### Event chain

Eventos canônicos novos são encadeados:

```text
previous_event_hash
event_hash = SHA256(previous_event_hash + canonical_event)
```

O primeiro evento novo ancora o histórico legado existente. Depois disso:

- alterar evento antigo quebra o hash;
- inserir evento sem hashes quebra a cadeia;
- apagar/reordenar eventos quebra a cadeia.

Isso mantém compatibilidade com o histórico pré-migração sem reescrevê-lo.

### Findings pós-handoff

Suspeitas encontradas sem autoridade de auditoria entram em:

```text
docs/biblia/.coordination/unverified-findings/NNN/
```

Criador canônico:

```bash
npm run bible:finding:create -- --index NNN ...
```

Regra central:

```text
UNVERIFIED_FINDING != CHANGES_REQUIRED
```

O finding não muda status, ciclo, leases, revisão nem cria correction token. O reporter não pode auto-confirmá-lo como PRIMARY/ADVERSARIAL. Estados suportados: `UNVERIFIED`, `CONFIRMED_BY_PRIMARY`, `CONFIRMED`, `REJECTED`, `SUPERSEDED`, `STALE`.

### Identidade de revisão

O lifecycle separa:

- `production_sha`;
- `test_sha`;
- `bible_sha`.

E calcula:

```text
revision_id = SHA256(canonical_json({
  production_sha,
  test_sha,
  bible_sha
}))
```

`audit_epoch` cresce a cada handoff corretivo; `handoff_id` identifica a entrega específica. Para handoffs novos, auditorias usam schema v3 e precisam coincidir com epoch/handoff/revision atuais.

Mudanças são classificadas como `PRODUCTION`, `TEST`, `BIBLE_SEMANTIC`, `BIBLE_VALIDATION_EVIDENCE`, `BIBLE_METADATA`, `BIBLE_FORMATTING` ou `PROTOCOL`. A política inicial é conservadora: qualquer mudança de revisão invalida a evidência da rodada, inclusive metadata/formatting; uma exceção futura exigirá prova semântica explícita.

### Human review package

Quando uma unidade entra em HUMAN, o transition engine gera:

```text
human-review/NNN.json
human-review/NNN.md
```

com ciclos, corretores, revisão, padrões recorrentes e findings, para evitar que o humano precise reconstruir manualmente dezenas de eventos.

### Métricas anti-loop

O protocolo expõe métricas determinísticas e auditáveis:

```bash
npm run bible:lifecycle:metrics
```

São calculados:

- média e p90 de ciclos de correção por unidade;
- percentual de unidades reabertas;
- quantidade/percentual em HUMAN;
- tempo médio e p90 entre handoff e decisão distribuída;
- média de agentes distintos por unidade;
- proxy de custo de IA em unidades operacionais (`correction starts + handoffs + distributed audit decisions`).

O proxy não representa moeda nem custo faturado. Ele existe para comparar o volume operacional antes/depois sem inventar preços externos. As metas do plano (`média < 1.5`, `p90 <= 4`, HUMAN raro) são reportadas, mas não mascaram o estado real nem fecham a unidade automaticamente.

### Limite técnico do enforcement

O caminho oficial já é transacional, e CI/merge-readiness rejeitam mutações fora das regras. Porém, se a branch continuar permitindo pushes diretos sem ruleset/branch protection, um ator com write permission ainda pode enviar um commit inválido; o commit fica **detectavelmente inválido** e não deve ser mergeado.

Para aproximar enforcement físico, configure no GitHub:

1. branch/ruleset exigindo `Bible Protocol Infrastructure` e `Bible Handoff Guard`;
2. impedir bypass desses checks por apps/agentes comuns;
3. environment `human-approval` com required human reviewers;
4. restringir alteração dos workflows de autoridade a maintainers humanos.

### Comandos novos

```bash
npm run test:bible-lifecycle:infra
npm run bible:lifecycle:verify
npm run bible:transition
npm run bible:audit:publish
npm run bible:finding:create
```

O objetivo é deixar de depender de “o agente deve obedecer” e fazer os caminhos canônicos recusarem transições inválidas por construção.



### Contrato operacional endurecido — writer, EMERGENCY e findings

A implementação canônica também aplica estes invariantes:

- `START_CORRECTION` valida a revisão real do working tree contra o correction token antes de escrever;
- a correção adquire a reserva editorial por CREATE ONLY em `.reservas/<source>.lock.md`;
- se a unidade já estiver reservada, o segundo writer recebe `UNIT_HIGH_PRIORITY_BUT_ALREADY_RESERVED`;
- o mesmo corretor não pode manter duas reservas editoriais ativas pelo caminho canônico;
- `HANDOFF_FOR_AUDIT` e `SAFE_ABORT` exigem ownership da reserva e a liberam canonicamente;
- somente um correction token ativo é permitido por índice;
- token ativo é invalidado se a decisão distribuída final for substituída ou a revisão real mudar.

No ciclo 6, `ROOT_CAUSE_REVIEW` é obrigatório e deve registrar:

```json
{
  "categories": ["CONCURRENCY", "STATE_MACHINE_FAILURE"],
  "related_cycles": [4, 5, 6],
  "evidence": "evidência concreta da causa provável",
  "why_previous_failed": "por que as correções anteriores não estabilizaram",
  "strategy": "estratégia diferente da já tentada"
}
```

`related_cycles` não pode apontar para ciclo futuro e uma estratégia de EMERGENCY já registrada não pode ser reutilizada como se fosse nova.

Findings pós-handoff usam duas camadas append-only:

```text
unverified-findings/NNN/<finding>.json
        │
        └── nasce UNVERIFIED e não é reescrito para promover status

unverified-finding-events/NNN/<finding>/<event>.json
        ├── PRIMARY_CONFIRM
        ├── ADVERSARIAL_CONFIRM / REAUDIT_CONFIRM
        ├── REJECT
        ├── MARK_STALE
        └── SUPERSEDE
```

Promoção exige audit-result real da mesma revisão e o resultado deve mencionar explicitamente o ID do finding. O reporter não pode auto-confirmar.

A aprovação humana também deve ser independente dos auditores da revisão atual: o mesmo ator que figura como PRIMARY, ADVERSARIAL ou REAUDIT não satisfaz `approved_by` daquela revisão.

### Lifecycle textual

```text
FINAL CHANGES_REQUIRED válido
        │
        ▼
correction token revision/epoch/handoff/actor-bound
        │
        ▼
CREATE-ONLY correction reservation
        │
        ▼
START_CORRECTION → correção executada → HANDOFF_FOR_AUDIT
        │
        ├── correction_cycle++
        ├── audit_epoch++
        ├── novo handoff_id
        └── revision_id = SHA256(canonical {production,test,bible})
        │
        ▼
REVISION FROZEN
        │
        ├── PRIMARY
        ├── ADVERSARIAL obrigatória
        └── REAUDIT se houver divergência
        │
        ▼
FINAL DECISION
   ┌────┴───────────┐
   ▼                ▼
APPROVED       CHANGES_REQUIRED
   │                │
COMPLETED       escalation
                    │
             cycle < 7 → nova correção somente com novo token
             cycle >=7 → HUMAN_LOCKED
                            ├── nenhuma IA continua automaticamente
                            ├── ALLOW_AUDIT_ONLY
                            ├── ALLOW_ONE_CORRECTION (one-shot)
                            ├── RESET_ESCALATION
                            └── PERMANENTLY_CLOSE
```

Possível problema pós-handoff segue uma via sem autoridade:

```text
read-only observation → UNVERIFIED_FINDING
                      ├── não altera status/cycle/revision
                      ├── não cria token/reserva
                      └── auditor independente confirma ou rejeita
```

### Self-tests anti-loop

- `anti-loop-integration-selftest.js`: cobre os cinco cenários completos NORMAL/CRITICAL/EMERGENCY/HUMAN/finding;
- `anti-loop-adversarial-selftest.js`: tenta os 20 bypasses da especificação e imprime `PASS bypass 01` … `PASS bypass 20`.

Esses suites são executados pelo **Bible Handoff Guard** e pela matriz **Bible Protocol Infrastructure** em Linux e Windows.
