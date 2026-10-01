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
5. SOURCE_SHA, arquivo, Bíblia e índice devem corresponder ao state;
6. claim expirado não autoriza overwrite cego: recuperação exige reler, confirmar expiração e usar operação condicional sobre a versão exata;
7. o lease protege somente contra trabalho duplicado; não concede ownership da Bíblia ou do source.

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
  "schema_version": 1,
  "index": 87,
  "phase": "ADVERSARIAL",
  "auditor": "AGENTE 31",
  "file": "scripts/example.js",
  "bible": "docs/biblia/scripts/example.js/Bíblia.md",
  "source_sha": "<40-hex>",
  "verdict": "APPROVED",
  "findings": [],
  "completed_at_utc": "2026-10-01T15:00:00Z"
}
~~~

Vereditos permitidos:

- APPROVED
- CHANGES_REQUIRED

Um resultado existente nunca deve ser editado para mudar o passado. Nova tentativa gera um novo arquivo. Para o mesmo SHA/fase, a resolução usa o resultado mais recente de forma determinística, mantendo o histórico completo.

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

## Migração do registro legado

docs/biblia/AUDITORIA.md continua legível como histórico e compatibilidade.

Uma aprovação válida existente nele conta como **PRIMARY legado**, nunca como ADVERSARIAL.

Bíblias já COMPLETED antes desta migração continuam estruturalmente válidas durante o trabalho, mas o gate distribuído final exige uma auditoria ADVERSARIAL válida para o SHA atual.

O resultado das fases novas é canônico em `audit-results/`. Enquanto os validadores V2 legados ainda exigirem `AUDITORIA.md` + `.state` para materializar `COMPLETED`, essa projeção é reconciliada **em lote**, fora do caminho crítico. Qualquer agente ou auditor pode executar esse checkpoint; não existe agregador único.

## PROGRESS.lock.md

PROGRESS.lock.md **não faz parte do fluxo normal de auditoria**.

Ele pode existir somente em migrações estruturais raras ou em um **checkpoint de compatibilidade legado em lote** que projete muitos resultados já concluídos para `AUDITORIA.md` / `.state` / views globais.

É proibido exigir esse lock para executar PRIMARY, ADVERSARIAL ou REAUDIT, publicar um resultado append-only ou calcular a decisão de um índice.

Quando um checkpoint legado for necessário, ele pode ser executado por **qualquer agente ou auditor**, deve durar o mínimo possível e nunca vira um serviço/agregador permanente.

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
→ continuar imediatamente para outra Bíblia
→ em checkpoint separado, qualquer agente/auditor pode projetar resultados legados em lote
~~~

Qualquer auditor ou agente autorizado pode fazer a reconciliação por índice.

## Gates finais

São dois gates complementares:

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
node docs/biblia/.coordination/reconcile-audit-results.js --check
node docs/biblia/.coordination/reconcile-audit-results.js --write
```

O modo `--write` é idempotente e deve ser commitado usando o mesmo protocolo READ LATEST → VERIFY → CONDITIONAL WRITE do restante da coordenação.
